# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class MetalLedgerEntry(Document):
	def validate(self):
		self.validate_weights()
		self.set_balance_weight()

	def validate_weights(self):
		"""An entry is either incoming or outgoing, not both, and not empty."""
		in_weight = self.in_weight or 0
		out_weight = self.out_weight or 0

		if in_weight < 0 or out_weight < 0:
			frappe.throw(_("In Weight and Out Weight cannot be negative."))

		if in_weight and out_weight:
			frappe.throw(_("An entry can have either In Weight or Out Weight, not both."))

		if not in_weight and not out_weight:
			frappe.throw(_("Please set either In Weight or Out Weight."))

	def set_balance_weight(self):
		"""Running balance for this item + purity = previous balance + in - out."""
		previous_balance = self.get_previous_balance()
		self.balance_weight = previous_balance + (self.in_weight or 0) - (self.out_weight or 0)

	def get_previous_balance(self):
		"""Latest balance for the same item + purity, excluding this document."""
		last_entry = frappe.get_all(
			"Metal Ledger Entry",
			filters={
				"item": self.item,
				"purity": self.purity,
				"name": ["!=", self.name or ""],
			},
			fields=["balance_weight"],
			order_by="posting_date desc, posting_time desc, creation desc",
			limit=1,
		)
		return last_entry[0].balance_weight if last_entry else 0
