import json

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
from frappe.utils import cint, flt


def after_install():
	set_default_timezone()
	relax_employee_mandatory()
	show_employee_names_in_links()
	create_custom_fields(get_item_custom_fields(), ignore_validate=True)
	create_custom_fields(get_warehouse_custom_fields(), ignore_validate=True)
	create_custom_fields(get_employee_custom_fields(), ignore_validate=True)
	create_custom_fields(get_customer_custom_fields(), ignore_validate=True)
	create_default_stone_types()
	create_design_masters()
	create_order_types()
	create_charge_categories()
	create_igi_description_maps()
	create_default_supplier()
	create_jd_stock_customer()
	seed_party_masters()
	seed_quality_map()
	seed_voucher_types()
	seed_certifications()
	seed_diversion_types()
	seed_design_type_bank_codes()
	create_manufacturing_warehouses()
	create_loss_collection_warehouses()
	create_store_warehouses()
	flag_melt_warehouses()
	flag_transfer_warehouses()
	drop_unused_warehouses()
	setup_item_group_tree()
	seed_raw_materials()
	seed_karat_golds()
	seed_findings()
	set_default_workspace()
	seed_salesmen()
	seed_standard_golds()
	retag_swarovski()
	sync_workspace_sidebar()
	check_sidebar_icons()
	ensure_home_block()
	drop_retired_pages()
	setup_roles()
	seed_benches()
	seed_bench_work_options()
	seed_sieve_chart()
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
	create_custom_fields(get_customer_custom_fields(), ignore_validate=True)
	create_default_stone_types()
	create_design_masters()
	create_order_types()
	create_charge_categories()
	create_igi_description_maps()
	create_default_supplier()
	create_jd_stock_customer()
	seed_party_masters()
	seed_quality_map()
	seed_voucher_types()
	seed_certifications()
	seed_diversion_types()
	seed_design_type_bank_codes()
	create_manufacturing_warehouses()
	create_loss_collection_warehouses()
	create_store_warehouses()
	flag_melt_warehouses()
	flag_transfer_warehouses()
	drop_unused_warehouses()
	setup_item_group_tree()
	seed_raw_materials()
	seed_karat_golds()
	seed_findings()
	set_default_workspace()
	seed_salesmen()
	seed_standard_golds()
	retag_swarovski()
	sync_workspace_sidebar()
	check_sidebar_icons()
	ensure_home_block()
	drop_retired_pages()
	setup_roles()
	seed_benches()
	seed_bench_work_options()
	seed_sieve_chart()
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
	# the CAD board names who is holding each card
	"Employee",
	"Design Type", "Design Style", "Item", "Item Group", "UOM",
	# New/Old Design workflow from Place Order needs to read the catalog
	"Design Bank",
]
# Order-flow doctypes the Ordering role fully manages.
JEWELIMA_ORDER_DOCTYPES = ["Job Order", "Order Bag", "Ordering", "Design", "Order Request"]
# Desk pages every Jewelima user can open (base role).
JEWELIMA_ORDER_PAGES = ["card-info", "design-info", "job-order-status", "due-view", "order-requests",
	"ws-ordering", "cancellation", "order-tracker", "following",
	# the CAD board, to see where a design has got to. Assigning a card is
	# System Manager / JW Manager only (assign_cad_card refuses anyone else),
	# so this is a view for the order desk.
	"cad-workstation",
	# the floor at a glance — view only; opening a station is still that
	# station's own page to allow
	"workstations"]

# every page in the E-SMITH menu — the ESMITH role gets exactly these
ESMITH_PAGES = ["sell-old", "old-format", "saved-imports", "party-gold", "party-groups", "bag-status", "view-pc"]
# Desk pages ONLY the Ordering role opens — placing orders is restricted;
# the wider team files wishes on order-requests instead.
JEWELIMA_ORDERING_ONLY_PAGES = ["place-order", "edit-order", "print-order-bags", "shop", "basket"]
# The runner role: moves cards from one place to another and NOTHING else.
# One page; the transfer APIs write with ignore_permissions, and Transfer Rules
# can further restrict which from->to moves the role may make.
JEWELIMA_TRANSFER_PAGES = ["transfer-order-bag"]
JEWELIMA_TRANSFER_READ = ["Order Bag", "Order Bag Transfer"]
# Two runner grades, both living on the SAME page — the Transfer Matrix (Setup >
# Transfer Matrix) decides which from -> to moves each may make. A role with no
# cells painted is unrestricted (dormant).
JEWELIMA_TRANSFER_ROLES = ("Jewelima Transfer", "Jewelima Transfer Plus")
# The stock buyer: books raw-material purchases and nothing else. One page;
# posting writes a submitted Purchase Receipt server-side (ignore_permissions),
# so read on the pickers is all the role needs.
JEWELIMA_PURCHASE_PAGES = ["purchase-raw-material", "purchase-history"]
JEWELIMA_PURCHASE_READ = ["Item", "Item Group", "Supplier", "Warehouse", "Bin", "UOM"]
# JW Stock — the stock desk: buy (purchase page + history), move stock
# between warehouses, melt gold. Purchase stays the tighter buy-only role.
JEWELIMA_STOCK_ROLE = "Jewelima Stock"
JEWELIMA_STOCK_PAGES = ["purchase-raw-material", "purchase-history", "stock-transfer", "melt-gold"]
JEWELIMA_STOCK_READ = JEWELIMA_PURCHASE_READ + ["Voucher Type", "Purchase Record", "Stone Type"]
# JW Stock Admin — the senior stock desk: everything Jewelima Stock does, plus
# the whole Loss branch (collection, write-off, report) and the record pages.
# Write-off is the one destructive button here; it still demands a typed reason.
JEWELIMA_STOCK_ADMIN_ROLE = "JW Stock Admin"
JEWELIMA_STOCK_ADMIN_PAGES = [
	"purchase-raw-material", "stock-transfer", "melt-gold",
	"loss-collection", "loss-writeoff", "loss-report", "employee-loss",
	"issue-findings", "recover-findings", "findings-stock", "findings-report", "add-findings",
	"findings-history",
	# Stock Reports — the whole sub-menu
	"finished-stock", "finished-goods", "at-certification", "in-bags", "location-stock",
	"stock-analysis",
	"total-gold",
	# Stock Setup — the shelves themselves
	"raw-materials", "warehouse-management",
	"purchase-history", "loss-history", "melt-history", "transfer-history", "stock-day",
	# gold on / off a card, and its trail
	"card-gold", "card-gold-history",
	# the old software's stock, brought in piece by piece
	"import-old-stock",
]
# CAD workstation persona: the CAD tool pages + read on what those pages paint.
JEWELIMA_CAD_PAGES = ["cad-workstation", "weight-checker", "cad-sheet", "stone-stock", "cad-jobs", "order-bag-photos"]
JEWELIMA_CAD_READ = ["Order Bag", "Design", "Design Type", "Design Style", "Item", "Item Group", "Customer", "Supplier", "Diamond Sieve", "Bin", "Warehouse", "File"]
# The stone issuer: ONE page (Stone Issue). A plain issuer is locked to issuing as
# themselves and only the buckets an admin allows on Setup > Issue > Issue Access
# (that page + the access doctype stay System-Manager-only). Writes go through the
# page APIs (ignore_permissions); read on the masters the page paints is all it needs.
JEWELIMA_STONE_ISSUE_ROLE = "Jewelima Stone Issue"
JEWELIMA_STONE_ISSUE_PAGES = ["stone-issue", "stone-return", "pre-bag"]
# Workstation personas — ONE role per bench: see + act on THAT workstation only
# (the global Assign/Collect and Job Work pages keep their own wider roles).
# ---- JW CAM: the CAM bench, and the moves that leave it ----------------------
# One bench and one runner's page. The CAM operator works their own station and
# passes finished work on, so they get ws-cam plus Transfer Order Bag — but the
# transfer page is deliberately narrow for them:
#
#   * the batch may only be picked up FROM CAM. Transfer Rules match on the from
#     as well as the to, so a bag scanned anywhere else has no matching rule and
#     is refused.
#   * it may only go to WAXING or CAD.
#   * "issue right after transfer" is out of reach: that path needs Jewelima
#     Transfer Plus, which this role does not have, so the strip never renders
#     and transfer_and_issue refuses it server-side even if it were called.
JEWELIMA_CAM_ROLE = "JW CAM"
JEWELIMA_CAM_PAGES = ["ws-cam", "transfer-order-bag"]
JEWELIMA_CAM_FROM = "CAM"
JEWELIMA_CAM_TO = ("WAXING", "CAD")

JEWELIMA_WS_PAGES = {
	"CAD": "ws-cad-ws", "CAM": "ws-cam", "WAXING": "ws-waxing",
	"WAX SETTING": "ws-wax-setting", "WAX CLEANING": "ws-wax-cleaning",
	"GRINDING": "ws-grinding", "FILING": "ws-filing", "SETTING": "ws-setting",
	"PRE POLISH": "ws-pre-polish", "FINAL POLISH": "ws-final-polish",
	"BAG EXTRACTION": "ws-bag-extraction",
}
# The floor's data desk: moves work through the benches and the casting line —
# assign/collect, issue/receipt, build trees, run the casting queue. Everything on
# those four pages, nothing else. The page APIs write under ignore_permissions, so
# read on what the pages paint from is all the role needs.
JEWELIMA_DATA_ADMIN_ROLE = "JW Data Admin"
JEWELIMA_DATA_ADMIN_PAGES = ["assign-collect", "job-work", "casting-queue", "make-tree",
	"print-order-bags", "transfer-order-bag", "casting-weigh", "rework", "edit-tree"]
JEWELIMA_DATA_ADMIN_READ = ["Order Bag", "Job Order", "Design", "Item", "Employee", "Bench",
	"Bench Employee", "Bench Work Option", "Bench Issue", "Bench Visit", "Priority Card",
	"Bag Material Ledger", "Wax Tree", "Wax Tree Card", "Tree Making", "Casting",
	"Warehouse", "Item Group", "Design Bank", "Customer", "Employee Metal Balance"]
JEWELIMA_WS_READ = ["Order Bag", "Job Order", "Design", "Item", "Employee",
	"Bench Work Option", "Priority Card", "Bag Material Ledger"]
