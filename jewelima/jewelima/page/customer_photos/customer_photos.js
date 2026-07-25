// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Customer Photos (Design Bank) — its own queue and tracking, separate from
// product-photo updates. Cards flagged "customer image needed" (best sellers)
// wait here: download the source shot, upload the customer-facing image —
// stored as <code>.customer.png, goes live directly (no approval leg), the
// flag clears and the card drops off. Route: /app/customer-photos

frappe.pages["customer-photos"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Customer Photos", single_column: true });
	const API = "jewelima.jewelima.design_bank_api";
	const esc = frappe.utils.escape_html;
	let start = 0;
	let curName = null;

	$(page.main).append(`
		<style>
		.cp-top{font-size:13px;color:var(--text-muted);margin-bottom:12px;}
		.cp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px;}
		.cp-card{border:1px solid var(--border-color);border-radius:9px;background:var(--fg-color);overflow:hidden;}
		.cp-card img{width:100%;height:230px;object-fit:contain;background:#fff;display:block;}
		.cp-card .n{font-weight:700;font-size:13px;padding:6px 10px 0;}
		.cp-card .a{display:flex;gap:6px;padding:8px 10px 10px;}
		.cp-empty{padding:40px;text-align:center;color:var(--text-muted);}
		</style>
		<div class="cp-top"></div>
		<div class="cp-grid"></div>
		<button class="btn btn-default cp-more" style="margin-top:12px;display:none;">${__("Load more")}</button>
		<input type="file" class="cp-file" accept="image/*" style="display:none;">
	`);
	const root = $(page.main);
	const bust = (u, m) => (u ? u + (u.includes("?") ? "&" : "?") + "m=" + encodeURIComponent(m || Date.now()) : u);

	function load(reset) {
		if (reset) { start = 0; root.find(".cp-grid").empty(); }
		frappe.call({ method: API + ".get_customer_photo_queue", args: { start, limit: 30 } }).then((r) => {
			const m = r.message || { rows: [], total: 0, done: 0 };
			root.find(".cp-top").text(__("{0} waiting for a customer image · {1} done", [m.total, m.done]));
			if (!m.total && !start) root.find(".cp-grid").html(`<div class="cp-empty">${__("No customer images needed right now.")}</div>`);
			root.find(".cp-grid").append(m.rows.map((d) => `
				<div class="cp-card" data-name="${esc(d.name)}" data-src="${esc(d.photo || d.raw_image || d.image || "")}" data-no="${esc(d.design_no)}">
					<img loading="lazy" src="${esc(bust(d.photo || d.image || "", d.modified))}">
					<div class="n">${esc(d.design_no)}</div>
					<div class="a">
						<button class="btn btn-xs btn-default dl">${__("Download source")}</button>
						<button class="btn btn-xs up" style="background:#2e7d32;border-color:#2e7d32;color:#fff;">${__("Upload customer image")}</button>
					</div>
				</div>`).join(""));
			start += m.rows.length;
			root.find(".cp-more").toggle(start < m.total);
		});
	}
	root.find(".cp-more").on("click", () => load());

	root.on("click", ".cp-card .dl", function () {
		const card = $(this).closest(".cp-card");
		const src = card.data("src");
		if (!src) return frappe.show_alert({ message: __("No source image on this card."), indicator: "orange" }, 3);
		const a = document.createElement("a");
		a.href = src;
		a.download = card.data("no");
		document.body.appendChild(a);
		a.click();
		a.remove();
	});

	root.on("click", ".cp-card .up", function () {
		curName = $(this).closest(".cp-card").data("name");
		root.find(".cp-file").trigger("click");
	});
	root.find(".cp-file").on("change", function () {
		const file = this.files && this.files[0];
		this.value = "";
		if (!file || !curName) return;
		const rd = new FileReader();
		rd.onload = () => {
			frappe.dom.freeze(__("Saving customer image..."));
			frappe.call({ method: API + ".submit_customer_photo", args: { name: curName, image_b64: rd.result } })
				.then(() => {
					frappe.dom.unfreeze();
					frappe.show_alert({ message: __("Customer image saved — live in the gallery."), indicator: "green" }, 5);
					load(true);
				}).catch(() => frappe.dom.unfreeze());
		};
		rd.readAsDataURL(file);
	});

	load(true);
};
