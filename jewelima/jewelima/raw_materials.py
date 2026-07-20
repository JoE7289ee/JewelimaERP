# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
"""
The BASE RAW MATERIALS that ship with the app — pure code, no spreadsheet.

Everything here is reviewed and added deliberately (one category at a time).
`seed()` is idempotent and runs on install + migrate: it creates any missing item,
never touches existing ones. Karat golds (22KYG…) and Standard Golds (990–999) have
their own seeders in jewelima.setup; this registry owns everything else.

Each entry: (item_code, leaf item group, stone_type or None, purity %).
UOM follows the stone rule automatically (stone -> Carat, metal -> Gram).
"""

import frappe

# ---------------------------------------------------------------------------
# THE REGISTRY — reviewed category by category. Empty sections are pending review.
# ---------------------------------------------------------------------------

RAW_MATERIALS = [
	# --- METAL / ALLOY (named production alloys to be added after review) ---
	("Alloy", "ALLOY", None, 0),
]


# --- STONE / DIAMOND -----------------------------------------------------------
# Naming convention (reviewed 2026-07-05): "<QUALITY> <size>" — no RD- prefix, no
# '+' on the sieve ranges. O-series ("oughts") sit below size 1.

O_SIZES = ["OOOOO-OOOO", "OOOO-OOO", "OOO-OO", "OO-O", "O-1"]


def _half_steps(start, end):
	"""Sieve ranges in half steps: 1-1.5, 1.5-2, … 21.5-22."""
	def f(x):
		return f"{x:g}"

	out = []
	x = start
	while x < end - 1e-9:
		out.append(f"{f(x)}-{f(x + 0.5)}")
		x += 0.5
	return out


# quality -> size list (each quality is reviewed individually before landing here)
CANONICAL = O_SIZES + _half_steps(1, 22.5)  # the standard 48-size run

# every quality ships the SAME canonical run (reviewed 2026-07-05) — unused sizes
# simply sit at zero stock. No baguettes in the base registry. Each quality also
# gets a GENERIC base item (just the quality name) for unsized stock.
# 2026-07-09: VS1-FG, VS2-FG and VVS1-FG retired (no longer used) — existing sites
# keep them until a fresh rebuild; the registry only ADDS, never deletes.
DIAMOND_QUALITIES = ["SI-IJ", "VS-FG", "VS-IJ", "VVS-EF", "VVS/VS-GH", "VVS1-EF", "VVS2"]

for _q in DIAMOND_QUALITIES:
	RAW_MATERIALS.append((_q, f"DIAMOND {_q}", "Diamond", 0))  # generic base
	for _s in CANONICAL:
		RAW_MATERIALS.append((f"{_q} {_s}", f"DIAMOND {_q}", "Diamond", 0))


# --- STONE / CVD, SWAROVSKI, CUBIC ZIRCONIA -------------------------------------
# Same canonical sieve run as diamonds + a generic base item each.
# SW buckets as Color Stone; CZ has its OWN bucket (Cubic Zirconia) since 2026-07-19.

SIZED_STONES = [
	# (prefix, item group leaf, stone type)
	("CVD", "CVD", "CVD"),
	("SW", "SWAROVSKI", "Color Stone"),
	("CZ", "CUBIC ZIRCONIA", "Cubic Zirconia"),
]

for _p, _g, _t in SIZED_STONES:
	RAW_MATERIALS.append((_p, _g, _t, 0))  # generic base
	for _s in CANONICAL:
		RAW_MATERIALS.append((f"{_p} {_s}", _g, _t, 0))


# --- STONE / COLOUR STONE — one generic bucket -----------------------------------
RAW_MATERIALS.append(("CS", "COLOUR STONE", "Color Stone", 0))


# --- STONE / PRECIOUS STONE — named gems (reviewed 2026-07-06) --------------------
# Cleaned spellings; the workshop's short forms (BLUE SAP …) kept on purpose.
PRECIOUS_GEMS = [
	"AMETHYST", "AQUAMARINE", "IOLITE", "BLACK STAR", "BLUE SAP", "BLUE TOPAZ",
	"CATS EYE", "CORAL", "EMERALD", "GARNET", "GOMEDAKAM", "JADE",
	"LAPIS LAZULI", "MOON STONE", "ONYX", "OPAL", "PEARL", "PERIDOT",
	"PINK SAP", "RUBY", "SAND STONE", "TURQUOISE", "TOURMALINE",
	"WHITE SAP", "WHITE TOPAZ", "YELLOW SAP", "YELLOW TOPAZ",
]

for _gem in PRECIOUS_GEMS:
	RAW_MATERIALS.append((_gem, "PRECIOUS STONE", "Precious Stone", 0))


def _items():
	"""Flatten the registry into item dicts."""
	for code, group, stone_type, purity in RAW_MATERIALS:
		yield {
			"item_code": code,
			"item_group": group,
			"stone_type": stone_type,
			"purity": purity or 0,
		}


def seed():
	"""Create every registry item that doesn't exist yet. Never modifies or deletes —
	the registry only ADDS; retiring an item is an explicit decision, not a sync."""
	created = skipped = 0
	for it in _items():
		if frappe.db.exists("Item", it["item_code"]):
			skipped += 1
			continue
		if not frappe.db.exists("Item Group", it["item_group"]):
			continue  # tree not built yet (fresh install pre-wizard); next migrate catches it
		frappe.get_doc({
			"doctype": "Item",
			"item_code": it["item_code"],
			"item_name": it["item_code"],
			"item_group": it["item_group"],
			"stock_uom": "Carat" if it["stone_type"] else "Gram",
			"is_stock_item": 1,
			"is_purchase_item": 1,
			"is_sales_item": 0,
			"include_item_in_manufacturing": 1,
			"stone_type": it["stone_type"],
			"weight_unit": "Carat" if it["stone_type"] else "Gram",
			"purity_percentage": it["purity"],
		}).insert(ignore_permissions=True)
		created += 1
	frappe.db.commit()
	print(f"Raw materials (code registry) — created: {created}  existing: {skipped}  total defined: {len(RAW_MATERIALS)}")
	return {"created": created, "existing": skipped, "defined": len(RAW_MATERIALS)}
