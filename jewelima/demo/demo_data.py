# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
"""
Jewelima demo data — packs the system with realistic volume across every doctype
(customers, salesmen, employees, designs+BOMs, job orders, order bags, material
issues/loss, transfers, employee balances) so the whole flow can be tested.

Run on any site (Mac or server):

  bench --site <site> execute jewelima.demo.demo_data.make_demo
  bench --site <site> execute jewelima.demo.demo_data.clear_demo

Bigger / smaller:
  bench --site <site> execute jewelima.demo.demo_data.make_demo --kwargs "{'orders': 400, 'designs': 100}"

Idempotent: make_demo refuses to run while a manifest exists (run clear_demo first).
Everything created is recorded in a manifest at sites/<site>/jewelima_demo_manifest.json
so clear_demo removes exactly what was made (plus the activity tied to those bags).
NOTE: a big run touches thousands of rows and can take a few minutes.
"""
import json
import os
import random

import frappe
from frappe.utils import add_days, flt, nowdate

MANIFEST = "jewelima_demo_manifest.json"
SIZES = ["-2.2/16", "2.0/16", "NA"]
PRE_BENCHES = ["CAD", "CAM", "WAX INJECTING", "TREE MAKING", "CASTING"]
WORK_BENCHES = ["GRINDING", "FILING", "SETTING", "PRE POLISH", "FINAL POLISH"]


def _mpath():
	return frappe.get_site_path(MANIFEST)


def _leaf(doctype):
	return frappe.db.get_value(doctype, {"is_group": 0}, "name")


def make_demo(orders=200, designs=60, customers=30, salesmen=10, employees=20, seed=42):
	if os.path.exists(_mpath()):
		return "Demo already loaded — run clear_demo first."

	random.seed(seed)
	m = {
		"customers": [], "sales_persons": [], "employees": [], "designs": [],
		"design_items": [], "design_boms": [], "job_orders": [], "order_bags": [],
	}
	company = frappe.defaults.get_defaults().get("company")

	golds = frappe.get_all("Item", filters={"weight_unit": "Gram", "is_sales_item": 0, "is_stock_item": 1}, pluck="name")
	stones = frappe.get_all("Item", filters={"stone_type": ["in", ["Diamond", "Precious Stone", "Color Stone"]]}, pluck="name")
	if not golds:
		frappe.throw("No gold raw materials — run the raw-material import first.")

	dtypes = frappe.get_all("Design Type", pluck="name") or ["Rings"]
	dstyles = frappe.get_all("Design Style", pluck="name") or ["General"]
	otypes = frappe.get_all("Order Type", pluck="name") or ["BULK", "CUSTOMER"]
	cgroup, territory = _leaf("Customer Group"), _leaf("Territory")
	sp_root = frappe.db.get_value("Sales Person", {"is_group": 1}, "name")

	try:
		# ---- masters ----
		for i in range(customers):
			m["customers"].append(frappe.get_doc({
				"doctype": "Customer", "customer_name": f"DEMO Customer {i + 1:03d}",
				"customer_group": cgroup, "territory": territory,
			}).insert(ignore_permissions=True).name)

		for i in range(salesmen):
			m["sales_persons"].append(frappe.get_doc({
				"doctype": "Sales Person", "sales_person_name": f"DEMO Salesman {i + 1:02d}",
				"parent_sales_person": sp_root, "is_group": 0,
			}).insert(ignore_permissions=True).name)

		for i in range(employees):
			e = frappe.get_doc({
				"doctype": "Employee", "first_name": f"DEMO Karigar {i + 1:02d}", "company": company,
				"gender": "Male", "date_of_joining": "2024-01-01", "date_of_birth": "1990-01-01", "status": "Active",
			})
			e.insert(ignore_permissions=True, ignore_mandatory=True)
			m["employees"].append(e.name)

		# ---- designs (each provisions an Item + BOM) ----
		from jewelima.jewelima.api import create_design
		for i in range(designs):
			mats = [{"item": random.choice(golds), "qty": 0, "weight": round(random.uniform(4, 20), 2)}]
			for _ in range(random.randint(0, 3)):
				if stones:
					mats.append({"item": random.choice(stones), "qty": random.randint(1, 12), "weight": round(random.uniform(0.05, 2.0), 3)})
			res = create_design(f"DEMO-DSN-{i + 1:03d}", random.choice(dtypes), random.choice(dstyles), None, json.dumps(mats))
			d = frappe.db.get_value("Design", res["name"], ["name", "item", "bom"], as_dict=True)
			m["designs"].append(d.name)
			if d.item:
				m["design_items"].append(d.item)
			if d.bom:
				m["design_boms"].append(d.bom)

		# ---- orders + bags + activity ----
		today = nowdate()
		for i in range(orders):
			od = add_days(today, -random.randint(0, 45))
			jo = frappe.get_doc({
				"doctype": "Job Order", "order_date": od, "due_date": add_days(od, random.randint(7, 30)),
				"customer": random.choice(m["customers"]), "salesman": random.choice(m["sales_persons"]),
				"order_type": random.choice(otypes), "customer_order_id": f"PO-{1000 + i}",
			}).insert(ignore_permissions=True)
			m["job_orders"].append(jo.name)
			for _ in range(random.randint(1, 5)):
				bag = frappe.get_doc({
					"doctype": "Order Bag", "job_order": jo.name, "design": random.choice(m["designs"]),
					"qty": random.randint(1, 8), "size": random.choice(SIZES),
				}).insert(ignore_permissions=True)
				m["order_bags"].append(bag.name)
				_simulate(bag.name, golds, stones, m["employees"])
	finally:
		# always persist what we made so clear_demo can clean even a partial run
		with open(_mpath(), "w") as f:
			json.dump(m, f)
		frappe.db.commit()

	return {k: len(v) for k, v in m.items()}


