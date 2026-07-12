# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
#
# One Price Chart per customer + date: the AGREED rates (the digital twin of the
# rate-chart letters). A new Active chart supersedes the customer's previous
# Active one — history is never edited, only superseded. Blank customer = the
# HOUSE chart, the fallback for buyers without one.

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
		# one Active chart per customer (including the blank house customer)
		if self.status != "Active":
			return
		for nm in frappe.get_all("Price Chart", filters={
			"name": ["!=", self.name], "status": "Active",
			"customer": self.customer or ["in", ["", None]],
		}, pluck="name"):
			frappe.db.set_value("Price Chart", nm, "status", "Superseded")


def get_active_chart(customer=None):
	"""The buyer's Active chart, falling back to the house chart (blank customer)."""
	def pick(cust):
		rows = frappe.get_all("Price Chart", filters={"status": "Active", "customer": cust or ["in", ["", None]]},
		                      order_by="chart_date desc", limit=1, pluck="name")
		return rows[0] if rows else None

	nm = pick(customer) if customer else None
	nm = nm or pick(None)
	return frappe.get_doc("Price Chart", nm) if nm else None
