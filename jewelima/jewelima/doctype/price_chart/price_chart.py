# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
#
# One Price Chart per name + date: the AGREED rates (the digital twin of the
# rate-chart letters). The name is free text — usually the customer's name.
# A new Active chart supersedes the previous Active one with the SAME name —
# history is never edited, only superseded.

import frappe
from frappe.model.document import Document
from frappe.utils import flt


class PriceChart(Document):
	def validate(self):
		if not self.chart_date:
			self.chart_date = frappe.utils.today()
		for r in self.diamond_rates:
			if flt(r.to_ct) and flt(r.from_ct) >= flt(r.to_ct):
				frappe.throw(frappe._("Diamond bracket row {0}: 'From' ({1}) must be below 'Below' ({2}).").format(
					r.idx, r.from_ct, r.to_ct))
		for r in self.making_rules:
			if r.design_type and r.charge_category:
				frappe.throw(frappe._("Making rule row {0}: pick a Design Type OR a Charge Category, not both.").format(r.idx))

	def on_update(self):
		# one Active chart per name
		if self.status != "Active" or not self.chart_name:
			return
		for nm in frappe.get_all("Price Chart", filters={
			"name": ["!=", self.name], "status": "Active", "chart_name": self.chart_name,
		}, pluck="name"):
			frappe.db.set_value("Price Chart", nm, "status", "Superseded")


def get_active_chart(chart_name):
	"""The Active chart with this name (latest by date if several slipped through)."""
	rows = frappe.get_all("Price Chart", filters={"status": "Active", "chart_name": chart_name},
	                      order_by="chart_date desc", limit=1, pluck="name")
	return frappe.get_doc("Price Chart", rows[0]) if rows else None