JEWELIMA_STONE_ISSUE_READ = ["Order Bag", "Item", "Item Group", "Employee", "Bin", "Warehouse", "Material Issue", "Bag Material Ledger"]
# JW Stone Admin — the whole stone room: what is in stock, what the floor is
# asking for, bagging it, issuing it, taking it back, the sieve chart, and
# raising a repack. APPROVING a repack is deliberately NOT here — that stays
# with the managers, and its API refuses this role outright.
JEWELIMA_STONE_ADMIN_ROLE = "JW Stone Admin"
JEWELIMA_STONE_ADMIN_PAGES = [
	"stone-info", "stone-request", "pre-bag", "stone-issue", "stone-return",
	"stone-history", "stone-stock-info", "sieve-chart", "repack-stock",
]
JEWELIMA_STONE_ADMIN_READ = JEWELIMA_STONE_ISSUE_READ + [
	"Diamond Sieve", "Stone Type", "Repack Request", "Repack Request Item",
	"Pre Bag Record", "Design", "Job Order", "Customer",
]
# Design Bank personas. The base role works the catalog (browse, build cards,
# feed the photo-update queue); the approver role ADDITIONALLY reviews/approves
# (Review, Photo Approvals, the one-time Duplicates cleanup). Writes go through
# page APIs (ignore_permissions) — read on the masters is all the pages need.
JEWELIMA_DESIGN_BANK_ROLE = "Jewelima Design Bank"
JEWELIMA_DESIGN_APPROVER_ROLE = "Jewelima Design Approver"
JEWELIMA_DESIGN_BANK_PAGES = ["design-gallery", "search-design", "old-categories", "new-design-bank",
	"card-builder", "design-tags", "photo-update", "customer-photos", "design-bank-report", "photo-queue"]
JEWELIMA_DESIGN_APPROVER_PAGES = ["design-review", "photo-approvals", "design-duplicates", "retire-design", "retired-designs", "dw-reconcile"]
# Info: THE read-only persona (the old "Jewelima Design Viewer" merged in,
# 2026-08-08): card/job lookups + browse-and-filter on the catalog. Read
# grants only — and every mutating page API refuses the role server-side.
JEWELIMA_INFO_ROLE = "Jewelima Info"
JEWELIMA_INFO_GALLERY_PAGES = ["design-gallery", "search-design", "old-categories"]
JEWELIMA_INFO_LOOKUP_PAGES = ["card-info", "design-info", "job-order-status", "due-view"]
# every bench BOARD (read-only status boards) — Info sees them all, view-only
JEWELIMA_INFO_BENCH_PAGES = ["bench-info"]  # one page for every bench (the per-bench pages are retired)
# the shared file drop — Info uploads and downloads; delete stays uploader/admin
JEWELIMA_INFO_SHARE_PAGES = ["file-share", "finished-goods"]
JEWELIMA_INFO_PAGES = (JEWELIMA_INFO_LOOKUP_PAGES + JEWELIMA_INFO_GALLERY_PAGES
	+ JEWELIMA_INFO_BENCH_PAGES + JEWELIMA_INFO_SHARE_PAGES)
JEWELIMA_DESIGN_BANK_READ = ["Design Bank", "Design Tag", "Design Type", "Diversion Type",
	"Wax Dye", "Design", "File"]

# GRAPHICS — the photo desk: every photo bucket + KPI + approvals + rejection.
# Reads the bank; all photo mutations go through design_bank_api (role-gated).
JEWELIMA_GRAPHICS_ROLE = "Jewelima Graphics"
JEWELIMA_GRAPHICS_PAGES = ["photo-update", "photo-urgent", "photo-queue", "customer-photos",
	"customer-update", "photo-kpi", "photo-approvals", "rejection"]


# REPAIR — taking work in from a party. A batch is one arrival (REP-00001) and
# its rows are the pieces, each numbered under it (REP-00001-3). Party and Type
# of Work are open lists: typing a new one on the intake page adds it.
# One role runs it; everyone else sees nothing. Writes go through
# repair_api (role-gated + ignore_permissions), same as everywhere.
JEWELIMA_REPAIR_ROLE = "Jewelima Repair"
JEWELIMA_REPAIR_PAGES = ["new-repair-order", "repair-status", "repair-billing", "repair-masters"]
JEWELIMA_REPAIR_DOCTYPES = ["Repair Order", "Repair Order Item", "Repair Party",
	"Repair Work Type", "Repair Type", "Repair Bill", "Repair Bill Item", "Repair Bill Charge"]
# the sheet's polish IF-formula, as editable master rows
# Pages the app no longer ships — migrate does not remove deleted Page docs,
# so stale rows would keep serving a dead route on every site.
RETIRED_PAGES = ["design-transfer",
	# the repair module was rebuilt from scratch (2026-08-31) — these four and
	# their doctypes are gone from the app, so their Page docs must go too
	"repair-intake", "repair-desk", "repair-bills", "repair-setup",
	# the three master screens folded into one (repair-masters)
	"repair-parties", "repair-tow", "repair-types"]


def retag_swarovski():
	"""SW gets its OWN bucket (2026-07-31): retag the SW items from Color Stone
	to Swarovski, and move each unfinished bag's SW carats from the CS actual
	columns into the new SW ones (recomputed from the bag ledger — finished /
	sold pieces keep their history untouched)."""
	if not frappe.db.exists("Stone Type", "Swarovski"):
		return
	frappe.db.sql("""update tabItem set stone_type='Swarovski'
		where (item_group='SWAROVSKI' or name='SW' or name like 'SW %%')
		and ifnull(stone_type,'') != 'Swarovski'""")
	rows = frappe.db.sql("""
		select l.order_bag, sum(if(l.direction='In', l.qty, -l.qty)) ct,
			sum(if(l.direction='In', l.pcs, -l.pcs)) pcs
		from `tabBag Material Ledger` l
		join tabItem i on i.name = l.item and i.stone_type = 'Swarovski'
		join `tabOrder Bag` b on b.name = l.order_bag and b.is_finished = 0
		group by l.order_bag""", as_dict=True)
	for r in rows:
		if flt(r.ct) <= 0 and cint(r.pcs) <= 0:
			continue
		b = frappe.db.get_value("Order Bag", r.order_bag,
			["act_cs_weight", "act_cs_no", "act_sw_weight"], as_dict=True)
		if flt(b.act_sw_weight) > 0:
			continue  # already migrated
		frappe.db.set_value("Order Bag", r.order_bag, {
			"act_sw_weight": round(flt(r.ct), 3), "act_sw_no": cint(r.pcs),
			"act_cs_weight": round(max(flt(b.act_cs_weight) - flt(r.ct), 0), 3),
			"act_cs_no": max(cint(b.act_cs_no) - cint(r.pcs), 0),
		}, update_modified=False)
	frappe.db.commit()


def drop_retired_pages():
	for pg in RETIRED_PAGES:
		if frappe.db.exists("Page", pg):
			frappe.delete_doc("Page", pg, force=1, ignore_permissions=True)


