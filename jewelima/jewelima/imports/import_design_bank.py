# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
"""
Design Bank import set — bulk-loads the design-photo catalog.

The photos live FLAT (one folder, ~30k images) at:
    <site>/public/files/design-bank/

Two steps, both idempotent / safe to re-run:

  1) run()      — create one Design Bank record per image (fast). design_no defaults to
                  the filename stem; gross/diamond weight + note are filled later by
                  ocr_fill(). Keyed on source_file, so re-running only adds new files.

  2) ocr_fill() — OCR the printed cards to fill gross_weight (the "GW .. GMS" line),
                  diamond_weight ("DW .. CTS") and the middle note (e.g. "+6-6.5=21").
                  Needs the `tesseract` binary + the `pytesseract` package. Processes
                  records with ocr_done = 0 in batches, so it can run repeatedly / in the
                  background across the whole catalog. Each card is OCR'd exactly once.

Manual runs:
  bench --site <site> execute jewelima.jewelima.imports.import_design_bank.run
  bench --site <site> execute jewelima.jewelima.imports.import_design_bank.ocr_fill --kwargs "{'limit': 1000}"
"""

import os
import re
from urllib.parse import quote

import frappe

IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".webp")
FOLDER = "design-bank"  # under <site>/public/files/


def _dir():
	return frappe.get_site_path("public", "files", FOLDER)


def _design_no(stem):
	"""The clean design code from a filename stem.

	Collision files were flattened as "<folder> - <original>"; the real code is the segment
	after the last ' - '. Windows duplicate files end in ' - Copy', so trailing 'Copy'
	segments are dropped first. Plain files (e.g. "A 66066 RG") are returned unchanged.
	"""
	segs = [s.strip() for s in stem.split(" - ")]
	while len(segs) > 1 and re.match(r"(?i)copy(\s*\d+)?$", segs[-1]):
		segs.pop()
	return segs[-1] if segs else stem


def run(folder=None, batch=500):
	"""Create a Design Bank record per image file (idempotent on source_file)."""
	folder = folder or _dir()
	if not os.path.isdir(folder):
		frappe.throw(f"Design Bank folder not found: {folder}")

	files = sorted(f for f in os.listdir(folder) if f.lower().endswith(IMAGE_EXTS))
	existing = set(frappe.get_all("Design Bank", pluck="source_file"))
	print(f"Images on disk: {len(files)}   already imported: {len(existing)}")

	created = failed = 0
	errors = []
	for fn in files:
		if fn in existing:
			continue
		try:
			frappe.get_doc({
				"doctype": "Design Bank",
				"design_no": _design_no(os.path.splitext(fn)[0]),
				"image": "/files/{}/{}".format(FOLDER, quote(fn)),
				"source_file": fn,
			}).insert(ignore_permissions=True)
			created += 1
			if created % batch == 0:
				frappe.db.commit()
				print(f"  ...{created} created")
		except Exception as e:
			failed += 1
			if len(errors) < 12:
				errors.append(f"{fn}: {e}")

	frappe.db.commit()
	print(f"\nDesign Bank — created: {created}  already-existed: {len(existing)}  failed: {failed}")
	if errors:
		print("First errors:")
		for e in errors:
			print("  -", e)
	return {"created": created, "exists": len(existing), "failed": failed, "files": len(files)}


# --- OCR enrichment ----------------------------------------------------------------

# "GW 4.806 GMS" / "DW 0.44 CTS"  (tolerant of OCR spacing / colons)
_GW = re.compile(r"GW\s*[:=]?\s*(\d+(?:\.\d+)?)", re.I)
_DW = re.compile(r"DW\s*[:=]?\s*(\d+(?:\.\d+)?)", re.I)
# middle sizing note, e.g. "+6-6.5=21"
_NOTE = re.compile(r"([+\-]?\d[\d.\-]*\s*=\s*\d+)")


