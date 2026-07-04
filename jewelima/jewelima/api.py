# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
"""Whitelisted server endpoints the Jewelima pages call over AJAX."""

import json

import frappe
from frappe.utils import cint, flt


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
def melt_gold(warehouse, output_item, output_weight, inputs):
	"""Convert fine gold + alloy into a karat gold (e.g. 999 -> 18KPG) in ONE warehouse.
	Repack Stock Entry: consume each input (gold, alloy) and produce `output_weight` grams
	of `output_item` in the same warehouse. inputs = [{item, weight}, ...]. Output weight
	may be less than total input (the difference is melt loss)."""
	if isinstance(inputs, str):
		inputs = json.loads(inputs or "[]")
	if not warehouse or not frappe.db.exists("Warehouse", warehouse):
		frappe.throw(frappe._("Pick a valid warehouse."))
	out_w = flt(output_weight)
	if not output_item or out_w <= 0:
		frappe.throw(frappe._("Choose what to create and a positive output weight."))

	src, total_in = [], 0.0
	for i in inputs or []:
		item, w = i.get("item"), flt(i.get("weight"))
		if not item or w <= 0:
			continue
		src.append({
			"item_code": item, "qty": w,
			"uom": frappe.db.get_value("Item", item, "stock_uom") or "Gram",
			"s_warehouse": warehouse, "allow_zero_valuation_rate": 1,
		})
		total_in += w
	if not src:
		frappe.throw(frappe._("Add at least one input (gold + alloy)."))
	if out_w > total_in + 0.0005:
		frappe.throw(frappe._("Output ({0} g) cannot exceed the total input ({1} g).").format(out_w, round(total_in, 3)))

	# every input must actually be in stock in this warehouse
	for s in src:
		avail = flt(frappe.db.get_value("Bin", {"item_code": s["item_code"], "warehouse": warehouse}, "actual_qty"))
		if s["qty"] > avail + 0.0005:
			frappe.throw(frappe._("Only {0} of {1} in stock here — can't melt {2}.").format(round(avail, 3), s["item_code"], s["qty"]))

	se = frappe.get_doc({
		"doctype": "Stock Entry",
		"stock_entry_type": "Repack",
		"company": _company(),
		"items": src + [{
			"item_code": output_item, "qty": out_w,
			"uom": frappe.db.get_value("Item", output_item, "stock_uom") or "Gram",
			"t_warehouse": warehouse, "allow_zero_valuation_rate": 1,
		}],
	})
	se.flags.ignore_permissions = True
	se.insert()
	se.submit()
	frappe.db.commit()
	return {"name": se.name, "total_in": round(total_in, 3), "output": round(out_w, 3), "loss": round(total_in - out_w, 3)}


@frappe.whitelist()
def get_melt_stock(warehouse):
	"""Non-empty stock in a warehouse for the Melting screen: item, group, purity, weight
	(balance) and pure gold grams (weight x purity% for gram-weighted metals; 0 for stones).
	Sorted by pure desc. Returns rows + gross/pure totals (grams only)."""
	if not warehouse or not frappe.db.exists("Warehouse", warehouse):
		return {"rows": [], "total_weight": 0, "total_pure": 0}
	rows, tw, tp = [], 0.0, 0.0
	for b in frappe.get_all("Bin", filters={"warehouse": warehouse, "actual_qty": [">", 0]}, fields=["item_code", "actual_qty", "stock_uom"]):
		m = frappe.db.get_value("Item", b.item_code, ["item_name", "item_group", "purity_percentage", "stone_type"], as_dict=True) or {}
		wt = flt(b.actual_qty)
		pure = wt * flt(m.get("purity_percentage")) / 100.0 if not m.get("stone_type") else 0.0
		rows.append({
			"item": b.item_code, "item_name": m.get("item_name") or b.item_code,
			"item_group": m.get("item_group") or "", "purity": flt(m.get("purity_percentage")),
			"weight": round(wt, 3), "uom": b.stock_uom or "Gram", "pure": round(pure, 3),
		})
		if (b.stock_uom or "Gram") == "Gram":
			tw += wt
		tp += pure
	rows.sort(key=lambda r: -r["pure"])
	return {"rows": rows, "total_weight": round(tw, 3), "total_pure": round(tp, 3)}


@frappe.whitelist()
def get_warehouse_flags():
	"""All toggleable Warehouse flags (custom Check fields) + every leaf warehouse's current
	values. Powers the Warehouse Management page (flags only — no warehouse create/edit)."""
	flags = frappe.get_all(
		"Custom Field", filters={"dt": "Warehouse", "fieldtype": "Check"},
		fields=["fieldname", "label"], order_by="idx",
	)
	fieldnames = [f.fieldname for f in flags]
	warehouses = frappe.get_all(
		"Warehouse", filters={"is_group": 0},
		fields=["name", "warehouse_name"] + fieldnames, order_by="warehouse_name",
	)
	return {"flags": flags, "warehouses": warehouses}


@frappe.whitelist()
def set_warehouse_flag(warehouse, flag, value):
	"""Toggle ONE flag (a custom Check field) on a warehouse. Flags only — nothing else."""
	frappe.only_for(["System Manager", "Stock Manager"])
	if not frappe.get_all("Custom Field", filters={"dt": "Warehouse", "fieldtype": "Check", "fieldname": flag}, limit=1):
		frappe.throw(frappe._("Unknown warehouse flag: {0}").format(flag))
	if not warehouse or not frappe.db.exists("Warehouse", warehouse):
		frappe.throw(frappe._("No such warehouse."))
	val = 1 if frappe.utils.cint(value) else 0
	frappe.db.set_value("Warehouse", warehouse, flag, val)
	frappe.db.commit()
	return {"ok": 1, "warehouse": warehouse, "flag": flag, "value": val}


@frappe.whitelist()
def transfer_stock(from_warehouse, to_warehouse, items):
	"""Move stock between two warehouses (Material Transfer). items = [{item, weight}].
	Refuses to transfer more than is available in the source for any item."""
	if isinstance(items, str):
		items = json.loads(items or "[]")
	if not from_warehouse or not frappe.db.exists("Warehouse", from_warehouse):
		frappe.throw(frappe._("Pick a valid source warehouse."))
	if not to_warehouse or not frappe.db.exists("Warehouse", to_warehouse):
		frappe.throw(frappe._("Pick a valid destination warehouse."))
	if from_warehouse == to_warehouse:
		frappe.throw(frappe._("Source and destination warehouses must be different."))

	rows = []
	for i in items or []:
		item, wt = i.get("item"), flt(i.get("weight"))
		if not item or wt <= 0:
			continue
		avail = flt(frappe.db.get_value("Bin", {"item_code": item, "warehouse": from_warehouse}, "actual_qty"))
		if wt > avail + 0.0005:
			frappe.throw(frappe._("Only {0} of {1} in {2} — can't transfer {3}.").format(round(avail, 3), item, from_warehouse, wt))
		rows.append({
			"item_code": item, "qty": wt,
			"uom": frappe.db.get_value("Item", item, "stock_uom") or "Gram",
			"s_warehouse": from_warehouse, "t_warehouse": to_warehouse, "allow_zero_valuation_rate": 1,
		})
	if not rows:
		frappe.throw(frappe._("Add at least one item with a weight to transfer."))

	se = frappe.get_doc({
		"doctype": "Stock Entry", "stock_entry_type": "Material Transfer",
		"company": _company(), "items": rows,
	})
	se.flags.ignore_permissions = True
	se.insert()
	se.submit()
	frappe.db.commit()
	return {"name": se.name, "count": len(rows)}


