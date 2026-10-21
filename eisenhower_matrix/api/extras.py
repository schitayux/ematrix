# Copyright (c) 2026, CHAPPSA and contributors
# For license information, please see license.txt

"""Proyectos, plantillas, preferencias de interfaz por usuario y resumen matutino."""

import json

import frappe
from frappe import _
from frappe.desk.doctype.notification_log.notification_log import enqueue_create_notification
from frappe.utils import getdate, today

UI_PREF_KEYS = ("em_saved_views", "em_list_prefs")
CLOSED_STATUSES = ("Completada", "Cancelada")


@frappe.whitelist()
def get_board_extras():
	projects = frappe.get_all(
		"EU Project", filters={"status": "Activo"}, fields=["name", "project_name", "color"], order_by="project_name asc"
	)
	templates = []
	if frappe.has_permission("EU Activity Template", "read"):
		templates = frappe.get_list(
			"EU Activity Template",
			fields=["name", "template_name", "title", "task_type", "project", "is_important", "is_urgent", "description"],
			order_by="template_name asc",
		)
	return {"projects": projects, "templates": templates, "prefs": get_ui_prefs()}


# ---------------------------------------------------------------- preferencias de UI
# Vistas guardadas, grupos colapsados, orden y columnas de la Lista: se guardan como
# defaults del usuario (tabla DefaultValue), así viajan entre dispositivos.
def get_ui_prefs():
	prefs = {}
	for key in UI_PREF_KEYS:
		raw = frappe.defaults.get_user_default(key)
		try:
			prefs[key] = json.loads(raw) if raw else None
		except ValueError:
			prefs[key] = None
	return prefs


@frappe.whitelist()
def set_ui_pref(key, value):
	if key not in UI_PREF_KEYS:
		frappe.throw(_("Preferencia no válida."))
	value = value if isinstance(value, str) else json.dumps(value)
	if len(value) > 60000:
		frappe.throw(_("La preferencia es demasiado grande."))
	frappe.defaults.set_user_default(key, value)
	return True


# ---------------------------------------------------------------- plantillas
@frappe.whitelist()
def save_as_template(activity, template_name):
	doc = frappe.get_doc("EU Activity", activity)
	doc.check_permission("read")
	template = frappe.get_doc(
		{
			"doctype": "EU Activity Template",
			"template_name": (template_name or doc.title).strip()[:140],
			"title": doc.title,
			"task_type": doc.task_type,
			"project": doc.project,
			"is_important": doc.is_important,
			"is_urgent": doc.is_urgent,
			"description": doc.description,
			"checklist": [{"item": r.item, "done": 0} for r in doc.checklist],
		}
	)
	template.insert()
	return template.name


# ---------------------------------------------------------------- resumen matutino
def send_daily_digest():
	"""Cron diario: avisa a cada usuario cuántas actividades tiene atrasadas y para hoy."""
	settings = frappe.get_cached_doc("EU Settings") if frappe.db.exists("DocType", "EU Settings") else None
	if settings and not settings.get("enable_notifications"):
		return

	day = getdate(today())
	rows = frappe.get_all(
		"EU Activity",
		filters={"status": ["not in", CLOSED_STATUSES], "due_date": ["<=", day]},
		fields=["name", "title", "due_date", "responsible_user", "owner"],
	)
	by_user = {}
	for row in rows:
		user = row.responsible_user or row.owner
		if not user or user in ("Administrator", "Guest"):
			continue
		bucket = by_user.setdefault(user, {"overdue": [], "today": []})
		bucket["today" if getdate(row.due_date) == day else "overdue"].append(row)

	for user, b in by_user.items():
		if not frappe.db.get_value("User", user, "enabled"):
			continue
		lines = [f"• {frappe.utils.escape_html(r.title)}" for r in (b["overdue"] + b["today"])[:15]]
		enqueue_create_notification(
			user,
			{
				"subject": _("Tu día: {0} para hoy, {1} atrasada(s)").format(len(b["today"]), len(b["overdue"])),
				"email_content": "<br>".join(lines) + "<br><br>" + _("Ábrelas en la Matriz de Eisenhower (vista Mi día)."),
				"type": "Alert",
				"document_type": "EU Activity",
				"document_name": (b["today"] or b["overdue"])[0].name,
			},
		)
