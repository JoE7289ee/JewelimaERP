// jewelima.buildBenchBoard — the shared engine behind every Bench sidebar page.
// Pure INFO, no actions. The server hands over every card at the bench WITH its
// own stock; a generic filter bar (jewelima.buildFilterBar) narrows the set and
// KPIs / stock tiles / the sortable table all recompute client-side, instantly.
// The "Columns" button lets each user choose which table columns show (kept in
// their own browser, not global). Filter by party, salesman, design type, order
// type, status, card, design, due date, gold or pure gold — any combination.

frappe.provide("jewelima");

const BB_STATUSES = ["In Queue", "On Hold", "Issued", "Ongoing", "Receipted", "Completed"];
const BB_BUCKETS = ["DMD", "PS", "CS", "CVD", "PDMD", "POTH"];
const BB_COLKEY = "jw-bench-cols"; // per-user column choice
const BB_CORE_COLS = [
	["prio_rank", "P#"],
	["name", "Card"], ["design", "Design"], ["design_type", "Type"], ["qty", "Qty"],
	["party", "Party"], ["salesman", "Salesman"], ["order_type", "Order Type"],
	["due", "Due"], ["gold_g", "Gold g"], ["pure_g", "Pure g"], ["status", "Status"],
	["queue_reason", "In Queue Reason"], ["worker", "Worker"],
];
// stone buckets as OPT-IN columns (off by default): pcs / ct per bucket
const BB_BUCKET_COLS = BB_BUCKETS.map((b) => [b.toLowerCase(), b + " (no/ct)"]);
const BB_COLS = BB_CORE_COLS.concat(BB_BUCKET_COLS);
const BB_FILTER_FIELDS = [
	{ key: "party", label: "Party", type: "select" },
	{ key: "salesman", label: "Salesman", type: "select" },
	{ key: "design", label: "Design", type: "text" },
	{ key: "design_type", label: "Design Type", type: "select" },
	{ key: "order_type", label: "Order Type", type: "select" },
	{ key: "status", label: "Status", type: "select" },
	{ key: "queue_reason", label: "In Queue Reason", type: "select" },
	{ key: "name", label: "Card", type: "text" },
	{ key: "due", label: "Due Date", type: "date" },
	{ key: "gold_g", label: "Gold (g)", type: "number" },
	{ key: "pure_g", label: "Pure Gold (g)", type: "number" },
].concat(BB_BUCKETS.map((b) => ({ key: b.toLowerCase(), label: b + " (ct)", type: "number" })));

