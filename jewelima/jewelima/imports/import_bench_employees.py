# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
"""
Bench roster import set — ships at jewelima/data/bench_employees.csv.

CSV columns: bench,employee_name — one row per allotment. Employees are matched by
NAME (HR-EMP ids change across fresh installs). Benches listed in the file get their
roster set to exactly the file's list; benches NOT in the file are left alone.

  bench --site <site> execute jewelima.jewelima.imports.import_bench_employees.run
  bench --site <site> execute jewelima.jewelima.imports.import_bench_employees.export_csv

run() is idempotent and wired into install/migrate, so a refresh restores the rosters.
The Setup -> Bench page stays the place the team edits them; export_csv() captures the
DB back into the bundled file for committing.
"""

import csv
import os

import frappe


def _bundled_file():
	return frappe.get_app_path("jewelima", "data", "bench_employees.csv")


def run(file_path=None):
	path = file_path or _bundled_file()
	if not os.path.exists(path):
		print(f"No file at {path} — nothing to import.")
		return {"benches": 0, "set": 0, "missing": []}

	wanted = {}  # bench -> [employee_name, ...] in file order
	with open(path, newline="") as fh:
		for r in csv.DictReader(fh):
			b = (r.get("bench") or "").strip()
			e = (r.get("employee_name") or "").strip()
			if b and e:
				wanted.setdefault(b, []).append(e)

	by_name = {e.employee_name: e.name for e in frappe.get_all("Employee", fields=["name", "employee_name"])}
	benches = allot = 0
	missing = []
	for bench, names in wanted.items():
		if not frappe.db.exists("Bench", bench):
			missing.append(f"bench {bench}")
			continue
		roster = []
		for nm in names:
			emp = by_name.get(nm)
			if not emp:
				missing.append(f"{bench}: {nm}")
				continue
			if emp not in roster:
				roster.append(emp)
		doc = frappe.get_doc("Bench", bench)
		if [r.employee for r in doc.employees] != roster:
			doc.set("employees", [])
			for emp in roster:
				doc.append("employees", {"employee": emp})
			doc.save(ignore_permissions=True)
			allot += len(roster)
		benches += 1
	frappe.db.commit()
	print(f"Bench rosters — benches: {benches}  allotments set: {allot}  unresolved: {missing or 'none'}")
	return {"benches": benches, "set": allot, "missing": missing}


def export_csv(file_path=None):
	"""Dump the CURRENT rosters into the bundled CSV (run on the bench where the team
	edited them, then commit the file so it ships)."""
	path = file_path or _bundled_file()
	names = {e.name: e.employee_name for e in frappe.get_all("Employee", fields=["name", "employee_name"])}
	rows = []
	for b in frappe.get_all("Bench", order_by="name", pluck="name"):
		for r in frappe.get_all("Bench Employee", filters={"parent": b}, order_by="idx", fields=["employee"]):
			rows.append({"bench": b, "employee_name": names.get(r.employee, r.employee)})
	with open(path, "w", newline="") as fh:
		w = csv.DictWriter(fh, fieldnames=["bench", "employee_name"])
		w.writeheader()
		w.writerows(rows)
	print(f"Exported {len(rows)} allotments -> {path}")
	return {"rows": len(rows), "path": path}
