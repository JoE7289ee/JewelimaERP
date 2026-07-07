# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

# An Order Request is a saved wish-list for the Place Order page: anyone with the
# base role can file one; the Order User reviews it there (Requests -> Use), and
# placing the order stamps status=Placed + the Job Order back onto the request.


class OrderRequest(Document):
	def validate(self):
		rows = [r for r in (self.items or []) if r.design]
		if not rows:
			frappe.throw(_("Add at least one line with a Design."))
		for r in rows:
			if not r.qty or r.qty < 1:
				r.qty = 1

	def on_trash(self):
		if self.status == "Placed":
			frappe.throw(_("{0} was already placed as {1} — placed requests are history, not deletable.").format(
				self.name, self.job_order or _("an order")))
