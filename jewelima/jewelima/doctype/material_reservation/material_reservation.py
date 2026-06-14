# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class MaterialReservation(Document):
	def set_overall_status(self):
		statuses = [r.status for r in self.items]
		if statuses and all(s == "Delivered" for s in statuses):
			self.status = "Delivered"
		elif any(s == "Delivered" for s in statuses):
			self.status = "Partially Delivered"
		else:
			self.status = "Reserved"