@frappe.whitelist()
def post_raw_material_purchase(supplier, warehouse, posting_date=None, items=None):
	"""Create + submit a Purchase Receipt for raw materials (from the Purchase
	Raw Material page). Stock lands in `warehouse`. Returns the PR name."""
	from frappe.utils import today

	if isinstance(items, str):
		items = json.loads(items or "[]")
	items = items or []

	# stock qty is the WEIGHT (carats for stones, grams for metal). Stones also carry a
	# piece count, stored on the PR line for reference (it does not affect stock).
	codes = list({i.get("item") for i in items if i.get("item")})
	stype = {}
	if codes:
		for it in frappe.get_all("Item", filters={"name": ["in", codes]}, fields=["name", "stone_type"]):
			stype[it.name] = it.stone_type or ""

	rows = []
	for i in items:
		item = i.get("item")
		weight = flt(i.get("weight"))
		if not item or weight <= 0:
			continue
		count = cint(i.get("count"))
		if stype.get(item) and count <= 0:
			frappe.throw(frappe._("{0} is a stone — enter the piece count (Qty).").format(item))
		row = {"item_code": item, "qty": weight, "rate": flt(i.get("rate")), "warehouse": warehouse}
		if stype.get(item):
			row["custom_stone_count"] = count
		else:
			row["custom_purity"] = flt(i.get("purity"))
		rows.append(row)
	if not rows:
		frappe.throw(frappe._("Add at least one item with a weight."))
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
def get_order_defaults():
	"""Global Place Order defaults from the Jewelima Order Settings single."""
	s = frappe.get_cached_doc("Jewelima Order Settings")
	return {
		"days": frappe.utils.cint(s.default_days) or 0,
		"order_type": s.default_order_type or None,
		"salesman": s.default_salesman or None,
	}


# --- Order dropdown masters (Setup -> Types & Salesmen) ----------------------------
# kind "type" = Order Type (jewelima master, retire via `disabled`);
# kind "salesman" = Sales Person (ERPNext tree master, retire via `enabled`).

def _order_master_conf(kind):
	if kind == "type":
		return {"doctype": "Order Type", "bag_field": "order_type", "off_field": "disabled", "off_value": 1}
	if kind == "salesman":
		return {"doctype": "Sales Person", "bag_field": "salesman", "off_field": "enabled", "off_value": 0}
	frappe.throw(frappe._("Unknown master kind: {0}").format(kind))


def _active_bags_using(bag_field, value):
	"""Order Bags in an ACTIVE state (not Cancelled/Sold) carrying this value."""
	return frappe.db.sql(
		f"""SELECT COUNT(*) FROM `tabOrder Bag`
		    WHERE `{bag_field}` = %s AND IFNULL(stock_status, '') NOT IN ('Cancelled', 'Sold')""",
		(value,),
	)[0][0]


@frappe.whitelist()
def get_order_masters():
	"""Both dropdown masters with usage + retired state, for the Types & Salesmen page."""
	out = {}
	for kind in ("type", "salesman"):
		c = _order_master_conf(kind)
		filters = {"is_group": 0} if kind == "salesman" else {}
		rows = []
		for d in frappe.get_all(c["doctype"], filters=filters, fields=["name", c["off_field"]], order_by="name"):
			retired = bool(d[c["off_field"]]) if kind == "type" else not d[c["off_field"]]
			rows.append({
				"name": d.name,
				"retired": retired,
				"active_bags": int(_active_bags_using(c["bag_field"], d.name)),
				"total_bags": int(frappe.db.count("Order Bag", {c["bag_field"]: d.name})),
			})
		out[kind] = rows
	return out


@frappe.whitelist()
def add_order_master(kind, name):
	frappe.only_for(["System Manager", "Stock Manager"])
	c = _order_master_conf(kind)
	name = (name or "").strip().upper()
	if not name:
		frappe.throw(frappe._("Name is required"))
	if frappe.db.exists(c["doctype"], name):
		frappe.throw(frappe._("{0} '{1}' already exists").format(c["doctype"], name))
	if kind == "type":
		frappe.get_doc({"doctype": "Order Type", "order_type_name": name}).insert(ignore_permissions=True)
	else:
		root = frappe.db.get_value("Sales Person", {"is_group": 1, "parent_sales_person": ["in", ["", None]]}, "name")
		frappe.get_doc({
			"doctype": "Sales Person", "sales_person_name": name,
			"parent_sales_person": root, "is_group": 0, "enabled": 1,
		}).insert(ignore_permissions=True)
	frappe.db.commit()
	return {"name": name}


@frappe.whitelist()
def retire_order_master(kind, name, restore=0):
	"""Retire (hide from dropdowns) or restore a Type / Salesman. Retiring is blocked while
	ACTIVE Order Bags use it (Cancelled/Sold don't count); a never-used value is deleted."""
	frappe.only_for(["System Manager", "Stock Manager"])
	c = _order_master_conf(kind)
	if not frappe.db.exists(c["doctype"], name):
		frappe.throw(frappe._("Not found"))
	if frappe.utils.cint(restore):
		frappe.db.set_value(c["doctype"], name, c["off_field"], 0 if kind == "type" else 1)
		frappe.db.commit()
		return {"name": name, "state": "restored"}
	active = _active_bags_using(c["bag_field"], name)
	if active:
		frappe.throw(frappe._("Cannot retire '{0}' — {1} active Order Bag(s) use it (only Cancelled/Sold usage may be retired).").format(name, active))
	if not frappe.db.count("Order Bag", {c["bag_field"]: name}) and not frappe.db.count("Job Order", {c["bag_field"]: name}):
		frappe.delete_doc(c["doctype"], name, ignore_permissions=True)
		frappe.db.commit()
		return {"name": name, "state": "deleted"}
	frappe.db.set_value(c["doctype"], name, c["off_field"], c["off_value"])
	frappe.db.commit()
	return {"name": name, "state": "retired"}


@frappe.whitelist()
def get_design_variants(design):
	"""Purity-variant options for a design (the Place Order 'New' button).

	Finds the design BOM's gold row, then for every OTHER karat gold (22KPG, 18KYG, …)
	returns the would-be variant name (base + karat suffix, e.g. 'A 2849 PB' + 18KPG ->
	'A 2849 PB 18P') and whether that Design already exists."""
	import re

	if not design or not frappe.db.exists("Design", design):
		frappe.throw(frappe._("No such design"))
	doc = frappe.get_doc("Design", design)

	karats = frappe.get_all(
		"Item", filters={"item_group": "GOLD", "metal_purity": ["!=", ""]},
		fields=["name", "purity_percentage"], order_by="name desc",
	)
	karat_names = {k.name for k in karats}

	def suffix(item):  # 18KPG -> 18P, 14KWG -> 14W
		m = re.match(r"^(\d+)K([A-Z])G$", item)
		return f"{m.group(1)}{m.group(2)}" if m else item

	# the BOM's gold row = a karat-gold item (fall back to any metal row)
	current_gold = next((m.item for m in doc.materials if m.item in karat_names), None)
	if not current_gold:
		stones = {i.name for i in frappe.get_all("Item", filters={"name": ["in", [m.item for m in doc.materials]], "stone_type": ["!=", ""]})}
		current_gold = next((m.item for m in doc.materials if m.item not in stones), None)
	if not current_gold:
		frappe.throw(frappe._("{0} has no gold row in its BOM to swap.").format(design))

	# strip an existing karat suffix so variants of variants share one base name
	base = doc.design_name
	m = re.match(r"^(.*)\s\d+[A-Z]$", base)
	root = m.group(1) if m and any(base.endswith(" " + suffix(k.name)) for k in karats) else base

	# the design FAMILY = the root-named design + every 'root <suffix>' design.
	# Map each member's actual BOM gold -> its name, so a karat counts as "exists" when ANY
	# family member carries it (e.g. from 'A 2849 PB 18Y', 22KYG = the original 'A 2849 PB' —
	# no duplicate 'A 2849 PB 22Y' can be created).
	family = {}
	for nm in [root] + [f"{root} {suffix(k.name)}" for k in karats]:
		if not frappe.db.exists("Design", nm):
			continue
		mats = frappe.get_all("Design BOM Item", filters={"parent": nm, "parenttype": "Design"}, pluck="item")
		g = next((i for i in mats if i in karat_names), None)
		if g and g not in family:
			family[g] = nm

	out = []
	for k in karats:
		if k.name == current_gold:
			continue
		existing = family.get(k.name)
		out.append({
			"karat": k.name, "purity": flt(k.purity_percentage), "suffix": suffix(k.name),
			"variant_name": existing or f"{root} {suffix(k.name)}", "exists": bool(existing),
		})
	return {
		"design": design, "base": root, "current_gold": current_gold,
		"current_purity": flt(frappe.db.get_value("Item", current_gold, "purity_percentage")),
		"design_type": doc.design_type, "design_style": doc.design_style, "image": doc.image,
		"variants": out,
	}


