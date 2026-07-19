import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def after_install():
	set_default_timezone()
	relax_employee_mandatory()
	show_employee_names_in_links()
	create_custom_fields(get_item_custom_fields(), ignore_validate=True)
	create_custom_fields(get_warehouse_custom_fields(), ignore_validate=True)
	create_custom_fields(get_employee_custom_fields(), ignore_validate=True)
	create_default_stone_types()
	create_design_masters()
	create_order_types()
	create_charge_categories()
	create_igi_description_maps()
	create_default_supplier()
	create_jd_stock_customer()
	create_manufacturing_warehouses()
	create_loss_collection_warehouses()
	create_store_warehouses()
	flag_melt_warehouses()
	setup_item_group_tree()
	seed_raw_materials()
	seed_karat_golds()
	seed_salesmen()
	seed_standard_golds()
	sync_workspace_sidebar()
	setup_roles()
	seed_benches()
	# bench rosters ship in data/bench_employees.csv — restore them so a refresh
	# doesn't lose the team's allotments (never blocks install/migrate)
	try:
		from jewelima.jewelima.imports.import_bench_employees import run as import_bench_rosters

		import_bench_rosters()
	except Exception:
		pass


def after_migrate():
	# All seeders are idempotent. Items + warehouses need a Company / item groups
	# that may not exist at install time on a fresh deploy, so re-run them here too.
	set_default_timezone()
	relax_employee_mandatory()
	show_employee_names_in_links()
	create_custom_fields(get_item_custom_fields(), ignore_validate=True)
	create_custom_fields(get_warehouse_custom_fields(), ignore_validate=True)
	create_custom_fields(get_employee_custom_fields(), ignore_validate=True)
	create_default_stone_types()
	create_design_masters()
	create_order_types()
	create_charge_categories()
	create_igi_description_maps()
	create_default_supplier()
	create_jd_stock_customer()
	create_manufacturing_warehouses()
	create_loss_collection_warehouses()
	create_store_warehouses()
	flag_melt_warehouses()
	setup_item_group_tree()
	seed_raw_materials()
	seed_karat_golds()
	seed_salesmen()
	seed_standard_golds()
	sync_workspace_sidebar()
	setup_roles()
	seed_benches()
	# bench rosters ship in data/bench_employees.csv — restore them so a refresh
	# doesn't lose the team's allotments (never blocks install/migrate)
	try:
		from jewelima.jewelima.imports.import_bench_employees import run as import_bench_rosters

		import_bench_rosters()
	except Exception:
		pass


# ---------------------------------------------------------------------------
# Roles & permissions
# ---------------------------------------------------------------------------
# ERPNext masters a Jewelima user needs to READ (we don't own these doctypes).
JEWELIMA_READ_ERPNEXT = [
	"Customer", "Item", "Item Group", "Sales Person", "Warehouse",
	"BOM", "Employee", "UOM", "Company", "Bin", "Order Type",
]
# Masters the Ordering role must READ. Party / Salesman / Type feed the order
# header; Design Type + Design Style + Item (raw materials, incl. the karat golds)
# feed the New Design dialog — the order-taker CREATES designs from Place Order
# (create_design writes with ignore_permissions, so read is all the role needs).
JEWELIMA_ORDERING_READ = [
	"Customer", "Sales Person", "Order Type",
	"Design Type", "Design Style", "Item", "Item Group", "UOM",
]
# Order-flow doctypes the Ordering role fully manages.
JEWELIMA_ORDER_DOCTYPES = ["Job Order", "Order Bag", "Ordering", "Design", "Order Request"]
# Desk pages every Jewelima user can open (base role).
JEWELIMA_ORDER_PAGES = ["card-info", "job-order-status", "order-requests"]
# Desk pages ONLY the Ordering role opens — placing orders is restricted;
# the wider team files wishes on order-requests instead.
JEWELIMA_ORDERING_ONLY_PAGES = ["place-order"]
# The runner role: moves cards from one place to another and NOTHING else.
# One page; the transfer APIs write with ignore_permissions, and Transfer Rules
# can further restrict which from->to moves the role may make.
JEWELIMA_TRANSFER_PAGES = ["transfer-order-bag"]
JEWELIMA_TRANSFER_READ = ["Order Bag", "Order Bag Transfer"]