def merge_design_viewer_into_info():
	"""One-time fold (2026-08-08): "Jewelima Design Viewer" becomes part of
	Jewelima Info. Holders keep their access through Info; the old role's
	page tags, perms and Quick Menu role layout all follow; then the role
	itself is deleted. No-op once the old role is gone."""
	old = "Jewelima Design Viewer"
	if not frappe.db.exists("Role", old):
		return
	for user in frappe.get_all("Has Role", filters={"parenttype": "User", "role": old}, pluck="parent"):
		if not frappe.db.exists("User", user):
			continue
		u = frappe.get_doc("User", user)
		u.set("roles", [r for r in u.roles if r.role != old])
		if not any(r.role == JEWELIMA_INFO_ROLE for r in u.roles):
			u.append("roles", {"role": JEWELIMA_INFO_ROLE})
		u.save(ignore_permissions=True)
	for pg in frappe.get_all("Has Role", filters={"parenttype": "Page", "role": old}, pluck="parent"):
		p = frappe.get_doc("Page", pg)
		p.set("roles", [r for r in p.roles if r.role != old])
		p.save(ignore_permissions=True)
	for qm in frappe.get_all("Quick Menu", filters={"for_role": old}, pluck="name"):
		if frappe.db.exists("Quick Menu", {"for_role": JEWELIMA_INFO_ROLE}):
			frappe.delete_doc("Quick Menu", qm, ignore_permissions=True, force=1)
		else:
			frappe.db.set_value("Quick Menu", qm, "for_role", JEWELIMA_INFO_ROLE)
	frappe.db.delete("Custom DocPerm", {"role": old})
	frappe.db.delete("Has Role", {"role": old})
	frappe.delete_doc("Role", old, ignore_permissions=True, force=1)


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

	def ensure_role(name):
		if name and not frappe.db.exists("Role", name):
			frappe.get_doc({"doctype": "Role", "role_name": name, "desk_access": 1}).insert(ignore_permissions=True)

	# EVERY role this app names has to exist before the first Page is saved
	# below: saving a Page validates ALL its role rows, not just the changed
	# one, so a role created later in this function aborts the whole install
	# (and takes seed_benches / the rosters down with it).
	for name in ("Jewelima Ordering", "Jewelima Purchase", "Jewelima CAD", JEWELIMA_STONE_ISSUE_ROLE,
			JEWELIMA_DESIGN_BANK_ROLE, JEWELIMA_DESIGN_APPROVER_ROLE, JEWELIMA_GRAPHICS_ROLE,
			JEWELIMA_INFO_ROLE, JEWELIMA_REPAIR_ROLE, JEWELIMA_STOCK_ROLE, "Jewelima Transfer Plus",
			"JW Party Admin", "JW Selection", JEWELIMA_DATA_ADMIN_ROLE, "JW Dye Admin",
			"JW Manager", "ESMITH", JEWELIMA_STOCK_ADMIN_ROLE,
			JEWELIMA_STONE_ADMIN_ROLE) + JEWELIMA_TRANSFER_ROLES:
		ensure_role(name)
	# belt and braces: the shipped page fixtures are the real source of truth for
	# which roles must exist — anything they name and we somehow missed is created
	# here rather than exploding on save.
	for role in set(frappe.get_all("Has Role", filters={"parenttype": "Page"}, distinct=True, pluck="role")):
		ensure_role(role)

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

	our_doctypes = frappe.get_all("DocType", filters={"module": "Jewelima", "istable": 0}, pluck="name")

	# Ordering reads ONLY the order flow + its masters — no blanket read on every
	# Jewelima doctype (certification / sales records are none of the order desk's
	# business). Anything granted beyond the allowed set is scrubbed on every run.
	_ordering_allowed = set(JEWELIMA_ORDER_DOCTYPES) | set(JEWELIMA_ORDERING_READ)
	for parent in frappe.get_all("Custom DocPerm",
			filters={"role": "Jewelima Ordering", "parent": ["not in", list(_ordering_allowed)]},
			pluck="parent", distinct=True):
		frappe.db.delete("Custom DocPerm", {"role": "Jewelima Ordering", "parent": parent})

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
	# Working doctypes a role is MEANT to edit (not order-flow history). CAD Sheet is
	# the CAD team's editable artifact — the sweep must not strip their write.
	EDITABLE = {"CAD Sheet Record"}
	for dt in our_doctypes:
		if dt in EDITABLE:
			continue
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

	# Jewelima Info — THE read-only persona: card/job lookups + catalog
	# browsing (the old Design Viewer, merged in). Reads only, everywhere.
	merge_design_viewer_into_info()
	for dt in ("Order Bag", "Job Order", "Design", "Item", "Employee") + tuple(JEWELIMA_DESIGN_BANK_READ):
		grant(dt, JEWELIMA_INFO_ROLE, {"read": 1})
	for page in JEWELIMA_ORDER_PAGES:
		roles = ("Jewelima Ordering", JEWELIMA_INFO_ROLE) if page in JEWELIMA_INFO_LOOKUP_PAGES else ("Jewelima Ordering",)
		set_page_roles(page, roles)
	# Info can open every bench BOARD (view-only; the one mutation, queue reason,
	# is blocked server-side + hidden for view-only users)
	for page in JEWELIMA_INFO_BENCH_PAGES:
		set_page_roles(page, (JEWELIMA_INFO_ROLE,))
	for page in JEWELIMA_INFO_SHARE_PAGES:
		set_page_roles(page, (JEWELIMA_INFO_ROLE,))
	for pg in frappe.get_all("Has Role", filters={"parenttype": "Page", "role": JEWELIMA_INFO_ROLE}, pluck="parent"):
		if pg not in set(JEWELIMA_INFO_PAGES):
			pgd = frappe.get_doc("Page", pg)
			pgd.set("roles", [r for r in pgd.roles if r.role != JEWELIMA_INFO_ROLE])
			pgd.save(ignore_permissions=True)
	for page in JEWELIMA_ORDERING_ONLY_PAGES:
		set_page_roles(page, ("Jewelima Ordering",),
		               strip=("Manufacturing Manager", "Manufacturing User"))

	# ---- ESMITH — the E-SMITH helper desk ------------------------------------
	# Everything in that menu: Sell Old, OLD FORMAT (+ saved sessions),
	# Party Gold / Party Groups, Bag Status. The pages price through the
	# charts (read) and persist sessions + the party lookup (full control).
	ensure_role("ESMITH")
	for dt in ("Old Format Import", "Party Group Map"):
		grant(dt, "ESMITH", {"read": 1, "write": 1, "create": 1, "delete": 1, "report": 1})
	grant("Price Chart", "ESMITH", {"read": 1, "report": 1})
	for page in ESMITH_PAGES:
		set_page_roles(page, ("ESMITH",))

	# ---- Jewelima Repair: the isolated repair module -----------------------------
	# Full control on its own doctypes, read on Warehouse (Phase 2 picker),
	# its four pages — and stripped from every other page it may grab.
	for dt in JEWELIMA_REPAIR_DOCTYPES:
		grant(dt, JEWELIMA_REPAIR_ROLE, {"read": 1, "write": 1, "create": 1, "delete": 1, "report": 1})
	grant("Design Type", JEWELIMA_REPAIR_ROLE, {"read": 1})   # the intake page picks from it
	# the old module reached into Warehouse and its own settings; the rebuilt one
	# does not, and dropping the grant from this file does not revoke a grant
	# already sitting in the database
	for _dt in ("Warehouse", "Repair Settings", "Repair Item Type", "Repair Receipt", "Repair Bill"):
		for _tbl in ("Custom DocPerm", "DocPerm"):
			for _n in frappe.get_all(_tbl, filters={"role": JEWELIMA_REPAIR_ROLE, "parent": _dt}, pluck="name"):
				frappe.delete_doc(_tbl, _n, force=True, ignore_permissions=True)
	for page in JEWELIMA_REPAIR_PAGES:
		set_page_roles(page, (JEWELIMA_REPAIR_ROLE,))
	for page in frappe.get_all("Has Role", filters={"parenttype": "Page", "role": JEWELIMA_REPAIR_ROLE}, pluck="parent"):
		if page not in set(JEWELIMA_REPAIR_PAGES):
			pg = frappe.get_doc("Page", page)
			pg.set("roles", [r for r in pg.roles if r.role != JEWELIMA_REPAIR_ROLE])
			pg.save(ignore_permissions=True)

	# ---- Jewelima Purchase: the stock buyer -------------------------------------
	# One page (Purchase Raw Material), read on the masters its pickers paint —
	# nothing else. Same tight sweep as the runner roles.
	for dt in JEWELIMA_PURCHASE_READ:
		grant(dt, "Jewelima Purchase", {"read": 1})
	for page in JEWELIMA_PURCHASE_PAGES:
		set_page_roles(page, ("Jewelima Purchase",))
	for page in frappe.get_all("Has Role", filters={"parenttype": "Page", "role": "Jewelima Purchase"}, pluck="parent"):
		if page not in set(JEWELIMA_PURCHASE_PAGES):
			pg = frappe.get_doc("Page", page)
			pg.set("roles", [r for r in pg.roles if r.role != "Jewelima Purchase"])
			pg.save(ignore_permissions=True)

	# ---- Jewelima Stock: the stock desk ------------------------------------------
	# Buy + history + warehouse transfer + melt. Reads only; every mutation
	# goes through the STOCK_ROLES-gated APIs.
	for dt in JEWELIMA_STOCK_READ:
		grant(dt, JEWELIMA_STOCK_ROLE, {"read": 1})
	for page in JEWELIMA_STOCK_PAGES:
		set_page_roles(page, (JEWELIMA_STOCK_ROLE,))
	for page in frappe.get_all("Has Role", filters={"parenttype": "Page", "role": JEWELIMA_STOCK_ROLE}, pluck="parent"):
		if page not in set(JEWELIMA_STOCK_PAGES):
			pg = frappe.get_doc("Page", page)
			pg.set("roles", [r for r in pg.roles if r.role != JEWELIMA_STOCK_ROLE])
			pg.save(ignore_permissions=True)

	# ---- JW Stock Admin: the senior stock desk -----------------------------------
	# The stock pages plus the entire Loss branch and the record pages. Reads on
	# the same masters; every mutation goes through the role-gated APIs (the
	# write-off still refuses without a typed reason).
	for dt in JEWELIMA_STOCK_READ:
		grant(dt, JEWELIMA_STOCK_ADMIN_ROLE, {"read": 1})
	for page in JEWELIMA_STOCK_ADMIN_PAGES:
		set_page_roles(page, (JEWELIMA_STOCK_ADMIN_ROLE,))
	for page in frappe.get_all("Has Role", filters={"parenttype": "Page", "role": JEWELIMA_STOCK_ADMIN_ROLE}, pluck="parent"):
		if page not in set(JEWELIMA_STOCK_ADMIN_PAGES):
			pg = frappe.get_doc("Page", page)
			pg.set("roles", [r for r in pg.roles if r.role != JEWELIMA_STOCK_ADMIN_ROLE])
			pg.save(ignore_permissions=True)

	# ---- JW Stone Admin: the stone room ------------------------------------------
	# Every stone page except the repack APPROVAL — raising a repack is theirs,
	# approving one is not (approve_repack / reject_repack refuse this role).
	for dt in JEWELIMA_STONE_ADMIN_READ:
		grant(dt, JEWELIMA_STONE_ADMIN_ROLE, {"read": 1})
	for page in JEWELIMA_STONE_ADMIN_PAGES:
		set_page_roles(page, (JEWELIMA_STONE_ADMIN_ROLE,))
	for page in frappe.get_all("Has Role", filters={"parenttype": "Page", "role": JEWELIMA_STONE_ADMIN_ROLE}, pluck="parent"):
		if page not in set(JEWELIMA_STONE_ADMIN_PAGES):
			pg = frappe.get_doc("Page", page)
			pg.set("roles", [r for r in pg.roles if r.role != JEWELIMA_STONE_ADMIN_ROLE])
			pg.save(ignore_permissions=True)

	# ---- Jewelima CAD: the workstation persona ----------------------------------
	for dt in JEWELIMA_CAD_READ:
		grant(dt, "Jewelima CAD", {"read": 1})
	for page in JEWELIMA_CAD_PAGES:
		set_page_roles(page, ("Jewelima CAD",))

	# ---- Jewelima Stone Issue: the issuing station ------------------------------
	# One page (Stone Issue) + read on the masters it paints. The Issue Access
	# setup page and its doctype stay admin-only, so the issuer can't widen their
	# own buckets. Tight: strip the role from any other page it may have grabbed.
	for dt in JEWELIMA_STONE_ISSUE_READ:
		grant(dt, JEWELIMA_STONE_ISSUE_ROLE, {"read": 1})
	for page in JEWELIMA_STONE_ISSUE_PAGES:
		set_page_roles(page, (JEWELIMA_STONE_ISSUE_ROLE,))
	for page in frappe.get_all("Has Role", filters={"parenttype": "Page", "role": JEWELIMA_STONE_ISSUE_ROLE}, pluck="parent"):
		if page not in set(JEWELIMA_STONE_ISSUE_PAGES):
			pg = frappe.get_doc("Page", page)
			pg.set("roles", [r for r in pg.roles if r.role != JEWELIMA_STONE_ISSUE_ROLE])
			pg.save(ignore_permissions=True)

	# ---- Design Bank personas -----------------------------------------------------
	# Base: the catalog pages. Approver: base + the review/approve pages. Both read
	# the same masters; each stripped from any page outside its own set.
	for dt in JEWELIMA_DESIGN_BANK_READ:
		grant(dt, JEWELIMA_DESIGN_BANK_ROLE, {"read": 1})
		grant(dt, JEWELIMA_DESIGN_APPROVER_ROLE, {"read": 1})
	for page in JEWELIMA_DESIGN_BANK_PAGES:
		roles = (JEWELIMA_DESIGN_BANK_ROLE, JEWELIMA_DESIGN_APPROVER_ROLE)
		if page in JEWELIMA_INFO_GALLERY_PAGES:
			roles = roles + (JEWELIMA_INFO_ROLE,)
		set_page_roles(page, roles)
	for page in JEWELIMA_DESIGN_APPROVER_PAGES:
		set_page_roles(page, (JEWELIMA_DESIGN_APPROVER_ROLE,))
	for role, allowed in ((JEWELIMA_DESIGN_BANK_ROLE, set(JEWELIMA_DESIGN_BANK_PAGES)),
			(JEWELIMA_INFO_ROLE, set(JEWELIMA_INFO_PAGES)),
			(JEWELIMA_DESIGN_APPROVER_ROLE, set(JEWELIMA_DESIGN_BANK_PAGES) | set(JEWELIMA_DESIGN_APPROVER_PAGES))):
		for page in frappe.get_all("Has Role", filters={"parenttype": "Page", "role": role}, pluck="parent"):
			if page not in allowed:
				pg = frappe.get_doc("Page", page)
				pg.set("roles", [r for r in pg.roles if r.role != role])
				pg.save(ignore_permissions=True)

	# ---- Jewelima Graphics: the photo desk ---------------------------------------
	# All 8 photo buckets + KPI + approvals + rejection. Reads the bank; every
	# photo mutation runs through design_bank_api (role-gated). Stripped from any
	# page outside its own set so it can't wander.
	for dt in JEWELIMA_DESIGN_BANK_READ:
		grant(dt, JEWELIMA_GRAPHICS_ROLE, {"read": 1})
	for page in JEWELIMA_GRAPHICS_PAGES:
		set_page_roles(page, (JEWELIMA_GRAPHICS_ROLE,))
	for page in frappe.get_all("Has Role", filters={"parenttype": "Page", "role": JEWELIMA_GRAPHICS_ROLE}, pluck="parent"):
		if page not in set(JEWELIMA_GRAPHICS_PAGES):
			pg = frappe.get_doc("Page", page)
			pg.set("roles", [r for r in pg.roles if r.role != JEWELIMA_GRAPHICS_ROLE])
			pg.save(ignore_permissions=True)

	# every CAD user can browse the bank: sync the Info role onto them
	for user in frappe.get_all("Has Role", filters={"parenttype": "User", "role": "Jewelima CAD"}, pluck="parent"):
		if frappe.db.exists("User", user) and not frappe.db.exists(
				"Has Role", {"parenttype": "User", "parent": user, "role": JEWELIMA_INFO_ROLE}):
			u = frappe.get_doc("User", user)
			u.append("roles", {"role": JEWELIMA_INFO_ROLE})
			u.save(ignore_permissions=True)

	# ---- Workstations: the floor managers, no per-bench personas -----------------
	# The eleven "Jewelima Bench <BENCH>" roles are RETIRED — nobody logged in as a
	# single bench, and they made the permission list unreadable. Every trace is
	# scrubbed (users, pages, doc perms) before the roles themselves go.
	for role in frappe.get_all("Role", filters={"role_name": ["like", "Jewelima Bench%"]}, pluck="name"):
		for pg in frappe.get_all("Has Role", filters={"parenttype": "Page", "role": role}, pluck="parent"):
			pgd = frappe.get_doc("Page", pg)
			pgd.set("roles", [r for r in pgd.roles if r.role != role])
			pgd.save(ignore_permissions=True)
		frappe.db.delete("Has Role", {"role": role})
		frappe.db.delete("Custom DocPerm", {"role": role})
		frappe.delete_doc("Role", role, force=True, ignore_permissions=True)
	for page in JEWELIMA_WS_PAGES.values():
		set_page_roles(page, ("Stock Manager",))
	set_page_roles("workstations", ("Stock Manager",))

	# ---- Jewelima Transfer: the runner ------------------------------------------
	# Opens ONE page (Transfer Order Bag), reads the bag + its movement history so
	# the page paints, nothing else — read is the only right granted, so the
	# view-only sweep above needs no second pass. Writes happen through the page's
	# APIs (ignore_permissions); Transfer Rules can narrow WHICH from -> to moves
	# the role may make.
	# CAD team fully manages the CAD Sheet artifact
	if frappe.db.exists("DocType", "CAD Sheet Record"):
		grant("CAD Sheet Record", "Jewelima CAD", {"read": 1, "write": 1, "create": 1, "delete": 1, "report": 1, "export": 1})

	for role in JEWELIMA_TRANSFER_ROLES:
		for dt in JEWELIMA_TRANSFER_READ:
			grant(dt, role, {"read": 1})
		for page in JEWELIMA_TRANSFER_PAGES:
			set_page_roles(page, (role,))
		# tight: strip the role from any other page it may have picked up
		for page in frappe.get_all("Has Role", filters={"parenttype": "Page", "role": role}, pluck="parent"):
			if page not in set(JEWELIMA_TRANSFER_PAGES):
				pg = frappe.get_doc("Page", page)
				pg.set("roles", [r for r in pg.roles if r.role != role])
				pg.save(ignore_permissions=True)

	# ---- JW CAM: the CAM bench plus a narrow transfer ---------------------------
	ensure_role(JEWELIMA_CAM_ROLE)
	for dt in JEWELIMA_TRANSFER_READ:
		grant(dt, JEWELIMA_CAM_ROLE, {"read": 1})
	for dt in JEWELIMA_WS_READ:
		grant(dt, JEWELIMA_CAM_ROLE, {"read": 1})
	for page in JEWELIMA_CAM_PAGES:
		set_page_roles(page, (JEWELIMA_CAM_ROLE,))
	# tight: this role opens those two pages and nothing else
	for page in frappe.get_all("Has Role",
			filters={"parenttype": "Page", "role": JEWELIMA_CAM_ROLE}, pluck="parent"):
		if page not in set(JEWELIMA_CAM_PAGES):
			pg = frappe.get_doc("Page", page)
			pg.set("roles", [r for r in pg.roles if r.role != JEWELIMA_CAM_ROLE])
			pg.save(ignore_permissions=True)

	# The matrix rows that pin it to CAM -> WAXING / CAD. Rewritten from scratch
	# each run: a stale row would silently widen where the bench can send work.
	if frappe.db.exists("DocType", "Transfer Rule"):
		for r in frappe.get_all("Transfer Rule",
				filters={"role": JEWELIMA_CAM_ROLE}, pluck="name"):
			frappe.delete_doc("Transfer Rule", r, force=True, ignore_permissions=True)
		for to in JEWELIMA_CAM_TO:
			frappe.get_doc({"doctype": "Transfer Rule", "role": JEWELIMA_CAM_ROLE,
				"from_location": JEWELIMA_CAM_FROM, "to_location": to}).insert(ignore_permissions=True)

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

	# ---- JW Manager: the Jewelima-wide power role -----------------------------
	# Opens EVERY Jewelima page and is recognised as an admin inside our feature
	# APIs (added to the role gates in api.py / design_bank_api.py), so it runs the
	# whole app. It is NOT System Manager and carries NO other-ERP module role —
	# pair a JW Manager user with the "Jewelima Only" module profile so ERPNext's
	# own modules stay hidden. Actions run through page APIs (ignore_permissions),
	# so READ on our doctypes + the masters our pages paint is all the desk needs.
	ensure_role("JW Manager")
	jw_reads = set(our_doctypes) | set(
		JEWELIMA_READ_ERPNEXT + JEWELIMA_ORDERING_READ + JEWELIMA_CAD_READ
		+ JEWELIMA_STONE_ISSUE_READ + JEWELIMA_STOCK_READ + JEWELIMA_DESIGN_BANK_READ
		+ JEWELIMA_PURCHASE_READ + JEWELIMA_TRANSFER_READ + JEWELIMA_WS_READ
		+ ["Company", "BOM", "Sales Person", "Order Type", "Stone Type", "File",
		   "Diamond Sieve", "Material Issue", "Bag Material Ledger", "Voucher Type"])
	for dt in jw_reads:
		grant(dt, "JW Manager", {"read": 1, "report": 1, "print": 1, "export": 1})
	# JW Manager also runs the Party desk: write/create on Customer + the party masters
	# (inline group-create on Create Party) + the old-name store.
	grant("Customer", "JW Manager", {"read": 1, "write": 1, "create": 1})
	for dt in ("Party Group", "Party Zone", "Party District", "Party State", "Party Special", "Party Old Name"):
		if frappe.db.exists("DocType", dt):
			grant(dt, "JW Manager", {"read": 1, "write": 1, "create": 1, "delete": 1})
	# grant to EVERY Jewelima page (auto-covers current + future pages)
	for pg in frappe.get_all("Page", filters={"module": "Jewelima"}, pluck="name"):
		set_page_roles(pg, ("JW Manager",))

	# ---- Everyone-pages: the learning page + self-service My Account -----------
	# The base role is retired, so "everyone" = every role that can open any other
	# Jewelima page. Collect them (after all grants above) and open these pages to
	# all, so anyone on the desk can watch tutorials and manage their own login.
	_jwl_pages = frappe.get_all("Page", filters={"module": "Jewelima"}, pluck="name")
	_everyone_roles = tuple(sorted(set(frappe.get_all("Has Role",
		filters={"parenttype": "Page", "parent": ["in", _jwl_pages or [""]]},
		distinct=True, pluck="role")) | {"JW Manager"}))
	for _pg in ("training-videos", "my-account", "request-feature", "migration-goals", "quick-menu-setup"):
		if frappe.db.exists("Page", _pg):
			set_page_roles(_pg, _everyone_roles)

	# Ordering also manages design-type sizes (the Place Order Size list) — page + API.
	set_page_roles("design-types", ("Jewelima Ordering",))

	# ---- JW Party Admin: owns the Party menu (directory, create/migrate, look-up,
	# masters, party stock/metal). Actions run through page APIs, but grant write
	# on Customer so classify/rename works, and create/write on the party masters
	# and the old-name store.
	if not frappe.db.exists("Role", "JW Party Admin"):
		frappe.get_doc({"doctype": "Role", "role_name": "JW Party Admin", "desk_access": 1}).insert(ignore_permissions=True)
	grant("Customer", "JW Party Admin", {"read": 1, "write": 1, "create": 1, "report": 1, "print": 1, "export": 1})
	for dt in ("Party Group", "Party Zone", "Party District", "Party State", "Party Special", "Party Old Name"):
		if frappe.db.exists("DocType", dt):
			grant(dt, "JW Party Admin", {"read": 1, "write": 1, "create": 1, "delete": 1})
	grant("Sales Person", "JW Party Admin", {"read": 1})
	if frappe.db.exists("DocType", "Price Chart"):
		grant("Price Chart", "JW Party Admin", {"read": 1})
	for _pg in ("parties", "create-party", "party-masters", "party-stock", "party-metal"):
		set_page_roles(_pg, ("JW Party Admin",))
	# the order desk looks parties up all day (old names, branches, who is who) —
	# read-only: creating and classifying stays with JW Party Admin
	set_page_roles("parties", ("Jewelima Ordering",))
	for dt in ("Party Group", "Party Zone", "Party District", "Party State",
			"Party Special", "Party Old Name", "Sales Person"):
		if frappe.db.exists("DocType", dt):
			grant(dt, "Jewelima Ordering", {"read": 1})

	# ---- JW Selection: full run of the Selection module (photo selection, review,
	# selected pieces, export/import, tags, providers). Full CRUD on the Selection
	# doctypes + read on the design catalog the pages browse; page APIs still do the
	# heavy lifting under ignore_permissions.
	if not frappe.db.exists("Role", "JW Selection"):
		frappe.get_doc({"doctype": "Role", "role_name": "JW Selection", "desk_access": 1}).insert(ignore_permissions=True)
	for dt in ("Selection", "Selection Photo", "Selection Tag"):
		if frappe.db.exists("DocType", dt):
			grant(dt, "JW Selection", {"read": 1, "write": 1, "create": 1, "delete": 1, "report": 1, "print": 1, "export": 1})
	for dt in ("Design Bank", "Design Bank Stone", "Design Bank Tag", "Design", "Design Type", "Item", "File"):
		if frappe.db.exists("DocType", dt):
			grant(dt, "JW Selection", {"read": 1})
	for _pg in ("select-photos", "selection-review", "selected-pieces", "selection-records",
			"selection-tags", "selection-providers"):
		set_page_roles(_pg, ("JW Selection",))

	# ---- JW Dye Admin: the dye store is theirs — every Dye page, full control
	# of the register (the pages write through _dye_guard-ed APIs, which accept
	# this role below in api.py's DYE_ROLES).
	for dt in ("Dye", "Dye Drawer"):
		if frappe.db.exists("DocType", dt):
			grant(dt, "JW Dye Admin", {"read": 1, "write": 1, "create": 1, "delete": 1,
				"report": 1, "print": 1, "export": 1})
	for dt in ("Design Bank", "Design"):
		if frappe.db.exists("DocType", dt):
			grant(dt, "JW Dye Admin", {"read": 1})
	for _pg in ("dye-bank", "dye-find", "dye-manage", "dye-info"):
		set_page_roles(_pg, ("JW Dye Admin",))

	# ---- JW Data Admin: the bench + casting data desk. Assign/collect, issue/
	# receipt, tree making and the casting queue — everything on those pages.
	for dt in JEWELIMA_DATA_ADMIN_READ:
		if frappe.db.exists("DocType", dt):
			grant(dt, JEWELIMA_DATA_ADMIN_ROLE, {"read": 1, "report": 1, "print": 1, "export": 1})
	for _pg in JEWELIMA_DATA_ADMIN_PAGES:
		set_page_roles(_pg, (JEWELIMA_DATA_ADMIN_ROLE,))

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


