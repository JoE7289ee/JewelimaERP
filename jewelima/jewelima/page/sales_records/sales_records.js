// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Sales Records — the sale ledger in floor language, replacing the ERP list.
// LEFT: recent sales (search by number / party). Open one -> when it sold, to
// whom, on what chart & rate, the pieces with their value split (bag numbers
// jump to Card Info, designs to Design Info), every MANUAL override the prep
// recorded (chart price vs sold price, who, why), and the totals.
// Route: /app/sales-records  (route_options: {sale})

frappe.pages["sales-records"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Sales Records", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const money = (v) => (v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

	$(page.main).append(`
		<style>
		.sr-cols{display:flex;gap:20px;align-items:flex-start;}
		.sr-left{flex:0 0 380px;}
		.sr-search{margin-bottom:8px;}
		.sr-list{border:1px solid var(--border-color);border-radius:9px;background:var(--fg-color);overflow:auto;max-height:calc(100vh - 180px);}
		.sr-row{padding:8px 14px;border-bottom:1px solid var(--border-color);cursor:pointer;}
		.sr-row:hover,.sr-row.on{background:var(--control-bg);}
		.sr-row .l1{display:flex;justify-content:space-between;font-size:13px;font-weight:700;}
		.sr-row .l2{display:flex;justify-content:space-between;font-size:11.5px;color:var(--text-muted);margin-top:2px;}
		.sr-right{flex:1;min-width:0;}
		.sr-head{font-size:20px;font-weight:800;display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
		.sr-badge{border-radius:9px;padding:2px 10px;font-size:11px;font-weight:800;color:#fff;background:#2e7d32;}
		.sr-meta{font-size:13px;color:var(--text-muted);margin:6px 0 14px;line-height:1.8;}
		.sr-meta b{color:var(--text-color);}
		.sr-tiles{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;}
		.sr-t{border:1px solid var(--border-color);border-radius:9px;padding:7px 16px;background:var(--control-bg);}
		.sr-t .k{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;}
		.sr-t .v{font-size:15px;font-weight:800;font-variant-numeric:tabular-nums;}
		.sr-t.grand{border-width:2px;background:var(--fg-color);}
		.sr-t.grand .v{font-size:18px;color:#1f618d;}
		table.sr-items{width:100%;border-collapse:collapse;font-size:12.5px;background:var(--fg-color);}
		table.sr-items th{background:var(--control-bg);font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);padding:5px 10px;border:1px solid var(--border-color);text-align:left;}
		table.sr-items td{border:1px solid var(--border-color);padding:5px 10px;font-variant-numeric:tabular-nums;}
		.sr-lnk{font-family:var(--font-family-monospace,monospace);font-weight:700;cursor:pointer;color:#1f618d;}
		.sr-ov{background:#fff8e6;}
		.sr-ovnote{font-size:11.5px;color:#8a6d00;background:#fff3cd;border-radius:6px;padding:2px 8px;display:inline-block;margin-top:2px;}
		.sr-none{padding:44px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:10px;}
		.sr-sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin:0 0 6px;}
		</style>
		<div class="sr-cols">
			<div class="sr-left">
				<input type="text" class="form-control input-sm sr-search" placeholder="${__("search sale no / party…")}">
				<div class="sr-list"></div>
			</div>
			<div class="sr-right"><div class="sr-none">${__("Pick a sale.")}</div></div>
		</div>
	`);
	const root = $(page.main);
	let current = null;

	function paintList(rows) {
		root.find(".sr-list").html((rows || []).map((r) => `
			<div class="sr-row ${r.name === current ? "on" : ""}" data-sale="${esc(r.name)}">
				<div class="l1"><span>${esc(r.name)}</span><span>₹ ${money(r.grand_total)}</span></div>
				<div class="l2"><span>${esc(r.customer || "")}</span>
					<span>${r.pieces || 0} pc · ${esc(frappe.datetime.str_to_user(r.sale_date) || "")}</span></div>
			</div>`).join("") || `<div style="padding:20px;color:var(--text-muted);font-size:12.5px;">${__("No sales found.")}</div>`);
	}

	function loadList(q) {
		frappe.call({ method: API + ".get_sales_records", args: { q: q || "" }, freeze: false })
			.then((r) => paintList((r.message || {}).rows || []));
	}

	function paintSale(D) {
		const T = D.totals || {};
		const tiles = [["Gold", T.gold], ["Diamond", T.diamond], ["Stone", T.stone],
			["Labour", T.labour], ["Charges", T.charges]]
			.filter(([, v]) => v)
			.map(([k, v]) => `<div class="sr-t"><div class="k">${__(k)}</div><div class="v">₹ ${money(v)}</div></div>`)
			.join("");
		const overrides = (D.items || []).filter((x) => x.overridden);
		root.find(".sr-right").html(`
			<div class="sr-head">${esc(D.name)} <span class="sr-badge">${esc((D.status || "").toUpperCase())}</span></div>
			<div class="sr-meta">
				${__("Sold")} <b>${esc(frappe.datetime.str_to_user(D.sale_date) || "")}</b>
				&nbsp;·&nbsp; ${__("to")} <b>${esc(D.customer)}</b>
				&nbsp;·&nbsp; ${__("chart")} <b>${esc(D.price_chart || "—")}</b>
				&nbsp;·&nbsp; ${__("gold rate")} <b>₹ ${money(D.gold_rate)}</b>
				${D.remarks ? "<br>" + __("Remarks") + ": " + esc(D.remarks) : ""}
			</div>
			<div class="sr-tiles">${tiles}
				${T.tax_amount ? `<div class="sr-t"><div class="k">${__("Tax")} ${T.tax_percent}%</div><div class="v">₹ ${money(T.tax_amount)}</div></div>` : ""}
				<div class="sr-t grand"><div class="k">${__("Sold for")}</div><div class="v">₹ ${money(T.grand)}</div></div>
			</div>

			<div class="sr-sec">${__("Pieces")} — ${(D.items || []).length}</div>
			<table class="sr-items"><thead><tr>
				<th>${__("Card")}</th><th>${__("Design")}</th><th>${__("Bank Code")}</th><th>${__("Type")}</th>
				<th>${__("Nett g")}</th><th>${__("DMD ct")}</th><th>${__("Piece total")}</th>
			</tr></thead><tbody>
			${(D.items || []).map((x) => `
				<tr class="${x.overridden ? "sr-ov" : ""}">
					<td><a class="jw-card-link sr-lnk" data-card="${esc(x.order_bag)}">${esc(x.order_bag)}</a></td>
					<td>${x.design ? `<span class="sr-lnk sr-design" data-design="${esc(x.design)}">${esc(x.design)}</span>` : ""}</td>
					<td>${esc(x.bank_code || "")}</td>
					<td>${esc(x.design_type)}</td>
					<td>${x.nett || ""}</td><td>${x.dmd_ct || ""}</td>
					<td><b>₹ ${money(x.piece_total)}</b>${x.overridden
						? `<div class="sr-ovnote">${__("chart said")} ₹ ${money(x.chart_total)} — ${esc(x.changed_by || "")}${x.override_remark ? ": " + esc(x.override_remark) : ""}</div>`
						: ""}</td>
				</tr>`).join("")}</tbody></table>

			${overrides.length ? `<div class="sr-sec" style="margin-top:16px;color:#8a6d00;">
				${__("{0} piece(s) sold off-chart — highlighted above", [overrides.length])}</div>` : ""}
		`);
	}

	function openSale(name) {
		current = name;
		root.find(".sr-row").removeClass("on");
		root.find(`.sr-row[data-sale="${name}"]`).addClass("on");
		frappe.call({ method: API + ".get_sale_record", args: { sale: name } })
			.then((r) => { if (r.message) paintSale(r.message); });
	}

	root.on("click", ".sr-row", function () { openSale($(this).data("sale")); });
	root.on("click", ".sr-design", function () {
		frappe.route_options = { design: $(this).data("design") };
		frappe.set_route("design-info");
	});
	let t;
	root.find(".sr-search").on("input", function () {
		clearTimeout(t);
		const v = this.value.trim();
		t = setTimeout(() => loadList(v), 300);
	});

	loadList();
	if (frappe.route_options && frappe.route_options.sale) {
		const pre = frappe.route_options.sale;
		frappe.route_options = null;
		openSale(pre);
	}
};
