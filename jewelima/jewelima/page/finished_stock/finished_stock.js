// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Finished Stock (Reports > Stock Reports) — the finished pool (Finished Goods +
// At Certification warehouses) grouped by PRODUCT: rows = designs, columns = the
// customer each piece is reserved to (held_by), cells = piece counts (weights +
// barcodes in the tooltip), per-holder status chips (S in stock · C at
// certification). Raw materials never show loose here — that's In Bags' job.
// Route: /app/finished-stock

frappe.pages["finished-stock"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Finished Stock", single_column: true });
	const API = "jewelima.jewelima.api";
	const S = { d: null, term: "", type: "" };

	$(page.main).append(`
		<style>
		.fs-cards{display:flex;gap:12px;flex-wrap:wrap;margin:2px 0 12px;}
		.fs-card{border:1px solid var(--border-color);border-radius:8px;background:var(--fg-color);padding:10px 16px;min-width:150px;}
		.fs-card .lb{font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;}
		.fs-card .v{font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;}
		.fs-card.gold{box-shadow:inset 3px 0 0 #b8860b;}
		.fs-card.stone{box-shadow:inset 3px 0 0 #1c5da8;}
		.fs-top{display:flex;align-items:center;gap:10px;margin:0 0 10px;flex-wrap:wrap;}
		.fs-search{width:260px;border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);padding:4px 10px;height:30px;border-radius:5px;box-sizing:border-box;color:var(--text-color);font-size:13px;}
		.fs-pill{border:1px solid var(--border-color);background:var(--fg-color);border-radius:14px;padding:3px 13px;font-size:12px;cursor:pointer;}
		.fs-pill.on{background:var(--primary);color:#fff;border-color:var(--primary);font-weight:600;}
		.fs-count{color:var(--text-muted);font-size:12px;margin-left:auto;}
		.fs-box{border:1px solid var(--border-color);border-radius:8px;overflow:auto;max-height:calc(100vh - 250px);background:var(--fg-color);}
		table.fs-tbl{border-collapse:separate;border-spacing:0;font-size:12.5px;min-width:100%;}
		table.fs-tbl th{position:sticky;top:0;z-index:2;background:var(--control-bg,var(--fg-color));border-bottom:2px solid var(--gray-400,#aeb6bf);padding:6px 10px;text-align:right;white-space:nowrap;font-weight:700;vertical-align:bottom;}
		table.fs-tbl th:first-child{left:0;z-index:3;text-align:left;}
		table.fs-tbl td:first-child{position:sticky;left:0;background:var(--fg-color);text-align:left;z-index:1;border-right:1px solid var(--border-color);}
		table.fs-tbl tr:hover td{filter:brightness(.97);}
		table.fs-tbl td{border-bottom:1px solid var(--border-color);padding:5px 10px;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}
		table.fs-tbl td.tot,table.fs-tbl th.tot{font-weight:800;border-left:2px solid var(--gray-400,#aeb6bf);}
		.fs-holder{font-weight:800;}
		.fs-holder-sub{font-size:10.5px;color:var(--text-muted);font-weight:400;}
		.fs-st{display:inline-block;border-radius:8px;padding:0 6px;font-size:10px;font-weight:700;margin-left:3px;}
		.fs-st.s{background:#eaf6ec;color:#1d7a33;}
		.fs-st.c{background:#fdf3e3;color:#9a6700;}
		.fs-prod{display:flex;align-items:center;gap:8px;}
		.fs-prod img{width:28px;height:28px;border-radius:4px;object-fit:cover;border:1px solid var(--border-color);}
		.fs-prod .noimg{width:28px;height:28px;border-radius:4px;background:var(--control-bg);border:1px solid var(--border-color);display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:13px;}
		.fs-name{font-weight:700;}
		.fs-sub{display:block;font-size:10.5px;color:var(--text-muted);font-weight:400;}
		td.fs-cell{background:rgba(29,122,51,var(--a,0));cursor:default;}
		.fs-pc{font-weight:700;}
		.fs-unit{color:var(--text-muted);font-size:10px;margin-left:2px;}
		.fs-wt{display:block;font-size:10px;color:var(--text-muted);}
		.fs-empty{padding:18px;text-align:center;color:var(--text-muted);}
		.fs-hint{margin:10px 2px 0;color:var(--text-muted);font-size:12px;}
		</style>
		<div class="fs-cards"></div>
		<div class="fs-top">
			<input class="fs-search" type="text" placeholder="${__("Search products…")}">
			<span class="fs-pills"></span>
			<span class="fs-count"></span>
		</div>
		<div class="fs-box"><table class="fs-tbl"><thead class="fs-head"></thead><tbody class="fs-body"></tbody></table></div>
		<div class="fs-hint">${__("Finished pieces (Finished Goods + At Certification warehouses) grouped by product, split by the customer holding them. Cells count pieces — hover for weights and card numbers. Chips per holder: S in stock · C at certification.")}</div>
	`);

	const root = $(page.main)[0];
	const esc = frappe.utils.escape_html;
	const fmt = (v) => flt(v).toFixed(3);

	function render() {
		const d = S.d || {};
		const t = d.totals || {};
		root.querySelector(".fs-cards").innerHTML = `
			<div class="fs-card"><div class="lb">${__("Pieces")}</div><div class="v">${t.pieces || 0}</div></div>
			<div class="fs-card"><div class="lb">${__("Products")}</div><div class="v">${t.products || 0}</div></div>
			<div class="fs-card"><div class="lb">${__("Holders")}</div><div class="v">${t.holders || 0}</div></div>
			<div class="fs-card gold"><div class="lb">${__("Gold in pieces")}</div><div class="v">${fmt(t.gold || 0)} g</div></div>
			<div class="fs-card stone"><div class="lb">${__("Stones in pieces")}</div><div class="v">${fmt(t.stones || 0)} ct</div></div>`;

		// design-type pills, from the data
		const types = [...new Set((d.products || []).map((p) => p.design_type).filter(Boolean))].sort();
		if (!types.includes(S.type)) S.type = "";
		root.querySelector(".fs-pills").innerHTML = [["", __("All")]].concat(types.map((x) => [x, x]))
			.map(([k, lb]) => `<span class="fs-pill${k === S.type ? " on" : ""}" data-t="${esc(k)}">${esc(lb)}</span>`)
			.join("");

		const term = S.term.toLowerCase().trim();
		const rows = (d.products || []).filter((p) =>
			(!S.type || p.design_type === S.type) &&
			(!term || p.design.toLowerCase().includes(term) || (p.design_type || "").toLowerCase().includes(term)));
		const locs = d.locations || [];
		root.querySelector(".fs-count").textContent = __("{0} product(s)", [rows.length]);

		const ST = { "In Stock": ["s", "S"], "At Certification": ["c", "C"] };
		const stChip = (sts) =>
			Object.keys(ST).concat(Object.keys(sts).filter((k) => !ST[k]))
				.filter((k) => sts[k] && sts[k].cards)
				.map((k) => {
					const [cls, lb] = ST[k] || ["s", k[0]];
					return `<span class="fs-st ${cls}" title="${esc(k)}: ${sts[k].cards} ${__("piece(s)")} · ${fmt(sts[k].gold)} g · ${fmt(sts[k].stones)} ct">${lb}${sts[k].cards}</span>`;
				}).join("");
		root.querySelector(".fs-head").innerHTML = `<tr>
			<th>${__("Product")}</th>
			${locs.map((l) => `<th><span class="fs-holder">${esc(l.label)}</span>${stChip(l.statuses)}<br>
				<span class="fs-holder-sub">${l.cards} ${__("pc")} · ${fmt(l.gold)} g · ${fmt(l.stones)} ct</span></th>`).join("")}
			<th class="tot">${__("Total")}</th>
		</tr>`;

		const body = root.querySelector(".fs-body");
		body.innerHTML = rows.length
			? rows.map((p) => {
				const max = Math.max(...Object.values(p.cells).map((c) => c.pc), 1);
				return `<tr>
					<td><span class="fs-prod">
						${p.image ? `<img src="${esc(p.image)}" loading="lazy">` : `<span class="noimg">◇</span>`}
						<span><span class="fs-name">${esc(p.design)}</span>
						<span class="fs-sub">${esc(p.design_type || "")} · ${fmt(p.gold)} g · ${fmt(p.stones)} ct</span></span>
					</span></td>
					${locs.map((l) => {
						const c = p.cells[l.location];
						if (!c) return `<td>·</td>`;
						const a = (0.10 + 0.32 * (c.pc / max)).toFixed(2);
						const tip = `${c.pc} ${__("piece(s)")} · ${fmt(c.gold)} g · ${fmt(c.stones)} ct\n${(c.bags || []).join(" · ")}`;
						return `<td class="fs-cell" style="--a:${a}" title="${esc(tip)}">
							<span class="fs-pc">${c.pc}</span><span class="fs-unit">pc</span>
							<span class="fs-wt">${fmt(c.gold)} g · ${fmt(c.stones)} ct</span></td>`;
					}).join("")}
					<td class="tot">${p.pieces}<span class="fs-unit">pc</span></td>
				</tr>`;
			}).join("")
			: `<tr><td colspan="${locs.length + 2}" class="fs-empty">${(d.products || []).length ? __("Nothing matches.") : __("No finished pieces in stock yet — make products or import stock first.")}</td></tr>`;
	}

	function load() {
		frappe.call({ method: API + ".get_finished_stock_matrix" }).then((r) => {
			S.d = r.message || {};
			render();
		});
	}
	root.querySelector(".fs-search").addEventListener("input", frappe.utils.debounce(function () {
		S.term = this.value || "";
		render();
	}, 200));
	$(page.main).on("click", ".fs-pill", function () {
		S.type = this.getAttribute("data-t") || "";
		render();
	});
	page.add_inner_button(__("Refresh"), load);
	load();
};
