# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
"""REPAIR — taking work in from a party.

A batch is one party, one arrival: who sent it, when it came, who took it. The
rows are the pieces — a design type, how many, what work they need. The batch is
numbered REP-00001 and every row carries its own number under it (REP-00001-3),
so a single piece can be referred to without dragging the batch along.

Party and Type of Work are their own tables, and both are open vocabularies:
typing a new one on the intake page adds it, because the person at the counter
is not going to stop and go set up a master first.
"""

import frappe
from frappe.utils import cint, flt

REPAIR_ROLES = ("System Manager", "JW Manager", "Jewelima Repair")


def _guard():
	if not set(REPAIR_ROLES) & set(frappe.get_roles()):
		frappe.throw(frappe._("The repair desk is for the repair team."), frappe.PermissionError)


# --- the two open vocabularies ---------------------------------------------
def _master(dt, field, value, create=True):
	"""Find a party / work type by name, adding it if it is new."""
	value = " ".join(str(value or "").split())
	if not value:
		return None
	hit = frappe.db.get_value(dt, {field: value}, "name")
	if hit:
		return hit
	# a different case of the same name is the same name
	hit = frappe.db.get_value(dt, {field: ["like", value]}, "name")
	if hit:
		return hit
	if not create:
		frappe.throw(frappe._("{0} {1} not found.").format(dt, value))
	return frappe.get_doc({"doctype": dt, field: value, "active": 1}).insert(
		ignore_permissions=True).name


@frappe.whitelist()
def get_repair_parties(include_inactive=0):
	_guard()
	filters = {} if cint(include_inactive) else {"active": 1}
	return frappe.get_all("Repair Party", filters=filters,
		fields=["name", "party_name", "active", "notes"], order_by="party_name")


@frappe.whitelist()
def add_repair_party(party_name, notes=None):
	_guard()
	name = _master("Repair Party", "party_name", party_name)
	if not name:
		frappe.throw(frappe._("Enter the party's name."))
	if notes:
		frappe.db.set_value("Repair Party", name, "notes", notes)
	frappe.db.commit()
	return {"name": name}


@frappe.whitelist()
def set_repair_party(name, party_name=None, active=None, notes=None):
	"""Rename, retire or annotate a party. A rename follows every batch."""
	_guard()
	if not frappe.db.exists("Repair Party", name):
		frappe.throw(frappe._("No party {0}.").format(name))
	if party_name and party_name.strip() and party_name.strip() != name:
		frappe.rename_doc("Repair Party", name, party_name.strip(), force=True)
		name = party_name.strip()
	vals = {}
	if active is not None:
		vals["active"] = cint(active)
	if notes is not None:
		vals["notes"] = notes
	if vals:
		frappe.db.set_value("Repair Party", name, vals)
	frappe.db.commit()
	return {"name": name}


@frappe.whitelist()
def delete_repair_party(name):
	"""Only while nothing has come in from them — otherwise retire instead."""
	_guard()
	used = frappe.db.count("Repair Order", {"party": name})
	if used:
		frappe.throw(frappe._("{0} is on {1} repair(s) — untick Active to retire them instead.").format(name, used))
	frappe.delete_doc("Repair Party", name, force=True, ignore_permissions=True)
	frappe.db.commit()
	return {"deleted": name}


@frappe.whitelist()
def get_repair_work_types(include_inactive=0):
	_guard()
	filters = {} if cint(include_inactive) else {"active": 1}
	return frappe.get_all("Repair Work Type", filters=filters,
		fields=["name", "work_name", "active", "notes"], order_by="work_name")


@frappe.whitelist()
def add_repair_work_type(work_name, notes=None):
	_guard()
	name = _master("Repair Work Type", "work_name", work_name)
	if not name:
		frappe.throw(frappe._("Enter the type of work."))
	if notes:
		frappe.db.set_value("Repair Work Type", name, "notes", notes)
	frappe.db.commit()
	return {"name": name}


@frappe.whitelist()
def set_repair_work_type(name, work_name=None, active=None, notes=None):
	_guard()
	if not frappe.db.exists("Repair Work Type", name):
		frappe.throw(frappe._("No type of work {0}.").format(name))
	if work_name and work_name.strip() and work_name.strip() != name:
		frappe.rename_doc("Repair Work Type", name, work_name.strip(), force=True)
		name = work_name.strip()
	vals = {}
	if active is not None:
		vals["active"] = cint(active)
	if notes is not None:
		vals["notes"] = notes
	if vals:
		frappe.db.set_value("Repair Work Type", name, vals)
	frappe.db.commit()
	return {"name": name}