# ---------------------------------------------------------------------------
# Bench Work Options — Work Types (first = default), Queue Reasons, Collection
# States — seeded on install/migrate. CAM / ORDERING / TREE MAKING / CASTING are
# deliberately left out (no work-type picker there). Any configured bench not in
# BENCH_WORK_TYPES falls back to its own name as the sole default work type.
# ---------------------------------------------------------------------------
BENCH_WORK_TYPES = {   # first entry is the DEFAULT (used when none is picked)
	"CAD": ["CAD", "Rework", "Sizing"],
	"WAXING": ["Wax Injecting", "Dye Cutting"],
	"WAX SETTING": ["Wax Setting"],
	"WAX CLEANING": ["Wax Cleaning", "Sizing"],
	"GRINDING": ["Grinding"],
	"FILING": ["Filing"],
	"SETTING": ["Setting", "Cupping", "Hand Setting"],
	"PRE POLISH": ["Pre Polish"],
	"FINAL POLISH": ["Final Polish", "Rhodium", "Coloring"],
	"BAG EXTRACTION": ["Bag Extraction"],
}
BENCH_QUEUE_REASONS = {"WAXING": ["Dye Not Found", "Dye Damaged"]}
# every configured bench gets these three collection states (value -> disposition)
BENCH_COLLECTION_STATES = [
	("Completed", "Ready to Transfer"),
	("Re-Assign", "Back to In Queue"),
	("Partial", "Back to In Queue"),
]
BENCH_WORK_EXCLUDE = {"CAM", "ORDERING", "TREE MAKING", "CASTING"}


