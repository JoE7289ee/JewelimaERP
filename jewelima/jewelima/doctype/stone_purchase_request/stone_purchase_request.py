# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
#
# A request to KEEP part of an assorted lot — to buy it off the provider rather
# than send it back with the rejection.
#
# It changes nothing on its own. Only an approval takes the carats out of the
# tray, and only a manager can approve; until then the stones are still the
# provider's and still on the lot.

import frappe
from frappe.model.document import Document
from frappe.utils import flt


class StonePurchaseRequest(Document):
	def validate(self):
		rows = [r for r in (self.items or []) if r.sieve and flt(r.cts) > 0]
		if not rows:
			frappe.throw(frappe._("A request needs at least one sieve with carats against it."))
		seen = set()
		for r in rows:
			if r.sieve in seen:
				frappe.throw(frappe._("{0} is on the request twice.").format(r.sieve))
			seen.add(r.sieve)
		self.set("items", rows)
		self.total_cts = round(sum(flt(r.cts) for r in rows), 3)
