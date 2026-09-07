// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Chart Gaps (Costing) — every active price chart's gaps, grouped by the GAP
// rather than by the chart.
//
// Chart Detail answers "what does this chart price". This answers "which charts
// still need something", which is the question you ask when there are thirty of
// them and you are the one closing them. Click any chart and you land on it in
// Price Charts, ready to edit.
//
// Two kinds, kept apart on purpose. A PROBLEM is a chart that cannot bill
// correctly. NOT PRICED is a chart that simply does not carry a section —
// usually the desk's choice, listed so it can be checked, never as an error.
// Route: /app/chart-gaps

frappe.pages["chart-gaps"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Chart Gaps"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const root = $(page.main);
	let D = null;

	root.append(`
		<style>
		#page-chart-gaps .container{max-width:100%;}
		.cg-kpis{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px;}
		.cg-kpi{flex:1 1 160px;border:1px solid var(--border-color);border-radius:12px;
			padding:11px 15px;background:var(--fg-color);}
		.cg-kpi .k{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);}
		.cg-kpi .v{font-size:24px;font-weight:800;line-height:1.2;font-variant-numeric:tabular-nums;}
		.cg-kpi.bad{border-left:3px solid #B02A2A;} .cg-kpi.bad .v{color:#B02A2A;}
		.cg-kpi.ok{border-left:3px solid #1D7A33;} .cg-kpi.ok .v{color:#1D7A33;}
		[data-theme="dark"] .cg-kpi.bad .v{color:#F0A0A0;}
		[data-theme="dark"] .cg-kpi.ok .v{color:#6FBF7F;}
		.cg-sec{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;
			color:var(--text-muted);margin:24px 0 4px;padding-bottom:5px;
			border-bottom:1px solid var(--border-color);}
		.cg-note{font-size:12.5px;color:var(--text-muted);margin:0 0 12px;}
		.cg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px;}
		.cg-b{border:1px solid var(--border-color);border-radius:13px;background:var(--fg-color);
			padding:14px 16px;}
		.cg-b.prob{border-left:3px solid #B02A2A;}
		.cg-b.miss{border-left:3px solid #B45309;}
		.cg-b .h{font-size:14.5px;font-weight:800;}
		.cg-b .n{font-size:11.5px;color:var(--text-muted);margin:2px 0 11px;}
		.cg-b .cnt{float:right;font-size:11.5px;color:var(--text-muted);font-weight:700;}
		.cg-chips{display:flex;flex-wrap:wrap;gap:7px;}
		/* a chart is a door: clicking it opens that chart, ready to edit */
		.cg-chip{display:inline-flex;flex-direction:column;gap:1px;border:1px solid var(--border-color);
			border-radius:9px;padding:5px 11px;background:var(--control-bg);cursor:pointer;
			font-size:12.5px;line-height:1.35;}
		.cg-chip:hover{border-color:#1665A8;background:rgba(22,101,168,.08);}
		.cg-chip b{font-weight:800;}
		.cg-chip .d{font-size:10.5px;color:var(--text-muted);}
		.cg-why{font-size:11px;color:#B02A2A;margin-top:7px;line-height:1.5;}
		[data-theme="dark"] .cg-why{color:#F0A0A0;}
		.cg-empty{padding:24px;text-align:center;color:var(--text-muted);font-size:13px;
			border:1px dashed var(--border-color);border-radius:12px;}
		</style>
		<div class="cg-kpis"></div>
		<div class="cg-body"></div>
	`);

	function chips(rows) {
		return `<div class="cg-chips">${rows.map((c) => `
			<span class="cg-chip" data-n="${esc(c.name)}" title="${__("open this chart")}">
				<b>${esc(c.chart_name)}</b>
				<span class="d">${esc(c.chart_date)}${c.age_days != null
					? " · " + __("{0}d old", [c.age_days]) : ""}</span>
			</span>`).join("")}</div>`;
	}

	function box(b, kind) {
		// one note for the whole bucket; a per-chart note only where it differs
		const notes = b.charts.filter((c) => c.note);
		return `<div class="cg-b ${kind}">
			<span class="cnt">${b.charts.length}</span>
			<div class="h">${esc(b.title)}</div>
			<div class="n">${esc(b.why)}</div>
			${chips(b.charts)}
			${notes.length ? `<div class="cg-why">${notes.map((c) =>
				`<b>${esc(c.chart_name)}</b> — ${esc(c.note)}`).join("<br>")}</div>` : ""}
		</div>`;
	}

	function paint() {
		if (!D) return;
		root.find(".cg-kpis").html(`
			<div class="cg-kpi"><div class="k">${__("Active charts")}</div><div class="v">${D.total}</div></div>
			<div class="cg-kpi bad"><div class="k">${__("With a problem")}</div>
				<div class="v">${D.problem_charts}</div></div>
			<div class="cg-kpi ok"><div class="k">${__("Fully priced")}</div>
				<div class="v">${D.clean.length}</div></div>`);

		const P = [];
		if (D.problems.length) {
			P.push(`<div class="cg-sec">${__("Problems")}</div>
				<p class="cg-note">${__("these charts cannot bill a piece correctly as they stand")}</p>
				<div class="cg-grid">${D.problems.map((b) => box(b, "prob")).join("")}</div>`);
		} else {
			P.push(`<div class="cg-sec">${__("Problems")}</div>
				<div class="cg-empty">${__("Nothing broken — every active chart can bill a piece.")}</div>`);
		}
		if (D.missing.length) {
			P.push(`<div class="cg-sec">${__("Not priced")}</div>
				<p class="cg-note">${__("a chart is not meant to be complete — this is what each one leaves out, to be checked rather than fixed")}</p>
				<div class="cg-grid">${D.missing.map((b) => box(b, "miss")).join("")}</div>`);
		}
		if (D.clean.length) {
			P.push(`<div class="cg-sec">${__("Fully priced")}</div>
				<p class="cg-note">${__("making and diamonds both priced, nothing flagged")}</p>
				${chips(D.clean)}`);
		}
		root.find(".cg-body").html(P.join(""));
	}

	// straight to the chart, on the page that can change it
	root.on("click", ".cg-chip", function () {
		frappe.route_options = { chart: $(this).data("n") };
		frappe.set_route("price-charts");
	});

	function load() {
		return frappe.call({ method: API + ".get_chart_gaps", freeze: false })
			.then((r) => { D = r.message; paint(); });
	}

	page.set_primary_action(__("Refresh"), load, "refresh");
	frappe.pages["chart-gaps"].on_page_show = load;
	load();
};
