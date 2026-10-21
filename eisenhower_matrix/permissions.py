# Copyright (c) 2026, CHAPPSA and contributors
# For license information, please see license.txt

"""Privacidad de la Matriz de Eisenhower.

Una actividad solo la ve quien tiene relación con ella según las reglas de la propia
app: dueño, responsable o participante (DocShare creado al invitar o delegar). Ningún
rol, incluido System Manager o Eisenhower Manager, da acceso a las actividades de otros.
La única excepción es el usuario Administrator (Frappe lo exime de todos los controles).

Lo mismo aplica a lo que expone el contenido de una actividad: eventos de KPI,
comentarios, versiones (historial de cambios) y ToDos de delegación.

Los reportes y el calendario compartidos (EU Report Share) siguen funcionando, porque
se resuelven en el servidor con frappe.get_all tras validar el permiso de la app.
"""

import frappe

DT = "EU Activity"


def _esc(value):
	return frappe.db.escape(value)


def _allowed_names_sql(user):
	"""Subconsulta con los names de EU Activity que `user` puede ver."""
	u = _esc(user)
	return (
		f"(select `tabEU Activity`.name from `tabEU Activity` where `tabEU Activity`.owner = {u} "
		f"or `tabEU Activity`.responsible_user = {u} "
		f"or `tabEU Activity`.name in (select share_name from `tabDocShare` "
		f"where share_doctype = {_esc(DT)} and user = {u}))"
	)


def can_access_activity(name, user=None):
	user = user or frappe.session.user
	if user == "Administrator":
		return True
	if not name:
		return True
	row = frappe.db.get_value(DT, name, ["owner", "responsible_user"], as_dict=True)
	if not row:
		return True  # documento nuevo o inexistente: lo resuelven los permisos normales
	if user in (row.owner, row.responsible_user):
		return True
	return bool(frappe.db.exists("DocShare", {"share_doctype": DT, "share_name": name, "user": user}))


# ---------------------------------------------------------------- EU Activity
def activity_query_conditions(user=None, doctype=None):
	user = user or frappe.session.user
	if user == "Administrator":
		return ""
	u = _esc(user)
	return (
		f"(`tabEU Activity`.owner = {u} or `tabEU Activity`.responsible_user = {u} "
		f"or `tabEU Activity`.name in (select share_name from `tabDocShare` "
		f"where share_doctype = {_esc(DT)} and user = {u}))"
	)


def activity_has_permission(doc, ptype=None, user=None, debug=False):
	user = user or frappe.session.user
	if user == "Administrator" or doc.is_new():
		return True
	if user in (doc.owner, doc.get("responsible_user")):
		return True
	return bool(frappe.db.exists("DocShare", {"share_doctype": DT, "share_name": doc.name, "user": user}))


# ---------------------------------------------------------------- EU Activity Event
def event_query_conditions(user=None, doctype=None):
	user = user or frappe.session.user
	if user == "Administrator":
		return ""
	return f"(`tabEU Activity Event`.activity in {_allowed_names_sql(user)})"


def event_has_permission(doc, ptype=None, user=None, debug=False):
	return can_access_activity(doc.get("activity"), user)


# ---------------------------------------------------------------- EU Activity Template (personales)
def template_query_conditions(user=None, doctype=None):
	user = user or frappe.session.user
	if user == "Administrator":
		return ""
	return f"(`tabEU Activity Template`.owner = {_esc(user)})"


def template_has_permission(doc, ptype=None, user=None, debug=False):
	user = user or frappe.session.user
	return user == "Administrator" or doc.is_new() or doc.owner == user


# ---------------------------------------------------------------- Comment / Version / ToDo
# Solo restringen las filas que apuntan a EU Activity; el resto de documentos del
# sistema no cambia (estas condiciones se suman con AND a las del core).
def _ref_condition(table, dt_field, name_field, user):
	return (
		f"(ifnull(`tab{table}`.`{dt_field}`, '') != {_esc(DT)} "
		f"or `tab{table}`.`{name_field}` in {_allowed_names_sql(user)})"
	)


def comment_query_conditions(user=None, doctype=None):
	user = user or frappe.session.user
	return "" if user == "Administrator" else _ref_condition("Comment", "reference_doctype", "reference_name", user)


def comment_has_permission(doc, ptype=None, user=None, debug=False):
	if doc.get("reference_doctype") != DT:
		return True
	return can_access_activity(doc.get("reference_name"), user)


def version_query_conditions(user=None, doctype=None):
	user = user or frappe.session.user
	return "" if user == "Administrator" else _ref_condition("Version", "ref_doctype", "docname", user)


def version_has_permission(doc, ptype=None, user=None, debug=False):
	if doc.get("ref_doctype") != DT:
		return True
	return can_access_activity(doc.get("docname"), user)


def todo_query_conditions(user=None, doctype=None):
	user = user or frappe.session.user
	return "" if user == "Administrator" else _ref_condition("ToDo", "reference_type", "reference_name", user)


def todo_has_permission(doc, ptype=None, user=None, debug=False):
	if doc.get("reference_type") != DT:
		return True
	return can_access_activity(doc.get("reference_name"), user)
