# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
"""
Jewelima demo / dummy data — a fully-loaded sandbox for debugging & demos.

It seeds suppliers, customers, smiths, gold stock, a Design Bank (which auto-makes
Items + BOMs) and a spread of Job Orders in every state (Draft, Design phase,
In Production, Completed), exercising Material Issue, Material Reservation,
stage-to-stage transfers, the Transfers log, Loss Transfer and the Metal Ledger.

Everything it creates is tagged so it can be wiped again — make_demo() writes a
manifest, and clear_demo() removes exactly what it made.

Run it (works the same on a Mac dev box or an Ubuntu server — only the app needs
to be installed on the site):

    bench --site <your-site> execute jewelima.demo.demo_data.make_demo
    bench --site <your-site> execute jewelima.demo.demo_data.clear_demo

Or, if you only have this file copied onto the server, from the bench folder:

    echo "g={}; exec(open('demo_data.py').read(), g); g['make_demo']()" | bench --site <your-site> console
"""

import json
import os

import frappe

MARK = "[JEWELIMA-DEMO]"          # stamped on Job Orders / Purchase Receipts
DESIGN_PREFIX = "DEMO-"           # Design Bank codes (also the Item codes)
PARTY_PREFIX = "DEMO "            # suppliers / customers / employees

# Gold to stock up: (item_code, qty grams, rate per gram)
GOLDS = [
    ("RM-24-YG", 100, 8000),
    ("RM-22-YG", 500, 6000),
    ("RM-18-YG", 300, 5000),
    ("RM-18-WG", 200, 5200),
    ("RM-14-YG", 200, 4200),
]

PURITY = {"24K": 99.9, "22K": 91.6, "18K": 75.0, "14K": 58.5}

# Designs to build: (code, name, type, style, [(rm_item, grams)])
DESIGNS = [
    ("DEMO-RING-22K", "Solitaire Ring 22K", "Rings", "General", [("RM-22-YG", 8)]),
    ("DEMO-RING-18K", "Band Ring 18K", "Rings", "Tickly", [("RM-18-YG", 6)]),
    ("DEMO-PEND-22K", "Heart Pendant 22K", "Pendant", "General", [("RM-22-YG", 12)]),
    ("DEMO-PEND-18W", "Halo Pendant 18K White", "Pendant", "Tickly", [("RM-18-WG", 10)]),
    ("DEMO-RING-24K", "Plain Ring 24K", "Rings", "General", [("RM-24-YG", 9)]),
]

STAGE_DOCTYPES = [
    "CAD", "CAM", "Tree Making", "Casting", "Grinding", "Filing",
    "Setting", "Pre Polish", "Wax Setting", "Final Polish", "Wax Cleaning", "Bag Extraction",
]

_MAN = []  # manifest of [doctype, name] created in this run


# ----------------------------------------------------------------------
# small helpers
# ----------------------------------------------------------------------
def _manifest_path():
    return frappe.get_site_path("jewelima_demo_manifest.json")


def _track(doc):
    _MAN.append([doc.doctype, doc.name])
    return doc


def _save_manifest():
    with open(_manifest_path(), "w") as f:
        json.dump(_MAN, f, indent=1)


def _load_manifest():
    p = _manifest_path()
    return json.load(open(p)) if os.path.exists(p) else []


def _company_abbr():
    company = frappe.defaults.get_defaults().get("company") or frappe.db.get_single_value(
        "Global Defaults", "default_company"
    )
    if not company:
        frappe.throw("No Company found — run the Jewelima setup wizard first.")
    return company, frappe.db.get_value("Company", company, "abbr")


def _wh(name, abbr):
    return f"{name} - {abbr}"


def _leaf(doctype, fallback=None):
    return frappe.db.get_value(doctype, {"is_group": 0}, "name") or fallback


def _require_setup(abbr):
    if not frappe.db.exists("Item", "RM-22-YG"):
        frappe.throw("Raw-material gold items missing — run `bench migrate` (Jewelima setup) first.")
    if not frappe.db.exists("Warehouse", _wh("Raw Materials Store", abbr)):
        frappe.throw("Raw Materials Store warehouse missing — run the Jewelima setup first.")


def _any_employee():
    return frappe.db.get_value("Employee", {"employee_name": ["like", PARTY_PREFIX + "%"]}, "name")


def _purity_for_design(code):
    row = frappe.get_all("Design Bank Item", filters={"parent": code}, fields=["item"], limit=1)
    if row:
        return PURITY.get(frappe.db.get_value("Item", row[0].item, "metal_purity"), 91.6)
    return 91.6


