# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class OrderBag(Document):
	def validate(self):
		self.seed_bag_bom()
		self.seed_image()
		self.set_design_bank()
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

	def set_design_bank(self):
		"""The bag carries BOTH identities: the variant it manufactures (design)
		and the catalog card it sells under (design_bank — reports key on this)."""
		if self.design and frappe.db.exists("Design", self.design):
			self.design_bank = frappe.db.get_value("Design", self.design, "design_bank")

	def seed_image(self):
		"""On creation, hold the linked design's photo on the bag (referenced URL)."""
		if not self.is_new() or self.image or not self.design:
			return
		img = frappe.db.get_value("Design", self.design, "image")
		if img:
			self.image = img

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
		When a multi-qty bag is split at Bag Extraction, the pieces take
		<Job Order>.<line>.<piece> — e.g. E0197.3.5 (qty 5) splits into E0197.3.1 …
		E0197.3.4 (new) plus E0197.3.5 (the original, kept as the last piece).
		"""
		if self.split_of:
			base = (self.split_of or "").rsplit(".", 1)[0]  # E0197.3.5 -> E0197.3
			self.name = f"{base}.{int(self.piece_no or 0)}"
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
