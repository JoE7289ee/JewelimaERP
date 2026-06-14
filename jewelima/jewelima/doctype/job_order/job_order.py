# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime

CAD_STAGE = "CAD"

# Product Info fields mirrored from the active stage card up to the Job Order.
PRODUCT_INFO_FIELDS = (
	"dmd_no", "dmd_weight_ct", "ps_no", "ps_weight_ct", "cs_no", "cs_weight_ct",
	"gross_weight", "nett_weight", "purity", "pure_weight",
)


class JobOrder(Document):
	def onload(self):
		# Show each stage's live status (from its stage record) in the table.
		self.populate_stage_status()

	def validate(self):
		self.block_edit_when_finalized()
		self.sync_from_design()
		self.set_is_new_design()
		self.validate_design()
		# Product Info on the Job Order is read-only and fed from the stage cards
		# (see sync in validate_stage) — the JO does not compute it itself.
		# The stages table is an auto-maintained history (read-only); the route is
		# chosen one step at a time via each stage card's Next Stage field.

	def block_edit_when_finalized(self):
		"""A Completed (or Cancelled) Job Order is read-only — reference only."""
		if self.is_new():
			return
		before = self.get_doc_before_save()
		if before and before.status in ("Completed", "Cancelled"):
			frappe.throw(
				_("Job Order {0} is {1} and is read-only (reference only).").format(self.name, before.status)
			)

	def set_is_new_design(self):
		"""New Design is system-controlled: on when the job starts at the CAD stage."""
		self.is_new_design = 1 if self.first_stage == CAD_STAGE else 0

	def sync_from_design(self):
		"""Pull the Item + BOM from the linked Design (Design Bank). These drive the
		Work Order; the Design Bank always provisions them when a design is saved."""
		if self.design:
			di = frappe.db.get_value("Design Bank", self.design, ["item", "bom"], as_dict=True) or {}
			self.production_item = di.get("item")
			self.bom = di.get("bom")

	def validate_design(self):
		"""A Design (from the Design Bank) is required unless this is a New Design
		(first stage = CAD; the design is created/linked before CAD completion).
		Backstop for the field's mandatory_depends_on."""
		if not self.is_new_design and not self.design:
			frappe.throw(_("Select a Design (from the Design Bank) unless the job starts at CAD (New Design)."))

	def populate_stage_status(self):
		"""Refresh each history row from its stage record (status + chosen Next Stage)."""
		if self.is_new():
			return
		for row in self.stages:
			rec = frappe.db.get_value(
				row.stage, {"job_order": self.name}, ["status", "next_stage"], as_dict=True
			) or {}
			row.status = rec.get("status") or ""
			row.next_stage = rec.get("next_stage") or ""

	# ------------------------------------------------------------------
	# Stage history helpers (the stages table is an auto-maintained log)
	# ------------------------------------------------------------------
	@property
	def ordered_stages(self):
		return sorted(self.stages, key=lambda r: (r.sequence or r.idx or 0))

	@property
	def stage_sequence(self):
		return [r.stage for r in self.ordered_stages]

	# ------------------------------------------------------------------
	# Lifecycle
	# ------------------------------------------------------------------
	@frappe.whitelist()
	def start_processing(self):
		if self.status != "Draft":
			frappe.throw(_("This Job Order has already been started."))
		if not self.first_stage:
			frappe.throw(_("Choose the First Stage (which queue this job starts in) before starting."))

		first_stage = self.first_stage
		if first_stage == CAD_STAGE:
			# New design: defer the Work Order until CAD completes (Item + BOM ready).
			self.create_stage_record(CAD_STAGE)
			self.db_set("status", "Design")
			frappe.msgprint(
				_("Design phase started. Create the Item and BOM, fill them on this Job Order, "
				  "then complete the CAD stage to generate the Work Order."),
				indicator="blue",
				alert=True,
			)
		else:
			self.validate_item_and_bom()
			work_order = create_erpnext_work_order(self)
			self.db_set("work_order", work_order.name)
			self.create_stage_record(first_stage, work_order=work_order.name)
			self.db_set("status", "In Production")
			frappe.msgprint(
				_("Work Order {0} created. {1} started.").format(work_order.name, first_stage),
				indicator="green",
				alert=True,
			)

	def validate_item_and_bom(self):
		if not self.design:
			frappe.throw(_("Select a Design (from the Design Bank) to create the Work Order."))
		if not self.production_item or not self.bom:
			frappe.throw(_("The selected Design has no linked Item / BOM."))

	def create_stage_record(self, stage_name, work_order=None):
		"""Create one per-stage tracking record (stage doctype name == stage label)
		and note it in the Job Order's stage history. Idempotent: skips if a record
		for this stage already exists. Cards start EMPTY — material enters only via
		the Material Issue screen (or as the output of the previous stage)."""
		if frappe.db.exists(stage_name, {"job_order": self.name}):
			return None
		doc = frappe.get_doc(
			{
				"doctype": stage_name,
				"job_order": self.name,
				"work_order": work_order,
				"status": "In Queue",
			}
		)
		doc.insert(ignore_permissions=True)
		append_stage_log(self.name, stage_name)
		return doc.name


