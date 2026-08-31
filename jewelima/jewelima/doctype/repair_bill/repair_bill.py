# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
#
# Repair Bill — the batch weighed out and priced.
#
# The pieces are the ones taken in, so the bill carries their weight IN from the
# repair order and the weight OUT taken at the counter now. The difference is
# metal added: a piece that has been soldered comes back heavier, and that gold
# belongs on the bill.
#
# Work is priced per TYPE, not per piece: five solderings on a batch is one line
# at a rate, because that is how the rate is agreed.

import frappe
from frappe.model.document import Document
from frappe.utils import cint, flt


class RepairBill(Document):
	def validate(self):
		if not self.billed_at:
			self.billed_at = frappe.utils.now_datetime()
		if not self.billed_by:
			self.billed_by = frappe.session.user

		w_in = w_out = added = 0.0
		for r in self.items:
			if flt(r.weight_out) < 0:
				frappe.throw(frappe._("{0}: weight out cannot be negative.").format(r.repair or r.idx))
			# only a piece that has actually been weighed out has a difference
			r.metal_added = round(flt(r.weight_out) - flt(r.weight_in), 3) if flt(r.weight_out) else 0.0
			w_in += flt(r.weight_in)
			w_out += flt(r.weight_out)
			added += flt(r.metal_added)
		self.total_weight_in = round(w_in, 3)
		self.total_weight_out = round(w_out, 3)
		self.total_metal_added = round(added, 3)

		total = 0.0
		for c in self.charges:
			c.amount = round(cint(c.pieces) * flt(c.rate), 2)
			total += flt(c.amount)
		self.total_charges = round(total, 2)
