"""Load-test cards: N per bench, one design, some carrying weights.

Every row is stamped LOADTEST_MARK so the whole lot can be removed again in one
call. Nothing here touches stock: a card and its bench record are created, and
the weights are written to the card's own actual-weight fields — no Bag Material
Ledger rows, no Stock Entries, so gold accounting is untouched by the test.
"""
import frappe, time
from frappe.utils import flt

LOADTEST_MARK = "LOADTEST"
SERIES_KEY = "OB-"          # the counter the cards take their names from


def _series():
    r = frappe.db.sql("SELECT current FROM tabSeries WHERE name=%s", SERIES_KEY)
    return int(r[0][0]) if r else 0


def _set_series(v):
    frappe.db.sql("""INSERT INTO tabSeries (name, current) VALUES (%s, %s)
        ON DUPLICATE KEY UPDATE current = %s""", (SERIES_KEY, v, v))
    frappe.db.commit()


def _benches():
    from jewelima.jewelima.benches import BENCH_DOCTYPE
    return list(BENCH_DOCTYPE.keys())


def seed(per_bench=1000, with_weight=500, design=None, dry_run=1):
    frappe.set_user("Administrator")
    from jewelima.jewelima.benches import on_bag_arrival
    benches = _benches()
    total = per_bench * len(benches)
    design = design or (frappe.get_all("Design", pluck="name", limit=1) or [None])[0]
    dt = (frappe.get_all("Design Type", pluck="name", limit=1) or [None])[0]
    print("benches      :", len(benches))
    print("per bench    :", per_bench)
    print("TOTAL cards  :", total)
    print("with weights :", with_weight)
    print("design       :", design, "| design type:", dt)
    print("marker       :", LOADTEST_MARK)
    if int(dry_run):
        print("\nDRY RUN — nothing written.")
        return {"would_create": total}

    # the counter is the one thing deleting rows cannot put back — remember where
    # it stood so the real cards carry on from their own numbers afterwards
    mark = _series()
    frappe.db.set_global("loadtest_series_mark", str(mark))
    print("series before:", SERIES_KEY + str(mark).zfill(5))
    t0 = time.time()
    made = 0
    for b in benches:
        for i in range(per_bench):
            d = frappe.new_doc("Order Bag")
            d.qty = 1
            d.location = b
            d.narration = LOADTEST_MARK
            d.stock_status = "In Production"
            d.is_finished = 0
            d.design = design
            d.design_type = dt
            if made < with_weight:                 # the first N carry weights
                d.act_gross_weight = round(2.0 + (made % 50) * 0.137, 3)
                d.act_nett_weight = round(flt(d.act_gross_weight) * 0.92, 3)
            d.flags.ignore_mandatory = True
            d.flags.ignore_links = True
            d.flags.ignore_permissions = True
            d.insert(ignore_permissions=True)
            on_bag_arrival(d.name, b)
            made += 1
            if made % 500 == 0:
                frappe.db.commit()
                print("  %6d / %d  (%.0fs)" % (made, total, time.time() - t0))
    frappe.db.commit()
    el = time.time() - t0
    print("\ncreated %d cards in %.0fs (%.0f/s)" % (made, el, made / max(el, 1)))
    return {"created": made, "seconds": round(el, 1)}


def audit():
    """What the marker currently accounts for."""
    frappe.set_user("Administrator")
    n = frappe.db.count("Order Bag", {"narration": LOADTEST_MARK})
    rows = frappe.db.sql("""SELECT location, COUNT(*) n FROM `tabOrder Bag`
        WHERE narration=%s GROUP BY location ORDER BY location""", LOADTEST_MARK, as_dict=True)
    wt = frappe.db.count("Order Bag", {"narration": LOADTEST_MARK, "act_gross_weight": [">", 0]})
    real = frappe.db.count("Order Bag", {"narration": ["!=", LOADTEST_MARK]})
    print("loadtest cards :", n, "| with weight:", wt)
    print("real cards     :", real, "  <-- must never change")
    for r in rows:
        print("   %-16s %d" % (r.location, r.n))
    return {"loadtest": n, "with_weight": wt, "real": real}


