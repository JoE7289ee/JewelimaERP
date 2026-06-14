// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt

frappe.ui.form.on("CAM", {
	refresh(frm) {
		if (frm.is_new()) return;
		if (frm.doc.status === "Completed") {
			frm.set_read_only();
			frm.disable_save();
			frm.set_intro(__("This stage is completed and locked."), "blue");
		}
		jewelima_render_bench_stock(frm);
	},
	dmd_weight_ct: jewelima_calc_weights,
	ps_weight_ct: jewelima_calc_weights,
	cs_weight_ct: jewelima_calc_weights,
	gross_weight: jewelima_calc_weights,
	purity: jewelima_calc_weights,
});

function jewelima_calc_weights(frm) {
	// 1 carat = 0.2 g
	const stones_g = ((frm.doc.dmd_weight_ct || 0) + (frm.doc.ps_weight_ct || 0) + (frm.doc.cs_weight_ct || 0)) * 0.2;
	const nett = Math.max((frm.doc.gross_weight || 0) - stones_g, 0);
	frm.set_value("nett_weight", nett);
	frm.set_value("pure_weight", nett * (frm.doc.purity || 0) / 100);
}

function jewelima_render_bench_stock(frm) {
	const field = frm.fields_dict.bench_stock;
	if (!field || !field.$wrapper) return;
	frappe.call({
		method: "jewelima.jewelima.doctype.job_order.job_order.get_bench_stock",
		args: { stage_doctype: frm.doctype, job_order: frm.doc.job_order },
	}).then((r) => {
		const rows = (r.message || {}).rows || [];
		const wh = (r.message || {}).warehouse || '';
		if (!wh) { field.$wrapper.empty(); return; }
		let html = `<div class='text-muted' style='font-size:11px;margin-bottom:4px;'>Live stock in <b>${frappe.utils.escape_html(wh)}</b> (what's physically at this bench). 'Unaccounted' = warehouse minus this card.</div>`;
		html += "<table class='table table-bordered' style='font-size:12px;'><thead><tr><th>Item</th><th class='text-right'>Warehouse Qty</th><th class='text-right'>On This Card</th><th class='text-right'>Unaccounted</th></tr></thead><tbody>";
		if (!rows.length) html += "<tr><td colspan=4 class='text-muted'>Bench warehouse is empty.</td></tr>";
		rows.forEach((x) => {
			const un = x.unaccounted || 0;
			const c = Math.abs(un) > 0.0005 ? " style='color:#b3590e;font-weight:bold;'" : '';
			html += `<tr><td>${frappe.utils.escape_html(x.item)}</td><td class='text-right'>${x.warehouse_qty}</td><td class='text-right'>${x.on_card}</td><td class='text-right'${c}>${un}</td></tr>`;
		});
		html += '</tbody></table>';
		field.$wrapper.html(html);
	});
}
