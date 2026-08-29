# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
"""Load a printed album PDF into the selection catalogue as a collection.

The albums the trade sends carry everything the catalogue wants, printed under
each photo:

    StyleCode : CLP-0646
    18 KT Nwt : 8.25   14 KT Nwt : 7.26   9 KT Nwt : 6.17
    Dia wt : 83 / 0.311        CS wt : 0 / 0

so the weights arrive with the photos rather than being typed in afterwards.
Pieces land UNREVIEWED — the album is a supplier's word for it, and someone
here still confirms each piece on the Review page before a party can pick it.

Pairing a photo to its specs is by position, not by order: on every page each
image sits directly above its own block of text, so each image takes the style
code closest beneath it. Anything else (a banner, a logo) has no text under it
and is skipped.

  bench --site <site> execute jewelima.jewelima.imports.import_album_pdf.run \
    --kwargs "{'path': '/tmp/album.pdf', 'collection': 'Kinetic grace collection'}"

Add dry_run=1 to see what it WOULD do without writing anything.
"""

import io
import os
import re

import frappe
from frappe.utils import cint, flt

# how far under an image its own caption starts (points). The gap is the same
# on every page; anything further away belongs to a different piece.
CAPTION_GAP = 40
MIN_IMAGE_H = 100          # smaller than this is a banner, not a piece

_CODE = re.compile(r"StyleCode\s*:?\s*(\S+)", re.I)
_K18 = re.compile(r"18\s*KT\s*Nwt\s*:?\s*([\d.]+)", re.I)
_K14 = re.compile(r"14\s*KT\s*Nwt\s*:?\s*([\d.]+)", re.I)
_K9 = re.compile(r"9\s*KT\s*Nwt\s*:?\s*([\d.]+)", re.I)
_DIA = re.compile(r"Dia\s*wt\s*:?\s*(\d+)\s*/\s*([\d.]+)", re.I)
_CS = re.compile(r"CS\s*wt\s*:?\s*(\d+)\s*/\s*([\d.]+)", re.I)
# the header reads "QT No : <collection>   DATE : 20-May-2026" — the date is not
# part of the name, however the runs happen to be joined back together
_QT = re.compile(r"QT\s*No\s*:?\s*(.+?)\s*(?:\|?\s*DATE\b|$)", re.I)


def _mul(a, b):
	return [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
		a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
		a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]]


def _page_layout(page, reader):
	"""(images, text_runs) in real page points, so the two can be compared."""
	from pypdf.generic import ContentStream

	images, ctm, stack = [], [1, 0, 0, 1, 0, 0], []
	cs = ContentStream(page.get_contents(), reader)
	for ops, op in cs.operations:
		if op == b"q":
			stack.append(list(ctm))
		elif op == b"Q":
			ctm = stack.pop() if stack else [1, 0, 0, 1, 0, 0]
		elif op == b"cm":
			ctm = _mul([float(v) for v in ops], ctm)
		elif op == b"Do":
			images.append({"name": str(ops[0]).lstrip("/"), "y": ctm[5], "h": abs(ctm[3])})

	runs = []

	def visit(text, cm, tm, font, size):
		t = (text or "").strip()
		if t:
			m = _mul(tm, cm)
			runs.append({"y": m[5], "x": m[4], "t": t})

	page.extract_text(visitor_text=visit)
	return images, runs


def _caption_for(img, runs):
	"""The block of text belonging to this image: everything from the style code
	just beneath it down to the next piece's line."""
	below = [r for r in runs if r["y"] < img["y"] and img["y"] - r["y"] < CAPTION_GAP + 90]
	if not below:
		return ""
	# the caption starts at the highest line under the image
	top = max(r["y"] for r in below)
	if img["y"] - top > CAPTION_GAP:
		return ""            # nothing sits under this one — a banner
	block = [r for r in below if top - r["y"] < 90]
	return " ".join(r["t"] for r in sorted(block, key=lambda r: (-r["y"], r["x"])))


