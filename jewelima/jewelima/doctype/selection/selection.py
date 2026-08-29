# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
#
# Selection — what a party picked from the photo catalog on a given day.
# Totals are derived from the picked photos, so the record always tells you
# HOW MANY images were selected and what they weigh — per karat, since a
# catalogue photo can carry an 18K, a 14K and a 9K weight.

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
				["code", "image", "gold_18k", "gold_14k", "gold_9k", "cts"], as_dict=True)
			if p:
				r.code = p.code
				r.image = p.image
				r.gold_18k = flt(p.gold_18k)
				r.gold_14k = flt(p.gold_14k)
				r.gold_9k = flt(p.gold_9k)
				r.cts = flt(p.cts)
		self.total_photos = len(self.items)
		# one total per karat — grams of 18K and grams of 9K are not the same
		# thing and adding them together would say nothing
		self.total_gold_18k = round(sum(flt(r.gold_18k) for r in self.items), 3)
		self.total_gold_14k = round(sum(flt(r.gold_14k) for r in self.items), 3)
		self.total_gold_9k = round(sum(flt(r.gold_9k) for r in self.items), 3)
		self.total_cts = round(sum(flt(r.cts) for r in self.items), 3)