def purge(confirm=""):
    """Remove every loadtest row. Real cards are matched by NOT having the marker,
    so nothing outside the test can be caught by this."""
    frappe.set_user("Administrator")
    if confirm != "PURGE":
        print('refusing: call with confirm="PURGE"')
        return {"deleted": 0}
    from jewelima.jewelima.benches import BENCH_DOCTYPE
    t0 = time.time()
    bags = frappe.get_all("Order Bag", filters={"narration": LOADTEST_MARK}, pluck="name")
    print("removing", len(bags), "cards…")
    for i in range(0, len(bags), 500):
        chunk = bags[i:i + 500]
        for dtn in set(BENCH_DOCTYPE.values()):
            if frappe.db.exists("DocType", dtn):
                frappe.db.sql("DELETE FROM `tab{0}` WHERE order_bag IN %(c)s".format(dtn), {"c": chunk})
        frappe.db.sql("DELETE FROM `tabOrder Bag Transfer` WHERE order_bag IN %(c)s", {"c": chunk})
        frappe.db.sql("DELETE FROM `tabOrder Bag` WHERE name IN %(c)s", {"c": chunk})
        frappe.db.commit()
        print("  %6d / %d" % (min(i + 500, len(bags)), len(bags)))
    # the test job orders go too — they are the ones whose cards were OB- named,
    # and every one of those cards is in the list above
    jos = frappe.db.sql("""SELECT DISTINCT job_order FROM `tabOrder Bag`
        WHERE narration=%s AND IFNULL(job_order,'') != ''""", LOADTEST_MARK, pluck=True)
    if jos:
        for i in range(0, len(jos), 500):
            frappe.db.sql("DELETE FROM `tabJob Order` WHERE name IN %(c)s", {"c": jos[i:i + 500]})
        frappe.db.commit()
        print("removed", len(jos), "job orders")
    jmark = frappe.db.get_global("loadtest_jo_series_mark")
    if jmark is not None and str(jmark).isdigit():
        _set_jo_series(int(jmark))
        print("E series -> E%04d" % int(jmark))

    # wind the counter back to where it stood, so the next real card takes the
    # number it would have had if the test never ran
    mark = frappe.db.get_global("loadtest_series_mark")
    if mark is not None and str(mark).isdigit():
        was = _series()
        _set_series(int(mark))
        print("series %s -> %s" % (SERIES_KEY + str(was).zfill(5), SERIES_KEY + str(int(mark)).zfill(5)))
    print("done in %.0fs" % (time.time() - t0))
    return {"deleted": len(bags)}


# ---------------------------------------------------------------------------
# Bulk path. The ORM writes ~100 cards/s and a Version row per document, which
# at 150,000 cards is half an hour and 300,000 rows of history nobody will read.
# This builds one card the ORM way as a TEMPLATE, then copies its exact column
# values for the rest — so a bulk row is indistinguishable from an ORM row
# (verify_shape proves that), just without the per-document overhead.
# ---------------------------------------------------------------------------
def _template_row(design, dt, bench):
    d = frappe.new_doc("Order Bag")
    d.qty, d.location, d.narration = 1, bench, LOADTEST_MARK
    d.stock_status, d.is_finished = "In Production", 0
    d.design, d.design_type = design, dt
    d.flags.ignore_mandatory = True
    d.flags.ignore_links = True
    d.insert(ignore_permissions=True)
    frappe.db.commit()
    return d.name


