# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
#
# The Buckets page folds into Delivery Masters, under a Delivery Settings group.
#
# Buckets sat under Delivery so the counter could reach them, but a bucket is
# set up once and used for months — that is a setting, not counter work. It now
# lives with the other delivery masters behind the same admin-and-manager door,
# and the standalone page goes. Nothing about the Finished Bucket records
# changes; only where they are edited from.

import frappe


def execute():
	# the Page doc, its role rows and any sidebar link pointing at it
	if frappe.db.exists("Page", "buckets"):
		frappe.delete_doc("Page", "buckets", force=True, ignore_permissions=True)
		print("buckets: page removed — it lives inside Delivery Masters now")
	# settings are for the manager, not the delivery desk
	if frappe.db.exists("Page", "delivery-masters"):
		d = frappe.get_doc("Page", "delivery-masters")
		keep = {"System Manager", "JW Manager"}
		if {r.role for r in d.roles} != keep:
			d.set("roles", [{"role": r} for r in sorted(keep)])
			d.save(ignore_permissions=True)
			print("delivery-masters: now", ", ".join(sorted(keep)))
	frappe.db.commit()
