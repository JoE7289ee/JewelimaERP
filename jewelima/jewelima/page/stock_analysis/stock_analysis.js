// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Stock Analysis (Reports > Orders) — the order book vs the issue warehouses.
// Per raw material: plan (every ACTIVE bag's BOM × qty) minus what's already
// been issued = OUTSTANDING, compared to the stock sitting in the issue
// warehouses (Raw Materials Store / Gold Issue / Stone Issue). Anything the
// orders need that the shelves can't cover is called out SHORT; the rest is
// good to go. Route: /app/stock-analysis

frappe.pages["stock-analysis"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Stock Analysis", single_column: true });
	const API = "jewelima.jewelima.api";
	const S = { rows: [], bags: 0, term: "", onlyShort: false };

	$(page.main).append(`
		<style>
		.sa-cards{display:flex;gap:12px;flex-wrap:wrap;margin:2px 0 12px;}
		.sa-card{border:1px solid var(--border-color);border-radius:8px;background:var(--fg-color);padding:10px 16px;min-width:170px;}
		.sa-card .lb{font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;}
		.sa-card .v{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums;}
		.sa-card.bad{box-shadow:inset 3px 0 0 #b00020;}
		.sa-card.bad .v{color:#b00020;}
		.sa-card.ok{box-shadow:inset 3px 0 0 #2e7d32;}
		.sa-card.ok .v{color:#2e7d32;}
		.sa-top{display:flex;align-items:center;gap:10px;margin:0 0 10px;flex-wrap:wrap;}
		.sa-search{width:280px;border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);padding:4px 10px;height:30px;border-radius:5px;box-sizing:border-box;color:var(--text-color);font-size:13px;}
		.sa-top label{display:flex;align-items:center;gap:6px;font-size:13px;margin:0;cursor:pointer;}
		.sa-count{color:var(--text-muted);font-size:12px;margin-left:auto;}
		.sa-box{border:1px solid var(--border-color);border-radius:8px;overflow:auto;max-height:calc(100vh - 260px);background:var(--fg-color);}
		table.sa-tbl{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.sa-tbl th{position:sticky;top:0;z-index:1;background:var(--control-bg,var(--fg-color));border-bottom:2px solid var(--gray-400,#aeb6bf);padding:6px 10px;text-align:right;white-space:nowrap;font-weight:700;}
		table.sa-tbl td{border-bottom:1px solid var(--border-color);padding:6px 10px;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}
		table.sa-tbl th:nth-child(-n+2),table.sa-tbl td:nth-child(-n+2){text-align:left;}
		table.sa-tbl tr:hover td{background:var(--control-bg);}
		table.sa-tbl tr.short td{background:#fdf3f3;}
		table.sa-tbl tr.short:hover td{background:#fbeaea;}
		.sa-badge{border-radius:10px;padding:1px 10px;font-size:11px;font-weight:700;}
		.sa-badge.short{background:#b00020;color:#fff;}
		.sa-badge.ok{background:#e6f4ea;color:#2e7d32;}
		.sa-neg{color:#b00020;font-weight:700;}
		.sa-pos{color:#2e7d32;}
		.sa-empty{padding:18px;text-align:center;color:var(--text-muted);}
		.sa-hint{margin:10px 2px 0;color:var(--text-muted);font-size:12px;}
		</style>
		<div class="sa-cards"></div>
		<div class="sa-top">
			<input class="sa-search" type="text" placeholder="${__("Search materials…")}">
			<label><input type="checkbox" class="sa-onlyshort"> ${__("Only shortages")}</label>
			<span class="sa-count"></span>
		</div>
		<div class="sa-box"><table class="sa-tbl"><thead><tr>
			<th>${__("Material")}</th><th>${__("Group")}</th>
			<th>${__("Order Plan")}</th><th>${__("Already Issued")}</th><th>${__("Outstanding")}</th>
			<th>${__("In Issue Whs")}</th><th>${__("Balance")}</th><th>${__("Status")}</th>
		</tr></thead><tbody class="sa-body"></tbody></table></div>
		<div class="sa-hint"></div>
	`);

	const root = $(page.main)[0];
	const esc = frappe.utils.escape_html;
	const fmt = (v, uom) => flt(v).toFixed(3) + (uom === "Carat" ? " ct" : " g");

	function render() {
		const term = S.term.toLowerCase().trim();
		const list = S.rows.filter((r) =>
			(!S.onlyShort || r.short) &&
			(!term || r.item.toLowerCase().includes(term) || r.group.toLowerCase().includes(term)));
		const shorts = S.rows.filter((r) => r.short).length;

		root.querySelector(".sa-cards").innerHTML = `
			<div class="sa-card"><div class="lb">${__("Active bags")}</div><div class="v">${S.bags}</div></div>
			<div class="sa-card"><div class="lb">${__("Materials on order")}</div><div class="v">${S.rows.length}</div></div>
			<div class="sa-card ${shorts ? "bad" : "ok"}"><div class="lb">${__("Running out")}</div>
				<div class="v">${shorts ? shorts + " " + __("SHORT") : __("GOOD TO GO")}</div></div>`;

		root.querySelector(".sa-count").textContent = __("{0} material(s)", [list.length]);
		const body = root.querySelector(".sa-body");
		body.innerHTML = list.length
			? list.map((r) => `
				<tr class="${r.short ? "short" : ""}">
					<td><a href="/app/item/${encodeURIComponent(r.item)}"><b>${esc(r.item)}</b></a></td>
					<td>${esc(r.group)}</td>
					<td>${fmt(r.plan, r.uom)}</td>
					<td>${fmt(r.issued, r.uom)}</td>
					<td><b>${fmt(r.outstanding, r.uom)}</b></td>
					<td>${fmt(r.available, r.uom)}</td>
					<td class="${r.balance < 0 ? "sa-neg" : "sa-pos"}">${fmt(r.balance, r.uom)}</td>
					<td style="text-align:center"><span class="sa-badge ${r.short ? "short" : "ok"}">${r.short ? __("SHORT") : __("OK")}</span></td>
				</tr>`).join("")
			: `<tr><td colspan="8" class="sa-empty">${S.rows.length ? __("Nothing matches.") : __("No active order requirement.")}</td></tr>`;
	}

	function load() {
		frappe.call({ method: API + ".get_order_stock_analysis" }).then((r) => {
			const d = r.message || {};
			S.rows = d.rows || [];
			S.bags = d.bags || 0;
			root.querySelector(".sa-hint").textContent =
				__("Outstanding = active bags' BOM × qty − already issued (ledger). Available = stock in {0}. Finished / Cancelled / Sold bags don't count.",
					[(d.issue_warehouses || []).map((w) => w.replace(/ - [A-Za-z]+$/, "")).join(", ")]);
			render();
		});
	}

	root.querySelector(".sa-search").addEventListener("input", frappe.utils.debounce(function () {
		S.term = this.value || "";
		render();
	}, 200));
	root.querySelector(".sa-onlyshort").addEventListener("change", function () {
		S.onlyShort = this.checked;
		render();
	});
	page.add_inner_button(__("Refresh"), load);
	load();
};
