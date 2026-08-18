// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// New Design (Design Bank) — the whole birth happens HERE. Pick the Design
// Type (its Bank Code leads the series: BANGLE -> JB-1) and optionally the
// provider (SAMSA -> JR-S-1 with their piece code). CREATE locks the number
// (the record exists from that moment — numbers never reuse), then add the
// product photo: the info card renders live as you do. SAVE stores photo +
// card; the design sits in Review at priority 10 for approval.
// Route: /app/new-design-bank

frappe.pages["new-design-bank"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "New Design", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;

	$(page.main).append(`
		<style>
		#page-new-design-bank .container{max-width:100%;}
		.nd-cols{display:flex;gap:40px;align-items:flex-start;flex-wrap:wrap;}
		.nd-wrap{flex:1 1 520px;min-width:420px;max-width:760px;}
		.nd-wrap .frappe-control{margin-bottom:10px;}
		.nd-code{font-size:34px;font-weight:800;letter-spacing:.03em;margin:16px 0;min-height:46px;}
		.nd-code .muted{font-size:14px;font-weight:400;color:var(--text-muted);}
		.nd-locked{display:none;}
		.nd-locked .l{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);}
		.nd-photo-btn{margin:8px 0 14px;}
		.nd-vals{display:flex;gap:10px;}
		.nd-vals .frappe-control{flex:1;}
		.nd-st-rows{margin:4px 0 10px;}
		.nd-st-row{display:flex;gap:6px;margin-bottom:6px;}
		.nd-st-row input,.nd-st-row select{border:1px solid var(--border-color);border-radius:5px;height:28px;padding:2px 7px;font-size:12px;background:var(--fg-color);color:var(--text-color);}
		.nd-st-row .sv{flex:3;}.nd-st-row .pc{flex:1;width:90px;}
		.nd-st-x{border:none;background:none;color:var(--text-muted);cursor:pointer;}
		.nd-save{background:#2e7d32;border-color:#2e7d32;}
		.nd-prev{flex:1 1 420px;max-width:620px;display:none;position:sticky;top:12px;}
		.nd-prev img{width:100%;border:1px solid var(--border-color);border-radius:8px;background:#fff;}
		.nd-prev .cap{font-size:11px;color:var(--text-muted);margin-top:4px;}
		</style>
		<div class="nd-cols">
		<div class="nd-wrap">
			<div class="nd-form">
				<div class="nd-dtype"></div>
				<div class="nd-provider"></div>
				<div class="nd-pcode" style="display:none;"></div>
				<div class="nd-code"><span class="muted">${__("pick the design type…")}</span></div>
				<button class="btn btn-primary nd-go" style="background:#2e7d32;border-color:#2e7d32;" disabled>${__("CREATE — lock this number")}</button>
			</div>
			<div class="nd-locked">
				<div class="l">${__("Design number (locked)")}</div>
				<div class="nd-code nd-code2"></div>
				<div class="nd-vals"><div class="nd-karat"></div><div class="nd-gw"></div><div class="nd-dw"></div></div>
				<div class="l" style="margin-top:4px;">${__("Stones")}</div>
				<div class="nd-st-rows"></div>
				<button class="btn btn-xs btn-default nd-st-add" style="margin-bottom:10px;">${__("+ stone line")}</button>
				<br><button class="btn btn-default nd-photo-btn">${__("Add product photo…")}</button>
				<input type="file" class="nd-file" accept="image/*" style="display:none;">
				<div>
					<button class="btn btn-primary nd-save" disabled>${__("SAVE — into the bank")}</button>
					<button class="btn btn-default nd-again" style="margin-left:8px;">${__("New another")}</button>
				</div>
				<div style="font-size:12px;color:var(--text-muted);margin-top:10px;">
					${__("Saves as Pending at priority 10 — top of the Review queue for approval.")}</div>
			</div>
		</div>
		<div class="nd-prev"><img><div class="cap">${__("info card — renders live")}</div></div>
		</div>
	`);
	const root = $(page.main);
	const mk = (sel, df) => { const c = frappe.ui.form.make_control({ df, parent: root.find(sel).get(0), render_input: true }); c.refresh(); return c; };
	const fType = mk(".nd-dtype", { fieldtype: "Link", label: __("Design Type"), fieldname: "dt", options: "Design Type", reqd: 1 });
	const fProv = mk(".nd-provider", { fieldtype: "Select", label: __("Provider (outside piece)"), fieldname: "pv", options: "\nSAMSA" });
	const fPCode = mk(".nd-pcode", { fieldtype: "Data", label: __("Provider's own piece code"), fieldname: "pc" });
	let minted = "";
	const S = { name: "", code: "", photo: "" };
	const fKarat = mk(".nd-karat", { fieldtype: "Select", label: __("Weighed at (karat)"), fieldname: "kt",
		options: "18K\n22K\n14K", default: "18K",
		description: __("the bank stores an 18K gross — pick how you weighed it"),
		onchange: () => S.name && previewSoon() });
	const fGW = mk(".nd-gw", { fieldtype: "Float", label: __("Gold weight (gm)"), fieldname: "gw",
		onchange: () => S.name && previewSoon() });
	const fDW = mk(".nd-dw", { fieldtype: "Float", label: __("Diamond weight (ct)"), fieldname: "dw",
		read_only: 1, description: __("auto — average from the sieves") });
	let sieves = [], SIEVE_AVG = {};
	frappe.call({ method: API + ".get_sieve_chart", freeze: false })
		.then((r) => {
			const rows = r.message || [];
			sieves = rows.map((x) => x.sieve_size);
			SIEVE_AVG = {};
			rows.forEach((x) => { if (x.sieve_size) SIEVE_AVG[x.sieve_size] = flt(x.avg_cts); });
		});
	// same shape as the Place Order dialogs: a sieve + how many pieces. The carats
	// are never typed — the Diamond Weight is the sieve average (see recomputeDW).
	function stoneRow(v) {
		v = v || {};
		return `<div class="nd-st-row">
			<select class="sv"><option value=""></option>${sieves.map((x) => `<option ${v.sieve === x ? "selected" : ""}>${esc(x)}</option>`).join("")}</select>
			<input class="pc" type="number" min="0" placeholder="${__("pcs")}" value="${esc(v.pcs || "")}">
			<button class="nd-st-x">✕</button></div>`;
	}
	function stones() {
		return root.find(".nd-st-row").map(function () {
			return { stone: "", sieve: $(this).find(".sv").val(),
				pcs: $(this).find(".pc").val(), ct: 0 };
		}).get().filter((x) => x.sieve || x.pcs);
	}
	function recomputeDW() {
		const dw = jewelima.dwFromSieves(stones(), SIEVE_AVG);
		fDW.set_value(dw);
		return dw;
	}
	let pvTimer = null;
	function previewSoon() { clearTimeout(pvTimer); pvTimer = setTimeout(preview, 450); }

	function refresh() {
		const t = fType.get_value();
		root.find(".nd-pcode").toggle(!!fProv.get_value());
		if (!t) { minted = ""; root.find(".nd-code").html(`<span class="muted">${__("pick the design type…")}</span>`); root.find(".nd-go").prop("disabled", true); return; }
		frappe.call({ method: API + ".new_bank_code", args: { design_type: t, provider: fProv.get_value() || null }, freeze: false })
			.then((r) => {
				minted = (r.message || {}).code || "";
				root.find(".nd-code").text("→ " + minted);
				root.find(".nd-go").prop("disabled", !minted);
			})
			.catch(() => { minted = ""; root.find(".nd-code").html(`<span class="muted">${__("no bank code on this type yet")}</span>`); root.find(".nd-go").prop("disabled", true); });
	}
	fType.$input.on("change awesomplete-selectcomplete", () => setTimeout(refresh, 100));
	fProv.$input.on("change", refresh);

	function preview() {
		frappe.call({ method: API + ".design_card_preview", args: { payload: {
			design_no: S.code, design_type: fType.get_value(), photo: S.photo,
			gross_weight: jewelima.grossTo18k(fGW.get_value(), fKarat.get_value(), fDW.get_value()),
			diamond_weight: fDW.get_value(), stones: stones(),
		} }, freeze: false }).then((r) => {
			root.find(".nd-prev").show().find("img").attr("src", (r.message || {}).image || "");
		});
	}

	// CREATE = the record exists NOW; the number can never be taken by anyone else
	root.find(".nd-go").on("click", () => {
		if (!minted) return;
		frappe.call({ method: API + ".create_new_design", args: {
			design_type: fType.get_value(), provider: fProv.get_value() || null,
			provider_piece_code: fPCode.get_value() || "",
		} }).then((r) => {
			const m = r.message || {};
			S.name = m.name;
			S.code = m.code;
			S.photo = "";
			fGW.set_value("");
			fDW.set_value("");
			root.find(".nd-st-rows").html(stoneRow());
			root.find(".nd-form").hide();
			root.find(".nd-locked").show();
			root.find(".nd-code2").text(m.code);
			root.find(".nd-save").prop("disabled", true);
			frappe.show_alert({ message: __("{0} locked — now add the photo.", [m.code]), indicator: "green" }, 5);
			preview();
		});
	});

	root.find(".nd-photo-btn").on("click", () => root.find(".nd-file").trigger("click"));
	root.find(".nd-file").on("change", function () {
		const file = this.files && this.files[0];
		if (!file) return;
		const rd = new FileReader();
		rd.onload = () => {
			S.photo = rd.result;
			root.find(".nd-save").prop("disabled", false);
			preview();
		};
		rd.readAsDataURL(file);
		this.value = "";
	});

	root.find(".nd-save").on("click", () => {
		if (!S.photo) return;
		frappe.dom.freeze(__("Saving into the bank..."));
		frappe.call({ method: API + ".save_design_card", args: { payload: {
			name: S.name, design_no: S.code, design_type: fType.get_value(),
			provider: fProv.get_value() || "", provider_piece_code: fPCode.get_value() || "",
			photo: S.photo,
			gross_weight: jewelima.grossTo18k(fGW.get_value(), fKarat.get_value(), fDW.get_value()),
			diamond_weight: fDW.get_value(), stones: stones(),
		} } }).then(() => {
			frappe.dom.unfreeze();
			frappe.show_alert({ message: __("{0} saved — in Review at priority 10.", [S.code]), indicator: "green" }, 6);
			reset();
		}).catch(() => frappe.dom.unfreeze());
	});

	function reset() {
		S.name = "";
		S.code = "";
		S.photo = "";
		root.find(".nd-locked").hide();
		root.find(".nd-prev").hide();
		root.find(".nd-form").show();
		refresh();
	}
	root.find(".nd-again").on("click", reset);
	root.find(".nd-st-add").on("click", () => root.find(".nd-st-rows").append(stoneRow()));
	root.on("click", ".nd-st-x", function () { $(this).closest(".nd-st-row").remove(); recomputeDW(); previewSoon(); });
	// the sieve rows ARE the diamond weight — keep it in step with every edit
	root.on("change", ".nd-st-row .sv", () => { recomputeDW(); previewSoon(); });
	root.on("input", ".nd-st-row .pc", () => { recomputeDW(); previewSoon(); });
	root.on("input change", ".nd-st-row input, .nd-st-row select", () => S.name && previewSoon());
};
