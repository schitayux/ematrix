# Copyright (c) 2026, CHAPPSA and contributors
# For license information, please see license.txt

from datetime import datetime, timedelta

import frappe
from frappe import _
from frappe.integrations.doctype.google_calendar.google_calendar import (
	format_date_according_to_google_calendar,
	get_google_calendar_object,
)
from frappe.utils import get_time, now_datetime, strip_html
from frappe.utils.password import set_encrypted_password
from googleapiclient.errors import HttpError

EXT_PROP_KEY = "eisenhower_activity"


# ---------------------------------------------------------------------------
# EU Activity -> Google (push), wired via hooks.doc_events
# ---------------------------------------------------------------------------


def on_activity_change(doc, method=None):
	if doc.flags.get("skip_google_sync"):
		return
	if not _get_active_config(doc.responsible_user):
		return
	frappe.enqueue(
		"eisenhower_matrix.google_sync.push_activity",
		queue="short",
		job_id=f"eisenhower-gcal-push-{doc.name}",
		deduplicate=True,
		enqueue_after_commit=True,
		activity_name=doc.name,
	)


def on_activity_trash(doc, method=None):
	if not doc.get("google_event_id") or not doc.get("google_calendar"):
		return
	frappe.enqueue(
		"eisenhower_matrix.google_sync.delete_from_google",
		queue="short",
		enqueue_after_commit=True,
		google_calendar=doc.google_calendar,
		google_event_id=doc.google_event_id,
	)


def push_activity(activity_name):
	# for_update serializes concurrent pushes for the same activity (e.g. an edit made
	# seconds after creation, or the hourly sync overlapping a live edit): the second
	# caller blocks here until the first one's push commits, so it sees the
	# google_event_id the first one just set instead of racing it into inserting a
	# second Google event for the same activity.
	doc = frappe.get_doc("EU Activity", activity_name, for_update=True)
	config = _get_active_config(doc.responsible_user)
	if not config:
		return

	if not doc.due_date or not doc.sync_to_google:
		if doc.google_event_id:
			delete_from_google(doc.google_calendar, doc.google_event_id)
			_clear_activity_sync_fields(doc.name)
		return

	try:
		client, account = get_google_calendar_object(config.google_calendar)
	except Exception:
		_set_config_error(config.name, frappe.get_traceback())
		return

	try:
		if doc.status == "Cancelada" and doc.google_event_id:
			delete_from_google(config.google_calendar, doc.google_event_id)
			_clear_activity_sync_fields(doc.name)
			return

		body = _event_body(doc)
		event_id = doc.google_event_id if doc.google_calendar == config.google_calendar else None

		if event_id:
			try:
				client.events().patch(
					calendarId=account.google_calendar_id, eventId=event_id, body=body, sendUpdates="all"
				).execute()
			except HttpError as e:
				if e.resp.status != 404:
					raise
				event_id = None

		if not event_id:
			event_id = _find_event_by_activity_tag(client, account, doc.name)

		if not event_id:
			event = (
				client.events()
				.insert(calendarId=account.google_calendar_id, body=body, sendUpdates="all")
				.execute()
			)
			event_id = event.get("id")
		elif event_id != doc.google_event_id:
			client.events().patch(
				calendarId=account.google_calendar_id, eventId=event_id, body=body, sendUpdates="all"
			).execute()

		frappe.db.set_value(
			"EU Activity",
			doc.name,
			{"google_event_id": event_id, "google_calendar": config.google_calendar},
			update_modified=False,
		)
		_clear_config_error(config.name)
	except Exception:
		_set_config_error(config.name, frappe.get_traceback())


def _find_event_by_activity_tag(client, account, activity_name):
	"""Guard against duplicate inserts when a patch-404 race means the event
	already exists (e.g. a concurrent push for the same activity)."""
	response = (
		client.events()
		.list(
			calendarId=account.google_calendar_id,
			privateExtendedProperty=[f"{EXT_PROP_KEY}={activity_name}"],
			showDeleted=False,
			maxResults=1,
		)
		.execute()
	)
	items = response.get("items") or []
	return items[0]["id"] if items else None


def delete_from_google(google_calendar, google_event_id):
	try:
		client, account = get_google_calendar_object(google_calendar)
		client.events().delete(
			calendarId=account.google_calendar_id, eventId=google_event_id, sendUpdates="all"
		).execute()
	except HttpError as e:
		if e.resp.status not in (404, 410):
			raise


def _event_body(doc):
	# start_time/end_time are optional: with them the event is a normal timed
	# appointment (reusing core's own timed/all-day formatter so Google gets the
	# exact same shape core's own Event<->Google Calendar sync produces); without
	# them it stays an all-day event like before.
	if doc.start_time:
		start_dt = datetime.combine(doc.due_date, get_time(doc.start_time))
		end_dt = datetime.combine(doc.due_date, get_time(doc.end_time)) if doc.end_time else None
		if not end_dt or end_dt <= start_dt:
			end_dt = start_dt + timedelta(hours=1)
		dates = format_date_according_to_google_calendar(False, start_dt, end_dt)
	else:
		start_dt = datetime.combine(doc.due_date, datetime.min.time())
		dates = format_date_according_to_google_calendar(True, start_dt, start_dt + timedelta(days=1))

	body = {
		"summary": doc.title,
		"description": strip_html(doc.description or ""),
		"extendedProperties": {"private": {EXT_PROP_KEY: doc.name}},
	}
	body.update(dates)

	attendees = [
		{"email": row.external_email}
		for row in doc.participants
		if row.invite_role == "Externo" and row.external_email
	]
	if attendees:
		body["attendees"] = attendees
	return body


