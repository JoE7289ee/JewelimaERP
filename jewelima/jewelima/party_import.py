# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
#
# One-shot party importer: builds the party masters + parties + old-name store
# from a JSON export of the Customer_Naming sheet. Reusable (dev + server).
# Run: bench --site <site> execute jewelima.jewelima.party_import.run --kwargs '{"path": "/tmp/party_import.json"}'

import json

import frappe

NAME_FIELD = {
	"Party Zone": "zone_name",
	"Party District": "district_name",
	"Party State": "state_name",
	"Party Special": "special_name",
}
PARTY_EXEMPT = ("JD Stock", "BTQ Stock")


def _ensure_group(code, name):
	code = (code or "").strip().upper()
	if not code:
		return None
	if frappe.db.exists("Party Group", code):
		return code
	frappe.get_doc({"doctype": "Party Group", "code": code, "group_name": name or code}).insert(ignore_permissions=True)
	return code


def _ensure_shared(dt, code, name):
	"""Composite-named master (code may repeat). Returns the record name."""
	code = (code or "").strip().upper()
	if not code:
		return None
	nf = NAME_FIELD[dt]
	nm = (name or "").strip() or code
	existing = frappe.db.get_value(dt, {"code": code, nf: nm}, "name")
	if existing:
		return existing
	doc = frappe.get_doc({"doctype": dt, "code": code, nf: nm}).insert(ignore_permissions=True)
	return doc.name


def run(path, wipe_masters=1):
	from jewelima.jewelima.api import make_party, assign_old_name

	rows = json.load(open(path))
	summary = {"masters": {}, "parties_created": 0, "old_mapped": 0, "old_unmapped": 0,
		"mismatches": [], "errors": []}

	if int(wipe_masters):
		for dt in ("Party Old Name Party", "Party Old Name", "Party Group",
				   "Party Zone", "Party District", "Party State", "Party Special"):
			frappe.db.delete(dt)
		frappe.db.commit()

	# --- masters + classified parties ---
	for r in rows:
		if not r.get("customername"):
			continue
		try:
			g = _ensure_group(r.get("groupcode"), r.get("group"))
			z = _ensure_shared("Party Zone", r.get("zonecode"), r.get("zone")) if r.get("zonecode") else None
			d = _ensure_shared("Party District", r.get("districtcode"), r.get("district"))
			s = _ensure_shared("Party State", r.get("statecode"), r.get("state"))
			sp = _ensure_shared("Party Special", r.get("specialcode"), r.get("special")) if r.get("specialcode") else None
			res = make_party(group=g, zone=z, district=d, state=s, special=sp)
			nm = res["name"]
			summary["parties_created"] += 1
			if nm != r["customername"]:
				summary["mismatches"].append({"expected": r["customername"], "got": nm})
		except Exception as e:
			summary["errors"].append({"row": r.get("customername"), "err": str(e)})

	# --- old-name store ---
	# classified rows map their old name to the party; unclassified become unmapped.
	for r in rows:
		old = (r.get("oldname") or "").strip()
		if not old:
			continue
		try:
			if r.get("customername"):
				assign_old_name(old_name=old, party=r["customername"])
				summary["old_mapped"] += 1
			else:
				if not frappe.db.exists("Party Old Name", old):
					frappe.get_doc({"doctype": "Party Old Name", "old_name": old}).insert(ignore_permissions=True)
					summary["old_unmapped"] += 1
		except Exception as e:
			summary["errors"].append({"old": old, "err": str(e)})

	frappe.db.commit()
	for dt in ("Party Group", "Party Zone", "Party District", "Party State", "Party Special", "Party Old Name"):
		summary["masters"][dt] = frappe.db.count(dt)
	return summary
