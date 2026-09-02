# Copyright (c) 2026, efeone and contributors
#
# WAX CLEANING stops being a bench (2026-09-02).
#
# It becomes a TYPE OF WORK done at WAXING, which is where the work physically
# happened anyway. Everything that pointed at the bench has to land somewhere:
# the cards move to WAXING, the two work types it owned join WAXING's list, its
# transfer rules go (there is no such destination any more), and its role's
# holders become JW WAXING so nobody loses their screen on deploy day.
#
# The `Wax Cleaning` DocType and its rows are deliberately KEPT. They are the
# only record of who did what at that bench, and abolishing a bench is not a
# reason to lose its history. It is simply no longer in BENCH_DOCTYPE, so no
# live screen reaches it.

import frappe
from frappe.utils import cint

OLD = "WAX CLEANING"
NEW = "WAXING"
OLD_ROLE = "JW WAX CLEANING"
NEW_ROLE = "JW WAXING"


def execute():
	moved = _move_cards()
	closed = _close_open_work()
	opts = _move_work_options()
	rules = _drop_transfer_rules()
	users = _move_role_holders()
	frappe.db.commit()
	print("retire_wax_cleaning_bench: cards->WAXING %s | open work closed %s | "
		"work options moved %s | transfer rules dropped %s | users re-roled %s"
		% (moved, closed, opts, rules, users))


def _move_cards():
	names = frappe.get_all("Order Bag", filters={"location": OLD}, pluck="name")
	if not names:
		return 0
	frappe.db.sql("""UPDATE `tabOrder Bag` SET location = %s WHERE location = %s""", (NEW, OLD))
	return len(names)


def _close_open_work():
	"""A card cannot stay issued at a bench that no longer exists. Anything still
	open is completed with a remark saying why, so no card is left held by a
	worker on a screen nobody can open."""
	if not frappe.db.exists("DocType", "Wax Cleaning"):
		return 0
	rows = frappe.get_all("Wax Cleaning",
		filters={"status": ["in", ["In Queue", "On Hold", "Issued", "Ongoing", "Receipted"]]},
		pluck="name")
	for nm in rows:
		frappe.db.set_value("Wax Cleaning", nm, {
			"status": "Completed",
			"remarks": (frappe.db.get_value("Wax Cleaning", nm, "remarks") or "")
				+ " [closed: WAX CLEANING bench retired, work moved to WAXING]",
		}, update_modified=False)
	return len(rows)


def _move_work_options():
	"""Its options become WAXING's. Rows are (bench, kind, value): the collection
	states are the same three WAXING already has, so those are dropped rather than
	duplicated, and the two work types move across. Its "Wax Cleaning" default is
	cleared — WAXING already has a default work type, and two would be one too
	many."""
	if not frappe.db.exists("DocType", "Bench Work Option"):
		return 0
	have = {((r.kind or ""), (r.value or "").strip().lower()) for r in frappe.get_all(
		"Bench Work Option", filters={"bench": NEW}, fields=["kind", "value"])}
	moved = 0
	for r in frappe.get_all("Bench Work Option", filters={"bench": OLD},
			fields=["name", "kind", "value"]):
		key = ((r.kind or ""), (r.value or "").strip().lower())
		if key in have:
			frappe.delete_doc("Bench Work Option", r.name, force=1, ignore_permissions=True)
			continue
		frappe.db.set_value("Bench Work Option", r.name,
			{"bench": NEW, "is_default": 0}, update_modified=False)
		have.add(key)
		moved += 1
	return moved


def _drop_transfer_rules():
	"""No card can arrive at or leave a bench that is gone."""
	if not frappe.db.exists("DocType", "Transfer Rule"):
		return 0
	names = frappe.get_all("Transfer Rule",
		filters={"from_location": OLD}, pluck="name") + frappe.get_all(
		"Transfer Rule", filters={"to_location": OLD}, pluck="name")
	for nm in set(names):
		frappe.delete_doc("Transfer Rule", nm, force=1, ignore_permissions=True)
	return len(set(names))


def _move_role_holders():
	"""Whoever held JW WAX CLEANING gets JW WAXING — the same wax line, one role
	fewer. Then the empty role goes."""
	if not frappe.db.exists("Role", OLD_ROLE):
		return 0
	users = frappe.get_all("Has Role", filters={"role": OLD_ROLE, "parenttype": "User"},
		pluck="parent")
	for u in set(users):
		if not frappe.db.exists("Role", NEW_ROLE):
			break
		if not frappe.db.exists("Has Role", {"role": NEW_ROLE, "parent": u, "parenttype": "User"}):
			doc = frappe.get_doc("User", u)
			doc.append("roles", {"role": NEW_ROLE})
			doc.save(ignore_permissions=True)
	for nm in frappe.get_all("Has Role", filters={"role": OLD_ROLE}, pluck="name"):
		frappe.db.sql("DELETE FROM `tabHas Role` WHERE name = %s", nm)
	frappe.delete_doc("Role", OLD_ROLE, force=1, ignore_permissions=True)
	return len(set(users))
