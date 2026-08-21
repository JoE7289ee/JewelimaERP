// Melt History — every melt on record: what went into the pot, what karat
// gold came out, the melt loss, where, and by whom. Read-only record.
frappe.pages["melt-history"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Melt History"), single_column: true });
	const esc = frappe.utils.escape_html;

	$(page.main).append(`
		<style>
		#page-melt-history .container{max-width:100%;}
		.mh-tiles{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;}
		.mh-tile{border:1px solid var(--border-color);border-radius:10px;padding:7px 16px;background:var(--fg-color);}
		.mh-tile .k{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;}
		.mh-tile .v{font-size:17px;font-weight:800;}
		.mh-tile.loss .v{color:#b02a2a;}
		.mh-box{border:1px solid var(--border-color);border-radius:12px;overflow:auto;background:var(--fg-color);max-height:calc(100vh - 220px);}
		table.mh-t{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.mh-t th{position:sticky;top:0;background:var(--control-bg);font-size:10px;text-transform:uppercase;
			color:var(--text-muted);padding:6px 10px;text-align:left;border-bottom:2px solid var(--border-color);white-space:nowrap;}
		table.mh-t td{padding:6px 10px;border-bottom:1px solid var(--border-color);vertical-align:top;}
		.mh-lines{font-size:11px;color:var(--text-muted);}
		.mh-none{padding:40px;text-align:center;color:var(--text-muted);}
		td.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;}
		.mh-loss{color:#b02a2a;font-weight:700;}
		</style>
		<div class="mh-tiles">
			<div class="mh-tile"><div class="k">${__("Melts")}</div><div class="v mh-c-n">0</div></div>
			<div class="mh-tile"><div class="k">${__("Fed (g)")}</div><div class="v mh-c-fed">0</div></div>
			<div class="mh-tile"><div class="k">${__("Made (g)")}</div><div class="v mh-c-got">0</div></div>
			<div class="mh-tile loss"><div class="k">${__("Melt loss (g)")}</div><div class="v mh-c-loss">0</div></div>
		</div>
		<div class="mh-box"><table class="mh-t"><thead><tr>
			<th>${__("Date")}</th><th>${__("Into the pot")}</th><th>${__("Came out")}</th>
			<th class="num">${__("Loss (g)")}</th><th>${__("Warehouse")}</th><th>${__("By")}</th><th>${__("Entry")}</th>
		</tr></thead><tbody class="mh-body"></tbody></table></div>`);
	const root = $(page.main);

	function load() {
		frappe.call({ method: "jewelima.jewelima.api.get_melt_history", freeze: false }).then((r) => {
			const m = r.message || { rows: [] };
			root.find(".mh-c-n").text((m.rows || []).length);
			root.find(".mh-c-fed").text((m.total_fed || 0).toFixed(3));
			root.find(".mh-c-got").text((m.total_got || 0).toFixed(3));
			root.find(".mh-c-loss").text((m.total_loss || 0).toFixed(3));
			root.find(".mh-body").html((m.rows || []).map((x) => `<tr>
				<td>${frappe.datetime.str_to_user(x.when)}</td>
				<td class="mh-lines">${x.consumed.map((c) => `${c.qty.toFixed(3)} g ${esc(c.item)}`).join("<br>")}
					<div style="margin-top:2px;"><b style="color:var(--text-color);">${x.fed.toFixed(3)} g ${__("total")}</b></div></td>
				<td><b>${x.got.toFixed(3)} g</b> ${esc(x.out_item)}</td>
				<td class="num ${x.loss > 0 ? "mh-loss" : ""}">${x.loss.toFixed(3)}</td>
				<td>${esc((x.warehouse || "").replace(" - JD", ""))}</td>
				<td>${esc(x.who)}</td>
				<td style="font-size:11px;color:var(--text-muted);">${esc(x.name)}</td>
			</tr>`).join("") || `<tr><td colspan="7" class="mh-none">${__("No melts on record yet — melts from today on land here automatically.")}</td></tr>`);
		});
	}
	frappe.pages["melt-history"].on_page_show = load;
	load();
};
