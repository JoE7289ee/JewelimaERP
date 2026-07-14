# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
#
# Day Record — one sealed snapshot of what the company did on a calendar day.
# Built by the 23:45 nightly job (hooks scheduler_events), rebuildable for any
# date, and deliberately DENORMALIZED: the day sheet must print correctly years
# later, even after the underlying transactions have been pruned. Extend by
# adding sections to build_day_record() — the flexible lines table needs no
# schema change (cancellations, sales returns, repair work will slot in the
# same way when those flows exist).

import frappe
from frappe.model.document import Document
from frappe.utils import cint, flt


class DayRecord(Document):
	pass


def build_today():
	"""The 23:45 nightly entry point."""
	build_day_record(frappe.utils.today())


@frappe.whitelist()
def rebuild_day_record(date):
	"""Manager button / backfill: (re)build one date's record."""
	frappe.only_for(("System Manager", "Stock Manager"))
	return build_day_record(date)


def build_day_record(date):
	"""Idempotent: drop + rebuild the record for `date` from the live tables."""
	from jewelima.jewelima.api import _BUCKET_OF_STONE_TYPE
	from jewelima.jewelima.benches import BENCH_DOCTYPE

	d = str(date)
	existing = frappe.db.exists("Day Record", {"date": d})
	if existing:
		frappe.delete_doc("Day Record", existing, force=True, ignore_permissions=True)

	doc = frappe.new_doc("Day Record")
	doc.date = d
	L = doc.append  # shorthand for detail lines

	def line(section, label, pcs=0, weight=0, uom="", value=0, extra=""):
		L("lines", {"section": section, "label": label, "pcs": cint(pcs),
			"weight": flt(weight), "uom": uom, "value": flt(value), "extra": extra})

	# ---- Orders & floor -----------------------------------------------------
	doc.orders_placed = frappe.db.count("Job Order", {"order_date": d})
	doc.bags_created = frappe.db.sql(
		"SELECT COUNT(*) FROM `tabOrder Bag` WHERE DATE(creation)=%s", d)[0][0]
	doc.bags_cancelled = frappe.db.sql("""
		SELECT COUNT(*) FROM `tabOrder Bag`
		WHERE stock_status='Cancelled' AND DATE(modified)=%s""", d)[0][0]
	doc.floor_bags = frappe.db.count("Order Bag", {"stock_status": "In Production", "is_finished": 0})
	doc.overdue_orders = frappe.db.sql("""
		SELECT COUNT(DISTINCT jo.name) FROM `tabJob Order` jo
		JOIN `tabOrder Bag` b ON b.job_order = jo.name
		WHERE jo.due_date < %s AND b.stock_status = 'In Production' AND b.is_finished = 0""", d)[0][0]
	for r in frappe.db.sql("""
			SELECT IFNULL(order_type,'—') t, COUNT(*) n FROM `tabJob Order`
			WHERE order_date=%s GROUP BY order_type""", d, as_dict=True):
		line("Orders", r.t, pcs=r.n)

	# karat mix of the day's booked bags (gold BOM line, colour ignored: 22K/18K/14K)
	for r in frappe.db.sql("""
			SELECT SUBSTRING(bi.item, 1, 2) k, COUNT(DISTINCT b.name) n, SUM(bi.weight) g
			FROM `tabOrder Bag` b
			JOIN `tabOrder Bag BOM Item` bi ON bi.parent = b.name AND bi.parenttype = 'Order Bag'
			JOIN `tabItem` i ON i.name = bi.item
			WHERE DATE(b.creation)=%s AND IFNULL(i.stone_type,'')='' AND bi.item REGEXP '^[0-9]{2}K'
			GROUP BY SUBSTRING(bi.item, 1, 2) ORDER BY k DESC""", d, as_dict=True):
		line("Orders by Karat", "%sK" % r.k, pcs=r.n, weight=r.g, uom="g plan")

	# ownership / reservation changes recorded today
	for r in frappe.db.sql("""
			SELECT order_bag, from_holder, to_holder, transferred_by FROM `tabHolder Transfer`
			WHERE DATE(transfer_time)=%s ORDER BY transfer_time""", d, as_dict=True):
		line("Ownership", "%s: %s → %s" % (r.order_bag, r.from_holder or "—", r.to_holder),
			extra=r.transferred_by or "")

	# ---- Issues (from the per-bag ledger, the material truth) ---------------
	gold = frappe.db.sql("""
		SELECT l.item, SUM(l.qty) g, SUM(l.qty * IFNULL(i.purity_percentage,0) / 100) pure
		FROM `tabBag Material Ledger` l JOIN `tabItem` i ON i.name = l.item
		WHERE l.entry_type='Gold Issue' AND l.direction='In' AND DATE(l.datetime)=%s
		GROUP BY l.item""", d, as_dict=True)
	doc.gold_issued_g = round(sum(flt(r.g) for r in gold), 3)
	doc.gold_issued_pure_g = round(sum(flt(r.pure) for r in gold), 3)
	for r in gold:
		line("Gold Issued", r.item, weight=r.g, uom="g", extra="pure %s" % round(flt(r.pure), 3))

	stones = frappe.db.sql("""
		SELECT l.item, IFNULL(i.stone_type,'') st, SUM(l.pcs) pcs, SUM(l.qty) ct
		FROM `tabBag Material Ledger` l JOIN `tabItem` i ON i.name = l.item
		WHERE l.entry_type='Stone Issue' AND l.direction='In' AND DATE(l.datetime)=%s
		GROUP BY l.item""", d, as_dict=True)
	doc.stones_issued_pcs = sum(cint(r.pcs) for r in stones)
	doc.stones_issued_ct = round(sum(flt(r.ct) for r in stones), 3)
	for r in stones:
		bucket = (_BUCKET_OF_STONE_TYPE.get(r.st) or "poth").upper()
		line("Stones Issued", r.item, pcs=r.pcs, weight=r.ct, uom="ct", extra=bucket)

	# who issued (Material Issue paper trail)
	for r in frappe.db.sql("""
			SELECT IFNULL(m.issued_by,'—') who, m.issue_type, SUM(i.pcs) pcs, SUM(i.qty) qty
			FROM `tabMaterial Issue` m JOIN `tabMaterial Issue Item` i ON i.parent = m.name
			WHERE DATE(m.posting)=%s GROUP BY m.issued_by, m.issue_type""", d, as_dict=True):
		line("Issued By", "%s (%s)" % (r.who, r.issue_type), pcs=r.pcs, weight=r.qty,
			uom="ct" if r.issue_type == "Stone" else "g")

	# ---- Bench work: per stage — issued vs done, grams actually worked -------
	# (stone work itself = the Stones Issued section; benches account in grams)
	workers = set()
	emp_score = {}  # employee -> {done, g} for the day's top-employee mini report
	for dt in dict.fromkeys(BENCH_DOCTYPE.values()):
		if not frappe.db.exists("DocType", dt):
			continue
		issued_n = frappe.db.sql(
			"SELECT COUNT(*) FROM `tab{0}` WHERE DATE(issued_at)=%s".format(dt), d)[0][0]
		done = frappe.db.sql("""
			SELECT IFNULL(employee,'—') emp, COUNT(*) n,
				SUM(IFNULL(weight_in,0)) g, SUM(IFNULL(loss,0)) loss
			FROM `tab{0}` WHERE DATE(receipted_at)=%s GROUP BY employee""".format(dt), d, as_dict=True)
		done_n = sum(cint(r.n) for r in done)
		if not issued_n and not done_n:
			continue
		line("Bench Work", dt, pcs=done_n, weight=sum(flt(r.g) for r in done), uom="g worked",
			value=0, extra="issued %s · loss %.3f g" % (issued_n, sum(flt(r.loss) for r in done)))
		for r in done:
			if r.emp != "—":
				workers.add(r.emp)
				e = emp_score.setdefault(r.emp, {"done": 0, "g": 0.0})
				e["done"] += cint(r.n)
				e["g"] += flt(r.g)
				line("Bench Work", "%s — %s" % (dt, r.emp), pcs=r.n, weight=r.g, uom="g worked")
	doc.employees_worked = len(workers)

	# top employees of the day (cards collected + grams handled)
	top = sorted(emp_score.items(), key=lambda kv: (-kv[1]["done"], -kv[1]["g"]))[:5]
	for rank, (emp, s) in enumerate(top, 1):
		nm = frappe.db.get_value("Employee", emp, "employee_name") or emp
		line("Top Employees", nm, pcs=s["done"], weight=round(s["g"], 3), uom="g", extra="#%d" % rank)

	# ---- Losses --------------------------------------------------------------
	loss = frappe.db.sql("""
		SELECT IFNULL(l.bench,'—') bench, SUM(l.qty) g
		FROM `tabBag Material Ledger` l
		WHERE l.entry_type='Loss' AND DATE(l.datetime)=%s GROUP BY l.bench""", d, as_dict=True)
	doc.loss_booked_g = round(sum(flt(r.g) for r in loss), 3)
	for r in loss:
		line("Loss", r.bench, weight=r.g, uom="g")

	# ---- Output & certification ----------------------------------------------
	doc.products_made = frappe.db.sql(
		"SELECT COUNT(*) FROM `tabOrder Bag` WHERE DATE(in_stock_on)=%s AND is_finished=1", d)[0][0]
	doc.pieces_imported = frappe.db.sql("""
		SELECT COUNT(*) FROM `tabOrder Bag` b JOIN `tabJob Order` jo ON jo.name=b.job_order
		WHERE jo.order_type='Import' AND DATE(b.creation)=%s""", d)[0][0]
	doc.cert_sent_pcs = frappe.db.sql("""
		SELECT COUNT(*) FROM `tabCertification Item` i JOIN `tabCertification` c ON c.name=i.parent
		WHERE DATE(c.sent_on)=%s""", d)[0][0]
	doc.cert_received_pcs = frappe.db.sql("""
		SELECT COUNT(*) FROM `tabCertification Item` WHERE received=1 AND DATE(received_on)=%s""", d)[0][0]
	for r in frappe.db.sql("""
			SELECT c.certification_type t, COUNT(*) n FROM `tabCertification Item` i
			JOIN `tabCertification` c ON c.name=i.parent WHERE DATE(c.sent_on)=%s
			GROUP BY c.certification_type""", d, as_dict=True):
		line("Certification", "Sent — %s" % r.t, pcs=r.n)

	# ---- Sales ---------------------------------------------------------------
	sales = frappe.db.sql("""
		SELECT s.name, s.customer, s.grand_total, COUNT(i.name) pcs
		FROM `tabProduct Sale` s JOIN `tabProduct Sale Item` i ON i.parent = s.name
		WHERE s.sale_date=%s GROUP BY s.name""", d, as_dict=True)
	doc.sales_count = len(sales)
	doc.sales_pieces = sum(cint(r.pcs) for r in sales)
	doc.sales_value = round(sum(flt(r.grand_total) for r in sales), 2)
	for r in sales:
		line("Sales", r.customer or "—", pcs=r.pcs, value=r.grand_total, extra=r.name)

	# ---- Purchases into stock (Material Receipts: who kept it, what came in) --
	for r in frappe.db.sql("""
			SELECT se.name, se.owner, d2.item_code item, d2.qty, d2.t_warehouse
			FROM `tabStock Entry` se JOIN `tabStock Entry Detail` d2 ON d2.parent = se.name
			WHERE se.stock_entry_type = 'Material Receipt' AND se.docstatus = 1
				AND DATE(se.posting_date)=%s ORDER BY se.name""", d, as_dict=True):
		uom = frappe.db.get_value("Item", r.item, "weight_unit") or ""
		line("Purchases", r.item, weight=r.qty, uom=uom,
			extra="%s · by %s" % ((r.t_warehouse or "").replace(" - JD", ""), r.owner))

	# ---- Closing positions: per location, then the total (-LOSS excluded) -----
	closing = frappe.db.sql("""
		SELECT bin.item_code item, bin.actual_qty q, IFNULL(i.purity_percentage,0) pp,
			IFNULL(i.stone_type,'') st, w.warehouse_name wh
		FROM `tabBin` bin JOIN `tabItem` i ON i.name = bin.item_code
		JOIN `tabWarehouse` w ON w.name = bin.warehouse
		WHERE bin.actual_qty > 0 AND w.warehouse_name NOT LIKE '%%-LOSS'""", as_dict=True)
	LOCATIONS = [
		("Finished Goods", ("Finished Goods",)),
		("In Bags (floor)", ("In Bags",)),
		("At Certification", ("At Certification",)),
		("Issue counters", ("Gold Issue", "Stone Issue")),
		("Stores & others", None),  # everything else
	]
	named = {w for _, whs in LOCATIONS if whs for w in whs}
	for label, whs in LOCATIONS:
		rows = [r for r in closing if (r.wh in whs if whs else r.wh not in named)]
		g = sum(flt(r.q) * flt(r.pp) / 100 for r in rows if not r.st)
		ct = sum(flt(r.q) for r in rows if r.st)
		if g > 0.0005:
			line("Closing Stock", "%s — pure gold" % label, weight=round(g, 3), uom="g")
		if ct > 0.0005:
			line("Closing Stock", "%s — stones" % label, weight=round(ct, 3), uom="ct")
	pure = sum(flt(r.q) * flt(r.pp) / 100 for r in closing if not r.st)
	stones_ct = sum(flt(r.q) for r in closing if r.st)
	doc.closing_pure_gold_g = round(pure, 3)
	doc.closing_stones_ct = round(stones_ct, 3)
	buckets = {}
	for r in closing:
		if r.st:
			b = (_BUCKET_OF_STONE_TYPE.get(r.st) or "poth").upper()
			buckets[b] = buckets.get(b, 0) + flt(r.q)
	for b in sorted(buckets):
		line("Closing Stock", "Stones — %s" % b, weight=round(buckets[b], 3), uom="ct")
	line("Closing Stock", "TOTAL pure gold", weight=round(pure, 3), uom="g")
	line("Closing Stock", "TOTAL stones", weight=round(stones_ct, 3), uom="ct")

	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return doc.name


def backfill(days=30):
	"""bench execute jewelima....day_record.backfill --kwargs "{'days': 90}" """
	for i in range(cint(days), -1, -1):
		build_day_record(frappe.utils.add_days(frappe.utils.today(), -i))
	return "built {0} days".format(cint(days) + 1)
