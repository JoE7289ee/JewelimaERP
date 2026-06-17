# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class OrderBag(Document):
	def autoname(self):
		"""Numbered off the parent Job Order: E0001.01, E0001.02, …"""
		if self.job_order:
			existing = frappe.get_all("Order Bag", filters={"job_order": self.job_order}, pluck="name")
			maxn = 0
			for nm in existing:
				suf = (nm or "").rsplit(".", 1)[-1]
				if suf.isdigit():
					maxn = max(maxn, int(suf))
			self.name = f"{self.job_order}.{maxn + 1:02d}"
		else:
			from frappe.model.naming import make_autoname
			self.name = make_autoname("OB-.#####")
