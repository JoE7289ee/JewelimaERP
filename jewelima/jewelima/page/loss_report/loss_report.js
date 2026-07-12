// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Loss Report (Reports > Stock Reports) — every '<Stage> -LOSS' warehouse in one
// matrix: rows = materials (categorised by karat group, purity shown), columns =
// the loss benches, cells heat-shaded by grams. Headers and the Total column
// carry gross AND PURE gold (qty x purity%) per warehouse — the number that
// matters when the sweep goes back to melt. Route: /app/loss-report

frappe.pages["loss-report"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Loss Report", single_column: true });
	const S = { d: null, term: "" };
	const esc = frappe.utils.escape_html;
	const fmt = (v) => flt(v).toFixed(3);

	$(page.main).append(`
		<style>
		.lr-cards{display:flex;gap:12px;flex-wrap:wrap;margin:2px 0 12px;}
		.lr-card{border:1px solid var(--border-color);border-radius:8px;background:var(--fg-color);padding:10px 16px;min-width:160px;}
		.lr-card .lb{font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;}
		.lr-card .v{font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;}
		.lr-card.loss{box-shadow:inset 3px 0 0 #b02a2a;}
		.lr-card.pure{box-shadow:inset 3px 0 0 #b8860b;}
		.lr-card.pure .v{color:#8a6d1a;}
		.lr-top{display:flex;align-items:center;gap:10px;margin:0 0 10px;flex-wrap:wrap;}
		.lr-search{width:260px;border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);padding:4px 10px;height:30px;border-radius:5px;box-sizing:border-box;color:var(--text-color);font-size:13px;}
		.lr-count{color:var(--text-muted);font-size:12px;margin-left:auto;}
		.lr-box{border:1px solid var(--border-color);border-radius:8px;overflow:auto;max-height:calc(100vh - 250px);background:var(--fg-color);}
		table.lr-tbl{border-collapse:separate;border-spacing:0;font-size:12.5px;min-width:100%;}
		table.lr-tbl th{position:sticky;top:0;z-index:2;background:var(--control-bg,var(--fg-color));border-bottom:2px solid var(--gray-400,#aeb6bf);padding:6px 10px;text-align:right;white-space:nowrap;font-weight:700;vertical-align:bottom;}
		table.lr-tbl th:first-child{left:0;z-index:3;text-align:left;}
		table.lr-tbl td:first-child{position:sticky;left:0;background:var(--fg-color);text-align:left;z-index:1;border-right:1px solid var(--border-color);}
		table.lr-tbl tr:hover td{filter:brightness(.97);}
		table.lr-tbl td{border-bottom:1px solid var(--border-color);padding:5px 10px;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}
		table.lr-tbl td.tot,table.lr-tbl th.tot{font-weight:800;border-left:2px solid var(--gray-400,#aeb6bf);}
		.lr-wh{font-weight:800;}
		.lr-wh-sub{font-size:10.5px;color:var(--text-muted);font-weight:400;}
		.lr-wh-sub b{color:#8a6d1a;}
		.lr-item{font-weight:700;}
		.lr-grp{display:block;font-size:10.5px;color:var(--text-muted);font-weight:400;}
		td.lr-cell{background:rgba(176,42,42,var(--a,0));}
		.lr-unit{color:var(--text-muted);font-size:10px;margin-left:2px;}
		.lr-pure{display:block;font-size:10px;color:#8a6d1a;font-weight:700;}
		.lr-empty{padding:18px;text-align:center;color:var(--text-muted);}
		.lr-hint{margin:10px 2px 0;color:var(--text-muted);font-size:12px;}
		</style>
		<div class="lr-cards"></div>
		<div class="lr-top">
			<input class="lr-search" type="text" placeholder="${__("Search materials…")}">
			<span class="lr-count"></span>
		</div>
		<div class="lr-box"><table class="lr-tbl"><thead class="lr-head"></thead><tbody class="lr-body"></tbody></table></div>
		<div class="lr-hint">${__("Everything sitting in the -LOSS collection warehouses, bench by bench. Darker cells hold more. The gold line under each bench and in the Total column is PURE gold (grams × the item's purity %) — what the sweep is really worth at melt.")}</div>
	`);
	const root = $(page.main)[0];

	function render() {
		const d = S.d || {};
		const t = d.totals || {};
		root.querySelector(".lr-cards").innerHTML = `
			<div class="lr-card loss"><div class="lb">${__("Loss Gold (gross)")}</div><div class="v">${fmt(t.gross || 0)} g</div></div>
			<div class="lr-card pure"><div class="lb">${__("Pure Gold in Loss")}</div><div class="v">${fmt(t.pure || 0)} g</div></div>
			<div class="lr-card"><div class="lb">${__("Loss Warehouses")}</div><div class="v">${t.warehouses || 0}</div></div>
			<div class="lr-card"><div class="lb">${__("Materials")}</div><div class="v">${t.materials || 0}</div></div>`;

		const term = S.term.toLowerCase().trim();
		const items = (d.items || []).filter((r) =>
			!term || r.item.toLowerCase().includes(term) || r.group.toLowerCase().includes(term));
		const whs = d.warehouses || [];
		root.querySelector(".lr-count").textContent = __("{0} material(s)", [items.length]);

		root.querySelector(".lr-head").innerHTML = `<tr>
			<th>${__("Material")}</th>
			${whs.map((w) => `<th><span class="lr-wh">${esc(w.label)}</span><br>
				<span class="lr-wh-sub">${fmt(w.gross)} g · ${__("pure")} <b>${fmt(w.pure)} g</b></span></th>`).join("")}
			<th class="tot">${__("Total")}</th>
		</tr>`;

		const body = root.querySelector(".lr-body");
		body.innerHTML = items.length
			? items.map((r) => {
				const max = Math.max(...Object.values(r.cells), 0.0001);
				const unit = r.is_stone ? "ct" : "g";
				return `<tr>
					<td><span class="lr-item">${esc(r.item)}</span>
						<span class="lr-grp">${esc(r.group)}${r.purity ? ` · ${r.purity}%` : ""}</span></td>
					${whs.map((w) => {
						const v = r.cells[w.warehouse];
						const a = v ? (0.08 + 0.32 * (v / max)).toFixed(2) : 0;
						return `<td class="${v ? "lr-cell" : ""}" style="--a:${a}">${v ? fmt(v) + `<span class="lr-unit">${unit}</span>` : "·"}</td>`;
					}).join("")}
					<td class="tot">${fmt(r.total)}<span class="lr-unit">${unit}</span>
						${r.purity ? `<span class="lr-pure">${__("pure")} ${fmt(r.pure)} g</span>` : ""}</td>
				</tr>`;
			}).join("")
			: `<tr><td colspan="${whs.length + 2}" class="lr-empty">${(d.items || []).length ? __("Nothing matches.") : __("The loss warehouses are empty — no recoverable loss collected yet.")}</td></tr>`;
	}

	function load() {
		frappe.call({ method: "jewelima.jewelima.api.get_loss_report" }).then((r) => {
			S.d = r.message || {};
			render();
		});
	}
	root.querySelector(".lr-search").addEventListener("input", frappe.utils.debounce(function () {
		S.term = this.value || "";
		render();
	}, 200));

	// ---- print (B&W friendly: borders + weights only, no colour shading) -----
	frappe.call({ method: "jewelima.jewelima.api.get_print_branding" }).then((r) => (S.branding = r.message || {}));

	const PRINT_CSS = `
		.lrp-date{font-size:11px;color:#333;margin:-6px 0 12px;}
		table.lrp{width:100%;border-collapse:collapse;font-size:11.5px;}
		table.lrp th,table.lrp td{border:1px solid #444;padding:4px 8px;text-align:right;font-variant-numeric:tabular-nums;}
		table.lrp th{background:#eee;font-weight:700;}
		table.lrp th:first-child,table.lrp td:first-child{text-align:left;}
		table.lrp .sub{display:block;font-size:9.5px;color:#555;font-weight:400;}
		table.lrp .pure{display:block;font-size:9.5px;color:#111;font-weight:700;}
		table.lrp tfoot td{background:#eee;font-weight:800;}
		.lrp-sum{margin:12px 0 0;font-size:12px;}
		.lrp-sum b{font-variant-numeric:tabular-nums;}
		@media print{table.lrp th,table.lrp tfoot td{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
	`;

	function buildPrintHTML() {
		const d = S.d || {};
		const t = d.totals || {};
		const whs = d.warehouses || [];
		const items = d.items || [];
		const head = `<tr><th>${__("Material")}</th>
			${whs.map((w) => `<th>${esc(w.label)}<span class="sub">${fmt(w.gross)} g · ${__("pure")} ${fmt(w.pure)} g</span></th>`).join("")}
			<th>${__("Total")}</th></tr>`;
		const body = items.map((r) => `<tr>
			<td>${esc(r.item)}<span class="sub">${esc(r.group)}${r.purity ? ` · ${r.purity}%` : ""}</span></td>
			${whs.map((w) => `<td>${r.cells[w.warehouse] ? fmt(r.cells[w.warehouse]) : "—"}</td>`).join("")}
			<td><b>${fmt(r.total)}</b>${r.purity ? `<span class="pure">${__("pure")} ${fmt(r.pure)} g</span>` : ""}</td>
		</tr>`).join("");
		const foot = `<tr><td>${__("TOTAL")}</td>
			${whs.map((w) => `<td>${fmt(w.gross)}<span class="pure">${__("pure")} ${fmt(w.pure)} g</span></td>`).join("")}
			<td>${fmt(t.gross || 0)}<span class="pure">${__("pure")} ${fmt(t.pure || 0)} g</span></td></tr>`;
		return `
			<div class="lrp-date">${__("Exported")}: ${frappe.datetime.str_to_user(frappe.datetime.now_datetime())}</div>
			<table class="lrp"><thead>${head}</thead><tbody>${body}</tbody><tfoot>${foot}</tfoot></table>
			<div class="lrp-sum">${__("Loss gold (gross)")} <b>${fmt(t.gross || 0)} g</b> &nbsp;·&nbsp;
				${__("Pure gold in loss")} <b>${fmt(t.pure || 0)} g</b> &nbsp;·&nbsp;
				${t.warehouses || 0} ${__("warehouse(s)")} &nbsp;·&nbsp; ${t.materials || 0} ${__("material(s)")}</div>`;
	}

	page.add_inner_button(__("Print"), () => {
		if (!S.d || !(S.d.items || []).length) {
			frappe.show_alert({ message: __("Nothing to print — the loss warehouses are empty."), indicator: "orange" }, 4);
			return;
		}
		jewelima.print_window(S.branding || {}, __("Loss Report"), buildPrintHTML(), PRINT_CSS);
	});
	page.add_inner_button(__("Refresh"), load);
	load();
};
