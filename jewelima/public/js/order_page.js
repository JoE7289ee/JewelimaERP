// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// THE order-entry engine, shared by TWO pages so they stay pixel-identical:
//   place-order     (mode "order")   — the Order User places Job Orders
//   order-requests  (mode "request") — the wider team files Order Requests
// Everything (grid, stone columns, Materials/Split/Remark/Reset/New/CAD, New
// Design, profiles, totals) is common; only the primary action differs, and
// request mode swaps Job Order No for Notes + shows the "My Requests" list.

frappe.provide("jewelima");

// ---- ONE standard for design-creation weights (shared by every create/approve
// dialog so they behave identically) -------------------------------------------
// The Design Bank always stores GROSS as an 18K figure. Users, though, weigh the
// real piece — usually 22K, sometimes 14K — so let them enter the gross at that
// karat and convert to the 18K figure here: only the GOLD portion scales; the
// stone grams (carats x 0.2) stay put. Factors mirror api.KARAT_WEIGHT_FACTOR.
const JW_KARAT_FACTOR = { "14K": 0.952, "18K": 1.0, "22K": 1.2 };
function jwGrossTo18k(gross, karat, dwCt) {
	const f = JW_KARAT_FACTOR[((karat || "18K") + "").toUpperCase()] || 1.0;
	const stone = (flt(dwCt) || 0) * 0.2;
	return Math.round(((flt(gross) - stone) / f + stone) * 1000) / 1000;
}
// Diamond weight is NEVER hand-typed on a design: it is the DMD sieve average —
// sum(pcs x avg-cts-per-stone) across the sieve rows. avgMap = {sieve: avg_cts}.
function jwDwFromSieves(rows, avgMap) {
	let ct = 0;
	(rows || []).forEach((r) => { const a = (avgMap || {})[r.sieve]; if (a && cint(r.pcs) > 0) ct += cint(r.pcs) * a; });
	return Math.round(ct * 1000) / 1000;
}

// shared with the other design-creation pages (new-design-bank, add-design)
jewelima.grossTo18k = jwGrossTo18k;
jewelima.dwFromSieves = jwDwFromSieves;

