// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Customer Update (Design Bank) — an EXISTING customer photo flagged to be
// replaced. Unlike first-time Customer Photos (which go live directly), a
// replacement parks as a PENDING candidate and must be APPROVED (old customer
// image dies, new one takes its place). Route: /app/customer-update

frappe.pages["customer-update"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Customer Update", single_column: true });
	const API = "jewelima.jewelima.design_bank_api";
	const esc = frappe.utils.escape_html;
	let start = 0, curName = null;

	$(page.main).append(`
		<style>
		.cu-top{font-size:13px;color:var(--text-muted);margin-bottom:12px;}
		.cu-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px;}
		.cu-card{border:1px solid var(--border-color);border-radius:9px;background:var(--fg-color);overflow:hidden;}
		.cu-card img{width:100%;height:230px;object-fit:contain;background:#fff;display:block;}
		.cu-card .n{font-weight:700;font-size:13px;padding:6px 10px 0;}
		.cu-card .a{display:flex;gap:6px;padding:8px 10px 10px;}
		.cu-empty{padding:40px;text-align:center;color:var(--text-muted);}
		</style>
		<div class="cu-top"></div>
		<div class="cu-grid"></div>
		<button class="btn btn-default cu-more" style="margin-top:12px;display:none;">${__("Load more")}</button>
		<input type="file" class="cu-file" accept="image/*" style="display:none;">
	`);
	const root = $(page.main);
	const bust = (u, m) => (u ? u + (u.includes("?") ? "&" : "?") + "m=" + encodeURIComponent(m || Date.now()) : u);

	function load(reset) {
		if (reset) { start = 0; root.find(".cu-grid").empty(); }
		frappe.call({ method: API + ".get_customer_update_queue", args: { start, limit: 30 } }).then((r) => {
			const m = r.message || { rows: [], total: 0 };
			root.find(".cu-top").text(m.total
				? __("{0} customer image(s) flagged to be replaced — upload a new one for approval", [m.total]) : "");
			if (!m.total && !start) root.find(".cu-grid").html(`<div class="cu-empty">${__("No customer image needs replacing right now.")}</div>`);
			root.find(".cu-grid").append(m.rows.map((d) => `
				<div class="cu-card" data-name="${esc(d.name)}" data-src="${esc(d.customer_image || d.photo || d.image || "")}" data-no="${esc(d.design_no)}">
					<img loading="lazy" src="${esc(bust(d.customer_image || d.photo || d.image || "", d.modified))}">
					<div class="n">${esc(d.design_no)}</div>
					<div class="a">
						<button class="btn btn-xs btn-default dl">${__("Download current")}</button>
						<button class="btn btn-xs up" style="background:#2e7d32;border-color:#2e7d32;color:#fff;">${__("Upload replacement")}</button>
					</div>
				</div>`).join(""));
			start += m.rows.length;
			root.find(".cu-more").toggle(start < m.total);
		});
	}
	root.find(".cu-more").on("click", () => load());

	root.on("click", ".cu-card .dl", function () {
		const card = $(this).closest(".cu-card");
		const src = card.data("src");
		if (!src) return frappe.show_alert({ message: __("No image on this card."), indicator: "orange" }, 3);
		const a = document.createElement("a");
		a.href = src; a.download = card.data("no");
		document.body.appendChild(a); a.click(); a.remove();
	});
	root.on("click", ".cu-card .up", function () {
		curName = $(this).closest(".cu-card").data("name");
		root.find(".cu-file").val("").trigger("click");
	});
	root.find(".cu-file").on("change", function () {
		const file = this.files && this.files[0];
		this.value = "";
		if (!file || !curName) return;
		const rd = new FileReader();
		rd.onload = () => {
			frappe.dom.freeze(__("Uploading for approval..."));
			frappe.call({ method: API + ".submit_customer_update", args: { name: curName, image_b64: rd.result } })
				.then(() => {
					frappe.dom.unfreeze();
					frappe.show_alert({ message: __("Parked for approval — see Photo Approvals."), indicator: "green" }, 4);
					load(true);
				}).catch(() => frappe.dom.unfreeze());
		};
		rd.readAsDataURL(file);
	});

	load(true);
};
