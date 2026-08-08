# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
"""Whitelisted APIs for the REPAIR module — the isolated repair desk
(intake -> billing -> register). Every mutator checks the Repair role
server-side; the doctypes stay view-only for everyone else."""

import json

import frappe
from frappe import _
from frappe.utils import flt, cint, today

REPAIR_ROLES = {"System Manager", "Jewelima Repair"}


def _require():
	if not REPAIR_ROLES & set(frappe.get_roles()):
		frappe.throw(_("Not permitted"), frappe.PermissionError)


def _j(payload):
	return frappe.parse_json(payload) if isinstance(payload, str) else (payload or {})


# --- bootstrap ---------------------------------------------------------------------

@frappe.whitelist()
def get_repair_boot():
	"""Everything the pages need on load: parties (+rates/extras), item
	types (+polish rates), settings, and the open-work counts."""
	_require()
	parties = []
	for p in frappe.get_all("Repair Party", fields=["name", "dia_rate", "active"], order_by="name"):
		p["extras"] = frappe.get_all("Repair Party Charge", filters={"parent": p.name},
			fields=["charge_name", "rate"], order_by="idx")
		parties.append(p)
	st = frappe.get_single("Repair Settings")
	return {
		"parties": parties,
		"item_types": frappe.get_all("Repair Item Type", fields=["name", "polish_rate"], order_by="name"),
		"settings": {k: flt(st.get(k)) for k in
			("soldering_rate", "stone_fix_rate", "gst_percent", "factor_75", "factor_92")},
		"repair_warehouse": st.repair_warehouse,
		"open_receipts": frappe.db.count("Repair Receipt", {"status": "Received"}),
		"open_bills": frappe.db.count("Repair Bill", {"status": "In Progress"}),
	}


# --- masters -----------------------------------------------------------------------

@frappe.whitelist()
def save_repair_party(payload):
	"""Create/update a party: name, dia rate, extras list [{charge_name, rate}]."""
	_require()
	p = _j(payload)
	name = (p.get("party_name") or "").strip().upper()
	if not name:
		frappe.throw(_("Party name is required"))
	if frappe.db.exists("Repair Party", name):
		doc = frappe.get_doc("Repair Party", name)
	else:
		doc = frappe.new_doc("Repair Party")
		doc.party_name = name
	doc.dia_rate = flt(p.get("dia_rate"))
	doc.active = 1 if p.get("active", 1) else 0
	doc.set("extras", [{"charge_name": (e.get("charge_name") or "").strip().upper(), "rate": flt(e.get("rate"))}
		for e in (p.get("extras") or []) if (e.get("charge_name") or "").strip()])
	doc.save(ignore_permissions=True)
	return {"name": doc.name}


@frappe.whitelist()
def save_repair_item_type(type_name, polish_rate):
	_require()
	name = (type_name or "").strip().upper()
	if not name:
		frappe.throw(_("Item type is required"))
	if frappe.db.exists("Repair Item Type", name):
		frappe.db.set_value("Repair Item Type", name, "polish_rate", flt(polish_rate))
	else:
		frappe.get_doc({"doctype": "Repair Item Type", "type_name": name,
			"polish_rate": flt(polish_rate)}).insert(ignore_permissions=True)
	return {"name": name}


@frappe.whitelist()
def delete_repair_item_type(type_name):
	_require()
	if frappe.db.exists("Repair Bill Item", {"item_type": type_name}) \
			or frappe.db.exists("Repair Receipt Item", {"item_type": type_name}):
		frappe.throw(_("{0} is used on receipts/bills — cannot delete.").format(type_name))
	frappe.delete_doc("Repair Item Type", type_name, ignore_permissions=True)
	return {"ok": 1}


@frappe.whitelist()
def save_repair_settings(payload):
	_require()
	p = _j(payload)
	st = frappe.get_single("Repair Settings")
	for k in ("soldering_rate", "stone_fix_rate", "gst_percent", "factor_75", "factor_92"):
		if k in p:
			st.set(k, flt(p[k]))
	if "repair_warehouse" in p:
		st.repair_warehouse = p.get("repair_warehouse") or None
	st.save(ignore_permissions=True)
	return {"ok": 1}


# --- intake ------------------------------------------------------------------------

@frappe.whitelist()
def save_repair_receipt(payload):
	"""Create/update an intake lot. items: [{item_type, qty, narration, remarks}]."""
	_require()
	p = _j(payload)
	if p.get("name"):
		doc = frappe.get_doc("Repair Receipt", p["name"])
		if doc.status == "Billed":
			frappe.throw(_("{0} is already billed — it can no longer be edited.").format(doc.name))
	else:
		doc = frappe.new_doc("Repair Receipt")
	doc.party = p.get("party")
	doc.receipt_date = p.get("receipt_date") or today()
	doc.jd_ref = (p.get("jd_ref") or "").strip()
	doc.remarks = p.get("remarks")
	doc.set("items", [{"item_type": i.get("item_type"), "qty": cint(i.get("qty")) or 1,
		"narration": (i.get("narration") or "").strip(), "remarks": (i.get("remarks") or "").strip()}
		for i in (p.get("items") or []) if i.get("item_type") or (i.get("narration") or "").strip()])
	if not doc.items:
		frappe.throw(_("At least one piece is required"))
	doc.save(ignore_permissions=True)
	return {"name": doc.name, "pieces": doc.piece_count}


@frappe.whitelist()
def list_repair_receipts(status=None, party=None):
	_require()
	f = {}
	if status:
		f["status"] = status
	if party:
		f["party"] = party
	rows = frappe.get_all("Repair Receipt", filters=f,
		fields=["name", "party", "receipt_date", "jd_ref", "status", "piece_count", "billed_in", "remarks"],
		order_by="receipt_date desc, name desc", limit_page_length=500)
	return rows


