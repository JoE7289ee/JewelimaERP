# certificate_no is gone (we never get certificate numbers) — the Order Bag now
# carries `certifications`: WHICH certifications the piece went through. Backfill
# it from received Certification Items' batch types.
import frappe


def execute():
	if not frappe.db.has_column("Order Bag", "certifications"):
		return
	rows = frappe.db.sql("""
		SELECT i.order_bag, c.certification_type FROM `tabCertification Item` i
		JOIN `tabCertification` c ON c.name = i.parent WHERE i.received = 1""", as_dict=True)
	trail = {}
	for r in rows:
		trail.setdefault(r.order_bag, [])
		if r.certification_type not in trail[r.order_bag]:
			trail[r.order_bag].append(r.certification_type)
	for bag, types in trail.items():
		if frappe.db.exists("Order Bag", bag):
			frappe.db.set_value("Order Bag", bag, "certifications", ", ".join(types), update_modified=False)
	frappe.db.commit()
