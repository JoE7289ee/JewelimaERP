# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
"""Whitelisted APIs for the Design Bank gallery + tag manager (custom Design Tag system)."""

import re

import frappe
from frappe import _


# --- Tags --------------------------------------------------------------------------

@frappe.whitelist()
def get_tags(with_counts=1):
	"""All Design Tags (name + colour), optionally with how many designs carry each.
	(Design Tag is the BANK's master — the Selection catalog has its own Selection
	Tag, managed on the selection-tags page.)"""
	tags = frappe.get_all("Design Tag", fields=["name as tag", "color"], order_by="tag_name asc")
	if int(with_counts or 0):
		counts = dict(
			frappe.db.sql("SELECT tag, COUNT(*) FROM `tabDesign Bank Tag` GROUP BY tag")
		)
		for t in tags:
			t["count"] = int(counts.get(t["tag"], 0))
	return tags


@frappe.whitelist()
def create_tag(tag_name, color=None):
	tag_name = (tag_name or "").strip()
	if not tag_name:
		frappe.throw(_("Tag name is required"))
	if frappe.db.exists("Design Tag", tag_name):
		frappe.throw(_("Tag '{0}' already exists").format(tag_name))
	doc = frappe.get_doc(
		{"doctype": "Design Tag", "tag_name": tag_name, "color": color or "#6b7280"}
	).insert(ignore_permissions=True)
	return {"tag": doc.name, "color": doc.color, "count": 0}


@frappe.whitelist()
def rename_tag(old, new):
	new = (new or "").strip()
	if not new:
		frappe.throw(_("New name is required"))
	if old == new:
		return {"tag": new}
	# rename_doc cascades the Link references in `Design Bank Tag`
	frappe.rename_doc("Design Tag", old, new, force=True)
	frappe.db.commit()
	return {"tag": new}


@frappe.whitelist()
def delete_tag(tag_name):
	frappe.db.delete("Design Bank Tag", {"tag": tag_name})
	frappe.delete_doc("Design Tag", tag_name, force=True, ignore_permissions=True)
	frappe.db.commit()
	return {"ok": 1}


@frappe.whitelist()
def set_tag_color(tag_name, color):
	frappe.db.set_value("Design Tag", tag_name, "color", color)
	frappe.db.commit()
	return {"ok": 1}


# --- Designs -----------------------------------------------------------------------

@frappe.whitelist()
def get_designs(search=None, tags=None, match="any", start=0, limit=60, mode="info"):
	"""Paginated designs, optionally filtered by a text search on design_no and/or tags.

	match: 'any' (has any selected tag) or 'all' (has every selected tag).
	Returns {rows: [{name, design_no, image, gross_weight, diamond_weight, note, tags:[...]}],
	         total, start, limit}.
	"""
	start, limit = int(start), int(limit)
	tags = frappe.parse_json(tags) if isinstance(tags, str) else (tags or [])
	tags = [t for t in tags if t]

	params, join, where = [], "", "WHERE 1=1"
	if tags:
		ph = ", ".join(["%s"] * len(tags))
		if match == "all":
			join = (
				f"JOIN (SELECT parent FROM `tabDesign Bank Tag` WHERE tag IN ({ph}) "
				f"GROUP BY parent HAVING COUNT(DISTINCT tag) = %s) ft ON ft.parent = db.name"
			)
			params += list(tags) + [len(tags)]
		else:
			join = (
				f"JOIN (SELECT DISTINCT parent FROM `tabDesign Bank Tag` WHERE tag IN ({ph})) "
				f"ft ON ft.parent = db.name"
			)
			params += list(tags)
	if search:
		where += " AND db.design_no LIKE %s"
		params.append("%" + search.strip() + "%")

	total = frappe.db.sql(
		f"SELECT COUNT(*) FROM `tabDesign Bank` db {join} {where}", params
	)[0][0]
	# the gallery's three faces — one dedicated image field each, the card
	# (info) always the fallback so nothing tiles blank
	img_expr = {
		"print": "COALESCE(NULLIF(db.photo, ''), db.image)",
		"customer": "COALESCE(NULLIF(db.customer_image, ''), db.image)",
	}.get(mode, "db.image")
	rows = frappe.db.sql(
		f"""SELECT db.name, db.design_no, {img_expr} AS image, db.gross_weight, db.diamond_weight, db.note
		    FROM `tabDesign Bank` db {join} {where}
		    ORDER BY db.design_no LIMIT %s, %s""",
		params + [start, limit],
		as_dict=True,
	)

	names = [r.name for r in rows]
	tagmap = {}
	if names:
		for tl in frappe.get_all(
			"Design Bank Tag", filters={"parent": ["in", names]}, fields=["parent", "tag"]
		):
			tagmap.setdefault(tl.parent, []).append(tl.tag)
	for r in rows:
		r["tags"] = tagmap.get(r.name, [])

	return {"rows": rows, "total": int(total), "start": start, "limit": limit}


