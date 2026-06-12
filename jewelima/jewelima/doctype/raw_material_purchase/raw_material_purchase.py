# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class RawMaterialPurchase(Document):
	def validate(self):
		self.set_company()
		self.set_default_warehouse()
		self.validate_warehouse()
		self.set_amounts()

	def set_default_warehouse(self):
		if not self.set_warehouse:
			from jewelima.setup import RAW_MATERIALS_STORE

			self.set_warehouse = frappe.db.get_value(
				"Warehouse", {"warehouse_name": RAW_MATERIALS_STORE, "company": self.company}, "name"
			)

	def validate_warehouse(self):
		if self.set_warehouse and frappe.db.get_value("Warehouse", self.set_warehouse, "is_group"):
			frappe.throw(
				_("Target Warehouse {0} is a group warehouse and cannot receive stock. "
				  "Pick a leaf warehouse (e.g. Stores).").format(self.set_warehouse)
			)

	def set_company(self):
		if not self.company:
			self.company = frappe.defaults.get_defaults().get("company") or frappe.db.get_single_value(
				"Global Defaults", "default_company"
			)

	def set_amounts(self):
		total = 0
		for row in self.items:
			row.amount = (row.qty or 0) * (row.rate or 0)
			total += row.amount
		self.total_amount = total

	def on_submit(self):
		self.create_purchase_receipt()

	def create_purchase_receipt(self):
		"""Create and submit a standard ERPNext Purchase Receipt — that posts the
		stock (and, via the doc_events hook, the Metal Ledger for gold items)."""
		if self.purchase_receipt:
			return
		if not self.items:
			frappe.throw(_("Add at least one raw material."))

		receipt = frappe.get_doc(
			{
				"doctype": "Purchase Receipt",
				"supplier": self.supplier,
				"company": self.company,
				"posting_date": self.posting_date,
				"set_warehouse": self.set_warehouse,
				"items": [
					{
						"item_code": row.item,
						"qty": row.qty,
						"rate": row.rate,
						"warehouse": self.set_warehouse,
					}
					for row in self.items
				],
			}
		)
		receipt.insert(ignore_permissions=True)
		receipt.submit()
		self.db_set("purchase_receipt", receipt.name)
		frappe.msgprint(
			_("Goods received — Purchase Receipt {0} created.").format(receipt.name),
			indicator="green",
			alert=True,
		)

	def on_cancel(self):
		"""Cancel the linked Purchase Receipt (reverses stock + Metal Ledger)."""
		if self.purchase_receipt and frappe.db.get_value(
			"Purchase Receipt", self.purchase_receipt, "docstatus"
		) == 1:
			frappe.get_doc("Purchase Receipt", self.purchase_receipt).cancel()
