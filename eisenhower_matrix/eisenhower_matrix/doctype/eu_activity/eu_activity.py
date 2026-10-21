# Copyright (c) 2026, CHAPPSA and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import getdate
from frappe.model.document import Document

QUADRANT_BY_FLAGS = {
	(1, 1): "Hazlo Ya",
	(1, 0): "Planifícalo",
	(0, 1): "Delégalo",
	(0, 0): "Elimínalo",
}


class EUActivity(Document):
	def validate(self):
		if not self.responsible_user:
			self.responsible_user = self.owner or frappe.session.user

		self.quadrant = QUADRANT_BY_FLAGS[(int(bool(self.is_important)), int(bool(self.is_urgent)))]
		self.is_shared = 1 if self.participants else 0
		if self.start_date and self.due_date and getdate(self.start_date) > getdate(self.due_date):
			frappe.throw(_("La fecha de inicio no puede ser posterior a la fecha límite."))

	def effective_quadrant_for(self, user: str) -> str:
		"""Quadrant as seen by a specific participant, honoring their personal override."""
		for row in self.participants:
			if row.user == user and row.override_classification:
				return QUADRANT_BY_FLAGS[(int(bool(row.personal_important)), int(bool(row.personal_urgent)))]
		return self.quadrant
