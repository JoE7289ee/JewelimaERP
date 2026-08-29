# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
"""The selection catalogue's single gold weight becomes one per karat.

Every weight recorded so far was 18K, so gold_gms simply becomes gold_18k —
renamed rather than copied, so the 595 photos and the selections already made
keep their numbers and their history. 14K and 9K start empty.
"""

import frappe
from frappe.model.utils.rename_field import rename_field


def execute():
	for dt, old, new in (
		("Selection Photo", "gold_gms", "gold_18k"),
		("Selection Item", "gold_gms", "gold_18k"),
		("Selection", "total_gold", "total_gold_18k"),
	):
		if not frappe.db.exists("DocType", dt):
			continue
		frappe.reload_doc("jewelima", "doctype", frappe.scrub(dt))
		cols = [c[0] for c in frappe.db.sql("SHOW COLUMNS FROM `tab{0}`".format(dt))]
		if old in cols and new not in cols:
			rename_field(dt, old, new)
		elif old in cols and new in cols:
			# both present (a half-run, or the field was re-added): keep the
			# older values and drop the leftover column
			frappe.db.sql("UPDATE `tab{0}` SET `{1}` = `{2}` WHERE IFNULL(`{1}`,0) = 0".format(dt, new, old))
			frappe.db.sql_ddl("ALTER TABLE `tab{0}` DROP COLUMN `{1}`".format(dt, old))
	frappe.db.commit()
