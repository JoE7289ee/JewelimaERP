// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt

frappe.ui.form.on("Loss Transfer", {
	stage(frm) {
		if (!frm.doc.stage) return;
		frappe.call({
			method: "jewelima.jewelima.doctype.loss_transfer.loss_transfer.get_loss_context",
			args: { stage: frm.doc.stage },
		}).then((r) => {
			const ctx = r.message || {};
			frm.set_value("company", ctx.company || "");
			frm.set_value("bench_warehouse", ctx.bench_warehouse || "");
			frm.set_value("loss_warehouse", ctx.loss_warehouse || "");
			frm.clear_table("items");
			(ctx.items || []).forEach((it) =>
				frm.add_child("items", { item: it.item, pending_qty: it.qty, transfer_qty: it.qty })
			);
			frm.refresh_field("items");
			if (!(ctx.items || []).length) {
				frappe.show_alert({ message: __("No loss pending at {0}.", [frm.doc.stage]), indicator: "blue" });
			}
		});
	},
});
