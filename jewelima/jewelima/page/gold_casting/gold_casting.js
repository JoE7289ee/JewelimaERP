// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Gold Casting report (Reports > Casting) — the caster's planning sheet.
// RULE: casting gold always comes from the CASTING warehouse (stems recycle back
// into it). Per karat gold: what the pending trees need — (wax − 3g stem −
// issued stones) × karat multiplier — minus what Casting already holds = the
// shortfall to MELT, split into pure gold + alloy, checked against the melt
// warehouses' Standard Gold (pure-equivalent) and Alloy stock.
// Route: /app/gold-casting

frappe.pages["gold-casting"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Gold Casting", single_column: true });
	const API = "jewelima.jewelima.api";

	$(page.main).append(`
		<style>
		.gc-melt{display:flex;gap:12px;flex-wrap:wrap;margin:2px 0 14px;}
		.gc-card{border:1px solid var(--border-color);border-radius:11px;background:var(--fg-color);padding:11px 16px;min-width:190px;transition:transform .12s,box-shadow .12s;}
		.gc-card:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(0,0,0,.09);}
		.gc-card .lb{font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;}
		.gc-card .v{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums;}
		.gc-card .sub{font-size:11.5px;color:var(--text-muted);}
		.gc-card.ok{box-shadow:inset 3px 0 0 #2e7d32;}
		.gc-card.short{box-shadow:inset 3px 0 0 #b00020;}
		.gc-card.short .v{color:#b00020;}
		.gc-h{font-weight:700;margin:14px 2px 6px;}
		.gc-box{border:1px solid var(--border-color);border-radius:11px;overflow:auto;background:var(--fg-color);}
		table.gc-tbl{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.gc-tbl th{position:sticky;top:0;background:var(--control-bg,var(--fg-color));border-bottom:2px solid var(--gray-400,#aeb6bf);padding:6px 10px;text-align:right;white-space:nowrap;font-weight:700;}
		table.gc-tbl td{border-bottom:1px solid var(--border-color);padding:6px 10px;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}
		table.gc-tbl th:first-child,table.gc-tbl td:first-child{text-align:left;}
		table.gc-tbl tr:hover td{background:var(--control-bg);}
		table.gc-tbl td.bad{color:#b00020;font-weight:700;}
		table.gc-tbl td.good{color:#2e7d32;font-weight:700;}
		.gc-karat{font-weight:800;}
		.gc-empty{padding:18px;text-align:center;color:var(--text-muted);}
		.gc-hint{margin:10px 2px 0;color:var(--text-muted);font-size:12px;}
		</style>
		<div class="gc-melt"></div>
		<div class="gc-h">${__("Per karat gold — required vs the Casting warehouse")}</div>
		<div class="gc-box"><table class="gc-tbl"><thead><tr>
			<th>${__("Gold")}</th><th>${__("Purity %")}</th><th>${__("Trees")}</th>
			<th>${__("Required (g)")}</th><th>${__("In Casting (g)")}</th><th>${__("To Melt (g)")}</th>
			<th>${__("Pure Gold (g)")}</th><th>${__("Alloy (g)")}</th><th></th>
		</tr></thead><tbody class="gc-karats"></tbody></table></div>
		<div class="gc-h">${__("Trees awaiting cast")}</div>
		<div class="gc-box"><table class="gc-tbl"><thead><tr>
			<th>${__("Tree")}</th><th>${__("Gold")}</th><th>${__("Cards")}</th><th>${__("Made By")}</th>
			<th>${__("Wax (g)")}</th><th>${__("Stones (g)")}</th><th>${__("Gold Required (g)")}</th><th>${__("Pure (g)")}</th>
		</tr></thead><tbody class="gc-trees"></tbody></table></div>
		<div class="gc-hint">${__("Gold required = (wax − 3g stem − issued stones ct×0.2) × multiplier (14K ×13.5 · 18K ×15.5 · 22K ×18.5). Casting gold always comes from the Casting warehouse — stems melt back into it.")}</div>
	`);

	const root = $(page.main)[0];
	const esc = frappe.utils.escape_html;
	const fmt = (v) => (v ? flt(v).toFixed(3) : "—");

	function meltCard(label, needed, available, unit) {
		const short = flt(needed) > flt(available);
		return `<div class="gc-card ${flt(needed) ? (short ? "short" : "ok") : ""}">
			<div class="lb">${esc(label)}</div>
			<div class="v">${fmt(needed)} ${unit}</div>
			<div class="sub">${__("available")} ${fmt(available)}${short ? " · <b>" + __("SHORT") + " " + fmt(needed - available) + "</b>" : ""}</div>
		</div>`;
	}

	function render(d) {
		const m = d.melt || {};
		root.querySelector(".gc-melt").innerHTML =
			`<div class="gc-card"><div class="lb">${__("Trees waiting")}</div><div class="v">${(d.trees || []).length}</div>
				<div class="sub">${__("casting from")} ${esc(d.casting_warehouse || "")}</div></div>` +
			meltCard(__("Pure gold to melt"), m.pure_needed, m.pure_available, "g") +
			meltCard(__("Alloy to melt"), m.alloy_needed, m.alloy_available, "g");

		const kb = root.querySelector(".gc-karats");
		kb.innerHTML = (d.karats || []).length
			? d.karats.map((k) => `
				<tr>
					<td class="gc-karat">${esc(k.item)}</td>
					<td>${flt(k.purity).toFixed(1)}%</td>
					<td>${k.trees}</td>
					<td>${fmt(k.required)}</td>
					<td>${fmt(k.available)}</td>
					<td class="${k.shortfall ? "bad" : "good"}">${k.shortfall ? fmt(k.shortfall) : __("covered")}</td>
					<td>${fmt(k.pure_needed)}</td>
					<td>${fmt(k.alloy_needed)}</td>
					<td style="text-align:center">${k.shortfall
						? `<button class="btn btn-primary btn-xs gc-melt-btn" data-karat="${esc(k.item)}" data-grams="${k.shortfall}">${__("Melt")}</button>`
						: ""}</td>
				</tr>`).join("")
			: `<tr><td colspan="9" class="gc-empty">${__("No trees waiting at CASTING.")}</td></tr>`;
		kb.querySelectorAll(".gc-melt-btn").forEach((el) =>
			el.addEventListener("click", function () {
				// hand the shortfall to the Melting page — karat + grams arrive pre-filled
				frappe.route_options = { jw_melt: { karat: this.getAttribute("data-karat"), grams: flt(this.getAttribute("data-grams")) } };
				frappe.set_route("melt-gold");
			})
		);

		const tb = root.querySelector(".gc-trees");
		tb.innerHTML = (d.trees || []).length
			? d.trees.map((t) => `
				<tr>
					<td><a href="#" class="gc-tree-link" data-tree="${esc(t.tree)}" data-emp="${esc(t.employee || "")}"><b>${esc(t.tree)}</b></a></td>
					<td>${esc(t.karat)}</td>
					<td>${t.cards}</td>
					<td>${esc(t.employee)}</td>
					<td>${fmt(t.wax_weight)}</td>
					<td>${fmt(t.stone_weight)}</td>
					<td><b>${fmt(t.gold_required)}</b></td>
					<td>${fmt(t.pure_gold_needed)}</td>
				</tr>`).join("")
			: `<tr><td colspan="8" class="gc-empty">${__("No trees waiting at CASTING.")}</td></tr>`;
		tb.querySelectorAll(".gc-tree-link").forEach((el) =>
			el.addEventListener("click", function (e) { e.preventDefault(); showTree(this.getAttribute("data-tree"), this.getAttribute("data-emp")); }));
	}

	function showTree(tree, empName) {
		frappe.call({ method: API + ".get_tree_edit", args: { tree } }).then((r) => {
			const d = r.message || {};
			const cards = d.cards || [];
			const totCards = cards.reduce((a, c) => a + (c.qty || 1), 0);
			const totGold = cards.reduce((a, c) => a + flt(c.cast_gold), 0);
			const dlg = new frappe.ui.Dialog({ title: __("Tree {0}", [d.tree_no || tree]), size: "large" });
			$(dlg.body).html(`
				<div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:12px;font-size:12.5px;color:var(--text-muted);">
					<div>${__("Gold")}: <b style="color:var(--text-color);">${esc(d.karat || "—")}</b></div>
					<div>${__("Cards")}: <b style="color:var(--text-color);">${cards.length} (${totCards} ${__("pcs")})</b></div>
					<div>${__("Wax")}: <b style="color:var(--text-color);">${fmt(d.wax_weight)} g</b></div>
					<div>${__("Gold required")}: <b style="color:var(--text-color);">${fmt(d.gold_required)} g</b></div>
					<div>${__("Made by")}: <b style="color:var(--text-color);">${esc(empName || d.employee || "—")}</b></div>
				</div>
				<div style="border:1px solid var(--border-color);border-radius:9px;overflow:auto;max-height:60vh;">
					<table class="table" style="font-size:13px;margin:0;">
						<thead><tr>
							<th>${__("Order ID")}</th><th>${__("Design")}</th>
							<th style="text-align:right">${__("Qty")}</th><th>${__("At")}</th>
							<th style="text-align:right">${__("Cast Gold (g)")}</th>
						</tr></thead>
						<tbody>${cards.length ? cards.map((c) => `
							<tr>
								<td><b>${esc(c.order_bag)}</b></td><td>${esc(c.design)}</td>
								<td style="text-align:right">${c.qty || 1}</td><td>${esc(c.location)}</td>
								<td style="text-align:right">${fmt(c.cast_gold)}</td>
							</tr>`).join("") : `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:18px;">${__("No cards on this tree.")}</td></tr>`}
						${cards.length ? `<tr style="font-weight:700;background:var(--control-bg);">
							<td>${__("Total")}</td><td></td><td style="text-align:right">${totCards}</td><td></td>
							<td style="text-align:right">${fmt(totGold)}</td></tr>` : ""}</tbody>
					</table>
				</div>
			`);
			dlg.show();
		});
	}

	function load() {
		frappe.call({ method: API + ".get_gold_casting_report" }).then((r) => render(r.message || {}));
	}
	page.add_inner_button(__("Refresh"), load);
	load();
};
