// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Design Review (Design Bank) — one card at a time: RAW scan beside the three
// slots (card/info · product/print · customer), the OCR'd values editable
// (saving re-renders the card), the two photo checkboxes, a product-photo
// upload, APPROVE (needs a Design Type) and the permanent raw delete.
// Route: /app/design-review

frappe.pages["design-review"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Design Review", single_column: true });
	const API = "jewelima.jewelima.design_bank_api";
	const esc = frappe.utils.escape_html;
	let cur = null;
	let photoB64 = "";

	$(page.main).append(`
		<style>
		.rv-top{font-size:13px;color:var(--text-muted);margin-bottom:12px;}
		.rv-cols{display:flex;gap:18px;align-items:flex-start;}
		.rv-imgs{flex:0 0 62%;display:grid;grid-template-columns:1fr 1fr;gap:12px;}
		.rv-im{border:1px solid var(--border-color);border-radius:8px;background:#fff;overflow:hidden;}
		.rv-im .t{font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--text-muted);padding:4px 8px;background:var(--control-bg);}
		.rv-im img{width:100%;height:330px;object-fit:contain;display:block;}
		.rv-im .none{height:330px;display:flex;align-items:center;justify-content:center;color:#bbb;}
		.rv-side{flex:1;}
		.rv-side .frappe-control{margin:0 0 6px;}
		.rv-checks label{display:block;font-size:13px;margin:4px 0;cursor:pointer;}
		.rv-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;}
		.rv-done{padding:40px;text-align:center;color:var(--text-muted);font-size:15px;}
		</style>
		<div class="rv-top"></div>
		<div class="rv-cols" style="display:none;">
			<div class="rv-side">
				<div class="f-no"></div><div class="f-dt"></div>
				<div class="f-gw"></div><div class="f-dw"></div><div class="f-note"></div>
				<div class="rv-checks">
					<label><input type="checkbox" class="ck-up"> ${__("Upgrade photo (crop off / background)")}</label>
					<label><input type="checkbox" class="ck-cn"> ${__("Customer image needed (best seller)")}</label>
					<label><input type="checkbox" class="ck-dr" style="accent-color:#b02a2a;"> ${__("Delete RAW forever on save")}</label>
				</div>
				<button class="btn btn-default btn-sm rv-up">${__("Upload product photo")}</button>
				<input type="file" class="rv-file" accept="image/*" style="display:none;">
				<div class="rv-actions">
					<button class="btn btn-primary rv-save" style="background:#2e7d32;border-color:#2e7d32;">${__("Save & Approve → next")}</button>
					<button class="btn btn-default rv-skip">${__("Save (stay Pending) → next")}</button>
					<button class="btn btn-default rv-retire" style="color:#b02a2a;">${__("Retire → next")}</button>
				</div>
			</div>
			<div class="rv-imgs">
				<div class="rv-im"><div class="t">${__("Raw (original scan)")}</div><div class="i raw"></div></div>
				<div class="rv-im"><div class="t">${__("Card — info")}</div><div class="i card"></div></div>
				<div class="rv-im"><div class="t">${__("Product — print")}</div><div class="i photo"></div></div>
				<div class="rv-im"><div class="t">${__("Customer")}</div><div class="i cust"></div></div>
			</div>
		</div>
		<div class="rv-done" style="display:none;"></div>
	`);
	const root = $(page.main);
	const mk = (sel, df) => { const c = frappe.ui.form.make_control({ df, parent: root.find(sel).get(0), render_input: true }); c.refresh(); return c; };
	const fNo = mk(".f-no", { fieldtype: "Data", label: __("Design No"), fieldname: "n" });
	const fDT = mk(".f-dt", { fieldtype: "Link", label: __("Design Type (needed to approve)"), fieldname: "d", options: "Design Type" });
	const fGW = mk(".f-gw", { fieldtype: "Float", label: __("GW gm"), fieldname: "g" });
	const fDW = mk(".f-dw", { fieldtype: "Float", label: __("DW ct"), fieldname: "w" });
	const fNote = mk(".f-note", { fieldtype: "Data", label: __("Note"), fieldname: "o" });

	const im = (sel, url) => root.find(".rv-im .i." + sel).html(url ? `<img src="${esc(url)}">` : `<div class="none">—</div>`);
	function load() {
		photoB64 = "";
		frappe.call({ method: API + ".get_review_queue" }).then((r) => {
			const m = r.message || {};
			root.find(".rv-top").text(m.total ? __("{0} card(s) in the review queue", [m.total]) : "");
			if (!m.card) {
				root.find(".rv-cols").hide();
				root.find(".rv-done").show().text(__("Review queue is empty — nothing rebuilt is waiting."));
				return;
			}
			cur = m.card;
			root.find(".rv-done").hide(); root.find(".rv-cols").css("display", "flex");
			im("raw", cur.raw_image); im("card", cur.image); im("photo", cur.photo); im("cust", cur.customer_image);
			fNo.set_value(cur.design_no); fDT.set_value(cur.design_type);
			fGW.set_value(cur.gross_weight || ""); fDW.set_value(cur.diamond_weight || "");
			fNote.set_value(cur.note);
			root.find(".ck-up").prop("checked", !!cur.photoupdate);
			root.find(".ck-cn").prop("checked", !!cur.customer_image_needed);
			root.find(".ck-dr").prop("checked", false);
		});
	}
	root.find(".rv-up").on("click", () => root.find(".rv-file").get(0).click());
	root.find(".rv-file").on("change", function () {
		const file = this.files[0];
		if (!file) return;
		const rd = new FileReader();
		rd.onload = () => { photoB64 = rd.result; im("photo", photoB64); };
		rd.readAsDataURL(file);
	});
	function save(approve, retire) {
		const p = { name: cur.name, design_no: fNo.get_value(), design_type: fDT.get_value(),
			gross_weight: fGW.get_value(), diamond_weight: fDW.get_value(), note: fNote.get_value(),
			extra_lines: cur.extra_lines, stones: cur.stones, photo: photoB64 || cur.photo,
			photoupdate: root.find(".ck-up").is(":checked") ? 1 : 0,
			customer_image_needed: root.find(".ck-cn").is(":checked") ? 1 : 0,
			delete_raw: root.find(".ck-dr").is(":checked") ? 1 : 0, approve: approve ? 1 : 0,
			retire: retire ? 1 : 0 };
		frappe.dom.freeze(__("Saving..."));
		frappe.call({ method: API + ".review_save", args: { payload: JSON.stringify(p) } })
			.then(() => { frappe.dom.unfreeze(); load(); })
			.catch(() => frappe.dom.unfreeze());
	}
	root.find(".rv-save").on("click", () => save(true));
	root.find(".rv-skip").on("click", () => save(false));
	root.find(".rv-retire").on("click", () => save(false, true));
	load();
};
