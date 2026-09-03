# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
#
# The finished buckets become the three people who hold stock: FEMI, SUMI,
# JISMY. The old CUSTOMER / JEWELIMA / WHOLE-SALE buckets are RETIRED, not
# deleted — pieces are already filed in them (6 on the live site when this was
# written), and deleting a bucket a piece points at would leave that piece
# saying it lives somewhere that does not exist.
#
# Retired is enough to clear the list: _require_bucket refuses an inactive
# bucket, so nothing new can be filed into one, and they stop being offered
# anywhere. Anything still sitting in one can be moved on Transfer Bucket, and
# the empty ones can be deleted once they are empty.

import frappe

NEW = ["FEMI", "SUMI", "JISMY"]
RETIRE = ["CUSTOMER", "JEWELIMA", "WHOLE-SALE"]


def execute():
	if not frappe.db.exists("DocType", "Finished Bucket"):
		return
	for name in NEW:
		if frappe.db.exists("Finished Bucket", name):
			frappe.db.set_value("Finished Bucket", name, "active", 1)
		else:
			frappe.get_doc({"doctype": "Finished Bucket", "bucket_name": name,
				"active": 1}).insert(ignore_permissions=True)
	kept = []
	for name in RETIRE:
		if not frappe.db.exists("Finished Bucket", name):
			continue
		held = frappe.db.count("Order Bag", {"bucket": name})
		frappe.db.set_value("Finished Bucket", name, "active", 0)
		if held:
			kept.append("{0} ({1} piece(s))".format(name, held))
		else:
			frappe.delete_doc("Finished Bucket", name, force=True, ignore_permissions=True)
	frappe.db.commit()
	print("buckets: {0} in use".format(", ".join(NEW)))
	if kept:
		print("buckets: retired but still holding stock — move them on Transfer Bucket: "
			+ ", ".join(kept))