def seed_bench_work_options():
	"""Install the standard Work Types / Queue Reasons / Collection States per bench.
	Idempotent: upserts by (bench, kind, value); enforces exactly one default Work
	Type per bench and the right disposition on each Collection State."""
	from jewelima.jewelima.benches import BENCH_DOCTYPE

	# CREATE-IF-MISSING only, so an admin's later edits (a changed default, a renamed
	# state, a tweaked disposition) are never clobbered on the next migrate.
	def ensure(bench, kind, value, *, is_default=0, disposition=None):
		if frappe.db.exists("Bench Work Option", {"bench": bench, "kind": kind, "value": value}):
			return
		doc = frappe.new_doc("Bench Work Option")
		doc.bench, doc.kind, doc.value = bench, kind, value
		if kind == "Work Type":
			doc.is_default = is_default
		if kind == "Collection State" and disposition:
			doc.disposition = disposition
		doc.insert(ignore_permissions=True)

	for bench, name in BENCH_DOCTYPE.items():
		if bench in BENCH_WORK_EXCLUDE:
			continue
		# work types (bench's own name as sole default when not explicitly listed)
		wts = BENCH_WORK_TYPES.get(bench) or [name]
		for i, wt in enumerate(wts):
			ensure(bench, "Work Type", wt, is_default=1 if i == 0 else 0)
		# guarantee EXACTLY ONE default among this bench's work types (only steps in
		# when there is none, or somehow more than one — never overrides a chosen one)
		all_wt = frappe.get_all("Bench Work Option", filters={"bench": bench, "kind": "Work Type"},
			fields=["name", "value", "is_default"], order_by="creation")
		defaults = [w for w in all_wt if w.is_default]
		if all_wt and not defaults:
			target = next((w.name for w in all_wt if w.value == wts[0]), all_wt[0].name)
			frappe.db.set_value("Bench Work Option", target, "is_default", 1)
		elif len(defaults) > 1:
			for w in defaults[1:]:
				frappe.db.set_value("Bench Work Option", w.name, "is_default", 0)
		# queue reasons
		for qr in BENCH_QUEUE_REASONS.get(bench, []):
			ensure(bench, "Queue Reason", qr)
		# collection states (same three everywhere)
		for value, disp in BENCH_COLLECTION_STATES:
			ensure(bench, "Collection State", value, disposition=disp)
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


# The Jewelima home (workspace) renders a single Custom HTML Block: a launcher of
# the workstations the CURRENT user may open. All the per-user logic lives in the
# block's script (api.get_my_workstations); this just keeps the block in sync.
HOME_BLOCK_NAME = "jewelima-home"
HOME_BLOCK_HTML = """<div class="jwh"><div class="jwh-grid" id="jwh-grid"><div class="jwh-note">Loading…</div></div></div>"""
HOME_BLOCK_STYLE = """.jwh { padding: 6px 2px 26px; }
.jwh-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 14px; }
.jwh-card { display: flex; align-items: center; justify-content: center; text-align: center;
  min-height: 94px; padding: 18px 16px; border: 1px solid var(--border-color, #e2e2e2);
  border-radius: 14px; background: var(--card-bg, #fff); color: var(--text-color, #1a1a1a);
  font-size: 16px; font-weight: 700; letter-spacing: .2px; cursor: pointer; text-decoration: none;
  transition: transform .08s ease, box-shadow .12s ease, border-color .12s ease; }
.jwh-card:hover { transform: translateY(-2px); border-color: #c9a227; box-shadow: 0 6px 18px rgba(0,0,0,.09); }
.jwh-note { color: var(--text-muted, #8d8d8d); font-size: 14px; padding: 26px 6px; }
.jwh-empty { color: var(--text-muted, #8d8d8d); font-size: 15px; padding: 30px 6px; text-align: center; }"""
HOME_BLOCK_SCRIPT = """frappe.call({ method: "jewelima.jewelima.api.get_my_workstations" }).then(function (r) {
  var grid = root_element.getElementById("jwh-grid");
  if (!grid) return;
  var ws = (r && r.message) || [];
  var esc = frappe.utils.escape_html;
  if (!ws.length) {
    grid.innerHTML = '<div class="jwh-empty">' + __("You have no access to any workstation.") + '</div>';
    return;
  }
  grid.innerHTML = ws.map(function (w) {
    return '<a class="jwh-card" data-route="' + esc(w.route) + '">' + esc(w.title) + '</a>';
  }).join("");
  grid.querySelectorAll(".jwh-card").forEach(function (el) {
    el.addEventListener("click", function () { frappe.set_route(el.getAttribute("data-route")); });
  });
});"""


def ensure_home_block():
	"""Upsert the home launcher's Custom HTML Block, then force the home workspace
	to match the shipped fixture. Idempotent."""
	if frappe.db.exists("Custom HTML Block", HOME_BLOCK_NAME):
		doc = frappe.get_doc("Custom HTML Block", HOME_BLOCK_NAME)
	else:
		doc = frappe.new_doc("Custom HTML Block")
		doc.name = HOME_BLOCK_NAME
	doc.html = HOME_BLOCK_HTML
	doc.style = HOME_BLOCK_STYLE
	doc.script = HOME_BLOCK_SCRIPT
	doc.private = 0
	doc.save(ignore_permissions=True)
	_sync_home_workspace()
	frappe.db.commit()


