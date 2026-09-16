// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Export Formats (Delivery > Delivery Settings) — every format a parcel can be
// papered in, and exactly what each sheet carries.
//
// A buyer's format is picked on Prepare to Sell; this is where the desk can see,
// before sending anything, which sheets that format produces, whether a sheet
// carries money, whether it is signed for, and its columns in order. Read only:
// the formats are defined in code (SALE_PREP_FORMATS in api.py).
// Route: /app/export-formats

frappe.pages["export-formats"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Export Formats"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const root = $(page.main);

	root.append(`
		<style>
		#page-export-formats .container{max-width:100%;}
		.ef-grid{display:flex;flex-direction:column;gap:16px;}
		.ef-fmt{border:1px solid var(--border-color);border-radius:14px;background:var(--fg-color);overflow:hidden;}
		.ef-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:13px 17px;
			border-bottom:1px solid var(--border-color);background:var(--control-bg);}
		.ef-head h3{font-size:16px;font-weight:800;margin:0;}
		.ef-head .n{font-size:12px;color:var(--text-muted);}
		.ef-docs{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:0;}
		.ef-doc{padding:14px 17px;border-right:1px solid var(--border-color);border-bottom:1px solid var(--border-color);}
		.ef-doc h4{font-size:14px;font-weight:800;margin:0 0 3px;}
		.ef-doc .note{font-size:12.5px;color:var(--text-muted);margin-bottom:9px;}
		.ef-tags{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px;}
		.ef-tag{font-size:9.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;
			border-radius:20px;padding:2px 9px;}
		.ef-tag.money{background:rgba(29,122,51,.15);color:#1d7a33;}
		.ef-tag.nomoney{background:var(--control-bg);color:var(--text-muted);border:1px solid var(--border-color);}
		.ef-tag.sign{background:rgba(31,97,141,.15);color:#1f618d;}
		.ef-tag.sort{background:rgba(224,168,0,.2);color:#8a6508;}
		[data-theme="dark"] .ef-tag.money{color:#7fc98f;}
		[data-theme="dark"] .ef-tag.sign{color:#8fc1e8;}
		[data-theme="dark"] .ef-tag.sort{color:#e8b84a;}
		.ef-cols-h{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:5px;}
		.ef-cols{display:flex;flex-wrap:wrap;gap:4px;counter-reset:col;}
		.ef-col{font-size:11.5px;border:1px solid var(--border-color);border-radius:6px;padding:1px 7px;
			background:var(--fg-color);white-space:nowrap;}
		.ef-col::before{counter-increment:col;content:counter(col) ". ";color:var(--text-muted);font-size:10.5px;}
		.ef-full{font-size:12px;color:var(--text-muted);}
		.ef-empty{padding:40px;text-align:center;color:var(--text-muted);}
		</style>
		<div class="ef-grid"></div>`);

	function paint(formats) {
		root.find(".ef-grid").html(formats.length ? formats.map((f) => `
			<div class="ef-fmt">
				<div class="ef-head">
					<h3>${esc(f.label)}</h3>
					<span class="n">${__("{0} sheet(s)", [f.docs.length])}</span>
					${f.sortable ? `<span class="ef-tag sort">${__("Has a Sort into the buyer's order")}</span>` : ""}
				</div>
				<div class="ef-docs">${f.docs.map((d) => `
					<div class="ef-doc">
						<h4>${esc(d.label)}</h4>
						<div class="note">${esc(d.note || "")}</div>
						<div class="ef-tags">
							${d.money ? `<span class="ef-tag money">${__("Carries money")}</span>`
								: `<span class="ef-tag nomoney">${__("No money on it")}</span>`}
							${d.signed ? `<span class="ef-tag sign">${__("Signed for")}</span>` : ""}
						</div>
						${d.columns.length ? `<div class="ef-cols-h">${__("Columns")}</div>
							<div class="ef-cols">${d.columns.map((c) => `<span class="ef-col">${esc(c)}</span>`).join("")}</div>`
							: `<div class="ef-full">${__("The full billing sheet: every piece with gold, making, back chain, diamonds by bracket, charges and the total, with live formulas.")}</div>`}
					</div>`).join("")}
				</div>
			</div>`).join("")
			: `<div class="ef-empty">${__("No formats defined.")}</div>`);
	}

	function load() {
		return frappe.call({ method: API + ".get_export_formats" }).then((r) => paint((r.message || {}).formats || []));
	}
	page.set_secondary_action(__("Refresh"), load, "refresh");
	load();

	// come back to the page, come back to fresh figures: frappe builds a desk
	// page once and only re-shows it, so the read has to be re-run on show.
	frappe.pages["export-formats"].on_page_show = () => { load(); };
};
