# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
"""
Jewelima demo / dummy data — a fully-loaded, *packed* sandbox for debugging & demos.

It seeds a large spread of suppliers, customers, smiths, gold purchases (which also
post to the Metal Ledger), a big Design Bank (each design auto-makes an Item + BOM),
and ~100 Job Orders across every state — Draft, Design phase, In Production (fresh
and mid-flow), and Completed — exercising Material Issue, Material Reservation,
stage-to-stage transfers, the Transfers log, Loss Transfer, Finished Goods and the
Metal Ledger.

Volume is controlled by the N_* constants below — bump them to pack the system harder.

Everything it creates is tagged so it can be wiped again — make_demo() writes a
manifest, and clear_demo() removes exactly what it made (also by tag, so a partial
run still cleans up).

Run it (same on a Mac dev box or an Ubuntu server — only the app needs to be
installed on the site):

    bench --site <your-site> execute jewelima.demo.demo_data.make_demo
    bench --site <your-site> execute jewelima.demo.demo_data.clear_demo

Or, if you only have this file copied onto the server, from the bench folder:

    echo "g={}; exec(open('demo_data.py').read(), g); g['make_demo']()" | bench --site <your-site> console
"""

import json
import os
import random

import frappe

# ---- volume knobs ----------------------------------------------------
N_DESIGNS = 100          # Design Bank entries (each => 1 Item + 1 BOM)
N_JOBS = 100             # Job Orders, spread across all states
N_SUPPLIERS = 12
N_CUSTOMERS = 12
N_EMPLOYEES = 20
N_PURCHASES = 8          # Purchase Receipts of gold (also packs the Metal Ledger)
GOLD_PER_PURCHASE = 3000  # grams per gold type per Purchase Receipt

MARK = "[JEWELIMA-DEMO]"          # stamped on Job Orders / Purchase Receipts
DESIGN_PREFIX = "DEMO-D"          # Design Bank codes (also the Item codes)
PARTY_PREFIX = "DEMO "            # suppliers / customers / employees

# (item_code, karat label) — the gold raw materials seeded by setup.
METALS = [
    ("RM-24-YG", "24K"),
    ("RM-22-YG", "22K"),
    ("RM-18-YG", "18K"),
    ("RM-18-WG", "18K"),
    ("RM-14-YG", "14K"),
]
PURITY = {"24K": 99.9, "22K": 91.6, "18K": 75.0, "14K": 58.5}

# Physical manufacturing stages (have bench warehouses), in route order.
ORDER = [
    "Tree Making", "Casting", "Grinding", "Filing", "Setting",
    "Pre Polish", "Wax Setting", "Final Polish", "Wax Cleaning", "Bag Extraction",
]
START_STAGES = ["Tree Making", "Casting", "Grinding"]  # sensible places to begin
LOSS_STAGES = ["Casting", "Grinding", "Filing", "Setting", "Pre Polish", "Final Polish"]

STAGE_DOCTYPES = ["CAD", "CAM"] + ORDER

# Extra master values created for variety (manifest-tracked, removed on clear).
EXTRA_DESIGN_TYPES = ["Earrings", "Bangle", "Necklace", "Bracelet", "Nose Pin"]
EXTRA_DESIGN_STYLES = ["Antique", "Modern", "Filigree", "Temple", "Minimal"]

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
        json.dump(_MAN, f)


def _load_manifest():
    p = _manifest_path()
    return json.load(open(p)) if os.path.exists(p) else []


def _checkpoint():
    """Persist progress so a long run is durable and resumable-to-clear."""
    _save_manifest()
    frappe.db.commit()


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
    """Populate the site with a large set of dummy data. Idempotent guard: refuses
    to run while a previous demo is still present — clear_demo() first."""
    global _MAN
    _MAN = []
    random.seed(42)
    company, abbr = _company_abbr()
    _require_setup(abbr)

    if _load_manifest():
        print("Demo data already present (manifest exists). Run clear_demo first.")
        return

    print("Seeding parties, employees, masters ...")
    _make_parties()
    employees = _make_employees(company)
    _make_extra_masters()
    _checkpoint()

    print(f"Buying gold across {N_PURCHASES} Purchase Receipts ...")
    _buy_gold(company, abbr)
    _checkpoint()

    print(f"Building {N_DESIGNS} designs (Design Bank -> Item + BOM) ...")
    designs = _make_designs()
    _checkpoint()

    print(f"Building {N_JOBS} Job Orders across all states ...")
    counts = _make_job_orders(designs)
    _checkpoint()

    print("Transferring accumulated bench loss to -LOSS warehouses ...")
    for stage in LOSS_STAGES:
        _transfer_loss(stage)

    _save_manifest()
    frappe.db.commit()

    print("\n==== Jewelima demo data created (PACKED) ====")
    print(f"  Suppliers / Customers : {len(frappe.get_all('Supplier', {'supplier_name': ['like', PARTY_PREFIX + '%']}))}"
          f" / {len(frappe.get_all('Customer', {'customer_name': ['like', PARTY_PREFIX + '%']}))}")
    print(f"  Employees (smiths)    : {len(employees)}")
    print(f"  Designs (+Item +BOM)  : {len(designs)}")
    print(f"  Purchase Receipts     : {len(frappe.get_all('Purchase Receipt', {'remarks': ['like', '%' + MARK + '%']}))}")
    print(f"  Metal Ledger Entries  : {frappe.db.count('Metal Ledger Entry')}")
    print(f"  Job Orders            : {sum(counts.values())}  -> {counts}")
    print(f"  Material Issues       : {frappe.db.count('Material Issue')}")
    print(f"  Loss Transfers        : {frappe.db.count('Loss Transfer')}")
    print(f"  Manifest              : {_manifest_path()}")
    print("  Wipe it all with:  bench --site <site> execute jewelima.demo.demo_data.clear_demo")


