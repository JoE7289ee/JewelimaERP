// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Weight Add — one card at a time. Scan a bag, it pulls up the card's BOM, you
// add real weight per line (moves stock From a chosen warehouse -> In Bags). You
// can also edit the BOM (qty/weight, add materials) and save it. Route: /app/weight-add

frappe.pages["weight-add"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Weight Add", single_column: true });
	const state = { bag: null, materials: [], itemCtl: {} };

	$(page.main).append(`
		<style>
		.wt-bar{display:grid;grid-template-columns:1.4fr 1.4fr;gap:6px 14px;margin:2px 0 10px;align-items:end;}
		.wt-bar .help-box{display:none !important;}
		.wt-msg{display:none;margin:0 0 8px;padding:7px 11px;border-radius:6px;font-size:13px;}
		.wt-msg.err{display:block;background:#fbeaea;color:#b00020;border:1px solid #e6b3b3;}
		.wt-msg.ok{display:block;background:#eaf6ec;color:#1d7a33;border:1px solid #bfe3c6;}
		.wt-card{display:none;border:1px solid var(--border-color);border-radius:8px;padding:10px 14px;margin-bottom:12px;background:var(--fg-color);}
		.wt-card.show{display:block;}
		.wt-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px 18px;font-size:12px;}
		.wt-grid .k{color:var(--text-muted);}
		.wt-grid .v{font-weight:600;}
		.wt-box{border:1px solid var(--border-color);border-radius:8px;overflow:auto;}
		table.wt-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;background:var(--fg-color);}
		table.wt-tbl th{background:var(--control-bg,var(--fg-color));border-bottom:2px solid var(--gray-400,#aeb6bf);padding:6px 8px;text-align:left;font-weight:700;white-space:nowrap;}
		table.wt-tbl td{border-bottom:1px solid var(--border-color);padding:4px 8px;}
		table.wt-tbl td.num,table.wt-tbl th.num{text-align:right;}
		table.wt-tbl input{width:100%;text-align:right;box-sizing:border-box;}
		.wt-foot{display:none;justify-content:space-between;align-items:center;margin-top:10px;}
		.wt-foot.show{display:flex;}
		.wt-foot .tot{font-size:13px;color:var(--text-muted);}
		.wt-foot .tot b{color:var(--text-color);font-size:16px;}
		.wt-actions{display:flex;gap:8px;}
		.wt-stock{margin-top:18px;}
		.wt-stock-head{font-weight:700;font-size:14px;margin:0 0 6px;color:var(--text-color);}
		.wt-stock-head span{color:var(--text-muted);font-weight:400;}
		.wt-stock-box{border:1px solid var(--border-color);border-radius:8px;overflow:auto;max-height:38vh;}
		table.wt-stock-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:12px;background:var(--fg-color);}
		table.wt-stock-tbl th{position:sticky;top:0;background:var(--control-bg,var(--fg-color));border-bottom:1px solid var(--gray-400,#aeb6bf);padding:5px 8px;text-align:left;font-weight:700;white-space:nowrap;}
		table.wt-stock-tbl th.num,table.wt-stock-tbl td.num{text-align:right;}
		table.wt-stock-tbl td{border-bottom:1px solid var(--border-color);padding:4px 8px;white-space:nowrap;}
		table.wt-stock-tbl td.num{font-variant-numeric:tabular-nums;}
		.wt-stock-empty{padding:12px;color:var(--text-muted);text-align:center;}
		</style>
		<div class="wt-bar"><div class="wt-scan"></div><div class="wt-wh"></div></div>
		<div class="wt-msg"></div>
		<div class="wt-card"></div>
		<div class="wt-box"><table class="wt-tbl"><thead></thead><tbody></tbody></table></div>
		<div class="wt-foot">
			<div class="tot">Total added weight: <b class="wt-total">0.000</b> g</div>
			<div class="wt-actions"></div>
		</div>
		<div class="wt-stock">
			<div class="wt-stock-head">Stock in <span class="wt-stock-wh">—</span></div>
			<div class="wt-stock-box"><table class="wt-stock-tbl"><thead><tr><th>Item</th><th>Group</th><th class="num">Purity</th><th class="num">Weight</th><th class="num">Pure</th></tr></thead><tbody><tr><td colspan="5" class="wt-stock-empty">Pick a warehouse</td></tr></tbody></table></div>
		</div>
	`);

	const mk = (sel, df) => {
		const c = frappe.ui.form.make_control({ df, parent: $(page.main).find(sel).get(0), render_input: true });
		c.refresh();
		return c;
	};
	const scan = mk(".wt-scan", { fieldtype: "Data", label: "Scan Order Bag", fieldname: "scan", description: "Scan a bag barcode (or type + Enter)." });
	const whCtl = mk(".wt-wh", { fieldtype: "Link", label: "Add from warehouse", fieldname: "wh", options: "Warehouse", get_query: () => ({ filters: { is_group: 0, custom_is_issue_location: 1 } }), description: "Issue warehouses only (Gold Issue, Stone Issue, Casting)." });
	frappe.db.get_value("Warehouse", { warehouse_name: "Gold Issue" }, "name").then((r) => { if (r.message && r.message.name) { whCtl.set_value(r.message.name); loadStock(r.message.name); } });
	whCtl.$input.on("change awesomplete-selectcomplete", () => setTimeout(() => loadStock(), 60));

	const $msg = $(page.main).find(".wt-msg");
	const $card = $(page.main).find(".wt-card");
	const $head = $(page.main).find(".wt-tbl thead");
	const $body = $(page.main).find(".wt-tbl tbody");
	const $foot = $(page.main).find(".wt-foot");
	const $actions = $(page.main).find(".wt-actions");
	const flt = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));
	const focusScan = () => setTimeout(() => scan.$input.focus(), 30);
	const setMsg = (h, k) => { $msg.removeClass("err ok").html(h || ""); if (h) $msg.addClass(k || "err"); };

	function loadCard(code) {
		code = (code || "").trim();
		if (!code) return;
		frappe.call({ method: "jewelima.jewelima.api.get_card_for_weight", args: { order_bag: code } }).then((r) => {
			const d = r.message || {};
			if (!d.bag) { setMsg(__("No Order Bag <b>{0}</b>.", [frappe.utils.escape_html(code)]), "err"); return; }
			state.bag = d;
			state.materials = (d.materials || []).map((m) => ({ ...m, add_wt: 0, isNew: false }));
			setMsg("");
			renderAll();
		});
	}

	function renderCard() {
		const b = state.bag.bag;
		const cell = (k, v) => `<div><span class="k">${k}</span><br><span class="v">${frappe.utils.escape_html(v == null || v === "" ? "—" : "" + v)}</span></div>`;
		$card.addClass("show").html(`<div class="wt-grid">
			${cell("Bag", b.name)}${cell("Item", state.bag.item_name || state.bag.item || "")}${cell("Size", b.size)}${cell("Purity", (b.purity || 0) + "%")}
			${cell("Qty", b.qty)}${cell("Gross wt", (b.gross_weight || 0) + " g")}${cell("Net wt", (b.nett_weight || 0) + " g")}${cell("Order", b.job_order)}
			${cell("Party", b.customer)}${cell("Salesman", b.salesman)}${cell("Order date", b.order_date ? frappe.datetime.str_to_user(b.order_date) : "")}${b.is_finished ? cell("Status", "FINISHED (locked)") : ""}
		</div>`);
	}

	function renderTable() {
		state.itemCtl = {};
		$head.html(`<tr>
			<th style="width:30px">#</th><th>Item</th><th style="width:70px">Purity</th>
			<th class="num" style="width:100px">BOM Qty</th><th class="num" style="width:100px">BOM Wt</th><th class="num" style="width:100px">Current Wt</th>
			<th class="num" style="width:120px">Add Wt</th><th style="width:28px"></th>
		</tr>`);
		$body.empty();
		state.materials.forEach((m, i) => {
			const itemCell = m.isNew ? `<span class="wt-itemctl" data-i="${i}"></span>` : `<b>${frappe.utils.escape_html(m.item || "")}</b>`;
			const $tr = $(`<tr>
				<td>${i + 1}</td>
				<td>${itemCell}</td>
				<td>${(m.purity || 0)}%</td>
				<td class="num"><input type="number" step="1" class="form-control input-xs wt-bomqty" data-i="${i}" value="${m.bom_qty || 0}"></td>
				<td class="num"><input type="number" step="0.001" class="form-control input-xs wt-bomwt" data-i="${i}" value="${m.bom_weight || 0}"></td>
				<td class="num">${flt(m.cur_weight).toFixed(3)}</td>
				<td class="num"><input type="number" step="0.001" class="form-control input-xs wt-addwt" data-i="${i}" value="${m.add_wt || ""}"></td>
				<td>${m.isNew ? `<button class="btn btn-xs btn-default wt-rm" data-i="${i}">&times;</button>` : ""}</td>
			</tr>`);
			$body.append($tr);
		});
		// item Link controls for new rows
		state.materials.forEach((m, i) => {
			if (!m.isNew) return;
			const ctl = frappe.ui.form.make_control({ df: { fieldtype: "Link", options: "Item", fieldname: "it" + i, placeholder: "Item" }, parent: $body.find(`.wt-itemctl[data-i="${i}"]`).get(0), render_input: true });
			ctl.refresh();
			state.itemCtl[i] = ctl;
		});
		bindInputs();
		recalcTotal();
	}

	function bindInputs() {
		$body.find(".wt-addwt").off("input").on("input", function () { state.materials[$(this).data("i")].add_wt = flt(this.value); recalcTotal(); });
		$body.find(".wt-bomqty").off("input").on("input", function () { state.materials[$(this).data("i")].bom_qty = flt(this.value); });
		$body.find(".wt-bomwt").off("input").on("input", function () { state.materials[$(this).data("i")].bom_weight = flt(this.value); });
		$body.find(".wt-rm").off("click").on("click", function () { state.materials.splice($(this).data("i"), 1); renderTable(); });
	}
	function recalcTotal() {
		const t = state.materials.reduce((s, m) => s + flt(m.add_wt), 0);
		$(page.main).find(".wt-total").text(t.toFixed(3));
	}

	// bottom panel: live stock in the chosen issue warehouse (so you see what's available)
	function loadStock(whOverride) {
		const wh = whOverride || whCtl.get_value();
		const $b = $(page.main).find(".wt-stock-tbl tbody");
		$(page.main).find(".wt-stock-wh").text(wh ? wh.replace(/ - [A-Za-z]+$/, "") : "—");
		if (!wh) { $b.html('<tr><td colspan="5" class="wt-stock-empty">Pick a warehouse</td></tr>'); return; }
		frappe.call({ method: "jewelima.jewelima.api.get_melt_stock", args: { warehouse: wh } }).then((r) => {
			const rows = (r.message || {}).rows || [];
			$b.html(rows.map((x) => {
				const u = x.uom === "Carat" ? " ct" : " g";
				return `<tr><td>${frappe.utils.escape_html(x.item)}</td><td>${frappe.utils.escape_html(x.item_group)}</td>`
					+ `<td class="num">${x.purity ? x.purity.toFixed(2) + "%" : "—"}</td>`
					+ `<td class="num">${flt(x.weight).toFixed(3)}${u}</td>`
					+ `<td class="num">${x.pure ? flt(x.pure).toFixed(3) + " g" : "—"}</td></tr>`;
			}).join("") || '<tr><td colspan="5" class="wt-stock-empty">No stock in this warehouse</td></tr>');
		});
	}

	function renderAll() {
		renderCard();
		renderTable();
		$foot.addClass("show");
		renderActions();
	}

	function syncItemsFromControls() {
		Object.keys(state.itemCtl).forEach((i) => { state.materials[i].item = state.itemCtl[i].get_value(); });
	}

	function doWeightAdd() {
		if (!state.bag) return;
		syncItemsFromControls();
		const lines = state.materials.filter((m) => m.item && flt(m.add_wt) > 0).map((m) => ({ item: m.item, weight: flt(m.add_wt) }));
		if (!lines.length) return frappe.msgprint(__("Enter an Add Wt on at least one line."));
		frappe.dom.freeze(__("Adding…"));
		frappe.call({ method: "jewelima.jewelima.api.weight_add", args: { order_bag: state.bag.bag.name, lines: JSON.stringify(lines), from_warehouse: whCtl.get_value() || null } })
			.then((r) => { frappe.dom.unfreeze(); frappe.show_alert({ message: __("Added {0} g to {1}", [(r.message || {}).added, state.bag.bag.name]), indicator: "green" }, 5); loadCard(state.bag.bag.name); loadStock(); })
			.catch(() => frappe.dom.unfreeze());
	}
	function doSaveBom() {
		if (!state.bag) return;
		syncItemsFromControls();
		const rows = state.materials.filter((m) => m.item).map((m) => ({ item: m.item, qty: flt(m.bom_qty), weight: flt(m.bom_weight) }));
		frappe.dom.freeze(__("Saving BOM…"));
		frappe.call({ method: "jewelima.jewelima.api.save_bag_bom", args: { order_bag: state.bag.bag.name, rows: JSON.stringify(rows) } })
			.then(() => { frappe.dom.unfreeze(); frappe.show_alert({ message: __("BOM saved."), indicator: "green" }, 4); loadCard(state.bag.bag.name); })
			.catch(() => frappe.dom.unfreeze());
	}
	function addMaterialRow() {
		state.materials.push({ item: null, purity: 0, bom_qty: 0, bom_weight: 0, cur_weight: 0, add_wt: 0, isNew: true });
		renderTable();
	}
	function reset() {
		state.bag = null; state.materials = [];
		scan.set_value(""); setMsg("");
		$card.removeClass("show").empty(); $head.empty(); $body.empty(); $foot.removeClass("show");
		focusScan();
	}

	function renderActions() {
		$actions.empty();
		const locked = state.bag && state.bag.bag.is_finished;
		if (!locked) {
			$(`<button class="btn btn-default btn-sm">${__("Add Material")}</button>`).appendTo($actions).on("click", addMaterialRow);
			$(`<button class="btn btn-default btn-sm">${__("Save BOM")}</button>`).appendTo($actions).on("click", doSaveBom);
			$(`<button class="btn btn-primary btn-sm">${__("Weight Add")}</button>`).appendTo($actions).on("click", doWeightAdd);
		} else {
			$actions.html(`<span class="text-muted">${__("Card is finished — locked.")}</span>`);
		}
	}

	scan.$input.on("keydown", (e) => {
		if (e.which === 13 || e.key === "Enter") { e.preventDefault(); const c = scan.$input.val(); scan.set_value(""); loadCard(c); }
	});
	page.add_inner_button(__("Reset"), reset);
	focusScan();
};
