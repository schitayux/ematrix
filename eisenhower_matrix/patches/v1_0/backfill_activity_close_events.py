# Copyright (c) 2026, CHAPPSA and contributors
# For license information, please see license.txt

import frappe


def execute():
	"""Backfill EU Activity Event rows for activities that were already Completada/
	Cancelada before that event log existed (see eisenhower_matrix.api.activity),
	so get_kpi_report() doesn't show a hard zero for every closure that predates it.

	There's no recorded timestamp for exactly when each one closed, so `modified`
	is used as the closest available signal — accurate for the common case, since
	a Completada/Cancelada activity is locked against further edits (see
	update_activity's was_locked gate), so nothing has touched it since.
	"""
	if not frappe.db.table_exists("EU Activity Event"):
		return

	for activity in frappe.get_all(
		"EU Activity",
		filters={"status": ["in", ["Completada", "Cancelada"]]},
		fields=["name", "status", "modified"],
	):
		if frappe.db.exists("EU Activity Event", {"activity": activity.name, "event_type": activity.status}):
			continue

		event = frappe.get_doc(
			{"doctype": "EU Activity Event", "activity": activity.name, "event_type": activity.status}
		)
		event.insert(ignore_permissions=True)
		frappe.db.set_value("EU Activity Event", event.name, "creation", activity.modified, update_modified=False)