def create_erpnext_work_order(job_order):
	"""Create a standard ERPNext Work Order, left in Draft. skip_transfer is set so
	the native WO never moves stock to a WIP warehouse — Jewelima drives all material
	movement (reserve, stage warehouses) itself. Native naming is preserved."""
	company = frappe.defaults.get_defaults().get("company") or frappe.db.get_single_value(
		"Global Defaults", "default_company"
	)
	work_order = frappe.get_doc(
		{
			"doctype": "Work Order",
			"production_item": job_order.production_item,
			"bom_no": job_order.bom,
			"qty": job_order.qty or 1,
			"company": company,
			"planned_start_date": now_datetime(),
			"skip_transfer": 1,
		}
	)
	work_order.insert(ignore_permissions=True)
	populate_job_order_materials(job_order.name)
	create_reservation(job_order)
	return work_order


# ----------------------------------------------------------------------
# Stage-warehouse material flow
# ----------------------------------------------------------------------
def _company():
	return frappe.defaults.get_defaults().get("company") or frappe.db.get_single_value(
		"Global Defaults", "default_company"
	)


def stage_warehouse(stage_name, company):
	"""The bench warehouse for a stage (e.g. 'Casting' -> 'Casting - JD'). None for CAD/CAM."""
	return frappe.db.get_value("Warehouse", {"warehouse_name": stage_name, "company": company}, "name")


def stage_loss_warehouse(stage_name, company):
	return frappe.db.get_value(
		"Warehouse", {"warehouse_name": f"{stage_name} -LOSS", "company": company}, "name"
	)


def finished_goods_warehouse(company):
	return frappe.db.get_value("Warehouse", {"warehouse_name": "Finished Goods", "company": company}, "name")


def make_transfer(company, from_wh, to_wh, rows, remarks):
	"""rows: list of {item_code, qty}. Creates + submits a Material Transfer."""
	items = [
		{"item_code": r["item_code"], "qty": r["qty"], "s_warehouse": from_wh, "t_warehouse": to_wh}
		for r in rows
		if (r.get("qty") or 0) > 0
	]
	if not items:
		return None
	entry = frappe.get_doc(
		{
			"doctype": "Stock Entry",
			"stock_entry_type": "Material Transfer",
			"company": company,
			"from_warehouse": from_wh,
			"to_warehouse": to_wh,
			"items": items,
			"remarks": remarks,
		}
	)
	entry.insert(ignore_permissions=True)
	entry.submit()
	return entry.name


def populate_job_order_materials(job_order_name):
	"""Fill the Job Order's Materials table from its BOM (the materials 'on the job')."""
	jo = frappe.get_doc("Job Order", job_order_name)
	if jo.materials or not jo.bom:
		return
	bom = frappe.get_doc("BOM", jo.bom)
	factor = (jo.qty or 1) / (bom.quantity or 1)
	jo.set(
		"materials",
		[{"item": bi.item_code, "qty": (bi.qty or 0) * factor} for bi in bom.items if (bi.qty or 0) > 0],
	)
	jo.save(ignore_permissions=True)


