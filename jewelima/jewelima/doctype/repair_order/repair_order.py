# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
#
# Repair Order — one batch of pieces taken in from one party on one day.
# The batch carries the party, when it came and who took it; the rows are the
# pieces. Each row is stamped with its own repair number so a single piece can
# be talked about without the batch: REP-00001-3 is line 3 of that batch.

import frappe
from frappe.model.document import Document
from frappe.utils import cint


class RepairOrder(Document):
	def validate(self):
		if not self.items:
			frappe.throw(frappe._("Add at least one piece."))
		if not self.received_at:
			self.received_at = frappe.utils.now_datetime()
		if not self.received_by:
			self.received_by = frappe.session.user
		for r in self.items:
			if cint(r.qty) <= 0:
				frappe.throw(frappe._("Row {0}: quantity must be at least 1.").format(r.idx))
		self.total_rows = len(self.items)
		self.total_qty = sum(cint(r.qty) for r in self.items)

	def after_insert(self):
		self._stamp_rows()

	def on_update(self):
		# rows added on a later edit have no number yet, and renumbering keeps
		# the line number and the printed number saying the same thing
		self._stamp_rows()

	def _stamp_rows(self):
		for r in self.items:
			want = "{0}-{1}".format(self.name, r.idx)
			if r.repair != want:
				frappe.db.set_value("Repair Order Item", r.name, "repair", want,
					update_modified=False)
				r.repair = want
