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
	let Q = "";        // a chart name being looked up

	root.append(`
		<style>
		#page-chart-gaps .container{max-width:100%;}
		.cg-bar{display:flex;gap:9px;align-items:center;margin-bottom:14px;}
		.cg-bar input{flex:1 1 320px;max-width:460px;border:1px solid var(--border-color);
			border-radius:9px;height:36px;padding:2px 12px;font-size:13.5px;
			background:var(--control-bg);color:var(--text-color);}
		.cg-bar button{border:1px solid var(--border-color);border-radius:9px;background:none;
			height:36px;padding:0 15px;font-size:12.5px;cursor:pointer;color:var(--text-color);}
		/* the answer to "what is this chart missing", in one panel */
		.cg-focus{margin-bottom:16px;}
		.cg-fc{border:1px solid var(--border-color);border-left:3px solid #1665A8;border-radius:13px;
			background:var(--fg-color);padding:14px 17px;margin-bottom:10px;}
		.cg-fc .h{font-size:17px;font-weight:800;}
		.cg-fc .d{font-size:11.5px;color:var(--text-muted);margin:1px 0 11px;}
		.cg-fc .tag{display:inline-block;border-radius:8px;padding:2px 10px;margin:0 6px 6px 0;
			font-size:11.5px;font-weight:700;background:var(--control-bg);
			border:1px solid var(--border-color);}
		.cg-fc .tag.prob{border-color:#B02A2A;color:#B02A2A;background:rgba(176,42,42,.08);}
		[data-theme="dark"] .cg-fc .tag.prob{color:#F0A0A0;}
		.cg-fc .open{margin-top:6px;font-size:12.5px;color:#1665A8;cursor:pointer;font-weight:700;}
		.cg-fc .none{font-size:12.5px;color:#1D7A33;font-weight:700;}
		[data-theme="dark"] .cg-fc .none{color:#6FBF7F;}
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
		<div class="cg-bar">
			<input type="text" class="cg-q" placeholder="${
				__("type a chart name to see every bucket it is in")}">
			<button class="cg-clear" style="display:none;">${__("clear")}</button>
		</div>
		<div class="cg-focus"></div>
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

	function match(c) {
		const q = Q.trim().toUpperCase();
		return !q || (c.chart_name || "").toUpperCase().includes(q)
			|| (c.name || "").toUpperCase().includes(q);
	}

	function box(b, kind) {
		// one note for the whole bucket; a per-chart note only where it differs
		const shown = b.charts.filter(match);
		if (!shown.length) return "";
		const notes = shown.filter((c) => c.note);
		return `<div class="cg-b ${kind}">
			<span class="cnt">${shown.length === b.charts.length ? b.charts.length
				: shown.length + " / " + b.charts.length}</span>
			<div class="h">${esc(b.title)}</div>
			<div class="n">${esc(b.why)}</div>
			${chips(shown)}
			${notes.length ? `<div class="cg-why">${notes.map((c) =>
				`<b>${esc(c.chart_name)}</b> — ${esc(c.note)}`).join("<br>")}</div>` : ""}
		</div>`;
	}

	// every bucket the named chart sits in, gathered from what is already on the
	// page — the whole point is one answer, not a hunt through fifteen blocks
	function allBuckets() {
		const out = [];
		(D.problems || []).forEach((b) => out.push({ b, problem: true, group: __("Problem") }));
		(D.groups || []).forEach((g) => g.buckets.forEach((b) =>
			out.push({ b, problem: false, group: g.title })));
		return out;
	}

	function paintFocus(hits) {
		const all = allBuckets();
		root.find(".cg-focus").html(hits.map((c) => {
			const inb = all.filter((x) => x.b.charts.some((y) => y.name === c.name));
			return `<div class="cg-fc">
				<div class="h">${esc(c.chart_name)}</div>
				<div class="d">${esc(c.chart_date)}${c.age_days != null
					? " · " + __("{0} days old", [c.age_days]) : ""} · ${esc(c.name)}
					${inb.length ? " · " + __("in {0} bucket(s)", [inb.length]) : ""}</div>
				${inb.length
					? inb.map((x) => `<span class="tag ${x.problem ? "prob" : ""}"
						title="${esc(x.group)}">${esc(x.b.title)}</span>`).join("")
					: `<span class="none">${__("Nothing outstanding — this chart is in no bucket.")}</span>`}
				<div class="open" data-n="${esc(c.name)}">${__("Open this chart →")}</div>
			</div>`;
		}).join(""));
	}

	function paint() {
		if (!D) return;
		// searching narrows every bucket to the charts that match, and answers the
		// question up front for each one
		const q = Q.trim().toUpperCase();
		const seen = new Map();
		if (q) {
			allBuckets().forEach((x) => x.b.charts.forEach((c) => {
				if ((c.chart_name || "").toUpperCase().includes(q)
					|| (c.name || "").toUpperCase().includes(q)) seen.set(c.name, c);
			}));
			(D.clean || []).forEach((c) => {
				if ((c.chart_name || "").toUpperCase().includes(q)
					|| (c.name || "").toUpperCase().includes(q)) seen.set(c.name, c);
			});
		}
		root.find(".cg-clear").toggle(!!q);
		if (q) paintFocus([...seen.values()]); else root.find(".cg-focus").empty();
		root.find(".cg-kpis").html(`
			<div class="cg-kpi"><div class="k">${__("Active charts")}</div><div class="v">${D.total}</div></div>
			<div class="cg-kpi bad"><div class="k">${__("With a problem")}</div>
				<div class="v">${D.problem_charts}</div></div>
			<div class="cg-kpi ok"><div class="k">${__("Fully priced")}</div>
				<div class="v">${D.clean.length}</div></div>`);

		const P = [];
		const probBoxes = D.problems.map((b) => box(b, "prob")).join("");
		if (probBoxes) {
			P.push(`<div class="cg-sec">${__("Problems")}</div>
				<p class="cg-note">${__("these charts cannot bill a piece correctly as they stand")}</p>
				<div class="cg-grid">${probBoxes}</div>`);
		} else if (!q) {
			P.push(`<div class="cg-sec">${__("Problems")}</div>
				<div class="cg-empty">${__("Nothing broken — every active chart can bill a piece.")}</div>`);
		}
		// one heading per subject, its buckets underneath — a chart appears in
		// every bucket it belongs to, because each bucket is its own question
		(D.groups || []).forEach((g) => {
			const boxes = g.buckets.map((b) => box(b, "miss")).join("");
			if (!boxes) return;
			P.push(`<div class="cg-sec">${esc(g.title)}</div>
				<p class="cg-note">${esc(g.why)}</p>
				<div class="cg-grid">${boxes}</div>`);
		});
		const cleanShown = D.clean.filter(match);
		if (cleanShown.length) {
			P.push(`<div class="cg-sec">${__("Fully priced")}</div>
				<p class="cg-note">${__("making and diamonds both priced, nothing flagged")}</p>
				${chips(cleanShown)}`);
		}
		root.find(".cg-body").html(P.join(""));
	}

	root.on("input", ".cg-q", frappe.utils.debounce(function () { Q = this.value; paint(); }, 180));
	root.on("click", ".cg-clear", () => {
		Q = "";
		root.find(".cg-q").val("").focus();
		paint();
	});
	root.on("click", ".cg-fc .open", function () {
		frappe.route_options = { chart: $(this).data("n") };
		frappe.set_route("price-charts");
	});

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
