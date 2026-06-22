# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
"""Whitelisted server endpoints the Jewelima pages call over AJAX."""

import json

import frappe
from frappe.utils import flt


def _company():
	return frappe.defaults.get_defaults().get("company") or frappe.db.get_single_value(
		"Global Defaults", "default_company"
	)


def _abbr():
	return frappe.db.get_value("Company", _company(), "abbr")


def _wh(name):
	"""Full '<name> - <abbr>' warehouse, or None if it doesn't exist."""
	full = "{0} - {1}".format(name, _abbr())
	return full if frappe.db.exists("Warehouse", full) else None


def _stock_move(item, qty, source, target):
	"""Submit a Material Transfer of `qty` (stock UOM) of `item` from source ->
	target warehouse. No-op when qty<=0 or either warehouse is missing."""
	qty = flt(qty)
	if qty <= 0 or not source or not target:
		return None
	se = frappe.get_doc({
		"doctype": "Stock Entry",
		"stock_entry_type": "Material Transfer",
		"company": _company(),
		"items": [{
			"item_code": item,
			"qty": qty,
			"uom": frappe.db.get_value("Item", item, "stock_uom") or "Gram",
			"s_warehouse": source,
			"t_warehouse": target,
			# we track grams here; valuation flows in automatically once gold is
			# actually purchased (until then a zero rate is fine).
			"allow_zero_valuation_rate": 1,
		}],
	})
	se.flags.ignore_permissions = True
	se.insert()
	se.submit()
	return se.name


@frappe.whitelist()
def post_raw_material_purchase(supplier, warehouse, posting_date=None, items=None):
	"""Create + submit a Purchase Receipt for raw materials (from the Purchase
	Raw Material page). Stock lands in `warehouse`. Returns the PR name."""
	from frappe.utils import today

	if isinstance(items, str):
		items = json.loads(items or "[]")
	rows = [
		{"item_code": i.get("item"), "qty": i.get("qty") or 0, "rate": i.get("rate") or 0, "warehouse": warehouse}
		for i in (items or [])
		if i.get("item") and (i.get("qty") or 0) > 0
	]
	if not rows:
		frappe.throw(frappe._("Add at least one item with a quantity."))
	if not supplier:
		frappe.throw(frappe._("Select a supplier."))
	if not warehouse:
		frappe.throw(frappe._("Select a warehouse."))

	pr = frappe.get_doc(
		{
			"doctype": "Purchase Receipt",
			"supplier": supplier,
			"company": _company(),
			"posting_date": posting_date or today(),
			"set_warehouse": warehouse,
			"items": rows,
		}
	)
	pr.insert(ignore_permissions=True)
	pr.submit()
	return {"name": pr.name}


@frappe.whitelist()
def create_design(design_name, design_type, design_style=None, image=None, materials=None):
	"""Quick-create a Design from the Place Order dialog. The Design controller
	provisions the sellable Item + BOM and derives the stone counts. Returns the
	new design + its derived stone profile so the caller can fill a line."""
	if isinstance(materials, str):
		materials = json.loads(materials or "[]")
	materials = materials or []
	if frappe.db.exists("Design", design_name):
		frappe.throw(frappe._("A design named {0} already exists.").format(design_name))

	rows = [
		{
			"item": m.get("item"),
			"qty": m.get("qty") or 0,
			"weight": m.get("weight") or 0,
		}
		for m in materials
		if m.get("item")
	]
	if not rows:
		frappe.throw(frappe._("Add at least one material to the design's BOM."))

	doc = frappe.get_doc(
		{
			"doctype": "Design",
			"design_name": design_name,
			"design_type": design_type,
			"design_style": design_style or None,
			"image": image or None,
			"materials": rows,
		}
	)
	doc.insert(ignore_permissions=True)
	return {
		"name": doc.name,
		"dmd_no": doc.dmd_no, "ps_no": doc.ps_no, "cs_no": doc.cs_no, "purity": doc.purity,
	}


