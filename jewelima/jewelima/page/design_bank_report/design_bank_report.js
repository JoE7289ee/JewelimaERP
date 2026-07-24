// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
// Design Bank Report — the KPI board. Route: /app/design-bank-report

frappe.pages["design-bank-report"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Design Bank Report", single_column: true });
	$(page.main).append(`
		<style>
		.dbr{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px;}
		.dbr .k{border:1px solid var(--border-color);border-radius:9px;background:var(--fg-color);padding:16px 18px;}
		.dbr .k .t{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);}
		.dbr .k .v{font-size:30px;font-weight:800;margin-top:4px;}
		.dbr-h{margin:22px 0 10px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);}
		.dbrs{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;}
		.dbrs .k{border:1px solid var(--border-color);border-radius:9px;background:var(--fg-color);padding:11px 14px;}
		.dbrs .k .t{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);}
		.dbrs .k .v{font-size:22px;font-weight:800;margin-top:2px;}
		</style><div class="dbr"></div><div class="dbr-series"></div>`);
	function load() {
		frappe.call({ method: "jewelima.jewelima.design_bank_api.design_bank_report", freeze: false }).then((r) => {
			const k = (r.message || {}).kpis || [];
			$(page.main).find(".dbr").html(k.map(([t, v]) =>
				`<div class="k"><div class="t">${frappe.utils.escape_html(t)}</div><div class="v">${(v || 0).toLocaleString("en-IN")}</div></div>`).join(""));
			const sr = (r.message || {}).series || [];
			$(page.main).find(".dbr-series").html(!sr.length ? "" :
				`<div class="dbr-h">New Designs by Type</div><div class="dbrs">` + sr.map(([t, v]) =>
				`<div class="k"><div class="t">${frappe.utils.escape_html(t)}</div><div class="v">${(v || 0).toLocaleString("en-IN")}</div></div>`).join("") + `</div>`);
		});
	}
	load();
	// live board: refresh every 30s while visible (the rebuild/OCR loops move it)
	const t = setInterval(() => { if ($(wrapper).is(":visible")) load(); }, 30000);
	$(wrapper).on("remove", () => clearInterval(t));
};
