# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
#
# WAX CLEANING stopped being a bench on 2026-09-02 (retire_wax_cleaning_bench):
# its page, its role, its work options and its transfer rules all went, and the
# work moved to WAXING as a type of work done there.
#
# What that patch never touched was the Bench RECORD itself, so the bench kept
# showing on Assign Benches with three people still rostered to it — people who
# were not on WAXING, so deleting the bench without moving them would have taken
# their allotment with it. This moves the roster first, then removes the bench.
#
# The shipped roster CSV (data/bench_employees.csv) moved the same three rows to
# WAXING in the same change; without that the importer would replace WAXING's
# roster from the file on the next refresh and drop them again.

import frappe

OLD = "WAX CLEANING"
NEW = "WAXING"


def execute():
	if not frappe.db.exists("Bench", OLD):
		return
	if not frappe.db.exists("Bench", NEW):
		# nothing to move them to — leave the bench alone rather than lose a roster
		print(f"[{OLD}] {NEW} does not exist on this site; leaving the bench in place.")
		return

	# a card still standing at the retired bench goes to WAXING with the work
	stranded = frappe.get_all("Order Bag", filters={"location": OLD}, pluck="name")
	for nm in stranded:
		frappe.db.set_value("Order Bag", nm, "location", NEW, update_modified=False)
	if stranded:
		print(f"[{OLD}] moved {len(stranded)} card(s) to {NEW}.")

	# the roster moves before the bench goes, or three people lose their allotment
	old_doc = frappe.get_doc("Bench", OLD)
	moving = [r.employee for r in old_doc.employees]
	if moving:
		new_doc = frappe.get_doc("Bench", NEW)
		have = {r.employee for r in new_doc.employees}
		added = [e for e in moving if e not in have]
		for emp in added:
			new_doc.append("employees", {"employee": emp})
		if added:
			new_doc.save(ignore_permissions=True)
		print(f"[{OLD}] roster of {len(moving)} → {NEW} ({len(added)} newly added).")

	frappe.delete_doc("Bench", OLD, force=1, ignore_permissions=True)
	frappe.db.commit()
	print(f"[{OLD}] bench record removed — it no longer shows on Assign Benches.")