@frappe.whitelist()
def get_repair_receipt(name):
	_require()
	doc = frappe.get_doc("Repair Receipt", name)
	return {"name": doc.name, "party": doc.party, "receipt_date": str(doc.receipt_date or ""),
		"jd_ref": doc.jd_ref, "status": doc.status, "remarks": doc.remarks, "billed_in": doc.billed_in,
		"items": [{"item_type": i.item_type, "qty": i.qty, "narration": i.narration, "remarks": i.remarks}
			for i in doc.items]}


@frappe.whitelist()
def delete_repair_receipt(name):
	_require()
	doc = frappe.get_doc("Repair Receipt", name)
	if doc.status == "Billed":
		frappe.throw(_("{0} is billed — cannot delete.").format(name))
	frappe.delete_doc("Repair Receipt", name, ignore_permissions=True)
	return {"ok": 1}


# --- billing -----------------------------------------------------------------------

LINE_FIELDS = ("item_type", "narration", "qty", "jd_ref", "receipt", "solder_count",
	"polish", "polish_rate", "other_desc", "other_amt", "stn_fix_units",
	"add_wt_75", "add_wt_92", "dmd_qty", "dmd_wt", "service", "remarks")


@frappe.whitelist()
def save_repair_bill(payload):
	"""Create/update a bill. The controller recomputes every amount — the page
	numbers are previews only. Receipts pulled onto lines flip to Billed."""
	_require()
	p = _j(payload)
	if p.get("name"):
		doc = frappe.get_doc("Repair Bill", p["name"])
		if doc.status == "Delivered":
			frappe.throw(_("{0} is delivered — it can no longer be edited.").format(doc.name))
	else:
		doc = frappe.new_doc("Repair Bill")
	was = {i.receipt for i in getattr(doc, "items", []) if i.receipt}
	doc.party = p.get("party")
	doc.bill_date = p.get("bill_date") or today()
	doc.tm_rate = flt(p.get("tm_rate"))
	doc.dia_rate = flt(p.get("dia_rate"))
	doc.remarks = p.get("remarks")
	if p.get("status") in ("In Progress", "Billed"):
		doc.status = p["status"]
	doc.set("items", [{k: i.get(k) for k in LINE_FIELDS} for i in (p.get("items") or [])])
	doc.save(ignore_permissions=True)
	# receipt statuses follow the bill's lines
	now = {i.receipt for i in doc.items if i.receipt}
	for r in now - was:
		frappe.db.set_value("Repair Receipt", r, {"status": "Billed", "billed_in": doc.name})
	for r in was - now:
		frappe.db.set_value("Repair Receipt", r, {"status": "Received", "billed_in": None})
	out = get_repair_bill(doc.name)
	return out


@frappe.whitelist()
def get_repair_bill(name):
	_require()
	doc = frappe.get_doc("Repair Bill", name)
	fields = LINE_FIELDS + ("solder_amt", "polish_amt", "stn_fix_amt", "repair_charges",
		"add_wt_75_amt", "add_wt_92_amt", "dmd_tot_ct", "dmd_amt", "total_amt")
	return {"name": doc.name, "party": doc.party, "bill_date": str(doc.bill_date or ""),
		"status": doc.status, "tm_rate": doc.tm_rate, "rate_18k": doc.rate_18k,
		"rate_22k": doc.rate_22k, "dia_rate": doc.dia_rate, "remarks": doc.remarks,
		"tot_pieces": doc.tot_pieces, "tot_repair": doc.tot_repair, "tot_diamond": doc.tot_diamond,
		"tot_wt75": doc.tot_wt75, "tot_wt75_amt": doc.tot_wt75_amt,
		"tot_wt92": doc.tot_wt92, "tot_wt92_amt": doc.tot_wt92_amt,
		"grand_total": doc.grand_total,
		"items": [{k: i.get(k) for k in fields} for i in doc.items]}


@frappe.whitelist()
def list_repair_bills(party=None, status=None, from_date=None, to_date=None):
	_require()
	f = {}
	if party:
		f["party"] = party
	if status:
		f["status"] = status
	if from_date and to_date:
		f["bill_date"] = ["between", [from_date, to_date]]
	elif from_date:
		f["bill_date"] = [">=", from_date]
	elif to_date:
		f["bill_date"] = ["<=", to_date]
	return frappe.get_all("Repair Bill", filters=f,
		fields=["name", "party", "bill_date", "status", "tot_pieces", "tot_repair",
			"tot_diamond", "tot_wt75", "tot_wt75_amt", "tot_wt92", "tot_wt92_amt", "grand_total"],
		order_by="bill_date desc, name desc", limit_page_length=500)


@frappe.whitelist()
def set_repair_bill_status(name, status):
	_require()
	if status not in ("In Progress", "Billed", "Delivered"):
		frappe.throw(_("Bad status"))
	frappe.db.set_value("Repair Bill", name, "status", status)
	return {"ok": 1}


@frappe.whitelist()
def delete_repair_bill(name):
	_require()
	doc = frappe.get_doc("Repair Bill", name)
	if doc.status != "In Progress":
		frappe.throw(_("Only In Progress bills can be deleted."))
	for r in {i.receipt for i in doc.items if i.receipt}:
		frappe.db.set_value("Repair Receipt", r, {"status": "Received", "billed_in": None})
	frappe.delete_doc("Repair Bill", name, ignore_permissions=True)
	return {"ok": 1}
