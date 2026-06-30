// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Bench Dashboard.
//   /app/bench-dashboard            -> overview grid of all benches
//   /app/bench-dashboard/<bench>    -> one bench: cards present (+ Issued/Receipted
//                                      for work benches) and the list of cards there.

const BD_BENCHES = [
	"Ordering", "CAD", "CAM", "Wax Injecting", "Tree Making", "Casting", "Grinding",
	"Filing", "Setting", "Pre Polish", "Wax Setting", "Final Polish", "Wax Cleaning", "Bag Extraction",
];
const bd_slug = (label) => (label || "").toLowerCase().replace(/ /g, "_");

frappe.pages["bench-dashboard"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Bench Dashboard", single_column: true });

	$(page.main).append(`
		<style>
		.bd-bar{display:flex;align-items:center;gap:10px;margin:2px 0 14px;flex-wrap:wrap;}
		.bd-tiles{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;}
		.bd-tile{border:1px solid var(--border-color);border-radius:10px;padding:14px 18px;min-width:130px;background:var(--fg-color);}
		.bd-tile .lbl{font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;}
		.bd-tile .val{font-size:30px;font-weight:700;line-height:1.1;margin-top:4px;}
		.bd-tile.issued .val{color:#9a6700;}
		.bd-tile.receipted .val{color:#1d7a33;}
		.bd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px;}
		.bd-card{border:1px solid var(--border-color);border-radius:10px;padding:14px 16px;background:var(--fg-color);cursor:pointer;transition:box-shadow .12s,border-color .12s;}
		.bd-card:hover{box-shadow:0 2px 10px rgba(0,0,0,.08);border-color:var(--gray-400,#aeb6bf);}
		.bd-card .name{font-weight:700;font-size:14px;margin-bottom:8px;}
		.bd-card .big{font-size:26px;font-weight:700;}
		.bd-card .sub{font-size:12px;color:var(--text-muted);margin-top:6px;}
		.bd-card .pill{display:inline-block;padding:1px 7px;border-radius:10px;font-size:11px;margin-right:5px;}
		.bd-pill-q{background:#eef2f7;color:#5a6b7b;}
		.bd-pill-i{background:#fdf3e3;color:#9a6700;}
		.bd-pill-r{background:#eaf6ec;color:#1d7a33;}
		.bd-box{border:1px solid var(--border-color);border-radius:8px;overflow:auto;}
		table.bd-list{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;background:var(--fg-color);}
		table.bd-list th{position:sticky;top:0;background:var(--control-bg,var(--fg-color));border-bottom:2px solid var(--gray-400,#aeb6bf);padding:6px 8px;text-align:left;font-weight:700;}
		table.bd-list td{border-bottom:1px solid var(--border-color);padding:5px 8px;}
		table.bd-list td.num{text-align:right;}
		table.bd-list th.bd-sort{cursor:pointer;user-select:none;white-space:nowrap;}
		table.bd-list th.bd-sort:hover{background:var(--bg-light-gray,#f4f5f6);}
		.bd-arrow{font-size:9px;color:var(--text-muted);margin-left:2px;}
		.bd-empty{color:var(--text-muted);padding:18px;text-align:center;}
		</style>
		<div class="bd-bar"></div>
		<div class="bd-body"></div>
	`);

	const $bar = $(page.main).find(".bd-bar");
	const $body = $(page.main).find(".bd-body");

	// bench switcher (works from any view)
	const sel = frappe.ui.form.make_control({
		df: { fieldtype: "Select", label: "Bench", fieldname: "bench", options: ["", ...BD_BENCHES].join("\n") },
		parent: $bar.get(0), render_input: true,
	});
	sel.refresh();
	sel.$input.on("change", () => {
		const v = sel.get_value();
		frappe.set_route(v ? ["bench-dashboard", bd_slug(v)] : ["bench-dashboard"]);
	});
	$(`<button class="btn btn-default btn-sm">${__("All Benches")}</button>`).appendTo($bar).on("click", () => frappe.set_route(["bench-dashboard"]));

	function tile(lbl, val, cls) {
		return `<div class="bd-tile ${cls || ""}"><div class="lbl">${lbl}</div><div class="val">${val}</div></div>`;
	}

	function renderOverview(rows) {
		page.set_title(__("Bench Dashboard"));
		sel.set_value("");
		const cards = rows
			.map((s) => {
				const irPills = s.has_ir
					? `<span class="pill bd-pill-i">Issued ${s.issued}</span><span class="pill bd-pill-r">Recd ${s.receipted}</span>`
					: "";
				const sub = `<div class="sub"><span class="pill bd-pill-q">Queue ${s.in_queue}</span>${irPills}</div>`;
				return `<div class="bd-card" data-slug="${bd_slug(s.label)}">
					<div class="name">${frappe.utils.escape_html(s.label)}</div>
					<div class="big">${s.present}</div><div class="sub">cards present</div>
					${sub}</div>`;
			})
			.join("");
		$body.html(`<div class="bd-grid">${cards}</div>`);
		$body.find(".bd-card").on("click", function () {
			frappe.set_route(["bench-dashboard", $(this).data("slug")]);
		});
	}

	const BD_COLS = [
		{ f: "name", label: "Order Bag", t: "str" },
		{ f: "design", label: "Design", t: "str" },
		{ f: "qty", label: "Qty", t: "num" },
		{ f: "due_date", label: "Due", t: "date" },
		{ f: "status", label: "Status", t: "str" },
		{ f: "employee", label: "Employee", t: "str" },
		{ f: "weight_out", label: "Wt Out", t: "num" },
	];
	let bdCards = [];
	let bdSort = { field: null, dir: 1 };

	function sortedCards() {
		if (!bdSort.field) return bdCards.slice();
		const col = BD_COLS.find((c) => c.f === bdSort.field) || { t: "str" };
		const d = bdSort.dir;
		return bdCards.slice().sort((a, b) => {
			let va = a[bdSort.field],
				vb = b[bdSort.field];
			if (col.t === "num") return ((parseFloat(va) || 0) - (parseFloat(vb) || 0)) * d;
			va = (va == null ? "" : va).toString().toLowerCase();
			vb = (vb == null ? "" : vb).toString().toLowerCase();
			return (va < vb ? -1 : va > vb ? 1 : 0) * d;
		});
	}
	function renderCardRows() {
		const dtu = (v) => (v ? frappe.datetime.str_to_user(v) : "");
		const num = (v) => (v ? flt(v).toFixed(3) : "");
		const rows = sortedCards()
			.map(
				(c) => `<tr>
				<td><a href="/app/order-bag/${encodeURIComponent(c.name)}"><b>${frappe.utils.escape_html(c.name)}</b></a></td>
				<td>${frappe.utils.escape_html(c.design || "")}</td>
				<td class="num">${c.qty || ""}</td>
				<td>${dtu(c.due_date)}</td>
				<td>${frappe.utils.escape_html(c.status || "")}</td>
				<td>${frappe.utils.escape_html(c.employee || "")}</td>
				<td class="num">${num(c.weight_out)}</td>
			</tr>`
			)
			.join("");
		$body.find(".bd-list tbody").html(rows || `<tr><td colspan="7"><div class="bd-empty">No cards at this bench right now.</div></td></tr>`);
	}
	function renderBench(s) {
		page.set_title(s.label || __("Bench"));
		sel.set_value(s.label || "");
		let tiles = tile(__("Cards Present"), s.present) + tile(__("In Queue"), s.in_queue);
		if (s.has_ir) {
			tiles += tile(__("Issued"), s.issued, "issued");
			tiles += tile(__("Receipted"), s.receipted, "receipted");
		}
		bdCards = s.cards || [];
		bdSort = { field: null, dir: 1 };
		const ths = BD_COLS.map((c) => `<th class="bd-sort ${c.t === "num" ? "num" : ""}" data-f="${c.f}">${__(c.label)}<span class="bd-arrow"></span></th>`).join("");
		$body.html(`
			<div class="bd-tiles">${tiles}</div>
			<div class="bd-box"><table class="bd-list">
				<thead><tr>${ths}</tr></thead>
				<tbody></tbody>
			</table></div>
		`);
		renderCardRows();
		$body.find(".bd-sort").on("click", function () {
			const f = $(this).data("f");
			if (bdSort.field === f) bdSort.dir *= -1;
			else bdSort = { field: f, dir: 1 };
			$body.find(".bd-arrow").text("");
			$(this).find(".bd-arrow").text(bdSort.dir === 1 ? " ▲" : " ▼");
			renderCardRows();
		});
	}
	function flt(v) {
		const n = parseFloat(v);
		return isNaN(n) ? 0 : n;
	}

	function load() {
		const bench = frappe.get_route()[1] || null;
		frappe.call({ method: "jewelima.jewelima.api.get_bench_dashboard", args: { bench } }).then((r) => {
			const d = r.message || {};
			if (d.overview) renderOverview(d.overview);
			else if (d.label) renderBench(d);
			else $body.html(`<div class="bd-empty">${__("Unknown bench.")}</div>`);
		});
	}

	page.add_inner_button(__("Refresh"), load);
	load();
	frappe.router.on("change", () => {
		if (frappe.get_route()[0] === "bench-dashboard") load();
	});
};
