// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt

frappe.ui.form.on("Order Bag", {
	refresh(frm) {
		render_contents(frm);
		render_transfers(frm);
		frm.get_field("stages_html").$wrapper.html(
			`<div class="text-muted" style="padding:14px;">Stage history — who worked on this bag at each bench — will appear here.</div>`
		);
		if (!frm.is_new()) {
			frm.add_custom_button(__("Transfer"), () => {
				frappe.set_route("transfer-order-bag");
			});
		}
	},
});

function render_contents(frm) {
	const $w = frm.get_field("materials_html").$wrapper;
	if (frm.is_new()) {
		$w.html('<div class="text-muted" style="padding:14px;">Save the bag first.</div>');
		return;
	}
	frappe.call({ method: "jewelima.jewelima.api.get_bag_contents", args: { order_bag: frm.doc.name } }).then((r) => {
		const c = r.message || {};
		if (!c.items || !c.items.length) {
			$w.html('<div class="text-muted" style="padding:14px;">Bag is empty — no materials issued yet.</div>');
			return;
		}
		const rows = c.items
			.map((m) => `<tr><td>${frappe.utils.escape_html(m.item)}</td><td style="text-align:right">${m.qty}</td><td>${frappe.utils.escape_html(m.uom || "")}</td></tr>`)
			.join("");
		$w.html(`
			<table class="table table-bordered" style="font-size:12px;max-width:480px;">
				<thead><tr><th>Material</th><th style="text-align:right">Qty</th><th>UOM</th></tr></thead>
				<tbody>${rows}</tbody>
				<tfoot><tr style="font-weight:700;background:var(--control-bg);">
					<td>Gross</td><td style="text-align:right">${c.gross_weight}</td><td>g</td>
				</tr></tfoot>
			</table>
			<div class="text-muted" style="font-size:11px;">Gold ${c.gold_grams} g + Stones ${c.stone_carats} ct (×0.2) = ${c.gross_weight} g gross.</div>`);
	});
}

function render_transfers(frm) {
	const $w = frm.get_field("transfers_html").$wrapper;
	if (frm.is_new()) {
		$w.html('<div class="text-muted" style="padding:14px;">Save the bag first.</div>');
		return;
	}
	frappe.db
		.get_list("Order Bag Transfer", {
			filters: { order_bag: frm.doc.name },
			fields: ["name", "from_location", "to_location", "transfer_time", "transferred_by"],
			order_by: "transfer_time asc",
			limit: 500,
		})
		.then((rows) => {
			if (!rows.length) {
				$w.html('<div class="text-muted" style="padding:14px;">No transfers yet. Move this bag from the <b>Transfer Order Bag</b> page.</div>');
				return;
			}
			const body = rows
				.map(
					(r, i) => `<tr>
						<td>${i + 1}</td>
						<td>${frappe.utils.escape_html(r.from_location || "—")}</td>
						<td><b>${frappe.utils.escape_html(r.to_location || "")}</b></td>
						<td>${r.transfer_time ? frappe.datetime.str_to_user(r.transfer_time) : ""}</td>
						<td>${frappe.utils.escape_html(r.transferred_by || "")}</td>
					</tr>`
				)
				.join("");
			$w.html(`
				<table class="table table-bordered" style="font-size:12px;">
					<thead><tr><th style="width:40px">#</th><th>From</th><th>To</th><th>Time</th><th>By</th></tr></thead>
					<tbody>${body}</tbody>
				</table>`);
		});
}
