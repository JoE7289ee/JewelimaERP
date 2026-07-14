// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt

frappe.ui.form.on("Order Bag", {
	refresh(frm) {
		render_contents(frm);
		render_issue_details(frm);
		render_transfers(frm);
		render_stages(frm);
		if (!frm.is_new()) {
			// keep the Actual tab in sync with what the bag really holds
			frappe.call({ method: "jewelima.jewelima.api.refresh_actual_weights", args: { order_bag: frm.doc.name } }).then((r) => {
				const v = r.message || {};
				Object.keys(v).forEach((k) => {
					frm.doc[k] = v[k];
					frm.refresh_field(k);
				});
			});
		}
		if (!frm.is_new()) {
			frm.add_custom_button(__("Photos"), () => {
				frappe.set_route("order-bag-photos", frm.doc.name);
			});
			frm.add_custom_button(__("Transfer"), () => {
				frappe.set_route("transfer-order-bag");
			});
			if (!frm.doc.is_finished) {
				frm.add_custom_button(__("Recalc Weights from BOM"), () => {
					frappe.call({
						method: "jewelima.jewelima.api.recalc_bag_weights_from_bom",
						args: { order_bag: frm.doc.name },
					}).then(() => frm.reload_doc());
				});
			}
		}
		// BOM (plan) is locked once the ornament is made
		frm.set_df_property("bag_bom", "read_only", frm.doc.is_finished ? 1 : 0);
		if (frm.doc.is_finished) {
			frm.get_field("bag_bom").grid.cannot_add_rows = true;
			frm.get_field("bag_bom").grid.cannot_delete_rows = true;
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
			.map((m) => `<tr><td>${frappe.utils.escape_html(m.item)}</td><td style="text-align:right">${m.pcs ? m.pcs : ""}</td><td style="text-align:right">${m.qty}</td><td>${frappe.utils.escape_html(m.uom || "")}</td></tr>`)
			.join("");
		$w.html(`
			<table class="table table-bordered" style="font-size:12px;max-width:540px;">
				<thead><tr><th>Material</th><th style="text-align:right">No.</th><th style="text-align:right">Qty</th><th>UOM</th></tr></thead>
				<tbody>${rows}</tbody>
				<tfoot><tr style="font-weight:700;background:var(--control-bg);">
					<td>Gross</td><td></td><td style="text-align:right">${c.gross_weight}</td><td>g</td>
				</tr></tfoot>
			</table>
			<div class="text-muted" style="font-size:11px;">Gold ${c.gold_grams} g + Stones ${c.stone_carats} ct (×0.2) = ${c.gross_weight} g gross.</div>`);
	});
}

function render_issue_details(frm) {
	// who issued what stones/gold into this card and when. The Actual tab renders
	// lazily, so paint whenever the field's wrapper is actually visible (D-verified
	// that painting after the tab is shown sticks). get_card_passport resolves names.
	if (frm.is_new()) return;
	frappe.call({ method: "jewelima.jewelima.api.get_card_passport", args: { order_bag: frm.doc.name } }).then((r) => {
		const issues = (r.message || {}).issues || [];
		const esc = frappe.utils.escape_html;
		let html = '<div style="font-weight:700;margin:2px 0 6px;">Issue Details</div>';
		if (!issues.length) {
			html += '<div class="text-muted" style="font-size:12px;">Nothing issued into this card yet.</div>';
		} else {
			const body = issues.map((it) => {
				const stone = it.entry_type === "Stone Issue";
				const sign = it.direction === "Out" ? "−" : "";
				return `<tr>
					<td>${stone ? "Stone" : "Gold"}</td>
					<td><b>${esc(it.item || "")}</b>${it.stone_type ? ` <span class="text-muted">(${esc(it.stone_type)})</span>` : ""}</td>
					<td style="text-align:right">${(it.pcs ? it.pcs + " / " : "") + sign + (Number(it.qty) || 0).toFixed(3)} ${stone ? "ct" : "g"}</td>
					<td>${esc(it.who || "")}</td>
					<td>${it.datetime ? frappe.datetime.str_to_user(it.datetime) : ""}</td></tr>`;
			}).join("");
			html += `<table class="table table-bordered ci-issue-tbl" style="font-size:12px;max-width:640px;">
				<thead><tr><th>What</th><th>Item</th><th style="text-align:right">Qty</th><th>Issued By</th><th>When</th></tr></thead>
				<tbody>${body}</tbody></table>`;
		}
		frm.__issue_html = html;
		// poll: paint the moment the (lazy) Actual tab wrapper is visible + unpainted
		let tries = 0;
		const iv = setInterval(() => {
			const f = frm.get_field("issue_details_html");
			if (f && f.$wrapper.is(":visible") && !f.$wrapper.find(".ci-issue-marker").length) {
				f.$wrapper.html(`<div class="ci-issue-marker">${frm.__issue_html}</div>`);
			}
			if (++tries > 40) clearInterval(iv); // ~20s guard
		}, 500);
		frm.__issue_iv && clearInterval(frm.__issue_iv);
		frm.__issue_iv = iv;
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
		})
		.then(() => render_holder_moves(frm))
		.then(() => render_material_moves(frm));
}

function render_material_moves(frm) {
	// who put in / took out WHAT and WHEN — the Bag Material Ledger, human-readable
	const $w = frm.get_field("transfers_html").$wrapper;
	frappe.db
		.get_list("Bag Material Ledger", {
			filters: { order_bag: frm.doc.name },
			fields: ["item", "direction", "qty", "pcs", "uom", "entry_type", "employee", "datetime", "owner", "remarks"],
			order_by: "datetime asc",
			limit: 500,
		})
		.then((rows) => {
			if (!rows.length) return;
			const body = rows
				.map(
					(r, i) => `<tr>
						<td>${i + 1}</td>
						<td>${r.direction === "Out" ? '<span style="color:var(--red-600,#c0392b);font-weight:700;">Out</span>' : "In"}</td>
						<td>${frappe.utils.escape_html(r.entry_type || "")}</td>
						<td>${frappe.utils.escape_html(r.item || "")}</td>
						<td style="text-align:right;">${(r.pcs ? r.pcs + " pcs / " : "") + (frappe.utils.flt(r.qty) || 0).toFixed(3)} ${frappe.utils.escape_html(r.uom || "")}</td>
						<td>${frappe.utils.escape_html(r.employee || r.owner || "")}</td>
						<td>${r.datetime ? frappe.datetime.str_to_user(r.datetime) : ""}</td>
						<td>${frappe.utils.escape_html(r.remarks || "")}</td>
					</tr>`
				)
				.join("");
			$w.append(`
				<div style="font-weight:700;margin:14px 0 4px;">Material In / Out</div>
				<table class="table table-bordered" style="font-size:12px;">
					<thead><tr><th style="width:40px">#</th><th>Dir</th><th>Type</th><th>Item</th><th style="text-align:right;">Qty</th><th>Who</th><th>When</th><th>Remarks</th></tr></thead>
					<tbody>${body}</tbody>
				</table>`);
		});
}

function render_holder_moves(frm) {
	// reservation history (Holder Transfer records) appended under the location moves
	const $w = frm.get_field("transfers_html").$wrapper;
	frappe.db
		.get_list("Holder Transfer", {
			filters: { order_bag: frm.doc.name },
			fields: ["from_holder", "to_holder", "transfer_time", "transferred_by", "reason"],
			order_by: "transfer_time asc",
			limit: 200,
		})
		.then((rows) => {
			if (!rows.length) return;
			const body = rows
				.map(
					(r, i) => `<tr>
						<td>${i + 1}</td>
						<td>${frappe.utils.escape_html(r.from_holder || "—")}</td>
						<td><b>${frappe.utils.escape_html(r.to_holder || "")}</b></td>
						<td>${r.transfer_time ? frappe.datetime.str_to_user(r.transfer_time) : ""}</td>
						<td>${frappe.utils.escape_html(r.transferred_by || "")}</td>
						<td>${frappe.utils.escape_html(r.reason || "")}</td>
					</tr>`
				)
				.join("");
			$w.append(`
				<div style="font-weight:700;margin:14px 0 4px;">Holder / Reservation Moves</div>
				<table class="table table-bordered" style="font-size:12px;">
					<thead><tr><th style="width:40px">#</th><th>From Holder</th><th>To Holder</th><th>Time</th><th>By</th><th>Reason</th></tr></thead>
					<tbody>${body}</tbody>
				</table>`);
		});
}

function render_stages(frm) {
	const $w = frm.get_field("stages_html").$wrapper;
	if (frm.is_new()) {
		$w.html('<div class="text-muted" style="padding:14px;">Save the bag first.</div>');
		return;
	}
	frappe.call({ method: "jewelima.jewelima.api.get_bag_stage_history", args: { order_bag: frm.doc.name } }).then((r) => {
		const rows = r.message || [];
		if (!rows.length) {
			$w.html('<div class="text-muted" style="padding:14px;">No bench activity yet — this bag has not been worked at any bench.</div>');
			return;
		}
		const dt = (v) => (v ? frappe.datetime.str_to_user(v) : "");
		const num = (v) => (v ? flt(v).toFixed(3) : "");
		const body = rows
			.map(
				(s, i) => `<tr>
					<td>${i + 1}</td>
					<td><b>${frappe.utils.escape_html(s.bench || "")}</b></td>
					<td>${frappe.utils.escape_html(s.employee_name || "—")}</td>
					<td>${frappe.utils.escape_html(s.status || "")}</td>
					<td>${dt(s.issued_at || s.time_in)}</td>
					<td>${dt(s.receipted_at)}</td>
					<td style="text-align:right">${num(s.weight_out)}</td>
					<td style="text-align:right">${num(s.weight_in)}</td>
					<td style="text-align:right">${num(s.loss)}</td>
				</tr>`
			)
			.join("");
		$w.html(`
			<table class="table table-bordered" style="font-size:12px;">
				<thead><tr>
					<th style="width:32px">#</th><th>Bench</th><th>Employee</th><th>Status</th>
					<th>Issued</th><th>Received</th>
					<th style="text-align:right">Wt Out</th><th style="text-align:right">Wt In</th><th style="text-align:right">Loss</th>
				</tr></thead>
				<tbody>${body}</tbody>
			</table>`);
	});
}
