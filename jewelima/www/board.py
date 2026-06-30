# Copyright (c) 2026, efeone and contributors
# Polished, login-required, chrome-free live production board at /board (ECharts).

import frappe

no_cache = 1


def get_context(context):
	if frappe.session.user == "Guest":
		frappe.local.flags.redirect_location = "/login?redirect-to=/board"
		raise frappe.Redirect
	context.no_cache = 1
	context.show_sidebar = False
	return context