def setup_roles():
	"""Create the Jewelima roles + permissions. Idempotent (runs on after_migrate).

	Two standalone roles — the old base 'Jewelima' role is retired (scrubbed on
	every run so stragglers can't come back):

	  Jewelima Ordering — the order desk: the order pages (place-order, card-info,
	                      job-order-status, order-requests) + read-only on our
	                      doctypes and the ERPNext masters their pages paint from.
	                      Writes happen through page APIs (ignore_permissions).
	  Jewelima Transfer — the runner: ONE page (transfer-order-bag) + read on the
	                      bag and its movement history. Nothing else.
	"""
	from frappe.permissions import add_permission, update_permission_property

	for name in ("Jewelima Ordering", "Jewelima Transfer"):
		if not frappe.db.exists("Role", name):
			frappe.get_doc({"doctype": "Role", "role_name": name, "desk_access": 1}).insert(ignore_permissions=True)

	# the old base 'Jewelima' role is RETIRED — only Ordering and Transfer exist now.
	# Scrub every trace (users, pages, role profiles, doc perms), then the role itself.
	if frappe.db.exists("Role", "Jewelima"):
		frappe.db.delete("Has Role", {"role": "Jewelima"})
		frappe.db.delete("Custom DocPerm", {"role": "Jewelima"})
		frappe.delete_doc("Role", "Jewelima", force=True, ignore_permissions=True)

	def grant(doctype, role, ptypes):
		if not frappe.db.exists("DocType", doctype):
			return
		add_permission(doctype, role, 0)  # copies existing perms to Custom DocPerm, then adds the role
		for ptype, val in ptypes.items():
			update_permission_property(doctype, role, 0, ptype, val, validate=False)

	# Ordering inherits what the old base role used to carry: read-only on our
	# doctypes + the ERPNext masters (their pages need these to paint)
	our_doctypes = frappe.get_all("DocType", filters={"module": "Jewelima", "istable": 0}, pluck="name")
	for dt in our_doctypes + JEWELIMA_READ_ERPNEXT:
		grant(dt, "Jewelima Ordering", {"read": 1, "report": 1, "export": 1})

	# Jewelima Ordering — full control of the order flow
	base = {"read": 1, "write": 1, "create": 1, "delete": 1, "print": 1, "export": 1, "email": 1, "share": 1}
	for dt in JEWELIMA_ORDER_DOCTYPES:
		if not frappe.db.exists("DocType", dt):
			continue
		perms = dict(base)
		if frappe.get_meta(dt).is_submittable:
			perms.update({"submit": 1, "cancel": 1, "amend": 1})
		grant(dt, "Jewelima Ordering", perms)

	# Ordering must READ the order masters (Party / Salesman / Type) on its own
	for dt in JEWELIMA_ORDERING_READ:
		grant(dt, "Jewelima Ordering", {"read": 1, "report": 1})

	# ---- RECORDS ARE VIEW-ONLY ------------------------------------------------
	# Every Jewelima record is created/changed through our PAGES, whose APIs write
	# with ignore_permissions. In the desk the records are history only: no create,
	# edit, delete, submit or cancel for anyone. System Manager keeps full rights as
	# the admin escape hatch. (Runs AFTER the grants above so it wins.)
	MUTATING = ("write", "create", "delete", "submit", "cancel", "amend")
	for dt in our_doctypes:
		roles_on = {p.role for p in frappe.get_all(
			"Custom DocPerm", filters={"parent": dt}, fields=["role"])}
		for role in roles_on:
			if role == "System Manager":
				continue
			for ptype in MUTATING:
				update_permission_property(dt, role, 0, ptype, 0, validate=False)

	# shared pages -> both roles; place-order -> Ordering ONLY (base users file
	# requests on order-requests instead of placing orders)
	def set_page_roles(page, wanted, strip=()):
		if not frappe.db.exists("Page", page):
			return
		pg = frappe.get_doc("Page", page)
		changed = False
		if strip and any(r.role in strip for r in pg.roles):
			pg.set("roles", [r for r in pg.roles if r.role not in strip])
			changed = True
		have = {r.role for r in pg.roles}
		for role in wanted:
			if role not in have:
				pg.append("roles", {"role": role})
				changed = True
		if changed:
			pg.save(ignore_permissions=True)

	for page in JEWELIMA_ORDER_PAGES:
		set_page_roles(page, ("Jewelima Ordering",))
	for page in JEWELIMA_ORDERING_ONLY_PAGES:
		set_page_roles(page, ("Jewelima Ordering",),
		               strip=("Manufacturing Manager", "Manufacturing User"))

	# ---- Jewelima Transfer: the runner ------------------------------------------
	# Opens ONE page (Transfer Order Bag), reads the bag + its movement history so
	# the page paints, nothing else — read is the only right granted, so the
	# view-only sweep above needs no second pass. Writes happen through the page's
	# APIs (ignore_permissions); Transfer Rules can narrow WHICH from -> to moves
	# the role may make.
	for dt in JEWELIMA_TRANSFER_READ:
		grant(dt, "Jewelima Transfer", {"read": 1})
	for page in JEWELIMA_TRANSFER_PAGES:
		set_page_roles(page, ("Jewelima Transfer",))
	# tight: strip the role from any other page it may have picked up
	transfer_ok = set(JEWELIMA_TRANSFER_PAGES)
	for page in frappe.get_all("Has Role", filters={"parenttype": "Page", "role": "Jewelima Transfer"}, pluck="parent"):
		if page not in transfer_ok:
			pg = frappe.get_doc("Page", page)
			pg.set("roles", [r for r in pg.roles if r.role != "Jewelima Transfer"])
			pg.save(ignore_permissions=True)

	# Strip Jewelima Ordering from any page it shouldn't reach (e.g. import-stock was
	# authored with it). The Ordering role only opens the order-flow pages above.
	ordering_ok = set(JEWELIMA_ORDER_PAGES) | set(JEWELIMA_ORDERING_ONLY_PAGES) | {"all-requests"}
	for page in frappe.get_all("Has Role", filters={"parenttype": "Page", "role": "Jewelima Ordering"}, fields=["parent"], pluck="parent"):
		if page not in ordering_ok:
			pg = frappe.get_doc("Page", page)
			pg.set("roles", [r for r in pg.roles if r.role != "Jewelima Ordering"])
			pg.save(ignore_permissions=True)

	# Role Profile bundle for easy assignment (Ordering stands alone now)
	if not frappe.db.exists("Role Profile", "Jewelima Order Taker"):
		frappe.get_doc({
			"doctype": "Role Profile", "role_profile": "Jewelima Order Taker",
			"roles": [{"role": "Jewelima Ordering"}],
		}).insert(ignore_permissions=True)

	# Module Profile: hide every module except Jewelima from the desk (assigned to users by
	# import_users). Blocking modules hides the workspace cards/nav only — it does NOT remove
	# the doctype read perms the order flow relies on.
	blocked = [m for m in frappe.get_all("Module Def", pluck="name") if m != "Jewelima"]
	rows = [{"module": m} for m in blocked]
	if frappe.db.exists("Module Profile", "Jewelima Only"):
		mp = frappe.get_doc("Module Profile", "Jewelima Only")
		mp.set("block_modules", rows)
		mp.save(ignore_permissions=True)
	else:
		frappe.get_doc({
			"doctype": "Module Profile", "module_profile_name": "Jewelima Only", "block_modules": rows,
		}).insert(ignore_permissions=True)

	frappe.db.commit()


