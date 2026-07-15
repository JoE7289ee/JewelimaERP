# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
"""
Design bank export / import engine.

One ZIP carries everything a design needs to live on another site:

    manifest.json            {version, site, exported_on, count}
    designs.json             [{design_name, design_type, design_style, status,
                               image, materials:[{item, qty, weight}], ...}]
    images/<design_name>.ext the photo, if the design has one

DESIGN NAME IS THE KEY. Import upserts on it, so the same file can be re-imported
safely: "skip" leaves existing designs alone, "update" refreshes type/style/photo/BOM.

The Item + BOM are NOT exported as records — the Design controller provisions them
on insert. What must already exist on the target site are the RAW MATERIAL items
(they carry purity / stone_type); a design referencing a missing item is reported,
never guessed. Design Type / Design Style are simple masters, so they're created
on the fly when absent.
"""

import io
import json
import os
import zipfile

import frappe
from frappe.utils import flt

VERSION = 1
DESIGN_FIELDS = ("design_name", "design_type", "design_style", "status", "image")


def _payload(designs=None, design_type=None, status=None):
	filters = {}
	if designs:
		filters["name"] = ["in", designs]
	if design_type:
		filters["design_type"] = design_type
	if status:
		filters["status"] = status
	names = frappe.get_all("Design", filters=filters, order_by="design_name", pluck="name")
	out = []
	for nm in names:
		d = frappe.get_doc("Design", nm)
		out.append({
			"design_name": d.design_name,
			"design_type": d.design_type,
			"design_style": d.design_style,
			"status": d.status or "Active",
			"image": d.image or "",
			"materials": [
				{"item": m.item, "qty": flt(m.qty), "weight": flt(m.weight)}
				for m in d.materials if m.item
			],
		})
	return out


@frappe.whitelist()
def list_designs(design_type=None, status=None, search=None):
	"""The pick-list for export: every design with what it carries."""
	frappe.only_for(("System Manager", "Stock Manager"))
	filters = {}
	if design_type:
		filters["design_type"] = design_type
	if status:
		filters["status"] = status
	if search:
		filters["design_name"] = ["like", "%{0}%".format(search)]
	rows = frappe.get_all("Design", filters=filters,
		fields=["name", "design_name", "design_type", "design_style", "status", "image"],
		order_by="design_name", limit_page_length=0)
	counts = {}
	for r in frappe.db.sql("""SELECT parent, COUNT(*) n FROM `tabDesign BOM Item`
		WHERE parenttype='Design' GROUP BY parent""", as_dict=True):
		counts[r.parent] = r.n
	for r in rows:
		r["materials"] = counts.get(r.name, 0)
		r["has_photo"] = 1 if r.get("image") else 0
	return rows


@frappe.whitelist()
def inspect_import(file_url):
	"""Read an export .zip WITHOUT writing anything: what's inside, and for each
	design whether it's new here, already exists, or can't land (missing material)."""
	frappe.only_for(("System Manager", "Stock Manager"))
	parts = (file_url or "").lstrip("/").split("/")
	path = frappe.get_site_path("public" if parts[0] == "files" else "", *parts)
	if not os.path.exists(path):
		frappe.throw(frappe._("Upload the export .zip first."))
	with zipfile.ZipFile(path) as z:
		if "designs.json" not in z.namelist():
			frappe.throw(frappe._("Not a design export — designs.json is missing."))
		manifest = json.loads(z.read("manifest.json")) if "manifest.json" in z.namelist() else {}
		rows = json.loads(z.read("designs.json"))
		out = []
		for r in rows:
			nm = (r.get("design_name") or "").strip()
			mats = [m for m in (r.get("materials") or []) if m.get("item")]
			missing = sorted({m["item"] for m in mats if not frappe.db.exists("Item", m["item"])})
			out.append({
				"design_name": nm, "design_type": r.get("design_type"),
				"design_style": r.get("design_style"), "status": r.get("status"),
				"materials": len(mats), "has_photo": 1 if r.get("image") else 0,
				"exists": bool(frappe.db.exists("Design", nm)),
				"missing": missing,
				"blocked": bool(missing) or not mats,
			})
	return {"manifest": manifest, "designs": out}


