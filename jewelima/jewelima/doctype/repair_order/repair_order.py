# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
#
# Repair Order — one batch of pieces taken in from one party on one day.
# The batch carries the party, when it came and who took it; the rows are the
# pieces. Each row is stamped with its own repair number so a single piece can
# be talked about without the batch: REP-00001-3 is line 3 of that batch.

import frappe
from frappe.model.document import Document
from frappe.utils import cint, flt


def _clean_work_types(value):
	"""The row's types of work, tidied and checked. Blank is allowed — plenty of
	pieces come in before anyone has decided what needs doing to them."""
	if isinstance(value, (list, tuple)):
		names = list(value)
	else:
		names = str(value or "").split(",")
	out = []
	for n in names:
		n = " ".join(str(n or "").split())
		if not n:
			continue
		real = frappe.db.get_value("Repair Work Type", {"work_name": n}, "name") \
			or frappe.db.get_value("Repair Work Type", n, "name")
		if not real:
			frappe.throw(frappe._("{0} is not a type of work.").format(n))
		if real not in out:
			out.append(real)
	return out


class RepairOrder(Document):
	def validate(self):
		if not self.items:
			frappe.throw(frappe._("Add at least one piece."))
		if not self.received_at:
			self.received_at = frappe.utils.now_datetime()
		if not self.received_by:
			self.received_by = frappe.session.user
		for r in self.items:
			if not r.design_type:
				frappe.throw(frappe._("Row {0}: pick a design type.").format(r.idx))
			if cint(r.qty) <= 0:
				frappe.throw(frappe._("Row {0}: quantity must be at least 1.").format(r.idx))
			if flt(r.weight) < 0:
				frappe.throw(frappe._("Row {0}: weight cannot be negative.").format(r.idx))
			# types of work are optional, but a name written here must be a real one
			r.work_types = ", ".join(_clean_work_types(r.work_types)) or None
			self._stamp_weighing(r)
		self.total_rows = len(self.items)
		self.total_qty = sum(cint(r.qty) for r in self.items)
		self.total_weight = round(sum(flt(r.weight) for r in self.items), 3)

	def _stamp_weighing(self, row):
		"""The scale time, kept honest: stamped when a weight first appears and
		again whenever it changes, left alone when it does not. A piece can come
		in unweighed, so no weight means no stamp."""
		now = flt(row.weight)
		if not now:
			row.weighed_at = None
			return
		before = frappe.db.get_value("Repair Order Item", row.name, "weight") if row.name else None
		if before is None or abs(flt(before) - now) > 0.0005 or not row.weighed_at:
			row.weighed_at = frappe.utils.now_datetime()

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