def seed_benches():
	"""One Bench master record per location (from benches.BENCH_DOCTYPE) so employees can be
	allotted to each bench. Idempotent."""
	from jewelima.jewelima.benches import BENCH_DOCTYPE

	for loc in BENCH_DOCTYPE:
		if not frappe.db.exists("Bench", loc):
			frappe.get_doc({"doctype": "Bench", "bench_name": loc}).insert(ignore_permissions=True)
	# keep the list view's Employees column truthful
	try:
		from jewelima.jewelima.doctype.bench.bench import refresh_all_rosters

		refresh_all_rosters()
	except Exception:
		pass
	frappe.db.commit()


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
	# The Item Group tree root only exists after the ERPNext setup wizard. On a fresh
	# install (before the wizard) skip; after_setup_wizard re-runs this once it's there.
	if not frappe.db.exists("Item Group", "All Item Groups"):
		return
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
				"doctype": "Item", "item_code": code, "item_name": code,
				"item_group": f"GOLD {karat}" if frappe.db.exists("Item Group", f"GOLD {karat}") else "GOLD",
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


def show_employee_names_in_links():
	"""Show the employee NAME (not the HR-EMP code) in Employee link fields — e.g. the Bench
	roster pills. Doctype-level Property Setter on Employee (title_field is already employee_name)."""
	if frappe.db.exists("Property Setter", {"doc_type": "Employee", "property": "show_title_field_in_link"}):
		return
	frappe.get_doc({
		"doctype": "Property Setter",
		"doctype_or_field": "DocType",
		"doc_type": "Employee",
		"property": "show_title_field_in_link",
		"property_type": "Check",
		"value": "1",
	}).insert(ignore_permissions=True)
	frappe.clear_cache(doctype="Employee")


