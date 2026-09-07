# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class StoneChange(Document):
	def before_insert(self):
		if not self.opened_on:
			self.opened_on = frappe.utils.today()
