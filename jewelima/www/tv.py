# Copyright (c) 2026, efeone and contributors
# Dedicated, login-required, chrome-free TV dashboard at /tv. Redirects to the login
# page when not signed in; otherwise renders the full-screen board (templates/tv.html).

import frappe

no_cache = 1


def get_context(context):
	# require a real login — no guest access
	if frappe.session.user == "Guest":
		frappe.local.flags.redirect_location = "/login?redirect-to=/tv"
		raise frappe.Redirect
	context.no_cache = 1
	context.show_sidebar = False
	return context
