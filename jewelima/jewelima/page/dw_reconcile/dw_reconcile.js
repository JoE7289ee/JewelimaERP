// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Diamond Weight Check — approved Design Bank cards whose stated DW differs from
// the sieve-average total (sum of pcs × each sieve's EF-diamond avg ct). Update
// sets DW to the computed value and re-renders the card. Route: /app/dw-reconcile

frappe.pages["dw-reconcile"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Diamond Weight Check", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const ct = (v) => flt(v).toFixed(2);
	let rows = [];

	$(page.main).append(`
		<style>
		#page-dw-reconcile .container{max-width:100%;}
		.dw-head{display:flex;align-items:center;gap:12px;margin:2px 0 14px;flex-wrap:wrap;}
		.dw-count{font-size:13px;color:var(--text-muted);}
		.dw-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;}
		.dw-card{border:1px solid var(--border-color);border-radius:13px;background:var(--fg-color);overflow:hidden;display:flex;flex-direction:column;}
		.dw-img{height:150px;background:#fff;display:flex;align-items:center;justify-content:center;border-bottom:1px solid var(--border-color);}
		.dw-img img{max-width:100%;max-height:150px;object-fit:contain;}
		.dw-img .none{color:#bbb;font-size:12px;}
		.dw-body{padding:11px 14px;display:flex;flex-direction:column;gap:8px;}
		.dw-no{font-weight:800;font-family:var(--font-family-monospace,monospace);font-size:14px;}
		.dw-sieves{font-size:11.5px;color:var(--text-muted);}
		.dw-nums{display:flex;align-items:center;gap:8px;font-variant-numeric:tabular-nums;}
		.dw-cur{color:#b02a2a;text-decoration:line-through;font-weight:700;}
		.dw-arrow{color:var(--text-muted);}
		.dw-new{color:#1d7a33;font-weight:800;font-size:16px;}
		.dw-delta{font-size:11px;color:var(--text-muted);margin-left:auto;}
		.dw-upd{border:1px solid #1d7a33;color:#1d7a33;background:#fff;border-radius:8px;padding:5px 12px;font-weight:700;font-size:12.5px;cursor:pointer;}
		.dw-upd:hover{background:#e9f6ec;}
		.dw-empty{padding:60px 10px;text-align:center;color:var(--text-muted);}
		</style>
		<div class="dw-head"><span class="dw-count"></span></div>
		<div class="dw-grid"></div>
	`);
	const root = $(page.main)[0];

	function render() {
		root.querySelector(".dw-count").textContent = rows.length
			? __("{0} approved design(s) with a DW mismatch", [rows.length])
			: "";
		root.querySelector(".dw-grid").innerHTML = rows.length
			? rows.map((r) => `
				<div class="dw-card" data-name="${esc(r.name)}">
					<div class="dw-img">${r.image ? `<img src="${esc(r.image)}">` : `<span class="none">${__("no card")}</span>`}</div>
					<div class="dw-body">
						<div class="dw-no">${esc(r.design_no)}</div>
						<div class="dw-sieves">${r.sieves.map((s) => `${esc(s.sieve)} ×${s.pcs}`).join(" · ")}</div>
						<div class="dw-nums">
							<span class="dw-cur">${ct(r.current_dw)}</span>
							<span class="dw-arrow">→</span>
							<span class="dw-new">${ct(r.computed_dw)} ct</span>
							<span class="dw-delta">${r.delta > 0 ? "+" : ""}${ct(r.delta)}</span>
						</div>
						<button class="dw-upd">${__("Update DW")}</button>
					</div>
				</div>`).join("")
			: `<div class="dw-empty" style="grid-column:1/-1;">${__("All approved designs match their sieve-average DW. ✓")}</div>`;
	}

	function load() {
		frappe.call({ method: API + ".get_dw_reconcile" }).then((r) => {
			rows = (r.message || {}).rows || [];
			render();
			allBtn.prop("disabled", !rows.length);
		});
	}

	$(root).on("click", ".dw-upd", function () {
		const name = $(this).closest(".dw-card").data("name");
		frappe.call({ method: API + ".update_design_dw", args: { name }, freeze: true, freeze_message: __("Updating…") })
			.then((r) => {
				frappe.show_alert({ message: __("{0} → DW {1} ct", [name, flt((r.message || {}).diamond_weight).toFixed(2)]), indicator: "green" }, 4);
				rows = rows.filter((x) => x.name !== name);
				render();
				allBtn.prop("disabled", !rows.length);
			});
	});

	const allBtn = page.set_primary_action(__("Update all"), () => {
		if (!rows.length) return;
		frappe.confirm(__("Update DW on all <b>{0}</b> mismatched design(s)?", [rows.length]), () => {
			frappe.call({ method: API + ".update_all_dw", freeze: true, freeze_message: __("Updating all…") })
				.then((r) => {
					const m = r.message || {};
					frappe.show_alert({ message: __("Updated {0} of {1}.", [m.updated, m.total]), indicator: "green" }, 5);
					load();
				});
		});
	});
	page.add_inner_button(__("Refresh"), load);
	load();
};
