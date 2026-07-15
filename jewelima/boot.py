# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
#
# Boot trimming: shop staff only ever work inside Jewelima.
#
# ERPNext's own gate (erpnext.check_app_permission) returns True for ANY system
# user, so its tile rides along on the apps screen / switcher even for an
# order-taker who can open none of its workspaces. Two things happen here:
#   1. app_data (the app switcher) is filtered — it already exists at this point.
#   2. erpnext's gate is swapped for a role-aware one. frappe builds apps_data
#      (the /apps screen) from get_apps() AFTER extend_bootinfo runs, so the swap
#      lands in time. The replacement re-checks the CURRENT session on every call,
#      so patching the module global stays correct for admins sharing the worker.

import frappe


def _erpnext_for_admins_only():
	"""ERPNext's app tile: admins only."""
	return frappe.session.user == "Administrator" or "System Manager" in set(frappe.get_roles())


def _patch_erpnext_gate():
	try:
		import erpnext
	except ImportError:
		return
	if getattr(erpnext.check_app_permission, "_jw_patched", False):
		return
	_erpnext_for_admins_only._jw_patched = True
	erpnext.check_app_permission = _erpnext_for_admins_only


def boot_session(bootinfo):
	"""Non-admin staff see ONLY the Jewelima app."""
	_patch_erpnext_gate()
	if _erpnext_for_admins_only():
		return  # admins keep the full set
	bootinfo.app_data = [a for a in (bootinfo.app_data or []) if a.get("app_name") == "jewelima"]
