// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// OLD FORMAT — the legacy quotation excel, taken to the very END on one page:
// upload -> enrich what the old file is missing (per-piece COLOR, size,
// gents/ladies, shape, certification lab + the CERT NO the team marks on the
// product physically) -> price with OUR charts -> JOS billing export.
// Rows are sorted into the agreed physical order (item -> colour -> below-1g)
// and renumbered before pricing, so the JOS sheet comes out block-perfect.
// The intermediate NEW-format excel stays downloadable for records / Sell Old.
// Straight data — nothing stored; refresh and it's gone.
// Route: /app/old-format

frappe.pages["old-format"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "OLD FORMAT", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const money = (v) => (v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
	const TOKEN_FAMILY = { EF: "VVS-EF", GH: "VVS/VS-GH", SI: "SI-IJ", CZ: "CZ", CVD: "CVD" };
	let FILE = null;   // {b64, name}
	let ROWS = [];     // parsed + user-enriched rows (colour = metal colour)
	let COVER = {};
	let CHART = null;  // picked chart's full data
	let PRICED = null; // {rows, totals} — cleared by ANY edit

	$(page.main).append(`
		<style>
		#page-old-format .container{max-width:100%;}
		.of-bar{display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin-bottom:10px;}
		.of-bar .frappe-control{margin:0;min-width:140px;}
		.of-bar .control-label{font-size:11px;color:var(--text-muted);}
		.of-file{border:2px dashed var(--border-color);border-radius:9px;padding:9px 16px;cursor:pointer;font-size:12.5px;color:var(--text-muted);}
		.of-file.has{border-color:#2e7d32;color:#1d7a33;font-weight:700;}
		.of-btn{border:none;color:#fff;font-weight:800;padding:9px 20px;border-radius:8px;cursor:pointer;}
		.of-auto{background:#5b3a8e;display:none;}
		.of-dl{background:#6b7280;display:none;}
		.of-price{background:#1f618d;display:none;}
		.of-jos{background:#9a6b1f;display:none;}
		.of-cover{font-size:12.5px;color:var(--text-muted);margin-bottom:10px;}
		.of-cover b{color:var(--text-color);}
		table.of-t{width:100%;border-collapse:collapse;font-size:12px;background:var(--fg-color);}
		table.of-t th{background:var(--control-bg);font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);padding:5px 8px;border:1px solid var(--border-color);text-align:left;white-space:nowrap;}
		table.of-t td{border:1px solid var(--border-color);padding:3px 6px;font-variant-numeric:tabular-nums;white-space:nowrap;}
		table.of-t td.num{text-align:right;}
		table.of-t td[title]:not([title=""]){cursor:help;}
		table.of-t input, table.of-t select{border:1px solid var(--border-color);border-radius:5px;padding:1px 5px;font-size:11.5px;background:var(--fg-color);color:var(--text-color);}
		table.of-t input{text-transform:uppercase;}
		tr.of-flagged td{background:#fff8e6;}
		.of-flag{font-size:10.5px;color:#8a6d00;white-space:normal;}
		.of-tot{display:flex;gap:12px;flex-wrap:wrap;margin-top:12px;}
		.of-tile{border:1px solid var(--border-color);border-radius:9px;padding:7px 16px;background:var(--control-bg);}
		.of-tile .k{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;}
		.of-tile .v{font-size:16px;font-weight:800;}
		.of-tile.grand{border-width:2px;background:var(--fg-color);}
		.of-tile.grand .v{color:#1f618d;}
		.of-none{padding:34px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:10px;}
		</style>
		<div class="of-bar">
			<label class="of-file">${__("📄 Pick the OLD quotation .xlsx")}</label>
			<input type="file" class="of-input" accept=".xlsx" style="display:none;">
			<div class="of-qual"></div>
			<div class="of-party"></div>
			<div class="of-color"></div>
			<button class="of-btn of-auto">${__("Auto-number certs")}</button>
			<button class="of-btn of-dl">${__("NEW format ⤓")}</button>
		</div>
		<div class="of-bar">
			<div class="of-chart"></div>
			<div class="of-rate"></div>
			<div class="of-cq"></div>
			<div class="of-gst"></div>
			<div class="of-huid"></div>
			<div class="of-cert"></div>
			<button class="of-btn of-price">${__("Price it")}</button>
			<button class="of-btn of-jos">${__("JOS Billing ⤓")}</button>
		</div>
		<div class="of-cover"></div>
		<div class="of-body"><div class="of-none">${__("Upload the OLD quotation excel — fill COLOR (and anything else missing), tag certifications with their number, then price and export the JOS billing right here.")}</div></div>
		<datalist id="of-colors"><option>YELLOW</option><option>ROSE</option><option>WHITE</option></datalist>
		<datalist id="of-labs"><option>IGI</option><option>SGL</option><option>DHC</option><option>GIA</option></datalist>
	`);
	const root = $(page.main);
	const mk = (sel, df) => { const c = frappe.ui.form.make_control({ df, parent: root.find(sel).get(0), render_input: true }); c.refresh(); return c; };
	const fQual = mk(".of-qual", { fieldtype: "Select", label: __("Quality token"), fieldname: "q",
		options: Object.keys(TOKEN_FAMILY).join("\n"), default: "EF", onchange: () => applyToken() });
	fQual.set_value("EF");
	const fParty = mk(".of-party", { fieldtype: "Data", label: __("Shop / party"), fieldname: "party" });
	const fColor = mk(".of-color", { fieldtype: "Data", label: __("Fill COLOR on empty rows"), fieldname: "col",
		description: __("type + Enter, e.g. YELLOW") });
	const fChart = mk(".of-chart", { fieldtype: "Link", label: __("Price Chart"), fieldname: "chart", options: "Price Chart", only_select: 1,
		get_query: () => ({ filters: { status: "Active" } }), onchange: () => loadQualities() });
	const fRate = mk(".of-rate", { fieldtype: "Float", label: __("Gold rate (₹/g on NT)"), fieldname: "rate" });
	const fCq = mk(".of-cq", { fieldtype: "Select", label: __("Chart quality"), fieldname: "cq", options: "" });
	const fGst = mk(".of-gst", { fieldtype: "Float", label: __("GST %"), fieldname: "gst", default: 3 });
	fGst.set_value(3);
	const fHuid = mk(".of-huid", { fieldtype: "Float", label: __("HUID ₹ (per HUID)"), fieldname: "huid" });
	const fCert = mk(".of-cert", { fieldtype: "Float", label: __("Cert ₹ / piece"), fieldname: "cert",
		description: __("bills the rows with a Cert lab set") });

	function loadQualities() {
		const ch = fChart.get_value();
		if (!ch) return;
		frappe.call({ method: API + ".get_price_chart", args: { name: ch }, freeze: false }).then((r) => {
			CHART = r.message || null;
			const quals = [...new Set(((r.message || {}).diamond_rates || []).map((d) => d.quality).filter(Boolean))].sort();
			fCq.df.options = [""].concat(quals).join("\n");
			fCq.refresh();
			if (quals.length === 1) fCq.set_value(quals[0]);
			applyToken();
		});
	}

	// the file's token names the family — pre-pick the chart quality
	function applyToken() {
		const fam = TOKEN_FAMILY[fQual.get_value()] || "";
		if (fam && !fCq.get_value() && (fCq.df.options || "").split("\n").includes(fam)) fCq.set_value(fam);
	}

	root.find(".of-file").on("click", () => root.find(".of-input").get(0).click());
	root.find(".of-input").on("change", function () {
		const file = this.files[0];
		if (!file) return;
		const rd = new FileReader();
		rd.onload = () => {
			FILE = { b64: rd.result, name: file.name };
			root.find(".of-file").addClass("has").text("📄 " + file.name);
			frappe.call({ method: API + ".parse_old_format_excel", args: { filedata: FILE.b64 } }).then((r) => {
				const m = r.message || {};
				ROWS = m.rows || [];
				COVER = m.cover || {};
				PRICED = null;
				if (COVER.party && !fParty.get_value()) fParty.set_value(COVER.party);
				root.find(".of-cover").html(__("Invoice <b>{0}</b> · party <b>{1}</b> · <b>{2}</b> piece(s) — rows sort + renumber on pricing (item → colour → below-1g first)",
					[esc(COVER.invoice_no || "—"), esc(COVER.party || "—"), m.count || 0]));
				paint();
				root.find(".of-auto, .of-dl, .of-price").show();
				root.find(".of-jos").hide();
			});
		};
		rd.readAsDataURL(file);
	});

	function paint() {
		const priced = !!PRICED;
		const P = {};
		if (priced) PRICED.rows.forEach((x) => { P[x.unique_id] = x; });
		root.find(".of-body").html(ROWS.length ? `
			<table class="of-t"><thead><tr>
				<th>#</th><th>${__("Unique ID")}</th><th>${__("HUID")}</th><th>${__("Item")}</th><th>${__("Design")}</th>
				<th class="num">${__("GS g")}</th><th class="num">${__("NT g")}</th>
				<th class="num">${__("DMD pcs")}</th><th class="num">${__("DMD ct")}</th>
				<th>${__("COLOR")}</th><th>${__("Size")}</th><th>${__("G/L")}</th><th>${__("Shape")}</th>
				<th>${__("Cert")}</th><th title="${__("marked on the product physically — printed in the JOS export")}">${__("Cert No")}</th>
				${priced ? `<th class="num">${__("Gold")}</th><th class="num">${__("Making")}</th>
				<th class="num">${__("DMD")}</th><th class="num">${__("Cert/HUID")}</th>
				<th class="num">${__("TOTAL")}</th><th>${__("Notes")}</th>` : ""}
			</tr></thead><tbody>
			${ROWS.map((r, i) => {
				const p = P[r.unique_id] || {};
				const fl = (p.flags || []).length;
				return `<tr data-i="${i}" class="${fl ? "of-flagged" : ""}">
				<td>${r.sl}</td><td><b>${esc(r.unique_id)}</b></td><td>${esc(r.huid)}</td>
				<td>${esc(r.item)}</td><td>${esc(r.design)}</td>
				<td class="num">${r.gs}</td><td class="num">${r.nt}</td>
				<td class="num">${r.dmd_pcs || ""}</td><td class="num">${r.dmd_ct || ""}</td>
				<td><input data-f="colour" list="of-colors" value="${esc(r.colour)}" style="width:76px;"></td>
				<td><input data-f="size" value="${esc(r.size)}" style="width:48px;"></td>
				<td><select data-f="style"><option value=""></option>
					<option ${r.style === "GENTS" ? "selected" : ""}>GENTS</option>
					<option ${r.style === "LADIES" ? "selected" : ""}>LADIES</option></select></td>
				<td><input data-f="shape" value="${esc(r.shape)}" style="width:64px;"></td>
				<td><input data-f="cert" list="of-labs" value="${esc(r.cert)}" style="width:56px;"></td>
				<td><input data-f="cert_no" value="${esc(r.cert_no)}" style="width:56px;"></td>
				${priced ? `<td class="num" title="${esc((p.notes || {}).gold || "")}">₹ ${money(p.gold_va)}</td>
				<td class="num" title="${esc((p.notes || {}).mc || "")}">₹ ${money(p.mc)}</td>
				<td class="num" title="${esc((p.notes || {}).dmd || "")}">₹ ${money(p.dmd_va)}${p.dmd_rt ? `<div class="of-flag">${p.stone_ct}/st @ ${esc(p.dmd_bracket)}</div>` : ""}</td>
				<td class="num" title="${esc((p.notes || {}).cert || "")}">₹ ${money(p.cert_va || 0)}</td>
				<td class="num" title="${esc((p.notes || {}).total || "")}"><b>₹ ${money(p.total)}</b></td>
				<td class="of-flag">${(p.flags || []).map(esc).join("<br>")}</td>` : ""}
			</tr>`; }).join("")}</tbody></table>
			${priced ? `<div class="of-tot">
				<div class="of-tile"><div class="k">${__("Before tax")}</div><div class="v">₹ ${money(PRICED.totals.before_tax)}</div></div>
				<div class="of-tile"><div class="k">${__("HUID / Hallmark")}</div><div class="v">₹ ${money(PRICED.totals.huid_total)}</div>
					<div style="font-size:10.5px;color:var(--text-muted);">${__("{0} HUID on {1} pc", [PRICED.totals.huid_count || 0, PRICED.totals.huid_pieces || 0])}</div></div>
				<div class="of-tile"><div class="k">${__("Certification")}</div><div class="v">₹ ${money(PRICED.totals.cert_total)}</div>
					<div style="font-size:10.5px;color:var(--text-muted);">${__("{0} of {1} pc tagged", [PRICED.totals.cert_pieces || 0, ROWS.length])}</div></div>
				<div class="of-tile"><div class="k">GST ${PRICED.totals.gst_percent}%</div><div class="v">₹ ${money(PRICED.totals.gst)}</div></div>
				<div class="of-tile grand"><div class="k">${__("Invoice total")}</div><div class="v">₹ ${money(PRICED.totals.invoice)}</div></div>
				<div class="of-tile" style="max-width:420px;"><div class="k">${__("In words")}</div>
					<div style="font-size:11.5px;">${esc(PRICED.totals.in_words || "")}</div></div>
			</div>` : ""}`
			: `<div class="of-none">${__("No pieces found in the Design sheet.")}</div>`);
	}

	root.on("change", "table.of-t [data-f]", function () {
		const i = cint($(this).closest("tr").data("i"));
		const f = $(this).data("f");
		let v = ($(this).val() || "").trim();
		if (f !== "size" && f !== "cert_no") v = v.toUpperCase();
		if (this.tagName === "INPUT") this.value = v;
		ROWS[i][f] = v;
		if (PRICED) { PRICED = null; root.find(".of-jos").hide(); paint(); }
	});

	fColor.$input.on("keydown", (e) => {
		if (e.key !== "Enter") return;
		const v = (fColor.get_value() || "").trim().toUpperCase();
		if (!v) return;
		let n = 0;
		ROWS.forEach((r) => { if (!r.colour) { r.colour = v; n++; } });
		if (n && PRICED) { PRICED = null; root.find(".of-jos").hide(); }
		paint();
		frappe.show_alert({ message: __("{0} row(s) coloured {1}.", [n, v]), indicator: "green" }, 3);
	});

	root.on("click", ".of-auto", () => {
		let next = 1 + Math.max(0, ...ROWS.map((r) => cint(r.cert_no) || 0));
		let n = 0;
		ROWS.forEach((r) => { if (r.cert && !r.cert_no) { r.cert_no = String(next++); n++; } });
		if (n && PRICED) { PRICED = null; root.find(".of-jos").hide(); }
		paint();
		frappe.show_alert({ message: n ? __("{0} cert(s) numbered.", [n]) : __("Nothing to number — set a Cert lab first."), indicator: n ? "green" : "orange" }, 3);
	});

	function readyCheck() {
		if (!ROWS.length) return false;
		const missing = ROWS.filter((r) => !r.colour).length;
		if (missing) { frappe.show_alert({ message: __("{0} row(s) still have no COLOR — fill them first.", [missing]), indicator: "orange" }, 4); return false; }
		const half = ROWS.filter((r) => (r.cert && !r.cert_no) || (!r.cert && r.cert_no)).length;
		if (half) { frappe.show_alert({ message: __("{0} row(s) have a Cert lab without a number (or the other way) — complete them.", [half]), indicator: "orange" }, 4); return false; }
		return true;
	}

	// the agreed physical order: item type -> colour -> below-1g first
	function sortRenumber() {
		ROWS.sort((a, b) => (a.item || "").localeCompare(b.item || "")
			|| (a.colour || "").localeCompare(b.colour || "")
			|| ((flt(a.nt) < 1 ? 0 : 1) - (flt(b.nt) < 1 ? 0 : 1))
			|| (cint(a.sl) - cint(b.sl)));
		ROWS.forEach((r, i) => { r.sl = i + 1; });
	}

	// payload rows in Sell Old vocabulary: COLOUR -> item_color, SHAPE -> Colour col
	function payloadRows() {
		return ROWS.map((r) => Object.assign({}, r, {
			item_color: r.colour, colour: r.shape || "",
			quality_token: fQual.get_value() || "",
		}));
	}

	root.on("click", ".of-dl", () => {
		if (!readyCheck()) return;
		open_url_post("/api/method/jewelima.jewelima.api.export_old_format_billing", {
			rows: JSON.stringify(ROWS), quality_token: fQual.get_value() || "EF",
			party: fParty.get_value() || "",
			filename: "NEW " + (FILE.name || "format").replace(/\.xlsx$/i, ""),
		});
	});

	root.on("click", ".of-price", () => {
		if (!readyCheck()) return;
		if (!fChart.get_value()) return frappe.show_alert({ message: __("Pick a price chart."), indicator: "orange" }, 3);
		sortRenumber();
		frappe.call({ method: API + ".price_old_sale", args: {
			rows: JSON.stringify(payloadRows()), price_chart: fChart.get_value(),
			gold_rate: fRate.get_value() || 0, quality: fCq.get_value() || "",
			gst_percent: fGst.get_value() || 0,
			huid_rate: fHuid.get_value() || 0, cert_rate: fCert.get_value() || 0,
			cert_uids: JSON.stringify(ROWS.filter((r) => r.cert).map((r) => r.unique_id)),
		} }).then((r) => {
			PRICED = r.message || null;
			if (!PRICED) return;
			paint();
			root.find(".of-jos").show();
			const flagged = PRICED.rows.filter((x) => (x.flags || []).length).length;
			if (flagged) frappe.show_alert({ message: __("{0} row(s) carry notes — check the yellow lines.", [flagged]), indicator: "orange" }, 5);
		});
	});

	root.on("click", ".of-jos", () => {
		if (!PRICED || !FILE) return;
		const hasSlab = ((CHART && CHART.certification_charges) || []).some((c) => flt(c.to_ct) > 0);
		const d = new frappe.ui.Dialog({
			title: __("JOS Billing export"),
			fields: [
				{ fieldname: "karat", fieldtype: "Data", label: __("Metal purity label"), default: "18 KT", reqd: 1 },
				{ fieldname: "item_colour", fieldtype: "Data", label: __("Item colour (rows without one)"), default: "YELLOW" },
				{ fieldname: "party", fieldtype: "Data", label: __("Shop / party"), default: fParty.get_value() || "" },
				{ fieldname: "fname", fieldtype: "Data", label: __("File name"), reqd: 1,
					default: "JOS BILLING " + (FILE.name || "old-format").replace(/\.xlsx$/i, "") },
			].concat(hasSlab ? [
				{ fieldname: "slab_note", fieldtype: "HTML",
					options: "<div class='text-muted' style='font-size:12px;'>" + __("IGI comes from the price chart's certification slab (single-stone pieces take the Solitaire tiers).") + "</div>" },
			] : [
				{ fieldname: "igi_flat", fieldtype: "Float", label: __("IGI flat ₹ (up to threshold)"), default: 80 },
				{ fieldname: "igi_per_ct", fieldtype: "Float", label: __("IGI ₹/ct (above threshold)"), default: 325 },
				{ fieldname: "igi_threshold", fieldtype: "Float", label: __("IGI threshold (ct)"), default: 0.10 },
			]),
			primary_action_label: __("Download"),
			primary_action(v) {
				d.hide();
				open_url_post("/api/method/jewelima.jewelima.api.export_old_sale_jos", {
					priced: JSON.stringify(PRICED.rows), price_chart: fChart.get_value(),
					gold_rate: fRate.get_value() || 0, quality: fCq.get_value() || "",
					karat_label: v.karat, item_colour: (v.item_colour || "").toUpperCase().trim(),
					gst_percent: fGst.get_value() || 0,
					igi_flat: v.igi_flat || 80, igi_per_ct: v.igi_per_ct || 325, igi_threshold: v.igi_threshold || 0.10,
					huid_rate: fHuid.get_value() || 0,
					party: v.party || "", filename: v.fname,
				});
			},
		});
		d.show();
	});
};