def _profile_from_materials(mats):
	"""Line profile from a materials list (rows with item/qty/purity/weight): stones
	(by item.stone_type) -> dmd/ps/cs counts + carat weights; metal -> nett grams +
	gram-weighted purity. gross = metal grams; nett = gross - stone grams (1 ct = 0.2 g)."""
	out = {
		"dmd_no": 0, "ps_no": 0, "cs_no": 0,
		"dmd_weight": 0.0, "ps_weight": 0.0, "cs_weight": 0.0,
		"gross_weight": 0.0, "nett_weight": 0.0, "purity": 0.0,
	}
	rows = mats or []
	codes = list({m.get("item") for m in rows if m.get("item")})
	stype, purity_map = {}, {}
	if codes:
		for it in frappe.get_all("Item", filters={"name": ["in", codes]}, fields=["name", "stone_type", "purity_percentage"]):
			stype[it.name] = it.stone_type
			purity_map[it.name] = flt(it.purity_percentage)
	NO_BUCKET = {"Diamond": "dmd_no", "Precious Stone": "ps_no", "Color Stone": "cs_no"}
	WT_BUCKET = {"Diamond": "dmd_weight", "Precious Stone": "ps_weight", "Color Stone": "cs_weight"}
	metal_g = 0.0
	purity_num = 0.0
	metal_purities = []
	for m in rows:
		st = stype.get(m.get("item"))
		if st in NO_BUCKET:
			out[NO_BUCKET[st]] += int(m.get("qty") or 0)
			out[WT_BUCKET[st]] += flt(m.get("weight"))
		else:
			pu = purity_map.get(m.get("item")) or flt(m.get("purity"))
			metal_g += flt(m.get("weight"))
			purity_num += flt(m.get("weight")) * pu
			if pu:
				metal_purities.append(pu)
	stone_g = (out["dmd_weight"] + out["ps_weight"] + out["cs_weight"]) * 0.2
	out["gross_weight"] = round(metal_g, 3)
	out["nett_weight"] = round(max(metal_g - stone_g, 0.0), 3)
	if metal_g:
		out["purity"] = round(purity_num / metal_g, 3)
	elif metal_purities:
		out["purity"] = round(sum(metal_purities) / len(metal_purities), 3)
	for k in ("dmd_weight", "ps_weight", "cs_weight"):
		out[k] = round(out[k], 3)
	return out


@frappe.whitelist()
def recalc_bag_weights_from_bom(order_bag):
	"""Recompute a bag's gross/nett/purity/stones from its OWN BOM (plan) x qty.
	Purity is a ratio (unscaled). Manual action so it never clobbers manual edits."""
	bag = frappe.get_doc("Order Bag", order_bag)
	mats = [{"item": r.item, "qty": r.qty, "purity": r.purity, "weight": r.weight} for r in bag.bag_bom]
	p = _profile_from_materials(mats)
	q = max(int(bag.qty or 1), 1)
	bag.db_set({
		"gross_weight": round(p["gross_weight"] * q, 3),
		"nett_weight": round(p["nett_weight"] * q, 3),
		"purity": p["purity"],
		"dmd_no": int(p["dmd_no"]) * q, "dmd_weight": round(p["dmd_weight"] * q, 3),
		"ps_no": int(p["ps_no"]) * q, "ps_weight": round(p["ps_weight"] * q, 3),
		"cs_no": int(p["cs_no"]) * q, "cs_weight": round(p["cs_weight"] * q, 3),
	})
	frappe.db.commit()
	return {"order_bag": order_bag, "qty": q, **p}


@frappe.whitelist()
def get_design_profile(design):
	"""Full line profile derived from the design's BOM — used to auto-fill a Place
	Order line when a design is picked:
	  - stone counts (dmd/ps/cs no) and carat weights (dmd/ps/cs weight) by stone_type
	  - nett_weight (g) = total metal grams
	  - gross_weight (g) = metal grams + stone grams (1 ct = 0.2 g)
	  - purity (%) = gram-weighted average purity of the metal rows
	"""
	out = {
		"dmd_no": 0, "ps_no": 0, "cs_no": 0,
		"dmd_weight": 0.0, "ps_weight": 0.0, "cs_weight": 0.0,
		"gross_weight": 0.0, "nett_weight": 0.0, "purity": 0.0,
	}
	if not design or not frappe.db.exists("Design", design):
		return out

	mats = frappe.get_all(
		"Design BOM Item",
		filters={"parent": design, "parenttype": "Design"},
		fields=["item", "qty", "purity", "weight"],
	)
	return _profile_from_materials(mats)


def set_item_weight_uom(doc, method=None):
	"""Keep the Weight UOM unambiguous: a stone (has stone_type) is weighed in
	carats, everything else in grams. Hooked on Item validate."""
	if doc.get("stone_type"):
		doc.weight_unit = "Carat"
	elif not doc.get("weight_unit"):
		doc.weight_unit = "Gram"


@frappe.whitelist()
def get_item_stone_profile(item):
	"""Given a finished item, read its (default) BOM and tally the stone counts by
	stone type — Diamond -> dmd_no, Precious Stone -> ps_no, Color Stone -> cs_no.
	Used by the Place Order grid to auto-fill a line when an item is picked.

	Stone counts come from the BOM components whose Item has a `stone_type` set
	(uses the kept Item stone custom-fields). Weights aren't derivable from a plain
	BOM line, so they stay 0 here — that's the case for a richer Design master."""
	out = {
		"item_name": None, "bom": None,
		"dmd_no": 0, "dmd_weight": 0, "ps_no": 0, "ps_weight": 0, "cs_no": 0, "cs_weight": 0,
	}
	if not item:
		return out

	out["item_name"] = frappe.db.get_value("Item", item, "item_name")

	bom = frappe.db.get_value("BOM", {"item": item, "is_default": 1, "is_active": 1}, "name") or \
		frappe.db.get_value("BOM", {"item": item, "is_active": 1}, "name")
	out["bom"] = bom
	if not bom:
		return out

	rows = frappe.get_all("BOM Item", filters={"parent": bom}, fields=["item_code", "qty"])
	if not rows:
		return out

	bucket = {"Diamond": "dmd_no", "Precious Stone": "ps_no", "Color Stone": "cs_no"}
	codes = list({r.item_code for r in rows})
	stone_type = {
		i.name: i.stone_type
		for i in frappe.get_all("Item", filters={"name": ["in", codes]}, fields=["name", "stone_type"])
	}
	for r in rows:
		st = stone_type.get(r.item_code)
		if st in bucket:
			out[bucket[st]] += (r.qty or 0)
	return out


