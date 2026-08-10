// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Repair Bills — the register the old workbook never had: every bill,
// filterable by party / status / dates, with running totals. A row opens
// on the Repair Desk; Billed bills can be marked Delivered here.
// Route: /app/repair-bills

frappe.pages["repair-bills"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Repair Bills", single_column: true });
	const API = "jewelima.jewelima.repair_api";
	const esc = frappe.utils.escape_html;
	const m2 = (v) => (v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
	let ROWS = [];

	$(page.main).append(`
		<style>
		#page-repair-bills .container{max-width:100%;}
		.rb-bar{display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin-bottom:10px;}
		.rb-bar label{display:block;font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px;}
		.rb-bar input,.rb-bar select{border:1px solid var(--border-color);border-radius:8px;padding:7px 10px;font-size:12.5px;background:var(--fg-color);color:var(--text-color);}
		.rb-tiles{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:10px;}
		.rb-tile{border:1px solid var(--border-color);border-radius:11px;padding:7px 14px;background:var(--control-bg);transition:transform .12s,box-shadow .12s;}
		.rb-tile:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(0,0,0,.09);}
		.rb-tile .k{font-size:9.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;}
		.rb-tile .v{font-size:15px;font-weight:800;}
		table.rb-t{width:100%;border-collapse:collapse;font-size:12px;background:var(--fg-color);}
		table.rb-t th{background:var(--control-bg);font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);padding:5px 8px;border:1px solid var(--border-color);text-align:right;white-space:nowrap;}
		table.rb-t th.l{text-align:left;}
		table.rb-t td{border:1px solid var(--border-color);padding:4px 8px;font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right;}
		table.rb-t td.l{text-align:left;}
		tr.rb-r{cursor:pointer;}
		tr.rb-r:hover td{background:var(--control-bg);}
		.rb-chip{display:inline-block;border-radius:10px;padding:1px 9px;font-size:10.5px;font-weight:700;}
		.rb-chip.ip{background:#fdf3d0;color:#8a6d00;}
		.rb-chip.bl{background:#e3e7f5;color:#333d8f;}
		.rb-chip.dv{background:#dcefe0;color:#1d7a33;}
		.rb-dlv{border:none;border-radius:6px;padding:2px 10px;font-size:10.5px;font-weight:700;color:#fff;background:#2e7d32;cursor:pointer;}
		</style>
		<div class="rb-bar">
			<span><label>${__("Party")}</label><input list="rb-parties" class="rb-party" style="width:190px;"><datalist id="rb-parties"></datalist></span>
			<span><label>${__("Status")}</label><select class="rb-status">
				<option value="">${__("all")}</option><option>In Progress</option><option>Billed</option><option>Delivered</option></select></span>
			<span><label>${__("From")}</label><input type="date" class="rb-from"></span>
			<span><label>${__("To")}</label><input type="date" class="rb-to"></span>
		</div>
		<div class="rb-tiles"></div>
		<div class="rb-body"></div>
	`);
	const root = $(page.main);

	frappe.call({ method: API + ".get_repair_boot" }).then((r) => {
		root.find("#rb-parties").html(((r.message || {}).parties || [])
			.map((p) => `<option value="${esc(p.name)}">`).join(""));
	});

	function load() {
		frappe.call({ method: API + ".list_repair_bills", args: {
			party: (root.find(".rb-party").val() || "").trim().toUpperCase() || undefined,
			status: root.find(".rb-status").val() || undefined,
			from_date: root.find(".rb-from").val() || undefined,
			to_date: root.find(".rb-to").val() || undefined,
		} }).then((r) => {
			ROWS = r.message || [];
			paint();
		});
	}

	function paint() {
		const t = ROWS.reduce((a, b) => ({
			n: a.n + 1, pcs: a.pcs + (b.tot_pieces || 0), rep: a.rep + (b.tot_repair || 0),
			dmd: a.dmd + (b.tot_diamond || 0), w75: a.w75 + (b.tot_wt75 || 0), w92: a.w92 + (b.tot_wt92 || 0),
			g: a.g + (b.grand_total || 0),
		}), { n: 0, pcs: 0, rep: 0, dmd: 0, w75: 0, w92: 0, g: 0 });
		root.find(".rb-tiles").html(`
			<div class="rb-tile"><div class="k">${__("Bills")}</div><div class="v">${t.n}</div></div>
			<div class="rb-tile"><div class="k">${__("Pieces")}</div><div class="v">${t.pcs}</div></div>
			<div class="rb-tile"><div class="k">${__("Repair charges")}</div><div class="v">${m2(t.rep)}</div></div>
			<div class="rb-tile"><div class="k">${__("Stone charges")}</div><div class="v">${m2(t.dmd)}</div></div>
			<div class="rb-tile"><div class="k">${__("Gold added")}</div><div class="v">${(t.w75 + t.w92).toFixed(3)} g</div></div>
			<div class="rb-tile"><div class="k">${__("Grand total")}</div><div class="v">${m2(t.g)}</div></div>`);
		const chip = (s) => `<span class="rb-chip ${s === "In Progress" ? "ip" : s === "Billed" ? "bl" : "dv"}">${esc(s)}</span>`;
		root.find(".rb-body").html(ROWS.length ? `
			<table class="rb-t"><thead><tr>
				<th class="l">${__("Bill")}</th><th class="l">${__("Party")}</th><th class="l">${__("Date")}</th><th class="l">${__("Status")}</th>
				<th>${__("Pcs")}</th><th>${__("Repair ₹")}</th><th>${__("Stone ₹")}</th>
				<th>${__("Add75 g")}</th><th>${__("Add92 g")}</th><th>${__("Grand ₹")}</th><th></th>
			</tr></thead><tbody>
			${ROWS.map((b) => `<tr class="rb-r" data-n="${esc(b.name)}">
				<td class="l"><b>${esc(b.name)}</b></td><td class="l">${esc(b.party)}</td>
				<td class="l">${esc(b.bill_date || "")}</td><td class="l">${chip(b.status)}</td>
				<td>${b.tot_pieces || 0}</td><td>${m2(b.tot_repair)}</td><td>${m2(b.tot_diamond)}</td>
				<td>${(b.tot_wt75 || 0).toFixed(3)}</td><td>${(b.tot_wt92 || 0).toFixed(3)}</td>
				<td><b>${m2(b.grand_total)}</b></td>
				<td class="l">${b.status === "Billed" ? `<button class="rb-dlv" data-n="${esc(b.name)}">${__("Delivered ✓")}</button>` : ""}</td>
			</tr>`).join("")}</tbody></table>`
			: `<div style="padding:26px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:10px;">${__("No bills match.")}</div>`);
	}

	root.on("change input", ".rb-party, .rb-status, .rb-from, .rb-to", load);
	root.on("click", ".rb-dlv", function (e) {
		e.stopPropagation();
		const n = this.getAttribute("data-n");
		frappe.confirm(__("Mark {0} DELIVERED? It locks the bill.", [n]), () =>
			frappe.call({ method: API + ".set_repair_bill_status", args: { name: n, status: "Delivered" } }).then(load));
	});
	root.on("click", "tr.rb-r", function () {
		frappe.route_options = { bill: $(this).data("n") };
		frappe.set_route("repair-desk");
	});

	load();
};
