// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Design Duplicates (Design Bank) — the ONE-TIME cleanup: the import found
// several images for one design number. Each card shows every candidate;
// clicking one makes it THE photo (raw source), clears the rest, and the card
// flows on into the crop-rebuild + review pipeline. Route: /app/design-duplicates

frappe.pages["design-duplicates"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Design Duplicates", single_column: true });
	const API = "jewelima.jewelima.design_bank_api";
	const esc = frappe.utils.escape_html;

	$(page.main).append(`
		<style>
		.dd-top{font-size:13px;color:var(--text-muted);margin-bottom:14px;}
		.dd-card{border:1px solid var(--border-color);border-radius:9px;background:var(--fg-color);padding:14px 18px;margin-bottom:16px;}
		.dd-no{font-size:17px;font-weight:800;margin-bottom:10px;}
		.dd-cands{display:flex;gap:14px;flex-wrap:wrap;}
		.dd-cand{width:190px;cursor:pointer;border:3px solid var(--border-color);border-radius:8px;overflow:hidden;text-align:center;}
		.dd-cand:hover{border-color:#2e7d32;}
		.dd-cand img{width:100%;height:190px;object-fit:contain;background:#fff;display:block;}
		.dd-cand .f{font-size:10px;color:var(--text-muted);padding:3px 6px;word-break:break-all;}
		.dd-cand .m{font-size:10px;font-weight:700;color:#1f618d;}
		.dd-done{color:var(--text-muted);padding:30px;text-align:center;font-size:15px;}
		</style>
		<div class="dd-top"></div>
		<div class="dd-list"></div>
		<button class="btn btn-default dd-more" style="display:none;">${__("Load more")}</button>
	`);
	const root = $(page.main);
	let start = 0;

	function load(reset) {
		if (reset) { start = 0; root.find(".dd-list").empty(); }
		frappe.call({ method: API + ".get_duplicate_queue", args: { start, limit: 20 } }).then((r) => {
			const m = r.message || { rows: [], total: 0 };
			root.find(".dd-top").text(m.total
				? __("{0} design(s) need ONE photo picked — click the keeper", [m.total])
				: "");
			if (!m.total && !start) root.find(".dd-list").html(`<div class="dd-done">${__("Duplicate review finished — everything flows through Review now.")}</div>`);
			root.find(".dd-list").append(m.rows.map((d) => `
				<div class="dd-card" data-name="${esc(d.name)}">
					<div class="dd-no">${esc(d.design_no)} <span style="color:var(--text-muted);font-weight:400;font-size:12px;">· ${d.candidates.length} ${__("image(s)")}</span></div>
					<div class="dd-cands">${d.candidates.map((c) => `
						<div class="dd-cand" data-img="${esc(c.image)}">
							<img loading="lazy" src="${esc(c.image)}">
							${c.main ? `<div class="m">${__("current main")}</div>` : ""}
							<div class="f">${esc(c.source_file || "")}</div>
						</div>`).join("")}</div>
				</div>`).join(""));
			start += m.rows.length;
			root.find(".dd-more").toggle(start < m.total);
		});
	}
	root.on("click", ".dd-cand", function () {
		const card = $(this).closest(".dd-card");
		frappe.call({ method: API + ".resolve_duplicate",
			args: { name: card.data("name"), image: $(this).data("img") } }).then((r) => {
			card.slideUp(200, () => card.remove());
			const left = (r.message || {}).left || 0;
			root.find(".dd-top").text(left ? __("{0} design(s) need ONE photo picked — click the keeper", [left]) : "");
			if (!left) root.find(".dd-list").html(`<div class="dd-done">${__("Duplicate review finished.")}</div>`);
		});
	});
	root.find(".dd-more").on("click", () => load());
	load(true);
};
