# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
"""
Jewelima demo data — packs the system with realistic volume (designs+BOMs, job orders,
order bags, material issues/loss, transfers, employee balances) so the whole flow can be
tested. Customers and employees are loaded from the REAL bundled import lists (the demo
auto-runs import_customers + import_employees), so orders link to real masters — no fake
customers/employees are created, and clear_demo never deletes them.

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


def make_demo(orders=200, designs=60, salesmen=10, seed=42):
	if os.path.exists(_mpath()):
		return "Demo already loaded — run clear_demo first."

	random.seed(seed)
	m = {
		"sales_persons": [], "designs": [], "design_items": [], "design_boms": [],
		"job_orders": [], "order_bags": [], "work_employees": [],
	}
	company = frappe.defaults.get_defaults().get("company")

	# auto-load the REAL customer + employee lists first, so demo orders link to real
	# masters (no fake DEMO customers/employees are created).
	from jewelima.jewelima.imports import import_customers, import_employees
	import_customers.run()
	import_employees.run()
	customers = frappe.get_all("Customer", filters={"disabled": 0}, pluck="name")
	employees = frappe.get_all("Employee", filters={"status": "Active"}, pluck="name")
	if not customers:
		frappe.throw("No customers found after import — check import_customers.")
	if not employees:
		frappe.throw("No employees found after import — check import_employees.")

	# designs use ONLY karat golds (14/18/22 K, any colour) — no bullion / standard gold
	golds = frappe.get_all("Item", filters={"weight_unit": "Gram", "is_stock_item": 1, "metal_purity": ["in", ["14K", "18K", "22K"]]}, pluck="name")
	stones = frappe.get_all("Item", filters={"stone_type": ["in", ["Diamond", "Precious Stone", "Color Stone"]]}, pluck="name")
	if not golds:
		frappe.throw("No karat golds — run seed_karat_golds / the raw-material import first.")

	dtypes = frappe.get_all("Design Type", pluck="name") or ["Rings"]
	dstyles = frappe.get_all("Design Style", pluck="name") or ["General"]
	otypes = frappe.get_all("Order Type", pluck="name") or ["BULK", "CUSTOMER"]
	sp_root = frappe.db.get_value("Sales Person", {"is_group": 1}, "name")
	used_emp = set()

	try:
		# ---- demo salesmen (no real source for these) ----
		for i in range(salesmen):
			m["sales_persons"].append(frappe.get_doc({
				"doctype": "Sales Person", "sales_person_name": f"DEMO Salesman {i + 1:02d}",
				"parent_sales_person": sp_root, "is_group": 0,
			}).insert(ignore_permissions=True).name)

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
				"customer": random.choice(customers), "salesman": random.choice(m["sales_persons"]),
				"order_type": random.choice(otypes),
			}).insert(ignore_permissions=True)
			m["job_orders"].append(jo.name)
			for _ in range(random.randint(1, 5)):
				bag = frappe.get_doc({
					"doctype": "Order Bag", "job_order": jo.name, "design": random.choice(m["designs"]),
					"qty": random.randint(1, 8), "size": random.choice(SIZES),
				}).insert(ignore_permissions=True)
				m["order_bags"].append(bag.name)
				_simulate(bag.name, golds, stones, employees, used_emp)
	finally:
		# always persist what we made so clear_demo can clean even a partial run
		m["work_employees"] = sorted(used_emp)
		with open(_mpath(), "w") as f:
			json.dump(m, f)
		frappe.db.commit()

	return {k: len(v) for k, v in m.items()}


def _simulate(bag, golds, stones, employees, used_emp):
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
		issue_stones(bag, random.choice(stones), round(random.uniform(0.1, 2.0), 3), pcs=random.randint(1, 12), bench="SETTING")

	for bench in random.sample(WORK_BENCHES, random.randint(1, 3)):
		try:
			transfer_order_bag(bag, bench)  # creates the bench record (In Queue)
			emp = random.choice(employees)
			used_emp.add(emp)
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

	# Each frappe.delete_doc enqueues a 'delete_dynamic_links' background job; a big clear
	# would flood the queue and trip QueueOverloaded. Running with in_test makes that
	# cleanup inline (delete_doc uses now=frappe.in_test), so nothing piles up.
	prev_in_test = frappe.flags.in_test
	frappe.flags.in_test = True

	bags = m.get("order_bags") or []
	# activity tied to the demo bags / employees
	for dt in ["Employee Issue", "Bag Material Ledger", "Order Bag Transfer"]:
		for nm in frappe.get_all(dt, filters={"order_bag": ["in", bags or ["__none__"]]}, pluck="name"):
			frappe.delete_doc(dt, nm, force=1, ignore_permissions=True)
	# reset metal balances for employees that did demo work (real ones — kept) and any
	# legacy demo-created employees (old manifests)
	for emp in (m.get("work_employees") or []) + (m.get("employees") or []):
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

	frappe.flags.in_test = prev_in_test
	os.remove(_mpath())
	frappe.db.commit()
	return "Demo cleared."
