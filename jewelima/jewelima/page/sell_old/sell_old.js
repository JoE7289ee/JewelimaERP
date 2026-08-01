// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Sell Old — price the OLD software's export with OUR price charts.
// Upload the BILLING xlsx (flat sheet, per-row quality/colour; NT derived as
// GS − 0.2 g/ct × stone ct) or the older Sales_Quotation xlsx -> pick chart /
// gold rate / ONE diamond quality / GST -> preview every piece priced exactly
// like the Sell board -> download the JOS billing workbook (quotation inputs
// can also refill their own workbook). Nothing stored, no stock moved.
// Route: /app/sell-old

frappe.pages["sell-old"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Sell Old", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const money = (v) => (v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
	let FILE = null;     // {b64, name}
	const certSel = new Set(); // unique ids the cert charge applies to
	let PARSED = null;   // {rows, cover}
	let CHART = null;    // the picked chart's full data (get_price_chart)
	let PRICED = null;   // {rows, totals}

	$(page.main).append(`
		<style>
		#page-sell-old .container{max-width:100%;}
		.so-bar{display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin-bottom:12px;}
		.so-bar .frappe-control{margin:0;min-width:170px;}
		.so-bar .control-label{font-size:11px;color:var(--text-muted);}
		.so-file{border:2px dashed var(--border-color);border-radius:9px;padding:9px 16px;cursor:pointer;font-size:12.5px;color:var(--text-muted);}
		.so-file.has{border-color:#2e7d32;color:#1d7a33;font-weight:700;}
		.so-price{background:#1f618d;border:none;color:#fff;font-weight:800;padding:9px 24px;border-radius:8px;cursor:pointer;}
		.so-dl{background:#2e7d32;border:none;color:#fff;font-weight:800;padding:9px 24px;border-radius:8px;cursor:pointer;display:none;}
		.so-cover{font-size:12.5px;color:var(--text-muted);margin-bottom:10px;}
		.so-cover b{color:var(--text-color);}
		table.so-t{width:100%;border-collapse:collapse;font-size:12px;background:var(--fg-color);}
		table.so-t th{background:var(--control-bg);font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);padding:5px 8px;border:1px solid var(--border-color);text-align:left;white-space:nowrap;}
		table.so-t td{border:1px solid var(--border-color);padding:4px 8px;font-variant-numeric:tabular-nums;white-space:nowrap;}
		table.so-t td.num{text-align:right;}
		tr.so-flagged td{background:#fff8e6;}
		table.so-t td[title]:not([title=""]){cursor:help;}
		.so-flag{font-size:10.5px;color:#8a6d00;white-space:normal;}
		.so-tot{display:flex;gap:12px;flex-wrap:wrap;margin-top:12px;}
		.so-tile{border:1px solid var(--border-color);border-radius:9px;padding:7px 16px;background:var(--control-bg);}
		.so-tile .k{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;}
		.so-tile .v{font-size:16px;font-weight:800;}
		.so-tile.grand{border-width:2px;background:var(--fg-color);}
		.so-tile.grand .v{color:#1f618d;}
		.so-none{padding:34px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:10px;}
		</style>
		<div class="so-bar">
			<label class="so-file">${__("📄 Pick the old BILLING .xlsx")}</label>
			<input type="file" class="so-input" accept=".xlsx" style="display:none;">
			<div class="so-chart"></div>
			<div class="so-rate"></div>
			<div class="so-qual"></div>
			<div class="so-gst"></div>
			<div class="so-huid"></div>
			<div class="so-cert"></div>
			<button class="so-price">${__("Price it")}</button>
			<button class="so-dl">${__("Download priced excel ⤓")}</button>
			<button class="so-dl so-jos" style="background:#9a6b1f;">${__("JOS Billing ⤓")}</button>
		</div>
		<div class="so-cover"></div>
		<div class="so-body"><div class="so-none">${__("Upload the old software's BILLING excel to begin (the older Sales_Quotation format also works).")}</div></div>
	`);
	const root = $(page.main);
	const mk = (sel, df) => { const c = frappe.ui.form.make_control({ df, parent: root.find(sel).get(0), render_input: true }); c.refresh(); return c; };
	const fChart = mk(".so-chart", { fieldtype: "Link", label: __("Price Chart"), fieldname: "chart", options: "Price Chart", only_select: 1,
		get_query: () => ({ filters: { status: "Active" } }), onchange: () => loadQualities() });
	const fRate = mk(".so-rate", { fieldtype: "Float", label: __("Gold rate (₹/g on NT)"), fieldname: "rate" });
	const fQual = mk(".so-qual", { fieldtype: "Select", label: __("Diamond quality (whole import)"), fieldname: "q", options: "" });
	const fGst = mk(".so-gst", { fieldtype: "Float", label: __("GST %"), fieldname: "gst", default: 3 });
	fGst.set_value(3);
	const fHuid = mk(".so-huid", { fieldtype: "Float", label: __("HUID ₹ (per HUID)"), fieldname: "huid" });
	const fCert = mk(".so-cert", { fieldtype: "Float", label: __("Cert ₹ / piece"), fieldname: "cert",
		description: __("untick rows below to exempt them") });

	function loadQualities() {
		const ch = fChart.get_value();
		if (!ch) return;
		frappe.call({ method: API + ".get_price_chart", args: { name: ch }, freeze: false }).then((r) => {
			CHART = r.message || null;
			const quals = [...new Set(((r.message || {}).diamond_rates || []).map((d) => d.quality).filter(Boolean))].sort();
			fQual.df.options = [""].concat(quals).join("\n");
			fQual.refresh();
			if (quals.length === 1) fQual.set_value(quals[0]);
			applyQualityHint(quals);
		});
	}

	// the BILLING export names the quality on every row — prefill when uniform
	function applyQualityHint(quals) {
		const hint = PARSED && PARSED.cover && PARSED.cover.quality_hint;
		if (hint && !fQual.get_value() && (quals || (fQual.df.options || "").split("\n")).includes(hint))
			fQual.set_value(hint);
	}

	root.find(".so-file").on("click", () => root.find(".so-input").get(0).click());
	root.find(".so-input").on("change", function () {
		const file = this.files[0];
		if (!file) return;
		const rd = new FileReader();
		rd.onload = () => {
			FILE = { b64: rd.result, name: file.name };
			root.find(".so-file").addClass("has").text("📄 " + file.name);
			frappe.call({ method: API + ".parse_old_sale_excel", args: { filedata: FILE.b64 } }).then((r) => {
				PARSED = r.message || {};
				PRICED = null;
				root.find(".so-dl").hide();
				applyQualityHint(null);
				certSel.clear();
				(PARSED.rows || []).forEach((x) => certSel.add(x.unique_id));
				const cv = PARSED.cover || {};
				root.find(".so-cover").html(__("Invoice <b>{0}</b> · party <b>{1}</b> · <b>{2}</b> piece(s) found",
					[esc(cv.invoice_no || "—"), esc(cv.party || "—"), PARSED.count || 0]));
				paint((PARSED.rows || []).map((x) => x));
			});
		};
		rd.readAsDataURL(file);
	});

	function paint(rows, totals) {
		const priced = !!totals;
		root.find(".so-body").html(rows.length ? `
			<table class="so-t"><thead><tr>
				<th title="${__("cert applies")}"><input type="checkbox" class="so-call" checked></th>
				<th>#</th><th>${__("Unique ID")}</th><th>${__("HUID")}</th><th>${__("Item")}</th><th>${__("Design")}</th>
				<th title="${__("metal colour — goes to the JOS sheet's ITEM COLOR column, rows sort by it within each item type")}">${__("Color")}</th>
				<th class="num">${__("NT g")}</th><th class="num">${__("DMD ct/pcs")}</th><th class="num">${__("STN ct")}</th>
				${priced ? `<th class="num">${__("Gold")}</th><th class="num">${__("Making")}</th>
				<th class="num">${__("DMD (rate·bracket)")}</th><th class="num">${__("STN")}</th>
				<th class="num">${__("Cert/HUID")}</th>
				<th class="num">${__("TOTAL")}</th><th>${__("Notes")}</th>` : ""}
			</tr></thead><tbody>
			${rows.map((r) => `<tr class="${(r.flags || []).length ? "so-flagged" : ""}">
				<td><input type="checkbox" class="so-cb" data-uid="${esc(r.unique_id)}" ${certSel.has(r.unique_id) ? "checked" : ""}></td>
				<td>${r.sl}</td><td><b>${esc(r.unique_id)}</b></td><td>${esc(r.huid)}</td>
				<td>${esc(r.item)}</td><td>${esc(r.design)}</td>
				<td><input class="so-colr" data-uid="${esc(r.unique_id)}" value="${esc(r.item_color || "")}"
					style="width:70px;border:1px solid var(--border-color);border-radius:5px;padding:1px 5px;font-size:11.5px;text-transform:uppercase;"></td>
				<td class="num">${r.nt}</td>
				<td class="num">${r.dmd_ct || ""}${r.dmd_pcs ? " / " + r.dmd_pcs : ""}</td>
				<td class="num">${r.stn_ct || ""}</td>
				${priced ? `<td class="num" title="${esc((r.notes || {}).gold || "")}">₹ ${money(r.gold_va)}</td>
				<td class="num" title="${esc((r.notes || {}).mc || "")}">₹ ${money(r.mc)}</td>
				<td class="num" title="${esc((r.notes || {}).dmd || "")}">₹ ${money(r.dmd_va)}${r.dmd_rt ? `<div class="so-flag">${r.stone_ct}/st · ${money(r.dmd_rt)} @ ${esc(r.dmd_bracket)}</div>` : ""}</td>
				<td class="num" title="${esc((r.notes || {}).stn || "")}">₹ ${money(r.stn_va)}</td>
				<td class="num" title="${esc((r.notes || {}).cert || "")}">₹ ${money(r.cert_va || 0)}${r.huid_count > 1 ? `<div class="so-flag">${r.huid_count} HUID</div>` : ""}</td>
				<td class="num" title="${esc((r.notes || {}).total || "")}"><b>₹ ${money(r.total)}</b></td>
				<td class="so-flag">${(r.flags || []).map(esc).join("<br>")}</td>` : ""}
			</tr>`).join("")}</tbody></table>
			${priced ? `<div class="so-tot">
				<div class="so-tile"><div class="k">${__("Before tax")}</div><div class="v">₹ ${money(totals.before_tax)}</div></div>
				<div class="so-tile"><div class="k">GST ${totals.gst_percent}%</div><div class="v">₹ ${money(totals.gst)}</div></div>
				<div class="so-tile grand"><div class="k">${__("Invoice total")}</div><div class="v">₹ ${money(totals.invoice)}</div></div>
				<div class="so-tile" style="max-width:420px;"><div class="k">${__("In words")}</div>
					<div style="font-size:11.5px;">${esc(totals.in_words || "")}</div></div>
			</div>` : ""}`
			: `<div class="so-none">${__("No pieces found in the Design sheet.")}</div>`);
	}

	// colour is display/sort only (never priced) — patch both row sets in place
	root.on("change", ".so-colr", function () {
		const uid = $(this).data("uid");
		const v = (this.value || "").toUpperCase().trim();
		this.value = v;
		[(PARSED && PARSED.rows) || [], (PRICED && PRICED.rows) || []].forEach((set) =>
			set.forEach((x) => { if (x.unique_id === uid) x.item_color = v; }));
	});

	root.on("change", ".so-cb", function () {
		const uid = $(this).data("uid");
		this.checked ? certSel.add(uid) : certSel.delete(uid);
	});
	root.on("change", ".so-call", function () {
		const on = this.checked;
		certSel.clear();
		if (on) (PARSED && PARSED.rows || []).forEach((x) => certSel.add(x.unique_id));
		root.find(".so-cb").prop("checked", on);
	});

	root.find(".so-price").on("click", () => {
		if (!PARSED) return frappe.show_alert({ message: __("Upload the excel first."), indicator: "orange" }, 3);
		if (!fChart.get_value()) return frappe.show_alert({ message: __("Pick a price chart."), indicator: "orange" }, 3);
		frappe.call({ method: API + ".price_old_sale", args: {
			rows: JSON.stringify(PARSED.rows || []), price_chart: fChart.get_value(),
			gold_rate: fRate.get_value() || 0, quality: fQual.get_value() || "",
			gst_percent: fGst.get_value() || 0,
			huid_rate: fHuid.get_value() || 0, cert_rate: fCert.get_value() || 0,
			cert_uids: JSON.stringify([...certSel]),
		} }).then((r) => {
			PRICED = r.message || null;
			if (!PRICED) return;
			paint(PRICED.rows, PRICED.totals);
			root.find(".so-dl").show();
			if (((PARSED || {}).cover || {}).format === "billing") root.find(".so-dl").not(".so-jos").hide();
			const flagged = PRICED.rows.filter((x) => (x.flags || []).length).length;
			if (flagged) frappe.show_alert({ message: __("{0} row(s) carry notes — check the yellow lines.", [flagged]), indicator: "orange" }, 5);
		});
	});

	// the JOS billing workbook — their 42-column live-formula layout
	root.on("click", ".so-jos", () => {
		if (!PRICED || !FILE) return;
		const hasSlab = ((CHART && CHART.certification_charges) || []).some((c) => flt(c.to_ct) > 0);
		const d = new frappe.ui.Dialog({
			title: __("JOS Billing export"),
			fields: [
				{ fieldname: "karat", fieldtype: "Data", label: __("Metal purity label"), default: "18 KT", reqd: 1 },
				{ fieldname: "item_colour", fieldtype: "Data", label: __("Item colour (rows without one)"), default: "YELLOW" },
				{ fieldname: "party", fieldtype: "Data", label: __("Shop / party"),
					default: (PARSED && PARSED.cover && PARSED.cover.party) || "" },
				{ fieldname: "fname", fieldtype: "Data", label: __("File name"), reqd: 1,
					default: "JOS BILLING " + (FILE.name || "old-sale").replace(/\.xlsx$/i, "") },
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
					gold_rate: fRate.get_value() || 0, quality: fQual.get_value() || "",
					karat_label: v.karat, item_colour: (v.item_colour || "").toUpperCase().trim(),
					gst_percent: fGst.get_value() || 0,
					igi_flat: v.igi_flat || 80, igi_per_ct: v.igi_per_ct || 325, igi_threshold: v.igi_threshold || 0.10,
					huid_rate: fHuid.get_value() || 0,
					party: v.party || "",
					filename: v.fname,
				});
			},
		});
		d.show();
	});

	root.find(".so-dl").not(".so-jos").on("click", () => {
		if (!PRICED || !FILE) return;
		open_url_post("/api/method/jewelima.jewelima.api.export_old_sale_xlsx", {
			filedata: FILE.b64, priced: JSON.stringify(PRICED.rows),
			totals: JSON.stringify(PRICED.totals), filename: FILE.name,
		});
	});
};