def _sync_home_workspace():
	"""A plain migrate does NOT overwrite an existing public workspace, so its
	content goes stale. Re-push the shipped Jewelima workspace (content + no
	links/shortcuts) here on every migrate. Idempotent."""
	import json
	import os

	path = frappe.get_app_path("jewelima", "jewelima", "workspace", "jewelima", "jewelima.json")
	if not os.path.exists(path) or not frappe.db.exists("Workspace", "Jewelima"):
		return
	with open(path) as f:
		data = json.load(f)
	ws = frappe.get_doc("Workspace", "Jewelima")
	ws.content = data.get("content")
	for tbl in ("links", "shortcuts", "charts", "number_cards", "quick_lists"):
		ws.set(tbl, [])
	# the content's custom_block item is matched to a child row BY LABEL (block.js
	# make() compares content.custom_block_name to the row's `label`), so the label
	# MUST equal what the content references — keep both = HOME_BLOCK_NAME.
	ws.set("custom_blocks", [{"custom_block_name": HOME_BLOCK_NAME, "label": HOME_BLOCK_NAME}])
	ws.flags.ignore_links = True
	ws.save(ignore_permissions=True)


JEWELIMA_WORKSPACE = "Jewelima"   # where every login lands
KARAT_GOLDS = {"14K": 58.3, "18K": 75.1, "22K": 91.7}
GOLD_COLORS = ["YG", "WG", "PG"]  # Yellow / White / Pink(Rose) gold
# 22K is only ever worked in yellow — 22KPG / 22KWG don't exist in reality
KARAT_COLOR_LIMIT = {"22K": ["YG"]}


def allowed_karat_golds():
	"""The karat-gold codes the factory actually uses (seeding + pickers)."""
	out = []
	for karat in KARAT_GOLDS:
		for color in KARAT_COLOR_LIMIT.get(karat, GOLD_COLORS):
			out.append(karat + color)
	return out


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
		for color in KARAT_COLOR_LIMIT.get(karat, GOLD_COLORS):
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



# The findings we stock. code -> (item name, item group, karat, pieces are normal).
# A finding is gold that has not become part of a piece yet: it lives in the Gold
# Issue warehouse as itself, and turns into karat gold the moment it is issued.
FINDINGS = [
	("PIPE-18KYG", "Pipe 18K Yellow", "18 KYG Findings", "18K"),
	("PIPE-18KPG", "Pipe 18K Pink", "18 KPG Findings", "18K"),
	("TICKLY-18K-1.80", "Tickly 18K 1.80", "18K Common Findings", "18K"),
	("TICKLY-18K-2.00", "Tickly 18K 2.00", "18K Common Findings", "18K"),
	("TICKLY-18K-2.20", "Tickly 18K 2.20", "18K Common Findings", "18K"),
	("TICKLY-18K-2.50", "Tickly 18K 2.50", "18K Common Findings", "18K"),
	("TICKLY-18K-3.00", "Tickly 18K 3.00", "18K Common Findings", "18K"),
	("TICKLY-18K-3.50", "Tickly 18K 3.50", "18K Common Findings", "18K"),
	("NOSEPIN SCREW-18KYG", "Nosepin End Screw 18K Yellow", "18 KYG Findings", "18K"),
	("NOSEPIN SCREW-18KPG", "Nosepin End Screw 18K Pink", "18 KPG Findings", "18K"),
	("BOMBAY SCREW-18KYG", "Bombay Screw 18K Yellow", "18 KYG Findings", "18K"),
	("BOMBAY SCREW-18KPG", "Bombay Screw 18K Pink", "18 KPG Findings", "18K"),
	("BOMBAY SCREW-18KWG", "Bombay Screw 18K White", "18 KWG Findings", "18K"),
	("BOMBAY SCREW-22KYG", "Bombay Screw 22K Yellow", "22 KYG Findings", "22K"),
	("KERALA SCREW-18KYG", "Kerala Screw 18K Yellow", "18 KYG Findings", "18K"),
	("KERALA SCREW-18KPG", "Kerala Screw 18K Pink", "18 KPG Findings", "18K"),
	("KERALA SCREW-18KWG", "Kerala Screw 18K White", "18 KWG Findings", "18K"),
	("KERALA SCREW-22KYG", "Kerala Screw 22K Yellow", "22 KYG Findings", "22K"),
]


def seed_findings():
	"""Ship the findings list. Weight is the unit that matters (grams); a piece
	count rides along when whoever is counting wants one. Idempotent."""
	if not frappe.db.exists("Item Group", "All Item Groups"):
		return
	made = 0
	for code, name, group, karat in FINDINGS:
		if frappe.db.exists("Item", code) or not frappe.db.exists("Item Group", group):
			continue
		frappe.get_doc({
			"doctype": "Item", "item_code": code, "item_name": name,
			"item_group": group, "stock_uom": "Gram", "weight_unit": "Gram",
			"is_stock_item": 1, "is_purchase_item": 1, "is_sales_item": 0,
			"include_item_in_manufacturing": 1,
			"metal_purity": karat, "purity_percentage": KARAT_GOLDS.get(karat, 0),
		}).insert(ignore_permissions=True)
		made += 1
	if made:
		frappe.db.commit()
	print("Findings — created: %d  already there: %d" % (made, len(FINDINGS) - made))
	return {"created": made, "total": len(FINDINGS)}



def set_default_workspace(force=False):
	"""Everyone lands on the Jewelima workspace when they log in.

	Frappe reads User.default_workspace for the post-login home, so this is the
	supported way in — no redirect hack. Only EMPTY values are filled, so anyone
	who deliberately chose a different landing keeps it; pass force=True to
	reset the whole house back to Jewelima."""
	if not frappe.db.exists("Workspace", JEWELIMA_WORKSPACE):
		return
	filters = {"enabled": 1, "user_type": "System User"}
	if not force:
		filters["default_workspace"] = ["in", ["", None]]
	users = frappe.get_all("User", filters=filters, pluck="name")
	for u in users:
		frappe.db.set_value("User", u, "default_workspace", JEWELIMA_WORKSPACE, update_modified=False)
	if users:
		frappe.db.commit()
	print("Landing page — set for %d user(s) -> %s" % (len(users), JEWELIMA_WORKSPACE))
	return {"updated": len(users)}



def check_sidebar_icons():
	"""Every sidebar icon must exist in the lucide sprite — a name that does not
	renders as a blank gap with no error anywhere. Called on migrate; it only
	reports, so a bad name never blocks a deploy."""
	import os
	import re

	sprite = frappe.get_app_path("frappe", "public", "icons", "lucide.svg")
	src = frappe.get_app_path("jewelima", "workspace_sidebar", "jewelima.json")
	if not (os.path.exists(sprite) and os.path.exists(src)):
		return
	have = set(re.findall(r'id="icon-([a-z0-9-]+)"', open(sprite).read()))
	rows = json.loads(open(src).read()).get("items") or []
	bad = [(r.get("label"), r.get("icon")) for r in rows if r.get("icon") and r["icon"] not in have]
	if bad:
		print("Sidebar icons that will render BLANK: %s" % ", ".join(
			"%s (%s)" % (lbl, ic) for lbl, ic in bad))
	return {"missing": bad}



# Stock Transfer only offers warehouses carrying this flag — everything else is
# reached through the flow that owns it (issue, receipt, convert, collection).
TRANSFER_LOCATIONS = ("Gold Issue", "Production")


def flag_transfer_warehouses():
	"""Turn the transfer flag on for the warehouses stock may be moved between by
	hand. Only ever ADDS — a flag someone turned off stays off."""
	for wh_name in TRANSFER_LOCATIONS:
		wh = frappe.db.get_value("Warehouse", {"warehouse_name": wh_name}, "name")
		if wh and not frappe.db.get_value("Warehouse", wh, "custom_is_transfer_location"):
			frappe.db.set_value("Warehouse", wh, "custom_is_transfer_location", 1)
	frappe.db.commit()


# ERPNext's setup wizard ships three warehouses this house never uses, and an
# empty one in a picker is just a way to put stock somewhere nobody looks.
RETIRED_WAREHOUSES = ("Stores", "Work In Progress", "Raw Materials Store")


def drop_unused_warehouses():
	"""Remove the warehouses we do not work out of — but only while they are
	genuinely empty and unreferenced, so this can never eat real stock."""
	gone, kept = [], []
	for wh_name in RETIRED_WAREHOUSES:
		wh = frappe.db.get_value("Warehouse", {"warehouse_name": wh_name}, "name")
		if not wh:
			continue
		qty = frappe.db.sql("""SELECT IFNULL(SUM(actual_qty), 0) FROM `tabBin`
			WHERE warehouse = %s""", wh)[0][0]
		sle = frappe.db.count("Stock Ledger Entry", {"warehouse": wh})
		if flt(qty) or sle:
			kept.append("%s (%s g, %s ledger rows)" % (wh_name, round(flt(qty), 3), sle))
			continue
		try:
			frappe.delete_doc("Warehouse", wh, force=True, ignore_permissions=True)
			gone.append(wh_name)
		except Exception as e:
			kept.append("%s (%s)" % (wh_name, str(e)[:60]))
	if gone or kept:
		frappe.db.commit()
		print("Warehouses — removed: %s%s" % (", ".join(gone) or "none",
			("  |  kept (not empty): " + "; ".join(kept)) if kept else ""))
	return {"removed": gone, "kept": kept}


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


ORDER_TYPES = ["BULK", "CUSTOMER", "IMPORT", "WEDDING"]