def process_stage_output(job_order, stage_doc, next_stage):
	"""On completion of a physical stage: move output -> next stage's bench (or
	Finished Goods). Loss stays in this bench until transferred."""
	company = _company()
	this_wh = stage_warehouse(stage_doc.doctype, company)
	if not this_wh:
		return None  # CAD/CAM — nothing physical
	if next_stage and stage_warehouse(next_stage, company):
		target = stage_warehouse(next_stage, company)
	else:
		target = finished_goods_warehouse(company)
	if not target:
		return None

	rows, out_rows = [], []
	for row in stage_doc.materials or []:
		qty = row.out_qty if (row.out_qty or 0) > 0 else (row.in_qty or 0)
		if qty <= 0:
			continue
		rows.append({"item_code": row.item, "qty": qty})
		out_rows.append({"item": row.item, "qty": qty})
	se = make_transfer(
		company, this_wh, target, rows,
		f"Job {job_order.name}: {stage_doc.doctype} output -> {next_stage or 'Finished Goods'}",
	)
	if se:
		stage_doc.db_set("transfer_stock_entry", se)
	if next_stage and stage_warehouse(next_stage, company):
		seed_next_stage_materials(job_order.name, next_stage, out_rows)
	return se


def log_transition(job_order_name, from_stage, to_stage, stock_entry=None):
	"""Append a row to the Job Order's Transfers history for a stage transition.
	Inserted directly as a child row so it works even after the job is Completed."""
	n = frappe.db.count("Job Order Transfer", {"parent": job_order_name})
	frappe.get_doc(
		{
			"doctype": "Job Order Transfer",
			"parenttype": "Job Order",
			"parentfield": "transfers",
			"parent": job_order_name,
			"idx": n + 1,
			"from_stage": from_stage,
			"to_stage": to_stage,
			"transition_time": now_datetime(),
			"had_material_transfer": 1 if stock_entry else 0,
			"stock_entry": stock_entry,
		}
	).insert(ignore_permissions=True)


def append_stage_log(job_order_name, stage_name):
	"""Note a stage in the Job Order's stage history (read-only table). Inserted as a
	child row directly so it works even when the Job Order is otherwise locked."""
	if frappe.db.exists("Job Order Stage", {"parent": job_order_name, "stage": stage_name}):
		return
	n = frappe.db.count("Job Order Stage", {"parent": job_order_name})
	frappe.get_doc(
		{
			"doctype": "Job Order Stage",
			"parenttype": "Job Order",
			"parentfield": "stages",
			"parent": job_order_name,
			"idx": n + 1,
			"stage": stage_name,
			"sequence": n + 1,
			"status": "In Queue",
		}
	).insert(ignore_permissions=True)


def seed_next_stage_materials(job_order_name, next_stage, out_rows):
	name = frappe.db.get_value(next_stage, {"job_order": job_order_name}, "name")
	if not name:
		return
	nxt = frappe.get_doc(next_stage, name)
	nxt.set("materials", [{"item": r["item"], "in_qty": r["qty"]} for r in out_rows])
	nxt.save(ignore_permissions=True)


def get_active_stage(job_order_name):
	"""The card the job is currently sitting at: the earliest stage in sequence that
	has a record which isn't Completed/Cancelled. Returns (stage_doctype, name, bench)."""
	jo = frappe.get_doc("Job Order", job_order_name)
	company = _company()
	for stage_name in jo.stage_sequence:
		rec = frappe.db.get_value(
			stage_name, {"job_order": job_order_name}, ["name", "status"], as_dict=True
		)
		if rec and rec.status not in ("Completed", "Cancelled"):
			return stage_name, rec.name, stage_warehouse(stage_name, company)
	return None, None, None


def add_materials_to_stage(stage_doctype, stage_name, rows):
	"""Add issued materials onto a stage card (accumulate in_qty per item)."""
	doc = frappe.get_doc(stage_doctype, stage_name)
	existing = {m.item: m for m in doc.materials}
	for r in rows:
		code = r["item_code"]
		if code in existing:
			existing[code].in_qty = (existing[code].in_qty or 0) + r["qty"]
		else:
			doc.append("materials", {"item": code, "in_qty": r["qty"]})
	doc.save(ignore_permissions=True)


