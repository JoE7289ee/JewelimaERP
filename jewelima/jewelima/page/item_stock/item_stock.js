// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Item Stock — pick a warehouse up top (blank = all warehouses), see every item and
// its stock there. Sortable columns + a Totals row. Route: /app/item-stock

frappe.pages["item-stock"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Item Stock", single_column: true });

	$(page.main).append(`
		<style>
		.is-bar{display:grid;grid-template-columns:1.6fr auto;gap:6px 18px;max-width:660px;margin:2px 0 12px;align-items:end;}
		.is-bar .help-box{display:none !important;}
		.is-box{border:1px solid var(--border-color);border-radius:8px;overflow:auto;max-height:calc(100vh - 230px);}
		table.is-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;background:var(--fg-color);}
		table.is-tbl th{position:sticky;top:0;background:var(--control-bg,var(--fg-color));border-bottom:2px solid var(--gray-400,#aeb6bf);padding:7px 10px;text-align:left;font-weight:700;}
		table.is-tbl td{border-bottom:1px solid var(--border-color);padding:6px 10px;}
		table.is-tbl td.num,table.is-tbl th.num{text-align:right;}
		table.is-tbl th.is-sort{cursor:pointer;user-select:none;white-space:nowrap;}
		table.is-tbl th.is-sort:hover{background:var(--bg-light-gray,#f4f5f6);}
		.is-arrow{font-size:9px;color:var(--text-muted);margin-left:2px;}
		table.is-tbl tfoot td{position:sticky;bottom:0;background:var(--control-bg);border-top:2px solid var(--gray-400,#aeb6bf);font-weight:700;}
			table.is-tbl tbody tr:hover td{background:var(--control-bg);}
</style>
		<div class="is-bar"><div class="is-wh"></div><div class="is-zero"></div></div>
		<div class="is-box"><table class="is-tbl"><thead></thead><tbody></tbody><tfoot></tfoot></table></div>
	`);

	const $head = $(page.main).find(".is-tbl thead");
	const $body = $(page.main).find(".is-tbl tbody");
	const $foot = $(page.main).find(".is-tbl tfoot");
	const flt = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));

	const whCtl = frappe.ui.form.make_control({
		df: { fieldtype: "Link", label: "Warehouse", fieldname: "wh", options: "Warehouse", description: "Leave blank for all warehouses." },
		parent: $(page.main).find(".is-wh").get(0), render_input: true,
	});
	whCtl.refresh();
	whCtl.$input.on("change", () => setTimeout(load, 50));

	const zeroCtl = frappe.ui.form.make_control({
		df: { fieldtype: "Check", label: "Show zero-stock", fieldname: "z", default: 1 },
		parent: $(page.main).find(".is-zero").get(0), render_input: true,
	});
	zeroCtl.set_value(1);
	zeroCtl.refresh();
	zeroCtl.$input.on("change", () => renderBody());

	const COLS = [
		{ f: "item", label: "Item", t: "str" },
		{ f: "item_name", label: "Item Name", t: "str" },
		{ f: "type", label: "Type", t: "str" },
		{ f: "qty", label: "Qty", t: "num" },
		{ f: "uom", label: "UOM", t: "str" },
	];
	let rows = [];
	let sort = { field: "qty", dir: -1 };

	function sortedRows() {
		const col = COLS.find((c) => c.f === sort.field) || { t: "str" };
		const d = sort.dir;
		return rows.slice().sort((a, b) => {
			let va = a[sort.field],
				vb = b[sort.field];
			if (col.t === "num") return ((parseFloat(va) || 0) - (parseFloat(vb) || 0)) * d;
			va = (va == null ? "" : va).toString().toLowerCase();
			vb = (vb == null ? "" : vb).toString().toLowerCase();
			return (va < vb ? -1 : va > vb ? 1 : 0) * d;
		});
	}
	function renderHead() {
		$head.html(`<tr>${COLS.map((c) => `<th class="is-sort ${c.t === "num" ? "num" : ""}" data-f="${c.f}">${__(c.label)}<span class="is-arrow"></span></th>`).join("")}</tr>`);
		$head.find(".is-sort").on("click", function () {
			const f = $(this).data("f");
			if (sort.field === f) sort.dir *= -1;
			else sort = { field: f, dir: f === "qty" ? -1 : 1 };
			renderHead();
			renderBody();
		});
		$head.find(`.is-sort[data-f="${sort.field}"] .is-arrow`).text(sort.dir === 1 ? " ▲" : " ▼");
	}
	function renderBody() {
		let list = sortedRows();
		if (!zeroCtl.get_value()) list = list.filter((r) => flt(r.qty) !== 0);
		$body.html(
			list
				.map(
					(r) => `<tr>
				<td><b>${frappe.utils.escape_html(r.item)}</b></td>
				<td>${frappe.utils.escape_html(r.item_name || "")}</td>
				<td>${frappe.utils.escape_html(r.type || "")}</td>
				<td class="num">${flt(r.qty).toFixed(3)}</td>
				<td>${frappe.utils.escape_html(r.uom || "")}</td>
			</tr>`
				)
				.join("") || `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:18px;">No items.</td></tr>`
		);
		const gold = list.filter((r) => r.uom !== "Carat").reduce((s, r) => s + flt(r.qty), 0);
		const ct = list.filter((r) => r.uom === "Carat").reduce((s, r) => s + flt(r.qty), 0);
		$foot.html(`<tr><td colspan="3">Totals (${list.length} items)</td><td class="num">${gold.toFixed(3)} g${ct ? " · " + ct.toFixed(3) + " ct" : ""}</td><td></td></tr>`);
	}

	function load() {
		frappe.call({ method: "jewelima.jewelima.api.get_item_stock", args: { warehouse: whCtl.get_value() || null } }).then((r) => {
			rows = r.message || [];
			renderHead();
			renderBody();
		});
	}

	page.add_inner_button(__("Refresh"), load);
	load();
};
