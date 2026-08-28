// Melt History — every melt on record: what went into the pot, what karat
// gold came out, the melt loss, where, and by whom. Read-only record.
frappe.pages["melt-history"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Melt History"), single_column: true });
	const esc = frappe.utils.escape_html;
	const S = { rows: [], period: "all", q: "", sort: "when", desc: true };

	$(page.main).append(`
		<style>
		#page-melt-history .container{max-width:100%;}
		.mh-tiles{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;}
		.mh-bar{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-bottom:10px;}
		.mh-pill{border:1px solid var(--border-color);background:var(--fg-color);color:var(--text-muted);
			border-radius:999px;padding:4px 13px;font-size:11.5px;cursor:pointer;font-weight:600;}
		.mh-pill.on{background:#1f618d;border-color:#1f618d;color:#fff;}
		.mh-q{width:230px;border:1px solid var(--border-color);border-radius:8px;height:29px;padding:2px 11px;
			background:var(--fg-color);color:var(--text-color);font-size:12.5px;}
		.mh-when{font-size:11.5px;color:var(--text-muted);}
		table.mh-t th.s{cursor:pointer;user-select:none;}
		table.mh-t th .ar{opacity:.45;font-size:9px;margin-left:3px;}
		table.mh-t th.sorted .ar{opacity:1;}
		.mh-tile{border:1px solid var(--border-color);border-radius:10px;padding:7px 16px;background:var(--fg-color);}
		.mh-tile .k{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;}
		.mh-tile .v{font-size:17px;font-weight:800;}
		.mh-tile.loss .v{color:#b02a2a;}
		.mh-box{border:1px solid var(--border-color);border-radius:12px;overflow:auto;background:var(--fg-color);max-height:calc(100vh - 220px);}
		table.mh-t{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.mh-t th{position:sticky;top:0;background:var(--control-bg);font-size:10px;text-transform:uppercase;
			color:var(--text-muted);padding:6px 10px;text-align:left;border-bottom:2px solid var(--border-color);white-space:nowrap;}
		table.mh-t td{padding:6px 10px;border-bottom:1px solid var(--border-color);vertical-align:top;}
		.mh-lines{font-size:11px;color:var(--text-muted);}
		.mh-none{padding:40px;text-align:center;color:var(--text-muted);}
		td.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;}
		.mh-loss{color:#b02a2a;font-weight:700;}
		</style>
		<div class="mh-bar">
			<span class="mh-pill" data-p="today">${__("Today")}</span>
			<span class="mh-pill" data-p="week">${__("7 days")}</span>
			<span class="mh-pill" data-p="month">${__("30 days")}</span>
			<span class="mh-pill" data-p="year">${__("12 months")}</span>
			<span class="mh-pill on" data-p="all">${__("All")}</span>
			<input class="mh-q" placeholder="${__("Filter item, warehouse or person")}">
			<span class="mh-when"></span>
		</div>
		<div class="mh-tiles">
			<div class="mh-tile"><div class="k">${__("Melts")}</div><div class="v mh-c-n">0</div></div>
			<div class="mh-tile"><div class="k">${__("Fed (g)")}</div><div class="v mh-c-fed">0</div></div>
			<div class="mh-tile"><div class="k">${__("Made (g)")}</div><div class="v mh-c-got">0</div></div>
			<div class="mh-tile loss"><div class="k">${__("Melt loss (g)")}</div><div class="v mh-c-loss">0</div></div>
		</div>
		<div class="mh-box"><table class="mh-t"><thead><tr>
			<th class="s" data-k="when">${__("Date")}<span class="ar">&#9660;</span></th>
			<th class="num s" data-k="fed">${__("Into the pot")}<span class="ar">&#9660;</span></th>
			<th class="num s" data-k="got">${__("Came out")}<span class="ar">&#9660;</span></th>
			<th class="num s" data-k="loss">${__("Loss (g)")}<span class="ar">&#9660;</span></th>
			<th class="s" data-k="warehouse">${__("Warehouse")}<span class="ar">&#9660;</span></th>
			<th class="s" data-k="who">${__("By")}<span class="ar">&#9660;</span></th>
			<th>${__("Entry")}</th>
		</tr></thead><tbody class="mh-body"></tbody></table></div>`);
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
		const rows = sortRows(S.rows.filter((x) => !q
			|| (x.who || "").toLowerCase().includes(q)
			|| (x.out_item || "").toLowerCase().includes(q)
			|| (x.warehouse || "").toLowerCase().includes(q)
			|| (x.name || "").toLowerCase().includes(q)
			|| (x.consumed || []).some((c) => (c.item || "").toLowerCase().includes(q))));
		root.find("th.s").removeClass("sorted").filter(`[data-k="${S.sort}"]`).addClass("sorted")
			.find(".ar").html(S.desc ? "&#9660;" : "&#9650;");
		// the tiles follow what is on screen, so a filter is not a lie
		root.find(".mh-c-n").text(rows.length);
		root.find(".mh-c-fed").text(rows.reduce((a, x) => a + x.fed, 0).toFixed(3));
		root.find(".mh-c-got").text(rows.reduce((a, x) => a + x.got, 0).toFixed(3));
		root.find(".mh-c-loss").text(rows.reduce((a, x) => a + x.loss, 0).toFixed(3));
		root.find(".mh-body").html(rows.map((x) => `<tr>
				<td>${frappe.datetime.str_to_user(x.when)}</td>
				<td class="mh-lines">${x.consumed.map((c) => `${c.qty.toFixed(3)} g ${esc(c.item)}`).join("<br>")}
					<div style="margin-top:2px;"><b style="color:var(--text-color);">${x.fed.toFixed(3)} g ${__("total")}</b></div></td>
				<td><b>${x.got.toFixed(3)} g</b> ${esc(x.out_item)}</td>
				<td class="num ${x.loss > 0 ? "mh-loss" : ""}" title="${esc(x.loss_warehouse || "")}">${x.loss.toFixed(3)}</td>
				<td>${esc((x.warehouse || "").replace(" - JD", ""))}</td>
				<td>${esc(x.who)}</td>
				<td style="font-size:11px;color:var(--text-muted);">${esc(x.name)}</td>
			</tr>`).join("") || `<tr><td colspan="7" class="mh-none">${S.q || S.period !== "all"
			? __("Nothing matches — try a wider window or clear the filter.")
			: __("No melts on record yet — melts from today on land here automatically.")}</td></tr>`);
	}

	function load() {
		frappe.call({ method: "jewelima.jewelima.api.get_melt_history", freeze: false,
			args: { period: S.period } }).then((r) => {
			const m = r.message || { rows: [] };
			S.rows = m.rows || [];
			root.find(".mh-when").text(m.label || "");
			paint();
		});
	}
	root.on("click", ".mh-pill", function () {
		root.find(".mh-pill").removeClass("on"); this.classList.add("on");
		S.period = this.dataset.p; load();
	});
	root.on("input", ".mh-q", function () { S.q = this.value; paint(); });
	root.on("click", "th.s", function () {
		const k = this.dataset.k;
		S.desc = S.sort === k ? !S.desc : true;
		S.sort = k;
		paint();
	});
	frappe.pages["melt-history"].on_page_show = load;
	load();
};
