# Copyright (c) 2026, CHAPPSA and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class ConfiguracionesEMatrix(Document):
	def validate(self):
		calendar_user = frappe.db.get_value("Google Calendar", self.google_calendar, "user")
		if calendar_user and calendar_user != self.user:
			frappe.throw(
				_("El Calendario de Google {0} pertenece a {1}, no a {2}").format(
					self.google_calendar, calendar_user, self.user
				)
			)

	def on_update(self):
		if self.sync_enabled and self.has_value_changed("sync_enabled"):
			frappe.enqueue(
				"eisenhower_matrix.google_sync.trigger_sync",
				queue="short",
				enqueue_after_commit=True,
				config=self.name,
			)
