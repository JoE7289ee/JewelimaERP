# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
import frappe


def execute():
	"""The Warehouse Stock page was removed from the app (2026-07-09) — drop the
	stale Page record."""
	if frappe.db.exists("Page", "warehouse-stock"):
		frappe.delete_doc("Page", "warehouse-stock", ignore_permissions=True, force=True)