@frappe.whitelist()
def get_order_bag_images(order_bag):
	"""All image files for an Order Bag: native File attachments + the Attachments
	child-table images, deduped, image extensions only."""
	if not order_bag or not frappe.db.exists("Order Bag", order_bag):
		return []
	IMG = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp")
	files = frappe.get_all(
		"File",
		filters={"attached_to_doctype": "Order Bag", "attached_to_name": order_bag},
		fields=["file_url", "file_name"],
		order_by="creation desc",
	)
	bag = frappe.get_doc("Order Bag", order_bag)
	for a in bag.attachments or []:
		if a.image:
			files.append({"file_url": a.image, "file_name": a.title or a.image.split("/")[-1]})
	out, seen = [], set()
	for f in files:
		url = f.get("file_url")
		if not url or url in seen:
			continue
		if not url.lower().split("?")[0].endswith(IMG):
			continue
		seen.add(url)
		out.append({"file_url": url, "file_name": f.get("file_name") or url.split("/")[-1]})
	return out


@frappe.whitelist()
def get_order_bag_cards(names):
	"""Print-card data for a list of Order Bags: the bag's own fields plus its
	design's type/image and BOM materials. Used by the Print Order Bags page."""
	if isinstance(names, str):
		names = json.loads(names or "[]")
	cards = []
	for nm in names or []:
		if not frappe.db.exists("Order Bag", nm):
			continue
		b = frappe.get_doc("Order Bag", nm)
		dtype = dstyle = dimg = ""
		materials = []
		if b.design and frappe.db.exists("Design", b.design):
			d = frappe.get_doc("Design", b.design)
			dtype, dstyle, dimg = d.design_type, d.design_style, d.image
			for m in d.materials:
				materials.append({"item": m.item, "purity": m.purity, "qty": m.qty, "weight": m.weight, "uom": m.uom})
		cards.append({
			"name": b.name, "job_order": b.job_order, "design": b.design,
			"design_type": dtype, "design_style": dstyle, "image": dimg,
			"size": b.size, "qty": b.qty, "location": b.location,
			"customer": b.customer, "salesman": b.salesman, "order_type": b.order_type,
			"customer_order_id": b.customer_order_id,
			"order_date": frappe.utils.formatdate(b.order_date, "dd-mm-yyyy") if b.order_date else "",
			"due_date": frappe.utils.formatdate(b.due_date, "dd-mm-yyyy") if b.due_date else "",
			"gross_weight": b.gross_weight, "nett_weight": b.nett_weight, "purity": b.purity,
			"dmd_no": b.dmd_no, "dmd_weight": b.dmd_weight, "ps_no": b.ps_no, "ps_weight": b.ps_weight,
			"cs_no": b.cs_no, "cs_weight": b.cs_weight, "narration": b.narration,
			"materials": materials,
		})
	return cards


def _all_locations():
	from jewelima.jewelima.benches import BENCH_DOCTYPE

	return list(BENCH_DOCTYPE.keys())


def _transfer_allowed(roles, from_location, to_location):
	"""Role-based from->to permission. Dormant (allow all) until any Transfer Rule
	exists; System Manager always allowed. A rule with a blank from/to = wildcard."""
	if "System Manager" in roles:
		return True
	rules = frappe.get_all("Transfer Rule", fields=["role", "from_location", "to_location"])
	if not rules:
		return True
	for r in rules:
		if r.role in roles and (not r.from_location or r.from_location == from_location) and (not r.to_location or r.to_location == to_location):
			return True
	return False


@frappe.whitelist()
def allowed_to_locations(from_location):
	"""Destinations the current user may transfer to from `from_location` (for the
	page's dropdown). All locations if rules are dormant or the user is admin."""
	roles = set(frappe.get_roles())
	rules = frappe.get_all("Transfer Rule", fields=["role", "from_location", "to_location"])
	all_locs = _all_locations()
	if not rules or "System Manager" in roles:
		return all_locs
	allowed = set()
	for r in rules:
		if r.role in roles and (not r.from_location or r.from_location == from_location):
			allowed.update(all_locs if not r.to_location else [r.to_location])
	return [loc for loc in all_locs if loc in allowed]


