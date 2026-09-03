# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
#
# A Hallmarking batch: finished pieces sent to a hallmarking centre and back
# with a HUID stamped on each one. Hallmarking used to ride the Certification
# doctype, but it is not a certification: there is no lab format, no colour or
# clarity to lock, nearly every piece goes, and the whole point of the trip is
# the six-character code that comes back. It has its own desk pages, its own
# centre master and its own HALL-0001 series.

import frappe
from frappe.model.document import Document


class HallmarkingBatch(Document):
	def autoname(self):
		from frappe.model.naming import make_autoname
		self.name = make_autoname("HALL-.####")

	def on_trash(self):
		# a batch with pieces still out cannot just vanish — the stock move and
		# the bags' statuses hang off it. Bring them back first.
		if self.status in ("Prepared", "Cancelled"):
			return
		if any(not r.received and not r.rejected for r in self.items):
			frappe.throw(frappe._("{0} still has pieces out at the centre — collect and confirm them first.").format(self.name))
