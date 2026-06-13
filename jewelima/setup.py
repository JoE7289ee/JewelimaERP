import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def after_install():
	create_custom_fields(get_item_custom_fields(), ignore_validate=True)
	create_default_stone_types()
	create_raw_material_items()
	create_manufacturing_warehouses()
	create_loss_collection_warehouses()
	create_store_warehouses()


def after_migrate():
	# All seeders are idempotent. Items + warehouses need a Company / item groups
	# that may not exist at install time on a fresh deploy, so re-run them here too.
	create_custom_fields(get_item_custom_fields(), ignore_validate=True)
	create_default_stone_types()
	create_raw_material_items()
	create_manufacturing_warehouses()
	create_loss_collection_warehouses()
	create_store_warehouses()


def after_setup_wizard(args=None):
	"""Fired by the `setup_wizard_complete` hook once the ERPNext setup wizard
	finishes — i.e. once a Company exists. On a fresh deploy, install/migrate run
	BEFORE the wizard, so the company-dependent seeding (warehouses) and item
	seeding are skipped; this re-runs everything (idempotent) with the company
	now present."""
	after_install()


@frappe.whitelist()
def run_initial_setup(
	company_name="Jewelima Diamonds",
	company_abbr="JD",
	country="India",
	currency="INR",
	timezone="Asia/Kolkata",
	language="English",
	chart_of_accounts="Standard",
	fy_start_date=None,
	fy_end_date=None,
):
	"""Complete the ERPNext setup wizard programmatically for a hands-off deploy.
	No-op if setup is already complete. setup_complete() also fires the
	setup_wizard_complete hook, which seeds all the Jewelima data. Call e.g.:
	  bench --site <site> execute jewelima.setup.run_initial_setup
	Defaults can be overridden via --kwargs."""
	if frappe.is_setup_complete():
		return "Setup already complete — nothing to do."

	from frappe.desk.page.setup_wizard.setup_wizard import setup_complete
	from frappe.utils import getdate, today

	if not fy_start_date:
		d = getdate(today())
		start_year = d.year if d.month >= 4 else d.year - 1  # India FY = Apr–Mar
		fy_start_date = f"{start_year}-04-01"
		fy_end_date = f"{start_year + 1}-03-31"

	setup_complete(
		{
			"language": language,
			"country": country,
			"timezone": timezone,
			"currency": currency,
			"full_name": "Administrator",
			"company_name": company_name,
			"company_abbr": company_abbr,
			"chart_of_accounts": chart_of_accounts,
			"fy_start_date": fy_start_date,
			"fy_end_date": fy_end_date,
			"bank_account": "Cash",
		}
	)
	frappe.db.commit()

	if frappe.is_setup_complete():
		return f"Setup completed for company '{company_name}'."
	return "setup_complete ran but System Settings still shows incomplete — check error log."


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
	an item if its item_code does not already exist. Skips gracefully if the
	required Item Group / UOM don't exist yet (i.e. ERPNext setup not done) —
	after_setup_wizard re-runs this once they're present."""
	if not frappe.db.exists("Item Group", "Raw Material") or not frappe.db.exists("UOM", "Gram"):
		return
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


# Manufacturing stage warehouses (one leaf warehouse per physical stage, under a
# "Manufacturing" group). CAD and CAM are design/digital stages — no warehouse.
MANUFACTURING_GROUP = "Manufacturing"
STAGE_WAREHOUSES = [
	"Tree Making",
	"Casting",
	"Grinding",
	"Filing",
	"Setting",
	"Pre Polish",
	"Wax Setting",
	"Final Polish",
	"Wax Cleaning",
	"Bag Extraction",
]


# Loss collection warehouses — where recoverable loss is credited, per stage.
LOSS_COLLECTION_GROUP = "Loss Collection"
LOSS_STAGES = [
	"Filing",
	"Final Polish",
	"Pre Polish",
	"Setting",
	"Grinding",
	"Casting",
]


def warehouse_context():
	"""(company, abbr, root_warehouse) or (None, None, None) if no company yet."""
	company = frappe.defaults.get_defaults().get("company") or frappe.db.get_single_value(
		"Global Defaults", "default_company"
	)
	if not company:
		return None, None, None
	abbr = frappe.db.get_value("Company", company, "abbr")
	root = frappe.db.get_value(
		"Warehouse", {"company": company, "is_group": 1, "parent_warehouse": ["in", ["", None]]}, "name"
	) or f"All Warehouses - {abbr}"
	return company, abbr, root


def create_manufacturing_warehouses():
	"""Seed the Manufacturing warehouse group and one leaf warehouse per stage.
	Idempotent and safe to call repeatedly."""
	company, abbr, root = warehouse_context()
	if not company:
		return
	group = make_warehouse(MANUFACTURING_GROUP, company, abbr, parent=root, is_group=1)
	for stage in STAGE_WAREHOUSES:
		make_warehouse(stage, company, abbr, parent=group, is_group=0)
	frappe.db.commit()


def create_loss_collection_warehouses():
	"""Seed the Loss Collection group + one '<Stage> -LOSS' leaf warehouse per
	stage that produces recoverable loss. Idempotent."""
	company, abbr, root = warehouse_context()
	if not company:
		return
	group = make_warehouse(LOSS_COLLECTION_GROUP, company, abbr, parent=root, is_group=1)
	for stage in LOSS_STAGES:
		make_warehouse(f"{stage} -LOSS", company, abbr, parent=group, is_group=0)
	frappe.db.commit()


# Stock-flow warehouses. Raw Materials Store = default landing for purchases
# (free stock). Reserved = gold committed to a Job Order once its Work Order is created.
RAW_MATERIALS_STORE = "Raw Materials Store"
RESERVED_WAREHOUSE = "Reserved"


def create_store_warehouses():
	"""Seed the Raw Materials Store and Reserved leaf warehouses. Idempotent."""
	company, abbr, root = warehouse_context()
	if not company:
		return
	make_warehouse(RAW_MATERIALS_STORE, company, abbr, parent=root, is_group=0)
	make_warehouse(RESERVED_WAREHOUSE, company, abbr, parent=root, is_group=0)
	frappe.db.commit()


def make_warehouse(warehouse_name, company, abbr, parent, is_group):
	name = f"{warehouse_name} - {abbr}"
	if frappe.db.exists("Warehouse", name):
		return name
	doc = frappe.get_doc(
		{
			"doctype": "Warehouse",
			"warehouse_name": warehouse_name,
			"company": company,
			"parent_warehouse": parent,
			"is_group": is_group,
		}
	).insert(ignore_permissions=True)
	return doc.name
