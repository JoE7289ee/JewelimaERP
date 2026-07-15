# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
"""
User import set — desk login users + Jewelima roles, linked to their Employee.

Ships with the app at jewelima/data/users.csv. Columns: employee_name, roles (';'-separated);
optional username, email. If username is blank it's derived from the name (REENA ALEX ->
REENAALEX); if email is blank it's derived (reenaalex@jd.in) — the email is only the
record id, your team logs in with the USERNAME (we enable "Allow Login using User Name").

Run (ships with the app, run on command):

  bench --site <site> execute jewelima.jewelima.imports.import_users.preview   # writes nothing
  bench --site <site> execute jewelima.jewelima.imports.import_users.run

The preview walks every row read-only and prints, per person, whether the user would be
created or already exists, which roles would be added, and whether the Employee is on this
site — so you see exactly what `run` will do before it does it. Both are idempotent.

Passwords are NOT stored in the repo. Set the same password for everyone yourself with:

  bench --site <site> execute jewelima.jewelima.imports.import_users.set_passwords --kwargs "{'password': 'jew123'}"
"""
import csv
import re

import frappe


def _bundled_file():
	return frappe.get_app_path("jewelima", "data", "users.csv")


def _username(name):
	"""'REENA ALEX' -> 'REENAALEX'."""
	return re.sub(r"[^A-Za-z0-9]", "", name or "").upper()


def _free_username(base, for_user):
	"""A username not taken by a different user (append a number on clash)."""
	u, i = base, 1
	while True:
		owner = frappe.db.get_value("User", {"username": u}, "name")
		if not owner or owner == for_user:
			return u
		i += 1
		u = f"{base}{i}"


def _resolve(row):
	ename = (row.get("employee_name") or "").strip()
	username = (row.get("username") or "").strip() or _username(ename)
	email = (row.get("email") or "").strip() or (username.lower() + "@jd.in")
	roles = [x.strip() for x in (row.get("roles") or "").split(";") if x.strip()]
	return ename, username, email, roles


def _plan_row(row):
	"""Read-only: what THIS row would do to the site. Writes nothing."""
	ename, username, email, roles = _resolve(row)
	emp = (
		frappe.db.get_value("Employee", {"employee_name": ename}, ["name", "employee_name"], as_dict=True)
		if ename else None
	)
	user_exists = bool(frappe.db.exists("User", email))
	have = {r.role for r in frappe.get_doc("User", email).get("roles")} if user_exists else set()
	known = [r for r in roles if frappe.db.exists("Role", r)]
	return {
		"employee_name": ename,
		"username": username,
		"email": email,
		"roles": roles,
		"employee": emp.name if emp else None,
		"user_exists": user_exists,
		"new_roles": [r for r in known if r not in have],
		"unknown_roles": [r for r in roles if r not in known],
		"will_link": bool(emp and not frappe.db.get_value("Employee", emp.name, "user_id")),
	}


def preview(file_path=None):
	"""What `run` would do, without touching anything. Same as run(dry_run=True)."""
	return run(file_path=file_path, dry_run=True)


def _print_plan(plans):
	print(f"\nDRY RUN — nothing written. {len(plans)} row(s) in the file:\n")
	for p in plans:
		act = "exists" if p["user_exists"] else "CREATE"
		emp = p["employee"] or "!! NO EMPLOYEE"
		bits = [f"  {act:6}  {p['employee_name']:<18} login={p['username']:<12} {p['email']:<22} emp={emp}"]
		if p["new_roles"]:
			bits.append("    + roles: " + ", ".join(p["new_roles"]))
		if p["unknown_roles"]:
			bits.append("    !! role does not exist on this site: " + ", ".join(p["unknown_roles"]))
		if p["will_link"]:
			bits.append("    + link to Employee")
		print("\n".join(bits))
	would_create = len([p for p in plans if not p["user_exists"]])
	problems = [p for p in plans if not p["employee"] or p["unknown_roles"]]
	print(
		f"\nWould create: {would_create}   already there: {len(plans) - would_create}   "
		f"role adds: {sum(len(p['new_roles']) for p in plans)}   "
		f"employee links: {len([p for p in plans if p['will_link']])}   "
		f"needs attention: {len(problems)}\n"
	)
	return {
		"rows": len(plans),
		"would_create": would_create,
		"would_exist": len(plans) - would_create,
		"role_adds": sum(len(p["new_roles"]) for p in plans),
		"links": len([p for p in plans if p["will_link"]]),
		"problems": [p["employee_name"] for p in problems],
		"plan": plans,
	}


def run(file_path=None, dry_run=False):
	file_path = file_path or _bundled_file()
	with open(file_path) as fh:
		rows = list(csv.DictReader(fh))
	rows = [r for r in rows if (r.get("employee_name") or r.get("username") or r.get("email") or "").strip()]

	if dry_run:
		return _print_plan([_plan_row(r) for r in rows])

	# users log in by username, not email
	frappe.db.set_single_value("System Settings", "allow_login_using_user_name", 1)

	created = exists = role_adds = linked = failed = 0
	errors = []
	for row in rows:
		ename, username, email, roles = _resolve(row)
		if not email:
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
				full = (emp.employee_name if emp else username).split()
				user = frappe.get_doc({
					"doctype": "User",
					"email": email,
					"first_name": (full[0].title() if full else username),
					"last_name": " ".join(p.title() for p in full[1:]),
					"user_type": "System User",
					"send_welcome_email": 0,
				}).insert(ignore_permissions=True)
				created += 1

			changed = False
			want_username = _free_username(username, user.name)
			if want_username and user.username != want_username:
				user.username = want_username
				changed = True
			have = {x.role for x in user.get("roles")}
			for role in roles:
				if role not in have and frappe.db.exists("Role", role):
					user.append("roles", {"role": role})
					role_adds += 1
					changed = True

			# minimal desk — only the Jewelima module visible (hides other workspace cards)
			if frappe.db.exists("Module Profile", "Jewelima Only") and user.module_profile != "Jewelima Only":
				user.module_profile = "Jewelima Only"
				mp = frappe.get_doc("Module Profile", "Jewelima Only")
				user.set("block_modules", [{"module": m.module} for m in mp.block_modules])
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


def set_passwords(password, file_path=None):
	"""Set the SAME login password for every user listed in users.csv. Run this yourself —
	the password is supplied at runtime and never stored in the repo."""
	from frappe.utils.password import update_password

	if not password:
		frappe.throw("Pass a password, e.g. --kwargs \"{'password': 'jew123'}\"")
	file_path = file_path or _bundled_file()
	with open(file_path) as fh:
		rows = list(csv.DictReader(fh))
	n = 0
	for row in rows:
		_, _, email, _ = _resolve(row)
		if email and frappe.db.exists("User", email):
			update_password(email, password)
			n += 1
	frappe.db.commit()
	print(f"Password set on {n} user(s).")
	return {"updated": n}
