// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Warehouse Stock — live gold (g) / stones (ct) / item count per warehouse, read
// straight from the stock ledger (Bin). Click a warehouse to drill into its items.
// Sortable columns + a Totals row. Route: /app/warehouse-stock

frappe.pages["warehouse-stock"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Warehouse Stock", single_column: true });

	$(page.main).append(`
		<style>
		.ws-box{border:1px solid var(--border-color);border-radius:8px;overflow:auto;max-height:calc(100vh - 180px);}
		table.ws-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;background:var(--fg-color);}
		table.ws-tbl th{position:sticky;top:0;background:var(--control-bg,var(--fg-color));border-bottom:2px solid var(--gray-400,#aeb6bf);padding:7px 10px;text-align:left;font-weight:700;}
		table.ws-tbl td{border-bottom:1px solid var(--border-color);padding:6px 10px;}
		table.ws-tbl td.num,table.ws-tbl th.num{text-align:right;}
		table.ws-tbl th.ws-sort{cursor:pointer;user-select:none;white-space:nowrap;}
		table.ws-tbl th.ws-sort:hover{background:var(--bg-light-gray,#f4f5f6);}
		.ws-arrow{font-size:9px;color:var(--text-muted);margin-left:2px;}
		.ws-wh{cursor:pointer;color:var(--text-color);font-weight:600;}
		.ws-wh:hover{text-decoration:underline;}
		table.ws-tbl tfoot td{position:sticky;bottom:0;background:var(--control-bg);border-top:2px solid var(--gray-400,#aeb6bf);font-weight:700;}
		</style>
		<div class="ws-box"><table class="ws-tbl"><thead></thead><tbody></tbody><tfoot></tfoot></table></div>
	`);

	const $head = $(page.main).find(".ws-tbl thead");
	const $body = $(page.main).find(".ws-tbl tbody");
	const $foot = $(page.main).find(".ws-tbl tfoot");
	const flt = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));

	const COLS = [
		{ f: "warehouse_name", label: "Warehouse", t: "str" },
		{ f: "gold_g", label: "Gold (g)", t: "num" },
		{ f: "stone_ct", label: "Stones (ct)", t: "num" },
		{ f: "items", label: "Items", t: "num" },
	];
	let rows = [];
	let sort = { field: "gold_g", dir: -1 };

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
		$head.html(`<tr>${COLS.map((c) => `<th class="ws-sort ${c.t === "num" ? "num" : ""}" data-f="${c.f}">${__(c.label)}<span class="ws-arrow"></span></th>`).join("")}</tr>`);
		$head.find(".ws-sort").on("click", function () {
			const f = $(this).data("f");
			if (sort.field === f) sort.dir *= -1;
			else sort = { field: f, dir: f === "warehouse_name" ? 1 : -1 };
			renderHead();
			renderBody();
			$head.find(`.ws-sort[data-f="${sort.field}"] .ws-arrow`).text(sort.dir === 1 ? " ▲" : " ▼");
		});
		$head.find(`.ws-sort[data-f="${sort.field}"] .ws-arrow`).text(sort.dir === 1 ? " ▲" : " ▼");
	}
	function renderBody() {
		$body.html(
			sortedRows()
				.map(
					(w) => `<tr>
				<td><span class="ws-wh" data-w="${frappe.utils.escape_html(w.warehouse)}">${frappe.utils.escape_html(w.warehouse_name)}</span></td>
				<td class="num">${w.gold_g ? flt(w.gold_g).toFixed(3) : ""}</td>
				<td class="num">${w.stone_ct ? flt(w.stone_ct).toFixed(3) : ""}</td>
				<td class="num">${w.items || ""}</td>
			</tr>`
				)
				.join("") || `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:18px;">No stock anywhere yet.</td></tr>`
		);
		$body.find(".ws-wh").on("click", function () {
			showItems($(this).data("w"));
		});
		const g = rows.reduce((s, w) => s + flt(w.gold_g), 0);
		const c = rows.reduce((s, w) => s + flt(w.stone_ct), 0);
		const it = rows.reduce((s, w) => s + flt(w.items), 0);
		$foot.html(`<tr><td>Totals (${rows.length} warehouses)</td><td class="num">${g.toFixed(3)}</td><td class="num">${c.toFixed(3)}</td><td class="num">${it}</td></tr>`);
	}
	function showItems(warehouse) {
		frappe.call({ method: "jewelima.jewelima.api.get_warehouse_items", args: { warehouse } }).then((r) => {
			const items = r.message || [];
			const body = items
				.map((i) => `<tr><td><b>${frappe.utils.escape_html(i.item)}</b></td><td>${frappe.utils.escape_html(i.item_name || "")}</td><td style="text-align:right">${flt(i.qty).toFixed(3)}</td><td>${frappe.utils.escape_html(i.uom || "")}</td></tr>`)
				.join("");
			const d = new frappe.ui.Dialog({ title: warehouse, size: "large", fields: [{ fieldtype: "HTML", fieldname: "h" }] });
			d.fields_dict.h.$wrapper.html(
				items.length
					? `<table class="table table-bordered" style="font-size:12px;"><thead><tr><th>Item</th><th>Name</th><th style="text-align:right">Qty</th><th>UOM</th></tr></thead><tbody>${body}</tbody></table>`
					: '<div class="text-muted" style="padding:12px;">Empty.</div>'
			);
			d.show();
		});
	}

	function load() {
		frappe.call({ method: "jewelima.jewelima.api.get_warehouse_stock" }).then((r) => {
			rows = r.message || [];
			renderHead();
			renderBody();
		});
	}

	page.add_inner_button(__("Refresh"), load);
	load();
};
