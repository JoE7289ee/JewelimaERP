# Copyright (c) 2026, efeone and contributors
# Dedicated, login-required, chrome-free KPI dashboard at /overview. Redirects to login
# when not signed in; otherwise renders the full-screen card board (templates/overview.html).

import frappe

no_cache = 1


def get_context(context):
	if frappe.session.user == "Guest":
		frappe.local.flags.redirect_location = "/login?redirect-to=/overview"
		raise frappe.Redirect
	context.no_cache = 1
	context.show_sidebar = False
	return context