def get_pending_stage_loss(stage_doctype):
	"""Loss sitting at a stage's bench, per item = total loss recorded on that
	stage's cards MINUS loss already moved out by submitted Loss Transfers."""
	total = frappe.db.sql(
		"""SELECT item, SUM(loss_qty) AS qty FROM `tabStage Material`
		   WHERE parenttype = %s GROUP BY item""",
		stage_doctype,
		as_dict=True,
	)
	transferred = frappe.db.sql(
		"""SELECT lti.item, SUM(lti.transfer_qty) AS qty
		   FROM `tabLoss Transfer Item` lti JOIN `tabLoss Transfer` lt ON lti.parent = lt.name
		   WHERE lt.stage = %s AND lt.docstatus = 1 GROUP BY lti.item""",
		stage_doctype,
		as_dict=True,
	)
	moved = {r.item: (r.qty or 0) for r in transferred}
	pending = []
	for r in total:
		qty = (r.qty or 0) - moved.get(r.item, 0)
		if qty > 0.0005:
			pending.append({"item": r.item, "qty": qty})
	return pending


@frappe.whitelist()
def get_bench_stock(stage_doctype, job_order=None):
	"""Live stock in a stage's bench warehouse, vs what's on the current card —
	surfaces any stock not accounted for by the card."""
	company = _company()
	wh = stage_warehouse(stage_doctype, company)
	if not wh:
		return {"warehouse": None, "rows": []}

	on_card = {}
	if job_order:
		name = frappe.db.get_value(stage_doctype, {"job_order": job_order}, "name")
		if name:
			for m in frappe.get_doc(stage_doctype, name).materials or []:
				on_card[m.item] = (on_card.get(m.item) or 0) + (m.in_qty or 0)

	rows = []
	bins = frappe.get_all("Bin", filters={"warehouse": wh, "actual_qty": [">", 0]},
	                      fields=["item_code", "actual_qty"])
	items = {b.item_code for b in bins} | set(on_card)
	bin_map = {b.item_code: b.actual_qty for b in bins}
	for item in sorted(items):
		whq = bin_map.get(item, 0)
		card = on_card.get(item, 0)
		rows.append({"item": item, "warehouse_qty": whq, "on_card": card, "unaccounted": whq - card})
	return {"warehouse": wh, "rows": rows}


def create_reservation(job_order):
	"""Create an informational Material Reservation (NO stock is moved) listing the
	BOM materials committed to this job. This is how we know how much stock is
	reserved. Lines flip to Delivered as material is issued; the whole reservation
	is deleted when the job completes."""
	from jewelima.setup import RAW_MATERIALS_STORE

	if not job_order.bom:
		return
	company = _company()
	store = frappe.db.get_value(
		"Warehouse", {"warehouse_name": RAW_MATERIALS_STORE, "company": company}, "name"
	)
	bom = frappe.get_doc("BOM", job_order.bom)
	factor = (job_order.qty or 1) / (bom.quantity or 1)
	rows = [
		{"item": bi.item_code, "qty": (bi.qty or 0) * factor, "warehouse": store, "status": "Reserved"}
		for bi in bom.items
		if (bi.qty or 0) > 0
	]
	if not rows:
		return
	resv = frappe.get_doc(
		{
			"doctype": "Material Reservation",
			"job_order": job_order.name,
			"company": company,
			"status": "Reserved",
			"items": rows,
		}
	)
	resv.insert(ignore_permissions=True)
	frappe.db.set_value("Job Order", job_order.name, "material_reservation", resv.name)
	return resv.name


def mark_reservation_delivered(job_order_name, item_codes):
	"""Flip reservation lines for the given items to Delivered (called on issue)."""
	resv_name = frappe.db.get_value("Material Reservation", {"job_order": job_order_name}, "name")
	if not resv_name:
		return
	resv = frappe.get_doc("Material Reservation", resv_name)
	changed = False
	for row in resv.items:
		if row.item in item_codes and row.status != "Delivered":
			row.status = "Delivered"
			changed = True
	if changed:
		resv.set_overall_status()
		resv.save(ignore_permissions=True)


def delete_reservation(job_order_name):
	"""Remove the reservation once the job is done — it's no longer required info."""
	for name in frappe.get_all("Material Reservation", filters={"job_order": job_order_name}, pluck="name"):
		frappe.delete_doc("Material Reservation", name, ignore_permissions=True, force=True)


