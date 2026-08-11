// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Stone Stock Info — a glanceable picture of everything sitting in the Stone
// Issue warehouse: grand totals, a card per stone family (carats, what's
// committed to open cards vs still free), and a searchable / sortable detail
// table down to each item + size. Route: /app/stone-stock-info

frappe.pages["stone-stock-info"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Stone Stock Info", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const nf = (v, d = 3) => (flt(v)).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
	const ni = (v) => cint(v).toLocaleString();

	// jewel-tone accent per family — readable on light + dark
	const FAM = {
		Diamond: "#4c8bf5", "Party Diamond": "#6d6df5", CVD: "#2fa8a0",
		"Cubic Zirconia": "#9b7ede", "Precious Stone": "#e0555a",
		"Color Stone": "#e08a3c", Swarovski: "#d873a9", "Party Other": "#8a8f98",
	};
	const famColor = (f) => FAM[f] || "#8a8f98";

	const S = { d: null, term: "", fam: "", sortKey: "stock", sortDir: -1 };

	$(page.main).append(`
		<style>
		#page-stone-stock-info .container{max-width:100%;}
		.si-wh{font-size:12px;color:var(--text-muted);margin:2px 0 14px;}
		.si-wh b{color:var(--text-color);}
		/* hero tiles */
		.si-hero{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:18px;}
		.si-tile{position:relative;border:1px solid var(--border-color);border-radius:14px;background:var(--fg-color);
			padding:14px 16px;overflow:hidden;}
		.si-tile .k{font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);font-weight:700;}
		.si-tile .v{font-size:26px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.15;margin-top:3px;}
		.si-tile .u{font-size:12px;font-weight:600;color:var(--text-muted);margin-left:3px;}
		.si-tile.accent::before{content:"";position:absolute;inset:0 auto 0 0;width:4px;}
		.si-tile.t-total::before{background:#8a8f98;}
		.si-tile.t-free::before{background:#2e9e5b;}
		.si-tile.t-com::before{background:#c9962b;}
		.si-tile.t-free .v{color:#2e9e5b;}
		.si-tile.t-com .v{color:#b7862a;}
		/* family cards */
		.si-secttl{font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--text-muted);margin:4px 2px 10px;}
		.si-fams{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px;margin-bottom:22px;}
		.si-fam{border:1px solid var(--border-color);border-radius:14px;background:var(--fg-color);padding:0;overflow:hidden;
			cursor:pointer;transition:transform .12s,box-shadow .12s,border-color .12s;}
		.si-fam:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,.10);}
		.si-fam.on{border-color:var(--fam);box-shadow:0 0 0 2px color-mix(in srgb, var(--fam) 35%, transparent);}
		.si-fam .top{padding:12px 15px 10px;border-top:4px solid var(--fam);}
		.si-fam .nm{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:800;}
		.si-fam .dot{width:9px;height:9px;border-radius:50%;background:var(--fam);flex:0 0 auto;}
		.si-fam .big{font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;margin-top:6px;}
		.si-fam .big .u{font-size:11px;font-weight:600;color:var(--text-muted);}
		.si-fam .sub{font-size:11px;color:var(--text-muted);margin-top:1px;}
		.si-bar{height:7px;border-radius:6px;background:var(--control-bg);margin:10px 0 8px;overflow:hidden;display:flex;}
		.si-bar .free{background:#2e9e5b;height:100%;}
		.si-bar .com{background:var(--fam);opacity:.55;height:100%;}
		.si-fam .foot{display:flex;justify-content:space-between;font-size:11px;padding:0 15px 12px;color:var(--text-muted);}
		.si-fam .foot b{color:var(--text-color);font-variant-numeric:tabular-nums;}
		/* tools + table */
		.si-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px;}
		.si-search{width:230px;border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);color:var(--text-color);
			height:32px;border-radius:7px;padding:2px 12px;font-size:13px;box-sizing:border-box;}
		.si-pill{border:1px solid var(--border-color);background:var(--fg-color);border-radius:14px;padding:3px 13px;
			font-size:12px;font-weight:600;cursor:pointer;color:var(--text-muted);display:inline-flex;align-items:center;gap:6px;}
		.si-pill .dot{width:8px;height:8px;border-radius:50%;}
		.si-pill.on{color:#fff;border-color:transparent;}
		.si-count{margin-left:auto;color:var(--text-muted);font-size:12px;}
		.si-box{border:1px solid var(--border-color);border-radius:12px;overflow:auto;background:var(--fg-color);max-height:calc(100vh - 300px);}
		table.si-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;}
		table.si-tbl th{position:sticky;top:0;z-index:1;background:var(--control-bg,var(--fg-color));border-bottom:2px solid var(--gray-400,#aeb6bf);
			padding:8px 12px;text-align:left;font-weight:700;white-space:nowrap;cursor:pointer;user-select:none;}
		table.si-tbl th.num{text-align:right;}
		table.si-tbl td{border-bottom:1px solid var(--border-color);padding:6px 12px;vertical-align:middle;white-space:nowrap;}
		table.si-tbl td.num{text-align:right;font-variant-numeric:tabular-nums;}
		table.si-tbl tbody tr:hover td{background:var(--control-bg);}
		.si-fchip{display:inline-flex;align-items:center;gap:6px;font-weight:600;}
		.si-fchip .dot{width:8px;height:8px;border-radius:50%;}
		.si-freecell{position:relative;}
		.si-freecell .hb{position:absolute;left:0;top:0;bottom:0;background:#2e9e5b;opacity:.12;}
		.si-freecell span{position:relative;font-weight:700;color:#2e8a52;}
		.si-est{color:var(--text-muted);font-size:11px;}
		.si-none{padding:40px;text-align:center;color:var(--text-muted);}
		</style>
		<div class="si-wh"></div>
		<div class="si-hero"></div>
		<div class="si-secttl">${__("By stone family")}</div>
		<div class="si-fams"></div>
		<div class="si-secttl">${__("Every item")}</div>
		<div class="si-tools">
			<input class="si-search" type="text" placeholder="${__("Search item or size…")}">
			<span class="si-pills"></span>
			<span class="si-count"></span>
		</div>
		<div class="si-box"><table class="si-tbl"><thead class="si-head"></thead><tbody class="si-body"></tbody></table></div>
	`);
	const root = $(page.main)[0];

	function tile(cls, label, val, unit) {
		return `<div class="si-tile accent ${cls}"><div class="k">${label}</div>
			<div class="v">${val}${unit ? `<span class="u">${unit}</span>` : ""}</div></div>`;
	}

	function renderHero() {
		const t = (S.d && S.d.totals) || {};
		root.querySelector(".si-wh").innerHTML = __("Live stock in the <b>{0}</b> warehouse — carats on hand, committed to open cards, and free.",
			[esc((S.d && S.d.warehouse) || "Stone Issue")]);
		root.querySelector(".si-hero").innerHTML =
			tile("t-total", __("Total carats"), nf(t.stock), "ct") +
			tile("t-free", __("Free"), nf(t.free), "ct") +
			tile("t-com", __("Committed"), nf(t.committed), "ct") +
			tile("", __("Items"), ni(t.items)) +
			tile("", __("Families"), ni(t.families));
	}

	function renderFamilies() {
		const fams = (S.d && S.d.families) || [];
		root.querySelector(".si-fams").innerHTML = fams.map((f) => {
			const c = famColor(f.family);
			const pf = f.stock > 0 ? (f.free / f.stock) * 100 : 0;
			const pc = f.stock > 0 ? (f.committed / f.stock) * 100 : 0;
			return `<div class="si-fam ${S.fam === f.family ? "on" : ""}" data-fam="${esc(f.family)}" style="--fam:${c};">
				<div class="top">
					<div class="nm"><span class="dot"></span>${esc(f.family)}</div>
					<div class="big">${nf(f.free)}<span class="u"> ct free</span></div>
					<div class="sub">${nf(f.stock)} ct in stock · ${f.items} ${__("item(s)")}${f.est_pcs ? ` · ~${ni(f.est_pcs)} pcs` : ""}</div>
					<div class="si-bar"><div class="free" style="width:${pf}%"></div><div class="com" style="width:${pc}%"></div></div>
				</div>
				<div class="foot"><span>${__("Free")} <b>${nf(f.free)}</b></span><span>${__("Committed")} <b>${nf(f.committed)}</b></span></div>
			</div>`;
		}).join("") || `<div class="si-none">${__("The Stone Issue warehouse is empty.")}</div>`;
	}

	function renderPills() {
		const fams = (S.d && S.d.families) || [];
		root.querySelector(".si-pills").innerHTML =
			`<span class="si-pill ${S.fam === "" ? "on" : ""}" data-fam="" style="${S.fam === "" ? "background:#555;" : ""}">${__("All")}</span>` +
			fams.map((f) => {
				const c = famColor(f.family);
				return `<span class="si-pill ${S.fam === f.family ? "on" : ""}" data-fam="${esc(f.family)}"
					style="${S.fam === f.family ? `background:${c};` : ""}"><span class="dot" style="background:${c}"></span>${esc(f.family)}</span>`;
			}).join("");
	}

	const COLS = [
		{ k: "item", label: __("Item") },
		{ k: "group", label: __("Quality / Group") },
		{ k: "size", label: __("Size") },
		{ k: "stock", label: __("Stock ct"), num: true },
		{ k: "committed", label: __("Committed ct"), num: true },
		{ k: "free", label: __("Free ct"), num: true },
		{ k: "est_pcs", label: __("Est. pcs"), num: true },
	];

	function visibleRows() {
		let rows = ((S.d && S.d.rows) || []).slice();
		if (S.fam) rows = rows.filter((r) => r.family === S.fam);
		const q = S.term.trim().toLowerCase();
		if (q) rows = rows.filter((r) => (r.item + " " + r.group + " " + r.size).toLowerCase().indexOf(q) !== -1);
		const c = COLS.find((x) => x.k === S.sortKey);
		rows.sort((a, b) => {
			let va, vb;
			if (c && c.num) { va = flt(a[S.sortKey]); vb = flt(b[S.sortKey]); }
			else { va = String(a[S.sortKey] || "").toLowerCase(); vb = String(b[S.sortKey] || "").toLowerCase(); }
			return (va < vb ? -1 : va > vb ? 1 : 0) * S.sortDir;
		});
		return rows;
	}

	function renderTable() {
		const arrow = (k) => (S.sortKey === k ? (S.sortDir > 0 ? " ▲" : " ▼") : "");
		root.querySelector(".si-head").innerHTML = `<tr>${COLS.map((c) =>
			`<th class="${c.num ? "num" : ""}" data-k="${c.k}">${esc(c.label)}${arrow(c.k)}</th>`).join("")}</tr>`;
		const rows = visibleRows();
		const maxFree = Math.max(1, ...rows.map((r) => flt(r.free)));
		root.querySelector(".si-count").textContent = __("{0} item(s)", [rows.length]);
		root.querySelector(".si-body").innerHTML = rows.length ? rows.map((r) => {
			const c = famColor(r.family);
			const w = (flt(r.free) / maxFree) * 100;
			return `<tr>
				<td><b>${esc(r.item)}</b></td>
				<td><span class="si-fchip"><span class="dot" style="background:${c}"></span>${esc(r.group || r.family)}</span></td>
				<td>${esc(r.size || "—")}</td>
				<td class="num">${nf(r.stock)}</td>
				<td class="num">${flt(r.committed) ? nf(r.committed) : "·"}</td>
				<td class="num si-freecell"><div class="hb" style="width:${w}%"></div><span>${nf(r.free)}</span></td>
				<td class="num si-est">${r.est_pcs != null ? "~" + ni(r.est_pcs) : "—"}</td>
			</tr>`;
		}).join("") : `<tr><td colspan="${COLS.length}" class="si-none">${__("Nothing matches.")}</td></tr>`;
	}

	function renderAll() { renderHero(); renderFamilies(); renderPills(); renderTable(); }

	function pickFamily(f) {
		S.fam = S.fam === f ? "" : f; // toggle
		renderFamilies(); renderPills(); renderTable();
	}
	$(root).on("click", ".si-fam", function () { pickFamily($(this).data("fam")); });
	$(root).on("click", ".si-pill", function () { S.fam = $(this).data("fam") || ""; renderFamilies(); renderPills(); renderTable(); });
	$(root).on("click", ".si-head th", function () {
		const k = this.getAttribute("data-k");
		if (S.sortKey === k) S.sortDir = -S.sortDir;
		else { S.sortKey = k; S.sortDir = COLS.find((x) => x.k === k && x.num) ? -1 : 1; }
		renderTable();
	});
	root.querySelector(".si-search").addEventListener("input", frappe.utils.debounce(function () {
		S.term = this.value || ""; renderTable();
	}, 180));

	function load() {
		frappe.call({ method: API + ".get_stone_stock_overview" }).then((r) => { S.d = r.message || {}; renderAll(); });
	}
	page.add_inner_button(__("Refresh"), load);
	load();
};
