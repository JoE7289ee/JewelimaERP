# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class DesignBank(Document):
	def validate(self):
		if not self.company:
			self.company = frappe.defaults.get_defaults().get("company") or frappe.db.get_single_value(
				"Global Defaults", "default_company"
			)
		if not self.materials:
			frappe.throw(_("Add at least one material in BOM Details."))

	def on_update(self):
		if not self.item:
			self.provision_item_and_bom()
		else:
			self.sync_item()
			self.sync_bom()

	# ------------------------------------------------------------------
	def provision_item_and_bom(self):
		"""First save: create the ERPNext Item (Product, sellable, serial-tracked)
		and a BOM from the materials, then link both back."""
		item_code = self.design_code
		if not frappe.db.exists("Item", item_code):
			frappe.get_doc(
				{
					"doctype": "Item",
					"item_code": item_code,
					"item_name": self.design_name or item_code,
					"item_group": "Products",
					"stock_uom": "Nos",
					"is_stock_item": 1,
					"is_sales_item": 1,
					"has_serial_no": 1,
					"image": self.image,
				}
			).insert(ignore_permissions=True)
		self.db_set("item", item_code)
		self.db_set("bom", self.create_bom(item_code))
		frappe.msgprint(
			_("Item {0} and its BOM created.").format(item_code), indicator="green", alert=True
		)

	def create_bom(self, item_code):
		bom = frappe.get_doc(
			{
				"doctype": "BOM",
				"item": item_code,
				"quantity": 1,
				"company": self.company,
				"is_active": 1,
				"is_default": 1,
				"items": [{"item_code": m.item, "qty": m.qty} for m in self.materials],
			}
		)
		bom.insert(ignore_permissions=True)
		bom.submit()
		return bom.name

	def sync_item(self):
		"""Keep the linked Item's name/image in step with the design."""
		if not frappe.db.exists("Item", self.item):
			return
		frappe.db.set_value(
			"Item",
			self.item,
			{"item_name": self.design_name or self.design_code, "image": self.image},
			update_modified=False,
		)

	def sync_bom(self):
		"""If the materials changed, version the BOM: make a new active/default BOM,
		relink, and retire the old one (if it isn't in use)."""
		if self.bom_matches():
			return
		old_bom = self.bom
		new_bom = self.create_bom(self.item)
		self.db_set("bom", new_bom)
		if old_bom:
			try:
				doc = frappe.get_doc("BOM", old_bom)
				doc.is_default = 0
				if doc.docstatus == 1:
					doc.cancel()
			except Exception:
				pass  # old BOM is referenced somewhere — leave it
		frappe.msgprint(_("BOM updated (new version {0}).").format(new_bom), indicator="blue", alert=True)

	def bom_matches(self):
		"""True if the current BOM's items match the design's materials."""
		if not self.bom:
			return False
		existing = frappe.get_all("BOM Item", filters={"parent": self.bom}, fields=["item_code", "qty"])
		current = sorted((m.item, float(m.qty or 0)) for m in self.materials)
		old = sorted((e.item_code, float(e.qty or 0)) for e in existing)
		return current == old
