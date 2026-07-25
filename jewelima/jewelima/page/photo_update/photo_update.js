// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Photo Update (Design Bank) — the worker's queue: every card ticked Upgrade
// Photo that has no candidate yet. Click a tile, pick the better image — it
// parks as PENDING (nothing replaced) and moves to Photo Approvals.
// Route: /app/photo-update

frappe.pages["photo-update"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Photo Update", single_column: true });
	const API = "jewelima.jewelima.design_bank_api";
	const esc = frappe.utils.escape_html;
	let start = 0, picking = null;

	$(page.main).append(`
		<style>
		.pu-top{font-size:13px;color:var(--text-muted);margin-bottom:14px;}
		.pu-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px;}
		.pu-tile{border:2px solid var(--border-color);border-radius:9px;overflow:hidden;background:#fff;cursor:pointer;text-align:center;}
		.pu-tile:hover{border-color:#1f618d;}
		.pu-tile img{width:100%;height:210px;object-fit:contain;display:block;}
		.pu-tile .n{font-weight:700;font-size:13px;padding:5px;}
		.pu-tile .h{font-size:10.5px;color:var(--text-muted);padding-bottom:6px;}
		.pu-acts{display:flex;gap:6px;justify-content:center;padding:0 8px 10px;}
		.pu-acts .btn{font-size:11px;padding:2px 10px;}
		.pu-done{padding:36px;text-align:center;color:var(--text-muted);}
		</style>
		<div class="pu-top"></div>
		<div class="pu-grid"></div>
		<button class="btn btn-default pu-more" style="margin-top:12px;display:none;">${__("Load more")}</button>
		<input type="file" class="pu-file" accept="image/*" style="display:none;">
	`);
	const root = $(page.main);

	const bust = (u, m) => (u ? u + (u.includes("?") ? "&" : "?") + "m=" + encodeURIComponent(m || Date.now()) : u);
	function load(reset) {
		if (reset) { start = 0; root.find(".pu-grid").empty(); }
		frappe.call({ method: API + ".get_photo_update_queue", args: { start, limit: 30 } }).then((r) => {
			const m = r.message || { rows: [], total: 0 };
			root.find(".pu-top").text(m.total
				? __("{0} card(s) waiting for a better photo — click a tile and pick the image", [m.total]) : "");
			if (!m.total && !start) root.find(".pu-grid").html(`<div class="pu-done">${__("Nothing on the photo-update queue.")}</div>`);
			root.find(".pu-grid").append(m.rows.map((d) => {
				const src = d.raw_image || d.photo || d.image || "";
				return `
				<div class="pu-tile" data-name="${esc(d.name)}">
					<img loading="lazy" src="${esc(bust(d.photo || d.image || "", d.modified))}">
					<div class="n">${esc(d.design_no)}</div>
					<div class="pu-acts">
						<a class="btn btn-default btn-xs" href="${esc(src)}" download onclick="event.stopPropagation()">${__("Download source")}</a>
						<button class="btn btn-primary btn-xs pu-upload">${__("Upload new")}</button>
					</div>
				</div>`;
			}).join(""));
			start += m.rows.length;
			root.find(".pu-more").toggle(start < m.total);
		});
	}
	root.on("click", ".pu-upload", function (e) {
		e.stopPropagation();
		picking = $(this).closest(".pu-tile").data("name");
		root.find(".pu-file").val("").get(0).click();
	});
	root.find(".pu-file").on("change", function () {
		const file = this.files[0];
		if (!file || !picking) return;
		const rd = new FileReader();
		rd.onload = () => {
			frappe.dom.freeze(__("Uploading for approval..."));
			frappe.call({ method: API + ".submit_photo_update", args: { name: picking, image_b64: rd.result } })
				.then(() => {
					frappe.dom.unfreeze();
					frappe.show_alert({ message: __("Parked for approval — see Photo Approvals."), indicator: "green" }, 4);
					load(true);
				}).catch(() => frappe.dom.unfreeze());
		};
		rd.readAsDataURL(file);
	});
	root.find(".pu-more").on("click", () => load());
	load(true);
};
