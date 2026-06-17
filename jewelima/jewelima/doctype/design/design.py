# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

STONE_BUCKET = {"Diamond": "dmd_no", "Precious Stone": "ps_no", "Color Stone": "cs_no"}

# Fields locked after creation (a design is immutable — you can only retire it).
PROTECTED = ["design_name", "design_type", "design_style", "image", "purity", "dmd_no", "ps_no", "cs_no"]


class Design(Document):
	def validate(self):
		if not self.materials:
			frappe.throw(_("Add at least one material in the Bill of Materials."))
		self.compute_stone_counts()
		if not self.is_new():
			self.block_edits()

	def compute_stone_counts(self):
		"""Derive DMD/PS/CS counts from the BOM's stone components (by stone_type)."""
		counts = {"dmd_no": 0, "ps_no": 0, "cs_no": 0}
		codes = list({m.item for m in self.materials if m.item})
		stype = {}
		if codes:
			for it in frappe.get_all("Item", filters={"name": ["in", codes]}, fields=["name", "stone_type"]):
				stype[it.name] = it.stone_type
		for m in self.materials:
			b = STONE_BUCKET.get(stype.get(m.item))
			if b:
				counts[b] += int(m.qty or 0)
		self.dmd_no, self.ps_no, self.cs_no = counts["dmd_no"], counts["ps_no"], counts["cs_no"]

	def block_edits(self):
		"""A design can't be changed after creation — only retired."""
		before = self.get_doc_before_save()
		if not before:
			return
		if before.status == "Retired":
			frappe.throw(_("A retired design is locked and cannot be edited."))
		for f in PROTECTED:
			if (self.get(f) or "") != (before.get(f) or ""):
				frappe.throw(_("A design cannot be edited after creation — you can only retire it."))
		cur = [(m.item, m.qty) for m in self.materials]
		old = [(m.item, m.qty) for m in before.materials]
		if cur != old:
			frappe.throw(_("The Bill of Materials cannot be changed after creation."))

	def after_insert(self):
		"""Provision the sellable Item (same code) + its BOM."""
		item_code = self.name
		if not frappe.db.exists("Item", item_code):
			frappe.get_doc(
				{
					"doctype": "Item",
					"item_code": item_code,
					"item_name": self.design_name,
					"item_group": "Products",
					"stock_uom": "Nos",
					"is_stock_item": 1,
					"is_sales_item": 1,
					"include_item_in_manufacturing": 0,
					"image": self.image,
				}
			).insert(ignore_permissions=True)
		bom = frappe.get_doc(
			{
				"doctype": "BOM",
				"item": item_code,
				"quantity": 1,
				"company": _company(),
				"is_active": 1,
				"is_default": 1,
				"items": [{"item_code": m.item, "qty": m.qty} for m in self.materials],
			}
		)
		bom.insert(ignore_permissions=True)
		bom.submit()
		self.db_set("item", item_code)
		self.db_set("bom", bom.name)

	@frappe.whitelist()
	def retire(self):
		if self.status == "Retired":
			return "already"
		used = frappe.db.count("Order Bag", {"design": self.name})
		if used:
			frappe.throw(
				_("Cannot retire — {0} Order Bag(s) are using this design. Retire is only allowed when nothing in manufacturing uses it.").format(used)
			)
		self.db_set("status", "Retired")
		return "retired"


def _company():
	return frappe.defaults.get_defaults().get("company") or frappe.db.get_single_value(
		"Global Defaults", "default_company"
	)
