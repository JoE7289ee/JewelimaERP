// Findings Report (Stock > Findings) — the shelf at a glance: what it is worth
// in pure gold, which findings carry it, how it splits across the karat groups,
// and what has been going out week by week. Every bar is directly labelled and
// the same numbers sit in a table below, so nothing depends on colour alone.
// Route: /app/findings-report
frappe.pages["findings-report"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Findings Report"), single_column: true });
	const esc = frappe.utils.escape_html;
	const V = jewelima.viz;
	let D = null;

	$(page.main).append(`
		<style>
		#page-findings-report .container{max-width:100%;}
		${V.css()}
		.fr-tiles{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px;}
		.fr-tile{border:1px solid var(--border-color);border-radius:13px;padding:11px 20px;background:var(--fg-color);min-width:140px;}
		.fr-tile .k{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;}
		.fr-tile .v{font-size:24px;font-weight:800;line-height:1.25;}
		.fr-tile .s{font-size:11px;color:var(--text-muted);}
		.fr-tile.hero .v{color:#1f618d;}
		.fr-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:14px;margin-bottom:14px;}
		.fr-warn{border:1px solid #f0d9a8;background:#fdf3e3;color:#9a6700;border-radius:11px;padding:9px 13px;font-size:12.5px;margin-bottom:14px;}
		.fr-box{border:1px solid var(--border-color);border-radius:13px;overflow:auto;background:var(--fg-color);max-height:52vh;}
		table.fr-t{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.fr-t th{position:sticky;top:0;background:var(--control-bg);font-size:10px;text-transform:uppercase;
			color:var(--text-muted);padding:7px 10px;text-align:left;border-bottom:2px solid var(--border-color);}
		table.fr-t td{padding:6px 10px;border-bottom:1px solid var(--border-color);}
		table.fr-t td.num{text-align:right;font-variant-numeric:tabular-nums;}
		.fr-zero td{color:var(--text-muted);}
		.fr-split{display:flex;gap:8px;margin-top:10px;}
		.fr-split .p{flex:1;border-radius:8px;padding:8px 12px;background:var(--control-bg);}
		.fr-split .p .k{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);}
		.fr-split .p .v{font-size:16px;font-weight:800;}
		</style>
		<div class="jw-viz">
			<div class="fr-tiles"></div>
			<div class="fr-else"></div>
			<div class="fr-grid">
				<div class="jw-card">
					<div class="jw-h">${__("What is on the shelf")}</div>
					<div class="jw-sub">${__("weight per finding, heaviest first")}</div>
					<div class="fr-byitem"></div>
				</div>
				<div class="jw-card">
					<div class="jw-h">${__("By group")}</div>
					<div class="jw-sub">${__("where the weight sits across the karats")}</div>
					<div class="fr-bygroup"></div>
				</div>
				<div class="jw-card">
					<div class="jw-h">${__("Issued — last 12 weeks")}</div>
					<div class="jw-sub">${__("grams that left the shelf and became gold")}</div>
					<div class="fr-weeks"></div>
					<div class="fr-split"></div>
				</div>
				<div class="jw-card">
					<div class="jw-h">${__("What it became")}</div>
					<div class="jw-sub">${__("the karat gold findings turned into")}</div>
					<div class="fr-bygold"></div>
				</div>
			</div>
			<div class="fr-box"><table class="fr-t"><thead><tr>
				<th>${__("Finding")}</th><th>${__("Group")}</th>
				<th class="num">${__("Weight (g)")}</th><th class="num">${__("Purity")}</th><th class="num">${__("Pure (g)")}</th>
			</tr></thead><tbody class="fr-body"></tbody></table></div>
		</div>`);
	const root = $(page.main);

	function paint() {
		const t = D.totals || {};
		root.find(".fr-tiles").html(`
			<div class="fr-tile hero"><div class="k">${__("Pure gold on the shelf")}</div>
				<div class="v">${(t.pure || 0).toFixed(3)} g</div>
				<div class="s">${__("across {0} g of findings", [(t.weight || 0).toFixed(3)])}</div></div>
			<div class="fr-tile"><div class="k">${__("Kinds stocked")}</div>
				<div class="v">${t.stocked || 0}<span class="s"> / ${t.items || 0}</span></div>
				<div class="s">${__("of the findings on the register")}</div></div>
			<div class="fr-tile"><div class="k">${__("Groups holding stock")}</div>
				<div class="v">${(D.groups || []).filter((g) => g.weight > 0).length}</div>
				<div class="s">${__("of {0} groups", [(D.groups || []).length])}</div></div>
			<div class="fr-tile"><div class="k">${__("Held in")}</div>
				<div class="v" style="font-size:16px;padding-top:5px;">${esc((D.warehouse || "").replace(" - JD", "") || "—")}</div>
				<div class="s">${__("findings live nowhere else")}</div></div>`);

		root.find(".fr-else").html((D.elsewhere || []).length
			? `<div class="fr-warn">${__("These findings are sitting outside Gold Issue, which should not happen:")} ${
				D.elsewhere.map((e) => `<b>${esc(e.item)}</b> ${e.weight} g ${__("in")} ${esc(e.warehouse.replace(" - JD", ""))}`).join(" · ")}</div>`
			: "");

		const stocked = (D.stock || []).filter((r) => r.weight > 0).slice(0, 12);
		V.bars(root.find(".fr-byitem"), stocked.map((r) => ({ label: r.item, value: r.weight })),
			{ colour: 0, empty: __("Nothing on the shelf yet.") });

		V.bars(root.find(".fr-bygroup"),
			(D.groups || []).filter((g) => g.weight > 0).map((g) => ({ label: g.group, value: g.weight })),
			{ colour: 2, empty: __("No group holds stock yet.") });

		const wk = (D.weeks || []).map((w) => ({
			label: frappe.datetime.str_to_user(w.week), short: (w.week || "").slice(5).replace("-", "/"),
			value: w.weight }));
		if (wk.some((w) => w.value)) V.columns(root.find(".fr-weeks"), wk, { unit: "g" });
		else root.find(".fr-weeks").html(`<div class="jw-empty">${__("Nothing issued in the last 12 weeks.")}</div>`);
		const tg = D.by_target || {};
		root.find(".fr-split").html(`
			<div class="p"><div class="k">${__("Onto cards")}</div><div class="v">${(tg.Card || 0).toFixed(3)} g</div></div>
			<div class="p"><div class="k">${__("Into locations")}</div><div class="v">${(tg.Location || 0).toFixed(3)} g</div></div>`);

		V.bars(root.find(".fr-bygold"),
			(D.by_gold || []).map(([g, w]) => ({ label: g, value: w })),
			{ colour: 1, empty: __("Nothing issued yet.") });

		root.find(".fr-body").html((D.stock || []).map((r) => `
			<tr class="${r.weight ? "" : "fr-zero"}">
				<td><b>${esc(r.item)}</b> <span style="color:var(--text-muted);">${esc(r.name)}</span></td>
				<td>${esc(r.group)}</td>
				<td class="num">${r.weight ? r.weight.toFixed(3) : "—"}</td>
				<td class="num">${r.purity}%</td>
				<td class="num">${r.weight ? r.pure.toFixed(3) : "—"}</td>
			</tr>`).join(""));
	}

	function load() {
		frappe.call({ method: "jewelima.jewelima.api.get_findings_report", freeze: false })
			.then((r) => { D = r.message || null; if (D) paint(); });
	}
	page.add_inner_button(__("Issue"), () => frappe.set_route("issue-findings"));
	page.add_inner_button(__("History"), () => frappe.set_route("findings-history"));
	page.add_inner_button(__("Refresh"), load);
	frappe.pages["findings-report"].on_page_show = load;
	load();
};
