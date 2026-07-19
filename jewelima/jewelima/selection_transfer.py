# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
"""
Selection catalog export / import — move the whole photo book to another system.

One ZIP carries everything:

    manifest.json             {version, site, exported_on, photos, selections}
    photos.json               [{code, design_type, provider, stock_pcs,
                                gold_gms, cts, active, tags:[...], image}]
    selections.json           [{party, selection_date, batch, remarks, photos:[codes]}]
    images/<code>.ext         the photo itself

PHOTO CODE IS THE KEY. Import upserts on it: "skip" leaves existing photos
alone, "update" refreshes their meta + image. Design Type / Supplier (provider)
/ Design Tag are simple masters, created on the fly when absent — the file is
self-contained on purpose, nothing must pre-exist on the target.

Selection records travel too (a selection is party + date + the picked codes).
On import a selection is recreated only if the same party+date+codes set isn't
already there, so re-importing the same file never duplicates them.
"""

import io
import json
import os
import zipfile

import frappe
from frappe.utils import flt, cint

VERSION = 1


def _ensure(doctype, value, namefield=None):
	"""Plain masters (Design Type / Design Tag / Supplier) — create when missing."""
	if not value or frappe.db.exists(doctype, value):
		return value
	doc = {"doctype": doctype}
	if namefield:
		doc[namefield] = value
	else:
		doc["__newname"] = value
	if doctype == "Supplier":
		doc["supplier_group"] = frappe.db.get_value("Supplier Group", {}, "name")
	frappe.get_doc(doc).insert(ignore_permissions=True)
	return value


def _photo_payload(design_type=None, provider=None):
	filters = {}
	if design_type:
		filters["design_type"] = design_type
	if provider:
		filters["provider"] = provider
	rows = frappe.get_all("Selection Photo", filters=filters,
		fields=["name", "code", "design_type", "provider", "stock_pcs",
			"gold_gms", "cts", "active", "image"],
		order_by="code", limit_page_length=0)
	tags = {}
	for t in frappe.db.sql("""SELECT parent, tag FROM `tabSelection Photo Tag`
		WHERE parenttype='Selection Photo' ORDER BY idx""", as_dict=True):
		tags.setdefault(t.parent, []).append(t.tag)
	for r in rows:
		r["tags"] = tags.get(r.name, [])
		del r["name"]
	return rows


def _selection_payload():
	sels = frappe.get_all("Selection",
		fields=["name", "party", "selection_date", "batch", "remarks"],
		order_by="selection_date, creation", limit_page_length=0)
	items = {}
	for i in frappe.db.sql("""SELECT parent, photo FROM `tabSelection Item` ORDER BY idx""", as_dict=True):
		items.setdefault(i.parent, []).append(i.photo)
	out = []
	for s in sels:
		out.append({"party": s.party, "selection_date": str(s.selection_date or ""),
			"batch": s.batch or "", "remarks": s.remarks or "",
			"photos": items.get(s.name, [])})
	return out


@frappe.whitelist()
def preview_export(design_type=None, provider=None):
	"""What the current filters would put in the zip."""
	frappe.only_for(("System Manager", "Stock Manager"))
	photos = _photo_payload(design_type, provider)
	return {"photos": len(photos), "with_image": len([p for p in photos if p.get("image")]),
		"selections": frappe.db.count("Selection")}


@frappe.whitelist()
def export_selection(design_type=None, provider=None):
	"""Stream the zip: every matching photo (meta + image) + every Selection record."""
	frappe.only_for(("System Manager", "Stock Manager"))
	photos = _photo_payload(design_type, provider)
	if not photos:
		frappe.throw(frappe._("No photos match — nothing to export."))
	selections = _selection_payload()

	buf = io.BytesIO()
	with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
		for p in photos:
			img = p.get("image") or ""
			if not img.startswith("/files/") and not img.startswith("/private/files/"):
				p["image"] = ""
				continue
			parts = img.lstrip("/").split("/")
			path = frappe.get_site_path("public" if parts[0] == "files" else "", *parts)
			if not os.path.exists(path):
				p["image"] = ""
				continue
			arc = "images/{0}{1}".format(p["code"].replace("/", "-"), os.path.splitext(img)[1] or ".jpg")
			z.write(path, arc)
			p["image"] = arc
		z.writestr("photos.json", json.dumps(photos, indent=1))
		z.writestr("selections.json", json.dumps(selections, indent=1))
		z.writestr("manifest.json", json.dumps({
			"version": VERSION, "site": frappe.local.site,
			"exported_on": str(frappe.utils.now()),
			"photos": len(photos), "selections": len(selections),
		}, indent=1))

	frappe.local.response.filename = "selection-{0}-{1}.zip".format(frappe.utils.today(), len(photos))
	frappe.local.response.filecontent = buf.getvalue()
	frappe.local.response.type = "binary"