def _simulate(bag, golds, stones, employees):
	"""Walk a bag through a random slice of the flow so states are spread out."""
	import json

	from jewelima.jewelima.api import (
		add_weight, convert_to_ornament, get_bag_contents, issue_bench_cards,
		issue_stones, receipt_bench_cards, transfer_order_bag,
	)
	r = random.random()
	if r < 0.18:
		return  # left sitting at ORDERING, empty

	grams = round(random.uniform(4, 20), 3)
	add_weight(bag, random.choice(golds), grams, bench="CASTING")
	for loc in PRE_BENCHES[: random.randint(1, len(PRE_BENCHES))]:
		try:
			transfer_order_bag(bag, loc)
		except Exception:
			pass
	if r < 0.4:
		return

	if stones and random.random() < 0.7:
		issue_stones(bag, random.choice(stones), round(random.uniform(0.1, 2.0), 3), bench="SETTING")

	for bench in random.sample(WORK_BENCHES, random.randint(1, 3)):
		try:
			transfer_order_bag(bag, bench)  # creates the bench record (In Queue)
			emp = random.choice(employees)
			issue_bench_cards(json.dumps([bag]), bench, employee=emp)  # -> Issued, weight_out snapshot
			gold = flt(get_bag_contents(bag).get("gold_grams")) or grams
			win = round(max(gold - random.uniform(0.01, 0.15), 0), 3)
			receipt_bench_cards(json.dumps([{"order_bag": bag, "weight_in": win}]), bench, employee=emp)  # -> Receipted + loss
		except Exception:
			pass

	if r > 0.8:
		try:
			transfer_order_bag(bag, "BAG EXTRACTION")
			convert_to_ornament(bag)
		except Exception:
			pass


def clear_demo():
	if not os.path.exists(_mpath()):
		return "No demo manifest — nothing to clear."
	with open(_mpath()) as f:
		m = json.load(f)

	bags = m.get("order_bags") or []
	# activity tied to the demo bags / employees
	for dt in ["Employee Issue", "Bag Material Ledger", "Order Bag Transfer"]:
		for nm in frappe.get_all(dt, filters={"order_bag": ["in", bags or ["__none__"]]}, pluck="name"):
			frappe.delete_doc(dt, nm, force=1, ignore_permissions=True)
	for emp in m.get("employees", []):
		if frappe.db.exists("Employee Metal Balance", emp):
			frappe.delete_doc("Employee Metal Balance", emp, force=1, ignore_permissions=True)

	def _drop(dt, names):
		for nm in names or []:
			if frappe.db.exists(dt, nm):
				try:
					frappe.delete_doc(dt, nm, force=1, ignore_permissions=True)
				except Exception:
					pass

	_drop("Order Bag", bags)
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
	_drop("Customer", m.get("customers"))
	_drop("Sales Person", m.get("sales_persons"))
	_drop("Employee", m.get("employees"))

	os.remove(_mpath())
	frappe.db.commit()
	return "Demo cleared."
