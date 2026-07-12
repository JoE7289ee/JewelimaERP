# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class Bench(Document):
	def validate(self):
		self.roster = build_roster(self)


def build_roster(doc):
	"""Comma-joined EMPLOYEE NAMES of the bench's allotments (the list view's
	Employees column — the child table itself can't show there)."""
	ids = [r.employee for r in (doc.get("employees") or []) if r.employee]
	if not ids:
		return ""
	names = {e.name: e.employee_name for e in frappe.get_all(
		"Employee", filters={"name": ["in", ids]}, fields=["name", "employee_name"])}
	return ", ".join(names.get(i, i) for i in ids)


def refresh_all_rosters():
	"""Recompute every bench's roster (idempotent — runs with seed_benches on migrate)."""
	for nm in frappe.get_all("Bench", pluck="name"):
		doc = frappe.get_doc("Bench", nm)
		roster = build_roster(doc)
		if (doc.roster or "") != roster:
			frappe.db.set_value("Bench", nm, "roster", roster, update_modified=False)