@frappe.whitelist()
def delete_repair_work_type(name):
	_guard()
	used = frappe.db.count("Repair Order Item", {"work_types": ["like", "%{0}%".format(name)]})
	if used:
		frappe.throw(frappe._("{0} is on {1} line(s) — untick Active to retire it instead.").format(name, used))
	frappe.delete_doc("Repair Work Type", name, force=True, ignore_permissions=True)
	frappe.db.commit()
	return {"deleted": name}


@frappe.whitelist()
def get_repair_types(include_inactive=0):
	_guard()
	filters = {} if cint(include_inactive) else {"active": 1}
	return frappe.get_all("Repair Type", filters=filters,
		fields=["name", "type_name", "active", "notes"], order_by="type_name")


@frappe.whitelist()
def add_repair_type(type_name, notes=None):
	_guard()
	name = _master("Repair Type", "type_name", type_name)
	if not name:
		frappe.throw(frappe._("Enter the type."))
	if notes:
		frappe.db.set_value("Repair Type", name, "notes", notes)
	frappe.db.commit()
	return {"name": name}


@frappe.whitelist()
def set_repair_type(name, type_name=None, active=None, notes=None):
	_guard()
	if not frappe.db.exists("Repair Type", name):
		frappe.throw(frappe._("No type {0}.").format(name))
	if type_name and type_name.strip() and type_name.strip() != name:
		frappe.rename_doc("Repair Type", name, type_name.strip(), force=True)
		name = type_name.strip()
	vals = {}
	if active is not None:
		vals["active"] = cint(active)
	if notes is not None:
		vals["notes"] = notes
	if vals:
		frappe.db.set_value("Repair Type", name, vals)
	frappe.db.commit()
	return {"name": name}


@frappe.whitelist()
def delete_repair_type(name):
	_guard()
	used = frappe.db.count("Repair Order Item", {"repair_type": name})
	if used:
		frappe.throw(frappe._("{0} is on {1} line(s) — untick Active to retire it instead.").format(name, used))
	frappe.delete_doc("Repair Type", name, force=True, ignore_permissions=True)
	frappe.db.commit()
	return {"deleted": name}


@frappe.whitelist()
def repair_type_usage():
	"""{type: how many lines name it}."""
	_guard()
	return {r[0]: r[1] for r in frappe.db.sql(
		"SELECT repair_type, COUNT(*) FROM `tabRepair Order Item` "
		"WHERE IFNULL(repair_type,'') != '' GROUP BY repair_type")}


@frappe.whitelist()
def repair_party_usage():
	"""{party: how many batches name it} — what makes a delete safe or not."""
	_guard()
	return {r[0]: r[1] for r in frappe.db.sql(
		"SELECT party, COUNT(*) FROM `tabRepair Order` GROUP BY party")}


@frappe.whitelist()
def repair_work_type_usage():
	"""{type of work: how many lines name it}."""
	_guard()
	# the row holds a comma-separated list, so count by looking inside it
	out = {}
	for name in frappe.get_all("Repair Work Type", pluck="name"):
		out[name] = frappe.db.count("Repair Order Item",
			{"work_types": ["like", "%{0}%".format(name)]})
	return out


# --- taking a batch in ------------------------------------------------------
@frappe.whitelist()
def get_repair_intake_options():
	"""Everything the intake page picks from."""
	_guard()
	return {
		"parties": [p["party_name"] for p in get_repair_parties()],
		"work_types": [w["work_name"] for w in get_repair_work_types()],
		"types": [t["type_name"] for t in get_repair_types()],
		"design_types": frappe.get_all("Design Type", pluck="name", order_by="name"),
		"received_by": frappe.session.user,
		"received_by_name": frappe.db.get_value("User", frappe.session.user, "full_name")
			or frappe.session.user,
	}


