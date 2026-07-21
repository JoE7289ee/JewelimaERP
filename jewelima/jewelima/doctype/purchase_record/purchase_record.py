# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.model.naming import make_autoname
from frappe.utils import flt


class PurchaseRecord(Document):
	def autoname(self):
		# the voucher type's code IS the series: SIN -> SIN-0001, OGD -> OGD-0001
		code = frappe.db.get_value("Voucher Type", self.voucher_type, "code") or "PUR"
		self.name = make_autoname(code + "-.####")

	def validate(self):
		for r in self.items:
			r.amount = flt(r.weight) * flt(r.rate)
		self.total_amount = round(sum(flt(r.amount) for r in self.items), 2)
		if not self.recorded_by:
			self.recorded_by = frappe.session.user