def ocr_fill(limit=1000, recheck=False):
	"""OCR cards to fill gross_weight / diamond_weight / note. Run repeatedly.

	By default only touches records with ocr_done = 0. Pass recheck=True to re-OCR
	everything (e.g. after improving the regexes).
	"""
	try:
		import pytesseract
		from PIL import Image
	except Exception as e:
		frappe.throw(f"OCR needs pytesseract + Pillow + the tesseract binary: {e}")

	folder = _dir()
	filters = {} if recheck else {"ocr_done": 0}
	rows = frappe.get_all("Design Bank", filters=filters, fields=["name", "source_file"], limit=limit)
	print(f"OCR candidates: {len(rows)} (limit {limit})")

	filled = notext = missing = errors = 0
	for i, r in enumerate(rows, 1):
		path = os.path.join(folder, r.source_file or "")
		if not r.source_file or not os.path.exists(path):
			missing += 1
			continue
		vals = {"ocr_done": 1}
		try:
			text = pytesseract.image_to_string(Image.open(path))
		except Exception:
			errors += 1
			frappe.db.set_value("Design Bank", r.name, vals, update_modified=False)  # don't retry bad files
			continue
		m = _GW.search(text)
		if m:
			v = float(m.group(1))
			if 0 < v <= 500:  # plausible gross weight (g); skip OCR misreads
				vals["gross_weight"] = v
		m = _DW.search(text)
		if m:
			v = float(m.group(1))
			if 0 < v <= 60:  # plausible diamond carats; skip dropped-decimal misreads (e.g. "044")
				vals["diamond_weight"] = v
		m = _NOTE.search(text)
		if m:
			vals["note"] = m.group(1).replace(" ", "")
		frappe.db.set_value("Design Bank", r.name, vals, update_modified=False)
		if len(vals) > 1:
			filled += 1
		else:
			notext += 1
		if i % 50 == 0:
			frappe.db.commit()
			print(f"  ...{i}/{len(rows)}  filled={filled}")

	frappe.db.commit()
	print(f"\nOCR done — filled: {filled}  no-text: {notext}  missing-file: {missing}  errors: {errors}")
	return {"filled": filled, "no_text": notext, "missing": missing, "errors": errors, "checked": len(rows)}


# --- Folder -> tag (categorise designs by their original source folder) -------------

