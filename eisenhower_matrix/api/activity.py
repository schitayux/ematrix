# Copyright (c) 2026, CHAPPSA and contributors
# For license information, please see license.txt

import frappe
import frappe.share
from frappe import _
from frappe.desk.doctype.notification_log.notification_log import enqueue_create_notification
from frappe.desk.form import assign_to
from frappe.utils import now_datetime

# frappe.share.remove() deletes the DocShare row via frappe.delete_doc() without
# ignore_permissions, and DocShare.on_trash() runs its own separate share-permission
# check — neither is satisfied by a plain participant unsharing their own invitation
# (they're not the document owner), so both gates must be waived explicitly here. We've
# already authorized the caller ourselves (see the call sites) before reaching this.
SHARE_REMOVE_FLAGS = {"ignore_permissions": True, "ignore_share_permission": True}

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
	"start_time",
	"end_time",
	"sync_to_google",
	"board_order",
	"is_shared",
	"responsible_user",
	"owner",
	"modified",
	"google_event_id",
]


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
	activities = frappe.get_list("EU Activity", fields=ACTIVITY_FIELDS, order_by="board_order asc, modified desc")
	names = [row.name for row in activities]
	if not names:
		return []

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
		filters={"reference_doctype": "EU Activity", "reference_name": ["in", names]},
		fields=["reference_name", "count(name) as cnt"],
		group_by="reference_name",
	):
		comment_counts[row.reference_name] = row.cnt

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
			}
		)
	return result


@frappe.whitelist()
def create_activity(payload):
	payload = frappe.parse_json(payload)
	doc = frappe.new_doc("EU Activity")
	doc.update(
		{
			"title": payload.get("title"),
			"task_type": payload.get("task_type") or "Laboral",
			"description": payload.get("description"),
			"is_important": payload.get("is_important", 0),
			"is_urgent": payload.get("is_urgent", 0),
			"due_date": payload.get("due_date"),
			"start_time": payload.get("start_time"),
			"end_time": payload.get("end_time"),
			"sync_to_google": payload.get("sync_to_google", 1),
			"status": payload.get("status") or "Abierta",
		}
	)
	doc.insert()

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

	return doc.name


@frappe.whitelist()
def update_activity(name, payload):
	payload = frappe.parse_json(payload)
	doc = frappe.get_doc("EU Activity", name)

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
	):
		if field in payload:
			doc.set(field, payload[field])

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

	doc.save()
	return doc.name


@frappe.whitelist()
def delete_activity(name):
	frappe.delete_doc("EU Activity", name)
	return name


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
		fields=["content", "comment_by", "creation"],
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
	new_internal_users = []
	added_any = False

	for participant in participants:
		invite_role = participant.get("invite_role") or "Colaborador"

		if invite_role == "Externo":
			email = (participant.get("external_email") or "").strip()
			if not email or email in existing_emails:
				continue
			doc.append("participants", {"invite_role": "Externo", "external_email": email})
			existing_emails.add(email)
			added_any = True
			continue

		user = participant.get("user")
		if not user or user in existing_users:
			continue
		doc.append(
			"participants",
			{"user": user, "invite_role": "Colaborador", "status": "Pendiente"},
		)
		existing_users.add(user)
		new_internal_users.append(user)
		added_any = True

	if not added_any:
		return
	doc.save()

	for user in new_internal_users:
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


@frappe.whitelist()
def remove_participant(activity, row_name):
	doc = frappe.get_doc("EU Activity", activity)
	if frappe.session.user != doc.owner and "System Manager" not in frappe.get_roles():
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

	if row.user:
		frappe.publish_realtime("eisenhower_activity_update", {"activity": doc.name}, user=row.user)

	return doc.name


@frappe.whitelist()
def resend_invitation(activity, row_name):
	doc = frappe.get_doc("EU Activity", activity)
	if frappe.session.user != doc.owner and "System Manager" not in frappe.get_roles():
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


def _quadrant_for(is_important, is_urgent):
	if is_important and is_urgent:
		return "Hazlo Ya"
	if is_important and not is_urgent:
		return "Planifícalo"
	if not is_important and is_urgent:
		return "Delégalo"
	return "Elimínalo"
