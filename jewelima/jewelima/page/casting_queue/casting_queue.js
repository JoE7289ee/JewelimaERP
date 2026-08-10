// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Casting (Manufacturing) — the caster's bench. LEFT: trees in queue (cast=0,
// cards at CASTING) with weigh progress and a plannable Casting Date. RIGHT:
// what the Casting warehouse currently holds (rule 1: casting gold lives
// there). "Weight Add" (top) opens the scan-and-weigh page; each tree row's
// Weigh jumps straight there with the tree loaded. Route: /app/casting-queue

frappe.pages["casting-queue"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Casting", single_column: true });
	const API = "jewelima.jewelima.api";

	$(page.main).append(`
		<style>
		.cq-wrap{display:flex;gap:14px;align-items:flex-start;}
		.cq-left{flex:1 1 auto;min-width:0;}
		.cq-right{flex:0 0 340px;}
		.cq-h{font-weight:700;margin:0 2px 6px;}
		.cq-box{border:1px solid var(--border-color);border-radius:11px;overflow:auto;background:var(--fg-color);}
		table.cq-tbl{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.cq-tbl th{position:sticky;top:0;z-index:1;background:var(--control-bg,var(--fg-color));border-bottom:2px solid var(--gray-400,#aeb6bf);padding:6px 10px;text-align:right;white-space:nowrap;font-weight:700;}
		table.cq-tbl td{border-bottom:1px solid var(--border-color);padding:6px 10px;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}
		table.cq-tbl th:nth-child(-n+2),table.cq-tbl td:nth-child(-n+2){text-align:left;}
		table.cq-tbl tr:hover td{background:var(--control-bg);}
		.cq-prog{border-radius:10px;padding:1px 9px;font-size:11px;font-weight:700;}
		.cq-prog.none{background:var(--control-bg);color:var(--text-muted);}
		.cq-prog.some{background:#fdf3d8;color:#8a6d1a;}
		.cq-prog.all{background:#e6f4ea;color:#2e7d32;}
		.cq-date{border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);border-radius:4px;height:26px;padding:1px 6px;font-size:12px;color:var(--text-color);width:130px;}
		.cq-empty{padding:18px;text-align:center;color:var(--text-muted);}
		.cq-hint{margin:10px 2px 0;color:var(--text-muted);font-size:12px;}
		</style>
		<div class="cq-wrap">
			<div class="cq-left">
				<div class="cq-h">${__("Trees in queue")}</div>
				<div class="cq-box"><table class="cq-tbl"><thead><tr>
					<th>${__("Tree")}</th><th>${__("Gold")}</th><th>${__("Cards")}</th>
					<th>${__("Wax (g)")}</th><th>${__("Gold Req (g)")}</th>
					<th>${__("Casting Date")}</th><th>${__("Made By")}</th><th></th>
				</tr></thead><tbody class="cq-body"></tbody></table></div>
				<div class="cq-hint">${__("A tree leaves the queue by itself once EVERY card has its cast weight. Set a date to plan the cast — it stamps automatically when the last card is weighed.")}</div>
			</div>
			<div class="cq-right">
				<div class="cq-h">${__("Stock at")} <span class="cq-wh"></span></div>
				<div class="cq-box"><table class="cq-tbl"><thead><tr>
					<th>${__("Item")}</th><th>${__("Purity %")}</th><th>${__("Qty (g)")}</th>
				</tr></thead><tbody class="cq-stock"></tbody></table></div>
			</div>
		</div>
	`);

	const root = $(page.main)[0];
	const esc = frappe.utils.escape_html;
	const fmt = (v) => (v ? flt(v).toFixed(3) : "—");

	function render(d) {
		root.querySelector(".cq-wh").textContent = (d.casting_warehouse || "").replace(/ - [A-Za-z]+$/, "");
		const body = root.querySelector(".cq-body");
		body.innerHTML = (d.trees || []).length
			? d.trees.map((t) => {
				const cls = !t.weighted ? "none" : t.weighted < t.cards ? "some" : "all";
				return `<tr>
					<td><a href="/app/wax-tree/${encodeURIComponent(t.tree)}"><b>${esc(t.tree)}</b></a></td>
					<td>${esc(t.karat)}</td>
					<td style="text-align:center"><span class="cq-prog ${cls}">${t.weighted}/${t.cards}</span></td>
					<td>${fmt(t.wax_weight)}</td>
					<td><b>${fmt(t.gold_required)}</b></td>
					<td><input type="date" class="cq-date" data-tree="${esc(t.tree)}" value="${esc(t.casting_date || "")}"></td>
					<td style="text-align:left">${esc(t.employee)}</td>
					<td><button class="btn btn-primary btn-xs cq-weigh" data-tree="${esc(t.tree)}">${__("Weigh")}</button></td>
				</tr>`;
			}).join("")
			: `<tr><td colspan="8" class="cq-empty">${__("No trees waiting — make trees on the Tree Making board.")}</td></tr>`;

		body.querySelectorAll(".cq-date").forEach((el) =>
			el.addEventListener("change", function () {
				frappe.call({
					method: API + ".set_tree_casting_date",
					args: { tree: this.getAttribute("data-tree"), date: this.value || "" },
				}).then(() => frappe.show_alert({ message: __("Casting date saved."), indicator: "green" }, 3));
			})
		);
		body.querySelectorAll(".cq-weigh").forEach((el) =>
			el.addEventListener("click", function () {
				frappe.route_options = { cast_tree: this.getAttribute("data-tree") };
				frappe.set_route("casting-weigh");
			})
		);

		root.querySelector(".cq-stock").innerHTML = (d.stock || []).length
			? d.stock.map((s) => `<tr>
					<td><b>${esc(s.item)}</b></td>
					<td>${s.purity ? flt(s.purity).toFixed(1) + "%" : "—"}</td>
					<td>${fmt(s.qty)}</td>
				</tr>`).join("")
			: `<tr><td colspan="3" class="cq-empty">${__("Nothing in the Casting warehouse — melt & send first.")}</td></tr>`;
	}

	function load() {
		frappe.call({ method: API + ".get_casting_queue" }).then((r) => render(r.message || {}));
	}
	page.add_inner_button(__("Weight Add"), () => frappe.set_route("casting-weigh"));
	page.add_inner_button(__("Refresh"), load);
	load();
};
