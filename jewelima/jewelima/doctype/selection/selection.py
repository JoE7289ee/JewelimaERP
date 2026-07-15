# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
#
# Selection — what a party picked from the photo catalog on a given day.
# Totals are derived from the picked photos, so the record always tells you
# HOW MANY images were selected and what they weigh.

import frappe
from frappe.model.document import Document
from frappe.utils import flt


class Selection(Document):
	def validate(self):
		if not self.selection_date:
			self.selection_date = frappe.utils.today()
		seen = set()
		for r in self.items:
			if r.photo in seen:
				frappe.throw(frappe._("{0} is picked twice.").format(r.photo))
			seen.add(r.photo)
			# keep the line's snapshot honest with the catalog
			p = frappe.db.get_value("Selection Photo", r.photo,
				["code", "image", "gold_gms", "cts", "batch"], as_dict=True)
			if p:
				r.code = p.code
				r.image = p.image
				r.gold_gms = flt(p.gold_gms)
				r.cts = flt(p.cts)
				if not self.batch:
					self.batch = p.batch
		self.total_photos = len(self.items)
		self.total_gold = round(sum(flt(r.gold_gms) for r in self.items), 3)
		self.total_cts = round(sum(flt(r.cts) for r in self.items), 3)
