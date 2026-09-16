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
# Two gates, in order: a session, then the JW Phone role. That role is the key to
# the app itself and grants nothing inside it — what a user can DO here is still
# their other roles' business, so a filer with JW Phone gets the phone app with a
# filer's powers in it.

import frappe

no_cache = 1

PHONE_ROLE = "JW Phone"
ALWAYS_IN = ("System Manager", "JW Manager")


def get_context(context):
	if frappe.session.user == "Guest":
		frappe.local.flags.redirect_location = "/jw-login"
		raise frappe.Redirect
	roles = set(frappe.get_roles())
	context.no_cache = 1
	context.show_sidebar = False
	context.jw_user = frappe.session.user
	context.jw_full_name = frappe.db.get_value("User", frappe.session.user, "full_name") or frappe.session.user
	context.jw_roles = sorted(roles)
	# no key: say so plainly rather than throw a 403 page at somebody standing at
	# a bench — they signed in correctly, they simply do not hold this role
	context.jw_denied = not roles.intersection({PHONE_ROLE, *ALWAYS_IN})
	return context
