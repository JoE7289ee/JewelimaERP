# Copyright (c) 2026, efeone and contributors
#
# /jwr was the React app's trial address while it was compared with the
# original. It is /jw now; anything that saved the old address lands there.

import frappe

no_cache = 1


def get_context(context):
	frappe.local.flags.redirect_location = "/jw"
	raise frappe.Redirect
