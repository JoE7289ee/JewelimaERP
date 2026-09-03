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
	let CHAINS = [];    // BACK CHAIN rows — never table lines, assigned by scan
	let COVER = {};
	let CHART = null;   // picked chart's full data
	let PRICED = null;  // {rows, totals}
	let STATE = "prep"; // "prep" | "export"
	// Colour stone comes off the sheet in carats and is bracketed in carats on the
	// chart, so grams are a VIEW: 1 ct = 0.2 g, converted for the eye only. The
	// choice sticks per browser — a counter that works in grams should not have to
	// say so again every morning.
	const hasPS = () => ROWS.some((r) => flt(r.ps_ct) > 0 || cint(r.ps_pcs) > 0);
	const hasCS = () => ROWS.some((r) => flt(r.stn_ct) > 0 || cint(r.stn_pcs) > 0);

	const CS_G_KEY = "jw_of_cs_grams";
	let CSG = false;
	try { CSG = localStorage.getItem(CS_G_KEY) === "1"; } catch (e) { CSG = false; }
	const CT_TO_G = 0.2;
	const csShow = (ct) => (flt(ct) ? (CSG ? (flt(ct) * CT_TO_G).toFixed(3) : flt(ct)) : "");
	const csUnit = () => (CSG ? __("CS g") : __("CS ct"));
	let SESSION = null; // Old Format Import name when saved/loaded
	let TITLE = "";     // the saved session's name-as-shown (Save as… sets it)
	let LOADING = false; // guards the session picker's onchange during set_value
	let SORTED = false; // Sort & Number has been run since the last edit
	const SEL = new Set(); // selected unique_ids (prep bulk ops)

	$(page.main).append(`
		<style>
		#page-old-format .container{max-width:100%;}
		/* one accent, one neutral — the old page had eight button colours and
		   nothing about them said which action was the forward one */
		#page-old-format{--of-accent:#1f618d;--of-accent-2:#174e71;--of-danger:#a33a3a;}
		html[data-theme="dark"] #page-old-format{--of-accent:#3d86bd;--of-accent-2:#2f6d9c;--of-danger:#c96a6a;}
		.of-bar{display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin-bottom:12px;}
		.of-bar .frappe-control{margin:0;min-width:140px;}
		.of-bar .control-label{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);font-weight:600;}
		.of-file{border:1px dashed var(--gray-400,#aeb6bf);border-radius:8px;padding:8px 16px;cursor:pointer;
			font-size:12.5px;color:var(--text-muted);background:var(--fg-color);transition:border-color .15s,color .15s;}
		.of-file:hover{border-color:var(--of-accent);color:var(--of-accent);}
		.of-file.has{border-style:solid;border-color:var(--of-accent);color:var(--of-accent);font-weight:600;}
		.of-btn{border:1px solid var(--border-color);background:var(--fg-color);color:var(--text-color);
			font-weight:600;font-size:12.5px;padding:8px 16px;border-radius:8px;cursor:pointer;
			transition:background .15s,border-color .15s,color .15s;}
		.of-btn:hover{border-color:var(--of-accent);color:var(--of-accent);}
		.of-btn:disabled{opacity:.4;cursor:not-allowed;}
		.of-btn:disabled:hover{border-color:var(--border-color);color:var(--text-color);}
		/* the one forward action on each screen carries the fill */
		.of-btn.go{background:var(--of-accent);border-color:var(--of-accent);color:#fff;font-weight:700;}
		.of-btn.go:hover{background:var(--of-accent-2);border-color:var(--of-accent-2);color:#fff;}
		.of-bulk{display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:var(--control-bg);
			border:1px solid var(--border-color);border-radius:10px;padding:8px 14px;margin-bottom:12px;}
		.of-bulk .lbl{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);font-weight:700;}
		.of-bulk input,.of-bulk select{border:1px solid var(--border-color);border-radius:6px;padding:3px 8px;font-size:12px;
			text-transform:uppercase;width:96px;background:var(--fg-color);color:var(--text-color);}
		.of-bulk .bapply{border:1px solid var(--border-color);border-radius:6px;padding:4px 12px;font-size:11.5px;
			font-weight:600;color:var(--text-color);background:var(--fg-color);cursor:pointer;transition:border-color .15s,color .15s;}
		.of-bulk .bapply:hover{border-color:var(--of-accent);color:var(--of-accent);}
		.of-bulk .bapply.alt:hover{border-color:var(--of-accent);color:var(--of-accent);}
		.of-bulk .bapply.of-bclear:hover,.of-bulk .bapply.of-selclear:hover{border-color:var(--of-danger);color:var(--of-danger);}
		.of-bulk .sep{width:1px;height:22px;background:var(--border-color);}
		.of-selcount{font-size:12px;font-weight:800;}
		.of-status{font-size:11.5px;color:var(--text-muted);margin-left:auto;}
		.of-status b{color:#a15c00;}
		.of-cover{font-size:12.5px;color:var(--text-muted);margin-bottom:10px;}
		.of-cover b{color:var(--text-color);}
		/* overflow-x:auto makes this a scroll container on BOTH axes, so the
		   sticky header only follows if the pane itself is what scrolls */
		.of-body{overflow:auto;max-height:calc(100vh - 300px);min-height:200px;
			border:1px solid var(--border-color);border-radius:10px;background:var(--fg-color);}
		table.of-t{width:100%;border-collapse:separate;border-spacing:0;font-size:12px;background:var(--fg-color);}
		table.of-t.prep{min-width:1360px;}
		table.of-t.priced th:last-child,table.of-t.priced td:last-child{position:sticky;right:0;
			background-color:var(--fg-color);
			background-image:linear-gradient(var(--of-tint,transparent),var(--of-tint,transparent));
			box-shadow:-7px 0 7px -7px rgba(0,0,0,.22);}
		table.of-t.priced th:last-child{background:var(--control-bg);z-index:3;}
		table.of-t.priced tbody tr:hover td:last-child{background:var(--control-bg);}
		table.of-t.priced tr.of-flagged td:last-child{background:#fff8e6;}
		html[data-theme="dark"] table.of-t.priced tr.of-flagged td:last-child{background:#2b2617;}
		/* the header follows you down a 200-row sheet */
		table.of-t th{position:sticky;top:0;z-index:2;background:var(--control-bg);font-size:10px;text-transform:uppercase;
			letter-spacing:.04em;color:var(--text-muted);padding:8px 8px;border-bottom:1px solid var(--gray-400,#aeb6bf);
			text-align:left;white-space:nowrap;font-weight:700;}
		/* rules run one way only — a full grid on 21 columns reads as graph paper */
		table.of-t td{border-bottom:1px solid var(--border-color);padding:4px 8px;font-variant-numeric:tabular-nums;white-space:nowrap;}
		table.of-t tbody tr:last-child td{border-bottom:none;}
		table.of-t tbody tr:hover td{background:var(--control-bg);}
		table.of-t td.num{text-align:right;}
		table.of-t td[title]:not([title=""]){cursor:help;}
		table.of-t input:not([type=checkbox]), table.of-t select{border:1px solid transparent;border-radius:5px;padding:2px 6px;
			font-size:11.5px;background:var(--control-bg);color:var(--text-color);transition:border-color .12s,background .12s;}
		table.of-t input:not([type=checkbox]):hover, table.of-t select:hover{border-color:var(--border-color);}
		table.of-t input:not([type=checkbox]):focus, table.of-t select:focus{outline:none;border-color:var(--of-accent);background:var(--fg-color);}
		table.of-t input:not([type=checkbox]){text-transform:uppercase;}
		table.of-t input[type=checkbox]{width:14px;height:14px;accent-color:var(--of-accent);cursor:pointer;}
		tr.of-rowsel td, table.of-t tbody tr.of-rowsel:hover td{background:#eef4fb;}
		html[data-theme="dark"] tr.of-rowsel td,
		html[data-theme="dark"] table.of-t tbody tr.of-rowsel:hover td{background:#1d2a3a;}
		tr.of-flagged td, table.of-t tbody tr.of-flagged:hover td{background:#fff8e6;}
		html[data-theme="dark"] tr.of-flagged td,
		html[data-theme="dark"] table.of-t tbody tr.of-flagged:hover td{background:#2b2617;}
		.of-flag{font-size:10.5px;color:#8a6d00;white-space:normal;}
		html[data-theme="dark"] .of-flag{color:#d4ab4a;}
		.of-tot{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;}
		.of-tile{border:1px solid var(--border-color);border-radius:10px;padding:9px 16px;background:var(--fg-color);}
		.of-tile .k{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;font-weight:600;}
		.of-tile .v{font-size:17px;font-weight:700;letter-spacing:-.01em;margin-top:2px;}
		.of-tile.grand{border-color:var(--of-accent);}
		.of-tile.grand .v{color:var(--of-accent);}
		.of-none{padding:40px;text-align:center;color:var(--text-muted);}
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
			<button class="of-btn of-save" style="display:none;">${__("Save as…")}</button>
			<button class="of-btn of-sortnum" style="display:none;">${__("Sort & Number")}</button>
			<button class="of-btn of-find" style="display:none;">${__("Find #")}</button>
			<button class="of-btn go of-goexport" style="display:none;">${__("Continue to Export →")}</button>
			<span style="flex:1;"></span>
			<button class="of-btn of-units"></button>
			<button class="of-btn of-xlexport" style="display:none;">${__("Export Excel ⤓")}</button>
		</div>
		<div class="of-bulk" style="display:none;">
			<span class="of-selcount">0 ${__("selected")}</span>
			<button class="bapply of-selclear">${__("Clear")}</button>
			<span class="sep"></span>
			<span class="lbl">${__("Set")}</span>
			<select class="of-bfield" style="border:1px solid var(--border-color);border-radius:6px;padding:3px 6px;font-size:12px;font-weight:700;background:var(--fg-color);color:var(--text-color);">
				<option value="colour">${__("Color")}</option>
				<option value="style">${__("G/L")}</option>
				<option value="cert">${__("Cert lab")}</option>
				<option value="ps_stone">${__("PS stone")}</option>
				<option value="size">${__("Size")}</option>
				<option value="shape">${__("Shape")}</option>
				<option value="shop">${__("Shop Name")}</option>
				<option value="pending">${__("HUID PENDING")}</option>
			</select>
			<span class="of-bslot" style="display:inline-flex;gap:8px;align-items:center;"></span>
			<span class="of-status"></span>
		</div>
		<div class="of-bar of-bar-export" style="display:none;">
			<button class="of-btn of-back">${__("← Back to Prep")}</button>
			<div class="of-chart"></div>
			<div class="of-rate"></div>
			<div class="of-cq"></div>
			<div class="of-gst"></div>
			<button class="of-btn go of-price">${__("Price it")}</button>
			<button class="of-btn of-rules" style="display:none;">${__("Pricing Rules")}</button>
			<button class="of-btn of-jos" style="display:none;">${__("JOS Billing ⤓")}</button>
			<button class="of-btn of-dl">${__("NEW format ⤓")}</button>
			<span style="flex:1;"></span>
			<button class="of-btn of-units"></button>
		</div>
		<div class="of-cover"></div>
		<div class="of-info"></div>
		<div class="of-body"><div class="of-none">${__("Upload the OLD quotation excel. PREP: bulk-fill COLOR, tag certifications, Sort & Number. EXPORT: price it and download the JOS billing.")}</div></div>
		<datalist id="of-colors"><option>YELLOW</option><option>ROSE</option><option>WHITE</option></datalist>
		<datalist id="of-labs"><option>IGI</option><option>SGL</option><option>DHC</option><option>GIA</option></datalist>
		<datalist id="of-shapes"><option>OVAL</option><option>CHAIN</option></datalist>
		<datalist id="of-pstones"></datalist>
	`);
	const root = $(page.main);
	const mk = (sel, df) => { const c = frappe.ui.form.make_control({ df, parent: root.find(sel).get(0), render_input: true }); c.refresh(); return c; };
	const fQual = mk(".of-qual", { fieldtype: "Select", label: __("Quality token"), fieldname: "q",
		options: Object.keys(TOKEN_FAMILY).join("\n"), default: "EF", onchange: () => applyToken() });
	fQual.set_value("EF");
	const fParty = mk(".of-party", { fieldtype: "Data", label: __("Shop / party"), fieldname: "party" });
	const fSess = mk(".of-sess", { fieldtype: "Link", label: __("Saved import"), fieldname: "sess",
		options: "Old Format Import", only_select: 1, onchange: () => { if (!LOADING) loadSession(fSess.get_value()); } });
	// Editing any of the four pricing inputs makes what is on screen a quote at a
	// rate nobody asked for: the table and all five tiles paint from PRICED, so a
	// corrected gold rate left the old money showing with the new rate in the box
	// and nothing saying it was stale. NOT invalidate() — that also clears SORTED,
	// which gates Find # and Continue to Export, and a rate edit does not unsort
	// anything. The PRICED guard keeps the programmatic set_value calls below
	// (fGst default, fCq from loadQualities/applyToken) from firing it.
	const unprice = () => {
		if (!PRICED) return;
		PRICED = null;
		root.find(".of-jos, .of-rules").hide();
		paint();
	};
	const fChart = mk(".of-chart", { fieldtype: "Link", label: __("Price Chart"), fieldname: "chart", options: "Price Chart", only_select: 1,
		get_query: () => ({ filters: { status: "Active" } }), onchange: () => { unprice(); loadQualities(); } });
	const fRate = mk(".of-rate", { fieldtype: "Float", label: __("Gold rate (₹/g on NT)"), fieldname: "rate", onchange: () => unprice() });
	const fCq = mk(".of-cq", { fieldtype: "Select", label: __("Chart quality"), fieldname: "cq", options: "", onchange: () => unprice() });
	const fGst = mk(".of-gst", { fieldtype: "Float", label: __("GST %"), fieldname: "gst", default: 3, onchange: () => unprice() });
	fGst.set_value(3);

	// the PS stone box offers the real precious stones — a name the chart does
	// not carry cannot be priced, so guessing at spelling is worth preventing
	frappe.call({ method: API + ".list_precious_stones", freeze: false }).then((r) => {
		root.find("#of-pstones").html(((r.message) || []).map((n) => `<option>${esc(n)}</option>`).join(""));
	});

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
		root.find(".of-jos, .of-rules").hide();
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

	// Two boxes rather than one comma-separated cell: a piece has one HUID or two,
	// and typing "ABC123, DEF456" into a single box was easy to get subtly wrong
	// (a missing comma silently became one 12-character code that bills as none).
	// Storage is unchanged — the row still holds them comma separated.
	const huidParts = (h) => String(h || "").split(",").map((x) => x.trim()).filter(Boolean);
	const huidPart = (h, i) => huidParts(h)[i] || "";
	const huidJoin = (a, b) => [String(a || "").trim(), String(b || "").trim()]
		.filter(Boolean).join(", ");

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
			${CHAINS.length ? `<div class="of-tile of-chainbtn" style="cursor:pointer;border-color:#9a6b1f;">
				<div class="k" style="color:#9a6b1f;">${__("Back chains")}</div>
				<div class="v" style="color:#9a6b1f;">⛓ ${CHAINS.length} ${__("unassigned")}</div>
				<div class="sub">${__("click to scan-assign")}</div></div>` : ""}
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
			splitChains((m.rows || []).concat(m.chains || []));
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
			root.find(".of-save, .of-sortnum, .of-find, .of-goexport, .of-xlexport").show();
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
				rows: ROWS, chains: CHAINS, cover: COVER, sorted: SORTED, status: status || undefined,
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
				splitChains(m.rows || []);
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
				root.find(".of-save, .of-sortnum, .of-find, .of-goexport, .of-xlexport").show();
				setState("prep");
			});
		};
		rd.readAsDataURL(file);
	});

	// ---- Excel: the session out as a working copy ---------------------------
	root.on("click", ".of-xlexport", () => {
		if (!ROWS.length && !CHAINS.length) return frappe.show_alert({ message: __("Nothing to export yet."), indicator: "orange" }, 3);
		open_url_post("/api/method/jewelima.jewelima.api.export_old_format_session_xlsx", {
			rows: JSON.stringify(ROWS), chains: JSON.stringify(CHAINS),
			filename: (TITLE || (FILE && FILE.name) || "OLD FORMAT SESSION").replace(/\.xlsx$/i, ""),
		});
	});

	// ------------------------------------------------------------- painting
	function paint() {
		if (!ROWS.length) return;
		if (STATE === "prep") paintPrep(); else paintExport();
		paintInfo();
		refreshStatus();
	}

	function paintPrep() {
		const ps = hasPS(), cs = hasCS();
		root.find(".of-body").html(`
			<table class="of-t prep"><thead><tr>
				<th><input type="checkbox" class="of-selall"></th>
				<th>#</th><th>${__("Unique ID")}</th><th>${__("HUID")}<span style="font-weight:400;color:var(--text-muted);"> ${__("(two boxes)")}</span></th><th>${__("Item")}</th><th>${__("Design")}</th>
				<th class="num">${__("GS g")}</th><th class="num">${__("NT g")}</th>
				<th class="num">${__("DMD pcs")}</th><th class="num">${__("DMD ct")}</th>
				${ps ? `<th class="num">${__("PS pcs")}</th><th class="num">${__("PS ct")}</th><th>${__("PS stone")}</th>` : ""}
				${cs ? `<th class="num">${__("CS pcs")}</th><th class="num">${csUnit()}</th>` : ""}
				<th>${__("COLOR")}</th><th>${__("Size")}</th><th>${__("G/L")}</th><th>${__("Shape")}</th>
				<th>${__("Cert")}</th><th>${__("Shop Name")}</th>
			</tr></thead><tbody>
			${ROWS.map((r, i) => `<tr data-i="${i}" class="${SEL.has(r.unique_id) ? "of-rowsel" : ""}" style="background:${tintOf(r.colour)}">
				<td><input type="checkbox" class="of-sel" data-uid="${esc(r.unique_id)}" ${SEL.has(r.unique_id) ? "checked" : ""}></td>
				<td>${r.sl}</td>
				<td><b>${esc(r.unique_id)}</b>${r.back_chain_wt ? ` <span title="${__("back chain {0} ({1} g) merged in", [esc(r.back_chain_barcode || ""), r.back_chain_wt])}" style="cursor:help;">⛓</span>` : ""}</td>
				<td class="of-huid"><input data-h="0" value="${esc(huidPart(r.huid, 0))}"
						style="width:74px;" placeholder="${__("HUID")}"><input data-h="1"
						value="${esc(huidPart(r.huid, 1))}" style="width:74px;" placeholder="${__("2nd")}"></td>
				<td>${esc(r.item)}</td><td>${esc(r.design)}</td>
				<td class="num">${r.gs}</td><td class="num">${r.nt}</td>
				<td class="num">${r.dmd_pcs || ""}</td><td class="num">${r.dmd_ct || ""}</td>
				${ps ? `<td class="num">${r.ps_pcs || ""}</td><td class="num">${r.ps_ct || ""}</td>
				<td>${r.ps_ct ? `<input data-f="ps_stone" list="of-pstones" value="${esc(r.ps_stone || "")}"
					style="width:104px;text-transform:uppercase;" placeholder="${__("name it")}"
					title="${__("The chart prices precious stones by name — without it this PS cannot be priced")}">`
					: `<span style="color:var(--text-muted);">&mdash;</span>`}</td>` : ""}
				${cs ? `<td class="num">${r.stn_pcs || ""}</td><td class="num">${csShow(r.stn_ct)}</td>` : ""}
				<td><input data-f="colour" list="of-colors" value="${esc(r.colour)}" style="width:76px;"></td>
				<td><input data-f="size" value="${esc(r.size)}" style="width:48px;"></td>
				<td><select data-f="style"><option value=""></option>
					<option ${r.style === "GENTS" ? "selected" : ""}>GENTS</option>
					<option ${r.style === "LADIES" ? "selected" : ""}>LADIES</option>
					<option ${r.style === "GENTS / LADIES" ? "selected" : ""}>GENTS / LADIES</option></select></td>
				<td><input data-f="shape" list="of-shapes" value="${esc(r.shape)}" style="width:64px;"></td>
				<td><input data-f="cert" list="of-labs" value="${esc(r.cert)}" style="width:56px;"></td>
				<td><input data-f="shop" value="${esc(r.shop || "")}" style="width:110px;"></td>
			</tr>`).join("")}</tbody></table>`);
	}

	// a flag belongs on the cell it is about — dumping every one of them on
	// Cert/HUID meant "name the stone to price it" hid behind certification
	// anchored on each flag's own fixed wording: the loose /dmd/ test used to scan
	// the interpolated item and lab names too, so "no making rule for DMD RING"
	// landed on the diamond cell
	function flagBucket(f) {
		const t = String(f || "");
		if (/^PS\b/.test(t)) return "ps";
		if (/^STN\b/.test(t)) return "cs";
		if (/^no gold rate/.test(t)) return "gold";
		if (/^no making rule/.test(t)) return "mc";
		if (/^(no diamond rows|dmd avg|no dmd)/.test(t)) return "dmd";
		if (/but priced at/.test(t)) return "dmd";
		if (/^HUID present/.test(t) || /is not priced on the chart$/.test(t)) return "cert";
		return "total";
	}
	const cellTitle = (p, kind, note) => esc([note || ""].concat(
		(p.flags || []).filter((f) => flagBucket(f) === kind)).filter(Boolean).join(" · "));

	function paintExport() {
		const priced = !!PRICED;
		const P = {};
		if (priced) PRICED.rows.forEach((x) => { P[x.unique_id] = x; });
		// PS and CS earn their columns only when the sheet actually carries them —
		// every PS/STN flag is raised inside a >0 check, so none can be orphaned
		const ps = hasPS(), cs = hasCS();
		root.find(".of-body").html(`
			<table class="of-t${priced ? " priced" : ""}"><thead><tr>
				<th>#</th><th>${__("Unique ID")}</th><th>${__("Item")}</th><th>${__("COLOR")}</th>
				<th class="num">${__("NT g")}</th><th class="num">${__("DMD pcs")}</th><th class="num">${__("DMD ct")}</th>
				${ps ? `<th class="num">${__("PS ct")}</th>` : ""}${cs ? `<th class="num">${csUnit()}</th>` : ""}
				<th>${__("HUID")}</th><th>${__("Cert")}</th>
				${priced ? `<th class="num">${__("Gold")}</th><th class="num">${__("Making")}</th>
				<th class="num">${__("DMD")}</th>${ps ? `<th class="num">${__("PS")}</th>` : ""}${cs ? `<th class="num">${__("CS")}</th>` : ""}
				<th class="num">${__("Cert/HUID")}</th>
				<th class="num">${__("TOTAL")}</th>` : ""}
			</tr></thead><tbody>
			${ROWS.map((r) => {
				const p = P[r.unique_id] || {};
				const fl = (p.flags || []).length;
				const tint = tintOf(r.colour) || "transparent";
				return `<tr class="${fl ? "of-flagged" : ""}" style="--of-tint:${tint};background:${tint};">
				<td>${r.sl}</td><td><b>${esc(r.unique_id)}</b></td><td>${esc(r.item)}</td><td>${esc(r.colour)}</td>
				<td class="num">${r.nt}</td><td class="num">${r.dmd_pcs || ""}</td><td class="num">${r.dmd_ct || ""}</td>
				${ps ? `<td class="num">${r.ps_ct || ""}${r.ps_stone ? `<div class="of-flag">${esc(r.ps_stone)}</div>` : ""}</td>` : ""}
				${cs ? `<td class="num">${csShow(r.stn_ct)}</td>` : ""}
				<td>${esc(r.huid)}</td><td>${esc(r.cert)}</td>
				${priced ? `<td class="num" title="${cellTitle(p, "gold", (p.notes || {}).gold)}">₹ ${money(p.gold_va)}</td>
				<td class="num" title="${cellTitle(p, "mc", (p.notes || {}).mc)}">₹ ${money(p.mc)}</td>
				<td class="num" title="${cellTitle(p, "dmd", (p.notes || {}).dmd)}">₹ ${money(p.dmd_va)}${p.dmd_rt ? `<div class="of-flag">${p.stone_ct}/st @ ${esc(p.dmd_bracket)}</div>` : ""}</td>
				${ps ? `<td class="num" title="${cellTitle(p, "ps", (p.notes || {}).ps)}">₹ ${money(p.ps_va || 0)}${p.ps_rt ? `<div class="of-flag">@ ${money(p.ps_rt)}/ct</div>` : ""}</td>` : ""}
				${cs ? `<td class="num" title="${cellTitle(p, "cs", (p.notes || {}).stn)}">₹ ${money(p.stn_va || 0)}</td>` : ""}
				<td class="num" title="${cellTitle(p, "cert", (p.notes || {}).cert)}">₹ ${money(p.cert_va || 0)}</td>
				<td class="num" title="${cellTitle(p, "total", (p.notes || {}).total)}"><b>₹ ${money(p.total)}</b></td>` : ""}
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

	// the two HUID boxes write back one comma-separated value
	root.on("change", "table.of-t [data-h]", function () {
		const $tr = $(this).closest("tr");
		const i = cint($tr.data("i"));
		const v = ($(this).val() || "").trim().toUpperCase();
		this.value = v;
		const a = ($tr.find('[data-h="0"]').val() || "").trim().toUpperCase();
		const b = ($tr.find('[data-h="1"]').val() || "").trim().toUpperCase();
		ROWS[i].huid = huidJoin(a, b);
		invalidate();
		refreshStatus();
	});

	// ---- ONE bulk applier: pick the field, the right control appears ---------
	const BULK = {
		colour: { input: "text", list: "of-colors", upper: true, allEmpty: true },
		style: { input: "select", options: ["GENTS", "LADIES", "GENTS / LADIES"] },
		cert: { input: "text", list: "of-labs", upper: true },
		// deliberately no allEmpty: this is the one bulk field that moves money, and
		// a sheet can hold several different stones. Tick the rows it applies to.
		ps_stone: { input: "text", list: "of-pstones", upper: true },
		size: { input: "text", upper: false },
		shape: { input: "select", options: ["OVAL", "CHAIN"] },
		shop: { input: "text", upper: true, allEmpty: true },
		pending: { input: "none" },
	};

	function renderBulkSlot() {
		const field = root.find(".of-bfield").val();
		const cfg = BULK[field];
		let html = "";
		if (cfg.input === "text") {
			html = `<input class="of-bval" ${cfg.list ? `list="${cfg.list}"` : ""}
				style="border:1px solid var(--border-color);border-radius:6px;padding:3px 8px;font-size:12px;width:96px;
				background:var(--fg-color);color:var(--text-color);${cfg.upper ? "text-transform:uppercase;" : ""}">`;
		} else if (cfg.input === "select") {
			html = `<select class="of-bval" style="border:1px solid var(--border-color);border-radius:6px;padding:3px 6px;font-size:12px;background:var(--fg-color);color:var(--text-color);">
				<option value=""></option>${cfg.options.map((o) => `<option>${o}</option>`).join("")}</select>`;
		} else {
			html = `<span style="font-size:11px;color:var(--text-muted);">${__("adds one PENDING per selected row (stacks for two-HUID pieces)")}</span>`;
		}
		html += `<button class="bapply of-bapply">${__("→ selected")}</button>`;
		if (cfg.allEmpty) html += `<button class="bapply alt of-bapply-empty">${__("→ all empty")}</button>`;
		html += `<button class="bapply of-bclear">${__("→ clear selected")}</button>`;
		root.find(".of-bslot").html(html);
	}
	root.on("change", ".of-bfield", renderBulkSlot);
	renderBulkSlot();

	function bulkApply(onlyEmpty) {
		const field = root.find(".of-bfield").val();
		const cfg = BULK[field];
		if (field === "pending") {
			// hallmarked but the code wasn't typed — bills exactly like a code.
			// APPENDS: apply again (or to an already-PENDING row) for two HUIDs.
			if (!SEL.size) return frappe.show_alert({ message: __("Tick some rows first."), indicator: "orange" }, 3);
			let n = 0;
			ROWS.forEach((r) => {
				if (!SEL.has(r.unique_id)) return;
				r.huid = r.huid ? r.huid + ", PENDING" : "PENDING";
				n++;
			});
			if (n) invalidate();
			// the ticks stay: the same rows usually need two or three things set,
			// and re-ticking them between each was the slowest part of the job
			paint();
			return frappe.show_alert({ message: __("Added one PENDING to {0} row(s) — each counts as a HUID. Still selected.", [n]), indicator: "green" }, 4);
		}
		let v = (root.find(".of-bval").val() || "").trim();
		if (cfg.upper) v = v.toUpperCase();
		if (!v) return frappe.show_alert({ message: __("Type or pick the value first."), indicator: "orange" }, 3);
		if (!onlyEmpty && !SEL.size) return frappe.show_alert({ message: __("Tick some rows first."), indicator: "orange" }, 3);
		let n = 0, skipped = 0;
		ROWS.forEach((r) => {
			const hit = onlyEmpty ? !r[field] : SEL.has(r.unique_id);
			if (!hit) return;
			// naming a stone on a row carrying no PS would be data about nothing
			if (field === "ps_stone" && !flt(r.ps_ct)) { skipped++; return; }
			if (r[field] !== v) { r[field] = v; n++; }
		});
		if (n) invalidate();
		// the ticks stay put so the next field can go on the same rows — clear
		// them with the header tick when the batch really is done
		paint();
		renderBulkSlot();
		frappe.show_alert({ message: skipped
			? __("{0} row(s) set {1}. {2} skipped — no PS on them. Still selected.", [n, v, skipped])
			: __("{0} row(s) set {1}. Still selected.", [n, v]), indicator: "green" }, 3);
	}
	root.on("click", ".of-bapply", () => bulkApply(false));
	root.on("click", ".of-bapply-empty", () => bulkApply(true));

	// clear the chosen field on the ticked rows (HUID PENDING included — clears the HUID)
	function bulkClear() {
		const field = root.find(".of-bfield").val();
		if (!SEL.size) return frappe.show_alert({ message: __("Tick some rows first."), indicator: "orange" }, 3);
		const target = field === "pending" ? "huid" : field;
		let n = 0;
		ROWS.forEach((r) => {
			if (!SEL.has(r.unique_id)) return;
			if (r[target]) { r[target] = ""; n++; }
		});
		if (n) invalidate();
		SEL.clear(); LASTSEL = null;
		paint();
		frappe.show_alert({ message: __("Cleared {0} on {1} row(s).", [String(target).toUpperCase(), n]), indicator: "blue" }, 3);
	}
	root.on("click", ".of-bclear", bulkClear);

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
		// A lot that carries shop names is really several shops' work in one file,
		// so the shops come apart first and the item ladder runs inside each.
		// Rows with no shop sort last rather than jumbling in among the named ones.
		const byShop = ROWS.some((r) => (r.shop || "").trim());
		ROWS.sort((a, b) => (byShop
				? (((a.shop || "").trim() ? 0 : 1) - ((b.shop || "").trim() ? 0 : 1))
					|| (a.shop || "").trim().localeCompare((b.shop || "").trim())
				: 0)
			|| (rankOf(ITEM_RANK, a.item || "") - rankOf(ITEM_RANK, b.item || ""))
			|| (a.item || "").localeCompare(b.item || "")
			|| (rankOf(COLOR_RANK, a.colour || "") - rankOf(COLOR_RANK, b.colour || ""))
			|| (a.colour || "").localeCompare(b.colour || "")
			|| ((flt(a.nt) < 1 ? 0 : 1) - (flt(b.nt) < 1 ? 0 : 1))
			|| (flt(a.gs) - flt(b.gs)));
		ROWS.forEach((r, i) => { r.sl = i + 1; });
		SORTED = true;
		PRICED = null;
		paint();
		frappe.show_alert({ message: (ROWS.some((r) => (r.shop || "").trim())
			? __("Shop → item ladder → YELLOW/ROSE/WHITE → band → GW, numbered 1–{0}.", [ROWS.length])
			: __("Item ladder → YELLOW/ROSE/WHITE → band → GW, numbered 1–{0}.", [ROWS.length])),
			indicator: "green" }, 5);
	});

	// BACK CHAIN rows are never pieces in the table. They wait in CHAINS and
	// get scanned onto a piece: the piece only RECORDS the chain (bag no +
	// its GW in the back-chain columns) — weights are NOT merged.
	const isChain = (r) => (r.item || "").includes("BACK CHAIN");

	function splitChains(all) {
		ROWS = all.filter((r) => !isChain(r));
		CHAINS = all.filter(isChain);
	}

	function assignChain(chain, t) {
		t.back_chain_barcode = [t.back_chain_barcode, chain.unique_id].filter(Boolean).join(", ");
		t.back_chain_wt = flt(((t.back_chain_wt || 0) + (chain.gs || 0)).toFixed(3));
		if (chain.huid) t.huid = [t.huid, chain.huid].filter(Boolean).join(", ");
		CHAINS.splice(CHAINS.indexOf(chain), 1);
		invalidate();
		paint();
	}

	root.on("click", ".of-chainbtn", () => {
		let cur = null;
		const d = new frappe.ui.Dialog({
			title: __("Assign back chains — scan the chain, then the piece"),
			fields: [
				{ fieldname: "st", fieldtype: "HTML" },
				{ fieldname: "scan", fieldtype: "Data", label: __("Scan / type bag no") },
			],
		});
		const $st = () => d.fields_dict.st.$wrapper;
		function refresh(msg, color) {
			const chips = CHAINS.map((c) => `<span class="of-cchip" data-uid="${esc(c.unique_id)}"
				style="display:inline-block;border:1px solid ${cur === c ? "#1f618d" : "var(--border-color)"};border-radius:14px;
				padding:2px 10px;margin:2px 4px 2px 0;font-size:11.5px;cursor:pointer;
				background:${cur === c ? "#1f618d" : "var(--control-bg)"};color:${cur === c ? "#fff" : "var(--text-color)"};">
				⛓ ${esc(c.unique_id)} <span style="opacity:.7;">${c.gs} g</span></span>`).join("");
			$st().html(`
				<div style="font-size:13px;font-weight:700;margin-bottom:4px;color:${color || "var(--text-color)"};">
					${msg || (cur ? __("Chain {0} — now scan the PIECE", [esc(cur.unique_id)]) : __("Scan a BACK CHAIN (or tap one below)"))}</div>
				<div style="margin-bottom:6px;">${chips || "<span style='color:var(--text-muted);font-size:12px;'>" + __("all chains assigned 🎉") + "</span>"}</div>`);
		}
		function handle(v) {
			v = (v || "").trim();
			if (!v) return;
			if (!cur) {
				const c = CHAINS.find((x) => x.unique_id === v);
				if (!c) return refresh(__("{0} is not an unassigned back chain", [esc(v)]), "#b02a2a");
				cur = c;
				return refresh(null);
			}
			const t = ROWS.find((x) => x.unique_id === v);
			if (!t) {
				const other = CHAINS.find((x) => x.unique_id === v);
				if (other) { cur = other; return refresh(null); }
				return refresh(__("{0} is not a piece in this lot", [esc(v)]), "#b02a2a");
			}
			const done = cur;
			assignChain(cur, t);
			cur = null;
			refresh(__("✓ chain {0} → {1} ({2})", [esc(done.unique_id), esc(t.unique_id), esc(t.item)]), "#1d7a33");
			if (!CHAINS.length) setTimeout(() => { d.hide(); }, 900);
		}
		d.$wrapper.on("click", ".of-cchip", function () {
			cur = CHAINS.find((x) => x.unique_id === $(this).data("uid")) || null;
			refresh(null);
		});
		d.fields_dict.scan.$input.on("keydown", function (e) {
			if (e.key !== "Enter") return;
			e.preventDefault();
			handle(this.value);
			this.value = "";
			this.focus();
		});
		d.show();
		refresh(null);
		setTimeout(() => d.fields_dict.scan.$input.focus(), 300);
	});

	// Find # — scan a piece, read the serial to write on it physically
	root.on("click", ".of-find", () => {
		if (!SORTED) return frappe.show_alert({ message: __("Run Sort & Number first — the serials come from it."), indicator: "orange" }, 4);
		const seen = []; // newest first: {sl, uid, item, colour, gs}
		const d = new frappe.ui.Dialog({
			title: __("Find # — scan pieces, write the number on them"),
			size: "large",
			fields: [
				{ fieldname: "scan", fieldtype: "Data", label: __("Scan / type bag no") },
				{ fieldname: "st", fieldtype: "HTML" },
			],
		});
		const $st = () => d.fields_dict.st.$wrapper;
		function refresh(msg, color, big) {
			$st().html(`
				${big ? `<div style="text-align:center;margin:8px 0 2px;">
					<span style="font-size:64px;font-weight:900;line-height:1;">#${big.sl}</span><br>
					<span style="font-size:13px;color:var(--text-muted);">${esc(big.uid)} · ${esc(big.item)} · ${esc(big.colour)} · ${big.gs} g</span>
				</div>` : ""}
				${msg ? `<div style="text-align:center;font-size:13px;font-weight:700;margin:4px 0;color:${color};">${msg}</div>` : ""}
				${seen.length ? `<table class="of-t" style="margin-top:8px;"><thead><tr>
					<th>#</th><th>${__("Unique ID")}</th><th>${__("Item")}</th><th>${__("Color")}</th><th class="num">${__("GW g")}</th>
				</tr></thead><tbody>
				${seen.map((x) => `<tr><td><b style="font-size:15px;">${x.sl}</b></td><td>${esc(x.uid)}</td>
					<td>${esc(x.item)}</td><td>${esc(x.colour)}</td><td class="num">${x.gs}</td></tr>`).join("")}
				</tbody></table>` : `<div style="text-align:center;color:var(--text-muted);font-size:12px;margin-top:8px;">${__("scanned pieces stack up here")}</div>`}`);
		}
		d.fields_dict.scan.$input.on("keydown", function (e) {
			if (e.key !== "Enter") return;
			e.preventDefault();
			const v = (this.value || "").trim();
			this.value = "";
			this.focus();
			if (!v) return;
			const r = ROWS.find((x) => x.unique_id === v);
			if (!r) return refresh(__("{0} is not in this lot", [esc(v)]), "#b02a2a");
			const dup = seen.find((x) => x.uid === r.unique_id);
			if (dup) return refresh(__("already scanned — it is #{0}", [dup.sl]), "#a15c00",
				{ sl: r.sl, uid: r.unique_id, item: r.item, colour: r.colour, gs: r.gs });
			seen.unshift({ sl: r.sl, uid: r.unique_id, item: r.item, colour: r.colour, gs: r.gs });
			refresh(__("✓ write #{0} on the piece", [r.sl]), "#1d7a33",
				{ sl: r.sl, uid: r.unique_id, item: r.item, colour: r.colour, gs: r.gs });
		});
		d.show();
		refresh(null);
		setTimeout(() => d.fields_dict.scan.$input.focus(), 300);
	});

	function readyCheck() {
		if (CHAINS.length) { frappe.show_alert({ message: __("{0} back chain(s) still unassigned — scan them onto their pieces first.", [CHAINS.length]), indicator: "orange" }, 5); return false; }
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

	// carats <-> grams is a lens on the same number; nothing stored changes, so the
	// sheet still round-trips in carats and the chart brackets still match
	function paintUnits() {
		root.find(".of-units").text(CSG ? __("CS in grams") : __("CS in carats"));
	}
	root.on("click", ".of-units", () => {
		CSG = !CSG;
		try { localStorage.setItem(CS_G_KEY, CSG ? "1" : "0"); } catch (e) { /* private window */ }
		paintUnits();
		paint();
		frappe.show_alert({ message: CSG
			? __("Colour stone now shows in grams — 1 ct = 0.2 g. Kept for next time.")
			: __("Colour stone now shows in carats. Kept for next time."), indicator: "blue" }, 4);
	});
	paintUnits();

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
			root.find(".of-jos, .of-rules").show();
			const flagged = PRICED.rows.filter((x) => (x.flags || []).length).length;
			if (flagged) frappe.show_alert({ message: __("{0} row(s) carry notes — check the yellow lines.", [flagged]), indicator: "orange" }, 5);
		});
	});

	// Pricing Rules — READ-ONLY: the slabs this lot actually hit (no edits,
	// no discounts — the chart is the law; this just shows which lines of it
	// were used and how much rode on each).
	root.on("click", ".of-rules", () => {
		if (!PRICED) return;
		const R = PRICED.rows;
		const groups = []; // {section, rule, rows, qty, total}
		// gold: one rate over the whole lot
		const goldNT = R.reduce((a, x) => a + flt(x.nt), 0);
		const goldVA = R.reduce((a, x) => a + flt(x.gold_va), 0);
		if (R.length) groups.push({ sec: __("Gold"), rule: __("₹{0}/g on NT", [R[0].gold_rt]),
			rows: R.length, qty: goldNT.toFixed(3) + " g", total: goldVA });
		// diamond brackets actually used
		const dmd = {};
		R.forEach((x) => {
			if (!flt(x.dmd_va)) return;
			const k = `${x.dmd_bracket}|${x.dmd_rt}`;
			const e = dmd[k] || (dmd[k] = { rows: 0, ct: 0, va: 0, b: x.dmd_bracket, rt: x.dmd_rt });
			e.rows++; e.ct += flt(x.dmd_ct); e.va += flt(x.dmd_va);
		});
		Object.values(dmd).forEach((e) => groups.push({ sec: __("Diamond"),
			rule: __("bracket {0} — ₹{1}/ct", [e.b || "?", money(e.rt)]),
			rows: e.rows, qty: e.ct.toFixed(3) + " ct", total: e.va }));
		// making rules: [TYPE] + flat/per-gram parsed off the row's own math
		const mk2 = {};
		R.forEach((x) => {
			const note = (x.notes || {}).mc || "";
			if (!note) return;
			const tag = (note.match(/\[([^\]]+)\]/) || [])[1] || "?";
			const flat = note.includes("flat");
			const k = `${tag}|${x.mc_rate}|${flat}`;
			const e = mk2[k] || (mk2[k] = { rows: 0, va: 0, tag, rate: x.mc_rate, flat });
			e.rows++; e.va += flt(x.mc);
		});
		Object.values(mk2).forEach((e) => groups.push({ sec: __("Making"),
			rule: e.flat ? __("{0} — flat below 1 g", [e.tag]) : __("{0} — ₹{1}/g", [e.tag, money(e.rate)]),
			rows: e.rows, qty: "", total: e.va }));
		// HUID + certification, from each row's own note (per-row numbers stripped)
		let huidN = 0, huidVA = 0, huidRate = 0;
		const cert = {};
		R.forEach((x) => {
			if (x.huid_count) { huidN += x.huid_count; huidVA += flt(x.huid_va); huidRate = flt(x.huid_va) / x.huid_count; }
			const co = flt(x.cert_va) - flt(x.huid_va);
			if (co <= 0) return;
			const seg = ((x.notes || {}).cert || "").split(" + ").find((t) => !t.includes("HUID")) || __("certification");
			const rule = seg.replace(/ x [\d.]+ ct.*$/, "").replace(/ = ₹[\d,.]+.*$/, "").trim();
			const e = cert[rule] || (cert[rule] = { rows: 0, va: 0 });
			e.rows++; e.va += co;
		});
		if (huidN) groups.push({ sec: __("Hallmark"), rule: __("₹{0} per HUID", [money(huidRate)]),
			rows: 0, qty: huidN + " HUID", total: huidVA });
		Object.entries(cert).forEach(([rule, e]) => groups.push({ sec: __("Certification"),
			rule, rows: e.rows, qty: "", total: e.va }));
		const d = new frappe.ui.Dialog({ title: __("Pricing rules in use — view only"), size: "large",
			fields: [{ fieldtype: "HTML", fieldname: "b" }] });
		const th = (t, r) => `<th style="text-align:${r ? "right" : "left"};padding:4px 8px;border-bottom:1px solid var(--gray-400);color:var(--text-muted);font-size:11px;text-transform:uppercase;">${t}</th>`;
		d.get_field("b").$wrapper.html(`
			<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">
				${__("Chart {0} · quality {1} — every slab the lot hit. Rates live on the chart; nothing here edits anything.", [esc(fChart.get_value() || ""), esc(fCq.get_value() || "")])}</div>
			<table style="width:100%;border-collapse:collapse;font-size:13px;">
			<thead><tr>${th(__("Component"))}${th(__("Rule / bracket in use"))}${th(__("Rows"), 1)}${th(__("Qty"), 1)}${th(__("₹ total"), 1)}</tr></thead><tbody>
			${groups.map((g) => `<tr>
				<td style="padding:5px 8px;border-bottom:1px solid var(--border-color);font-weight:700;">${esc(g.sec)}</td>
				<td style="padding:5px 8px;border-bottom:1px solid var(--border-color);">${esc(g.rule)}</td>
				<td style="padding:5px 8px;border-bottom:1px solid var(--border-color);text-align:right;">${g.rows || ""}</td>
				<td style="padding:5px 8px;border-bottom:1px solid var(--border-color);text-align:right;">${g.qty}</td>
				<td style="padding:5px 8px;border-bottom:1px solid var(--border-color);text-align:right;font-weight:700;">₹ ${money(g.total)}</td>
			</tr>`).join("")}</tbody></table>`);
		d.show();
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
