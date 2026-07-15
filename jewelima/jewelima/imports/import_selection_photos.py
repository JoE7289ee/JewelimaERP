# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
"""
Selection photo import — loads a day's selection cards into the catalog.

Photos live per batch (the folder name, e.g. "14-07-26") at:
    <site>/public/files/selection/<batch>/

The code is the filename stem (SM-05.jpeg -> SM-05). The printed GOLD / CTS lines
are filled by ocr_fill() where tesseract is available; until then they stay blank
and the Selection page just counts photos.

Manual runs:
  bench --site <site> execute jewelima.jewelima.imports.import_selection_photos.run --kwargs "{'batch': '14-07-26'}"
  bench --site <site> execute jewelima.jewelima.imports.import_selection_photos.ocr_fill --kwargs "{'batch': '14-07-26'}"
"""

import os
import re
from urllib.parse import quote

import frappe

IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".webp")
FOLDER = "selection"  # under <site>/public/files/


def _dir(batch):
	return frappe.get_site_path("public", "files", FOLDER, batch)


def run(batch):
	"""Create one Selection Photo per image in the batch folder. Idempotent."""
	d = _dir(batch)
	if not os.path.isdir(d):
		frappe.throw("No such folder: {0}".format(d))
	made = skipped = 0
	for fn in sorted(os.listdir(d)):
		if not fn.lower().endswith(IMAGE_EXTS):
			continue
		code = os.path.splitext(fn)[0].strip()
		src = "{0}/{1}/{2}".format(FOLDER, batch, fn)
		if frappe.db.exists("Selection Photo", {"source_file": src}) or frappe.db.exists("Selection Photo", code):
			skipped += 1
			continue
		frappe.get_doc({
			"doctype": "Selection Photo", "code": code, "batch": batch,
			"image": "/files/{0}/{1}/{2}".format(FOLDER, quote(batch), quote(fn)),
			"source_file": src, "active": 1,
		}).insert(ignore_permissions=True)
		made += 1
	frappe.db.commit()
	out = {"batch": batch, "created": made, "skipped": skipped}
	print("Selection photos:", out)
	return out


# the printed card reads e.g. "GOLD - 11 gms" and "CTS - 0.90 cts"
_GOLD_RE = re.compile(r"GOLD\s*[-–:]?\s*([\d.]+)\s*(?:GMS|GM|G)\b", re.I)
_CTS_RE = re.compile(r"CTS?\s*[-–:]?\s*([\d.]+)\s*(?:CTS|CT)\b", re.I)


def ocr_fill(batch=None, limit=500):
	"""Fill gold_gms / cts by OCR-ing the cards. Needs tesseract + pytesseract."""
	try:
		import pytesseract
		from PIL import Image
	except ImportError:
		frappe.throw("pytesseract / Pillow not installed — cannot OCR.")

	filters = {"gold_gms": 0}
	if batch:
		filters["batch"] = batch
	rows = frappe.get_all("Selection Photo", filters=filters, fields=["name", "source_file"], limit=limit)
	done = 0
	for r in rows:
		path = frappe.get_site_path("public", "files", *r.source_file.split("/"))
		if not os.path.exists(path):
			continue
		try:
			text = pytesseract.image_to_string(Image.open(path))
		except Exception:
			continue
		g = _GOLD_RE.search(text)
		c = _CTS_RE.search(text)
		vals = {}
		if g:
			vals["gold_gms"] = float(g.group(1))
		if c:
			vals["cts"] = float(c.group(1))
		if vals:
			frappe.db.set_value("Selection Photo", r.name, vals, update_modified=False)
			done += 1
	frappe.db.commit()
	print("OCR filled:", done, "of", len(rows))
	return {"filled": done, "scanned": len(rows)}
