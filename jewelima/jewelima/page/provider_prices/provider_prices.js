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
		/* the editor grid */
		table.pe-t{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.pe-t th{text-align:left;font-size:10px;text-transform:uppercase;color:var(--text-muted);
			padding:5px 7px;border-bottom:1px solid var(--border-color);}
		table.pe-t td{padding:3px 6px;border-bottom:1px solid var(--border-color);}
		table.pe-t input,table.pe-t select{width:100%;border:1px solid var(--border-color);
			border-radius:6px;padding:3px 7px;font-size:12.5px;background:var(--control-bg);
			color:var(--text-color);}
		table.pe-t input[type=number]{text-align:right;}
		.pe-del{color:#b02a2a;cursor:pointer;font-weight:800;text-align:center;}
		.pe-add{font-size:11.5px;color:#1f618d;cursor:pointer;font-weight:700;}
		.pe-sec{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;
			color:var(--text-muted);margin:14px 0 6px;display:flex;justify-content:space-between;}
		</style>
		<div class="pp-bar">
			<div><label>${__("Our price chart")}</label><select class="pp-chart"></select></div>
			<div><label>${__("24K board rate ₹/g")}</label>
				<input type="number" class="pp-gold" step="1" placeholder="${__("for metal")}"></div>
			<span class="pp-actions">
				<button class="pp-btn pp-new">${__("New rate card")}</button>
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
			: `<div class="pp-empty">${__("No provider rate cards yet — add one to see what a maker charges against what we charge.")}</div>`);
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
		m.metal.forEach((r) => Object.values(r.by).forEach(scan));
		m.diamond.forEach(scan);

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

		const metalRows = m.metal.map((r) => `<tr>
			<td><b>${esc(r.karat)}</b>${r.touch ? `<div class="pct">${__("touch")} ${r.touch}%</div>` : ""}</td>
			<td class="num">${inr(r.ours)}</td>
			${P.map((p) => mgCell(r.by[p.name])).join("")}</tr>`).join("");

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

			<div class="pp-sec">${__("Metal — ₹ per gram")}</div>
			<p class="pp-note">${m.gold_rate
				? __("our rate is the {0} board rate through the chart's touch", [inr(m.gold_rate)])
				: __("type the 24K board rate above to compare metal — our side of it is that rate through the chart's touch")}</p>
			${m.metal.length ? `<div class="pp-tw"><table class="pp-t"><thead><tr>
				<th>${__("Karat")}</th><th class="num">${__("We charge")}</th>${head}
			</tr></thead><tbody>${metalRows}</tbody></table></div>`
				: `<div class="pp-empty">${__("No provider quotes a metal rate yet.")}</div>`}

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

	// ---- the rate card editor ------------------------------------------------
	function showEditor(base) {
		const C = base ? JSON.parse(JSON.stringify(base)) : {
			supplier: "", rate_date: frappe.datetime.get_today(), currency_note: "", notes: "",
			making_rates: [], diamond_rates: [], metal_rates: [] };
		// a saved card is history; opening one starts the NEXT card from its rates
		const isNew = !base;
		const dlg = new frappe.ui.Dialog({
			title: isNew ? __("New rate card") : __("New card from {0}", [base.supplier]),
			size: "extra-large",
			primary_action_label: __("Save as the provider's current rates"),
			primary_action() {
				if (!C.supplier) return frappe.msgprint(__("Pick the provider."));
				frappe.call({ method: API + ".save_provider_rate",
					args: { payload: JSON.stringify(C) } }).then((r) => {
					dlg.hide();
					frappe.show_alert({ indicator: "green",
						message: __("Saved — {0} is now on this card.", [C.supplier]) }, 5);
					load((r.message || {}).name);
				});
			},
		});
		const $b = $(dlg.body);
		const KAR = S.meta.karats || ["14K", "18K", "22K"];
		const DT = S.meta.design_types || [];

		function draw() {
			$b.html(`
				<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:6px;">
					<div><label style="font-size:10.5px;color:var(--text-muted);display:block;">${__("Provider")}</label>
						<select class="pe-sup" style="min-width:200px;height:30px;border:1px solid var(--border-color);border-radius:7px;background:var(--control-bg);color:var(--text-color);">
							<option value="">${__("— pick —")}</option>
							${(S.meta.suppliers || []).map((s) =>
								`<option ${s === C.supplier ? "selected" : ""}>${esc(s)}</option>`).join("")}
						</select></div>
					<div><label style="font-size:10.5px;color:var(--text-muted);display:block;">${__("Quoted on")}</label>
						<input type="date" class="pe-date" value="${esc(C.rate_date)}"
							style="height:30px;border:1px solid var(--border-color);border-radius:7px;background:var(--control-bg);color:var(--text-color);padding:2px 8px;"></div>
					<div style="flex:1;min-width:200px;"><label style="font-size:10.5px;color:var(--text-muted);display:block;">${__("Reference")}</label>
						<input type="text" class="pe-ref" value="${esc(C.currency_note || "")}"
							placeholder="${__("their email, a call, a rate sheet")}"
							style="width:100%;height:30px;border:1px solid var(--border-color);border-radius:7px;background:var(--control-bg);color:var(--text-color);padding:2px 8px;"></div>
				</div>

				<div class="pe-sec">${__("Making — what they charge us")}<span class="pe-add" data-k="making_rates">+ ${__("row")}</span></div>
				<table class="pe-t"><thead><tr><th>${__("Karat")}</th><th>${__("Design type")}</th>
					<th>${__("Basis")}</th><th>${__("Rate")}</th><th>${__("Min ₹/pc")}</th><th></th></tr></thead>
					<tbody>${C.making_rates.map((r, i) => `<tr data-k="making_rates" data-i="${i}">
						<td><select data-f="karat"><option value="">${__("any")}</option>
							${KAR.map((k) => `<option ${r.karat === k ? "selected" : ""}>${k}</option>`).join("")}</select></td>
						<td><select data-f="design_type"><option value="">${__("DEFAULT")}</option>
							${DT.map((t) => `<option ${r.design_type === t ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></td>
						<td><select data-f="basis">${["Per Gram", "Per Piece"].map((b) =>
							`<option ${(r.basis || "Per Gram") === b ? "selected" : ""}>${b}</option>`).join("")}</select></td>
						<td><input data-f="rate" type="number" step="0.01" value="${r.rate || ""}"></td>
						<td><input data-f="min_per_piece" type="number" step="0.01" value="${r.min_per_piece || ""}"></td>
						<td class="pe-del">&times;</td></tr>`).join("")}</tbody></table>

				<div class="pe-sec">${__("Metal — ₹ per gram")}<span class="pe-add" data-k="metal_rates">+ ${__("row")}</span></div>
				<table class="pe-t"><thead><tr><th>${__("Karat")}</th><th>${__("Rate ₹/g")}</th><th></th></tr></thead>
					<tbody>${C.metal_rates.map((r, i) => `<tr data-k="metal_rates" data-i="${i}">
						<td><select data-f="karat">${["14K", "18K", "22K", "24K / fine"].map((k) =>
							`<option ${r.karat === k ? "selected" : ""}>${k}</option>`).join("")}</select></td>
						<td><input data-f="rate" type="number" step="0.01" value="${r.rate || ""}"></td>
						<td class="pe-del">&times;</td></tr>`).join("")}</tbody></table>

				<div class="pe-sec">${__("Diamonds — ₹ per carat")}<span class="pe-add" data-k="diamond_rates">+ ${__("row")}</span></div>
				<table class="pe-t"><thead><tr><th>${__("Sieve")}</th><th>${__("From ct")}</th>
					<th>${__("Below ct")}</th><th>${__("Quality")}</th><th>${__("Rate ₹/ct")}</th><th></th></tr></thead>
					<tbody>${C.diamond_rates.map((r, i) => `<tr data-k="diamond_rates" data-i="${i}">
						<td><input data-f="sieve_label" value="${esc(r.sieve_label || "")}"></td>
						<td><input data-f="from_ct" type="number" step="0.001" value="${r.from_ct || ""}"></td>
						<td><input data-f="to_ct" type="number" step="0.001" value="${r.to_ct || ""}"></td>
						<td><input data-f="quality" value="${esc(r.quality || "")}" placeholder="VVS-EF"></td>
						<td><input data-f="rate" type="number" step="0.01" value="${r.rate || ""}"></td>
						<td class="pe-del">&times;</td></tr>`).join("")}</tbody></table>

				<div class="pe-sec">${__("Notes")}</div>
				<textarea class="pe-notes" rows="2" style="width:100%;border:1px solid var(--border-color);border-radius:7px;background:var(--control-bg);color:var(--text-color);padding:5px 8px;font-size:12.5px;">${esc(C.notes || "")}</textarea>
			`);
		}
		draw();

		$b.on("change", ".pe-sup", function () { C.supplier = this.value; });
		$b.on("change", ".pe-date", function () { C.rate_date = this.value; });
		$b.on("input", ".pe-ref", function () { C.currency_note = this.value; });
		$b.on("input", ".pe-notes", function () { C.notes = this.value; });
		$b.on("input change", "table.pe-t input, table.pe-t select", function () {
			const $tr = $(this).closest("tr");
			const arr = C[$tr.data("k")], i = +$tr.data("i");
			arr[i][$(this).data("f")] = this.type === "number" ? flt(this.value) : this.value;
		});
		$b.on("click", ".pe-add", function () {
			const k = $(this).data("k");
			C[k].push(k === "making_rates" ? { karat: "", design_type: "", basis: "Per Gram", rate: "", min_per_piece: "" }
				: k === "metal_rates" ? { karat: "18K", rate: "" }
				: { sieve_label: "", from_ct: "", to_ct: "", quality: "", rate: "" });
			draw();
		});
		$b.on("click", ".pe-del", function () {
			const $tr = $(this).closest("tr");
			C[$tr.data("k")].splice(+$tr.data("i"), 1);
			draw();
		});
		dlg.show();
	}

	root.on("click", ".pp-new", () => showEditor(null));
	// clicking a card selects it for the comparison; double-click opens it as the
	// starting point for the provider's next quote
	root.on("click", ".pp-card", function () {
		const n = $(this).data("n");
		S.pick.has(n) ? S.pick.delete(n) : S.pick.add(n);
		paintCards();
		loadMargins();
	});
	root.on("dblclick", ".pp-card", function () {
		frappe.call({ method: API + ".get_provider_rates", args: { name: $(this).data("n") } })
			.then((r) => showEditor((r.message || {}).card));
	});
	root.on("change", ".pp-chart", function () { S.chart = this.value; loadMargins(); });
	root.on("input", ".pp-gold", frappe.utils.debounce(function () {
		S.gold = flt(this.value); loadMargins();
	}, 400));

	page.set_primary_action(__("Refresh"), () => load(S.card && S.card.name), "refresh");
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
