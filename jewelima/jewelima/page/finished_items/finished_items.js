// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Finished Items — the finished-goods register: every bag made into a product with
// its frozen weights, holder (customer / JD Stock), design + design type and status.
// Sortable, filterable, with pure-weight totals. Route: /app/finished-items

frappe.pages["finished-items"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Finished Items", single_column: true });

	$(page.main).append(`
		<style>
		.fi-bar{display:flex;gap:14px;align-items:end;margin:2px 0 12px;flex-wrap:wrap;}
		.fi-bar .help-box{display:none !important;}
		.fi-box{border:1px solid var(--border-color);border-radius:8px;overflow:auto;max-height:calc(100vh - 240px);}
		table.fi-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:12.5px;background:var(--fg-color);white-space:nowrap;}
		table.fi-tbl th{position:sticky;top:0;background:var(--control-bg,var(--fg-color));border-bottom:2px solid var(--gray-400,#aeb6bf);padding:7px 9px;text-align:left;font-weight:700;cursor:pointer;user-select:none;}
		table.fi-tbl th.num{text-align:right;}
		table.fi-tbl td{border-bottom:1px solid var(--border-color);padding:5px 9px;}
		table.fi-tbl td.num{text-align:right;}
		table.fi-tbl tfoot td{position:sticky;bottom:0;background:var(--control-bg);border-top:2px solid var(--gray-400,#aeb6bf);font-weight:700;}
		.fi-arrow{font-size:9px;color:var(--text-muted);margin-left:2px;}
		</style>
		<div class="fi-bar"><div class="fi-status"></div><div class="fi-held"></div></div>
		<div class="fi-box"><table class="fi-tbl"><thead></thead><tbody></tbody><tfoot></tfoot></table></div>
	`);

	const statusCtl = frappe.ui.form.make_control({ df: { fieldtype: "Select", label: "Status", fieldname: "st", options: "\nIn Stock\nAt Certification\nSold" }, parent: $(page.main).find(".fi-status").get(0), render_input: true });
	statusCtl.refresh();
	const heldCtl = frappe.ui.form.make_control({ df: { fieldtype: "Link", label: "Held By", fieldname: "hb", options: "Customer" }, parent: $(page.main).find(".fi-held").get(0), render_input: true });
	heldCtl.refresh();
	statusCtl.$input.on("change", () => setTimeout(load, 50));
	heldCtl.$input.on("change", () => setTimeout(load, 50));

	const $head = $(page.main).find(".fi-tbl thead");
	const $body = $(page.main).find(".fi-tbl tbody");
	const $foot = $(page.main).find(".fi-tbl tfoot");
	const flt = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));

	const COLS = [
		{ f: "name", label: "Code", t: "str" },
		{ f: "design", label: "Design", t: "str" },
		{ f: "design_type", label: "Type", t: "str" },
		{ f: "held_by", label: "Held By", t: "str" },
		{ f: "stock_status", label: "Status", t: "str" },
		{ f: "act_gross_weight", label: "Gross", t: "num" },
		{ f: "act_nett_weight", label: "Nett", t: "num" },
		{ f: "act_pure_weight", label: "Pure", t: "num" },
		{ f: "act_purity", label: "Purity%", t: "num" },
		{ f: "act_dmd_no", label: "DMD No", t: "num" },
		{ f: "act_dmd_weight", label: "DMD ct", t: "num" },
		{ f: "act_cs_no", label: "CS No", t: "num" },
		{ f: "act_cs_weight", label: "CS ct", t: "num" },
	];
	let rows = [];
	let sort = { field: "name", dir: 1 };

	function sorted() {
		const col = COLS.find((c) => c.f === sort.field) || { t: "str" };
		const d = sort.dir;
		return rows.slice().sort((a, b) => {
			let va = a[sort.field], vb = b[sort.field];
			if (col.t === "num") return ((parseFloat(va) || 0) - (parseFloat(vb) || 0)) * d;
			va = (va == null ? "" : va).toString().toLowerCase();
			vb = (vb == null ? "" : vb).toString().toLowerCase();
			return (va < vb ? -1 : va > vb ? 1 : 0) * d;
		});
	}
	function renderHead() {
		$head.html(`<tr>${COLS.map((c) => `<th class="fi-sort ${c.t === "num" ? "num" : ""}" data-f="${c.f}">${__(c.label)}<span class="fi-arrow"></span></th>`).join("")}</tr>`);
		$head.find(".fi-sort").on("click", function () {
			const f = $(this).data("f");
			if (sort.field === f) sort.dir *= -1;
			else sort = { field: f, dir: 1 };
			renderHead();
			renderBody();
		});
		$head.find(`.fi-sort[data-f="${sort.field}"] .fi-arrow`).text(sort.dir === 1 ? " ▲" : " ▼");
	}
	function num(v) { return v ? flt(v).toFixed(3) : ""; }
	function renderBody() {
		$body.html(
			sorted()
				.map(
					(r) => `<tr>
				<td><a href="/app/order-bag/${encodeURIComponent(r.name)}"><b>${frappe.utils.escape_html(r.name)}</b></a></td>
				<td>${frappe.utils.escape_html(r.design || "")}</td>
				<td>${frappe.utils.escape_html(r.design_type || "")}</td>
				<td>${frappe.utils.escape_html(r.held_by || "")}</td>
				<td>${frappe.utils.escape_html(r.stock_status || "")}</td>
				<td class="num">${num(r.act_gross_weight)}</td>
				<td class="num">${num(r.act_nett_weight)}</td>
				<td class="num">${num(r.act_pure_weight)}</td>
				<td class="num">${r.act_purity ? flt(r.act_purity).toFixed(1) : ""}</td>
				<td class="num">${r.act_dmd_no || ""}</td>
				<td class="num">${num(r.act_dmd_weight)}</td>
				<td class="num">${r.act_cs_no || ""}</td>
				<td class="num">${num(r.act_cs_weight)}</td>
			</tr>`
				)
				.join("") || `<tr><td colspan="13" style="text-align:center;color:var(--text-muted);padding:18px;">No finished items.</td></tr>`
		);
		const g = rows.reduce((s, r) => s + flt(r.act_gross_weight), 0);
		const nt = rows.reduce((s, r) => s + flt(r.act_nett_weight), 0);
		const pu = rows.reduce((s, r) => s + flt(r.act_pure_weight), 0);
		$foot.html(`<tr><td colspan="5">Totals (${rows.length} items)</td><td class="num">${g.toFixed(3)}</td><td class="num">${nt.toFixed(3)}</td><td class="num">${pu.toFixed(3)}</td><td colspan="5"></td></tr>`);
	}

	function load() {
		frappe.call({ method: "jewelima.jewelima.api.get_finished_items", args: { status: statusCtl.get_value() || null, held_by: heldCtl.get_value() || null } }).then((r) => {
			rows = r.message || [];
			renderHead();
			renderBody();
		});
	}

	page.add_inner_button(__("Refresh"), load);
	load();
};