@frappe.whitelist()
def export_designs(designs=None, design_type=None, status=None):
	"""Stream a .zip of the chosen designs (photo + BOM + masters)."""
	frappe.only_for(("System Manager", "Stock Manager"))
	if isinstance(designs, str):
		designs = json.loads(designs or "[]") or None

	rows = _payload(designs, design_type, status)
	if not rows:
		frappe.throw(frappe._("No designs match — nothing to export."))

	buf = io.BytesIO()
	with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
		for r in rows:
			img = r.get("image") or ""
			if not img.startswith("/files/") and not img.startswith("/private/files/"):
				continue
			parts = img.lstrip("/").split("/")
			path = frappe.get_site_path("public" if parts[0] == "files" else "", *parts)
			if not os.path.exists(path):
				r["image"] = ""      # photo gone from disk — export the design without it
				continue
			arc = "images/{0}{1}".format(r["design_name"], os.path.splitext(img)[1] or ".jpg")
			z.write(path, arc)
			r["image"] = arc         # rewritten to the in-zip path
		z.writestr("designs.json", json.dumps(rows, indent=1))
		z.writestr("manifest.json", json.dumps({
			"version": VERSION, "site": frappe.local.site,
			"exported_on": str(frappe.utils.now()), "count": len(rows),
		}, indent=1))

	frappe.local.response.filename = "designs-{0}-{1}.zip".format(frappe.utils.today(), len(rows))
	frappe.local.response.filecontent = buf.getvalue()
	frappe.local.response.type = "binary"


@frappe.whitelist()
def preview_export(design_type=None, status=None):
	"""How many designs the current filters would export."""
	frappe.only_for(("System Manager", "Stock Manager"))
	rows = _payload(None, design_type, status)
	return {"count": len(rows), "with_photo": len([r for r in rows if r.get("image")]),
		"materials": sum(len(r["materials"]) for r in rows)}


def _restore_image(z, arc, design_name):
	"""Write an in-zip photo back into the site's files, return its /files URL."""
	if not arc or arc not in z.namelist():
		return ""
	ext = os.path.splitext(arc)[1] or ".jpg"
	folder = frappe.get_site_path("public", "files", "designs")
	os.makedirs(folder, exist_ok=True)
	fname = "{0}{1}".format(design_name.replace("/", "-"), ext)
	with open(os.path.join(folder, fname), "wb") as f:
		f.write(z.read(arc))
	return "/files/designs/{0}".format(frappe.utils.quoted(fname))


def _ensure(doctype, value):
	"""Design Type / Design Style are plain masters — create them if missing."""
	if not value or frappe.db.exists(doctype, value):
		return value
	frappe.get_doc({"doctype": doctype, "__newname": value}).insert(ignore_permissions=True)
	return value


@frappe.whitelist()
def import_designs(file_url, mode="skip", designs=None):
	"""Upsert designs from an exported .zip. Keyed on design_name.
	mode: skip (default) | update. `designs` = only import these names (all if empty)."""
	frappe.only_for(("System Manager", "Stock Manager"))
	if isinstance(designs, str):
		designs = json.loads(designs or "[]")
	wanted = set(designs or [])
	parts = (file_url or "").lstrip("/").split("/")
	path = frappe.get_site_path("public" if parts[0] == "files" else "", *parts)
	if not os.path.exists(path):
		frappe.throw(frappe._("Upload the export .zip first."))

	created = updated = skipped = 0
	errors = []
	with zipfile.ZipFile(path) as z:
		if "designs.json" not in z.namelist():
			frappe.throw(frappe._("Not a design export — designs.json is missing."))
		rows = json.loads(z.read("designs.json"))
		for r in rows:
			nm = (r.get("design_name") or "").strip()
			if not nm or (wanted and nm not in wanted):
				continue
			try:
				mats = [m for m in (r.get("materials") or []) if m.get("item")]
				missing = [m["item"] for m in mats if not frappe.db.exists("Item", m["item"])]
				if missing:
					errors.append({"design": nm, "error": "missing raw material: " + ", ".join(sorted(set(missing)))})
					continue
				if not mats:
					errors.append({"design": nm, "error": "no BOM materials"})
					continue

				exists = frappe.db.exists("Design", nm)
				if exists and mode != "update":
					skipped += 1
					continue

				_ensure("Design Type", r.get("design_type"))
				_ensure("Design Style", r.get("design_style"))
				img = _restore_image(z, r.get("image"), nm)

				if exists:
					doc = frappe.get_doc("Design", nm)
					doc.design_type = r.get("design_type") or doc.design_type
					doc.design_style = r.get("design_style") or None
					doc.status = r.get("status") or "Active"
					if img:
						doc.image = img
					doc.set("materials", [{"item": m["item"], "qty": flt(m.get("qty")), "weight": flt(m.get("weight"))} for m in mats])
					doc.save(ignore_permissions=True)
					updated += 1
				else:
					frappe.get_doc({
						"doctype": "Design", "design_name": nm,
						"design_type": r.get("design_type"), "design_style": r.get("design_style") or None,
						"status": r.get("status") or "Active", "image": img or None,
						"materials": [{"item": m["item"], "qty": flt(m.get("qty")), "weight": flt(m.get("weight"))} for m in mats],
					}).insert(ignore_permissions=True)  # controller builds the Item + BOM
					created += 1
			except Exception as e:
				errors.append({"design": nm, "error": str(e)[:160]})
	frappe.db.commit()
	total = len([r for r in rows if not wanted or (r.get("design_name") or "").strip() in wanted])
	return {"created": created, "updated": updated, "skipped": skipped,
		"errors": errors, "total": total}
