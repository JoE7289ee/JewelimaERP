# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
"""
Customer import — bulk-loads Customers from the bundled names list.

The list SHIPS WITH THE APP at jewelima/data/customers.csv (one 'customer_name'
per row). It was cleaned from the client's master export — gem labs, internal
accounting ledgers and duplicates removed. No groups are assigned for now; every
customer lands in the root group / territory.

Manual run (defaults to the bundled file; pass file_path to override):

  bench --site <site> execute jewelima.jewelima.imports.import_customers.run
  bench --site <site> execute jewelima.jewelima.imports.import_customers.run --kwargs "{'dry_run': True}"

Idempotent: re-running skips Customers that already exist (matched by Customer Name).
"""

import csv

import frappe

# No grouping for now — everyone lands in one default leaf group / territory. ERPNext
# rejects group-node values ("All Customer Groups" / "All Territories"), so we use the
# standard leaf defaults and create them if a site somehow lacks them.
DEFAULT_GROUP = "Individual"
DEFAULT_TERRITORY = "India"


def _bundled_file():
	"""The customer names list that ships with the app (jewelima/data/...)."""
	return frappe.get_app_path("jewelima", "data", "customers.csv")


def _ensure_group():
	if not frappe.db.exists("Customer Group", DEFAULT_GROUP):
		frappe.get_doc({
			"doctype": "Customer Group", "customer_group_name": DEFAULT_GROUP,
			"parent_customer_group": "All Customer Groups", "is_group": 0,
		}).insert(ignore_permissions=True)


def _ensure_territory():
	if not frappe.db.exists("Territory", DEFAULT_TERRITORY):
		frappe.get_doc({
			"doctype": "Territory", "territory_name": DEFAULT_TERRITORY,
			"parent_territory": "All Territories", "is_group": 0,
		}).insert(ignore_permissions=True)


def _read_names(file_path):
	"""Unique, order-preserving customer names from the CSV's 'customer_name' column."""
	with open(file_path, newline="", encoding="utf-8") as f:
		raw = [(row.get("customer_name") or "").strip() for row in csv.DictReader(f)]
	seen, names = set(), []
	for n in raw:
		if n and n.upper() not in seen:
			seen.add(n.upper())
			names.append(n)
	return len(raw), names


def run(file_path=None, dry_run=False):
	file_path = file_path or _bundled_file()
	total, names = _read_names(file_path)

	print(f"Names in file: {total}  unique: {len(names)}")
	if dry_run:
		print("DRY RUN — nothing written.")
		return {"file": file_path, "rows": total, "unique": len(names)}

	_ensure_group()
	_ensure_territory()

	created = exists = failed = 0
	errors = []
	for name in names:
		if frappe.db.exists("Customer", {"customer_name": name}):
			exists += 1
			continue
		try:
			frappe.get_doc({
				"doctype": "Customer",
				"customer_name": name,
				"customer_type": "Individual",
				"customer_group": DEFAULT_GROUP,
				"territory": DEFAULT_TERRITORY,
			}).insert(ignore_permissions=True)
			created += 1
		except Exception as e:
			failed += 1
			if len(errors) < 12:
				errors.append(f"{name}: {e}")

	frappe.db.commit()
	print(f"\nCustomers  created: {created}  already-existed: {exists}  failed: {failed}")
	if errors:
		print("First errors:")
		for e in errors:
			print("  -", e)
	return {"created": created, "exists": exists, "failed": failed}
