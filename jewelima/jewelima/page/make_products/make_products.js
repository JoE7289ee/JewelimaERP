// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Make Products — pick finished (qty-1) Order Bags that hold materials and turn them
// into stock products: consumes their materials (gold In Bags -> Finished Goods),
// freezes the actual weights, sets Held By (order customer / JD Stock), status In
// Stock. Route: /app/make-products

const MP_LOCATIONS =
	"\nORDERING\nCAD\nCAM\nWAX INJECTING\nTREE MAKING\nCASTING\nGRINDING\nFILING\nSETTING\nPRE POLISH\nWAX SETTING\nFINAL POLISH\nWAX CLEANING\nBAG EXTRACTION";

frappe.pages["make-products"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Make Products", single_column: true });
	const state = { rows: [], sel: {} };

	$(page.main).append(`
		<style>
		.mp-bar{display:flex;gap:12px;align-items:end;margin:2px 0 12px;max-width:420px;}
		.mp-bar .help-box{display:none !important;}
		.mp-box{border:1px solid var(--border-color);border-radius:8px;overflow:auto;max-height:calc(100vh - 240px);}
		table.mp-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;background:var(--fg-color);}
		table.mp-tbl th{position:sticky;top:0;background:var(--control-bg,var(--fg-color));border-bottom:2px solid var(--gray-400,#aeb6bf);padding:7px 9px;text-align:left;font-weight:700;}
		table.mp-tbl td{border-bottom:1px solid var(--border-color);padding:5px 9px;}
		table.mp-tbl td.num,table.mp-tbl th.num{text-align:right;}
		.mp-foot{display:flex;justify-content:space-between;align-items:center;margin-top:10px;}
		.mp-foot .cnt{color:var(--text-muted);font-size:13px;}
		</style>
		<div class="mp-bar"><div class="mp-scan" style="flex:1"></div><div class="mp-loc" style="flex:1"></div></div>
		<div class="mp-box"><table class="mp-tbl"><thead></thead><tbody></tbody></table></div>
		<div class="mp-foot"><span class="cnt"></span><div class="mp-actions"></div></div>
	`);

	const scanCtl = frappe.ui.form.make_control({
		df: { fieldtype: "Data", label: "Scan to make", fieldname: "scan", description: "Scan a card to make it a product right away." },
		parent: $(page.main).find(".mp-scan").get(0), render_input: true,
	});
	scanCtl.refresh();
	scanCtl.$input.on("keydown", (e) => {
		if (e.which === 13 || e.key === "Enter") {
			e.preventDefault();
			const c = (scanCtl.$input.val() || "").trim();
			scanCtl.set_value("");
			if (c) makeOne(c);
		}
	});
	function makeOne(code) {
		frappe.call({ method: "jewelima.jewelima.api.make_products", args: { bags: JSON.stringify([code]) } }).then((r) => {
			const res = r.message || {};
			if (res.count) frappe.show_alert({ message: __("Made {0} into a product.", [code]), indicator: "green" }, 4);
			if (res.errors && res.errors.length) frappe.show_alert({ message: code + ": " + res.errors[0].error, indicator: "red" }, 6);
			load();
			setTimeout(() => scanCtl.$input.focus(), 30);
		});
	}

	const locCtl = frappe.ui.form.make_control({
		df: { fieldtype: "Select", label: "Location", fieldname: "loc", options: MP_LOCATIONS, description: "Blank = all locations." },
		parent: $(page.main).find(".mp-loc").get(0), render_input: true,
	});
	locCtl.refresh();
	locCtl.$input.on("change", () => setTimeout(load, 50));

	const $head = $(page.main).find(".mp-tbl thead");
	const $body = $(page.main).find(".mp-tbl tbody");
	const $cnt = $(page.main).find(".mp-foot .cnt");
	const $actions = $(page.main).find(".mp-actions");
	const flt = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));

	function render() {
		$head.html(`<tr>
			<th style="width:32px"><input type="checkbox" class="mp-all"></th>
			<th>Order Bag</th><th>Design</th><th>Party</th><th>Location</th>
			<th class="num">Gold (g)</th><th class="num">Nett (g)</th>
		</tr>`);
		$body.html(
			state.rows
				.map(
					(r) => `<tr>
				<td><input type="checkbox" class="mp-cb" data-n="${frappe.utils.escape_html(r.name)}" ${state.sel[r.name] ? "checked" : ""}></td>
				<td><b>${frappe.utils.escape_html(r.name)}</b></td>
				<td>${frappe.utils.escape_html(r.design || "")}</td>
				<td>${frappe.utils.escape_html(r.customer || "— (JD Stock)")}</td>
				<td>${frappe.utils.escape_html(r.location || "")}</td>
				<td class="num">${flt(r.gold).toFixed(3)}</td>
				<td class="num">${r.act_nett_weight ? flt(r.act_nett_weight).toFixed(3) : ""}</td>
			</tr>`
				)
				.join("") || `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:18px;">No qty-1 bags with materials to make.</td></tr>`
		);
		$head.find(".mp-all").on("change", function () {
			state.rows.forEach((r) => (state.sel[r.name] = this.checked));
			render();
		});
		$body.find(".mp-cb").on("change", function () {
			state.sel[$(this).data("n")] = this.checked;
			updateCount();
		});
		updateCount();
		$actions.empty();
		$(`<button class="btn btn-primary btn-sm">${__("Make Products")}</button>`).appendTo($actions).on("click", doMake);
	}
	function selected() {
		return state.rows.map((r) => r.name).filter((n) => state.sel[n]);
	}
	function updateCount() {
		$cnt.text(`${selected().length} selected / ${state.rows.length} ready`);
	}

	function doMake() {
		const sel = selected();
		if (!sel.length) return frappe.msgprint(__("Select at least one bag."));
		frappe.confirm(__("Make <b>{0}</b> bag(s) into products? Their materials will be consumed.", [sel.length]), () => {
			frappe.dom.freeze(__("Making products…"));
			frappe.call({ method: "jewelima.jewelima.api.make_products", args: { bags: JSON.stringify(sel) } })
				.then((r) => {
					frappe.dom.unfreeze();
					const res = r.message || {};
					frappe.show_alert({ message: __("Made {0} product(s).", [res.count]), indicator: "green" }, 6);
					if (res.errors && res.errors.length) {
						frappe.msgprint({ title: __("Some skipped"), message: res.errors.map((e) => `${e.name}: ${e.error}`).join("<br>"), indicator: "orange" });
					}
					state.sel = {};
					load();
				})
				.catch(() => frappe.dom.unfreeze());
		});
	}

	function load() {
		frappe.call({ method: "jewelima.jewelima.api.get_makeable_bags", args: { location: locCtl.get_value() || null } }).then((r) => {
			state.rows = r.message || [];
			render();
		});
	}

	page.add_inner_button(__("Refresh"), load);
	load();
};
