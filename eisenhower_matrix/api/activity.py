# Copyright (c) 2026, CHAPPSA and contributors
# For license information, please see license.txt

import frappe
import frappe.share
from frappe import _

from eisenhower_matrix import recurrence
from frappe.desk.doctype.notification_log.notification_log import enqueue_create_notification
from frappe.desk.form import assign_to
from frappe.utils import (
	add_days,
	add_months,
	format_time,
	formatdate,
	get_first_day,
	get_first_day_of_week,
	get_fullname,
	get_last_day,
	get_last_day_of_week,
	get_time,
	getdate,
	now_datetime,
)

# frappe.share.remove() deletes the DocShare row via frappe.delete_doc() without
# ignore_permissions, and DocShare.on_trash() runs its own separate share-permission
# check — neither is satisfied by a plain participant unsharing their own invitation
# (they're not the document owner), so both gates must be waived explicitly here. We've
# already authorized the caller ourselves (see the call sites) before reaching this.
SHARE_REMOVE_FLAGS = {"ignore_permissions": True, "ignore_share_permission": True}

CLOSED_STATUSES = ("Completada", "Cancelada")

ACTIVITY_FIELDS = [
	"name",
	"title",
	"task_type",
	"description",
	"is_important",
	"is_urgent",
	"quadrant",
	"status",
	"due_date",
	"start_date",
	"project",
	"_user_tags",
	"is_rescheduled",
	"reschedule_count",
	"start_time",
	"end_time",
	"logged_hours",
	"is_billable",
	"sync_to_google",
	"is_recurring",
	"recurrence_frequency",
	"recurrence_group",
	"board_order",
	"is_shared",
	"responsible_user",
	"owner",
	"creation",
	"modified",
	"follow_up_of",
	"google_event_id",
]


def _log(doc, message):
	# System-generated timeline entries use comment_type "Info" (same as Frappe Desk's
	# own "assigned to" / "shared with" entries) so the frontend can visually separate
	# them from the free-text comments a user types by hand.
	doc.add_comment("Info", message, comment_by=get_fullname(frappe.session.user))


def _record_event(doc, event_type):
	# Structured, queryable counterpart to _log()'s human-readable comment — the KPI
	# report buckets these by date instead of parsing translated comment text (which
	# would break under a different site language). Kept alongside _log(), not instead
	# of it: this feeds get_kpi_report(), the comment still feeds the activity timeline.
	frappe.get_doc({"doctype": "EU Activity Event", "activity": doc.name, "event_type": event_type}).insert(
		ignore_permissions=True
	)


def _time_range_text(start_time, end_time):
	if not start_time and not end_time:
		return _("sin horario")
	start = format_time(start_time) if start_time else "?"
	if not end_time:
		return start
	return f"{start} – {format_time(end_time)}"


def _times_overlap(s1, e1, s2, e2):
	# A missing end time is treated as a zero-length point at the start. Equal starts
	# always count as a clash (even point-vs-point); otherwise it's the standard
	# half-open interval overlap test.
	e1 = e1 or s1
	e2 = e2 or s2
	if s1 == s2:
		return True
	return s1 < e2 and s2 < e1


@frappe.whitelist()
def check_time_conflicts(due_date, start_time, end_time=None, exclude=None):
	"""Activities the current user (owner or responsible) already has scheduled on the
	same date whose time overlaps the given start/end. Used by the dialog to warn before
	double-booking. Returns [] when there's nothing to check (no date or no start time)."""
	if not due_date or not start_time:
		return []

	start = get_time(start_time)
	end = get_time(end_time) if end_time else None

	rows = frappe.get_all(
		"EU Activity",
		filters=[
			["due_date", "=", getdate(due_date)],
			["status", "not in", list(CLOSED_STATUSES)],
			["start_time", "is", "set"],
			["name", "!=", exclude or ""],
		],
		or_filters=[["owner", "=", frappe.session.user], ["responsible_user", "=", frappe.session.user]],
		fields=["name", "title", "start_time", "end_time"],
		limit_page_length=0,
	)

	conflicts = []
	for row in rows:
		row_start = get_time(row.start_time)
		row_end = get_time(row.end_time) if row.end_time else None
		if _times_overlap(start, end, row_start, row_end):
			conflicts.append(
				{"name": row.name, "title": row.title, "time_label": _time_range_text(row_start, row_end)}
			)
	return conflicts


@frappe.whitelist()
def get_settings():
	settings = frappe.get_cached_doc("EU Settings")
	return {
		"default_view": settings.default_view,
		"enable_notifications": settings.enable_notifications,
		"enable_realtime": settings.enable_realtime,
		"has_google_sync": bool(
			frappe.db.exists("Configuraciones EMatrix", {"user": frappe.session.user, "sync_enabled": 1})
		),
		"quadrants": {
			"Hazlo Ya": {"label": settings.q1_label, "color": settings.q1_color},
			"Planifícalo": {"label": settings.q2_label, "color": settings.q2_color},
			"Delégalo": {"label": settings.q3_label, "color": settings.q3_color},
			"Elimínalo": {"label": settings.q4_label, "color": settings.q4_color},
		},
	}


