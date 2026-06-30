# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
"""
Employee import — bulk-loads Employees from the bundled list.

The list SHIPS WITH THE APP at jewelima/data/employees.csv. It was cleaned from the
client's export: name taken from the authoritative full-name column (the First/Last
split was inconsistent), department typos fixed, HOD/Dmd designations normalised.

Date of Birth, Date of Joining and Reports To are intentionally NOT imported — DOB/DOJ
are relaxed to optional (see jewelima.setup.relax_employee_mandatory) and the org chart
is left for later. Departments and Designations are auto-created as needed.

Manual run (defaults to the bundled file; pass file_path to override):

  bench --site <site> execute jewelima.jewelima.imports.import_employees.run
  bench --site <site> execute jewelima.jewelima.imports.import_employees.run --kwargs "{'dry_run': True}"

Idempotent: re-running skips Employees whose full name already exists.

CSV columns (row 1 = header):
  full_name, gender, salutation, department, designation, employee_number
"""

import csv

import frappe


def _bundled_file():
	"""The employee list that ships with the app (jewelima/data/...)."""
	return frappe.get_app_path("jewelima", "data", "employees.csv")


def _company():
	names = frappe.get_all("Company", pluck="name", limit=1)
	return names[0] if names else None


def _read(file_path):
	with open(file_path, newline="", encoding="utf-8") as f:
		return [{k: (v or "").strip() for k, v in row.items()} for row in csv.DictReader(f)]


def _ensure_department(name, company):
	if not name:
		return None
	existing = frappe.db.get_value("Department", {"department_name": name, "company": company}, "name")
	if existing:
		return existing
	return frappe.get_doc({
		"doctype": "Department", "department_name": name, "company": company,
		"parent_department": "All Departments", "is_group": 0,
	}).insert(ignore_permissions=True).name


def _ensure_designation(name):
	if not name:
		return None
	if not frappe.db.exists("Designation", name):
		frappe.get_doc({"doctype": "Designation", "designation_name": name}).insert(ignore_permissions=True)
	return name


def _ensure_salutation(name):
	if not name:
		return None
	if not frappe.db.exists("Salutation", name):
		frappe.get_doc({"doctype": "Salutation", "salutation": name}).insert(ignore_permissions=True)
	return name


def run(file_path=None, dry_run=False):
	file_path = file_path or _bundled_file()
	company = _company()
	rows = _read(file_path)
	print(f"Rows: {len(rows)}  Company: {company}")

	if dry_run:
		depts = sorted({r["department"] for r in rows if r["department"]})
		desigs = sorted({r["designation"] for r in rows if r["designation"]})
		print(f"Departments to ensure ({len(depts)}): {depts}")
		print(f"Designations to ensure ({len(desigs)})")
		print("DRY RUN — nothing written.")
		return {"rows": len(rows), "departments": len(depts), "designations": len(desigs)}

	created = exists = failed = 0
	errors = []
	for r in rows:
		name = r.get("full_name", "").strip()
		if not name:
			continue
		if frappe.db.exists("Employee", {"employee_name": name}):
			exists += 1
			continue
		try:
			frappe.get_doc({
				"doctype": "Employee",
				"first_name": name,  # full name — the First/Last split in the source was unreliable
				"gender": r.get("gender") or None,
				"salutation": _ensure_salutation(r.get("salutation")),
				"designation": _ensure_designation(r.get("designation")),
				"department": _ensure_department(r.get("department"), company),
				"company": company,
				"status": "Active",
				"employee_number": r.get("employee_number") or None,
			}).insert(ignore_permissions=True)
			created += 1
		except Exception as e:
			failed += 1
			if len(errors) < 12:
				errors.append(f"{name}: {e}")

	frappe.db.commit()
	print(f"\nEmployees  created: {created}  already-existed: {exists}  failed: {failed}")
	if errors:
		print("First errors:")
		for e in errors:
			print("  -", e)
	return {"created": created, "exists": exists, "failed": failed}