ORDER_TYPES = ["BULK", "CUSTOMER", "Import"]


def create_order_types():
	"""Seed the Job Order 'Type' dropdown values (Order Type master; extensible)."""
	for name in ORDER_TYPES:
		if not frappe.db.exists("Order Type", name):
			frappe.get_doc({"doctype": "Order Type", "order_type_name": name}).insert(ignore_permissions=True)
	frappe.db.commit()


# Pricing categories from the real rate charts that aren't design types —
# tagged on odd Order Bags so the buyer's chart rule resolves itself at sale.
CHARGE_CATEGORIES = ["Back Chain", "Navaratna", "Plain Gold / CZ", "Name Ring"]

# Our design types -> IGI's exact "Jewelry Description" vocabulary (their bulk
# submission template). Extend via the IGI Description Map list as types grow.
IGI_DESCRIPTION_SEED = {
	"ANKLET": "Anklet",
	"BACK CHAIN": "Chain",
	"BANGLE": "Bangle",
	"BRACELET": "Bracelet",
	"CHAIN": "Chain",
	"CHAIN BRACELET": "Bracelet",
	"CHAIN NECKLACE": "Necklace",
	"NECKLACE": "Necklace",
	"NOSEPIN": "Nosepin",
	"PENDANT": "Pendant",
	"PIPE BANGLE": "Bangle",
	"RING": "Ring",
	"STUD": "Pair of Earrings",
}


def create_igi_description_maps():
	"""Seed the Design Type -> IGI wording map (only for types that exist)."""
	if not frappe.db.exists("DocType", "IGI Description Map"):
		return
	for dt, desc in IGI_DESCRIPTION_SEED.items():
		if frappe.db.exists("Design Type", dt) and not frappe.db.exists("IGI Description Map", dt):
			frappe.get_doc({"doctype": "IGI Description Map", "design_type": dt, "igi_description": desc}).insert(ignore_permissions=True)
	frappe.db.commit()


def create_charge_categories():
	"""Seed the Charge Category master (price-chart extras; extensible)."""
	if not frappe.db.exists("DocType", "Charge Category"):
		return
	for name in CHARGE_CATEGORIES:
		if not frappe.db.exists("Charge Category", name):
			frappe.get_doc({"doctype": "Charge Category", "category_name": name}).insert(ignore_permissions=True)
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


SALESMEN = ["BINOY", "LISON", "JOJU", "JISHNU"]


def seed_salesmen():
	"""Seed the shipped Sales Person records (the Place Order Salesman dropdown).
	Idempotent; skips until the Sales Team root exists (ERPNext setup wizard)."""
	root = frappe.db.get_value("Sales Person", {"is_group": 1, "parent_sales_person": ["in", ["", None]]}, "name")
	if not root:
		return
	for name in SALESMEN:
		if not frappe.db.exists("Sales Person", name):
			frappe.get_doc({
				"doctype": "Sales Person", "sales_person_name": name,
				"parent_sales_person": root, "is_group": 0, "enabled": 1,
			}).insert(ignore_permissions=True)
	frappe.db.commit()


