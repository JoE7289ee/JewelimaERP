# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
#
# One Price Chart per name + date: the AGREED rates (the digital twin of the
# rate-chart letters). The name is free text — usually the customer's name.
# A new Active chart supersedes the previous Active one with the SAME name —
# history is never edited, only superseded.

import frappe
from frappe.model.document import Document
from frappe.utils import cint, flt


class PriceChart(Document):
	def validate(self):
		if not self.chart_date:
			self.chart_date = frappe.utils.today()
		for r in self.diamond_rates:
			if flt(r.to_ct) and flt(r.from_ct) >= flt(r.to_ct):
				frappe.throw(frappe._("Diamond bracket row {0}: 'From' ({1}) must be below 'Below' ({2}).").format(
					r.idx, r.from_ct, r.to_ct))
		self._check_cert_slabs()
		if flt(self.making_rate) and flt(self.making_min_grams) <= 0:
			self.making_min_grams = 1  # the "1 gram is the cost" floor

	def _check_cert_slabs(self):
		"""A certification's weight slabs must be a LADDER, not a pile.

		An open-ended row — no 'to' — means "and above", so nothing may start
		above it: leave DHC open from 0.22 and add another DHC row from 0.36 and
		a 0.4 ct stone sits in both, at two different prices, and which one it is
		charged at comes down to the order the rows happen to be in.

		Solitaire rows are their own ladder — a single-stone piece is priced off
		them — so the two are checked apart.
		"""
		groups = {}
		for r in self.certification_charges or []:
			if not flt(r.to_ct) and not flt(r.from_ct):
				continue                      # a flat row prices any weight; no ladder
			key = ((r.certification or "").strip().upper(), cint(r.solitaire))
			groups.setdefault(key, []).append(r)

		for (cert, sol), rows in groups.items():
			rows.sort(key=lambda r: (flt(r.from_ct), flt(r.to_ct) or 10 ** 6))
			label = cert + (" solitaire" if sol else "")
			for a, b in zip(rows, rows[1:]):
				# an open row swallows everything above its start
				if not flt(a.to_ct):
					frappe.throw(frappe._(
						"{0}: the row from {1} ct is open-ended, so it already prices everything "
						"above {1} ct — but another row starts at {2} ct. Close the first row or "
						"remove the second.").format(label, flt(a.from_ct), flt(b.from_ct)))
				if flt(a.to_ct) > flt(b.from_ct) + 0.000001:
					frappe.throw(frappe._(
						"{0}: {1} – {2} ct overlaps {3} – {4} ct. A stone in the overlap would have "
						"two prices.").format(label, flt(a.from_ct), flt(a.to_ct),
							flt(b.from_ct), flt(b.to_ct) or "∞"))
			# a flat row alongside a ladder is the same ambiguity by another route
			flat = [r for r in (self.certification_charges or [])
				if (r.certification or "").strip().upper() == cert and cint(r.solitaire) == sol
				and not flt(r.to_ct) and not flt(r.from_ct)]
			if flat:
				frappe.throw(frappe._(
					"{0} has both a flat row and weight slabs. Every weight would match the flat "
					"row as well as its slab.").format(label))

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
