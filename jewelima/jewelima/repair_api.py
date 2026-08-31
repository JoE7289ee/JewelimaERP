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
		"sieves": get_repair_sieves(),
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

	items, stones = [], []
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
		karat = str(r.get("karat") or "").strip()
		if karat and karat not in ("22", "18", "14", "9"):
			frappe.throw(frappe._("Row {0}: {1} is not a karat we take in.").format(i, karat))
		items.append({"design_type": dt, "qty": qty,
			"weight": flt(r.get("weight")),
			"karat": karat or None,
			"repair_type": _master("Repair Type", "type_name", r.get("repair_type")),
			"work_types": ", ".join(works) or None,
			"narration": (r.get("narration") or "").strip() or None})
		# stones are named against the piece, which only gets its number on insert,
		# so they are held by row index here and stamped once the batch exists
		stones.append(r.get("stones") or [])

	doc = frappe.get_doc({
		"doctype": "Repair Order", "party": party,
		"received_at": p.get("received_at") or frappe.utils.now_datetime(),
		"received_by": frappe.session.user,
		"narration": (p.get("narration") or "").strip() or None,
		"items": items,
	}).insert(ignore_permissions=True)

	if any(stones):
		rows = []
		for row, group in zip(doc.items, stones):
			for st in (group or []):
				name = " ".join(str(st.get("stone") or "").split())
				if not name:
					continue
				rows.append({"repair": row.repair, "stone": name,
					"sieve": (st.get("sieve") or "").strip(),
					"pcs": cint(st.get("pcs")), "ct": flt(st.get("ct"))})
		if rows:
			doc.set("stones", rows)
			doc.save(ignore_permissions=True)
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
		stone_rows = {}
		for st in frappe.get_all("Repair Stone", filters={"parent": o.name},
				fields=["repair", "stone", "sieve", "pcs", "ct"], order_by="idx"):
			stone_rows.setdefault(st.repair, []).append(st)
		items = frappe.get_all("Repair Order Item", filters={"parent": o.name},
			fields=["repair", "design_type", "qty", "weight", "weighed_at",
				"work_types", "repair_type", "narration",
				"weight_out", "karat", "bill"], order_by="idx")
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
				"weight_out": flt(i.get("weight_out")), "karat": i.get("karat") or "",
				"bill": i.get("bill") or "",
				"stones": [{"stone": st.stone, "sieve": st.sieve or "", "pcs": cint(st.pcs),
					"ct": flt(st.ct)} for st in stone_rows.get(i["repair"], [])],
				"weighed_at": str(i["weighed_at"] or "")[:16],
				"work_types": [w.strip() for w in (i["work_types"] or "").split(",") if w.strip()]}
				for i in items],
		})
	return {"rows": rows, "sieves": get_repair_sieves(),
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
		if not r.bill:                      # pieces already billed are not charged again
			for w in works:
				tally[w] = tally.get(w, 0) + 1
		prior = out_of.get(r.repair)
		items.append({
			"repair": r.repair, "design_type": r.design_type, "qty": cint(r.qty),
			"weight_in": flt(r.weight),
			# the row is the record — a piece is weighed out at the counter long
			# before anyone prices it, so the bill is a copy, not the source
			"weight_out": flt(r.weight_out) or (flt(prior.weight_out) if prior else 0),
			"weighed_out_at": str(r.weighed_out_at or "")[:16],
			"work_types": works, "repair_type": r.repair_type or "",
			"narration": r.narration or "",
			"karat": r.karat or "",
			"stones": [{"stone": st.stone, "sieve": st.sieve or "", "pcs": cint(st.pcs),
				"ct": flt(st.ct)} for st in o.stones if st.repair == r.repair],
			"bill": r.bill or "",
		})
	charges = [{"work_type": w, "pieces": n, "rate": rate_of.get(w, 0)}
		for w, n in sorted(tally.items(), key=lambda x: (-x[1], x[0]))]

	# stones are priced per carat by quality+sieve, the same shape as the work
	open_ids = {r.repair for r in o.items if not r.bill}
	st_rate = {}
	if bill:
		for st in bill.stones:
			st_rate[(st.stone, st.sieve or "")] = flt(st.rate)
	grp = {}
	for st in o.stones:
		if st.repair not in open_ids:
			continue
		k = (st.stone, st.sieve or "")
		g = grp.setdefault(k, {"stone": st.stone, "sieve": st.sieve or "", "pcs": 0, "ct": 0.0})
		g["pcs"] += cint(st.pcs)
		g["ct"] = round(g["ct"] + flt(st.ct), 3)
	stone_lines = [{**g, "rate": st_rate.get((g["stone"], g["sieve"]), 0)}
		for g in sorted(grp.values(), key=lambda x: (x["stone"], x["sieve"]))]
	return {
		"repair_order": o.name, "party": o.party,
		"received_at": str(o.received_at or "")[:16],
		"total_qty": cint(o.total_qty), "total_weight_in": flt(o.total_weight),
		"items": items, "charges": charges, "stone_lines": stone_lines,
		"gold_rate": flt(bill.gold_rate) if bill else 0,
		"bill": (bill.name if bill else None),
		"billed_at": (str(bill.billed_at or "")[:16] if bill else ""),
		"narration": (bill.narration if bill else ""),
	}


@frappe.whitelist()
def save_repair_weights(repair_order, rows):
	"""Weigh pieces out without billing them.

	Half a batch is often finished and weighed while the rest is still on the
	bench, and that weight must survive being written down — so it is kept on the
	piece, not held on screen until somebody is ready to price the whole batch."""
	_guard()
	if not frappe.db.exists("Repair Order", repair_order):
		frappe.throw(frappe._("No repair {0}.").format(repair_order))
	o = frappe.get_doc("Repair Order", repair_order)
	by_id = {r.repair: r for r in o.items}
	touched = 0
	for r in frappe.parse_json(rows) or []:
		row = by_id.get(r.get("repair"))
		if not row or row.bill:            # a billed piece is settled; leave it
			continue
		w = flt(r.get("weight_out"))
		if w < 0:
			frappe.throw(frappe._("{0}: weight out cannot be negative.").format(row.repair))
		if abs(flt(row.weight_out) - w) > 0.0005:
			row.weight_out = w
			touched += 1
		if "karat" in r and (r.get("karat") or "") != (row.karat or ""):
			row.karat = r.get("karat") or None
			touched += 1
	if touched:
		o.save(ignore_permissions=True)
		frappe.db.commit()
	return {"saved": touched, **get_repair_for_billing(repair_order)}


@frappe.whitelist()
def set_piece_work_types(repair_order, repair, work_types):
	"""Put the work a piece needs on it, from wherever it is noticed.

	What a piece needs is often only clear once it is in front of you at the
	weigh-out, so the billing screen can say so too — not just the intake."""
	_guard()
	if not frappe.db.exists("Repair Order", repair_order):
		frappe.throw(frappe._("No repair {0}.").format(repair_order))
	o = frappe.get_doc("Repair Order", repair_order)
	row = next((r for r in o.items if r.repair == repair), None)
	if not row:
		frappe.throw(frappe._("No piece {0}.").format(repair))
	if row.bill:
		frappe.throw(frappe._("{0} is billed on {1} — its work cannot change.").format(repair, row.bill))
	names = frappe.parse_json(work_types) if isinstance(work_types, str) else work_types
	row.work_types = ", ".join(_clean_types(names)) or None
	o.save(ignore_permissions=True)
	frappe.db.commit()
	return get_repair_for_billing(repair_order)


def _clean_types(names):
	"""Names as typed -> real Repair Work Types, creating one that is new. The
	counter should not have to leave the screen to record work it just found."""
	out = []
	for n in (names or []):
		n = " ".join(str(n or "").split())
		if not n:
			continue
		real = _master("Repair Work Type", "work_name", n, create=True)
		if real and real not in out:
			out.append(real)
	return out


@frappe.whitelist()
def get_repair_sieves():
	"""The sieve chart, for putting stones on a piece.

	Repair stones are NOT taken from stock — nothing is issued or reserved. The
	chart is used only so the sizes written down are the same ones used
	everywhere else, and so carats can be worked out from a count."""
	_guard()
	rows = frappe.get_all("Diamond Sieve", fields=["sieve_size", "avg_cts", "idx_order"],
		order_by="idx_order asc, sieve_size asc")
	return [{"sieve": r.sieve_size, "avg_cts": flt(r.avg_cts)} for r in rows]


@frappe.whitelist()
def set_piece_stones(repair_order, repair, stones):
	"""Replace the stones set into one piece."""
	_guard()
	if not frappe.db.exists("Repair Order", repair_order):
		frappe.throw(frappe._("No repair {0}.").format(repair_order))
	o = frappe.get_doc("Repair Order", repair_order)
	row = next((r for r in o.items if r.repair == repair), None)
	if not row:
		frappe.throw(frappe._("No piece {0}.").format(repair))
	if row.bill:
		frappe.throw(frappe._("{0} is billed on {1} — its stones cannot change.").format(repair, row.bill))
	want = frappe.parse_json(stones) if isinstance(stones, str) else (stones or [])
	kept = [st for st in o.stones if st.repair != repair]
	fresh = []
	for st in want:
		name = " ".join(str(st.get("stone") or "").split())
		if not name:
			continue
		if cint(st.get("pcs")) < 0 or flt(st.get("ct")) < 0:
			frappe.throw(frappe._("Stones cannot be negative."))
		fresh.append({"repair": repair, "stone": name, "sieve": (st.get("sieve") or "").strip(),
			"pcs": cint(st.get("pcs")), "ct": flt(st.get("ct"))})
	o.set("stones", [{"repair": k.repair, "stone": k.stone, "sieve": k.sieve,
		"pcs": cint(k.pcs), "ct": flt(k.ct)} for k in kept] + fresh)
	o.save(ignore_permissions=True)
	frappe.db.commit()
	return get_repair_for_billing(repair_order)


@frappe.whitelist()
def list_open_repairs(include_done=0):
	"""The billing floor: one tile per batch that still has pieces to bill.

	A batch is 'open' while any piece is unbilled, so a half-billed batch stays
	on screen with only its remaining pieces counted — that is what someone at
	the counter is looking for."""
	_guard()
	rows = []
	orders = frappe.get_all("Repair Order",
		fields=["name", "party", "received_at", "total_qty", "total_weight"],
		order_by="received_at desc, creation desc", limit_page_length=400)
	if not orders:
		return rows
	pieces = frappe.get_all("Repair Order Item",
		filters={"parent": ["in", [o.name for o in orders]]},
		fields=["parent", "repair", "weight", "weight_out", "bill", "work_types"])
	by_order = {}
	for p in pieces:
		by_order.setdefault(p.parent, []).append(p)
	for o in orders:
		ps = by_order.get(o.name) or []
		open_ps = [p for p in ps if not p.bill]
		done_ps = [p for p in ps if p.bill]
		if not open_ps and not cint(include_done):
			continue
		rows.append({
			"repair_order": o.name, "party": o.party,
			"received_at": str(o.received_at or "")[:16],
			"pieces_open": len(open_ps), "pieces_billed": len(done_ps), "pieces_total": len(ps),
			"weight_in_open": round(sum(flt(p.weight) for p in open_ps), 3),
			"weighed_out": sum(1 for p in open_ps if flt(p.weight_out)),
			"no_work": sum(1 for p in open_ps if not (p.work_types or "").strip()),
			"bills": sorted({p.bill for p in done_ps}),
			# part-billed batches first: someone is mid-way through them
			"state": ("part" if (open_ps and done_ps) else ("open" if open_ps else "done")),
		})
	rank = {"part": 0, "open": 1, "done": 2}
	rows.sort(key=lambda r: (rank[r["state"]], r["received_at"]))
	return rows


@frappe.whitelist()
def save_repair_bill(payload):
	"""Bill some or all of a batch.

	Pieces are billed a handful at a time — half a batch goes back to the party
	while the rest is still on the bench — so a bill covers the pieces named in
	it and marks exactly those as settled. The rest stay open and get their own
	bill later. Re-sending a bill's own id edits that bill rather than making a
	rival copy of it."""
	_guard()
	p = frappe.parse_json(payload)
	order = p.get("repair_order")
	if not order or not frappe.db.exists("Repair Order", order):
		frappe.throw(frappe._("Pick the repair to bill."))
	o = frappe.get_doc("Repair Order", order)
	src = {r.repair: r for r in o.items}

	editing = p.get("bill") or None
	if editing and not frappe.db.exists("Repair Bill", editing):
		frappe.throw(frappe._("No bill {0}.").format(editing))

	wanted = [r for r in (p.get("items") or []) if src.get(r.get("repair"))]
	if not wanted:
		frappe.throw(frappe._("Pick at least one piece to bill."))

	items = []
	for r in wanted:
		row = src[r.get("repair")]
		# a piece belongs to one bill; only the bill holding it may re-bill it
		if row.bill and row.bill != editing:
			frappe.throw(frappe._("{0} is already billed on {1}.").format(row.repair, row.bill))
		w_out = flt(r.get("weight_out")) if r.get("weight_out") is not None else flt(row.weight_out)
		items.append({
			"repair": row.repair, "design_type": row.design_type, "qty": cint(row.qty),
			"weight_in": flt(row.weight), "weight_out": w_out,
			"work_types": row.work_types, "repair_type": row.repair_type,
			"narration": row.narration, "karat": row.karat,
		})
	charges = []
	for c in p.get("charges") or []:
		w = c.get("work_type")
		if not w or not frappe.db.exists("Repair Work Type", w):
			continue
		charges.append({"work_type": w, "pieces": cint(c.get("pieces")), "rate": flt(c.get("rate"))})

	# the stones on the billed pieces, at the rate agreed for each quality+sieve
	rate_of_stone = {}
	for sl in p.get("stone_lines") or []:
		rate_of_stone[(sl.get("stone"), sl.get("sieve") or "")] = flt(sl.get("rate"))
	billing = {i["repair"] for i in items}
	stones = [{"repair": st.repair, "stone": st.stone, "sieve": st.sieve or "",
		"pcs": cint(st.pcs), "ct": flt(st.ct),
		"rate": rate_of_stone.get((st.stone, st.sieve or ""), 0)}
		for st in o.stones if st.repair in billing]

	doc = frappe.get_doc("Repair Bill", editing) if editing else frappe.new_doc("Repair Bill")
	doc.repair_order = order
	doc.party = o.party
	doc.billed_at = p.get("billed_at") or frappe.utils.now_datetime()
	doc.narration = (p.get("narration") or "").strip() or None
	doc.gold_rate = flt(p.get("gold_rate"))
	doc.set("items", items)
	doc.set("charges", charges)
	doc.set("stones", stones)
	doc.save(ignore_permissions=True)

	# stamp the pieces this bill covers, and release any it no longer does
	covered = {i["repair"] for i in items}
	for row in o.items:
		if row.repair in covered:
			row.bill = doc.name
			if flt(row.weight_out) != flt(next(i["weight_out"] for i in items if i["repair"] == row.repair)):
				row.weight_out = next(i["weight_out"] for i in items if i["repair"] == row.repair)
		elif row.bill == doc.name:
			row.bill = None
	o.save(ignore_permissions=True)
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
		"gold_rate": flt(d.gold_rate),
		"total_work_amount": flt(d.total_work_amount), "total_metal_amount": flt(d.total_metal_amount),
		"total_stone_amount": flt(d.total_stone_amount), "grand_total": flt(d.grand_total),
		"stones": [{"repair": st.repair, "stone": st.stone, "sieve": st.sieve or "",
			"pcs": cint(st.pcs), "ct": flt(st.ct), "rate": flt(st.rate),
			"amount": flt(st.amount)} for st in d.stones],
		"items": [{"repair": r.repair, "design_type": r.design_type, "qty": cint(r.qty),
			"weight_in": flt(r.weight_in), "weight_out": flt(r.weight_out),
			"metal_added": flt(r.metal_added), "karat": r.karat or "",
			"gold_rate_used": flt(r.gold_rate_used),
			"work_amount": flt(r.work_amount), "metal_amount": flt(r.metal_amount),
			"stone_pcs": cint(r.stone_pcs), "stone_ct": flt(r.stone_ct),
			"stone_amount": flt(r.stone_amount), "amount": flt(r.amount),
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
	disagree with the goods.

	A BILLED PIECE is locked: its bill copied those weights, so moving them now
	would leave the two saying different things about the same job. The lock is
	per piece, not per batch — half a batch is routinely billed while the rest is
	still on the bench, and those pieces are exactly the ones still waiting for a
	weight or for someone to say what work they need. Refusing the whole batch
	because one piece is settled would block the job this screen exists for."""
	_guard()
	if not frappe.db.exists("Repair Order", name):
		frappe.throw(frappe._("No repair {0}.").format(name))

	items = frappe.parse_json(items) if isinstance(items, str) else (items or [])
	doc = frappe.get_doc("Repair Order", name)
	by_repair = {r.repair: r for r in doc.items}
	for r in items or []:
		row = by_repair.get(r.get("repair"))
		if not row:
			continue
		if row.bill:
			# settled: only complain if the edit would actually move something
			wants = ("weight" in r and abs(flt(r.get("weight")) - flt(row.weight)) > 0.0005)
			if wants:
				frappe.throw(frappe._("{0} is billed on {1} — its weight cannot change.")
					.format(row.repair, row.bill))
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
