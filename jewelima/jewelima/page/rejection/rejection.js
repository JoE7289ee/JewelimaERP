// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Rejection (Design Bank) — every design whose product- or customer-photo
// candidate was rejected by an approver. The uploader retries here: pick a new
// image and it re-parks for approval (clearing the rejected flag). These cards
// also still sit in their normal update queue. Route: /app/rejection

frappe.pages["rejection"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Rejection", single_column: true });
	const API = "jewelima.jewelima.design_bank_api";
	const esc = frappe.utils.escape_html;
	let start = 0, pick = null; // {name, method}

	$(page.main).append(`
		<style>
		.rj-top{font-size:13px;color:var(--text-muted);margin-bottom:14px;}
		.rj-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px;}
		.rj-card{border:2px solid #f0c8c8;border-radius:9px;overflow:hidden;background:#fff;text-align:center;}
		.rj-card img{width:100%;height:210px;object-fit:contain;display:block;}
		.rj-card .n{font-weight:700;font-size:13px;padding:5px;}
		.rj-tag{display:inline-block;font-size:10px;font-weight:800;color:#b02a2a;border:1px solid #f0c8c8;border-radius:8px;padding:1px 8px;margin:0 2px 6px;}
		.rj-acts{display:flex;flex-direction:column;gap:6px;padding:0 10px 10px;}
		.rj-acts .btn{font-size:11px;}
		.rj-done{padding:36px;text-align:center;color:var(--text-muted);}
		</style>
		<div class="rj-top"></div>
		<div class="rj-grid"></div>
		<button class="btn btn-default rj-more" style="margin-top:12px;display:none;">${__("Load more")}</button>
		<input type="file" class="rj-file" accept="image/*" style="display:none;">
	`);
	const root = $(page.main);
	const bust = (u, m) => (u ? u + (u.includes("?") ? "&" : "?") + "m=" + encodeURIComponent(m || Date.now()) : u);

	function load(reset) {
		if (reset) { start = 0; root.find(".rj-grid").empty(); }
		frappe.call({ method: API + ".get_rejection_queue", args: { start, limit: 60 } }).then((r) => {
			const m = r.message || { rows: [], total: 0 };
			root.find(".rj-top").text(m.total
				? __("{0} rejected upload(s) — pick a new image to try again", [m.total]) : "");
			if (!m.total && !start) root.find(".rj-grid").html(`<div class="rj-done">${__("No rejections — nothing to redo. 🎉")}</div>`);
			root.find(".rj-grid").append(m.rows.map((d) => {
				const tags = [];
				let acts = "";
				if (d.photo_rejected) {
					tags.push(`<span class="rj-tag">${__("PRODUCT rejected")}</span>`);
					acts += `<button class="btn btn-primary btn-xs rj-retry" data-name="${esc(d.name)}" data-method="submit_photo_update">${__("Retry product photo")}</button>`;
				}
				if (d.customer_photo_rejected) {
					tags.push(`<span class="rj-tag">${__("CUSTOMER rejected")}</span>`);
					acts += `<button class="btn btn-primary btn-xs rj-retry" data-name="${esc(d.name)}" data-method="submit_customer_update">${__("Retry customer photo")}</button>`;
				}
				return `
				<div class="rj-card">
					<img loading="lazy" src="${esc(bust(d.photo || d.image || d.customer_image || "", d.modified))}">
					<div class="n">${esc(d.design_no)}</div>
					<div>${tags.join("")}</div>
					<div class="rj-acts">${acts}</div>
				</div>`;
			}).join(""));
			start += m.rows.length;
			root.find(".rj-more").toggle(start < m.total);
		});
	}
	root.on("click", ".rj-retry", function () {
		pick = { name: this.getAttribute("data-name"), method: this.getAttribute("data-method") };
		root.find(".rj-file").val("").get(0).click();
	});
	root.find(".rj-file").on("change", function () {
		const file = this.files[0];
		if (!file || !pick) return;
		const rd = new FileReader();
		rd.onload = () => {
			frappe.dom.freeze(__("Uploading for approval..."));
			frappe.call({ method: API + "." + pick.method, args: { name: pick.name, image_b64: rd.result } })
				.then(() => {
					frappe.dom.unfreeze();
					frappe.show_alert({ message: __("Re-submitted — back in Photo Approvals."), indicator: "green" }, 4);
					load(true);
				}).catch(() => frappe.dom.unfreeze());
		};
		rd.readAsDataURL(file);
	});
	root.find(".rj-more").on("click", () => load());
	load(true);
};