def read(path):
	"""Everything the album says, without touching the database."""
	from pypdf import PdfReader

	reader = PdfReader(path)
	pieces, collection = [], ""
	for pno, page in enumerate(reader.pages, start=1):
		images, runs = _page_layout(page, reader)
		if not collection:
			whole = " ".join(r["t"] for r in runs)
			m = _QT.search(whole)
			if m:
				collection = " ".join(m.group(1).split())
		# the content stream calls it /X4, page.images calls it X4.png — key on the
		# stem so the two actually meet
		named = {}
		for im in page.images:
			named[im.name] = im
			named[os.path.splitext(im.name)[0]] = im
		for img in sorted(images, key=lambda i: -i["y"]):
			if img["h"] < MIN_IMAGE_H:
				continue
			cap = _caption_for(img, runs)
			mc = _CODE.search(cap)
			if not mc:
				continue
			dia, cs_ = _DIA.search(cap), _CS.search(cap)
			blob = named.get(img["name"])
			pieces.append({
				"page": pno, "code": mc.group(1).strip().upper(),
				"gold_18k": flt(_K18.search(cap).group(1)) if _K18.search(cap) else 0,
				"gold_14k": flt(_K14.search(cap).group(1)) if _K14.search(cap) else 0,
				"gold_9k": flt(_K9.search(cap).group(1)) if _K9.search(cap) else 0,
				"dmd_no": cint(dia.group(1)) if dia else 0,
				"dmd_weight": flt(dia.group(2)) if dia else 0,
				"cs_no": cint(cs_.group(1)) if cs_ else 0,
				"cs_weight": flt(cs_.group(2)) if cs_ else 0,
				"image_name": img["name"],
				"_blob": blob,
			})
	return {"collection": collection, "pieces": pieces, "pages": len(reader.pages)}


def run(path, collection=None, provider=None, design_type=None, dry_run=0):
	"""Create one unreviewed Selection Photo per piece. Idempotent on the code."""
	if not os.path.isfile(path):
		frappe.throw("No such file: {0}".format(path))
	album = read(path)
	coll = collection or album["collection"] or os.path.basename(path).rsplit(".", 1)[0]
	pieces = album["pieces"]

	dupes = [p["code"] for p in pieces if frappe.db.exists("Selection Photo", p["code"])]
	blank = [p for p in pieces if not p["gold_18k"] and not p["gold_14k"] and not p["gold_9k"]]
	out = {"collection": coll, "pages": album["pages"], "found": len(pieces),
		"already_in": len(dupes), "without_weights": len(blank), "created": 0}

	if cint(dry_run):
		out["sample"] = pieces[:3] and [{k: v for k, v in pieces[0].items() if k != "_blob"}]
		out["duplicate_codes"] = dupes[:10]
		print(out)
		return out

	for p in pieces:
		if frappe.db.exists("Selection Photo", p["code"]):
			continue
		doc = frappe.get_doc({
			"doctype": "Selection Photo", "code": p["code"],
			"collection": coll, "provider": provider or None,
			"design_type": design_type or None,
			"gold_18k": p["gold_18k"], "gold_14k": p["gold_14k"], "gold_9k": p["gold_9k"],
			"dmd_no": p["dmd_no"], "dmd_weight": p["dmd_weight"],
			"cs_no": p["cs_no"], "cs_weight": p["cs_weight"],
			"active": 1, "reviewed": 0,        # the review desk confirms it
			# source_file is unique and a page carries two pieces, so name the
			# image as well — that is what actually identifies this one
			"source_file": "{0} p{1} {2}".format(
				os.path.basename(path), p["page"], p["image_name"]),
		}).insert(ignore_permissions=True)
		blob = p.get("_blob")
		if blob is not None:
			f = frappe.get_doc({
				"doctype": "File", "file_name": "{0}.png".format(p["code"]),
				"attached_to_doctype": "Selection Photo", "attached_to_name": doc.name,
				"is_private": 0, "content": blob.data,
			}).insert(ignore_permissions=True)
			doc.db_set("image", f.file_url, update_modified=False)
		out["created"] += 1
	frappe.db.commit()
	print("Album import:", out)
	return out
