// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Retired Designs (Design Bank) — the shelf. Retired cards keep their codes
// reserved; but a scan that was never a real design can be PURGED here:
// record + every image gone from the system forever (code frees up again).
// Approver-only. Route: /app/retired-designs

frappe.pages["retired-designs"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Retired Designs", single_column: true });
	const API = "jewelima.jewelima.design_bank_api";
	const esc = frappe.utils.escape_html;
	let start = 0;

	$(page.main).append(`
		<style>
		.rd-bar{display:flex;gap:10px;margin-bottom:14px;align-items:center;}
		.rd-bar input{max-width:280px;}
		.rd-top{font-size:13px;color:var(--text-muted);}
		.rd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;}
		.rd-tile{border:2px solid var(--border-color);border-radius:9px;overflow:hidden;background:#fff;text-align:center;}
		.rd-tile img{width:100%;height:190px;object-fit:contain;display:block;}
		.rd-tile .n{font-weight:700;font-size:13px;padding:4px;}
		.rd-tile .f{font-size:10px;color:var(--text-muted);padding:0 6px 6px;word-break:break-all;}
		.rd-tile .del{margin:0 8px 10px;}
		.rd-empty{color:var(--text-muted);padding:24px;}
		</style>
		<div class="rd-bar">
			<input type="text" class="form-control input-sm rd-q" placeholder="${__("filter design no…")}">
			<span class="rd-top"></span>
		</div>
		<div class="rd-grid"></div>
		<button class="btn btn-default rd-more" style="margin-top:12px;display:none;">${__("Load more")}</button>
	`);
	const root = $(page.main);
	let timer;

	function load(reset) {
		if (reset) { start = 0; root.find(".rd-grid").empty(); }
		frappe.call({ method: API + ".get_retired_designs",
			args: { start, limit: 60, q: root.find(".rd-q").val() || null } }).then((r) => {
			const m = r.message || { rows: [], total: 0 };
			root.find(".rd-top").text(m.total ? __("{0} retired design(s)", [m.total]) : "");
			if (!m.total && !start) root.find(".rd-grid").html(`<div class="rd-empty">${__("Nothing retired.")}</div>`);
			root.find(".rd-grid").append(m.rows.map((d) => `
				<div class="rd-tile" data-name="${esc(d.name)}">
					<img loading="lazy" src="${esc(d.display)}" onerror="this.style.opacity=.2">
					<div class="n">${esc(d.design_no)}</div>
					<div class="f">${esc(d.source_folder || "")}</div>
					<button class="btn btn-xs back" style="background:#2e7d32;border-color:#2e7d32;color:#fff;margin-right:4px;">${__("Bring back")}</button>
					<button class="btn btn-xs del" style="background:#b02a2a;border-color:#b02a2a;color:#fff;">${__("Delete forever")}</button>
				</div>`).join(""));
			start += m.rows.length;
			root.find(".rd-more").toggle(start < m.total);
		});
	}
	root.find(".rd-q").on("input", () => { clearTimeout(timer); timer = setTimeout(() => load(true), 300); });
	root.find(".rd-more").on("click", () => load());

	// bring back = un-retire, straight into the Review queue (one click)
	root.on("click", ".rd-tile .back", function () {
		const tile = $(this).closest(".rd-tile");
		frappe.call({ method: API + ".design_bring_back", args: { name: tile.data("name") } })
			.then((r) => {
				tile.slideUp(150, () => tile.remove());
				frappe.show_alert({ message: __("{0} is back — Pending in Review.", [(r.message || {}).design_no]), indicator: "green" }, 5);
			});
	});

	root.on("click", ".rd-tile .del", function () {
		const tile = $(this).closest(".rd-tile");
		frappe.confirm(
			__("Delete this FOREVER? Record and every image leave the system — only for scans that were never real designs. The code frees up again."),
			() => frappe.call({ method: API + ".design_delete_forever", args: { name: tile.data("name") } })
				.then((r) => {
					tile.slideUp(150, () => tile.remove());
					const m = r.message || {};
					frappe.show_alert({ message: __("{0} purged.", [m.deleted]), indicator: "orange" }, 4);
					root.find(".rd-top").text(m.left ? __("{0} retired design(s)", [m.left]) : "");
				}));
	});
	load(true);
};