# ----------------------------------------------------------------------
# build
# ----------------------------------------------------------------------
def make_demo():
    """Populate the site with a full set of dummy data. Idempotent guard: refuses
    to run twice — clear_demo() first if a previous demo is still present."""
    global _MAN
    _MAN = []
    company, abbr = _company_abbr()
    _require_setup(abbr)

    if _load_manifest():
        print("Demo data already present (manifest exists). Run clear_demo first.")
        return

    _make_parties()
    _make_employees(company)
    _buy_gold(company, abbr)
    _make_designs()
    summary = _make_job_orders()

    _save_manifest()
    frappe.db.commit()

    print("\n==== Jewelima demo data created ====")
    print(f"  Suppliers/Customers : 2 / 2")
    print(f"  Employees (smiths)  : {len(frappe.get_all('Employee', {'employee_name': ['like', PARTY_PREFIX + '%']}))}")
    print(f"  Designs (Design Bank, +Item +BOM): {len(DESIGNS)}")
    print(f"  Job Orders          : {summary}")
    print(f"  Gold stocked into Raw Materials Store via Purchase Receipt / Stock Entry")
    print(f"  Manifest            : {_manifest_path()}")
    print("  Wipe it all with:  bench --site <site> execute jewelima.demo.demo_data.clear_demo")


def _make_parties():
    sg = _leaf("Supplier Group", "All Supplier Groups")
    cg = _leaf("Customer Group", "All Customer Groups")
    terr = _leaf("Territory", "All Territories")
    for s in ["DEMO Gold House", "DEMO Bullion Traders"]:
        if not frappe.db.exists("Supplier", s):
            _track(frappe.get_doc(
                {"doctype": "Supplier", "supplier_name": s, "supplier_group": sg}
            ).insert(ignore_permissions=True))
    for c in ["DEMO Retail Co", "DEMO Wholesale Jewels"]:
        if not frappe.db.exists("Customer", c):
            _track(frappe.get_doc(
                {"doctype": "Customer", "customer_name": c, "customer_group": cg, "territory": terr}
            ).insert(ignore_permissions=True))


def _make_employees(company):
    for nm in ["DEMO Karigar Ravi", "DEMO Karigar Suresh", "DEMO Setter Anil"]:
        if frappe.db.exists("Employee", {"employee_name": nm}):
            continue
        try:
            _track(frappe.get_doc(
                {"doctype": "Employee", "first_name": nm, "company": company, "gender": "Male",
                 "date_of_birth": "1990-01-01", "date_of_joining": "2022-01-01", "status": "Active"}
            ).insert(ignore_permissions=True))
        except Exception as e:
            print("  (skipped employee", nm, "->", e, ")")


def _buy_gold(company, abbr):
    store = _wh("Raw Materials Store", abbr)
    items = [{"item_code": i, "qty": q, "rate": r, "warehouse": store}
             for i, q, r in GOLDS if frappe.db.exists("Item", i)]
    supplier = frappe.db.get_value("Supplier", {"supplier_name": "DEMO Gold House"}, "name")
    try:
        pr = frappe.get_doc(
            {"doctype": "Purchase Receipt", "supplier": supplier, "company": company,
             "remarks": MARK, "items": items}
        )
        pr.insert(ignore_permissions=True)
        pr.submit()
        _track(pr)
    except Exception as e:
        print("  (Purchase Receipt failed -> seeding stock via Stock Entry instead:", e, ")")
        se = frappe.get_doc(
            {"doctype": "Stock Entry", "stock_entry_type": "Material Receipt", "company": company,
             "to_warehouse": store,
             "items": [{"item_code": i, "qty": q, "t_warehouse": store, "basic_rate": r}
                       for i, q, r in GOLDS if frappe.db.exists("Item", i)]}
        )
        se.insert(ignore_permissions=True)
        se.submit()
        _track(se)


def _make_designs():
    for code, nm, typ, sty, mats in DESIGNS:
        if frappe.db.exists("Design Bank", code):
            continue
        _track(frappe.get_doc(
            {"doctype": "Design Bank", "design_code": code, "design_name": nm,
             "design_type": typ, "design_style": sty,
             "materials": [{"item": i, "qty": q} for i, q in mats]}
        ).insert(ignore_permissions=True))


