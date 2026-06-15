// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Purchase Raw Material — a pure-JS entry screen that posts a Purchase Receipt.
// Route: /app/purchase-raw-material

frappe.pages["purchase-raw-material"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Purchase Raw Material", single_column: true });
	const state = { rows: [], header: {} };

	const COLS = [
		{ key: "item", label: "Item", type: "link", options: "Item", width: "220px" },
		{ key: "uom", label: "UOM", type: "display", width: "70px" },
		{ key: "purity", label: "Purity %", type: "display", width: "80px" },
		{ key: "qty", label: "Qty / Weight", type: "num", step: "0.001", width: "110px" },
		{ key: "rate", label: "Rate", type: "num", step: "0.01", width: "100px" },
		{ key: "amount", label: "Amount", type: "display", width: "110px" },
	];

	$(page.main).append(`
		<style>
		.pr-wrap{display:flex;flex-direction:column;height:calc(100vh - 130px);}
		.pr-head{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:4px 0 12px;}
		.pr-gridbox{flex:1 1 auto;overflow:auto;border:1px solid var(--border-color);border-radius:8px;}
		table.pr-grid{width:100%;border-collapse:separate;border-spacing:0;font-size:12px;background:var(--fg-color);}
		table.pr-grid th{position:sticky;top:0;z-index:2;background:var(--control-bg, var(--fg-color));border-right:3px solid var(--gray-500, #8d96a0);border-bottom:4px solid var(--gray-500, #8d96a0);padding:4px 6px;text-align:left;white-space:nowrap;font-weight:700;}
		table.pr-grid td{border-right:3px solid var(--gray-500, #8d96a0);border-bottom:3px solid var(--gray-500, #8d96a0);padding:0;vertical-align:middle;background:var(--fg-color);}
		table.pr-grid td.pr-num{color:var(--text-muted);text-align:center;width:36px;background:var(--control-bg);}
		table.pr-grid input{width:100%;border:2px solid var(--gray-400, #aeb6bf);background:var(--fg-color);padding:1px 4px;font-size:12px;color:var(--text-color);border-radius:3px;height:24px;line-height:1.1;box-sizing:border-box;}
		table.pr-grid input:focus{box-shadow:inset 0 0 0 2px var(--primary);outline:none;}
		table.pr-grid .frappe-control,table.pr-grid .frappe-control .control-input,table.pr-grid .frappe-control .control-input-wrapper{margin:0;padding:0;min-height:0;}
		table.pr-grid .frappe-control .control-input input{border:2px solid var(--gray-400, #aeb6bf);background:var(--fg-color);padding:1px 4px;height:24px;min-height:24px;line-height:1.1;box-sizing:border-box;border-radius:3px;}
		table.pr-grid .pr-disp{padding:3px 6px;color:var(--text-muted);}
		table.pr-grid tfoot td{position:sticky;bottom:0;z-index:2;background:var(--control-bg, var(--fg-color));border-top:4px solid var(--gray-500, #8d96a0);border-right:3px solid var(--gray-500, #8d96a0);font-weight:700;padding:4px 6px;text-align:right;white-space:nowrap;}
		table.pr-grid tfoot td.pr-foot-label{text-align:left;}
		.pr-foot{margin-top:8px;color:var(--text-muted);font-size:12px;}
		</style>
		<div class="pr-wrap">
			<div class="pr-head">
				<div class="pr-h-supplier"></div><div class="pr-h-date"></div><div class="pr-h-wh"></div>
			</div>
			<div class="pr-gridbox">
				<table class="pr-grid"><thead><tr class="pr-headrow"></tr></thead><tbody class="pr-body"></tbody><tfoot><tr class="pr-footrow"></tr></tfoot></table>
			</div>
			<div class="pr-foot"><span class="pr-count">0</span> line(s). Posts a submitted Purchase Receipt into the chosen warehouse.</div>
		</div>
	`);

	const mk = (sel, df) => {
		const c = frappe.ui.form.make_control({ df, parent: $(page.main).find(sel).get(0), render_input: true });
		c.refresh();
		return c;
	};
	state.header.supplier = mk(".pr-h-supplier", { fieldtype: "Link", label: "Supplier", fieldname: "supplier", options: "Supplier" });
	state.header.posting_date = mk(".pr-h-date", { fieldtype: "Date", label: "Date", fieldname: "posting_date" });
	state.header.warehouse = mk(".pr-h-wh", { fieldtype: "Link", label: "Warehouse", fieldname: "warehouse", options: "Warehouse", get_query: () => ({ filters: { is_group: 0 } }) });
	state.header.posting_date.set_value(frappe.datetime.get_today());

	// defaults: JD Stock supplier, Raw Materials Store warehouse
	frappe.db.get_value("Supplier", "JD Stock", "name").then((r) => {
		if (r.message && r.message.name) state.header.supplier.set_value("JD Stock");
	});
	frappe.db.get_value("Warehouse", { warehouse_name: "Raw Materials Store" }, "name").then((r) => {
		if (r.message && r.message.name) state.header.warehouse.set_value(r.message.name);
	});

	const $hr = $(page.main).find(".pr-headrow");
	$hr.append('<th class="pr-num">#</th>');
	COLS.forEach((c) => $hr.append(`<th style="min-width:${c.width}">${frappe.utils.escape_html(c.label)}</th>`));
	$hr.append('<th style="width:34px"></th>');

	const $body = $(page.main).find(".pr-body");

	const $fr = $(page.main).find(".pr-footrow");
	$fr.append('<td class="pr-foot-label">Total</td>');
	const totals = {};
	COLS.forEach((c) => {
		const $td = $("<td></td>").appendTo($fr);
		if (c.key === "qty" || c.key === "amount") totals[c.key] = $td;
	});
	$fr.append("<td></td>");

	function recalc() {
		let q = 0, a = 0;
		state.rows.forEach((r) => {
			const qty = flt(r.f.qty.get());
			const amt = qty * flt(r.f.rate.get());
			q += qty;
			a += amt;
			if (r.setAmount) r.setAmount(amt);
		});
		totals.qty.text(q.toFixed(3));
		totals.amount.text(a.toFixed(2));
		$(page.main).find(".pr-count").text(state.rows.length);
	}
	function renumber() {
		$body.find("tr").each((i, tr) => $(tr).find(".pr-num").text(i + 1));
	}

	function onItem(row) {
		const item = row.f.item.get();
		if (!item || row._last === item) return;
		row._last = item;
		frappe.db.get_value("Item", item, ["weight_unit", "purity_percentage"]).then((r) => {
			const v = r.message || {};
			if (row.setUom) row.setUom(v.weight_unit);
			if (row.setPurity) row.setPurity(v.purity_percentage);
		});
	}

	function addRow() {
		const $tr = $("<tr></tr>");
		$tr.append('<td class="pr-num"></td>');
		const row = { $tr, f: {} };
		COLS.forEach((col) => {
			const $td = $("<td></td>").appendTo($tr);
			if (col.type === "link") {
				const ctrl = frappe.ui.form.make_control({
					df: { fieldtype: "Link", options: col.options, fieldname: col.key, placeholder: col.label, get_query: () => ({ filters: { is_sales_item: 0, is_stock_item: 1 } }) },
					parent: $td.get(0),
					render_input: true,
				});
				ctrl.refresh();
				row.f[col.key] = { get: () => ctrl.get_value(), set: (v) => ctrl.set_value(v || "") };
				ctrl.$input.on("change awesomplete-selectcomplete", () => setTimeout(() => onItem(row), 50));
			} else if (col.type === "display") {
				const $s = $('<div class="pr-disp"></div>').appendTo($td);
				row.f[col.key] = { get: () => $s.text(), set: (v) => $s.text(v == null ? "" : v) };
				if (col.key === "amount") row.setAmount = (v) => $s.text(flt(v).toFixed(2));
				if (col.key === "uom") row.setUom = (v) => $s.text(v || "");
				if (col.key === "purity") row.setPurity = (v) => $s.text(v || "");
			} else {
				const $i = $(`<input type="number" step="${col.step}" min="0">`).appendTo($td);
				row.f[col.key] = { get: () => $i.val(), set: (v) => $i.val(v == null ? "" : v) };
			}
		});
		const $rm = $('<td><button class="btn btn-xs btn-default" title="Remove">&times;</button></td>').appendTo($tr);
		$rm.find("button").on("click", () => {
			state.rows = state.rows.filter((r) => r !== row);
			$tr.remove();
			renumber();
			recalc();
		});
		$body.append($tr);
		state.rows.push(row);
		renumber();
		recalc();
		return row;
	}
	state.addRow = addRow;

	$body.on("input change", "input", () => recalc());

	page.add_inner_button(__("Add Row"), () => addRow());
	page.add_inner_button(__("Add 5 Rows"), () => { for (let i = 0; i < 5; i++) addRow(); });
	addRow();

	page.set_primary_action(__("Post Purchase"), () => postPurchase(page, state, $body), "add");
};

