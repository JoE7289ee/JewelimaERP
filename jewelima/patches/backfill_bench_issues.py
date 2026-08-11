# One-time backfill for the Visit + Bench Issue rework: the old model kept ONE
# flat record per card-per-bench. Give every existing bench record that
# represents work (was Issued / Ongoing / Receipted / Completed) a matching
# Bench Issue carrying its employee / weights / loss / times, so nothing on the
# live floor is lost and in-flight (Issued) cards can still be receipted.

import frappe


def execute():
	if not frappe.db.table_exists("Bench Issue"):
		return
	from jewelima.jewelima.benches import BENCH_DOCTYPE

	made = 0
	for loc, dt in BENCH_DOCTYPE.items():
		if not frappe.db.exists("DocType", dt):
			continue
		fields = ["name", "order_bag", "status", "employee", "work_type", "collection_state",
			"weight_out", "weight_in", "loss", "issued_at", "receipted_at", "creation"]
		have = {c for c in fields if frappe.db.has_column(dt, c)}
		for v in frappe.get_all(dt, filters={"status": ["in", ["Issued", "Ongoing", "Receipted", "Completed"]]},
				fields=list(have)):
			# skip records whose Order Bag was deleted/cancelled (dangling visit)
			if not v.get("order_bag") or not frappe.db.exists("Order Bag", v.get("order_bag")):
				continue
			# already migrated (or a fresh issue already exists for this visit)?
			if frappe.db.exists("Bench Issue", {"visit": v.name, "visit_doctype": dt}):
				continue
			frappe.get_doc({
				"doctype": "Bench Issue",
				"order_bag": v.get("order_bag"), "bench": loc,
				"visit": v.name, "visit_doctype": dt,
				"employee": v.get("employee"), "work_type": v.get("work_type"),
				"collection_state": v.get("collection_state"), "status": v.get("status"),
				"weight_out": v.get("weight_out") or 0, "weight_in": v.get("weight_in") or 0,
				"loss": v.get("loss") or 0, "issued_at": v.get("issued_at"),
				"receipted_at": v.get("receipted_at"),
			}).insert(ignore_permissions=True)
			made += 1
	frappe.db.commit()
	print("backfill_bench_issues — Bench Issue rows created: {0}".format(made))