@frappe.whitelist()
def get_board_data():
	user = frappe.session.user

	# The board is strictly personal: activities I own / am responsible for, plus the
	# ones explicitly shared with me (DocShare — collaboration invites, accepted or
	# still pending). Scoped by hand instead of frappe.get_list() so it holds regardless
	# of role — System Manager and Eisenhower Manager have plain read on EU Activity and
	# would otherwise get *everyone's* activities mixed into their board.
	shared_names = frappe.get_all(
		"DocShare", filters={"share_doctype": "EU Activity", "user": user}, pluck="share_name"
	)
	own_names = frappe.get_all(
		"EU Activity",
		or_filters=[["owner", "=", user], ["responsible_user", "=", user]],
		pluck="name",
	)
	names = list(set(own_names) | set(shared_names))
	if not names:
		return []

	activities = frappe.get_all(
		"EU Activity",
		filters={"name": ["in", names]},
		fields=ACTIVITY_FIELDS,
		order_by="board_order asc, modified desc",
	)

	participants_by_parent = {}
	for row in frappe.get_all(
		"EU Activity Participant",
		filters={"parent": ["in", names]},
		fields=[
			"name",
			"parent",
			"user",
			"invite_role",
			"external_email",
			"transfer_ownership",
			"status",
			"responded_on",
			"override_classification",
			"personal_important",
			"personal_urgent",
			"response_comment",
		],
	):
		participants_by_parent.setdefault(row.parent, []).append(row)

	comment_counts = {}
	for row in frappe.get_all(
		"Comment",
		# comment_type "Comment" is the real, user-typed conversation — the system-generated
		# "Info" log entries (see _log()) are excluded so the 💬 badge on the board still
		# reflects actual discussion instead of ballooning with every field edit.
		filters={"reference_doctype": "EU Activity", "reference_name": ["in", names], "comment_type": "Comment"},
		fields=["reference_name", "count(name) as cnt"],
		group_by="reference_name",
	):
		comment_counts[row.reference_name] = row.cnt

	follow_up_counts = {}
	for row in frappe.get_all(
		"EU Activity",
		filters={"follow_up_of": ["in", names]},
		fields=["follow_up_of", "count(name) as cnt"],
		group_by="follow_up_of",
	):
		follow_up_counts[row.follow_up_of] = row.cnt

	# Closure date (when an activity turned Completada/Cancelada) is tracked separately
	# from due_date so the date-bucket filters (Hoy, Vencidas, ...) can be reinterpreted
	# against it once the status filter is a closed status — see visible_activities()
	# in eisenhower.js for why: due_date and "when it closed" are unrelated dates.
	checklist_by_parent = {}
	for row in frappe.get_all(
		"EU Activity Checklist",
		filters={"parent": ["in", names], "parenttype": "EU Activity"},
		fields=["name", "parent", "item", "done"],
		order_by="idx asc",
	):
		checklist_by_parent.setdefault(row.parent, []).append(row)

	closed_on_by_activity = {}
	for row in frappe.get_all(
		"EU Activity Event",
		filters={"activity": ["in", names], "event_type": ["in", list(CLOSED_STATUSES)]},
		fields=["activity", "MAX(creation) as closed_on"],
		group_by="activity",
	):
		closed_on_by_activity[row.activity] = str(row.closed_on)[:10] if row.closed_on else None

	result = []
	for activity in activities:
		participants = participants_by_parent.get(activity.name, [])
		my_row = next((row for row in participants if row.user == user), None)

		effective_quadrant = activity.quadrant
		if my_row and my_row.override_classification:
			effective_quadrant = _quadrant_for(my_row.personal_important, my_row.personal_urgent)

		result.append(
			{
				**activity,
				"participants": participants,
				"my_participant_status": my_row.status if my_row else None,
				"effective_quadrant": effective_quadrant,
				"comment_count": comment_counts.get(activity.name, 0),
				"follow_up_count": follow_up_counts.get(activity.name, 0),
				"checklist": checklist_by_parent.get(activity.name, []),
				"closed_on": closed_on_by_activity.get(activity.name),
			}
		)
	return result


@frappe.whitelist()
def create_activity(payload):
	payload = frappe.parse_json(payload)
	follow_up_of = payload.get("follow_up_of")
	doc = frappe.new_doc("EU Activity")
	doc.update(
		{
			"title": payload.get("title"),
			"task_type": payload.get("task_type") or "Laboral",
			"description": payload.get("description"),
			"is_important": payload.get("is_important", 0),
			"is_urgent": payload.get("is_urgent", 0),
			"due_date": payload.get("due_date"),
			"start_date": payload.get("start_date"),
			"project": payload.get("project"),
			"start_time": payload.get("start_time"),
			"end_time": payload.get("end_time"),
			"logged_hours": payload.get("logged_hours") or 0,
			"is_billable": payload.get("is_billable", 0),
			"sync_to_google": payload.get("sync_to_google", 1),
			"status": payload.get("status") or "Abierta",
			"follow_up_of": follow_up_of,
		}
	)
	# Plantilla: copia sus subtareas a la actividad nueva (los demás campos ya llegan en
	# el payload, prellenados en el formulario desde la plantilla).
	if payload.get("template"):
		template = frappe.get_doc("EU Activity Template", payload.get("template"))
		template.check_permission("read")
		for row in template.checklist:
			doc.append("checklist", {"item": row.item, "done": 0})
	doc.insert()
	_log(doc, _("Actividad creada"))
	if payload.get("tags") is not None:
		_set_tags(doc, payload.get("tags"))

	if follow_up_of:
		parent = frappe.get_doc("EU Activity", follow_up_of)
		parent.check_permission()
		_log(parent, _("🔗 Seguimiento creado: {0} — {1}").format(doc.name, doc.title))
		_log(doc, _("🔗 Seguimiento de {0} — {1}").format(parent.name, parent.title))

	# Frappe quirk: Document.insert() -> _set_defaults() -> update_if_missing() treats
	# an empty "Time" field as "missing" and backfills it from a fresh new_doc()
	# template, which frappe.model.create_new.set_dynamic_default_values() always
	# stamps with the current time-of-day for ANY Time field — independent of the
	# doctype's own "default". Setting start_time/end_time to None in the payload above
	# can't prevent this (it gets silently overwritten during insert), so clear them
	# again immediately after if the user didn't actually provide a time.
	if not payload.get("start_time"):
		doc.start_time = None
		frappe.db.set_value("EU Activity", doc.name, "start_time", None, update_modified=False)
	if not payload.get("end_time"):
		doc.end_time = None
		frappe.db.set_value("EU Activity", doc.name, "end_time", None, update_modified=False)

	participants = payload.get("participants") or []
	if participants:
		_invite_participants(doc, participants)

	if payload.get("is_recurring"):
		recurrence.build_series(
			doc,
			payload.get("recurrence_frequency"),
			payload.get("recurrence_end_date"),
			payload.get("recurrence_count"),
		)

	return doc.name