function postPurchase(page, state, $body) {
	const supplier = state.header.supplier.get_value();
	const warehouse = state.header.warehouse.get_value();
	const posting_date = state.header.posting_date.get_value();
	const items = state.rows
		.map((r) => ({ item: r.f.item.get() || undefined, qty: flt(r.f.qty.get()) || 0, rate: flt(r.f.rate.get()) || 0 }))
		.filter((l) => l.item && l.qty > 0);

	if (!items.length) return frappe.msgprint(__("Add at least one item with a quantity."));
	if (!supplier) return frappe.msgprint(__("Select a supplier."));
	if (!warehouse) return frappe.msgprint(__("Select a warehouse."));

	frappe.dom.freeze(__("Posting purchase…"));
	frappe.call({
		method: "jewelima.jewelima.api.post_raw_material_purchase",
		args: { supplier, warehouse, posting_date, items: JSON.stringify(items) },
	}).then((r) => {
		frappe.dom.unfreeze();
		const res = r.message || {};
		if (!res.name) return;
		frappe.show_alert({ message: __("Posted {0}", [res.name]), indicator: "green" }, 7);
		frappe.msgprint({
			title: __("Purchase posted"), indicator: "green",
			message: __("Purchase Receipt {0} created & submitted. <a href='/app/purchase-receipt/{0}'>Open</a>", [res.name]),
		});
		$body.empty();
		state.rows = [];
		state.addRow();
	}).catch(() => frappe.dom.unfreeze());
}
