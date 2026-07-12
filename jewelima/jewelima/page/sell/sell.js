// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Sell (Sales) — pick the buyer + price chart + today's gold rate, scan pieces:
// each line prices itself from the chart (all values editable); lines go RED
// when the piece is reserved for someone other than the buyer. A fixed strip at
// the bottom shows the component totals + grand total and the Sell button —
// selling records a Product Sale, writes the stock off Finished Goods and flips
// the bags to Sold (kept for returns). Route: /app/sell

frappe.pages["sell"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Sell", single_column: true });
	const API = "jewelima.jewelima.api";
	const S = { rows: [] };
	const esc = frappe.utils.escape_html;
	const money = (v) => "₹" + flt(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	const VALS = ["gold_value", "diamond_value", "stone_value", "labour_value", "charges_value"];

	$(page.main).append(`
		<style>
		.sl-top{display:flex;align-items:flex-end;gap:12px;margin:2px 0 10px;flex-wrap:wrap;}
		.sl-top .frappe-control{margin:0;}
		.sl-top .control-label{font-size:11px;margin:0 0 1px;color:var(--text-muted);}
		.sl-top .help-box,.sl-top .description{display:none !important;}
		.sl-buyer{width:230px;}.sl-chart{width:200px;}.sl-rate{width:130px;}.sl-scan{width:200px;}.sl-remarks{width:200px;}
		.sl-box{border:1px solid var(--border-color);border-radius:8px;background:var(--fg-color);overflow:auto;max-height:calc(100vh - 285px);}
		table.sl-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:12.5px;}
		table.sl-tbl th{position:sticky;top:0;z-index:1;background:var(--control-bg,var(--fg-color));border-bottom:1px solid var(--gray-400,#aeb6bf);padding:4px 8px;text-align:left;white-space:nowrap;font-weight:700;}
		table.sl-tbl td{border-bottom:1px solid var(--border-color);padding:3px 8px;white-space:nowrap;font-variant-numeric:tabular-nums;}
		table.sl-tbl td.r,table.sl-tbl th.r{text-align:right;}
		table.sl-tbl tr.mismatch td{background:#fdecec;}
		table.sl-tbl tr.mismatch td.sl-holder{color:#b00020;font-weight:700;}
		table.sl-tbl input.sl-v{width:92px;border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);border-radius:4px;height:25px;padding:1px 6px;font-size:12px;text-align:right;color:var(--text-color);box-sizing:border-box;}
		table.sl-tbl input.sl-v:focus{box-shadow:inset 0 0 0 1px var(--primary);outline:none;}
		.sl-bar{font-weight:700;}
		.sl-sub{color:var(--text-muted);font-size:11px;}
		.sl-total-cell{font-weight:800;}
		.sl-x{border:none;background:none;color:var(--text-muted);cursor:pointer;font-size:14px;}
		.sl-x:hover{color:#b02a2a;}
		.sl-empty{padding:24px;text-align:center;color:var(--text-muted);}
		.sl-warn{margin:8px 0 0;font-size:12px;color:#9a6700;display:none;}
		.sl-strip{position:sticky;bottom:0;z-index:5;margin-top:12px;border:1px solid var(--gray-400,#aeb6bf);border-radius:10px;
			background:var(--fg-color);box-shadow:0 -3px 14px rgba(0,0,0,.10);padding:10px 16px;display:flex;align-items:center;gap:20px;flex-wrap:wrap;}
		.sl-strip .k{font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;display:block;}
		.sl-strip .v{font-size:15px;font-weight:700;font-variant-numeric:tabular-nums;}
		.sl-strip .grand .k{color:#1d7a33;}
		.sl-strip .grand .v{font-size:24px;font-weight:800;color:#1d7a33;}
		.sl-sell{margin-left:auto;background:#1d7a33;border:none;color:#fff;font-weight:800;letter-spacing:.8px;padding:12px 30px;border-radius:8px;font-size:14px;cursor:pointer;box-shadow:0 2px 6px rgba(29,122,51,.35);}
		.sl-sell:hover{background:#155e26;}
		</style>
		<div class="sl-top">
			<div class="sl-buyer"></div><div class="sl-chart"></div><div class="sl-rate"></div>
			<div class="sl-scan"></div><div class="sl-remarks"></div>
		</div>
		<div class="sl-box"><table class="sl-tbl">
			<thead><tr><th>${__("Card")}</th><th>${__("Design")}</th><th class="sl-holder-h">${__("Held By")}</th>
			<th class="r">${__("Gold g")}</th><th class="r">${__("DMD ct")}</th>
			<th class="r">${__("Gold ₹")}</th><th class="r">${__("DMD ₹")}</th><th class="r">${__("Stones ₹")}</th>
			<th class="r">${__("Labour ₹")}</th><th class="r">${__("Charges ₹")}</th><th class="r">${__("Total ₹")}</th><th style="width:30px"></th></tr></thead>
			<tbody class="sl-rows"></tbody></table></div>
		<div class="sl-warn"></div>
		<div class="sl-strip">
			<span><span class="k">${__("Pieces")}</span><span class="v sl-t-n">0</span></span>
			<span><span class="k">${__("Gold")}</span><span class="v sl-t-gold">₹0.00</span></span>
			<span><span class="k">${__("Diamonds")}</span><span class="v sl-t-dmd">₹0.00</span></span>
			<span><span class="k">${__("Stones")}</span><span class="v sl-t-stone">₹0.00</span></span>
			<span><span class="k">${__("Labour")}</span><span class="v sl-t-lab">₹0.00</span></span>
			<span><span class="k">${__("Charges")}</span><span class="v sl-t-chg">₹0.00</span></span>
			<span class="grand"><span class="k">${__("Grand Total")}</span><span class="v sl-t-grand">₹0.00</span></span>
			<button class="sl-sell">${__("SELL")}</button>
		</div>
	`);
	const root = $(page.main)[0];

	const mk = (sel, df) => {
		const c = frappe.ui.form.make_control({ df, parent: $(root).find(sel).get(0), render_input: true });
		c.refresh();
		return c;
	};
	const buyer = mk(".sl-buyer", { fieldtype: "Link", label: __("Selling To"), fieldname: "buyer", options: "Customer",
		onchange: () => paint() });
	const chart = mk(".sl-chart", { fieldtype: "Link", label: __("Price Chart"), fieldname: "chart", options: "Price Chart",
		get_query: () => ({ filters: { status: "Active" } }),
		onchange: () => repriceAll() });
	const rate = mk(".sl-rate", { fieldtype: "Float", label: __("Gold Rate ₹/g"), fieldname: "rate" });
	const scan = mk(".sl-scan", { fieldtype: "Data", label: __("Scan card"), fieldname: "scan", placeholder: __("Scan barcode…") });
	const remarks = mk(".sl-remarks", { fieldtype: "Data", label: __("Remarks"), fieldname: "remarks" });
	const focusScan = () => setTimeout(() => scan.$input.focus(), 30);
	rate.$input.on("change", () => repriceAll());

	function ready(quiet) {
		const missing = [];
		if (!buyer.get_value()) missing.push(__("buyer"));
		if (!chart.get_value()) missing.push(__("price chart"));
		if (!flt(rate.get_value())) missing.push(__("gold rate"));
		if (missing.length && !quiet) frappe.show_alert({ message: __("Pick the {0} first.", [missing.join(", ")]), indicator: "orange" }, 4);
		return !missing.length;
	}

	function rowTotal(r) {
		return VALS.reduce((s, k) => s + flt(r[k]), 0);
	}

	function paint() {
		const to = buyer.get_value() || "";
		const $b = $(root).find(".sl-rows");
		$b.html(S.rows.length ? S.rows.map((r, i) => `
			<tr class="${r.held_by && to && r.held_by !== to ? "mismatch" : ""}" data-i="${i}">
				<td><span class="sl-bar">${esc(r.order_bag)}</span>${r.huid ? `<div class="sl-sub">HUID ${esc(r.huid)}</div>` : ""}</td>
				<td>${esc(r.design)}<div class="sl-sub">${esc(r.design_type)}${r.labour_rule ? " · " + esc(r.labour_rule) : ""}</div></td>
				<td class="sl-holder">${esc(r.held_by || "—")}</td>
				<td class="r">${flt(r.nett).toFixed(3)}</td>
				<td class="r">${r.dmd_ct ? flt(r.dmd_ct).toFixed(3) : "·"}</td>
				${VALS.map((k) => `<td class="r"><input class="sl-v" data-k="${k}" type="number" step="0.01" value="${flt(r[k]).toFixed(2)}"></td>`).join("")}
				<td class="r sl-total-cell sl-rowtotal">${money(rowTotal(r))}</td>
				<td><button class="sl-x">✕</button></td>
			</tr>`).join("")
			: `<tr><td colspan="12" class="sl-empty">${__("Pick buyer, chart and rate — then scan pieces.")}</td></tr>`);

		const mism = S.rows.filter((r) => r.held_by && to && r.held_by !== to).length;
		$(root).find(".sl-warn").toggle(!!mism)
			.text(mism ? __("{0} piece(s) in red are reserved for someone else — selling them to {1} anyway will move the hold.", [mism, to]) : "");
		totals();
	}

	function totals() {
		const t = { n: S.rows.length, gold: 0, dmd: 0, stone: 0, lab: 0, chg: 0 };
		S.rows.forEach((r) => {
			t.gold += flt(r.gold_value);
			t.dmd += flt(r.diamond_value);
			t.stone += flt(r.stone_value);
			t.lab += flt(r.labour_value);
			t.chg += flt(r.charges_value);
		});
		$(root).find(".sl-t-n").text(t.n);
		$(root).find(".sl-t-gold").text(money(t.gold));
		$(root).find(".sl-t-dmd").text(money(t.dmd));
		$(root).find(".sl-t-stone").text(money(t.stone));
		$(root).find(".sl-t-lab").text(money(t.lab));
		$(root).find(".sl-t-chg").text(money(t.chg));
		$(root).find(".sl-t-grand").text(money(t.gold + t.dmd + t.stone + t.lab + t.chg));
	}

	function fetchPiece(code, silent) {
		return frappe.call({
			method: API + ".get_sale_piece",
			args: { barcode: code, price_chart: chart.get_value(), gold_rate: flt(rate.get_value()) },
		}).then((r) => r.message);
	}

	function repriceAll() {
		if (!S.rows.length || !chart.get_value()) return;
		Promise.all(S.rows.map((r) => fetchPiece(r.order_bag))).then((fresh) => {
			S.rows = fresh;
			paint();
			frappe.show_alert({ message: __("Re-priced {0} line(s) from the chart.", [fresh.length]), indicator: "blue" }, 3);
		});
	}

	scan.$input.on("keydown", (e) => {
		if (e.key !== "Enter") return;
		const code = (scan.get_value() || "").trim();
		scan.set_value("");
		if (!code) return;
		if (!ready()) return;
		if (S.rows.some((r) => r.order_bag === code)) {
			frappe.show_alert({ message: __("{0} is already on the bill.", [code]), indicator: "orange" }, 4);
			focusScan();
			return;
		}
		fetchPiece(code).then((m) => {
			S.rows.push(m);
			paint();
			focusScan();
		}).catch(() => focusScan());
	});

	$(root).on("input", ".sl-v", function () {
		const i = +$(this).closest("tr").attr("data-i");
		S.rows[i][this.getAttribute("data-k")] = flt(this.value);
		$(this).closest("tr").find(".sl-rowtotal").text(money(rowTotal(S.rows[i])));
		totals();
	});
	$(root).on("click", ".sl-x", function () {
		S.rows.splice(+$(this).closest("tr").attr("data-i"), 1);
		paint();
		focusScan();
	});

	$(root).find(".sl-sell").on("click", () => {
		if (!S.rows.length) {
			frappe.show_alert({ message: __("Scan at least one piece."), indicator: "orange" }, 4);
			return;
		}
		if (!ready()) return;
		const to = buyer.get_value();
		const grand = $(root).find(".sl-t-grand").text();
		frappe.confirm(__("Sell {0} piece(s) to {1} for {2}?<br>Stock writes off and the cards go to SOLD.", [S.rows.length, esc(to), grand]), () => {
			frappe.dom.freeze(__("Recording sale..."));
			frappe.call({
				method: API + ".create_product_sale",
				args: { payload: {
					customer: to, price_chart: chart.get_value(), gold_rate: flt(rate.get_value()),
					remarks: remarks.get_value(),
					lines: S.rows.map((r) => ({
						order_bag: r.order_bag, design: r.design, design_type: r.design_type,
						held_by: r.held_by, nett: r.nett, dmd_ct: r.dmd_ct, ostone_ct: r.ostone_ct,
						...Object.fromEntries(VALS.map((k) => [k, flt(r[k])])),
					})),
				} },
			}).then((r) => {
				frappe.dom.unfreeze();
				const m = r.message || {};
				frappe.msgprint({
					title: __("Sold"), indicator: "green",
					message: __("<a href='/app/product-sale/{0}'>{0}</a> — {1} piece(s) to {2}, total {3}.<br>Stock written off ({4}); cards are SOLD (kept for returns).",
						[m.name, m.count, esc(to), money(m.grand_total), esc(m.stock_entry || "")]),
				});
				S.rows = [];
				paint();
				focusScan();
			}).catch(() => frappe.dom.unfreeze());
		});
	});

	page.add_inner_button(__("Sale Records"), () => frappe.set_route("List", "Product Sale"));
	paint();
	focusScan();
};
