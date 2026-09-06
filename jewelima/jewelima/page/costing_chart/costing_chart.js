// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Chart Detail (Costing) — one price chart, in full.
//
// The board answers "how do our charts compare"; this answers "what exactly did
// we agree with this party". Everything the chart holds is here in the order a
// bill is built: gold, then making, then stones, then charges, then terms — so
// reading down the page is reading a bill being priced.
//
// A section the chart does not price says so plainly and stays quiet: charts are
// partial by design, and an empty Precious Stones table is a fact about this
// party, not a fault. Only a real inconsistency is called out at the top.
// Route: /app/costing-chart  (or /app/costing-chart/PCH-0001)

frappe.pages["costing-chart"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Chart Detail"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const root = $(page.main);
	const S = { list: [], c: null, quality: "" };

	const inr = (v) => (v ? "₹" + Math.round(v).toLocaleString("en-IN") : "—");
	const inr2 = (v) => (v ? "₹" + flt(v).toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—");
	const ct = (v) => (v ? flt(v).toFixed(3) : "");

	root.append(`
		<style>
		#page-costing-chart .container{max-width:1180px;}
		${jewelima.COST_CHART_CSS}
		.cd-bar{display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap;margin-bottom:16px;
			border:1px solid var(--border-color);border-radius:13px;padding:13px 16px;background:var(--fg-color);}
		.cd-bar label{display:block;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;
			color:var(--text-muted);margin-bottom:3px;}
		.cd-bar select{border:1px solid var(--border-color);border-radius:8px;height:34px;padding:2px 10px;
			font-size:14px;font-weight:600;background:var(--control-bg);color:var(--text-color);min-width:230px;}
		.cd-id{margin-left:auto;text-align:right;}
		.cd-id .nm{font-size:20px;font-weight:800;line-height:1.2;}
		.cd-id .meta{font-size:12px;color:var(--text-muted);}
		.pill{display:inline-block;border-radius:9px;padding:1px 9px;font-size:10.5px;font-weight:800;
			letter-spacing:.04em;text-transform:uppercase;}
		.pill.act{background:rgba(29,122,51,.14);color:#1d7a33;}
		.pill.sup{background:rgba(128,128,128,.16);color:var(--text-muted);}
		[data-theme="dark"] .pill.act{color:#6fbf7f;}
		.cd-gaps{margin-bottom:14px;}
		.gap{display:inline-block;background:rgba(180,83,9,.13);color:#b45309;border-radius:8px;
			padding:2px 9px;font-size:12px;font-weight:700;margin:0 5px 5px 0;}
		[data-theme="dark"] .gap{color:#e8a24a;background:rgba(180,83,9,.24);}
		.cd-sec{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;
			color:var(--text-muted);margin:22px 0 9px;padding-bottom:5px;border-bottom:1px solid var(--border-color);}
		.cd-touch{display:flex;gap:10px;flex-wrap:wrap;}
		/* the touch is THE number a costing desk looks for, so it is a tile, not a row */
		.cd-tile{flex:1 1 150px;border:1px solid var(--border-color);border-radius:11px;padding:11px 15px;
			background:var(--fg-color);}
		.cd-tile.on{border-left:3px solid #9A7500;}
		[data-theme="dark"] .cd-tile.on{border-left-color:#A67E0C;}
		.cd-tile .k{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);}
		.cd-tile .v{font-size:26px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.2;}
		.cd-tile .n{font-size:11.5px;color:var(--text-muted);}
		.cd-tile.off .v{color:var(--text-muted);font-size:17px;}
		.cd-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;}
		.cd-card{border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);padding:14px 16px;}
		.cd-card h3{font-size:13px;margin:0 0 2px;font-weight:700;}
		.cd-card .sub{font-size:11.5px;color:var(--text-muted);margin:0 0 12px;}
		.cd-tw{overflow-x:auto;}
		table.cd-t{width:100%;border-collapse:collapse;font-size:12.5px;font-variant-numeric:tabular-nums;}
		table.cd-t th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em;
			color:var(--text-muted);padding:6px 9px;border-bottom:1px solid var(--border-color);white-space:nowrap;}
		table.cd-t td{padding:6px 9px;border-bottom:1px solid var(--border-color);}
		table.cd-t td.num{text-align:right;}
		.k-chip{display:inline-block;background:var(--control-bg);border:1px solid var(--border-color);
			border-radius:7px;padding:0 7px;font-size:10.5px;font-weight:800;}
		.cd-tools{display:flex;gap:8px;align-items:center;margin-bottom:10px;}
		.cd-tools select{height:26px;min-width:auto;font-size:12px;font-weight:400;}
		.cd-none{padding:20px;text-align:center;color:var(--text-muted);font-size:12.5px;}
		.cd-covers{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:4px;}
		.cov{display:inline-block;border-radius:9px;padding:2px 10px;font-size:11.5px;font-weight:700;}
		.cov.on{background:rgba(22,101,168,.13);color:#1665A8;}
		.cov.off{background:var(--control-bg);color:var(--text-muted);opacity:.7;}
		[data-theme="dark"] .cov.on{color:#7FB3DA;background:rgba(62,146,216,.18);}
		.cd-terms{font-size:12.5px;white-space:pre-wrap;color:var(--text-muted);line-height:1.55;}
		.cd-hist{display:flex;gap:7px;flex-wrap:wrap;font-size:11.5px;}
		.cd-hist a{border:1px solid var(--border-color);border-radius:8px;padding:2px 9px;color:var(--text-color);}
		.cd-hist a.on{border-color:var(--primary);font-weight:700;}
		</style>
		<div class="cd-bar">
			<div><label>${__("Price chart")}</label><select class="cd-pick"></select></div>
			<div class="cd-id"></div>
		</div>
		<div class="cd-gaps"></div>
		<div class="cd-body"></div>
	`);

	function tableOr(rows, head, body, empty) {
		return rows.length
			? `<div class="cd-tw"><table class="cd-t"><thead><tr>${head}</tr></thead>
				<tbody>${rows.map(body).join("")}</tbody></table></div>`
			: `<div class="cd-none">${empty}</div>`;
	}

	function paint() {
		const c = S.c;
		root.find(".cd-pick").html(S.list.map((x) =>
			`<option value="${esc(x.name)}" ${x.name === (c && c.name) ? "selected" : ""}>${
				esc(x.chart_name)} — ${esc(x.chart_date)}${x.status === "Active" ? "" : " (superseded)"}</option>`).join(""));
		if (!c) { root.find(".cd-body").html(`<div class="cd-none">${__("No price charts yet.")}</div>`); return; }

		root.find(".cd-id").html(`<div class="nm">${esc(c.chart_name)}
			<span class="pill ${c.status === "Active" ? "act" : "sup"}">${esc(c.status)}</span></div>
			<div class="meta">${esc(c.chart_date)}${c.age_days != null
				? " · " + __("{0} days old", [c.age_days]) : ""} · ${esc(c.name)}</div>`);
		root.find(".cd-gaps").html(c.checks.length
			? c.checks.map((g) => `<span class="gap">${__("Check")}: ${esc(g)}</span>`).join("")
			: "");

		const K = ["14K", "18K", "22K"];
		const touch = K.map((k) => {
			const t = c.touch[k];
			return `<div class="cd-tile ${t ? "on" : "off"}"><div class="k">${k} ${__("touch")}</div>
				<div class="v">${t ? flt(t).toFixed(t % 1 ? 1 : 0) + "%" : __("not set")}</div>
				<div class="n">${t ? __("board × {0}% = the ₹/g billed", [flt(t)])
					: __("bills at the rate typed on Sell")}</div></div>`;
		}).join("");

		const mk = tableOr(c.making,
			`<th>${__("Karat")}</th><th>${__("Design type")}</th><th>${__("Basis")}</th>
			 <th class="num">${__("Rate")}</th><th class="num">${__("Minimum")}</th><th class="num">${__("Flat below")}</th>`,
			(r) => `<tr>
				<td>${r.karat ? `<span class="k-chip">${esc(r.karat)}</span>` : `<span style="color:var(--text-muted)">${__("any")}</span>`}</td>
				<td>${esc(r.design_type || r.charge_category || "") || `<span style="color:var(--text-muted)">${__("DEFAULT")}</span>`}</td>
				<td>${esc(r.basis)}</td>
				<td class="num">${r.rate ? inr2(r.rate) + (r.basis === "Per Gram" ? "/g" : r.basis === "Per Piece" ? "/pc" : "%") : "—"}</td>
				<td class="num">${inr(r.min_per_piece)}</td>
				<td class="num">${r.flat_below_gm ? flt(r.flat_below_gm).toFixed(3) + " g" : "—"}</td></tr>`,
			__("Making is not priced on this chart — it is asked for on the bill."));

		const quals = [...new Set(c.diamond.map((d) => d.quality || "—"))];
		if (!quals.includes(S.quality)) S.quality = quals[0] || "";
		const dmdRows = c.diamond.filter((d) => (d.quality || "—") === S.quality);
		const dmdTable = tableOr(dmdRows,
			`<th>${__("Sieve")}</th><th class="num">${__("From ct")}</th><th class="num">${__("Below ct")}</th>
			 <th class="num">${__("₹ per ct")}</th>`,
			(r) => `<tr><td>${esc(r.sieve || "—")}</td><td class="num">${ct(r.from_ct) || "0"}</td>
				<td class="num">${ct(r.to_ct) || "▸"}</td><td class="num">${inr(r.rate)}</td></tr>`,
			__("Diamonds are not priced on this chart."));

		const ps = tableOr(c.precious,
			`<th>${__("Stone")}</th><th class="num">${__("From ct")}</th><th class="num">${__("Below ct")}</th><th class="num">${__("₹ per ct")}</th>`,
			(r) => `<tr><td>${esc(r.stone)}</td><td class="num">${ct(r.from_ct) || "0"}</td>
				<td class="num">${ct(r.to_ct) || "▸"}</td><td class="num">${inr(r.rate)}</td></tr>`,
			__("Precious stones are not priced on this chart."));

		const bnames = { cs: __("Colour stone"), cz: __("CZ"), cvd: __("CVD"), sw: __("Swarovski") };
		const bk = Object.keys(bnames).flatMap((k) => (c.buckets[k] || []).map((r) => ({ ...r, b: bnames[k] })));
		const buckets = tableOr(bk,
			`<th>${__("Bucket")}</th><th class="num">${__("From ct")}</th><th class="num">${__("Below ct")}</th>
			 <th>${__("Basis")}</th><th class="num">${__("Rate")}</th>`,
			(r) => `<tr><td>${esc(r.b)}</td><td class="num">${ct(r.from_ct) || "0"}</td>
				<td class="num">${ct(r.to_ct) || "▸"}</td><td>${esc(r.basis)}</td>
				<td class="num">${inr(r.rate)}</td></tr>`,
			__("Colour stone, CZ, CVD and Swarovski are not priced on this chart."));

		const cert = tableOr(c.cert,
			`<th>${__("Charge")}</th><th>${__("Basis")}</th><th class="num">${__("Rate")}</th>
			 <th class="num">${__("Minimum")}</th><th>${__("Weight slab")}</th>`,
			(r) => `<tr><td>${esc(r.certification)}${r.solitaire
					? ` <span class="k-chip">${__("solitaire")}</span>` : ""}</td>
				<td>${esc(r.basis)}</td><td class="num">${inr(r.rate)}</td>
				<td class="num">${inr(r.min_amount)}</td>
				<td>${r.to_ct ? `${ct(r.from_ct) || "0"} – ${ct(r.to_ct)} ct` : "—"}</td></tr>`,
			__("No certification or hallmarking charge on this chart."));

		const CN = { making: __("Making"), diamond: __("Diamond"), precious: __("Precious"),
			buckets: __("CS / CZ / CVD / SW"), charges: __("Charges") };
		const covers = `<div class="cd-covers">
			<span class="cov on">${c.covers.gold === "touch" ? __("Gold on a touch") : __("Gold at the typed rate")}</span>
			${Object.keys(CN).map((k) => `<span class="cov ${c.covers[k] ? "on" : "off"}">${
				CN[k]}${c.covers[k] ? "" : " · " + __("not priced")}</span>`).join("")}</div>`;

		root.find(".cd-body").html(`
			${covers}
			<div class="cd-sec">${__("Gold — what the metal is billed at")}</div>
			<div class="cd-touch">${touch}</div>

			<div class="cd-sec">${__("Making")}</div>
			<div class="cd-card">
				<h3>${__("{0} rule(s)", [c.making.length])}</h3>
				<p class="sub">${__("the most specific row that fits a piece wins: karat + type, then type, then karat, then DEFAULT")}</p>
				${mk}
			</div>

			<div class="cd-sec">${__("Diamonds")}</div>
			<div class="cd-cols">
				<div class="cd-card">
					<h3>${__("Rate by stone size")}</h3>
					<p class="sub">${c.dmd_span
						? __("per-stone ct — total carats ÷ piece count picks the bracket. Priced from {0} to {1} ct.",
							[c.dmd_span[0], c.dmd_span[1]])
						: __("per-stone ct — total carats ÷ piece count picks the bracket")}</p>
					<div class="cd-dmd"></div>
				</div>
				<div class="cd-card">
					<h3>${__("Brackets")}</h3>
					<div class="cd-tools"><label class="sub" style="margin:0">${__("Quality")}</label>
						<select class="cd-qual">${quals.map((q) =>
							`<option ${q === S.quality ? "selected" : ""}>${esc(q)}</option>`).join("")}</select></div>
					${dmdTable}
				</div>
			</div>

			<div class="cd-sec">${__("Other stones")}</div>
			<div class="cd-cols">
				<div class="cd-card"><h3>${__("Precious stones")}</h3>
					<p class="sub">${__("priced by stone name, in carat brackets")}</p>${ps}</div>
				<div class="cd-card"><h3>${__("Buckets")}</h3>
					<p class="sub">${__("colour stone, CZ, CVD and Swarovski")}</p>${buckets}</div>
			</div>

			<div class="cd-sec">${__("Charges")}</div>
			<div class="cd-card">${cert}</div>

			<div class="cd-sec">${__("Terms")}</div>
			<div class="cd-cols">
				<div class="cd-card"><h3>${__("Payment")}</h3>
					<div class="cd-terms">${esc(c.terms.payment) || __("Not stated.")}</div></div>
				<div class="cd-card"><h3>${__("Conditions")}</h3>
					<div class="cd-terms">${esc(c.terms.terms) || __("Not stated.")}</div>
					${c.terms.signatory ? `<p class="sub" style="margin-top:10px;">${__("Signed")}: ${
						esc(c.terms.signatory)}${c.terms.phone ? " · " + esc(c.terms.phone) : ""}</p>` : ""}</div>
			</div>

			${c.history.length > 1 ? `<div class="cd-sec">${__("Earlier charts for {0}", [esc(c.chart_name)])}</div>
				<div class="cd-hist">${c.history.map((h) =>
					`<a href="#" data-n="${esc(h.name)}" class="${h.name === c.name ? "on" : ""}">${
						esc(h.chart_date)} · ${esc(h.status)}</a>`).join("")}</div>` : ""}
		`);

		// the chart's own curve — one series, so the heading names it and no legend
		jewelima.costStepChart(root.find(".cd-dmd"), {
			title: __("Diamond ₹/ct"),
			series: dmdRows.length ? [{ name: c.chart_name, points: dmdRows.map((d) => ({
				from_ct: d.from_ct, to_ct: d.to_ct, rate: d.rate, sieve: d.sieve })) }] : [],
			empty: __("No brackets at this quality."),
		});
	}

	function load(name) {
		return frappe.call({ method: API + ".get_costing_chart", args: { name: name || "" }, freeze: false })
			.then((r) => {
				const m = r.message || {};
				S.list = m.list || [];
				S.c = m.chart;
				paint();
			});
	}

	root.on("change", ".cd-pick", function () { load(this.value); });
	root.on("change", ".cd-qual", function () { S.quality = this.value; paint(); });
	root.on("click", ".cd-hist a", function (e) { e.preventDefault(); load($(this).data("n")); });

	page.set_primary_action(__("Refresh"), () => load(S.c && S.c.name), "refresh");
	// /app/costing-chart/PCH-0001 opens that chart straight away
	const routed = () => (frappe.get_route() || [])[1] || "";
	frappe.pages["costing-chart"].on_page_show = () => load(routed() || (S.c && S.c.name));
	load(routed());
};