def _make_parties():
    sg = _leaf("Supplier Group", "All Supplier Groups")
    cg = _leaf("Customer Group", "All Customer Groups")
    terr = _leaf("Territory", "All Territories")
    for i in range(1, N_SUPPLIERS + 1):
        s = f"DEMO Supplier {i:02d}"
        if not frappe.db.exists("Supplier", s):
            _track(frappe.get_doc(
                {"doctype": "Supplier", "supplier_name": s, "supplier_group": sg}
            ).insert(ignore_permissions=True))
    for i in range(1, N_CUSTOMERS + 1):
        c = f"DEMO Customer {i:02d}"
        if not frappe.db.exists("Customer", c):
            _track(frappe.get_doc(
                {"doctype": "Customer", "customer_name": c, "customer_group": cg, "territory": terr}
            ).insert(ignore_permissions=True))


def _make_employees(company):
    out = []
    for i in range(1, N_EMPLOYEES + 1):
        nm = f"DEMO Smith {i:02d}"
        existing = frappe.db.get_value("Employee", {"employee_name": nm}, "name")
        if existing:
            out.append(existing)
            continue
        try:
            e = frappe.get_doc(
                {"doctype": "Employee", "first_name": nm, "company": company,
                 "gender": "Male" if i % 2 else "Female",
                 "date_of_birth": "1990-01-01", "date_of_joining": "2022-01-01", "status": "Active"}
            ).insert(ignore_permissions=True)
            out.append(_track(e).name)
        except Exception as e:
            print("  (skipped employee", nm, "->", e, ")")
    return out


def _make_extra_masters():
    for t in EXTRA_DESIGN_TYPES:
        if not frappe.db.exists("Design Type", t):
            _track(frappe.get_doc({"doctype": "Design Type", "design_type_name": t}).insert(ignore_permissions=True))
    for s in EXTRA_DESIGN_STYLES:
        if not frappe.db.exists("Design Style", s):
            _track(frappe.get_doc({"doctype": "Design Style", "design_style_name": s}).insert(ignore_permissions=True))


def _buy_gold(company, abbr):
    store = _wh("Raw Materials Store", abbr)
    suppliers = frappe.get_all("Supplier", filters={"supplier_name": ["like", PARTY_PREFIX + "%"]}, pluck="name")
    rates = {"RM-24-YG": 8000, "RM-22-YG": 6000, "RM-18-YG": 5000, "RM-18-WG": 5200, "RM-14-YG": 4200}
    for p in range(N_PURCHASES):
        items = [{"item_code": i, "qty": GOLD_PER_PURCHASE, "rate": rates.get(i, 6000), "warehouse": store}
                 for i, _ in METALS if frappe.db.exists("Item", i)]
        supplier = suppliers[p % len(suppliers)] if suppliers else None
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
                 "items": [{"item_code": i, "qty": GOLD_PER_PURCHASE, "t_warehouse": store,
                            "basic_rate": rates.get(i, 6000)} for i, _ in METALS if frappe.db.exists("Item", i)]}
            )
            se.insert(ignore_permissions=True)
            se.submit()
            _track(se)


def _make_designs():
    types = ["Rings", "Pendant"] + EXTRA_DESIGN_TYPES
    styles = ["Tickly", "General"] + EXTRA_DESIGN_STYLES
    out = []
    for i in range(1, N_DESIGNS + 1):
        code = f"{DESIGN_PREFIX}{i:04d}"
        out.append(code)
        if frappe.db.exists("Design Bank", code):
            continue
        metal, karat = METALS[i % len(METALS)]
        typ = types[i % len(types)]
        sty = styles[i % len(styles)]
        weight = round(random.uniform(2.5, 25.0), 2)
        mats = [{"item": metal, "qty": weight}]
        # ~1 in 4 designs use a second gold component (richer BOM)
        if i % 4 == 0:
            alt = METALS[(i + 2) % len(METALS)][0]
            if alt != metal:
                mats.append({"item": alt, "qty": round(weight * 0.2, 2)})
        _track(frappe.get_doc(
            {"doctype": "Design Bank", "design_code": code, "design_name": f"{typ} {karat} #{i:04d}",
             "design_type": typ, "design_style": sty, "materials": mats}
        ).insert(ignore_permissions=True))
        if i % 25 == 0:
            _checkpoint()
            print(f"   ... {i} designs")
    return out


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


