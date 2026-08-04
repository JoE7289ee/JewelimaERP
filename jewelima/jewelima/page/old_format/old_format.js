// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// OLD FORMAT — the legacy quotation excel taken to the very END, in TWO
// states so the screen only carries what the step needs:
//
//   PREP   — enrich the pieces: tick rows -> bulk-apply COLOR / CERT lab /
//            HUID PENDING, fine-tune per row, then Sort & Number (item ->
//            colour -> below-1g -> GW) to stamp the SL the team marks
//            physically; the GW order is how a piece is found from the sheet.
//   EXPORT — pricing only: chart / rates / Price it / JOS billing download
//            (rows are locked here; go back to prep to change anything).
//
// Save keeps the working session as an Old Format Import doc — import
// today, price and export another day (JOS download marks it Exported).
// Route: /app/old-format

frappe.pages["old-format"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "OLD FORMAT", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const money = (v) => (v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
	const TOKEN_FAMILY = { EF: "VVS-EF", GH: "VVS/VS-GH", SI: "SI-IJ", CZ: "CZ", CVD: "CVD" };
	let FILE = null;    // {b64, name}
	let ROWS = [];      // parsed + user-enriched rows (colour = metal colour)
	let COVER = {};
	let CHART = null;   // picked chart's full data
	let PRICED = null;  // {rows, totals}
	let STATE = "prep"; // "prep" | "export"
	let SESSION = null; // Old Format Import name when saved/loaded
	let TITLE = "";     // the saved session's name-as-shown (Save as… sets it)
	let LOADING = false; // guards the session picker's onchange during set_value
	let SORTED = false; // Sort & Number has been run since the last edit
	const SEL = new Set(); // selected unique_ids (prep bulk ops)

	$(page.main).append(`
		<style>
		#page-old-format .container{max-width:100%;}
		.of-bar{display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin-bottom:10px;}
		.of-bar .frappe-control{margin:0;min-width:140px;}
		.of-bar .control-label{font-size:11px;color:var(--text-muted);}
		.of-file{border:2px dashed var(--border-color);border-radius:9px;padding:9px 16px;cursor:pointer;font-size:12.5px;color:var(--text-muted);}
		.of-file.has{border-color:#2e7d32;color:#1d7a33;font-weight:700;}
		.of-btn{border:none;color:#fff;font-weight:800;padding:9px 20px;border-radius:8px;cursor:pointer;}
		.of-btn:disabled{opacity:.45;cursor:not-allowed;}
		.of-sortnum{background:#5b3a8e;}
		.of-goexport{background:#1f618d;}
		.of-back{background:#6b7280;}
		.of-price{background:#1f618d;}
		.of-jos{background:#9a6b1f;}
		.of-dl{background:#6b7280;}
		.of-bulk{display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:var(--control-bg);
			border:1px solid var(--border-color);border-radius:10px;padding:8px 14px;margin-bottom:10px;}
		.of-bulk .lbl{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);font-weight:700;}
		.of-bulk input{border:1px solid var(--border-color);border-radius:6px;padding:3px 8px;font-size:12px;
			text-transform:uppercase;width:96px;background:var(--fg-color);color:var(--text-color);}
		.of-bulk .bapply{border:none;border-radius:6px;padding:4px 12px;font-size:11.5px;font-weight:700;color:#fff;background:#1f618d;cursor:pointer;}
		.of-bulk .bapply.alt{background:#5b3a8e;}
		.of-bulk .sep{width:1px;height:22px;background:var(--border-color);}
		.of-selcount{font-size:12px;font-weight:800;}
		.of-status{font-size:11.5px;color:var(--text-muted);margin-left:auto;}
		.of-status b{color:#a15c00;}
		.of-cover{font-size:12.5px;color:var(--text-muted);margin-bottom:10px;}
		.of-cover b{color:var(--text-color);}
		table.of-t{width:100%;border-collapse:collapse;font-size:12px;background:var(--fg-color);}
		table.of-t th{background:var(--control-bg);font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);padding:5px 8px;border:1px solid var(--border-color);text-align:left;white-space:nowrap;}
		table.of-t td{border:1px solid var(--border-color);padding:3px 6px;font-variant-numeric:tabular-nums;white-space:nowrap;}
		table.of-t td.num{text-align:right;}
		table.of-t td[title]:not([title=""]){cursor:help;}
		table.of-t input:not([type=checkbox]), table.of-t select{border:1px solid var(--border-color);border-radius:5px;padding:1px 5px;font-size:11.5px;background:var(--fg-color);color:var(--text-color);}
		table.of-t input:not([type=checkbox]){text-transform:uppercase;}
		table.of-t input[type=checkbox]{width:14px;height:14px;accent-color:#1f618d;cursor:pointer;}
		tr.of-rowsel td{background:#eef4fb;}
		html[data-theme="dark"] tr.of-rowsel td{background:#1d2a3a;}
		tr.of-flagged td{background:#fff8e6;}
		.of-flag{font-size:10.5px;color:#8a6d00;white-space:normal;}
		.of-tot{display:flex;gap:12px;flex-wrap:wrap;margin-top:12px;}
		.of-tile{border:1px solid var(--border-color);border-radius:9px;padding:7px 16px;background:var(--control-bg);}
		.of-tile .k{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;}
		.of-tile .v{font-size:16px;font-weight:800;}
		.of-tile.grand{border-width:2px;background:var(--fg-color);}
		.of-tile.grand .v{color:#1f618d;}
		.of-none{padding:34px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:10px;}
		.of-info{display:flex;gap:12px;flex-wrap:wrap;align-items:stretch;margin-bottom:10px;}
		.of-info .of-tile .v{font-size:15px;}
		.of-info .sub{font-size:10.5px;color:var(--text-muted);}
		table.of-mx{border-collapse:collapse;font-size:11px;}
		table.of-mx th, table.of-mx td{border:1px solid var(--border-color);padding:2px 8px;text-align:right;}
		table.of-mx th{background:var(--control-bg);font-size:9.5px;text-transform:uppercase;color:var(--text-muted);}
		table.of-mx td:first-child, table.of-mx th:first-child{text-align:left;}
		</style>
		<div class="of-bar of-bar-prep">
			<label class="of-file">${__("📄 Pick the OLD quotation .xlsx")}</label>
			<input type="file" class="of-input" accept=".xlsx" style="display:none;">
			<div class="of-sess"></div>
			<div class="of-qual"></div>
			<div class="of-party"></div>
			<button class="of-btn of-save" style="display:none;background:#2e7d32;">${__("Save as…")}</button>
			<button class="of-btn of-sortnum" style="display:none;">${__("Sort & Number")}</button>
			<button class="of-btn of-goexport" style="display:none;">${__("Continue to Export →")}</button>
		</div>
		<div class="of-bulk" style="display:none;">
			<span class="of-selcount">0 ${__("selected")}</span>
			<button class="bapply alt of-selclear" style="background:#8a2f2f;">${__("Clear")}</button>
			<span class="sep"></span>
			<span class="lbl">${__("Color")}</span>
			<input class="of-bcolor" list="of-colors">
			<button class="bapply of-bcolor-sel">${__("→ selected")}</button>
			<button class="bapply alt of-bcolor-empty">${__("→ all empty")}</button>
			<span class="sep"></span>
			<span class="lbl">${__("G/L")}</span>
			<select class="of-bgl" style="border:1px solid var(--border-color);border-radius:6px;padding:3px 6px;font-size:12px;background:var(--fg-color);color:var(--text-color);">
				<option value=""></option>
				<option>GENTS</option>
				<option>LADIES</option>
				<option>GENTS / LADIES</option>
			</select>
			<button class="bapply of-bgl-sel">${__("→ selected")}</button>
			<span class="sep"></span>
			<span class="lbl">${__("Cert lab")}</span>
			<input class="of-bcert" list="of-labs">
			<button class="bapply of-bcert-sel">${__("→ selected")}</button>
			<span class="sep"></span>
			<span class="lbl">${__("Size")}</span>
			<input class="of-bsize" style="text-transform:none;width:70px;">
			<button class="bapply of-bsize-sel">${__("→ selected")}</button>
			<span class="sep"></span>
			<span class="lbl">${__("Shape")}</span>
			<select class="of-bshape" style="border:1px solid var(--border-color);border-radius:6px;padding:3px 6px;font-size:12px;background:var(--fg-color);color:var(--text-color);">
				<option value=""></option>
				<option>OVAL</option>
				<option>CHAIN</option>
			</select>
			<button class="bapply of-bshape-sel">${__("→ selected")}</button>
			<span class="sep"></span>
			<button class="bapply alt of-bhuid-pend">${__("HUID PENDING → selected")}</button>
			<span class="of-status"></span>
		</div>
		<div class="of-bar of-bar-export" style="display:none;">
			<button class="of-btn of-back">${__("← Back to Prep")}</button>
			<div class="of-chart"></div>
			<div class="of-rate"></div>
			<div class="of-cq"></div>
			<div class="of-gst"></div>
			<button class="of-btn of-price">${__("Price it")}</button>
			<button class="of-btn of-jos" style="display:none;">${__("JOS Billing ⤓")}</button>
			<button class="of-btn of-dl">${__("NEW format ⤓")}</button>
		</div>
		<div class="of-cover"></div>
		<div class="of-info"></div>
		<div class="of-body"><div class="of-none">${__("Upload the OLD quotation excel. PREP: bulk-fill COLOR, tag certifications, Sort & Number. EXPORT: price it and download the JOS billing.")}</div></div>
		<datalist id="of-colors"><option>YELLOW</option><option>ROSE</option><option>WHITE</option></datalist>
		<datalist id="of-labs"><option>IGI</option><option>SGL</option><option>DHC</option><option>GIA</option></datalist>
		<datalist id="of-shapes"><option>OVAL</option><option>CHAIN</option></datalist>
	`);
	const root = $(page.main);
	const mk = (sel, df) => { const c = frappe.ui.form.make_control({ df, parent: root.find(sel).get(0), render_input: true }); c.refresh(); return c; };
	const fQual = mk(".of-qual", { fieldtype: "Select", label: __("Quality token"), fieldname: "q",
		options: Object.keys(TOKEN_FAMILY).join("\n"), default: "EF", onchange: () => applyToken() });
	fQual.set_value("EF");
	const fParty = mk(".of-party", { fieldtype: "Data", label: __("Shop / party"), fieldname: "party" });
	const fSess = mk(".of-sess", { fieldtype: "Link", label: __("Saved import"), fieldname: "sess",
		options: "Old Format Import", only_select: 1, onchange: () => { if (!LOADING) loadSession(fSess.get_value()); } });
	const fChart = mk(".of-chart", { fieldtype: "Link", label: __("Price Chart"), fieldname: "chart", options: "Price Chart", only_select: 1,
		get_query: () => ({ filters: { status: "Active" } }), onchange: () => loadQualities() });
	const fRate = mk(".of-rate", { fieldtype: "Float", label: __("Gold rate (₹/g on NT)"), fieldname: "rate" });
	const fCq = mk(".of-cq", { fieldtype: "Select", label: __("Chart quality"), fieldname: "cq", options: "" });
	const fGst = mk(".of-gst", { fieldtype: "Float", label: __("GST %"), fieldname: "gst", default: 3 });
	fGst.set_value(3);

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

	function applyToken() {
		const fam = TOKEN_FAMILY[fQual.get_value()] || "";
		if (fam && !fCq.get_value() && (fCq.df.options || "").split("\n").includes(fam)) fCq.set_value(fam);
	}

	function setState(st) {
		STATE = st;
		root.find(".of-bar-prep, .of-bulk").toggle(st === "prep");
		root.find(".of-bulk").toggle(st === "prep" && !!ROWS.length);
		root.find(".of-bar-export").toggle(st === "export");
		paint();
	}

	function refreshSaveBtn() {
		root.find(".of-save").text(SESSION ? __("Update") : __("Save as…"));
	}

	function invalidate() {
		SORTED = false;
		PRICED = null;
		root.find(".of-jos").hide();
	}

	// each row wears a whisper of its assigned colour (selection/flags win —
	// they paint the tds, the tint sits on the tr underneath)
	const TINTS = { YELLOW: "rgba(212,166,40,.14)", ROSE: "rgba(214,106,128,.14)", WHITE: "rgba(120,134,150,.12)" };
	const tintOf = (c) => {
		if (!c) return "";
		if (TINTS[c]) return TINTS[c];
		let h = 0;
		for (const ch of c) h = (h * 31 + ch.charCodeAt(0)) % 360;
		return "hsla(" + h + ",60%,50%,.12)";
	};

	// a HUID cell bills its 6-char codes; PENDING = hallmarked, code not typed
	const huidCount = (h) => (String(h || "").toUpperCase().match(/[A-Z0-9]+/g) || [])
		.filter((t) => t.length === 6 || t === "PENDING").length;

	function refreshStatus() {
		const noCol = ROWS.filter((r) => !r.colour).length;
		const certs = ROWS.filter((r) => r.cert).length;
		root.find(".of-selcount").text(__("{0} selected", [SEL.size]));
		root.find(".of-status").html(
			(noCol ? "<b>" + __("{0} uncoloured", [noCol]) + "</b> · " : __("all coloured") + " · ")
			+ __("{0} cert-tagged", [certs])
			+ " · " + (SORTED ? __("numbered ✓") : __("not numbered")));
	}

	function paintInfo() {
		if (!ROWS.length) return root.find(".of-info").empty();
		const gw = ROWS.reduce((a, r) => a + flt(r.gs), 0);
		const huids = ROWS.reduce((a, r) => a + huidCount(r.huid), 0);
		const labs = {};
		ROWS.forEach((r) => { if (r.cert) labs[r.cert] = (labs[r.cert] || 0) + 1; });
		const certed = Object.values(labs).reduce((a, b) => a + b, 0);
		// item type x colour matrix
		const colours = [...new Set(ROWS.map((r) => r.colour || "—"))].sort();
		const items = [...new Set(ROWS.map((r) => r.item || "—"))].sort();
		const cell = {};
		ROWS.forEach((r) => {
			const k = (r.item || "—") + "|" + (r.colour || "—");
			cell[k] = (cell[k] || 0) + 1;
		});
		const mx = `<table class="of-mx"><thead><tr><th>${__("Item")}</th>
			${colours.map((c) => `<th>${esc(c)}</th>`).join("")}<th>${__("Total")}</th></tr></thead><tbody>
			${items.map((it) => `<tr><td><b>${esc(it)}</b></td>
				${colours.map((c) => `<td>${cell[it + "|" + c] || ""}</td>`).join("")}
				<td><b>${ROWS.filter((r) => (r.item || "—") === it).length}</b></td></tr>`).join("")}
			</tbody></table>`;
		root.find(".of-info").html(`
			<div class="of-tile"><div class="k">${__("Total GW")}</div><div class="v">${gw.toFixed(3)} g</div>
				<div class="sub">${ROWS.length} ${__("pieces")}</div></div>
			<div class="of-tile"><div class="k">${__("HUIDs")}</div><div class="v">${huids}</div>
				<div class="sub">${__("incl. PENDING")}</div></div>
			<div class="of-tile"><div class="k">${__("Certified")}</div><div class="v">${certed}</div>
				<div class="sub">${Object.keys(labs).sort().map((l) => esc(l) + " × " + labs[l]).join(" · ") || __("none")}</div></div>
			<div class="of-tile" style="padding:6px 10px;">${mx}</div>`);
	}

	function loadSession(name) {
		if (!name) return;
		frappe.call({ method: API + ".get_old_format_session", args: { name } }).then((r) => {
			const m = r.message || {};
			SESSION = m.name;
			TITLE = m.title || "";
			ROWS = m.rows || [];
			COVER = m.cover || {};
			SORTED = !!m.sorted;
			PRICED = null;
			SEL.clear();
			LASTSEL = null;
			FILE = { name: m.source_file || m.title };
			fParty.set_value(m.party || "");
			fQual.set_value(m.quality_token || "EF");
			root.find(".of-file").addClass("has").text("💾 " + m.title);
			root.find(".of-cover").html(__("Saved import <b>{0}</b> ({1}) · party <b>{2}</b> · <b>{3}</b> piece(s)",
				[esc(m.title), esc(m.status), esc(m.party || "—"), ROWS.length]));
			root.find(".of-save, .of-sortnum, .of-goexport").show();
			root.find(".of-jos").hide();
			refreshSaveBtn();
			setState("prep");
		});
	}

	function saveSession(status, silent) {
		if (!ROWS.length) return;
		frappe.call({ method: API + ".save_old_format_session", args: { name: SESSION || undefined,
			payload: JSON.stringify({
				title: TITLE || (FILE && FILE.name) || "Old format import",
				party: fParty.get_value() || "", invoice_no: COVER.invoice_no || "",
				source_file: (FILE && FILE.name) || "", quality_token: fQual.get_value() || "EF",
				rows: ROWS, cover: COVER, sorted: SORTED, status: status || undefined,
			}) } }).then((r) => {
			const m = r.message || {};
			SESSION = m.name;
			TITLE = m.title || TITLE;
			LOADING = true;
			fSess.set_value(SESSION);
			LOADING = false;
			refreshSaveBtn();
			if (!silent) frappe.show_alert({ message: __("{0} saved — pick it under Saved import to continue later.", [m.title || m.name]), indicator: "green" }, 5);
		});
	}
	// first save asks for the name (Save as…); a saved session just updates
	root.on("click", ".of-save", () => {
		if (!ROWS.length) return;
		if (SESSION) return saveSession();
		frappe.prompt({ fieldname: "t", fieldtype: "Data", label: __("Save as"), reqd: 1,
			default: TITLE || ((FILE && FILE.name) || "").replace(/\.xlsx$/i, "") },
			(v) => { TITLE = (v.t || "").trim(); saveSession(); }, __("Save this import"));
	});

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
				SESSION = null;
				TITLE = "";
				LOADING = true;
				fSess.set_value("");
				LOADING = false;
				refreshSaveBtn();
				SEL.clear();
				LASTSEL = null;
				invalidate();
				if (COVER.party && !fParty.get_value()) fParty.set_value(COVER.party);
				root.find(".of-cover").html(__("Invoice <b>{0}</b> · party <b>{1}</b> · <b>{2}</b> piece(s)",
					[esc(COVER.invoice_no || "—"), esc(COVER.party || "—"), m.count || 0]));
				root.find(".of-save, .of-sortnum, .of-goexport").show();
				setState("prep");
			});
		};
		rd.readAsDataURL(file);
	});

	// ------------------------------------------------------------- painting
	function paint() {
		if (!ROWS.length) return;
		if (STATE === "prep") paintPrep(); else paintExport();
		paintInfo();
		refreshStatus();
	}

	function paintPrep() {
		root.find(".of-body").html(`
			<table class="of-t"><thead><tr>
				<th><input type="checkbox" class="of-selall"></th>
				<th>#</th><th>${__("Unique ID")}</th><th>${__("HUID")}</th><th>${__("Item")}</th><th>${__("Design")}</th>
				<th class="num">${__("GS g")}</th><th class="num">${__("NT g")}</th>
				<th class="num">${__("DMD pcs")}</th><th class="num">${__("DMD ct")}</th>
				<th>${__("COLOR")}</th><th>${__("Size")}</th><th>${__("G/L")}</th><th>${__("Shape")}</th>
				<th>${__("Cert")}</th>
			</tr></thead><tbody>
			${ROWS.map((r, i) => `<tr data-i="${i}" class="${SEL.has(r.unique_id) ? "of-rowsel" : ""}" style="background:${tintOf(r.colour)}">
				<td><input type="checkbox" class="of-sel" data-uid="${esc(r.unique_id)}" ${SEL.has(r.unique_id) ? "checked" : ""}></td>
				<td>${r.sl}</td><td><b>${esc(r.unique_id)}</b></td>
				<td><input data-f="huid" value="${esc(r.huid)}" style="width:88px;"></td>
				<td>${esc(r.item)}</td><td>${esc(r.design)}</td>
				<td class="num">${r.gs}</td><td class="num">${r.nt}</td>
				<td class="num">${r.dmd_pcs || ""}</td><td class="num">${r.dmd_ct || ""}</td>
				<td><input data-f="colour" list="of-colors" value="${esc(r.colour)}" style="width:76px;"></td>
				<td><input data-f="size" value="${esc(r.size)}" style="width:48px;"></td>
				<td><select data-f="style"><option value=""></option>
					<option ${r.style === "GENTS" ? "selected" : ""}>GENTS</option>
					<option ${r.style === "LADIES" ? "selected" : ""}>LADIES</option>
					<option ${r.style === "GENTS / LADIES" ? "selected" : ""}>GENTS / LADIES</option></select></td>
				<td><input data-f="shape" list="of-shapes" value="${esc(r.shape)}" style="width:64px;"></td>
				<td><input data-f="cert" list="of-labs" value="${esc(r.cert)}" style="width:56px;"></td>
			</tr>`).join("")}</tbody></table>`);
	}

	function paintExport() {
		const priced = !!PRICED;
		const P = {};
		if (priced) PRICED.rows.forEach((x) => { P[x.unique_id] = x; });
		root.find(".of-body").html(`
			<table class="of-t"><thead><tr>
				<th>#</th><th>${__("Unique ID")}</th><th>${__("Item")}</th><th>${__("COLOR")}</th>
				<th class="num">${__("NT g")}</th><th class="num">${__("DMD pcs")}</th><th class="num">${__("DMD ct")}</th>
				<th>${__("HUID")}</th><th>${__("Cert")}</th>
				${priced ? `<th class="num">${__("Gold")}</th><th class="num">${__("Making")}</th>
				<th class="num">${__("DMD")}</th><th class="num">${__("Cert/HUID")}</th>
				<th class="num">${__("TOTAL")}</th>` : ""}
			</tr></thead><tbody>
			${ROWS.map((r) => {
				const p = P[r.unique_id] || {};
				const fl = (p.flags || []).length;
				return `<tr class="${fl ? "of-flagged" : ""}" style="background:${tintOf(r.colour)}">
				<td>${r.sl}</td><td><b>${esc(r.unique_id)}</b></td><td>${esc(r.item)}</td><td>${esc(r.colour)}</td>
				<td class="num">${r.nt}</td><td class="num">${r.dmd_pcs || ""}</td><td class="num">${r.dmd_ct || ""}</td>
				<td>${esc(r.huid)}</td><td>${esc(r.cert)}</td>
				${priced ? `<td class="num" title="${esc((p.notes || {}).gold || "")}">₹ ${money(p.gold_va)}</td>
				<td class="num" title="${esc((p.notes || {}).mc || "")}">₹ ${money(p.mc)}</td>
				<td class="num" title="${esc((p.notes || {}).dmd || "")}">₹ ${money(p.dmd_va)}${p.dmd_rt ? `<div class="of-flag">${p.stone_ct}/st @ ${esc(p.dmd_bracket)}</div>` : ""}</td>
				<td class="num" title="${esc([(p.notes || {}).cert || ""].concat(p.flags || []).filter(Boolean).join(" · "))}">₹ ${money(p.cert_va || 0)}</td>
				<td class="num" title="${esc((p.notes || {}).total || "")}"><b>₹ ${money(p.total)}</b></td>` : ""}
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
			</div>` : ""}`);
	}

	// ------------------------------------------------------ prep interactions
	let LASTSEL = null; // row index of the last clicked checkbox (shift ranges)
	root.on("click", ".of-sel", function (e) {
		const i = cint($(this).closest("tr").data("i"));
		const on = this.checked;
		if (e.shiftKey && LASTSEL !== null && LASTSEL !== i) {
			const [a, b] = [Math.min(LASTSEL, i), Math.max(LASTSEL, i)];
			for (let k = a; k <= b; k++) on ? SEL.add(ROWS[k].unique_id) : SEL.delete(ROWS[k].unique_id);
			LASTSEL = i;
			paint();
			return;
		}
		LASTSEL = i;
		on ? SEL.add($(this).data("uid")) : SEL.delete($(this).data("uid"));
		$(this).closest("tr").toggleClass("of-rowsel", on);
		refreshStatus();
	});
	root.on("click", ".of-selclear", () => {
		SEL.clear();
		paint();
	});
	root.on("change", ".of-selall", function () {
		SEL.clear();
		if (this.checked) ROWS.forEach((r) => SEL.add(r.unique_id));
		paint();
	});

	root.on("change", "table.of-t [data-f]", function () {
		const i = cint($(this).closest("tr").data("i"));
		const f = $(this).data("f");
		let v = ($(this).val() || "").trim();
		if (f !== "size") v = v.toUpperCase();
		if (this.tagName === "INPUT") this.value = v;
		ROWS[i][f] = v;
		invalidate();
		refreshStatus();
	});

	function bulkColor(onlyEmpty) {
		const v = (root.find(".of-bcolor").val() || "").trim().toUpperCase();
		if (!v) return frappe.show_alert({ message: __("Type a color first."), indicator: "orange" }, 3);
		if (!onlyEmpty && !SEL.size) return frappe.show_alert({ message: __("Tick some rows first."), indicator: "orange" }, 3);
		let n = 0;
		ROWS.forEach((r) => {
			const hit = onlyEmpty ? !r.colour : SEL.has(r.unique_id);
			if (hit && r.colour !== v) { r.colour = v; n++; }
		});
		if (n) invalidate();
		// every "-> selected" apply hands the selection back for the next batch
		SEL.clear();
		LASTSEL = null;
		root.find(".of-bcolor").val("");
		paint();
		frappe.show_alert({ message: __("{0} row(s) coloured {1}.", [n, v]), indicator: "green" }, 3);
	}
	root.on("click", ".of-bcolor-sel", () => bulkColor(false));
	root.on("click", ".of-bcolor-empty", () => bulkColor(true));

	root.on("click", ".of-bgl-sel", () => {
		const v = root.find(".of-bgl").val() || "";
		if (!v) return frappe.show_alert({ message: __("Pick GENTS / LADIES first."), indicator: "orange" }, 3);
		if (!SEL.size) return frappe.show_alert({ message: __("Tick some rows first."), indicator: "orange" }, 3);
		let n = 0;
		ROWS.forEach((r) => { if (SEL.has(r.unique_id) && r.style !== v) { r.style = v; n++; } });
		if (n) invalidate();
		SEL.clear();
		LASTSEL = null;
		root.find(".of-bgl").val("");
		paint();
		frappe.show_alert({ message: __("{0} row(s) set {1}.", [n, v]), indicator: "green" }, 3);
	});

	function bulkField(field, value, label) {
		if (!SEL.size) return frappe.show_alert({ message: __("Tick some rows first."), indicator: "orange" }, 3);
		let n = 0;
		ROWS.forEach((r) => { if (SEL.has(r.unique_id) && r[field] !== value) { r[field] = value; n++; } });
		if (n) invalidate();
		SEL.clear();
		LASTSEL = null;
		paint();
		frappe.show_alert({ message: __("{0} row(s) set {1}.", [n, label || value]), indicator: "green" }, 3);
	}

	root.on("click", ".of-bsize-sel", () => {
		const v = (root.find(".of-bsize").val() || "").trim();
		if (!v) return frappe.show_alert({ message: __("Type a size first."), indicator: "orange" }, 3);
		bulkField("size", v);
		root.find(".of-bsize").val("");
	});

	root.on("click", ".of-bshape-sel", () => {
		const v = root.find(".of-bshape").val() || "";
		if (!v) return frappe.show_alert({ message: __("Pick a shape first."), indicator: "orange" }, 3);
		bulkField("shape", v);
		root.find(".of-bshape").val("");
	});

	root.on("click", ".of-bcert-sel", () => {
		const v = (root.find(".of-bcert").val() || "").trim().toUpperCase();
		if (!v) return frappe.show_alert({ message: __("Type a cert lab first."), indicator: "orange" }, 3);
		if (!SEL.size) return frappe.show_alert({ message: __("Tick some rows first."), indicator: "orange" }, 3);
		let n = 0;
		ROWS.forEach((r) => { if (SEL.has(r.unique_id) && r.cert !== v) { r.cert = v; n++; } });
		if (n) invalidate();
		SEL.clear();
		LASTSEL = null;
		root.find(".of-bcert").val("");
		paint();
		frappe.show_alert({ message: __("{0} row(s) tagged {1} — selection cleared, tick the next batch.", [n, v]), indicator: "green" }, 4);
	});

	// hallmarked but the code wasn't typed — bills exactly like a code.
	// APPENDS: a row already holding a code or PENDING gets ", PENDING" —
	// apply twice (or select an already-PENDING row) for two-HUID pieces.
	root.on("click", ".of-bhuid-pend", () => {
		if (!SEL.size) return frappe.show_alert({ message: __("Tick some rows first."), indicator: "orange" }, 3);
		let n = 0;
		ROWS.forEach((r) => {
			if (!SEL.has(r.unique_id)) return;
			r.huid = r.huid ? r.huid + ", PENDING" : "PENDING";
			n++;
		});
		if (n) invalidate();
		SEL.clear();
		LASTSEL = null;
		paint();
		frappe.show_alert({ message: __("Added one PENDING to {0} row(s) — each counts as a HUID.", [n]), indicator: "green" }, 4);
	});

	// the agreed physical order: the item ladder -> YELLOW/ROSE/WHITE ->
	// below-1g band first -> GW ascending inside the band
	const ITEM_RANK = { NOSEPIN: 0, NOSPIN: 0, NP: 0, PENDANT: 1, PD: 1, STUD: 2, RING: 3,
		BRACELET: 4, "CH BRACELET": 4, BANGLE: 5, "PIPE BANGLE": 5,
		"CHAIN NECKLACE": 6, "CH NECKLACE": 6, NECKLACE: 7, NECK: 7 };
	const COLOR_RANK = { YELLOW: 0, ROSE: 1, WHITE: 2 };
	const rankOf = (m, k) => (k in m ? m[k] : 50);
	root.on("click", ".of-sortnum", () => {
		const noCol = ROWS.filter((r) => !r.colour).length;
		if (noCol) return frappe.show_alert({ message: __("{0} row(s) still have no COLOR — fill them before numbering.", [noCol]), indicator: "orange" }, 4);
		ROWS.sort((a, b) => (rankOf(ITEM_RANK, a.item || "") - rankOf(ITEM_RANK, b.item || ""))
			|| (a.item || "").localeCompare(b.item || "")
			|| (rankOf(COLOR_RANK, a.colour || "") - rankOf(COLOR_RANK, b.colour || ""))
			|| (a.colour || "").localeCompare(b.colour || "")
			|| ((flt(a.nt) < 1 ? 0 : 1) - (flt(b.nt) < 1 ? 0 : 1))
			|| (flt(a.gs) - flt(b.gs)));
		ROWS.forEach((r, i) => { r.sl = i + 1; });
		SORTED = true;
		PRICED = null;
		paint();
		frappe.show_alert({ message: __("Item ladder → YELLOW/ROSE/WHITE → band → GW, numbered 1–{0}.", [ROWS.length]), indicator: "green" }, 5);
	});

	function readyCheck() {
		const missing = ROWS.filter((r) => !r.colour).length;
		if (missing) { frappe.show_alert({ message: __("{0} row(s) still have no COLOR.", [missing]), indicator: "orange" }, 4); return false; }
		if (!SORTED) { frappe.show_alert({ message: __("Run Sort & Number first — the numbers go on the pieces."), indicator: "orange" }, 4); return false; }
		return true;
	}

	root.on("click", ".of-goexport", () => {
		if (!ROWS.length || !readyCheck()) return;
		setState("export");
	});
	root.on("click", ".of-back", () => setState("prep"));

	// ---------------------------------------------------- export interactions
	function payloadRows() {
		return ROWS.map((r) => Object.assign({}, r, {
			item_color: r.colour, colour: r.shape || "",
			quality_token: fQual.get_value() || "",
		}));
	}

	root.on("click", ".of-dl", () => {
		open_url_post("/api/method/jewelima.jewelima.api.export_old_format_billing", {
			rows: JSON.stringify(ROWS), quality_token: fQual.get_value() || "EF",
			party: fParty.get_value() || "",
			filename: "NEW " + (FILE.name || "format").replace(/\.xlsx$/i, ""),
		});
	});

	root.on("click", ".of-price", () => {
		if (!fChart.get_value()) return frappe.show_alert({ message: __("Pick a price chart."), indicator: "orange" }, 3);
		frappe.call({ method: API + ".price_old_sale", args: {
			rows: JSON.stringify(payloadRows()), price_chart: fChart.get_value(),
			gold_rate: fRate.get_value() || 0, quality: fCq.get_value() || "",
			gst_percent: fGst.get_value() || 0,
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
		if (!PRICED) return;
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
				if (SESSION) saveSession("Exported", true);
				open_url_post("/api/method/jewelima.jewelima.api.export_old_sale_jos", {
					priced: JSON.stringify(PRICED.rows), price_chart: fChart.get_value(),
					gold_rate: fRate.get_value() || 0, quality: fCq.get_value() || "",
					karat_label: v.karat, item_colour: (v.item_colour || "").toUpperCase().trim(),
					gst_percent: fGst.get_value() || 0,
					igi_flat: v.igi_flat || 80, igi_per_ct: v.igi_per_ct || 325, igi_threshold: v.igi_threshold || 0.10,
					party: v.party || "", filename: v.fname,
				});
			},
		});
		d.show();
	});

	// Saved Imports page hands over here: Resume sets route_options.session
	wrapper.of_load_session = loadSession;
	const ro = frappe.route_options || {};
	if (ro.session) {
		const n = ro.session;
		delete frappe.route_options.session;
		loadSession(n);
	}
};

frappe.pages["old-format"].on_page_show = function (wrapper) {
	// the RESET hook rebuilds a stale page right after this fires — leave the
	// session handoff for the rebuild's on_page_load, or it loads into a DOM
	// that is about to be wiped and the fresh page comes up empty
	if (frappe.pages["old-format"].__jw_stale) return;
	const ro = frappe.route_options || {};
	if (ro.session && wrapper.of_load_session) {
		const n = ro.session;
		delete frappe.route_options.session;
		wrapper.of_load_session(n);
	}
};
