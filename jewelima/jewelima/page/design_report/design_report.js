// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Design Report — the order-ready shelf: how many Designs stand ready, what
// they split into (karat / stones / type), which actually run and which sit
// idle. Design names jump to Design Info. Read-only board.
// Route: /app/design-report

frappe.pages["design-report"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Design Report", single_column: true });
	const esc = frappe.utils.escape_html;

	$(page.main).append(`
		<style>
		.drp{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px;}
		.drp .k{border:1px solid var(--border-color);border-radius:9px;background:var(--fg-color);padding:14px 18px;}
		.drp .k .t{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);}
		.drp .k .v{font-size:28px;font-weight:800;margin-top:4px;}
		.drp-h{margin:22px 0 8px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);}
		.drps{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;}
		.drps .k{border:1px solid var(--border-color);border-radius:9px;background:var(--fg-color);padding:9px 14px;}
		.drps .k .t{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);}
		.drps .k .v{font-size:20px;font-weight:800;margin-top:2px;}
		.drp-cols{display:flex;gap:22px;flex-wrap:wrap;align-items:flex-start;}
		table.drp-t{border-collapse:collapse;font-size:12.5px;background:var(--fg-color);min-width:380px;}
		table.drp-t th{background:var(--control-bg);font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);padding:5px 12px;border:1px solid var(--border-color);text-align:left;}
		table.drp-t td{border:1px solid var(--border-color);padding:5px 12px;}
		.drp-lnk{font-family:var(--font-family-monospace,monospace);font-weight:700;cursor:pointer;color:#1f618d;}
		</style>
		<div class="drp"></div>
		<div class="drp-break"></div>
		<div class="drp-cols" style="margin-top:22px;"></div>
	`);
	const root = $(page.main);

	const tiles = (rows) => rows.map(([t, v]) =>
		`<div class="k"><div class="t">${esc(t)}</div><div class="v">${(v || 0).toLocaleString("en-IN")}</div></div>`).join("");

	function paint(D) {
		root.find(".drp").html(tiles(D.kpis || []));
		root.find(".drp-break").html(
			`<div class="drp-h">${__("By Karat")}</div><div class="drps">${tiles(D.karats || [])}</div>
			<div class="drp-h">${__("By Stones")}</div><div class="drps">${tiles(D.tokens || [])}</div>
			<div class="drp-h">${__("By Type")}</div><div class="drps">${tiles(D.types || [])}</div>`);
		const t1 = (D.top || []).length ? `
			<div><div class="drp-h" style="margin-top:0;">${__("Most Run Designs")}</div>
			<table class="drp-t"><thead><tr><th>${__("Design")}</th><th>${__("Type")}</th>
				<th>${__("Bags ever")}</th><th>${__("Running now")}</th></tr></thead><tbody>
			${D.top.map((x) => `<tr><td><span class="drp-lnk" data-design="${esc(x.name)}">${esc(x.name)}</span></td>
				<td>${esc(x.design_type)}</td><td>${x.total}</td><td>${x.running || ""}</td></tr>`).join("")}
			</tbody></table></div>` : "";
		const t2 = (D.latest || []).length ? `
			<div><div class="drp-h" style="margin-top:0;">${__("Latest Minted")}</div>
			<table class="drp-t"><thead><tr><th>${__("Design")}</th><th>${__("Type")}</th>
				<th>${__("Minted")}</th><th>${__("Bags")}</th></tr></thead><tbody>
			${D.latest.map((x) => `<tr><td><span class="drp-lnk" data-design="${esc(x.name)}">${esc(x.name)}</span></td>
				<td>${esc(x.design_type)}</td><td>${esc(x.when)}</td><td>${x.bags || ""}</td></tr>`).join("")}
			</tbody></table></div>` : "";
		root.find(".drp-cols").html(t1 + t2);
	}

	root.on("click", ".drp-lnk", function () {
		frappe.route_options = { design: $(this).data("design") };
		frappe.set_route("design-info");
	});

	function load() {
		frappe.call({ method: "jewelima.jewelima.api.get_design_report", freeze: false })
			.then((r) => { if (r.message) paint(r.message); });
	}
	load();
	const t = setInterval(() => { if ($(wrapper).is(":visible")) load(); }, 30000);
	$(wrapper).on("remove", () => clearInterval(t));
};
