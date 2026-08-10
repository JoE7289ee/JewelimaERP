# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
"""Whitelisted APIs for the Design Bank gallery + tag manager (custom Design Tag system)."""

import json
import re

import frappe
from frappe import _

# Server-side write gates. The catalog pages hide edit UI from read-only
# roles (Jewelima Info), but whitelisted methods are callable by ANY logged-in
# user — so every mutator checks roles itself. Editors work the catalog;
# only approvers touch the review / approve / purge lane.
DESIGN_EDITOR_ROLES = {"System Manager", "Jewelima Design Bank", "Jewelima Design Approver", "Jewelima Graphics"}
DESIGN_APPROVER_ROLES = {"System Manager", "Jewelima Design Approver", "Jewelima Graphics"}


def _require(roles):
	if not roles & set(frappe.get_roles()):
		frappe.throw(_("Not permitted"), frappe.PermissionError)



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
	_require(DESIGN_EDITOR_ROLES)
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
	_require(DESIGN_EDITOR_ROLES)
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
	_require(DESIGN_EDITOR_ROLES)
	frappe.db.delete("Design Bank Tag", {"tag": tag_name})
	frappe.delete_doc("Design Tag", tag_name, force=True, ignore_permissions=True)
	frappe.db.commit()
	return {"ok": 1}


@frappe.whitelist()
def set_tag_color(tag_name, color):
	_require(DESIGN_EDITOR_ROLES)
	frappe.db.set_value("Design Tag", tag_name, "color", color)
	frappe.db.commit()
	return {"ok": 1}


# --- Designs -----------------------------------------------------------------------

