// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Purchase History — the register the purchase desk writes into: every
// Purchase Record (voucher type, supplier, warehouse, lines with purity/
// rate), filterable by voucher / supplier / dates, with gold-gram and
// stone-carat totals over the filter. Click a row to open its lines.
// Read-only. Route: /app/purchase-history

frappe.pages["purchase-history"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Purchase History", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const g3 = (v) => (v || 0).toLocaleString("en-IN", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
	const m2 = (v) => (v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
	let DATA = null;
	const OPEN = new Set();

	$(page.main).append(`
		<style>
		#page-purchase-history .container{max-width:100%;}
		.ph-bar{display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin-bottom:10px;}
		.ph-bar .frappe-control{margin:0;min-width:180px;}
		.ph-bar label{font-size:10px !important;}
		.ph-tiles{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:10px;}
		.ph-tile{border:1px solid var(--border-color);border-radius:9px;padding:6px 14px;background:var(--control-bg);}
		.ph-tile .k{font-size:9.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;}
		.ph-tile .v{font-size:15px;font-weight:800;}
		table.ph-t{width:100%;border-collapse:collapse;font-size:12px;background:var(--fg-color);}
		table.ph-t th{background:var(--control-bg);font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);padding:5px 8px;border:1px solid var(--border-color);text-align:right;white-space:nowrap;}
		table.ph-t th.l{text-align:left;}
		table.ph-t td{border:1px solid var(--border-color);padding:4px 8px;font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right;}
		table.ph-t td.l{text-align:left;}
		tr.ph-r{cursor:pointer;}
		tr.ph-r:hover td{background:var(--control-bg);}
		tr.ph-lines td{background:var(--control-bg);padding:8px 12px;}
		table.ph-in{width:auto;min-width:520px;border-collapse:collapse;font-size:11.5px;}
		table.ph-in th{background:var(--fg-color);font-size:9.5px;text-transform:uppercase;color:var(--text-muted);padding:3px 10px;border:1px solid var(--border-color);text-align:right;}
		table.ph-in th.l{text-align:left;}
		table.ph-in td{border:1px solid var(--border-color);padding:3px 10px;text-align:right;font-variant-numeric:tabular-nums;}
		table.ph-in td.l{text-align:left;}
		.ph-none{padding:30px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:10px;}
		</style>
		<div class="ph-bar">
			<div class="ph-f-voucher"></div>
			<div class="ph-f-supplier"></div>
			<div class="ph-f-from"></div>
			<div class="ph-f-to"></div>
		</div>
		<div class="ph-tiles"></div>
		<div class="ph-body"><div class="ph-none">${__("loading…")}</div></div>
	`);
	const root = $(page.main);

	const mk = (sel, df) => {
		const c = frappe.ui.form.make_control({ df: Object.assign({ onchange: () => load() }, df),
			parent: root.find(sel).get(0), render_input: true });
		c.refresh();
		return c;
	};
	const fV = mk(".ph-f-voucher", { fieldtype: "Link", label: __("Voucher Type"), fieldname: "v", options: "Voucher Type", only_select: 1 });
	const fS = mk(".ph-f-supplier", { fieldtype: "Link", label: __("Supplier"), fieldname: "s", options: "Supplier", only_select: 1 });
	const fF = mk(".ph-f-from", { fieldtype: "Date", label: __("From"), fieldname: "f" });
	const fT = mk(".ph-f-to", { fieldtype: "Date", label: __("To"), fieldname: "t" });

	function load() {
		frappe.call({ method: API + ".list_purchase_records", args: {
			voucher_type: fV.get_value() || undefined, supplier: fS.get_value() || undefined,
			from_date: fF.get_value() || undefined, to_date: fT.get_value() || undefined,
		} }).then((r) => {
			DATA = r.message || { rows: [], totals: {} };
			OPEN.clear();
			paint();
		});
	}

	function linesHtml(r) {
		return `<table class="ph-in"><thead><tr>
			<th class="l">${__("Item")}</th><th>${__("Weight")}</th><th>${__("Pcs")}</th><th>${__("Purity %")}</th><th>${__("Rate")}</th>
		</tr></thead><tbody>
		${r.items.map((i) => `<tr>
			<td class="l"><b>${esc(i.item)}</b></td>
			<td>${g3(i.weight)} ${i.is_stone ? "ct" : "g"}</td>
			<td>${i.is_stone ? i.count || "" : ""}</td>
			<td>${i.is_stone ? "" : i.purity || ""}</td>
			<td>${i.rate ? m2(i.rate) : ""}</td>
		</tr>`).join("")}</tbody></table>`;
	}

	function paint() {
		const t = DATA.totals || {};
		root.find(".ph-tiles").html(`
			<div class="ph-tile"><div class="k">${__("Purchases")}</div><div class="v">${t.n || 0}</div></div>
			<div class="ph-tile"><div class="k">${__("Gold")}</div><div class="v">${g3(t.gold)} g</div></div>
			<div class="ph-tile"><div class="k">${__("Stones")}</div><div class="v">${g3(t.ct)} ct · ${t.pcs || 0} ${__("pc")}</div></div>
			<div class="ph-tile"><div class="k">${__("Amount")}</div><div class="v">${m2(t.amount)}</div></div>`);
		root.find(".ph-body").html((DATA.rows || []).length ? `
			<table class="ph-t"><thead><tr>
				<th class="l">${__("Record")}</th><th class="l">${__("Date")}</th><th class="l">${__("Voucher")}</th>
				<th class="l">${__("Supplier")}</th><th class="l">${__("Warehouse")}</th>
				<th>${__("Gold g")}</th><th>${__("Stone ct")}</th><th>${__("Pcs")}</th><th>${__("Amount")}</th>
				<th class="l">${__("Receipt")}</th><th class="l">${__("By")}</th>
			</tr></thead><tbody>
			${DATA.rows.map((r) => `<tr class="ph-r" data-n="${esc(r.name)}" title="${__("click for the lines")}">
				<td class="l"><b>${OPEN.has(r.name) ? "▾" : "▸"} ${esc(r.name)}</b></td>
				<td class="l">${esc(r.purchase_date || "")}</td>
				<td class="l">${esc(r.voucher_title || "")}</td>
				<td class="l">${esc(r.supplier || "")}</td>
				<td class="l">${esc(r.warehouse || "")}</td>
				<td>${r.gold ? g3(r.gold) : ""}</td>
				<td>${r.ct ? g3(r.ct) : ""}</td>
				<td>${r.pcs || ""}</td>
				<td>${r.total_amount ? m2(r.total_amount) : ""}</td>
				<td class="l">${esc(r.purchase_receipt || "")}</td>
				<td class="l">${esc((r.recorded_by || "").split("@")[0])}</td>
			</tr>${OPEN.has(r.name) ? `<tr class="ph-lines"><td colspan="11">${linesHtml(r)}</td></tr>` : ""}`).join("")}
			</tbody></table>`
			: `<div class="ph-none">${__("No purchases match — post one on Purchase Raw Material and it lands here.")}</div>`);
	}

	root.on("click", "tr.ph-r", function () {
		const n = $(this).data("n");
		OPEN.has(n) ? OPEN.delete(n) : OPEN.add(n);
		paint();
	});

	load();
};
