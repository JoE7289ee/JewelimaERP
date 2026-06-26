# Copyright (c) 2026, efeone and contributors
# Login-required, chrome-free, auto-rotating "Orders Taken" TV board at /orders (ECharts).

import frappe

no_cache = 1


def get_context(context):
	if frappe.session.user == "Guest":
		frappe.local.flags.redirect_location = "/login?redirect-to=/intake"
		raise frappe.Redirect
	context.no_cache = 1
	context.show_sidebar = False
	return context