ITEM_GROUP_TREE = {
	# MAIN TYPE -> TYPE -> GROUP (-> leaves). A GROUP with no finer split is itself the leaf.
	"RAW MATERIAL": {
		"METAL": {
			"GOLD": ["GOLD 22K", "GOLD 18K", "GOLD 14K", "GOLD STANDARD"],
			"ALLOY": [],
			# customer-given gold, created on demand from the Party Metal Add page.
			# Deliberately OUTSIDE the GOLD branch so material_group filters
			# (melt pickers, karat queries) never mix party gold with our own.
			"PARTY METAL": [],
		},
		"STONE": {
			# one leaf per registry quality — kept in lockstep with raw_materials.py
			# (the old xlsx importer used to create these; now the tree owns them)
			"DIAMOND": None,  # filled below from raw_materials.DIAMOND_QUALITIES
			"CVD": [],
			"PRECIOUS STONE": [],
			"COLOUR STONE": [],
			"SWAROVSKI": [],
			"CUBIC ZIRCONIA": [],
			# customer-given stones, created on demand from the Party Stock page
			"PARTY DIAMOND": [],
			"PARTY OTHER": [],
		},
	},
	"PRODUCT": {},  # one leaf per Design Type is added dynamically
}

from jewelima.jewelima.raw_materials import DIAMOND_QUALITIES  # noqa: E402

ITEM_GROUP_TREE["RAW MATERIAL"]["STONE"]["DIAMOND"] = [f"DIAMOND {q}" for q in DIAMOND_QUALITIES]


def setup_item_group_tree():
	"""Build the 4-level Item Group tree (MAIN TYPE -> TYPE -> GROUP -> leaf) and
	re-parent the existing flat groups into it. Idempotent. Items themselves are NOT
	mass-migrated (the raw-material import gets reviewed against the new tree) — except
	gold, whose items must move to the karat leaves so GOLD can become a parent node."""
	root = "All Item Groups"
	if not frappe.db.exists("Item Group", root):
		return  # fresh install before the setup wizard — after_setup_wizard re-runs this

	def ensure(name, parent, is_group):
		if frappe.db.exists("Item Group", name):
			cur = frappe.db.get_value("Item Group", name, ["parent_item_group", "is_group"], as_dict=True)
			if cur.parent_item_group != parent or int(cur.is_group) != int(is_group):
				doc = frappe.get_doc("Item Group", name)
				doc.parent_item_group = parent
				if int(cur.is_group) != int(is_group):
					if is_group and frappe.db.count("Item", {"item_group": name}):
						return  # can't become a parent while items sit on it
					doc.is_group = int(is_group)
				doc.save(ignore_permissions=True)
			return
		frappe.get_doc({
			"doctype": "Item Group", "item_group_name": name,
			"parent_item_group": parent, "is_group": int(is_group),
		}).insert(ignore_permissions=True)

	# gold first: move items to karat leaves so GOLD can turn into a group node
	if frappe.db.exists("Item Group", "GOLD") and frappe.db.count("Item", {"item_group": "GOLD"}):
		for leaf in ("GOLD 22K", "GOLD 18K", "GOLD 14K", "GOLD STANDARD"):
			ensure(leaf, root, 0)  # temporary parent; re-homed below
		for it in frappe.get_all("Item", filters={"item_group": "GOLD"}, fields=["name", "metal_purity"]):
			leaf = f"GOLD {it.metal_purity}" if it.metal_purity in ("22K", "18K", "14K") else "GOLD STANDARD"
			frappe.db.set_value("Item", it.name, "item_group", leaf)

	for main, types in ITEM_GROUP_TREE.items():
		ensure(main, root, 1)
		for typ, groups in types.items():
			ensure(typ, main, 1)
			for grp, leaves in groups.items():
				ensure(grp, typ, 1 if leaves else 0)
				for leaf in leaves:
					ensure(leaf, grp, 0)

	# re-parent the existing diamond quality groups under DIAMOND
	for g in frappe.get_all("Item Group", filters={"name": ["like", "DIAMOND %"], "is_group": 0}, pluck="name"):
		ensure(g, "DIAMOND", 0)
	# PRODUCT: one leaf per Design Type + the legacy Products leaf
	for dt in frappe.get_all("Design Type", pluck="name"):
		ensure(dt, "PRODUCT", 0)
	if frappe.db.exists("Item Group", "Products"):
		ensure("Products", "PRODUCT", 0)
	# CVD items count in their OWN bucket (they shipped as stone_type=Diamond)
	for nm in frappe.get_all("Item", filters={"item_group": "CVD", "stone_type": ["!=", "CVD"]}, pluck="name"):
		frappe.db.set_value("Item", nm, "stone_type", "CVD", update_modified=False)
	frappe.db.commit()
	# stamp the classification on every item (same walk the Item hook does on save)
	from jewelima.jewelima.api import classify_item

	for nm in frappe.get_all("Item", filters={"is_stock_item": 1}, pluck="name"):
		doc = frappe.get_doc("Item", nm)
		before = (doc.main_type, doc.material_type, doc.material_group)
		classify_item(doc)
		if (doc.main_type, doc.material_type, doc.material_group) != before:
			frappe.db.set_value("Item", nm, {
				"main_type": doc.main_type, "material_type": doc.material_type, "material_group": doc.material_group,
			}, update_modified=False)
	frappe.db.commit()