# ---- Job Order flow helpers ------------------------------------------
def _jo(design=None, first_stage="Casting", qty=1):
    doc = frappe.get_doc(
        {"doctype": "Job Order", "design": design, "first_stage": first_stage,
         "qty": qty, "remarks": MARK}
    )
    doc.insert(ignore_permissions=True)
    return _track(doc)


def _issue_gold(job_order):
    from jewelima.jewelima.doctype.material_issue.material_issue import get_issue_context

    ctx = get_issue_context(job_order, "Gold")
    if not ctx.get("current_stage_record") or not ctx.get("items"):
        return None
    mi = frappe.get_doc(
        {"doctype": "Material Issue", "issue_type": "Gold", "job_order": job_order,
         "items": [{"item": i["item"], "qty": i["qty"]} for i in ctx["items"]]}
    )
    mi.insert(ignore_permissions=True)
    mi.submit()
    return _track(mi).name


def _complete_card(job_order, stage, design=None, next_stage="", loss_per_item=0.0):
    name = frappe.db.get_value(stage, {"job_order": job_order}, "name")
    card = frappe.get_doc(stage, name)
    total_in = 0
    for m in card.materials or []:
        m.out_qty = max((m.in_qty or 0) - loss_per_item, 0)
        total_in += (m.in_qty or 0)
    if card.meta.has_field("gross_weight"):
        card.gross_weight = round(total_in, 3)
        card.purity = _purity_for_design(design) if design else 91.6
    emp = _any_employee()
    if emp and card.meta.has_field("employee"):
        card.employee = emp
    card.next_stage = next_stage
    card.status = "Completed"
    card.save(ignore_permissions=True)
    return name


def _transfer_loss(stage):
    from jewelima.jewelima.doctype.loss_transfer.loss_transfer import get_loss_context

    ctx = get_loss_context(stage)
    items = [i for i in ctx["items"] if (i.get("qty") or 0) > 0]
    if not items:
        return None
    lt = frappe.get_doc(
        {"doctype": "Loss Transfer", "stage": stage,
         "items": [{"item": i["item"], "transfer_qty": i["qty"]} for i in items]}
    )
    lt.insert(ignore_permissions=True)
    lt.submit()
    return _track(lt).name


def _make_job_orders():
    # A) Draft — created, not started.
    _jo(design="DEMO-RING-22K", first_stage="Casting")

    # B) Design phase — CAD start, design linked, CAD card waiting (WO not made yet).
    b = _jo(design=None, first_stage="CAD")
    b.start_processing()
    b.reload()
    b.design = "DEMO-PEND-22K"
    b.save(ignore_permissions=True)

    # C) In Production (fresh) — started, gold issued, sitting at Casting.
    c = _jo(design="DEMO-PEND-22K", first_stage="Casting")
    c.start_processing()
    _issue_gold(c.name)

    # D) In Production (mid-flow) — Casting done -> routed to Filing, with loss.
    d = _jo(design="DEMO-RING-18K", first_stage="Casting")
    d.start_processing()
    _issue_gold(d.name)
    _complete_card(d.name, "Casting", "DEMO-RING-18K", next_stage="Filing", loss_per_item=0.12)

    # E) Completed — Casting -> Filing -> done (Finished Goods), loss at each.
    e = _jo(design="DEMO-PEND-18W", first_stage="Casting")
    e.start_processing()
    _issue_gold(e.name)
    _complete_card(e.name, "Casting", "DEMO-PEND-18W", next_stage="Filing", loss_per_item=0.10)
    _complete_card(e.name, "Filing", "DEMO-PEND-18W", next_stage="", loss_per_item=0.08)

    # F) Completed via CAD — CAD -> Casting -> Filing -> done.
    f = _jo(design=None, first_stage="CAD")
    f.start_processing()
    f.reload()
    f.design = "DEMO-RING-22K"
    f.save(ignore_permissions=True)
    _complete_card(f.name, "CAD", "DEMO-RING-22K", next_stage="Casting")  # creates the Work Order
    _issue_gold(f.name)
    _complete_card(f.name, "Casting", "DEMO-RING-22K", next_stage="Filing", loss_per_item=0.10)
    _complete_card(f.name, "Filing", "DEMO-RING-22K", next_stage="", loss_per_item=0.07)

    # Move the loss sitting at the shared benches into their -LOSS warehouses.
    _transfer_loss("Casting")
    _transfer_loss("Filing")

    return "1 Draft, 1 Design, 1 In-Production, 1 In-Production(mid), 2 Completed"


