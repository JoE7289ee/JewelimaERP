// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// New Design (Design Bank) — mint the next in-house design number and go.
// Pick the Design Type (its Bank Code leads the series: BANGLE -> JB-1),
// optionally the provider (SAMSA -> JR-S-1, with a field for THEIR piece
// code), see the number the piece WILL get, and Create opens the Card
// Editor with everything prefilled. Numbers never reuse (retired included).
// Route: /app/new-design-bank

frappe.pages["new-design-bank"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "New Design", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;

	$(page.main).append(`
		<style>
		.nd-wrap{max-width:520px;}
		.nd-wrap .frappe-control{margin-bottom:10px;}
		.nd-code{font-size:34px;font-weight:800;letter-spacing:.03em;margin:16px 0;min-height:46px;}
		.nd-code .muted{font-size:14px;font-weight:400;color:var(--text-muted);}
		</style>
		<div class="nd-wrap">
			<div class="nd-dtype"></div>
			<div class="nd-provider"></div>
			<div class="nd-pcode" style="display:none;"></div>
			<div class="nd-code"><span class="muted">${__("pick the design type…")}</span></div>
			<button class="btn btn-primary nd-go" style="background:#2e7d32;border-color:#2e7d32;" disabled>${__("Create — open the Card Editor")}</button>
		</div>
	`);
	const root = $(page.main);
	const mk = (sel, df) => { const c = frappe.ui.form.make_control({ df, parent: root.find(sel).get(0), render_input: true }); c.refresh(); return c; };
	const fType = mk(".nd-dtype", { fieldtype: "Link", label: __("Design Type"), fieldname: "dt", options: "Design Type", reqd: 1 });
	const fProv = mk(".nd-provider", { fieldtype: "Select", label: __("Provider (outside piece)"), fieldname: "pv", options: "\nSAMSA" });
	const fPCode = mk(".nd-pcode", { fieldtype: "Data", label: __("Provider's own piece code"), fieldname: "pc" });
	let minted = "";

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

	root.find(".nd-go").on("click", () => {
		if (!minted) return;
		frappe.route_options = { new_design: { design_no: minted, design_type: fType.get_value(),
			provider: fProv.get_value() || "", provider_piece_code: fPCode.get_value() || "" } };
		frappe.set_route("card-builder");
	});
};
