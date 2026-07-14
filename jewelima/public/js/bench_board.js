// jewelima.buildBenchBoard — the shared engine behind every Bench sidebar page.
// Pure INFO, no actions. The server hands over every card at the bench WITH its
// own stock; a generic filter bar (jewelima.buildFilterBar) narrows the set and
// KPIs / stock tiles / the sortable table all recompute client-side, instantly.
// Filter by party, salesman, design type, order type, status, card, design, due
// date, gold or pure gold — any combination.

frappe.provide("jewelima");

const BB_STATUSES = ["In Queue", "On Hold", "Issued", "Ongoing", "Receipted", "Completed"];
const BB_BUCKETS = ["DMD", "PS", "CS", "CVD", "PDMD", "POTH"];
const BB_COLS = [
	["name", "Card"], ["design", "Design"], ["design_type", "Type"], ["qty", "Qty"],
	["party", "Party"], ["salesman", "Salesman"], ["order_type", "Order Type"],
	["due", "Due"], ["pure_g", "Pure g"], ["status", "Status"],
];
const BB_FILTER_FIELDS = [
	{ key: "party", label: "Party", type: "select" },
	{ key: "salesman", label: "Salesman", type: "select" },
	{ key: "design", label: "Design", type: "text" },
	{ key: "design_type", label: "Design Type", type: "select" },
	{ key: "order_type", label: "Order Type", type: "select" },
	{ key: "status", label: "Status", type: "select" },
	{ key: "name", label: "Card", type: "text" },
	{ key: "due", label: "Due Date", type: "date" },
	{ key: "gold_g", label: "Gold (g)", type: "number" },
	{ key: "pure_g", label: "Pure Gold (g)", type: "number" },
];

jewelima.buildBenchBoard = function (wrapper, bench) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Bench — {0}", [bench]), single_column: true });
	const API = "jewelima.jewelima.api";
	const S = { all: [], sort: "name", dir: 1 };
	const esc = frappe.utils.escape_html;

	$(page.main).append(`
		<style>
		.bb-tiles{display:flex;gap:12px;flex-wrap:wrap;margin:4px 0 14px;}
		.bb-tile{border:1px solid var(--border-color);border-radius:9px;padding:9px 18px;background:var(--control-bg);min-width:104px;}
		.bb-tile .k{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;}
		.bb-tile .v{font-size:19px;font-weight:800;}
		.bb-tile.gold{border-width:2px;background:var(--fg-color);}
		.bb-sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin:14px 0 6px;}
		table.bb-t{width:100%;border-collapse:collapse;font-size:12.5px;background:var(--fg-color);}
		table.bb-t th{background:var(--control-bg);font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);padding:5px 10px;border:1px solid var(--border-color);text-align:left;}
		table.bb-t th[data-sort]{cursor:pointer;user-select:none;}
		table.bb-t th[data-sort]:hover{color:var(--text-color);}
		table.bb-t th .arr{font-size:9px;margin-left:3px;}
		table.bb-t td{border:1px solid var(--border-color);padding:4px 10px;}
		.bb-none{padding:30px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:9px;}
		.bb-st{border-radius:10px;padding:1px 9px;font-size:11px;font-weight:700;background:var(--control-bg);}
		</style>
		<div class="bb-filter"></div>
		<div class="bb-tiles bb-kpi"></div>
		<div class="bb-sec">${__("Stock at the filtered cards")}</div>
		<div class="bb-tiles bb-stock"></div>
		<div class="bb-body"></div>
	`);
	const root = $(page.main);

	const filterBar = jewelima.buildFilterBar(root.find(".bb-filter").get(0), {
		fields: BB_FILTER_FIELDS,
		getData: () => S.all,
		onChange: recompute,
	});

	function load() {
		frappe.call({ method: API + ".get_bench_board", args: { bench } }).then((r) => {
			S.all = (r.message || {}).rows || [];
			recompute();
		});
	}

	function recompute() {
		const rows = filterBar.apply(S.all);

		// KPI
		const st = {};
		rows.forEach((r) => (st[r.status] = (st[r.status] || 0) + 1));
		const pieces = rows.reduce((s, r) => s + (r.qty || 0), 0);
		root.find(".bb-kpi").html(
			`<div class="bb-tile gold"><div class="k">${__("Cards")}</div><div class="v">${rows.length}</div></div>
			<div class="bb-tile gold"><div class="k">${__("Pieces")}</div><div class="v">${pieces}</div></div>` +
			BB_STATUSES.filter((x) => st[x]).map((x) => `
				<div class="bb-tile"><div class="k">${esc(x)}</div><div class="v">${st[x]}</div></div>`).join(""));

		// stock — sum gold/pure/buckets over the filtered cards
		let gold = 0, pure = 0;
		const bk = {};
		rows.forEach((r) => {
			gold += r.gold_g || 0;
			pure += r.pure_g || 0;
			Object.entries(r.buckets || {}).forEach(([k, v]) => {
				const e = bk[k] || (bk[k] = { pcs: 0, ct: 0 });
				e.pcs += v.pcs; e.ct += v.ct;
			});
		});
		root.find(".bb-stock").html(
			`<div class="bb-tile gold"><div class="k">${__("Gold")}</div><div class="v">${gold.toFixed(3)} g</div></div>
			<div class="bb-tile gold"><div class="k">${__("Pure Gold")}</div><div class="v">${pure.toFixed(3)} g</div></div>` +
			BB_BUCKETS.filter((b) => bk[b]).map((b) => `
				<div class="bb-tile"><div class="k">${b}</div><div class="v">${bk[b].pcs} / ${bk[b].ct.toFixed(3)} ct</div></div>`).join(""));

		renderTable(rows);
	}

	function renderTable(rows) {
		const sorted = rows.slice().sort((a, b) => {
			const x = a[S.sort], y = b[S.sort];
			if (typeof x === "number" || typeof y === "number") return ((x || 0) - (y || 0)) * S.dir;
			return String(x || "").localeCompare(String(y || "")) * S.dir;
		});
		const arr = (k) => (S.sort === k ? `<span class="arr">${S.dir > 0 ? "▲" : "▼"}</span>` : "");
		root.find(".bb-body").html(sorted.length ? `
			<div class="bb-sec">${__("Cards")} (${sorted.length})</div>
			<table class="bb-t"><thead><tr><th style="width:34px">#</th>
				${BB_COLS.map(([k, l]) => `<th data-sort="${k}">${__(l)}${arr(k)}</th>`).join("")}
			</tr></thead>
			<tbody>${sorted.map((r, i) => `
				<tr><td>${i + 1}</td>
				<td><a href="/app/order-bag/${encodeURIComponent(r.name)}">${esc(r.name)}</a></td>
				<td>${esc(r.design)}</td><td>${esc(r.design_type)}</td><td>${r.qty}</td>
				<td>${esc(r.party)}</td><td>${esc(r.salesman)}</td><td>${esc(r.order_type)}</td>
				<td>${r.due ? frappe.datetime.str_to_user(r.due) : ""}</td>
				<td>${(r.pure_g || 0).toFixed(3)}</td>
				<td><span class="bb-st">${esc(r.status)}</span></td></tr>`).join("")}</tbody></table>`
			: `<div class="bb-none">${filterBar.count() ? __("No cards match the filters.") : __("Nothing at {0}.", [bench])}</div>`);
	}
	root.on("click", "th[data-sort]", function () {
		const k = this.getAttribute("data-sort");
		if (S.sort === k) S.dir = -S.dir;
		else { S.sort = k; S.dir = 1; }
		recompute();
	});

	page.add_inner_button(__("Refresh"), load);
	load();
};