# ----------------------------------------------------------------------
# teardown
# ----------------------------------------------------------------------
def clear_demo():
    """Remove everything make_demo() created. Safe to run repeatedly."""
    prev = frappe.db.get_single_value("Stock Settings", "allow_negative_stock")
    frappe.db.set_single_value("Stock Settings", "allow_negative_stock", 1)
    try:
        n = _clear()
    finally:
        frappe.db.set_single_value("Stock Settings", "allow_negative_stock", prev or 0)
    frappe.db.commit()
    print(f"\n==== Jewelima demo data cleared ({n} top-level records removed) ====")


def _cancel(dt, name):
    try:
        if frappe.db.exists(dt, name) and frappe.db.get_value(dt, name, "docstatus") == 1:
            frappe.get_doc(dt, name).cancel()
    except Exception as e:
        print("  (cancel failed", dt, name, "->", e, ")")


def _del(dt, name):
    try:
        if frappe.db.exists(dt, name):
            frappe.delete_doc(dt, name, force=1, ignore_permissions=True)
            return 1
    except Exception as e:
        print("  (delete failed", dt, name, "->", e, ")")
    return 0


def _teardown_job_order(jo):
    # stage cards + their output Stock Entries
    for st in STAGE_DOCTYPES:
        for name in frappe.get_all(st, filters={"job_order": jo}, pluck="name"):
            se = frappe.db.get_value(st, name, "transfer_stock_entry")
            if se:
                _cancel("Stock Entry", se)
                _del("Stock Entry", se)
            _del(st, name)
    # informational reservation
    for r in frappe.get_all("Material Reservation", filters={"job_order": jo}, pluck="name"):
        _del("Material Reservation", r)
    # the behind-the-scenes Work Order
    wo = frappe.db.get_value("Job Order", jo, "work_order")
    if wo:
        _cancel("Work Order", wo)
        _del("Work Order", wo)


def _delete_design(code):
    for b in frappe.get_all("BOM", filters={"item": code}, pluck="name"):
        _cancel("BOM", b)
        _del("BOM", b)
    _del("Design Bank", code)
    _del("Item", code)


def _clear():
    man = _load_manifest()
    removed = 0

    jos = set(frappe.get_all("Job Order", filters={"remarks": ["like", "%" + MARK + "%"]}, pluck="name"))
    jos |= {n for dt, n in man if dt == "Job Order"}

    mis = {n for dt, n in man if dt == "Material Issue"}
    for jo in jos:
        mis |= set(frappe.get_all("Material Issue", filters={"job_order": jo}, pluck="name"))
    lts = {n for dt, n in man if dt == "Loss Transfer"}

    # 1) cancel issues + loss transfers (cascades their stock entries)
    for n in mis:
        _cancel("Material Issue", n)
    for n in lts:
        _cancel("Loss Transfer", n)
    # 2) tear down each Job Order's children (stage cards, output SEs, reservation, WO)
    for jo in jos:
        _teardown_job_order(jo)
    # 3) delete issues, loss transfers, then the Job Orders
    for n in mis:
        removed += _del("Material Issue", n)
    for n in lts:
        removed += _del("Loss Transfer", n)
    for jo in jos:
        removed += _del("Job Order", jo)
    # 4) designs (+ their Item & BOM)
    designs = set(frappe.get_all("Design Bank", filters={"design_code": ["like", DESIGN_PREFIX + "%"]}, pluck="name"))
    designs |= {n for dt, n in man if dt == "Design Bank"}
    for d in designs:
        _delete_design(d)
        removed += 1
    # 5) gold sources: Purchase Receipts + any seeding Stock Entries
    prs = set(frappe.get_all("Purchase Receipt", filters={"remarks": ["like", "%" + MARK + "%"]}, pluck="name"))
    prs |= {n for dt, n in man if dt == "Purchase Receipt"}
    for n in prs:
        _cancel("Purchase Receipt", n)
        removed += _del("Purchase Receipt", n)
    for dt, n in man:
        if dt == "Stock Entry":
            _cancel("Stock Entry", n)
            removed += _del("Stock Entry", n)
    # 6) parties
    for dt, field in [("Supplier", "supplier_name"), ("Customer", "customer_name"), ("Employee", "employee_name")]:
        for n in frappe.get_all(dt, filters={field: ["like", PARTY_PREFIX + "%"]}, pluck="name"):
            removed += _del(dt, n)

    p = _manifest_path()
    if os.path.exists(p):
        os.remove(p)
    return removed
