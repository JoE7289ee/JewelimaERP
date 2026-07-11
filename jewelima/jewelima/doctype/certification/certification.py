# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
#
# A Certification batch: finished pieces sent out to a lab (IGI) or the
# hallmarking centre. Created/received through the Certification desk page
# (jewelima.jewelima.api.send_certification / receive_certification) — those
# APIs move the stock and stamp HUID / certificate numbers onto the bags.

import frappe
from frappe.model.document import Document


class Certification(Document):
	def on_trash(self):
		# a batch with pieces still OUT can't just vanish — the stock and bag
		# statuses hang off it. Receive everything back first.
		if any(not r.received for r in self.items):
			frappe.throw(frappe._("{0} still has pieces out at certification — receive them back before deleting.").format(self.name))
