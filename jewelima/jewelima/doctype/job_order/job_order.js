// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt

function sync_new_design(frm) {
	// New Design = the job starts at CAD (system-controlled, read-only field).
	const target = frm.doc.first_stage === "CAD" ? 1 : 0;
	if (cint(frm.doc.is_new_design) !== target) {
		frm.set_value("is_new_design", target);
	}
}

frappe.ui.form.on("Job Order", {
	refresh(frm) {
		// A finalized Job Order is fully read-only (reference only).
		if (["Completed", "Cancelled"].includes(frm.doc.status)) {
			frm.disable_save();
			frm.set_read_only();
			frm.set_intro(
				__("This Job Order is {0} — read-only, for reference only.", [frm.doc.status]),
				"blue"
			);
			if (frm.doc.work_order) {
				frm.add_custom_button(__("Work Order"), () => {
					frappe.set_route("Form", "Work Order", frm.doc.work_order);
				});
			}
			return;
		}

		sync_new_design(frm);

		if (!frm.is_new() && frm.doc.status === "Draft") {
			frm.add_custom_button(__("Start"), () => {
				frm.call("start_processing").then(() => frm.reload_doc());
			}).addClass("btn-primary");
		}
		if (frm.doc.work_order) {
			frm.add_custom_button(__("Work Order"), () => {
				frappe.set_route("Form", "Work Order", frm.doc.work_order);
			});
		}
	},

	first_stage(frm) {
		sync_new_design(frm);
	},

	// Product Info live weight calc.
	dmd_weight_ct: jo_calc_weights,
	ps_weight_ct: jo_calc_weights,
	cs_weight_ct: jo_calc_weights,
	gross_weight: jo_calc_weights,
	purity: jo_calc_weights,
});

function jo_calc_weights(frm) {
	// 1 carat = 0.2 g
	const stones_g =
		((frm.doc.dmd_weight_ct || 0) + (frm.doc.ps_weight_ct || 0) + (frm.doc.cs_weight_ct || 0)) * 0.2;
	const nett = Math.max((frm.doc.gross_weight || 0) - stones_g, 0);
	frm.set_value("nett_weight", nett);
	frm.set_value("pure_weight", (nett * (frm.doc.purity || 0)) / 100);
}
