# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class DesignBank(Document):
	def validate(self):
		# a card only counts as APPROVED once it's classified — the inborn filter
		# every sale/selection flow keys on
		if self.status == "Approved" and not self.design_type:
			frappe.throw(frappe._("Assign a Design Type before approving {0}.").format(self.design_no or self.name))
