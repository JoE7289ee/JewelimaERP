// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Costing Board (Costing) — what each party pays us for the WORK, on one scale.
//
// A party pays for the work in one of two ways, and on paper they look nothing
// alike — which is why this was never visible before:
//
//   * a MAKING RATE: so many rupees a gram, a figure that stands still while
//     gold moves;
//   * a TOUCH: gold billed at a purity higher than the piece really is. 18K is
//     75% gold; billed at 80 touch the party pays for 80, and those 5 points
//     ARE the making charge — 5% of the day's gold rate.
//
// So a touch is a making charge quoted as a percentage instead of in rupees. It
// moves every morning with the board, which is what makes it worth watching: a
// party on 7 points earns us ₹7 more a gram for every ₹100 the board rises, and
// nobody has to agree anything.
//
// This page puts both on the same scale — rupees a gram, at one rate — and
// ranks the parties by it. The rate opens on the Thrissur 995 board with GST
// taken out, and stays editable: the feeds are for the eye, and a board rate is
// a decision somebody makes each morning, not a market fact.
// Route: /app/costing-board
frappe.pages["costing-board"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Costing Board"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const root = $(page.main);
	const S = { data: null, karat: "18K", rate: null, exGst: 1, quality: "", view: "making" };

	const inr = (v) => (v == null ? "—" : "₹" + Math.round(v).toLocaleString("en-IN"));
	const inr2 = (v) => (v == null ? "—" : "₹" + flt(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

	root.append(`
		<style>
		#page-costing-board .container{max-width:100%;}
		${jewelima.COST_CHART_CSS}
		.cb-rate{display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap;
			border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);
			padding:12px 16px;margin-bottom:14px;}
		.cb-rate .fld{display:flex;flex-direction:column;gap:3px;}
		.cb-rate label{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);}
		.cb-rate input[type=number]{width:130px;border:1px solid var(--border-color);border-radius:8px;
			height:32px;padding:2px 10px;font-size:15px;font-weight:800;text-align:right;
			background:var(--control-bg);color:var(--text-color);font-variant-numeric:tabular-nums;}
		.cb-board{font-size:12.5px;color:var(--text-muted);line-height:1.6;flex:1 1 260px;min-width:240px;}
		.cb-board b{color:var(--text-color);font-variant-numeric:tabular-nums;}
		.cb-board .err{color:#b45309;font-weight:700;}
		.cb-pills{display:flex;gap:6px;}
		.cb-pill{border:1px solid var(--border-color);background:var(--control-bg);color:var(--text-muted);
			border-radius:999px;padding:4px 14px;font-size:12.5px;cursor:pointer;font-weight:700;}
		.cb-pill.on{background:#1665A8;border-color:#1665A8;color:#fff;}
		[data-theme="dark"] .cb-pill.on{background:#3E92D8;border-color:#3E92D8;}
		.cb-chk{font-size:12.5px;display:flex;align-items:center;gap:6px;color:var(--text-muted);
			white-space:nowrap;padding-bottom:7px;}

		.cb-kpis{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;}
		.cb-kpi{flex:1 1 150px;border:1px solid var(--border-color);border-radius:11px;
			padding:10px 14px;background:var(--fg-color);}
		.cb-kpi .k{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);}
		.cb-kpi .v{font-size:23px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.3;}
		.cb-kpi .s{font-size:11px;color:var(--text-muted);}
		.cb-kpi.top{background:rgba(22,101,168,.08);border-color:rgba(22,101,168,.35);}
		.cb-kpi.top .v{color:#1665A8;font-size:19px;}
		[data-theme="dark"] .cb-kpi.top .v{color:#6FB4E8;}
		.cb-kpi.warn{border-left:3px solid #b45309;}
		.cb-kpi.warn .v{color:#b45309;}
		[data-theme="dark"] .cb-kpi.warn .v{color:#e8a24a;}

		.cb-card{border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);
			padding:14px 16px;margin-bottom:16px;}
		.cb-card h3{font-size:13px;margin:0 0 2px;font-weight:700;}
		.cb-card .sub{font-size:11.5px;color:var(--text-muted);margin:0 0 12px;}

		/* the ranking: one bar a party, the bar length is what they pay a gram */
		.cb-bars{display:flex;flex-direction:column;gap:5px;}
		.cb-bar{display:grid;grid-template-columns:150px 1fr 96px;gap:10px;align-items:center;
			font-size:12.5px;cursor:pointer;}
		.cb-bar:hover .nm{color:var(--primary);}
		.cb-bar .nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600;}
		.cb-bar .track{background:var(--control-bg);border-radius:6px;height:20px;position:relative;overflow:hidden;}
		.cb-bar .fill{height:100%;border-radius:6px;}
		.cb-bar .fill.touch{background:#1665A8;}
		.cb-bar .fill.rate{background:#9AA7B4;}
		[data-theme="dark"] .cb-bar .fill.touch{background:#3E92D8;}
		[data-theme="dark"] .cb-bar .fill.rate{background:#6B7785;}
		.cb-bar .amt{text-align:right;font-weight:800;font-variant-numeric:tabular-nums;}
		.cb-bar .med{position:absolute;top:0;bottom:0;width:2px;background:var(--text-muted);opacity:.55;}
		.cb-legend{display:flex;gap:16px;font-size:11.5px;color:var(--text-muted);margin-top:11px;flex-wrap:wrap;}
		.cb-legend i{width:10px;height:10px;border-radius:3px;display:inline-block;margin-right:5px;}

		.cb-tw{overflow-x:auto;}
		table.cb-t{width:100%;border-collapse:collapse;font-size:12.5px;background:var(--fg-color);
			font-variant-numeric:tabular-nums;}
		table.cb-t th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em;
			color:var(--text-muted);padding:8px 10px;background:var(--control-bg);
			border-bottom:1px solid var(--border-color);white-space:nowrap;}
		table.cb-t td{padding:7px 10px;border-bottom:1px solid var(--border-color);vertical-align:top;}
		table.cb-t td.num,table.cb-t th.num{text-align:right;white-space:nowrap;}
		table.cb-t tbody tr{cursor:pointer;}
		table.cb-t tbody tr:hover{background:var(--control-bg);}
		.cb-way{font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;
			border-radius:9px;padding:1px 8px;white-space:nowrap;}
		.cb-way.touch{background:rgba(22,101,168,.13);color:#1665A8;}
		.cb-way.rate{background:var(--control-bg);color:var(--text-muted);}
		.cb-way.none{background:rgba(180,83,9,.12);color:#b45309;}
		[data-theme="dark"] .cb-way.touch{color:#6FB4E8;}
		.cb-how{font-size:11px;color:var(--text-muted);}
		.cb-warn{border:1px solid #e6c98f;background:#fdf9f1;color:#8a5a00;border-radius:10px;
			padding:10px 14px;font-size:12.5px;margin-bottom:14px;}
		[data-theme="dark"] .cb-warn{background:rgba(180,83,9,.12);border-color:rgba(180,83,9,.5);color:#e8a24a;}
		.cb-empty{padding:30px;text-align:center;color:var(--text-muted);font-size:13px;}
		</style>
		<div class="cb-rate"></div>
		<div class="cb-kpis"></div>
		<div class="cb-body"></div>`);

	// ---- the rate strip -------------------------------------------------------
	function paintRate() {
		const d = S.data;
		if (!d) return;
		const b = d.board || {};
		root.find(".cb-rate").html(`
			<div class="fld">
				<label>${__("Karat")}</label>
				<div class="cb-pills">${(d.karats || []).map((k) =>
					`<span class="cb-pill ${k === S.karat ? "on" : ""}" data-k="${esc(k)}">${esc(k)}</span>`).join("")}</div>
			</div>
			<div class="fld">
				<label>${__("Gold rate / g")}</label>
				<input type="number" class="cb-ratebox" step="1" min="0" value="${d.base || ""}">
			</div>
			<label class="cb-chk"><input type="checkbox" class="cb-exgst" ${d.ex_gst ? "checked" : ""}>
				${__("GST out")}</label>
			<div class="cb-board">
				${b.error
					? `<span class="err">${esc(b.error)}</span>`
					: `${esc(b.line || "")}${b.of ? " · " + esc(b.of) : ""} <b>${inr2(b.quoted)}</b>
						${b.net != null ? `&nbsp;·&nbsp; ${__("less {0}% GST", [b.gst_percent])} <b>${inr2(b.net)}</b>` : ""}
						${b.pure_net != null ? `<br>${__("that is 995 metal — pure gold is")}
							<a class="cb-usepure" href="#" data-v="${b.pure_net}"><b>${inr2(b.pure_net)}</b></a>` : ""}
						${b.as_of ? `<br><span style="font-size:11px;">${__("read")} ${esc(b.as_of)}</span>` : ""}`}
				${d.overridden ? `<br><span style="font-size:11px;">${__("priced at a rate you typed, not the board")}</span>` : ""}
			</div>`);
	}

	// ---- the tiles ------------------------------------------------------------
	function paintKpis() {
		const d = S.data;
		const k = (d && d.kpis) || {};
		const tile = (key, val, sub, cls) =>
			`<div class="cb-kpi ${cls || ""}"><div class="k">${key}</div><div class="v">${val}</div>
				<div class="s">${sub || "&nbsp;"}</div></div>`;
		root.find(".cb-kpis").html(
			tile(__("Pays us most"), esc(k.top || "—"), inr2(k.top_per_g) + __(" a gram"), "top") +
			tile(__("Middle of the book"), inr(k.median), __("{0} parties priced", [k.priced || 0])) +
			tile(__("Lowest"), inr(k.bottom_per_g), esc(k.bottom || "—")) +
			tile(__("One touch point"), inr2(k.point_value), __("a gram, at this rate")) +
			tile(__("On a touch"), k.on_touch || 0, __("{0} on a fixed rate", [k.on_rate || 0])) +
			((k.silent || k.no_active)
				? tile(__("To check"), (k.silent || 0) + (k.no_active || 0), __("see below"), "warn")
				: ""));
	}

	// ---- the ranking ----------------------------------------------------------
	function ranking() {
		const d = S.data;
		const rows = (d.ranked || []);
		if (!rows.length) {
			return `<div class="cb-card"><div class="cb-empty">${
				__("No active chart prices {0} work yet.", [esc(S.karat)])}</div></div>`;
		}
		const hi = Math.max(...rows.map((r) => flt(r.per_g))) || 1;
		const med = flt((d.kpis || {}).median);
		return `<div class="cb-card">
			<h3>${__("What each party pays for the work")}</h3>
			<div class="sub">${__("{0}, rupees a gram, at {1} a gram", [esc(S.karat), inr2(d.base)])}</div>
			<div class="cb-bars">${rows.map((r) => `
				<div class="cb-bar" data-n="${esc(r.name)}" title="${esc(r.how || "")}">
					<div class="nm">${esc(r.label)}</div>
					<div class="track">
						<div class="fill ${r.moves_with_gold ? "touch" : "rate"}"
							style="width:${Math.max(1, (flt(r.per_g) / hi) * 100)}%"></div>
						${med ? `<div class="med" style="left:${(med / hi) * 100}%"></div>` : ""}
					</div>
					<div class="amt">${inr(r.per_g)}</div>
				</div>`).join("")}</div>
			<div class="cb-legend">
				<span><i style="background:#1665A8;"></i>${__("on a touch — moves with gold")}</span>
				<span><i style="background:#9AA7B4;"></i>${__("on a fixed rate")}</span>
				${med ? `<span><i style="background:var(--text-muted);width:2px;height:11px;border-radius:0;"></i>${
					__("the middle, {0}", [inr(med)])}</span>` : ""}
			</div>
		</div>`;
	}

	// ---- the table ------------------------------------------------------------
	function table() {
		const d = S.data;
		const med = flt((d.kpis || {}).median);
		const wayLabel = { touch: __("touch"), rate: __("rate"), percent: __("% of gold"),
			piece: __("per piece"), "": __("nothing") };
		const rows = (d.rows || []).map((r) => {
			const way = r.via || "";
			const vs = (r.per_g != null && med) ? flt(r.per_g) - med : null;
			return `<tr data-n="${esc(r.name)}">
				<td class="num">${r.rank || "—"}</td>
				<td><b>${esc(r.label)}</b>${r.age_days != null
					? `<div class="cb-how">${__("dated {0} · {1}d old", [esc(r.chart_date), r.age_days])}</div>` : ""}</td>
				<td><span class="cb-way ${way === "touch" || way === "percent" ? "touch" : (way ? "rate" : "none")}">${
					esc(wayLabel[way] || way)}</span></td>
				<td class="cb-how">${esc(r.how || "")}</td>
				<td class="num"><b>${r.per_g != null ? inr(r.per_g) : (r.per_piece ? inr(r.per_piece) + "/pc" : "—")}</b></td>
				<td class="num">${vs == null ? "—"
					: (vs >= 0 ? "+" : "") + inr(vs)}</td>
				<td class="num">${r.moves_with_gold ? "+" + inr2(r.per_100) : "—"}</td>
			</tr>`;
		}).join("");
		return `<div class="cb-card">
			<h3>${__("Every active chart")}</h3>
			<div class="sub">${__("the last column is what a ₹100 move in the board does to their making")}</div>
			<div class="cb-tw"><table class="cb-t">
				<thead><tr>
					<th class="num">#</th><th>${__("Party")}</th><th>${__("Paid as")}</th>
					<th>${__("Worked out")}</th><th class="num">${__("A gram")}</th>
					<th class="num">${__("vs middle")}</th><th class="num">${__("per ₹100")}</th>
				</tr></thead><tbody>${rows}</tbody>
			</table></div>
		</div>`;
	}

	// ---- what is wrong, if anything -------------------------------------------
	function checks() {
		const d = S.data;
		const out = [];
		if ((d.silent || []).length) {
			out.push(__("Prices neither making nor a touch, so a piece would bill on its stones alone: {0}",
				[d.silent.map(esc).join(", ")]));
		}
		if ((d.no_active || []).length) {
			out.push(__("No active chart, so nothing can be sold to them: {0}",
				[d.no_active.map(esc).join(", ")]));
		}
		return out.length ? `<div class="cb-warn">${out.join("<br>")}</div>` : "";
	}

	// ---- the stones, which are drawn nowhere else ------------------------------
	function stones() {
		const d = S.data;
		const quals = Object.keys(d.curves || {});
		if (!quals.length) return "";
		if (!S.quality || !quals.includes(S.quality)) S.quality = quals[0];
		return `<div class="cb-card">
			<h3>${__("Diamond rates")}</h3>
			<div class="sub">${__("rate against the weight a bracket starts at — the other half of what a party pays")}</div>
			<div class="cb-pills" style="margin-bottom:11px;">${quals.map((q) =>
				`<span class="cb-pill cb-q ${q === S.quality ? "on" : ""}" data-q="${esc(q)}">${esc(q)}</span>`).join("")}</div>
			<div class="cb-curve"></div>
		</div>`;
	}

	function drawCurve() {
		const d = S.data;
		const host = root.find(".cb-curve");
		if (!host.length) return;
		const series = (d.curves || {})[S.quality] || [];
		// the helper takes the bracket rows as they are — from_ct / to_ct / rate
		jewelima.costStepChart(host.get(0), {
			series: series.map((s) => ({ name: s.label, points: s.points })),
			empty: __("No chart prices {0} yet.", [esc(S.quality)]),
		});
	}

	function paint() {
		if (!S.data) return;
		paintRate();
		paintKpis();
		root.find(".cb-body").html(checks() + ranking() + table() + stones());
		drawCurve();
	}

	// ---- events ---------------------------------------------------------------
	root.on("click", ".cb-pill[data-k]", function () {
		S.karat = $(this).data("k");
		load();
	});
	root.on("click", ".cb-q", function () {
		S.quality = $(this).data("q");
		root.find(".cb-q").removeClass("on");
		this.classList.add("on");
		drawCurve();
	});
	root.on("change", ".cb-exgst", function () {
		S.exGst = this.checked ? 1 : 0;
		S.rate = null;                 // back to the board, read the other way
		load();
	});
	root.on("click", ".cb-usepure", function (e) {
		e.preventDefault();
		S.rate = flt($(this).data("v")) || null;
		load();
	});
	root.on("change", ".cb-ratebox", function () {
		S.rate = flt(this.value) || null;
		load();
	});
	root.on("click", ".cb-bar,table.cb-t tbody tr", function () {
		const n = $(this).data("n");
		if (n) frappe.set_route("costing-chart", n);
	});

	function load() {
		const args = { karat: S.karat, ex_gst: S.exGst };
		if (S.rate) args.gold_rate = S.rate;
		return frappe.call({ method: API + ".get_costing_board", args, freeze: false })
			.then((r) => { S.data = r.message; paint(); });
	}

	page.set_primary_action(__("Refresh"), () => { S.rate = null; load(); }, "refresh");
	page.add_inner_button(__("Chart Gaps"), () => frappe.set_route("chart-gaps"));
	page.add_inner_button(__("Board Rate"), () => frappe.set_route("board-rate"));

	frappe.pages["costing-board"].on_page_show = () => { if (S.data) load(); };
	load();
};
