# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
"""
User import set — creates desk login users + assigns Jewelima roles, linked to their
Employee record. The list SHIPS WITH THE APP at jewelima/data/users.csv (columns:
employee_name, email, roles  — roles ';'-separated). Edit that file with real emails.

Run on any site (ships with the app, run on command):

  bench --site <site> execute jewelima.jewelima.imports.import_users.run
  bench --site <site> execute jewelima.jewelima.imports.import_users.run --kwargs "{'dry_run': True}"

Idempotent: re-running skips existing users, tops up missing roles, and links the Employee.
NOTE: passwords are NOT set here (a credential). Set one via the UI (User > Reset Password)
or:  bench --site <site> set-password <email> <password>
"""
import csv

import frappe


def _bundled_file():
	"""The user list that ships with the app (jewelima/data/users.csv)."""
	return frappe.get_app_path("jewelima", "data", "users.csv")


def run(file_path=None, dry_run=False):
	file_path = file_path or _bundled_file()
	with open(file_path) as fh:
		rows = list(csv.DictReader(fh))

	created = exists = linked = role_adds = failed = 0
	errors = []
	for r in rows:
		ename = (r.get("employee_name") or "").strip()
		email = (r.get("email") or "").strip()
		roles = [x.strip() for x in (r.get("roles") or "").split(";") if x.strip()]
		if not email:
			continue
		if dry_run:
			continue
		try:
			emp = (
				frappe.db.get_value("Employee", {"employee_name": ename}, ["name", "employee_name"], as_dict=True)
				if ename else None
			)
			if frappe.db.exists("User", email):
				user = frappe.get_doc("User", email)
				exists += 1
			else:
				full = (emp.employee_name if emp else email).split()
				user = frappe.get_doc({
					"doctype": "User",
					"email": email,
					"first_name": (full[0].title() if full else email),
					"last_name": " ".join(p.title() for p in full[1:]),
					"user_type": "System User",
					"send_welcome_email": 0,
				}).insert(ignore_permissions=True)
				created += 1

			have = {x.role for x in user.get("roles")}
			changed = False
			for role in roles:
				if role not in have and frappe.db.exists("Role", role):
					user.append("roles", {"role": role})
					role_adds += 1
					changed = True
			if changed:
				user.save(ignore_permissions=True)

			if emp and not frappe.db.get_value("Employee", emp.name, "user_id"):
				frappe.db.set_value("Employee", emp.name, "user_id", email)
				linked += 1
		except Exception as e:
			failed += 1
			if len(errors) < 10:
				errors.append(f"{email}: {e}")

	frappe.db.commit()
	print(f"Users — created: {created}  existed: {exists}  roles added: {role_adds}  employee-linked: {linked}  failed: {failed}")
	if errors:
		print("First errors:")
		for e in errors:
			print("  -", e)
	return {"created": created, "exists": exists, "role_adds": role_adds, "linked": linked, "failed": failed}
