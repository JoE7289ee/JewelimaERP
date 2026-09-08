// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Provider Rates (Costing) — where a maker's quote is ENTERED.
//
// Entering a rate and reading a margin are two different jobs done at two
// different moments, so they are two pages: this one takes what a provider
// quoted us, and Provider Prices reads those cards against our own charts.
//
// A card is never edited. Saving makes a NEW Active card and supersedes the
// provider's previous one, because what we were quoted in August is a fact
// about August — opening an old card starts the next quote from its numbers.
// Route: /app/provider-rates

frappe.pages["provider-rates"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Provider Rates"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const root = $(page.main);
	const S = { list: [], card: null, meta: {} };
	// the same four buckets, in the same order, as a price chart
	const BUCKETS = [["cs_rates", __("Colour stone (CS) — ₹ per carat")],
		["cz_rates", __("CZ")], ["cvd_rates", __("CVD")], ["sw_rates", __("Swarovski (SW)")]];

	const inr = (v) => (v == null ? "—" : "₹" + flt(v).toLocaleString("en-IN", { maximumFractionDigits: 2 }));

	root.append(`
		<style>
		#page-provider-rates .container{max-width:100%;}
		.pr-sec{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;
			color:var(--text-muted);margin:18px 0 9px;padding-bottom:5px;
			border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;}
		.pr-cards{display:flex;gap:10px;flex-wrap:wrap;}
		.pr-card{border:1px solid var(--border-color);border-radius:11px;padding:11px 14px;
			background:var(--fg-color);min-width:210px;}
		.pr-card.sup{opacity:.62;}
		.pr-card .nm{font-weight:800;font-size:13.5px;}
		.pr-card .meta{font-size:11px;color:var(--text-muted);margin-top:1px;}
		.pr-card .cnt{font-size:11.5px;color:var(--text-muted);margin-top:6px;font-variant-numeric:tabular-nums;}
		.pr-card .act{margin-top:8px;display:flex;gap:8px;}
		.pr-open{font-size:11.5px;color:#1f618d;cursor:pointer;font-weight:700;}
		.pill{display:inline-block;border-radius:9px;padding:1px 8px;font-size:10px;font-weight:800;
			letter-spacing:.04em;text-transform:uppercase;}
		.pill.act{background:rgba(29,122,51,.14);color:#1d7a33;}
		.pill.sup{background:rgba(128,128,128,.16);color:var(--text-muted);}
		[data-theme="dark"] .pill.act{color:#6fbf7f;}
		.pr-empty{padding:30px;text-align:center;color:var(--text-muted);font-size:13px;
			border:1px dashed var(--border-color);border-radius:12px;width:100%;}
		.pr-btn{background:none;border:1px solid var(--border-color);border-radius:8px;padding:7px 14px;
			font-size:12.5px;cursor:pointer;color:var(--text-color);}
		.pr-btn.go{background:#1f618d;border-color:#1f618d;color:#fff;font-weight:700;}
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
		<div class="pr-sec">${__("Current rates")}<button class="pr-btn go pr-new">${__("New rate card")}</button></div>
		<div class="pr-cards pr-live"></div>
		<div class="pr-sec pr-oldh" style="display:none;">${__("Superseded")}</div>
		<div class="pr-cards pr-old"></div>
	`);

	function cardHtml(c) {
		const n = c.counts || {};
		return `<div class="pr-card ${c.status === "Active" ? "" : "sup"}" data-n="${esc(c.name)}">
			<div class="nm">${esc(c.supplier)}
				<span class="pill ${c.status === "Active" ? "act" : "sup"}">${esc(c.status)}</span></div>
			<div class="meta">${__("quoted")} ${esc(c.rate_date)} · ${esc(c.name)}</div>
			<div class="cnt">${[
				[n.making, __("making")], [n.metal, __("metal")], [n.diamond, __("diamond")],
				[n.precious, __("precious")], [n.buckets, __("buckets")], [n.charges, __("charges")],
			].filter(([v]) => v).map(([v, l]) => v + " " + l).join(" · ")
				|| __("nothing priced yet")}</div>
			<div class="act"><span class="pr-open">${c.status === "Active"
				? __("Open / re-quote") : __("Start a new card from this")}</span></div></div>`;
	}

	function paint() {
		const live = S.list.filter((c) => c.status === "Active");
		const old = S.list.filter((c) => c.status !== "Active");
		root.find(".pr-live").html(live.length ? live.map(cardHtml).join("")
			: `<div class="pr-empty">${__("No provider has a rate card yet. Add one, and Provider Prices will show what we keep on it.")}</div>`);
		root.find(".pr-oldh").toggle(!!old.length);
		root.find(".pr-old").html(old.map(cardHtml).join(""));
	}

	function load(name) {
		return frappe.call({ method: API + ".get_provider_rates", args: { name: name || "" }, freeze: false })
			.then((r) => {
				const m = r.message || {};
				S.list = m.list || [];
				S.card = m.card;
				S.meta = m;
				paint();
			});
	}

	// ---- the rate card editor ------------------------------------------------
	function showEditor(base) {
		const C = base ? JSON.parse(JSON.stringify(base)) : {
			supplier: "", rate_date: frappe.datetime.get_today(), currency_note: "", notes: "",
			making_rates: [], diamond_rates: [], metal_rates: [],
			precious_stone_rates: [], cs_rates: [], cz_rates: [], cvd_rates: [], sw_rates: [],
			certification_charges: [] };
		// an older card was saved before these sections existed — treat a missing
		// table as an empty one rather than letting .map() throw on undefined
		["making_rates", "diamond_rates", "metal_rates", "precious_stone_rates",
		 "cs_rates", "cz_rates", "cvd_rates", "sw_rates", "certification_charges"]
			.forEach((k) => { if (!Array.isArray(C[k])) C[k] = []; });
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
					<th>${__("Basis")}</th><th>${__("Rate")}</th><th>${__("Min ₹/pc")}</th>
					<th>${__("Flat below g")}</th><th></th></tr></thead>
					<tbody>${C.making_rates.map((r, i) => `<tr data-k="making_rates" data-i="${i}">
						<td><select data-f="karat"><option value="">${__("any")}</option>
							${KAR.map((k) => `<option ${r.karat === k ? "selected" : ""}>${k}</option>`).join("")}</select></td>
						<td><select data-f="design_type"><option value="">${__("DEFAULT")}</option>
							${DT.map((t) => `<option ${r.design_type === t ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></td>
						<td><select data-f="basis">${["Per Gram", "Per Piece", "Purity Percent"].map((b) =>
							`<option ${(r.basis || "Per Gram") === b ? "selected" : ""}>${b}</option>`).join("")}</select></td>
						<td><input data-f="rate" type="number" step="0.01" value="${r.rate || ""}"></td>
						<td><input data-f="min_per_piece" type="number" step="0.01" value="${r.min_per_piece || ""}"></td>
						<td><input data-f="flat_below_gm" type="number" step="0.001" value="${r.flat_below_gm || ""}"></td>
						<td class="pe-del">&times;</td></tr>`).join("")}</tbody></table>

				<div class="pe-sec">${__("Metal — touch % of the day's board rate")}<span class="pe-add" data-k="metal_rates">+ ${__("row")}</span></div>
				<table class="pe-t"><thead><tr><th>${__("Karat")}</th><th>${__("Touch %")}</th><th></th></tr></thead>
					<tbody>${C.metal_rates.map((r, i) => `<tr data-k="metal_rates" data-i="${i}">
						<td><select data-f="karat">${["14K", "18K", "22K"].map((k) =>
							`<option ${r.karat === k ? "selected" : ""}>${k}</option>`).join("")}</select></td>
						<td><input data-f="touch" type="number" step="0.01" value="${r.touch || ""}"
							placeholder="${__("80 = 80% of the 24K board rate")}"></td>
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

				<div class="pe-sec">${__("Precious stones — ₹ per carat")}<span class="pe-add" data-k="precious_stone_rates">+ ${__("row")}</span></div>
				<table class="pe-t"><thead><tr><th>${__("Stone")}</th><th>${__("From ct")}</th>
					<th>${__("Below ct")}</th><th>${__("₹ / ct")}</th><th></th></tr></thead>
					<tbody>${C.precious_stone_rates.map((r, i) => `<tr data-k="precious_stone_rates" data-i="${i}">
						<td><input data-f="stone" value="${esc(r.stone || "")}" placeholder="${__("item code")}"></td>
						<td><input data-f="from_ct" type="number" step="0.001" value="${r.from_ct || ""}"></td>
						<td><input data-f="to_ct" type="number" step="0.001" value="${r.to_ct || ""}"></td>
						<td><input data-f="rate" type="number" step="0.01" value="${r.rate || ""}"></td>
						<td class="pe-del">&times;</td></tr>`).join("")}</tbody></table>

				${BUCKETS.map(([k, label]) => `
					<div class="pe-sec">${label}<span class="pe-add" data-k="${k}">+ ${__("row")}</span></div>
					<table class="pe-t"><thead><tr><th>${__("From ct")}</th><th>${__("Below ct")}</th>
						<th>${__("Basis")}</th><th>${__("Rate")}</th><th></th></tr></thead>
						<tbody>${(C[k] || []).map((r, i) => `<tr data-k="${k}" data-i="${i}">
							<td><input data-f="from_ct" type="number" step="0.001" value="${r.from_ct || ""}"></td>
							<td><input data-f="to_ct" type="number" step="0.001" value="${r.to_ct || ""}"></td>
							<td><select data-f="basis">${["Per Ct", "Per Gram", "Per Piece"].map((b) =>
								`<option ${(r.basis || "Per Ct") === b ? "selected" : ""}>${b}</option>`).join("")}</select></td>
							<td><input data-f="rate" type="number" step="0.01" value="${r.rate || ""}"></td>
							<td class="pe-del">&times;</td></tr>`).join("")}</tbody></table>`).join("")}

				<div class="pe-sec">${__("Certification charges")}<span class="pe-add" data-k="certification_charges">+ ${__("row")}</span></div>
				<table class="pe-t"><thead><tr><th>${__("Lab")}</th><th>${__("Basis")}</th>
					<th>${__("Rate")}</th><th>${__("Minimum")}</th><th>${__("From ct")}</th>
					<th>${__("Below ct")}</th><th>${__("Solitaire")}</th><th></th></tr></thead>
					<tbody>${C.certification_charges.map((r, i) => `<tr data-k="certification_charges" data-i="${i}">
						<td><select data-f="certification"><option value="">${__("— lab —")}</option>
							${(S.meta.labs || []).map((l) =>
								`<option ${(r.certification || "") === l ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></td>
						<td><select data-f="basis">${["Per Piece", "Per Ct"].map((b) =>
							`<option ${(r.basis || "Per Piece") === b ? "selected" : ""}>${b}</option>`).join("")}</select></td>
						<td><input data-f="rate" type="number" step="0.01" value="${r.rate || ""}"></td>
						<td><input data-f="min_amount" type="number" step="0.01" value="${r.min_amount || ""}"></td>
						<td><input data-f="from_ct" type="number" step="0.001" value="${r.from_ct || ""}"></td>
						<td><input data-f="to_ct" type="number" step="0.001" value="${r.to_ct || ""}"></td>
						<td style="text-align:center;"><input data-f="solitaire" type="checkbox"
							style="width:auto;" ${r.solitaire ? "checked" : ""}></td>
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
			arr[i][$(this).data("f")] = this.type === "checkbox" ? (this.checked ? 1 : 0)
				: this.type === "number" ? flt(this.value) : this.value;
		});
		$b.on("click", ".pe-add", function () {
			const k = $(this).data("k");
			C[k].push(
				k === "making_rates" ? { karat: "", design_type: "", basis: "Per Gram", rate: "", min_per_piece: "", flat_below_gm: "" }
				: k === "metal_rates" ? { karat: "18K", touch: "" }
				: k === "diamond_rates" ? { sieve_label: "", from_ct: "", to_ct: "", quality: "", rate: "" }
				: k === "precious_stone_rates" ? { stone: "", from_ct: "", to_ct: "", rate: "" }
				: k === "certification_charges" ? { certification: "", basis: "Per Piece", rate: "", min_amount: "", from_ct: "", to_ct: "", solitaire: 0 }
				: { from_ct: "", to_ct: "", basis: "Per Ct", rate: "" });
			draw();
		});
		$b.on("click", ".pe-del", function () {
			const $tr = $(this).closest("tr");
			C[$tr.data("k")].splice(+$tr.data("i"), 1);
			draw();
		});
		dlg.show();
	}

	root.on("click", ".pr-new", () => showEditor(null));
	root.on("click", ".pr-open", function () {
		frappe.call({ method: API + ".get_provider_rates", args: { name: $(this).closest(".pr-card").data("n") } })
			.then((r) => showEditor((r.message || {}).card));
	});

	page.set_secondary_action(__("Compare margins"), () => frappe.set_route("provider-prices"));
	page.set_primary_action(__("Refresh"), () => load(), "refresh");
	load();
};