def create_order_types():
	"""Seed the Job Order 'Type' dropdown values (Order Type master; extensible)."""
	# house style is UPPERCASE — the old mixed-case Import renames in place.
	# NOTE: MariaDB compares names case-insensitively, so exists()/rename_doc
	# can't see a case-only change — fix the stored casing directly.
	stored = frappe.db.get_value("Order Type", "IMPORT", "name")
	if stored == "Import":
		frappe.db.sql("update `tabOrder Type` set name='IMPORT', order_type_name='IMPORT' where name='Import'")
		for dt, field in (("Job Order", "order_type"), ("Order Bag", "order_type"), ("Order Request", "order_type")):
			frappe.db.sql("update `tab{0}` set `{1}`='IMPORT' where `{1}`='Import'".format(dt, field))
		# Jewelima Order Settings is a Single — its value lives in tabSingles
		frappe.db.sql("""update tabSingles set value='IMPORT'
			where doctype='Jewelima Order Settings' and field='default_order_type' and value='Import'""")
		frappe.clear_cache(doctype="Order Type")
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
	"""The two EXEMPT parties — the only Customers allowed outside the structured
	GROUP-ZONE-STATE[-SPECIAL] naming: 'JD Stock' (holder of own finished-goods
	stock) and 'BTQ Stock' (stock kept at the boutique). Skips until Customer
	Group / Territory exist (seeded by the ERPNext setup wizard)."""
	cg = frappe.db.get_value("Customer Group", {"is_group": 0}, "name")
	terr = frappe.db.get_value("Territory", {"is_group": 0}, "name") or frappe.db.get_value("Territory", {}, "name")
	if not (cg and terr):
		return
	for nm in ("JD Stock", "BTQ Stock"):
		if not frappe.db.exists("Customer", nm):
			frappe.get_doc(
				{"doctype": "Customer", "customer_name": nm, "customer_group": cg, "territory": terr}
			).insert(ignore_permissions=True)
	frappe.db.commit()


# Parties (Customers) carry a structured identity — GROUP-ZONE-STATE[-SPECIAL],
# e.g. JOS-TCR-KL-PTY — built from four small master doctypes so everything is
# queryable, plus per-party defaults the sale flow prefills from.
def get_customer_custom_fields():
	return {
		"Customer": [
			{"fieldname": "jewelima_sec", "fieldtype": "Section Break", "label": "Jewelima Party",
			 "insert_after": "customer_name"},
			{"fieldname": "party_group", "fieldtype": "Link", "options": "Party Group",
			 "label": "Party Group (Store)", "insert_after": "jewelima_sec", "in_list_view": 1,
			 "in_standard_filter": 1},
			{"fieldname": "party_zone", "fieldtype": "Link", "options": "Party Zone",
			 "label": "Zone", "insert_after": "party_group", "in_standard_filter": 1},
			{"fieldname": "party_district", "fieldtype": "Link", "options": "Party District",
			 "label": "District", "insert_after": "party_zone", "in_standard_filter": 1},
			{"fieldname": "party_col", "fieldtype": "Column Break", "insert_after": "party_district"},
			{"fieldname": "party_state", "fieldtype": "Link", "options": "Party State",
			 "label": "State", "insert_after": "party_col", "in_standard_filter": 1},
			{"fieldname": "party_special", "fieldtype": "Link", "options": "Party Special",
			 "label": "Special", "insert_after": "party_state"},
			{"fieldname": "party_col2", "fieldtype": "Column Break", "insert_after": "party_special"},
			{"fieldname": "default_salesman", "fieldtype": "Link", "options": "Sales Person",
			 "label": "Default Salesman", "insert_after": "party_col2"},
			{"fieldname": "default_price_chart", "fieldtype": "Link", "options": "Price Chart",
			 "label": "Default Price Chart", "insert_after": "default_salesman"},
		]
	}


def seed_quality_map():
	"""Diamond quality parent-mapping — the DIRECT link, no group layer: the
	retired VVS1-EF / VVS2 families (disabled items, historical stock) rate as
	VVS-EF wherever quality resolves. Extend in the Diamond Quality Map doctype."""
	if not frappe.db.exists("DocType", "Diamond Quality Map"):
		return
	# the old mis-keyed row (family is VVS2, not VVS2-EF)
	if frappe.db.exists("Diamond Quality Map", "VVS2-EF"):
		frappe.delete_doc("Diamond Quality Map", "VVS2-EF", force=1, ignore_permissions=True)
	for member, parent in (("VVS1-EF", "VVS-EF"), ("VVS2", "VVS-EF")):
		if not frappe.db.exists("Diamond Quality Map", member):
			frappe.get_doc({"doctype": "Diamond Quality Map",
				"member_quality": member, "parent_quality": parent}).insert(ignore_permissions=True)
	frappe.db.commit()


def seed_voucher_types():
	"""Base purchase voucher types (codes lead the Purchase Record series). The
	final list is still being confirmed — extend on Setup > Masters."""
	if not frappe.db.exists("DocType", "Voucher Type"):
		return
	for code, title in (("SIN", "Stock Import"), ("OGD", "Recovered Gold")):
		if not frappe.db.exists("Voucher Type", code):
			frappe.get_doc({"doctype": "Voucher Type", "code": code, "title": title}).insert(ignore_permissions=True)
	frappe.db.commit()


# Certification masters — from the client's certification_masters.xlsx (2026-07-22).
# Emails were "pending" in the sheet; fill them on the Certification Center records.
CERTIFICATIONS = {
	# code: (title, excel requirements, [(center, location), ...])
	"IGI": ("IGI",
		"YellowGold -> Metal Color 'YellowGold'; WhiteGold -> 'WhiteGold'; PinkGold -> just 'Gold'. "
		"One request = ONE colour + purity (EF means only EF) — same brackets as the price chart mapping "
		"(EF-VVS, GH-VVS/VS). Shape: Round Brilliant for all.",
		[("IGI Thrissur", "2nd Floor, JMA Trade Centre, Opp. Thrissur Railway Station (Rear), Poothole, Thrissur 680 004")]),
	"DHC": ("DHC", "Simple format excel — format pending from the lab.",
		[("DHC Gem Lab & Institute Thrissur", "Above South Indian Bank, Opp. Petrol Pump & All Saint's CSI Church, Near Manorama Circle, Mission Quarters, Thrissur 680 001")]),
	"SGL": ("SGL", "General excel — format pending.",
		[("SGL Labs", "2nd Floor, Holy Space Complex, 10/815/16/48-51, NC Road, Erinjery Angady, Pallikkulam, Thrissur 680001")]),
	"IDT": ("IDT", "General excel — format pending.",
		[("IDT Gemological Laboratories Worldwide", "2nd Floor, Centre Point, MG Road, Poothole, Thrissur 680004")]),
	"HALL": ("HALLMARKING", "General excel — format pending. HUID per piece on receive.",
		[("KERALA", ""), ("GLOBAL", ""), ("NEW POOVATHATHINGAL", ""), ("GOLD MARK", "")]),
	"GIG": ("GIG", "General excel — format pending.",
		[("Global Institute of Gemology", "2nd Floor, East End Plaza Building, Rice Bazar Rd, Erinjery Angady, Pallikkulam, Thrissur 680005")]),
}


def seed_certifications():
	"""Certification types + their centers (idempotent; ships with the app)."""
	if not frappe.db.exists("DocType", "Certification Type"):
		return
	for code, (title, req, centers) in CERTIFICATIONS.items():
		if not frappe.db.exists("Certification Type", code):
			frappe.get_doc({"doctype": "Certification Type", "code": code, "title": title,
				"excel_requirements": req}).insert(ignore_permissions=True)
		if frappe.db.exists("DocType", "Certification Center"):
			for cname, loc in centers:
				if not frappe.db.exists("Certification Center", {"certification_type": code, "center_name": cname}):
					frappe.get_doc({"doctype": "Certification Center", "certification_type": code,
						"center_name": cname, "location": loc}).insert(ignore_permissions=True)
	frappe.db.commit()


DESIGN_TYPE_BANK_CODES = {
	"BANGLE": "JB", "RING": "JR", "STUD": "JS", "NOSEPIN": "JNP", "NECKLACE": "JN",
	"PENDANT": "JP", "CHAIN": "JC", "BRACELET": "JBR", "ANKLET": "JA",
	"BACK CHAIN": "JBC", "PIPE BANGLE": "JPB", "CHAIN BRACELET": "JCB", "CHAIN NECKLACE": "JCN",
}


def seed_design_type_bank_codes():
	"""Series prefixes for NEW in-house designs (JB-1, JR-1...). Only fills
	blanks — a code changed by the user stays."""
	if not frappe.db.exists("DocType", "Design Type"):
		return
	for dt, code in DESIGN_TYPE_BANK_CODES.items():
		if frappe.db.exists("Design Type", dt) and not frappe.db.get_value("Design Type", dt, "bank_code"):
			frappe.db.set_value("Design Type", dt, "bank_code", code, update_modified=False)
	frappe.db.commit()


def seed_diversion_types():
	"""How a made Design diverges from its Design Bank card — extensible master."""
	if not frappe.db.exists("DocType", "Diversion Type"):
		return
	for t in ("Colour Stone Variant", "CZ Variant", "DMD Variant", "22K Variant"):
		if not frappe.db.exists("Diversion Type", t):
			frappe.get_doc({"doctype": "Diversion Type", "title": t}).insert(ignore_permissions=True)
	frappe.db.commit()