def seed_fast(per_bench=10000, with_weight=5000, design=None, dry_run=1):
    frappe.set_user("Administrator")
    from jewelima.jewelima.benches import BENCH_DOCTYPE
    benches = list(BENCH_DOCTYPE.keys())
    total = per_bench * len(benches)
    design = design or (frappe.get_all("Design", pluck="name", limit=1) or [None])[0]
    dt = (frappe.get_all("Design Type", pluck="name", limit=1) or [None])[0]
    print("benches      :", len(benches))
    print("per bench    :", per_bench)
    print("TOTAL cards  :", total)
    print("with weights :", with_weight)
    print("design       :", design)
    if int(dry_run):
        print("\nDRY RUN — nothing written.")
        return {"would_create": total}

    mark = _series()
    frappe.db.set_global("loadtest_series_mark", str(mark))
    print("series before:", SERIES_KEY + str(mark).zfill(5))

    tmpl_name = _template_row(design, dt, benches[0])
    tmpl = frappe.db.sql("SELECT * FROM `tabOrder Bag` WHERE name=%s", tmpl_name, as_dict=True)[0]
    cols = [c for c in tmpl.keys()]
    now = frappe.utils.now()

    t0 = time.time()
    made = 1                      # the template is card one
    seq = mark + 1
    for b in benches:
        want = per_bench - (1 if b == benches[0] else 0)
        batch, rows = 2000, []
        for i in range(want):
            seq += 1
            r = dict(tmpl)
            r["name"] = "%s%05d" % (SERIES_KEY, seq)
            r["location"] = b
            r["creation"] = now
            r["modified"] = now
            r["act_gross_weight"] = 0
            r["act_nett_weight"] = 0
            rows.append([r[c] for c in cols])
            made += 1
            if len(rows) >= batch:
                _flush(cols, rows); rows = []
                print("  %7d / %d  (%.0fs)" % (made, total, time.time() - t0))
        if rows:
            _flush(cols, rows)
    _set_series(seq)
    frappe.db.commit()
    # exactly N carry weights — counting them out row by row during the insert
    # left the template card uncounted and the total one short
    frappe.db.sql("""UPDATE `tabOrder Bag`
        SET act_gross_weight = ROUND(2.0 + (RAND() * 6.5), 3)
        WHERE narration = %s ORDER BY name LIMIT %s""", (LOADTEST_MARK, int(with_weight)))
    frappe.db.sql("""UPDATE `tabOrder Bag` SET act_nett_weight = ROUND(act_gross_weight * 0.92, 3)
        WHERE narration = %s AND act_gross_weight > 0""", LOADTEST_MARK)
    frappe.db.commit()
    _bench_records(benches)
    el = time.time() - t0
    print("\ncreated %d cards in %.0fs (%.0f/s)" % (made, el, made / max(el, 1)))
    return {"created": made, "seconds": round(el, 1)}


def _flush(cols, rows):
    ph = ", ".join(["%s"] * len(cols))
    sql = "INSERT INTO `tabOrder Bag` (%s) VALUES (%s)" % (
        ", ".join("`%s`" % c for c in cols), ph)
    frappe.db.sql_ddl if False else None
    frappe.db._cursor.executemany(sql, rows)
    frappe.db.commit()


def _bench_records(benches):
    """One queue record per card, in bulk, matching what on_bag_arrival writes."""
    from jewelima.jewelima.benches import BENCH_DOCTYPE, on_bag_arrival
    now = frappe.utils.now()
    for b in benches:
        dtn = BENCH_DOCTYPE[b]
        if not frappe.db.exists("DocType", dtn):
            continue
        missing = frappe.db.sql("""SELECT ob.name FROM `tabOrder Bag` ob
            LEFT JOIN `tab{0}` r ON r.order_bag = ob.name
            WHERE ob.narration=%s AND ob.location=%s AND r.name IS NULL""".format(dtn),
            (LOADTEST_MARK, b), pluck=True)
        if not missing:
            continue
        # one ORM record first, so the bulk rows copy a real one
        on_bag_arrival(missing[0], b)
        frappe.db.commit()
        t = frappe.db.sql("SELECT * FROM `tab{0}` WHERE order_bag=%s".format(dtn),
                          missing[0], as_dict=True)[0]
        cols = list(t.keys())
        rows = []
        for k, bag in enumerate(missing[1:], start=1):
            r = dict(t)
            r["name"] = "%s-LT-%d" % (dtn[:8].upper().replace(" ", ""), abs(hash(bag)) % 10**9 + k)
            r["order_bag"] = bag
            r["creation"] = now
            r["modified"] = now
            rows.append([r[c] for c in cols])
        sql = "INSERT INTO `tab{0}` ({1}) VALUES ({2})".format(
            dtn, ", ".join("`%s`" % c for c in cols), ", ".join(["%s"] * len(cols)))
        for i in range(0, len(rows), 2000):
            frappe.db._cursor.executemany(sql, rows[i:i + 2000])
            frappe.db.commit()
        print("   %-16s %d queue records" % (b, len(missing)))