@frappe.whitelist()
def update_activity(name, payload):
	payload = frappe.parse_json(payload)
	doc = frappe.get_doc("EU Activity", name)

	old_title = doc.title
	old_due_date = doc.due_date
	old_start_time = doc.start_time
	old_end_time = doc.end_time
	old_status = doc.status
	old_other = {
		field: doc.get(field)
		for field in (
			"task_type",
			"description",
			"sync_to_google",
			"is_important",
			"is_urgent",
			"logged_hours",
			"is_billable",
			"start_date",
			"project",
		)
	}

	# A Completada/Cancelada activity is locked: nothing about it can change except
	# reopening it via status (board_order is exempt too, since that's just where the
	# card sits on the board, not a content edit). Enforced here rather than only in
	# the dialog's read_only flags, so the lock holds even against a direct API call.
	was_locked = old_status in CLOSED_STATUSES

	for field in (
		"title",
		"task_type",
		"description",
		"due_date",
		"start_time",
		"end_time",
		"status",
		"board_order",
		"sync_to_google",
		"logged_hours",
		"is_billable",
		"start_date",
		"project",
	):
		if field in payload:
			if was_locked and field not in ("status", "board_order"):
				continue
			doc.set(field, payload[field])

	if not was_locked:
		if frappe.session.user == doc.owner:
			for field in ("is_important", "is_urgent"):
				if field in payload:
					doc.set(field, payload[field])
		else:
			my_row = next((row for row in doc.participants if row.user == frappe.session.user), None)
			if my_row:
				for field in ("override_classification", "personal_important", "personal_urgent"):
					if field in payload:
						my_row.set(field, payload[field])

	# The payload always resends due_date/start_time/end_time as plain strings (the
	# dialog re-submits every field on every save), while frappe.get_doc() loads them
	# as datetime.date/time objects — comparing the raw values would flag a "change"
	# on every save even when nothing actually moved, so both sides are normalized
	# through getdate()/get_time() before comparing.
	old_due_date_norm = getdate(old_due_date) if old_due_date else None
	new_due_date_norm = getdate(doc.due_date) if doc.due_date else None
	old_start_norm = get_time(old_start_time) if old_start_time else None
	new_start_norm = get_time(doc.start_time) if doc.start_time else None
	old_end_norm = get_time(old_end_time) if old_end_time else None
	new_end_norm = get_time(doc.end_time) if doc.end_time else None

	title_changed = doc.title != old_title
	due_date_changed = new_due_date_norm != old_due_date_norm
	time_changed = new_start_norm != old_start_norm or new_end_norm != old_end_norm
	status_changed = doc.status != old_status
	other_changed = any(doc.get(field) != old_value for field, old_value in old_other.items())
	# Reprogramado tracks due_date changes only — a status change (e.g. marking the
	# activity "Completada") must never bump reschedule_count or set is_rescheduled.
	rescheduled = due_date_changed and old_due_date_norm and new_due_date_norm
	any_changed = title_changed or due_date_changed or time_changed or status_changed or other_changed

	if rescheduled:
		doc.reschedule_count = (doc.reschedule_count or 0) + 1
		doc.is_rescheduled = 1

	doc.save()

	if title_changed:
		_log(doc, _("Título modificado: '{0}' → '{1}'").format(old_title, doc.title))
	if status_changed:
		_log(doc, _("Estado modificado: '{0}' → '{1}'").format(old_status, doc.status))
	if rescheduled:
		_log(doc, _("Fecha reprogramada: {0} → {1}").format(formatdate(old_due_date_norm), formatdate(new_due_date_norm)))
	elif due_date_changed and new_due_date_norm:
		_log(doc, _("Fecha límite establecida: {0}").format(formatdate(new_due_date_norm)))
	if time_changed:
		_log(
			doc,
			_("Horario modificado: {0} → {1}").format(
				_time_range_text(old_start_norm, old_end_norm), _time_range_text(new_start_norm, new_end_norm)
			),
		)

	# Structured events for get_kpi_report() — see _record_event()'s docstring-comment
	# for why this exists alongside (not instead of) the _log() comments above.
	if rescheduled:
		_record_event(doc, "Reprogramada")
	if status_changed:
		if doc.status == "Completada":
			_record_event(doc, "Completada")
		elif doc.status == "Cancelada":
			_record_event(doc, "Cancelada")
		elif old_status in CLOSED_STATUSES:
			_record_event(doc, "Reabierta")

	# Turning a standalone activity into a recurring series from the edit dialog. Only
	# when it isn't already part of one and isn't locked — same up-front materialization
	# as create_activity (recurrence stays create-once: to change it, delete the future
	# occurrences and start a new series).
	series_created = 0
	if payload.get("is_recurring") and not was_locked and not doc.recurrence_group:
		series_created = recurrence.build_series(
			doc,
			payload.get("recurrence_frequency"),
			payload.get("recurrence_end_date"),
			payload.get("recurrence_count"),
		)

	if payload.get("tags") is not None and not was_locked:
		any_changed = _set_tags(doc, payload.get("tags")) or any_changed

	return {"name": doc.name, "modified": any_changed or bool(series_created), "series_created": series_created}


