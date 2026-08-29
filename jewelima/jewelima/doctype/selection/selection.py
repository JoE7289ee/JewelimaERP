# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
#
# Selection — what a party picked from the photo catalog on a given day.
# Totals are derived from the picked photos, so the record always tells you
# HOW MANY images were selected and what they weigh — per karat, since a
# catalogue photo can carry an 18K, a 14K and a 9K weight.
#
# A line's `note` is the exception to all that: it is what the party asked for
# on that piece ("no round diamond", "create as pendant"), so it belongs to the
# pick and is never refreshed from the catalogue.

import frappe
from frappe.model.document import Document
from frappe.utils import cint, flt


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
				["code", "image", "gold_18k", "gold_14k", "gold_9k",
				 "dmd_no", "dmd_weight", "cs_no", "cs_weight"], as_dict=True)
			if p:
				r.code = p.code
				r.image = p.image
				for fld in ("gold_18k", "gold_14k", "gold_9k", "dmd_weight", "cs_weight"):
					setattr(r, fld, flt(p.get(fld)))
				for fld in ("dmd_no", "cs_no"):
					setattr(r, fld, cint(p.get(fld)))
		self.total_photos = len(self.items)
		# one total per karat — grams of 18K and grams of 9K are not the same
		# thing and adding them together would say nothing
		self.total_gold_18k = round(sum(flt(r.gold_18k) for r in self.items), 3)
		self.total_gold_14k = round(sum(flt(r.gold_14k) for r in self.items), 3)
		self.total_gold_9k = round(sum(flt(r.gold_9k) for r in self.items), 3)
		self.total_dmd_no = sum(cint(r.dmd_no) for r in self.items)
		self.total_dmd_weight = round(sum(flt(r.dmd_weight) for r in self.items), 3)
		self.total_cs_no = sum(cint(r.cs_no) for r in self.items)
		self.total_cs_weight = round(sum(flt(r.cs_weight) for r in self.items), 3)
