# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class OrderBag(Document):
	def autoname(self):
		"""Named <Job Order>.<line>.<n>  e.g. E0001.1.10

		<line> = this bag's position within the order (1, 2, 3 …).
		<n>     = the bag's quantity at creation. So a line of qty 10 -> E0001.1.10,
		          while ten single-qty lines -> E0001.1.1, E0001.2.1 … E0001.10.1.
		When a multi-qty bag is later split into single pieces, the units take
		<Job Order>.<line>.1 … <line>.<qty> (split logic TBD).
		"""
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
