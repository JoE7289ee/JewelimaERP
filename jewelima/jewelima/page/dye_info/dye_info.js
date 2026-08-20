// Dye Info — the tooling at a glance: how many dyes, how healthy, how well the
// register maps onto the Design Bank, and what every drawer holds.
frappe.pages["dye-info"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Dye Info"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const ni = (v) => (v || 0).toLocaleString();

	$(page.main).append(`
		<style>
		#page-dye-info .container{max-width:100%;}
		.di-hero{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:18px;}
		.di-tile{border:1px solid var(--border-color);border-radius:14px;background:var(--fg-color);padding:14px 16px;}
		.di-tile .k{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);font-weight:700;}
		.di-tile .v{font-size:26px;font-weight:800;margin-top:3px;font-variant-numeric:tabular-nums;}
		.di-tile .s{font-size:11px;color:var(--text-muted);}
		.di-tile.good .v{color:#1d7a33;} .di-tile.bad .v{color:#b02a2a;}
		.di-sec{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin:6px 2px 10px;}
		.di-drawers{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;}
		.di-d{border:1px solid var(--border-color);border-radius:10px;background:var(--fg-color);padding:8px 11px;font-size:12px;}
		.di-d b{font-size:15px;}
		.di-d .dmg{color:#b02a2a;font-weight:700;font-size:10.5px;}
		.di-d.empty{opacity:.5;}
		</style>
		<div class="di-hero"></div>
		<div class="di-sec">${__("Drawer by drawer")}</div>
		<div class="di-drawers"></div>`);
	const root = $(page.main);

	function load() {
		frappe.call({ method: API + ".get_dye_info" }).then((r) => {
			const m = r.message || {};
			const tile = (cls, k, v, s) => `<div class="di-tile ${cls}"><div class="k">${k}</div>
				<div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ""}</div>`;
			root.find(".di-hero").html(
				tile("", __("Dyes"), ni(m.total)) +
				tile("good", __("Healthy"), ni(m.healthy)) +
				tile("bad", __("Damaged"), ni(m.damaged)) +
				tile("", __("Designs covered"), ni(m.designs)) +
				tile("good", __("Matched to the bank"), ni(m.designs_matched),
					__("{0} of {1} designs — {2} dye(s)", [ni(m.designs_matched), ni(m.designs), ni(m.dyes_matched)])) +
				tile("", __("In a drawer"), ni(m.placed), m.unplaced ? __("{0} unplaced", [ni(m.unplaced)]) : ""));
			root.find(".di-drawers").html((m.drawers || []).map((d) => `
				<div class="di-d ${d.n ? "" : "empty"}"><b>${esc(d.name)}</b> · ${ni(d.n)}
					${d.damaged ? `<span class="dmg">· ${ni(d.damaged)} ${__("dmg")}</span>` : ""}</div>`).join(""));
		});
	}
	page.add_inner_button(__("Refresh"), load);
	frappe.pages["dye-info"].on_page_show = load;
	load();
};
