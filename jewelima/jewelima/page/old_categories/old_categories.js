// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Old Categories (Design Bank) — the catalog EXACTLY as it lived before the
// import: every original folder with its cards. Pure reference — completely
// separate from the tag system, nothing here edits anything.
// Route: /app/old-categories

frappe.pages["old-categories"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Old Categories", single_column: true });
	const API = "jewelima.jewelima.design_bank_api";
	const esc = frappe.utils.escape_html;
	let FOLDERS = [];
	let curFolder = null, start = 0;

	$(page.main).append(`
		<style>
		.oc-cols{display:flex;gap:20px;align-items:flex-start;}
		.oc-left{flex:0 0 340px;}
		.oc-list{border:1px solid var(--border-color);border-radius:8px;background:var(--fg-color);overflow:auto;max-height:calc(100vh - 180px);}
		.oc-f{padding:7px 14px;border-bottom:1px solid var(--border-color);cursor:pointer;display:flex;justify-content:space-between;font-size:12.5px;}
		.oc-f:hover,.oc-f.on{background:var(--control-bg);}
		.oc-f .c{color:var(--text-muted);}
		.oc-search{margin-bottom:8px;}
		.oc-right{flex:1;min-width:0;}
		.oc-title{font-size:15px;font-weight:700;margin-bottom:10px;}
		.oc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px;}
		.oc-tile{border:1px solid var(--border-color);border-radius:8px;overflow:hidden;background:#fff;text-align:center;}
		.oc-tile img{width:100%;height:170px;object-fit:contain;display:block;}
		.oc-tile .n{font-size:12px;font-weight:700;padding:4px;}
		.oc-hint{color:var(--text-muted);padding:20px;font-size:13px;}
		</style>
		<div class="oc-cols">
			<div class="oc-left">
				<input type="text" class="form-control input-sm oc-search" placeholder="${__("filter folders…")}">
				<div class="oc-list"></div>
			</div>
			<div class="oc-right">
				<div class="oc-title"></div>
				<div class="oc-grid"></div>
				<button class="btn btn-default oc-more" style="margin-top:12px;display:none;">${__("Load more")}</button>
				<div class="oc-hint">${__("Pick a folder — this is the catalog exactly as it was kept before the import. Reference only.")}</div>
			</div>
		</div>
	`);
	const root = $(page.main);

	function paintFolders(filter) {
		const q = (filter || "").toUpperCase();
		root.find(".oc-list").html(FOLDERS
			.filter((f) => !q || f.folder.toUpperCase().includes(q))
			.map((f) => `<div class="oc-f ${f.folder === curFolder ? "on" : ""}" data-f="${esc(f.folder)}">
				<span>${esc(f.folder)}</span><span class="c">${f.count}</span></div>`).join(""));
	}
	frappe.call({ method: API + ".get_old_categories" }).then((r) => {
		FOLDERS = (r.message || {}).folders || [];
		paintFolders();
	});
	root.find(".oc-search").on("input", function () { paintFolders(this.value); });

	function load(reset) {
		if (reset) { start = 0; root.find(".oc-grid").empty(); }
		frappe.call({ method: API + ".get_old_category_designs", args: { folder: curFolder, start, limit: 60 } })
			.then((r) => {
				const m = r.message || { rows: [], total: 0 };
				root.find(".oc-title").text(`${curFolder} — ${m.total} ${__("design(s)")}`);
				root.find(".oc-grid").append(m.rows.map((d) => `
					<div class="oc-tile"><img loading="lazy" src="${esc(d.display)}" onerror="this.style.opacity=.2">
					<div class="n">${esc(d.design_no)}</div></div>`).join(""));
				start += m.rows.length;
				root.find(".oc-more").toggle(start < m.total);
			});
	}
	root.on("click", ".oc-f", function () {
		curFolder = $(this).data("f");
		root.find(".oc-hint").hide();
		paintFolders(root.find(".oc-search").val());
		load(true);
	});
	root.find(".oc-more").on("click", () => load());
};
