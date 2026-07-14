// jewelima.buildBenchBoard — the shared engine behind every Bench sidebar page.
// Pure INFO, no actions: KPI status counts (In Queue / Issued / Ongoing /
// Receipted / Completed / On Hold), what stock physically sits at the bench
// (stone buckets + gold + pure gold), and the card list — filterable by
// party, design type and order type via pills.

frappe.provide("jewelima");

const BB_STATUSES = ["In Queue", "On Hold", "Issued", "Ongoing", "Receipted", "Completed"];

jewelima.buildBenchBoard = function (wrapper, bench) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Bench — {0}", [bench]), single_column: true });
	const API = "jewelima.jewelima.api";
	const S = { party: "", dtype: "", otype: "" };
	const esc = frappe.utils.escape_html;

	$(page.main).append(`
		<style>
		.bb-tiles{display:flex;gap:12px;flex-wrap:wrap;margin:4px 0 14px;}
		.bb-tile{border:1px solid var(--border-color);border-radius:9px;padding:9px 18px;background:var(--control-bg);min-width:110px;}
		.bb-tile .k{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;}
		.bb-tile .v{font-size:19px;font-weight:800;}
		.bb-tile.gold{border-width:2px;background:var(--fg-color);}
		.bb-sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin:14px 0 6px;}
		.bb-pills{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 8px;align-items:center;}
		.bb-pills .lbl{font-size:10.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-right:2px;}
		.bb-pill{border:1px solid var(--border-color);border-radius:12px;padding:2px 12px;font-size:12px;font-weight:600;cursor:pointer;background:var(--control-bg);user-select:none;}
		.bb-pill.on{background:var(--primary);border-color:var(--primary);color:#fff;}
		table.bb-t{width:100%;border-collapse:collapse;font-size:12.5px;background:var(--fg-color);}
		table.bb-t th{background:var(--control-bg);font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);padding:5px 10px;border:1px solid var(--border-color);text-align:left;}
		table.bb-t td{border:1px solid var(--border-color);padding:4px 10px;}
		.bb-none{padding:30px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:9px;}
		.bb-st{border-radius:10px;padding:1px 9px;font-size:11px;font-weight:700;background:var(--control-bg);}
		</style>
		<div class="bb-tiles bb-kpi"></div>
		<div class="bb-sec">${__("Stock at this bench")}</div>
		<div class="bb-tiles bb-stock"></div>
		<div class="bb-pills bb-party"></div>
		<div class="bb-pills bb-dtype"></div>
		<div class="bb-pills bb-otype"></div>
		<div class="bb-body"></div>
	`);
	const root = $(page.main);

	function load() {
		frappe.call({ method: API + ".get_bench_board", args: {
			bench, party: S.party || null, design_type: S.dtype || null, order_type: S.otype || null,
		} }).then((r) => paint(r.message || {}));
	}

	function pills($box, label, values, cur, key) {
		$box.html(values.length ? `<span class="lbl">${label}</span>
			<span class="bb-pill ${cur ? "" : "on"}" data-k="${key}" data-v="">${__("All")}</span>` +
			values.map((v) => `<span class="bb-pill ${cur === v ? "on" : ""}" data-k="${key}" data-v="${esc(v)}">${esc(v)}</span>`).join("") : "");
	}

	function paint(m) {
		const st = m.status || {};
		root.find(".bb-kpi").html(
			`<div class="bb-tile gold"><div class="k">${__("Cards")}</div><div class="v">${m.bags || 0}</div></div>
			<div class="bb-tile gold"><div class="k">${__("Pieces")}</div><div class="v">${m.pieces || 0}</div></div>` +
			BB_STATUSES.filter((x) => st[x]).map((x) => `
				<div class="bb-tile"><div class="k">${esc(x)}</div><div class="v">${st[x]}</div></div>`).join(""));

		const bks = m.buckets || {};
		root.find(".bb-stock").html(
			`<div class="bb-tile gold"><div class="k">${__("Gold")}</div><div class="v">${(m.gold_g || 0).toFixed(3)} g</div></div>
			<div class="bb-tile gold"><div class="k">${__("Pure Gold")}</div><div class="v">${(m.pure_g || 0).toFixed(3)} g</div></div>` +
			Object.keys(bks).map((b) => `
				<div class="bb-tile"><div class="k">${esc(b)}</div><div class="v">${bks[b].pcs} / ${bks[b].ct.toFixed(3)} ct</div></div>`).join(""));

		pills(root.find(".bb-party"), __("Party"), m.parties || [], S.party, "party");
		pills(root.find(".bb-dtype"), __("Design type"), m.design_types || [], S.dtype, "dtype");
		pills(root.find(".bb-otype"), __("Order type"), m.order_types || [], S.otype, "otype");

		const rows = m.rows || [];
		root.find(".bb-body").html(rows.length ? `
			<div class="bb-sec">${__("Cards")}</div>
			<table class="bb-t"><thead><tr><th style="width:34px">#</th><th>${__("Card")}</th><th>${__("Design")}</th>
				<th>${__("Type")}</th><th>${__("Qty")}</th><th>${__("Party")}</th><th>${__("Order Type")}</th>
				<th>${__("Due")}</th><th>${__("Status")}</th></tr></thead>
			<tbody>${rows.map((r, i) => `
				<tr><td>${i + 1}</td>
				<td><a href="/app/order-bag/${encodeURIComponent(r.name)}">${esc(r.name)}</a></td>
				<td>${esc(r.design)}</td><td>${esc(r.design_type)}</td><td>${r.qty}</td>
				<td>${esc(r.party)}</td><td>${esc(r.order_type)}</td>
				<td>${r.due ? frappe.datetime.str_to_user(r.due) : ""}</td>
				<td><span class="bb-st">${esc(r.status)}</span></td></tr>`).join("")}</tbody></table>`
			: `<div class="bb-none">${__("Nothing at {0}{1}.", [bench, S.party || S.dtype || S.otype ? " " + __("with these filters") : ""])}</div>`);
	}

	root.on("click", ".bb-pill", function () {
		const k = this.getAttribute("data-k"), v = this.getAttribute("data-v");
		if (k === "party") S.party = v;
		else if (k === "dtype") S.dtype = v;
		else S.otype = v;
		load();
	});

	page.add_inner_button(__("Refresh"), load);
	load();
};
