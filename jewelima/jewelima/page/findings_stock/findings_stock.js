// Findings Stock (Stock > Findings) — what is on the shelf, by group, with the
// pure gold it represents. Findings only belong in Gold Issue, so anything
// found in another warehouse is called out rather than quietly counted.
// Route: /app/findings-stock
frappe.pages["findings-stock"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Findings Stock"), single_column: true });
	const esc = frappe.utils.escape_html;
	const S = { rows: [], elsewhere: [], q: "", empties: false };

	$(page.main).append(`
		<style>
		#page-findings-stock .container{max-width:100%;}
		.fs-top{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px;}
		.fs-q{width:220px;border:1px solid var(--border-color);border-radius:8px;height:31px;padding:2px 12px;
			background:var(--fg-color);color:var(--text-color);font-size:12.5px;}
		.fs-tiles{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;}
		.fs-tile{border:1px solid var(--border-color);border-radius:11px;padding:8px 18px;background:var(--fg-color);min-width:120px;}
		.fs-tile .k{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;}
		.fs-tile .v{font-size:19px;font-weight:800;}
		.fs-box{border:1px solid var(--border-color);border-radius:12px;overflow:auto;background:var(--fg-color);max-height:calc(100vh - 260px);}
		table.fs-t{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.fs-t th{position:sticky;top:0;background:var(--control-bg);font-size:10px;text-transform:uppercase;
			color:var(--text-muted);padding:7px 10px;text-align:left;border-bottom:2px solid var(--border-color);}
		table.fs-t td{padding:6px 10px;border-bottom:1px solid var(--border-color);}
		table.fs-t td.num{text-align:right;font-variant-numeric:tabular-nums;}
		table.fs-t tr.grp td{background:var(--control-bg);font-weight:800;font-size:11px;
			text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);}
		.fs-zero{color:var(--text-muted);}
		.fs-warn{border:1px solid #f0d9a8;background:#fdf3e3;color:#9a6700;border-radius:10px;
			padding:9px 13px;font-size:12.5px;margin-bottom:12px;}
		.fs-none{padding:36px;text-align:center;color:var(--text-muted);}
		</style>
		<div class="fs-top">
			<input type="text" class="fs-q" placeholder="${__("search a finding…")}">
			<label style="font-size:12px;display:inline-flex;gap:6px;align-items:center;cursor:pointer;">
				<input type="checkbox" class="fs-empties" style="width:14px;height:14px;"> ${__("show empty ones")}</label>
			<span class="fs-wh" style="margin-left:auto;font-size:12px;color:var(--text-muted);"></span>
		</div>
		<div class="fs-tiles"></div>
		<div class="fs-else"></div>
		<div class="fs-box"><table class="fs-t"><thead><tr>
			<th>${__("Finding")}</th><th>${__("Name")}</th>
			<th class="num">${__("Weight (g)")}</th><th class="num">${__("Purity")}</th><th class="num">${__("Pure (g)")}</th>
		</tr></thead><tbody class="fs-body"></tbody></table></div>`);
	const root = $(page.main);

	function paint() {
		const q = S.q.trim().toLowerCase();
		let rows = S.rows.filter((r) => !q || (r.item + " " + r.name + " " + r.group).toLowerCase().includes(q));
		if (!S.empties) rows = rows.filter((r) => r.weight > 0);
		const groups = [...new Set(rows.map((r) => r.group))].sort();
		root.find(".fs-body").html(groups.map((g) => {
			const inG = rows.filter((r) => r.group === g);
			const tot = inG.reduce((a, r) => a + r.weight, 0);
			return `<tr class="grp"><td colspan="2">${esc(g)}</td>
					<td class="num">${tot.toFixed(3)}</td><td></td>
					<td class="num">${inG.reduce((a, r) => a + r.pure, 0).toFixed(3)}</td></tr>`
				+ inG.map((r) => `<tr>
					<td><b>${esc(r.item)}</b></td><td>${esc(r.name)}</td>
					<td class="num ${r.weight ? "" : "fs-zero"}">${r.weight ? r.weight.toFixed(3) : "—"}</td>
					<td class="num">${r.purity}%</td>
					<td class="num ${r.weight ? "" : "fs-zero"}">${r.weight ? r.pure.toFixed(3) : "—"}</td>
				</tr>`).join("");
		}).join("") || `<tr><td colspan="5" class="fs-none">${
			S.empties ? __("No findings match.") : __("Nothing on the shelf — tick 'show empty ones' to see the full list.")}</td></tr>`);
	}

	function load() {
		frappe.call({ method: "jewelima.jewelima.api.get_findings_stock", freeze: false }).then((r) => {
			const m = r.message || {};
			S.rows = m.rows || [];
			S.elsewhere = m.elsewhere || [];
			const t = m.totals || {};
			root.find(".fs-wh").text(m.warehouse ? __("stock held in {0}", [m.warehouse.replace(" - JD", "")]) : "");
			root.find(".fs-tiles").html(`
				<div class="fs-tile"><div class="k">${__("Total weight")}</div><div class="v">${(t.weight || 0).toFixed(3)} g</div></div>
				<div class="fs-tile"><div class="k">${__("Pure gold")}</div><div class="v">${(t.pure || 0).toFixed(3)} g</div></div>
				<div class="fs-tile"><div class="k">${__("Kinds stocked")}</div><div class="v">${t.stocked || 0}<span style="font-size:12px;color:var(--text-muted);"> / ${t.items || 0}</span></div></div>`);
			root.find(".fs-else").html(S.elsewhere.length
				? `<div class="fs-warn">${__("Findings belong in Gold Issue only — these are sitting elsewhere:")} ${
					S.elsewhere.map((e) => `<b>${esc(e.item)}</b> ${e.weight} g ${__("in")} ${esc(e.warehouse.replace(" - JD", ""))}`).join(" · ")}</div>`
				: "");
			paint();
		});
	}
	root.find(".fs-q").on("input", frappe.utils.debounce(function () { S.q = this.value || ""; paint(); }, 200));
	root.find(".fs-empties").on("change", function () { S.empties = this.checked; paint(); });
	page.add_inner_button(__("Issue"), () => frappe.set_route("issue-findings"));
	page.add_inner_button(__("History"), () => frappe.set_route("findings-history"));
	page.add_inner_button(__("Refresh"), load);
	frappe.pages["findings-stock"].on_page_show = load;
	load();
};
