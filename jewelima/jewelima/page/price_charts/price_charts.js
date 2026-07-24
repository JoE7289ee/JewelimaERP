// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Price Charts — the dedicated editor + the customer-facing PDF, replacing the
// raw ERPNext form. LEFT: charts grouped by party (Active on top, superseded
// history under it). RIGHT: the editor — diamond brackets, setting rates,
// special works, making + flat charges, terms, signatory. Save = a NEW Active
// version (the old one auto-supersedes; history is never edited). Export PDF
// downloads the rate-chart letter, clean enough to send straight to the party.
// Route: /app/price-charts

frappe.pages["price-charts"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Price Charts", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	let GROUPS = [];
	let CERTS = [];   // Certification Type codes for the charges dropdown
	let QUALS = [];   // parent-mapped diamond quality brackets (VVS-EF, VVS/VS-GH, SI-IJ...)
	let cur = null;      // loaded chart payload (or a blank draft)
	let snap = "";       // JSON snapshot taken after load; differs = real edits

	$(page.main).append(`
		<style>
		.pc-cols{display:flex;gap:20px;align-items:flex-start;}
		.pc-left{flex:0 0 300px;}
		.pc-right{flex:1;min-width:0;}
		.pc-list{border:1px solid var(--border-color);border-radius:8px;background:var(--fg-color);overflow:auto;max-height:calc(100vh - 180px);}
		.pc-g{border-bottom:1px solid var(--border-color);}
		.pc-g .a{padding:9px 14px;cursor:pointer;display:flex;justify-content:space-between;align-items:baseline;}
		.pc-g .a:hover{background:var(--control-bg);}
		.pc-g .a.on{background:var(--control-bg);}
		.pc-g .a .nm{font-weight:700;}
		.pc-g .a .dt{font-size:11px;color:var(--text-muted);}
		.pc-g .h{padding:2px 14px 8px 26px;font-size:11.5px;color:var(--text-muted);}
		.pc-g .h span{cursor:pointer;display:block;padding:2px 0;}
		.pc-g .h span:hover{color:var(--text-color);}
		.pc-ed{border:1px solid var(--border-color);border-radius:8px;background:var(--fg-color);padding:18px 22px;display:none;}
		.pc-head{display:flex;gap:14px;align-items:end;flex-wrap:wrap;margin-bottom:6px;}
		.pc-head .frappe-control{margin:0;}
		.pc-status{font-size:11px;font-weight:700;border-radius:10px;padding:2px 10px;}
		.pc-status.act{background:#2e7d32;color:#fff;}
		.pc-status.sup{background:var(--control-bg);color:var(--text-muted);border:1px solid var(--border-color);}
		.pc-sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin:18px 0 6px;border-top:1px solid var(--border-color);padding-top:12px;display:flex;justify-content:space-between;align-items:baseline;}
		.pc-sec .add{cursor:pointer;color:var(--text-color);font-weight:400;text-transform:none;font-size:12px;}
		table.pc-t{width:100%;border-collapse:collapse;font-size:13px;}
		table.pc-t th{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);text-align:left;padding:3px 6px;}
		table.pc-t td{padding:3px 6px;}
		table.pc-t input, table.pc-t select{width:100%;border:1px solid var(--border-color);border-radius:5px;padding:4px 8px;background:var(--control-bg);font-size:13px;}
		table.pc-t .del{cursor:pointer;color:#b02a2a;font-weight:700;width:24px;text-align:center;}
		.pc-flats{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px 16px;}
		.pc-flats label{font-size:11px;color:var(--text-muted);display:block;}
		.pc-flats input{width:100%;border:1px solid var(--border-color);border-radius:5px;padding:4px 8px;background:var(--control-bg);}
		.pc-wide textarea{width:100%;border:1px solid var(--border-color);border-radius:5px;padding:6px 10px;background:var(--control-bg);font-size:12.5px;min-height:54px;}
		.pc-actions{margin-top:18px;display:flex;gap:10px;}
		.pc-hint{color:var(--text-muted);font-size:12px;margin-top:12px;}
		</style>
		<div class="pc-cols">
			<div class="pc-left"><div class="pc-list"></div></div>
			<div class="pc-right">
				<div class="pc-ed"></div>
				<div class="pc-hint pc-pick">${__("Pick a chart on the left, or start one with New Chart above.")}</div>
			</div>
		</div>
	`);
	const root = $(page.main);
	page.set_primary_action(__("New Chart"), () => openChart(null), "add");

	frappe.call({ method: "frappe.client.get_list", args: { doctype: "Certification Type",
		fields: ["name"], limit_page_length: 0, order_by: "name" } })
		.then((r) => { CERTS = (r.message || []).map((x) => x.name); });
	let PSTONES = [];
	let DTYPES = [];
	frappe.call({ method: "frappe.client.get_list", args: { doctype: "Design Type",
		fields: ["name"], limit_page_length: 0, order_by: "name" } })
		.then((r) => { DTYPES = (r.message || []).map((x) => x.name); });
	frappe.call({ method: "frappe.client.get_list", args: { doctype: "Item",
		filters: { stone_type: "Precious Stone" }, fields: ["name"], limit_page_length: 0, order_by: "name" } })
		.then((r) => { PSTONES = (r.message || []).map((x) => x.name); });
	frappe.call({ method: "jewelima.jewelima.api.get_cert_prep_context" })
		.then((r) => { QUALS = (r.message || {}).qualities || []; });
	const qualSel = (v) => `<select data-f="quality">
		<option value="">${__("any")}</option>
		${QUALS.map((q) => `<option ${v === q ? "selected" : ""}>${esc(q)}</option>`).join("")}
		${v && !QUALS.includes(v) ? `<option selected>${esc(v)}</option>` : ""}
	</select>`;

	function loadList(keep) {
		frappe.call({ method: API + ".get_price_chart_list" }).then((r) => {
			GROUPS = (r.message || {}).groups || [];
			paintList();
			if (keep && cur && cur.name) markOn(cur.name);
		});
	}
	function paintList() {
		root.find(".pc-list").html(GROUPS.map((g) => `
			<div class="pc-g">
				${g.active ? `<div class="a" data-name="${esc(g.active.name)}">
					<span class="nm">${esc(g.chart_name)}</span><span class="dt">${esc(g.active.chart_date)}</span></div>` :
				`<div class="a" data-name="${esc((g.history[0] || {}).name || "")}">
					<span class="nm">${esc(g.chart_name)}</span><span class="dt">${__("no active")}</span></div>`}
				${g.history.length ? `<div class="h">${g.history.map((h) =>
					`<span data-name="${esc(h.name)}">↳ ${esc(h.chart_date)} · ${esc(h.status)}</span>`).join("")}</div>` : ""}
			</div>`).join("") || `<div style="padding:16px;color:var(--text-muted);font-size:12.5px;">${__("No charts yet.")}</div>`);
	}
	function markOn(name) {
		root.find(".pc-g .a").removeClass("on").filter(`[data-name="${name}"]`).addClass("on");
	}
	root.on("click", ".pc-g .a, .pc-g .h span", function (e) {
		e.stopPropagation();
		const nm = $(this).data("name");
		if (nm) frappe.call({ method: API + ".get_price_chart", args: { name: nm } }).then((r) => openChart(r.message));
	});

	const BLANK = () => ({ name: null, chart_name: "", chart_date: frappe.datetime.get_today(), status: "Active",
		diamond_quality_note: "", diamond_rates: [], setting_rates: [], special_works: [],
		solitaire_min_ct: 0.07, solitaire_rates: [], certification_charges: [], precious_stone_rates: [], making_rules: [],
		colour_stone_rate: 0, precious_stone_rate: 0, job_work_pty_rate: 0,
		making_rate: 0, making_min_grams: 1, hallmark_charge: 0, certification_charge: 0,
		payment_terms: "", terms: "", signatory: "", signatory_phone: "" });

	function openChart(data) {
		cur = data || BLANK();
		if (cur.name) markOn(cur.name);
		root.find(".pc-pick").hide();
		paintEditor();
		// snapshot AFTER the controls settle — loading must never count as an edit
		setTimeout(() => { snap = JSON.stringify(cur); }, 400);
	}
	const isDirty = () => JSON.stringify(cur) !== snap;

	const num = (v) => (v || v === 0) && flt(v) ? flt(v) : "";
	// rates render Indian-style (1,85,000); commas are stripped on read
	const inr = (v) => flt(v) ? flt(v).toLocaleString("en-IN") : "";
	const deinr = (v) => flt(("" + (v || "")).replace(/,/g, ""));
	function rowsHtml(kind) {
		if (kind === "dmd") return cur.diamond_rates.map((r, i) => `
			<tr data-i="${i}"><td><input data-f="sieve_label" value="${esc(r.sieve_label || "")}" placeholder="+2 - 6.5"></td>
			<td><input data-f="from_ct" type="number" step="0.001" value="${num(r.from_ct)}"></td>
			<td><input data-f="to_ct" type="number" step="0.001" value="${num(r.to_ct)}" placeholder="${__("blank = above")}"></td>
			<td>${qualSel(r.quality || "")}</td>
			<td><input data-f="rate" class="inr" inputmode="numeric" value="${inr(r.rate)}"></td>
			<td class="del">&times;</td></tr>`).join("");
		if (kind === "sol") return cur.solitaire_rates.map((r, i) => `
			<tr data-i="${i}"><td><input data-f="from_ct" type="number" step="0.001" value="${num(r.from_ct)}"></td>
			<td><input data-f="to_ct" type="number" step="0.001" value="${num(r.to_ct)}" placeholder="${__("blank = above")}"></td>
			<td>${qualSel(r.quality || "")}</td>
			<td><input data-f="rate" class="inr" inputmode="numeric" value="${inr(r.rate)}"></td>
			<td class="del">&times;</td></tr>`).join("");
		if (kind === "ps") return cur.precious_stone_rates.map((r, i) => `
			<tr data-i="${i}"><td><select data-f="stone">
				<option value=""></option>
				${PSTONES.map((p) => `<option ${r.stone === p ? "selected" : ""}>${esc(p)}</option>`).join("")}
				${r.stone && !PSTONES.includes(r.stone) ? `<option selected>${esc(r.stone)}</option>` : ""}
			</select></td>
			<td><input data-f="rate" class="inr" inputmode="numeric" value="${inr(r.rate)}"></td>
			<td class="del">&times;</td></tr>`).join("");
		if (kind === "mk") return cur.making_rules.map((r, i) => `
			<tr data-i="${i}"><td><select data-f="design_type">
				<option value="">${__("DEFAULT (any type)")}</option>
				${DTYPES.map((t) => `<option ${r.design_type === t ? "selected" : ""}>${esc(t)}</option>`).join("")}
			</select></td>
			<td><select data-f="basis">${["Per Gram", "Per Piece"].map((b) =>
				`<option ${(r.basis || "Per Gram") === b ? "selected" : ""}>${b}</option>`).join("")}</select></td>
			<td><input data-f="rate" class="inr" inputmode="numeric" value="${inr(r.rate)}"></td>
			<td><input data-f="min_per_piece" class="inr" inputmode="numeric" value="${inr(r.min_per_piece)}" placeholder="${__("floor ₹ (Per Gram)")}"></td>
			<td class="del">&times;</td></tr>`).join("");
		if (kind === "cert") return cur.certification_charges.map((r, i) => `
			<tr data-i="${i}"><td><select data-f="certification">
				<option value=""></option>
				<option ${r.certification === "ALL LABS" ? "selected" : ""} value="ALL LABS">${__("ALL LABS (group — every lab, one price)")}</option>
				${CERTS.map((c) => `<option ${r.certification === c ? "selected" : ""}>${esc(c)}</option>`).join("")}
				${r.certification && r.certification !== "ALL LABS" && !CERTS.includes(r.certification) ? `<option selected>${esc(r.certification)}</option>` : ""}
			</select></td>
			<td><input data-f="rate" class="inr" inputmode="numeric" value="${inr(r.rate)}" placeholder="${__("0 = included")}"></td>
			<td class="del">&times;</td></tr>`).join("");
		if (kind === "set") return cur.setting_rates.map((r, i) => `
			<tr data-i="${i}"><td><input data-f="stone_ct" type="number" step="0.001" value="${num(r.stone_ct)}"></td>
			<td><input data-f="rate" class="inr" inputmode="numeric" value="${inr(r.rate)}"></td>
			<td class="del">&times;</td></tr>`).join("");
		return cur.special_works.map((r, i) => `
			<tr data-i="${i}"><td><input data-f="work_name" value="${esc(r.work_name || "")}"></td>
			<td><select data-f="basis">${["Per Gram", "Per Piece", "Per Carat"].map((b) =>
				`<option ${r.basis === b ? "selected" : ""}>${b}</option>`).join("")}</select></td>
			<td><input data-f="rate" class="inr" inputmode="numeric" value="${inr(r.rate)}"></td>
			<td class="del">&times;</td></tr>`).join("");
	}

	function paintEditor() {
		const $ed = root.find(".pc-ed").show();
		$ed.html(`
			<div class="pc-head">
				<div class="pc-nm"></div><div class="pc-dt"></div>
				${cur.name ? `<span class="pc-status ${cur.status === "Active" ? "act" : "sup"}">${esc(cur.status)}</span>
					<span style="font-size:11px;color:var(--text-muted);">${esc(cur.name)}</span>` : ""}
			</div>
			<div class="pc-flats" style="margin-top:8px;">
				<div><label>${__("Diamond quality note (letter line)")}</label><input class="pc-f" data-f="diamond_quality_note" value="${esc(cur.diamond_quality_note)}" placeholder="VVS, Colour E/F"></div>
			</div>
			<div class="pc-sec">${__("Diamond Rates (₹/ct by size bracket)")}<span class="add" data-k="dmd">+ ${__("row")}</span></div>
			<table class="pc-t" data-k="dmd"><thead><tr><th>${__("Sieve label")}</th><th>${__("From ct")}</th><th>${__("Below ct")}</th><th>${__("Quality")}</th><th>${__("Rate ₹/ct")}</th><th></th></tr></thead>
				<tbody>${rowsHtml("dmd")}</tbody></table>
			<div class="pc-sec">${__("Solitaire Rates — per-stone above the threshold leaves the diamond totals")}<span class="add" data-k="sol">+ ${__("row")}</span></div>
			<div class="pc-flats"><div><label>${__("Solitaire threshold ct / stone")}</label>
				<input class="pc-f" data-f="solitaire_min_ct" type="number" step="0.001" value="${num(cur.solitaire_min_ct)}"></div></div>
			<table class="pc-t" data-k="sol"><thead><tr><th>${__("From ct/stone")}</th><th>${__("Below ct")}</th><th>${__("Quality")}</th><th>${__("Rate ₹/ct")}</th><th></th></tr></thead>
				<tbody>${rowsHtml("sol")}</tbody></table>
			<div class="pc-sec">${__("Certification Charges — a cert on the bag missing here BLOCKS the scan")}<span class="add" data-k="cert">+ ${__("row")}</span></div>
			<table class="pc-t" data-k="cert"><thead><tr><th>${__("Certification")}</th><th>${__("Rate ₹/piece")}</th><th></th></tr></thead>
				<tbody>${rowsHtml("cert")}</tbody></table>
			<div class="pc-sec">${__("Precious Stone Rates — per stone, flat ₹/ct (rows present = a PS stone without a row blocks the scan)")}<span class="add" data-k="ps">+ ${__("row")}</span></div>
			<table class="pc-t" data-k="ps"><thead><tr><th>${__("Stone")}</th><th>${__("Rate ₹/ct")}</th><th></th></tr></thead>
				<tbody>${rowsHtml("ps")}</tbody></table>
			<div class="pc-sec">${__("Setting Rates")}<span class="add" data-k="set">+ ${__("row")}</span></div>
			<table class="pc-t" data-k="set"><thead><tr><th>${__("Stone ct")}</th><th>${__("Rate ₹")}</th><th></th></tr></thead>
				<tbody>${rowsHtml("set")}</tbody></table>
			<div class="pc-sec">${__("Special Works")}<span class="add" data-k="spw">+ ${__("row")}</span></div>
			<table class="pc-t" data-k="spw"><thead><tr><th>${__("Work")}</th><th>${__("Basis")}</th><th>${__("Rate ₹")}</th><th></th></tr></thead>
				<tbody>${rowsHtml("spw")}</tbody></table>
			<div class="pc-sec">${__("Making Charges — per design type; the DEFAULT row catches everything else. Minimum ₹ is a floor (e.g. a rate of 1,500/g with minimum 1,250 never bills below 1,250)")}<span class="add" data-k="mk">+ ${__("row")}</span></div>
			<table class="pc-t" data-k="mk"><thead><tr><th>${__("Design Type")}</th><th>${__("Basis")}</th><th>${__("Rate ₹")}</th><th>${__("Minimum ₹")}</th><th></th></tr></thead>
				<tbody>${rowsHtml("mk")}</tbody></table>
			<div class="pc-sec">${__("Flat Charges")}</div>
			<div class="pc-flats">
				<div><label>${__("Colour stone ₹/ct")}</label><input class="pc-f" data-f="colour_stone_rate" type="number" value="${num(cur.colour_stone_rate)}"></div>
				<div><label>${__("Precious stone ₹/ct")}</label><input class="pc-f" data-f="precious_stone_rate" type="number" value="${num(cur.precious_stone_rate)}"></div>
				<div><label>${__("Party-diamond job work ₹/ct")}</label><input class="pc-f" data-f="job_work_pty_rate" type="number" value="${num(cur.job_work_pty_rate)}"></div>
				<div><label>${__("Hallmark ₹/piece")}</label><input class="pc-f" data-f="hallmark_charge" type="number" value="${num(cur.hallmark_charge)}"></div>
				<div><label>${__("Certification ₹")}</label><input class="pc-f" data-f="certification_charge" type="number" value="${num(cur.certification_charge)}"></div>
			</div>
			<div class="pc-sec">${__("Letter — Terms & Signatory")}</div>
			<div class="pc-wide"><label style="font-size:11px;color:var(--text-muted);">${__("Payment terms")}</label>
				<textarea class="pc-f" data-f="payment_terms">${esc(cur.payment_terms)}</textarea></div>
			<div class="pc-wide" style="margin-top:8px;"><label style="font-size:11px;color:var(--text-muted);">${__("Other terms")}</label>
				<textarea class="pc-f" data-f="terms">${esc(cur.terms)}</textarea></div>
			<div class="pc-flats" style="margin-top:8px;">
				<div><label>${__("Signatory")}</label><input class="pc-f" data-f="signatory" value="${esc(cur.signatory)}"></div>
				<div><label>${__("Signatory phone")}</label><input class="pc-f" data-f="signatory_phone" value="${esc(cur.signatory_phone)}"></div>
			</div>
			<div class="pc-actions">
				<button class="btn btn-primary pc-save">${cur.name ? __("Save as New Version") : __("Save Chart")}</button>
				${cur.name ? `<button class="btn btn-default pc-pdf">${__("Export PDF")}</button>` : ""}
			</div>
			<div class="pc-hint">${__("Saving always creates a fresh ACTIVE version; the previous active chart of the same name is kept as history (superseded). The Sell page prices against the active chart. The PDF is the rate letter for the party.")}</div>
		`);
		const nmC = frappe.ui.form.make_control({ df: { fieldtype: "Data", label: __("Chart name (party)"), fieldname: "cn" },
			parent: $ed.find(".pc-nm").get(0), render_input: true }); nmC.refresh(); nmC.set_value(cur.chart_name);
		nmC.$input.on("input", () => { cur.chart_name = (nmC.get_value() || "").toUpperCase(); });
		const dtC = frappe.ui.form.make_control({ df: { fieldtype: "Date", label: __("Date"), fieldname: "cd" },
			parent: $ed.find(".pc-dt").get(0), render_input: true }); dtC.refresh(); dtC.set_value(cur.chart_date);
		dtC.$input.on("change", () => { cur.chart_date = dtC.get_value(); });
	}

	// simple field edits land straight on cur
	root.on("input change", ".pc-f", function () {
		cur[$(this).data("f")] = this.type === "number" ? flt($(this).val()) : $(this).val();
	});
	const KIND_ARR = { dmd: "diamond_rates", set: "setting_rates", spw: "special_works",
		sol: "solitaire_rates", cert: "certification_charges", ps: "precious_stone_rates", mk: "making_rules" };
	root.on("input change", "table.pc-t input, table.pc-t select", function () {
		const $t = $(this).closest("table.pc-t");
		const arr = cur[KIND_ARR[$t.data("k")]];
		const i = cint($(this).closest("tr").data("i"));
		const f = $(this).data("f");
		arr[i][f] = $(this).hasClass("inr") ? deinr($(this).val())
			: this.type === "number" ? flt($(this).val()) : $(this).val();
	});
	root.on("blur", "table.pc-t input.inr", function () {
		$(this).val(inr(deinr($(this).val())));
	});
	root.on("click", ".pc-sec .add", function () {
		const k = $(this).data("k");
		cur[KIND_ARR[k]].push(k === "dmd" ? { sieve_label: "", from_ct: "", to_ct: "", quality: "", rate: "" }
			: k === "sol" ? { from_ct: "", to_ct: "", quality: "", rate: "" }
			: k === "cert" ? { certification: "", rate: "" }
			: k === "ps" ? { stone: "", rate: "" }
			: k === "mk" ? { design_type: "", basis: "Per Gram", rate: "", min_per_piece: "" }
			: k === "set" ? { stone_ct: "", rate: "" } : { work_name: "", basis: "Per Piece", rate: "" });
		paintEditor();
	});
	root.on("click", "table.pc-t .del", function () {
		const $t = $(this).closest("table.pc-t");
		cur[KIND_ARR[$t.data("k")]].splice(cint($(this).closest("tr").data("i")), 1);
		paintEditor();
	});

	root.on("click", ".pc-save", () => {
		if (!(cur.chart_name || "").trim()) return frappe.show_alert({ message: __("Give the chart a name — usually the party."), indicator: "orange" }, 3);
		frappe.dom.freeze(__("Saving..."));
		frappe.call({ method: API + ".save_price_chart", args: { payload: JSON.stringify(cur) } })
			.then((r) => {
				frappe.dom.unfreeze();
				const m = r.message || {};
				frappe.show_alert({ message: __("{0} saved as the active chart.", [m.chart_name]), indicator: "green" }, 4);
				frappe.call({ method: API + ".get_price_chart", args: { name: m.name } }).then((rr) => { openChart(rr.message); loadList(true); });
			}).catch(() => frappe.dom.unfreeze());
	});
	root.on("click", ".pc-pdf", () => {
		if (isDirty()) return frappe.show_alert({ message: __("Unsaved edits — save first, the PDF prints the stored chart."), indicator: "orange" }, 4);
		open_url_post("/api/method/jewelima.jewelima.api.export_price_chart_pdf", { name: cur.name });
	});

	loadList();
};
