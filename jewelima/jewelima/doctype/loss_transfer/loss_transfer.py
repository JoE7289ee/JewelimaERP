# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

from jewelima.jewelima.doctype.job_order.job_order import (
	_company,
	get_pending_stage_loss,
	make_transfer,
	stage_loss_warehouse,
	stage_warehouse,
)


@frappe.whitelist()
def get_loss_context(stage):
	"""Warehouses + pending loss (per raw material) sitting at a bench."""
	company = _company()
	return {
		"company": company,
		"bench_warehouse": stage_warehouse(stage, company),
		"loss_warehouse": stage_loss_warehouse(stage, company),
		"items": get_pending_stage_loss(stage),
	}


class LossTransfer(Document):
	def validate(self):
		self.resolve_context()
		self.validate_quantities()

	def resolve_context(self):
		if not self.company:
			self.company = _company()
		if not self.bench_warehouse:
			self.bench_warehouse = stage_warehouse(self.stage, self.company)
		if not self.loss_warehouse:
			self.loss_warehouse = stage_loss_warehouse(self.stage, self.company)

	def validate_quantities(self):
		"""Each line's transfer can't exceed the loss currently pending at the bench."""
		pending = {r["item"]: r["qty"] for r in get_pending_stage_loss(self.stage)}
		for row in self.items:
			if (row.transfer_qty or 0) > (pending.get(row.item, 0) + 0.0005):
				frappe.throw(
					_("{0}: transfer {1} exceeds pending loss {2} at {3}.").format(
						row.item, row.transfer_qty, pending.get(row.item, 0), self.stage
					)
				)

	def on_submit(self):
		if not self.bench_warehouse or not self.loss_warehouse:
			frappe.throw(_("No bench / -LOSS warehouse found for {0}.").format(self.stage))
		rows = [{"item_code": r.item, "qty": r.transfer_qty} for r in self.items if (r.transfer_qty or 0) > 0]
		if not rows:
			frappe.throw(_("Enter a transfer quantity for at least one line."))
		se = make_transfer(
			self.company, self.bench_warehouse, self.loss_warehouse, rows,
			f"Loss transfer ({self.stage}) {self.name}",
		)
		self.db_set("stock_entry", se)
		frappe.msgprint(
			_("Loss transferred to {0}.").format(self.loss_warehouse), indicator="green", alert=True
		)

	def on_cancel(self):
		if self.stock_entry and frappe.db.get_value("Stock Entry", self.stock_entry, "docstatus") == 1:
			frappe.get_doc("Stock Entry", self.stock_entry).cancel()
