// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Sales History (Delivery > Delivery Records) — every sale, read back.
//
// One line per sale: when, to whom, the bill, what it came to, how many pieces
// went off-chart, and — when it came from a parcel — which parcel, in what
// format, and whether it has been cleared off the Prepare to Sell tiles. A sale
// made straight on Sell is a line too.
//
// Opening a line shows the sale as it was sold: the pieces with their value
// split, and on any piece priced by hand, what the chart said beside what it
// sold for. This replaces Sales Records. Read only.
// Route: /app/sales-history  (route_options: {sale} opens that sale)

frappe.pages["sales-history"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Sales History"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const cint = (v) => parseInt(v, 10) || 0;
	const money = (v) => "₹" + flt(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });
	const money2 = (v) => "₹ " + flt(v).toLocaleString("en-IN", { maximumFractionDigits: 2 });
	const root = $(page.main);
	let DATA = { rows: [], totals: {} };
	let ONLY = "";

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
		.dr-kpi.warn .v{color:#b45309;}
		.dr-box{border:1px solid var(--border-color);border-radius:14px;overflow:hidden;background:var(--fg-color);}
		.dr-scroll{overflow:auto;max-height:calc(100vh - 330px);}
		table.dr-t{width:100%;border-collapse:separate;border-spacing:0;font-size:12.5px;}
		table.dr-t th{position:sticky;top:0;z-index:2;background:var(--control-bg,var(--fg-color));
			border-bottom:1px solid var(--border-color);padding:9px 12px;text-align:left;
			font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);}
		table.dr-t td{border-bottom:1px solid var(--border-color);padding:8px 12px;vertical-align:middle;}
		table.dr-t tbody tr{cursor:pointer;}
		table.dr-t tbody tr:last-child td{border-bottom:none;}
		table.dr-t tbody tr:hover td{background:rgba(31,97,141,.05);}
		table.dr-t th.num,table.dr-t td.num{text-align:right;font-variant-numeric:tabular-nums;}
		td.dr-id{font-family:var(--font-family-monospace,monospace);font-weight:700;}
		.dr-when{font-size:11px;color:var(--text-muted);}
		.dr-tag{display:inline-block;font-size:9.5px;font-weight:800;letter-spacing:.05em;
			border-radius:20px;padding:2px 9px;text-transform:uppercase;white-space:nowrap;}
		.dr-tag.fmt{background:var(--control-bg);color:var(--text-muted);}
		.dr-tag.tiles{background:rgba(224,168,0,.18);color:#8a6508;}
		.dr-tag.cleared{background:rgba(29,122,51,.16);color:#1d7a33;}
		.dr-tag.off{background:rgba(180,83,9,.15);color:#b45309;}
		[data-theme="dark"] .dr-tag.tiles{color:#e8b84a;}
		[data-theme="dark"] .dr-tag.cleared{color:#7fc98f;}
		[data-theme="dark"] .dr-tag.off{color:#e8a24a;}
		.dr-empty{padding:44px;text-align:center;color:var(--text-muted);font-size:13px;}

		/* one sale, opened */
		.sr-meta{font-size:13px;color:var(--text-muted);margin:0 0 14px;line-height:1.8;}
		.sr-meta b{color:var(--text-color);}
		.sr-tiles{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;}
		.sr-t{border:1px solid var(--border-color);border-radius:9px;padding:7px 16px;background:var(--control-bg);}
		.sr-t .k{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;}
		.sr-t .v{font-size:15px;font-weight:800;font-variant-numeric:tabular-nums;}
		.sr-t.grand{border-width:2px;background:var(--fg-color);}
		.sr-t.grand .v{font-size:18px;color:#1f618d;}
		.sr-sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin:0 0 6px;}
		table.sr-items{width:100%;border-collapse:collapse;font-size:12.5px;background:var(--fg-color);}
		table.sr-items th{background:var(--control-bg);font-size:10px;text-transform:uppercase;letter-spacing:.04em;
			color:var(--text-muted);padding:5px 10px;border:1px solid var(--border-color);text-align:left;}
		table.sr-items th.num,table.sr-items td.num{text-align:right;}
		table.sr-items td{border:1px solid var(--border-color);padding:5px 10px;font-variant-numeric:tabular-nums;vertical-align:top;}
		.sr-lnk{font-family:var(--font-family-monospace,monospace);font-weight:700;cursor:pointer;color:#1f618d;}
		.sr-ov td{background:#fff8e6;}
		[data-theme="dark"] .sr-ov td{background:rgba(180,83,9,.12);}
		.sr-ovnote{font-size:11.5px;color:#8a6d00;background:#fff3cd;border-radius:6px;padding:2px 8px;display:inline-block;margin-top:3px;}
		[data-theme="dark"] .sr-ovnote{background:rgba(180,83,9,.2);color:#e8b84a;}
		</style>
		<div class="dr-bar">
			<div class="dr-f f-from"></div>
			<div class="dr-f f-to"></div>
			<div class="dr-f q f-q"></div>
			<div class="dr-chips">
				<span class="dr-c on" data-o="">${__("All")}</span>
				<span class="dr-c" data-o="off">${__("Off-chart")}</span>
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
		placeholder: __("bill, buyer, parcel or bag"),
		change: frappe.utils.debounce(() => load(), 350) });

	function load() {
		return frappe.call({ method: API + ".get_sales_history", freeze: false, args: {
			from_date: F.from.get_value() || undefined,
			to_date: F.to.get_value() || undefined,
			search: (F.q.get_value() || "").trim() || undefined,
		} }).then((r) => { DATA = r.message || DATA; paint(); });
	}

	function keep(r) {
		if (ONLY === "off") return cint(r.off_chart) > 0;
		if (ONLY === "tiles") return !!r.parcel && !cint(r.cleared);
		if (ONLY === "cleared") return !!r.parcel && !!cint(r.cleared);
		return true;
	}

	function paint() {
		const t = DATA.totals || {};
		const rows = (DATA.rows || []).filter(keep);
		root.find(".dr-kpis").html(`
			<div class="dr-kpi"><div class="k">${__("Sales")}</div><div class="v">${t.sales || 0}</div>
				<div class="sub">${esc(DATA.from_date || "")} → ${esc(DATA.to_date || "")}</div></div>
			<div class="dr-kpi"><div class="k">${__("Pieces")}</div><div class="v">${t.pieces || 0}</div>
				<div class="sub">${__("sold in the period")}</div></div>
			<div class="dr-kpi"><div class="k">${__("Sold for")}</div><div class="v">${money(t.value)}</div>
				<div class="sub">${__("the bills' totals")}</div></div>
			<div class="dr-kpi ${t.off_chart ? "warn" : ""}"><div class="k">${__("Off-chart pieces")}</div>
				<div class="v">${t.off_chart || 0}</div><div class="sub">${__("priced by hand")}</div></div>
			<div class="dr-kpi"><div class="k">${__("Still on the tiles")}</div><div class="v">${t.on_tiles || 0}</div>
				<div class="sub">${__("sold, not yet cleared")}</div></div>`);
		root.find(".dr-t thead").html(`<tr>
			<th>${__("Bill")}</th><th>${__("Sold on")}</th><th>${__("Buyer")}</th>
			<th>${__("Parcel")}</th><th class="num">${__("Pieces")}</th>
			<th class="num">${__("Sold for")}</th><th>${__("Off-chart")}</th>
			<th>${__("Sold by")}</th><th>${__("Board")}</th></tr>`);
		root.find(".dr-t tbody").html(rows.length ? rows.map((r) => `
			<tr data-sale="${esc(r.sale)}">
				<td class="dr-id">${esc(r.sale)}</td>
				<td class="dr-when">${esc(frappe.datetime.str_to_user(r.sale_date) || "")}</td>
				<td><b>${esc(r.customer || "—")}</b></td>
				<td>${r.parcel
					? `<span class="dr-id">${esc(r.parcel)}</span> <span class="dr-tag fmt">${
						esc(r.source === "prepare" ? r.fmt : __("Sell board"))}</span>`
					: `<span class="dr-when">${__("straight from Sell")}</span>`}</td>
				<td class="num">${cint(r.pieces)}</td>
				<td class="num">${money(r.sale_total)}</td>
				<td>${cint(r.off_chart) ? `<span class="dr-tag off">${__("{0} piece(s)", [r.off_chart])}</span>` : "—"}</td>
				<td class="dr-when">${esc(r.sold_by_name || "")}</td>
				<td>${!r.parcel ? "—" : (cint(r.cleared)
					? `<span class="dr-tag cleared">${__("Cleared")}</span>
						<div class="dr-when">${esc((r.cleared_on || "").slice(0, 16))} · ${esc(r.cleared_by_name || "")}</div>`
					: `<span class="dr-tag tiles">${__("On the tiles")}</span>`)}</td>
			</tr>`).join("")
			: `<tr><td colspan="9" class="dr-empty">${
				__("Nothing sold in this period. Widen the dates, or clear the search.")}</td></tr>`);
	}

	// ---- one sale, as it was sold ---------------------------------------------
	// which parts of an off-chart piece were priced by hand, chart figure beside sold
	function offChart(x) {
		const c = x.chart || {};
		if (!Object.keys(c).length) return "";
		const parts = [["Gold", "gold_value", "gold"], ["Diamond", "diamond_value", "diamond"],
			["Stone", "stone_value", "stone"], ["Labour", "labour_value", "labour"], ["Charges", "charges_value", "charges"]]
			.filter(([, s, k]) => Math.abs(flt(x[s]) - flt(c[k])) > 0.005)
			.map(([l, s, k]) => `${__(l)} ${money2(x[s])} (${__("chart")} ${money2(c[k])})`);
		return parts.length ? "<br>" + parts.join(" · ") : "";
	}

	function openSale(name) {
		frappe.call({ method: API + ".get_sale_record", args: { sale: name } }).then((r) => {
			const D = r.message;
			if (!D) return;
			const T = D.totals || {};
			const tiles = [["Gold", T.gold], ["Diamond", T.diamond], ["Stone", T.stone],
				["Labour", T.labour], ["Charges", T.charges]]
				.filter(([, v]) => v)
				.map(([k, v]) => `<div class="sr-t"><div class="k">${__(k)}</div><div class="v">${money2(v)}</div></div>`)
				.join("");
			const off = (D.items || []).filter((x) => x.overridden).length;
			const d = new frappe.ui.Dialog({ title: `${D.name} · ${D.customer || ""}`, size: "extra-large" });
			$(d.body).html(`
				<div class="sr-meta">
					${__("Sold")} <b>${esc(frappe.datetime.str_to_user(D.sale_date) || "")}</b>
					&nbsp;·&nbsp; ${__("to")} <b>${esc(D.customer)}</b>
					&nbsp;·&nbsp; ${__("chart")} <b>${esc(D.price_chart || "—")}</b>
					&nbsp;·&nbsp; ${__("gold rate")} <b>${money2(D.gold_rate)}</b>
					${D.prep ? `&nbsp;·&nbsp; ${__("parcel")} <b>${esc(D.prep)}</b>` : ""}
					${D.remarks ? "<br>" + __("Remarks") + ": " + esc(D.remarks) : ""}
				</div>
				<div class="sr-tiles">${tiles}
					${T.tax_amount ? `<div class="sr-t"><div class="k">${__("Tax")} ${T.tax_percent}%</div><div class="v">${money2(T.tax_amount)}</div></div>` : ""}
					<div class="sr-t grand"><div class="k">${__("Sold for")}</div><div class="v">${money2(T.grand)}</div></div>
				</div>
				<div class="sr-sec">${__("Pieces")} — ${(D.items || []).length}${off
					? ` · <span style="color:#b45309;">${__("{0} priced by hand, highlighted", [off])}</span>` : ""}</div>
				<table class="sr-items"><thead><tr>
					<th>${__("Card")}</th><th>${__("Design")}</th><th>${__("Type")}</th>
					<th class="num">${__("Nett g")}</th><th class="num">${__("DMD ct")}</th>
					<th class="num">${__("Gold")}</th><th class="num">${__("Diamond")}</th><th class="num">${__("Stone")}</th>
					<th class="num">${__("Labour")}</th><th class="num">${__("Charges")}</th><th class="num">${__("Piece total")}</th>
				</tr></thead><tbody>
				${(D.items || []).map((x) => `
					<tr class="${x.overridden ? "sr-ov" : ""}">
						<td><a class="jw-card-link sr-lnk" data-card="${esc(x.order_bag)}">${esc(x.order_bag)}</a></td>
						<td>${x.design ? `<span class="sr-lnk sr-design" data-design="${esc(x.design)}">${esc(x.design)}</span>` : ""}</td>
						<td>${esc(x.design_type)}</td>
						<td class="num">${x.nett || ""}</td><td class="num">${x.dmd_ct || ""}</td>
						<td class="num">${money2(x.gold_value)}</td><td class="num">${money2(x.diamond_value)}</td>
						<td class="num">${money2(x.stone_value)}</td><td class="num">${money2(x.labour_value)}</td>
						<td class="num">${money2(x.charges_value)}</td>
						<td class="num"><b>${money2(x.piece_total)}</b>${x.overridden
							? `<div class="sr-ovnote">${__("chart said")} ${money2(x.chart_total)} — ${esc(x.changed_by || "")}${
								x.override_remark ? ": " + esc(x.override_remark) : ""}${offChart(x)}</div>`
							: ""}</td>
					</tr>`).join("")}</tbody></table>`);
			$(d.body).on("click", ".sr-design", function () {
				d.hide();
				frappe.route_options = { design: $(this).data("design") };
				frappe.set_route("design-info");
			});
			d.show();
		});
	}

	root.on("click", ".dr-c", function () {
		root.find(".dr-c").removeClass("on");
		this.classList.add("on");
		ONLY = $(this).data("o") || "";
		paint();
	});
	root.on("click", ".dr-t tbody tr[data-sale]", function () { openSale($(this).data("sale")); });

	function fromRoute() {
		if (frappe.route_options && frappe.route_options.sale) {
			const s = frappe.route_options.sale;
			frappe.route_options = null;
			openSale(s);
		}
	}

	page.set_secondary_action(__("Refresh"), load, "refresh");
	frappe.pages["sales-history"].on_page_show = fromRoute;
	load().then(fromRoute);
	this.page = page;
};