def verify_shape():
    """A bulk row must be indistinguishable from an ORM row, column by column —
    otherwise the load test is testing something the app never produces."""
    frappe.set_user("Administrator")
    rows = frappe.db.sql("""SELECT * FROM `tabOrder Bag` WHERE narration=%s
        ORDER BY creation LIMIT 2""", LOADTEST_MARK, as_dict=True)
    if len(rows) < 2:
        print("need at least two loadtest cards"); return
    a, b = rows[0], rows[1]
    differ = [k for k in a if a[k] != b[k]]
    expected = {"name", "location", "act_gross_weight", "act_nett_weight",
                "creation", "modified", "idx"}
    unexpected = [k for k in differ if k not in expected]
    print("columns that differ :", sorted(differ))
    print("unexpected difference:", unexpected or "none")
    return {"unexpected": unexpected}


# ---------------------------------------------------------------------------
# Job orders and due dates.
#
# Nothing date-driven — due view, due risk, due soon, prioritisation — shows a
# card without a job order, because they all read jo.due_date through
# b.job_order. Cards on their own therefore exercise the benches and nothing
# else. This hangs the load-test cards off real-shaped orders with dates spread
# across overdue / this week / this month / later, so those screens have
# something to strain against.
# ---------------------------------------------------------------------------
JO_SERIES = "E"

# how the spread is built: (share of orders, days from today lower, upper)
DUE_SPREAD = [
    (0.20, -60, -1),    # overdue — the ones the floor should be shouting about
    (0.20, 0, 7),       # this week
    (0.30, 8, 30),
    (0.30, 31, 120),
]


def _jo_series():
    r = frappe.db.sql("SELECT current FROM tabSeries WHERE name=%s", JO_SERIES)
    return int(r[0][0]) if r else 0