# ----------------------------------------------------------------------
# Stage doctype hooks — wired in hooks.py for ALL 12 stage doctypes
# ----------------------------------------------------------------------
def validate_stage(doc, method=None):
	# 1) A completed stage record is read-only — block any further edit.
	if not doc.is_new():
		before = doc.get_doc_before_save()
		if before and before.status == "Completed":
			frappe.throw(_("This stage is completed and locked; it cannot be edited."))

	# 2) Loss = In - Out per material row (only when an output weight is entered).
	for row in doc.get("materials") or []:
		in_q, out_q = (row.in_qty or 0), (row.out_qty or 0)
		row.loss_qty = max(in_q - out_q, 0) if out_q else 0

	# 2b) Weights: Nett = Gross - total stone weight (1 ct = 0.2 g); Pure = Nett x purity%.
	if doc.meta.has_field("gross_weight"):
		stones_g = (
			(doc.get("dmd_weight_ct") or 0)
			+ (doc.get("ps_weight_ct") or 0)
			+ (doc.get("cs_weight_ct") or 0)
		) * 0.2
		doc.nett_weight = max((doc.get("gross_weight") or 0) - stones_g, 0)
		doc.pure_weight = (doc.nett_weight or 0) * (doc.get("purity") or 0) / 100.0

	# 3) CAD restriction: cannot be completed until a Design (Design Bank) is linked
	#    on the Job Order — that's what carries the Item + BOM.
	if doc.doctype == CAD_STAGE and doc.status == "Completed" and doc.job_order:
		design = frappe.db.get_value("Job Order", doc.job_order, "design")
		if not design:
			frappe.throw(
				_("Select a Design (from the Design Bank) on Job Order {0} before completing CAD.").format(
					doc.job_order
				)
			)

	# 4) Next Stage routing (dynamic): can't point at itself; can't revisit a stage
	#    that has already run on this job.
	if doc.meta.has_field("next_stage") and doc.get("next_stage"):
		if doc.next_stage == doc.doctype:
			frappe.throw(_("Next Stage cannot be the same as the current stage."))
		if (
			doc.status == "Completed"
			and doc.job_order
			and frappe.db.exists(doc.next_stage, {"job_order": doc.job_order})
		):
			frappe.throw(
				_(
					"Next Stage '{0}' has already run on this job. Pick a stage that hasn't started yet."
				).format(doc.next_stage)
			)


def sync_product_info_to_job_order(doc, method=None):
	"""On every stage-card save, mirror its Product Info up to the Job Order
	(read-only there). Runs in on_update (after the card is saved)."""
	if not doc.job_order or not doc.meta.has_field("gross_weight"):
		return
	values = {f: (doc.get(f) or 0) for f in PRODUCT_INFO_FIELDS}
	frappe.db.set_value("Job Order", doc.job_order, values, update_modified=False)


def on_stage_completed(doc, method=None):
	"""When a stage is completed: CAD creates the Work Order, then in all cases
	the next stage in the sequence is started."""
	sync_product_info_to_job_order(doc)

	if doc.status != "Completed" or not doc.job_order:
		return

	job_order = frappe.get_doc("Job Order", doc.job_order)

	# CAD completion is what triggers Work Order creation (Item + BOM now exist).
	if doc.doctype == CAD_STAGE and not job_order.work_order:
		work_order = create_erpnext_work_order(job_order)
		job_order.db_set("work_order", work_order.name)
		job_order.db_set("status", "In Production")
		doc.db_set("work_order", work_order.name)
		job_order.reload()

	# Dynamic routing: the next stage is whatever THIS card chose in Next Stage.
	# Blank = this was the final stage, so the job is finished.
	next_stage = (doc.get("next_stage") or "").strip() or None

	# Start the next stage (or finish the job).
	if next_stage:
		job_order.create_stage_record(next_stage, work_order=job_order.work_order)
	else:
		job_order.db_set("status", "Completed")
		delete_reservation(job_order.name)

	# Move this stage's output -> next bench (or Finished Goods); loss stays here.
	stock_entry = process_stage_output(job_order, doc, next_stage)

	# Log the transition in the Job Order's Transfers history.
	log_transition(job_order.name, doc.doctype, next_stage or "Finished Goods", stock_entry)