def _set_tags(doc, tags):
	"""Sincroniza las etiquetas nativas de Frappe (_user_tags) con la lista recibida."""
	if isinstance(tags, str):
		tags = [t for t in tags.split(",")]
	wanted = {t.strip() for t in tags if t and t.strip()}
	current = {t for t in (doc.get_tags() or []) if t}
	for tag in wanted - current:
		doc.add_tag(tag)
	for tag in current - wanted:
		doc.remove_tag(tag)
	return bool(wanted ^ current)


def _checklist_payload(doc):
	return [{"name": r.name, "item": r.item, "done": r.done} for r in doc.checklist]


def _editable_checklist_doc(activity):
	doc = frappe.get_doc("EU Activity", activity)
	doc.check_permission("write")
	if doc.status in CLOSED_STATUSES:
		frappe.throw(_("Una actividad Completada o Cancelada no se puede modificar. Reábrela primero."))
	return doc


@frappe.whitelist()
def add_checklist_item(activity, item):
	item = (item or "").strip()
	if not item:
		frappe.throw(_("Escribe el texto de la subtarea."))
	doc = _editable_checklist_doc(activity)
	doc.append("checklist", {"item": item[:140], "done": 0})
	doc.save()
	return _checklist_payload(doc)


@frappe.whitelist()
def toggle_checklist_item(activity, row_name, done):
	doc = _editable_checklist_doc(activity)
	row = next((r for r in doc.checklist if r.name == row_name), None)
	if not row:
		frappe.throw(_("Subtarea no encontrada."))
	row.done = 1 if frappe.parse_json(done) else 0
	doc.save()
	return _checklist_payload(doc)


@frappe.whitelist()
def remove_checklist_item(activity, row_name):
	doc = _editable_checklist_doc(activity)
	doc.checklist = [r for r in doc.checklist if r.name != row_name]
	for i, r in enumerate(doc.checklist, start=1):
		r.idx = i
	doc.save()
	return _checklist_payload(doc)


@frappe.whitelist()
def delete_activity(name, scope=None):
	"""Delete an activity.

	`scope` only matters for activities that belong to a recurring series:
	  - "one" (or None): just this activity
	  - "future": this activity and every later occurrence of the same series
	  - "all": every occurrence of the series

	Permissions are left checked (no ignore_permissions) — the Eisenhower User role
	deletes via if_owner, and every occurrence of a series shares the same owner.
	"""
	doc = frappe.get_doc("EU Activity", name)
	group = doc.get("recurrence_group")

	if not group or scope in (None, "", "one"):
		frappe.delete_doc("EU Activity", name)
		return {"deleted": [name]}

	members = frappe.get_all(
		"EU Activity", filters={"recurrence_group": group}, fields=["name", "due_date"]
	)

	if scope == "future":
		anchor = getdate(doc.due_date) if doc.due_date else None
		targets = [
			row.name
			for row in members
			if row.name == name or (anchor and row.due_date and getdate(row.due_date) >= anchor)
		]
	elif scope == "all":
		targets = [row.name for row in members]
	else:
		frappe.throw(_("Alcance de borrado inválido: {0}").format(scope))

	for target in targets:
		frappe.delete_doc("EU Activity", target)

	return {"deleted": targets}


@frappe.whitelist()
def stop_recurrence(activity):
	"""Detiene una serie recurrente desde una de sus actividades: elimina las
	ocurrencias con fecha futura (due_date > hoy, excepto la actividad desde la que se
	llama) y quita la configuración de recurrencia de las que quedan — dejan de estar
	vinculadas y pasan a ser actividades independientes."""
	doc = frappe.get_doc("EU Activity", activity)
	doc.check_permission("write")
	group = doc.get("recurrence_group")
	if not group:
		frappe.throw(_("Esta actividad no es parte de una serie recurrente"))

	today = getdate(now_datetime())
	members = frappe.get_all(
		"EU Activity", filters={"recurrence_group": group}, fields=["name", "due_date"]
	)
	to_delete = [
		row.name
		for row in members
		if row.name != activity and row.due_date and getdate(row.due_date) > today
	]
	for name in to_delete:
		frappe.delete_doc("EU Activity", name)

	remaining = [row.name for row in members if row.name not in to_delete]
	for name in remaining:
		frappe.db.set_value(
			"EU Activity",
			name,
			{
				# is_recurring / recurrence_count are NOT NULL int columns — use 0, not None.
				"is_recurring": 0,
				"recurrence_frequency": None,
				"recurrence_end_date": None,
				"recurrence_count": 0,
				"recurrence_group": None,
			},
			update_modified=False,
		)

	_log(
		frappe.get_doc("EU Activity", activity),
		_("Serie recurrente detenida: {0} ocurrencia(s) futura(s) eliminada(s); las restantes quedan independientes.").format(
			len(to_delete)
		),
	)

	return {"deleted": to_delete, "kept": remaining}


