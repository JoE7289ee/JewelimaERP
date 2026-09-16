# Copyright (c) 2026, efeone and contributors
#
# The PHONE app's own door at /jw-login.
#
# The desk's login page is a web page in a browser window; this is the first
# screen of an app installed on a home screen, and it should look like one. It
# signs in through frappe's OWN /api/method/login — same session, same rules,
# same failed-attempt limits. Nothing about authentication lives here.

import frappe

no_cache = 1


def get_context(context):
	# already signed in: there is nothing to do on a door
	if frappe.session.user != "Guest":
		frappe.local.flags.redirect_location = "/jw"
		raise frappe.Redirect
	context.no_cache = 1
	context.show_sidebar = False
	return context
