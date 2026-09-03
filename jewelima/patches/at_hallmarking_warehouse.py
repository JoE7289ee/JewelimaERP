# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
#
# Hallmarking gets its OWN warehouse and stock status.
#
# It was sharing certification's, which made the At Certification report count
# hallmarked pieces as lab work — a board that has to be explained is a board
# that is wrong. Nothing is moved: the only migrated batch is already Received,
# so its stock came home to Finished Goods long ago and there is nothing sitting
# in the wrong place. New batches use the new warehouse from here on.

import frappe


def execute():
	frappe.reload_doc("jewelima", "doctype", "order_bag")
	from jewelima.setup import create_store_warehouses
	create_store_warehouses()          # idempotent; makes At Hallmarking

	# anything actually parked in the hallmarking flow right now would be wrong to
	# leave behind, so say so rather than silently doing nothing
	out = frappe.db.sql("""select i.order_bag from `tabHallmarking Item` i
		join `tabHallmarking Batch` h on h.name = i.parent
		where h.status = 'Sent'""", pluck=True)
	if out:
		frappe.db.sql("""update `tabOrder Bag` set stock_status = 'At Hallmarking',
			location = 'HALLMARKING' where name in %(n)s and stock_status = 'At Certification'""",
			{"n": tuple(out)})
		print("at-hallmarking: moved {0} in-flight piece(s) onto the new status".format(len(out)))
	else:
		print("at-hallmarking: warehouse ready; nothing in flight to move")
	frappe.db.commit()
