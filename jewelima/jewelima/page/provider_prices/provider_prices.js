// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Provider Prices (Costing) — what the people who MAKE our pieces charge us,
// and what we keep on it.
//
// A provider's rate card is deliberately the same shape as a price chart:
// making by karat and type, diamonds by bracket, metal by karat. So the margin
// is a subtraction, not a translation — our rate, their rate, the difference,
// and the difference as a share of what we charge.
//
// A card is never edited. Saving makes a NEW Active card and supersedes the
// provider's previous one, because what we were quoted in August is a fact
// about August.
// Route: /app/provider-prices

frappe.pages["provider-prices"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Provider Prices"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const root = $(page.main);
	const S = { list: [], card: null, meta: {}, chart: "", charts: [], gold: 0, margins: null, pick: new Set() };

	const inr = (v) => (v == null ? "—" : "₹" + flt(v).toLocaleString("en-IN", { maximumFractionDigits: 2 }));

	root.append(`
		<style>
		#page-provider-prices .container{max-width:100%;}
		.pp-bar{display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap;margin-bottom:16px;
			border:1px solid var(--border-color);border-radius:13px;padding:13px 16px;background:var(--fg-color);}
		.pp-bar label{display:block;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;
			color:var(--text-muted);margin-bottom:3px;}
		.pp-bar select,.pp-bar input{border:1px solid var(--border-color);border-radius:8px;height:32px;
			padding:2px 10px;font-size:13px;background:var(--control-bg);color:var(--text-color);}
		.pp-bar select{min-width:190px;}
		.pp-bar input{width:120px;text-align:right;font-variant-numeric:tabular-nums;}
		.pp-actions{margin-left:auto;display:flex;gap:9px;align-items:center;}
		.pp-btn{background:none;border:1px solid var(--border-color);border-radius:8px;padding:8px 15px;
			font-size:12.5px;cursor:pointer;color:var(--text-color);}
		.pp-btn.go{background:#1f618d;border-color:#1f618d;color:#fff;font-weight:700;}
		.pp-sec{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;
			color:var(--text-muted);margin:20px 0 9px;padding-bottom:5px;
			border-bottom:1px solid var(--border-color);}
		.pp-note{font-size:12.5px;color:var(--text-muted);margin:-4px 0 10px;}
		.pp-tw{overflow-x:auto;}
		table.pp-t{width:100%;border-collapse:collapse;font-size:12.5px;background:var(--fg-color);
			border:1px solid var(--border-color);border-radius:11px;overflow:hidden;
			font-variant-numeric:tabular-nums;}
		table.pp-t th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em;
			color:var(--text-muted);padding:8px 10px;background:var(--control-bg);
			border-bottom:1px solid var(--border-color);white-space:nowrap;}
		table.pp-t td{padding:7px 10px;border-bottom:1px solid var(--border-color);}
		table.pp-t td.num,table.pp-t th.num{text-align:right;}
		table.pp-t td.grp{border-left:1px solid var(--border-color);}
		/* margin is a state, not just a number: kept, thin, or under water */
		.mg{font-weight:800;}
		.mg.up{color:#1d7a33;} .mg.thin{color:#b45309;} .mg.down{color:#b02a2a;}
		[data-theme="dark"] .mg.up{color:#6fbf7f;} [data-theme="dark"] .mg.thin{color:#e8a24a;}
		[data-theme="dark"] .mg.down{color:#f0a0a0;}
		.pct{font-size:11px;color:var(--text-muted);}
		.pp-kpis{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;}
		.pp-kpi{flex:1 1 150px;border:1px solid var(--border-color);border-radius:11px;
			padding:10px 14px;background:var(--fg-color);}
		.pp-kpi .k{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);}
		.pp-kpi .v{font-size:22px;font-weight:800;line-height:1.25;}
		.pp-kpi.bad{border-left:3px solid #b02a2a;} .pp-kpi.bad .v{color:#b02a2a;}
		[data-theme="dark"] .pp-kpi.bad .v{color:#f0a0a0;}
		.pill{display:inline-block;border-radius:9px;padding:1px 8px;font-size:10px;font-weight:800;
			letter-spacing:.04em;text-transform:uppercase;}
		.pill.act{background:rgba(29,122,51,.14);color:#1d7a33;}
		.pill.sup{background:rgba(128,128,128,.16);color:var(--text-muted);}
		[data-theme="dark"] .pill.act{color:#6fbf7f;}
		.pp-empty{padding:30px;text-align:center;color:var(--text-muted);font-size:13px;}
		.pp-cards{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;}
		.pp-card{border:1px solid var(--border-color);border-radius:11px;padding:9px 13px;
			background:var(--fg-color);cursor:pointer;min-width:170px;}
		.pp-card.on{border:2px solid #1f618d;background:rgba(31,97,141,.07);}
		.pp-card .nm{font-weight:800;font-size:13.5px;}
		.pp-card .meta{font-size:11px;color:var(--text-muted);}
		</style>
		<div class="pp-bar">
			<div><label>${__("Our price chart")}</label><select class="pp-chart"></select></div>
			<div><label>${__("24K board rate ₹/g")}</label>
				<input type="number" class="pp-gold" step="1" placeholder="${__("for metal")}"></div>
			<span class="pp-actions">
				<button class="pp-btn pp-edit">${__("Add / edit rates")}</button>
			</span>
		</div>
		<div class="pp-sec">${__("Provider rate cards")}</div>
		<div class="pp-cards"></div>
		<div class="pp-kpis"></div>
		<div class="pp-body"></div>
	`);

	// ---- margin cell: the number, how it reads, and what share it is ---------
	function mgCell(m) {
		if (!m || m.margin == null) {
			return `<td class="num grp"><span style="color:var(--text-muted)">${
				m && m.theirs != null ? inr(m.theirs) : "—"}</span>${
				m && m.theirs != null ? `<div class="pct">${__("we have no rate")}</div>` : ""}</td>`;
		}
		const cls = m.margin < 0 ? "down" : (m.pct != null && m.pct < 15 ? "thin" : "up");
		return `<td class="num grp">${inr(m.theirs)}
			<div class="mg ${cls}">${m.margin < 0 ? "−" : "+"}${inr(Math.abs(m.margin)).slice(1)}${
				m.pct != null ? ` <span class="pct">${m.pct}%</span>` : ""}</div></td>`;
	}

	function paintCards() {
		root.find(".pp-cards").html(S.list.length ? S.list.map((c) => `
			<div class="pp-card ${S.pick.has(c.name) ? "on" : ""}" data-n="${esc(c.name)}">
				<div class="nm">${esc(c.supplier)}
					<span class="pill ${c.status === "Active" ? "act" : "sup"}">${esc(c.status)}</span></div>
				<div class="meta">${esc(c.rate_date)} · ${esc(c.name)}</div>
			</div>`).join("")
			: `<div class="pp-empty">${__("No provider rate cards yet.")}
				<a class="pp-edit" style="cursor:pointer;">${__("Add one on Provider Rates")}</a>
				${__("and this page will show what we keep on it.")}</div>`);
	}

	function paintMargins() {
		const m = S.margins;
		if (!m || !m.providers.length) {
			root.find(".pp-kpis, .pp-body").empty();
			return;
		}
		const P = m.providers;
		const head = P.map((p) => `<th class="num">${esc(p.supplier)}<div class="pct">${
			__("theirs · margin")}</div></th>`).join("");

		// every comparable line, counted once — a KPI that counted rows twice
		// would flatter or damn a provider by how many brackets it quotes
		let priced = 0, under = 0, thin = 0;
		const scan = (v) => { if (v && v.margin != null) { priced++; if (v.margin < 0) under++;
			else if (v.pct != null && v.pct < 15) thin++; } };
		m.making.forEach((r) => Object.values(r.by).forEach(scan));
		// a metal cell is judged on its touch, in points, not on rupees that move
		// with the board — scanning it as money would call every row "thin"
		m.metal.forEach((r) => Object.values(r.by).forEach((v) => {
			if (!v || v.touch_margin == null) return;
			priced++;
			if (v.touch_margin < 0) under++;
			else if (v.touch_margin < 2) thin++;
		}));
		m.diamond.forEach(scan);
		(m.precious || []).forEach(scan);
		(m.buckets || []).forEach(scan);
		(m.charges || []).forEach(scan);

		root.find(".pp-kpis").html(`
			<div class="pp-kpi"><div class="k">${__("Providers")}</div><div class="v">${P.length}</div></div>
			<div class="pp-kpi"><div class="k">${__("Lines we can compare")}</div><div class="v">${priced}</div></div>
			<div class="pp-kpi"><div class="k">${__("Thin (under 15%)")}</div><div class="v">${thin}</div></div>
			<div class="pp-kpi ${under ? "bad" : ""}"><div class="k">${__("Below cost")}</div>
				<div class="v">${under}</div></div>`);

		const makingRows = m.making.map((r) => `<tr>
			<td>${r.karat ? `<b>${esc(r.karat)}</b> ` : `<span style="color:var(--text-muted)">${__("any")}</span> `}${
				esc(r.design_type) || `<span style="color:var(--text-muted)">${__("DEFAULT")}</span>`}</td>
			<td class="num">${inr(r.ours)}${r.our_rule
				? `<div class="pct">${__("our rule")}: ${esc(r.our_rule)}</div>` : ""}</td>
			${P.map((p) => mgCell(r.by[p.name])).join("")}</tr>`).join("");

		// metal is quoted as a touch, so the touch is what the row compares; the
		// rupees underneath are that comparison read at today's board rate
		const metalCell = (v) => {
			if (!v || v.touch == null) {
				return `<td class="num grp"><span style="color:var(--text-muted)">—</span></td>`;
			}
			const d = v.touch_margin;
			const cls = d == null ? "" : d < 0 ? "down" : d < 2 ? "thin" : "up";
			return `<td class="num grp"><b>${v.touch}%</b>
				${d == null ? "" : `<div class="mg ${cls}">${d < 0 ? "−" : "+"}${Math.abs(d)}${
					__("pts")}</div>`}
				${v.theirs == null ? "" : `<div class="pct">${inr(v.theirs)}${
					v.margin == null ? "" : ` · ${v.margin < 0 ? "−" : "+"}${inr(Math.abs(v.margin)).slice(1)}`}</div>`}</td>`;
		};
		const metalRows = m.metal.map((r) => `<tr>
			<td><b>${esc(r.karat)}</b></td>
			<td class="num">${r.touch ? `<b>${r.touch}%</b>` : "—"}
				${r.ours == null ? "" : `<div class="pct">${inr(r.ours)}</div>`}</td>
			${P.map((p) => metalCell(r.by[p.name])).join("")}</tr>`).join("");

		const size = (r) => (r.to_ct ? `${flt(r.from_ct).toFixed(3)} – ${flt(r.to_ct).toFixed(3)}`
			: `${flt(r.from_ct).toFixed(3)} ▸`);
		const psRows = (m.precious || []).map((r) => `<tr>
			<td>${esc(r.supplier)}</td><td>${esc(r.stone) || "—"}</td>
			<td class="num">${size(r)}</td>
			<td class="num">${inr(r.ours)}</td>
			${mgCell(r).replace("grp", "")}</tr>`).join("");
		const bkRows = (m.buckets || []).map((r) => `<tr>
			<td>${esc(r.supplier)}</td><td>${esc(r.bucket)}</td>
			<td class="num">${size(r)}</td><td>${esc(r.basis)}</td>
			<td class="num">${inr(r.ours)}</td>
			${mgCell(r).replace("grp", "")}</tr>`).join("");
		const chRows = (m.charges || []).map((r) => `<tr>
			<td>${esc(r.supplier)}</td>
			<td>${esc(r.certification)}${r.solitaire ? ` <span class="pill act">${__("solitaire")}</span>` : ""}</td>
			<td>${esc(r.basis)}</td>
			<td class="num">${r.to_ct ? size(r) : "—"}</td>
			<td class="num">${inr(r.ours)}</td>
			${mgCell(r).replace("grp", "")}</tr>`).join("");
		const dmdRows = m.diamond.map((r) => `<tr>
			<td>${esc(r.supplier)}</td>
			<td>${esc(r.sieve) || "—"}</td>
			<td class="num">${flt(r.from_ct).toFixed(3)} – ${r.to_ct ? flt(r.to_ct).toFixed(3) : "▸"}</td>
			<td>${esc(r.quality) || "—"}</td>
			<td class="num">${inr(r.ours)}</td>
			${mgCell(r).replace("grp", "")}</tr>`).join("");

		root.find(".pp-body").html(`
			<div class="pp-sec">${__("Making — per gram, unless the rule says per piece")}</div>
			<p class="pp-note">${__("our rate is the chart rule that a real piece of that karat and type would be billed on")}</p>
			${m.making.length ? `<div class="pp-tw"><table class="pp-t"><thead><tr>
				<th>${__("Karat · Type")}</th><th class="num">${__("We charge")}</th>${head}
			</tr></thead><tbody>${makingRows}</tbody></table></div>`
				: `<div class="pp-empty">${__("No provider quotes a making rate yet.")}</div>`}

			<div class="pp-sec">${__("Metal — touch on the board rate")}</div>
			<p class="pp-note">${m.gold_rate
				? __("gold is never a stored rate — both sides quote a touch on the day's board rate, and the rupees are that touch read at {0}", [inr(m.gold_rate)])
				: __("both sides quote a touch on the day's board rate; type the 24K rate above to see it in rupees too")}</p>
			${m.metal.length ? `<div class="pp-tw"><table class="pp-t"><thead><tr>
				<th>${__("Karat")}</th><th class="num">${__("Our touch")}</th>${head}
			</tr></thead><tbody>${metalRows}</tbody></table></div>`
				: `<div class="pp-empty">${__("No provider quotes a metal rate yet.")}</div>`}

			${psRows ? `<div class="pp-sec">${__("Precious stones — ₹ per carat")}</div>
				<p class="pp-note">${__("matched by stone, then by the bracket holding the same per-stone weight")}</p>
				<div class="pp-tw"><table class="pp-t"><thead><tr>
					<th>${__("Provider")}</th><th>${__("Stone")}</th><th class="num">${__("Size")}</th>
					<th class="num">${__("We charge")}</th><th class="num">${__("They charge")}</th>
				</tr></thead><tbody>${psRows}</tbody></table></div>` : ""}

			${bkRows ? `<div class="pp-sec">${__("Colour stone · CZ · CVD · Swarovski")}</div>
				<div class="pp-tw"><table class="pp-t"><thead><tr>
					<th>${__("Provider")}</th><th>${__("Bucket")}</th><th class="num">${__("Size")}</th>
					<th>${__("Basis")}</th><th class="num">${__("We charge")}</th>
					<th class="num">${__("They charge")}</th>
				</tr></thead><tbody>${bkRows}</tbody></table></div>` : ""}

			${chRows ? `<div class="pp-sec">${__("Certification charges")}</div>
				<p class="pp-note">${__("matched by lab, and by the weight slab where the chart has one")}</p>
				<div class="pp-tw"><table class="pp-t"><thead><tr>
					<th>${__("Provider")}</th><th>${__("Lab")}</th><th>${__("Basis")}</th>
					<th class="num">${__("Slab")}</th><th class="num">${__("We charge")}</th>
					<th class="num">${__("They charge")}</th>
				</tr></thead><tbody>${chRows}</tbody></table></div>` : ""}

			<div class="pp-sec">${__("Diamonds — ₹ per carat")}</div>
			<p class="pp-note">${__("each provider bracket set against the chart bracket that holds the same per-stone weight")}</p>
			${m.diamond.length ? `<div class="pp-tw"><table class="pp-t"><thead><tr>
				<th>${__("Provider")}</th><th>${__("Sieve")}</th><th class="num">${__("Per-stone ct")}</th>
				<th>${__("Quality")}</th><th class="num">${__("We charge")}</th>
				<th class="num">${__("They charge · margin")}</th>
			</tr></thead><tbody>${dmdRows}</tbody></table></div>`
				: `<div class="pp-empty">${__("No provider quotes a diamond rate yet.")}</div>`}`);
	}

	function loadMargins() {
		if (!S.list.length) { S.margins = null; paintMargins(); return; }
		const picked = S.pick.size ? [...S.pick] : S.list.filter((c) => c.status === "Active").map((c) => c.name);
		return frappe.call({ method: API + ".get_provider_margins", freeze: false,
			args: { price_chart: S.chart, providers: JSON.stringify(picked), gold_rate: S.gold } })
			.then((r) => { S.margins = r.message; paintMargins(); });
	}

	function load(name) {
		return frappe.call({ method: API + ".get_provider_rates", args: { name: name || "" }, freeze: false })
			.then((r) => {
				const m = r.message || {};
				S.list = m.list || [];
				S.card = m.card;
				S.meta = m;
				paintCards();
				return loadMargins();
			});
	}

	// clicking a card puts it in the comparison, or takes it out. Entering rates
	// is a different job at a different moment — it lives on Provider Rates.
	root.on("click", ".pp-card", function () {
		const n = $(this).data("n");
		S.pick.has(n) ? S.pick.delete(n) : S.pick.add(n);
		paintCards();
		loadMargins();
	});
	root.on("click", ".pp-edit", () => frappe.set_route("provider-rates"));
	root.on("change", ".pp-chart", function () { S.chart = this.value; loadMargins(); });
	root.on("input", ".pp-gold", frappe.utils.debounce(function () {
		S.gold = flt(this.value); loadMargins();
	}, 400));

	page.set_secondary_action(__("Provider Rates"), () => frappe.set_route("provider-rates"));
	page.set_primary_action(__("Refresh"), () => load(), "refresh");
	frappe.call({ method: API + ".get_price_chart_list" }).then((r) => {
		// the list comes grouped by party — one Active chart each, plus history.
		// A margin must be read against the chart that is Active TODAY.
		S.charts = ((r.message || {}).groups || []).map((g) => g.active).filter(Boolean);
		S.chart = (S.charts[0] || {}).name || "";
		root.find(".pp-chart").html(`<option value="">${__("— no chart —")}</option>`
			+ S.charts.map((c) => `<option value="${esc(c.name)}" ${c.name === S.chart ? "selected" : ""}>${
				esc(c.chart_name)}</option>`).join(""));
		load();
	});
};
