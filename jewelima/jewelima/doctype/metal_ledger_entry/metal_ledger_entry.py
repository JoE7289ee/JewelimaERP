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


# ----------------------------------------------------------------------
# Voucher wiring — wired in hooks.py for Purchase Receipt & Purchase Invoice
# ----------------------------------------------------------------------
def voucher_updates_stock(doc):
	"""The metal ledger follows the stock ledger: post only when the document
	actually moves stock. This is the guard against double-posting when a
	Purchase Invoice is raised against a Purchase Receipt."""
	if doc.doctype == "Purchase Receipt":
		return True
	if doc.doctype == "Purchase Invoice":
		return bool(doc.get("update_stock"))
	return False


def make_metal_ledger_on_submit(doc, method=None):
	"""On submit of a purchase document, create an incoming Metal Ledger Entry
	for every line whose Item has Keep Metal Ledger enabled."""
	if not voucher_updates_stock(doc):
		return

	created = 0
	for row in doc.items or []:
		if not frappe.db.get_value("Item", row.item_code, "keep_metal_ledger"):
			continue
		if not row.stock_qty:
			continue
		create_incoming_entry(doc, row)
		created += 1

	if created:
		frappe.msgprint(
			_("{0} Metal Ledger Entry(s) created.").format(created),
			indicator="green",
			alert=True,
		)


def create_incoming_entry(voucher, row):
	item_purity, item_stock_uom = frappe.db.get_value(
		"Item", row.item_code, ["metal_purity", "stock_uom"]
	)
	if not item_purity:
		frappe.throw(
			_("Item {0} has 'Keep Metal Ledger' enabled but no Default Purity. "
			  "Set the purity on the Item.").format(row.item_code)
		)
	frappe.get_doc(
		{
			"doctype": "Metal Ledger Entry",
			"item": row.item_code,
			"purity": item_purity,
			"posting_date": voucher.posting_date,
			"posting_time": voucher.get("posting_time"),
			"weight_uom": row.get("stock_uom") or item_stock_uom,
			"in_weight": row.stock_qty,
			"voucher_type": voucher.doctype,
			"voucher_no": voucher.name,
		}
	).insert(ignore_permissions=True)


def cancel_metal_ledger_on_cancel(doc, method=None):
	"""On cancel, remove the entries this voucher created and recompute the
	running balance for every affected item + purity."""
	entries = frappe.get_all(
		"Metal Ledger Entry",
		filters={"voucher_type": doc.doctype, "voucher_no": doc.name},
		fields=["name", "item", "purity"],
	)
	affected = {(e.item, e.purity) for e in entries}
	for e in entries:
		frappe.delete_doc("Metal Ledger Entry", e.name, ignore_permissions=True, force=True)
	for item, purity in affected:
		recompute_balance(item, purity)


def recompute_balance(item, purity):
	rows = frappe.get_all(
		"Metal Ledger Entry",
		filters={"item": item, "purity": purity},
		fields=["name", "in_weight", "out_weight"],
		order_by="posting_date asc, posting_time asc, creation asc",
	)
	balance = 0
	for r in rows:
		balance += (r.in_weight or 0) - (r.out_weight or 0)
		frappe.db.set_value(
			"Metal Ledger Entry", r.name, "balance_weight", balance, update_modified=False
		)
