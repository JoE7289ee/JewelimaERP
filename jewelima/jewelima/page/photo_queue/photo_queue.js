// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Photo Queue — New Designs created (usually at Place Order) without a
// product photo wait here. Attach the photo and its info page re-renders and
// it drops off the list. Rare, but nothing slips through untracked.
// Route: /app/photo-queue

frappe.pages["photo-queue"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Photo Queue", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;

	$(page.main).append(`
		<style>
		#page-photo-queue .container{max-width:100%;}
		.pq-head{font-size:12.5px;color:var(--text-muted);margin-bottom:12px;}
		.pq-grid{display:flex;gap:14px;flex-wrap:wrap;}
		.pq-card{border:1px solid var(--border-color);border-radius:11px;background:var(--fg-color);padding:12px 14px;width:280px;}
		.pq-no{font-size:16px;font-weight:800;font-family:var(--font-family-monospace,monospace);}
		.pq-meta{font-size:11.5px;color:var(--text-muted);margin:2px 0 10px;}
		.pq-drop{border:2px dashed #9a6b1f;border-radius:9px;padding:18px;text-align:center;color:#9a6b1f;font-size:12.5px;cursor:pointer;font-weight:700;}
		.pq-drop.has{border-color:#2e7d32;color:#1d7a33;padding:6px;}
		.pq-drop img{max-width:100%;max-height:150px;border-radius:7px;}
		.pq-save{border:none;color:#fff;font-weight:800;padding:8px 16px;border-radius:8px;cursor:pointer;background:#2e7d32;margin-top:10px;width:100%;display:none;}
		.pq-none{padding:36px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:10px;}
		</style>
		<div class="pq-head"></div>
		<div class="pq-body"><div class="pq-none">${__("loading…")}</div></div>
		<input type="file" class="pq-input" accept="image/*" style="display:none;">
	`);
	const root = $(page.main);
	let PICK = null; // {name, b64}

	function load() {
		frappe.call({ method: API + ".get_product_photo_queue" }).then((r) => {
			const m = r.message || { rows: [], count: 0 };
			root.find(".pq-head").text(m.count
				? __("{0} new design(s) waiting for a product photo.", [m.count])
				: "");
			root.find(".pq-body").html(m.count ? `<div class="pq-grid">${m.rows.map((d) => `
				<div class="pq-card" data-n="${esc(d.name)}">
					<div class="pq-no">${esc(d.design_no)}</div>
					<div class="pq-meta">${esc(d.design_type || "")} · ${d.gross_weight || 0} g${d.diamond_weight ? " · " + d.diamond_weight + " ct" : ""}</div>
					<div class="pq-drop" data-n="${esc(d.name)}">${__("＋ attach product photo")}</div>
					<button class="pq-save" data-n="${esc(d.name)}">${__("Save photo")}</button>
				</div>`).join("")}</div>`
				: `<div class="pq-none">${__("Nothing waiting — every new design has its photo. 🎉")}</div>`);
		});
	}

	root.on("click", ".pq-drop", function () {
		PICK = { name: this.getAttribute("data-n"), b64: null, el: this };
		root.find(".pq-input").get(0).click();
	});
	root.find(".pq-input").on("change", function () {
		const file = this.files[0];
		if (!file || !PICK) return;
		const rd = new FileReader();
		rd.onload = () => {
			PICK.b64 = rd.result;
			const $card = $(PICK.el).closest(".pq-card");
			$(PICK.el).addClass("has").html(`<img src="${rd.result}">`);
			$card.find(".pq-save").show();
		};
		rd.readAsDataURL(file);
		this.value = "";
	});
	root.on("click", ".pq-save", function () {
		const name = this.getAttribute("data-n");
		if (!PICK || PICK.name !== name || !PICK.b64) return frappe.msgprint(__("Attach a photo first."));
		frappe.call({ method: API + ".add_product_photo", args: { name, photo: PICK.b64 } }).then(() => {
			frappe.show_alert({ message: __("Photo added — info page rendered."), indicator: "green" }, 4);
			PICK = null;
			load();
		});
	});

	load();
};
