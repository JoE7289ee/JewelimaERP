// Total Gold (Stock > Stock Reports) — every gram of fine gold the company
// holds and where it is standing: inside cards on the floor, finished and
// waiting to sell, away at certification, or raw on the shelves. Warehouse
// stock is the truth, so the buckets add up to the total with nothing counted
// twice. Route: /app/total-gold
frappe.pages["total-gold"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Total Gold"), single_column: true });
	const esc = frappe.utils.escape_html;
	const V = jewelima.viz;
	let D = null;

	$(page.main).append(`
		<style>
		#page-total-gold .container{max-width:100%;}
		${V.css()}
		.tg-hero{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:16px;align-items:stretch;}
		.tg-big{border:1px solid var(--border-color);border-radius:15px;background:var(--fg-color);
			padding:16px 26px;min-width:230px;}
		.tg-big .k{font-size:10.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;}
		.tg-big .v{font-size:38px;font-weight:800;line-height:1.15;color:#1f618d;}
		.tg-big .s{font-size:12px;color:var(--text-muted);}
		.tg-small{display:flex;gap:14px;flex-wrap:wrap;}
		.tg-tile{border:1px solid var(--border-color);border-radius:13px;background:var(--fg-color);padding:12px 20px;min-width:140px;}
		.tg-tile .k{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;}
		.tg-tile .v{font-size:21px;font-weight:800;}
		.tg-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:14px;margin-bottom:16px;}
		.tg-box{border:1px solid var(--border-color);border-radius:13px;overflow:auto;background:var(--fg-color);}
		table.tg-t{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.tg-t th{background:var(--control-bg);font-size:10px;text-transform:uppercase;color:var(--text-muted);
			padding:7px 10px;text-align:left;border-bottom:2px solid var(--border-color);}
		table.tg-t td{padding:7px 10px;border-bottom:1px solid var(--border-color);}
		table.tg-t td.num{text-align:right;font-variant-numeric:tabular-nums;}
		table.tg-t tfoot td{border-top:2px solid var(--border-color);font-weight:800;}
		.tg-dot{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:7px;vertical-align:-1px;}
		.tg-none{padding:40px;text-align:center;color:var(--text-muted);}
		</style>
		<div class="jw-viz">
			<div class="tg-hero"></div>
			<div class="tg-grid">
				<div class="jw-card">
					<div class="jw-h">${__("Where the gold is standing")}</div>
					<div class="jw-sub">${__("share of the company's fine gold")}</div>
					<div class="tg-donut"></div>
				</div>
				<div class="jw-card">
					<div class="jw-h">${__("Biggest holdings")}</div>
					<div class="jw-sub">${__("pure gold per item, across every warehouse")}</div>
					<div class="tg-byitem"></div>
				</div>
			</div>
			<div class="tg-box"><table class="tg-t"><thead><tr>
				<th>${__("Standing")}</th><th class="num">${__("Metal (g)")}</th>
				<th class="num">${__("Pure gold (g)")}</th><th class="num">${__("Share")}</th><th class="num">${__("Items")}</th>
			</tr></thead><tbody class="tg-body"></tbody><tfoot class="tg-foot"></tfoot></table></div>
		</div>`);
	const root = $(page.main);

	function paint() {
		const t = D.totals || {};
		const rows = D.rows || [];
		root.find(".tg-hero").html(`
			<div class="tg-big"><div class="k">${__("Total fine gold in the house")}</div>
				<div class="v">${(t.pure || 0).toFixed(3)}<span style="font-size:18px;"> g</span></div>
				<div class="s">${__("held as {0} g of metal", [(t.weight || 0).toFixed(3)])}</div></div>
			<div class="tg-small">
				${rows.slice(0, 3).map((r, i) => `
					<div class="tg-tile"><div class="k">${esc(r.bucket)}</div>
						<div class="v" style="color:${V.SERIES[i % 4]};">${r.pure.toFixed(3)}<span style="font-size:11px;"> g</span></div>
						<div class="k" style="text-transform:none;">${r.share}% ${__("of the total")}</div></div>`).join("")}
				${t.loss ? `<div class="tg-tile"><div class="k">${__("Sitting in loss")}</div>
					<div class="v" style="color:#b02a2a;">${t.loss.toFixed(3)}<span style="font-size:11px;"> g</span></div>
					<div class="k" style="text-transform:none;">${__("waiting to be recovered")}</div></div>` : ""}
			</div>`);

		V.donut(root.find(".tg-donut"),
			rows.map((r, i) => ({ label: r.bucket, value: r.pure, colour: i })),
			{ unit: "g", size: 250, centreLabel: __("g fine gold"), empty: __("No gold in stock yet.") });

		V.bars(root.find(".tg-byitem"),
			(D.by_item || []).map((x) => ({ label: x.item, value: x.pure })),
			{ colour: 0, empty: __("Nothing in stock yet.") });

		root.find(".tg-body").html(rows.map((r, i) => `
			<tr>
				<td><span class="tg-dot" style="background:${V.SERIES[i % 4]};"></span>${esc(r.bucket)}</td>
				<td class="num">${r.weight.toFixed(3)}</td>
				<td class="num"><b>${r.pure.toFixed(3)}</b></td>
				<td class="num">${r.share}%</td>
				<td class="num">${r.items}</td>
			</tr>`).join("") || `<tr><td colspan="5" class="tg-none">${__("No gold in stock yet.")}</td></tr>`);
		root.find(".tg-foot").html(rows.length ? `<tr>
			<td>${__("Total")}</td><td class="num">${(t.weight || 0).toFixed(3)}</td>
			<td class="num">${(t.pure || 0).toFixed(3)}</td><td class="num">100%</td>
			<td class="num">${rows.reduce((a, r) => a + r.items, 0)}</td></tr>` : "");
	}

	function load() {
		frappe.call({ method: "jewelima.jewelima.api.get_total_gold", freeze: false })
			.then((r) => { D = r.message || null; if (D) paint(); });
	}
	page.add_inner_button(__("Location Stock"), () => frappe.set_route("location-stock"));
	page.add_inner_button(__("Refresh"), load);
	frappe.pages["total-gold"].on_page_show = load;
	load();
};
