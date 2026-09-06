// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Costing Board (Costing) — every price chart read as a set.
//
// The question this page answers is comparative, not per-chart: what have we
// agreed with whom, and where does one party sit against the others. So the
// numbers that differ between charts get drawn — touch by karat, making by
// karat, the diamond curve.
//
// A chart is NOT meant to be complete. One party buys EF stones on a touch and
// nothing else; another is making charge only. So the coverage grid says what
// each chart PRICES, as a shape to recognise — never a list of what it lacks.
// Only a genuine mistake (a stone size falling between two brackets, a rule
// that charges nothing, a party with no Active chart) is called a check.
// Route: /app/costing-board

frappe.pages["costing-board"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Costing Board"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const root = $(page.main);
	const S = { data: null, quality: "", onlyActive: true };

	const inr = (v) => (v == null ? "—" : "₹" + Math.round(v).toLocaleString("en-IN"));
	const pct = (v) => (v == null ? "—" : flt(v).toFixed(v % 1 ? 1 : 0) + "%");

	root.append(`
		<style>
		#page-costing-board .container{max-width:100%;}
		${jewelima.COST_CHART_CSS}
		.cb-head{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:14px;}
		.cb-note{font-size:12.5px;color:var(--text-muted);}
		.cb-kpis{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;}
		.cb-kpi{flex:1 1 130px;border:1px solid var(--border-color);border-radius:11px;
			padding:10px 14px;background:var(--fg-color);}
		.cb-kpi .k{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);}
		.cb-kpi .v{font-size:24px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.25;}
		/* a gap count is a state, not another measure — it gets the warning colour
		   and a word, never colour alone */
		.cb-kpi.warn{border-left:3px solid #b45309;}
		.cb-kpi.warn .v{color:#b45309;}
		[data-theme="dark"] .cb-kpi.warn .v{color:#e8a24a;}
		.cb-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:16px;margin-bottom:18px;}
		.cb-card{border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);padding:14px 16px;}
		.cb-card h3{font-size:13px;margin:0 0 2px;font-weight:700;}
		.cb-card .sub{font-size:11.5px;color:var(--text-muted);margin:0 0 12px;}
		.cb-card.wide{grid-column:1/-1;}
		.cb-tools{display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap;}
		.cb-tools select{border:1px solid var(--border-color);border-radius:7px;height:28px;padding:2px 8px;
			font-size:12.5px;background:var(--control-bg);color:var(--text-color);}
		.cb-tw{overflow-x:auto;}
		table.cb-t{width:100%;border-collapse:collapse;font-size:12.5px;background:var(--fg-color);
			border:1px solid var(--border-color);border-radius:11px;overflow:hidden;
			font-variant-numeric:tabular-nums;}
		table.cb-t th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em;
			color:var(--text-muted);padding:8px 10px;background:var(--control-bg);
			border-bottom:1px solid var(--border-color);white-space:nowrap;}
		table.cb-t td{padding:7px 10px;border-bottom:1px solid var(--border-color);vertical-align:top;}
		table.cb-t td.num{text-align:right;}
		table.cb-t tr.sup td{color:var(--text-muted);}
		table.cb-t tr.clickable{cursor:pointer;}
		table.cb-t tr.clickable:hover td{background:rgba(128,128,128,.06);}
		.cb-nm{font-weight:800;font-size:13px;}
		.cb-swatch{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:7px;vertical-align:1px;}
		.pill{display:inline-block;border-radius:9px;padding:1px 8px;font-size:10px;font-weight:800;
			letter-spacing:.04em;text-transform:uppercase;}
		.pill.act{background:rgba(29,122,51,.14);color:#1d7a33;}
		.pill.sup{background:rgba(128,128,128,.16);color:var(--text-muted);}
		[data-theme="dark"] .pill.act{color:#6fbf7f;}
		.gap{display:inline-block;background:rgba(180,83,9,.13);color:#b45309;border-radius:8px;
			padding:0 7px;font-size:10.5px;font-weight:700;margin:1px 3px 1px 0;white-space:nowrap;}
		[data-theme="dark"] .gap{color:#e8a24a;background:rgba(180,83,9,.24);}
		.ok{color:#1d7a33;font-size:11.5px;font-weight:700;}
		[data-theme="dark"] .ok{color:#6fbf7f;}
		.cb-empty{padding:32px;text-align:center;color:var(--text-muted);}
		table.cb-t th.mid,table.cb-t td.mid{text-align:center;}
		/* coverage reads as presence, so the filled cell is quiet and the empty one
		   is quieter still — neither is a warning */
		.cov{display:inline-block;border-radius:8px;padding:1px 9px;font-size:10.5px;font-weight:700;}
		.cov.on{background:rgba(22,101,168,.13);color:#1665A8;}
		.cov.alt{background:rgba(154,117,0,.15);color:#8a6a00;}
		.cov.off{color:var(--text-muted);opacity:.55;}
		[data-theme="dark"] .cov.on{color:#7FB3DA;background:rgba(62,146,216,.18);}
		[data-theme="dark"] .cov.alt{color:#C8A43C;background:rgba(166,126,12,.22);}
		.cb-flag{border:1px solid #b45309;border-left:4px solid #b45309;border-radius:9px;
			background:rgba(180,83,9,.09);color:#b45309;font-size:12.5px;padding:9px 13px;margin-bottom:14px;}
		[data-theme="dark"] .cb-flag{color:#e8a24a;background:rgba(180,83,9,.2);}
		</style>
		<div class="cb-head">
			<label class="cb-note"><input type="checkbox" class="cb-active" checked>
				${__("active charts only")}</label>
			<span class="cb-note cb-count"></span>
		</div>
		<div class="cb-kpis"></div>
		<div class="cb-noactive"></div>
		<div class="cb-card" style="margin-bottom:16px;">
			<h3>${__("What each chart prices")}</h3>
			<p class="sub">${__("charts differ by design — a party we only sell stones to has no making rule, and that is not a gap")}</p>
			<div class="cb-tw"><div class="cb-cover"></div></div>
		</div>
		<div class="cb-grid">
			<div class="cb-card">
				<h3>${__("Gold touch by karat")}</h3>
				<p class="sub">${__("% of the 24K board rate each chart bills its gold at")}</p>
				<div class="cb-touch"></div>
			</div>
			<div class="cb-card">
				<h3>${__("Making charge by karat")}</h3>
				<p class="sub">${__("lowest ₹ per gram each chart charges at that karat")}</p>
				<div class="cb-making"></div>
			</div>
			<div class="cb-card wide">
				<h3>${__("Diamond rate by stone size")}</h3>
				<p class="sub">${__("₹ per carat across the brackets — a rate holds until the next bracket starts")}</p>
				<div class="cb-tools"><label class="cb-note">${__("Quality")}</label>
					<select class="cb-qual"></select></div>
				<div class="cb-dmd"></div>
			</div>
		</div>
		<div class="cb-tw"><div class="cb-table"></div></div>
	`);

	function paintKpis(k) {
		root.find(".cb-kpis").html(`
			<div class="cb-kpi"><div class="k">${__("Charts")}</div><div class="v">${k.charts}</div></div>
			<div class="cb-kpi"><div class="k">${__("Active")}</div><div class="v">${k.active}</div></div>
			<div class="cb-kpi"><div class="k">${__("Superseded")}</div><div class="v">${k.superseded}</div></div>
			<div class="cb-kpi"><div class="k">${__("Billing on a touch")}</div>
				<div class="v">${k.on_touch}<span style="font-size:13px;color:var(--text-muted);"> / ${k.active}</span></div></div>
			<div class="cb-kpi ${k.to_check ? "warn" : ""}"><div class="k">${__("To check")}</div>
				<div class="v">${k.to_check}</div></div>`);
		root.find(".cb-noactive").html((S.data.no_active || []).length
			? `<div class="cb-flag"><b>${__("No active chart")}</b> — ${
				__("{0} cannot be priced on the Sell page until one of its charts is made Active.",
					[S.data.no_active.map(esc).join(", ")])}</div>`
			: "");
	}

	const shown = () => (S.data.rows || []).filter((r) => !S.onlyActive || r.status === "Active");

	function paintCharts() {
		const rows = shown();
		const keys = rows.map((r) => r.name);
		const names = rows.map((r) => r.label);
		const K = S.data.karats;

		jewelima.costDotPlot(root.find(".cb-touch"), {
			title: __("Gold touch by karat"), series: names, fmt: (v) => pct(v),
			empty: __("No chart carries a touch yet — every one bills at the rate typed on Sell."),
			rows: K.map((k) => ({ label: k,
				values: rows.map((r) => ({ series: r.label, value: r.touch[k] })) })),
		});

		jewelima.costDotPlot(root.find(".cb-making"), {
			title: __("Making by karat"), series: names, fmt: (v) => inr(v),
			empty: __("No karat-specific making rule on these charts."),
			rows: K.map((k) => ({ label: k,
				values: rows.map((r) => ({ series: r.label, value: r.making_by_karat[k] })) })),
		});

		const curves = S.data.curves || {};
		const quals = Object.keys(curves);
		const $q = root.find(".cb-qual");
		if (!quals.includes(S.quality)) S.quality = quals[0] || "";
		$q.html(quals.map((q) => `<option ${q === S.quality ? "selected" : ""}>${esc(q)}</option>`).join("")
			|| `<option>${__("—")}</option>`);
		const series = (curves[S.quality] || [])
			.filter((s) => keys.includes(s.chart))
			// the hue must follow the chart, not its position in this filtered list
			.map((s) => ({ name: s.label, points: s.points, i: keys.indexOf(s.chart) }))
			.sort((a, b) => a.i - b.i);
		jewelima.costStepChart(root.find(".cb-dmd"), {
			title: __("Diamond ₹/ct"), series,
			empty: __("No diamond brackets at this quality."),
		});
	}

	function paintCover() {
		const rows = shown();
		const comps = S.data.components || [];
		const hues = jewelima.costHues();
		root.find(".cb-cover").html(!rows.length ? "" : `
			<table class="cb-t cb-cov"><thead><tr><th>${__("Chart")}</th>
				${comps.map((c) => `<th class="mid">${esc(c.label)}</th>`).join("")}
			</tr></thead><tbody>${rows.map((r, i) => `<tr class="clickable" data-n="${esc(r.name)}">
				<td><span class="cb-swatch" style="background:${hues[i % hues.length]}"></span>
					<span class="cb-nm">${esc(r.label)}</span></td>
				${comps.map((c) => {
					const v = (r.covers || {})[c.key];
					if (c.key === "gold") {
						// gold is always priced; what differs is HOW, so the cell says which
						return v === "touch"
							? `<td class="mid"><span class="cov on">${__("touch")}</span></td>`
							: `<td class="mid"><span class="cov alt">${__("typed rate")}</span></td>`;
					}
					return v ? `<td class="mid"><span class="cov on">${__("yes")}</span></td>`
						: `<td class="mid"><span class="cov off">${__("—")}</span></td>`;
				}).join("")}
			</tr>`).join("")}</tbody></table>`);
	}

	function paintTable() {
		const rows = shown();
		const hues = jewelima.costHues();
		const all = rows.map((r) => r.name);
		root.find(".cb-count").text(__("{0} chart(s) shown", [rows.length]));
		root.find(".cb-table").html(!rows.length
			? `<div class="cb-empty">${__("No price charts yet.")}</div>`
			: `<table class="cb-t"><thead><tr>
				<th>${__("Chart")}</th><th>${__("Dated")}</th>
				<th class="num">14K</th><th class="num">18K</th><th class="num">22K</th>
				<th class="num">${__("Making ₹/g")}</th><th class="num">${__("Diamond ₹/ct")}</th>
				<th class="num">${__("Hallmark")}</th><th>${__("Stones")}</th><th>${__("To check")}</th>
			</tr></thead><tbody>${rows.map((r) => {
				const i = all.indexOf(r.name);
				const bk = r.bucket_rows || {};
				const stones = [r.ps_rows ? `PS ${r.ps_rows}` : "", bk.cs ? `CS ${bk.cs}` : "",
					bk.cz ? `CZ ${bk.cz}` : "", bk.cvd ? `CVD ${bk.cvd}` : "", bk.sw ? `SW ${bk.sw}` : ""]
					.filter(Boolean).join(" · ") || "—";
				const mk = r.making_min == null ? (r.making_flat ? inr(r.making_flat) : "—")
					: (r.making_min === r.making_max ? inr(r.making_min)
						: `${inr(r.making_min)}–${inr(r.making_max)}`);
				const dm = r.dmd_min == null ? "—"
					: (r.dmd_min === r.dmd_max ? inr(r.dmd_min) : `${inr(r.dmd_min)}–${inr(r.dmd_max)}`);
				return `<tr class="clickable ${r.status === "Active" ? "" : "sup"}" data-n="${esc(r.name)}">
					<td><span class="cb-swatch" style="background:${hues[i % hues.length]}"></span>
						<span class="cb-nm">${esc(r.label)}</span>
						<span class="pill ${r.status === "Active" ? "act" : "sup"}">${esc(r.status)}</span></td>
					<td>${esc(r.chart_date)}${r.age_days != null
						? `<div style="font-size:11px;color:var(--text-muted);">${
							__("{0}d old", [r.age_days])}</div>` : ""}</td>
					<td class="num">${pct(r.touch["14K"])}</td>
					<td class="num">${pct(r.touch["18K"])}</td>
					<td class="num">${pct(r.touch["22K"])}</td>
					<td class="num">${mk}<div style="font-size:11px;color:var(--text-muted);">${
						__("{0} rule(s)", [r.making_rules])}</div></td>
					<td class="num">${dm}<div style="font-size:11px;color:var(--text-muted);">${
						__("{0} bracket(s)", [r.dmd_brackets])}</div></td>
					<td class="num">${inr(r.hallmark)}</td>
					<td>${esc(stones)}</td>
					<td>${r.checks.length
						? r.checks.map((g) => `<span class="gap">${esc(g)}</span>`).join("")
						: `<span class="ok">${__("nothing to check")}</span>`}</td>
				</tr>`;
			}).join("")}</tbody></table>`);
	}

	function paint() { paintKpis(S.data.kpis); paintCover(); paintCharts(); paintTable(); }

	function load() {
		return frappe.call({ method: API + ".get_costing_board", freeze: false }).then((r) => {
			S.data = r.message || { rows: [], curves: {}, karats: [], kpis: {} };
			paint();
		});
	}

	root.on("change", ".cb-active", function () { S.onlyActive = this.checked; paint(); });
	root.on("change", ".cb-qual", function () { S.quality = this.value; paintCharts(); });
	root.on("click", "table.cb-t tr.clickable", function () {
		frappe.set_route("costing-chart", $(this).data("n"));
	});

	page.set_primary_action(__("Refresh"), load, "refresh");
	frappe.pages["costing-board"].on_page_show = load;
	load();
};
