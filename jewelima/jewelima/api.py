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
	codes = list({m.item for m in mats if m.item})
	stype = {}
	if codes:
		for it in frappe.get_all("Item", filters={"name": ["in", codes]}, fields=["name", "stone_type"]):
			stype[it.name] = it.stone_type

	NO_BUCKET = {"Diamond": "dmd_no", "Precious Stone": "ps_no", "Color Stone": "cs_no"}
	WT_BUCKET = {"Diamond": "dmd_weight", "Precious Stone": "ps_weight", "Color Stone": "cs_weight"}
	metal_g = 0.0
	purity_num = 0.0  # sum(gram * purity) for metal rows
	metal_purities = []  # fallback when no gram weights entered yet
	for m in mats:
		st = stype.get(m.item)
		if st in NO_BUCKET:  # a stone — count + carat weight
			out[NO_BUCKET[st]] += int(m.qty or 0)
			out[WT_BUCKET[st]] += flt(m.weight)
		else:  # metal / other — nett grams + purity
			metal_g += flt(m.weight)
			purity_num += flt(m.weight) * flt(m.purity)
			if flt(m.purity):
				metal_purities.append(flt(m.purity))

	stone_g = (out["dmd_weight"] + out["ps_weight"] + out["cs_weight"]) * 0.2  # 1 ct = 0.2 g
	# the metal/piece weight entered IS the gross; nett = gross - stone weight
	out["gross_weight"] = round(metal_g, 3)
	out["nett_weight"] = round(max(metal_g - stone_g, 0.0), 3)
	if metal_g:
		out["purity"] = round(purity_num / metal_g, 3)  # gram-weighted
	elif metal_purities:
		out["purity"] = round(sum(metal_purities) / len(metal_purities), 3)  # avg of metal purities
	for k in ("dmd_weight", "ps_weight", "cs_weight"):
		out[k] = round(out[k], 3)
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
	# create the destination bench's record (only if that bench doctype exists yet)
	try:
		from jewelima.jewelima.benches import on_bag_arrival
		on_bag_arrival(order_bag, to_location)
	except Exception:
		frappe.log_error(frappe.get_traceback(), "on_bag_arrival failed")
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
	"""Give gold (grams) to a bag — the Casting 'add weight' action."""
	name = _bag_ledger(order_bag, item, "In", qty, "Gold Issue", bench=bench, remarks=remarks)
	return {"ledger": name, **get_bag_contents(order_bag)}


@frappe.whitelist()
def issue_stones(order_bag, item, qty, bench=None, remarks=None):
	"""Issue stones (carats) into a bag — done before the piece goes to work."""
	name = _bag_ledger(order_bag, item, "In", qty, "Stone Issue", bench=bench, remarks=remarks)
	return {"ledger": name, **get_bag_contents(order_bag)}


@frappe.whitelist()
def book_loss(order_bag, item, qty, bench=None, employee=None, remarks=None):
	"""Record metal loss out of a bag (the out-minus-in difference at a bench)."""
	name = _bag_ledger(order_bag, item, "Out", qty, "Loss", bench=bench, employee=employee, remarks=remarks)
	return {"ledger": name, **get_bag_contents(order_bag)}


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
	c = get_bag_contents(order_bag)
	held = [it for it in c["items"] if it["qty"] > 0]
	if not held:
		frappe.throw(frappe._("{0} holds no materials to convert.").format(order_bag))
	for it in held:
		_bag_ledger(order_bag, it["item"], "Out", it["qty"], "Convert")
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
