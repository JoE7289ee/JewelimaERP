# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
"""
Finished-products demo — for building the CERTIFICATION + SALES flows.

Creates a small set of designs (one gold item + some stones each) and a batch of FINISHED
PRODUCTS: qty-1 Order Bags taken all the way through `make_products` (convert to ornament,
freeze actual weights, is_finished=1, stock_status='In Stock'), each tied to a random real
customer. That gives realistic stock to drive: In Stock -> At Certification -> Sold.

STANDALONE — deliberately NOT wired into any setup/update/build script. Run by hand:

  bench --site <site> execute jewelima.demo.demo_finished.make_finished
  bench --site <site> execute jewelima.demo.demo_finished.make_finished --kwargs "{'products': 300, 'designs': 10}"
  bench --site <site> execute jewelima.demo.demo_finished.clear_finished

Idempotent: make_finished refuses to run while its manifest exists (run clear_finished
first). Everything created is recorded at sites/<site>/jewelima_finished_demo_manifest.json.
NOTE: each product posts stock + freezes weights, so ~300 takes a few minutes.
"""
import json
import os
import random

import frappe
from frappe.utils import add_days, nowdate

MANIFEST = "jewelima_finished_demo_manifest.json"
SIZES = ["-2.2/16", "2.0/16", "NA"]  # must match the Order Bag `size` Select options


def _mpath():
	return frappe.get_site_path(MANIFEST)


def make_finished(products=300, designs=10, salesmen=5, seed=7):
	if os.path.exists(_mpath()):
		return "Finished-products demo already loaded — run clear_finished first."

	random.seed(seed)
	m = {
		"sales_persons": [], "designs": [], "design_items": [], "design_boms": [],
		"job_orders": [], "order_bags": [],
	}

	customers = frappe.get_all("Customer", filters={"disabled": 0}, pluck="name")
	if not customers:
		frappe.throw("No customers found — run jewelima.jewelima.imports.import_customers.run first.")

	# one gold item (as requested) + a pool of stones
	golds = frappe.get_all(
		"Item",
		filters={"weight_unit": "Gram", "is_stock_item": 1, "metal_purity": ["in", ["14K", "18K", "22K"]]},
		pluck="name",
	)
	stones = frappe.get_all("Item", filters={"stone_type": ["in", ["Diamond", "Precious Stone", "Color Stone"]]}, pluck="name")
	if not golds:
		frappe.throw("No karat golds — run the raw-material import first.")
	gold = golds[0]

	dtypes = frappe.get_all("Design Type", pluck="name") or ["Rings"]
	dstyles = frappe.get_all("Design Style", pluck="name") or ["General"]
	otypes = frappe.get_all("Order Type", pluck="name") or ["BULK"]
	sp_root = frappe.db.get_value("Sales Person", {"is_group": 1}, "name")

	from jewelima.jewelima.api import add_weight, create_design, issue_stones, make_products

	made = 0
	try:
		# ---- demo salesmen ----
		for i in range(salesmen):
			m["sales_persons"].append(frappe.get_doc({
				"doctype": "Sales Person", "sales_person_name": f"FP DEMO Salesman {i + 1:02d}",
				"parent_sales_person": sp_root, "is_group": 0,
			}).insert(ignore_permissions=True).name)

		# ---- designs: one gold + some stones each (provisions Item + BOM) ----
		for i in range(designs):
			mats = [{"item": gold, "qty": 0, "weight": round(random.uniform(3, 12), 2)}]
			for _ in range(random.randint(1, 3)):
				if stones:
					mats.append({"item": random.choice(stones), "qty": random.randint(1, 8), "weight": round(random.uniform(0.05, 1.2), 3)})
			res = create_design(f"FP-DSN-{i + 1:03d}", random.choice(dtypes), random.choice(dstyles), None, json.dumps(mats))
			d = frappe.db.get_value("Design", res["name"], ["name", "item", "bom"], as_dict=True)
			m["designs"].append(d.name)
			if d.item:
				m["design_items"].append(d.item)
			if d.bom:
				m["design_boms"].append(d.bom)

		# ---- finished products: qty-1 bags -> add gold (+ stones) -> make_products ----
		today = nowdate()
		while made < products:
			cust = random.choice(customers)
			od = add_days(today, -random.randint(0, 60))
			jo = frappe.get_doc({
				"doctype": "Job Order", "order_date": od, "due_date": add_days(od, random.randint(7, 30)),
				"customer": cust, "salesman": random.choice(m["sales_persons"]),
				"order_type": random.choice(otypes), "customer_order_id": f"FP-PO-{1000 + len(m['job_orders'])}",
			}).insert(ignore_permissions=True)
			m["job_orders"].append(jo.name)

			for _ in range(random.randint(1, 6)):
				if made >= products:
					break
				bag = frappe.get_doc({
					"doctype": "Order Bag", "job_order": jo.name, "design": random.choice(m["designs"]),
					"qty": 1, "size": random.choice(SIZES),
				}).insert(ignore_permissions=True)
				frappe.db.set_value("Order Bag", bag.name, "customer", cust)  # read-only field; make_products uses it for held_by
				m["order_bags"].append(bag.name)
				try:
					add_weight(bag.name, gold, round(random.uniform(3, 12), 3), bench="CASTING")
					if stones and random.random() < 0.85:
						try:
							issue_stones(bag.name, random.choice(stones), round(random.uniform(0.1, 1.5), 3),
								pcs=random.randint(1, 8), bench="SETTING")
						except Exception:
							pass  # stones are a bonus; the piece still finishes on gold alone
					make_products(json.dumps([bag.name]))
					made += 1
				except Exception as e:
					frappe.log_error(f"demo_finished: {bag.name}: {e}", "demo_finished")
				if made % 25 == 0:
					frappe.db.commit()
	finally:
		with open(_mpath(), "w") as f:
			json.dump(m, f)
		frappe.db.commit()

	result = {"finished_products": made, **{k: len(v) for k, v in m.items()}}
	print(result)
	return result


