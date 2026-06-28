import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def after_install():
	set_default_timezone()
	relax_employee_mandatory()
	create_custom_fields(get_item_custom_fields(), ignore_validate=True)
	create_default_stone_types()
	create_design_masters()
	create_order_types()
	create_default_supplier()
	create_jd_stock_customer()
	create_manufacturing_warehouses()
	create_loss_collection_warehouses()
	create_store_warehouses()
	seed_raw_materials()
	seed_karat_golds()
	sync_workspace_sidebar()


def after_migrate():
	# All seeders are idempotent. Items + warehouses need a Company / item groups
	# that may not exist at install time on a fresh deploy, so re-run them here too.
	set_default_timezone()
	relax_employee_mandatory()
	create_custom_fields(get_item_custom_fields(), ignore_validate=True)
	create_default_stone_types()
	create_design_masters()
	create_order_types()
	create_default_supplier()
	create_jd_stock_customer()
	create_manufacturing_warehouses()
	create_loss_collection_warehouses()
	create_store_warehouses()
	seed_raw_materials()
	seed_karat_golds()
	sync_workspace_sidebar()


DEFAULT_TIME_ZONE = "Asia/Kolkata"


def set_default_timezone():
	"""Ship with India Standard Time (IST) as the default application timezone.
	Idempotent — only writes when System Settings differs, so it won't churn on every
	migrate. Frappe tracks its own app timezone independent of the server's OS clock."""
	if frappe.db.get_single_value("System Settings", "time_zone") != DEFAULT_TIME_ZONE:
		frappe.db.set_single_value("System Settings", "time_zone", DEFAULT_TIME_ZONE)


SIDEBAR_KEYS = ("child", "collapsible", "icon", "indent", "keep_closed", "label", "link_to", "link_type", "show_arrow", "type", "url")


def sync_workspace_sidebar():
	"""Push the bundled Workspace Sidebar (workspace_sidebar/jewelima.json) into the DB.
	A plain migrate does NOT overwrite an existing sidebar, so its items go stale (missing
	new pages, old icons). Re-syncing here on every migrate keeps the menu matching the
	shipped JSON. Idempotent."""
	import json
	import os

	path = frappe.get_app_path("jewelima", "workspace_sidebar", "jewelima.json")
	if not os.path.exists(path):
		return
	with open(path) as f:
		data = json.load(f)
	name = data.get("name") or "Jewelima"
	if frappe.db.exists("Workspace Sidebar", name):
		sb = frappe.get_doc("Workspace Sidebar", name)
		sb.set("items", [])
		for it in data.get("items", []):
			sb.append("items", {k: it.get(k) for k in SIDEBAR_KEYS})
		sb.save(ignore_permissions=True)
	else:
		frappe.get_doc(data).insert(ignore_permissions=True)


KARAT_GOLDS = {"14K": 58.3, "18K": 75.1, "22K": 91.7}
GOLD_COLORS = ["YG", "WG", "PG"]  # Yellow / White / Pink(Rose) gold


def seed_karat_golds():
	"""Ship the standard karat golds designs use: 14/18/22 K in YG/WG/PG (9 items).
	Idempotent — creates only the variants that are missing."""
	if not frappe.db.exists("Item Group", "GOLD"):
		frappe.get_doc({
			"doctype": "Item Group", "item_group_name": "GOLD",
			"parent_item_group": "All Item Groups", "is_group": 0,
		}).insert(ignore_permissions=True)
	for karat, purity in KARAT_GOLDS.items():
		for color in GOLD_COLORS:
			code = f"{karat}{color}"  # e.g. 22KYG
			if frappe.db.exists("Item", code):
				continue
			frappe.get_doc({
				"doctype": "Item", "item_code": code, "item_name": code, "item_group": "GOLD",
				"stock_uom": "Gram", "weight_unit": "Gram", "is_stock_item": 1,
				"is_purchase_item": 1, "is_sales_item": 0, "include_item_in_manufacturing": 1,
				"metal_purity": karat, "purity_percentage": purity,
			}).insert(ignore_permissions=True)


def relax_employee_mandatory():
	"""Workshops rarely track DOB / joining dates for karigars — make Employee's Date of
	Birth and Date of Joining optional (Property Setters, idempotent)."""
	from frappe.custom.doctype.property_setter.property_setter import make_property_setter

	for field in ("date_of_birth", "date_of_joining"):
		if not frappe.db.exists("Property Setter", {"doc_type": "Employee", "field_name": field, "property": "reqd"}):
			make_property_setter("Employee", field, "reqd", "0", "Check", validate_fields_for_doctype=False)


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