@frappe.whitelist()
def get_bench_dashboard(bench=None):
	"""Bench dashboard data. No bench -> overview of all benches (cards present +
	Issued/Receipted for work benches). With a bench -> that bench's counts plus the
	list of cards currently there."""
	from jewelima.jewelima.benches import BENCH_DOCTYPE, ISSUE_RECEIPT_LOCATIONS, resolve_location

	def stats(loc):
		dt = BENCH_DOCTYPE.get(loc)
		has_ir = loc in ISSUE_RECEIPT_LOCATIONS
		# cards CURRENTLY at this bench (a card that moved on no longer counts)
		bags = frappe.get_all("Order Bag", filters={"location": loc}, pluck="name")
		o = {"location": loc, "label": dt, "has_ir": has_ir, "present": len(bags), "in_queue": 0, "issued": 0, "receipted": 0}
		if dt and bags and frappe.db.exists("DocType", dt):
			o["in_queue"] = frappe.db.count(dt, {"order_bag": ["in", bags], "status": "In Queue"})
			if has_ir:  # Issued/Received only at benches that actually issue & receipt
				o["issued"] = frappe.db.count(dt, {"order_bag": ["in", bags], "status": "Issued"})
				o["receipted"] = frappe.db.count(dt, {"order_bag": ["in", bags], "status": "Receipted"})
		return o

	if not bench:
		return {"overview": [stats(loc) for loc in BENCH_DOCTYPE]}

	loc = resolve_location(bench)
	if not loc:
		return {}
	out = stats(loc)
	dt = BENCH_DOCTYPE.get(loc)
	cards = []
	for b in frappe.get_all("Order Bag", filters={"location": loc}, fields=["name", "design", "qty", "due_date"], order_by="due_date asc"):
		rec = None
		if dt and frappe.db.exists("DocType", dt):
			r = frappe.get_all(dt, filters={"order_bag": b.name}, fields=["status", "employee", "weight_out"], order_by="creation desc", limit=1)
			rec = r[0] if r else None
		cards.append({
			"name": b.name, "design": b.design, "qty": b.qty, "due_date": b.due_date,
			"status": (rec or {}).get("status") or "—",
			"employee": (rec or {}).get("employee") or "",
			"weight_out": (rec or {}).get("weight_out") or 0,
		})
	out["cards"] = cards
	return out


@frappe.whitelist()
def get_bag_stage_history(order_bag):
	"""Every bench this bag passed through, chronologically: who worked it, status,
	times, weight in/out and loss. Aggregated across the per-bench doctypes."""
	from jewelima.jewelima.benches import BENCH_DOCTYPE

	rows = []
	for dt in dict.fromkeys(BENCH_DOCTYPE.values()):
		if not frappe.db.exists("DocType", dt):
			continue
		for r in frappe.get_all(
			dt, filters={"order_bag": order_bag},
			fields=["name", "status", "employee", "time_in", "time_out", "issued_at", "receipted_at", "weight_out", "weight_in", "loss", "creation"],
		):
			r["bench"] = dt
			rows.append(r)
	rows.sort(key=lambda x: (x.get("time_in") or x.get("creation")))
	emps = list({r["employee"] for r in rows if r.get("employee")})
	names = {}
	if emps:
		names = {e.name: e.employee_name for e in frappe.get_all("Employee", filters={"name": ["in", emps]}, fields=["name", "employee_name"])}
	for r in rows:
		r["employee_name"] = names.get(r.get("employee")) or r.get("employee") or ""
	return rows


@frappe.whitelist()
def get_bag_transfer_info(order_bag):
	"""Scan lookup for the Transfer page: location/design/qty/due plus the gross &
	nett weight the card ACTUALLY holds right now (from the ledger; 0 if empty)."""
	bag = frappe.db.get_value("Order Bag", order_bag, ["location", "design", "qty", "due_date"], as_dict=True)
	if not bag:
		return {}
	c = get_bag_contents(order_bag)
	return {
		"location": bag.location, "design": bag.design, "qty": bag.qty, "due_date": bag.due_date,
		"gross": round(flt(c.get("gross_weight")), 3), "nett": round(flt(c.get("gold_grams")), 3),
	}


@frappe.whitelist()
def transfer_order_bag(order_bag, to_location, remarks=None):
	"""The ONLY way an Order Bag changes location: records an Order Bag Transfer
	(from -> to, time, who) and updates the bag's read-only location."""
	if not frappe.db.exists("Order Bag", order_bag):
		frappe.throw(frappe._("Order Bag {0} not found.").format(order_bag))
	bag = frappe.get_doc("Order Bag", order_bag)
	from_location = bag.location or ""
	if from_location == to_location:
		frappe.throw(frappe._("{0} is already at {1}.").format(order_bag, to_location))
	if not _transfer_allowed(set(frappe.get_roles()), from_location, to_location):
		frappe.throw(frappe._("You don't have permission to move {0} from {1} to {2}.").format(order_bag, from_location or "—", to_location))
	t = frappe.get_doc({
		"doctype": "Order Bag Transfer",
		"order_bag": order_bag,
		"from_location": from_location or None,
		"to_location": to_location,
		"transfer_time": frappe.utils.now_datetime(),
		"transferred_by": frappe.session.user,
		"remarks": remarks,
	}).insert(ignore_permissions=True)
	bag.db_set("location", to_location)
	# the card is leaving its current bench — close out that bench's record so it
	# stops counting as present/queue/issued/receipted there (status -> Completed).
	try:
		from jewelima.jewelima.benches import bench_doctype, on_bag_arrival

		fdt = bench_doctype(from_location)
		if fdt and frappe.db.exists("DocType", fdt):
			old = frappe.get_all(fdt, filters={"order_bag": order_bag, "status": ["!=", "Completed"]}, order_by="creation desc", limit=1, pluck="name")
			if old:
				frappe.db.set_value(fdt, old[0], {"status": "Completed", "time_out": frappe.utils.now_datetime()})
		# create the destination bench's record (only if that bench doctype exists yet)
		on_bag_arrival(order_bag, to_location)
	except Exception:
		frappe.log_error(frappe.get_traceback(), "bench record transition failed")
	frappe.db.commit()
	return {"transfer": t.name, "from_location": from_location, "to_location": to_location}


