import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def after_install():
	create_custom_fields(get_item_custom_fields(), ignore_validate=True)
	create_default_stone_types()
	create_raw_material_items()


def after_migrate():
	# Schema-ish setup re-synced on every migrate. Raw-material items are
	# seeded once at install only (see after_install), not here.
	create_custom_fields(get_item_custom_fields(), ignore_validate=True)
	create_default_stone_types()


def get_item_custom_fields():
	"""
	jewelima-specific fields added to the standard Item doctype. These flags
	decide which custom ledgers an item participates in (in addition to the
	native Stock Ledger, which always runs for stock items).
	"""
	return {
		"Item": [
			{
				"fieldname": "jewelima_section",
				"fieldtype": "Section Break",
				"label": "Jewelima",
				"insert_after": "stock_uom",
				"collapsible": 0,
			},
			{
				"fieldname": "keep_metal_ledger",
				"fieldtype": "Check",
				"label": "Keep Metal Ledger",
				"insert_after": "jewelima_section",
			},
			{
				"fieldname": "metal_purity",
				"fieldtype": "Select",
				"label": "Default Purity",
				"options": "\n24K\n22K\n18K\n14K",
				"insert_after": "keep_metal_ledger",
				"depends_on": "eval:doc.keep_metal_ledger",
			},
			{
				"fieldname": "jewelima_column_break",
				"fieldtype": "Column Break",
				"insert_after": "metal_purity",
			},
			{
				"fieldname": "keep_stone_ledger",
				"fieldtype": "Check",
				"label": "Keep Stone Ledger",
				"insert_after": "jewelima_column_break",
			},
			{
				"fieldname": "stone_type",
				"fieldtype": "Link",
				"label": "Stone Type",
				"options": "Stone Type",
				"insert_after": "keep_stone_ledger",
				"depends_on": "eval:doc.keep_stone_ledger",
			},
			{
				"fieldname": "stone_sieve",
				"fieldtype": "Link",
				"label": "Stone Sieve",
				"options": "Stone Sieve",
				"insert_after": "stone_type",
				"depends_on": "eval:doc.keep_stone_ledger",
			},
			{
				"fieldname": "stone_size",
				"fieldtype": "Data",
				"label": "Stone Size",
				"insert_after": "stone_sieve",
				"depends_on": "eval:doc.keep_stone_ledger",
			},
		]
	}


def create_default_stone_types():
	"""Seed the three base stone categories the business works with."""
	for stone_type in ["Diamond", "Precious Stone", "Color Stone"]:
		if not frappe.db.exists("Stone Type", stone_type):
			frappe.get_doc(
				{"doctype": "Stone Type", "stone_type_name": stone_type}
			).insert(ignore_permissions=True)
	frappe.db.commit()


# Gold colour codes used in raw-material item codes/names.
GOLD_COLOR_LABELS = {"YG": "Yellow Gold", "WG": "White Gold", "PG": "Pink Gold"}

# Standard gold raw materials seeded once on install.
# (karat, colour) -> item_code "RM-<karat>-<colour>", item_name "<karat>K<colour>"
RAW_MATERIALS = [
	("24", "YG"),
	("22", "YG"),
	("18", "YG"),
	("18", "WG"),
	("18", "PG"),
	("14", "YG"),
]


def create_raw_material_items():
	"""Seed the standard gold raw-material items. Idempotent: only creates
	an item if its item_code does not already exist."""
	for karat, color in RAW_MATERIALS:
		item_code = f"RM-{karat}-{color}"
		if frappe.db.exists("Item", item_code):
			continue
		frappe.get_doc(
			{
				"doctype": "Item",
				"item_code": item_code,
				"item_name": f"{karat}K{color}",
				"item_group": "Raw Material",
				"stock_uom": "Gram",
				"is_stock_item": 1,
				"is_sales_item": 0,
				"keep_metal_ledger": 1,
				"metal_purity": f"{karat}K",
				"description": f"{karat}K {GOLD_COLOR_LABELS.get(color, color)} raw gold",
			}
		).insert(ignore_permissions=True)
	frappe.db.commit()