@frappe.whitelist()
def get_comments(activity):
	# Core "Comment" has no DocPerm role that grants a plain user read access, so
	# frappe.client.get_list("Comment", ...) 403s for anyone without System Manager.
	# Same pattern as frappe.desk.form.utils.add_comment: check permission on the
	# activity itself (owner or shared participant), then fetch with frappe.get_all
	# (unchecked) instead of frappe.get_list (permission-checked) since we've already
	# authorized access to the parent document ourselves.
	doc = frappe.get_doc("EU Activity", activity)
	doc.check_permission()
	return frappe.get_all(
		"Comment",
		filters={"reference_doctype": "EU Activity", "reference_name": activity},
		fields=["content", "comment_by", "creation", "comment_type"],
		order_by="creation asc",
		limit_page_length=0,
	)


@frappe.whitelist()
def invite_participants(activity, participants):
	participants = frappe.parse_json(participants)
	doc = frappe.get_doc("EU Activity", activity)
	if frappe.session.user != doc.owner:
		frappe.throw(_("Solo el dueño de la actividad puede invitar o delegar participantes"))

	_invite_participants(doc, participants)
	return doc.name


def _invite_participants(doc, participants):
	existing_users = {row.user for row in doc.participants if row.user}
	existing_emails = {row.external_email for row in doc.participants if row.external_email}
	new_collaborators = []
	new_delegates = []
	added_any = False
	_pending_logs = []

	for participant in participants:
		invite_role = participant.get("invite_role") or "Colaborador"

		if invite_role == "Externo":
			email = (participant.get("external_email") or "").strip()
			if not email or email in existing_emails:
				continue
			doc.append("participants", {"invite_role": "Externo", "external_email": email})
			existing_emails.add(email)
			added_any = True
			_pending_logs.append(_("{0} invitado por correo (externo)").format(email))
			continue

		user = participant.get("user")
		if not user or user in existing_users:
			continue

		if invite_role == "Delegado":
			doc.append(
				"participants",
				{
					"user": user,
					"invite_role": "Delegado",
					"status": "Pendiente",
					"transfer_ownership": 1 if participant.get("transfer_ownership") else 0,
				},
			)
			new_delegates.append(user)
		else:
			doc.append(
				"participants",
				{"user": user, "invite_role": "Colaborador", "status": "Pendiente"},
			)
			new_collaborators.append(user)
		existing_users.add(user)
		added_any = True

	if not added_any:
		return
	doc.save()

	for message in _pending_logs:
		_log(doc, message)

	for user in new_collaborators:
		_log(doc, _("{0} invitado como colaborador").format(user))
		frappe.share.add(doc.doctype, doc.name, user=user, read=1, write=0, notify=0)
		enqueue_create_notification(
			user,
			{
				"subject": _("{0} te compartió la actividad “{1}”").format(frappe.session.user, doc.title),
				"type": "Share",
				"document_type": doc.doctype,
				"document_name": doc.name,
				"from_user": frappe.session.user,
			},
		)
		frappe.publish_realtime("eisenhower_activity_update", {"activity": doc.name}, user=user)

	for user in new_delegates:
		row = next((r for r in doc.participants if r.user == user and r.invite_role == "Delegado"), None)
		transfer_note = _(" (con transferencia de responsabilidad al aceptar)") if row and row.transfer_ownership else ""
		_log(doc, _("{0} delegado{1}").format(user, transfer_note))
		# assign_to.add() shares the document (if needed) and raises its own "assigned to
		# you" notification, so this covers both the assignment and the "delegated to you"
		# signal in one call instead of duplicating what share.add()+enqueue_create_notification
		# do for plain collaborators above.
		assign_to.add(
			{
				"doctype": doc.doctype,
				"name": doc.name,
				"assign_to": [user],
				"description": _("{0} te delegó la actividad “{1}”").format(frappe.session.user, doc.title),
			},
			ignore_permissions=True,
		)
		frappe.publish_realtime("eisenhower_activity_update", {"activity": doc.name}, user=user)


@frappe.whitelist()
def remove_participant(activity, row_name):
	doc = frappe.get_doc("EU Activity", activity)
	if frappe.session.user not in (doc.owner, "Administrator"):
		frappe.throw(_("Solo el dueño de la actividad puede quitar participantes"))

	row = next((r for r in doc.participants if r.name == row_name), None)
	if not row:
		return doc.name

	if row.user:
		frappe.share.remove(doc.doctype, doc.name, row.user, flags=SHARE_REMOVE_FLAGS)
		if row.invite_role == "Delegado":
			assign_to.remove(doc.doctype, doc.name, row.user, ignore_permissions=True)

	doc.participants.remove(row)
	doc.save(ignore_permissions=True)
	_log(doc, _("{0} removido de la actividad").format(row.user or row.external_email))

	if row.user:
		frappe.publish_realtime("eisenhower_activity_update", {"activity": doc.name}, user=row.user)

	return doc.name


