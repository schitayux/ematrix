# Copyright (c) 2026, CHAPPSA and contributors
# For license information, please see license.txt

import frappe


def execute():
	"""Some activities picked up reschedule_count increments during this feature's
	own rollout, before the Reprogramada event-recording hook in update_activity was
	actually live in the running process — those reschedules are real (the counter
	on the activity is correct) but left no EU Activity Event behind, so
	get_kpi_report()'s "Más reprogramadas" list and Reprogramadas count under-report
	them. Same backfill idea as backfill_activity_close_events: there's no way to
	recover each individual reschedule's original timestamp, so every event this
	patch adds for a given activity is stamped at that activity's `modified` — the
	closest available signal. Idempotent: only adds the deficit between
	reschedule_count and events that already exist, so re-running is a no-op.
	"""
	if not frappe.db.table_exists("EU Activity Event"):
		return

	for activity in frappe.get_all(
		"EU Activity", filters={"reschedule_count": [">", 0]}, fields=["name", "reschedule_count", "modified"]
	):
		existing = frappe.db.count(
			"EU Activity Event", {"activity": activity.name, "event_type": "Reprogramada"}
		)
		missing = activity.reschedule_count - existing
		for _ in range(missing):
			event = frappe.get_doc(
				{"doctype": "EU Activity Event", "activity": activity.name, "event_type": "Reprogramada"}
			)
			event.insert(ignore_permissions=True)
			frappe.db.set_value(
				"EU Activity Event", event.name, "creation", activity.modified, update_modified=False
			)