@frappe.whitelist()
def get_bag_contents(order_bag):
	"""Net materials currently held by an Order Bag (summed from the Bag Material
	Ledger) plus the gross weight = gold grams + stone carats * 0.2."""
	out = {"items": [], "gold_grams": 0.0, "stone_carats": 0.0, "gross_weight": 0.0}
	if not order_bag:
		return out
	rows = frappe.get_all(
		"Bag Material Ledger",
		filters={"order_bag": order_bag},
		fields=["item", "uom", "direction", "qty"],
	)
	net = {}
	for r in rows:
		sign = 1 if (r.direction or "In") == "In" else -1
		e = net.setdefault(r.item, {"uom": r.uom or "", "qty": 0.0})
		e["qty"] += sign * flt(r.qty)
	for item, e in net.items():
		qty = round(e["qty"], 3)
		if abs(qty) < 0.0005:
			continue
		out["items"].append({"item": item, "uom": e["uom"], "qty": qty})
		if e["uom"] == "Carat":
			out["stone_carats"] += qty
		else:
			out["gold_grams"] += qty
	out["gold_grams"] = round(out["gold_grams"], 3)
	out["stone_carats"] = round(out["stone_carats"], 3)
	out["gross_weight"] = round(out["gold_grams"] + out["stone_carats"] * 0.2, 3)
	return out


def _bag_ledger(order_bag, item, direction, qty, entry_type, bench=None, employee=None, remarks=None, reference=None):
	"""Write one Bag Material Ledger row (the per-bag material truth)."""
	if not frappe.db.exists("Order Bag", order_bag):
		frappe.throw(frappe._("Order Bag {0} not found.").format(order_bag))
	if not item or not frappe.db.exists("Item", item):
		frappe.throw(frappe._("Item {0} not found.").format(item))
	qty = flt(qty)
	if qty <= 0:
		frappe.throw(frappe._("Weight / qty must be greater than zero."))
	doc = frappe.get_doc({
		"doctype": "Bag Material Ledger",
		"order_bag": order_bag, "item": item, "direction": direction, "qty": qty,
		"entry_type": entry_type, "bench": bench or None, "employee": employee or None,
		"datetime": frappe.utils.now_datetime(), "reference": reference, "remarks": remarks,
	}).insert(ignore_permissions=True)
	frappe.db.commit()
	return doc.name


@frappe.whitelist()
def add_weight(order_bag, item, qty, bench=None, remarks=None):
	"""Give gold (grams) to a bag — the Casting 'add weight' action. Records the
	per-bag ledger row AND moves the gold as real stock: Store -> In Bags pool."""
	from jewelima.setup import IN_PRODUCTION_WAREHOUSE, RAW_MATERIALS_STORE

	name = _bag_ledger(order_bag, item, "In", qty, "Gold Issue", bench=bench, remarks=remarks)
	_stock_move(item, qty, _wh(RAW_MATERIALS_STORE), _wh(IN_PRODUCTION_WAREHOUSE))
	return {"ledger": name, **get_bag_contents(order_bag)}


@frappe.whitelist()
def issue_stones(order_bag, item, qty, bench=None, remarks=None):
	"""Issue stones (carats) into a bag — done before the piece goes to work."""
	name = _bag_ledger(order_bag, item, "In", qty, "Stone Issue", bench=bench, remarks=remarks)
	return {"ledger": name, **get_bag_contents(order_bag)}


@frappe.whitelist()
def book_loss(order_bag, item, qty, bench=None, employee=None, remarks=None):
	"""Record metal loss out of a bag (the out-minus-in difference at a bench).
	Per-bag ledger row AND real stock: In Bags pool -> '<bench> -LOSS' warehouse.
	`bench` may be the UPPERCASE location or the Title bench name."""
	from jewelima.jewelima.benches import BENCH_DOCTYPE
	from jewelima.setup import IN_PRODUCTION_WAREHOUSE

	name = _bag_ledger(order_bag, item, "Out", qty, "Loss", bench=bench, employee=employee, remarks=remarks)
	bench_title = BENCH_DOCTYPE.get(bench, bench) if bench else None
	loss_wh = _wh("{0} -LOSS".format(bench_title)) if bench_title else None
	_stock_move(item, qty, _wh(IN_PRODUCTION_WAREHOUSE), loss_wh)
	return {"ledger": name, **get_bag_contents(order_bag)}


