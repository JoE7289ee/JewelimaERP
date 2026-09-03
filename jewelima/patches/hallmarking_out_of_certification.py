# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
#
# HALLMARKING leaves the Certification doctype.
#
# It was never a certification: no lab format, nothing to lock a batch to,
# nearly every piece goes, and the trip exists for the HUID that comes back.
# It now has its own Hallmarking Batch (HALL-0001), its own centre master and
# its own four desk pages. This carries the old records across and then takes
# HALL out of the certification masters so the certify desk stops offering it.
#
# The pieces themselves are NOT touched: their huid and their certifications
# trail already say what happened, and a card's costing reads the hallmark
# charge off that trail.

import frappe

STATUS = {"Prepared": "Prepared", "Sent": "Sent", "Collected": "Collected",
	"Partially Received": "Partially Received", "Received": "Received",
	"Cancelled": "Cancelled"}


def execute():
	for dt in ("Hallmarking Batch", "Hallmarking Item", "Hallmarking Center"):
		if not frappe.db.exists("DocType", dt):
			return
	frappe.reload_doc("jewelima", "doctype", "hallmarking_center")
	frappe.reload_doc("jewelima", "doctype", "hallmarking_item")
	frappe.reload_doc("jewelima", "doctype", "hallmarking_batch")

	# ---- the centres first, so the batches have somewhere to point
	from jewelima.setup import seed_hallmarking
	seed_hallmarking()
	# any hallmarking centre that only ever existed as a certification centre
	for c in frappe.get_all("Certification Center",
			filters={"certification_type": "HALL"},
			fields=["center_name", "location", "email", "mail_subject", "mail_body"]):
		if not frappe.db.exists("Hallmarking Center", c.center_name):
			frappe.get_doc({"doctype": "Hallmarking Center", "center_name": c.center_name,
				"location": c.location, "email": c.email, "mail_subject": c.mail_subject,
				"mail_body": c.mail_body}).insert(ignore_permissions=True)

	# ---- then the batches, oldest first so the HALL-#### series reads in order
	moved = 0
	olds = frappe.db.sql("""select name, center, status, prepared_on, sent_on, collected_on,
			stock_entry, remarks from `tabCertification`
		where cert_type = 'HALL' or certification_type = 'HALLMARKING'
		order by creation asc""", as_dict=True)
	for c in olds:
		# the old centre name was "HALL-GOLD MARK"; the new master drops the prefix
		center = (c.center or "").split("-", 1)[-1] if c.center else None
		if center and not frappe.db.exists("Hallmarking Center", center):
			frappe.get_doc({"doctype": "Hallmarking Center", "center_name": center}).insert(ignore_permissions=True)
		items = frappe.get_all("Certification Item", filters={"parent": c.name},
			fields=["order_bag", "design", "design_type", "gross", "dmd_ct", "huid",
				"received", "received_on", "rejected", "confirmed_by"], order_by="idx")
		d = frappe.get_doc({"doctype": "Hallmarking Batch",
			"center": center, "status": STATUS.get(c.status, "Received"),
			"prepared_on": c.prepared_on, "sent_on": c.sent_on, "collected_on": c.collected_on,
			"stock_entry": c.stock_entry,
			"remarks": " · ".join(x for x in [(c.remarks or "").strip(), "was " + c.name] if x),
			"items": [dict(i) for i in items]})
		d.flags.ignore_links = True
		d.insert(ignore_permissions=True)
		# the old record goes, so nothing shows twice on the certification boards.
		# on_trash refuses a batch with pieces still out — that is the point, and a
		# refusal here means the floor still has to bring that packet back.
		frappe.delete_doc("Certification", c.name, force=True, ignore_permissions=True)
		moved += 1

	# ---- and HALL leaves the certification masters
	for cc in frappe.get_all("Certification Center", filters={"certification_type": "HALL"}, pluck="name"):
		frappe.delete_doc("Certification Center", cc, force=True, ignore_permissions=True)
	if frappe.db.exists("Certification Type", "HALL"):
		frappe.delete_doc("Certification Type", "HALL", force=True, ignore_permissions=True)

	frappe.db.commit()
	print("hallmarking: moved {0} batch(es) out of certification".format(moved))