def create_jd_stock_customer():
	"""'JD Stock' Customer = the holder of own finished-goods stock (a piece with no
	real customer is 'held by' JD Stock). Skips until Customer Group / Territory exist
	(seeded by the ERPNext setup wizard)."""
	if frappe.db.exists("Customer", "JD Stock"):
		return
	cg = frappe.db.get_value("Customer Group", {"is_group": 0}, "name")
	terr = frappe.db.get_value("Territory", {"is_group": 0}, "name") or frappe.db.get_value("Territory", {}, "name")
	if not (cg and terr):
		return
	frappe.get_doc(
		{"doctype": "Customer", "customer_name": "JD Stock", "customer_group": cg, "territory": terr}
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
		],
		"Purchase Receipt Item": [
			{
				"fieldname": "custom_stone_count",
				"fieldtype": "Int",
				"label": "Stone Count (pcs)",
				"insert_after": "qty",
				"description": "Number of stones received (informational; stock is by carat).",
			},
		],
		"Warehouse": [
			{
				"fieldname": "custom_is_loss",
				"fieldtype": "Check",
				"label": "Loss Warehouse",
				"insert_after": "warehouse_name",
				"description": "Loss-collection bin — hidden from material/issue dropdowns.",
			},
			{
				"fieldname": "custom_is_purchase_location",
				"fieldtype": "Check",
				"label": "Purchase Location",
				"insert_after": "custom_is_loss",
				"description": "Gold/stone issue point that raw material is purchased into.",
			},
			{
				"fieldname": "custom_is_issue_location",
				"fieldtype": "Check",
				"label": "Issue Warehouse",
				"insert_after": "custom_is_purchase_location",
				"description": "Material is issued from here onto bags (e.g. Gold Issue, Stone Issue, Casting).",
			},
		],
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


# Manufacturing group: work-in-hand now lives in the single "In Bags" warehouse, so we
# no longer keep a warehouse per stage — only the Casting stage plus the Gold/Stone
# issue points (the purchase locations) live under this group.
MANUFACTURING_GROUP = "Manufacturing"


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
	"""Seed the Manufacturing group with the Casting stage plus the Gold/Stone issue
	points. Gold Issue + Stone Issue are flagged as purchase locations. Idempotent."""
	company, abbr, root = warehouse_context()
	if not company:
		return
	group = make_warehouse(MANUFACTURING_GROUP, company, abbr, parent=root, is_group=1)
	# Casting + the Gold/Stone issue points are all "issue" warehouses (material is issued
	# from them onto bags). Gold Issue + Stone Issue are also purchase locations.
	names = {}
	for wh in ("Casting", GOLD_ISSUE_WAREHOUSE, STONE_ISSUE_WAREHOUSE):
		names[wh] = make_warehouse(wh, company, abbr, parent=group, is_group=0)
		frappe.db.set_value("Warehouse", names[wh], "custom_is_issue_location", 1)
	for wh in (GOLD_ISSUE_WAREHOUSE, STONE_ISSUE_WAREHOUSE):
		frappe.db.set_value("Warehouse", names[wh], "custom_is_purchase_location", 1)
	frappe.db.commit()


def create_loss_collection_warehouses():
	"""Seed the Loss Collection group + one '<Stage> -LOSS' leaf warehouse per
	stage that produces recoverable loss. Each is flagged custom_is_loss so material
	dropdowns can hide it. Idempotent."""
	company, abbr, root = warehouse_context()
	if not company:
		return
	group = make_warehouse(LOSS_COLLECTION_GROUP, company, abbr, parent=root, is_group=1)
	for stage in LOSS_STAGES:
		name = make_warehouse(f"{stage} -LOSS", company, abbr, parent=group, is_group=0)
		frappe.db.set_value("Warehouse", name, "custom_is_loss", 1)
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
# Coarse value pool for materials currently inside Order Bags ("In Bags"). Per-bag
# detail lives in the Bag Material Ledger; this warehouse holds the aggregate gold.
# Gold lands here on add-weight; loss moves out of here to a '<bench> -LOSS' wh.
IN_PRODUCTION_WAREHOUSE = "In Bags"
# Finished pieces sent out for certification sit here (still own stock).
CERTIFICATION_WAREHOUSE = "At Certification"


def create_store_warehouses():
	"""Seed the stock-flow leaf warehouses. Idempotent.
	Gold reserving is now informational (Material Reservation doctype) — no Gold
	Issue / Reserved warehouse. Gold issues from Raw Materials Store; stones from
	Stone Issue."""
	company, abbr, root = warehouse_context()
	if not company:
		return
	make_warehouse(RAW_MATERIALS_STORE, company, abbr, parent=root, is_group=0)
	make_warehouse(IN_PRODUCTION_WAREHOUSE, company, abbr, parent=root, is_group=0)
	make_warehouse(CERTIFICATION_WAREHOUSE, company, abbr, parent=root, is_group=0)
	# The bench flow issues gold/loss as real stock moves; gold isn't always
	# pre-stocked in the Store, so allow negative stock (a negative balance just
	# flags unrecorded purchasing rather than blocking the floor).
	frappe.db.set_single_value("Stock Settings", "allow_negative_stock", 1)
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
