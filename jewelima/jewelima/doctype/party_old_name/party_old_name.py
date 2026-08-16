# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class PartyOldName(Document):
	def validate(self):
		self.old_name = (self.old_name or "").strip()
		if not self.old_name:
			frappe.throw(frappe._("Old name is required."))
		# drop duplicate party rows
		seen, rows = set(), []
		for r in self.parties or []:
			if r.party and r.party not in seen:
				seen.add(r.party)
				rows.append(r)
		self.parties = rows