@frappe.whitelist()
def resend_invitation(activity, row_name):
	doc = frappe.get_doc("EU Activity", activity)
	if frappe.session.user not in (doc.owner, "Administrator"):
		frappe.throw(_("Solo el dueño de la actividad puede reenviar una invitación"))

	row = next((r for r in doc.participants if r.name == row_name), None)
	if not row or not row.user:
		frappe.throw(_("Participante no encontrado"))
	if row.status != "Rechazada":
		frappe.throw(_("Solo se puede reenviar una invitación que fue rechazada"))

	row.status = "Pendiente"
	row.responded_on = None
	row.response_comment = None
	doc.save(ignore_permissions=True)
	_log(doc, _("Invitación reenviada a {0}").format(row.user))

	frappe.share.add(doc.doctype, doc.name, user=row.user, read=1, write=0, notify=0)
	enqueue_create_notification(
		row.user,
		{
			"subject": _("{0} te reenvió la actividad “{1}”").format(frappe.session.user, doc.title),
			"type": "Share",
			"document_type": doc.doctype,
			"document_name": doc.name,
			"from_user": frappe.session.user,
		},
	)
	frappe.publish_realtime("eisenhower_activity_update", {"activity": doc.name}, user=row.user)

	return doc.name


@frappe.whitelist()
def respond_to_invitation(activity, response, comment=None):
	if response not in ("Aceptada", "Rechazada"):
		frappe.throw(_("Respuesta inválida"))

	doc = frappe.get_doc("EU Activity", activity)
	row = next((row for row in doc.participants if row.user == frappe.session.user), None)
	if not row:
		frappe.throw(_("No estás invitado a esta actividad"))

	row.status = response
	row.responded_on = now_datetime()
	row.response_comment = comment

	if response == "Aceptada":
		# frappe.share.set_permission() (the whitelisted wrapper) always enforces
		# check_share_permission(), which requires "share" ptype on the activity — a
		# plain participant accepting their own invitation doesn't have that (only the
		# owner does). Call the underlying function directly so we can waive it the
		# same way we already do for SHARE_REMOVE_FLAGS above.
		frappe.share.set_docshare_permission(
			doc.doctype, doc.name, frappe.session.user, "write", 1, flags={"ignore_share_permission": True}
		)
		if row.invite_role == "Delegado" and row.transfer_ownership:
			doc.responsible_user = row.user
	else:
		frappe.share.remove(doc.doctype, doc.name, frappe.session.user, flags=SHARE_REMOVE_FLAGS)
		if row.invite_role == "Delegado":
			assign_to.remove(doc.doctype, doc.name, frappe.session.user, ignore_permissions=True)

	doc.save(ignore_permissions=True)

	verb = "aceptó" if response == "Aceptada" else "rechazó"
	_log(doc, _("{0} {1} la invitación").format(frappe.session.user, verb))
	enqueue_create_notification(
		doc.owner,
		{
			"subject": _("{0} {1} la actividad “{2}”").format(frappe.session.user, verb, doc.title),
			"type": "Share",
			"document_type": doc.doctype,
			"document_name": doc.name,
			"from_user": frappe.session.user,
		},
	)
	frappe.publish_realtime("eisenhower_activity_update", {"activity": doc.name}, user=doc.owner)
	for participant in doc.participants:
		if participant.user:
			frappe.publish_realtime("eisenhower_activity_update", {"activity": doc.name}, user=participant.user)

	return doc.name


@frappe.whitelist()
def duplicate_activity(name):
	doc = frappe.get_doc("EU Activity", name)
	doc.check_permission()

	new_doc = frappe.copy_doc(doc)
	new_doc.due_date = None
	new_doc.start_time = None
	new_doc.end_time = None
	new_doc.status = "Abierta"
	new_doc.is_rescheduled = 0
	new_doc.reschedule_count = 0
	new_doc.google_calendar = None
	new_doc.google_event_id = None
	new_doc.follow_up_of = None
	# Cleared so EUActivity.validate() re-derives it from the new owner (the user
	# duplicating) instead of keeping the original activity's responsible user.
	new_doc.responsible_user = None
	# A duplicate starts as the current user's own private copy — collaborators and
	# delegates aren't carried over so nobody gets silently re-shared/re-assigned.
	new_doc.participants = []
	new_doc.insert()

	_log(doc, _("Duplicada como {0}").format(new_doc.name))
	_log(new_doc, _("Duplicada desde {0}").format(doc.name))

	return new_doc.name


@frappe.whitelist()
def get_follow_up_defaults(name):
	doc = frappe.get_doc("EU Activity", name)
	doc.check_permission()

	track_number = frappe.db.count("EU Activity", {"follow_up_of": name}) + 1
	return {
		"title": f"Track {track_number}: {doc.title}",
		"description": doc.description,
		"task_type": doc.task_type,
		"is_important": doc.is_important,
		"is_urgent": doc.is_urgent,
		"follow_up_of": doc.name,
	}


KPI_PERIODS = ("day", "week", "biweek", "month")
STALE_AFTER_DAYS = 14


def _period_bounds(anchor, period):
	if period == "day":
		return anchor, anchor
	if period == "biweek":
		start = get_first_day_of_week(anchor)
		return start, add_days(start, 13)
	if period == "month":
		return get_first_day(anchor), get_last_day(anchor)
	return get_first_day_of_week(anchor), get_last_day_of_week(anchor)