# The photos came from per-category folders in the Takeout zips. Map the MEANINGFUL ones
# to a clean tag; junk folders (batch dumps, person names, bare numbers, "OUT SIDE FILE")
# are intentionally omitted -> those records get no folder tag. Keys are whitespace-
# normalised (see _norm), so double-spaces in the originals still match.
_FOLDER_TAGS_RAW = {
	"(1) Dim Gents Ring 1001": "Gents Ring",
	"(2) Dim Ladies Ring 2001": "Ladies Ring",
	"(3) Dim Neck Set 3001": "Neck Set",
	"(4) Dim Pendant 4001": "Pendant",
	"(5) Dim Double Hook 5001": "Double Hook",
	"(6) Dim Stud 6001": "Stud",
	"(7) Dim Bracelet & Semi Round 7001": "Bracelet",
	"(8) Dim Bangle Full 8001": "Bangle",
	"(9) MAGIC COLLECTION 9001": "Magic",
	"(11) NOSPIN STUD": "Nose Pin Stud",
	"(12) BROOCH COLLECTION 12001": "Brooch",
	"(13) NOSE PIN COLLECTION 13001": "Nose Pin",
	"(14) NEW FLOWER 14001": "Flower",
	"(17) BLACK&WHITE COLLECTION 17001": "Black & White",
	"(19) CHANGEABLE STONE COLLECTION 19001": "Changeable Stone",
	"(20) COLOUR STONE COLLECTION 20001": "Colour Stone",
	"(21) FLORAL COLLECTION 21001": "Floral",
	"(22) HANGING COLLECTION 22001": "Hanging",
	"(23) HEART COLLECTION 23001": "Heart",
	"(24) JUMKA COLLECTION 24001": "Jhumka",
	"(25) KIDS COLLECTION 25001": "Kids",
	"(26) HAND MADE 26001": "Hand Made",
	"(28) MIRACLE PLATE COLLECTION 28001": "Miracle Plate",
	"(29) MOMS COLLECTION 29001": "Moms",
	"(30) NATURE COLLECTION 30001": "Nature",
	"(31) BAMBOO COLLECTION 31001": "Bamboo",
	"(32) PEACOCK COLLECTION 32001": "Peacock",
	"(33) PEARL COLLECTION 33001": "Pearl",
	"(34) CHANDELIER COLLECTION 34001": "Chandelier",
	"(37) SPRITUAL COLLECTION 37001": "Spiritual",
	"(38) WEDDING BAND COLLECTION 38001": "Wedding Band",
	"(45) ALPHABET COLLECTION 45001": "Alphabet",
	"(49) FILLIGRI COLLECTION 49001": "Filigree",
	"(50) COCKTAIL COLLECTION 50001": "Cocktail",
	"(52) SOLITIRE COLLECTION 52001": "Solitaire",
	"(53) THALI COLLECTION 53001": "Thali",
	"(54) BUTTERFLY COLLECTION 54001": "Butterfly",
	"(57) LEAF COLLECTION 57001": "Leaf",
	"(58) DANCING DIAMONDCOLLECTION 58001": "Dancing Diamond",
	"(61) NAVARATNA COLLECTION 61001": "Navaratna",
	"(65) COLOUR DIAMOND COLLECTION 65001": "Colour Diamond",
	"(66) HI-END JEWELLERY COLLECTION 66001": "Hi-End Jewellery",
	"(67) VANKI RING COLLECTION 67001": "Vanki Ring",
	"(69) CHOKER NECK COLLECTION 69001": "Choker",
	"(70) TRADITIONAL COLLECTION 70001": "Traditional",
	"(72) TEENAGE COLLECTION 72001": "Teenage",
	"(73) WAVE COLLECTION 73001": "Wave",
	"(78) FANCY SHAPES COLLECTION 78001": "Fancy Shapes",
	"(81) NAME COLLECTION 81001": "Name",
	"(93) SWAN COLLECTION 93001": "Swan",
	"(96) PRESSURE SETTING COLLECTION": "Pressure Setting",
	"(97) CZ PLAIN GOLD": "CZ Plain Gold",
	"(100) SAMSA": "Samsa",
	"(A) RING 38001": "Ring",
	"ACCESSORIES": "Accessories",
	"Camiya 3D images": "3D Render",
}


def _norm(s):
	return re.sub(r"\s+", " ", (s or "").strip())


FOLDER_TAGS = {_norm(k): v for k, v in _FOLDER_TAGS_RAW.items()}


def _collection_num(folder):
	"""'(23) HEART COLLECTION 23001' -> 23."""
	m = re.match(r"\((\d+)\)", _norm(folder))
	return int(m.group(1)) if m else None


def _code_collection(design_no):
	"""Design codes encode the collection: 'B 23057' -> 23, 'A 1169' -> 1, '53134' -> 53."""
	m = re.search(r"\d{4,5}", design_no or "")
	return int(m.group(0)) // 1000 if m else None