jewelima.buildOrderPage = function (wrapper, OPTS) {
const PO_SIZES = ["-2.2/16", "2.0/16", "NA"];

// sieve chart: size label -> avg cts/stone (lazy-loaded once per session).
// Typing a stone QTY in a materials grid prefills weight = qty x avg (editable).
let JW_SIEVE = {}, JW_SIEVE_LOADED = false;
function jwLoadSieve() {
	if (JW_SIEVE_LOADED) return;
	JW_SIEVE_LOADED = true;
	frappe.call({ method: "jewelima.jewelima.api.get_sieve_map" }).then((r) => { JW_SIEVE = r.message || {}; });
}

function jwSieveQty() {
	// plain handler — resolves its grid at call time (referencing the dialog
	// variable inside its own constructor is a TDZ error that kills the dialog)
	const r = this.doc || (this.grid_row && this.grid_row.doc);
	if (!r || !r.item) return;
	// per-group sieve chart: DMD / CVD / CZ / SW each auto-fill from their column
	const G = (JW_SIEVE._groups || {});
	const grp = r.stone_type === "Diamond" ? "DMD"
		: r.stone_type === "CVD" ? "CVD"
		: r.stone_type === "Cubic Zirconia" ? "CZ"
		: r.stone_type === "Swarovski" ? "SW"
		: r.stone_type === "Color Stone" && (r.item || "").startsWith("SW") ? "SW" : null;
	if (!grp) return;
	const avg = (G[grp] || {})[(r.item || "").split(" ").slice(1).join(" ")];
	if (avg && flt(r.qty) > 0) {
		r.weight = Math.round(flt(r.qty) * avg * 1000) / 1000;
		r.pure = 0;
		const grid = this.grid_row && this.grid_row.grid;
		if (grid) grid.refresh();
	}
}

const PO_COLUMNS = [
	// shrink: hug the min-width (width:1%) instead of soaking up the free space
	{ key: "bank", label: "D Bank", type: "link", options: "Design Bank", width: "150px", shrink: 1 },
	{ key: "design", label: "Variant", type: "link", options: "Design", width: "165px", shrink: 1 },
	{ key: "qty", label: "Qty", type: "int", width: "46px", shrink: 1 },
	{ key: "size", label: "Size", type: "select", options: PO_SIZES, width: "92px", shrink: 1 },
	{ key: "design_type", label: "Type", type: "ro", width: "120px" },
	{ key: "gross_weight", label: "Gross (g)", type: "ro", width: "85px" },
	{ key: "nett_weight", label: "Nett (g)", type: "ro", width: "85px" },
	{ key: "purity", label: "Purity %", type: "ro", width: "75px" },
	{ key: "pure", label: "Pure (g)", type: "ro", width: "80px" },
	{ key: "dmd", label: "DMD (no/ct)", type: "stone", no: "dmd_no", wt: "dmd_weight", width: "105px" },
	{ key: "ps", label: "PS (no/ct)", type: "stone", no: "ps_no", wt: "ps_weight", width: "105px" },
	{ key: "cs", label: "CS (no/ct)", type: "stone", no: "cs_no", wt: "cs_weight", width: "105px" },
	{ key: "cvd", label: "CVD (no/ct)", type: "stone", no: "cvd_no", wt: "cvd_weight", width: "105px" },
	{ key: "cz", label: "CZ (no/ct)", type: "stone", no: "cz_no", wt: "cz_weight", width: "105px" },
	{ key: "pdmd", label: "PDMD (no/ct)", type: "stone", no: "pdmd_no", wt: "pdmd_weight", width: "105px" },
	{ key: "poth", label: "POTH (no/ct)", type: "stone", no: "poth_no", wt: "poth_weight", width: "105px" },
];

// ---- page body (wrapper + OPTS come from the factory) ----
	const page = frappe.ui.make_app_page({ parent: wrapper, title: OPTS.title, single_column: true });
	const state = { rows: [], header: {} };

	$(page.main).append(`
		<style>
		.po-wrap{display:flex;flex-direction:column;height:calc(100vh - 95px);}
		.po-head{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:2px 10px;margin:2px 0 6px;}
		.po-head .frappe-control{margin:0;}
		.po-head .control-label{font-size:11px;margin:0 0 1px;color:var(--text-muted);}
		.po-head .control-input-wrapper .control-input,.po-head .control-input input,.po-head .control-value{min-height:26px;height:26px;line-height:24px;font-size:12px;}
		.po-head .help-box,.po-head .description,.po-head p.help-box{display:none !important;}
		.po-due{font-size:11px;color:var(--text-muted);margin:1px 0 0 2px;white-space:nowrap;}
		.po-due.po-warn{color:#b02a2a;font-weight:700;}
		.po-var-need{background:#b02a2a !important;border-color:#b02a2a !important;color:#fff !important;font-weight:700;}
		.po-no-badge{font-weight:800;font-size:15px;letter-spacing:.6px;align-self:center;background:var(--control-bg);border:1px solid var(--border-color);border-radius:6px;padding:2px 13px;margin-right:8px;}
		.po-gridbox{flex:1 1 auto;overflow:auto;border:1px solid var(--border-color);border-radius:8px;}
		table.po-grid{width:100%;border-collapse:separate;border-spacing:0;font-size:12px;background:var(--fg-color);}
		table.po-grid th{position:sticky;top:0;z-index:2;background:var(--control-bg, var(--fg-color));
			border-right:1px solid var(--border-color);border-bottom:1px solid var(--gray-400, #aeb6bf);padding:3px 6px;text-align:left;white-space:nowrap;font-weight:700;}
		table.po-grid td{border-right:1px solid var(--border-color);border-bottom:1px solid var(--border-color);padding:0 2px;vertical-align:middle;background:var(--fg-color);height:30px;}
		table.po-grid td.po-num{color:var(--text-muted);text-align:center;width:30px;background:var(--control-bg);}
		table.po-grid td.po-num.ok{background:#2e7d32;color:#fff;font-weight:700;}
		table.po-grid td.po-num.bad{background:#b00020;color:#fff;font-weight:700;}
		table.po-grid td.po-num.ok{cursor:zoom-in;}
		.po-imgpop{position:fixed;z-index:2000;background:#fff;border:1px solid var(--border-color);border-radius:10px;box-shadow:0 10px 34px rgba(0,0,0,.28);padding:6px;display:none;pointer-events:none;}
		.po-imgpop img{max-height:260px;max-width:260px;display:block;border-radius:6px;}
		table.po-grid tfoot td{position:sticky;bottom:0;z-index:2;background:var(--control-bg, var(--fg-color));border-top:2px solid var(--gray-400, #aeb6bf);border-right:1px solid var(--border-color);font-weight:700;padding:3px 6px;text-align:right;white-space:nowrap;}
		table.po-grid tfoot td.po-foot-label{text-align:left;}
		table.po-grid input,table.po-grid select{width:100%;border:1px solid var(--gray-400, #aeb6bf);background:var(--fg-color);
			padding:1px 4px;font-size:12px;color:var(--text-color);border-radius:3px;height:26px;line-height:1.1;box-sizing:border-box;}
		table.po-grid input:focus,table.po-grid select:focus{box-shadow:inset 0 0 0 1px var(--primary);outline:none;}
		table.po-grid .frappe-control,table.po-grid .frappe-control .form-group{margin:0;}
		table.po-grid .frappe-control .help-box,table.po-grid .frappe-control .description,table.po-grid .frappe-control .control-label{display:none !important;}
		table.po-grid .frappe-control .control-input-wrapper,table.po-grid .frappe-control .control-input{margin:0;padding:0;min-height:0;}
		table.po-grid .frappe-control .control-input input{border:1px solid var(--gray-400, #aeb6bf);background:var(--fg-color);padding:1px 4px;height:26px;min-height:26px;line-height:1.1;box-sizing:border-box;border-radius:3px;}
		table.po-grid .frappe-control .link-btn{display:none !important;} /* no jump-to-record arrow; info is via the Design button */
		table.po-grid td.po-ro{padding:0 8px;text-align:right;white-space:nowrap;color:var(--text-color);font-variant-numeric:tabular-nums;}
		table.po-grid td.po-act{text-align:center;padding:0 4px;}
		table.po-grid td.po-act .btn{padding:1px 7px;font-size:11px;height:24px;line-height:1;margin:0 1px;}
		table.po-grid td.po-act .btn.po-mat-edited{background:#ffc107;border-color:#d39e00;color:#3d3000;font-weight:700;}
		table.po-grid td.po-act .btn.po-has-photos{background:#2e7d32;border-color:#2e7d32;color:#fff;font-weight:700;}
		table.po-grid td.po-act .btn:disabled{opacity:.4;cursor:not-allowed;}
		table.po-grid .po-hide{display:none;}
		.po-foot{margin-top:1px;color:var(--text-muted);font-size:12px;}
		</style>
		<div class="po-wrap">
			<div class="po-head">
				${OPTS.mode === "order" ? '<div class="po-h-orderdate"></div>' : '<div class="po-h-orderno"></div>'}<div class="po-h-customer"></div><div class="po-h-salesman"></div><div class="po-h-ordertype"></div>
				${OPTS.mode === "order" ? '<div class="po-h-days"></div><div class="po-h-custdays"></div><div class="po-h-follow"></div>' : ""}
			</div>
			<div class="po-gridbox">
				<table class="po-grid"><thead><tr class="po-headrow"></tr></thead><tbody class="po-body"></tbody><tfoot><tr class="po-footrow"></tr></tfoot></table>
			</div>
			<div class="po-foot"><span class="po-count">0</span> line(s). Empty lines are ignored. Picking a design pulls its BOM — <b>Materials</b> edits a line's BOM, <b>Reset</b> restores it.${OPTS.mode === "request" ? " <b>" + __("This page only FILES A REQUEST — no order is placed.") + "</b>" : ""}</div>
		</div>
	`);
	if (OPTS.mode === "request") {
		$(page.main).find(".po-wrap").append(`
			<style>
			.po-mine{margin-top:10px;border:1px solid var(--border-color);border-radius:8px;overflow:auto;max-height:30vh;flex:0 0 auto;}
			.po-mine-head{padding:7px 12px;border-bottom:1px solid var(--border-color);font-weight:700;background:var(--fg-color);position:sticky;top:0;}
			.po-mine table{width:100%;border-collapse:collapse;font-size:12.5px;background:var(--fg-color);}
			.po-mine td,.po-mine th{padding:5px 12px;border-bottom:1px solid var(--border-color);text-align:left;}
			.po-mine .po-badge{border-radius:10px;padding:1px 9px;font-size:11px;font-weight:700;}
			.po-mine .po-badge.open{background:#e8f2fd;color:#1c5da8;}
			.po-mine .po-badge.placed{background:#e6f4ea;color:#2e7d32;}
			.po-mine .po-badge.cancelled{background:var(--control-bg);color:var(--text-muted);}
			.po-mine .po-empty{padding:12px;text-align:center;color:var(--text-muted);}
			</style>
			<div class="po-mine"><div class="po-mine-head">${__("My Requests")}</div><div class="po-mine-body"></div></div>
		`);
	}

	const mk = (sel, df) => {
		const c = frappe.ui.form.make_control({ df, parent: $(page.main).find(sel).get(0), render_input: true });
		c.refresh();
		return c;
	};
	if (OPTS.mode === "request") {
		state.header.notes = mk(".po-h-orderno", { fieldtype: "Data", label: __("Notes"), fieldname: "notes" });
	} else {
		// the claimed order number sits at the LEFT of the action bar, always visible
		state.$noBadge = $('<span class="po-no-badge">…</span>').prependTo($(page.wrapper).find(".page-actions").first());
	}
	state.showNo = (no) => state.$noBadge && state.$noBadge.text(no || "…");
	// only_select: our users pick, they never open the raw ERP record
	state.header.customer = mk(".po-h-customer", { fieldtype: "Link", label: "Party", fieldname: "customer", options: "Customer", only_select: 1, reqd: OPTS.mode === "order" ? 1 : 0 });
	state.header.salesman = mk(".po-h-salesman", { fieldtype: "Link", label: "Salesman", fieldname: "salesman", options: "Sales Person", only_select: 1, get_query: () => ({ filters: { is_group: 0, enabled: 1 } }) });
	state.header.order_type = mk(".po-h-ordertype", { fieldtype: "Link", label: "Type", fieldname: "order_type", options: "Order Type", only_select: 1, reqd: OPTS.mode === "order" ? 1 : 0, get_query: () => ({ filters: { disabled: 0 } }) });

	// ENTER walks the header: Party -> Salesman -> Type -> Days
	(function () {
		const hop = (from, to) => from.$input.on("keydown", (e) => {
			if (e.key !== "Enter") return;
			// let awesomplete commit the pick first, then move on
			setTimeout(() => to.$input && to.$input.focus(), 120);
		});
		hop(state.header.customer, state.header.salesman);
		hop(state.header.salesman, state.header.order_type);
		setTimeout(() => {
			if (state.header.days) hop(state.header.order_type, state.header.days);
		}, 0);
	})();
	if (OPTS.mode === "order") {
	state.header.order_date = mk(".po-h-orderdate", { fieldtype: "Date", label: "Order Date", fieldname: "order_date", read_only: 1 });
	state.header.days = mk(".po-h-days", {
		fieldtype: "Int", label: "Days (Due Date)", fieldname: "days", reqd: 1,
		description: "Due date = today + N days.",
	});
	state.header.cust_days = mk(".po-h-custdays", {
		fieldtype: "Int", label: "Days (Party Date)", fieldname: "cust_days",
		description: "Date promised to the customer — empty copies the Due Date.",
	});
	state.header.order_date.set_value(frappe.datetime.get_today());
	$(page.main).find(".po-h-days").append('<div class="po-due"></div>');
	$(page.main).find(".po-h-custdays").append('<div class="po-due po-custdue"></div>');
	// parties carry coded names now (AJ-KUR-TCR-KL) — show the OLD name underneath
	// so staff recognise who they picked
	$(page.main).find(".po-h-customer").append('<div class="po-due po-oldname"></div>');
	function showPartyOldName() {
		const p = state.header.customer.get_value();
		const $t = $(page.main).find(".po-oldname");
		if (!p) return $t.text("");
		frappe.call({ method: "jewelima.jewelima.api.get_party_old_names", args: { party: p }, freeze: false })
			.then((r) => {
				const olds = ((r.message || {}).old_names) || [];
				$t.text(olds.length ? __("was: {0}", [olds.join(", ")]) : "");
			});
	}
	state.header.customer.$input.on("change awesomplete-selectcomplete", () => setTimeout(showPartyOldName, 60));
	// Follow — tick to watch this order on the Following page after it's placed
	state.header.follow = mk(".po-h-follow", {
		fieldtype: "Check", label: __("Follow"), fieldname: "follow",
		description: __("Track this order on the Following page."),
	});

	// Order Date is fixed to today (read-only). Days is the lead time; the Due Date
	// (today + Days) is derived — shown live under Days and computed when placing the order.
	// Customer Date works the same off its own Days; left empty it copies the Due Date.
	const dueFromDays = () => {
		const n = cint(state.header.days.get_value());
		return n > 0 ? frappe.datetime.add_days(frappe.datetime.get_today(), n) : "";
	};
	const custFromDays = () => {
		const n = cint(state.header.cust_days.get_value());
		return n > 0 ? frappe.datetime.add_days(frappe.datetime.get_today(), n) : dueFromDays();
	};
	state.dueFromDays = dueFromDays; // placeOrder() reads these
	state.custFromDays = custFromDays;
	// the party date is what we promise the customer — it can never fall BEFORE the
	// factory's due date
	const partyBeforeDue = () => {
		const c = cint(state.header.cust_days.get_value());
		return c > 0 && c < cint(state.header.days.get_value());
	};
	state.partyBeforeDue = partyBeforeDue;
	const showDue = () => {
		const dd = dueFromDays();
		$(page.main).find(".po-due").not(".po-custdue").not(".po-oldname").text(dd ? __("Due {0}", [frappe.datetime.str_to_user(dd)]) : "");
		const cd = custFromDays();
		const copied = !cint(state.header.cust_days.get_value());
		const bad = partyBeforeDue();
		$(page.main).find(".po-custdue")
			.toggleClass("po-warn", bad)
			.text(cd ? (bad
				? __("Party {0} — before the due date!", [frappe.datetime.str_to_user(cd)])
				: __("Party {0}{1}", [frappe.datetime.str_to_user(cd), copied ? " (= due date)" : ""])) : "");
	};
	state.showDue = showDue;
	state.header.days.$input.on("input change", () => {
		if (cint(state.header.days.get_value()) < 0) state.header.days.set_value(0);
		showDue();
	});
	state.header.cust_days.$input.on("input change", () => {
		if (cint(state.header.cust_days.get_value()) < 0) state.header.cust_days.set_value(0);
		showDue();
	});
	} // end order-mode dates block

	// Pre-fill Days / Type / Salesman from the global Order Settings (Setup → Order Settings).
	frappe.call({ method: "jewelima.jewelima.api.get_order_defaults" }).then((r) => {
		const d = r.message || {};
		if (state.header.days && cint(d.days) && !cint(state.header.days.get_value())) {
			// set_value resolves async — show the date only once the value has landed
			Promise.resolve(state.header.days.set_value(cint(d.days))).then(() => state.showDue && state.showDue());
		}
		if (d.order_type && !state.header.order_type.get_value()) state.header.order_type.set_value(d.order_type);
		if (d.salesman && !state.header.salesman.get_value()) state.header.salesman.set_value(d.salesman);
	});

	const $headrow = $(page.main).find(".po-headrow");
	$headrow.append('<th class="po-num">#</th>');
	PO_COLUMNS.forEach((c) => $headrow.append(`<th class="po-c-${c.key}" style="min-width:${c.width}${c.shrink ? ";width:1%" : ""}">${frappe.utils.escape_html(c.label)}</th>`));
	$headrow.append('<th style="width:285px;text-align:center">Functions</th>');
	$headrow.append('<th style="width:34px"></th>');

	const $body = $(page.main).find(".po-body");

	// hover the line number -> the design's photo floats beside it
	const $imgpop = $('<div class="po-imgpop"><img></div>').appendTo(document.body);
	$body.on("mouseenter", "td.po-num", function () {
		const tr = this.closest("tr");
		const row = state.rows.find((r) => r.$tr && r.$tr.get(0) === tr);
		if (!row || !row._image) return;
		const rc = this.getBoundingClientRect();
		$imgpop.find("img").attr("src", encodeURI(row._image));
		$imgpop.css({ left: rc.right + 10 + "px", top: Math.max(10, rc.top - 60) + "px" }).show();
	});
	$body.on("mouseleave", "td.po-num", () => $imgpop.hide());
	$(wrapper).on("remove", () => $imgpop.remove());

	// ---- live totals footer ----
	const $footrow = $(page.main).find(".po-footrow");
	$footrow.append('<td class="po-foot-label">Total</td>');
	const totalCells = {};
	PO_COLUMNS.forEach((c) => (totalCells[c.key] = $(`<td class="po-c-${c.key}"></td>`).appendTo($footrow)));
	$footrow.append("<td></td>"); // actions (Split)
	$footrow.append("<td></td>"); // remove
	// green = line goes into the order (Design/CAD + Qty); red = half-filled, won't go in
	function paintRowStatus(row) {
		// _lastDesign covers rows filled programmatically (Split, request pull-back):
		// the Link control's set_value validates async, so get_value lags a beat
		const hasWork = !!(row._cad || (row.f.design.get() || "").trim() || (row._lastDesign || "").trim());
		const q = cint(row.f.qty.get());
		const $n = row.$tr.find(".po-num");
		$n.removeClass("ok bad");
		if (hasWork && q > 0) $n.addClass("ok");
		else if (hasWork || q > 0) $n.addClass("bad");
	}

	function recalcTotals() {
		state.rows.forEach(paintRowStatus);
		const s = { qty: 0, gross_weight: 0, nett_weight: 0, pure: 0 };
		["dmd", "ps", "cs", "cz", "cvd", "pdmd", "poth"].forEach((b) => { s[b + "_no"] = 0; s[b + "_weight"] = 0; });
		state.rows.forEach((r) => {
			s.qty += cint(r.f.qty.get()) || 0;
			["gross_weight", "nett_weight", "pure", "dmd_weight", "ps_weight", "cs_weight", "cz_weight", "cvd_weight", "pdmd_weight", "poth_weight"].forEach((k) => (s[k] += flt(r.f[k].get()) || 0));
			["dmd_no", "ps_no", "cs_no", "cz_no", "cvd_no", "pdmd_no", "poth_no"].forEach((k) => (s[k] += cint(r.f[k].get()) || 0));
		});
		totalCells.qty.text(s.qty || "");
		totalCells.gross_weight.text(s.gross_weight ? s.gross_weight.toFixed(3) : "");
		totalCells.nett_weight.text(s.nett_weight ? s.nett_weight.toFixed(3) : "");
		totalCells.pure.text(s.pure ? s.pure.toFixed(3) : "");
		state.hiddenStones = state.hiddenStones || new Set();
		[["dmd", "dmd_no", "dmd_weight"], ["ps", "ps_no", "ps_weight"], ["cs", "cs_no", "cs_weight"],
		 ["cz", "cz_no", "cz_weight"], ["cvd", "cvd_no", "cvd_weight"], ["pdmd", "pdmd_no", "pdmd_weight"], ["poth", "poth_no", "poth_weight"]].forEach(([gk, nk, wk]) => {
			totalCells[gk].text(s[nk] || s[wk] ? `${s[nk]} / ${s[wk].toFixed(3)}` : "");
			// stone columns only take space once some line actually carries that stone
			const used = !!(s[nk] || s[wk]);
			used ? state.hiddenStones.delete(gk) : state.hiddenStones.add(gk);
			$(page.main).find(".po-c-" + gk).toggleClass("po-hide", !used);
		});
	}
	state.recalcTotals = recalcTotals;
	$body.on("input change", "input,select", () => recalcTotals());

	// Press Enter to jump to the next field (Design → Size → Qty → next row) for fast
	// keyboard entry. On the Design field, if the autocomplete list is open Enter still
	// picks from it (press Enter again to advance).
	$body.on("keydown", "input,select", (e) => {
		if (e.which !== 13 && e.key !== "Enter") return;
		const $ul = $(e.target).closest(".awesomplete").find("ul");
		if ($ul.length && !$ul.prop("hidden") && $ul.find("li").length) return; // let it pick from the list
		e.preventDefault();
		const fields = $body.find("input:visible,select:visible").toArray();
		const i = fields.indexOf(e.target);
		if (i === -1) return;
		if (i < fields.length - 1) {
			const nx = fields[i + 1];
			nx.focus();
			if (nx.select) nx.select();
		} else {
			const row = addRow(); // last field → start a new line
			setTimeout(() => row.$tr.find("input,select").first().focus(), 30);
		}
	});

	function renumber() {
		$body.find("tr").each((i, tr) => $(tr).find(".po-num").text(i + 1));
		$(page.main).find(".po-count").text(state.rows.length);
	}

	function addRow(afterRow) {
		const $tr = $("<tr></tr>");
		$tr.append('<td class="po-num"></td>');
		const row = { $tr, f: {} };
		PO_COLUMNS.forEach((col) => {
			const $td = $(`<td class="po-c-${col.key}"></td>`).appendTo($tr);
			if (col.type === "stone" && state.hiddenStones && state.hiddenStones.has(col.key)) $td.addClass("po-hide");
			if (col.type === "link") {
				const df = { fieldtype: "Link", options: col.options, fieldname: col.key, placeholder: col.label };
				if (col.key === "bank") {
					// bank names are HASHES (the code lives in design_no) — typed
					// text is never a valid value, so force a dropdown pick
					df.only_select = 1;
					df.get_query = () => ({ filters: { status: "Approved" } });
				}
				if (col.key === "design") {
					// the Variant list is ALWAYS scoped to the picked D Bank — a variant
					// only ever belongs to its card, so with no bank there are no options
					df.only_select = 1;
					df.get_query = () => {
						const bank = row.f.bank && row.f.bank.get();
						return { filters: { status: "Active", design_bank: bank || "__no_bank__" } };
					};
				}
				const ctrl = frappe.ui.form.make_control({ df, parent: $td.get(0), render_input: true });
				ctrl.refresh();
				row.f[col.key] = { get: () => ctrl.get_value(), set: (v) => ctrl.set_value(v || "") };
				if (col.key === "design") { row._designCtrl = ctrl; syncDesignDep(row); }
				if (col.key === "bank") {
					// bank picked -> default to its FIRST variant (create if none)
					ctrl.$input.on("change awesomplete-selectcomplete", () =>
						setTimeout(() => onBankPicked(row), 50)
					);
					// clearing the bank text must actually clear it (frappe Link keeps the
					// last validated pick) so the Variant re-locks and empties with it
					ctrl.$input.on("input", frappe.utils.debounce(() => {
						if ((ctrl.$input.val() || "").trim()) return;
						Promise.resolve(ctrl.set_value("")).then(() => { row._lastBank = ""; syncDesignDep(row); });
					}, 300));
				}
				if (col.key === "design") {
					// AJAX: when the design changes, pull its stone profile and fill the line.
					ctrl.$input.on("change awesomplete-selectcomplete", () =>
						setTimeout(() => { onDesignPicked(row); updateDesignBtn(row); }, 50)
					);
					// deleting the text doesn't clear the control's VALUE (frappe Link keeps the
					// last validated pick) — sync it to empty, then let the picked flow wipe the line
					ctrl.$input.on("input", frappe.utils.debounce(() => {
						if ((ctrl.$input.val() || "").trim()) return;
						Promise.resolve(ctrl.set_value("")).then(() => { onDesignPicked(row); updateDesignBtn(row); });
					}, 300));
				}
			} else if (col.type === "select") {
				const $s = $("<select></select>").appendTo($td);
				const fill = (opts) => {
					const cur = $s.val();
					$s.empty().append('<option value=""></option>');
					(opts || []).forEach((o) => $s.append(`<option>${frappe.utils.escape_html(o)}</option>`));
					if (cur && (opts || []).includes(cur)) $s.val(cur);
				};
				fill(col.options);
				row.f[col.key] = {
					get: () => $s.val(),
					set: (v) => $s.val(v || ""),
					setOptions: (opts) => { fill(opts); if ((opts || []).length === 1) $s.val(opts[0]); },
				};
			} else if (col.type === "ro") {
				// read-only, derived from the design (no input)
				$td.addClass("po-ro").text("—");
				const isPurity = col.key === "purity";
				row.f[col.key] = {
					get: () => $td.attr("data-v") || "",
					set: (v) => { $td.attr("data-v", v == null ? "" : v); $td.text(v ? (isPurity ? flt(v).toFixed(1) + "%" : v) : "—"); },
				};
			} else if (col.type === "stone") {
				// one read-only cell showing "no / ct" (derived from the design)
				$td.addClass("po-ro");
				const render = () => {
					const no = cint($td.attr("data-no")) || 0, wt = flt($td.attr("data-wt")) || 0;
					$td.text(no || wt ? `${no} / ${wt.toFixed(3)}` : "—");
				};
				row.f[col.no] = { get: () => $td.attr("data-no") || "", set: (v) => { $td.attr("data-no", v == null ? "" : v); render(); } };
				row.f[col.wt] = { get: () => $td.attr("data-wt") || "", set: (v) => { $td.attr("data-wt", v == null ? "" : v); render(); } };
				render();
			} else {
				// editable number (qty)
				const $i = $(`<input type="number" step="1" min="0">`).appendTo($td);
				row.f[col.key] = { get: () => $i.val(), set: (v) => $i.val(v == null ? "" : v) };
				if (col.key === "qty")
					$i.on("input change", () => {
						applyProfile(row);
						updateSplitBtn(row); // enable/disable Split as qty crosses 1
						// auto-append a fresh line once the last row gets a qty
						if (cint(row.f.qty.get()) > 0 && state.rows[state.rows.length - 1] === row) addRow();
					});
			}
		});
		// actions cell — Split (enabled only when qty > 1); more buttons can live here later
		const $act = $('<td class="po-act"></td>').appendTo($tr);
		row.$design = $('<button class="btn btn-xs btn-default" title="Edit this bag\'s materials (BOM)">Materials</button>').appendTo($act);
		// yellow = this line's BOM was hand-edited (differs from the design's)
		row.markEdited = () => {
			row.$design.toggleClass("po-mat-edited", !!row._edited)
				.attr("title", row._edited ? __("BOM edited on this line — Reset restores the design's") : __("Edit this bag's materials (BOM)"));
			// Reset only matters once the BOM differs from the design's
			if (row.$reset) row.$reset.toggle(!!row._edited);
		};
		row.$design.on("click", () => editMaterials(row));
		row.$split = $('<button class="btn btn-xs btn-default" title="Split this line into multiple bags">Split</button>').appendTo($act);
		row.$split.on("click", () => doSplit(row));
		row._remark = "";
		row.$remark = $('<button class="btn btn-xs btn-default" title="Add a remark">Remark</button>').appendTo($act);
		row.$remark.on("click", () => editRemark(row));
		row.$remark.on("mouseenter", function () {
			const t = (row._remark || "").trim();
			if (t) po_showTip(this, t);
		}).on("mouseleave", po_hideTip);
		row.$reset = $('<button class="btn btn-xs btn-default" title="Reset this line to the design\'s BOM">Reset</button>').appendTo($act);
		row.$reset.on("click", () => resetLine(row)).hide(); // appears once the BOM is edited (Materials yellow)
		row._photos = [];
		row.$photos = OPTS.mode === "order"
			? $('<button class="btn btn-xs btn-default po-photos" title="Photos for this bag — copied onto the Order Bag when the order is placed">Photos</button>')
				.appendTo($act).on("click", () => editPhotos(row))
			: null;
		row.$cad = $('<button class="btn btn-xs btn-default" title="CAD job — no design yet; order with target budgets">CAD</button>').appendTo($act);
		row.$cad.on("click", () => openCadDialog(row));
		row.$variant = $('<button class="btn btn-xs btn-default" title="Create (or pick) another variant of this card">+Var</button>').appendTo($act);
		row.$variant.on("click", () => {
			const bank = row.f.bank.get();
			if (!bank) return frappe.msgprint(__("Pick a D Bank card on this line first."));
			openVariantCreate(row, bank);
		});
		updateNewBtn(row);
		updateDesignBtn(row);
		updateSplitBtn(row);
		updateRemarkBtn(row);

		const $rm = $('<td><button class="btn btn-xs btn-default" title="Remove">&times;</button></td>').appendTo($tr);
		$rm.find("button").on("click", () => {
			state.rows = state.rows.filter((r) => r !== row);
			$tr.remove();
			renumber();
			recalcTotals();
		});
		if (afterRow) {
			afterRow.$tr.after($tr); // insert right below the given row
			state.rows.splice(state.rows.indexOf(afterRow) + 1, 0, row);
		} else {
			$body.append($tr);
			state.rows.push(row);
		}
		renumber();
		recalcTotals();
		return row;
	}

	function updateSplitBtn(row) {
		if (row.$split) row.$split.prop("disabled", cint(row.f.qty.get()) <= 1);
	}

	function updateDesignBtn(row) {
		if (row.$design) row.$design.prop("disabled", !row.f.design.get());
		if (row.$variant) {
			const hasBank = !!(row.f.bank && row.f.bank.get());
			const hasVar = !!row.f.design.get();
			row.$variant.prop("disabled", !hasBank);
			// bank picked but nothing on the line -> the variant must be created: shout
			row.$variant.toggleClass("po-var-need", hasBank && !hasVar)
				.attr("title", hasBank && !hasVar
					? __("This card has no variant on the line — click to create one")
					: __("Create (or pick) another variant of this card"));
		}
		// a design landing first (requests / repeat fills) backfills its card
		const dn = row.f.design.get();
		if (dn && row.f.bank && !row.f.bank.get()) {
			frappe.db.get_value("Design", dn, "design_bank").then((r) => {
				const b = (r.message || {}).design_bank;
				if (b && !row.f.bank.get()) row.f.bank.set(b);
			});
		}
		updateNewBtn(row);
	}

	// (the purity-variant "New" button is retired — this now only minds CAD)
	function updateNewBtn(row) {
		const has = !!row.f.design.get();
		if (row.$cad) {
			// CAD is for design-less lines; once a design is picked (or this IS a CAD line) it flips role
			row.$cad.prop("disabled", has && !row._cad);
			row.$cad.text(row._cad ? "CAD ✓" : "CAD").toggleClass("btn-success", !!row._cad);
		}
	}

	// ---- CAD lines: order with target budgets, the real design comes after CAD ----
	function openCadDialog(row) {
		const c = row._cad || {};
		const d = new frappe.ui.Dialog({
			title: __("CAD job — target budgets"),
			fields: [
				{ fieldname: "design_type", fieldtype: "Link", label: __("Design Type"), options: "Design Type", reqd: 1, default: c.design_type,
					onchange() {
						const t = state.typeSizes[d.get_value("design_type")] || { sizes: [], default: "" };
						d.fields_dict.size.df.options = ["", ...(t.sizes.length ? t.sizes : ["NA"])].join("\n");
						d.fields_dict.size.refresh();
						if (t.default) d.set_value("size", t.default);
					} },
				{ fieldname: "size", fieldtype: "Select", label: __("Size"), options: "\nNA", default: c.size },
				{ fieldname: "karat", fieldtype: "Link", label: __("Purity (karat gold)"), options: "Item", reqd: 1, default: c.karat,
					get_query: () => ({ filters: { material_group: "GOLD", metal_purity: ["!=", ""], name: ["not in", ["22KPG", "22KWG"]] } }) },
				{ fieldname: "cb", fieldtype: "Column Break" },
				{ fieldname: "gold_weight", fieldtype: "Data", label: __("Gold Weight Target"), reqd: 1, default: c.gold_weight,
				description: __("Free text — '8.5', 'MINIMUM 8', 'RANGE 8 to 9'…") },
				{ fieldname: "diamond_weight", fieldtype: "Float", label: __("Diamond Budget (ct)"), default: c.diamond_weight },
				{ fieldname: "stone_no", fieldtype: "Int", label: __("Stone No (pcs)"), default: c.stone_no },
				{ fieldname: "reference", fieldtype: "Data", label: __("Reference"), default: c.reference,
					description: __("Free text — catalog code, customer photo ref, …") },
				{ fieldname: "sb", fieldtype: "Section Break" },
				{
					fieldname: "image", fieldtype: "Attach Image", label: __("Reference Image"), default: c.image,
					onchange() {
						const url = d.get_value("image");
						d.fields_dict.image_preview.$wrapper.html(url
							? `<div style="text-align:center;margin:4px 0 8px;"><img src="${encodeURI(url)}" style="max-height:180px;max-width:100%;border-radius:8px;border:1px solid var(--border-color);" onerror="this.closest('div').style.display='none'"></div>`
							: "");
					},
				},
				{ fieldname: "image_preview", fieldtype: "HTML" },
				{ fieldname: "remarks", fieldtype: "Small Text", label: __("CAD Remarks"), default: c.remarks },
			],
			primary_action_label: __("Set CAD Line"),
			primary_action(v) {
				if (!(v.gold_weight || "").trim()) return frappe.msgprint(__("Enter the gold weight target."));
				row._cad = { design_type: v.design_type, size: v.size, karat: v.karat, gold_weight: (v.gold_weight || "").trim(),
					diamond_weight: flt(v.diamond_weight), stone_no: cint(v.stone_no), reference: (v.reference || "").trim(),
					image: v.image || "", remarks: v.remarks || "" };
				d.hide();
				applyCadLine(row);
			},
		});
		d.show();
		if (c.design_type) d.fields_dict.design_type.df.onchange.call(d.fields_dict.design_type);
		if (c.image && d.fields_dict.image.df.onchange) d.fields_dict.image.df.onchange();
	}

	function applyCadLine(row) {
		const c = row._cad;
		// design-less line: lock the Design input, show the CAD identity in the Type column
		row.f.design.set("");
		row._lastDesign = null;
		row._materials = [];
		row._profile = null;
		row._designType = c.design_type;
		if (row.f.design_type) row.f.design_type.set(c.design_type + " · CAD");
		applyTypeSizes(row);
		if (c.size) row.f.size.set(c.size);
		setTimeout(() => row.f.design.$input && row.f.design.$input.prop("disabled", true).attr("placeholder", "CAD JOB — design after CAD"), 50);
		// no plan yet — budgets live on the bag's CAD fields, so the weight cells stay blank
		["gross_weight", "nett_weight", "purity", "pure",
			"dmd_no", "dmd_weight", "ps_no", "ps_weight", "cs_no", "cs_weight",
			"cz_no", "cz_weight", "cvd_no", "cvd_weight", "pdmd_no", "pdmd_weight", "poth_no", "poth_weight"]
			.forEach((k) => row.f[k] && row.f[k].set(""));
		updateDesignBtn(row);
		recalcTotals();
	}
	function clearCadLine(row) {
		row._cad = null;
		row._designType = "";
		if (row.f.design_type) row.f.design_type.set("");
		if (row.f.design.$input) row.f.design.$input.prop("disabled", false).attr("placeholder", "Design");
		updateDesignBtn(row);
	}

	// ---- Design Bank first: the card picks the line, variants follow --------
	// The Variant column only makes sense under a D Bank card: keep it disabled
	// until a bank is picked, and wipe it if the bank is cleared.
	function syncDesignDep(row) {
		const c = row._designCtrl;
		if (!c || !c.$input) return;
		const has = !!(row.f.bank && row.f.bank.get());
		c.$input.prop("disabled", !has)
			.attr("placeholder", has ? __("Variant") : __("pick a D Bank first"))
			.css("background", has ? "" : "var(--control-bg)");
		if (!has && row.f.design && row.f.design.get()) {
			row.f.design.set("");
			row._lastDesign = null;
			onDesignPicked(row);
			updateDesignBtn(row);
		}
	}

	function onBankPicked(row) {
		const bank = row.f.bank.get();
		syncDesignDep(row);
		if (!bank) { row._lastBank = ""; return; }
		// the bank field fires BOTH change + awesomplete-selectcomplete on one pick —
		// dedupe so the "create variant?" flow (and its dialog) doesn't run twice
		if (row._lastBank === bank) return;
		row._lastBank = bank;
		const cur = row.f.design.get();
		const pickFirst = () => frappe.db.get_list("Design",
			{ filters: { design_bank: bank, status: "Active" }, fields: ["name"], order_by: "creation asc", limit: 0 })
			.then((vs) => {
				if (vs.length) return selectDesign(row, vs[0].name); // default = first variant
				// no variant yet: no nagging dialog — the +Var button turns red and is the
				// way to create one (see updateDesignBtn)
				updateDesignBtn(row);
			});
		if (!cur) return pickFirst();
		// a variant of THIS card is already on the line — leave it be
		frappe.db.get_value("Design", cur, "design_bank").then((r) => {
			if (((r.message || {}).design_bank || "") !== bank) pickFirst();
		});
	}

	// Create a variant right from the line — the gallery's dialog, retargeted:
	// karat/stones/colour -> live name + seeded BOM (resolve_design_variant),
	// Create lands the Design and selects it on this line.
	let NAMING = null;
	function openVariantCreate(row, bank) {
		const API2 = "jewelima.jewelima.api"; // variant naming lives with the core APIs
		const esc = frappe.utils.escape_html;
		const go = (N, bankNo, img) => {
			let cur = null;
			// a row the USER added (locked rows are seeded by the system and fixed)
			function bomItemChanged() {
				const r0 = this.doc || (this.grid_row && this.grid_row.doc);
				if (!r0 || r0.locked) return;
				if (!r0.item) { r0.purity = 0; r0.uom = ""; r0.stone_type = ""; r0.pure = 0;
					vd.fields_dict.materials.grid.refresh(); return; }
				frappe.db.get_value("Item", r0.item, ["purity_percentage", "weight_unit", "stone_type"]).then((r) => {
					const v = r.message || {};
					r0.purity = flt(v.purity_percentage);
					r0.uom = v.weight_unit || "";
					r0.stone_type = v.stone_type || "";
					r0.qty = 0; r0.weight = 0; r0.pure = 0;
					vd.fields_dict.materials.grid.refresh();
				});
			}
			function bomWeightChanged() {
				const r0 = this.doc || (this.grid_row && this.grid_row.doc);
				if (!r0) return;
				r0.pure = r0.stone_type ? 0 : (flt(r0.weight) * flt(r0.purity)) / 100;
				vd.fields_dict.materials.grid.refresh();
			}
			const vd = new frappe.ui.Dialog({
				title: __("Create Variant — {0}", [bankNo]),
				size: "large",
				fields: [
					{ fieldname: "img", fieldtype: "HTML" },
					{ fieldname: "sb_top", fieldtype: "Section Break" },
					{ fieldname: "karat", fieldtype: "Select", label: __("Karat"), reqd: 1,
						options: N.karats.join("\n"), default: "22K" },
					{ fieldname: "cb1", fieldtype: "Column Break" },
					{ fieldname: "quality", fieldtype: "Select", label: __("Stones"),
						options: [""].concat(N.tokens).join("\n"),
						description: __("empty = plain gold, no token in the name") },
					{ fieldname: "cb2", fieldtype: "Column Break" },
					{ fieldname: "color", fieldtype: "Select", label: __("Gold colour"),
						options: N.colors.join("\n"), default: "YG",
						depends_on: `eval:!${JSON.stringify(N.karat_color_limit)}[doc.karat] || ${JSON.stringify(N.karat_color_limit)}[doc.karat].length > 1` },
					{ fieldname: "sb_prev", fieldtype: "Section Break" },
					{ fieldname: "prev", fieldtype: "HTML" },
					{ fieldname: "existing", fieldtype: "HTML" },
					{ fieldname: "sb_bom", fieldtype: "Section Break", label: __("Bill of Materials") },
					{
						fieldname: "materials", fieldtype: "Table", label: __("Materials"), options: "Design BOM Item", data: [],
						// The SEEDED rows (the karat+colour gold and the token's stone) are what the
						// variant means — they are locked: item read-only and not removable. Anything
						// the user ADDS (a colour stone, Swarovski, …) stays fully editable. This
						// mirrors the server rule in api._check_variant_bom.
						description: __("The gold and the chosen stone are set by the system and locked (item, qty and weight). You can ADD extra stones; change Karat / Stones / Colour above for a different composition."),
						fields: [
							{ fieldname: "locked", fieldtype: "Check", label: __("Locked"), hidden: 1 },
							{ fieldname: "item", fieldtype: "Link", options: "Item", label: __("Material"), in_list_view: 1, columns: 3, reqd: 1,
								only_select: 1, read_only_depends_on: "eval:doc.locked",
								get_query: () => ({ filters: { is_sales_item: 0, is_stock_item: 1 } }), onchange: bomItemChanged },
							{ fieldname: "purity", fieldtype: "Float", label: __("Purity %"), read_only: 1, in_list_view: 1, columns: 1 },
							{ fieldname: "uom", fieldtype: "Data", label: __("UOM"), read_only: 1, in_list_view: 1, columns: 1 },
							{ fieldname: "qty", fieldtype: "Float", label: __("Qty"), in_list_view: 1, columns: 1, mandatory_depends_on: "eval:doc.stone_type && !doc.locked", read_only_depends_on: "eval:doc.locked || !doc.stone_type" },
							{ fieldname: "weight", fieldtype: "Float", label: __("Weight"), in_list_view: 1, columns: 1, reqd: 1, read_only_depends_on: "eval:doc.locked", onchange: bomWeightChanged },
							{ fieldname: "pure", fieldtype: "Float", label: __("Pure (g)"), read_only: 1, in_list_view: 1, columns: 1 },
						],
					},
				],
				primary_action_label: __("Create Design"),
				primary_action(values) {
					if (!cur || !cur.name) return;
					if (cur.exists) {
						vd.hide();
						selectDesign(row, cur.name);
						return;
					}
					// the seeded gold/stone rows are the SYSTEM's numbers — rebuild them from
					// cur.seed so an edited cell can never change what gets created; only the
					// rows the user ADDED come from the grid.
					const seeded = (cur.seed || []).map((x) => Object.assign({}, x));
					const added = (values.materials || []).filter((m) => m.item && !m.locked);
					const raw = seeded.concat(added);
					if (!raw.length) return frappe.msgprint(__("Add at least one material to the design's BOM."));
					const bad = raw.find((m) => (m.stone_type ? (flt(m.qty) <= 0 || flt(m.weight) <= 0) : flt(m.weight) <= 0));
					if (bad) return frappe.msgprint(bad.stone_type
						? __("{0} is a stone — enter both a Qty and a Weight.", [bad.item])
						: __("{0} needs a Weight (grams).", [bad.item]));
					// ---- variant lock: BOM must match the chosen karat/colour/token ----
					const req = cur.requirements || {};
					const metals = raw.filter((m) => !m.stone_type).map((m) => m.item);
					const stones = raw.filter((m) => m.stone_type).map((m) => m.item);
					if (req.gold_item) {
						if (metals.indexOf(req.gold_item) === -1)
							return frappe.msgprint(__("This is a <b>{0}</b> variant — its gold <b>{1}</b> must be in the BOM. Don't remove it.", [req.token || cur.name, req.gold_item]));
						const wrong = metals.filter((m) => m !== req.gold_item);
						if (wrong.length)
							return frappe.msgprint(__("Only <b>{0}</b> gold belongs on this variant — remove: {1}. Change the Karat/Colour above for a different metal.", [req.gold_item, wrong.join(", ")]));
					}
					if (req.token_family) {
						const fam = req.token_family;
						if (!stones.some((s) => s === fam || s.indexOf(fam + " ") === 0))
							return frappe.msgprint(__("This is an <b>{0}</b> variant — add at least one {0} stone, or change the Stones selection above.", [req.token]));
					}
					const materials = raw.map((m) => ({ item: m.item, qty: m.stone_type ? (flt(m.qty) || 0) : 0, weight: flt(m.weight) || 0 }));
					frappe.call({ method: API2 + ".create_design", args: {
						design_name: cur.name, design_type: cur.design_type,
						image: cur.image, design_bank: cur.design_bank,
						materials: JSON.stringify(materials),
						karat: values.karat, quality: values.quality || "", color: values.color || "",
					} }).then((r) => {
						const res = r.message || {};
						if (!res.name) return;
						vd.hide();
						frappe.show_alert({ message: __("Design {0} created — on the line.", [res.name]), indicator: "green" }, 5);
						selectDesign(row, res.name);
					});
				},
			});
			vd.$wrapper.append(`<style>.jw-mat-dlg .link-btn{display:none !important;}
				.jw-mat-dlg .data-row > .col:last-child{display:none !important;}
				/* seeded (locked) rows: not tickable (so not deletable) and their
				   item/qty/weight cells can't be opened for editing at all */
				.jw-mat-dlg .grid-row.jw-locked .row-check{visibility:hidden;pointer-events:none;}
				.jw-mat-dlg .grid-row.jw-locked .col[data-fieldname="item"],
				.jw-mat-dlg .grid-row.jw-locked .col[data-fieldname="qty"],
				.jw-mat-dlg .grid-row.jw-locked .col[data-fieldname="weight"]{pointer-events:none;background:var(--control-bg);}
				</style>`).addClass("jw-mat-dlg");
			// keep the lock marks in sync with every grid render
			(function lockMarks() {
				const g = vd.fields_dict.materials && vd.fields_dict.materials.grid;
				if (!g) return;
				const mark = () => (g.grid_rows || []).forEach((gr) => {
					if (gr && gr.wrapper) $(gr.wrapper).toggleClass("jw-locked", !!(gr.doc && gr.doc.locked));
				});
				const orig = g.refresh.bind(g);
				g.refresh = function () { orig(); setTimeout(mark, 0); };
				setTimeout(mark, 0);
			})();
			if (img) vd.get_field("img").$wrapper.html(`<div style="text-align:center;margin:0 0 6px;"><img src="${encodeURI(img)}" style="max-height:180px;max-width:100%;border-radius:8px;border:1px solid var(--border-color);" onerror="this.closest('div').style.display='none'"></div>`);
			let judgeSeq = 0;
			const judge = () => {
				const v = vd.get_values(true) || {};
				if (!v.karat) return;
				const q = ++judgeSeq;
				frappe.call({ method: API2 + ".resolve_design_variant", freeze: false,
					args: { design_bank: bank, karat: v.karat, quality: v.quality || "", color: v.color || "" } })
					.then((r) => {
						if (q !== judgeSeq) return;
						cur = r.message || null;
						if (!cur) return;
						vd.get_field("prev").$wrapper.html(
							`<div style="font-size:15px;font-weight:800;font-family:var(--font-family-monospace,monospace);margin:4px 0;">${esc(cur.name || "")}</div>
							<div style="font-size:12px;color:${cur.exists ? "#e0a800" : "#2e7d32"};font-weight:700;">
								${cur.exists ? __("already exists — the button selects it on the line") : __("new — fill the BOM below and Create")}</div>`);
						vd.get_primary_btn().text(cur.exists ? __("Use on line") : __("Create Design"));
						vd.fields_dict.materials.$wrapper.toggle(!cur.exists);
						if (!cur.exists) {
							const g = vd.fields_dict.materials;
							// seeded rows carry the variant's meaning -> locked
							g.df.data = (cur.seed || []).map((x) => Object.assign({}, x, { locked: 1 }));
							g.grid.refresh();
						}
					})
					.catch(() => { cur = null; vd.get_field("prev").$wrapper.html(""); });
			};
			// what this card ALREADY has — so nobody guesses (and can reuse in one click)
			function paintExisting() {
				frappe.db.get_list("Design", { filters: { design_bank: bank, status: "Active" },
					fields: ["name"], order_by: "creation asc", limit: 0 }).then((vs) => {
					const $w = vd.get_field("existing").$wrapper;
					if (!vs || !vs.length) {
						$w.html(`<div style="font-size:12px;color:var(--text-muted);padding:4px 0;">${__("This card has no variants yet — this will be the first.")}</div>`);
						return;
					}
					$w.html(`<div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin:2px 0 4px;">
							${__("Variants already on this card ({0})", [vs.length])}</div>
						<div style="display:flex;flex-wrap:wrap;gap:6px;">${vs.map((v) => `
							<span class="jw-exvar" data-v="${esc(v.name)}" title="${__("use this one on the line")}"
								style="font-family:var(--font-family-monospace,monospace);font-size:11.5px;font-weight:700;
								border:1px solid var(--border-color);border-radius:6px;padding:2px 9px;cursor:pointer;background:var(--control-bg);">${esc(v.name)}</span>`).join("")}</div>`);
					$w.find(".jw-exvar").on("click", function () {
						vd.hide();
						selectDesign(row, this.getAttribute("data-v"));
					});
				});
			}
			paintExisting();
			vd.show();
			vd.$wrapper.on("change", ".frappe-control[data-fieldname=karat] select, .frappe-control[data-fieldname=quality] select, .frappe-control[data-fieldname=color] select", judge);
			setTimeout(judge, 150);
		};
		frappe.db.get_value("Design Bank", bank, ["design_no", "image", "photo"]).then((r) => {
			const m = r.message || {};
			const bankNo = m.design_no || bank;
			const img = m.image || m.photo || "";
			if (NAMING) go(NAMING, bankNo, img);
			else frappe.call({ method: API2 + ".get_variant_naming" }).then((rr) => { NAMING = rr.message; go(NAMING, bankNo, img); });
		});
	}

	// select a design onto the line programmatically (set_value is async and does not fire
	// the input change handler — chain, clear the guard, then pull the BOM explicitly)
	function selectDesign(row, name) {
		Promise.resolve(row.f.design.set(name)).then(() => {
			row._lastDesign = null;
			onDesignPicked(row);
			updateDesignBtn(row);
		});
	}
	state.selectDesign = selectDesign;

	// The per-line "New" flow: show the design's current gold + every other karat gold.
	// RED = variant doesn't exist yet (click -> prefilled New Design dialog);
	// BLACK = variant already exists (click -> select it on this line).
	// Per-piece plan profile from a materials list — mirrors api._plan_values: gross = metal
	// grams + stone grams (1 ct = 0.2 g), nett = metal grams, gram-weighted metal purity.
	// Lets edited materials recompute the line's numbers instantly (no round-trip).
	function planProfile(mats) {
		const BUCKET = { "Diamond": "dmd", "Precious Stone": "ps", "Color Stone": "cs", "Cubic Zirconia": "cz", "CVD": "cvd", "Party Diamond": "pdmd", "Party Other": "poth" };
		const w = {}, n = {};
		Object.values(BUCKET).forEach((b) => { w[b] = 0; n[b] = 0; });
		let metal = 0, pnum = 0;
		const mp = [];
		(mats || []).forEach((m) => {
			const b = BUCKET[m.stone_type], wt = flt(m.weight), q = cint(m.qty);
			if (b) { n[b] += q; w[b] += wt; }
			else { const pu = flt(m.purity); metal += wt; pnum += wt * pu; if (pu) mp.push(pu); }
		});
		const stone_g = Object.values(w).reduce((a, b) => a + b, 0) * 0.2;
		const purity = metal ? pnum / metal : (mp.length ? mp.reduce((a, b) => a + b, 0) / mp.length : 0);
		const out = { gross_weight: +(metal + stone_g).toFixed(3), nett_weight: +metal.toFixed(3), purity: +purity.toFixed(3) };
		Object.values(BUCKET).forEach((b) => { out[b + "_no"] = n[b]; out[b + "_weight"] = +w[b].toFixed(3); });
		return out;
	}

	// Pull the design's BOM into this line's editable working copy + recompute.
	// type -> {sizes, default} (Setup → Design Types); the row's Size dropdown follows the type
	state.typeSizes = {};
	frappe.call({ method: "jewelima.jewelima.api.get_design_types_with_sizes" }).then((r) => {
		(r.message || []).forEach((t) => (state.typeSizes[t.design_type] = { sizes: t.sizes || [], default: t.default || "" }));
	});
	function applyTypeSizes(row) {
		if (!row.f.size || !row.f.size.setOptions) return;
		const t = state.typeSizes[row._designType] || { sizes: [], default: "" };
		row.f.size.setOptions(t.sizes.length ? t.sizes : ["NA"]);
		if (t.default && !row.f.size.get()) row.f.size.set(t.default); // pre-select the type's default
	}

	function pullDesignBOM(row) {
		const design = row.f.design.get();
		if (row.f.design_type) row.f.design_type.set("");
		if (!design) { row._materials = []; row._profile = null; row._image = ""; row._designType = ""; applyProfile(row); return Promise.resolve(); }
		return frappe.call({ method: "jewelima.jewelima.api.get_design_materials", args: { design } }).then((r) => {
			const msg = r.message || {};
			row._materials = (msg.materials || []).map((m) => ({ item: m.item, qty: m.qty, weight: m.weight, purity: m.purity, uom: m.uom, stone_type: m.stone_type }));
			row._origMaterials = row._materials.map((m) => ({ ...m }));
			row._image = msg.image || "";
			row._designType = msg.design_type || "";
			if (row.f.design_type) row.f.design_type.set(row._designType);
			applyTypeSizes(row);
			row._edited = false;
			if (row.markEdited) row.markEdited();
			row._profile = planProfile(row._materials);
			applyProfile(row);
		});
	}

	// Per-line reset: re-pull the design's BOM (discarding edits) and recompute. With no
	// design picked yet, just clear the line's size/qty.
	function resetLine(row) {
		if (row._cad) {
			clearCadLine(row);
			row.f.size.set(""); row.f.qty.set("");
			frappe.show_alert({ message: __("CAD line cleared."), indicator: "blue" }, 3);
		} else if (row.f.design.get()) {
			row._edited = false;
			if (row.markEdited) row.markEdited();
			pullDesignBOM(row);
			frappe.show_alert({ message: __("Line reset to the design's BOM."), indicator: "blue" }, 3);
		} else {
			row.f.size.set(""); row.f.qty.set("");
			row._materials = []; row._profile = null; applyProfile(row);
		}
	}

	// Edit this bag's OWN materials (BOM) and see the photo. Seeded from the design's BOM;
	// edits recompute the line's weights/stones and are saved into Order Bag.bag_bom on placing.
	function editMaterials(row) {
		const design = row.f.design.get();
		if (!design) return frappe.msgprint(__("Pick a Design on this line first."));
		if (row._materials && row._materials.length) return openMaterials(row, design);
		// not pulled yet — fetch the design's BOM + photo first, then open
		frappe.call({ method: "jewelima.jewelima.api.get_design_materials", args: { design } }).then((r) => {
			const msg = r.message || {};
			row._materials = (msg.materials || []).map((m) => ({ item: m.item, qty: m.qty, weight: m.weight, purity: m.purity, uom: m.uom, stone_type: m.stone_type }));
			row._origMaterials = row._materials.map((m) => ({ ...m }));
			row._image = msg.image || "";
			row._profile = planProfile(row._materials);
			applyProfile(row);
			openMaterials(row, design);
		});
	}

	jwLoadSieve();

	function openMaterials(row, design) {
		function itemChanged() {
			const r = this.doc || (this.grid_row && this.grid_row.doc);
			if (!r) return;
			if (!r.item) { r.purity = 0; r.uom = ""; r.pure = 0; r.stone_type = ""; dd.fields_dict.materials.grid.refresh(); return; }
			frappe.db.get_value("Item", r.item, ["purity_percentage", "weight_unit", "stone_type"]).then((res) => {
				const v = res.message || {};
				r.purity = flt(v.purity_percentage); r.uom = v.weight_unit || ""; r.stone_type = v.stone_type || "";
				if (!v.stone_type) r.qty = 0;
				r.pure = v.stone_type ? 0 : (flt(r.weight) * flt(r.purity)) / 100;
				dd.fields_dict.materials.grid.refresh();
			});
		}
		function weightChanged() {
			const r = this.doc || (this.grid_row && this.grid_row.doc);
			if (!r) return;
			r.pure = r.stone_type ? 0 : (flt(r.weight) * flt(r.purity)) / 100;
			dd.fields_dict.materials.grid.refresh();
		}
		const dd = new frappe.ui.Dialog({
			title: __("Materials — {0}", [design]),
			size: "large",
			fields: [
				{ fieldname: "photo", fieldtype: "HTML" },
				{
					fieldname: "materials", fieldtype: "Table", reqd: 1, options: "Design BOM Item", data: [],
					description: __("This bag's own BOM (copied from the design). Stones need a Qty + Weight (ct); metals need a Weight (g). The line updates on Apply."),
					fields: [
						{ fieldname: "item", fieldtype: "Link", options: "Item", label: __("Material"), in_list_view: 1, columns: 3, reqd: 1, only_select: 1, get_query: () => ({ filters: { is_sales_item: 0, is_stock_item: 1 } }), onchange: itemChanged },
						{ fieldname: "purity", fieldtype: "Float", label: __("Purity %"), read_only: 1, in_list_view: 1, columns: 1 },
						{ fieldname: "uom", fieldtype: "Data", label: __("UOM"), read_only: 1, in_list_view: 1, columns: 1 },
						{ fieldname: "qty", fieldtype: "Float", label: __("Qty"), in_list_view: 1, columns: 1, mandatory_depends_on: "eval:doc.stone_type", read_only_depends_on: "eval:!doc.stone_type", onchange: jwSieveQty },
						{ fieldname: "weight", fieldtype: "Float", label: __("Weight"), in_list_view: 1, columns: 1, reqd: 1, onchange: weightChanged },
						{ fieldname: "pure", fieldtype: "Float", label: __("Pure (g)"), read_only: 1, in_list_view: 1, columns: 1 },
					],
				},
			],
			primary_action_label: __("Apply"),
			primary_action(values) {
				const raw = (values.materials || []).filter((m) => m.item);
				if (!raw.length) return frappe.msgprint(__("Add at least one material."));
				const bad = raw.find((m) => (m.stone_type ? (flt(m.qty) <= 0 || flt(m.weight) <= 0) : flt(m.weight) <= 0));
				if (bad) return frappe.msgprint(bad.stone_type ? __("{0} is a stone — enter both a Qty and a Weight.", [bad.item]) : __("{0} needs a Weight (grams).", [bad.item]));
				row._materials = raw.map((m) => ({ item: m.item, qty: m.stone_type ? (flt(m.qty) || 0) : 0, weight: flt(m.weight) || 0, purity: flt(m.purity) || 0, uom: m.uom || "", stone_type: m.stone_type || "" }));
				// yellow ONLY when the list truly differs from the design's BOM —
				// opening the dialog and hitting Apply unchanged stays clean
				const norm = (list) => (list || []).map((m) =>
					[m.item, flt(m.qty) || 0, flt(m.weight) || 0].join("|")).sort().join("~");
				row._edited = norm(row._materials) !== norm(row._origMaterials);
				if (row.markEdited) row.markEdited();
				row._profile = planProfile(row._materials);
				applyProfile(row);
				dd.hide();
				frappe.show_alert({ message: __("Line materials updated."), indicator: "green" }, 3);
			},
		});
		dd.show();
		if (row._image) {
			dd.fields_dict.photo.$wrapper.html(`<div style="text-align:center;margin:0 0 12px;"><img src="${encodeURI(row._image)}" style="max-height:200px;max-width:100%;border-radius:8px;border:1px solid var(--border-color);" onerror="this.closest('div').style.display='none'"></div>`);
		}
		// seed the grid with this line's current materials (static-mode dialog grid)
		const grid = dd.fields_dict.materials.grid;
		grid.df.data = (row._materials || []).map((m, i) => ({ idx: i + 1, name: "new-mat-" + (i + 1), item: m.item, qty: m.qty, weight: m.weight, purity: m.purity, uom: m.uom, stone_type: m.stone_type,
			// gold rows show their PURE grams from the off (weight x purity%)
			pure: m.stone_type ? 0 : (flt(m.weight) * flt(m.purity)) / 100 }));
		grid.refresh();
		// pickers pick — no open-record arrows inside this dialog's grid
		dd.$wrapper.append("<style>.jw-mat-dlg .link-btn{display:none !important;}</style>").addClass("jw-mat-dlg");
	}

	function updateRemarkBtn(row) {
		const has = !!(row._remark || "").trim();
		row.$remark.toggleClass("btn-success", has).toggleClass("btn-default", !has);
		row.$remark.attr("title", has ? __("Edit remark (hover shows it)") : __("Add a remark"));
	}
	// immediate hover tooltip showing the full remark (native title lags ~1s)
	let po_tip = null;
	function po_showTip(el, text) {
		po_hideTip();
		po_tip = document.createElement("div");
		po_tip.textContent = text;
		po_tip.style.cssText = "position:fixed;z-index:9999;background:#2b2b2b;color:#fff;padding:5px 9px;border-radius:6px;font-size:11.5px;max-width:300px;white-space:pre-wrap;box-shadow:0 3px 12px rgba(0,0,0,.35);pointer-events:none;";
		document.body.appendChild(po_tip);
		const r = el.getBoundingClientRect();
		po_tip.style.left = Math.max(6, r.left) + "px";
		po_tip.style.top = Math.max(6, r.top - po_tip.offsetHeight - 6) + "px";
	}
	function po_hideTip() { if (po_tip) { po_tip.remove(); po_tip = null; } }

	// remark lives in a dialog (not an inline field) to save space; button turns green when set
	function updatePhotosBtn(row) {
		if (!row.$photos) return;
		const n = (row._photos || []).length;
		row.$photos.text(n ? __("Photos ({0})", [n]) : __("Photos"))
			.toggleClass("po-has-photos", !!n);
	}
	function editPhotos(row) {
		const dlg = new frappe.ui.Dialog({
			title: __("Photos for this bag"),
			fields: [{ fieldtype: "HTML", fieldname: "b" }],
			primary_action_label: __("Done"),
			primary_action() { dlg.hide(); },
		});
		const $b = dlg.get_field("b").$wrapper;
		function paint() {
			$b.html(`
				<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">${__("Held on this line — copied onto the Order Bag the moment the order is placed (they appear on Order Bag Photos).")}</div>
				<button class="btn btn-sm btn-default pp-add">${__("Add photos…")}</button>
				<input type="file" class="pp-file" accept="image/*" multiple style="display:none;">
				<div class="pp-grid" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;">
					${(row._photos || []).map((p, i) => `
						<div style="position:relative;">
							<img src="${p.dataurl}" style="width:110px;height:110px;object-fit:cover;border-radius:8px;border:1px solid var(--border-color);">
							<span class="pp-x" data-i="${i}" style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,.55);color:#fff;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:11px;">✕</span>
						</div>`).join("")}
				</div>`);
			$b.find(".pp-add").on("click", () => $b.find(".pp-file").trigger("click"));
			$b.find(".pp-file").on("change", function () {
				const files = [...(this.files || [])];
				this.value = "";
				files.forEach((file) => {
					const rd = new FileReader();
					rd.onload = () => { row._photos.push({ name: file.name, dataurl: rd.result }); paint(); updatePhotosBtn(row); };
					rd.readAsDataURL(file);
				});
			});
			$b.find(".pp-x").on("click", function () {
				row._photos.splice(+this.dataset.i, 1);
				paint();
				updatePhotosBtn(row);
			});
		}
		paint();
		dlg.show();
	}

	function editRemark(row) {
		frappe.prompt(
			{ fieldname: "remark", fieldtype: "Small Text", label: __("Remark"), default: row._remark || "" },
			(v) => { row._remark = (v.remark || "").trim(); updateRemarkBtn(row); },
			__("Remark"),
			__("Save")
		);
	}

	// Split a line's qty across N bags. Divides as evenly as possible; the last line
	// takes any remainder (e.g. 50 → 4 bags = 12, 12, 12, 14).
	function doSplit(row) {
		const total = cint(row.f.qty.get());
		if (!row.f.design.get() && !row._cad) return frappe.msgprint(__("Pick a Design (or set a CAD line) first."));
		if (total <= 1) return frappe.msgprint(__("This line has only 1 — nothing to split."));
		frappe.prompt(
			{
				fieldname: "bags", fieldtype: "Int", reqd: 1, default: 2,
				label: __("Split into how many bags?"),
				description: __("{0} qty will be divided across this many lines (the last line takes any remainder).", [total]),
			},
			(v) => {
				const n = cint(v.bags);
				if (n < 2) return frappe.msgprint(__("Enter 2 or more."));
				if (n > total) return frappe.msgprint(__("Can't split {0} into more than {0} bags (each bag needs at least 1).", [total]));
				const base = Math.floor(total / n);
				const qtys = [];
				for (let i = 0; i < n - 1; i++) qtys.push(base);
				qtys.push(total - base * (n - 1)); // last line gets the remainder
				const design = row.f.design.get(), size = row.f.size.get();
				const bank = row.f.bank ? row.f.bank.get() : "";
				row.f.qty.set(qtys[0]); // original line becomes the first bag
				applyProfile(row);
				updateSplitBtn(row);
				let prev = row;
				for (let i = 1; i < n; i++) {
					const nr = addRow(prev);
					if (row._cad) {
						// split CAD twins carry the SAME targets — finalize later attaches
						// the same design to all of them
						nr._cad = { ...row._cad };
						nr.f.qty.set(qtys[i]);
						applyCadLine(nr);
						nr.f.size.set(size);
					} else {
						nr._profile = row._profile;
						nr._materials = (row._materials || []).map((m) => ({ ...m }));
						nr._origMaterials = (row._origMaterials || []).map((m) => ({ ...m }));
						nr._image = row._image;
						nr._edited = row._edited; // an edited BOM travels to every bag of the split
						if (nr.markEdited) nr.markEdited();
						nr._designType = row._designType;
						// the bank must land FIRST, and Link.set_value is ASYNC — chain it,
						// or syncDesignDep still sees an empty bank and wipes the variant
						nr._lastBank = bank;
						nr._lastDesign = design;
						Promise.resolve(nr.f.bank && bank ? nr.f.bank.set(bank) : null)
							.then(() => {
								if (state.syncDesignDep) state.syncDesignDep(nr);
								return nr.f.design.set(design);
							})
							.then(() => {
								nr._lastDesign = design;
								applyProfile(nr);
								updateDesignBtn(nr);
							});
						applyTypeSizes(nr);
						nr.f.size.set(size);
						if (nr.f.design_type) nr.f.design_type.set(row._designType || "");
						nr.f.qty.set(qtys[i]);
						applyProfile(nr);
						// design.set is async — judging the button NOW sees an empty
						// field and leaves Materials dead on every split row
						setTimeout(() => updateDesignBtn(nr), 400);
					}
					updateSplitBtn(nr);
					nr._remark = row._remark; // split bags inherit the line's remark
					updateRemarkBtn(nr);
					// ...and any extra photos added beyond the design image
					nr._photos = (row._photos || []).map((p) => ({ ...p }));
					updatePhotosBtn(nr);
					prev = nr;
				}
				recalcTotals();
				// repaint + re-judge buttons once the async design set_values land
				setTimeout(() => {
					recalcTotals();
					state.rows.forEach((r) => { updateDesignBtn(r); updateSplitBtn(r); });
				}, 600);
				frappe.show_alert({ message: __("Split into {0} bags: {1}", [n, qtys.join(" + ")]), indicator: "green" });
			},
			__("Split Line"),
			__("Split")
		);
	}

	function onDesignPicked(row) {
		const design = row.f.design.get() || "";
		if ((row._lastDesign || "") === design) return Promise.resolve();
		row._lastDesign = design;
		return pullDesignBOM(row) || Promise.resolve(); // fills from the BOM — or wipes when cleared
	}

	// Fill the line from the design's PER-PIECE profile, scaled by qty.
	// Weights + stone counts are totals (per-piece × qty); purity is a ratio (unscaled).
	function applyProfile(row) {
		const p = row._profile;
		const set = (k, v) => { if (row.f[k]) row.f[k].set(v || ""); };
		if (!p) {
			// design cleared — wipe everything derived from it (was left stale before)
			["design_type", "purity", "gross_weight", "nett_weight", "pure",
			 "dmd_no", "ps_no", "cs_no", "cz_no", "cvd_no", "pdmd_no", "poth_no",
			 "dmd_weight", "ps_weight", "cs_weight", "cz_weight", "cvd_weight", "pdmd_weight", "poth_weight"].forEach((k) => set(k, ""));
			recalcTotals();
			return;
		}
		const q = cint(row.f.qty.get()) || 1;
		set("purity", p.purity);
		["gross_weight", "nett_weight", "dmd_weight", "ps_weight", "cs_weight", "cz_weight", "cvd_weight", "pdmd_weight", "poth_weight"].forEach((k) => {
			const v = flt(p[k]) * q;
			set(k, v ? v.toFixed(3) : "");
		});
		const pure = (flt(p.nett_weight) * q * flt(p.purity)) / 100; // pure gold grams (scales with qty)
		set("pure", pure ? pure.toFixed(3) : "");
		["dmd_no", "ps_no", "cs_no", "cz_no", "cvd_no", "pdmd_no", "poth_no"].forEach((k) => set(k, cint(p[k]) * q || ""));
		recalcTotals();
	}

	// expose for the New Design dialog + the Requests/repeat fill
	state.onDesignPicked = onDesignPicked;
	state.addRow = addRow;
	state.openVariantCreate = openVariantCreate;
	state.applyCadLine = applyCadLine;
	state.applyProfile = applyProfile;
	state.planProfile = planProfile;
	state.updateSplitBtn = updateSplitBtn;
	state.syncDesignDep = syncDesignDep;
	state.updateRemarkBtn = updateRemarkBtn;
	state.updateDesignBtn = updateDesignBtn;
	state.updateNewBtn = updateNewBtn;

	const resetPage = () => {
		$body.empty();
		state.rows = [];
		state.activeRequest = "";
		state.header.customer.set_value("");
		state.header.salesman.set_value("");
		state.header.order_type.set_value("");
		if (state.header.days) state.header.days.set_value(0);
		if (state.header.cust_days) state.header.cust_days.set_value(0);
		if (state.showDue) state.showDue();
		state.showNo(state.reservedNo);
		if (state.header.notes) state.header.notes.set_value("");
		if (state.header.order_date) state.header.order_date.set_value(frappe.datetime.get_today());
		addRow();
	};
	state.resetPage = resetPage;

	page.add_inner_button(__("Find Party by Old Name"), () => {
		const esc = frappe.utils.escape_html;
		const dlg = new frappe.ui.Dialog({
			title: __("Find a party by its old name"),
			fields: [
				{ fieldname: "old", fieldtype: "Data", label: __("Old name"), reqd: 1,
					placeholder: __("e.g. AKKARA K.CHIRA") },
				{ fieldname: "out", fieldtype: "HTML" },
			],
			primary_action_label: __("Search"),
			primary_action() { run(); },
		});
		const run = () => {
			const q = (dlg.get_value("old") || "").trim();
			if (!q) return;
			frappe.call({ method: "jewelima.jewelima.api.lookup_old_name", args: { old_name: q } }).then((r) => {
				const d = r.message || {};
				const $o = dlg.get_field("out").$wrapper;
				if (!d.found) {
					return $o.html(`<div style="padding:8px 0;color:#b02a2a;font-weight:700;">${__("Not created")}</div>
						<div style="font-size:12px;color:var(--text-muted);">${__("No party is recorded under that old name.")}</div>`);
				}
				if (!(d.parties || []).length) {
					return $o.html(`<div style="padding:8px 0;color:#b4690e;font-weight:700;">${__("Not created yet")}</div>
						<div style="font-size:12px;color:var(--text-muted);">${__("The old name is on record but has no new party assigned.")}</div>`);
				}
				$o.html(`<div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin:6px 0 4px;">
						${esc(d.old_name)} →</div>
					<div style="display:flex;flex-wrap:wrap;gap:6px;">${d.parties.map((p) => `
						<span class="jw-oldhit" data-p="${esc(p)}" title="${__("use this party on the order")}"
							style="font-weight:800;border:1px solid var(--border-color);border-radius:6px;padding:3px 10px;
							cursor:pointer;background:var(--control-bg);">${esc(p)}</span>`).join("")}</div>`);
				$o.find(".jw-oldhit").on("click", function () {
					const p = this.getAttribute("data-p");
					dlg.hide();
					Promise.resolve(state.header.customer.set_value(p)).then(() => {
						state.header.customer.$input.trigger("change");
						frappe.show_alert({ message: __("Party set to {0}.", [p]), indicator: "green" }, 4);
					});
				});
			});
		};
		dlg.show();
		setTimeout(() => dlg.get_field("old").$input.on("keydown", (e) => { if (e.key === "Enter") run(); }), 300);
	});
	if (OPTS.mode === "order") page.add_inner_button(__("Requests"), () => openRequestsDialog(state));
	// file the whole form as a REQUEST instead of placing: no E-number is
	// consumed (Job Order only exists on Place), the request takes its own
	// code, and the due-days are stripped — requests carry no dates
	page.add_inner_button(__("New Design"), () => openNewDesignDialog(state));
	page.add_inner_button(__("OLD Design"), () => openOldDesignDialog(state));
	page.add_inner_button(__("Add Row"), () => addRow());
	page.add_inner_button(__("Reset"), resetPage);

	addRow(); // start with a single line

	// handoff from the All Requests board: route_options carry the request to place
	const _ro = frappe.route_options || {};
	if (OPTS.mode === "order" && _ro.order_request) {
		frappe.route_options = null;
		po_useRequest(state, _ro.order_request);
	}

	// claim the order number up front — the same claim comes back if you re-open;
	// abandoned claims recycle to other sessions after a while (gaps fill later)
	if (OPTS.mode === "order") {
		frappe.call({ method: "jewelima.jewelima.api.reserve_order_no" }).then((r) => {
			state.reservedNo = r.message || "";
			state.showNo(state.reservedNo);
		});
	}

	if (OPTS.mode === "order") {
		page.set_primary_action(__("Place Order"), () => placeOrder(page, state, renumber, addRow, $body), "add");
	} else {
		page.set_primary_action(__("Request Order"), () => requestOrder(state), "add");
		loadMyRequests(page);
	}

	function loadMyRequests() {
		const esc = frappe.utils.escape_html;
		const box = $(page.main).find(".po-mine-body");
		if (!box.length) return;
		frappe.call({ method: "jewelima.jewelima.api.get_my_order_requests" }).then((r) => {
			const reqs = r.message || [];
			if (!reqs.length) { box.html(`<div class="po-empty">${__("No requests filed yet.")}</div>`); return; }
			box.html(`
				<table><thead><tr>
					<th>${__("Request")}</th><th>${__("Date")}</th><th>${__("Party")}</th>
					<th style="text-align:center">${__("Lines")}</th><th>${__("Status")}</th><th>${__("Order")}</th><th></th>
				</tr></thead><tbody>${reqs.map((q) => `
					<tr>
						<td><a href="/app/order-request/${encodeURIComponent(q.name)}"><b>${esc(q.name)}</b></a></td>
						<td>${esc(frappe.datetime.str_to_user(q.request_date) || "")}</td>
						<td>${esc(q.customer || "")}</td>
						<td style="text-align:center">${q.lines}</td>
						<td><span class="po-badge ${q.status.toLowerCase()}">${esc(q.status)}</span></td>
						<td>${q.job_order ? `<a href="/app/job-order/${encodeURIComponent(q.job_order)}">${esc(q.job_order)}</a>` : "—"}</td>
						<td style="text-align:center">${q.status === "Placed" ? "" : `<button class="btn btn-xs btn-danger po-req-del" data-name="${esc(q.name)}">${__("Delete")}</button>`}</td>
					</tr>`).join("")}
				</tbody></table>`);
			box.find(".po-req-del").on("click", function () {
				const name = this.getAttribute("data-name");
				frappe.confirm(__("Delete {0}? This can't be undone.", [name]), () => {
					frappe.call({ method: "jewelima.jewelima.api.delete_order_request", args: { name } }).then(() => {
						frappe.show_alert({ message: __("{0} deleted.", [name]), indicator: "orange" }, 4);
						loadMyRequests();
					});
				});
			});
		});
	}

	// Request Order — same read as placing, but files an Order Request instead.
	// Edited BOMs and CAD lines travel WITH the request so Use restores them 1:1.
	function requestOrder() {
		const all = state.rows.map((r) => ({ r, l: po_readLine(r) }));
		const lines = [];
		let ghosts = 0;
		let noQty = 0;
		all.forEach(({ r, l }) => {
			if ((r._cad || l.design) && !(l.qty > 0)) {
				noQty++;
			} else if (r._cad) {
				lines.push({ cad: r._cad, qty: l.qty, size: l.size, remark: l.narration });
			} else if (l.design) {
				lines.push({
					design: l.design, qty: l.qty, size: l.size, remark: l.narration,
					edited: r._edited ? 1 : 0,
					materials: r._edited ? (r._materials || []) : [],
				});
			} else if (l.qty) {
				ghosts++;
			}
		});
		if (ghosts) { frappe.msgprint(__("{0} line(s) have a Qty but no Design — add a Design (or set CAD) or clear the Qty.", [ghosts])); return; }
		if (noQty) { frappe.msgprint(__("{0} line(s) have no Qty — every line needs at least Qty 1 (red rows won't go in).", [noQty])); return; }
		if (!lines.length) { frappe.msgprint(__("Add at least one line with a Design (or a CAD line).")); return; }
		const stripDates = OPTS.mode === "order"; // Save as Request: requests carry no dates
		const dropped = OPTS.mode === "order" && state.rows.some((r) => (r._photos || []).length);
		const payload = {
			customer: state.header.customer.get_value(),
			salesman: state.header.salesman.get_value(),
			order_type: state.header.order_type.get_value(),
			days: !stripDates && state.header.days ? cint(state.header.days.get_value()) : 0,
			cust_days: !stripDates && state.header.cust_days ? cint(state.header.cust_days.get_value()) : 0,
			notes: state.header.notes ? state.header.notes.get_value() : "",
			lines,
		};
		frappe.call({ method: "jewelima.jewelima.api.save_order_request", args: { payload } }).then((r) => {
			frappe.show_alert({ message: __("Request {0} filed — no order placed.", [r.message])
				+ (dropped ? " " + __("Line photos were dropped — requests don't hold photos.") : ""), indicator: "green" }, 6);
			state.resetPage();
			if (OPTS.mode === "request") loadMyRequests();
		});
	}

// ---- Order Requests + repeat orders -------------------------------------------
// fill the page from a request / an old Job Order: header first, then one row per
// line. Qty lands BEFORE the design so the profile scales right when the BOM pull
// resolves; the size is retried until the design type's size options have loaded.

function po_trySetSize(row, size, tries) {
	row.f.size.set(size);
	if (row.f.size.get() === size || tries <= 0) return;
	setTimeout(() => po_trySetSize(row, size, tries - 1), 300);
}

function po_fillPage(state, data) {
	state.resetPage();
	const H = state.header;
	if (data.customer) H.customer.set_value(data.customer);
	if (data.salesman) H.salesman.set_value(data.salesman);
	if (data.order_type) H.order_type.set_value(data.order_type);
	if (H.days) Promise.resolve(H.days.set_value(cint(data.days) || 0)).then(() => state.showDue && state.showDue());
	if (H.cust_days) Promise.resolve(H.cust_days.set_value(cint(data.cust_days) || 0)).then(() => state.showDue && state.showDue());
	(data.lines || []).forEach((l, i) => {
		const row = i === 0 ? state.rows[0] : state.addRow();
		row.f.qty.set(l.qty || "");
		row._remark = l.remark || "";
		if (l.cad) {
			// a CAD wish travels whole — budgets, reference image, remarks
			row._cad = l.cad;
			state.applyCadLine(row);
			if (l.size) row.f.size.set(l.size);
			setTimeout(() => {
				["updateSplitBtn", "updateRemarkBtn", "updateDesignBtn", "updateNewBtn"].forEach((f) => state[f] && state[f](row));
				if (state.recalcTotals) state.recalcTotals();
			}, 400);
			return;
		}
		Promise.resolve(row.f.design.set(l.design)).then(async () => {
			await state.onDesignPicked(row);
			if (l.edited && (l.materials || []).length) {
				// the request carried a hand-edited BOM — restore it over the design's
				row._materials = l.materials;
				row._edited = true;
				if (row.markEdited) row.markEdited();
				row._profile = state.planProfile(l.materials);
				state.applyProfile(row);
			}
			if (l.size) po_trySetSize(row, l.size, 12);
			setTimeout(() => {
				["updateSplitBtn", "updateRemarkBtn", "updateDesignBtn", "updateNewBtn"].forEach((f) => state[f] && state[f](row));
				if (state.recalcTotals) state.recalcTotals();
			}, 900);
		});
	});
	if (data.lines && data.lines.length) state.addRow(); // trailing empty line
}

function openRequestsDialog(state) {
	const esc = frappe.utils.escape_html;
	const d = new frappe.ui.Dialog({
		title: __("Order Requests"),
		size: "extra-large",
		fields: [
			{ fieldtype: "HTML", fieldname: "repeat_html" },
			{ fieldtype: "Section Break", label: __("Open Requests") },
			{ fieldtype: "HTML", fieldname: "list_html" },
		],
	});
	d.fields_dict.repeat_html.$wrapper.html(`
		<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
			<b>${__("Repeat an order")}</b>
			<input class="form-control po-req-jo" style="width:170px;height:28px;display:inline-block" placeholder="${__("Job Order e.g. E1234")}">
			<button class="btn btn-default btn-sm po-req-load">${__("Load Order")}</button>
			<span class="text-muted" style="font-size:12px">${__("pulls that exact order back into the page")}</span>
		</div>`);
	const loadJO = () => {
		const jo = (d.$wrapper.find(".po-req-jo").val() || "").trim().toUpperCase();
		if (!jo) return;
		frappe.call({ method: "jewelima.jewelima.api.get_job_order_fill", args: { job_order: jo } }).then((r) => {
			const m = r.message || {};
			d.hide();
			po_fillPage(state, m);
			let msg = __("Loaded {0} line(s) from {1}.", [(m.lines || []).length, jo]);
			if (m.skipped_cad) msg += " " + __("{0} CAD bag(s) skipped — re-enter those via the CAD button.", [m.skipped_cad]);
			frappe.show_alert({ message: msg, indicator: "blue" }, 7);
		});
	};
	d.$wrapper.find(".po-req-load").on("click", loadJO);
	d.$wrapper.find(".po-req-jo").on("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); loadJO(); } });

	frappe.call({ method: "jewelima.jewelima.api.get_order_requests" }).then((r) => {
		const reqs = r.message || [];
		if (!reqs.length) {
			d.fields_dict.list_html.$wrapper.html(`<div class="text-muted" style="padding:8px 2px">${__("No open requests.")}</div>`);
			return;
		}
		d.fields_dict.list_html.$wrapper.html(`
			<div style="max-height:50vh;overflow:auto;">
			<table class="table table-bordered" style="font-size:12.5px;margin:0;">
				<thead><tr>
					<th>${__("Request")}</th><th>${__("Date")}</th><th>${__("By")}</th><th>${__("Party")}</th>
					<th style="text-align:center">${__("Lines")}</th><th style="text-align:center">${__("Qty")}</th>
					<th>${__("Designs")}</th><th></th>
				</tr></thead>
				<tbody>${reqs.map((q) => `
					<tr>
						<td><a href="/app/order-request/${encodeURIComponent(q.name)}"><b>${esc(q.name)}</b></a></td>
						<td>${esc(frappe.datetime.str_to_user(q.request_date) || "")}</td>
						<td>${esc(q.requested_by)}</td>
						<td>${esc(q.customer)}</td>
						<td style="text-align:center">${q.lines}</td>
						<td style="text-align:center">${q.qty}</td>
						<td>${esc(q.designs)}${q.notes ? `<div class="text-muted">${esc(q.notes)}</div>` : ""}</td>
						<td><button class="btn btn-primary btn-xs po-req-use" data-name="${esc(q.name)}">${__("Use")}</button></td>
					</tr>`).join("")}
				</tbody>
			</table></div>`);
		d.$wrapper.find(".po-req-use").on("click", function () {
			const name = this.getAttribute("data-name");
			po_useRequest(state, name).then(() => d.hide());
		});
	});
	d.show();
}

// pull one request onto the page and remember it — placing stamps it Placed
function po_useRequest(state, name) {
	return frappe.call({ method: "jewelima.jewelima.api.get_order_request", args: { name } }).then((rr) => {
		po_fillPage(state, rr.message || {});
		state.activeRequest = name;
		frappe.show_alert({
			message: __("Filled from {0} — placing the order will mark it Placed.", [name]),
			indicator: "blue",
		}, 7);
	});
}

function po_readLine(r) {
	const g = (k) => r.f[k].get();
	return {
		design: g("design") || undefined,
		size: g("size") || undefined,
		qty: cint(g("qty")) || 0,
		gross_weight: flt(g("gross_weight")) || 0,
		nett_weight: flt(g("nett_weight")) || 0,
		purity: flt(g("purity")) || 0,
		dmd_no: cint(g("dmd_no")) || 0, dmd_weight: flt(g("dmd_weight")) || 0,
		ps_no: cint(g("ps_no")) || 0, ps_weight: flt(g("ps_weight")) || 0,
		cs_no: cint(g("cs_no")) || 0, cs_weight: flt(g("cs_weight")) || 0,
		cvd_no: cint(g("cvd_no")) || 0, cvd_weight: flt(g("cvd_weight")) || 0,
		cz_no: cint(g("cz_no")) || 0, cz_weight: flt(g("cz_weight")) || 0,
		pdmd_no: cint(g("pdmd_no")) || 0, pdmd_weight: flt(g("pdmd_weight")) || 0,
		poth_no: cint(g("poth_no")) || 0, poth_weight: flt(g("poth_weight")) || 0,
		narration: r._remark || undefined,
		bag_bom: (r._materials || []).map((m) => ({ item: m.item, qty: flt(m.qty) || 0, weight: flt(m.weight) || 0 })),
		cad: r._cad || null,
		photos: (r._photos || []).map((p) => p.dataurl),
	};
}

async function placeOrder(page, state, renumber, addRow, $body) {
	const customer = state.header.customer.get_value();
	const salesman = state.header.salesman.get_value();
	const order_type = state.header.order_type.get_value();
	const order_date = state.header.order_date.get_value() || frappe.datetime.get_today();
	const due_date = state.dueFromDays ? state.dueFromDays() : "";
	const customer_date = (state.custFromDays ? state.custFromDays() : "") || due_date; // empty -> copies due date

	if (!customer) {
		frappe.msgprint(__("Pick the Party — every order needs one."));
		return;
	}
	if (!order_type) {
		frappe.msgprint(__("Pick the order Type."));
		return;
	}
	if (!(cint(state.header.days.get_value()) > 0)) {
		frappe.msgprint(__("Days must be more than 0 — the order needs a due date."));
		return;
	}
	if (state.partyBeforeDue && state.partyBeforeDue()) {
		frappe.msgprint(__("The Party Date can't be before the Due Date — give the party at least {0} day(s), or leave it empty to copy the due date.",
			[cint(state.header.days.get_value())]));
		return;
	}

	const all = state.rows.map(po_readLine);
	const lines = all.filter((l) => (l.design || l.cad) && l.qty > 0); // Design/CAD + Qty — the green rows
	const ghosts = all.filter((l) => !l.design && !l.cad && l.qty); // qty typed but neither set
	if (ghosts.length) {
		frappe.msgprint(__("{0} line(s) have a Qty but no Design — add a Design (or set CAD) or clear the Qty.", [ghosts.length]));
		return;
	}
	const noQty = all.filter((l) => (l.design || l.cad) && !(l.qty > 0)).length;
	if (noQty) {
		frappe.msgprint(__("{0} line(s) have no Qty — every line needs at least Qty 1 (red rows won't go in).", [noQty]));
		return;
	}
	if (!lines.length) {
		frappe.msgprint(__("Add at least one line with a Design (or a CAD line)."));
		return;
	}

	frappe.dom.freeze(__("Placing order…"));
	try {
		const jr = await frappe.call({
			method: "jewelima.jewelima.api.create_job_order",
			args: { payload: {
				order_no: state.reservedNo || "",
				order_date: order_date || frappe.datetime.get_today(),
				due_date, customer_date, customer, salesman, order_type,
				followed: state.header.follow && state.header.follow.get_value() ? 1 : 0,
			} },
		});
		const order = { name: jr.message };
		if (state.reservedNo && order.name !== state.reservedNo) {
			frappe.show_alert({ message: __("{0} was recycled meanwhile — placed as {1} instead.", [state.reservedNo, order.name]), indicator: "orange" }, 8);
		}
		state.reservedNo = "";
		let made = 0;
		for (const l of lines) {
			// records are view-only in the desk — bags go through the page API
			const br = await frappe.call({ method: "jewelima.jewelima.api.create_order_bag", args: { payload: {
				job_order: order.name, design: l.design, qty: l.qty || 1,
				size: l.size, gross_weight: l.gross_weight, nett_weight: l.nett_weight, purity: l.purity,
				dmd_no: l.dmd_no, dmd_weight: l.dmd_weight, ps_no: l.ps_no, ps_weight: l.ps_weight,
				cs_no: l.cs_no, cs_weight: l.cs_weight,
				cz_no: l.cz_no, cz_weight: l.cz_weight, cvd_no: l.cvd_no, cvd_weight: l.cvd_weight, pdmd_no: l.pdmd_no, pdmd_weight: l.pdmd_weight,
				poth_no: l.poth_no, poth_weight: l.poth_weight, narration: l.narration,
				bag_bom: l.bag_bom && l.bag_bom.length ? l.bag_bom : undefined,
				...(l.cad ? {
					is_cad: 1, cad_design_type: l.cad.design_type, cad_karat: l.cad.karat,
					cad_gold_weight: l.cad.gold_weight, cad_diamond_weight: l.cad.diamond_weight,
					cad_stone_no: l.cad.stone_no, cad_reference: l.cad.reference, cad_remarks: l.cad.remarks,
					image: l.cad.image || undefined, // the reference photo — the bag's image until the design lands
				} : {}),
			} } });
			const bagDoc = { name: br.message };
			if ((l.photos || []).length && bagDoc && bagDoc.name) {
				await frappe.call({ method: "jewelima.jewelima.api.attach_order_bag_photos",
					args: { order_bag: bagDoc.name, photos: JSON.stringify(l.photos) } });
			}
			made++;
		}
		frappe.dom.unfreeze();
		if (state.activeRequest) {
			// this order fulfils a saved request — stamp it Placed with the order no
			frappe.call({
				method: "jewelima.jewelima.api.mark_order_request_placed",
				args: { name: state.activeRequest, job_order: order.name },
			});
			state.activeRequest = "";
		}
		// claim the next number right away so the following order is ready to write
		frappe.call({ method: "jewelima.jewelima.api.reserve_order_no" }).then((r) => {
			state.reservedNo = r.message || "";
			state.showNo(state.reservedNo);
		});
		frappe.show_alert({ message: __("Placed {0} with {1} card(s).", [order.name, made]), indicator: "green" }, 7);
		frappe.msgprint({
			title: __("Order placed"), indicator: "green",
			message: __("{0} created with {1} Order Bag(s).", [order.name, made]),
			primary_action: {
				label: __("Open job order"),
				action() {
					frappe.route_options = { job_order: order.name };
					frappe.set_route("job-order-status");
				},
			},
		});
		$body.empty();
		state.rows = [];
		addRow();
		renumber();
	} catch (e) {
		frappe.dom.unfreeze();
	}
}

function openNewDesignDialog(state, prefill) {
	// New Design (Place Order): create a type-coded Design Bank card — photo
	// uploads DIRECT (no attach dialog), stones/sieves + notes edited like the
	// Design Review page, born APPROVED, then straight into the variant dialog.
	// "Upgrade photo" (or no photo) sends the card to the Photo Queue.
	const esc = frappe.utils.escape_html;
	let photoB64 = "";
	let SIEVES = [];
	let SIEVE_AVG = {};   // sieve -> avg cts (drives the automatic Diamond Weight)
	// DW follows the sieves; the card preview follows everything (debounced render)
	const recomputeDW = () => { if (d) d.set_value("diamond_weight", jwDwFromSieves(collectStones(), SIEVE_AVG)); };
	let prevSeq = 0;
	const refreshCard = frappe.utils.debounce(() => {
		if (!d) return;
		const v = d.get_values(true) || {};
		const q = ++prevSeq;
		frappe.call({ method: "jewelima.jewelima.api.design_card_preview", freeze: false, args: { payload: JSON.stringify({
			design_no: __("(new)"), design_type: v.design_type || "",
			gross_weight: jwGrossTo18k(v.gross_weight, v.karat, flt(v.diamond_weight)),
			diamond_weight: flt(v.diamond_weight), note: v.note || "",
			photo: photoB64 || "", stones: collectStones(),
		}) } }).then((r) => {
			if (q !== prevSeq) return;
			const img = (r.message || {}).image;
			d.get_field("card_html").$wrapper.html(img
				? `<img src="${img}" style="max-height:420px;max-width:100%;border:1px solid var(--border-color);border-radius:8px;background:#fff;">`
				: "");
		});
	}, 600);
	const touched = () => { recomputeDW(); refreshCard(); };
	const d = new frappe.ui.Dialog({
		title: __("New Design"),
		size: "large",
		fields: [
			{ fieldname: "design_type", fieldtype: "Select", label: __("Design Type"), reqd: 1,
				description: __("names the card by the type's bank code (e.g. JC-5)"),
				default: prefill && prefill.design_type },
			{ fieldname: "cb1", fieldtype: "Column Break" },
			{ fieldname: "karat", fieldtype: "Select", label: __("Weighed at (karat)"), options: "18K\n22K\n14K", default: "18K",
				description: __("the card stores an 18K gross — pick how you weighed it") },
			{ fieldname: "gross_weight", fieldtype: "Float", label: __("Gross Weight (g)"), reqd: 1 },
			{ fieldname: "diamond_weight", fieldtype: "Float", label: __("Diamond Weight (ct)"), read_only: 1,
				description: __("auto — average from the sieves below") },
			{ fieldname: "note", fieldtype: "Data", label: __("Note") },
			{ fieldname: "sec_st", fieldtype: "Section Break", label: __("Stones / Sieves") },
			{ fieldname: "stones_html", fieldtype: "HTML" },
			{ fieldname: "sec_ph", fieldtype: "Section Break", label: __("Product photo") },
			{ fieldname: "photo_html", fieldtype: "HTML" },
			{ fieldname: "upgrade", fieldtype: "Check", label: __("Upgrade photo later — send to Photo Queue") },
			{ fieldname: "sec_prev", fieldtype: "Section Break", label: __("Card preview") },
			{ fieldname: "card_html", fieldtype: "HTML" },
		],
		primary_action_label: __("Create → Add Variant"),
		primary_action(v) {
			if (!v.design_type) return frappe.msgprint(__("Pick the Design Type."));
			if (flt(v.gross_weight) <= 0) return frappe.msgprint(__("Enter the gross weight."));
			const stones = collectStones();
			const dw = jwDwFromSieves(stones, SIEVE_AVG);            // DW = sieve average
			const gw18 = jwGrossTo18k(v.gross_weight, v.karat, dw);  // the card stores 18K
			frappe.dom.freeze(__("Creating design…"));
			frappe.call({ method: "jewelima.jewelima.api.create_new_design_full", args: {
				design_type: v.design_type, gross_weight: gw18,
				diamond_weight: dw, note: v.note || "",
				stones: JSON.stringify(stones), photo: photoB64 || "",
				upgrade_photo: v.upgrade ? 1 : 0,
			} }).then((r) => {
				frappe.dom.unfreeze();
				const res = r.message || {};
				if (!res.name) return;
				d.hide();
				frappe.show_alert({ message: res.needs_photo
					? __("{0} created (Approved) — its photo waits in the Photo Queue.", [res.design_no])
					: __("{0} created (Approved).", [res.design_no]), indicator: "green" }, 6);
				let row = (prefill && prefill.row) || state.rows.find((rr) => !rr.f.design.get());
				if (!row) row = state.addRow();
				state.openVariantCreate(row, res.name);
			}).catch(() => frappe.dom.unfreeze());
		},
	});

	// ---- stones/sieves editor (same rows as Design Review) ------------------
	function paintStones(rows) {
		d.get_field("stones_html").$wrapper.find(".nd-stones").html((rows && rows.length ? rows : [{}]).map((r) => `
			<tr><td><select class="v"><option value=""></option>
				${SIEVES.map((sv) => `<option ${r.sieve === sv ? "selected" : ""}>${esc(sv)}</option>`).join("")}
				${r.sieve && !SIEVES.includes(r.sieve) ? `<option selected>${esc(r.sieve)}</option>` : ""}
			</select></td>
			<td><input class="p" type="number" min="0" value="${r.pcs || ""}"></td>
			<td class="del" style="cursor:pointer;color:#b02a2a;font-weight:800;">&times;</td></tr>`).join(""));
	}
	function collectStones() {
		return d.get_field("stones_html").$wrapper.find(".nd-stones tr").map(function () {
			return { stone: "", sieve: $(this).find(".v").val(),
				pcs: Math.max(0, cint($(this).find(".p").val())), ct: 0 };
		}).get().filter((r) => r.sieve || r.pcs);
	}

	d.get_field("stones_html").$wrapper.html(`
		<style>
		.nd-stbl{width:100%;border-collapse:collapse;font-size:12.5px;}
		.nd-stbl th{text-align:left;font-size:10px;text-transform:uppercase;color:var(--text-muted);padding:2px 6px;border-bottom:1px solid var(--border-color);}
		.nd-stbl td{padding:2px 4px;}
		.nd-stbl input,.nd-stbl select{width:100%;box-sizing:border-box;border:1px solid var(--border-color);border-radius:5px;padding:3px 6px;font-size:12px;background:var(--fg-color);color:var(--text-color);}
		.nd-addst{color:#1f618d;font-weight:700;cursor:pointer;font-size:12px;display:inline-block;margin-top:6px;}
		</style>
		<table class="nd-stbl"><thead><tr><th>${__("Sieve")}</th><th>${__("Pcs")}</th><th></th></tr></thead>
		<tbody class="nd-stones"></tbody></table>
		<span class="nd-addst">+ ${__("row")}</span>`);
	d.get_field("stones_html").$wrapper.on("click", ".nd-addst", () => { const r = collectStones(); r.push({}); paintStones(r); });
	d.get_field("stones_html").$wrapper.on("click", ".del", function () { $(this).closest("tr").remove(); touched(); });
	d.get_field("stones_html").$wrapper.on("change", ".v", touched);
	d.get_field("stones_html").$wrapper.on("input", ".p", touched);
	paintStones([{}]);

	// ---- direct photo upload (no attach dialog) -----------------------------
	d.get_field("photo_html").$wrapper.html(`
		<button class="btn btn-default btn-sm nd-up">${__("Upload product photo")}</button>
		<input type="file" class="nd-file" accept="image/*" style="display:none;">
		<span class="nd-name" style="font-size:11.5px;color:var(--text-muted);margin-left:8px;">${__("optional")}</span>
		<div class="nd-prev" style="margin-top:8px;"></div>`);
	const $ph = d.get_field("photo_html").$wrapper;
	$ph.on("click", ".nd-up", () => $ph.find(".nd-file").get(0).click());
	$ph.on("change", ".nd-file", function () {
		const file = this.files[0];
		if (!file) return;
		const rd = new FileReader();
		rd.onload = () => {
			photoB64 = rd.result;
			$ph.find(".nd-name").text(file.name);
			$ph.find(".nd-prev").html(`<img src="${photoB64}" style="max-height:180px;max-width:100%;border-radius:8px;border:1px solid var(--border-color);">`);
			refreshCard();
		};
		rd.readAsDataURL(file);
	});

	frappe.call({ method: "jewelima.jewelima.api.get_sieve_chart", freeze: false })
		.then((r) => {
			const rows = r.message || [];
			SIEVES = rows.map((x) => x.sieve_size).filter(Boolean);
			SIEVE_AVG = {};
			rows.forEach((x) => { if (x.sieve_size) SIEVE_AVG[x.sieve_size] = flt(x.avg_cts); });
			paintStones(collectStones());
			touched();
		});

	// header fields feed the live card preview (and the karat feeds the 18K figure)
	["design_type", "karat", "gross_weight", "note"].forEach((fn) => {
		const f = d.get_field(fn);
		if (f && f.$input) f.$input.on("change input", () => touched());
	});
	// load every Design Type up front so the dropdown lists them all (no searching)
	frappe.db.get_list("Design Type", { fields: ["name"], order_by: "name", limit: 0 }).then((rows) => {
		d.set_df_property("design_type", "options", [""].concat((rows || []).map((x) => x.name)).join("\n"));
		const pre = prefill && prefill.design_type;
		if (pre) d.set_value("design_type", pre);
	});

	d.show();
}

// OLD Design (Place Order): search a PENDING bank design, see all its photos,
// review the values (type / weights / stones), then Approve → straight into the
// Create Variant dialog and onto the order line. Mirrors the Design Review page.
function openOldDesignDialog(state) {
	const API = "jewelima.jewelima.design_bank_api";
	const esc = frappe.utils.escape_html;
	let cur = null;    // loaded review card
	let photoB64 = ""; // optional replacement product photo
	let SIEVES = [];
	let SIEVE_AVG = {}; // sieve size -> avg cts/stone (for the auto Diamond Weight)
	const recomputeDW = () => { if (d) d.set_value("diamond_weight", jwDwFromSieves(collectStones(), SIEVE_AVG)); };

	const d = new frappe.ui.Dialog({
		title: __("OLD Design — review & approve"),
		size: "extra-large",
		fields: [
			{ fieldname: "pick", fieldtype: "Link", label: __("Pending Design"), options: "Design Bank", reqd: 1,
				only_select: 1, get_query: () => ({ filters: { status: "Pending" } }),
				description: __("search a pending design by its number"),
				onchange: () => loadCard(d.get_value("pick")) },
			{ fieldname: "cb0", fieldtype: "Column Break" },
			{ fieldname: "status_html", fieldtype: "HTML" },
			{ fieldname: "sec_ph", fieldtype: "Section Break", label: __("Photos") },
			{ fieldname: "photos_html", fieldtype: "HTML" },
			{ fieldname: "sec_dt", fieldtype: "Section Break", label: __("Details") },
			{ fieldname: "design_type", fieldtype: "Select", label: __("Design Type"), reqd: 1,
				description: __("needed to approve") },
			{ fieldname: "cb1", fieldtype: "Column Break" },
			{ fieldname: "karat", fieldtype: "Select", label: __("Weighed at (karat)"), options: "18K\n22K\n14K", default: "18K",
				description: __("the gross is stored as an 18K figure — pick how you weighed it") },
			{ fieldname: "gross_weight", fieldtype: "Float", label: __("Gross Weight (g)") },
			{ fieldname: "diamond_weight", fieldtype: "Float", label: __("Diamond Weight (ct)"), read_only: 1,
				description: __("auto — average from the DMD sieves below") },
			{ fieldname: "note", fieldtype: "Data", label: __("Note") },
			{ fieldname: "tag_photo_update", fieldtype: "Check", label: __("Tag for photo update → Photo Urgent (needs a better photo)") },
			{ fieldname: "sec_st", fieldtype: "Section Break", label: __("Stones / Sieves") },
			{ fieldname: "stones_html", fieldtype: "HTML" },
			{ fieldname: "sec_up", fieldtype: "Section Break", label: __("Replace product photo (optional)") },
			{ fieldname: "photo_html", fieldtype: "HTML" },
		],
		primary_action_label: __("Approve → Add Variant"),
		primary_action() {
			if (!cur) return frappe.msgprint(__("Pick a pending design first."));
			const v = d.get_values(true) || {};
			if (!v.design_type) return frappe.msgprint(__("Pick the Design Type to approve."));
			const dw = jwDwFromSieves(collectStones(), SIEVE_AVG);       // DW = DMD sieve average
			const gw18 = jwGrossTo18k(v.gross_weight, v.karat, dw);      // store the 18K figure
			const payload = {
				name: cur.name, design_no: cur.design_no, design_type: v.design_type,
				gross_weight: gw18, diamond_weight: dw,
				note: v.note || "", extra_lines: cur.extra_lines,
				stones: collectStones(), photo: photoB64 || cur.photo,
				photoupdate: (v.tag_photo_update || cur.photoupdate) ? 1 : 0,
				customer_image_needed: cur.customer_image_needed ? 1 : 0,
				delete_raw: 0, approve: 1, retire: 0,
			};
			frappe.dom.freeze(__("Approving…"));
			frappe.call({ method: API + ".review_save", args: { payload: JSON.stringify(payload) } })
				.then(() => {
					frappe.dom.unfreeze();
					d.hide();
					frappe.show_alert({ message: __("{0} approved — pick the variant.", [cur.design_no]), indicator: "green" }, 5);
					let row = state.rows.find((rr) => !rr.f.design.get());
					if (!row) row = state.addRow();
					state.openVariantCreate(row, cur.name);
				})
				.catch(() => frappe.dom.unfreeze());
		},
	});

	// ---- photos (raw · card · product · customer) ---------------------------
	const bust = (u) => (u && !u.startsWith("data:") ? u + (u.includes("?") ? "&" : "?") + "m=" + Date.now() : u);
	function paintPhotos() {
		const cell = (t, u) => `<div class="od-im"><div class="t">${t}</div>${u
			? `<img src="${esc(bust(u))}">` : `<div class="none">—</div>`}</div>`;
		d.get_field("photos_html").$wrapper.html(`
			<style>
			.od-grid{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;}
			.od-im{border:1px solid var(--border-color);border-radius:8px;background:#fff;overflow:hidden;}
			.od-im .t{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);padding:4px 8px;background:var(--control-bg);}
			.od-im img{width:100%;height:240px;object-fit:contain;display:block;}
			.od-im .none{height:240px;display:flex;align-items:center;justify-content:center;color:#bbb;}
			</style>
			<div class="od-grid">
				${cell(__("Raw (scan)"), cur && cur.raw_image)}
				${cell(__("Card — info"), cur && cur.image)}
				${cell(__("Product — print"), photoB64 || (cur && cur.photo))}
				${cell(__("Customer"), cur && cur.customer_image)}
			</div>`);
	}

	// ---- stones/sieves (sieve + pcs) ---------------------------------------
	function paintStones(rows) {
		d.get_field("stones_html").$wrapper.find(".od-stones").html((rows && rows.length ? rows : [{}]).map((r) => `
			<tr><td><select class="v"><option value=""></option>
				${SIEVES.map((sv) => `<option ${r.sieve === sv ? "selected" : ""}>${esc(sv)}</option>`).join("")}
				${r.sieve && !SIEVES.includes(r.sieve) ? `<option selected>${esc(r.sieve)}</option>` : ""}
			</select></td>
			<td><input class="p" type="number" min="0" value="${r.pcs || ""}"></td>
			<td class="del" style="cursor:pointer;color:#b02a2a;font-weight:800;">&times;</td></tr>`).join(""));
	}
	function collectStones() {
		return d.get_field("stones_html").$wrapper.find(".od-stones tr").map(function () {
			return { stone: "", sieve: $(this).find(".v").val(),
				pcs: Math.max(0, cint($(this).find(".p").val())), ct: 0 };
		}).get().filter((r) => r.sieve || r.pcs);
	}
	d.get_field("stones_html").$wrapper.html(`
		<style>
		.od-stbl{width:100%;border-collapse:collapse;font-size:12.5px;}
		.od-stbl th{text-align:left;font-size:10px;text-transform:uppercase;color:var(--text-muted);padding:2px 6px;border-bottom:1px solid var(--border-color);}
		.od-stbl td{padding:2px 4px;}
		.od-stbl input,.od-stbl select{width:100%;box-sizing:border-box;border:1px solid var(--border-color);border-radius:5px;padding:3px 6px;font-size:12px;background:var(--fg-color);color:var(--text-color);}
		.od-addst{color:#1f618d;font-weight:700;cursor:pointer;font-size:12px;display:inline-block;margin-top:6px;}
		</style>
		<table class="od-stbl"><thead><tr><th>${__("Sieve")}</th><th>${__("Pcs")}</th><th></th></tr></thead>
		<tbody class="od-stones"></tbody></table>
		<span class="od-addst">+ ${__("row")}</span>`);
	d.get_field("stones_html").$wrapper.on("click", ".od-addst", () => { const r = collectStones(); r.push({}); paintStones(r); });
	d.get_field("stones_html").$wrapper.on("click", ".del", function () { $(this).closest("tr").remove(); recomputeDW(); });
	d.get_field("stones_html").$wrapper.on("change", ".v", recomputeDW);
	d.get_field("stones_html").$wrapper.on("input", ".p", recomputeDW);

	// ---- optional product-photo replace ------------------------------------
	d.get_field("photo_html").$wrapper.html(`
		<button class="btn btn-default btn-sm od-up">${__("Upload replacement photo")}</button>
		<input type="file" class="od-file" accept="image/*" style="display:none;">
		<span class="od-name" style="font-size:11.5px;color:var(--text-muted);margin-left:8px;">${__("keeps the existing photo if left blank")}</span>`);
	const $ph = d.get_field("photo_html").$wrapper;
	$ph.on("click", ".od-up", () => $ph.find(".od-file").get(0).click());
	$ph.on("change", ".od-file", function () {
		const file = this.files[0];
		if (!file) return;
		const rd = new FileReader();
		rd.onload = () => { photoB64 = rd.result; $ph.find(".od-name").text(file.name); paintPhotos(); };
		rd.readAsDataURL(file);
	});

	// ---- load a picked pending design --------------------------------------
	function loadCard(name) {
		if (!name) return;
		frappe.db.get_value("Design Bank", name, "design_no").then((r) => {
			const dno = (r.message || {}).design_no || name;
			frappe.call({ method: API + ".get_review_card", args: { q: dno } }).then((rr) => {
				cur = (rr.message || {}).card || null;
				if (!cur) return frappe.msgprint(__("Could not load that design."));
				photoB64 = "";
				d.get_field("status_html").$wrapper.html(
					`<div style="font-size:12.5px;color:var(--text-muted);">${esc(cur.design_no)} · ${esc(cur.status || "")}${cur.priority ? " · P" + cur.priority : ""}</div>`);
				d.set_value("design_type", cur.design_type || "");
				d.set_value("karat", "18K");                 // the stored gross IS 18K
				d.set_value("gross_weight", cur.gross_weight || 0);
				d.set_value("note", cur.note || "");
				paintPhotos();
				paintStones(cur.stones || []);
				recomputeDW();                                // DW = average from the sieves
			});
		});
	}

	paintPhotos();
	paintStones([{}]);
	frappe.call({ method: "jewelima.jewelima.api.get_sieve_chart", freeze: false })
		.then((r) => {
			const rows = r.message || [];
			SIEVES = rows.map((x) => x.sieve_size).filter(Boolean);
			SIEVE_AVG = {};
			rows.forEach((x) => { if (x.sieve_size) SIEVE_AVG[x.sieve_size] = flt(x.avg_cts); });
			paintStones(cur ? cur.stones : collectStones());
			recomputeDW();
		});
	frappe.db.get_list("Design Type", { fields: ["name"], order_by: "name", limit: 0 }).then((rows) => {
		d.set_df_property("design_type", "options", [""].concat((rows || []).map((x) => x.name)).join("\n"));
		if (cur) d.set_value("design_type", cur.design_type || "");
	});

	d.show();
}

};
