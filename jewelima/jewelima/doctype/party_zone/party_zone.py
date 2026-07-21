# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt

import re

import frappe
from frappe.model.document import Document


class PartyZone(Document):
	def validate(self):
		self.code = (self.code or "").strip().upper()
		if not re.fullmatch(r"[A-Z0-9]{1,3}", self.code):
			frappe.throw(frappe._("Code must be 1-3 uppercase letters/digits."))
