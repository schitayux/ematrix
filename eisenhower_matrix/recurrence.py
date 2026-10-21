# Copyright (c) 2026, CHAPPSA and contributors
# For license information, please see license.txt

"""Recurring / periodic activities.

A recurring activity is materialized up-front as a *series*: the activity the user
creates is the "head", and one independent EU Activity is generated per future date up
to the end condition (a `recurrence_end_date`, a `recurrence_count`, or the MAX_OCCURRENCES
safety cap — whichever comes first). Every member of the series (head included) carries
the same `recurrence_group` token, which is simply the head activity's own name.

Participants are deliberately NOT copied onto the generated occurrences (same choice as
`api.activity.duplicate_activity`) — each occurrence is born as a private activity and
can be shared/delegated on its own if needed, which avoids firing dozens of
invitations/notifications at once.
"""

import frappe
from frappe import _
from frappe.utils import add_days, add_months, cint, get_fullname, getdate

# "cada N": (unidad de frappe.utils, N)
FREQUENCY_STEP = {
	"Diaria": ("days", 1),
	"Semanal": ("days", 7),
	"Quincenal": ("days", 14),
	"Mensual": ("months", 1),
	"Trimestral": ("months", 3),
	"Anual": ("months", 12),
}

# Hard ceiling on how many occurrences a single series can spawn, regardless of the
# end date / count the user asks for. Bounds the number of documents (and, for synced
# users, Google events) one "Crear" click can produce.
MAX_OCCURRENCES = 104


def _log(doc, message):
	# Mirrors api.activity._log — system timeline entry, kept out of that module to
	# avoid a circular import (api.activity imports this module).
	doc.add_comment("Info", message, comment_by=get_fullname(frappe.session.user))


def _recurrence_dates(anchor, frequency, end_date, count):
	"""Dates strictly *after* `anchor` (the head activity already covers `anchor` itself).

	Stops at the earliest of: `end_date`, `count - 1` further dates, or MAX_OCCURRENCES.
	"""
	unit, step = FREQUENCY_STEP[frequency]
	end_date = getdate(end_date) if end_date else None
	count = cint(count) or None

	dates = []
	cursor = anchor
	while len(dates) < MAX_OCCURRENCES:
		cursor = add_days(cursor, step) if unit == "days" else add_months(cursor, step)
		if end_date and cursor > end_date:
			break
		dates.append(cursor)
		if count and len(dates) >= count - 1:
			break
	return dates


def build_series(head_doc, frequency, end_date, count):
	"""Turn `head_doc` (already inserted) into the head of a recurring series and
	generate its future occurrences. Returns the number of occurrences created."""
	if not head_doc.due_date:
		frappe.throw(_("Una actividad recurrente necesita una fecha límite (es la primera ocurrencia)."))
	if frequency not in FREQUENCY_STEP:
		frappe.throw(_("Frecuencia de recurrencia inválida"))
	if not end_date and not (cint(count) or None):
		frappe.throw(_("Indica una fecha de fin ('Repetir hasta') o un número de repeticiones."))

	dates = _recurrence_dates(getdate(head_doc.due_date), frequency, end_date, count)

	frappe.db.set_value(
		"EU Activity",
		head_doc.name,
		{
			"is_recurring": 1,
			"recurrence_frequency": frequency,
			# recurrence_end_date is nullable; is_recurring / recurrence_count are NOT NULL
			# int columns — a raw db.set_value with None on those raises IntegrityError.
			"recurrence_end_date": end_date or None,
			"recurrence_count": cint(count),
			"recurrence_group": head_doc.name,
		},
		update_modified=False,
	)

	# Whether the head carries an explicit time — occurrences without one need the same
	# post-insert clear as api.activity.create_activity (Frappe backfills empty Time
	# fields with the current time-of-day on insert).
	head_had_start = bool(head_doc.start_time)
	head_had_end = bool(head_doc.end_time)

	for occ_date in dates:
		occ = frappe.copy_doc(head_doc)
		occ.due_date = occ_date
		occ.status = "Abierta"
		occ.is_rescheduled = 0
		occ.reschedule_count = 0
		occ.logged_hours = 0
		occ.google_event_id = None
		occ.google_calendar = None
		occ.follow_up_of = None
		occ.responsible_user = None
		occ.participants = []
		occ.is_recurring = 1
		occ.recurrence_frequency = frequency
		occ.recurrence_end_date = end_date or None
		occ.recurrence_count = cint(count)
		occ.recurrence_group = head_doc.name
		occ.insert(ignore_permissions=True)

		if not head_had_start:
			frappe.db.set_value("EU Activity", occ.name, "start_time", None, update_modified=False)
		if not head_had_end:
			frappe.db.set_value("EU Activity", occ.name, "end_time", None, update_modified=False)

	if end_date:
		scope_text = _("hasta {0}").format(frappe.utils.formatdate(end_date))
	else:
		scope_text = _("{0} repeticiones").format(cint(count))
	_log(
		head_doc,
		_("🔁 Serie recurrente creada: {0} ocurrencias adicionales ({1}, {2})").format(
			len(dates), frequency, scope_text
		),
	)

	frappe.msgprint(
		_("Serie recurrente: se crearon {0} ocurrencias adicionales.").format(len(dates)),
		indicator="green",
		alert=True,
	)
	return len(dates)


def on_activity_trash(doc, method=None):
	"""Runs on every EU Activity deletion (wired in hooks.py alongside the Google
	cleanup). Removes back-links that would otherwise make `frappe.delete_doc` raise
	LinkExistsError — this executes before Frappe's own link check in delete_doc().

	Not recurrence-specific, but it's what makes the recurrence cascade delete (and
	deleting any activity that ever accumulated an EU Activity Event) work at all.
	"""
	frappe.db.delete("EU Activity Event", {"activity": doc.name})
	frappe.db.set_value(
		"EU Activity", {"follow_up_of": doc.name}, "follow_up_of", None, update_modified=False
	)
