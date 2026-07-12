# One-time backfill: existing finished pieces get their "In Stock Since" stamp
# from the moment they became products — the creation of their Convert (Out)
# ledger rows (fallback: the bag's modified time).

import frappe


def execute():
	if not frappe.db.has_column("Order Bag", "in_stock_on"):
		return
	bags = frappe.get_all("Order Bag", filters={"is_finished": 1, "in_stock_on": ["is", "not set"]}, pluck="name")
	for nm in bags:
		when = frappe.db.get_value(
			"Bag Material Ledger", {"order_bag": nm, "entry_type": "Convert", "direction": "Out"},
			"creation", order_by="creation desc",
		) or frappe.db.get_value("Order Bag", nm, "modified")
		frappe.db.set_value("Order Bag", nm, "in_stock_on", when, update_modified=False)
	frappe.db.commit()
