# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
#
# One handover: the pieces that physically went back to a party at one moment,
# who carried them out, and how. A batch is billed a handful at a time, so a
# dispatch is per PIECE and may span bills — the note is not "a bill went out",
# it is "these things left the building".

import frappe
from frappe.model.document import Document
from frappe.utils import cint, flt


class RepairDispatchNote(Document):
	def validate(self):
		if not self.items:
			frappe.throw(frappe._("Nothing to dispatch — add at least one piece."))
		if not self.dispatched_at:
			self.dispatched_at = frappe.utils.now_datetime()
		if not self.dispatched_by:
			self.dispatched_by = frappe.session.user
		self.total_pieces = sum(cint(r.qty) for r in self.items)
		self.total_weight = round(sum(flt(r.weight_out) for r in self.items), 3)
