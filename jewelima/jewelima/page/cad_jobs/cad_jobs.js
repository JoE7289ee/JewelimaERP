// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// CAD Jobs — every Order Bag still awaiting its CAD design, with the target budgets.
// Finalize opens the shared dialog (jewelima.finalize_cad): create the real design,
// attach it to the bag (+ twins), clear the CAD flag. The catch-all counterpart to the
// collect-time prompt on Assign/Collect. Route: /app/cad-jobs

frappe.pages["cad-jobs"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "CAD Jobs", single_column: true });

	$(page.main).append(`
		<style>
		.cj-box{border:1px solid var(--border-color);border-radius:8px;overflow:auto;max-height:calc(100vh - 180px);}
		table.cj-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;background:var(--fg-color);}
		table.cj-tbl th{position:sticky;top:0;z-index:1;background:var(--control-bg,var(--fg-color));border-bottom:2px solid var(--gray-400,#aeb6bf);padding:7px 10px;text-align:left;font-weight:700;white-space:nowrap;}
		table.cj-tbl td{border-bottom:1px solid var(--border-color);padding:6px 10px;vertical-align:middle;}
		table.cj-tbl td.num,table.cj-tbl th.num{text-align:right;font-variant-numeric:tabular-nums;}
		.cj-rm{color:var(--text-muted);font-size:11.5px;display:block;max-width:260px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
		.cj-empty{padding:22px;text-align:center;color:var(--text-muted);}
		.cj-count{color:var(--text-muted);font-size:12px;margin:0 0 8px;display:block;}
		</style>
		<span class="cj-count"></span>
		<div class="cj-box"><table class="cj-tbl">
			<thead><tr><th>Order Bag</th><th>Type</th><th>Size</th><th>Qty</th><th>Purity</th>
			<th class="num">Gold (g)</th><th class="num">DMD (ct)</th><th class="num">Pcs</th>
			<th>Location</th><th>Customer</th><th>Due</th><th style="width:90px"></th></tr></thead>
			<tbody class="cj-body"></tbody>
		</table></div>
	`);

	const esc = frappe.utils.escape_html;

	function load() {
		frappe.call({ method: "jewelima.jewelima.api.get_cad_jobs" }).then((r) => {
			const rows = r.message || [];
			$(page.main).find(".cj-count").text(`${rows.length} CAD job(s) awaiting a design`);
			const body = $(page.main).find(".cj-body")[0];
			body.innerHTML = rows.length
				? rows.map((b, i) => `<tr>
					<td><b>${esc(b.name)}</b>${b.cad_remarks ? `<span class="cj-rm" title="${esc(b.cad_remarks)}">${esc(b.cad_remarks)}</span>` : ""}</td>
					<td>${esc(b.cad_design_type || "")}</td><td>${esc(b.size || "")}</td><td>${b.qty || ""}</td>
					<td>${esc(b.cad_karat || "")}</td>
					<td class="num">${flt(b.cad_gold_weight) ? flt(b.cad_gold_weight).toFixed(3) : ""}</td>
					<td class="num">${flt(b.cad_diamond_weight) ? flt(b.cad_diamond_weight).toFixed(2) : ""}</td>
					<td class="num">${b.cad_stone_no || ""}</td>
					<td>${esc(b.location || "")}</td><td>${esc(b.customer || "")}</td>
					<td>${b.due_date ? frappe.datetime.str_to_user(b.due_date) : ""}</td>
					<td><button class="btn btn-xs btn-primary cj-fin" data-i="${i}">Finalize</button></td>
				</tr>`).join("")
				: '<tr><td colspan="12" class="cj-empty">No CAD jobs pending — everything has a design. 🎉</td></tr>';
			body.querySelectorAll(".cj-fin").forEach((btn) => {
				btn.addEventListener("click", () => jewelima.finalize_cad(rows[+btn.getAttribute("data-i")].name, load));
			});
		});
	}

	page.add_inner_button(__("Refresh"), load);
	load();
};
