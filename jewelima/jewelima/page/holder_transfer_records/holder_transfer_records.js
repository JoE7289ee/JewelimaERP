// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Transfer Holder Records (Delivery > Delivery Records) — whose piece it stopped being, and when.
//
// One line per move, newest first: the piece, where it went from and to, when,
// and who did it. Read only.
// Route: /app/holder-transfer-records

frappe.pages["holder-transfer-records"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Transfer Holder Records"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const root = $(page.main);
	let DATA = { rows: [], totals: {} }, KIND = "";

	root.append(`
		<style>
		#page-holder-transfer-records .container{max-width:100%;}
		.dr-bar{display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin-bottom:13px;
			border:1px solid var(--border-color);border-radius:13px;padding:12px 15px;background:var(--fg-color);}
		.dr-f{min-width:150px;} .dr-f.q{min-width:230px;}
		.dr-bar .control-label{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);}
		.dr-bar .help-box{display:none !important;}
		.dr-chips{display:flex;gap:6px;flex-wrap:wrap;margin-left:auto;align-items:center;}
		.dr-c{border:1px solid var(--border-color);background:var(--fg-color);border-radius:20px;
			padding:5px 15px;font-size:12.5px;cursor:pointer;color:var(--text-color);}
		.dr-c.on{background:#1f618d;color:#fff;border-color:#1f618d;font-weight:700;}
		.dr-kpis{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:13px;}
		.dr-kpi{flex:1 1 140px;border:1px solid var(--border-color);border-radius:13px;
			padding:10px 15px;background:var(--fg-color);}
		.dr-kpi .k{font-size:9.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);font-weight:700;}
		.dr-kpi .v{font-size:23px;font-weight:800;line-height:1.2;font-variant-numeric:tabular-nums;letter-spacing:-.02em;}
		.dr-kpi .v .u{font-size:11px;font-weight:600;color:var(--text-muted);margin-left:2px;}
		.dr-kpi .sub{font-size:10.5px;color:var(--text-muted);}
		.dr-box{border:1px solid var(--border-color);border-radius:14px;overflow:hidden;background:var(--fg-color);}
		.dr-scroll{overflow:auto;max-height:calc(100vh - 330px);}
		table.dr-t{width:100%;border-collapse:separate;border-spacing:0;font-size:12.5px;}
		table.dr-t th{position:sticky;top:0;z-index:2;background:var(--control-bg,var(--fg-color));
			border-bottom:1px solid var(--border-color);padding:9px 12px;text-align:left;
			font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);}
		table.dr-t td{border-bottom:1px solid var(--border-color);padding:8px 12px;vertical-align:middle;}
		table.dr-t tbody tr:last-child td{border-bottom:none;}
		table.dr-t tbody tr:hover td{background:rgba(31,97,141,.04);}
		table.dr-t th.num,table.dr-t td.num{text-align:right;font-variant-numeric:tabular-nums;}
		td.dr-id{font-family:var(--font-family-monospace,monospace);font-weight:700;}
		td.dr-id a{color:inherit;}
		.dr-when{font-size:11px;color:var(--text-muted);}
		.dr-tag{display:inline-block;font-size:9.5px;font-weight:800;letter-spacing:.05em;
			border-radius:20px;padding:2px 9px;text-transform:uppercase;}
		.dr-tag.prepared{background:rgba(184,134,11,.18);color:#8a6508;}
		.dr-tag.sent{background:rgba(31,97,141,.16);color:#1f618d;}
		.dr-tag.received,.dr-tag.collected{background:rgba(29,122,51,.16);color:#1d7a33;}
		.dr-tag.cancelled{background:rgba(127,140,141,.16);color:var(--text-muted);}
		.dr-tag.holder{background:rgba(31,97,141,.16);color:#1f618d;}
		.dr-tag.bucket{background:rgba(122,79,181,.16);color:#7a4fb5;}
		.dr-tag.rework{background:rgba(176,42,42,.14);color:#b02a2a;}
		[data-theme="dark"] .dr-tag.prepared{color:#e8b84a;}
		[data-theme="dark"] .dr-tag.received,[data-theme="dark"] .dr-tag.collected{color:#7fc98f;}
		[data-theme="dark"] .dr-tag.rework{color:#e08a8a;}
		.dr-arrow{color:var(--text-muted);margin:0 5px;}
		.dr-empty{padding:44px;text-align:center;color:var(--text-muted);font-size:13px;}
		.dr-open{cursor:pointer;}
		</style>
		<div class="dr-bar">
			<div class="dr-f f-from"></div>
			<div class="dr-f f-to"></div>
			<div class="dr-f q f-q"></div>
			<div class="dr-chips"></div>
		</div>
		<div class="dr-kpis"></div>
		<div class="dr-box"><div class="dr-scroll">
			<table class="dr-t"><thead></thead><tbody></tbody></table>
		</div></div>`);

	const mk = (sel, df) => {
		const c = frappe.ui.form.make_control({ df, parent: root.find(sel).get(0), render_input: true });
		c.refresh();
		return c;
	};
	const F = {};
	F.from = mk(".f-from", { fieldtype: "Date", label: __("From"), fieldname: "from_date", change: () => load() });
	F.to = mk(".f-to", { fieldtype: "Date", label: __("To"), fieldname: "to_date", change: () => load() });
	F.q = mk(".f-q", { fieldtype: "Data", label: __("Search"), fieldname: "q",
		change: frappe.utils.debounce(() => load(), 350) });


	function load() {
		return frappe.call({ method: API + ".get_holder_transfer_records", freeze: false, args: {
			from_date: F.from.get_value() || undefined,
			to_date: F.to.get_value() || undefined,
			search: (F.q.get_value() || "").trim() || undefined,
		} }).then((r) => { DATA = r.message || DATA; paint(); });
	}

	function paint() {
		const t = DATA.totals || {};
		root.find(".dr-kpis").html(`
			<div class="dr-kpi"><div class="k">${__("Moves")}</div><div class="v">${t.moves || 0}</div>
				<div class="sub">${esc(DATA.from_date || "")} → ${esc(DATA.to_date || "")}</div></div>
			<div class="dr-kpi"><div class="k">${__("Pieces")}</div><div class="v">${t.pieces || 0}</div>
				<div class="sub">${__("distinct cards")}</div></div>
			<div class="dr-kpi"><div class="k">${__("Gross moved")}</div>
				<div class="v">${flt(t.gross).toFixed(3)}<span class="u">g</span></div>
				<div class="sub">${__("of the pieces on this list")}</div></div>
			`);
		root.find(".dr-t thead").html(`<tr>
			<th>${__("Piece")}</th><th>${__("Design")}</th>
			<th>${__("From")}</th><th>${__("To")}</th>
			<th class="num">${__("Gross g")}</th><th>${__("When")}</th>
			<th>${__("By")}</th><th>${__("Note")}</th></tr>`);
		root.find(".dr-t tbody").html((DATA.rows || []).length ? DATA.rows.map((r) => `
			<tr>
				<td class="dr-id"><a href="/app/card-info?bag=${encodeURIComponent(r.order_bag)}"
					>${esc(r.order_bag)}</a></td>
				<td>${esc(r.design_no || r.design || "—")}</td>
				<td>${esc(r.from_holder || "—")}</td>
				<td><b>${esc(r.to_holder || "—")}</b></td>
				<td class="num">${flt(r.gross).toFixed(3)}</td>
				<td class="dr-when">${esc((r.transfer_time || "").slice(0, 16))}</td>
				<td class="dr-when">${esc(r.by_label || "")}</td>
				<td class="dr-when">${esc(r.reason || "")}</td>
			</tr>`).join("")
			: `<tr><td colspan="8" class="dr-empty">${
				__("Nothing in this period. Widen the dates, or clear the search.")}</td></tr>`);
	}

	page.set_secondary_action(__("Refresh"), load, "refresh");
	load();
	this.page = page;
};