@frappe.whitelist()
def inspect_import(file_url):
	"""Read the zip WITHOUT writing: what's inside, and how much is new here."""
	frappe.only_for(("System Manager", "Stock Manager"))
	path = _resolve_upload(file_url)
	with zipfile.ZipFile(path) as z:
		if "photos.json" not in z.namelist():
			frappe.throw(frappe._("Not a selection export — photos.json is missing."))
		manifest = json.loads(z.read("manifest.json")) if "manifest.json" in z.namelist() else {}
		photos = json.loads(z.read("photos.json"))
		selections = json.loads(z.read("selections.json")) if "selections.json" in z.namelist() else []
		new = existing = 0
		for p in photos:
			if frappe.db.exists("Selection Photo", (p.get("code") or "").strip()):
				existing += 1
			else:
				new += 1
	return {"manifest": manifest, "photos": len(photos), "new": new, "existing": existing,
		"selections": len(selections)}


def _resolve_upload(file_url):
	parts = (file_url or "").lstrip("/").split("/")
	path = frappe.get_site_path("public" if parts[0] == "files" else "", *parts)
	if not os.path.exists(path):
		frappe.throw(frappe._("Upload the export .zip first."))
	return path


def _restore_image(z, arc, code):
	if not arc or arc not in z.namelist():
		return ""
	ext = os.path.splitext(arc)[1] or ".jpg"
	folder = frappe.get_site_path("public", "files", "selection")
	os.makedirs(folder, exist_ok=True)
	fname = "{0}{1}".format(code.replace("/", "-"), ext)
	with open(os.path.join(folder, fname), "wb") as f:
		f.write(z.read(arc))
	return "/files/selection/{0}".format(frappe.utils.quoted(fname))


@frappe.whitelist()
def import_selection(file_url, mode="skip", with_selections=1):
	"""Upsert the catalog from an exported zip. Keyed on photo CODE.
	mode: skip (default) | update. with_selections=0 imports the photos only."""
	frappe.only_for(("System Manager", "Stock Manager"))
	path = _resolve_upload(file_url)

	created = updated = skipped = sel_created = sel_skipped = 0
	errors = []
	with zipfile.ZipFile(path) as z:
		if "photos.json" not in z.namelist():
			frappe.throw(frappe._("Not a selection export — photos.json is missing."))
		photos = json.loads(z.read("photos.json"))
		for p in photos:
			code = (p.get("code") or "").strip()
			if not code:
				continue
			try:
				exists = frappe.db.exists("Selection Photo", code)
				if exists and mode != "update":
					skipped += 1
					continue
				_ensure("Design Type", p.get("design_type"))
				_ensure("Supplier", p.get("provider"), "supplier_name")
				for t in p.get("tags") or []:
					_ensure("Selection Tag", t, "tag_name")
				img = _restore_image(z, p.get("image"), code)

				vals = {
					"design_type": p.get("design_type") or None,
					"provider": p.get("provider") or None,
					"stock_pcs": cint(p.get("stock_pcs")),
					"gold_gms": flt(p.get("gold_gms")),
					"cts": flt(p.get("cts")),
					"active": 1 if p.get("active") in (1, "1", True, None) else 0,
				}
				if exists:
					doc = frappe.get_doc("Selection Photo", code)
					doc.update(vals)
					if img:
						doc.image = img
					doc.set("tags", [{"tag": t} for t in (p.get("tags") or [])])
					doc.save(ignore_permissions=True)
					updated += 1
				else:
					frappe.get_doc({
						"doctype": "Selection Photo", "code": code, "image": img or None,
						"tags": [{"tag": t} for t in (p.get("tags") or [])], **vals,
					}).insert(ignore_permissions=True)
					created += 1
			except Exception as e:
				errors.append({"code": code, "error": str(e)[:160]})

		if cint(with_selections) and "selections.json" in z.namelist():
			# a selection already here = same party + date + the same set of codes
			have = set()
			for s in frappe.get_all("Selection", fields=["name", "party", "selection_date"], limit_page_length=0):
				codes = frozenset(frappe.get_all("Selection Item", filters={"parent": s.name}, pluck="photo"))
				have.add((s.party, str(s.selection_date or ""), codes))
			for s in json.loads(z.read("selections.json")):
				codes = [c for c in (s.get("photos") or []) if frappe.db.exists("Selection Photo", c)]
				if not codes:
					continue
				key = (s.get("party"), s.get("selection_date") or "", frozenset(codes))
				if key in have:
					sel_skipped += 1
					continue
				try:
					if not frappe.db.exists("Customer", s.get("party")):
						errors.append({"code": "selection", "error": "party missing: " + str(s.get("party"))})
						continue
					frappe.get_doc({
						"doctype": "Selection", "party": s["party"],
						"selection_date": s.get("selection_date") or frappe.utils.today(),
						"batch": s.get("batch") or None, "remarks": s.get("remarks") or "",
						"items": [{"photo": c} for c in codes],
					}).insert(ignore_permissions=True)
					have.add(key)
					sel_created += 1
				except Exception as e:
					errors.append({"code": "selection", "error": str(e)[:160]})

	frappe.db.commit()
	return {"created": created, "updated": updated, "skipped": skipped,
		"selections_created": sel_created, "selections_skipped": sel_skipped, "errors": errors}