def tag_from_folders(map_file=None):
	"""Tag each Design Bank record with its source-folder category (meaningful folders only).

	Needs a basename -> [folders] JSON built from the original Takeout zips (see
	scratchpad/build_b2f.py). Idempotent: add_tag skips tags already present, so this is
	safe to re-run.

	  bench --site <site> execute jewelima.jewelima.imports.import_design_bank.tag_from_folders --kwargs "{'map_file': '/path/design_bank_b2f.json'}"
	"""
	import json
	from collections import Counter, defaultdict

	map_file = map_file or frappe.get_site_path("design_bank_b2f.json")
	with open(map_file) as fh:
		b2f = json.load(fh)

	rows = frappe.get_all("Design Bank", fields=["name", "source_file", "design_no"])
	print(f"Records: {len(rows)}  basenames in map: {len(b2f)}")

	# Group records by original basename. Disambiguated records ("<folder> - <name>") carry
	# their real folder; plain records lost it in the flatten.
	by_base = defaultdict(list)
	for r in rows:
		sf = r.source_file or ""
		if sf in b2f:
			by_base[sf].append((r, None))  # plain (folder unknown)
		else:
			by_base[sf.rsplit(" - ", 1)[-1]].append((r, sf.split(" - ", 1)[0]))  # folder known

	# Decide ONE folder per record. A plain record's folder = the b2f folder NOT already
	# claimed by a disambiguated sibling (elimination); remaining ties are broken by the
	# design code's collection number, then round-robin.
	assignments = []  # (record_name, tag)
	notag = 0
	for base, items in by_base.items():
		all_folders = list(b2f.get(base, []))
		claimed = {_norm(k) for (_, k) in items if k}
		unclaimed = [f for f in all_folders if _norm(f) not in claimed]
		ui = 0
		for r, known in items:
			if known:
				folder = known
			elif len(unclaimed) == 1:
				folder = unclaimed[0]
			elif unclaimed:
				cc = _code_collection(r.design_no)
				pick = [f for f in unclaimed if _collection_num(f) == cc]
				folder = pick[0] if pick else unclaimed[ui % len(unclaimed)]
				ui += 1
			else:
				folder = all_folders[0] if all_folders else None
			tag = FOLDER_TAGS.get(_norm(folder)) if folder else None
			if tag:
				assignments.append((r.name, tag))
			else:
				notag += 1

	# Build the custom tag system: Design Tag masters + Design Bank Tag child rows.
	tally = Counter(t for _, t in assignments)
	for t in sorted(tally):
		if not frappe.db.exists("Design Tag", t):
			frappe.get_doc({"doctype": "Design Tag", "tag_name": t}).insert(ignore_permissions=True)
	frappe.db.commit()

	# Full rebuild of the folder tags: clear existing child rows, then bulk-insert. Re-running
	# is therefore idempotent (note: this also clears any manually-added tags).
	frappe.db.delete("Design Bank Tag")
	now = frappe.utils.now()
	vals = [
		(frappe.generate_hash(length=10), name, "Design Bank", "tags", tag, now, now, "Administrator", "Administrator", 0, 1)
		for name, tag in assignments
	]
	frappe.db.bulk_insert(
		"Design Bank Tag",
		fields=["name", "parent", "parenttype", "parentfield", "tag", "creation", "modified", "owner", "modified_by", "docstatus", "idx"],
		values=vals,
		ignore_duplicates=True,
	)
	frappe.db.commit()

	print(f"\nTagged: {len(assignments)}  no-meaningful-folder: {notag}")
	print(f"Distinct tags ({len(tally)}):")
	for t, c in tally.most_common():
		print(f"  {c:6d}  {t}")
	return {"tagged": len(assignments), "no_tag": notag, "tags": dict(tally)}


