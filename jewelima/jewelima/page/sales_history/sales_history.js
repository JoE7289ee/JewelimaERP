// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Sales History (Delivery > Delivery Records) — every parcel that went out on a sale.
//
// The parcel side of a sale: which parcel it was, in what format, how many
// pieces, to whom, on which bill, and whether it has been cleared off the
// Prepare to Sell tiles. The money is on Sales Records, and a bill number here
// opens it there. Every sold parcel is listed whether or not it has been cleared,
// so one nobody got round to clearing is never missing. Read only.
// Route: /app/sales-history

frappe.pages["sales-history"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Sales History"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const cint = (v) => parseInt(v, 10) || 0;
	const money = (v) => "₹" + flt(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });
	const root = $(page.main);
	let DATA = { rows: [], totals: {} };
	let ONLY = "";   // "" = all, "tiles" = still on the Prepare to Sell tiles, "cleared"

	root.append(`
		<style>
		#page-sales-history .container{max-width:100%;}
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
		td.dr-id a{color:inherit;cursor:pointer;}
		.dr-when{font-size:11px;color:var(--text-muted);}
		.dr-tag{display:inline-block;font-size:9.5px;font-weight:800;letter-spacing:.05em;
			border-radius:20px;padding:2px 9px;text-transform:uppercase;}
		.dr-tag.fmt{background:var(--control-bg);color:var(--text-muted);}
		.dr-tag.tiles{background:rgba(224,168,0,.18);color:#8a6508;}
		.dr-tag.cleared{background:rgba(29,122,51,.16);color:#1d7a33;}
		[data-theme="dark"] .dr-tag.tiles{color:#e8b84a;}
		[data-theme="dark"] .dr-tag.cleared{color:#7fc98f;}
		.dr-empty{padding:44px;text-align:center;color:var(--text-muted);font-size:13px;}
		</style>
		<div class="dr-bar">
			<div class="dr-f f-from"></div>
			<div class="dr-f f-to"></div>
			<div class="dr-f q f-q"></div>
			<div class="dr-chips">
				<span class="dr-c on" data-o="">${__("All")}</span>
				<span class="dr-c" data-o="tiles">${__("Still on the tiles")}</span>
				<span class="dr-c" data-o="cleared">${__("Cleared")}</span>
			</div>
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
		return frappe.call({ method: API + ".get_sales_history", freeze: false, args: {
			from_date: F.from.get_value() || undefined,
			to_date: F.to.get_value() || undefined,
			search: (F.q.get_value() || "").trim() || undefined,
		} }).then((r) => { DATA = r.message || DATA; paint(); });
	}

	function paint() {
		const t = DATA.totals || {};
		const rows = (DATA.rows || []).filter((r) => !ONLY
			|| (ONLY === "tiles" && !cint(r.cleared)) || (ONLY === "cleared" && cint(r.cleared)));
		root.find(".dr-kpis").html(`
			<div class="dr-kpi"><div class="k">${__("Parcels sold")}</div><div class="v">${t.parcels || 0}</div>
				<div class="sub">${esc(DATA.from_date || "")} → ${esc(DATA.to_date || "")}</div></div>
			<div class="dr-kpi"><div class="k">${__("Pieces")}</div><div class="v">${t.pieces || 0}</div>
				<div class="sub">${__("across those parcels")}</div></div>
			<div class="dr-kpi"><div class="k">${__("Sold for")}</div><div class="v">${money(t.value)}</div>
				<div class="sub">${__("the bills' totals")}</div></div>
			<div class="dr-kpi"><div class="k">${__("Still on the tiles")}</div><div class="v">${t.on_tiles || 0}</div>
				<div class="sub">${__("sold, not yet cleared")}</div></div>`);
		root.find(".dr-t thead").html(`<tr>
			<th>${__("Parcel")}</th><th>${__("Buyer")}</th><th>${__("Format")}</th>
			<th class="num">${__("Pieces")}</th><th>${__("Bill")}</th><th>${__("Sold on")}</th>
			<th class="num">${__("Sold for")}</th><th>${__("Made by")}</th><th>${__("Board")}</th></tr>`);
		root.find(".dr-t tbody").html(rows.length ? rows.map((r) => `
			<tr>
				<td class="dr-id">${esc(r.name)}</td>
				<td><b>${esc(r.customer || "—")}</b></td>
				<td><span class="dr-tag fmt">${esc(r.source === "prepare" ? (r.fmt || "DEFAULT") : __("Sell board"))}</span></td>
				<td class="num">${cint(r.pieces)}</td>
				<td class="dr-id"><a class="dr-sale" data-s="${esc(r.sale)}">${esc(r.sale)}</a></td>
				<td class="dr-when">${esc(r.sale_date || "")}</td>
				<td class="num">${money(r.sale_total)}</td>
				<td class="dr-when">${esc(r.made_by || "")}</td>
				<td>${cint(r.cleared)
					? `<span class="dr-tag cleared">${__("Cleared")}</span>
						<div class="dr-when">${esc((r.cleared_on || "").slice(0, 16))} · ${esc(r.cleared_by_name || "")}</div>`
					: `<span class="dr-tag tiles">${__("On the tiles")}</span>`}</td>
			</tr>`).join("")
			: `<tr><td colspan="9" class="dr-empty">${
				__("Nothing sold in this period. Widen the dates, or clear the search.")}</td></tr>`);
	}

	root.on("click", ".dr-c", function () {
		root.find(".dr-c").removeClass("on");
		this.classList.add("on");
		ONLY = $(this).data("o") || "";
		paint();
	});
	root.on("click", ".dr-sale", function () {
		frappe.route_options = { sale: $(this).data("s") };
		frappe.set_route("sales-records");
	});

	page.set_secondary_action(__("Refresh"), load, "refresh");
	load();
	this.page = page;
};
