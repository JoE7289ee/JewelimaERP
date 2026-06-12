# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class StoneLedgerEntry(Document):
	def validate(self):
		self.validate_quantities()
		self.set_balances()

	def validate_quantities(self):
		"""An entry is either incoming or outgoing, not both, and not empty."""
		incoming = (self.in_pcs or 0) or (self.in_cts or 0)
		outgoing = (self.out_pcs or 0) or (self.out_cts or 0)

		for qty in (self.in_pcs, self.out_pcs, self.in_cts, self.out_cts):
			if (qty or 0) < 0:
				frappe.throw(_("Pcs and CTS values cannot be negative."))

		if incoming and outgoing:
			frappe.throw(_("An entry can be either incoming or outgoing, not both."))

		if not incoming and not outgoing:
			frappe.throw(_("Please set an incoming or outgoing Pcs / CTS value."))

	def set_balances(self):
		"""Running balances for this item + stone_type + sieve + size."""
		prev_pcs, prev_cts = self.get_previous_balances()
		self.balance_pcs = prev_pcs + (self.in_pcs or 0) - (self.out_pcs or 0)
		self.balance_cts = prev_cts + (self.in_cts or 0) - (self.out_cts or 0)

	def get_previous_balances(self):
		"""Latest balances for the same item + stone_type + sieve + size, excluding this doc."""
		last_entry = frappe.get_all(
			"Stone Ledger Entry",
			filters={
				"item": self.item,
				"stone_type": self.stone_type,
				"sieve": self.sieve or "",
				"size": self.size or "",
				"name": ["!=", self.name or ""],
			},
			fields=["balance_pcs", "balance_cts"],
			order_by="posting_date desc, posting_time desc, creation desc",
			limit=1,
		)
		if last_entry:
			return (last_entry[0].balance_pcs or 0), (last_entry[0].balance_cts or 0)
		return 0, 0
