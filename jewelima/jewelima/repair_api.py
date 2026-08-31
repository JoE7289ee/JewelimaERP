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
from frappe.utils import cint

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
		"items": [{"repair": r.repair, "design_type": r.design_type,
			"repair_type": r.repair_type or "", "qty": cint(r.qty),
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
		fields=["name", "party", "received_at", "received_by", "total_qty", "total_rows", "narration"],
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
			"lines": sum(cint(r["total_rows"]) for r in out),
			"parties": len({r["party"] for r in out})}}