def dedupe(map_file=None):
	"""Remove byte-identical duplicate photos, keeping one per group.

	Reads {groups: {keep_source_file: [removed_source_file, ...]}} built by
	scratchpad/find_dupes.py (md5 over the design-bank folder). For each group it first
	merges the removed copies' tags into the kept record (so a design doesn't lose a
	category it was filed under), then bulk-deletes the duplicate records + their tag rows.
	The image FILES are deleted separately (host-side) using the same JSON.
	"""
	import json
	from collections import defaultdict

	map_file = map_file or frappe.get_site_path("design_bank_dupes.json")
	with open(map_file) as fh:
		groups = json.load(fh)["groups"]

	sf2name = {
		r.source_file: r.name
		for r in frappe.get_all("Design Bank", fields=["name", "source_file"])
	}

	pairs, involved, missing = [], set(), 0
	for keep_sf, removed_sfs in groups.items():
		kn = sf2name.get(keep_sf)
		if not kn:
			missing += 1
			continue
		rns = [sf2name[s] for s in removed_sfs if s in sf2name]
		pairs.append((kn, rns))
		involved.add(kn)
		involved.update(rns)

	# fetch tags for all involved records (chunked IN)
	tagmap = defaultdict(set)
	inv = list(involved)
	for i in range(0, len(inv), 2000):
		for tl in frappe.get_all(
			"Design Bank Tag", filters={"parent": ["in", inv[i : i + 2000]]}, fields=["parent", "tag"]
		):
			tagmap[tl.parent].add(tl.tag)

	now = frappe.utils.now()
	new_rows, to_delete, merged = [], [], 0
	for kn, rns in pairs:
		kt = tagmap[kn]
		for rn in rns:
			for t in tagmap.get(rn, ()):
				if t not in kt:
					new_rows.append(
						(frappe.generate_hash(length=10), kn, "Design Bank", "tags", t,
						 now, now, "Administrator", "Administrator", 0, 1)
					)
					kt.add(t)
					merged += 1
			to_delete.append(rn)

	if new_rows:
		frappe.db.bulk_insert(
			"Design Bank Tag",
			fields=["name", "parent", "parenttype", "parentfield", "tag", "creation", "modified", "owner", "modified_by", "docstatus", "idx"],
			values=new_rows,
			ignore_duplicates=True,
		)
		frappe.db.commit()

	for i in range(0, len(to_delete), 500):
		chunk = to_delete[i : i + 500]
		frappe.db.delete("Design Bank Tag", {"parent": ["in", chunk]})
		frappe.db.delete("Design Bank", {"name": ["in", chunk]})
		frappe.db.commit()

	print(f"Deduped — removed {len(to_delete)} records, merged {merged} tags, unresolved keeps {missing}.")
	return {"removed": len(to_delete), "merged_tags": merged, "missing_keep": missing}


def fix_copy_names():
	"""Repair design_no on Windows '- Copy' files (they came out as just 'Copy')."""
	pat = re.compile(r"(?i)^copy(\s*\d+)?$")
	rows = frappe.get_all(
		"Design Bank", filters={"design_no": ["like", "%opy%"]}, fields=["name", "design_no", "source_file"]
	)
	fixed = 0
	for r in rows:
		if not pat.match((r.design_no or "").strip()):
			continue
		stem = re.sub(r"\.[^.]+$", "", r.source_file or "")
		new = _design_no(stem)
		if new and new != r.design_no:
			frappe.db.set_value("Design Bank", r.name, "design_no", new, update_modified=False)
			fixed += 1
	frappe.db.commit()
	print(f"Fixed {fixed} 'Copy' design_no(s).")
	return {"fixed": fixed}


def list_duplicate_names(path):
	"""Write a CSV of every design code that appears on 2+ (different-image) records, so it
	can be reviewed. Columns: design_no, images, source_file, gross_weight, diamond_weight, tags."""
	import csv
	from collections import defaultdict

	dups = frappe.db.sql(
		"SELECT design_no FROM `tabDesign Bank` GROUP BY design_no HAVING COUNT(*) > 1", pluck=True
	)
	rows = frappe.get_all(
		"Design Bank",
		filters={"design_no": ["in", dups]},
		fields=["name", "design_no", "source_file", "gross_weight", "diamond_weight"],
		order_by="design_no",
	)
	counts = defaultdict(int)
	for r in rows:
		counts[r.design_no] += 1
	tagmap = defaultdict(list)
	names = [r.name for r in rows]
	for i in range(0, len(names), 2000):
		for tl in frappe.get_all(
			"Design Bank Tag", filters={"parent": ["in", names[i : i + 2000]]}, fields=["parent", "tag"]
		):
			tagmap[tl.parent].append(tl.tag)

	with open(path, "w", newline="") as fh:
		w = csv.writer(fh)
		w.writerow(["design_no", "images", "source_file", "gross_weight", "diamond_weight", "tags"])
		for r in rows:
			w.writerow([
				r.design_no, counts[r.design_no], r.source_file,
				r.gross_weight or "", r.diamond_weight or "", ", ".join(tagmap.get(r.name, [])),
			])
	print(f"Wrote {len(rows)} rows ({len(dups)} codes) -> {path}")
	return {"codes": len(dups), "rows": len(rows), "path": path}