@frappe.whitelist()
def set_design_tags(designs, add=None, remove=None):
	"""Add and/or remove tags on a set of designs (gallery bulk-tagging)."""
	designs = frappe.parse_json(designs) if isinstance(designs, str) else designs
	add = frappe.parse_json(add) if isinstance(add, str) else (add or [])
	remove = frappe.parse_json(remove) if isinstance(remove, str) else (remove or [])

	for t in add:
		if not frappe.db.exists("Design Tag", t):
			frappe.get_doc({"doctype": "Design Tag", "tag_name": t}).insert(ignore_permissions=True)

	for d in designs:
		doc = frappe.get_doc("Design Bank", d)
		current = {row.tag for row in doc.tags}
		changed = False
		for t in add:
			if t not in current:
				doc.append("tags", {"tag": t})
				changed = True
		if remove:
			kept = [row for row in doc.tags if row.tag not in remove]
			if len(kept) != len(doc.tags):
				doc.tags = kept
				changed = True
		if changed:
			doc.save(ignore_permissions=True)

	frappe.db.commit()
	return {"ok": 1, "count": len(designs)}


# --- Manual create (the "Add Design" page) -----------------------------------------

def _clean_prefix(text):
	"""Leading non-numeric part of the user's input: 'A 9' / 'A' -> 'A', 'BA 5256 RG' -> 'BA'."""
	return re.split(r"\d", (text or "").strip(), 1)[0].strip()


@frappe.whitelist()
def check_design_no(design_no):
	"""Does this exact design_no already exist? (for the Check button)."""
	design_no = (design_no or "").strip()
	if not design_no:
		return {"empty": True, "exists": False, "design_no": design_no}
	return {"empty": False, "exists": bool(frappe.db.exists("Design Bank", {"design_no": design_no})), "design_no": design_no}


@frappe.whitelist()
def next_design_no(prefix=None):
	"""Next unused design_no for a prefix: '<prefix> <max+1>'. Empty prefix -> next plain number.
	The user fills the prefix ('half'); this completes it with a number never used before."""
	clean = _clean_prefix(prefix)
	if clean:
		pat = re.compile(r"^" + re.escape(clean) + r"\s+0*(\d+)\b")
		maxn = 0
		for (dn,) in frappe.db.sql("SELECT design_no FROM `tabDesign Bank` WHERE design_no LIKE %s", (clean + " %",)):
			m = pat.match(dn or "")
			if m:
				maxn = max(maxn, int(m.group(1)))
		n = maxn + 1
		make = lambda i: f"{clean} {i}"
	else:
		row = frappe.db.sql("SELECT MAX(CAST(design_no AS UNSIGNED)) FROM `tabDesign Bank` WHERE design_no REGEXP '^[0-9]+$'")
		n = int(row[0][0] or 0) + 1
		make = lambda i: str(i)
	cand = make(n)
	while frappe.db.exists("Design Bank", {"design_no": cand}):
		n += 1
		cand = make(n)
	return {"design_no": cand, "prefix": clean, "number": n}


