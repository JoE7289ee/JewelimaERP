# Copyright (c) 2026, efeone and contributors
#
# Cards sitting at a bench with no bench record (2026-09-02).
#
# get_bench_board reads "no record yet = In Queue", so such a card LOOKS queued
# and is offered for issue — but every route into a work session starts from the
# bench record, so issuing it fails with "No bench record at <bench>". The card
# is visible, offered, and unusable.
#
# They come from anything that changed Order Bag.location without going through
# the transfer flow, which is the only thing that calls on_bag_arrival(). The
# retire_wax_cleaning_bench patch did exactly that when it moved WAX CLEANING's
# cards onto WAXING, which is where the 9,999 on PROD came from.
#
# This creates the record on_bag_arrival() would have created. It is idempotent:
# a card that already has one is skipped, so it is safe to re-run.

import frappe


def execute():
	from jewelima.jewelima.benches import BENCH_DOCTYPE, on_bag_arrival

	made, per_bench = 0, {}
	for bench, dt in sorted(BENCH_DOCTYPE.items()):
		if not frappe.db.exists("DocType", dt):
			continue
		names = frappe.db.sql_list("""
			SELECT b.name FROM `tabOrder Bag` b
			WHERE b.location = %s AND b.is_finished = 0
			  AND b.stock_status = 'In Production'
			  AND NOT EXISTS (SELECT 1 FROM `tab{0}` t WHERE t.order_bag = b.name)
		""".format(dt), bench)
		if not names:
			continue
		for nm in names:
			on_bag_arrival(nm, bench)        # the app's own record, In Queue
			made += 1
			if made % 500 == 0:
				frappe.db.commit()
		per_bench[bench] = len(names)
	frappe.db.commit()
	print("backfill_missing_bench_records: created %s record(s) %s" % (made, per_bench or "—"))
