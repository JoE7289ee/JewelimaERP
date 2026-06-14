# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

from jewelima.jewelima.doctype.job_order.job_order import (
	_company,
	add_materials_to_stage,
	get_active_stage,
	make_transfer,
	mark_reservation_delivered,
)


def _issue_source_warehouse(issue_type, company):
	# Gold is issued straight from the Raw Materials Store (no reserve warehouse);
	# stones from the Stone Issue store.
	from jewelima.setup import RAW_MATERIALS_STORE, STONE_ISSUE_WAREHOUSE

	name = RAW_MATERIALS_STORE if issue_type == "Gold" else STONE_ISSUE_WAREHOUSE
	return frappe.db.get_value("Warehouse", {"warehouse_name": name, "company": company}, "name")


@frappe.whitelist()
def get_issue_context(job_order, issue_type):
	"""For the scan: find the job's current card, its bench, the issue source
	warehouse, and the materials of this type still on the job (what's needed)."""
	company = _company()
	stage, record, bench = get_active_stage(job_order)
	flag = "keep_metal_ledger" if issue_type == "Gold" else "keep_stone_ledger"
	needed = [
		{"item": m.item, "qty": m.qty}
		for m in frappe.get_all("Job Order Material", filters={"parent": job_order}, fields=["item", "qty"])
		if frappe.db.get_value("Item", m.item, flag)
	]
	return {
		"current_stage": stage,
		"current_stage_record": record,
		"bench_warehouse": bench,
		"source_warehouse": _issue_source_warehouse(issue_type, company),
		"company": company,
		"items": needed,
	}


class MaterialIssue(Document):
	def validate(self):
		self.resolve_context()

	def resolve_context(self):
		if not self.company:
			self.company = _company()
		if self.job_order and not self.current_stage_record:
			ctx = get_issue_context(self.job_order, self.issue_type)
			self.current_stage = ctx["current_stage"]
			self.current_stage_record = ctx["current_stage_record"]
			self.bench_warehouse = ctx["bench_warehouse"]
		if not self.source_warehouse:
			self.source_warehouse = _issue_source_warehouse(self.issue_type, self.company)

	def on_submit(self):
		self.issue_materials()

	def issue_materials(self):
		if not self.current_stage_record or not self.bench_warehouse:
			frappe.throw(_("This Job Order has no active stage to issue to (is it started / not finished?)."))
		if not self.source_warehouse:
			frappe.throw(_("No issue source warehouse found for {0}.").format(self.issue_type))
		rows = [{"item_code": r.item, "qty": r.qty} for r in self.items if (r.qty or 0) > 0]
		if not rows:
			frappe.throw(_("Add at least one item with a quantity to issue."))

		se = make_transfer(
			self.company, self.source_warehouse, self.bench_warehouse, rows,
			f"Issue ({self.issue_type}) to {self.current_stage} {self.current_stage_record} / Job {self.job_order}",
		)
		self.db_set("stock_entry", se)
		add_materials_to_stage(self.current_stage, self.current_stage_record, rows)
		mark_reservation_delivered(self.job_order, [r["item_code"] for r in rows])
		frappe.msgprint(
			_("Issued to {0} ({1}).").format(self.current_stage, self.bench_warehouse),
			indicator="green",
			alert=True,
		)

	def on_cancel(self):
		if self.stock_entry and frappe.db.get_value("Stock Entry", self.stock_entry, "docstatus") == 1:
			frappe.get_doc("Stock Entry", self.stock_entry).cancel()
