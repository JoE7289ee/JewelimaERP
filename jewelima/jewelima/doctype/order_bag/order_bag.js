// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt

frappe.ui.form.on("Order Bag", {
	refresh(frm) {
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
