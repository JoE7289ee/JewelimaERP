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
	const S = { rows: [], adjust: [], prep: null, hist: [] };
	const esc = frappe.utils.escape_html;
	const money = (v) => "₹" + flt(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	// canonical column order; cert:* columns slot in after hall, alphabetically
	const ORDER = ["gold", "dmd", "pdmd", "cs", "cz", "cvd", "ps", "making", "hall", "cert"];

	$(page.main).append(`
		<style>
		.sl-wrap{display:flex;flex-direction:column;height:calc(100vh - 100px);min-height:0;}
		.sl-top{display:flex;align-items:flex-end;gap:12px;margin:2px 0 10px;flex-wrap:wrap;}
		.sl-top .frappe-control{margin:0;}
		.sl-top .control-label{font-size:11px;margin:0 0 1px;color:var(--text-muted);}
		.sl-top .help-box,.sl-top .description{display:none !important;}
		.sl-buyer{width:230px;}.sl-chart{width:200px;}.sl-rate{width:130px;}.sl-scan{width:200px;}.sl-remarks{width:200px;}
		.sl-tax{align-self:center;margin-top:14px;}
		.sl-tax .checkbox{margin:0;} .sl-tax .label-area{font-weight:700;}
		.sl-box{border:1px solid var(--border-color);border-radius:8px;background:var(--fg-color);overflow:auto;flex:1 1 auto;min-height:120px;}
		table.sl-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:12.5px;}
		table.sl-tbl th{position:sticky;top:0;z-index:1;background:var(--control-bg,var(--fg-color));border-bottom:1px solid var(--gray-400,#aeb6bf);padding:4px 8px;text-align:left;white-space:nowrap;font-weight:700;}
		table.sl-tbl td{border-bottom:1px solid var(--border-color);padding:3px 8px;white-space:nowrap;font-variant-numeric:tabular-nums;}
		table.sl-tbl td.r,table.sl-tbl th.r{text-align:right;}
		table.sl-tbl tr.mismatch td{background:#fdecec;}
		table.sl-tbl tr.mismatch td.sl-holder{color:#b00020;font-weight:700;}
		table.sl-tbl input.sl-v{width:92px;border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);border-radius:4px;height:25px;padding:1px 6px;font-size:12px;text-align:right;color:var(--text-color);box-sizing:border-box;}
		table.sl-tbl input.sl-v:focus{box-shadow:inset 0 0 0 1px var(--primary);outline:none;}
		table.sl-tbl input.sl-v.needs{background:#fdecec;border-color:#d9534f;box-shadow:inset 0 0 0 1px #d9534f;}
		table.sl-tbl input.sl-v.changed{background:#fff6e0;border-color:#e0a800;box-shadow:inset 0 0 0 1px #e0a800;}
		table.sl-tbl input.sl-v[readonly]{border-color:transparent;background:transparent;cursor:default;}
		table.sl-tbl input.sl-v.changed[readonly]{background:#fff6e0;border-color:#e0a800;box-shadow:inset 0 0 0 1px #e0a800;}
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
		.sl-prep{margin-left:auto;background:#e0a800;border:none;color:#3a2c00;font-weight:800;letter-spacing:.8px;padding:12px 24px;border-radius:8px;font-size:14px;cursor:pointer;box-shadow:0 2px 6px rgba(224,168,0,.35);}
		.sl-prep:hover{background:#c79500;}
		.sl-tip{position:fixed;z-index:2000;display:none;background:#1a1a1a;color:#fff;border-radius:7px;padding:8px 12px;font-size:12px;line-height:1.6;box-shadow:0 4px 14px rgba(0,0,0,.3);max-width:340px;pointer-events:none;}
		.sl-tip .t{font-weight:700;margin-bottom:3px;color:#ffd766;}
		</style>
		<div class="sl-wrap">
		<div class="sl-top">
			<div class="sl-buyer"></div><div class="sl-chart"></div><div class="sl-rate"></div>
			<div class="sl-scan"></div><div class="sl-remarks"></div><div class="sl-tax"></div>
		</div>
		<div class="sl-box"><table class="sl-tbl">
			<thead></thead>
			<tbody class="sl-rows"></tbody></table></div>
		<div class="sl-warn"></div>
		<div class="sl-strip"><span class="sl-strip-totals" style="display:contents"></span>
			<button class="sl-prep">${__("PREPARE TO SELL")}</button>
			<button class="sl-sell" style="margin-left:0;">${__("SELL")}</button>
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
		only_select: 1, onchange: () => paint() });
	const chart = mk(".sl-chart", { fieldtype: "Link", label: __("Price Chart"), fieldname: "chart", options: "Price Chart",
		only_select: 1, get_query: () => ({ filters: { status: "Active" } }),
		onchange: () => repriceAll() });
	// our own arrow: opens the Price Charts EDITOR with this chart loaded —
	// seated INSIDE the field, top-right beside the label
	$(root).find(".sl-chart").css("position", "relative");
	$(`<span class="sl-chart-open" title="${__("open in Price Charts")}"
		style="position:absolute;top:0;right:2px;font-size:13px;font-weight:700;cursor:pointer;color:var(--text-muted);line-height:1;">↗</span>`)
		.appendTo($(root).find(".sl-chart"))
		.on("click", () => {
			const nm = chart.get_value();
			if (!nm) return;
			frappe.route_options = { chart: nm };
			frappe.set_route("price-charts");
		})
		.hover(function () { $(this).css("color", "var(--primary, #1f618d)"); },
			function () { $(this).css("color", "var(--text-muted)"); });
	const rate = mk(".sl-rate", { fieldtype: "Float", label: __("Gold Rate ₹/g"), fieldname: "rate" });
	const scan = mk(".sl-scan", { fieldtype: "Data", label: __("Scan card"), fieldname: "scan", placeholder: __("Scan barcode…") });
	const remarks = mk(".sl-remarks", { fieldtype: "Data", label: __("Remarks"), fieldname: "remarks" });
	const tax = mk(".sl-tax", { fieldtype: "Check", label: __("3% Tax"), fieldname: "tax",
		onchange: () => totals() });
	tax.set_value(1);
	const focusScan = () => setTimeout(() => scan.$input.focus(), 30);
	rate.$input.on("change", () => repriceAll());

	function logHist(code, result, kind) {
		S.hist.push({ time: frappe.datetime.now_datetime(), code, result, kind: kind || "ok" });
	}
	function showHistory() {
		const h = S.hist;
		const body = h.slice().reverse().map((e, idx) => {
			const color = e.kind === "err" ? "#b00020" : e.kind === "warn" ? "#9a6700" : "#1d7a33";
			return `<tr><td>${h.length - idx}</td><td>${e.time ? frappe.datetime.str_to_user(e.time) : ""}</td>
				<td><b>${esc(e.code)}</b></td><td style="color:${color}">${esc(e.result)}</td></tr>`;
		}).join("");
		const d = new frappe.ui.Dialog({ title: __("Scan history ({0})", [h.length]), size: "large",
			fields: [{ fieldtype: "HTML", fieldname: "h" }] });
		d.fields_dict.h.$wrapper.html(h.length
			? `<table class="table table-bordered" style="font-size:12px;"><thead><tr><th style="width:40px">#</th><th>${__("Time")}</th><th>${__("Barcode")}</th><th>${__("Result")}</th></tr></thead><tbody>${body}</tbody></table>`
			: `<div class="text-muted" style="padding:12px;">${__("No scans yet this session.")}</div>`);
		d.show();
	}

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
			<tr><th>${__("Barcode")}</th><th>${__("Item")}</th><th class="sl-holder-h">${__("Held By")}</th>
			<th class="r">${__("Nett Wt")}</th><th class="r">${__("DMD ct")}</th>
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
					const cls = empty ? "needs" : (c.orig !== null && c.orig !== undefined && flt(c.value) !== flt(c.orig) ? "changed" : "");
					return `<td class="r"><input class="sl-v ${cls}" data-k="${k}" type="number" step="0.01"
						value="${empty ? "" : flt(c.value).toFixed(2)}" ${empty ? "" : "readonly"}
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
		const taxed = !!cint(tax.get_value());
		const taxAmt = taxed ? Math.round(grand * 3) / 100 : 0;
		$(root).find(".sl-strip-totals").html(
			`<span><span class="k">${__("Pieces")}</span><span class="v">${S.rows.length}</span></span>`
			+ cols.map((k) => `<span><span class="k">${esc(colLabel(k))}</span><span class="v">${money(t[k] || 0)}</span></span>`).join("")
			+ (taxed ? `<span><span class="k">${__("Tax 3%")}</span><span class="v">${money(taxAmt)}</span></span>` : "")
			+ `<span class="grand"><span class="k">${taxed ? __("Grand Total (incl. tax)") : __("Grand Total (no tax)")}</span><span class="v sl-t-grand">${money(grand + taxAmt)}</span></span>`);
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
			fresh.forEach((m) => Object.values(m.components || {}).forEach((c) => { c.orig = c.value; }));
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
			logHist(code, __("Already on the bill"), "warn");
			focusScan();
			return;
		}
		fetchPiece(code).then((m) => {
			Object.values(m.components || {}).forEach((c) => { c.orig = c.value; });
			S.rows.push(m);
			const other = (m.prepped || []).filter((p) => p !== S.prep);
			if (other.length) {
				frappe.show_alert({ message: __("{0} is already on prepared bill {1} — selling it here will strand that prep.", [code, other.join(", ")]), indicator: "orange" }, 8);
				logHist(code, __("Added — WARNING: already on {0}", [other.join(", ")]), "warn");
			} else {
				logHist(code, __("Added ({0})", [m.design || "—"]), "ok");
			}
			paint();
			focusScan();
		}).catch(() => {
			logHist(code, __("Rejected — not sellable / not found"), "err");
			focusScan();
		});
	});

	$(root).on("input", ".sl-v:not([readonly])", function () {
		const i = +$(this).closest("tr").attr("data-i");
		const k = this.getAttribute("data-k");
		const c = S.rows[i].components[k];
		c.value = this.value === "" ? null : flt(this.value);
		const emptyNow = c.value === null || c.value === "";
		$(this).toggleClass("needs", emptyNow);
		$(this).toggleClass("changed", !emptyNow && c.orig !== null && c.orig !== undefined && flt(c.value) !== flt(c.orig));
		$(this).closest("tr").find(".sl-rowtotal").text(money(rowTotal(S.rows[i])));
		totals();
	});
	// dblclick a priced cell -> small dialog; the edit turns the cell yellow
	$(root).on("dblclick", ".sl-v[readonly]", function () {
		const i = +$(this).closest("tr").attr("data-i");
		const k = this.getAttribute("data-k");
		const c = S.rows[i].components[k];
		frappe.prompt({ fieldtype: "Float", fieldname: "v", label: __("{0} ₹ — {1}", [c.label, S.rows[i].order_bag]),
			default: flt(c.value), reqd: 1 },
			(vals) => { c.value = flt(vals.v); paint(); focusScan(); },
			__("Edit {0}", [c.label]));
	});
	// hover a priced cell -> how the value came (every bracket line)
	$(root).on("mouseenter", ".sl-v[readonly]", function (e) {
		const i = +$(this).closest("tr").attr("data-i");
		const k = this.getAttribute("data-k");
		const c = S.rows[i].components[k];
		const lines = (c.note || "").split("; ").filter(Boolean);
		if (c.orig !== null && c.orig !== undefined && flt(c.value) !== flt(c.orig))
			lines.push(__("edited: {0} → {1}", [money(c.orig), money(c.value)]));
		if (!lines.length) return;
		$(root).find(".sl-tip").html(`<div class="t">${esc(c.label)}</div>` + lines.map((l) => esc(l)).join("<br>"))
			.css({ left: e.clientX + 14, top: e.clientY + 12 }).show();
	});
	$(root).on("mousemove", ".sl-v[readonly]", function (e) {
		$(root).find(".sl-tip:visible").css({ left: e.clientX + 14, top: e.clientY + 12 });
	});
	$(root).on("mouseleave", ".sl-v[readonly]", () => $(root).find(".sl-tip").hide());
	$(root).on("click", ".sl-x", function () {
		S.rows.splice(+$(this).closest("tr").attr("data-i"), 1);
		paint();
		focusScan();
	});

	// components -> the sale's 5 recorded buckets
	function buckets(r) {
		const g = (keys) => keys.reduce((s, k) => s + compVal((r.components || {})[k]), 0);
		const certKeys = Object.keys(r.components || {}).filter((k) => k === "hall" || k === "cert" || k.startsWith("cert:"));
		return {
			gold_value: g(["gold"]),
			diamond_value: g(["dmd", "pdmd"]),
			stone_value: g(["cs", "cz", "cvd", "ps"]),
			labour_value: g(["making"]),
			charges_value: g(certKeys),
		};
	}

	$(root).find(".sl-prep").on("click", () => {
		if (!S.rows.length) {
			frappe.show_alert({ message: __("Scan at least one piece."), indicator: "orange" }, 4);
			return;
		}
		frappe.call({
			method: API + ".save_sale_prep_board",
			args: { payload: {
				customer: buyer.get_value(), price_chart: chart.get_value(),
				gold_rate: flt(rate.get_value()), remarks: remarks.get_value(),
				rows: S.rows, adjust: S.adjust, tax: cint(tax.get_value()),
			} },
		}).then((r) => {
			const m = r.message || {};
			frappe.show_alert({ message: __("Prepared as {0} — find it on Prepare Sale.", [m.name]), indicator: "yellow" }, 6);
			logHist("—", __("Prepared {0} piece(s) as {1}", [S.rows.length, m.name]), "ok");
			S.rows = [];
			S.adjust = [];
			S.prep = null;
			paint();
			focusScan();
		});
	});

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
					prep: S.prep,
					tax_percent: cint(tax.get_value()) ? 3 : 0,
				} },
			}).then((r) => {
				frappe.dom.unfreeze();
				const m = r.message || {};
				frappe.msgprint({
					title: __("Sold"), indicator: "green",
					message: __("<a href='/app/product-sale/{0}'>{0}</a> — {1} piece(s) to {2}, total {3}.<br>Stock written off ({4}); cards are SOLD (kept for returns).",
						[m.name, m.count, esc(to), money(m.grand_total), esc(m.stock_entry || "")]),
				});
				logHist("—", __("SOLD {0} piece(s) — {1}", [m.count, m.name]), "ok");
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

	// Export — dialog of formats (more company-specific excels plug in here)
	page.add_inner_button(__("Export"), () => {
		if (!S.rows.length) {
			frappe.show_alert({ message: __("Scan pieces first."), indicator: "orange" }, 4);
			return;
		}
		const payload = () => JSON.stringify({
			customer: buyer.get_value(), price_chart: chart.get_value(),
			gold_rate: flt(rate.get_value()), rows: S.rows, tax: cint(tax.get_value()),
		});
		const FORMATS = [
			{ label: __("PDF — Bill (landscape)"), desc: __("The board as printed: component columns, totals, tax summary."), method: "export_sale_bill_pdf" },
			{ label: __("Excel — Bill (XLSX)"), desc: __("Same columns in a worksheet, for editing and sending."), method: "export_sale_bill_xlsx" },
			{ label: __("Excel — Jewelima format"), desc: __("The house MAIL sheet: Sl.NO to PRODUCT VALUE with live formulas, TOTAL row, purity header."), method: "export_sale_bill_jewelima_xlsx" },
		];
		const dlg = new frappe.ui.Dialog({ title: __("Export bill"), fields: [{ fieldtype: "HTML", fieldname: "b" }] });
		dlg.get_field("b").$wrapper.html(FORMATS.map((x, i) => `
			<div class="ex-opt" data-i="${i}" style="border:1px solid var(--border-color);border-radius:8px;padding:12px 14px;margin-bottom:10px;cursor:pointer;">
				<div style="font-weight:700;">${x.label}</div>
				<div style="font-size:12px;color:var(--text-muted);">${x.desc}</div>
			</div>`).join(""));
		dlg.$wrapper.on("click", ".ex-opt", function () {
			const x = FORMATS[+this.getAttribute("data-i")];
			dlg.hide();
			open_url_post("/api/method/" + API + "." + x.method, { payload: payload() });
		});
		dlg.show();
	});

	// Pricing Rules — the slabs this bill hit, each with an EDITABLE rate.
	// Left: component + the slab being used. Middle: the rate (edit it for
	// THIS SALE ONLY — e.g. hallmark 45 -> 35). Right: what you changed and
	// its effect on the bill. Apply re-prices the affected cells (they turn
	// yellow) and the edit rides the sale's audit comment. The chart is
	// never touched.
	page.add_inner_button(__("Pricing Rules"), () => {
		if (!S.rows.length) {
			frappe.show_alert({ message: __("Scan pieces first — this shows the slabs used by the bill."), indicator: "orange" }, 4);
			return;
		}
		// slab = one distinct (rule, rate); contributions know how to re-price it
		const slabs = {};
		const add = (key, label, slabTxt, rate, unit, contrib) => {
			if (!slabs[key]) slabs[key] = { label, slabTxt, rate, unit, contribs: [] };
			slabs[key].contribs.push(contrib);
		};
		S.rows.forEach((r, i) => {
			(r.dmd_detail || []).forEach((d) => {
				if (!d.rate && d.rate !== 0) return;
				add(`dmd|${d.quality}|${d.bracket}|${d.rate}`, `${__("Diamond")} — ${d.quality}`,
					`${__("bracket")} ${d.bracket || "?"} ct`, d.rate, "ct", { i, key: "dmd", qty: d.ct, det: d });
			});
			(r.ps_detail || []).forEach((d) => {
				add(`ps|${d.stone}|${d.rate}`, `${__("Precious")} — ${d.stone}`, __("per carat"),
					d.rate, "ct", { i, key: "ps", qty: d.ct, det: d });
			});
			(r.cert_detail || []).forEach((d) => {
				if (["HALL", "HALLMARKING"].includes(d.certification)) return;
				const perCt = d.basis === "Per Ct";
				add(`cert|${d.certification}|${d.rate}`,
					`${__("Certification")} — ${d.certification}${d.via === "ALL LABS" ? " (ALL LABS)" : ""}`,
					perCt ? __("per carat") : __("per piece"), d.rate, perCt ? "ct" : "pc",
					{ i, key: "cert", qty: perCt ? d.ct : (d.pieces || 1), det: d });
			});
			["cs", "cz", "cvd", "making", "hall"]
				.forEach((k) => {
					const c = (r.components || {})[k];
					if (!c || c.needs_price || c.rate === null || c.rate === undefined) return;
					const slabTxt = c.unit === "g" ? __("per gram") : c.unit === "pc" ? __("per piece") : __("per carat");
					add(`${k}|${c.rate}`, c.label, slabTxt + (c.note ? ` · ${c.note}` : ""), c.rate, c.unit,
						{ i, key: k, qty: flt(c.qty) });
				});
		});
		const list = Object.entries(slabs);
		if (!list.length) {
			frappe.show_alert({ message: __("Nothing chart-priced on the bill yet."), indicator: "orange" }, 4);
			return;
		}
		const dlg = new frappe.ui.Dialog({
			title: __("Pricing rules in effect — this sale only"),
			size: "large",
			fields: [{ fieldtype: "HTML", fieldname: "b" }],
			primary_action_label: __("Apply to Bill"),
			primary_action: () => {
				const applied = [];
				dlg.$wrapper.find(".pr-rate").each(function () {
					const sk = this.getAttribute("data-slab");
					const sl = slabs[sk];
					const nr = this.value === "" ? sl.rate : flt(this.value);
					if (nr === sl.rate) return;
					sl.contribs.forEach((ct) => {
						const c = (S.rows[ct.i].components || {})[ct.key];
						if (c && c.value !== null && c.value !== "")
							c.value = Math.round((flt(c.value) + ct.qty * (nr - sl.rate)) * 100) / 100;
						// remember the overridden rate so re-opening shows it
						if (ct.det) ct.det.rate = nr;
						else if (c) c.rate = nr;
					});
					applied.push(`${sl.label} ${sl.rate}→${nr}/${sl.unit}`);
				});
				dlg.hide();
				if (!applied.length) return;
				S.adjust = S.adjust.concat(applied);
				paint();
				frappe.show_alert({ message: __("Applied: {0}. Recorded in the sale's audit trail.", [applied.join("; ")]), indicator: "blue" }, 6);
			},
		});
		const th = (t, r) => `<th style="text-align:${r ? "right" : "left"};padding:4px 8px;border-bottom:1px solid var(--gray-400);color:var(--text-muted);font-size:11px;text-transform:uppercase;">${t}</th>`;
		const td = 'style="padding:5px 8px;border-bottom:1px solid var(--border-color);"';
		dlg.get_field("b").$wrapper.html(`
			<table style="width:100%;border-collapse:collapse;font-size:13px;">
			<thead><tr>${th(__("Component — slab in use"))}${th(__("Rate ₹"), 1)}${th(__("Your change"), 1)}</tr></thead><tbody>
			${list.map(([sk, x]) => `<tr>
				<td ${td}><b>${esc(x.label)}</b><div style="font-size:11px;color:var(--text-muted);">${esc(x.slabTxt)} · ₹${flt(x.rate).toLocaleString("en-IN")}/${esc(x.unit)}</div></td>
				<td ${td} style="text-align:right;"><input class="pr-rate" data-slab="${esc(sk)}" type="number" step="0.5" value="${flt(x.rate)}"
					style="width:110px;text-align:right;border:1px solid var(--gray-400,#aeb6bf);border-radius:4px;height:26px;padding:1px 6px;background:var(--fg-color);color:var(--text-color);"></td>
				<td ${td} class="pr-chg" style="text-align:right;color:#9a6700;font-weight:600;font-variant-numeric:tabular-nums;"></td>
			</tr>`).join("")}
			</tbody></table>`);
		// live: show old -> new and the rupee effect on the bill as you type
		dlg.$wrapper.on("input", ".pr-rate", function () {
			const sl = slabs[this.getAttribute("data-slab")];
			const nr = this.value === "" ? sl.rate : flt(this.value);
			const qty = sl.contribs.reduce((s, c) => s + c.qty, 0);
			const d = qty * (nr - sl.rate);
			$(this).closest("tr").find(".pr-chg").html(nr === sl.rate ? "" :
				`${flt(sl.rate).toLocaleString("en-IN")} → ${flt(nr).toLocaleString("en-IN")}<br><span style="color:${d > 0 ? "#1d7a33" : "#b02a2a"};">${d > 0 ? "+₹" : "−₹"}${money(Math.abs(d)).slice(1)}</span>`);
		});
		dlg.show();
	});

	// Discount Total — live % board over the components priced on THIS bill.
	page.add_inner_button(__("Discount Total"), () => {
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
			title: __("Discount Total — this sale only"),
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

	page.add_inner_button(__("Prepared"), () => frappe.set_route("prepare-sale"));
	page.add_inner_button(__("Scan History"), showHistory);
	if (frappe.route_options && frappe.route_options.prep) {
		const nm = frappe.route_options.prep;
		frappe.route_options = null;
		frappe.call({ method: API + ".get_sale_prep_board", args: { name: nm } }).then((r) => {
			const m = r.message || {};
			S.prep = m.name;
			if (m.customer) buyer.set_value(m.customer);
			if (m.price_chart) chart.set_value(m.price_chart);
			if (m.gold_rate) rate.set_value(m.gold_rate);
			if (m.remarks) remarks.set_value(m.remarks);
			// restore AFTER the link fields settle so their onchange repricing
			// cannot wipe the snapshot's edited values
			setTimeout(() => {
				S.rows = (m.board || {}).rows || [];
				S.adjust = (m.board || {}).adjust || [];
				if ((m.board || {}).tax !== undefined) tax.set_value(cint(m.board.tax));
				paint();
				frappe.show_alert({ message: __("Restored {0} — {1} piece(s).", [m.name, S.rows.length]), indicator: "yellow" }, 5);
			}, 400);
		});
	}
	paint();
	focusScan();
};
