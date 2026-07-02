# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
"""
Design Type + Size import set — ships at jewelima/data/design_types.csv.

CSV columns: design_type,size — one row per (type, size); a type with no sizes
appears once with an empty size. The Setup -> Design Types page is where the team
edits these; export_csv() then captures the DB back into the bundled file so it
can be committed and shipped.

  bench --site <site> execute jewelima.jewelima.imports.import_design_types.run
  bench --site <site> execute jewelima.jewelima.imports.import_design_types.export_csv

run() is idempotent: creates missing Design Types and makes each listed type's
sizes match the file exactly (types NOT in the file are left alone).
"""

import csv
import os

import frappe


def _bundled_file():
	return frappe.get_app_path("jewelima", "data", "design_types.csv")


def run(file_path=None):
	path = file_path or _bundled_file()
	if not os.path.exists(path):
		print(f"No file at {path} — nothing to import.")
		return {"types": 0, "sizes": 0}

	wanted = {}  # type -> [sizes in file order]
	with open(path, newline="") as fh:
		for r in csv.DictReader(fh):
			t = (r.get("design_type") or "").strip()
			if not t:
				continue
			wanted.setdefault(t, [])
			s = (r.get("size") or "").strip()
			if s and s not in wanted[t]:
				wanted[t].append(s)

	types = sizes = 0
	for t, size_list in wanted.items():
		if not frappe.db.exists("Design Type", t):
			frappe.get_doc({"doctype": "Design Type", "design_type_name": t}).insert(ignore_permissions=True)
			types += 1
		doc = frappe.get_doc("Design Type", t)
		current = [row.size for row in doc.sizes]
		if current != size_list:
			doc.sizes = []
			for s in size_list:
				doc.append("sizes", {"size": s})
			doc.save(ignore_permissions=True)
			sizes += len(size_list)
	frappe.db.commit()
	print(f"Design Types — created: {types}  size-lists updated: {sizes and len(wanted)}  (from {path})")
	return {"types": types, "sizes": sizes}


def export_csv(file_path=None):
	"""Dump the CURRENT Design Types + sizes into the bundled CSV (run on the dev
	bench, then commit the file so the data ships)."""
	path = file_path or _bundled_file()
	rows = []
	for t in frappe.get_all("Design Type", order_by="name", pluck="name"):
		size_list = frappe.get_all(
			"Design Type Size", filters={"parent": t, "parenttype": "Design Type"},
			order_by="idx", pluck="size",
		)
		if size_list:
			rows += [{"design_type": t, "size": s} for s in size_list]
		else:
			rows.append({"design_type": t, "size": ""})
	with open(path, "w", newline="") as fh:
		w = csv.DictWriter(fh, fieldnames=["design_type", "size"])
		w.writeheader()
		w.writerows(rows)
	print(f"Exported {len(rows)} rows -> {path}")
	return {"rows": len(rows), "path": path}