def _shift_anchor(anchor, period, steps):
	if period == "day":
		return add_days(anchor, steps)
	if period == "biweek":
		return add_days(anchor, steps * 14)
	if period == "month":
		return add_months(anchor, steps)
	return add_days(anchor, steps * 7)


def _range_conditions(field, range_start, range_end):
	# Half-open [start, end+1) instead of BETWEEN, so an event created at exactly
	# midnight the day after range_end is never miscounted into this range.
	return [[field, ">=", range_start], [field, "<", add_days(range_end, 1)]]


def _delta(current, previous):
	if not previous:
		return None
	return round((current - previous) / previous * 100)


def _can_view_report_for(viewer, target):
	if viewer == target:
		return True
	return bool(frappe.db.exists("EU Report Share", {"parent": target, "user": viewer}))


@frappe.whitelist()
def get_report_share_users():
	"""Users who've granted the current session user access (via their own
	Configuraciones EMatrix > report_shared_with) — feeds both the "Ver informe de"
	filter in Reportes and the "Ver actividades de" filter in the Calendario view.
	Sharing grants the aggregate report plus a read-only calendar view; it never grants
	access to the activities in the board's other views or the ability to edit them."""
	names = frappe.get_all("EU Report Share", filters={"user": frappe.session.user}, pluck="parent")
	if not names:
		return []
	return frappe.get_all(
		"User", filters={"name": ["in", names], "enabled": 1}, fields=["name", "full_name"], order_by="full_name asc"
	)


def _user_activity_names(user, task_type):
	# "Mine" for report purposes = I own it, it's delegated to me (responsible_user),
	# or I'm an accepted participant (collaborator or delegate who never got
	# transfer_ownership, so responsible_user never moved to me).
	owned_or_responsible = frappe.get_all(
		"EU Activity", or_filters=[["owner", "=", user], ["responsible_user", "=", user]], pluck="name"
	)
	participant_names = frappe.get_all(
		"EU Activity Participant", filters={"user": user, "status": "Aceptada"}, pluck="parent"
	)
	names = list(set(owned_or_responsible) | set(participant_names))
	if task_type and names:
		names = frappe.get_all("EU Activity", filters={"name": ["in", names], "task_type": task_type}, pluck="name")
	return names


@frappe.whitelist()
def get_calendar_activities(for_user):
	"""Read-only feed for the Calendario view's "Ver actividades de" filter: another
	user's dated activities, only if they've shared with the current user via
	report_shared_with. No participant data / personal quadrant override — the viewer
	isn't a participant, they're just looking at someone's schedule."""
	if not _can_view_report_for(frappe.session.user, for_user):
		frappe.throw(_("No tienes permiso para ver el calendario de este usuario"))

	names = _user_activity_names(for_user, None)
	if not names:
		return []
	return frappe.get_all(
		"EU Activity",
		filters={"name": ["in", names], "due_date": ["is", "set"]},
		fields=[
			"name",
			"title",
			"due_date",
			"start_time",
			"end_time",
			"status",
			"quadrant",
			"task_type",
			"responsible_user",
		],
		order_by="due_date asc",
	)


