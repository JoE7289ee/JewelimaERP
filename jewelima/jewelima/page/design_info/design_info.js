// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Design Info — the Design's passport, floor language only: photo, identity,
// the frozen BOM, derived totals, sibling variants of the same bank card,
// and which bags run it (card numbers jump to Card Info). Read-only.
// Route: /app/design-info  (route_options: {design})

frappe.pages["design-info"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Design Info", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;

	$(page.main).append(`
		<style>
		.di-top{max-width:360px;margin-bottom:14px;}
		.di-cols{display:flex;gap:22px;align-items:flex-start;flex-wrap:wrap;}
		.di-img{flex:0 0 320px;}
		.di-img img{width:100%;border:1px solid var(--border-color);border-radius:10px;background:#fff;}
		.di-img .none{height:320px;display:flex;align-items:center;justify-content:center;color:#bbb;border:1px dashed var(--border-color);border-radius:10px;}
		.di-main{flex:1;min-width:420px;}
		.di-name{font-size:22px;font-weight:800;font-family:var(--font-family-monospace,monospace);display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
		.di-st{border-radius:9px;padding:2px 10px;font-size:11px;font-weight:800;color:#fff;background:#2e7d32;}
		.di-st.retired{background:#b02a2a;}
		.di-sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin:16px 0 6px;}
		.di-facts{display:flex;gap:12px;flex-wrap:wrap;}
		.di-tile{border:1px solid var(--border-color);border-radius:9px;padding:7px 16px;background:var(--control-bg);}
		.di-tile .k{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;}
		.di-tile .v{font-size:16px;font-weight:800;}
		table.di-t{width:100%;max-width:760px;border-collapse:collapse;font-size:12.5px;background:var(--fg-color);}
		table.di-t th{background:var(--control-bg);font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);padding:5px 10px;border:1px solid var(--border-color);text-align:left;}
		table.di-t td{border:1px solid var(--border-color);padding:5px 10px;}
		.di-chip{font-family:var(--font-family-monospace,monospace);font-weight:700;font-size:12px;border:1px solid var(--border-color);border-radius:6px;padding:2px 9px;cursor:pointer;background:var(--control-bg);display:inline-block;}
		.di-chip.me{background:#1f618d;border-color:#1f618d;color:#fff;cursor:default;}
		.di-chip.retired{opacity:.5;text-decoration:line-through;}
		.di-none{padding:34px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:10px;max-width:760px;}
		</style>
		<div class="di-top"></div>
		<div class="di-body"><div class="di-none">${__("Pick a design.")}</div></div>
	`);
	const root = $(page.main);
	const fPick = frappe.ui.form.make_control({
		df: { fieldtype: "Link", label: __("Design"), fieldname: "design", options: "Design", only_select: 1 },
		parent: root.find(".di-top").get(0), render_input: true });
	fPick.refresh();

	function paint(D) {
		const bagChips = (D.bags || []).map((b) =>
			`<a class="jw-card-link di-chip" data-card="${esc(b.name)}" title="${esc(b.location || "")}">${esc(b.name)}</a>`).join(" ");
		const sib = (D.siblings || []).map((s) => s.name === D.name
			? `<span class="di-chip me">${esc(s.name)}</span>`
			: `<span class="di-chip di-sib ${s.status === "Retired" ? "retired" : ""}" data-design="${esc(s.name)}">${esc(s.name)}</span>`).join(" ");
		const counts = Object.entries(D.counts || {}).map(([k, v]) =>
			`<div class="di-tile"><div class="k">${esc(k.replace("_no", "").toUpperCase())}</div><div class="v">${v}</div></div>`).join("");
		root.find(".di-body").html(`
			<div class="di-cols">
				<div class="di-img">${D.image ? `<img src="${esc(D.image)}">` : `<div class="none">${__("no photo")}</div>`}</div>
				<div class="di-main">
					<div class="di-name">${esc(D.name)}
						<span class="di-st ${D.status === "Retired" ? "retired" : ""}">${esc((D.status || "").toUpperCase())}</span></div>
					<div style="font-size:13px;color:var(--text-muted);margin-top:4px;">
						${esc(D.design_type)}${D.design_style ? " · " + esc(D.design_style) : ""}
						${D.bank ? " · " + __("bank card") + " <b>" + esc(D.bank.design_no) + "</b>" : ""}</div>

					<div class="di-sec">${__("Totals")}</div>
					<div class="di-facts">
						<div class="di-tile"><div class="k">${__("Metal")}</div><div class="v">${D.metal_g} g</div></div>
						<div class="di-tile"><div class="k">${__("Purity")}</div><div class="v">${D.purity_pct}%</div></div>
						${D.stone_ct ? `<div class="di-tile"><div class="k">${__("Stones")}</div><div class="v">${D.stone_ct} ct</div></div>` : ""}
						${counts}
					</div>

					<div class="di-sec">${__("Bill of Materials — frozen at creation")}</div>
					<table class="di-t"><thead><tr>
						<th>${__("Material")}</th><th>${__("Purity %")}</th><th>${__("UOM")}</th>
						<th>${__("Qty")}</th><th>${__("Weight")}</th><th>${__("Pure (g)")}</th>
					</tr></thead><tbody>
					${(D.materials || []).map((m) => `<tr>
						<td><b>${esc(m.item)}</b></td>
						<td>${m.purity || ""}</td><td>${esc(m.uom)}</td>
						<td>${m.stone_type ? m.qty : ""}</td><td>${m.weight}</td>
						<td>${m.stone_type ? "" : m.pure}</td>
					</tr>`).join("")}</tbody></table>

					${sib ? `<div class="di-sec">${__("Variants of this card")}</div><div>${sib}</div>` : ""}

					<div class="di-sec">${__("In manufacturing")}</div>
					<div style="font-size:13px;">
						${D.bags_total ? __("{0} bag(s) run this design", [D.bags_total]) + (bagChips ? " — " + bagChips : "") : __("No bags yet.")}
					</div>
				</div>
			</div>`);
	}

	function load(name) {
		if (!name) return;
		frappe.call({ method: API + ".get_design_info", args: { design: name } }).then((r) => {
			if (r.message) paint(r.message);
		});
	}
	fPick.$input.on("change awesomplete-selectcomplete", () => setTimeout(() => {
		const v = fPick.get_value();
		if (v) load(v);
	}, 100));
	root.on("click", ".di-sib", function () {
		const nm = $(this).data("design");
		fPick.set_value(nm);
		load(nm);
	});

	if (frappe.route_options && frappe.route_options.design) {
		const pre = frappe.route_options.design;
		frappe.route_options = null;
		fPick.set_value(pre);
		load(pre);
	}
};
