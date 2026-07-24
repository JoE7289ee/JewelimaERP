// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Prepare Sale — the parked bills. Every PREPARE TO SELL snapshot from the
// Sell page lands here; clicking one reopens the Sell board exactly as it
// was left (pieces, prices, manual edits, discounts). Selling it locks the
// prep as Sold. Route: /app/prepare-sale

frappe.pages["prepare-sale"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Prepare Sale", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const money = (v) => "₹" + flt(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

	$(page.main).append(`
		<style>
		.pp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;}
		.pp-card{border:1px solid var(--border-color);border-left:5px solid #e0a800;border-radius:9px;background:var(--fg-color);
			padding:14px 16px;cursor:pointer;transition:box-shadow .12s;}
		.pp-card:hover{box-shadow:0 3px 12px rgba(0,0,0,.12);}
		.pp-name{font-weight:800;font-size:13px;}
		.pp-cust{font-size:15px;font-weight:700;margin:2px 0 6px;}
		.pp-meta{font-size:12px;color:var(--text-muted);line-height:1.7;}
		.pp-total{font-size:20px;font-weight:800;color:#1d7a33;margin-top:6px;}
		.pp-empty{padding:40px;text-align:center;color:var(--text-muted);}
		</style>
		<div class="pp-grid"></div>
	`);
	const root = $(page.main);

	function load() {
		frappe.call({ method: API + ".get_prepared_boards" }).then((r) => {
			const rows = (r.message || {}).rows || [];
			root.find(".pp-grid").html(rows.length ? rows.map((p) => `
				<div class="pp-card" data-name="${esc(p.name)}">
					<div class="pp-name">${esc(p.name)} · ${esc(p.status)}</div>
					<div class="pp-cust">${esc(p.customer || "—")}</div>
					<div class="pp-meta">${p.pieces} ${__("piece(s)")} · ${esc(p.price_chart || __("no chart"))}
						${p.gold_rate ? " · " + __("gold") + " " + flt(p.gold_rate).toLocaleString("en-IN") : ""}<br>
						${frappe.datetime.prettyDate(p.modified)} · ${esc(p.owner)}</div>
					<div class="pp-total">${money(p.grand_total)}</div>
				</div>`).join("")
				: `<div class="pp-empty">${__("Nothing prepared yet — build a bill on Sell and press PREPARE TO SELL.")}</div>`);
		});
	}

	root.on("click", ".pp-card", function () {
		frappe.route_options = { prep: $(this).data("name") };
		frappe.set_route("sell");
	});

	page.add_inner_button(__("Sell"), () => frappe.set_route("sell"));
	load();
};
