// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Weight Reduce — one card at a time. Scan a bag, it shows the materials the card
// currently holds; reduce weight per line (moves stock In Bags -> a chosen
// warehouse). Route: /app/weight-reduce

frappe.pages["weight-reduce"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Weight Reduce", single_column: true });
	const state = { bag: null, materials: [] };

	$(page.main).append(`
		<style>
		.wt-bar{display:grid;grid-template-columns:1.4fr 1.4fr;gap:6px 14px;margin:2px 0 10px;align-items:end;}
		.wt-bar .help-box{display:none !important;}
		.wt-msg{display:none;margin:0 0 8px;padding:7px 11px;border-radius:6px;font-size:13px;}
		.wt-msg.err{display:block;background:#fbeaea;color:#b00020;border:1px solid #e6b3b3;}
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
		</style>
		<div class="wt-bar"><div class="wt-scan"></div><div class="wt-wh"></div></div>
		<div class="wt-msg"></div>
		<div class="wt-card"></div>
		<div class="wt-box"><table class="wt-tbl"><thead></thead><tbody></tbody></table></div>
		<div class="wt-foot">
			<div class="tot">Total reduce: <b class="wt-total">0.000</b> g</div>
			<div class="wt-actions"></div>
		</div>
	`);

	const mk = (sel, df) => {
		const c = frappe.ui.form.make_control({ df, parent: $(page.main).find(sel).get(0), render_input: true });
		c.refresh();
		return c;
	};
	const scan = mk(".wt-scan", { fieldtype: "Data", label: "Scan Order Bag", fieldname: "scan", description: "Scan a bag barcode (or type + Enter)." });
	const whCtl = mk(".wt-wh", { fieldtype: "Link", label: "Remove to warehouse", fieldname: "wh", options: "Warehouse", description: "Defaults to Raw Materials Store." });

	const $msg = $(page.main).find(".wt-msg");
	const $card = $(page.main).find(".wt-card");
	const $head = $(page.main).find(".wt-tbl thead");
	const $body = $(page.main).find(".wt-tbl tbody");
	const $foot = $(page.main).find(".wt-foot");
	const $actions = $(page.main).find(".wt-actions");
	const flt = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));
	const focusScan = () => setTimeout(() => scan.$input.focus(), 30);
	const setMsg = (h, k) => { $msg.removeClass("err").html(h || ""); if (h) $msg.addClass(k || "err"); };

	function loadCard(code) {
		code = (code || "").trim();
		if (!code) return;
		frappe.call({ method: "jewelima.jewelima.api.get_card_for_weight", args: { order_bag: code } }).then((r) => {
			const d = r.message || {};
			if (!d.bag) { setMsg(__("No Order Bag <b>{0}</b>.", [frappe.utils.escape_html(code)]), "err"); return; }
			state.bag = d;
			state.materials = (d.materials || []).filter((m) => flt(m.cur_weight) > 0).map((m) => ({ ...m, reduce_wt: 0 }));
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
		$head.html(`<tr><th style="width:30px">#</th><th>Item</th><th style="width:80px">Purity</th><th class="num" style="width:130px">Current Wt</th><th class="num" style="width:130px">Reduce Wt</th></tr>`);
		$body.empty();
		if (!state.materials.length) {
			$body.html(`<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:14px;">This card holds no materials to reduce.</td></tr>`);
			return;
		}
		state.materials.forEach((m, i) => {
			$body.append(`<tr>
				<td>${i + 1}</td>
				<td><b>${frappe.utils.escape_html(m.item || "")}</b></td>
				<td>${(m.purity || 0)}%</td>
				<td class="num">${flt(m.cur_weight).toFixed(3)}</td>
				<td class="num"><input type="number" step="0.001" max="${flt(m.cur_weight)}" class="form-control input-xs wt-redwt" data-i="${i}" value=""></td>
			</tr>`);
		});
		$body.find(".wt-redwt").on("input", function () {
			let v = flt(this.value);
			const max = flt(state.materials[$(this).data("i")].cur_weight);
			if (v > max) { v = max; this.value = max; }
			state.materials[$(this).data("i")].reduce_wt = v;
			recalcTotal();
		});
	}
	function recalcTotal() {
		const t = state.materials.reduce((s, m) => s + flt(m.reduce_wt), 0);
		$(page.main).find(".wt-total").text(t.toFixed(3));
	}

	function renderAll() {
		renderCard();
		renderTable();
		$foot.addClass("show");
		$actions.empty();
		if (state.bag.bag.is_finished) {
			$actions.html(`<span class="text-muted">${__("Card is finished — locked.")}</span>`);
		} else {
			$(`<button class="btn btn-primary btn-sm">${__("Weight Reduce")}</button>`).appendTo($actions).on("click", doReduce);
		}
	}

	function doReduce() {
		if (!state.bag) return;
		const lines = state.materials.filter((m) => flt(m.reduce_wt) > 0).map((m) => ({ item: m.item, weight: flt(m.reduce_wt) }));
		if (!lines.length) return frappe.msgprint(__("Enter a Reduce Wt on at least one line."));
		frappe.dom.freeze(__("Reducing…"));
		frappe.call({ method: "jewelima.jewelima.api.weight_reduce", args: { order_bag: state.bag.bag.name, lines: JSON.stringify(lines), to_warehouse: whCtl.get_value() || null } })
			.then((r) => { frappe.dom.unfreeze(); frappe.show_alert({ message: __("Reduced {0} g from {1}", [(r.message || {}).removed, state.bag.bag.name]), indicator: "orange" }, 5); loadCard(state.bag.bag.name); })
			.catch(() => frappe.dom.unfreeze());
	}
	function reset() {
		state.bag = null; state.materials = [];
		scan.set_value(""); setMsg("");
		$card.removeClass("show").empty(); $head.empty(); $body.empty(); $foot.removeClass("show");
		focusScan();
	}

	scan.$input.on("keydown", (e) => {
		if (e.which === 13 || e.key === "Enter") { e.preventDefault(); const c = scan.$input.val(); scan.set_value(""); loadCard(c); }
	});
	page.add_inner_button(__("Reset"), reset);
	focusScan();
};