@frappe.whitelist()
def get_design_types_with_sizes():
	"""All Design Types with their size lists — the Setup page grid + the Place Order
	Size dropdown (sizes follow the picked design's type)."""
	out = []
	used = {r.design_type: r.cnt for r in frappe.db.sql(
		"SELECT design_type, COUNT(*) cnt FROM `tabDesign` GROUP BY design_type", as_dict=True)}
	for t in frappe.get_all("Design Type", order_by="name", pluck="name"):
		rows = frappe.get_all(
			"Design Type Size", filters={"parent": t, "parenttype": "Design Type"},
			fields=["size", "is_default"], order_by="idx",
		)
		default = next((r.size for r in rows if r.is_default), None)
		out.append({
			"design_type": t, "sizes": [r.size for r in rows],
			"default": default, "used_by": int(used.get(t, 0)),
		})
	return out


@frappe.whitelist()
def set_design_type_default(design_type, size=None):
	"""Mark one size as the type's default (pre-selected on Place Order). Pass no size
	(or the current default) to clear it."""
	frappe.only_for(["System Manager", "Stock Manager"])
	doc = frappe.get_doc("Design Type", design_type)
	size = (size or "").strip()
	if size and size not in [r.size for r in doc.sizes]:
		frappe.throw(frappe._("'{0}' is not a size of {1}").format(size, design_type))
	for r in doc.sizes:
		r.is_default = 1 if (size and r.size == size) else 0
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"design_type": design_type, "default": size or None}


@frappe.whitelist()
def add_design_type(name):
	frappe.only_for(["System Manager", "Stock Manager"])
	name = (name or "").strip().upper()
	if not name:
		frappe.throw(frappe._("Type name is required"))
	if frappe.db.exists("Design Type", name):
		frappe.throw(frappe._("Design Type '{0}' already exists").format(name))
	frappe.get_doc({"doctype": "Design Type", "design_type_name": name}).insert(ignore_permissions=True)
	frappe.db.commit()
	return {"design_type": name}


@frappe.whitelist()
def delete_design_type(name):
	frappe.only_for(["System Manager", "Stock Manager"])
	used = frappe.db.count("Design", {"design_type": name})
	if used:
		frappe.throw(frappe._("Cannot delete — {0} Design(s) use this type.").format(used))
	frappe.delete_doc("Design Type", name, ignore_permissions=True)
	frappe.db.commit()
	return {"ok": 1}


@frappe.whitelist()
def set_design_type_sizes(design_type, sizes):
	"""Replace a Design Type's size list (the Setup page's add/remove)."""
	frappe.only_for(["System Manager", "Stock Manager"])
	sizes = frappe.parse_json(sizes) if isinstance(sizes, str) else (sizes or [])
	seen, clean = set(), []
	for s in sizes:
		s = (s or "").strip()
		if s and s not in seen:
			seen.add(s)
			clean.append(s)
	# a size can't be removed while an ACTIVE Order Bag of this type is using it
	# (Cancelled / Sold bags are history — they don't block).
	doc = frappe.get_doc("Design Type", design_type)
	removed = [row.size for row in doc.sizes if row.size not in seen]
	for s in removed:
		used = frappe.db.sql(
			"""SELECT COUNT(*) FROM `tabOrder Bag` ob
			   JOIN `tabDesign` d ON d.name = ob.design
			   WHERE d.design_type = %s AND ob.size = %s
			     AND IFNULL(ob.stock_status, '') NOT IN ('Cancelled', 'Sold')""",
			(design_type, s),
		)[0][0]
		if used:
			frappe.throw(
				frappe._("Cannot remove size '{0}' — {1} active Order Bag(s) of type {2} are using it.").format(s, used, design_type)
			)
	doc.reload()  # fresh copy — guards against stale-cache row loss on rebuild
	old_default = next((r.size for r in doc.sizes if r.is_default), None)
	doc.set("sizes", [])
	for s in clean:
		doc.append("sizes", {"size": s, "is_default": 1 if s == old_default else 0})
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"design_type": design_type, "sizes": clean}


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


def _plan_values(bag_bom, qty):
	"""The PLAN weight fields (gross/nett/purity/stones) = profile(bag BOM) x qty.
	Shared by the Order Bag controller (validate) and recalc."""
	mats = [{"item": r.item, "qty": r.qty, "weight": r.weight} for r in (bag_bom or [])]
	p = _profile_from_materials(mats)
	q = max(int(qty or 1), 1)
	# match the ACTUAL convention: gross = gold + stones, nett = gold (metal)
	metal = flt(p["gross_weight"])  # _profile_from_materials' "gross" is metal grams
	stone_g = (flt(p["dmd_weight"]) + flt(p["ps_weight"]) + flt(p["cs_weight"])) * 0.2
	return {
		"gross_weight": round((metal + stone_g) * q, 3),
		"nett_weight": round(metal * q, 3),
		"purity": p["purity"],
		"dmd_no": int(p["dmd_no"]) * q, "dmd_weight": round(p["dmd_weight"] * q, 3),
		"ps_no": int(p["ps_no"]) * q, "ps_weight": round(p["ps_weight"] * q, 3),
		"cs_no": int(p["cs_no"]) * q, "cs_weight": round(p["cs_weight"] * q, 3),
	}


def _actual_profile(order_bag):
	"""The ACTUAL weight profile from what the bag really holds (the ledger): gold
	grams, stone carats by stone_type, gram-weighted metal purity."""
	rows = [it for it in get_bag_contents(order_bag)["items"] if flt(it["qty"])]
	codes = list({it["item"] for it in rows})
	meta = {}
	if codes:
		for i in frappe.get_all("Item", filters={"name": ["in", codes]}, fields=["name", "stone_type", "purity_percentage"]):
			meta[i.name] = (i.stone_type, flt(i.purity_percentage))
	dmd_w = ps_w = cs_w = gold = pnum = 0.0
	dmd_n = ps_n = cs_n = 0
	mp = []
	for it in rows:
		q = flt(it["qty"])
		n = int(it.get("pcs") or 0)
		st, pu = meta.get(it["item"], (None, 0.0))
		if st == "Diamond":
			dmd_w += q; dmd_n += n
		elif st == "Precious Stone":
			ps_w += q; ps_n += n
		elif st == "Color Stone":
			cs_w += q; cs_n += n
		else:
			gold += q
			pnum += q * pu
			if pu:
				mp.append(pu)
	purity = (pnum / gold) if gold else (sum(mp) / len(mp) if mp else 0.0)
	return {
		"gross": round(gold + (dmd_w + ps_w + cs_w) * 0.2, 3), "nett": round(gold, 3),
		"purity": round(purity, 3), "dmd_weight": round(dmd_w, 3), "ps_weight": round(ps_w, 3), "cs_weight": round(cs_w, 3),
		"dmd_no": dmd_n, "ps_no": ps_n, "cs_no": cs_n,
	}


@frappe.whitelist()
def refresh_actual_weights(order_bag):
	"""Recompute + store the ACTUAL weight fields (act_*) from current contents,
	including real stone counts (pcs) from the ledger. Once the piece is a finished
	product its materials are consumed, so the actuals are FROZEN (just return them)."""
	act_fields = ["act_gross_weight", "act_nett_weight", "act_purity", "act_pure_weight",
		"act_dmd_weight", "act_ps_weight", "act_cs_weight", "act_dmd_no", "act_ps_no", "act_cs_no"]
	if frappe.db.get_value("Order Bag", order_bag, "is_finished"):
		return frappe.db.get_value("Order Bag", order_bag, act_fields, as_dict=True)
	p = _actual_profile(order_bag)
	vals = {
		"act_gross_weight": p["gross"], "act_nett_weight": p["nett"], "act_purity": p["purity"],
		"act_pure_weight": round(p["nett"] * p["purity"] / 100.0, 3),
		"act_dmd_weight": p["dmd_weight"], "act_ps_weight": p["ps_weight"], "act_cs_weight": p["cs_weight"],
		"act_dmd_no": p["dmd_no"], "act_ps_no": p["ps_no"], "act_cs_no": p["cs_no"],
	}
	frappe.db.set_value("Order Bag", order_bag, vals)
	return vals


