# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
"""
Jewelima demo data — REBUILT for the current structure (code registry items, six
stone buckets, karat-gold leaves, type-linked sizes, warehouse dimension flow,
order requests, CAD, party stock). Fills the system with enough of everything to
try every page:

  designs      one karat gold each ("only purity") + 0-4 stone lines from the REAL registry
  stock        zero-valuation receipts: golds -> Raw Materials Store, stones -> Stone Issue
  orders       Job Orders + Order Bags (plan auto-stamps from bag BOM), real customers/salesmen
  production   transfers along the bench path (real trail), gold+stone issues (warehouse->In
               Bags), some booked losses, a TREE MAKING queue ready for make-tree
  finished     a few qty-1 bags run through make_products (In Bags -> Finished Goods)
  requests     open Order Requests (incl. one CAD wish) for the Requests/All Requests flows
  party        one Stone Party (DMO) with a PDMD + POTH stone and a party metal
  CAD          is_cad bags pinned at CAD for the cad-jobs page

Customers/employees/salesmen are the REAL masters — nothing fake is created there
and clear_demo never touches them.

Run (Mac or server):

  bench --site <site> execute jewelima.demo.demo_data.make_demo
  bench --site <site> execute jewelima.demo.demo_data.clear_demo

Bigger / smaller:
  bench --site <site> execute jewelima.demo.demo_data.make_demo --kwargs "{'orders': 60, 'designs': 80}"

make_demo refuses to run while a manifest exists (clear first). Everything created —
including every Stock Entry the flows post — is recorded in
sites/<site>/jewelima_demo_manifest.json and clear_demo removes exactly that.
NOT part of any build/update script; demo data is always an explicit decision.
"""
import json
import os
import random

import frappe
from frappe.utils import add_days, flt, nowdate

MANIFEST = "jewelima_demo_manifest.json"
WORK_PATH = ["CASTING", "GRINDING", "FILING", "SETTING", "PRE POLISH", "FINAL POLISH"]
LOSS_BENCHES = {"FILING", "FINAL POLISH", "GRINDING", "SETTING"}  # stages with -LOSS warehouses


def _mpath():
	return frappe.get_site_path(MANIFEST)


def _receipt(item, qty, warehouse):
	se = frappe.get_doc({
		"doctype": "Stock Entry", "stock_entry_type": "Material Receipt",
		"company": frappe.get_all("Company", pluck="name")[0],
		"items": [{"item_code": item, "qty": flt(qty), "t_warehouse": warehouse, "allow_zero_valuation_rate": 1}],
	})
	se.insert(ignore_permissions=True)
	se.submit()


def _karat_golds():
	return frappe.get_all(
		"Item", filters={"material_group": "GOLD", "metal_purity": ["!=", ""]},
		fields=["name", "purity_percentage"],
	)


def _stone_pool():
	"""A curated slice of the shipped registry — every bucket represented."""
	names = (
		[f"{q} {s}" for q in ("SI-IJ", "VS-FG", "VVS-EF", "VVS/VS-GH") for s in ("O-1", "1-1.5", "2-2.5", "3-3.5", "5-5.5")]
		+ ["CVD 1-1.5", "CVD 2-2.5", "SW 2-2.5", "SW 4-4.5", "CZ 1-1.5", "CZ 3-3.5", "CS",
		   "RUBY", "EMERALD", "BLUE SAP", "GARNET", "PEARL"]
	)
	pool = []
	for n in names:
		st = frappe.db.get_value("Item", n, "stone_type")
		if st:
			pool.append({"item": n, "stone_type": st})
	return pool


def _type_sizes():
	out = {}
	for dt in frappe.get_all("Design Type", pluck="name"):
		rows = frappe.get_all("Design Type Size", filters={"parent": dt}, fields=["size"], order_by="idx")
		out[dt] = [r.size for r in rows] or ["NA"]
	return out


