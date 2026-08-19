// Basket — what the Shop put aside, before it becomes an order. Per line you can
// set the quantity, write a remark and edit the materials. Nothing about the ORDER
// lives here (no party, no due date, no split, no photos) — that is Place Order's
// job, and this hands the whole basket over to it.
frappe.pages["basket"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Basket"), single_column: true });
	const esc = frappe.utils.escape_html;
	const flt = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));
	const n3 = (v) => flt(v).toFixed(3);

	$(page.main).html(`
		<style>
		.bk-wrap{max-width:1080px;}
		.bk-empty{text-align:center;padding:70px 20px;color:var(--text-muted);}
		.bk-empty .big{font-size:44px;line-height:1;margin-bottom:10px;}
		.bk-line{display:flex;gap:16px;align-items:flex-start;border:1px solid var(--border-color);border-radius:14px;padding:14px;margin-bottom:12px;background:var(--card-bg,var(--fg-color));}
		.bk-ph{width:96px;height:96px;flex:0 0 96px;border-radius:10px;object-fit:contain;background:#fff;border:1px solid var(--border-color);}
		.bk-nophoto{display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--text-muted);background:#fafafa;}
		.bk-mid{flex:1 1 auto;min-width:220px;}
		.bk-v{font-family:var(--font-family-monospace,monospace);font-weight:800;font-size:15px;}
		.bk-card{font-size:12px;color:var(--text-muted);margin-top:1px;}
		.bk-w{font-size:12px;color:var(--text-muted);margin-top:6px;}
		.bk-rm{margin-top:9px;width:100%;border:1px solid var(--border-color);border-radius:8px;padding:6px 10px;font-size:12.5px;background:var(--fg-color);color:var(--text-color);min-height:34px;resize:vertical;}
		.bk-right{flex:0 0 190px;display:flex;flex-direction:column;gap:8px;align-items:flex-end;}
		.bk-qty{display:flex;align-items:center;gap:6px;}
		.bk-qty button{width:30px;height:30px;border-radius:8px;border:1px solid var(--border-color);background:var(--fg-color);color:var(--text-color);font-weight:800;font-size:15px;cursor:pointer;line-height:1;}
		.bk-qty input{width:62px;height:30px;text-align:center;border:1px solid var(--border-color);border-radius:8px;background:var(--fg-color);color:var(--text-color);font-weight:700;}
		.bk-acts{display:flex;gap:8px;}
		.bk-acts .btn{font-size:11.5px;font-weight:600;}
		.bk-edited{display:inline-block;font-size:10px;font-weight:800;text-transform:uppercase;color:#7a5b00;background:#fff8e6;border:1px solid #e0c26a;border-radius:999px;padding:1px 8px;margin-left:6px;}
		.bk-foot{position:sticky;bottom:0;background:var(--fg-color);border-top:1px solid var(--border-color);padding:14px 4px;display:flex;align-items:center;gap:18px;flex-wrap:wrap;}
		.bk-tot{font-size:13px;}
		.bk-tot b{font-size:16px;}
		.bk-foot .btn-primary{margin-left:auto;font-weight:800;padding:8px 22px;}
		.bk-mtbl{width:100%;border-collapse:collapse;font-size:12.5px;}
		.bk-mtbl th{text-align:left;font-size:10px;text-transform:uppercase;color:var(--text-muted);padding:4px 6px;border-bottom:1px solid var(--border-color);}
		.bk-mtbl td{padding:4px 6px;border-bottom:1px solid var(--border-color);}
		.bk-mtbl input{width:88px;border:1px solid var(--border-color);border-radius:6px;height:28px;padding:2px 8px;background:var(--fg-color);color:var(--text-color);}
		.bk-mtbl .x{color:#b02a2a;cursor:pointer;font-weight:800;}
		</style>
		<div class="bk-wrap"><div class="bk-body"></div><div class="bk-foot" style="display:none;">
			<div class="bk-tot"></div>
			<button class="btn btn-default btn-sm bk-more">${__("Keep shopping")}</button>
			<button class="btn btn-primary bk-go">${__("Place Order")}</button>
		</div></div>`);

	const $body = $(page.main).find(".bk-body");
	const $foot = $(page.main).find(".bk-foot");
	let PROFILES = {};   // variant -> its design BOM (for weights + the editor's starting point)

	function profileOf(v) { return PROFILES[v] || null; }

	function lineWeights(l) {
		const mats = l.materials || (profileOf(l.variant) || {}).materials || [];
		const q = parseInt(l.qty, 10) || 1;
		let gold = 0, stone = 0;
		mats.forEach((m) => {
			if ((m.uom || "").toLowerCase() === "carat") stone += flt(m.weight);
			else gold += flt(m.weight);
		});
		return { gold: gold * q, stone: stone * q };
	}

	function paint() {
		const rows = jwBasket.all();
		if (!rows.length) {
			$foot.hide();
			$body.html(`<div class="bk-empty">
				<div class="big">🧺</div>
				<div style="font-size:15px;font-weight:700;color:var(--text-color);">${__("Your basket is empty")}</div>
				<div style="margin:6px 0 16px;">${__("Pick designs in the Shop and they land here.")}</div>
				<button class="btn btn-primary btn-sm bk-more">${__("Go to the Shop")}</button></div>`);
			return;
		}
		$body.html(rows.map((l, i) => {
			const w = lineWeights(l);
			return `<div class="bk-line" data-i="${i}">
				${l.image ? `<img class="bk-ph" src="${esc(l.image)}">` : `<div class="bk-ph bk-nophoto">${__("no photo")}</div>`}
				<div class="bk-mid">
					<div class="bk-v">${esc(l.variant)}${l.materials ? `<span class="bk-edited">${__("materials edited")}</span>` : ""}</div>
					<div class="bk-card">${esc(l.bank_no || "")}</div>
					<div class="bk-w">${__("Gold")} <b>${n3(w.gold)}</b> g${w.stone ? ` · ${__("Stones")} <b>${flt(w.stone).toFixed(2)}</b> ct` : ""}</div>
					<textarea class="bk-rm" rows="1" placeholder="${__("Remark for this line (optional)")}">${esc(l.remark || "")}</textarea>
				</div>
				<div class="bk-right">
					<div class="bk-qty">
						<button class="bk-dec" title="${__("less")}">−</button>
						<input type="number" min="1" class="bk-q" value="${parseInt(l.qty, 10) || 1}">
						<button class="bk-inc" title="${__("more")}">+</button>
					</div>
					<div class="bk-acts">
						<button class="btn btn-xs btn-default bk-mats">${__("Materials")}</button>
						<button class="btn btn-xs btn-default bk-del" style="color:#b02a2a;">${__("Remove")}</button>
					</div>
				</div>
			</div>`;
		}).join(""));

		const pcs = jwBasket.count();
		let gold = 0, stone = 0;
		rows.forEach((l) => { const w = lineWeights(l); gold += w.gold; stone += w.stone; });
		$foot.show().find(".bk-tot").html(
			`${__("{0} line(s)", [rows.length])} · <b>${pcs}</b> ${__("piece(s)")}
			 &nbsp;·&nbsp; ${__("Gold")} <b>${n3(gold)}</b> g${stone ? ` · ${__("Stones")} <b>${flt(stone).toFixed(2)}</b> ct` : ""}`);
	}

	// pull each variant's BOM once so weights show and the editor has a starting point
	function loadProfiles() {
		const want = [...new Set(jwBasket.all().map((l) => l.variant))].filter((v) => !PROFILES[v]);
		if (!want.length) { paint(); return; }
		Promise.all(want.map((v) => frappe.call({
			method: "jewelima.jewelima.api.get_design_materials", args: { design: v }, freeze: false,
		}).then((r) => { PROFILES[v] = r.message || { materials: [] }; }).catch(() => { PROFILES[v] = { materials: [] }; })))
			.then(paint);
	}

	// ---- per-line editors -------------------------------------------------
	function editMaterials(i) {
		const l = jwBasket.all()[i];
		const start = (l.materials || (profileOf(l.variant) || {}).materials || []).map((m) => ({ ...m }));
		const d = new frappe.ui.Dialog({
			title: __("Materials — {0}", [l.variant]), size: "large",
			fields: [{ fieldname: "html", fieldtype: "HTML" }],
			primary_action_label: __("Save"),
			primary_action() {
				const rows = [];
				d.get_field("html").$wrapper.find("tbody tr").each(function () {
					const item = $(this).data("item");
					const qty = flt($(this).find(".m-qty").val());
					const weight = flt($(this).find(".m-w").val());
					if (item && weight > 0) rows.push(Object.assign({}, start.find((s) => s.item === item) || {}, { item, qty, weight }));
				});
				if (!rows.length) return frappe.msgprint(__("A line needs at least one material."));
				jwBasket.update(i, { materials: rows });
				d.hide();
				paint();
			},
			secondary_action_label: __("Back to the design's"),
			secondary_action() { jwBasket.update(i, { materials: null }); d.hide(); paint(); },
		});
		d.get_field("html").$wrapper.html(`
			<table class="bk-mtbl"><thead><tr>
				<th>${__("Material")}</th><th>${__("Qty")}</th><th>${__("Weight")}</th><th></th>
			</tr></thead><tbody>
			${start.map((m) => `<tr data-item="${esc(m.item)}">
				<td><b>${esc(m.item)}</b><div style="font-size:10.5px;color:var(--text-muted);">${esc(m.uom || "")}${m.purity ? " · " + m.purity + "%" : ""}</div></td>
				<td><input class="m-qty" type="number" step="1" value="${m.stone_type ? (m.qty || 0) : 0}" ${m.stone_type ? "" : "disabled"}></td>
				<td><input class="m-w" type="number" step="0.001" value="${n3(m.weight)}"></td>
				<td class="x" title="${__("remove")}">&times;</td>
			</tr>`).join("")}
			</tbody></table>
			<div style="font-size:11px;color:var(--text-muted);margin-top:8px;">
				${__("per piece — the order multiplies by the quantity")}</div>`);
		d.get_field("html").$wrapper.on("click", ".x", function () { $(this).closest("tr").remove(); });
		d.show();
	}

	// ---- wiring -----------------------------------------------------------
	const idxOf = (el) => parseInt($(el).closest(".bk-line").data("i"), 10);
	$(page.main).on("click", ".bk-inc", function () {
		const i = idxOf(this); jwBasket.update(i, { qty: (parseInt(jwBasket.all()[i].qty, 10) || 1) + 1 }); paint();
	});
	$(page.main).on("click", ".bk-dec", function () {
		const i = idxOf(this); jwBasket.update(i, { qty: Math.max(1, (parseInt(jwBasket.all()[i].qty, 10) || 1) - 1) }); paint();
	});
	$(page.main).on("change", ".bk-q", function () {
		jwBasket.update(idxOf(this), { qty: Math.max(1, parseInt(this.value, 10) || 1) }); paint();
	});
	$(page.main).on("change blur", ".bk-rm", function () {
		jwBasket.update(idxOf(this), { remark: (this.value || "").trim() });
	});
	$(page.main).on("click", ".bk-mats", function () { editMaterials(idxOf(this)); });
	$(page.main).on("click", ".bk-del", function () {
		const i = idxOf(this); jwBasket.remove(i); paint();
	});
	$(page.main).on("click", ".bk-more", () => frappe.set_route("shop"));
	$(page.main).on("click", ".bk-go", () => {
		const rows = jwBasket.all();
		if (!rows.length) return;
		frappe.route_options = { shop_cart: rows.map((l) => ({
			bank: l.bank, variant: l.variant, qty: l.qty, remark: l.remark || "", materials: l.materials || null })) };
		jwBasket.clear();
		frappe.set_route("place-order");
	});

	// the page object survives between visits — repaint from the store every time,
	// otherwise you come back from the Shop and see the old list
	frappe.pages["basket"].on_page_show = function () { jwBasket.load().then(loadProfiles); };

	page.add_inner_button(__("Shop"), () => frappe.set_route("shop"));
	page.add_inner_button(__("Empty the basket"), () => {
		frappe.confirm(__("Throw the whole basket away?"), () => { jwBasket.clear(); paint(); });
	});
	jwBasket.load().then(loadProfiles);
};
