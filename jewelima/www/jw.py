# Copyright (c) 2026, efeone and contributors
#
# The PHONE app at /jw — a small shell of our own beside the desk.
#
# It is not the desk in a narrow window: the desk boots a router, a form engine,
# list views and a large payload before it shows anything, which on shop-floor
# wifi is seconds of nothing. This page loads one screen, and every job it does
# calls the SAME whitelisted API the desk calls — no second backend, no second
# copy of any rule.
#
# Login is the desk's own: no session, no app.

import frappe

no_cache = 1


def get_context(context):
	if frappe.session.user == "Guest":
		frappe.local.flags.redirect_location = "/login?redirect-to=/jw"
		raise frappe.Redirect
	context.no_cache = 1
	context.show_sidebar = False
	context.jw_user = frappe.session.user
	context.jw_full_name = frappe.db.get_value("User", frappe.session.user, "full_name") or frappe.session.user
	context.jw_roles = sorted(set(frappe.get_roles()))
	return context