@frappe.whitelist()
def get_kpi_report(period="week", anchor_date=None, task_type=None, for_user=None):
	period = period if period in KPI_PERIODS else "week"
	anchor = getdate(anchor_date) if anchor_date else getdate(now_datetime())
	task_type = task_type if task_type in ("Personal", "Laboral") else None

	start, end = _period_bounds(anchor, period)
	prev_anchor = _shift_anchor(anchor, period, -1)
	prev_start, prev_end = _period_bounds(prev_anchor, period)

	user = for_user or frappe.session.user
	if not _can_view_report_for(frappe.session.user, user):
		frappe.throw(_("No tienes permiso para ver el informe de este usuario"))

	user_names = _user_activity_names(user, task_type)

	def counts_for(range_start, range_end):
		empty = {"created": 0, "completed": 0, "cancelled": 0, "rescheduled": 0, "reopened": 0, "follow_ups": 0}
		if not user_names:
			return empty
		created = frappe.db.count(
			"EU Activity", [["name", "in", user_names], *_range_conditions("creation", range_start, range_end)]
		)
		follow_ups = frappe.db.count(
			"EU Activity",
			[
				["name", "in", user_names],
				["follow_up_of", "is", "set"],
				*_range_conditions("creation", range_start, range_end),
			],
		)
		event_counts = {"Completada": 0, "Cancelada": 0, "Reprogramada": 0, "Reabierta": 0}
		for row in frappe.get_all(
			"EU Activity Event",
			filters=[["activity", "in", user_names], *_range_conditions("creation", range_start, range_end)],
			fields=["event_type", "count(name) as cnt"],
			group_by="event_type",
		):
			event_counts[row.event_type] = row.cnt
		return {
			"created": created,
			"completed": event_counts["Completada"],
			"cancelled": event_counts["Cancelada"],
			"rescheduled": event_counts["Reprogramada"],
			"reopened": event_counts["Reabierta"],
			"follow_ups": follow_ups,
		}

	current = counts_for(start, end)
	previous = counts_for(prev_start, prev_end)
	deltas = {key: _delta(current[key], previous[key]) for key in current}

	# On-time rate + quadrant mix + avg reschedules, all scoped to activities that
	# actually closed (Completada) inside the selected period.
	on_time = 0
	judged = 0
	quadrant_counts = {"Hazlo Ya": 0, "Planifícalo": 0, "Delégalo": 0, "Elimínalo": 0}
	avg_reschedules = 0
	completed_names = []
	if user_names:
		completed_events = frappe.get_all(
			"EU Activity Event",
			filters=[
				["activity", "in", user_names],
				["event_type", "=", "Completada"],
				*_range_conditions("creation", start, end),
			],
			fields=["activity", "creation"],
			# frappe.get_all defaults to a 20-row page unless told otherwise — this feeds
			# quadrant_mix/on-time/avg-reschedules below, which need every completion in
			# the period, not just the first 20 (unlike the *_rows "top 20" listings
			# further down, which are deliberately capped for display).
			limit_page_length=0,
		)
		completed_names = [e.activity for e in completed_events]
		if completed_names:
			docs_by_name = {
				d.name: d
				for d in frappe.get_all(
					"EU Activity",
					filters={"name": ["in", completed_names]},
					fields=["name", "quadrant", "due_date", "reschedule_count"],
					limit_page_length=0,
				)
			}
			reschedule_total = 0
			for event in completed_events:
				doc = docs_by_name.get(event.activity)
				if not doc:
					continue
				quadrant_counts[doc.quadrant] = quadrant_counts.get(doc.quadrant, 0) + 1
				reschedule_total += doc.reschedule_count or 0
				if doc.due_date:
					judged += 1
					if getdate(event.creation) <= doc.due_date:
						on_time += 1
			avg_reschedules = round(reschedule_total / len(completed_events), 1)

	# Snapshot metrics — "right now", independent of the selected period.
	overdue_rows = []
	stale_rows = []
	reschedule_rows = []
	if user_names:
		today = getdate(now_datetime())
		open_filters = [["name", "in", user_names], ["status", "not in", list(CLOSED_STATUSES)]]
		# Frappe's query builder treats a bare "<" on a Date field as "less than OR
		# not set" (it doesn't apply normal SQL NULL semantics here) — "due_date is
		# set" has to be explicit or every activity without a due date shows up as
		# "overdue".
		overdue_filters = [*open_filters, ["due_date", "is", "set"], ["due_date", "<", today]]
		overdue_rows = frappe.get_all(
			"EU Activity",
			filters=overdue_filters,
			fields=["name", "title", "due_date", "status"],
			order_by="due_date asc",
			limit_page_length=20,
		)
		stale_rows = frappe.get_all(
			"EU Activity",
			filters=[*open_filters, ["modified", "<", add_days(today, -STALE_AFTER_DAYS)]],
			fields=["name", "title", "status", "modified"],
			order_by="modified asc",
			limit_page_length=20,
		)
		# >= 1, not some higher "chronic offender" bar — with reschedule counts
		# typically sitting at 1-2 in practice, a stricter floor left this list
		# looking empty/broken even when activities had genuinely been rescheduled.
		reschedule_rows = frappe.get_all(
			"EU Activity",
			filters=[["name", "in", user_names], ["reschedule_count", ">=", 1]],
			fields=["name", "title", "status", "reschedule_count"],
			order_by="reschedule_count desc",
			limit_page_length=20,
		)
		open_ages = frappe.get_all(
			"EU Activity", filters=open_filters, fields=["creation"], limit_page_length=0
		)
		open_count = len(open_ages)
		avg_age_days = (
			round(sum((today - getdate(row.creation)).days for row in open_ages) / open_count, 1)
			if open_count
			else 0
		)
		overdue_count = frappe.db.count("EU Activity", overdue_filters)
	else:
		open_count = avg_age_days = overdue_count = 0

	completed_rows = []
	if completed_names:
		completed_rows = frappe.get_all(
			"EU Activity",
			filters={"name": ["in", completed_names]},
			fields=["name", "title", "status"],
			order_by="modified desc",
			limit_page_length=20,
		)

	# Daily buckets across the selected range for the trend chart — kept at day
	# granularity regardless of period so the shape stays informative even for a
	# whole month (30ish points reads fine on a line chart; collapsing to 4-5 weekly
	# bars would flatten out the exact swings this report exists to surface).
	trend = []
	cursor = start
	while cursor <= end:
		trend.append({"date": str(cursor), **counts_for(cursor, cursor)})
		cursor = add_days(cursor, 1)

	return {
		"period": period,
		"user": user,
		"user_full_name": get_fullname(user),
		"range": {"start": str(start), "end": str(end)},
		"current": current,
		"previous": previous,
		"deltas": deltas,
		"efficiency": {
			"close_rate_pct": round(current["completed"] / current["created"] * 100) if current["created"] else None,
			"on_time_pct": round(on_time / judged * 100) if judged else None,
			"on_time_judged": judged,
			"avg_reschedules_per_closed": avg_reschedules,
		},
		"quadrant_mix": quadrant_counts,
		"snapshot": {
			"overdue_count": overdue_count,
			"open_count": open_count,
			"avg_open_age_days": avg_age_days,
		},
		"trend": trend,
		"lists": {
			"overdue": overdue_rows,
			"stale": stale_rows,
			"most_rescheduled": reschedule_rows,
			"completed_in_period": completed_rows,
		},
	}


def _quadrant_for(is_important, is_urgent):
	if is_important and is_urgent:
		return "Hazlo Ya"
	if is_important and not is_urgent:
		return "Planifícalo"
	if not is_important and is_urgent:
		return "Delégalo"
	return "Elimínalo"