jewelima.buildBenchBoard = function (wrapper, bench) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Bench — {0}", [bench]), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;

	function loadCols() {
		try {
			const v = JSON.parse(localStorage.getItem(BB_COLKEY));
			if (Array.isArray(v) && v.length) return new Set(v.filter((k) => BB_COLS.some((c) => c[0] === k)));
		} catch (e) { /* fall through to default */ }
		return new Set(BB_CORE_COLS.map((c) => c[0]));
	}
	// batch benches (casting/tree making) have no per-card queue law
	const BB_RANKED = !["CASTING", "TREE MAKING"].includes(bench);
	const S = { all: [], sort: BB_RANKED ? "prio_rank" : "name", dir: 1, cols: loadCols() };
	if (BB_RANKED) S.cols.add("prio_rank");

	const BB_CELL = {
		prio_rank: (r) => (r.prio_rank
			? `<span class="bb-pr ${r.prio_manual ? "man" : ""}" title="${r.prio_manual ? __("manually prioritised — set on the Prioritisation page") : __("automatic: due date, CUST first")}">${r.prio_rank}</span>`
			: ""),
		worker: (r) => esc(r.worker || ""),
		name: (r) => `<a href="/app/order-bag/${encodeURIComponent(r.name)}">${esc(r.name)}</a>`,
		design: (r) => esc(r.design),
		design_type: (r) => esc(r.design_type),
		qty: (r) => r.qty,
		party: (r) => esc(r.party),
		salesman: (r) => esc(r.salesman),
		order_type: (r) => esc(r.order_type),
		due: (r) => (r.due ? frappe.datetime.str_to_user(r.due) : ""),
		gold_g: (r) => (r.gold_g || 0).toFixed(3),
		pure_g: (r) => (r.pure_g || 0).toFixed(3),
		status: (r) => `<span class="bb-st">${esc(r.status)}</span>`
			+ (r.queue_reason ? ` <span class="bb-qr" data-name="${esc(r.name)}" title="${__("click to change")}">${esc(r.queue_reason)}</span>`
				: (["In Queue", "On Hold"].includes(r.status) ? ` <span class="bb-qr add" data-name="${esc(r.name)}" title="${__("why is it waiting?")}">+ ${__("reason")}</span>` : "")),
		queue_reason: (r) => esc(r.queue_reason || ""),
	};
	BB_BUCKETS.forEach((b) => {
		BB_CELL[b.toLowerCase()] = (r) => {
			const v = (r.buckets || {})[b];
			return v ? `${v.pcs} / ${v.ct.toFixed(3)}` : "";
		};
	});

	$(page.main).append(`
		<style>
		.bb-loc{font-size:26px;font-weight:800;letter-spacing:.6px;margin:2px 0 10px;display:flex;align-items:center;gap:12px;}
		.bb-loc .tag{font-size:11px;font-weight:700;letter-spacing:.08em;color:var(--text-muted);text-transform:uppercase;
			border:1px solid var(--border-color);border-radius:9px;padding:2px 10px;background:var(--control-bg);}
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
		.bb-qr{border-radius:10px;padding:1px 9px;font-size:11px;font-weight:700;background:#fff6e0;color:#7a5b00;border:1px solid #e0a800;cursor:pointer;}
		.bb-qr.add{background:transparent;color:var(--text-muted);border:1px dashed var(--border-color);}
		.bb-pr{display:inline-block;min-width:26px;text-align:center;border-radius:9px;padding:1px 7px;font-size:11px;font-weight:800;background:var(--control-bg);}
		.bb-pr.man{background:#d63031;color:#fff;}
		.bb-next{border:2px solid #d63031;border-radius:10px;padding:10px 16px;margin:0 0 12px;display:none;align-items:center;gap:14px;background:var(--fg-color);}
		.bb-next .k{font-size:10px;font-weight:800;letter-spacing:.08em;color:#d63031;text-transform:uppercase;}
		.bb-next .v{font-size:18px;font-weight:800;}
		.bb-next .sub{font-size:12px;color:var(--text-muted);}
		</style>
		<div class="bb-loc"><span class="tag">${__("Bench")}</span>${esc(bench)}</div>
		<div class="bb-next"></div>
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
			S.all = ((r.message || {}).rows || []).map((row) => {
				BB_BUCKETS.forEach((b) => { row[b.toLowerCase()] = ((row.buckets || {})[b] || {}).ct || 0; });
				return row;
			});
			recompute();
		});
	}

	function recompute() {
		const rows = filterBar.apply(S.all);

		// the queue law's verdict: what should be picked up NEXT (waiting cards only)
		if (BB_RANKED) {
			const next = S.all.filter((r) => ["In Queue", "On Hold"].includes(r.status))
				.sort((a, b) => (a.prio_rank || 9e9) - (b.prio_rank || 9e9))[0];
			root.find(".bb-next").css("display", next ? "flex" : "none").html(next ? `
				<span class="k">${__("Next up")}</span>
				<span class="v">${esc(next.name)}</span>
				<span class="sub">${esc(next.design || "")} · ${esc(next.party || "")}${next.due ? " · " + __("due") + " " + frappe.datetime.str_to_user(next.due) : ""}${next.prio_manual ? " · " + __("MANUAL PRIORITY") : ""}</span>` : "");
		}

		const st = {};
		rows.forEach((r) => (st[r.status] = (st[r.status] || 0) + 1));
		const pieces = rows.reduce((s, r) => s + (r.qty || 0), 0);
		root.find(".bb-kpi").html(
			`<div class="bb-tile gold"><div class="k">${__("Cards")}</div><div class="v">${rows.length}</div></div>
			<div class="bb-tile gold"><div class="k">${__("Pieces")}</div><div class="v">${pieces}</div></div>` +
			BB_STATUSES.filter((x) => st[x]).map((x) => `
				<div class="bb-tile"><div class="k">${esc(x)}</div><div class="v">${st[x]}</div></div>`).join(""));

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
		const cols = BB_COLS.filter(([k]) => S.cols.has(k));
		const sorted = rows.slice().sort((a, b) => {
			const x = a[S.sort], y = b[S.sort];
			if (typeof x === "number" || typeof y === "number") return ((x || 0) - (y || 0)) * S.dir;
			return String(x || "").localeCompare(String(y || "")) * S.dir;
		});
		S.cols_shown = cols;       // Export uses exactly what's on screen:
		S.rows_shown = sorted;     // visible columns, current filter + sort
		const arr = (k) => (S.sort === k ? `<span class="arr">${S.dir > 0 ? "▲" : "▼"}</span>` : "");
		root.find(".bb-body").html(sorted.length ? `
			<div class="bb-sec">${__("Cards")} (${sorted.length})</div>
			<table class="bb-t"><thead><tr><th style="width:34px">#</th>
				${cols.map(([k, l]) => `<th data-sort="${k}">${__(l)}${arr(k)}</th>`).join("")}
			</tr></thead>
			<tbody>${sorted.map((r, i) => `
				<tr><td>${i + 1}</td>${cols.map(([k]) => `<td>${BB_CELL[k](r)}</td>`).join("")}</tr>`).join("")}</tbody></table>`
			: `<div class="bb-none">${filterBar.count() ? __("No cards match the filters.") : __("Nothing at {0}.", [bench])}</div>`);
	}
	// why is this card waiting? — pick from the bench's configured reasons
	root.on("click", ".bb-qr", function (e) {
		e.stopPropagation();
		const nm = $(this).data("name");
		frappe.call({ method: API + ".get_bench_work_options", args: { location: bench } }).then((r) => {
			const reasons = (r.message || {}).queue_reasons || [];
			if (!reasons.length) {
				frappe.show_alert({ message: __("No In-Queue reasons configured for {0} — add them on Bench Setup.", [bench]), indicator: "orange" }, 5);
				return;
			}
			frappe.prompt([{ fieldname: "v", fieldtype: "Select", label: __("In Queue reason"),
				options: [""].concat(reasons).join("\n") }],
				(vals) => frappe.call({ method: API + ".set_bench_queue_reason",
					args: { order_bag: nm, location: bench, reason: vals.v || "" } }).then(() => {
					frappe.show_alert({ message: vals.v ? __("{0}: {1}", [nm, vals.v]) : __("{0}: reason cleared", [nm]), indicator: "blue" }, 4);
					load();
				}), __("Why is {0} waiting?", [nm]), __("Set"));
		});
	});

	root.on("click", "th[data-sort]", function () {
		const k = this.getAttribute("data-sort");
		if (S.sort === k) S.dir = -S.dir;
		else { S.sort = k; S.dir = 1; }
		recompute();
	});

	// per-user column chooser — remembered in this browser only
	function openColumns() {
		const d = new frappe.ui.Dialog({ title: __("Show columns"), fields: [{ fieldtype: "HTML", fieldname: "c" }] });
		d.fields_dict.c.$wrapper.html(
			`<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">${__("Your choice is remembered on this device.")}</div>` +
			BB_COLS.map(([k, l]) => `<label style="display:block;padding:4px 0;font-size:13px;cursor:pointer;">
				<input type="checkbox" class="bb-colcb" value="${k}" ${S.cols.has(k) ? "checked" : ""}> ${__(l)}</label>`).join(""));
		d.$wrapper.find(".bb-colcb").on("change", function () {
			if (this.checked) S.cols.add(this.value);
			else if (S.cols.size > 1) S.cols.delete(this.value);
			else { this.checked = true; return; } // keep at least one column
			localStorage.setItem(BB_COLKEY, JSON.stringify([...S.cols]));
			recompute();
		});
		d.show();
	}

	// plain-text cell value for export (the table cells carry HTML/links)
	const BB_TEXT = {
		name: (r) => r.name, design: (r) => r.design, design_type: (r) => r.design_type,
		qty: (r) => r.qty, party: (r) => r.party, salesman: (r) => r.salesman,
		order_type: (r) => r.order_type, due: (r) => r.due || "",
		gold_g: (r) => (r.gold_g || 0), pure_g: (r) => (r.pure_g || 0), status: (r) => r.status,
	};
	BB_BUCKETS.forEach((b) => {
		BB_TEXT[b.toLowerCase()] = (r) => {
			const v = (r.buckets || {})[b];
			return v ? `${v.pcs} / ${v.ct.toFixed(3)}` : "";
		};
	});
	function exportXlsx() {
		const cols = S.cols_shown || BB_COLS.filter(([k]) => S.cols.has(k));
		const rows = S.rows_shown || [];
		if (!rows.length) return frappe.msgprint(__("Nothing to export."));
		const data = [["#", ...cols.map(([k, l]) => __(l))]];
		rows.forEach((r, i) => data.push([i + 1, ...cols.map(([k]) => BB_TEXT[k](r))]));
		open_url_post("/api/method/jewelima.jewelima.api.export_table_xlsx",
			{ title: `Bench-${bench}-${frappe.datetime.get_today()}`, data: JSON.stringify(data) });
	}

	page.add_inner_button(__("Export"), exportXlsx);
	page.add_inner_button(__("Columns"), openColumns);
	page.add_inner_button(__("Refresh"), load);
	load();
};
