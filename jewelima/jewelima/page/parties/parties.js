// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Parties — the party directory + detail. Every party carries a STRUCTURED name
// built from four master codes: GROUP-ZONE-STATE[-SPECIAL], e.g. JOS-TCR-KL-PTY.
// LEFT: searchable/filterable directory (unclassified parties called out).
// RIGHT: the picked party — identity, defaults (salesman / price chart), numbers
// (orders, floor, stock, sold) and recent orders. New Party builds the name from
// the code pickers; Classify gives an old free-text party its structured name
// (record renamed; every order/bag link follows). JD Stock / BTQ Stock are exempt.
// Route: /app/parties

frappe.pages["parties"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Parties", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	let DIR = { parties: [], masters: {}, unclassified: 0 };
	let picked = null;
	let filter = { q: "", group: "", zone: "", state: "", only_unclassified: false };

	$(page.main).append(`
		<style>
		.pt-cols{display:flex;gap:20px;align-items:flex-start;}
		.pt-left{flex:0 0 480px;min-width:0;}
		.pt-right{flex:1;min-width:0;}
		.pt-filters{display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;align-items:end;}
		.pt-filters .frappe-control{margin:0;}
		.pt-filters .pt-q{flex:1;min-width:140px;}
		.pt-unc{font-size:12px;color:#b35a00;font-weight:600;margin:0 0 8px;cursor:pointer;display:inline-block;}
		.pt-unc.on{color:#fff;background:#b35a00;border-radius:10px;padding:2px 10px;}
		.pt-box{border:1px solid var(--border-color);border-radius:11px;background:var(--fg-color);overflow:auto;max-height:calc(100vh - 260px);}
		table.pt-grid{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.pt-grid th{position:sticky;top:0;background:var(--control-bg);font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);padding:6px 10px;text-align:left;border-bottom:1px solid var(--border-color);}
		table.pt-grid td{padding:5px 10px;border-bottom:1px solid var(--border-color);cursor:pointer;}
		table.pt-grid tr:hover td{background:var(--control-bg);}
		table.pt-grid tr.sel td{background:var(--control-bg);font-weight:700;}
		table.pt-grid .code{font-weight:700;}
		table.pt-grid .unc{color:#b35a00;font-style:italic;}
		table.pt-grid .ex{color:var(--text-muted);}
		.pt-detail{border:1px solid var(--border-color);border-radius:8px;background:var(--fg-color);padding:18px 22px;display:none;}
		.pt-name{font-size:22px;font-weight:800;letter-spacing:.02em;}
		.pt-tags{display:flex;gap:8px;margin:8px 0 16px;flex-wrap:wrap;}
		.pt-tag{background:var(--control-bg);border:1px solid var(--border-color);border-radius:12px;padding:2px 12px;font-size:12px;}
		.pt-tag b{margin-right:4px;color:var(--text-muted);font-size:10px;text-transform:uppercase;}
		.pt-nums{display:flex;gap:12px;margin:14px 0;flex-wrap:wrap;}
		.pt-num{border:1px solid var(--border-color);border-radius:8px;padding:8px 18px;text-align:center;min-width:110px;background:var(--control-bg);}
		.pt-num .k{font-size:10.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;}
		.pt-num .v{font-size:19px;font-weight:800;}
		.pt-defs{display:flex;gap:14px;align-items:end;margin:14px 0;flex-wrap:wrap;}
		.pt-defs .frappe-control{margin:0;min-width:220px;}
		.pt-sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin:18px 0 6px;border-top:1px solid var(--border-color);padding-top:12px;}
		table.pt-ro{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.pt-ro td{padding:4px 8px;border-bottom:1px solid var(--border-color);}
		.pt-hint{color:var(--text-muted);font-size:12px;margin-top:12px;}
		.pt-exempt{background:rgba(127,140,141,.1);border:1px solid var(--border-color);border-radius:8px;padding:10px 14px;font-size:13px;color:var(--text-muted);margin-top:8px;}
		.pt-old{font-size:12.5px;margin:-8px 0 14px;color:var(--text-color);}
		.pt-old b{font-size:10px;text-transform:uppercase;color:var(--text-muted);margin-right:6px;letter-spacing:.05em;}
		</style>
		<div class="pt-cols">
			<div class="pt-left">
				<div class="pt-filters">
					<div class="pt-q"></div><div class="pt-fg"></div><div class="pt-fz"></div><div class="pt-fs"></div>
				</div>
				<div class="pt-unc" style="display:none;"></div>
				<div class="pt-box"><table class="pt-grid">
					<thead><tr><th>${__("Party")}</th><th>${__("Group")}</th><th>${__("Zone")}</th><th>${__("District")}</th><th>${__("State")}</th><th>${__("Spl")}</th><th>${__("Old name")}</th></tr></thead>
					<tbody class="pt-body"></tbody>
				</table></div>
			</div>
			<div class="pt-right"><div class="pt-detail"></div>
				<div class="pt-hint pt-pickhint">${__("Pick a party on the left to see its details.")}</div>
			</div>
		</div>
	`);
	const root = $(page.main);

	const mk = (sel, df) => { const c = frappe.ui.form.make_control({ df, parent: root.find(sel).get(0), render_input: true }); c.refresh(); return c; };
	const fQ = mk(".pt-q", { fieldtype: "Data", label: __("Search"), fieldname: "q", placeholder: __("name / code…") });
	const fG = mk(".pt-fg", { fieldtype: "Select", label: __("Group"), fieldname: "g", options: "" });
	const fZ = mk(".pt-fz", { fieldtype: "Select", label: __("Zone"), fieldname: "z", options: "" });
	const fS = mk(".pt-fs", { fieldtype: "Select", label: __("State"), fieldname: "s", options: "" });
	fQ.$input.on("input", () => { filter.q = (fQ.get_value() || "").toUpperCase(); paintList(); });
	fG.$input.on("change", () => { filter.group = fG.get_value() || ""; paintList(); });
	fZ.$input.on("change", () => { filter.zone = fZ.get_value() || ""; paintList(); });
	fS.$input.on("change", () => { filter.state = fS.get_value() || ""; paintList(); });

	function load(keep) {
		frappe.call({ method: API + ".get_party_directory" }).then((r) => {
			DIR = r.message || { parties: [], masters: {}, unclassified: 0 };
			const opts = (rows) => [""].concat((rows || []).map((x) => x.name)).join("\n");
			fG.df.options = opts(DIR.masters.groups); fG.refresh();
			fZ.df.options = opts(DIR.masters.zones); fZ.refresh();
			fS.df.options = opts(DIR.masters.states); fS.refresh();
			const $u = root.find(".pt-unc");
			if (DIR.unclassified) {
				$u.text(__("{0} part(ies) still unclassified — tap to filter", [DIR.unclassified])).show();
			} else { $u.hide(); filter.only_unclassified = false; }
			paintList();
			if (keep && picked) openParty(picked);
		});
	}
	root.find(".pt-unc").on("click", function () {
		filter.only_unclassified = !filter.only_unclassified;
		$(this).toggleClass("on", filter.only_unclassified);
		paintList();
	});

	function paintList() {
		const rows = DIR.parties.filter((p) => {
			if (filter.q && !(p.name || "").toUpperCase().includes(filter.q)) return false;
			if (filter.group && p.party_group !== filter.group) return false;
			if (filter.zone && p.party_zone !== filter.zone) return false;
			if (filter.state && p.party_state !== filter.state) return false;
			if (filter.only_unclassified && (p.classified || p.exempt)) return false;
			return true;
		});
		const codeOf = (v) => (v || "").split(" - ")[0]; // composite master name -> short code
		root.find(".pt-body").html(rows.map((p) => `
			<tr data-name="${esc(p.name)}" class="${p.name === picked ? "sel" : ""}">
				<td class="${p.exempt ? "ex" : p.classified ? "code" : "unc"}">${esc(p.name)}${p.disabled ? ' <span class="ex">(off)</span>' : ""}</td>
				<td>${esc(p.party_group || "")}</td><td>${esc(codeOf(p.party_zone))}</td>
				<td>${esc(codeOf(p.party_district))}</td>
				<td>${esc(codeOf(p.party_state))}</td><td>${esc(codeOf(p.party_special))}</td>
				<td class="ex">${esc((p.old_names || []).join(", "))}</td>
			</tr>`).join("") || `<tr><td colspan="7" class="ex" style="padding:16px;">${__("No parties match.")}</td></tr>`);
	}
	root.on("click", ".pt-body tr[data-name]", function () { openParty($(this).data("name")); });

	function openParty(name) {
		picked = name;
		paintList();
		frappe.call({ method: API + ".get_party_detail", args: { customer: name } }).then((r) => {
			const d = r.message || {};
			root.find(".pt-pickhint").hide();
			const $d = root.find(".pt-detail").show();
			const cc = (v) => (v || "").split(" - ")[0]; // composite master name -> short code
			const tag = (k, code, label) => code ? `<span class="pt-tag"><b>${k}</b>${esc(code)}${label ? " · " + esc(label) : ""}</span>` : "";
			$d.html(`
				<div class="pt-name">${esc(d.name)}</div>
				<div class="pt-tags">
					${tag(__("Group"), cc(d.party_group), d.group_label)}${tag(__("Zone"), cc(d.party_zone), d.zone_label)}
					${tag(__("District"), cc(d.party_district), d.district_label)}
					${tag(__("State"), cc(d.party_state), d.state_label)}${tag(__("Special"), cc(d.party_special), d.special_label)}
					${!d.party_group && !d.exempt ? `<span class="pt-tag" style="color:#b35a00;">${__("UNCLASSIFIED")}</span>` : ""}
				</div>
				${(d.old_names || []).length ? `<div class="pt-old"><b>${__("Old name(s)")}</b> ${esc(d.old_names.join(", "))}</div>` : ""}
				${d.exempt ? `<div class="pt-exempt">${__("Internal stock holder — exempt from the naming scheme.")}</div>` : ""}
				<div class="pt-nums">
					<div class="pt-num"><div class="k">${__("Job Orders")}</div><div class="v">${d.stats.job_orders}</div></div>
					<div class="pt-num"><div class="k">${__("On the floor")}</div><div class="v">${d.stats.bags_in_production}</div></div>
					<div class="pt-num"><div class="k">${__("In stock")}</div><div class="v">${d.stats.products_in_stock}</div></div>
					<div class="pt-num"><div class="k">${__("Sold")}</div><div class="v">${d.stats.sold}</div></div>
					<div class="pt-num"><div class="k">${__("Last order")}</div><div class="v" style="font-size:14px;">${esc(d.stats.last_order || "—")}</div></div>
				</div>
				<div class="pt-sec">${__("Defaults")}</div>
				<div class="pt-defs"><div class="pt-dsm"></div><div class="pt-dpc"></div>
					<button class="btn btn-sm btn-default pt-savedef">${__("Save Defaults")}</button></div>
				<div class="pt-sec">${__("Recent Orders")}</div>
				${(d.recent_orders || []).length ? `<table class="pt-ro">${d.recent_orders.map((o) =>
					`<tr><td><a href="/app/job-order/${encodeURIComponent(o.name)}">${esc(o.name)}</a></td>
					<td>${esc(o.creation)}</td><td>${esc(o.salesman || "")}</td><td>${esc(o.order_type || "")}</td></tr>`).join("")}</table>`
					: `<span class="ex">${__("No orders yet.")}</span>`}
			`);
			const dsm = mk(".pt-dsm", { fieldtype: "Link", label: __("Default Salesman"), fieldname: "dsm", options: "Sales Person" });
			const dpc = mk(".pt-dpc", { fieldtype: "Link", label: __("Default Price Chart"), fieldname: "dpc", options: "Price Chart" });
			if (d.default_salesman) dsm.set_value(d.default_salesman);
			if (d.default_price_chart) dpc.set_value(d.default_price_chart);
			$d.find(".pt-savedef").on("click", () => {
				frappe.call({ method: API + ".update_party_defaults", args: {
					customer: d.name, salesman: dsm.get_value() || null, price_chart: dpc.get_value() || null,
				} }).then(() => frappe.show_alert({ message: __("Defaults saved."), indicator: "green" }, 3));
			});
		});
	}

	load();
};