def _complete_card(job_order, stage, design=None, next_stage="", loss_per_item=0.0, stones=False):
    name = frappe.db.get_value(stage, {"job_order": job_order}, "name")
    card = frappe.get_doc(stage, name)
    total_in = 0
    for m in card.materials or []:
        m.out_qty = max((m.in_qty or 0) - loss_per_item, 0)
        total_in += (m.in_qty or 0)
    if card.meta.has_field("gross_weight"):
        if stones:
            card.dmd_no = random.randint(1, 12)
            card.dmd_weight_ct = round(random.uniform(0.1, 2.5), 3)
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


def _route(start_stage, length):
    """An ordered, forward, distinct list of physical stages starting at start_stage."""
    idx = ORDER.index(start_stage)
    return ORDER[idx: idx + length]


def _make_job_orders(designs):
    counts = {"Draft": 0, "Design": 0, "In Production (fresh)": 0, "In Production (mid)": 0, "Completed": 0}
    for i in range(1, N_JOBS + 1):
        design = random.choice(designs)
        bucket = i % 5
        try:
            if bucket == 0:
                # Draft — created, not started.
                _jo(design=design, first_stage=random.choice(START_STAGES))
                counts["Draft"] += 1
            elif bucket == 1:
                # Design phase — CAD start; ~half get a design linked (still waiting).
                jo = _jo(design=None, first_stage="CAD")
                jo.start_processing()
                if i % 2 == 0:
                    jo.reload()
                    jo.design = design
                    jo.save(ignore_permissions=True)
                counts["Design"] += 1
            elif bucket == 2:
                # In Production (fresh) — started, gold issued, sitting at first stage.
                jo = _jo(design=design, first_stage=random.choice(START_STAGES))
                jo.start_processing()
                _issue_gold(jo.name)
                counts["In Production (fresh)"] += 1
            elif bucket == 3:
                # In Production (mid) — first stage done -> routed forward, with loss.
                start = random.choice(START_STAGES)
                jo = _jo(design=design, first_stage=start)
                jo.start_processing()
                _issue_gold(jo.name)
                route = _route(start, 3)
                if len(route) >= 2:
                    _complete_card(jo.name, route[0], design, next_stage=route[1],
                                   loss_per_item=round(random.uniform(0.05, 0.2), 3))
                counts["In Production (mid)"] += 1
            else:
                # Completed — full chain to Finished Goods. ~1/3 go through CAD first.
                via_cad = (i % 3 == 0)
                start = random.choice(START_STAGES)
                route = _route(start, random.randint(2, 4))
                if via_cad:
                    jo = _jo(design=None, first_stage="CAD")
                    jo.start_processing()
                    jo.reload()
                    jo.design = design
                    jo.save(ignore_permissions=True)
                    _complete_card(jo.name, "CAD", design, next_stage=route[0])  # creates the Work Order
                else:
                    jo = _jo(design=design, first_stage=start)
                    jo.start_processing()
                _issue_gold(jo.name)
                for k, st in enumerate(route):
                    nxt = route[k + 1] if k + 1 < len(route) else ""
                    _complete_card(jo.name, st, design, next_stage=nxt,
                                   loss_per_item=round(random.uniform(0.04, 0.15), 3),
                                   stones=(k == len(route) - 1 and i % 2 == 0))
                counts["Completed"] += 1
        except Exception as e:
            print(f"  (job #{i} [{bucket}] failed -> {e})")
        if i % 10 == 0:
            _checkpoint()
            print(f"   ... {i} job orders")
    return counts


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
    for st in STAGE_DOCTYPES:
        for name in frappe.get_all(st, filters={"job_order": jo}, pluck="name"):
            se = frappe.db.get_value(st, name, "transfer_stock_entry")
            if se:
                _cancel("Stock Entry", se)
                _del("Stock Entry", se)
            _del(st, name)
    for r in frappe.get_all("Material Reservation", filters={"job_order": jo}, pluck="name"):
        _del("Material Reservation", r)
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
    # 7) catch-all: any remaining manifest docs (e.g. extra Design Type/Style masters)
    for dt, n in man:
        if frappe.db.exists(dt, n):
            _cancel(dt, n)
            removed += _del(dt, n)

    p = _manifest_path()
    if os.path.exists(p):
        os.remove(p)
    return removed