@frappe.whitelist()
def create_design_bank(design_no, gross_weight=None, diamond_weight=None, note=None, image=None, tags=None):
	"""Create a Design Bank entry from the Add Design page. Unknown tags are created."""
	design_no = (design_no or "").strip()
	if not design_no:
		frappe.throw(_("Design No is required"))
	if frappe.db.exists("Design Bank", {"design_no": design_no}):
		frappe.throw(_("Design No '{0}' already exists").format(design_no))

	tags = frappe.parse_json(tags) if isinstance(tags, str) else (tags or [])
	tags = [t.strip() for t in tags if t and t.strip()]
	for t in tags:
		if not frappe.db.exists("Design Tag", t):
			frappe.get_doc({"doctype": "Design Tag", "tag_name": t}).insert(ignore_permissions=True)

	doc = frappe.get_doc(
		{
			"doctype": "Design Bank",
			"design_no": design_no,
			"gross_weight": frappe.utils.flt(gross_weight) or None,
			"diamond_weight": frappe.utils.flt(diamond_weight) or None,
			"note": (note or "").strip() or None,
			"image": image or None,
			"tags": [{"tag": t} for t in tags],
		}
	).insert(ignore_permissions=True)

	# bind the uploaded image (uploaded with no parent on the page) to this record
	if image:
		for fn in frappe.get_all(
			"File", filters={"file_url": image, "attached_to_name": ["in", ["", None]]}, pluck="name"
		):
			frappe.db.set_value(
				"File", fn,
				{"attached_to_doctype": "Design Bank", "attached_to_name": doc.name, "attached_to_field": "image"},
			)

	frappe.db.commit()
	return {"name": doc.name, "design_no": doc.design_no}


# --- Retire / delete (the "Retire Design" page) ------------------------------------

@frappe.whitelist()
def get_design_bank_detail(name):
	"""Full detail for one catalog entry + whether it has been used to create a Design
	(Design.design_bank). used_by non-empty => deletion is blocked."""
	if not name or not frappe.db.exists("Design Bank", name):
		frappe.throw(_("Select a design first"))
	d = frappe.db.get_value(
		"Design Bank", name,
		["name", "design_no", "image", "gross_weight", "diamond_weight", "note"],
		as_dict=True,
	)
	d["tags"] = frappe.get_all("Design Bank Tag", filters={"parent": name}, pluck="tag")
	d["used_by"] = frappe.get_all("Design", filters={"design_bank": name}, pluck="name")
	d["can_delete"] = not d["used_by"]
	return d


@frappe.whitelist()
def delete_design_bank(name):
	"""Permanently remove a catalog entry — ONLY if no Design was created from it."""
	frappe.only_for(["System Manager", "Stock Manager"])
	if not name or not frappe.db.exists("Design Bank", name):
		frappe.throw(_("Not found"))
	used = frappe.get_all("Design", filters={"design_bank": name}, pluck="name")
	if used:
		frappe.throw(_("Cannot delete — this design was used to create Design(s): {0}").format(", ".join(used)))
	design_no = frappe.db.get_value("Design Bank", name, "design_no")
	frappe.delete_doc("Design Bank", name, ignore_permissions=True)  # tags + uploaded image File cascade
	frappe.db.commit()
	return {"ok": 1, "design_no": design_no}


@frappe.whitelist()
def get_duplicate_queue(start=0, limit=20):
	"""The one-time dedupe queue: cards flagged duplicate_review with every
	candidate image (the card's own + each folded-in review image)."""
	rows = frappe.get_all("Design Bank", filters={"duplicate_review": 1},
		fields=["name", "design_no", "image", "raw_image", "source_file"],
		order_by="design_no", start=int(start), limit=int(limit))
	total = frappe.db.count("Design Bank", {"duplicate_review": 1})
	for r in rows:
		r["candidates"] = [{"image": r.raw_image or r.image, "source_file": r.source_file, "main": 1}] + [
			{"image": x.image, "source_file": x.source_file, "main": 0}
			for x in frappe.get_all("Design Bank Review Image",
				filters={"parent": r.name}, fields=["image", "source_file"], order_by="idx")]
	return {"rows": rows, "total": total}