@frappe.whitelist()
def create_repair_order(payload):
	"""Take a batch in. A party or type of work typed for the first time is
	added to its table rather than refused — the counter is not the place to
	stop and set up a master."""
	_guard()
	p = frappe.parse_json(payload)
	rows = p.get("items") or []
	if not rows:
		frappe.throw(frappe._("Add at least one piece."))
	party = _master("Repair Party", "party_name", p.get("party"))
	if not party:
		frappe.throw(frappe._("Pick or type the party."))

	items = []
	for i, r in enumerate(rows, start=1):
		dt = (r.get("design_type") or "").strip()
		if not dt:
			frappe.throw(frappe._("Row {0}: pick a design type — it cannot be blank.").format(i))
		if not frappe.db.exists("Design Type", dt):
			frappe.throw(frappe._("Row {0}: {1} is not a design type.").format(i, dt))
		qty = cint(r.get("qty"))
		if qty <= 0:
			frappe.throw(frappe._("Row {0}: quantity must be at least 1.").format(i))
		# a piece can need several things doing to it, or nothing decided yet
		raw = r.get("work_types")
		if raw is None:
			raw = r.get("work_type")          # a single value still works
		if not isinstance(raw, (list, tuple)):
			raw = str(raw or "").split(",")
		works = []
		for w in raw:
			name = _master("Repair Work Type", "work_name", w)
			if name and name not in works:
				works.append(name)
		items.append({"design_type": dt, "qty": qty,
			"weight": flt(r.get("weight")),
			"repair_type": _master("Repair Type", "type_name", r.get("repair_type")),
			"work_types": ", ".join(works) or None,
			"narration": (r.get("narration") or "").strip() or None})

	doc = frappe.get_doc({
		"doctype": "Repair Order", "party": party,
		"received_at": p.get("received_at") or frappe.utils.now_datetime(),
		"received_by": frappe.session.user,
		"narration": (p.get("narration") or "").strip() or None,
		"items": items,
	}).insert(ignore_permissions=True)
	frappe.db.commit()
	return get_repair_order(doc.name)


@frappe.whitelist()
def get_repair_order(name):
	_guard()
	doc = frappe.get_doc("Repair Order", name)
	return {
		"name": doc.name, "party": doc.party,
		"received_at": str(doc.received_at or ""),
		"received_by": doc.received_by,
		"received_by_name": frappe.db.get_value("User", doc.received_by, "full_name") or doc.received_by,
		"narration": doc.narration or "",
		"total_qty": cint(doc.total_qty), "total_rows": cint(doc.total_rows),
		"total_weight": flt(doc.total_weight),
		"items": [{"repair": r.repair, "design_type": r.design_type,
			"repair_type": r.repair_type or "", "qty": cint(r.qty),
			"weight": flt(r.weight), "weighed_at": str(r.weighed_at or "")[:16],
			"work_types": [w.strip() for w in (r.work_types or "").split(",") if w.strip()],
			"narration": r.narration or ""} for r in doc.items],
	}


@frappe.whitelist()
def list_repair_orders(party=None, from_date=None, to_date=None, limit=200):
	"""The batches taken in, newest first."""
	_guard()
	filters = {}
	if party:
		filters["party"] = party
	if from_date and to_date:
		filters["received_at"] = ["between", [str(from_date) + " 00:00:00", str(to_date) + " 23:59:59"]]
	rows = frappe.get_all("Repair Order", filters=filters,
		fields=["name", "party", "received_at", "received_by", "total_qty", "total_weight",
			"total_rows", "narration"],
		order_by="received_at desc, creation desc", limit_page_length=cint(limit) or 200)
	users = {u.name: (u.full_name or u.name) for u in frappe.get_all("User",
		filters={"name": ["in", list({r.received_by for r in rows}) or [""]]},
		fields=["name", "full_name"])} if rows else {}
	out = []
	for r in rows:
		out.append({**r, "received_at": str(r.received_at or "")[:16],
			"received_by_name": users.get(r.received_by, r.received_by)})
	return {"rows": out,
		"totals": {"batches": len(out), "qty": sum(cint(r["total_qty"]) for r in out),
			"weight": round(sum(flt(r["total_weight"]) for r in out), 3),
			"lines": sum(cint(r["total_rows"]) for r in out),
			"parties": len({r["party"] for r in out})}}


