# Rename the WAX INJECTING bench -> WAXING. The code (benches.py, pages, doctype
# folder) already renames to Waxing; this patch cleans up what the DB carried
# under the old names so nothing is orphaned. Idempotent + guarded (safe to run
# where the rename already happened, e.g. dev). Runs post_model_sync, so the new
# "Waxing" doctype / "ws-waxing" pages already exist and the old ones are orphans.

import frappe


def execute():
	# role — keep any user assignments
	if frappe.db.exists("Role", "Jewelima Bench WAX INJECTING") and not frappe.db.exists("Role", "Jewelima Bench WAXING"):
		frappe.rename_doc("Role", "Jewelima Bench WAX INJECTING", "Jewelima Bench WAXING", force=True)

	# Bench master — keep its Bench Employee roster
	if frappe.db.exists("Bench", "WAX INJECTING") and not frappe.db.exists("Bench", "WAXING"):
		frappe.rename_doc("Bench", "WAX INJECTING", "WAXING", force=True)

	# config rows still pointing at the old location string
	if frappe.db.table_exists("Bench Work Option"):
		frappe.db.sql("UPDATE `tabBench Work Option` SET bench='WAXING' WHERE bench='WAX INJECTING'")

	# orphaned old pages
	for p in ("ws-wax-injecting", "bench-wax-injecting"):
		if frappe.db.exists("Page", p):
			frappe.delete_doc("Page", p, force=True, ignore_permissions=True)

	# orphaned old bench doctype — only drop it when empty (never lose data)
	if frappe.db.exists("DocType", "Wax Injecting"):
		if not frappe.db.table_exists("Wax Injecting") or frappe.db.count("Wax Injecting") == 0:
			frappe.delete_doc("DocType", "Wax Injecting", force=True, ignore_permissions=True)

	frappe.db.commit()
