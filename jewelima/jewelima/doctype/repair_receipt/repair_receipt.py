# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class RepairReceipt(Document):
	"""An intake lot — repair pieces received from a party, tracked from the
	moment they land so nothing sits unbilled and forgotten."""

	def validate(self):
		self.piece_count = sum(int(i.qty or 0) for i in self.items)
