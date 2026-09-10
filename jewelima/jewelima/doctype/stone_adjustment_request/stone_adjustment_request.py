# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
#
# A STONE ADJUSTMENT is a physical count of the loose stone room set against
# what the warehouse thinks is there. The difference is not a movement anybody
# made — it is the gap between the books and the tray — so it is written off
# rather than issued, and a manager signs for it.

import frappe
from frappe.model.document import Document
from frappe.utils import flt


class StoneAdjustmentRequest(Document):
	def validate(self):
		# the difference is derived on every line and never typed: it is the one
		# figure the write-off is measured by
		short = over = 0.0
		rows = []
		for r in self.items or []:
			if not r.item:
				continue
			r.difference = round(flt(r.counted_qty) - flt(r.system_qty), 3)
			if r.counted_qty is None or flt(r.counted_qty) < 0:
				frappe.throw(frappe._("{0}: a counted weight cannot be negative.").format(r.item))
			if r.difference < 0:
				short += -r.difference
			else:
				over += r.difference
			rows.append(r)
		self.set("items", rows)
		self.total_short = round(short, 3)
		self.total_over = round(over, 3)
		if not self.status:
			self.status = "Pending"