def seed_party_masters():
	"""Retired: party masters now come from the party importer (party_import.run)
	or are created inline on the Create Party page. Kept as a no-op so after_migrate
	stays stable; the old starter seed clashed with the composite-named masters
	(record name is 'KL - Kerala', not 'KL')."""
	return


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
			# ornament golds live one level deeper (GOLD > GOLD ORNAMENT > karats)
			# so pickers can target ornament metal only; GOLD STANDARD stays
			# directly under GOLD — melt stock, never inside a piece. The extra
			# level is re-homed after the main loop (the loop is 4-level only);
			# material_group stays 'GOLD' either way (it's chain position 3).
			"GOLD": ["GOLD STANDARD"],
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

	# the GROUP layer inside DIAMOND is retired — every quality leaf sits
	# straight under DIAMOND; quality parent-mapping lives ONLY in the Diamond
	# Quality Map (VVS1-EF / VVS2 rate directly as VVS-EF).
	def flatten_diamond_groups():
		for g in frappe.get_all("Item Group", filters={"parent_item_group": ["like", "%GROUP"]}, pluck="name"):
			ensure(g, "DIAMOND", 0)
		for parent in ("VVS-EF GROUP", "VVS/VS-GH GROUP"):
			if frappe.db.exists("Item Group", parent) \
					and not frappe.db.count("Item Group", {"parent_item_group": parent}) \
					and not frappe.db.count("Item", {"item_group": parent}):
				frappe.delete_doc("Item Group", parent, force=1, ignore_permissions=True)

	# VVS1-EF and VVS2 families are retired ENTIRELY: unused items DELETE
	# (fresh/test sites end up clean), items carrying history disable; the
	# two family groups go once they empty out
	def retire_diamond_families():
		for nm in frappe.get_all("Item", filters={"stone_type": "Diamond",
				"name": ["like", "VVS1-EF%"]}, pluck="name") + \
				frappe.get_all("Item", filters={"stone_type": "Diamond",
				"name": ["like", "VVS2%"]}, pluck="name"):
			try:
				frappe.delete_doc("Item", nm, ignore_permissions=True)
			except Exception:
				frappe.db.set_value("Item", nm, "disabled", 1, update_modified=False)
		for grp in ("DIAMOND VVS1-EF", "DIAMOND VVS2"):
			if frappe.db.exists("Item Group", grp) and not frappe.db.count("Item", {"item_group": grp}):
				try:
					frappe.delete_doc("Item Group", grp, ignore_permissions=True)
				except Exception:
					pass

	# the 5th-level ornament branch: GOLD > GOLD ORNAMENT > karat leaves
	def home_ornament_gold():
		ensure("GOLD ORNAMENT", "GOLD", 1)
		for leaf in ("GOLD 22K", "GOLD 18K", "GOLD 14K"):
			ensure(leaf, "GOLD ORNAMENT", 0)

	# findings (clasps, hooks, posts…) mirror the ornament karats:
	# GOLD > GOLD FINDINGS > <karat> Findings > per-colour leaves.
	# 22K comes in yellow only; 14K/18K in all three colours.
	def home_findings_gold():
		ensure("GOLD FINDINGS", "GOLD", 1)
		for karat, colours in (("14", "YWP"), ("18", "YWP"), ("22", "Y")):
			ensure(f"{karat}K Findings", "GOLD FINDINGS", 1)
			for c in colours:
				ensure(f"{karat} K{c}G Findings", f"{karat}K Findings", 0)
		# some findings come in no colour at all (tickly) — they live here and the
		# colour is chosen when they are issued and turn into gold
		ensure("18K Common Findings", "18K Findings", 0)

	for main, types in ITEM_GROUP_TREE.items():
		ensure(main, root, 1)
		for typ, groups in types.items():
			ensure(typ, main, 1)
			for grp, leaves in groups.items():
				ensure(grp, typ, 1 if leaves else 0)
				for leaf in leaves:
					ensure(leaf, grp, 0)

	home_ornament_gold()
	home_findings_gold()

	# every diamond quality group sits straight under DIAMOND
	for g in frappe.get_all("Item Group", filters={"name": ["like", "DIAMOND %"], "is_group": 0}, pluck="name"):
		ensure(g, "DIAMOND", 0)
	flatten_diamond_groups()
	retire_diamond_families()
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
	for wh_name in ("Gold Issue",):
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
				"label": "Party Group",
				"options": "Party Group",
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
			{
				"fieldname": "custom_is_transfer_location",
				"fieldtype": "Check",
				"label": "Transfer Location",
				"insert_after": "custom_is_issue_location",
				"description": "Stock Transfer may move stock in and out of here. Untick and the "
					"warehouse disappears from the transfer page entirely.",
			},
		],
	}


def create_default_stone_types():
	"""Seed the seven stone buckets. This is the ONLY place Stone Types come from —
	the controller blocks UI create/rename/delete (bucket maps + the Order Bag
	stone columns are keyed to these exact names)."""
	frappe.flags.allow_stone_type_edit = True
	try:
		for stone_type in ["Diamond", "Precious Stone", "Color Stone", "CVD", "Cubic Zirconia", "Swarovski", "Party Diamond", "Party Other"]:
			if not frappe.db.exists("Stone Type", stone_type):
				frappe.get_doc(
					{"doctype": "Stone Type", "stone_type_name": stone_type}
				).insert(ignore_permissions=True)
	finally:
		frappe.flags.allow_stone_type_edit = False
	# CZ items used to bucket as Color Stone — flip them to their own bucket
	# (idempotent; item_group CUBIC ZIRCONIA is the authority on what's a CZ)
	frappe.db.sql("""UPDATE `tabItem` SET stone_type='Cubic Zirconia'
		WHERE item_group='CUBIC ZIRCONIA' AND IFNULL(stone_type,'') != 'Cubic Zirconia'""")
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
MELT_LOSS_STAGE = "Melting"
MELT_LOSS_WAREHOUSE = "{0} -LOSS".format(MELT_LOSS_STAGE)
LOSS_STAGES = [
	"Filing",
	"Final Polish",
	"Pre Polish",
	"Setting",
	"Grinding",
	"Casting",
	# what the pot keeps: the difference between what is fed into a melt and the
	# karat gold that comes out. Credited here by melt_gold so it is recoverable
	# like any other loss instead of vanishing from the ledger.
	MELT_LOSS_STAGE,
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
# retired 2026-08-27 — purchases land in Gold Issue / Stone Issue now. The name
# is kept only so anything still importing it resolves instead of exploding.
RAW_MATERIALS_STORE = "Raw Materials Store"
RESERVED_WAREHOUSE = "Reserved"
GOLD_ISSUE_WAREHOUSE = "Gold Issue"
STONE_ISSUE_WAREHOUSE = "Stone Issue"
# Coarse value pool for materials currently inside Order Bags ("In Bags"). Per-bag
# detail lives in the Bag Material Ledger; this warehouse holds the aggregate gold.
# Gold lands here on add-weight; loss moves out of here to a '<bench> -LOSS' wh.
IN_PRODUCTION_WAREHOUSE = "In Bags"
# The floor's own metal. A receipt that comes back HEAVIER than it went out
# (polish build-up, scale variance) has to take that gold from somewhere — it
# pulls from here. Allowed to go negative: a negative balance is the report of
# what the floor has added without a top-up.
PRODUCTION_WAREHOUSE = "Production"
# A gain bigger than this is refused on receipt — that is a mis-typed weight,
# not scale drift.
MAX_RECEIPT_GAIN_G = 0.100
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
	make_warehouse(IN_PRODUCTION_WAREHOUSE, company, abbr, parent=root, is_group=0)
	make_warehouse(CERTIFICATION_WAREHOUSE, company, abbr, parent=root, is_group=0)
	make_warehouse(PRODUCTION_WAREHOUSE, company, abbr, parent=root, is_group=0)
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

# ---------------------------------------------------------------------------
# Diamond sieve chart — average carat per stone, per sieve. Ships IN CODE
# (source: the workshop's sieve chart xlsx, labels normalised to the item-size
# convention: zeros -> O's, no trailing .0). Drives qty<->carat auto-fill in
# purchases and BOM entry. Values are editable on the Sieve Chart page;
# seeding only ADDS missing rows, it never overwrites an edited value.
# ---------------------------------------------------------------------------
SIEVE_CHART = [
	# (sieve size = item size label, mm, avg cts/stone)
	# BAKED from the server chart 2026-07-30 — the admin-audited averages
	("OOOOO-OOOO", 0.75, 0.0023), ("OOOO-OOO", 0.85, 0.0027), ("OOO-OO", 0.9, 0.0035), ("OO-O", 1, 0.0046),
	("O-1", 1.1, 0.0056), ("1-1.5", 1.15, 0.0068), ("1.5-2", 1.2, 0.007), ("2-2.5", 1.25, 0.009),
	("2.5-3", 1.3, 0.01), ("3-3.5", 1.35, 0.011), ("3.5-4", 1.4, 0.012), ("4-4.5", 1.45, 0.014),
	("4.5-5", 1.5, 0.015), ("5-5.5", 1.55, 0.016), ("5.5-6", 1.6, 0.019), ("6-6.5", 1.7, 0.021),
	("6.5-7", 1.8, 0.025), ("7-7.5", 1.9, 0.029), ("7.5-8", 2, 0.035), ("8-8.5", 2.1, 0.038),
	("8.5-9", 2.2, 0.045), ("9-9.5", 2.3, 0.05), ("9.5-10", 2.4, 0.058), ("10-10.5", 2.5, 0.066),
	("10.5-11", 2.6, 0.07), ("11-11.5", 2.7, 0.077), ("11.5-12", 2.8, 0.086), ("12-12.5", 2.9, 0.094),
	("12.5-13", 3, 0.103), ("13-13.5", 3.1, 0.119), ("13.5-14", 3.2, 0.131), ("14-14.5", 3.3, 0.144),
	("14.5-15", 3.4, 0.158), ("15-15.5", 3.5, 0.167), ("15.5-16", 3.6, 0.175), ("16-16.5", 3.7, 0.188),
	("16.5-17", 3.8, 0.196), ("17-17.5", 3.9, 0.211), ("17.5-18", 4, 0.223), ("18-18.5", 4.1, 0.252),
	("18.5-19", 4.2, 0.285), ("19-19.5", 4.3, 0.29), ("19.5-20", 4.4, 0.331),
]


def seed_sieve_chart():
	"""Create missing Diamond Sieve rows. Idempotent; NEVER overwrites the
	editable cells (mm/avg) — but idx_order is STRUCTURE, not data, so the
	chart order always re-syncs to the shipped sequence."""
	if not frappe.db.exists("DocType", "Diamond Sieve"):
		return
	for i, (sieve, mm, avg) in enumerate(SIEVE_CHART):
		if not frappe.db.exists("Diamond Sieve", sieve):
			frappe.get_doc({"doctype": "Diamond Sieve", "sieve_size": sieve,
				"mm_size": mm, "avg_cts": avg, "idx_order": i}).insert(ignore_permissions=True)
		elif cint(frappe.db.get_value("Diamond Sieve", sieve, "idx_order")) != i:
			frappe.db.set_value("Diamond Sieve", sieve, "idx_order", i, update_modified=False)
	# per-group columns: CVD mirrors DMD today, CZ / SWAROVSKI run x2 by carat.
	# BLANKS ONLY — admin-entered values are never overwritten.
	if frappe.db.has_column("Diamond Sieve", "cvd_avg_cts"):
		frappe.db.sql("""update `tabDiamond Sieve` set cvd_avg_cts = avg_cts
			where ifnull(cvd_avg_cts, 0) = 0 and ifnull(avg_cts, 0) > 0""")
		frappe.db.sql("""update `tabDiamond Sieve` set cz_avg_cts = avg_cts * 2
			where ifnull(cz_avg_cts, 0) = 0 and ifnull(avg_cts, 0) > 0""")
		frappe.db.sql("""update `tabDiamond Sieve` set sw_avg_cts = avg_cts * 2
			where ifnull(sw_avg_cts, 0) = 0 and ifnull(avg_cts, 0) > 0""")
	frappe.db.commit()
