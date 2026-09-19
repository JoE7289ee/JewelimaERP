# Copyright (c) 2026, efeone and contributors
#
# The phone app, rebuilt in React — served here beside the original at /jw until
# every screen has moved across, so the two can be compared on the same phone.
#
# Same two gates as /jw: a session, then the JW Phone role (System Manager is
# always in). The page itself is only a shell: it hands the browser the built
# bundle, whose hashed file names are read off Vite's manifest so a new build is
# picked up on the very next load, with no cache to fight.

import json
import os

import frappe

no_cache = 1

PHONE_ROLE = "JW Phone"
ALWAYS_IN = ("System Manager",)
BUILD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "jw")


def _bundle():
	"""The built entry's script and stylesheet, from Vite's manifest."""
	try:
		with open(os.path.join(BUILD_DIR, ".vite", "manifest.json")) as f:
			m = json.load(f)
	except OSError:
		return None, [], ""
	entry = next((v for v in m.values() if v.get("isEntry")), None) or {}
	base = "/assets/jewelima/jw/"
	stamp = str(int(os.path.getmtime(os.path.join(BUILD_DIR, ".vite", "manifest.json"))))[-6:]
	return (base + entry["file"]) if entry.get("file") else None, [base + c for c in entry.get("css", [])], stamp


def get_context(context):
	if frappe.session.user == "Guest":
		frappe.local.flags.redirect_location = "/jw-login"
		raise frappe.Redirect
	roles = set(frappe.get_roles())
	if not roles.intersection({PHONE_ROLE, *ALWAYS_IN}):
		# the original says why plainly; send them there rather than repeat it
		frappe.local.flags.redirect_location = "/jw"
		raise frappe.Redirect
	js, css, stamp = _bundle()
	context.no_cache = 1
	context.jw_js, context.jw_css, context.jw_build = js, css, stamp
	context.jw_user = frappe.session.user
	context.jw_full_name = frappe.db.get_value("User", frappe.session.user, "full_name") or frappe.session.user
	return context
