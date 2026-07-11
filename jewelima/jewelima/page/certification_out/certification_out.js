// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Certification Out (Delivery) — the board of pieces OUT at certification, batch
// by batch (make-tree style): one panel per batch (IGI blue / HALLMARKING amber),
// a chip per piece with its weights, sent date + days out on the panel. Header
// totals what's physically out: pieces, pure gold, stone weight. Clicking a
// pending chip receives that piece back (HUID / certificate number dialog).
// Route: /app/certification-out

frappe.pages["certification-out"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Certification Out", single_column: true });
	const API = "jewelima.jewelima.api";
	const S = { batches: [], summary: {} };
	const esc = frappe.utils.escape_html;
	const fmt = (v) => flt(v).toFixed(3);

	$(page.main).append(`
		<style>
		.co-top{display:flex;align-items:center;gap:14px;margin:2px 0 18px;flex-wrap:wrap;}
		.co-mark{display:flex;align-items:center;gap:12px;}
		.co-mark svg{width:38px;height:38px;}
		.co-headline{font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:700;letter-spacing:4px;color:#3d3425;}
		.co-sub{color:var(--text-muted);font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;margin-top:1px;}
		.co-cards{display:flex;gap:12px;flex-wrap:wrap;margin-left:auto;}
		.co-card{border:1px solid var(--border-color);border-radius:8px;background:var(--fg-color);padding:7px 16px;min-width:130px;text-align:right;}
		.co-card .lb{font-size:10.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;}
		.co-card .v{font-size:19px;font-weight:800;font-variant-numeric:tabular-nums;}
		.co-card.gold{box-shadow:inset 3px 0 0 #b8860b;}
		.co-card.stone{box-shadow:inset 3px 0 0 #1c5da8;}
		.co-board{display:flex;gap:22px;align-items:flex-start;flex-wrap:wrap;}
		.co-col{width:340px;flex:0 0 340px;}
		.co-title{font-size:18px;font-weight:800;letter-spacing:.5px;text-align:center;margin:0 0 2px;}
		.co-title small{display:block;font-size:10.5px;font-weight:600;opacity:.7;letter-spacing:.1em;}
		.co-panel{border-radius:14px;min-height:120px;padding:12px;border:2px solid;display:flex;flex-direction:column;gap:8px;}
		.co-panel.igi{border-color:#1c5da8;background:#f3f7fc;color:#1c5da8;}
		.co-panel.hm{border-color:#b8860b;background:#fdf8ec;color:#9a6700;}
		.co-panel.done{opacity:.65;filter:saturate(.6);}
		.co-chip{display:flex;align-items:center;gap:10px;background:#fff;border:2px solid transparent;border-radius:9px;padding:8px 12px;user-select:none;box-shadow:0 1px 2px rgba(0,0,0,.06);color:var(--text-color);}
		.co-chip.pend{cursor:pointer;}
		.co-chip.pend:hover{box-shadow:0 2px 6px rgba(0,0,0,.14);border-color:currentColor;}
		.co-chip .code{font-weight:800;letter-spacing:.4px;font-size:13px;}
		.co-chip .ty{font-size:10.5px;color:#6b7785;}
		.co-chip .wt{margin-left:auto;font-variant-numeric:tabular-nums;font-size:12px;color:#6b7785;text-align:right;}
		.co-chip.back{background:#f2f8f3;border-color:#bfe3c6;}
		.co-chip.back .code{color:#1d7a33;}
		.co-chip .nums{font-size:10.5px;color:#1d7a33;font-weight:700;}
		.co-cnt{margin-top:auto;padding-top:8px;text-align:center;font-size:12px;font-weight:700;opacity:.85;}
		.co-days{display:inline-block;border-radius:8px;background:#fff;padding:0 8px;font-size:10.5px;font-weight:800;border:1px solid currentColor;}
		.co-none{border:1px dashed var(--border-color);border-radius:14px;padding:40px;text-align:center;color:var(--text-muted);width:100%;}
		</style>
		<div class="co-top">
			<div class="co-mark">
				<svg viewBox="0 0 24 24" fill="none" stroke="#8a6d1a" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
					<path d="M20 6 9 17l-5-5"/><circle cx="12" cy="12" r="10"/>
				</svg>
				<div><div class="co-headline">CERTIFICATION OUT</div><div class="co-sub">${__("what's at the lab · click a card to receive it back")}</div></div>
			</div>
			<div class="co-cards"></div>
		</div>
		<div class="co-board"></div>
	`);
	const root = $(page.main)[0];

	function daysOut(sent) {
		if (!sent) return 0;
		return Math.max(0, frappe.datetime.get_day_diff(frappe.datetime.get_today(), sent));
	}

	function render() {
		const s = S.summary || {};
		$(root).find(".co-cards").html(`
			<div class="co-card"><div class="lb">${__("Pieces Out")}</div><div class="v">${s.pieces_out || 0}</div></div>
			<div class="co-card gold"><div class="lb">${__("Pure Gold Out")}</div><div class="v">${fmt(s.pure_gold || 0)} g</div></div>
			<div class="co-card stone"><div class="lb">${__("Stones Out")}</div><div class="v">${fmt(s.stones_ct || 0)} ct</div></div>
			<div class="co-card"><div class="lb">${__("Batches Out")}</div><div class="v">${s.batches_out || 0}</div></div>`);

		const $b = $(root).find(".co-board");
		if (!S.batches.length) {
			$b.html(`<div class="co-none">${__("Nothing out at certification.")}</div>`);
			return;
		}
		$b.html(S.batches.map((b) => {
			const cls = b.certification_type === "IGI" ? "igi" : "hm";
			const d = daysOut(b.sent_on);
			return `<div class="co-col" data-name="${esc(b.name)}">
				<div class="co-title">${esc(b.name)}
					<small>${esc(b.certification_type)}${b.lab ? " · " + esc(b.lab) : ""} · ${__("sent")} ${esc(b.sent_on)}
					<span class="co-days">${d} ${__("day(s) out")}</span></small></div>
				<div class="co-panel ${cls}${b.status === "Received" ? " done" : ""}">
					${b.items.map((r) => r.received ? `
						<div class="co-chip back"><span class="code">✓ ${esc(r.order_bag)}</span><span class="ty">${esc(r.design_type)}</span>
							<span class="wt"><span class="nums">${r.huid ? "HUID " + esc(r.huid) : ""}${r.huid && r.certificate_no ? " · " : ""}${esc(r.certificate_no || "")}</span></span></div>` : `
						<div class="co-chip pend" data-row="${esc(r.row)}" data-bag="${esc(r.order_bag)}">
							<span class="code">${esc(r.order_bag)}</span><span class="ty">${esc(r.design_type)}</span>
							<span class="wt">${fmt(r.gross)} g${r.stones_ct ? ` · ${fmt(r.stones_ct)} ct` : ""}<br>
							<span style="font-size:10px;">${__("pure")} ${fmt(r.pure)} g</span></span></div>`).join("")}
					<div class="co-cnt">${b.back}/${b.total} ${__("back")}${b.status === "Received" ? " · " + __("complete") : ""}</div>
				</div>
			</div>`;
		}).join(""));
	}

	function load() {
		frappe.call({ method: API + ".get_certification_batches" }).then((r) => {
			const m = r.message || {};
			S.batches = m.batches || [];
			S.summary = m.summary || {};
			render();
		});
	}

	// click a pending piece -> receive it (numbers dialog)
	$(root).on("click", ".co-chip.pend", function () {
		const row = this.getAttribute("data-row");
		const bag = this.getAttribute("data-bag");
		const batch = $(this).closest(".co-col").attr("data-name");
		const d = new frappe.ui.Dialog({
			title: __("Receive {0}", [bag]),
			fields: [
				{ fieldname: "huid", fieldtype: "Data", label: "HUID", description: __("From hallmarking — leave blank if none.") },
				{ fieldname: "certificate_no", fieldtype: "Data", label: __("Certificate No") },
			],
			primary_action_label: __("Receive"),
			primary_action: (v) => {
				d.hide();
				frappe.dom.freeze(__("Receiving..."));
				frappe.call({
					method: API + ".receive_certification",
					args: { name: batch, rows: [{ row, huid: v.huid, certificate_no: v.certificate_no }] },
				}).then((r) => {
					frappe.dom.unfreeze();
					frappe.show_alert({ message: __("{0} received back ({1}).", [bag, (r.message || {}).status]), indicator: "green" }, 5);
					load();
				}).catch(() => frappe.dom.unfreeze());
			},
		});
		d.show();
		setTimeout(() => d.fields_dict.huid.$input.focus(), 200);
	});

	page.set_primary_action(__("Send Pieces"), () => frappe.set_route("certify"));
	page.add_inner_button(__("Refresh"), load);
	load();
};
