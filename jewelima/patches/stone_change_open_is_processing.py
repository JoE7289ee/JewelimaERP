"""Trays opened before the stone-change workflow existed sat on 'Open'.

'Open' meant exactly what 'Processing' means now — on the floor, stones being
changed, not yet sent back. Left as they were they are stranded: the desk files
them with the closed trays and the Send button never appears, so the gold can
never be sent out again. Give them the centre they will go back to as well,
which is the one their pieces' certification batch used.
"""

import frappe


def execute():
	names = [d.name for d in frappe.get_all("Stone Change", filters={"status": "Open"})]
	if not names:
		return
	from jewelima.jewelima.api import _stone_change_center

	for n in names:
		rows = frappe.get_all("Stone Change Item", filters={"parent": n},
			fields=["from_certification"])
		frappe.db.set_value("Stone Change", n,
			{"status": "Processing",
			 "center": frappe.db.get_value("Stone Change", n, "center")
				or _stone_change_center([dict(r) for r in rows])},
			update_modified=False)
	frappe.db.commit()
	print("stone change: {0} tray(s) moved Open -> Processing".format(len(names)))