# ---------------------------------------------------------------------------
# Weight Add / Weight Reduce screens (single card, warehouse-aware).
# ---------------------------------------------------------------------------
def _recompute_bag_from_contents(order_bag):
	"""Sync the bag's gross/nett to its ACTUAL contents (the ledger)."""
	c = get_bag_contents(order_bag)
	frappe.db.set_value("Order Bag", order_bag, {
		"gross_weight": round(flt(c.get("gross_weight")), 3),
		"nett_weight": round(flt(c.get("gold_grams")), 3),
	})


@frappe.whitelist()
def get_card_for_weight(order_bag):
	"""Header + materials (the bag's BOM merged with what it actually holds) for the
	Weight Add / Reduce screens."""
	bag = frappe.db.get_value(
		"Order Bag", order_bag,
		["name", "design", "qty", "size", "purity", "gross_weight", "nett_weight",
		 "job_order", "customer", "salesman", "order_date", "is_finished"],
		as_dict=True,
	)
	if not bag:
		return {}
	item = item_name = None
	if bag.design:
		item = frappe.db.get_value("Design", bag.design, "item")
		if item:
			item_name = frappe.db.get_value("Item", item, "item_name")
	cur = {c["item"]: c for c in get_bag_contents(order_bag)["items"]}
	mats = []
	for r in frappe.get_all(
		"Order Bag BOM Item", filters={"parent": order_bag, "parenttype": "Order Bag"},
		fields=["item", "item_name", "purity", "uom", "stone_type", "qty", "weight"], order_by="idx asc",
	):
		mats.append({
			"item": r.item, "item_name": r.item_name, "purity": r.purity, "uom": r.uom, "stone_type": r.stone_type,
			"bom_qty": r.qty, "bom_weight": r.weight,
			"cur_qty": 0, "cur_weight": flt((cur.get(r.item) or {}).get("qty")),
		})
	return {"bag": bag, "item": item, "item_name": item_name, "materials": mats}


@frappe.whitelist()
def weight_add(order_bag, lines, from_warehouse=None):
	"""Add real weight to a card: ledger In + stock move from_warehouse -> In Bags,
	per line {item, weight}. Source defaults to the Raw Materials Store."""
	from jewelima.setup import IN_PRODUCTION_WAREHOUSE, RAW_MATERIALS_STORE

	if isinstance(lines, str):
		lines = json.loads(lines or "[]")
	if frappe.db.get_value("Order Bag", order_bag, "is_finished"):
		frappe.throw(frappe._("{0} is finished — its materials are locked.").format(order_bag))
	src = _wh(from_warehouse) if from_warehouse else _wh(RAW_MATERIALS_STORE)
	tgt = _wh(IN_PRODUCTION_WAREHOUSE)
	added = 0.0
	for ln in lines or []:
		item, wt = ln.get("item"), flt(ln.get("weight"))
		if not item or wt <= 0:
			continue
		_bag_ledger(order_bag, item, "In", wt, "Weight Add", remarks=ln.get("remarks"))
		_stock_move(item, wt, src, tgt)
		added += wt
	_recompute_bag_from_contents(order_bag)
	frappe.db.commit()
	return {"added": round(added, 3), **get_bag_contents(order_bag)}


@frappe.whitelist()
def weight_reduce(order_bag, lines, to_warehouse=None):
	"""Remove weight from a card: ledger Out + stock move In Bags -> to_warehouse,
	per line {item, weight}. Destination defaults to the Raw Materials Store."""
	from jewelima.setup import IN_PRODUCTION_WAREHOUSE, RAW_MATERIALS_STORE

	if isinstance(lines, str):
		lines = json.loads(lines or "[]")
	if frappe.db.get_value("Order Bag", order_bag, "is_finished"):
		frappe.throw(frappe._("{0} is finished — its materials are locked.").format(order_bag))
	src = _wh(IN_PRODUCTION_WAREHOUSE)
	tgt = _wh(to_warehouse) if to_warehouse else _wh(RAW_MATERIALS_STORE)
	removed = 0.0
	for ln in lines or []:
		item, wt = ln.get("item"), flt(ln.get("weight"))
		if not item or wt <= 0:
			continue
		_bag_ledger(order_bag, item, "Out", wt, "Weight Reduce", remarks=ln.get("remarks"))
		_stock_move(item, wt, src, tgt)
		removed += wt
	_recompute_bag_from_contents(order_bag)
	frappe.db.commit()
	return {"removed": round(removed, 3), **get_bag_contents(order_bag)}


