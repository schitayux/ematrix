# Copyright (c) 2026, CHAPPSA and contributors
# For license information, please see license.txt

import frappe

ROLES = ["Eisenhower User", "Eisenhower Manager"]

STATUS_COLUMNS = [
	("Abierta", "Gray"),
	("En Progreso", "Orange"),
	("Completada", "Green"),
	("Cancelada", "Red"),
]


def after_install():
	create_roles()
	try:
		create_default_kanban_board()
	except Exception:
		frappe.log_error(title="Eisenhower Matrix: default Kanban Board setup failed")


def create_roles():
	for role in ROLES:
		if not frappe.db.exists("Role", role):
			frappe.get_doc({"doctype": "Role", "role_name": role, "desk_access": 1}).insert(
				ignore_permissions=True
			)


def create_default_kanban_board():
	if frappe.db.exists("Kanban Board", "EU Activity Board"):
		return

	board = frappe.new_doc("Kanban Board")
	board.kanban_board_name = "EU Activity Board"
	board.reference_doctype = "EU Activity"
	board.field_name = "status"
	board.private = 0
	for column_name, indicator in STATUS_COLUMNS:
		board.append("columns", {"column_name": column_name, "status": "Active", "indicator": indicator})
	board.insert(ignore_permissions=True)
