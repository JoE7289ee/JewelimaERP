# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
"""
Raw-material import set — bulk-loads Items from the RAW_MATERIAL_REPORT spreadsheet.

Run (dry run first to see the counts, then the real load):

  bench --site development.localhost execute \
    jewelima.jewelima.imports.import_raw_materials.run \
    --kwargs "{'file_path': '/workspace/development/frappe-bench/raw_material_report.xlsx', 'dry_run': True}"

  bench --site development.localhost execute \
    jewelima.jewelima.imports.import_raw_materials.run \
    --kwargs "{'file_path': '/workspace/development/frappe-bench/raw_material_report.xlsx'}"

Idempotent: re-running skips Item Groups / Stone Types / Items that already exist.
Rows whose "Import" column is not TRUE are ignored.

Spreadsheet columns (row 1 = header):
  0 SL#   1 Sales Name   2 Purity   3 Stone Type   4 Item Group   5 Unit   6 Import
"""

import frappe

# File "Stone Type" text -> the Stone Type master record that drives the
# DMD / PS / CS counts on a Design BOM (see design.STONE_BUCKET). The file
# stores these uppercase; our masters are title-case, so normalise here.
STONE_TYPE_MAP = {
	"DIAMOND": "Diamond",
	"PRECIOUS STONE": "Precious Stone",
	"COLOR STONE": "Color Stone",
	"COLOUR STONE": "Color Stone",
}

TRUE_VALUES = {"TRUE", "1", "YES", "Y"}

DEFAULT_FILE = "/workspace/development/frappe-bench/raw_material_report.xlsx"

# column indexes
C_SL, C_NAME, C_PURITY, C_STONE, C_GROUP, C_UNIT, C_IMPORT = range(7)


def _s(v):
	return ("" if v is None else str(v)).strip()


def _num(v):
	"""Return a float if the cell is a clean number, else None."""
	try:
		return float(str(v).replace(",", "").strip())
	except (TypeError, ValueError):
		return None


def _ensure_uom(name):
	if name and not frappe.db.exists("UOM", name):
		frappe.get_doc({"doctype": "UOM", "uom_name": name}).insert(ignore_permissions=True)


def _ensure_stone_type(name):
	if name and not frappe.db.exists("Stone Type", name):
		frappe.get_doc({"doctype": "Stone Type", "stone_type_name": name}).insert(ignore_permissions=True)


def _resolve_stone_type(raw):
	"""Map the file's stone-type text to a Stone Type master (creating if needed)."""
	raw = _s(raw)
	if not raw:
		return ""
	canon = STONE_TYPE_MAP.get(raw.upper()) or raw.title()
	_ensure_stone_type(canon)
	return canon


def _ensure_item_group(name):
	if name and not frappe.db.exists("Item Group", name):
		frappe.get_doc({
			"doctype": "Item Group",
			"item_group_name": name,
			"parent_item_group": "All Item Groups",
			"is_group": 0,
		}).insert(ignore_permissions=True)


def run(file_path=None, dry_run=False):
	import openpyxl

	file_path = file_path or DEFAULT_FILE
	wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
	ws = wb.active
	data = list(ws.iter_rows(min_row=2, values_only=True))

	# --- select rows flagged Import = TRUE ---
	rows, skipped_flag = [], 0
	for r in data:
		name = _s(r[C_NAME]) if len(r) > C_NAME else ""
		if not name:
			continue
		imp = _s(r[C_IMPORT]).upper() if len(r) > C_IMPORT else ""
		if imp not in TRUE_VALUES:
			skipped_flag += 1
			continue
		rows.append(r)

	groups = sorted({_s(r[C_GROUP]) for r in rows if _s(r[C_GROUP])})
	units = sorted({_s(r[C_UNIT]) for r in rows if _s(r[C_UNIT])})

	print(f"Rows flagged Import=TRUE: {len(rows)}  (skipped, not TRUE: {skipped_flag})")
	print(f"Item Groups to ensure ({len(groups)}): {groups}")
	print(f"Units: {units}")

	if dry_run:
		print("DRY RUN — nothing written.")
		return

	# --- masters first ---
	for u in units:
		_ensure_uom(u)
	for g in groups:
		_ensure_item_group(g)

	created = exists = failed = 0
	errors, seen = [], set()
	for r in rows:
		name = _s(r[C_NAME])
		if name in seen:
			continue
		seen.add(name)
		if frappe.db.exists("Item", name):
			exists += 1
			continue
		try:
			unit = _s(r[C_UNIT]) or "Nos"
			stone = _resolve_stone_type(r[C_STONE])
			purity = _num(r[C_PURITY])
			frappe.get_doc({
				"doctype": "Item",
				"item_code": name,
				"item_name": name,
				"item_group": _s(r[C_GROUP]) or "All Item Groups",
				"stock_uom": unit,
				"is_stock_item": 1,
				"is_purchase_item": 1,
				"is_sales_item": 0,
				"include_item_in_manufacturing": 1,
				"stone_type": stone or None,
				"weight_unit": unit if unit in ("Gram", "Carat") else None,
				"purity_percentage": purity,
			}).insert(ignore_permissions=True)
			created += 1
		except Exception as e:
			failed += 1
			if len(errors) < 12:
				errors.append(f"{name}: {e}")

	frappe.db.commit()
	print(f"\nItems  created: {created}  already-existed: {exists}  failed: {failed}")
	if errors:
		print("First errors:")
		for e in errors:
			print("  -", e)