# --- status ----------------------------------------------------------------
@frappe.whitelist()
def get_repair_status(party=None, state="all", from_date=None, to_date=None, limit=200):
	"""Every batch as a card: what came in, what it weighs, and whether it is
	billed. `state`: all | open | billed."""
	_guard()
	filters = {}
	if party:
		filters["party"] = party
	if from_date and to_date:
		filters["received_at"] = ["between", [str(from_date) + " 00:00:00", str(to_date) + " 23:59:59"]]
	orders = frappe.get_all("Repair Order", filters=filters,
		fields=["name", "party", "received_at", "received_by", "total_qty", "total_rows",
			"total_weight", "narration"],
		order_by="received_at desc, creation desc", limit_page_length=cint(limit) or 200)

	billed = {b.repair_order: b for b in frappe.get_all("Repair Bill",
		filters={"repair_order": ["in", [o.name for o in orders] or [""]]},
		fields=["name", "repair_order", "billed_at", "total_charges", "total_metal_added"])}
	users = {u.name: (u.full_name or u.name) for u in frappe.get_all("User",
		filters={"name": ["in", list({o.received_by for o in orders}) or [""]]},
		fields=["name", "full_name"])} if orders else {}

	rows = []
	for o in orders:
		b = billed.get(o.name)
		if state == "open" and b:
			continue
		if state == "billed" and not b:
			continue
		items = frappe.get_all("Repair Order Item", filters={"parent": o.name},
			fields=["repair", "design_type", "qty", "weight", "weighed_at",
				"work_types", "repair_type", "narration"], order_by="idx")
		rows.append({
			"name": o.name, "party": o.party,
			"received_at": str(o.received_at or "")[:16],
			"received_by": users.get(o.received_by, o.received_by),
			"total_qty": cint(o.total_qty), "total_rows": cint(o.total_rows),
			"total_weight": flt(o.total_weight), "narration": o.narration or "",
			"bill": (b.name if b else None),
			"billed_at": (str(b.billed_at or "")[:16] if b else ""),
			"charges": (flt(b.total_charges) if b else 0),
			"metal_added": (flt(b.total_metal_added) if b else 0),
			"items": [{**i, "qty": cint(i["qty"]), "weight": flt(i["weight"]),
				"weighed_at": str(i["weighed_at"] or "")[:16],
				"work_types": [w.strip() for w in (i["work_types"] or "").split(",") if w.strip()]}
				for i in items],
		})
	return {"rows": rows,
		"parties": [p["party_name"] for p in get_repair_parties(include_inactive=1)],
		"totals": {"batches": len(rows),
			"pieces": sum(r["total_qty"] for r in rows),
			"weight": round(sum(r["total_weight"] for r in rows), 3),
			"open": sum(1 for r in rows if not r["bill"]),
			"billed": sum(1 for r in rows if r["bill"])}}


# --- billing ---------------------------------------------------------------
@frappe.whitelist()
def get_repair_for_billing(repair_order):
	"""A batch ready to be billed: its pieces with the weight they came in at,
	and every type of work on it with how many pieces need it."""
	_guard()
	if not frappe.db.exists("Repair Order", repair_order):
		frappe.throw(frappe._("No repair {0}.").format(repair_order))
	o = frappe.get_doc("Repair Order", repair_order)
	existing = frappe.db.get_value("Repair Bill", {"repair_order": repair_order}, "name")
	bill = frappe.get_doc("Repair Bill", existing) if existing else None
	out_of = {r.repair: r for r in (bill.items if bill else [])}
	rate_of = {c.work_type: flt(c.rate) for c in (bill.charges if bill else [])}

	items, tally = [], {}
	for r in o.items:
		works = [w.strip() for w in (r.work_types or "").split(",") if w.strip()]
		for w in works:
			tally[w] = tally.get(w, 0) + 1
		prior = out_of.get(r.repair)
		items.append({
			"repair": r.repair, "design_type": r.design_type, "qty": cint(r.qty),
			"weight_in": flt(r.weight),
			"weight_out": (flt(prior.weight_out) if prior else 0),
			"work_types": works, "repair_type": r.repair_type or "",
			"narration": r.narration or "",
		})
	charges = [{"work_type": w, "pieces": n, "rate": rate_of.get(w, 0)}
		for w, n in sorted(tally.items(), key=lambda x: (-x[1], x[0]))]
	return {
		"repair_order": o.name, "party": o.party,
		"received_at": str(o.received_at or "")[:16],
		"total_qty": cint(o.total_qty), "total_weight_in": flt(o.total_weight),
		"items": items, "charges": charges,
		"bill": (bill.name if bill else None),
		"billed_at": (str(bill.billed_at or "")[:16] if bill else ""),
		"narration": (bill.narration if bill else ""),
	}


@frappe.whitelist()
def save_repair_bill(payload):
	"""Weigh the batch out and price the work. One bill per repair — billing a
	second time edits the first rather than making a rival copy of it."""
	_guard()
	p = frappe.parse_json(payload)
	order = p.get("repair_order")
	if not order or not frappe.db.exists("Repair Order", order):
		frappe.throw(frappe._("Pick the repair to bill."))
	o = frappe.get_doc("Repair Order", order)
	src = {r.repair: r for r in o.items}

	items = []
	for r in p.get("items") or []:
		row = src.get(r.get("repair"))
		if not row:
			continue
		items.append({
			"repair": row.repair, "design_type": row.design_type, "qty": cint(row.qty),
			"weight_in": flt(row.weight), "weight_out": flt(r.get("weight_out")),
			"work_types": row.work_types, "repair_type": row.repair_type,
			"narration": row.narration,
		})
	charges = []
	for c in p.get("charges") or []:
		w = c.get("work_type")
		if not w or not frappe.db.exists("Repair Work Type", w):
			continue
		charges.append({"work_type": w, "pieces": cint(c.get("pieces")), "rate": flt(c.get("rate"))})

	existing = frappe.db.get_value("Repair Bill", {"repair_order": order}, "name")
	doc = frappe.get_doc("Repair Bill", existing) if existing else frappe.new_doc("Repair Bill")
	doc.repair_order = order
	doc.party = o.party
	doc.billed_at = p.get("billed_at") or frappe.utils.now_datetime()
	doc.narration = (p.get("narration") or "").strip() or None
	doc.set("items", items)
	doc.set("charges", charges)
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return get_repair_bill(doc.name)