def make_demo(designs=40, orders=30, requests=5, finished=8, seed=7):
	from jewelima.jewelima import api as japi

	if os.path.exists(_mpath()):
		frappe.throw("Demo data already loaded — run jewelima.demo.demo_data.clear_demo first.")
	random.seed(seed)
	pre_ses = set(frappe.get_all("Stock Entry", pluck="name", limit=0))
	man = {"designs": [], "job_orders": [], "bags": [], "requests": [], "party": None,
	       "party_items": [], "stock_entries": []}

	def _save():
		man["stock_entries"] = [x for x in frappe.get_all("Stock Entry", pluck="name", limit=0) if x not in pre_ses]
		with open(_mpath(), "w") as f:
			json.dump(man, f, indent=1)

	golds = _karat_golds()
	pool = _stone_pool()
	tsizes = _type_sizes()
	customers = frappe.get_all("Customer", filters={"name": ["!=", "JD Stock"]}, pluck="name") or [None]
	salesmen = frappe.get_all("Sales Person", filters={"is_group": 0}, pluck="name") or [None]
	otypes = frappe.get_all("Order Type", filters={"disabled": 0}, pluck="name") or [None]
	if not golds:
		frappe.throw("No karat golds found — run a migrate first.")

	# ---- designs: ONE gold ("only purity") + 0-4 stone lines --------------------------
	dtypes = [t for t in tsizes if t != "MIX(10-16)"] or list(tsizes)
	for i in range(1, designs + 1):
		name = f"DEMO {i:04d}"
		if frappe.db.exists("Design", name):
			man["designs"].append(name)
			continue
		gold = random.choice(golds)
		mats = [{"item": gold.name, "qty": 0, "weight": round(random.uniform(2.0, 16.0), 3),
		         "purity": gold.purity_percentage, "uom": "Gram"}]
		for _ in range(0 if random.random() < 0.15 else random.randint(1, 4)):
			st = random.choice(pool)
			pcs = random.randint(1, 24)
			mats.append({"item": st["item"], "qty": pcs, "weight": round(pcs * random.uniform(0.01, 0.06), 3),
			             "uom": "Carat", "stone_type": st["stone_type"]})
		frappe.get_doc({"doctype": "Design", "design_name": name, "design_type": random.choice(dtypes),
		                "status": "Active", "materials": mats}).insert(ignore_permissions=True)
		man["designs"].append(name)
	frappe.db.commit()
	_save()

	# ---- stock: generous play quantities ---------------------------------------------
	store, sissue = japi._wh("Raw Materials Store"), japi._wh("Stone Issue")
	for g in golds:
		_receipt(g.name, 500, store)
	for n in ("Standard Gold 999", "Standard Gold 995"):
		if frappe.db.exists("Item", n):
			_receipt(n, 250, store)
	for st in pool:
		_receipt(st["item"], 80, sissue)
	frappe.db.commit()
	_save()

	# ---- orders + bags (plan stamps itself from the bag BOM) --------------------------
	dmat = {d: [{"item": m.item, "qty": m.qty, "weight": m.weight}
	            for m in frappe.get_doc("Design", d).materials] for d in man["designs"]}
	dtype = {d: frappe.db.get_value("Design", d, "design_type") for d in man["designs"]}
	bags = []
	for _ in range(orders):
		jo = frappe.get_doc({
			"doctype": "Job Order",
			"order_date": add_days(nowdate(), -random.randint(0, 25)),
			"due_date": add_days(nowdate(), random.randint(7, 30)),
			"customer": random.choice(customers), "salesman": random.choice(salesmen),
			"order_type": random.choice(otypes),
		})
		jo.insert(ignore_permissions=True)
		man["job_orders"].append(jo.name)
		for _b in range(random.randint(1, 4)):
			d = random.choice(man["designs"])
			bag = frappe.get_doc({
				"doctype": "Order Bag", "job_order": jo.name, "design": d,
				"qty": 1 if random.random() < 0.7 else random.randint(2, 3),
				"size": random.choice(tsizes.get(dtype[d], ["NA"])),
				"bag_bom": dmat[d],
				"narration": random.choice(["", "", "", "polish bright", "urgent", "no rhodium", "match pair"]),
			})
			bag.insert(ignore_permissions=True)
			bags.append(bag.name)
	man["bags"] = list(bags)
	frappe.db.commit()
	_save()

	# ---- production: trail + issues + losses ------------------------------------------
	random.shuffle(bags)
	n = len(bags)
	idle, tree_n = int(n * 0.2), min(6, n)
	tree_bags = bags[idle:idle + tree_n]
	floor_bags = bags[idle + tree_n:]
	if tree_bags:
		japi.transfer_order_bags(json.dumps(tree_bags), "TREE MAKING", remarks="demo")
	issued_q1 = []
	for b in floor_bags:
		japi.transfer_order_bags(json.dumps([b]), "CASTING", remarks="demo")
		doc = frappe.db.get_value("Order Bag", b, ["design", "qty"], as_dict=True)
		for m in dmat[doc.design]:
			item, wt = m["item"], flt(m["weight"]) * (doc.qty or 1)
			if wt <= 0:
				continue
			is_stone = bool(frappe.db.get_value("Item", item, "stone_type"))
			japi.weight_add(b, json.dumps([{"item": item, "weight": round(wt, 3)}]),
			                from_warehouse=sissue if is_stone else store)
		if doc.qty == 1:
			issued_q1.append(b)
		# walk part of the bench path for a real transfer trail
		for loc in WORK_PATH[1:random.randint(1, len(WORK_PATH))]:
			japi.transfer_order_bags(json.dumps([b]), loc, remarks="demo")
			if loc in LOSS_BENCHES and random.random() < 0.3:
				gold_item = dmat[doc.design][0]["item"]
				try:
					japi.book_loss(b, gold_item, round(random.uniform(0.02, 0.12), 3), bench=loc)
				except Exception:
					pass  # loss warehouse variations never block the demo
	frappe.db.commit()
	_save()

	# ---- finished products -------------------------------------------------------------
	to_finish = issued_q1[:finished]
	if to_finish:
		japi.make_products(json.dumps(to_finish))

	# ---- CAD bags ----------------------------------------------------------------------
	jo = frappe.get_doc({"doctype": "Job Order", "order_date": nowdate(),
	                     "due_date": add_days(nowdate(), 20), "customer": random.choice(customers)})
	jo.insert(ignore_permissions=True)
	man["job_orders"].append(jo.name)
	for i in range(2):
		bag = frappe.get_doc({
			"doctype": "Order Bag", "job_order": jo.name, "qty": 1, "is_cad": 1,
			"cad_design_type": random.choice(dtypes), "cad_karat": random.choice(golds).name,
			"cad_gold_weight": random.choice(["RANGE 8 to 9", "MINIMUM 6", "12.5"]),
			"cad_diamond_weight": round(random.uniform(0.2, 1.5), 2),
			"cad_stone_no": random.randint(4, 40), "cad_reference": f"DEMO REF {i + 1}",
			"cad_remarks": "demo CAD job",
		})
		bag.insert(ignore_permissions=True)
		man["bags"].append(bag.name)
		japi.transfer_order_bags(json.dumps([bag.name]), "CAD", remarks="demo")
	frappe.db.commit()
	_save()

	# ---- open order requests (incl. one CAD wish) ---------------------------------------
	for i in range(requests):
		lines = [{"design": random.choice(man["designs"]), "qty": random.randint(1, 3),
		          "size": "NA", "remark": "demo request"} for _ in range(random.randint(1, 3))]
		if i == 0:
			lines.append({"cad": {"design_type": random.choice(dtypes), "karat": random.choice(golds).name,
			                      "gold_weight": "RANGE 5 to 6", "diamond_weight": 0.8, "stone_no": 12,
			                      "reference": "DEMO CAD WISH", "image": "", "remarks": "demo"}, "qty": 1})
		man["requests"].append(japi.save_order_request(json.dumps({
			"customer": random.choice(customers), "notes": "demo", "lines": lines})))
		_save()

	# ---- party stock ---------------------------------------------------------------------
	if not frappe.db.exists("Stone Party", "DMO"):
		japi.create_stone_party("DEMO PARTY", "DMO")
		man["party"] = "DMO"
		man["party_items"] = [
			japi.create_party_stone("DMO", "Party Diamond", "VS1"),
			japi.create_party_stone("DMO", "Party Other", "RUBY"),
			japi.create_party_metal("DMO", "22KYG"),
		]

	_save()
	frappe.db.commit()
	out = {"designs": len(man["designs"]), "job_orders": len(man["job_orders"]), "bags": len(man["bags"]),
	       "finished": len(to_finish), "requests": len(man["requests"]), "stock_entries": len(man["stock_entries"])}
	print("Demo loaded:", out)
	return out