def _clear_activity_sync_fields(activity_name):
	frappe.db.set_value(
		"EU Activity", activity_name, {"google_event_id": None, "google_calendar": None}, update_modified=False
	)


# ---------------------------------------------------------------------------
# Google -> EU Activity (pull), scheduled hourly + manual trigger
# ---------------------------------------------------------------------------


def sync_all():
	for config_name in frappe.get_all("Configuraciones EMatrix", filters={"sync_enabled": 1}, pluck="name"):
		try:
			pull_from_google(config_name)
		except Exception:
			_set_config_error(config_name, frappe.get_traceback())


@frappe.whitelist()
def trigger_sync(config=None):
	if not frappe.has_permission("Configuraciones EMatrix", "read"):
		frappe.throw(_("No autorizado"))

	if config:
		config_names = [config]
	else:
		config_names = frappe.get_all("Configuraciones EMatrix", filters={"sync_enabled": 1}, pluck="name")

	for config_name in config_names:
		cfg = frappe.get_doc("Configuraciones EMatrix", config_name)
		if cfg.user != frappe.session.user and "System Manager" not in frappe.get_roles():
			frappe.throw(_("No autorizado"))
		if not cfg.sync_enabled:
			continue

		pull_from_google(config_name)
		for activity_name in frappe.get_all(
			"EU Activity", filters={"responsible_user": cfg.user}, pluck="name"
		):
			push_activity(activity_name)

	return _("Sincronización completada")


def pull_from_google(config_name):
	config = frappe.get_doc("Configuraciones EMatrix", config_name)
	if not config.sync_enabled:
		return

	client, account = get_google_calendar_object(config.google_calendar)

	sync_token = config.get_password("next_sync_token", raise_exception=False) or None
	events, page_token = [], None

	while True:
		try:
			response = (
				client.events()
				.list(
					calendarId=account.google_calendar_id,
					maxResults=2000,
					pageToken=page_token,
					singleEvents=True,
					showDeleted=True,
					syncToken=sync_token,
				)
				.execute()
			)
		except HttpError as e:
			if e.resp.status == 410:
				set_encrypted_password("Configuraciones EMatrix", config.name, "", "next_sync_token")
				frappe.db.commit()
				return pull_from_google(config_name)
			raise

		events.extend(response.get("items", []))
		page_token = response.get("nextPageToken")
		if not page_token:
			if response.get("nextSyncToken"):
				frappe.db.set_value(
					"Configuraciones EMatrix",
					config.name,
					"next_sync_token",
					response.get("nextSyncToken"),
				)
			break

	for event in events:
		_apply_google_event(config, client, account, event)

	frappe.db.set_value("Configuraciones EMatrix", config.name, "last_synced_on", now_datetime(), update_modified=False)
	_clear_config_error(config.name)


def _apply_google_event(config, client, account, event):
	ext = (event.get("extendedProperties") or {}).get("private") or {}
	activity_name = ext.get(EXT_PROP_KEY)
	if activity_name and not frappe.db.exists("EU Activity", activity_name):
		activity_name = None

	if activity_name:
		# An event only reflects the activity's current state if it's still the one
		# we're actively tracking. A stale/duplicate event carrying the same tag (e.g.
		# one we've since deleted server-side) reports its deletion back through the
		# next incremental sync as status "cancelled" too — applying that blindly here
		# would wrongly cancel an activity whose real, still-live event is unrelated to
		# this particular event id. See feedback_google_sync_stale_event_guard memory.
		current_event_id = frappe.db.get_value("EU Activity", activity_name, "google_event_id")
		if event.get("id") != current_event_id:
			return

	if event.get("status") == "cancelled":
		if activity_name:
			frappe.db.set_value("EU Activity", activity_name, "status", "Cancelada", update_modified=False)
		return

	start = event.get("start") or {}
	due_date = start.get("date") or (start.get("dateTime") or "")[:10]
	if not due_date:
		return

	title = event.get("summary") or _("(Sin título)")
	description = event.get("description") or ""

	if activity_name:
		frappe.db.set_value(
			"EU Activity",
			activity_name,
			{"title": title, "due_date": due_date, "description": description},
			update_modified=False,
		)
		return

	if frappe.db.exists("EU Activity", {"google_event_id": event.get("id")}):
		return

	doc = frappe.new_doc("EU Activity")
	doc.title = title
	doc.description = description
	doc.due_date = due_date
	doc.owner = config.user
	doc.responsible_user = config.user
	doc.flags.skip_google_sync = True
	doc.insert(ignore_permissions=True)

	frappe.db.set_value(
		"EU Activity",
		doc.name,
		{"google_event_id": event.get("id"), "google_calendar": config.google_calendar},
		update_modified=False,
	)

	try:
		client.events().patch(
			calendarId=account.google_calendar_id,
			eventId=event.get("id"),
			body={"extendedProperties": {"private": {EXT_PROP_KEY: doc.name}}},
		).execute()
	except HttpError:
		pass


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _get_active_config(user):
	name = frappe.db.get_value("Configuraciones EMatrix", {"user": user, "sync_enabled": 1}, "name")
	return frappe.get_doc("Configuraciones EMatrix", name) if name else None


def _set_config_error(config_name, message):
	frappe.log_error(title="Eisenhower Matrix: error de sincronización con Google Calendar", message=message)
	frappe.db.set_value(
		"Configuraciones EMatrix", config_name, "last_sync_error", message[:140], update_modified=False
	)


def _clear_config_error(config_name):
	frappe.db.set_value("Configuraciones EMatrix", config_name, "last_sync_error", "", update_modified=False)
