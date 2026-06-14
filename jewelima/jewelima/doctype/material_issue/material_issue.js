// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt

frappe.ui.form.on("Material Issue", {
	scan_barcode(frm) {
		// The barcode encodes the Job Order id — set it and let job_order() fetch context.
		if (!frm.doc.scan_barcode) return;
		frm.set_value("job_order", frm.doc.scan_barcode.trim());
		frm.set_value("scan_barcode", "");
	},
	issue_type(frm) {
		fetch_context(frm);
	},
	job_order(frm) {
		fetch_context(frm);
	},
});

function fetch_context(frm) {
	if (!frm.doc.job_order || !frm.doc.issue_type) return;
	frappe.call({
		method: "jewelima.jewelima.doctype.material_issue.material_issue.get_issue_context",
		args: { job_order: frm.doc.job_order, issue_type: frm.doc.issue_type },
	}).then((r) => {
		const ctx = r.message || {};
		frm.set_value("current_stage", ctx.current_stage || "");
		frm.set_value("current_stage_record", ctx.current_stage_record || "");
		frm.set_value("bench_warehouse", ctx.bench_warehouse || "");
		frm.set_value("source_warehouse", ctx.source_warehouse || "");
		frm.set_value("company", ctx.company || "");
		frm.clear_table("items");
		(ctx.items || []).forEach((it) => frm.add_child("items", { item: it.item, qty: it.qty }));
		frm.refresh_field("items");
		if (!ctx.current_stage) {
			frappe.show_alert({ message: __("No active stage found for this Job Order."), indicator: "orange" });
		}
	});
}