@frappe.whitelist()
def save_bag_bom(order_bag, rows):
	"""Replace a card's BOM (editable plan) from the Weight Add screen. Blocked once
	the ornament is made."""
	if isinstance(rows, str):
		rows = json.loads(rows or "[]")
	bag = frappe.get_doc("Order Bag", order_bag)
	if bag.is_finished:
		frappe.throw(frappe._("The BOM is locked — the ornament for {0} has already been made.").format(order_bag))
	bag.set("bag_bom", [])
	for r in rows or []:
		if not r.get("item"):
			continue
		bag.append("bag_bom", {"item": r.get("item"), "qty": r.get("qty") or 0, "weight": r.get("weight") or 0})
	bag.save(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": 1, "rows": len(bag.bag_bom)}


# ---------------------------------------------------------------------------
# Job Work — the bench Issue / Receipt screens (scan-driven, batch).
# ---------------------------------------------------------------------------
def _current_bench_record(dt, order_bag):
	"""The latest bench record for a bag at a bench, or None."""
	if not dt or not frappe.db.exists("DocType", dt):
		return None
	recs = frappe.get_all(dt, filters={"order_bag": order_bag}, order_by="creation desc", limit=1, pluck="name")
	return recs[0] if recs else None


@frappe.whitelist()
def get_bench_card(order_bag):
	"""Job Work scan lookup: the bag's location, its current bench record + status,
	and the gold grams it holds (the 'weight out')."""
	from jewelima.jewelima.benches import bench_doctype

	bag = frappe.db.get_value("Order Bag", order_bag, ["location", "design", "qty"], as_dict=True)
	if not bag:
		return {}
	dt = bench_doctype(bag.location)
	rec = None
	if dt and frappe.db.exists("DocType", dt):
		recs = frappe.get_all(
			dt, filters={"order_bag": order_bag},
			fields=["name", "status", "employee", "weight_out", "weight_in", "loss"],
			order_by="creation desc", limit=1,
		)
		rec = recs[0] if recs else None
	return {
		"order_bag": order_bag, "location": bag.location, "design": bag.design, "qty": bag.qty,
		"doctype": dt, "record": rec, "status": (rec or {}).get("status"),
		"gold": flt(get_bag_contents(order_bag)["gold_grams"]),
	}


@frappe.whitelist()
def issue_bench_cards(names, location, employee=None):
	"""Issue a batch of bags at one bench: status -> Issued, snapshot weight_out
	(gold grams), stamp issued_at (+ employee if given). Skips already-Issued cards;
	with an employee, bumps their held-weight balance."""
	from jewelima.jewelima.benches import bench_doctype

	if isinstance(names, str):
		names = json.loads(names or "[]")
	dt = bench_doctype(location)
	now = frappe.utils.now_datetime()
	done, errors = [], []
	for nm in names or []:
		try:
			rec = _current_bench_record(dt, nm)
			if not rec:
				errors.append({"name": nm, "error": frappe._("No bench record at {0}").format(location)})
				continue
			doc = frappe.get_doc(dt, rec)
			if doc.status == "Issued":
				errors.append({"name": nm, "error": frappe._("Already issued")})
				continue
			gold = flt(get_bag_contents(nm)["gold_grams"])
			doc.status = "Issued"
			doc.weight_out = gold
			doc.issued_at = now
			if not doc.time_in:
				doc.time_in = now
			if employee:
				doc.employee = employee
			doc.save(ignore_permissions=True)
			if employee:
				_adjust_employee_balance(employee, gold)
			done.append(nm)
		except Exception as e:
			errors.append({"name": nm, "error": str(e)})
	frappe.db.commit()
	return {"count": len(done), "done": done, "errors": errors}


@frappe.whitelist()
def receipt_bench_cards(lines, location, employee=None):
	"""Receive a batch of issued bags at one bench (one employee). Per line
	{order_bag, weight_in}: loss = weight_out - weight_in, status -> Receipted,
	loss booked (per-bag ledger + In Bags -> '<bench> -LOSS' stock)."""
	from jewelima.jewelima.benches import bench_doctype

	if isinstance(lines, str):
		lines = json.loads(lines or "[]")
	dt = bench_doctype(location)
	now = frappe.utils.now_datetime()
	done, errors, total_loss = [], [], 0.0
	for ln in lines or []:
		nm = ln.get("order_bag")
		win = flt(ln.get("weight_in"))
		try:
			rec = _current_bench_record(dt, nm)
			if not rec:
				errors.append({"name": nm, "error": frappe._("No bench record")})
				continue
			doc = frappe.get_doc(dt, rec)
			if doc.status != "Issued":
				errors.append({"name": nm, "error": frappe._("Not in Issued state")})
				continue
			wout = flt(doc.weight_out)
			loss = max(wout - win, 0.0)
			issue_emp = doc.employee
			if issue_emp:
				_adjust_employee_balance(issue_emp, -wout)  # held weight returns
			doc.employee = employee or issue_emp
			doc.weight_in = win
			doc.loss = loss
			doc.status = "Receipted"
			doc.receipted_at = now
			doc.time_out = now
			doc.save(ignore_permissions=True)
			if loss > 0:
				book_loss(nm, _bag_gold_item(nm), loss, bench=location, employee=doc.employee)
			total_loss += loss
			done.append({"name": nm, "loss": round(loss, 3)})
		except Exception as e:
			errors.append({"name": nm, "error": str(e)})
	frappe.db.commit()
	return {"count": len(done), "done": done, "errors": errors, "total_loss": round(total_loss, 3), "employee": employee}


def _bag_gold_item(order_bag):
	"""The bag's main metal item (the largest non-Carat holding) — loss is booked here."""
	golds = [it for it in get_bag_contents(order_bag)["items"] if it["uom"] != "Carat" and it["qty"] > 0]
	golds.sort(key=lambda x: -x["qty"])
	return golds[0]["item"] if golds else None


def _adjust_employee_balance(employee, delta):
	"""Running total of weight currently out with an employee (informational)."""
	if frappe.db.exists("Employee Metal Balance", employee):
		bal = frappe.get_doc("Employee Metal Balance", employee)
	else:
		bal = frappe.get_doc({"doctype": "Employee Metal Balance", "employee": employee, "current_weight": 0}).insert(ignore_permissions=True)
	bal.db_set("current_weight", round(flt(bal.current_weight) + flt(delta), 3))
	bal.db_set("last_updated", frappe.utils.now_datetime())


@frappe.whitelist()
def issue_to_employee(order_bag, employee, weight_out, bench=None, item=None):
	"""Issue a bag's piece to an employee to work (time tracked). Bumps the
	employee's running weight total. Loss is settled on receipt."""
	if not frappe.db.exists("Order Bag", order_bag):
		frappe.throw(frappe._("Order Bag {0} not found.").format(order_bag))
	if not employee or not frappe.db.exists("Employee", employee):
		frappe.throw(frappe._("Employee {0} not found.").format(employee))
	weight_out = flt(weight_out)
	if weight_out <= 0:
		frappe.throw(frappe._("Weight out must be greater than zero."))
	ei = frappe.get_doc({
		"doctype": "Employee Issue",
		"order_bag": order_bag, "employee": employee, "bench": bench or None,
		"item": item or _bag_gold_item(order_bag),
		"status": "Issued", "weight_out": weight_out, "time_out": frappe.utils.now_datetime(),
	}).insert(ignore_permissions=True)
	_adjust_employee_balance(employee, weight_out)
	frappe.db.commit()
	return {"issue": ei.name, "employee": employee, "weight_out": weight_out}


@frappe.whitelist()
def receive_from_employee(issue, weight_in, remarks=None):
	"""Receive the piece back. Loss = weight_out - weight_in, booked to the bag's
	metal (via book_loss). Clears the employee's running total."""
	ei = frappe.get_doc("Employee Issue", issue)
	if ei.status != "Issued":
		frappe.throw(frappe._("{0} is already returned.").format(issue))
	weight_in = flt(weight_in)
	loss = round(max(flt(ei.weight_out) - weight_in, 0), 3)
	ei.db_set("weight_in", weight_in)
	ei.db_set("time_in", frappe.utils.now_datetime())
	ei.db_set("loss", loss)
	ei.db_set("status", "Returned")
	if remarks:
		ei.db_set("remarks", remarks)
	_adjust_employee_balance(ei.employee, -flt(ei.weight_out))
	if loss > 0 and ei.item:
		_bag_ledger(ei.order_bag, ei.item, "Out", loss, "Loss", bench=ei.bench, employee=ei.employee, reference=ei.name)
	frappe.db.commit()
	return {"issue": ei.name, "loss": loss, **get_bag_contents(ei.order_bag)}


@frappe.whitelist()
def convert_to_ornament(order_bag):
	"""The piece is finished: consume the bag's remaining materials (zero it out),
	one Convert (Out) row per held item. Finished-good stock posting is added with
	the coarse-stock wiring."""
	from jewelima.setup import IN_PRODUCTION_WAREHOUSE

	c = get_bag_contents(order_bag)
	held = [it for it in c["items"] if it["qty"] > 0]
	if not held:
		frappe.throw(frappe._("{0} holds no materials to convert.").format(order_bag))
	in_bags, fg = _wh(IN_PRODUCTION_WAREHOUSE), _wh("Finished Goods")
	for it in held:
		_bag_ledger(order_bag, it["item"], "Out", it["qty"], "Convert")
		# gold drains from the In Bags pool into Finished Goods (stones aren't pooled)
		if not frappe.db.get_value("Item", it["item"], "stone_type"):
			_stock_move(it["item"], it["qty"], in_bags, fg)
	frappe.db.set_value("Order Bag", order_bag, "is_finished", 1)  # locks the BOM (plan)
	frappe.db.commit()
	return {"order_bag": order_bag, "consumed": held}


@frappe.whitelist()
def transfer_order_bags(names, to_location, remarks=None):
	"""Transfer a batch of Order Bags (all collected at one source) to a destination."""
	if isinstance(names, str):
		names = json.loads(names or "[]")
	done, errors = [], []
	for nm in names or []:
		try:
			transfer_order_bag(nm, to_location, remarks)
			done.append(nm)
		except Exception as e:
			errors.append({"name": nm, "error": str(e)})
	return {"transferred": done, "count": len(done), "errors": errors}