def seed_standard_golds():
	"""Standard Gold 990–999 (purity 99.0–99.9 %), and retire the legacy generic
	'Standard Gold' (0 %). Idempotent; mirrors the GOLD item shape. (999 used to ship
	from the retired xlsx import — the seeder owns the full run now.)"""
	if not frappe.db.exists("Item Group", "GOLD"):
		return
	std_leaf = "GOLD STANDARD" if frappe.db.exists("Item Group", "GOLD STANDARD") else "GOLD"
	for n in range(990, 1000):  # 990 … 999
		code = f"Standard Gold {n}"
		if frappe.db.exists("Item", code):
			continue
		frappe.get_doc({
			"doctype": "Item",
			"item_code": code,
			"item_name": code,
			"item_group": std_leaf,
			"stock_uom": "Gram",
			"is_stock_item": 1,
			"is_purchase_item": 1,
			"is_sales_item": 0,
			"include_item_in_manufacturing": 1,
			"weight_unit": "Gram",
			"purity_percentage": round(n / 10.0, 2),  # 990 -> 99.0 %
		}).insert(ignore_permissions=True)
	# retire the legacy generic "Standard Gold" (0 %): delete if unused, else disable
	if frappe.db.exists("Item", "Standard Gold"):
		try:
			frappe.delete_doc("Item", "Standard Gold", ignore_permissions=True)
		except Exception:
			frappe.db.set_value("Item", "Standard Gold", "disabled", 1)
	frappe.db.commit()


def seed_raw_materials():
	"""The BASE raw materials ship IN CODE (jewelima.jewelima.raw_materials) — no
	spreadsheet. Idempotent: only creates what's missing. (The old xlsx importer is
	retired; the registry is reviewed and extended category by category.)"""
	if not frappe.db.exists("Item Group", "All Item Groups"):
		return
	try:
		from jewelima.jewelima.raw_materials import seed

		seed()
	except Exception:
		pass  # never block install/migrate on material seeding


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


def get_employee_custom_fields():
	"""Login Details on the Employee form — the desk account behind the person
	(login name, last login, live sessions, reset). Painted by public/js/employee.js;
	System Manager only, and only once the Employee is linked to a User."""
	return {
		"Employee": [
			{
				"fieldname": "jw_login_section",
				"fieldtype": "Section Break",
				"label": "Login Details",
				"insert_after": "user_id",
				"collapsible": 0,
				"depends_on": "eval:!doc.__islocal",
			},
			{
				"fieldname": "jw_login_html",
				"fieldtype": "HTML",
				"label": "Login",
				"insert_after": "jw_login_section",
			},
		],
	}


def get_warehouse_custom_fields():
	"""is_melt_warehouse flag — gates which warehouses show in the Melting 'Gold Issue' picker."""
	return {
		"Warehouse": [
			{
				"fieldname": "is_melt_warehouse",
				"fieldtype": "Check",
				"label": "Is Melt Warehouse",
				"insert_after": "warehouse_name",
				"description": "Show this warehouse in the Melting screen's 'Gold Issue' picker.",
			},
		],
	}