def clear_demo():
	if not os.path.exists(_mpath()):
		print("No demo manifest — nothing to clear.")
		return
	with open(_mpath()) as f:
		man = json.load(f)

	# trees the user made from demo bags while playing
	trees = set(frappe.get_all("Wax Tree Card", filters={"order_bag": ["in", man["bags"] or [""]]}, pluck="parent"))
	for t in trees:
		frappe.delete_doc("Wax Tree", t, ignore_permissions=True, force=True)

	for b in man["bags"]:
		frappe.db.delete("Bag Material Ledger", {"order_bag": b})
		frappe.db.delete("Order Bag Transfer", {"order_bag": b})
		frappe.delete_doc("Order Bag", b, ignore_permissions=True, force=True)
	for j in man["job_orders"]:
		frappe.delete_doc("Job Order", j, ignore_permissions=True, force=True)
	for r in man["requests"]:
		if frappe.db.exists("Order Request", r):
			frappe.db.set_value("Order Request", r, "status", "Open")  # unlock the Placed guard
			frappe.delete_doc("Order Request", r, ignore_permissions=True, force=True)
	for it in man.get("party_items") or []:
		frappe.delete_doc("Item", it, ignore_permissions=True, force=True)
	if man.get("party"):
		frappe.delete_doc("Stone Party", man["party"], ignore_permissions=True, force=True)
	for d in man["designs"]:
		frappe.delete_doc("Design", d, ignore_permissions=True, force=True)
	for se in man["stock_entries"]:
		if frappe.db.exists("Stock Entry", se):
			doc = frappe.get_doc("Stock Entry", se)
			if doc.docstatus == 1:
				doc.cancel()
			frappe.delete_doc("Stock Entry", se, ignore_permissions=True, force=True)
	os.remove(_mpath())
	frappe.db.commit()
	print("Demo cleared:", {"bags": len(man["bags"]), "job_orders": len(man["job_orders"]),
	                        "designs": len(man["designs"]), "stock_entries": len(man["stock_entries"]),
	                        "trees": len(trees)})
