# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
#
# Finished Bucket — the box, tray or drawer a finished piece is filed in.
#
# Named "Finished Bucket" and not "Bucket" on purpose: this app already says
# "bucket" for the stone families (DMD / CZ / CVD / PS / SW / POTH) all through
# the stock and pricing code, and two meanings of one word in the same codebase
# is how somebody eventually prices a diamond against a drawer. The screens say
# "Bucket" — it is only the type that carries the longer name.

import frappe
from frappe.model.document import Document


class FinishedBucket(Document):
	def validate(self):
		self.bucket_name = " ".join((self.bucket_name or "").split()).upper()
		if not self.bucket_name:
			frappe.throw(frappe._("Give the bucket a name."))

	def on_trash(self):
		n = frappe.db.count("Order Bag", {"bucket": self.name})
		if n:
			frappe.throw(frappe._("{0} piece(s) are filed in {1} — empty it first, or set it inactive.")
				.format(n, self.name))
