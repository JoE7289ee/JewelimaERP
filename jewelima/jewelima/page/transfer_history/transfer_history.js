// Transfer History (Stock > Records > Transfer History) — every move made on
// the Stock Transfer page: what went where, how much, by whom.
//
// Only that page's transfers. A Material Transfer is written by half the app —
// casting, findings, card gold, the importers — so these are read from the tag
// transfer_stock leaves in its remarks, not from the entry type.
// Route: /app/transfer-history
frappe.pages["transfer-history"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Transfer History"), single_column: true });
	const esc = frappe.utils.escape_html;
	const S = { rows: [], routes: [], items: [], period: "month", q: "", sort: "when", desc: true };

	$(page.main).append(`
		<style>
		#page-transfer-history .container{max-width:100%;}
		.th-bar{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-bottom:10px;}
		.th-pill{border:1px solid var(--border-color);background:var(--fg-color);color:var(--text-muted);
			border-radius:999px;padding:4px 13px;font-size:11.5px;cursor:pointer;font-weight:600;}
		.th-pill.on{background:#1f618d;border-color:#1f618d;color:#fff;}
		.th-q{width:250px;border:1px solid var(--border-color);border-radius:8px;height:29px;padding:2px 11px;
			background:var(--fg-color);color:var(--text-color);font-size:12.5px;}
		.th-when{font-size:11.5px;color:var(--text-muted);}
		.th-tiles{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;}
		.th-tile{border:1px solid var(--border-color);border-radius:10px;padding:8px 16px;background:var(--fg-color);}
		.th-tile .k{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;}
		.th-tile .v{font-size:19px;font-weight:800;font-variant-numeric:tabular-nums;}
		.th-cols{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;}
		.th-main{flex:1 1 640px;min-width:520px;}
		.th-side{flex:0 0 300px;}
		.th-box{border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);
			overflow:auto;max-height:calc(100vh - 250px);}
		.th-card{border:1px solid var(--border-color);border-radius:11px;background:var(--fg-color);
			padding:11px 14px;margin-bottom:12px;}
		.th-card .h{font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;
			color:var(--text-muted);margin-bottom:8px;}
		table.th-t{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.th-t th{position:sticky;top:0;background:var(--control-bg);font-size:10px;text-transform:uppercase;
			letter-spacing:.05em;color:var(--text-muted);text-align:left;padding:7px 10px;font-weight:700;
			border-bottom:1px solid var(--border-color);}
		table.th-t th.s{cursor:pointer;user-select:none;}
		table.th-t th .ar{opacity:.45;font-size:9px;margin-left:3px;}
		table.th-t th.sorted .ar{opacity:1;}
		table.th-t td{padding:6px 10px;border-bottom:1px solid var(--border-color);vertical-align:top;}
		table.th-t td.num{text-align:right;font-variant-numeric:tabular-nums;font-weight:700;}
		table.th-t tr:hover td{background:var(--control-bg);}
		.th-route{font-weight:700;white-space:nowrap;}
		.th-arrow{color:#1f618d;font-weight:800;}
		.th-lines{font-size:11px;color:var(--text-muted);}
		.th-row{display:flex;justify-content:space-between;font-size:12px;padding:3px 0;gap:8px;}
		.th-none{padding:40px;text-align:center;color:var(--text-muted);}
		</style>
		<div class="th-bar">
			<span class="th-pill" data-p="today">${__("Today")}</span>
			<span class="th-pill" data-p="week">${__("7 days")}</span>
			<span class="th-pill on" data-p="month">${__("30 days")}</span>
			<span class="th-pill" data-p="year">${__("12 months")}</span>
			<span class="th-pill" data-p="all">${__("All")}</span>
			<input class="th-q" placeholder="${__("Filter warehouse, item or person")}">
			<span class="th-when"></span>
		</div>
		<div class="th-tiles"></div>
		<div class="th-cols">
			<div class="th-main">
				<div class="th-box"><table class="th-t"><thead><tr>
					<th class="s" data-k="when">${__("Date")}<span class="ar">&#9660;</span></th>
					<th class="s" data-k="from_warehouse">${__("From")}<span class="ar">&#9660;</span></th>
					<th class="s" data-k="to_warehouse">${__("To")}<span class="ar">&#9660;</span></th>
					<th class="num s" data-k="qty">${__("Weight")}<span class="ar">&#9660;</span></th>
					<th>${__("What moved")}</th>
					<th class="s" data-k="who">${__("By")}<span class="ar">&#9660;</span></th>
					<th>${__("Entry")}</th>
				</tr></thead><tbody class="th-body"></tbody></table></div>
			</div>
			<div class="th-side"></div>
		</div>`);
	const root = $(page.main);

	function sortRows(rows) {
		const k = S.sort;
		return rows.slice().sort((a, b) => {
			const x = a[k], y = b[k];
			const c = (typeof x === "number" && typeof y === "number")
				? x - y : String(x || "").localeCompare(String(y || ""));
			return S.desc ? -c : c;
		});
	}

	function paint() {
		const q = (S.q || "").trim().toLowerCase();
		const rows = sortRows(S.rows.filter((r) => !q
			|| (r.from_warehouse || "").toLowerCase().includes(q)
			|| (r.to_warehouse || "").toLowerCase().includes(q)
			|| (r.who || "").toLowerCase().includes(q)
			|| (r.name || "").toLowerCase().includes(q)
			|| (r.lines || []).some((l) => (l.item || "").toLowerCase().includes(q))));
		root.find("th.s").removeClass("sorted").filter(`[data-k="${S.sort}"]`).addClass("sorted")
			.find(".ar").html(S.desc ? "&#9660;" : "&#9650;");

		// the tiles follow what is on screen, so a filter is not a lie
		const qty = rows.reduce((a, r) => a + r.qty, 0);
		const routes = new Set(rows.map((r) => r.from_warehouse + "→" + r.to_warehouse));
		root.find(".th-tiles").html(`
			<div class="th-tile"><div class="k">${__("Transfers")}</div><div class="v">${rows.length}</div></div>
			<div class="th-tile"><div class="k">${__("Weight moved")}</div><div class="v">${qty.toFixed(3)}<span style="font-size:11px;"> g</span></div></div>
			<div class="th-tile"><div class="k">${__("Routes used")}</div><div class="v">${routes.size}</div></div>`);

		root.find(".th-body").html(rows.length ? rows.map((r) => `
			<tr>
				<td>${frappe.datetime.str_to_user(r.when)}</td>
				<td class="th-route">${esc(r.from_warehouse)}</td>
				<td class="th-route"><span class="th-arrow">&rarr;</span> ${esc(r.to_warehouse)}</td>
				<td class="num">${r.qty.toFixed(3)} g</td>
				<td class="th-lines">${(r.lines || []).map((l) =>
					`${l.qty.toFixed(3)} g ${esc(l.item)}`).join("<br>")}</td>
				<td>${esc(r.who)}</td>
				<td style="font-size:11px;color:var(--text-muted);">${esc(r.name)}</td>
			</tr>`).join("")
			: `<tr><td colspan="7" class="th-none">${S.q
				? __("Nothing matches — clear the filter to see the rest.")
				: __("No transfers in this window. Moves made on the Stock Transfer page land here.")}</td></tr>`);

		root.find(".th-side").html(`
			<div class="th-card"><div class="h">${__("Busiest routes")}</div>
				${(S.routes || []).length ? S.routes.slice(0, 12).map(([k, n, g]) =>
					`<div class="th-row"><span>${esc(k)}</span><b>${g.toFixed(3)} g<span
						style="color:var(--text-muted);font-weight:400;"> · ${n}</span></b></div>`).join("")
					: `<div style="color:var(--text-muted);font-size:12px;">${__("nothing yet")}</div>`}
			</div>
			<div class="th-card"><div class="h">${__("What gets moved")}</div>
				${(S.items || []).length ? S.items.slice(0, 12).map(([k, n, g]) =>
					`<div class="th-row"><span>${esc(k)}</span><b>${g.toFixed(3)} g<span
						style="color:var(--text-muted);font-weight:400;"> · ${n}</span></b></div>`).join("")
					: `<div style="color:var(--text-muted);font-size:12px;">${__("nothing yet")}</div>`}
			</div>`);
	}

	function load() {
		frappe.call({ method: "jewelima.jewelima.api.get_transfer_history", freeze: false,
			args: { period: S.period } }).then((r) => {
			const m = r.message || {};
			S.rows = m.rows || [];
			S.routes = m.routes || [];
			S.items = m.items || [];
			root.find(".th-when").text(m.label || "");
			paint();
		});
	}
	root.on("click", ".th-pill", function () {
		root.find(".th-pill").removeClass("on"); this.classList.add("on");
		S.period = this.dataset.p; load();
	});
	root.on("input", ".th-q", function () { S.q = this.value; paint(); });
	root.on("click", "th.s", function () {
		const k = this.dataset.k;
		S.desc = S.sort === k ? !S.desc : true;
		S.sort = k;
		paint();
	});
	page.add_inner_button(__("Stock Transfer"), () => frappe.set_route("stock-transfer"));
	frappe.pages["transfer-history"].on_page_show = load;
	load();
};
