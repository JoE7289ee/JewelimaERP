// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt

frappe.ui.form.on("CAD", {
	refresh(frm) {
		if (frm.is_new()) return;
		if (frm.doc.status === "Completed") {
			frm.set_read_only();
			frm.disable_save();
			frm.set_intro(__("This stage is completed and locked."), "blue");
		}
		const has_loss = (frm.doc.materials || []).some((r) => (r.loss_qty || 0) > 0);
		if (has_loss && !frm.doc.loss_transferred) {
			frm.add_custom_button(__("Transfer Loss to -LOSS"), () => {
				frappe.call({
					method: "jewelima.jewelima.doctype.job_order.job_order.transfer_stage_loss",
					args: { stage_doctype: frm.doctype, stage_name: frm.doc.name },
					freeze: true,
				}).then(() => frm.reload_doc());
			}).addClass('btn-warning');
		}
	},
});
