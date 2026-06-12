# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime

CAD_STAGE = "CAD"


class JobOrder(Document):
	def onload(self):
		# Show each stage's live status (from its stage record) in the table.
		self.populate_stage_status()

	def validate(self):
		self.set_is_new_design()
		self.normalize_stage_sequence()
		self.validate_design_name()
		self.protect_started_stages()

	def set_is_new_design(self):
		"""New Design is system-controlled: on whenever CAD is one of the stages."""
		self.is_new_design = 1 if self.requires_cad else 0

	def validate_design_name(self):
		"""Design Name is required unless this is a New Design (filled later, before
		CAD completion). Server-side backstop for the field's mandatory_depends_on."""
		if not self.is_new_design and not self.design_name:
			frappe.throw(_("Design Name is required unless CAD (New Design) is one of the stages."))

	def populate_stage_status(self):
		"""Pull the current status of each stage from its stage record, if created."""
		if self.is_new():
			return
		for row in self.stages:
			row.status = frappe.db.get_value(row.stage, {"job_order": self.name}, "status") or ""

	def normalize_stage_sequence(self):
		"""Sequence always follows the visual row order (so drag-reordering the
		table updates the sequence)."""
		for idx, row in enumerate(self.stages, start=1):
			row.sequence = idx

	# ------------------------------------------------------------------
	# Stage ordering helpers
	# ------------------------------------------------------------------
	@property
	def ordered_stages(self):
		return sorted(self.stages, key=lambda r: (r.sequence or r.idx or 0))

	@property
	def stage_sequence(self):
		return [r.stage for r in self.ordered_stages]

	@property
	def requires_cad(self):
		return any(r.stage == CAD_STAGE for r in self.stages)

	def started_stage_names(self, source_doc=None):
		"""Ordered stage names that already have a stage record for this Job Order."""
		doc = source_doc or self
		ordered = sorted(doc.stages, key=lambda r: (r.sequence or r.idx or 0))
		return [r.stage for r in ordered if frappe.db.exists(r.stage, {"job_order": self.name})]

	def protect_started_stages(self):
		"""Stages already started (have a record) are locked: they cannot be
		renamed, removed or reordered. Only the stages after them can be edited."""
		if self.is_new():
			return
		old = self.get_doc_before_save()
		if not old:
			return
		started = self.started_stage_names(source_doc=old)
		if not started:
			return
		if self.stage_sequence[: len(started)] != started:
			frappe.throw(
				_(
					"Stages that have already started cannot be changed or reordered: {0}. "
					"You can only edit the stages that come after them."
				).format(", ".join(started))
			)

	# ------------------------------------------------------------------
	# Lifecycle
	# ------------------------------------------------------------------
	@frappe.whitelist()
	def start_processing(self):
		if self.status != "Draft":
			frappe.throw(_("This Job Order has already been started."))
		if not self.stages:
			frappe.throw(_("Add at least one stage before starting."))

		first_stage = self.stage_sequence[0]
		if self.requires_cad:
			if first_stage != CAD_STAGE:
				frappe.throw(_("CAD must be the first stage when it is part of the Job Order."))
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
				_("Work Order {0} created. First stage started.").format(work_order.name),
				indicator="green",
				alert=True,
			)

	def validate_item_and_bom(self):
		if not self.production_item:
			frappe.throw(_("Production Item is required to create the Work Order."))
		if not self.bom:
			frappe.throw(_("BOM is required to create the Work Order."))

	def create_stage_record(self, stage_name, work_order=None):
		"""Create one per-stage tracking record (stage doctype name == stage label).
		Idempotent: skips if a record for this stage already exists."""
		if frappe.db.exists(stage_name, {"job_order": self.name}):
			return
		doc = frappe.get_doc(
			{
				"doctype": stage_name,
				"job_order": self.name,
				"work_order": work_order,
				"status": "In Queue",
			}
		)
		doc.insert(ignore_permissions=True)
		return doc.name

	def advance_to_next_stage(self, completed_stage):
		"""Create the next stage record after `completed_stage`. If there is no
		next stage, the Job Order is complete."""
		sequence = self.stage_sequence
		if completed_stage not in sequence:
			return
		idx = sequence.index(completed_stage)
		if idx + 1 < len(sequence):
			self.create_stage_record(sequence[idx + 1], work_order=self.work_order)
		else:
			self.db_set("status", "Completed")


def create_erpnext_work_order(job_order):
	"""Create a standard ERPNext Work Order (left in Draft so the user drives the
	basic submit -> start -> finish lifecycle). Native naming is preserved."""
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
		}
	)
	work_order.insert(ignore_permissions=True)
	return work_order


# ----------------------------------------------------------------------
# Stage doctype hooks — wired in hooks.py for ALL 12 stage doctypes
# ----------------------------------------------------------------------
def validate_stage(doc, method=None):
	# 1) A completed stage record is read-only — block any further edit.
	if not doc.is_new():
		before = doc.get_doc_before_save()
		if before and before.status == "Completed":
			frappe.throw(_("This stage is completed and locked; it cannot be edited."))

	# 2) CAD restriction: cannot be completed until the Job Order has the design
	#    output filled in — Design Name, Production Item and BOM.
	if doc.doctype == CAD_STAGE and doc.status == "Completed" and doc.job_order:
		design_name, production_item, bom = frappe.db.get_value(
			"Job Order", doc.job_order, ["design_name", "production_item", "bom"]
		)
		missing = [
			label
			for label, value in (
				("Design Name", design_name),
				("Production Item", production_item),
				("BOM", bom),
			)
			if not value
		]
		if missing:
			frappe.throw(
				_("Fill {0} on Job Order {1} before completing CAD.").format(
					", ".join(missing), doc.job_order
				)
			)


def on_stage_completed(doc, method=None):
	"""When a stage is completed: CAD creates the Work Order, then in all cases
	the next stage in the sequence is started."""
	if doc.status != "Completed" or not doc.job_order:
		return

	job_order = frappe.get_doc("Job Order", doc.job_order)

	# CAD completion is what triggers Work Order creation (Item + BOM now exist).
	if doc.doctype == CAD_STAGE and not job_order.work_order:
		work_order = create_erpnext_work_order(job_order)
		job_order.db_set("work_order", work_order.name)
		job_order.db_set("status", "In Production")
		doc.db_set("work_order", work_order.name)

	job_order.advance_to_next_stage(doc.doctype)