@frappe.whitelist()
def recalc_bag_weights_from_bom(order_bag):
	"""Recompute a bag's PLAN weights from its OWN BOM x qty + refresh the actuals."""
	bag = frappe.get_doc("Order Bag", order_bag)
	vals = _plan_values(bag.bag_bom, bag.qty)
	bag.db_set(vals)
	refresh_actual_weights(order_bag)
	frappe.db.commit()
	return {"order_bag": order_bag, **vals}


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


@frappe.whitelist()
def get_design_materials(design):
	"""Raw-materials (BOM) table for a Design — for the Place Order 'Design' info dialog.
	Item attributes (name / stone type / uom / purity) are read from the Item master, since
	BOM-row copies are unreliable on programmatically seeded designs."""
	out = {"design": design, "design_type": None, "materials": []}
	if not design or not frappe.db.exists("Design", design):
		return out
	d = frappe.get_doc("Design", design)
	out["design_type"] = d.design_type
	out["design_style"] = d.design_style
	out["image"] = d.image
	for m in d.materials:
		im = frappe.db.get_value(
			"Item", m.item,
			["item_name", "stone_type", "weight_unit", "purity_percentage"], as_dict=True,
		) or {}
		out["materials"].append({
			"item": m.item,
			"item_name": im.get("item_name") or m.item,
			"stone_type": im.get("stone_type") or "",
			"uom": im.get("weight_unit") or getattr(m, "uom", "") or "",
			"purity": im.get("purity_percentage") or getattr(m, "purity", 0) or 0,
			"qty": m.qty or 0,
			"weight": m.weight or 0,
		})
	return out


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
	if bag.image:
		files.insert(0, {"file_url": bag.image, "file_name": bag.design or "design"})  # the bag's held design photo, first
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
@frappe.validate_and_sanitize_search_inputs
def bench_employee_query(doctype, txt, searchfield, start, page_len, filters):
	"""Link query for the Job Work employee picker — only employees allotted to the bench
	(filters['bench']). Falls back to all active employees if that bench has no roster yet."""
	bench = (filters or {}).get("bench")
	roster = []
	if bench and frappe.db.exists("Bench", bench):
		roster = frappe.get_all("Bench Employee", filters={"parent": bench}, pluck="employee")
	like = f"%{txt or ''}%"
	if roster:
		ph = ", ".join(["%s"] * len(roster))
		return frappe.db.sql(
			f"""SELECT name, employee_name FROM `tabEmployee`
			    WHERE status = 'Active' AND (name LIKE %s OR employee_name LIKE %s) AND name IN ({ph})
			    ORDER BY employee_name LIMIT %s, %s""",
			[like, like, *roster, start, page_len],
		)
	return frappe.db.sql(
		"""SELECT name, employee_name FROM `tabEmployee`
		   WHERE status = 'Active' AND (name LIKE %s OR employee_name LIKE %s)
		   ORDER BY employee_name LIMIT %s, %s""",
		[like, like, start, page_len],
	)


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
		fields=["item", "uom", "direction", "qty", "pcs"],
	)
	net = {}
	for r in rows:
		sign = 1 if (r.direction or "In") == "In" else -1
		e = net.setdefault(r.item, {"uom": r.uom or "", "qty": 0.0, "pcs": 0})
		e["qty"] += sign * flt(r.qty)
		e["pcs"] += sign * int(r.pcs or 0)
	for item, e in net.items():
		qty = round(e["qty"], 3)
		if abs(qty) < 0.0005:
			continue
		out["items"].append({"item": item, "uom": e["uom"], "qty": qty, "pcs": int(e["pcs"])})
		if e["uom"] == "Carat":
			out["stone_carats"] += qty
		else:
			out["gold_grams"] += qty
	out["gold_grams"] = round(out["gold_grams"], 3)
	out["stone_carats"] = round(out["stone_carats"], 3)
	out["gross_weight"] = round(out["gold_grams"] + out["stone_carats"] * 0.2, 3)
	return out


