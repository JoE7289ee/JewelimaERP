// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Stone Stock (CAD) — read-only answer to one question: IS THAT STONE FREE?
// Stone Issue warehouse only, and only what open production cards HAVEN'T
// already spoken for: free = stock there - still-to-issue plan demand. Sized
// diamonds add estimated pieces via the sieve chart. Route: /app/stone-stock

frappe.pages["stone-stock"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Stone Stock", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const S = { family: "", rows: [], families: [] };

	$(page.main).append(`
		<style>
		#page-stone-stock .container{max-width:100%;}
		.ss-top{display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin-bottom:10px;}
		.ss-top .frappe-control{margin:0;flex:0 0 240px;}
		.ss-top .control-label{font-size:11px;color:var(--text-muted);}
		.ss-count{margin-left:auto;color:var(--text-muted);font-size:12.5px;align-self:center;}
		.ss-pills{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px;}
		.ss-pill{border:1px solid var(--border-color);border-radius:12px;padding:2px 12px;font-size:12px;font-weight:600;cursor:pointer;background:var(--control-bg);user-select:none;}
		.ss-pill.on{background:var(--primary);border-color:var(--primary);color:#fff;}
		.ss-tbl{width:100%;border-collapse:separate;border-spacing:0;background:var(--fg-color);
			border:1px solid var(--border-color);border-radius:9px;overflow:hidden;font-size:13px;}
		.ss-tbl th{background:var(--control-bg);border-bottom:1px solid var(--border-color);padding:7px 12px;text-align:left;font-weight:700;white-space:nowrap;}
		.ss-tbl td{border-bottom:1px solid var(--border-color);padding:6px 12px;vertical-align:top;}
		.ss-tbl tbody tr:last-child td{border-bottom:0;}
		.ss-tbl td.num,.ss-tbl th.num{text-align:right;font-variant-numeric:tabular-nums;}
		.ss-item{font-weight:700;}
		.ss-wh{font-size:11.5px;color:var(--text-muted);}
		.ss-none{padding:36px;text-align:center;color:var(--text-muted);}
		</style>
		<div class="ss-top"><div class="ss-search"></div><span class="ss-count"></span></div>
		<div class="ss-pills"></div>
		<div class="ss-body"></div>
	`);
	const root = $(page.main);

	const search = frappe.ui.form.make_control({
		df: { fieldtype: "Data", label: __("Search item"), placeholder: __("SI-IJ 2-2.5 …"),
			onchange: () => load() },
		parent: root.find(".ss-search").get(0), render_input: true,
	});
	search.refresh();
	search.$input.on("input", frappe.utils.debounce(() => load(), 350));

	function load() {
		frappe.call({ method: API + ".get_stone_stock", args: {
			search: (search.get_value() || "").trim() || null, family: S.family || null,
		} }).then((r) => {
			const m = r.message || {};
			S.rows = m.rows || []; S.families = m.families || [];
			paint();
		});
	}

	function paint() {
		root.find(".ss-pills").html(S.families.length
			? `<span class="ss-pill ${S.family ? "" : "on"}" data-f="">${__("All")}</span>` +
			  S.families.map((f) => `<span class="ss-pill ${S.family === f ? "on" : ""}" data-f="${esc(f)}">${esc(f)}</span>`).join("")
			: "");
		const totFree = S.rows.reduce((a, r) => a + r.free, 0);
		root.find(".ss-count").text(S.rows.length
			? __("{0} stone(s) free at Stone Issue · {1} ct", [S.rows.length, totFree.toFixed(3)]) : "");
		root.find(".ss-body").html(S.rows.length ? `<table class="ss-tbl"><thead><tr>
			<th>${__("Stone")}</th><th>${__("Group")}</th><th class="num">${__("Free (ct)")}</th>
			<th class="num">${__("~ Pieces")}</th><th class="num">${__("In Stock")}</th><th class="num">${__("Planned to issue")}</th></tr></thead><tbody>` +
			S.rows.map((r) => `<tr>
				<td class="ss-item">${esc(r.item)}</td>
				<td>${esc(r.group)}</td>
				<td class="num"><b style="color:#2e7d32;">${r.free.toFixed(3)}</b></td>
				<td class="num">${r.est_pcs != null ? "~" + r.est_pcs : ""}</td>
				<td class="num" style="color:var(--text-muted);">${r.stock.toFixed(3)}</td>
				<td class="num" style="color:var(--text-muted);">${r.planned ? r.planned.toFixed(3) : "—"}</td>
			</tr>`).join("") + "</tbody></table>"
			: `<div class="ss-none">${__("Nothing free at Stone Issue matches.")}</div>`);
	}

	root.on("click", ".ss-pill", function () {
		S.family = $(this).attr("data-f");
		load();
	});
	page.set_primary_action(__("Refresh"), () => load(), "refresh");
	load();
};
