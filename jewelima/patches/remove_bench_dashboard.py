# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
import frappe


def execute():
	"""The Bench Dashboard page was removed from the app (2026-07-09) — drop the
	stale Page record so /desk/bench-dashboard stops resolving."""
	if frappe.db.exists("Page", "bench-dashboard"):
		frappe.delete_doc("Page", "bench-dashboard", ignore_permissions=True, force=True)
