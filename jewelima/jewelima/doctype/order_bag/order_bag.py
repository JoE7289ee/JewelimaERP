# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class OrderBag(Document):
	def validate(self):
		self.seed_bag_bom()
		self.guard_bom_locked()
		self.set_plan_weights()

	def set_plan_weights(self):
		"""Plan weights (gross/nett/purity/stones) are derived from the BOM x qty, so
		editing the BOM updates them automatically."""
		from jewelima.jewelima.api import _plan_values

		for k, v in _plan_values(self.bag_bom, self.qty).items():
			self.set(k, v)

	def seed_bag_bom(self):
		"""On creation, copy the linked design's BOM into this bag's editable BOM (the plan)."""
		if not self.is_new() or self.bag_bom or not self.design:
			return
		if not frappe.db.exists("Design", self.design):
			return
		design = frappe.get_doc("Design", self.design)
		for m in design.materials or []:
			self.append("bag_bom", {"item": m.item, "qty": m.qty, "weight": m.weight})

	def guard_bom_locked(self):
		"""Once the ornament is made, the BOM (plan) is frozen."""
		before = self.get_doc_before_save()
		if not before or not before.is_finished:
			return
		cur = [(r.item, r.qty, r.weight) for r in self.bag_bom]
		old = [(r.item, r.qty, r.weight) for r in before.bag_bom]
		if cur != old:
			frappe.throw(_("The BOM is locked — the ornament for {0} has already been made.").format(self.name))

	def autoname(self):
		"""Named <Job Order>.<line>.<n>  e.g. E0001.1.10

		<line> = this bag's position within the order (1, 2, 3 …).
		<n>     = the bag's quantity at creation. So a line of qty 10 -> E0001.1.10,
		          while ten single-qty lines -> E0001.1.1, E0001.2.1 … E0001.10.1.
		When a multi-qty bag is split into single pieces at Bag Extraction, each new
		piece is named <parent>-<piece_no> (parent stays as piece 1).
		"""
		if self.split_of:
			self.name = f"{self.split_of}-{int(self.piece_no or 0)}"
			return
		if self.job_order:
			prefix = f"{self.job_order}."
			existing = frappe.get_all("Order Bag", filters={"job_order": self.job_order}, pluck="name")
			maxline = 0
			for nm in existing:
				if not (nm or "").startswith(prefix):
					continue
				seg = nm[len(prefix):].split(".")[0]
				if seg.isdigit():
					maxline = max(maxline, int(seg))
			line = maxline + 1
			qty = int(self.qty or 1)
			self.name = f"{self.job_order}.{line}.{qty}"
		else:
			from frappe.model.naming import make_autoname
			self.name = make_autoname("OB-.#####")
