// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Search Design (Design Bank) — find ANY design number, retired included.
// Tiles show the RAW scan unless the card is Approved (then the info card);
// clicking a tile offers exactly one thing: download the raw image.
// Route: /app/search-design

frappe.pages["search-design"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Search Design", single_column: true });
	const API = "jewelima.jewelima.design_bank_api";
	const esc = frappe.utils.escape_html;
	let timer = null;

	$(page.main).append(`
		<style>
		.sd-bar{max-width:360px;margin-bottom:14px;}
		.sd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;}
		.sd-tile{border:2px solid var(--border-color);border-radius:9px;overflow:hidden;background:#fff;cursor:pointer;text-align:center;position:relative;}
		.sd-tile:hover{border-color:#1f618d;}
		.sd-tile img{width:100%;height:200px;object-fit:contain;display:block;}
		.sd-tile .n{font-weight:700;font-size:13px;padding:5px 5px 8px;}
		.sd-st{position:absolute;top:6px;right:6px;font-size:9.5px;font-weight:700;border-radius:8px;padding:1px 7px;color:#fff;}
		.sd-st.Approved{background:#2e7d32;}.sd-st.Pending{background:#7f8c8d;}.sd-st.Retired{background:#b02a2a;}
		.sd-hint{color:var(--text-muted);padding:24px;font-size:13px;}
		</style>
		<div class="sd-bar"><input type="text" class="form-control sd-q" placeholder="${__("search any design no — retired included…")}"></div>
		<div class="sd-grid"></div>
		<div class="sd-hint">${__("Type at least 2 characters.")}</div>
	`);
	const root = $(page.main);
	root.find(".sd-q").on("input", function () {
		const v = this.value.trim();
		clearTimeout(timer);
		timer = setTimeout(() => search(v), 300);
	});
	setTimeout(() => root.find(".sd-q").focus(), 200);

	function search(q) {
		if (q.length < 2) { root.find(".sd-grid").empty(); root.find(".sd-hint").show().text(__("Type at least 2 characters.")); return; }
		frappe.call({ method: API + ".search_designs", args: { q }, freeze: false }).then((r) => {
			const rows = (r.message || {}).rows || [];
			root.find(".sd-hint").toggle(!rows.length).text(rows.length ? "" : __("No design matches {0}.", [q]));
			root.find(".sd-grid").html(rows.map((d) => `
				<div class="sd-tile" data-raw="${esc(d.raw)}" data-no="${esc(d.design_no)}">
					<span class="sd-st ${esc(d.status)}">${esc(d.status)}</span>
					<img loading="lazy" src="${esc(d.display)}" onerror="this.style.opacity=.2">
					<div class="n">${esc(d.design_no)}</div>
				</div>`).join(""));
		});
	}
	// click = the one option: download the raw
	root.on("click", ".sd-tile", function () {
		const raw = $(this).data("raw");
		if (!raw) return frappe.show_alert({ message: __("No raw image on this card."), indicator: "orange" }, 3);
		const a = document.createElement("a");
		a.href = raw;
		a.download = $(this).data("no");
		document.body.appendChild(a);
		a.click();
		a.remove();
	});
};
