import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def after_install():
	create_custom_fields(get_item_custom_fields(), ignore_validate=True)
	create_default_stone_types()
	create_design_masters()
	create_order_types()
	create_default_supplier()
	create_manufacturing_warehouses()
	create_loss_collection_warehouses()
	create_store_warehouses()
	seed_raw_materials()


def after_migrate():
	# All seeders are idempotent. Items + warehouses need a Company / item groups
	# that may not exist at install time on a fresh deploy, so re-run them here too.
	create_custom_fields(get_item_custom_fields(), ignore_validate=True)
	create_default_stone_types()
	create_design_masters()
	create_order_types()
	create_default_supplier()
	create_manufacturing_warehouses()
	create_loss_collection_warehouses()
	create_store_warehouses()
	seed_raw_materials()


ORDER_TYPES = ["BULK", "CUSTOMER"]


def create_order_types():
	"""Seed the Job Order 'Type' dropdown values (Order Type master; extensible)."""
	for name in ORDER_TYPES:
		if not frappe.db.exists("Order Type", name):
			frappe.get_doc({"doctype": "Order Type", "order_type_name": name}).insert(ignore_permissions=True)
	frappe.db.commit()


def create_default_supplier():
	"""Default supplier used for in-house stock purchases. Skips on a fresh site
	where the Supplier Group tree doesn't exist yet (it's seeded by the ERPNext
	setup wizard); after_setup_wizard re-runs after_install once it's present."""
	if frappe.db.exists("Supplier", "JD Stock"):
		return
	sg = frappe.db.get_value("Supplier Group", {"is_group": 0}, "name")
	if not sg:
		return
	frappe.get_doc(
		{"doctype": "Supplier", "supplier_name": "JD Stock", "supplier_group": sg}
	).insert(ignore_permissions=True)
	frappe.db.commit()


def seed_raw_materials():
	"""Load the raw-material master items (gold + stones) that SHIP WITH the app,
	from the bundled spreadsheet jewelima/data/raw_material_report.xlsx.
	Idempotent. Skips if:
	  - the ERPNext item-group tree isn't ready yet (fresh install before the
	    setup wizard) — after_setup_wizard re-runs this once it is; or
	  - the items are already seeded (the GOLD group already has items).
	"""
	if not frappe.db.exists("Item Group", "All Item Groups"):
		return
	if frappe.db.count("Item", {"item_group": "GOLD"}):
		return
	try:
		from jewelima.jewelima.imports.import_raw_materials import run

		run()
	except FileNotFoundError:
		pass


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
				"fieldname": "metal_purity",
				"fieldtype": "Select",
				"label": "Default Purity",
				"options": "\n24K\n22K\n18K\n14K",
				"insert_after": "jewelima_section",
			},
			{
				"fieldname": "purity_percentage",
				"fieldtype": "Float",
				"label": "Purity %",
				"precision": "2",
				"insert_after": "metal_purity",
			},
			{
				"fieldname": "weight_unit",
				"fieldtype": "Select",
				"label": "Weight UOM",
				"options": "Gram\nCarat",
				"default": "Gram",
				"insert_after": "purity_percentage",
				"in_list_view": 1,
				"description": "Grams for metal, carats for stones (auto-set: an item with a Stone Type = Carat).",
			},
			{
				"fieldname": "jewelima_column_break",
				"fieldtype": "Column Break",
				"insert_after": "weight_unit",
			},
			{
				"fieldname": "stone_type",
				"fieldtype": "Link",
				"label": "Stone Type",
				"options": "Stone Type",
				"insert_after": "jewelima_column_break",
			},
			{
				"fieldname": "stone_size",
				"fieldtype": "Data",
				"label": "Stone Size",
				"insert_after": "stone_type",
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


# Seed values for the Design masters (extensible — users can add more).
DESIGN_TYPES = [
	"NOSEPIN", "STUD", "NECKLACE", "PENDANT", "CHAIN", "BACK CHAIN", "BIRTH NECK",
	"RING", "BRACELET", "BANGLE", "ANKLET", "PIPE BANGLE", "CHAIN BRACELET", "CHAIN NECKLACE",
]
DESIGN_STYLES = ["General", "Tickly"]


def create_design_masters():
	"""Seed Design Type / Design Style dropdown values used by the Design master."""
	for name in DESIGN_TYPES:
		if not frappe.db.exists("Design Type", name):
			frappe.get_doc({"doctype": "Design Type", "design_type_name": name}).insert(ignore_permissions=True)
	for name in DESIGN_STYLES:
		if not frappe.db.exists("Design Style", name):
			frappe.get_doc({"doctype": "Design Style", "design_style_name": name}).insert(ignore_permissions=True)
	frappe.db.commit()


# NOTE: gold raw-material items are no longer seeded here. They come from the
# client's master sheet via jewelima.jewelima.imports.import_raw_materials.run
# (group GOLD / ALLOY). Seeding placeholder RM-* items here caused duplicates.


# Manufacturing stage warehouses (one leaf warehouse per physical stage, under a
# "Manufacturing" group). CAD and CAM are design/digital stages — no warehouse.
MANUFACTURING_GROUP = "Manufacturing"
STAGE_WAREHOUSES = [
	"Wax Injecting",
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


# Stock-flow warehouses.
#  Raw Materials Store = default landing for purchases (free stock).
#  Gold Issue / Stone Issue = staging where committed material waits to be issued
#    to a job card from the Material Issue screen.
#  Reserved = legacy (kept for back-compat); the flow now reserves into Gold Issue.
RAW_MATERIALS_STORE = "Raw Materials Store"
RESERVED_WAREHOUSE = "Reserved"
GOLD_ISSUE_WAREHOUSE = "Gold Issue"
STONE_ISSUE_WAREHOUSE = "Stone Issue"
# Coarse value pool for materials currently inside Order Bags (per-bag detail
# lives in the Bag Material Ledger; this warehouse holds the aggregate value).
IN_PRODUCTION_WAREHOUSE = "In Production"


def create_store_warehouses():
	"""Seed the stock-flow leaf warehouses. Idempotent.
	Gold reserving is now informational (Material Reservation doctype) — no Gold
	Issue / Reserved warehouse. Gold issues from Raw Materials Store; stones from
	Stone Issue."""
	company, abbr, root = warehouse_context()
	if not company:
		return
	make_warehouse(RAW_MATERIALS_STORE, company, abbr, parent=root, is_group=0)
	make_warehouse(STONE_ISSUE_WAREHOUSE, company, abbr, parent=root, is_group=0)
	make_warehouse(IN_PRODUCTION_WAREHOUSE, company, abbr, parent=root, is_group=0)
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
