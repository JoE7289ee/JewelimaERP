// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Stock Transfer — pick a From and a To warehouse; each pane shows that warehouse's live
// stock. Tick items in the From pane, hit Transfer, and a dialog loads them with their
// available weight where you set how much to move. Posts a Material Transfer.
// Route: /app/stock-transfer

frappe.pages["stock-transfer"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Stock Transfer", single_column: true });

	$(page.main).append(`
		<style>
		.st-wrap{display:flex;flex-direction:column;height:calc(100vh - 95px);}
		.st-bar{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin:2px 0 12px;align-items:end;}
		.st-bar .help-box,.st-bar .description{display:none !important;}
		.st-cols{display:flex;gap:24px;flex:1;min-height:0;}
		.st-col{flex:1 1 0;display:flex;flex-direction:column;min-height:0;}
		.st-head{font-weight:700;font-size:15px;margin:0 0 8px;}
		.st-head span{color:var(--text-muted);font-weight:400;font-size:13px;}
		.st-box{flex:1;border:1px solid var(--border-color);border-radius:11px;overflow:auto;min-height:0;}
		table.st-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:12px;background:var(--fg-color);}
		table.st-tbl th{position:sticky;top:0;z-index:1;background:var(--control-bg,var(--fg-color));border-bottom:1px solid var(--gray-400,#aeb6bf);padding:6px 8px;text-align:left;font-weight:700;white-space:nowrap;}
		table.st-tbl th.num,table.st-tbl td.num{text-align:right;}
		table.st-tbl th.chk,table.st-tbl td.chk{text-align:center;width:34px;}
		table.st-tbl td{border-bottom:1px solid var(--border-color);padding:5px 8px;white-space:nowrap;}
		table.st-tbl td.num{font-variant-numeric:tabular-nums;}
		table.st-tbl tbody tr:hover td{background:var(--control-bg);}
		.st-empty{padding:16px;text-align:center;color:var(--text-muted);}
		.st-foot{margin-top:8px;font-size:13px;color:var(--text-muted);display:flex;gap:18px;}
		.st-foot b{color:var(--text-color);font-variant-numeric:tabular-nums;}
		.st-dlg-tbl input{width:120px;text-align:right;}
		</style>
		<div class="st-wrap">
			<div class="st-bar"><div class="st-from-wh"></div><div class="st-to-wh"></div></div>
			<div class="st-cols">
				<div class="st-col">
					<div class="st-head">From: <span class="st-from-name">—</span></div>
					<div class="st-box"><table class="st-tbl st-from"><thead><tr><th class="chk"><input type="checkbox" class="st-all"></th><th>Item</th><th>Group</th><th class="num">Purity</th><th class="num">Weight</th><th class="num">Pure</th></tr></thead><tbody><tr><td colspan="6" class="st-empty">Pick a warehouse</td></tr></tbody></table></div>
					<div class="st-foot"><span>Gross <b class="st-from-gross">0.000 g</b></span><span>Pure <b class="st-from-pure">0.000 g</b></span></div>
				</div>
				<div class="st-col">
					<div class="st-head">To: <span class="st-to-name">—</span></div>
					<div class="st-box"><table class="st-tbl st-to"><thead><tr><th>Item</th><th>Group</th><th class="num">Purity</th><th class="num">Weight</th><th class="num">Pure</th></tr></thead><tbody><tr><td colspan="5" class="st-empty">Pick a warehouse</td></tr></tbody></table></div>
					<div class="st-foot"><span>Gross <b class="st-to-gross">0.000 g</b></span><span>Pure <b class="st-to-pure">0.000 g</b></span></div>
				</div>
			</div>
		</div>
	`);

	const root = $(page.main)[0];
	const q = (s) => root.querySelector(s);
	const mk = (sel, df) => { const c = frappe.ui.form.make_control({ df, parent: root.querySelector(sel), render_input: true }); c.refresh(); return c; };
	const flt = window.flt || ((x) => parseFloat(x) || 0);
	const st = { from: [] };

	// only warehouses flagged as transfer locations are on offer — loss buckets and
	// the In Bags pool are never among them (the server refuses those outright,
	// whatever the flag says)
	const whQuery = () => ({ filters: { is_group: 0, custom_is_loss: 0, custom_is_transfer_location: 1 } });
	const fromWh = mk(".st-from-wh", { fieldtype: "Link", label: "From Warehouse", fieldname: "fw", options: "Warehouse", reqd: 1, get_query: whQuery });
	const toWh = mk(".st-to-wh", { fieldtype: "Link", label: "To Warehouse", fieldname: "tw", options: "Warehouse", reqd: 1, get_query: whQuery });
	fromWh.$input.on("change awesomplete-selectcomplete", () => setTimeout(loadFrom, 60));
	toWh.$input.on("change awesomplete-selectcomplete", () => setTimeout(loadTo, 60));

	const shortName = (w) => (w ? w.replace(/ - [A-Za-z]+$/, "") : "—");
	const numfmt = (n) => flt(n).toFixed(3);

	function rowHtml(x, chk) {
		const u = x.uom === "Carat" ? " ct" : " g";
		const c = chk ? `<td class="chk"><input type="checkbox" class="st-row" data-item="${frappe.utils.escape_html(x.item)}" data-uom="${x.uom}" data-avail="${x.weight}"></td>` : "";
		return `<tr>${c}<td>${frappe.utils.escape_html(x.item)}</td><td>${frappe.utils.escape_html(x.item_group)}</td>`
			+ `<td class="num">${x.purity ? x.purity.toFixed(2) + "%" : "—"}</td>`
			+ `<td class="num">${numfmt(x.weight) + u}</td>`
			+ `<td class="num">${x.pure ? numfmt(x.pure) + " g" : "—"}</td></tr>`;
	}

	function loadFrom() {
		const w = fromWh.get_value();
		q(".st-from-name").textContent = shortName(w);
		const $b = q(".st-from tbody");
		q(".st-all").checked = false;
		if (!w) { $b.innerHTML = '<tr><td colspan="6" class="st-empty">Pick a warehouse</td></tr>'; st.from = []; q(".st-from-gross").textContent = "0.000 g"; q(".st-from-pure").textContent = "0.000 g"; return; }
		frappe.call({ method: "jewelima.jewelima.api.get_melt_stock", args: { warehouse: w } }).then((r) => {
			const d = r.message || { rows: [] }; st.from = d.rows || [];
			$b.innerHTML = st.from.map((x) => rowHtml(x, true)).join("") || '<tr><td colspan="6" class="st-empty">No stock here</td></tr>';
			q(".st-from-gross").textContent = numfmt(d.total_weight) + " g";
			q(".st-from-pure").textContent = numfmt(d.total_pure) + " g";
		});
	}
	function loadTo() {
		const w = toWh.get_value();
		q(".st-to-name").textContent = shortName(w);
		const $b = q(".st-to tbody");
		if (!w) { $b.innerHTML = '<tr><td colspan="5" class="st-empty">Pick a warehouse</td></tr>'; q(".st-to-gross").textContent = "0.000 g"; q(".st-to-pure").textContent = "0.000 g"; return; }
		frappe.call({ method: "jewelima.jewelima.api.get_melt_stock", args: { warehouse: w } }).then((r) => {
			const d = r.message || { rows: [] };
			$b.innerHTML = (d.rows || []).map((x) => rowHtml(x, false)).join("") || '<tr><td colspan="5" class="st-empty">No stock here</td></tr>';
			q(".st-to-gross").textContent = numfmt(d.total_weight) + " g";
			q(".st-to-pure").textContent = numfmt(d.total_pure) + " g";
		});
	}

	$(page.main).on("change", ".st-all", function () { $(page.main).find(".st-row").prop("checked", this.checked); });

	loadFrom(); loadTo();

	page.set_primary_action(__("Transfer →"), () => {
		const fw = fromWh.get_value(), tw = toWh.get_value();
		if (!fw || !tw) return frappe.msgprint(__("Pick both the From and To warehouses."));
		if (fw === tw) return frappe.msgprint(__("Source and destination must be different."));
		const sel = $(page.main).find(".st-row:checked").map(function () {
			return { item: $(this).data("item"), uom: $(this).data("uom"), avail: flt($(this).data("avail")) };
		}).get();
		if (!sel.length) return frappe.msgprint(__("Tick the items to transfer in the From table."));
		openTransferDialog(fw, tw, sel);
	}, "add");

	function openTransferDialog(fw, tw, sel) {
		const d = new frappe.ui.Dialog({
			title: __("Transfer to {0}", [shortName(tw)]),
			size: "large",
			fields: [{ fieldtype: "HTML", fieldname: "grid" }],
			primary_action_label: __("Transfer"),
			primary_action() {
				const inputs = d.fields_dict.grid.$wrapper.find(".td-in").toArray();
				const items = sel.map((s, i) => ({ item: s.item, weight: flt(inputs[i] && inputs[i].value), avail: s.avail })).filter((x) => x.weight > 0);
				if (!items.length) return frappe.msgprint(__("Enter a weight to transfer."));
				const bad = items.find((x) => x.weight > x.avail + 0.0005);
				if (bad) return frappe.msgprint(__("{0}: cannot transfer more than the available {1}.", [bad.item, bad.avail.toFixed(3)]));
				frappe.dom.freeze(__("Transferring…"));
				frappe.call({ method: "jewelima.jewelima.api.transfer_stock", args: { from_warehouse: fw, to_warehouse: tw, items: JSON.stringify(items.map((x) => ({ item: x.item, weight: x.weight }))) } })
					.then((r) => {
						frappe.dom.unfreeze();
						const res = r.message || {};
						if (!res.name) return;
						d.hide();
						frappe.show_alert({ message: __("Transferred {0} item(s) — {1}", [res.count, res.name]), indicator: "green" }, 6);
						loadFrom(); loadTo();
					}).catch(() => frappe.dom.unfreeze());
			},
		});
		const rows = sel.map((s) => {
			const u = s.uom === "Carat" ? "ct" : "g";
			return `<tr><td>${frappe.utils.escape_html(s.item)}</td><td class="num" style="text-align:right">${s.avail.toFixed(3)} ${u}</td>`
				+ `<td style="text-align:right"><input type="number" step="0.001" min="0" class="td-in" value="${s.avail}"> ${u}</td></tr>`;
		}).join("");
		d.fields_dict.grid.$wrapper.html(`<table class="table table-bordered st-dlg-tbl" style="font-size:13px;">
			<thead><tr><th>Item</th><th style="text-align:right">Available</th><th style="text-align:right">Transfer</th></tr></thead>
			<tbody>${rows}</tbody></table>
			<div class="text-muted" style="font-size:12px;">From <b>${frappe.utils.escape_html(shortName(fw))}</b> → <b>${frappe.utils.escape_html(shortName(tw))}</b>. Weights pre-filled to the full available amount — edit to send less.</div>`);
		d.show();
	}
};
