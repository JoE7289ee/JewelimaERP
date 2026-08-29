# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
"""The selection catalogue gains a stone COUNT and a colour-stone bucket.

`cts` only ever meant diamond carats, so it becomes dmd_weight — renamed, not
copied, so the 595 photos and the selections already made keep their numbers.
That leaves the catalogue naming stones the way the rest of the app does:
dmd_no / dmd_weight, cs_no / cs_weight. The counts and colour stone start empty.
"""

import frappe
from frappe.model.utils.rename_field import rename_field


def execute():
	for dt, old, new in (
		("Selection Photo", "cts", "dmd_weight"),
		("Selection Item", "cts", "dmd_weight"),
		("Selection", "total_cts", "total_dmd_weight"),
	):
		if not frappe.db.exists("DocType", dt):
			continue
		frappe.reload_doc("jewelima", "doctype", frappe.scrub(dt))
		cols = [c[0] for c in frappe.db.sql("SHOW COLUMNS FROM `tab{0}`".format(dt))]
		if old in cols and new not in cols:
			rename_field(dt, old, new)
		elif old in cols and new in cols:
			frappe.db.sql("UPDATE `tab{0}` SET `{1}` = `{2}` WHERE IFNULL(`{1}`,0) = 0".format(dt, new, old))
			frappe.db.sql_ddl("ALTER TABLE `tab{0}` DROP COLUMN `{1}`".format(dt, old))
	frappe.db.commit()
