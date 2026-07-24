// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Sell (Sales) — pick the buyer + price chart + today's gold rate, scan pieces.
// EXCEL-STYLE board: one column PER COST COMPONENT (Gold, Diamond, CS, CZ, CVD,
// Precious, Making, Hallmark, each lab cert) and a column only appears when at
// least one scanned piece carries that cost. Every cell is editable; a
// component the chart could not price arrives BLANK on amber — type the price
// by hand, SELL stays blocked until every amber cell is filled. Lines go RED
// when the piece is reserved for someone other than the buyer. Selling records
// a Product Sale, writes stock off Finished Goods and flips the bags to Sold.
// Route: /app/sell

frappe.pages["sell"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Sell", single_column: true });
	const API = "jewelima.jewelima.api";
	const S = { rows: [], adjust: [] };
	const esc = frappe.utils.escape_html;
	const money = (v) => "₹" + flt(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	// canonical column order; cert:* columns slot in after hall, alphabetically
	const ORDER = ["gold", "dmd", "pdmd", "cs", "cz", "cvd", "ps", "making", "hall"];

	$(page.main).append(`
		<style>
		.sl-wrap{display:flex;flex-direction:column;height:calc(100vh - 100px);min-height:0;}
		.sl-top{display:flex;align-items:flex-end;gap:12px;margin:2px 0 10px;flex-wrap:wrap;}
		.sl-top .frappe-control{margin:0;}
		.sl-top .control-label{font-size:11px;margin:0 0 1px;color:var(--text-muted);}
		.sl-top .help-box,.sl-top .description{display:none !important;}
		.sl-buyer{width:230px;}.sl-chart{width:200px;}.sl-rate{width:130px;}.sl-scan{width:200px;}.sl-remarks{width:200px;}
		.sl-box{border:1px solid var(--border-color);border-radius:8px;background:var(--fg-color);overflow:auto;flex:1 1 auto;min-height:120px;}
		table.sl-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:12.5px;}
		table.sl-tbl th{position:sticky;top:0;z-index:1;background:var(--control-bg,var(--fg-color));border-bottom:1px solid var(--gray-400,#aeb6bf);padding:4px 8px;text-align:left;white-space:nowrap;font-weight:700;}
		table.sl-tbl td{border-bottom:1px solid var(--border-color);padding:3px 8px;white-space:nowrap;font-variant-numeric:tabular-nums;}
		table.sl-tbl td.r,table.sl-tbl th.r{text-align:right;}
		table.sl-tbl tr.mismatch td{background:#fdecec;}
		table.sl-tbl tr.mismatch td.sl-holder{color:#b00020;font-weight:700;}
		table.sl-tbl input.sl-v{width:92px;border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);border-radius:4px;height:25px;padding:1px 6px;font-size:12px;text-align:right;color:var(--text-color);box-sizing:border-box;}
		table.sl-tbl input.sl-v:focus{box-shadow:inset 0 0 0 1px var(--primary);outline:none;}
		table.sl-tbl input.sl-v.needs{background:#fff6e0;border-color:#e0a800;box-shadow:inset 0 0 0 1px #e0a800;}
		table.sl-tbl td .sl-dot{color:var(--text-muted);}
		.sl-bar{font-weight:700;}
		.sl-sub{color:var(--text-muted);font-size:11px;}
		.sl-total-cell{font-weight:800;}
		.sl-x{border:none;background:none;color:var(--text-muted);cursor:pointer;font-size:14px;}
		.sl-x:hover{color:#b02a2a;}
		.sl-empty{padding:24px;text-align:center;color:var(--text-muted);}
		.sl-warn{margin:8px 0 0;font-size:12px;color:#9a6700;display:none;}
		.sl-strip{flex:0 0 auto;z-index:1;margin-top:12px;border:1px solid var(--gray-400,#aeb6bf);border-radius:10px;
			background:var(--fg-color);box-shadow:0 -3px 14px rgba(0,0,0,.10);padding:10px 16px;display:flex;align-items:center;gap:18px;flex-wrap:wrap;}
		.sl-strip .k{font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;display:block;}
		.sl-strip .v{font-size:14px;font-weight:700;font-variant-numeric:tabular-nums;}
		.sl-strip .grand .k{color:#1d7a33;}
		.sl-strip .grand .v{font-size:24px;font-weight:800;color:#1d7a33;}
		.sl-sell{margin-left:auto;background:#1d7a33;border:none;color:#fff;font-weight:800;letter-spacing:.8px;padding:12px 30px;border-radius:8px;font-size:14px;cursor:pointer;box-shadow:0 2px 6px rgba(29,122,51,.35);}
		.sl-sell:hover{background:#155e26;}
		.sl-sell[disabled]{background:#9aa5a0;cursor:not-allowed;box-shadow:none;}
		.sl-tip{position:fixed;z-index:2000;display:none;background:#1a1a1a;color:#fff;border-radius:7px;padding:8px 12px;font-size:12px;line-height:1.6;box-shadow:0 4px 14px rgba(0,0,0,.3);max-width:340px;pointer-events:none;}
		.sl-tip .t{font-weight:700;margin-bottom:3px;color:#ffd766;}
		</style>
		<div class="sl-wrap">
		<div class="sl-top">
			<div class="sl-buyer"></div><div class="sl-chart"></div><div class="sl-rate"></div>
			<div class="sl-scan"></div><div class="sl-remarks"></div>
		</div>
		<div class="sl-box"><table class="sl-tbl">
			<thead></thead>
			<tbody class="sl-rows"></tbody></table></div>
		<div class="sl-warn"></div>
		<div class="sl-strip"><span class="sl-strip-totals" style="display:contents"></span>
			<button class="sl-sell">${__("SELL")}</button>
		</div>
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

	// the columns THIS bill needs: union of the scanned pieces' components
	function activeCols() {
		const keys = new Set();
		S.rows.forEach((r) => Object.keys(r.components || {}).forEach((k) => keys.add(k)));
		const certs = [...keys].filter((k) => k.startsWith("cert:")).sort();
		return ORDER.filter((k) => keys.has(k)).concat(certs);
	}
	const colLabel = (k) => {
		for (const r of S.rows) if (r.components && r.components[k]) return r.components[k].label;
		return k;
	};
	const compVal = (c) => (c && c.value !== null && c.value !== "" ? flt(c.value) : 0);

	function rowTotal(r) {
		return Object.values(r.components || {}).reduce((s, c) => s + compVal(c), 0);
	}
	function pendingCells() {
		let n = 0;
		S.rows.forEach((r) => Object.values(r.components || {}).forEach((c) => {
			if (c.needs_price && (c.value === null || c.value === "")) n++;
		}));
		return n;
	}

	function paint() {
		const to = buyer.get_value() || "";
		const cols = activeCols();
		$(root).find("thead").html(`
			<tr><th>${__("Card")}</th><th>${__("Design")}</th><th class="sl-holder-h">${__("Held By")}</th>
			<th class="r">${__("Gold g")}</th><th class="r">${__("DMD ct")}</th>
			${cols.map((k) => `<th class="r">${esc(colLabel(k))} ₹</th>`).join("")}
			<th class="r">${__("Total ₹")}</th><th style="width:30px"></th></tr>`);
		const $b = $(root).find(".sl-rows");
		$b.html(S.rows.length ? S.rows.map((r, i) => `
			<tr class="${r.held_by && to && r.held_by !== to && r.held_by !== "JD Stock" ? "mismatch" : ""}" data-i="${i}">
				<td class="sl-bag" data-bag="${esc(r.order_bag)}"><span class="sl-bar">${esc(r.order_bag)}</span>${r.huid ? `<div class="sl-sub">HUID ${esc(r.huid)}</div>` : ""}</td>
				<td>${esc(r.design)}<div class="sl-sub">${esc(r.design_type)}</div></td>
				<td class="sl-holder">${esc(r.held_by || "—")}</td>
				<td class="r">${flt(r.nett).toFixed(3)}</td>
				<td class="r">${r.dmd_ct ? flt(r.dmd_ct).toFixed(3) : "·"}</td>
				${cols.map((k) => {
					const c = (r.components || {})[k];
					if (!c) return `<td class="r"><span class="sl-dot">·</span></td>`;
					const empty = c.value === null || c.value === "";
					return `<td class="r"><input class="sl-v ${c.needs_price && empty ? "needs" : ""}" data-k="${k}" type="number" step="0.01"
						value="${empty ? "" : flt(c.value).toFixed(2)}" title="${esc(c.note || "")}"
						${c.needs_price && empty ? `placeholder="?"` : ""}></td>`;
				}).join("")}
				<td class="r sl-total-cell sl-rowtotal">${money(rowTotal(r))}</td>
				<td><button class="sl-x">✕</button></td>
			</tr>`).join("")
			: `<tr><td colspan="${cols.length + 7}" class="sl-empty">${__("Scan pieces to start — buyer, chart and gold rate can come any time before SELL.")}</td></tr>`);

		const mism = S.rows.filter((r) => r.held_by && to && r.held_by !== to && r.held_by !== "JD Stock").length;
		const pend = pendingCells();
		const warns = [];
		if (mism) warns.push(__("{0} piece(s) in red are reserved for someone else — selling them to {1} anyway will move the hold.", [mism, to]));
		if (pend) warns.push(__("{0} amber cell(s) need a manual price before you can SELL.", [pend]));
		$(root).find(".sl-warn").toggle(!!warns.length).html(warns.join("<br>"));
		totals();
	}

	function totals() {
		const cols = activeCols();
		const t = {};
		let grand = 0;
		S.rows.forEach((r) => cols.forEach((k) => {
			const v = compVal((r.components || {})[k]);
			t[k] = (t[k] || 0) + v;
			grand += v;
		}));
		$(root).find(".sl-strip-totals").html(
			`<span><span class="k">${__("Pieces")}</span><span class="v">${S.rows.length}</span></span>`
			+ cols.map((k) => `<span><span class="k">${esc(colLabel(k))}</span><span class="v">${money(t[k] || 0)}</span></span>`).join("")
			+ `<span class="grand"><span class="k">${__("Grand Total")}</span><span class="v sl-t-grand">${money(grand)}</span></span>`);
		$(root).find(".sl-sell").prop("disabled", !!pendingCells());
	}

	function fetchPiece(code) {
		return frappe.call({
			method: API + ".get_sale_piece",
			args: { barcode: code, price_chart: chart.get_value(), gold_rate: flt(rate.get_value()) },
		}).then((r) => r.message);
	}

	function repriceAll() {
		if (!S.rows.length) return;
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
		const k = this.getAttribute("data-k");
		const c = S.rows[i].components[k];
		c.value = this.value === "" ? null : flt(this.value);
		$(this).toggleClass("needs", !!(c.needs_price && (c.value === null || c.value === "")));
		$(this).closest("tr").find(".sl-rowtotal").text(money(rowTotal(S.rows[i])));
		totals();
	});
	$(root).on("click", ".sl-x", function () {
		S.rows.splice(+$(this).closest("tr").attr("data-i"), 1);
		paint();
		focusScan();
	});

	// components -> the sale's 5 recorded buckets
	function buckets(r) {
		const g = (keys) => keys.reduce((s, k) => s + compVal((r.components || {})[k]), 0);
		const certKeys = Object.keys(r.components || {}).filter((k) => k === "hall" || k.startsWith("cert:"));
		return {
			gold_value: g(["gold"]),
			diamond_value: g(["dmd", "pdmd"]),
			stone_value: g(["cs", "cz", "cvd", "ps"]),
			labour_value: g(["making"]),
			charges_value: g(certKeys),
		};
	}

	$(root).find(".sl-sell").on("click", () => {
		if (!S.rows.length) {
			frappe.show_alert({ message: __("Scan at least one piece."), indicator: "orange" }, 4);
			return;
		}
		if (!ready()) return;
		if (pendingCells()) {
			frappe.show_alert({ message: __("Fill every amber cell first."), indicator: "orange" }, 5);
			return;
		}
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
						...buckets(r),
					})),
					adjustments: S.adjust,
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
				S.adjust = [];
				paint();
				focusScan();
			}).catch(() => frappe.dom.unfreeze());
		});
	});

	// hover a card no. -> its ACTUAL frozen BOM, so the priced values are explainable
	$(root).find(".sl-wrap").append(`<div class="sl-tip"></div>`);
	const bomCache = {};
	$(root).on("mouseenter", "td.sl-bag", function (e) {
		const bag = $(this).data("bag");
		const $tip = $(root).find(".sl-tip");
		const show = (lines) => {
			if (!lines.length) return;
			$tip.html(`<div class="t">${__("Actual BOM — {0}", [esc(bag)])}</div>` +
				lines.map((l) => esc(l)).join("<br>")).css({ left: e.clientX + 14, top: e.clientY + 12 }).show();
		};
		if (bomCache[bag]) return show(bomCache[bag]);
		frappe.call({ method: API + ".get_bag_bom_summary", args: { order_bag: bag }, freeze: false })
			.then((r) => { bomCache[bag] = (r.message || {}).lines || []; show(bomCache[bag]); });
	});
	$(root).on("mousemove", "td.sl-bag", function (e) {
		$(root).find(".sl-tip:visible").css({ left: e.clientX + 14, top: e.clientY + 12 });
	});
	$(root).on("mouseleave", "td.sl-bag", () => $(root).find(".sl-tip").hide());

	// Pricing Rules — ONLY the components priced on THIS bill, with a live %
	// board: type -10 next to Diamond and the reduced amount shows instantly.
	// Apply rescales the bill's cells (the Price Chart itself is never touched);
	// re-opening shows the already-reduced amounts. The applied adjustments ride
	// to create_product_sale and land as an audit comment on the Product Sale.
	page.add_inner_button(__("Pricing Rules"), () => {
		if (!S.rows.length) {
			frappe.show_alert({ message: __("Scan pieces first — this board adjusts what is on the bill."), indicator: "orange" }, 4);
			return;
		}
		const cols = activeCols();
		const cur = {};
		cols.forEach((k) => {
			cur[k] = S.rows.reduce((s, r) => s + compVal((r.components || {})[k]), 0);
		});
		const grand0 = Object.values(cur).reduce((a, b) => a + b, 0);
		const dlg = new frappe.ui.Dialog({
			title: __("Pricing in effect — this sale only"),
			size: "large",
			fields: [{ fieldtype: "HTML", fieldname: "board" }],
			primary_action_label: __("Apply to Bill"),
			primary_action: () => {
				const applied = [];
				dlg.$wrapper.find(".pr-pct").each(function () {
					const k = this.getAttribute("data-k");
					const pct = flt(this.value);
					if (!pct) return;
					S.rows.forEach((r) => {
						const c = (r.components || {})[k];
						if (c && c.value !== null && c.value !== "") c.value = Math.round(c.value * (1 + pct / 100) * 100) / 100;
					});
					applied.push(`${colLabel(k)} ${pct > 0 ? "+" : ""}${pct}%`);
				});
				dlg.hide();
				if (!applied.length) return;
				S.adjust = S.adjust.concat(applied);
				paint();
				frappe.show_alert({ message: __("Applied: {0}. Recorded in the sale's audit trail.", [applied.join("; ")]), indicator: "blue" }, 6);
			},
		});
		dlg.get_field("board").$wrapper.html(`
			<style>
			table.pr-tbl{width:100%;border-collapse:collapse;font-size:13px;}
			table.pr-tbl th{text-align:left;color:var(--text-muted);font-size:11px;text-transform:uppercase;letter-spacing:.05em;padding:4px 8px;border-bottom:1px solid var(--gray-400,#aeb6bf);}
			table.pr-tbl td{padding:5px 8px;border-bottom:1px solid var(--border-color);font-variant-numeric:tabular-nums;}
			table.pr-tbl td.r,table.pr-tbl th.r{text-align:right;}
			table.pr-tbl input.pr-pct{width:80px;text-align:right;border:1px solid var(--gray-400,#aeb6bf);border-radius:4px;height:26px;padding:1px 6px;background:var(--fg-color);color:var(--text-color);}
			table.pr-tbl .pr-new{font-weight:700;}
			table.pr-tbl .pr-cut{color:#b02a2a;font-weight:600;}
			table.pr-tbl tr.pr-grand td{font-weight:800;border-top:2px solid var(--gray-400,#aeb6bf);font-size:14px;}
			.pr-hist{margin-top:8px;font-size:12px;color:#9a6700;}
			</style>
			<table class="pr-tbl">
				<thead><tr><th>${__("Component")}</th><th class="r">${__("Current ₹")}</th>
				<th class="r">${__("Adjust %")}</th><th class="r">${__("After ₹")}</th><th class="r">${__("Difference ₹")}</th></tr></thead>
				<tbody>
				${cols.map((k) => `
					<tr data-k="${k}">
						<td>${esc(colLabel(k))}</td>
						<td class="r">${money(cur[k])}</td>
						<td class="r"><input class="pr-pct" data-k="${k}" type="number" step="0.5" placeholder="0"></td>
						<td class="r pr-new">${money(cur[k])}</td>
						<td class="r pr-cut"></td>
					</tr>`).join("")}
				<tr class="pr-grand"><td>${__("Grand Total")}</td><td class="r">${money(grand0)}</td><td></td>
					<td class="r pr-gnew">${money(grand0)}</td><td class="r pr-cut pr-gcut"></td></tr>
				</tbody>
			</table>
			${S.adjust.length ? `<div class="pr-hist">${__("Already applied earlier (amounts above include it)")}: ${esc(S.adjust.join("; "))}</div>` : ""}
		`);
		// live math while typing
		dlg.$wrapper.on("input", ".pr-pct", () => {
			let gnew = 0;
			dlg.$wrapper.find("tr[data-k]").each(function () {
				const k = this.getAttribute("data-k");
				const pct = flt($(this).find(".pr-pct").val());
				const after = Math.round(cur[k] * (1 + pct / 100) * 100) / 100;
				gnew += after;
				$(this).find(".pr-new").text(money(after));
				$(this).find(".pr-cut").text(pct ? (after >= cur[k] ? "+₹" : "−₹") + money(Math.abs(after - cur[k])).slice(1) : "");
			});
			dlg.$wrapper.find(".pr-gnew").text(money(gnew));
			const d = gnew - grand0;
			dlg.$wrapper.find(".pr-gcut").text(d ? (d > 0 ? "+₹" : "−₹") + money(Math.abs(d)).slice(1) : "");
		});
		dlg.show();
	});

	page.add_inner_button(__("Sale Records"), () => frappe.set_route("List", "Product Sale"));
	paint();
	focusScan();
};