@frappe.whitelist()
def resolve_duplicate(name, image):
	"""ONE photo wins: it becomes the card's raw source, the review rows clear,
	duplicate_review drops — the card now flows into the rebuild + review pipe."""
	d = frappe.get_doc("Design Bank", name)
	if not d.duplicate_review:
		frappe.throw(frappe._("{0} is not awaiting duplicate review.").format(d.design_no))
	d.raw_image = image
	d.image = d.image or image
	d.set("review_images", [])
	d.duplicate_review = 0
	d.rebuilt = 0  # re-enter the crop+rebuild queue with the chosen photo
	d.flags.ignore_version = True
	d.save(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": 1, "left": frappe.db.count("Design Bank", {"duplicate_review": 1})}


@frappe.whitelist()
def get_review_queue(start=0):
	"""Next cards for review: rebuilt, not duplicate-flagged, still Pending."""
	filters = {"status": "Pending", "rebuilt": 1, "duplicate_review": 0}
	rows = frappe.get_all("Design Bank", filters=filters,
		fields=["name"], order_by="design_no", start=int(start), limit=1)
	total = frappe.db.count("Design Bank", filters)
	if not rows:
		return {"total": total, "card": None}
	from jewelima.jewelima.api import get_design_card
	card = get_design_card(rows[0].name)
	d = frappe.db.get_value("Design Bank", rows[0].name,
		["raw_image", "customer_image", "customer_image_needed"], as_dict=True)
	card.update({"raw_image": d.raw_image or "", "customer_image": d.customer_image or "",
		"customer_image_needed": d.customer_image_needed})
	return {"total": total, "card": card}


@frappe.whitelist()
def review_save(payload):
	"""Review corrections: values re-render the card; checkboxes stick; optional
	approve (needs design type); optional PERMANENT raw delete (file off disk)."""
	from jewelima.jewelima.api import save_design_card
	p = frappe.parse_json(payload) if isinstance(payload, str) else payload
	res = save_design_card(json.dumps({k: p.get(k) for k in
		("name", "design_no", "design_type", "gross_weight", "diamond_weight",
		 "note", "extra_lines", "photo", "stones")}))
	d = frappe.get_doc("Design Bank", res["name"])
	d.photoupdate = 1 if p.get("photoupdate") else 0
	d.customer_image_needed = 1 if p.get("customer_image_needed") else 0
	if p.get("approve"):
		d.status = "Approved"  # validate() enforces design_type
	if p.get("delete_raw") and d.raw_image:
		delete_raw_forever(d)
	d.flags.ignore_version = True
	d.save(ignore_permissions=True)
	frappe.db.commit()
	return {"name": d.name, "status": d.status, "image": d.image}


def delete_raw_forever(d):
	"""The raw scan leaves the SYSTEM: field cleared, File docs gone, and the
	actual file removed from disk (this is how the month-long cleanup frees space)."""
	import os
	from urllib.parse import unquote
	url = d.raw_image
	d.raw_image = ""
	for fn in frappe.get_all("File", filters={"file_url": url}, pluck="name"):
		frappe.delete_doc("File", fn, force=True, ignore_permissions=True)
	try:
		path = frappe.get_site_path("public", unquote(url).lstrip("/"))
		if os.path.exists(path) and "/files/" in url:
			os.remove(path)
	except Exception:
		pass


@frappe.whitelist()
def design_bank_report():
	"""The Design Bank KPI board."""
	c = lambda f=None: frappe.db.count("Design Bank", f)
	return {"kpis": [
		("Total Designs", c()),
		("Approved", c({"status": "Approved"})),
		("In Review Queue", c({"status": "Pending", "rebuilt": 1, "duplicate_review": 0})),
		("In Duplicate Queue", c({"duplicate_review": 1})),
		("Awaiting Rebuild (OCR/crop)", c({"rebuilt": 0, "duplicate_review": 0})),
		("Raw Images Left", c({"raw_image": ["is", "set"]})),
		("Photo Change Pending", c({"photoupdate": 1})),
		("Customer Photos Pending", c({"customer_image_needed": 1, "customer_image": ["is", "not set"]})),
		("Customer Photos Done", c({"customer_image": ["is", "set"]})),
		("Retired", c({"status": "Retired"})),
		("Dye Available", c({"dye_available": 1})),
		("Linked to ERP Designs", frappe.db.count("Design Bank Design Link")),
	]}