def clear_finished():
	if not os.path.exists(_mpath()):
		return "No finished-products manifest — nothing to clear."
	with open(_mpath()) as f:
		m = json.load(f)

	# inline the post-delete cleanup jobs (avoids QueueOverloaded on a big clear)
	prev = frappe.flags.in_test
	frappe.flags.in_test = True

	bags = m.get("order_bags") or ["__none__"]
	for dt in ["Bag Material Ledger", "Order Bag Transfer", "Employee Issue"]:
		if frappe.db.exists("DocType", dt):
			for nm in frappe.get_all(dt, filters={"order_bag": ["in", bags]}, pluck="name"):
				frappe.delete_doc(dt, nm, force=1, ignore_permissions=True)

	def _drop(dt, names):
		for nm in names or []:
			if frappe.db.exists(dt, nm):
				try:
					frappe.delete_doc(dt, nm, force=1, ignore_permissions=True)
				except Exception:
					pass

	_drop("Order Bag", m.get("order_bags"))
	_drop("Job Order", m.get("job_orders"))
	for bom in m.get("design_boms", []):
		if frappe.db.exists("BOM", bom):
			bd = frappe.get_doc("BOM", bom)
			if bd.docstatus == 1:
				try:
					bd.cancel()
				except Exception:
					pass
			frappe.delete_doc("BOM", bom, force=1, ignore_permissions=True)
	_drop("Design", m.get("designs"))
	_drop("Item", m.get("design_items"))
	_drop("Sales Person", m.get("sales_persons"))

	frappe.flags.in_test = prev
	os.remove(_mpath())
	frappe.db.commit()
	return "Finished-products demo cleared. (For a fully clean stock ledger, a --fresh rebuild is cleanest.)"