def flag_melt_warehouses():
	"""Flag the default gold-issue warehouse(s) so the Melting picker isn't empty out of the box."""
	for wh_name in ("Raw Materials Store",):
		wh = frappe.db.get_value("Warehouse", {"warehouse_name": wh_name}, "name")
		if wh and not frappe.db.get_value("Warehouse", wh, "is_melt_warehouse"):
			frappe.db.set_value("Warehouse", wh, "is_melt_warehouse", 1)


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
			{
				"fieldname": "stone_party",
				"fieldtype": "Link",
				"label": "Stone Party",
				"options": "Stone Party",
				"insert_after": "stone_size",
				"read_only": 1,
				"in_standard_filter": 1,
				"description": "Owner of a customer-given stone (set by the Party Stock page; the item code carries the party's prefix).",
			},
			{
				"fieldname": "classification_section",
				"fieldtype": "Section Break",
				"label": "Classification (auto from the Item Group tree)",
				"insert_after": "stone_size",
				"collapsible": 1,
			},
			{
				"fieldname": "main_type",
				"fieldtype": "Data",
				"label": "Main Type",
				"insert_after": "classification_section",
				"read_only": 1,
				"in_standard_filter": 1,
				"description": "RAW MATERIAL / PRODUCT — derived from the item group's ancestors.",
			},
			{
				"fieldname": "material_type",
				"fieldtype": "Data",
				"label": "Type",
				"insert_after": "main_type",
				"read_only": 1,
				"in_standard_filter": 1,
				"description": "METAL / STONE (raw material) or the design type (product).",
			},
			{
				"fieldname": "material_group",
				"fieldtype": "Data",
				"label": "Group",
				"insert_after": "material_type",
				"read_only": 1,
				"in_standard_filter": 1,
				"description": "GOLD / DIAMOND / CVD / ALLOY / SWAROVSKI / …",
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
			{
				"fieldname": "custom_purity",
				"fieldtype": "Float",
				"label": "Purity %",
				"precision": "2",
				"insert_after": "custom_stone_count",
				"description": "Purity recorded at purchase (informational; pure content uses the item's purity).",
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
	"""Seed the six stone buckets. This is the ONLY place Stone Types come from —
	the controller blocks UI create/rename/delete (bucket maps + the Order Bag
	stone columns are keyed to these exact names)."""
	frappe.flags.allow_stone_type_edit = True
	try:
		for stone_type in ["Diamond", "Precious Stone", "Color Stone", "CVD", "Party Diamond", "Party Other"]:
			if not frappe.db.exists("Stone Type", stone_type):
				frappe.get_doc(
					{"doctype": "Stone Type", "stone_type_name": stone_type}
				).insert(ignore_permissions=True)
	finally:
		frappe.flags.allow_stone_type_edit = False
	frappe.db.commit()


# Seed values for the Design masters (extensible — users can add more).
DESIGN_TYPES = [
	"NOSEPIN", "STUD", "NECKLACE", "PENDANT", "CHAIN", "BACK CHAIN",
	"RING", "BRACELET", "BANGLE", "ANKLET", "PIPE BANGLE", "CHAIN BRACELET", "CHAIN NECKLACE",
]
# design types removed from the shipped set — deleted on migrate if nothing uses them
RETIRED_DESIGN_TYPES = ["BIRTH NECK"]
DESIGN_STYLES = ["General", "Tickly"]


def create_design_masters():
	"""Seed Design Type / Design Style dropdown values used by the Design master."""
	for name in DESIGN_TYPES:
		if not frappe.db.exists("Design Type", name):
			frappe.get_doc({"doctype": "Design Type", "design_type_name": name}).insert(ignore_permissions=True)
	for name in DESIGN_STYLES:
		if not frappe.db.exists("Design Style", name):
			frappe.get_doc({"doctype": "Design Style", "design_style_name": name}).insert(ignore_permissions=True)
	for name in RETIRED_DESIGN_TYPES:
		if frappe.db.exists("Design Type", name) and not frappe.db.exists("Design", {"design_type": name}):
			frappe.delete_doc("Design Type", name, ignore_permissions=True, force=True)
	frappe.db.commit()
	# type-linked sizes ship in data/design_types.csv (managed via Setup -> Design Types)
	try:
		from jewelima.jewelima.imports.import_design_types import run as import_design_type_sizes

		import_design_type_sizes()
	except Exception:
		pass  # sizes are additive — never block install/migrate on them


# NOTE: base raw materials (alloy, diamonds, CVD/SW/CZ, colour + precious stones)
# ship from the pure-code registry jewelima.jewelima.raw_materials — no spreadsheet.
# Karat golds and Standard Golds keep their dedicated seeders below.


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
