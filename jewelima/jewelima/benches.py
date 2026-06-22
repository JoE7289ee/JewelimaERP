# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
"""
Per-bench doctypes — shared template, generator, and auto-create-on-arrival.

Each physical bench/location gets its OWN doctype (plain name, e.g. "Casting")
so it's easily queryable. They all share a base template (this file) and are
stamped by `make_bench(...)`; bench-specific fields are passed as `extra_fields`.

Add a bench (writes the doctype files, then run `bench migrate`):
    bench --site <site> execute jewelima.jewelima.benches.make_bench \
        --kwargs "{'location': 'CASTING'}"
    # with extras:
    # --kwargs "{'location': 'TREE MAKING', 'extra_fields': [{'fieldname':'tree_number','fieldtype':'Data','label':'Tree Number','in_list_view':1}]}"

When a bag transfers INTO a location, `on_bag_arrival` (called from the transfer
flow) creates that bench's record at status "In Queue" — but only once the
bench's doctype exists, so benches can be added one at a time.
"""
import os

import frappe

STATUS_OPTIONS = "In Queue\nOn Hold\nIssued\nReceipted\nCompleted"

# location label (UPPERCASE, as stored on Order Bag) -> bench doctype name (plain)
BENCH_DOCTYPE = {
	"ORDERING": "Ordering",
	"CAD": "CAD",
	"CAM": "CAM",
	"WAX INJECTING": "Wax Injecting",
	"TREE MAKING": "Tree Making",
	"CASTING": "Casting",
	"GRINDING": "Grinding",
	"FILING": "Filing",
	"SETTING": "Setting",
	"PRE POLISH": "Pre Polish",
	"WAX SETTING": "Wax Setting",
	"FINAL POLISH": "Final Polish",
	"WAX CLEANING": "Wax Cleaning",
	"BAG EXTRACTION": "Bag Extraction",
}


# Benches where work is issued to / received from an employee (loss is booked).
# Their dashboards show Issued / Receipted counts; others show only cards present.
ISSUE_RECEIPT_LOCATIONS = {"GRINDING", "FILING", "SETTING", "PRE POLISH", "FINAL POLISH"}


def bench_doctype(location):
	return BENCH_DOCTYPE.get((location or "").upper())


def resolve_location(bench):
	"""Accept a location ('PRE POLISH'), a bench doctype name ('Pre Polish') or its
	scrubbed form ('pre_polish') and return the UPPERCASE location, or None."""
	if not bench:
		return None
	b = str(bench).strip()
	if b.upper() in BENCH_DOCTYPE:
		return b.upper()
	for loc, label in BENCH_DOCTYPE.items():
		if label.lower() == b.lower() or frappe.scrub(label) == b.lower():
			return loc
	return None


def _base_fields(label):
	"""The locked shared template for every bench doctype."""
	return [
		{"fieldname": "order_bag", "fieldtype": "Link", "options": "Order Bag", "label": "Order Bag", "reqd": 1, "in_list_view": 1, "in_standard_filter": 1},
		{"fieldname": "bench", "fieldtype": "Data", "label": "Bench", "default": label, "read_only": 1, "in_standard_filter": 1},
		{"fieldname": "employee", "fieldtype": "Link", "options": "Employee", "label": "Employee", "in_list_view": 1, "in_standard_filter": 1},
		{"fieldname": "status", "fieldtype": "Select", "label": "Status", "options": STATUS_OPTIONS, "default": "In Queue", "in_list_view": 1, "in_standard_filter": 1},
		{"fieldname": "cb_times", "fieldtype": "Column Break"},
		{"fieldname": "time_in", "fieldtype": "Datetime", "label": "Time In"},
		{"fieldname": "time_out", "fieldtype": "Datetime", "label": "Time Out"},
		{"fieldname": "issued_at", "fieldtype": "Datetime", "label": "Issued At"},
		{"fieldname": "receipted_at", "fieldtype": "Datetime", "label": "Receipted At"},
		{"fieldname": "sec_weights", "fieldtype": "Section Break", "label": "Weight"},
		{"fieldname": "weight_out", "fieldtype": "Float", "label": "Weight Out (Issued)", "precision": "3", "read_only": 1, "in_list_view": 1},
		{"fieldname": "weight_in", "fieldtype": "Float", "label": "Weight In (Received)", "precision": "3", "in_list_view": 1},
		{"fieldname": "cb_weights", "fieldtype": "Column Break"},
		{"fieldname": "loss", "fieldtype": "Float", "label": "Loss", "precision": "3", "read_only": 1, "in_list_view": 1},
		{"fieldname": "sec_remarks", "fieldtype": "Section Break"},
		{"fieldname": "remarks", "fieldtype": "Small Text", "label": "Remarks"},
	]


def on_bag_arrival(order_bag, to_location):
	"""Create the destination bench's record at 'In Queue' when a bag arrives —
	only if that bench's doctype has been generated yet."""
	dt = bench_doctype(to_location)
	if not dt or not frappe.db.exists("DocType", dt):
		return
	frappe.get_doc({
		"doctype": dt, "order_bag": order_bag, "bench": dt,
		"status": "In Queue", "time_in": frappe.utils.now_datetime(),
	}).insert(ignore_permissions=True)


@frappe.whitelist()
def make_bench(location, extra_fields=None, abbr=None):
	"""Generate a bench doctype (files) from the shared template + extra_fields.
	Run `bench migrate` afterwards to sync it."""
	import json

	label = bench_doctype(location)
	if not label:
		frappe.throw(f"Unknown location {location!r}. Known: {list(BENCH_DOCTYPE)}")
	if isinstance(extra_fields, str):
		extra_fields = json.loads(extra_fields or "[]")

	scrub = frappe.scrub(label)              # "tree_making"
	classname = label.replace(" ", "")        # "TreeMaking"
	abbr = (abbr or label.replace(" ", "")[:4]).upper()
	fields = _base_fields(label) + (extra_fields or [])
	perm = {"create": 1, "delete": 1, "email": 1, "export": 1, "print": 1, "read": 1, "report": 1, "share": 1, "write": 1}

	doc = {
		"actions": [], "allow_rename": 1, "autoname": f"{abbr}-.#####", "naming_rule": "Expression (old style)",
		"creation": "2026-06-18 12:00:00.000000", "modified": "2026-06-18 12:00:00.000000",
		"doctype": "DocType", "editable_grid": 1, "engine": "InnoDB", "index_web_pages_for_search": 1,
		"field_order": [f["fieldname"] for f in fields], "fields": fields, "links": [],
		"module": "Jewelima", "name": label, "owner": "Administrator", "modified_by": "Administrator",
		"permissions": [dict(perm, role="System Manager"), dict(perm, role="Stock User")],
		"sort_field": "creation", "sort_order": "DESC", "states": [], "track_changes": 1,
	}

	folder = frappe.get_app_path("jewelima", "jewelima", "doctype", scrub)
	os.makedirs(folder, exist_ok=True)
	open(os.path.join(folder, "__init__.py"), "w").close()
	with open(os.path.join(folder, f"{scrub}.json"), "w") as f:
		json.dump(doc, f, indent=1)
		f.write("\n")
	with open(os.path.join(folder, f"{scrub}.py"), "w") as f:
		f.write(
			"# Copyright (c) 2026, efeone and contributors\n"
			"# For license information, please see license.txt\n\n"
			"from frappe.model.document import Document\n\n\n"
			f"class {classname}(Document):\n\tpass\n"
		)
	return {"doctype": label, "folder": folder, "fields": len(fields), "next": "run bench migrate"}