def attach_orders(per_order=20, dry_run=1):
    """Give every load-test card a job order with a due date."""
    frappe.set_user("Administrator")
    bags = frappe.db.sql("""SELECT name FROM `tabOrder Bag`
        WHERE narration=%s ORDER BY name""", LOADTEST_MARK, pluck=True)
    if not bags:
        print("no load-test cards to attach"); return {}
    n_orders = (len(bags) + per_order - 1) // per_order
    customers = frappe.get_all("Customer", pluck="name", limit=60)
    print("cards        :", len(bags))
    print("per order    :", per_order)
    print("job orders   :", n_orders)
    print("customers    :", len(customers), "(real ones, so the party views get exercised)")
    for share, lo, hi in DUE_SPREAD:
        print("   %5.0f%% due %+d..%+d days" % (share * 100, lo, hi))
    if int(dry_run):
        print("\nDRY RUN — nothing written.")
        return {"would_create": n_orders}

    mark = _jo_series()
    frappe.db.set_global("loadtest_jo_series_mark", str(mark))
    print("E series before:", "E%04d" % mark)

    today = frappe.utils.getdate()
    t0 = time.time()

    # one real job order as the template, then copy its columns
    tj = frappe.new_doc("Job Order")
    tj.order_date = today
    tj.due_date = frappe.utils.add_days(today, 10)
    tj.customer = customers[0] if customers else None
    tj.flags.ignore_mandatory = True
    tj.flags.ignore_links = True
    tj.insert(ignore_permissions=True)
    frappe.db.commit()
    tmpl = frappe.db.sql("SELECT * FROM `tabJob Order` WHERE name=%s", tj.name, as_dict=True)[0]
    cols = list(tmpl.keys())
    now = frappe.utils.now()

    # the due date each order gets, laid out so the spread is exact rather than
    # random — a load test that is 3% overdue on one run and 30% on the next is
    # not a test of anything
    plan = []
    for share, lo, hi in DUE_SPREAD:
        cnt = int(round(n_orders * share))
        span = max(hi - lo, 1)
        for k in range(cnt):
            plan.append(frappe.utils.add_days(today, lo + (k % (span + 1))))
    while len(plan) < n_orders:
        plan.append(frappe.utils.add_days(today, 45))
    plan = plan[:n_orders]

    rows, names = [], []
    seq = mark
    for i in range(n_orders):
        seq += 1
        nm = "E%04d" % seq
        r = dict(tmpl)
        r["name"] = nm
        r["due_date"] = plan[i]
        r["order_date"] = frappe.utils.add_days(today, -((i % 30) + 1))
        r["customer"] = customers[i % len(customers)] if customers else None
        r["creation"] = now
        r["modified"] = now
        rows.append([r[c] for c in cols])
        names.append((nm, plan[i], r["order_date"], r["customer"]))
    # the template is order one
    frappe.db.sql("DELETE FROM `tabJob Order` WHERE name=%s", tj.name)
    sql = "INSERT INTO `tabJob Order` ({0}) VALUES ({1})".format(
        ", ".join("`%s`" % c for c in cols), ", ".join(["%s"] * len(cols)))
    for i in range(0, len(rows), 2000):
        frappe.db._cursor.executemany(sql, rows[i:i + 2000])
        frappe.db.commit()
    _set_jo_series(seq)
    print("created %d job orders (%.0fs)" % (len(rows), time.time() - t0))

    # hand the cards out, in name order, per_order at a time. The cards are named
    # sequentially, so each order takes a contiguous range — one statement per
    # order rather than one per card.
    done = 0
    for i, (nm, due, odate, cust) in enumerate(names):
        chunk = bags[i * per_order:(i + 1) * per_order]
        if not chunk:
            break
        frappe.db.sql("""UPDATE `tabOrder Bag` SET job_order=%s, due_date=%s,
            order_date=%s, customer=%s WHERE name IN %s""",
            (nm, due, odate, cust, tuple(chunk)))
        done += len(chunk)
        if i % 500 == 0:
            frappe.db.commit()
            print("  %7d / %d cards attached (%.0fs)" % (done, len(bags), time.time() - t0))
    frappe.db.commit()
    print("\nattached %d cards to %d orders in %.0fs" % (done, len(names), time.time() - t0))
    return {"orders": len(names), "cards": done}


def _set_jo_series(v):
    frappe.db.sql("""INSERT INTO tabSeries (name, current) VALUES (%s, %s)
        ON DUPLICATE KEY UPDATE current = %s""", (JO_SERIES, v, v))
    frappe.db.commit()


def due_audit():
    frappe.set_user("Administrator")
    rows = frappe.db.sql("""SELECT
          SUM(CASE WHEN jo.due_date < CURDATE() THEN 1 ELSE 0 END) overdue,
          SUM(CASE WHEN jo.due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) this_week,
          SUM(CASE WHEN jo.due_date > DATE_ADD(CURDATE(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) later,
          SUM(CASE WHEN b.job_order IS NULL OR b.job_order='' THEN 1 ELSE 0 END) no_order,
          COUNT(*) total
        FROM `tabOrder Bag` b LEFT JOIN `tabJob Order` jo ON jo.name=b.job_order
        WHERE b.narration=%s""", LOADTEST_MARK, as_dict=True)[0]
    print("load-test cards by due date:")
    for k in ("overdue", "this_week", "later", "no_order", "total"):
        print("   %-12s %s" % (k, rows[k]))
    return rows