@frappe.whitelist()
def get_designs(search=None, tags=None, match="any", start=0, limit=60, mode="info",
		design_type=None, gw_min=None, gw_max=None, dw_min=None, dw_max=None):
	"""Paginated designs, optionally filtered by a text search on design_no and/or tags.

	match: 'any' (has any selected tag) or 'all' (has every selected tag).
	Returns {rows: [{name, design_no, image, gross_weight, diamond_weight, note, tags:[...]}],
	         total, start, limit}.
	"""
	start, limit = int(start), int(limit)
	tags = frappe.parse_json(tags) if isinstance(tags, str) else (tags or [])
	tags = [t for t in tags if t]

	# the gallery is the SELLING face — approved cards only
	params, join, where = [], "", "WHERE db.status = 'Approved'"
	if design_type:
		where += " AND db.design_type = %s"
		params.append(design_type)
	for cond, val in ((" AND db.gross_weight >= %s", gw_min), (" AND db.gross_weight <= %s", gw_max),
			(" AND db.diamond_weight >= %s", dw_min), (" AND db.diamond_weight <= %s", dw_max)):
		if val not in (None, "", 0, "0"):
			where += cond
			params.append(float(val))
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
		f"""SELECT db.name, db.design_no, {img_expr} AS image, db.gross_weight, db.diamond_weight, db.note, db.modified
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
	_require(DESIGN_EDITOR_ROLES)
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
	_require(DESIGN_EDITOR_ROLES)
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
	"""ONE photo wins: it becomes the card's raw source and every LOSING
	candidate is deleted from the system FOREVER (File docs + disk). The card
	then re-enters the crop+rebuild pipe and flows to Review."""
	_require(DESIGN_APPROVER_ROLES)
	d = frappe.get_doc("Design Bank", name)
	if not d.duplicate_review:
		frappe.throw(frappe._("{0} is not awaiting duplicate review.").format(d.design_no))
	losers = {u for u in ([d.raw_image or d.image] + [r.image for r in d.review_images])
		if u and u != image}
	for u in losers:
		_delete_bank_file(d.name, u)
	d.raw_image = image
	if d.image in losers or not d.image:
		d.image = image
	d.set("review_images", [])
	d.duplicate_review = 0
	d.rebuilt = 0  # re-enter the crop+rebuild queue with the chosen photo
	d.flags.ignore_version = True
	d.save(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": 1, "deleted": len(losers), "left": frappe.db.count("Design Bank", {"duplicate_review": 1})}


@frappe.whitelist()
def get_review_queue(start=0):
	"""Next cards for review: rebuilt, not duplicate-flagged, still Pending."""
	filters = {"status": "Pending", "rebuilt": 1, "duplicate_review": 0}
	rows = frappe.get_all("Design Bank", filters=filters,
		fields=["name"], order_by="priority desc, design_no", start=int(start), limit=1)
	total = frappe.db.count("Design Bank", filters)
	if not rows:
		return {"total": total, "card": None}
	from jewelima.jewelima.api import get_design_card
	card = get_design_card(rows[0].name)
	d = frappe.db.get_value("Design Bank", rows[0].name,
		["raw_image", "customer_image", "customer_image_needed", "customer_image_update"], as_dict=True)
	card.update({"raw_image": d.raw_image or "", "customer_image": d.customer_image or "",
		"customer_image_needed": d.customer_image_needed, "customer_image_update": d.customer_image_update,
		"priority": frappe.utils.cint(frappe.db.get_value("Design Bank", rows[0].name, "priority"))})
	return {"total": total, "card": card}


@frappe.whitelist()
def get_review_card(q):
	"""Search-and-approve: pull ONE card into the review pane by design no
	(exact first, else best like-match; Pending preferred)."""
	q = (q or "").strip()
	if not q:
		frappe.throw(_("Type a design number."))
	nm = frappe.db.get_value("Design Bank", {"design_no": q}, "name")
	if not nm:
		# v16 get_all forbids expressions in order_by — raw SQL for the ranking
		hits = frappe.db.sql("""select name from `tabDesign Bank`
			where design_no like %s
			order by (status = 'Pending') desc, design_no limit 1""", "%" + q + "%")
		nm = hits[0][0] if hits else None
	if not nm:
		frappe.throw(_("No design matches {0}.").format(q))
	from jewelima.jewelima.api import get_design_card
	card = get_design_card(nm)
	d = frappe.db.get_value("Design Bank", nm,
		["raw_image", "customer_image", "customer_image_needed", "customer_image_update", "priority"], as_dict=True)
	card.update({"raw_image": d.raw_image or "", "customer_image": d.customer_image or "",
		"customer_image_needed": d.customer_image_needed, "customer_image_update": d.customer_image_update,
		"priority": frappe.utils.cint(d.priority)})
	return {"card": card}


@frappe.whitelist()
def review_save(payload):
	"""Review corrections: values re-render the card; checkboxes stick; optional
	approve (needs design type); optional PERMANENT raw delete (file off disk)."""
	_require(DESIGN_APPROVER_ROLES)
	from jewelima.jewelima.api import save_design_card
	p = frappe.parse_json(payload) if isinstance(payload, str) else payload
	res = save_design_card(json.dumps({k: p.get(k) for k in
		("name", "design_no", "design_type", "gross_weight", "diamond_weight",
		 "note", "extra_lines", "photo", "stones")}))
	d = frappe.get_doc("Design Bank", res["name"])
	d.photoupdate = 1 if p.get("photoupdate") else 0
	d.customer_image_needed = 1 if p.get("customer_image_needed") else 0
	d.customer_image_update = 1 if p.get("customer_image_update") else 0
	if p.get("approve"):
		d.status = "Approved"  # validate() enforces design_type
		d.priority = 0         # the P-flag is a QUEUE marker — done once approved
	if p.get("retire"):
		d.status = "Retired"   # code stays reserved forever; sales returns still resolve
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
		("Prioritised in Queue", c({"status": "Pending", "rebuilt": 1, "duplicate_review": 0, "priority": [">", 0]})),
		("In Duplicate Queue", c({"duplicate_review": 1})),
		("Awaiting Rebuild (OCR/crop)", c({"rebuilt": 0, "duplicate_review": 0})),
		("Raw Images Left", c({"raw_image": ["is", "set"]})),
		("Photo Change Pending", c({"photoupdate": 1, "pending_photo": ["is", "not set"]})),
		("Awaiting Photo Approval", c({"pending_photo": ["is", "set"]})),
		("Customer Photos Pending", c({"customer_image_needed": 1, "customer_image": ["is", "not set"]})),
		("Customer Photos Done", c({"customer_image": ["is", "set"]})),
		("New In-House Designs", c({"provider": ["is", "not set"], "design_no": ["like", "J%-%"]})),
		("Provider Pieces", c({"provider": ["is", "set"]})),
		("Retired", c({"status": "Retired"})),
		("Dye Available", c({"dye_available": 1})),
		("Linked to ERP Designs", frappe.db.count("Design Bank Design Link")),
	], "series": _series_breakdown(), "coverage": {
		"total": c(),
		"approved": c({"status": "Approved"}),
		"pending": c({"status": "Pending"}),
		"retired": c({"status": "Retired"}),
		"with_photo": c({"photo": ["is", "set"]}),
		"customer_done": c({"customer_image": ["is", "set"]}),
		"variants": frappe.db.count("Design"),
	}}


def _series_breakdown():
	# per-Design-Type counts of minted series codes (JB-1, JR-S-4, ...)
	out = []
	for dt in frappe.get_all("Design Type", filters={"bank_code": ["is", "set"]},
			fields=["name", "bank_code"], order_by="bank_code"):
		n = frappe.db.count("Design Bank", {"design_no": ["like", dt.bank_code + "-%"]})
		if n:
			out.append((f"{dt.name} ({dt.bank_code})", n))
	return out


# ---------------------------------------------------------------------------
# Photo Update workflow: flagged card -> worker uploads a candidate (PENDING,
# nothing replaced) -> approver compares old vs new -> APPROVE kills the old
# photo forever (disk + File docs), promotes the new one and re-renders the
# card; REJECT bins the candidate and the card stays on the queue.
# ---------------------------------------------------------------------------
@frappe.whitelist()
def get_photo_update_queue(start=0, limit=30, scope="update"):
	"""Cards flagged Upgrade Photo that have NO candidate yet. Clean split:
	scope='update' = NOT yet approved; scope='urgent' = already Approved (live)."""
	filters = {"photoupdate": 1, "pending_photo": ["is", "not set"]}
	filters["status"] = "Approved" if scope == "urgent" else ["!=", "Approved"]
	rows = frappe.get_all("Design Bank", filters=filters,
		fields=["name", "design_no", "photo", "image", "raw_image", "status", "modified"],
		order_by="design_no", start=int(start), limit=int(limit))
	return {"rows": rows, "total": frappe.db.count("Design Bank", filters)}


@frappe.whitelist()
def submit_photo_update(name, image_b64):
	"""The worker's upload — parked as the PENDING candidate, named
	<code>.pending.png. Replaces a prior unapproved candidate."""
	_require(DESIGN_EDITOR_ROLES)
	import base64
	from jewelima.jewelima.api import _db_img_name
	d = frappe.get_doc("Design Bank", name)
	if not image_b64 or not image_b64.startswith("data:"):
		frappe.throw(frappe._("Upload the new photo."))
	from jewelima.jewelima.api import _write_slot_file
	_delete_bank_file(d.name, d.pending_photo)
	head, b64 = image_b64.split(",", 1)
	d.pending_photo = _write_slot_file(d.name, _db_img_name(d.design_no, "pending"),
		base64.b64decode(b64))
	d.pending_photo_by = frappe.session.user
	d.photo_rejected = 0  # a fresh candidate clears the rejection flag
	d.flags.ignore_version = True
	d.save(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": 1}


@frappe.whitelist()
def get_photo_approval_queue(start=0, limit=30):
	"""Candidates waiting for the approver: old photo vs new, side by side."""
	filters = {"pending_photo": ["is", "set"]}
	rows = frappe.get_all("Design Bank", filters=filters,
		fields=["name", "design_no", "photo", "pending_photo", "pending_photo_by", "image", "modified"],
		order_by="modified", start=int(start), limit=int(limit))
	return {"rows": rows, "total": frappe.db.count("Design Bank", filters)}


@frappe.whitelist()
def get_customer_photo_queue(start=0, limit=30):
	"""Customer Photos page: best-sellers flagged 'customer image needed' that
	have no customer image yet."""
	filters = {"customer_image_needed": 1, "customer_image": ["is", "not set"]}
	rows = frappe.get_all("Design Bank", filters=filters,
		fields=["name", "design_no", "photo", "image", "raw_image", "modified"],
		order_by="design_no", start=int(start), limit=int(limit))
	return {"rows": rows, "total": frappe.db.count("Design Bank", filters),
		"done": frappe.db.count("Design Bank", {"customer_image": ["is", "set"]})}


@frappe.whitelist()
def submit_customer_photo(name, image_b64):
	"""Store the customer-facing image as <code>.customer.png (replacing any
	prior one) and clear the needed-flag. No approval leg — customer shots go
	live directly."""
	_require(DESIGN_EDITOR_ROLES)
	import base64
	from jewelima.jewelima.api import _db_img_name
	d = frappe.get_doc("Design Bank", name)
	if not image_b64 or not image_b64.startswith("data:"):
		frappe.throw(frappe._("Upload the customer image."))
	from jewelima.jewelima.api import _write_slot_file
	_delete_bank_file(d.name, d.customer_image)
	head, b64 = image_b64.split(",", 1)
	d.customer_image = _write_slot_file(d.name, _db_img_name(d.design_no, "customer"),
		base64.b64decode(b64))
	d.customer_image_needed = 0
	d.flags.ignore_version = True
	d.save(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": 1, "customer_image": d.customer_image}


def _delete_bank_file(name, url):
	"""A design-bank image leaves the SYSTEM: File docs + the disk file."""
	import os
	from urllib.parse import unquote
	if not url:
		return
	for fn in frappe.get_all("File", filters={"file_url": url}, pluck="name"):
		frappe.delete_doc("File", fn, force=True, ignore_permissions=True)
	try:
		path = frappe.get_site_path("public", unquote(url).lstrip("/"))
		if "/files/" in url and os.path.exists(path):
			os.remove(path)
	except Exception:
		pass


@frappe.whitelist()
def approve_photo_update(name):
	"""APPROVE: the old product photo is deleted FOREVER, the candidate becomes
	<code>.photo.png, the info card re-renders, both flags clear."""
	_require(DESIGN_APPROVER_ROLES)
	import base64
	from io import BytesIO
	from jewelima.jewelima.api import _card_compose, _db_img_name, _cad_image_any
	d = frappe.get_doc("Design Bank", name)
	if not d.pending_photo:
		frappe.throw(frappe._("{0} has no pending photo.").format(d.design_no))
	new_img = _cad_image_any(d.pending_photo)
	if not new_img:
		frappe.throw(frappe._("Couldn't read the pending photo."))
	from jewelima.jewelima.api import _write_slot_file
	_delete_bank_file(d.name, d.photo)
	buf = BytesIO()
	new_img.save(buf, "PNG")
	new_url = _write_slot_file(d.name, _db_img_name(d.design_no, "photo"), buf.getvalue())
	_delete_bank_file(d.name, d.pending_photo)
	d.photo = new_url
	d.pending_photo = ""
	d.pending_photo_by = ""
	d.photoupdate = 0
	if d.status == "Pending":
		# a fresh approved photo puts the card FIRST in line for review
		top = frappe.db.sql("""select coalesce(max(priority), 0) from `tabDesign Bank`
			where status = 'Pending'""")[0][0]
		d.priority = max(int(top) + 1, 11)
	# re-render the info card with the approved photo
	payload = {"design_no": d.design_no, "design_type": d.design_type,
		"gross_weight": d.gross_weight, "diamond_weight": d.diamond_weight,
		"note": d.note, "extra_lines": d.extra_lines, "photo": d.photo,
		"stones": [{"stone": x.stone, "sieve": x.sieve, "pcs": x.pcs, "ct": x.ct} for x in d.stones]}
	buf2 = BytesIO()
	_card_compose(payload).save(buf2, "PNG")
	d.image = _write_slot_file(d.name, _db_img_name(d.design_no, "info"), buf2.getvalue())
	d.flags.ignore_version = True
	d.save(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": 1, "left": frappe.db.count("Design Bank", {"pending_photo": ["is", "set"]})}


@frappe.whitelist()
def reject_photo_update(name):
	"""REJECT: the candidate is binned; the card stays on the update queue AND is
	flagged into the Rejection bucket so the uploader can retry."""
	_require(DESIGN_APPROVER_ROLES)
	d = frappe.get_doc("Design Bank", name)
	_delete_bank_file(d.name, d.pending_photo)
	d.pending_photo = ""
	d.pending_photo_by = ""
	d.photo_rejected = 1
	d.flags.ignore_version = True
	d.save(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": 1, "left": frappe.db.count("Design Bank", {"pending_photo": ["is", "set"]})}


# ---------------------------------------------------------------------------
# Customer Update workflow: an existing customer photo flagged for replacement
# -> worker uploads a candidate (PENDING) -> approver approves (old customer
# image deleted forever, candidate promoted) or rejects (retry bucket).
# Mirrors the product Photo Update flow; the customer image is NOT on the info
# card, so nothing is re-rendered.
# ---------------------------------------------------------------------------
@frappe.whitelist()
def get_customer_update_queue(start=0, limit=30):
	"""Cards flagged Customer-photo-update with NO candidate yet."""
	filters = {"customer_image_update": 1, "pending_customer_image": ["is", "not set"]}
	rows = frappe.get_all("Design Bank", filters=filters,
		fields=["name", "design_no", "photo", "image", "customer_image", "modified"],
		order_by="design_no", start=int(start), limit=int(limit))
	return {"rows": rows, "total": frappe.db.count("Design Bank", filters)}


@frappe.whitelist()
def submit_customer_update(name, image_b64):
	"""Worker's replacement customer shot — parked as the PENDING candidate."""
	_require(DESIGN_EDITOR_ROLES)
	import base64
	from jewelima.jewelima.api import _db_img_name, _write_slot_file
	d = frappe.get_doc("Design Bank", name)
	if not image_b64 or not image_b64.startswith("data:"):
		frappe.throw(frappe._("Upload the new customer photo."))
	_delete_bank_file(d.name, d.pending_customer_image)
	head, b64 = image_b64.split(",", 1)
	d.pending_customer_image = _write_slot_file(d.name, _db_img_name(d.design_no, "pendingcust"),
		base64.b64decode(b64))
	d.pending_customer_image_by = frappe.session.user
	d.customer_photo_rejected = 0  # fresh candidate clears the rejection flag
	d.flags.ignore_version = True
	d.save(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": 1}


@frappe.whitelist()
def get_customer_approval_queue(start=0, limit=30):
	"""Customer-photo candidates waiting for the approver: old vs new."""
	filters = {"pending_customer_image": ["is", "set"]}
	rows = frappe.get_all("Design Bank", filters=filters,
		fields=["name", "design_no", "customer_image", "pending_customer_image",
			"pending_customer_image_by", "image", "modified"],
		order_by="modified", start=int(start), limit=int(limit))
	return {"rows": rows, "total": frappe.db.count("Design Bank", filters)}


@frappe.whitelist()
def approve_customer_update(name):
	"""APPROVE: old customer image deleted FOREVER, candidate promoted to
	<code>.customer.png; both flags clear."""
	_require(DESIGN_APPROVER_ROLES)
	from io import BytesIO
	from jewelima.jewelima.api import _db_img_name, _cad_image_any, _write_slot_file
	d = frappe.get_doc("Design Bank", name)
	if not d.pending_customer_image:
		frappe.throw(frappe._("{0} has no pending customer photo.").format(d.design_no))
	new_img = _cad_image_any(d.pending_customer_image)
	if not new_img:
		frappe.throw(frappe._("Couldn't read the pending customer photo."))
	_delete_bank_file(d.name, d.customer_image)
	buf = BytesIO()
	new_img.save(buf, "PNG")
	d.customer_image = _write_slot_file(d.name, _db_img_name(d.design_no, "customer"), buf.getvalue())
	_delete_bank_file(d.name, d.pending_customer_image)
	d.pending_customer_image = ""
	d.pending_customer_image_by = ""
	d.customer_image_update = 0
	d.customer_photo_rejected = 0
	d.flags.ignore_version = True
	d.save(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": 1, "left": frappe.db.count("Design Bank", {"pending_customer_image": ["is", "set"]})}


@frappe.whitelist()
def reject_customer_update(name):
	"""REJECT: candidate binned; card stays on the customer-update queue AND is
	flagged into the Rejection bucket."""
	_require(DESIGN_APPROVER_ROLES)
	d = frappe.get_doc("Design Bank", name)
	_delete_bank_file(d.name, d.pending_customer_image)
	d.pending_customer_image = ""
	d.pending_customer_image_by = ""
	d.customer_photo_rejected = 1
	d.flags.ignore_version = True
	d.save(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": 1, "left": frappe.db.count("Design Bank", {"pending_customer_image": ["is", "set"]})}


@frappe.whitelist()
def approve_photo_updates_bulk(names):
	"""Glance-and-go: approve many product-photo candidates in one shot. Bad ones
	are rejected individually first; this approves everything left selected."""
	_require(DESIGN_APPROVER_ROLES)
	names = frappe.parse_json(names) if isinstance(names, str) else (names or [])
	done, failed = 0, []
	for n in names:
		try:
			approve_photo_update(n)
			done += 1
		except Exception:
			failed.append(n)
	return {"done": done, "failed": failed,
		"left": frappe.db.count("Design Bank", {"pending_photo": ["is", "set"]})}


@frappe.whitelist()
def approve_customer_updates_bulk(names):
	"""Bulk-approve customer-photo candidates (same glance-and-go flow)."""
	_require(DESIGN_APPROVER_ROLES)
	names = frappe.parse_json(names) if isinstance(names, str) else (names or [])
	done, failed = 0, []
	for n in names:
		try:
			approve_customer_update(n)
			done += 1
		except Exception:
			failed.append(n)
	return {"done": done, "failed": failed,
		"left": frappe.db.count("Design Bank", {"pending_customer_image": ["is", "set"]})}


@frappe.whitelist()
def get_rejection_queue(start=0, limit=60):
	"""Every design whose product or customer photo candidate was rejected — the
	uploader retries here (they also remain in their normal update queue)."""
	rows = frappe.db.sql("""
		select name, design_no, photo, image, customer_image, modified,
			photo_rejected, customer_photo_rejected
		from `tabDesign Bank`
		where photo_rejected = 1 or customer_photo_rejected = 1
		order by modified desc limit %s offset %s""", (int(limit), int(start)), as_dict=True)
	total = frappe.db.sql("""select count(*) from `tabDesign Bank`
		where photo_rejected = 1 or customer_photo_rejected = 1""")[0][0]
	return {"rows": rows, "total": total}


@frappe.whitelist()
def get_photo_kpi():
	"""Live counts for every Graphics bucket + a few 'done' totals for the
	Photo KPI dashboard."""
	c = frappe.db.count
	pu = {"photoupdate": 1, "pending_photo": ["is", "not set"]}
	buckets = {
		"photo_update": c("Design Bank", dict(pu, status=["!=", "Approved"])),
		"photo_urgent": c("Design Bank", dict(pu, status="Approved")),
		"photo_queue": c("Design Bank", {"product_photo_pending": 1}),
		"customer_add": c("Design Bank", {"customer_image_needed": 1, "customer_image": ["is", "not set"]}),
		"customer_update": c("Design Bank", {"customer_image_update": 1, "pending_customer_image": ["is", "not set"]}),
		"product_approvals": c("Design Bank", {"pending_photo": ["is", "set"]}),
		"customer_approvals": c("Design Bank", {"pending_customer_image": ["is", "set"]}),
		"rejections": frappe.db.sql("""select count(*) from `tabDesign Bank`
			where photo_rejected = 1 or customer_photo_rejected = 1""")[0][0],
	}
	done = {
		"approved_total": c("Design Bank", {"status": "Approved"}),
		"customer_done": c("Design Bank", {"customer_image": ["is", "set"]}),
		"with_photo": c("Design Bank", {"photo": ["is", "set"]}),
		"total": c("Design Bank", {}),
	}
	return {"buckets": buckets, "done": done}


@frappe.whitelist()
def search_designs(q, limit=60):
	"""Search Design page: ANY status including Retired. Shows the RAW image
	unless the card is Approved (then the info card); click = download raw."""
	q = (q or "").strip()
	if not q:
		return {"rows": []}
	rows = frappe.db.sql("""select name, design_no, status, image, raw_image, photo, priority, modified
		from `tabDesign Bank`
		where design_no like %s
		order by (status = 'Approved') desc, design_no limit %s""",
		("%" + q + "%", int(limit)), as_dict=True)
	for r in rows:
		r["display"] = r.image if r.status == "Approved" else (r.raw_image or r.photo or r.image or "")
		r["raw"] = r.raw_image or r.photo or r.image or ""
	return {"rows": rows}


@frappe.whitelist()
def get_old_categories():
	"""Old Categories page: every pre-import source folder with its card count.
	Pure reference — nothing here touches the tag system."""
	rows = frappe.db.sql("""select source_folder, count(*) c from `tabDesign Bank`
		where ifnull(source_folder, '') != '' group by source_folder order by source_folder""")
	return {"folders": [{"folder": r[0], "count": r[1]} for r in rows]}


@frappe.whitelist()
def get_old_category_designs(folder, start=0, limit=60, subtree=0):
	"""The cards that lived in one old folder (read-only browse). subtree=1
	includes every folder underneath (a parent shows its whole branch)."""
	filters = ({"source_folder": ["like", folder + "%"]} if int(subtree or 0)
		else {"source_folder": folder})
	rows = frappe.get_all("Design Bank", filters=filters,
		fields=["name", "design_no", "status", "image", "raw_image", "photo", "priority", "modified"],
		order_by="design_no", start=int(start), limit=int(limit))
	for r in rows:
		r["display"] = r.image if r.status == "Approved" else (r.raw_image or r.photo or r.image or "")
	return {"rows": rows, "total": frappe.db.count("Design Bank", filters)}


@frappe.whitelist()
def set_design_priority(names, priority):
	allowed = {"System Manager", "Jewelima Design Bank", "Jewelima Design Approver"}
	if not allowed & set(frappe.get_roles()):
		frappe.throw("Not permitted to set priorities")
	"""Bulk-stamp review priority on picked cards (Old Categories selection)."""
	names = frappe.parse_json(names) if isinstance(names, str) else (names or [])
	priority = int(priority or 0)
	for nm in names:
		frappe.db.set_value("Design Bank", nm, "priority", priority, update_modified=False)
	frappe.db.commit()
	return {"updated": len(names), "priority": priority}


@frappe.whitelist()
def set_design_retired(names):
	"""Bulk-retire picked cards (Old Categories selection). Approver only —
	codes stay reserved forever, same as a Review-page retire."""
	allowed = {"System Manager", "Jewelima Design Approver", "Jewelima Design Bank"}
	if not allowed & set(frappe.get_roles()):
		frappe.throw("Not permitted to retire designs")
	names = frappe.parse_json(names) if isinstance(names, str) else (names or [])
	done = 0
	for nm in names:
		if frappe.db.get_value("Design Bank", nm, "status") != "Retired":
			frappe.db.set_value("Design Bank", nm, "status", "Retired", update_modified=False)
			done += 1
	frappe.db.commit()
	return {"retired": done}


@frappe.whitelist()
def get_retired_designs(start=0, limit=60, q=None):
	"""The Retired shelf — codes stay reserved, but junk scans that were never
	real designs can be purged from here."""
	filters = {"status": "Retired"}
	if q:
		filters["design_no"] = ["like", "%" + q.strip() + "%"]
	rows = frappe.get_all("Design Bank", filters=filters,
		fields=["name", "design_no", "image", "raw_image", "photo", "source_folder"],
		order_by="design_no", start=int(start), limit=int(limit))
	for r in rows:
		r["display"] = r.raw_image or r.photo or r.image or ""
	return {"rows": rows, "total": frappe.db.count("Design Bank", filters)}


@frappe.whitelist()
def design_bring_back(name):
	"""Un-retire: back to Pending — it rejoins the Review queue."""
	allowed = {"System Manager", "Jewelima Design Approver"}
	if not allowed & set(frappe.get_roles()):
		frappe.throw("Not permitted")
	d = frappe.get_doc("Design Bank", name)
	if d.status != "Retired":
		frappe.throw(frappe._("{0} is not retired.").format(d.design_no or name))
	frappe.db.set_value("Design Bank", name, {"status": "Pending", "rebuilt": 1}, update_modified=False)
	frappe.db.commit()
	return {"name": name, "design_no": d.design_no, "status": "Pending"}


@frappe.whitelist()
def design_delete_forever(name):
	"""PURGE a retired card that was never a real design: every image (raw,
	photo, info card, customer, pending) leaves the disk, every File doc goes,
	and the record itself is deleted — the code becomes reusable again."""
	_require(DESIGN_APPROVER_ROLES)
	d = frappe.get_doc("Design Bank", name)
	if d.status != "Retired":
		frappe.throw(frappe._("Only RETIRED cards can be purged — retire {0} first.").format(d.design_no))
	for url in {d.raw_image, d.photo, d.image, d.customer_image, d.pending_photo}:
		if url:
			_delete_bank_file(d.name, url)
	for r in d.review_images:
		_delete_bank_file(d.name, r.image)
	for f in frappe.get_all("File", filters={"attached_to_doctype": "Design Bank",
			"attached_to_name": d.name}, pluck="name"):
		frappe.delete_doc("File", f, force=True, ignore_permissions=True)
	dn = d.design_no
	frappe.delete_doc("Design Bank", name, force=True, ignore_permissions=True)
	frappe.db.commit()
	return {"deleted": dn, "left": frappe.db.count("Design Bank", {"status": "Retired"})}
