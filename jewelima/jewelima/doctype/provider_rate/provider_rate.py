# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
#
# One provider's quoted rates on one date. A new Active card supersedes that
# provider's previous Active one — the same rule Price Chart follows, so what a
# provider quoted last month is never edited away, only replaced.

import frappe
from frappe.model.document import Document


class ProviderRate(Document):
	def validate(self):
		if not self.rate_date:
			self.rate_date = frappe.utils.today()
		for r in self.diamond_rates:
			if frappe.utils.flt(r.to_ct) and frappe.utils.flt(r.from_ct) >= frappe.utils.flt(r.to_ct):
				frappe.throw(frappe._("Diamond row {0}: 'From' ({1}) must be below 'Below' ({2}).")
					.format(r.idx, r.from_ct, r.to_ct))

	def on_update(self):
		if self.status != "Active" or not self.supplier:
			return
		for nm in frappe.get_all("Provider Rate", filters={
			"name": ["!=", self.name], "status": "Active", "supplier": self.supplier,
		}, pluck="name"):
			frappe.db.set_value("Provider Rate", nm, "status", "Superseded")
