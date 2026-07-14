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

	# ---- Bench work (who worked on what, per stage) --------------------------
	workers = set()
	for dt in dict.fromkeys(BENCH_DOCTYPE.values()):
		if not frappe.db.exists("DocType", dt):
			continue
		rows = frappe.db.sql("""
			SELECT IFNULL(employee,'—') emp, COUNT(*) n, SUM(IFNULL(loss,0)) loss
			FROM `tab{0}` WHERE DATE(creation)=%s GROUP BY employee""".format(dt), d, as_dict=True)
		total = sum(cint(r.n) for r in rows)
		if total:
			line("Bench Work", dt, pcs=total, weight=sum(flt(r.loss) for r in rows), uom="g loss")
			for r in rows:
				if r.emp != "—":
					workers.add(r.emp)
					line("Bench Work", "%s — %s" % (dt, r.emp), pcs=r.n, weight=r.loss, uom="g loss")
	doc.employees_worked = len(workers)

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

	# ---- Closing positions (whole book, -LOSS excluded) -----------------------
	closing = frappe.db.sql("""
		SELECT bin.item_code item, bin.actual_qty q, IFNULL(i.purity_percentage,0) pp,
			IFNULL(i.stone_type,'') st
		FROM `tabBin` bin JOIN `tabItem` i ON i.name = bin.item_code
		JOIN `tabWarehouse` w ON w.name = bin.warehouse
		WHERE bin.actual_qty > 0 AND w.warehouse_name NOT LIKE '%%-LOSS'""", as_dict=True)
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
	line("Closing Stock", "Pure gold (all stores + floor)", weight=round(pure, 3), uom="g")

	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return doc.name


def backfill(days=30):
	"""bench execute jewelima....day_record.backfill --kwargs "{'days': 90}" """
	for i in range(cint(days), -1, -1):
		build_day_record(frappe.utils.add_days(frappe.utils.today(), -i))
	return "built {0} days".format(cint(days) + 1)
