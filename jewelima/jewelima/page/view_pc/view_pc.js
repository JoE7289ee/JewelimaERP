// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// View PC — the READ-ONLY price chart viewer for the E-SMITH desk: every
// chart's latest (Active) printable letter, on screen and on paper. No
// editing, no saving — the Price Charts page owns changes.
// Route: /app/view-pc

frappe.pages["view-pc"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "View PC", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	let CHARTS = [];  // active charts [{name, chart_name, chart_date}]
	let CUR = null;   // selected chart name
	let HTML = "";    // its letter, as served

	$(page.main).append(`
		<style>
		#page-view-pc .container{max-width:100%;}
		.vp-cols{display:flex;gap:16px;align-items:flex-start;}
		.vp-left{flex:0 0 300px;}
		.vp-list{border:1px solid var(--border-color);border-radius:10px;background:var(--fg-color);overflow:auto;max-height:calc(100vh - 180px);}
		.vp-c{padding:9px 14px;border-bottom:1px solid var(--border-color);cursor:pointer;}
		.vp-c:hover,.vp-c.on{background:var(--control-bg);}
		.vp-c .n{font-weight:800;font-size:13px;}
		.vp-c .d{font-size:11px;color:var(--text-muted);}
		.vp-right{flex:1;min-width:0;}
		.vp-btn{border:none;color:#fff;font-weight:800;padding:9px 20px;border-radius:8px;cursor:pointer;background:#5b3a8e;display:none;margin-bottom:10px;}
		.vp-frame{width:100%;height:calc(100vh - 230px);border:1px solid var(--border-color);border-radius:10px;background:#fff;display:none;}
		.vp-none{padding:34px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:10px;}
		</style>
		<div class="vp-cols">
			<div class="vp-left">
				<input type="text" class="form-control input-sm vp-search" placeholder="${__("filter charts…")}" style="margin-bottom:8px;">
				<div class="vp-list"></div>
			</div>
			<div class="vp-right">
				<button class="vp-btn">${__("Print 🖨")}</button>
				<div class="vp-none">${__("Pick a chart on the left — its latest printable letter shows here.")}</div>
				<iframe class="vp-frame"></iframe>
			</div>
		</div>
	`);
	const root = $(page.main);

	function paintList(q) {
		const needle = (q || "").toUpperCase();
		root.find(".vp-list").html(CHARTS
			.filter((c) => !needle || (c.chart_name || "").toUpperCase().includes(needle))
			.map((c) => `<div class="vp-c ${c.name === CUR ? "on" : ""}" data-n="${esc(c.name)}">
				<div class="n">${esc(c.chart_name || c.name)}</div>
				<div class="d">${esc(c.chart_date || "")} · ${esc(c.name)}</div>
			</div>`).join("") || `<div style="padding:14px;color:var(--text-muted);font-size:12px;">${__("no charts")}</div>`);
	}

	frappe.call({ method: API + ".get_price_chart_list" }).then((r) => {
		CHARTS = ((r.message || {}).groups || []).map((g) => g.active).filter(Boolean);
		paintList();
	});

	root.on("input", ".vp-search", function () {
		paintList(this.value);
	});

	root.on("click", ".vp-c", function () {
		CUR = $(this).data("n");
		paintList(root.find(".vp-search").val());
		frappe.call({ method: API + ".price_chart_letter", args: { name: CUR } }).then((r) => {
			HTML = (r.message || {}).html || "";
			root.find(".vp-none").hide();
			root.find(".vp-btn").show();
			const fr = root.find(".vp-frame").show().get(0);
			fr.srcdoc = HTML;
		});
	});

	root.on("click", ".vp-btn", () => {
		if (!HTML) return;
		const fr = root.find(".vp-frame").get(0);
		if (!fr) return;
		fr.contentWindow.focus();
		fr.contentWindow.print();
	});
};