@frappe.whitelist()
def get_repair_bill(name):
	_guard()
	d = frappe.get_doc("Repair Bill", name)
	return {
		"name": d.name, "repair_order": d.repair_order, "party": d.party,
		"billed_at": str(d.billed_at or "")[:16],
		"billed_by": frappe.db.get_value("User", d.billed_by, "full_name") or d.billed_by,
		"total_weight_in": flt(d.total_weight_in), "total_weight_out": flt(d.total_weight_out),
		"total_metal_added": flt(d.total_metal_added), "total_charges": flt(d.total_charges),
		"narration": d.narration or "",
		"items": [{"repair": r.repair, "design_type": r.design_type, "qty": cint(r.qty),
			"weight_in": flt(r.weight_in), "weight_out": flt(r.weight_out),
			"metal_added": flt(r.metal_added),
			"work_types": [w.strip() for w in (r.work_types or "").split(",") if w.strip()],
			"repair_type": r.repair_type or "", "narration": r.narration or ""} for r in d.items],
		"charges": [{"work_type": c.work_type, "pieces": cint(c.pieces),
			"rate": flt(c.rate), "amount": flt(c.amount)} for c in d.charges],
	}


@frappe.whitelist()
def list_billable_repairs(unbilled_only=0):
	"""The batches to pick from on the billing screen.

	Billed ones are listed too, and said to be billed. Hiding them made a batch
	vanish from the picker the moment it was billed, which reads as the bill not
	having saved — the one thing the screen must never suggest. Unbilled first,
	since that is what someone standing at the counter is looking for."""
	_guard()
	billed = set(frappe.get_all("Repair Bill", pluck="repair_order"))
	rows = []
	for o in frappe.get_all("Repair Order",
			fields=["name", "party", "received_at", "total_qty", "total_weight"],
			order_by="received_at desc, creation desc", limit_page_length=300):
		is_billed = o.name in billed
		if cint(unbilled_only) and is_billed:
			continue
		rows.append({**o, "received_at": str(o.received_at or "")[:16],
			"total_qty": cint(o.total_qty), "total_weight": flt(o.total_weight),
			"billed": is_billed})
	rows.sort(key=lambda r: (r["billed"],))       # still-to-bill at the top
	return rows


@frappe.whitelist()
def update_repair_order(name, items, narration=None):
	"""Fill in what was not known at the counter: a weight nobody had time to
	take, the work a piece turns out to need.

	What came in is left alone — the design type, how many, and the party are
	what was received, and changing those after the fact would make the record
	disagree with the goods. A billed batch is refused outright: the bill copied
	these weights when it was made, so moving them now would leave the two
	saying different things about the same job."""
	_guard()
	if not frappe.db.exists("Repair Order", name):
		frappe.throw(frappe._("No repair {0}.").format(name))
	bill = frappe.db.get_value("Repair Bill", {"repair_order": name}, "name")
	if bill:
		frappe.throw(frappe._("{0} is billed as {1} — change it on the bill, or the two will "
			"disagree about the same job.").format(name, bill))

	items = frappe.parse_json(items) if isinstance(items, str) else (items or [])
	doc = frappe.get_doc("Repair Order", name)
	by_repair = {r.repair: r for r in doc.items}
	for r in items or []:
		row = by_repair.get(r.get("repair"))
		if not row:
			continue
		if "weight" in r:
			row.weight = flt(r.get("weight"))
		if "work_types" in r:
			raw = r.get("work_types")
			if not isinstance(raw, (list, tuple)):
				raw = str(raw or "").split(",")
			works = []
			for w in raw:
				got = _master("Repair Work Type", "work_name", w)
				if got and got not in works:
					works.append(got)
			row.work_types = ", ".join(works) or None
		if "narration" in r:
			row.narration = (r.get("narration") or "").strip() or None
	if narration is not None:
		doc.narration = (narration or "").strip() or None
	doc.save(ignore_permissions=True)      # re-stamps the weighing, re-totals the batch
	frappe.db.commit()
	return get_repair_order(name)