def _bag_ledger(order_bag, item, direction, qty, entry_type, bench=None, employee=None, remarks=None, reference=None, pcs=0):
	"""Write one Bag Material Ledger row (the per-bag material truth). `pcs` = stone
	count for the line (0 for metal)."""
	if not frappe.db.exists("Order Bag", order_bag):
		frappe.throw(frappe._("Order Bag {0} not found.").format(order_bag))
	if not item or not frappe.db.exists("Item", item):
		frappe.throw(frappe._("Item {0} not found.").format(item))
	qty = flt(qty)
	if qty <= 0:
		frappe.throw(frappe._("Weight / qty must be greater than zero."))
	doc = frappe.get_doc({
		"doctype": "Bag Material Ledger",
		"order_bag": order_bag, "item": item, "direction": direction, "qty": qty, "pcs": int(pcs or 0),
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
def issue_stones(order_bag, item, qty, pcs=0, bench=None, remarks=None):
	"""Issue stones into a bag (qty = carats, pcs = number of stones) — before work."""
	name = _bag_ledger(order_bag, item, "In", qty, "Stone Issue", bench=bench, remarks=remarks, pcs=pcs)
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
	"""Sync the bag's ACTUAL weight fields to its current contents (the ledger).
	The PLAN fields are left alone (they come from the BOM)."""
	refresh_actual_weights(order_bag)


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
	# from_warehouse from the UI is already the full "<name> - <abbr>"; only fall back to
	# the Raw Materials Store (which needs the abbr appended) when nothing was passed.
	src = from_warehouse if (from_warehouse and frappe.db.exists("Warehouse", from_warehouse)) else _wh(RAW_MATERIALS_STORE)
	tgt = _wh(IN_PRODUCTION_WAREHOUSE)
	added = 0.0
	for ln in lines or []:
		item, wt = ln.get("item"), flt(ln.get("weight"))
		if not item or wt <= 0:
			continue
		avail = flt(frappe.db.get_value("Bin", {"item_code": item, "warehouse": src}, "actual_qty"))
		if wt > avail + 0.0005:
			frappe.throw(frappe._("Only {0} of {1} available in {2} — can't issue {3}.").format(round(avail, 3), item, src, wt))
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
	tgt = to_warehouse if (to_warehouse and frappe.db.exists("Warehouse", to_warehouse)) else _wh(RAW_MATERIALS_STORE)
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
# Warehouse Stock dashboard — live balances straight from the stock ledger (Bin).
# ---------------------------------------------------------------------------
@frappe.whitelist()
def get_warehouse_stock():
	"""Per (leaf) warehouse totals: gold grams (Gram items), stone carats (Carat
	items) and distinct item count. Live from Bin."""
	whs = frappe.get_all("Warehouse", filters={"is_group": 0, "company": _company()}, fields=["name", "warehouse_name"])
	bins = frappe.get_all("Bin", filters={"actual_qty": ["!=", 0]}, fields=["warehouse", "item_code", "actual_qty", "stock_uom"])
	agg = {}
	for b in bins:
		a = agg.setdefault(b.warehouse, {"gold_g": 0.0, "stone_ct": 0.0, "items": 0})
		if b.stock_uom == "Carat":
			a["stone_ct"] += flt(b.actual_qty)
		else:
			a["gold_g"] += flt(b.actual_qty)
		a["items"] += 1
	out = []
	for w in whs:
		a = agg.get(w.name) or {"gold_g": 0, "stone_ct": 0, "items": 0}
		out.append({
			"warehouse": w.name, "warehouse_name": w.warehouse_name,
			"gold_g": round(a["gold_g"], 3), "stone_ct": round(a["stone_ct"], 3), "items": a["items"],
		})
	return out


@frappe.whitelist()
def get_warehouse_items(warehouse):
	"""Items (with balance) currently in a warehouse — the drill-down."""
	rows = frappe.get_all("Bin", filters={"warehouse": warehouse, "actual_qty": ["!=", 0]}, fields=["item_code", "actual_qty", "stock_uom"])
	out = [{"item": r.item_code, "item_name": frappe.db.get_value("Item", r.item_code, "item_name"), "qty": round(flt(r.actual_qty), 3), "uom": r.stock_uom} for r in rows]
	return sorted(out, key=lambda x: -x["qty"])


@frappe.whitelist()
def get_item_stock(warehouse=None):
	"""Every stock item (gold + all stones) with its balance in a chosen warehouse
	(blank = totalled across all warehouses). Shows the full item list, 0 where there
	is no stock; skips disabled/non-stock items. For the Item Stock screen."""
	bin_filters = {}
	if warehouse:
		bin_filters["warehouse"] = warehouse
	qmap = {}
	for b in frappe.get_all("Bin", filters=bin_filters, fields=["item_code", "actual_qty"]):
		qmap[b.item_code] = qmap.get(b.item_code, 0.0) + flt(b.actual_qty)
	rows = []
	for it in frappe.get_all(
		"Item", filters={"is_stock_item": 1, "disabled": 0},
		fields=["name", "item_name", "stock_uom", "stone_type"], order_by="item_name asc",
	):
		rows.append({
			"item": it.name, "item_name": it.item_name, "uom": it.stock_uom,
			"type": it.stone_type or "Metal", "qty": round(flt(qmap.get(it.name, 0)), 3),
		})
	return sorted(rows, key=lambda x: (-x["qty"], (x["item_name"] or x["item"]).lower()))


# ---------------------------------------------------------------------------
# Bag Extraction — split one N-piece bag into N individual order bags.
# ---------------------------------------------------------------------------
def _even_split(total, n, prec=3):
	"""Split `total` into `n` parts rounded to `prec` dp, summing back to `total`
	(the rounding remainder is spread over the first parts)."""
	total = flt(total)
	if n <= 0:
		return []
	base = round(total / n, prec)
	parts = [base] * n
	diff = round(total - base * n, prec)
	step = 10 ** (-prec)
	i = 0
	while abs(diff) >= step / 2 and i < n:
		parts[i] = round(parts[i] + (step if diff > 0 else -step), prec)
		diff = round(diff - (step if diff > 0 else -step), prec)
		i += 1
	return parts


def _split_counts(total, n):
	"""Split an integer count into n parts (first parts get the remainder)."""
	total = int(total or 0)
	base, rem = divmod(total, n) if n else (0, 0)
	return [base + (1 if i < rem else 0) for i in range(n)]


@frappe.whitelist()
def get_bag_for_split(order_bag):
	"""Bag Extraction scan: validate the card is AT Bag Extraction and In Queue, then
	return its header, contents and a suggested even split across its qty pieces."""
	from jewelima.jewelima.benches import bench_doctype

	bag = frappe.db.get_value(
		"Order Bag", order_bag,
		["name", "location", "design", "qty", "size", "purity", "gross_weight", "nett_weight",
		 "dmd_no", "dmd_weight", "ps_no", "ps_weight", "cs_no", "cs_weight", "job_order", "customer", "salesman"],
		as_dict=True,
	)
	if not bag:
		return {"error": frappe._("No Order Bag {0}.").format(order_bag)}
	loc = (bag.location or "").upper()
	if loc != "BAG EXTRACTION":
		return {"error": frappe._("{0} is at {1} — not at Bag Extraction.").format(order_bag, bag.location or "—")}
	dt = bench_doctype(loc)
	status = None
	if dt and frappe.db.exists("DocType", dt):
		recs = frappe.get_all(dt, filters={"order_bag": order_bag}, fields=["status"], order_by="creation desc", limit=1)
		status = recs[0].status if recs else None
	if status == "Completed":
		return {"error": frappe._("{0} has already been extracted (Completed).").format(order_bag)}
	if not status:
		return {"error": frappe._("{0} has no Bag Extraction record.").format(order_bag)}
	n = max(int(bag.qty or 1), 1)
	contents = get_bag_contents(order_bag)
	cmap = {it["item"]: flt(it["qty"]) for it in contents["items"]}  # actual available per item
	gold_total = flt(contents.get("gold_grams"))
	# item order: BOM first (gives counts + order), then any held item not in the BOM
	bom_qty = {}
	order = []
	for r in frappe.get_all("Order Bag BOM Item", filters={"parent": order_bag, "parenttype": "Order Bag"}, fields=["item", "qty"], order_by="idx asc"):
		bom_qty[r.item] = flt(r.qty)
		if r.item not in order:
			order.append(r.item)
	for it in contents["items"]:
		if it["item"] not in order:
			order.append(it["item"])
	# stone_type/uom/purity are authoritative on the Item (BOM-row fetched copies are
	# unreliable on programmatic seed). Stones split + rounded to .000; gold left empty.
	items = []
	for code in order:
		meta = frappe.db.get_value("Item", code, ["item_name", "stone_type", "stock_uom", "purity_percentage"], as_dict=True) or {}
		st = meta.get("stone_type")
		total = round(flt(cmap.get(code, 0.0)), 3)
		if st:
			cnt = _split_counts(int(round(flt(bom_qty.get(code, 0)) * n)), n)
			wt = _even_split(total, n)
			per = [{"qty": cnt[i], "weight": wt[i]} for i in range(n)]
		else:
			per = [{"qty": 0, "weight": 0.0} for _ in range(n)]
		items.append({
			"item": code, "item_name": meta.get("item_name"), "purity": meta.get("purity_percentage") or 0,
			"uom": meta.get("stock_uom") or ("Carat" if st else "Gram"),
			"stone_type": st, "is_gold": not st, "total": total, "per_piece": per,
		})
	return {
		"bag": bag, "n": n, "status": status, "gold_total": round(gold_total, 3),
		"stone_ct_total": round(flt(contents.get("stone_carats")), 3),
		"items": items,
	}


@frappe.whitelist()
def start_bag_split(order_bag, employee=None):
	"""Begin extraction: assign the logged-in employee to the Bag Extraction record,
	set it Ongoing and stamp the start time. Card must be In Queue."""
	from jewelima.jewelima.benches import bench_doctype

	dt = bench_doctype("BAG EXTRACTION")
	if not (dt and frappe.db.exists("DocType", dt)):
		frappe.throw(frappe._("Bag Extraction bench is not set up."))
	rec = frappe.get_all(dt, filters={"order_bag": order_bag}, order_by="creation desc", limit=1, fields=["name", "status", "time_in", "issued_at", "employee"])
	if not rec:
		frappe.throw(frappe._("No Bag Extraction record for {0}.").format(order_bag))
	if rec[0].status == "Completed":
		frappe.throw(frappe._("{0} has already been extracted.").format(order_bag))
	if not employee:
		employee = rec[0].employee or frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
	now = frappe.utils.now_datetime()
	# resuming keeps the original start time + employee
	frappe.db.set_value(dt, rec[0].name, {
		"status": "Ongoing", "employee": employee,
		"issued_at": rec[0].issued_at or now, "time_in": rec[0].time_in or now,
	})
	frappe.db.commit()
	return {"ok": 1, "employee": employee, "resumed": rec[0].status == "Ongoing"}


@frappe.whitelist()
def split_bag(order_bag, pieces, employee=None):
	"""Split a Bag Extraction card into one bag per piece. Parent stays as piece 1;
	pieces 2..N are new bags (named <parent>-2 …). Distributes gold (entered) + stones
	(per piece) via the ledger, sets each bag's weights, marks the Bag Extraction
	record Completed (+ employee)."""
	from jewelima.jewelima.benches import bench_doctype

	if isinstance(pieces, str):
		pieces = json.loads(pieces or "[]")
	bag = frappe.get_doc("Order Bag", order_bag)
	if (bag.location or "").upper() != "BAG EXTRACTION":
		frappe.throw(frappe._("{0} is not at Bag Extraction.").format(order_bag))
	n = len(pieces)
	if n < 1:
		frappe.throw(frappe._("Nothing to split."))
	dt = bench_doctype("BAG EXTRACTION")
	rec = frappe.get_all(dt, filters={"order_bag": order_bag}, order_by="creation desc", limit=1, fields=["name", "status", "employee"]) if dt else []
	if not rec or rec[0].status != "Ongoing":
		frappe.throw(frappe._("Press Start first — {0} isn't in progress.").format(order_bag))
	if not employee:
		employee = rec[0].employee or frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")

	# pieces[j].items = [{item, qty, weight}] (gold item weight already computed as
	# gross - stone weight). Build per-item amount/count arrays + a stone_type cache.
	amounts, counts, stype = {}, {}, {}
	for j, p in enumerate(pieces):
		for it in p.get("items", []):
			code = it.get("item")
			if not code:
				continue
			amounts.setdefault(code, [0.0] * n)[j] = flt(it.get("weight"))
			counts.setdefault(code, [0] * n)[j] = int(it.get("qty") or 0)
			if code not in stype:
				stype[code] = frappe.db.get_value("Item", code, "stone_type")

	# never take out more than the bag holds (no negative balances)
	cmap = {it["item"]: flt(it["qty"]) for it in get_bag_contents(order_bag)["items"]}
	for code, arr in amounts.items():
		want = round(sum(flt(x) for x in arr), 3)
		have = round(flt(cmap.get(code, 0.0)), 3)
		if want > have + 0.0005:
			frappe.throw(frappe._("Not enough {0} in the bag — assigning {1} but only {2} available.").format(code, want, have))

	def piece_fields(j):
		dmd_no = ps_no = cs_no = 0
		dmd_w = ps_w = cs_w = gold = 0.0
		for code, arr in amounts.items():
			w, q, st = arr[j], counts[code][j], stype.get(code)
			if st == "Diamond":
				dmd_no += q; dmd_w += w
			elif st == "Precious Stone":
				ps_no += q; ps_w += w
			elif st == "Color Stone":
				cs_no += q; cs_w += w
			else:
				gold += w
		gross = gold + (dmd_w + ps_w + cs_w) * 0.2
		# the piece's ACTUAL weights (what it physically holds after the split)
		return {
			"qty": 1, "act_nett_weight": round(gold, 3), "act_gross_weight": round(gross, 3), "act_purity": bag.purity,
			"act_dmd_no": dmd_no, "act_dmd_weight": round(dmd_w, 3),
			"act_ps_no": ps_no, "act_ps_weight": round(ps_w, 3),
			"act_cs_no": cs_no, "act_cs_weight": round(cs_w, 3),
		}

	created = []
	for j in range(n):
		if j == 0:
			frappe.db.set_value("Order Bag", order_bag, piece_fields(0))
			frappe.db.set_value("Order Bag", order_bag, _plan_values(bag.bag_bom, 1))  # parent now 1 piece -> plan per-unit
			created.append(order_bag)
			continue
		child = frappe.get_doc({
			"doctype": "Order Bag",
			"split_of": order_bag, "piece_no": j,
			"job_order": bag.job_order, "design": bag.design, "size": bag.size,
			"location": "BAG EXTRACTION", "customer": bag.customer, "salesman": bag.salesman,
			"order_type": bag.order_type, "order_date": bag.order_date, "due_date": bag.due_date,
		})
		child.insert(ignore_permissions=True)
		frappe.db.set_value("Order Bag", child.name, piece_fields(j))
		for code, arr in amounts.items():
			if flt(arr[j]) > 0:
				_bag_ledger(child.name, code, "In", arr[j], "Split In", reference=order_bag, pcs=counts[code][j])
		created.append(child.name)

	# parent gives up everything beyond piece 1's share
	for code, arr in amounts.items():
		out = round(sum(flt(x) for x in arr[1:]), 3)
		if out > 0:
			_bag_ledger(order_bag, code, "Out", out, "Split Out", pcs=sum(counts[code][1:]))

	# close the Bag Extraction record
	dt = bench_doctype("BAG EXTRACTION")
	if dt and frappe.db.exists("DocType", dt):
		rec = frappe.get_all(dt, filters={"order_bag": order_bag}, order_by="creation desc", limit=1, pluck="name")
		if rec:
			vals = {"status": "Completed", "time_out": frappe.utils.now_datetime()}
			if employee:
				vals["employee"] = employee
			frappe.db.set_value(dt, rec[0], vals)
	frappe.db.commit()
	return {"created": created, "count": len(created)}


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
	from jewelima.jewelima.benches import ISSUE_RECEIPT_LOCATIONS, bench_doctype

	if isinstance(names, str):
		names = json.loads(names or "[]")
	if (location or "").upper() not in ISSUE_RECEIPT_LOCATIONS:
		frappe.throw(frappe._("Job Work (Issue / Receipt) is only for {0}.").format(", ".join(sorted(ISSUE_RECEIPT_LOCATIONS))))
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
def assign_bench_cards(names, location, employee=None):
	"""Assign a batch of bags at a transfer bench (CAD / Wax Injecting / Wax Cleaning):
	status -> Issued, stamp issued_at (+ employee if given). Times only — no weight/loss."""
	from jewelima.jewelima.benches import ASSIGN_COLLECT_LOCATIONS, bench_doctype

	if isinstance(names, str):
		names = json.loads(names or "[]")
	loc = (location or "").upper()
	if loc not in ASSIGN_COLLECT_LOCATIONS:
		frappe.throw(frappe._("Assign / Collect is only for {0}.").format(", ".join(sorted(ASSIGN_COLLECT_LOCATIONS))))
	dt = bench_doctype(loc)
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
				errors.append({"name": nm, "error": frappe._("Already assigned")})
				continue
			doc.status = "Issued"
			doc.issued_at = now
			if not doc.time_in:
				doc.time_in = now
			if employee:
				doc.employee = employee
			doc.save(ignore_permissions=True)
			done.append(nm)
		except Exception as e:
			errors.append({"name": nm, "error": str(e)})
	frappe.db.commit()
	return {"count": len(done), "done": done, "errors": errors}


@frappe.whitelist()
def collect_bench_cards(names, location):
	"""Collect a batch of assigned bags at a transfer bench: status -> Completed, stamp
	receipted_at + time_out. Times only — no weight/loss. Only assigned (Issued) cards."""
	from jewelima.jewelima.benches import ASSIGN_COLLECT_LOCATIONS, bench_doctype

	if isinstance(names, str):
		names = json.loads(names or "[]")
	loc = (location or "").upper()
	if loc not in ASSIGN_COLLECT_LOCATIONS:
		frappe.throw(frappe._("Assign / Collect is only for {0}.").format(", ".join(sorted(ASSIGN_COLLECT_LOCATIONS))))
	dt = bench_doctype(loc)
	now = frappe.utils.now_datetime()
	done, errors = [], []
	for nm in names or []:
		try:
			rec = _current_bench_record(dt, nm)
			if not rec:
				errors.append({"name": nm, "error": frappe._("No bench record at {0}").format(location)})
				continue
			doc = frappe.get_doc(dt, rec)
			if doc.status != "Issued":
				errors.append({"name": nm, "error": frappe._("Not assigned (is {0})").format(doc.status)})
				continue
			doc.status = "Completed"
			doc.receipted_at = now
			doc.time_out = now
			doc.save(ignore_permissions=True)
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
	from jewelima.jewelima.benches import ISSUE_RECEIPT_LOCATIONS, bench_doctype

	if isinstance(lines, str):
		lines = json.loads(lines or "[]")
	if (location or "").upper() not in ISSUE_RECEIPT_LOCATIONS:
		frappe.throw(frappe._("Job Work (Issue / Receipt) is only for {0}.").format(", ".join(sorted(ISSUE_RECEIPT_LOCATIONS))))
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
	refresh_actual_weights(order_bag)  # freeze the finished piece's actual weights before consuming
	in_bags, fg = _wh(IN_PRODUCTION_WAREHOUSE), _wh("Finished Goods")
	for it in held:
		_bag_ledger(order_bag, it["item"], "Out", it["qty"], "Convert")
		# gold drains from the In Bags pool into Finished Goods (stones aren't pooled)
		if not frappe.db.get_value("Item", it["item"], "stone_type"):
			_stock_move(it["item"], it["qty"], in_bags, fg)
	frappe.db.set_value("Order Bag", order_bag, "is_finished", 1)  # locks the BOM (plan)
	frappe.db.commit()
	return {"order_bag": order_bag, "consumed": held}


# ---------------------------------------------------------------------------
# Finished products — turn finished (qty-1) bags into stock products.
# ---------------------------------------------------------------------------
def _jd_stock_customer():
	return "JD Stock" if frappe.db.exists("Customer", "JD Stock") else None


@frappe.whitelist()
def get_makeable_bags(location=None):
	"""Qty-1 bags that hold materials and aren't products yet — ready to make."""
	filters = {"qty": 1, "is_finished": 0}
	if location:
		filters["location"] = location
	out = []
	for b in frappe.get_all(
		"Order Bag", filters=filters,
		fields=["name", "design", "customer", "location", "act_gross_weight", "act_nett_weight"],
		order_by="modified desc", limit=300,
	):
		gold = flt(get_bag_contents(b.name)["gold_grams"])
		if gold <= 0:
			continue
		b["gold"] = round(gold, 3)
		out.append(b)
	return out


@frappe.whitelist()
def make_products(bags):
	"""Turn selected qty-1 bags into finished stock products: consume their materials
	(gold In Bags -> Finished Goods), freeze the actual weights, set held_by (the
	order's customer, else JD Stock) and stock_status = In Stock."""
	if isinstance(bags, str):
		bags = json.loads(bags or "[]")
	jd = _jd_stock_customer()
	done, errors = [], []
	for nm in bags or []:
		try:
			bag = frappe.db.get_value("Order Bag", nm, ["qty", "is_finished", "customer"], as_dict=True)
			if not bag:
				errors.append({"name": nm, "error": frappe._("Not found")})
				continue
			if bag.is_finished:
				errors.append({"name": nm, "error": frappe._("Already a product")})
				continue
			if int(bag.qty or 0) != 1:
				errors.append({"name": nm, "error": frappe._("Qty must be 1 — extract/split it first")})
				continue
			convert_to_ornament(nm)  # consume materials -> product + freeze actuals + is_finished
			frappe.db.set_value("Order Bag", nm, {"stock_status": "In Stock", "held_by": bag.customer or jd})
			done.append(nm)
		except Exception as e:
			errors.append({"name": nm, "error": str(e)})
	frappe.db.commit()
	return {"count": len(done), "done": done, "errors": errors}


@frappe.whitelist()
def get_finished_items(status=None, held_by=None):
	"""The finished-goods register: every bag made into a product, with its frozen
	weights, holder, design + design type and stock status."""
	filters = {"is_finished": 1}
	if status:
		filters["stock_status"] = status
	if held_by:
		filters["held_by"] = held_by
	rows = frappe.get_all(
		"Order Bag", filters=filters,
		fields=[
			"name", "design", "held_by", "stock_status",
			"act_gross_weight", "act_nett_weight", "act_pure_weight", "act_purity",
			"act_dmd_no", "act_dmd_weight", "act_cs_no", "act_cs_weight",
		],
		order_by="modified desc", limit=2000,
	)
	designs = list({r.design for r in rows if r.design})
	dtype = {}
	if designs:
		dtype = {d.name: d.design_type for d in frappe.get_all("Design", filters={"name": ["in", designs]}, fields=["name", "design_type"])}
	for r in rows:
		r["design_type"] = dtype.get(r.design)
	return rows


@frappe.whitelist()
def get_print_branding():
	"""Company + logo for the shared print header (logo ships with the app; company
	name/address/contact come from the ERPNext Company so they're editable)."""
	company = _company()
	c = {}
	if company:
		c = frappe.db.get_value("Company", company, ["company_name", "phone_no", "email", "tax_id", "website"], as_dict=True) or {}
	addr = ""
	if company:
		links = frappe.get_all("Dynamic Link", filters={"link_doctype": "Company", "link_name": company, "parenttype": "Address"}, fields=["parent"], limit=1)
		if links:
			a = frappe.db.get_value("Address", links[0].parent, ["address_line1", "address_line2", "city", "state", "pincode"], as_dict=True) or {}
			loc = ", ".join([x for x in [a.get("city"), a.get("state"), a.get("pincode")] if x])
			addr = ", ".join([x for x in [a.get("address_line1"), a.get("address_line2"), loc] if x])
	return {
		"company": c.get("company_name") or company or "Jewelima",
		"address": addr, "phone": c.get("phone_no") or "", "email": c.get("email") or "",
		"gstin": c.get("tax_id") or "", "website": c.get("website") or "",
		"logo_url": "/assets/jewelima/images/jewelima-letterhead.png",
	}


@frappe.whitelist()
def get_card_passport(order_bag):
	"""Everything about a card for the lookup/print view: header, plan + actual
	weights, current contents, the transfer trail and the bench stage history."""
	bag = frappe.db.get_value(
		"Order Bag", order_bag,
		[
			"name", "design", "qty", "size", "location", "stock_status", "held_by", "customer", "salesman",
			"order_type", "order_date", "due_date", "customer_date", "is_finished", "narration", "image", "job_order",
			"gross_weight", "nett_weight", "purity", "dmd_no", "dmd_weight", "ps_no", "ps_weight", "cs_no", "cs_weight",
			"act_gross_weight", "act_nett_weight", "act_pure_weight", "act_purity",
			"act_dmd_no", "act_dmd_weight", "act_ps_no", "act_ps_weight", "act_cs_no", "act_cs_weight",
		],
		as_dict=True,
	)
	if not bag:
		return {}
	if bag.design:
		d = frappe.db.get_value("Design", bag.design, ["design_type", "item"], as_dict=True) or {}
		bag["design_type"] = d.get("design_type")
		bag["item"] = d.get("item")
	return {
		"bag": bag,
		"contents": get_bag_contents(order_bag),
		"transfers": frappe.get_all(
			"Order Bag Transfer", filters={"order_bag": order_bag},
			fields=["from_location", "to_location", "transfer_time", "transferred_by"], order_by="transfer_time asc",
		),
		"stages": get_bag_stage_history(order_bag),
	}


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


def _qr_data_uri(text):
	"""Standard (full) QR as a PNG data-URI via segno. make_qr() forces a real QR with all
	three finder patterns — segno.make() emits a Micro QR for short codes, which most phone
	cameras / barcode scanners can't read. None if segno is unavailable."""
	try:
		import segno

		return segno.make_qr(str(text), error="m").png_data_uri(scale=4, border=2)
	except Exception:
		return None


@frappe.whitelist()
def get_barcode_card(order_bag):
	"""Label data for the Print Barcode page. Weights come from ACTUAL (never the BOM/plan);
	`actual_empty` flags cards with no actual weight yet (the page warns). Errors if qty > 1 —
	a multi-piece card must be extracted into singles first. No status restriction: a card can
	be barcode-printed at any stage."""
	if not order_bag or not frappe.db.exists("Order Bag", order_bag):
		return {"error": "No Order Bag {0}.".format(order_bag)}
	b = frappe.get_doc("Order Bag", order_bag)
	if int(b.qty or 0) > 1:
		return {"error": "{0}: qty is {1} — extract it into single pieces before printing.".format(b.name, b.qty)}
	gw = flt(b.act_gross_weight)
	return {
		"name": b.name,
		"design": b.design,
		"design_type": frappe.db.get_value("Design", b.design, "design_type") if b.design else None,
		"size": b.size,
		"qty": int(b.qty or 0),
		"gw": gw,
		"nett": flt(b.act_nett_weight),
		"purity": flt(b.act_purity),
		"dmd_no": int(b.act_dmd_no or 0), "dmd_wt": flt(b.act_dmd_weight),
		"ps_no": int(b.act_ps_no or 0), "ps_wt": flt(b.act_ps_weight),
		"cs_no": int(b.act_cs_no or 0), "cs_wt": flt(b.act_cs_weight),
		"actual_empty": not gw,
		"qr": _qr_data_uri(b.name),
	}


@frappe.whitelist()
def get_job_order_status(job_order):
	"""Where every piece of a Job Order is right now: current location, whether it's
	assigned/issued (and to whom), and when it entered that location. Accepts a Job Order
	name or any of its card codes. Used by the Job Order Status page."""
	from collections import Counter

	from jewelima.jewelima.benches import bench_doctype

	if not job_order:
		return {"error": "Enter a Job Order or a card code."}
	# accept a card code too -> resolve to its job order
	if not frappe.db.exists("Job Order", job_order):
		jo2 = frappe.db.get_value("Order Bag", job_order, "job_order")
		if jo2:
			job_order = jo2
		else:
			return {"error": "No Job Order (or card) '{0}'.".format(job_order)}

	bags = frappe.get_all(
		"Order Bag", filters={"job_order": job_order},
		fields=["name", "design", "qty", "location", "is_finished", "stock_status", "act_gross_weight"],
		order_by="name asc",
	)
	emp_names, out = {}, []
	for b in bags:
		loc = b.location
		status = employee = entered = None
		dt = bench_doctype(loc)
		if dt and frappe.db.exists("DocType", dt):
			recs = frappe.get_all(
				dt, filters={"order_bag": b.name},
				fields=["status", "employee", "time_in", "issued_at"], order_by="creation desc", limit=1,
			)
			if recs:
				status, employee = recs[0].status, recs[0].employee
				entered = recs[0].issued_at or recs[0].time_in
		if not entered and loc:
			entered = frappe.db.get_value(
				"Order Bag Transfer", {"order_bag": b.name, "to_location": loc}, "transfer_time", order_by="transfer_time desc"
			)
		if not entered:
			entered = frappe.db.get_value("Order Bag", b.name, "creation")
		if employee and employee not in emp_names:
			emp_names[employee] = frappe.db.get_value("Employee", employee, "employee_name") or employee
		out.append({
			"name": b.name, "design": b.design, "qty": b.qty,
			"location": loc or "—", "is_finished": b.is_finished, "stock_status": b.stock_status,
			"gross": flt(b.act_gross_weight),
			"status": status, "employee": employee, "employee_name": emp_names.get(employee),
			"entered": str(entered) if entered else None,
		})

	header = frappe.db.get_value(
		"Job Order", job_order, ["customer", "salesman", "order_type", "order_date", "due_date"], as_dict=True
	) or {}
	return {
		"job_order": job_order, "header": header, "bags": out, "total": len(out),
		"by_location": dict(Counter(x["location"] for x in out)),
	}


@frappe.whitelist()
def get_employee_performance(days=30):
	"""Per-employee shop-floor performance for the live TV dashboard: pieces completed,
	gold handled, loss + loss%, pieces today, work in hand now, and current held weight.
	Aggregated across every bench doctype over the last `days`."""
	from jewelima.jewelima.benches import BENCH_DOCTYPE

	days = int(days or 30)
	since = frappe.utils.add_days(frappe.utils.nowdate(), -days)
	today = frappe.utils.nowdate()
	agg = {}
	for dt in dict.fromkeys(BENCH_DOCTYPE.values()):
		if not frappe.db.exists("DocType", dt):
			continue
		for r in frappe.get_all(
			dt,
			filters={"employee": ["is", "set"], "creation": [">=", since]},
			fields=["employee", "status", "weight_out", "loss", "receipted_at", "creation"],
		):
			a = agg.setdefault(r.employee, {"pieces": 0, "gold": 0.0, "loss": 0.0, "today": 0, "active": 0})
			if r.status in ("Receipted", "Completed"):
				a["pieces"] += 1
				a["gold"] += flt(r.weight_out)
				a["loss"] += flt(r.loss)
				if str(r.receipted_at or r.creation)[:10] == today:
					a["today"] += 1
			elif r.status in ("Issued", "Ongoing"):
				a["active"] += 1

	rows = []
	for emp, a in agg.items():
		rows.append({
			"employee": emp,
			"name": frappe.db.get_value("Employee", emp, "employee_name") or emp,
			"pieces": a["pieces"], "gold": round(a["gold"], 3), "loss": round(a["loss"], 3),
			"loss_pct": round(a["loss"] / a["gold"] * 100, 2) if a["gold"] else 0,
			"today": a["today"], "active": a["active"],
			"holding": round(flt(frappe.db.get_value("Employee Metal Balance", emp, "current_weight")), 3),
		})
	rows.sort(key=lambda x: (-x["pieces"], x["loss_pct"]))
	return {"period_days": days, "as_of": frappe.utils.now_datetime().strftime("%d %b %H:%M"), "rows": rows}


@frappe.whitelist()
def get_tv_overview():
	"""Headline shop KPIs for the at-a-glance TV board: orders today/this month, pieces in
	production, pieces completed + loss today, workers active now, gold in hand, and a
	breakdown of work-in-progress by stage."""
	from collections import Counter

	from jewelima.jewelima.benches import BENCH_DOCTYPE

	today = frappe.utils.nowdate()
	month_start = today[:8] + "01"
	done_today, loss_today, active = 0, 0.0, set()
	for dt in dict.fromkeys(BENCH_DOCTYPE.values()):
		if not frappe.db.exists("DocType", dt):
			continue
		for r in frappe.get_all(dt, filters={"receipted_at": [">=", today]}, fields=["loss"]):
			done_today += 1
			loss_today += flt(r.loss)
		for r in frappe.get_all(dt, filters={"status": ["in", ["Issued", "Ongoing"]], "employee": ["is", "set"]}, fields=["employee"]):
			active.add(r.employee)
	gold = sum(flt(b.current_weight) for b in frappe.get_all("Employee Metal Balance", fields=["current_weight"]))
	by_stage = Counter((b.location or "—") for b in frappe.get_all("Order Bag", filters={"is_finished": 0}, fields=["location"]))
	return {
		"as_of": frappe.utils.now_datetime().strftime("%d %b %H:%M"),
		"orders_today": frappe.db.count("Job Order", {"order_date": today}),
		"orders_month": frappe.db.count("Job Order", {"order_date": [">=", month_start]}),
		"in_production": frappe.db.count("Order Bag", {"is_finished": 0}),
		"done_today": done_today,
		"active_workers": len(active),
		"gold_in_hand": round(gold, 1),
		"loss_today": round(loss_today, 3),
		"by_stage": [{"stage": k, "n": v} for k, v in by_stage.most_common(10)],
	}


@frappe.whitelist()
def get_orders_taken(days=30):
	"""Order intake from the ORIGINAL Order Bags (extraction pieces excluded via split_of),
	focused on TODAY: today's totals + karat split (22K/18K/14K) + top customers, plus a
	daily pure-gold trend over `days` for context. Plan/order-time weights; pure gold =
	nett grams x purity%."""
	from collections import defaultdict

	days = int(days or 30)
	today = frappe.utils.nowdate()
	since = frappe.utils.add_days(today, -days)
	bands = [("22K", 88, 96), ("18K", 70, 80), ("14K", 54, 63)]

	def karat(p):
		for k, lo, hi in bands:
			if lo <= p <= hi:
				return k
		return "Other"

	bags = frappe.get_all(
		"Order Bag",
		filters={"split_of": ["is", "not set"], "order_date": [">=", since]},
		fields=["order_date", "purity", "gross_weight", "nett_weight", "dmd_weight", "ps_weight", "cs_weight", "qty", "customer"],
	)
	tbk = defaultdict(lambda: {"orders": 0, "qty": 0, "gross": 0.0, "pure": 0.0})   # today, by karat
	ttot = {"orders": 0, "qty": 0, "gross": 0.0, "pure": 0.0, "dmd": 0.0, "ps": 0.0, "cs": 0.0}
	tcust = defaultdict(float)                                                      # today, by customer
	day = defaultdict(lambda: {"22K": 0.0, "18K": 0.0, "14K": 0.0, "Other": 0.0, "qty": 0})  # trend
	for b in bags:
		p = flt(b.purity)
		k = karat(p)
		q = int(b.qty or 0)
		pure = flt(b.nett_weight) * p / 100.0
		d = str(b.order_date)
		day[d][k] += pure; day[d]["qty"] += q
		if d == today:
			tbk[k]["orders"] += 1; tbk[k]["qty"] += q; tbk[k]["gross"] += flt(b.gross_weight); tbk[k]["pure"] += pure
			ttot["orders"] += 1; ttot["qty"] += q; ttot["gross"] += flt(b.gross_weight); ttot["pure"] += pure
			ttot["dmd"] += flt(b.dmd_weight); ttot["ps"] += flt(b.ps_weight); ttot["cs"] += flt(b.cs_weight)
			if b.customer:
				tcust[b.customer] += pure

	today_kar = [
		{"karat": k, "orders": tbk[k]["orders"], "qty": tbk[k]["qty"], "gross": round(tbk[k]["gross"], 1), "pure": round(tbk[k]["pure"], 1)}
		for k in ("22K", "18K", "14K", "Other") if tbk[k]["orders"]
	]
	trend = [
		{"date": d, "k22": round(v["22K"], 1), "k18": round(v["18K"], 1), "k14": round(v["14K"], 1), "qty": v["qty"]}
		for d, v in sorted(day.items())
	]
	top = sorted(tcust.items(), key=lambda x: -x[1])[:8]
	return {
		"date": frappe.utils.formatdate(today, "dd MMM yyyy"),
		"as_of": frappe.utils.now_datetime().strftime("%H:%M"),
		"days": days,
		"today": {**{k: (round(v, 1) if isinstance(v, float) else v) for k, v in ttot.items()}, "by_karat": today_kar},
		"trend": trend,
		"top_customers": [{"customer": c, "pure": round(w, 1)} for c, w in top],
	}
