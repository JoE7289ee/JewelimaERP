# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt

import re

import frappe
from frappe import _
from frappe.model.document import Document

# A Stone Party is the OWNER of customer-given stones. Its 3-letter code prefixes
# every stone item of that party (EDI -> EDI-VS1), so the code is immutable and
# the party can't be deleted once items hang off it.


class StoneParty(Document):
	def validate(self):
		self.code = (self.code or "").strip().upper()
		self.party_name = (self.party_name or "").strip().upper()
		if not re.fullmatch(r"[A-Z]{3}", self.code):
			frappe.throw(_("Party code must be exactly 3 letters (e.g. EDIMINIKAL → EDI)."))
		if not self.is_new() and self.has_value_changed("code"):
			frappe.throw(_("The party code can't change — every stone item is named by it."))

	def on_trash(self):
		items = frappe.get_all("Item", filters={"stone_party": self.name}, pluck="name", limit=5)
		if items:
			frappe.throw(
				_("Can't delete {0} — stone items exist under it ({1}…). Disable the items instead.").format(
					self.name, ", ".join(items[:3])
				)
			)
