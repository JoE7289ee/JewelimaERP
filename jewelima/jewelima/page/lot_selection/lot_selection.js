// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Lot Selection (Stones > Stone Lots) — the assorting table.
//
// Somebody sits at a sieve tray with this open for an hour, so two things
// follow. The numbers they are answerable for sit at the TOP, where they can be
// read without scrolling past the tray: how much of the parcel is still to be
// sieved, how much is being kept, what percentage that is, and a small ring
// showing which sieves the parcel actually fell into.
//
// And there is NO SAVE BUTTON. Every keystroke saves, quietly, a moment after
// you stop typing — an hour of assorting should never end with a lost tray
// because a page was refreshed or a browser was closed.
//
// REJECTION is never typed. It is the actual less the selection, on every line
// and at the top, because that is the figure the provider is handed back and
// the one nobody should be able to get wrong.
//
// The purchase side and the return still live elsewhere. What IS here from the
// purchase side is the parcel's claimed weight, and only as a ceiling: sieves
// cannot add up to more stone than came in.
// Route: /app/lot-selection

frappe.pages["lot-selection"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Lot Selection"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const root = $(page.main);
	let CTX = null, LOT = null, LOTS = [], FILTER = "Open", SAVE = "";
	let REQS = { rows: [], can_approve: 0 };
	const ROWS = [];                      // [{sieve, actual, selected}]

	const ct = (v) => flt(v).toFixed(3);
	const r3 = (v) => Math.round(flt(v) * 1000) / 1000;
	// enough distinct hues for a tray; a parcel touching more sieves than this
	// folds its tail into one slice rather than inventing colours
	const HUES = ["#1d7a33", "#1f618d", "#8C6A00", "#7a4fb5", "#b02a2a", "#0f8b8d",
		"#c2571a", "#4a5a6a", "#a3197d", "#5b7f1f"];

	root.append(`
		<style>
		#page-lot-selection .container{max-width:100%;}

		/* ---------------- the board ---------------- */
		.ls-filters{display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap;align-items:center;}
		.ls-f{border:1px solid var(--border-color);background:var(--fg-color);border-radius:20px;
			padding:5px 16px;font-size:12.5px;cursor:pointer;color:var(--text-color);transition:.12s;}
		.ls-f:hover{border-color:var(--text-muted);}
		.ls-f.on{background:#1d7a33;color:#fff;border-color:#1d7a33;font-weight:700;}
		.ls-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(268px,1fr));gap:13px;}
		.ls-card{border:1px solid var(--border-color);border-radius:16px;background:var(--fg-color);
			padding:16px 18px;cursor:pointer;transition:.14s;}
		.ls-card:hover{border-color:#1d7a33;transform:translateY(-1px);box-shadow:0 4px 14px rgba(0,0,0,.07);}
		.ls-card .nm{font-size:15.5px;font-weight:800;letter-spacing:-.01em;}
		.ls-card .sup{font-size:12px;color:var(--text-muted);margin:3px 0 12px;}
		.ls-card .nums{display:flex;gap:18px;}
		.ls-card .n{font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);font-weight:600;}
		.ls-card .b{font-size:18px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.2;}
		.ls-card .sel .b{color:#1d7a33;} .ls-card .rej .b{color:#b02a2a;}
		[data-theme="dark"] .ls-card .sel .b{color:#7fc98f;}
		[data-theme="dark"] .ls-card .rej .b{color:#e08a8a;}
		.ls-tag{font-size:9.5px;font-weight:800;letter-spacing:.05em;border-radius:20px;
			padding:2px 10px;text-transform:uppercase;}
		.ls-tag.open{background:rgba(184,134,11,.18);color:#8a6508;}
		.ls-tag.closed{background:rgba(29,122,51,.16);color:#1d7a33;}
		.ls-tag.cancelled{background:rgba(127,140,141,.16);color:var(--text-muted);}
		[data-theme="dark"] .ls-tag.open{color:#e8b84a;}
		[data-theme="dark"] .ls-tag.closed{color:#7fc98f;}

		/* ---------------- one lot ---------------- */
		.ls-bar{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px;}
		.ls-back{border:1px solid var(--border-color);background:var(--fg-color);border-radius:10px;
			padding:7px 14px;font-size:12.5px;cursor:pointer;color:var(--text-color);}
		.ls-back:hover{border-color:var(--text-muted);}
		.ls-bar .nm{font-size:19px;font-weight:800;letter-spacing:-.01em;}
		.ls-bar .meta{font-size:12.5px;color:var(--text-muted);}
		.ls-spacer{margin-left:auto;display:flex;gap:9px;align-items:center;}
		.ls-pick{min-width:190px;}
		.ls-pick .control-label,.ls-pick .help-box{display:none !important;}
		.ls-pick select{height:38px;border-radius:10px;font-size:13.5px;}
		.ls-addbtn{background:var(--fg-color);border:1px dashed var(--border-color);color:var(--text-color);
			font-weight:700;border-radius:10px;padding:0 18px;height:38px;font-size:12.5px;cursor:pointer;}
		.ls-addbtn:hover{border-color:#1d7a33;color:#1d7a33;border-style:solid;}
		.ls-addbtn[disabled]{opacity:.4;cursor:not-allowed;}
		/* no SAVE button — this is the whole save UI */
		.ls-state{font-size:11.5px;font-weight:700;border-radius:20px;padding:5px 13px;
			border:1px solid transparent;white-space:nowrap;}
		.ls-state.idle{color:var(--text-muted);}
		.ls-state.saving{color:#8a6508;background:rgba(184,134,11,.13);}
		.ls-state.saved{color:#1d7a33;background:rgba(29,122,51,.13);}
		.ls-state.failed{color:#b02a2a;background:rgba(176,42,42,.13);border-color:#b02a2a;}

		/* ---------------- the KPIs on top ---------------- */
		.ls-top{display:flex;gap:11px;align-items:stretch;flex-wrap:wrap;margin-bottom:13px;}
		.ls-kpi{flex:1 1 140px;border:1px solid var(--border-color);border-radius:14px;
			padding:11px 15px;background:var(--fg-color);}
		.ls-kpi .k{font-size:9.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);font-weight:700;}
		.ls-kpi .v{font-size:24px;font-weight:800;line-height:1.2;font-variant-numeric:tabular-nums;letter-spacing:-.02em;}
		.ls-kpi .v .u{font-size:11px;font-weight:600;color:var(--text-muted);margin-left:2px;}
		.ls-kpi .sub{font-size:10.5px;color:var(--text-muted);margin-top:1px;}
		.ls-kpi.left{border-left:3px solid #8C6A00;} .ls-kpi.left .v{color:#8C6A00;}
		.ls-kpi.sel{border-left:3px solid #1d7a33;} .ls-kpi.sel .v{color:#1d7a33;}
		.ls-kpi.rej{border-left:3px solid #b02a2a;} .ls-kpi.rej .v{color:#b02a2a;}
		.ls-kpi.bad{border-color:#b02a2a;background:rgba(176,42,42,.07);}
		.ls-kpi.bad .v{color:#b02a2a;}
		[data-theme="dark"] .ls-kpi.left .v{color:#d9ad3c;}
		[data-theme="dark"] .ls-kpi.sel .v{color:#7fc98f;}
		[data-theme="dark"] .ls-kpi.rej .v{color:#e08a8a;}
		.ls-bar2{height:5px;border-radius:4px;background:var(--control-bg);margin-top:7px;overflow:hidden;}
		.ls-bar2 i{display:block;height:100%;background:#1d7a33;border-radius:4px;transition:width .18s;}

		/* the ring: which sieves the parcel fell into */
		.ls-pie{flex:0 0 auto;display:flex;gap:12px;align-items:center;border:1px solid var(--border-color);
			border-radius:14px;padding:11px 15px;background:var(--fg-color);}
		.ls-ring{width:76px;height:76px;border-radius:50%;flex:0 0 76px;position:relative;}
		.ls-ring::after{content:"";position:absolute;inset:21%;border-radius:50%;background:var(--fg-color);}
		.ls-ringn{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
			z-index:1;font-size:12.5px;font-weight:800;font-variant-numeric:tabular-nums;}
		.ls-leg{font-size:10.5px;line-height:1.55;max-height:82px;overflow:auto;min-width:118px;}
		.ls-leg div{display:flex;align-items:center;gap:6px;white-space:nowrap;}
		.ls-leg i{width:8px;height:8px;border-radius:2px;flex:0 0 8px;}
		.ls-leg b{margin-left:auto;font-variant-numeric:tabular-nums;}

		/* ---------------- the table ---------------- */
		.ls-box{border:1px solid var(--border-color);border-radius:16px;overflow:hidden;background:var(--fg-color);}
		.ls-scroll{overflow:auto;max-height:calc(100vh - 400px);}
		table.ls-t{width:100%;border-collapse:separate;border-spacing:0;}
		table.ls-t th{position:sticky;top:0;z-index:2;background:var(--control-bg,var(--fg-color));
			border-bottom:1px solid var(--border-color);padding:11px 16px;text-align:left;
			font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);}
		table.ls-t td{border-bottom:1px solid var(--border-color);padding:0 16px;height:52px;vertical-align:middle;}
		table.ls-t tbody tr:last-child td{border-bottom:none;}
		table.ls-t tbody tr:hover td{background:rgba(29,122,51,.035);}
		table.ls-t th.num,table.ls-t td.num{text-align:right;}
		td.ls-sv{font-size:15px;font-weight:800;letter-spacing:-.01em;}
		td.ls-sv i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:8px;}
		table.ls-t input.ls-in{width:130px;text-align:right;border:1px solid transparent;border-radius:9px;
			background:transparent;height:38px;padding:0 11px;font-size:17px;font-weight:700;
			font-variant-numeric:tabular-nums;color:var(--text-color);-moz-appearance:textfield;transition:.1s;}
		table.ls-t input.ls-in:hover{border-color:var(--border-color);}
		table.ls-t input.ls-in:focus{border-color:#1d7a33;background:var(--fg-color);
			box-shadow:0 0 0 3px rgba(29,122,51,.13);outline:none;}
		.ls-in::-webkit-inner-spin-button,.ls-in::-webkit-outer-spin-button{-webkit-appearance:none;margin:0;}
		td.ls-rej{font-size:17px;font-weight:800;font-variant-numeric:tabular-nums;color:#b02a2a;}
		[data-theme="dark"] td.ls-rej{color:#e08a8a;}
		td.ls-rej.zero{color:var(--text-muted);font-weight:600;}
		tr.ls-bad td{background:rgba(176,0,32,.07) !important;}
		.ls-x{border:none;background:none;color:var(--border-color);cursor:pointer;font-size:19px;line-height:1;padding:0 6px;}
		tr:hover .ls-x{color:var(--text-muted);}
		.ls-x:hover{color:#b02a2a !important;}

		.ls-err{margin-top:10px;font-size:12.5px;font-weight:700;color:#b02a2a;}
		.ls-kpi.buy{border-left:3px solid #7a4fb5;} .ls-kpi.buy .v{color:#7a4fb5;}
		[data-theme="dark"] .ls-kpi.buy .v{color:#bfa3e8;}
		.ls-bought{font-size:10px;font-weight:700;color:#7a4fb5;letter-spacing:.02em;}
		[data-theme="dark"] .ls-bought{color:#bfa3e8;}

		/* keep for stock */
		.ls-keep{margin-top:16px;border:1px solid var(--border-color);border-radius:16px;
			background:var(--fg-color);overflow:hidden;}
		.ls-keep .hd{display:flex;align-items:center;gap:10px;padding:11px 16px;
			border-bottom:1px solid var(--border-color);}
		.ls-keep .hd b{font-size:12.5px;letter-spacing:.02em;}
		.ls-keep .hd span{font-size:11.5px;color:var(--text-muted);}
		.ls-keep .hd .sp{margin-left:auto;display:flex;gap:8px;align-items:center;}
		table.ls-kt{width:100%;border-collapse:separate;border-spacing:0;}
		table.ls-kt th{background:var(--control-bg,var(--fg-color));border-bottom:1px solid var(--border-color);
			padding:8px 16px;text-align:left;font-size:9.5px;font-weight:800;
			text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);}
		table.ls-kt td{border-bottom:1px solid var(--border-color);padding:5px 16px;height:44px;}
		table.ls-kt tbody tr:last-child td{border-bottom:none;}
		table.ls-kt th.num,table.ls-kt td.num{text-align:right;font-variant-numeric:tabular-nums;}
		table.ls-kt input.ls-kin{width:110px;text-align:right;border:1px solid transparent;
			border-radius:8px;background:transparent;height:34px;padding:0 10px;font-size:15px;
			font-weight:700;font-variant-numeric:tabular-nums;color:var(--text-color);-moz-appearance:textfield;}
		table.ls-kt input.ls-kin:hover{border-color:var(--border-color);}
		table.ls-kt input.ls-kin:focus{border-color:#7a4fb5;background:var(--fg-color);
			box-shadow:0 0 0 3px rgba(122,79,181,.13);outline:none;}
		.ls-full{border:1px solid var(--border-color);background:var(--fg-color);border-radius:8px;
			padding:3px 10px;font-size:11px;cursor:pointer;color:var(--text-muted);}
		.ls-full:hover{border-color:#7a4fb5;color:#7a4fb5;}
		.ls-ask{background:#7a4fb5;border:1px solid #7a4fb5;color:#fff;font-weight:800;
			border-radius:10px;padding:0 22px;height:36px;font-size:12.5px;cursor:pointer;}
		.ls-ask[disabled]{opacity:.4;cursor:not-allowed;}
		.ls-close{background:var(--fg-color);border:1px solid #b02a2a;color:#b02a2a;font-weight:800;
			border-radius:10px;padding:0 18px;height:36px;font-size:12.5px;cursor:pointer;}
		.ls-close:hover{background:#b02a2a;color:#fff;}
		.ls-kind{font-size:9.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;
			border-radius:20px;padding:2px 8px;background:var(--control-bg);color:var(--text-muted);}
		.ls-kind.close{background:rgba(176,42,42,.14);color:#b02a2a;}
		[data-theme="dark"] .ls-kind.close{color:#e08a8a;}
		.ls-rq{display:flex;align-items:center;gap:10px;padding:8px 16px;
			border-top:1px solid var(--border-color);font-size:12px;}
		.ls-rq .who{color:var(--text-muted);}
		.ls-rq .sp{margin-left:auto;display:flex;gap:6px;}
		.ls-st{font-size:9.5px;font-weight:800;letter-spacing:.05em;border-radius:20px;
			padding:2px 9px;text-transform:uppercase;}
		.ls-st.pending{background:rgba(184,134,11,.18);color:#8a6508;}
		.ls-st.approved{background:rgba(29,122,51,.16);color:#1d7a33;}
		.ls-st.rejected{background:rgba(176,42,42,.14);color:#b02a2a;}
		[data-theme="dark"] .ls-st.pending{color:#e8b84a;}
		[data-theme="dark"] .ls-st.approved{color:#7fc98f;}
		.ls-yes{background:#1d7a33;border:1px solid #1d7a33;color:#fff;border-radius:8px;
			padding:3px 13px;font-size:11px;font-weight:700;cursor:pointer;}
		.ls-no{background:var(--fg-color);border:1px solid #b02a2a;color:#b02a2a;border-radius:8px;
			padding:3px 13px;font-size:11px;font-weight:700;cursor:pointer;}
		/* the purchase sheet a manager signs off */
		.ls-po{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px 20px;
			border:1px solid var(--border-color);border-radius:10px;padding:10px 14px;
			background:var(--control-bg);margin-bottom:12px;}
		.ls-po .r{display:flex;gap:10px;font-size:12.5px;padding:2px 0;}
		.ls-po .r span{color:var(--text-muted);min-width:96px;}
		table.ls-pt{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.ls-pt th{text-align:left;font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;
			color:var(--text-muted);padding:6px 10px;border-bottom:1px solid var(--border-color);}
		table.ls-pt td{padding:6px 10px;border-bottom:1px solid var(--border-color);}
		table.ls-pt th.num,table.ls-pt td.num{text-align:right;font-variant-numeric:tabular-nums;}
		table.ls-pt tr.tot td{font-weight:800;border-bottom:none;border-top:2px solid var(--gray-400,#aeb6bf);}
		.ls-pw{margin-top:10px;padding:8px 12px;border-radius:8px;font-size:12.5px;font-weight:700;
			color:#b02a2a;background:rgba(176,42,42,.08);border:1px solid #b02a2a;}
		.ls-pn{margin-top:10px;font-size:11.5px;color:var(--text-muted);}
		.ls-pr{font-size:11px;font-weight:700;color:#7a4fb5;}
		[data-theme="dark"] .ls-pr{color:#bfa3e8;}
		.ls-hint{font-size:11.5px;color:var(--text-muted);margin-top:9px;}
		.ls-empty{padding:46px 20px;text-align:center;color:var(--text-muted);font-size:13.5px;}
		</style>
		<div class="ls-board"></div>
		<div class="ls-one" style="display:none;">
			<div class="ls-bar"></div>
			<div class="ls-top"></div>
			<div class="ls-box"><div class="ls-scroll">
				<table class="ls-t"><thead></thead><tbody></tbody></table>
			</div></div>
			<div class="ls-err"></div>
			<div class="ls-hint"></div>
			<div class="ls-keep"></div>
		</div>
	`);

	// ------------------------------------------------------------- the board
	function paintBoard() {
		const rows = (LOTS || []).filter((r) => !FILTER || r.status === FILTER);
		root.find(".ls-board").html(`
			<div class="ls-filters">
				${["Open", "Closed", ""].map((s) => `
					<button class="ls-f ${FILTER === s ? "on" : ""}" data-s="${esc(s)}">${
						s ? __(s) : __("All")}</button>`).join("")}
				<span style="font-size:12px;color:var(--text-muted);margin-left:6px;">${
					__("Pick the parcel you are sitting down with.")}</span>
			</div>
			${rows.length ? `<div class="ls-grid">${rows.map((r) => {
				const st = (r.status || "Open").toLowerCase();
				return `<div class="ls-card" data-name="${esc(r.name)}">
					<div style="display:flex;justify-content:space-between;align-items:start;gap:8px;">
						<span class="nm">${esc(r.name)}</span>
						<span class="ls-tag ${st}">${esc(r.status)}</span></div>
					<div class="sup">${esc(r.supplier)}${r.quality ? " · " + esc(r.quality) : ""}</div>
					<div class="nums">
						<div><div class="n">${__("Assorted")}</div><div class="b">${r.actual ? ct(r.actual) : "—"}</div></div>
						<div class="sel"><div class="n">${__("Selected")}</div><div class="b">${r.selected ? ct(r.selected) : "—"}</div></div>
						<div class="rej"><div class="n">${__("Rejection")}</div><div class="b">${r.rejected ? ct(r.rejected) : "—"}</div></div>
					</div></div>`;
			}).join("")}</div>`
			: `<div class="ls-empty">${FILTER
				? __("No {0} lots — try another tab, or book a parcel in on Stone Lots.", [__(FILTER).toLowerCase()])
				: __("No lots yet — book a parcel in on Stone Lots.")}</div>`}`);
	}
	root.on("click", ".ls-f", function () { FILTER = $(this).data("s") || ""; paintBoard(); });
	root.on("click", ".ls-card", function () { open($(this).data("name")); });

	// --------------------------------------------------------------- one lot
	// The tray IS what is left. Asking to keep stones takes them off it there and
	// then, so the figures on screen are the figures — nothing to derive, and the
	// desk can go on assorting whatever is still there.
	const leftA = (x) => flt(x.actual);
	const leftS = (x) => flt(x.selected);
	const tot = (k) => ROWS.reduce((a, x) => a + flt(x[k]), 0);
	const totLeftA = () => tot("actual");
	const totLeftS = () => tot("selected");
	const totBought = () => ROWS.reduce((a, x) => a + flt(x.purchased), 0);
	const used = () => new Set(ROWS.map((x) => x.sieve));
	const free = () => (CTX.sieves || []).map((s) => s.sieve_size).filter((s) => !used().has(s));
	const lotWt = () => (LOT ? flt(LOT.claimed) : 0);
	// an open request has already taken its carats off the tray, so what is
	// assorted right now IS what is free to ask for
	const claimed = (sv) => (REQS.rows || []).filter((q) => q.status === "Pending")
		.reduce((a, q) => a + ((q.items || []).filter((i) => i.sieve === sv)
			.reduce((b, i) => b + flt(i.cts), 0)), 0);
	const freeFor = (x) => flt(x.selected);
	const overRow = () => ROWS.some((x) => flt(x.selected) > flt(x.actual) + 0.0005);
	// the parcel is a ceiling: the sieves cannot hold more stone than came in
	// the ceiling counts the bought carats too, or a parcel could be re-assorted
	// past its own weight once some of it had been taken into stock
	const overLot = () => lotWt() > 0 && (tot("actual") + totBought()) > lotWt() + 0.0005;
	const blocked = () => overRow() || overLot();

	function paintBar() {
		root.find(".ls-bar").html(`
			<button class="ls-back">${__("← Lots")}</button>
			<span class="nm">${esc(LOT.name)}</span>
			<span class="meta">${esc(LOT.supplier)}${LOT.quality ? " · " + esc(LOT.quality) : ""}</span>
			<span class="ls-spacer">
				<span class="ls-pick"></span>
				<button class="ls-addbtn">+ ${__("Sieve")}</button>
				<span class="ls-state idle">${__("nothing to save")}</span>
			</span>`);
		F.pick = frappe.ui.form.make_control({
			df: { fieldtype: "Select", fieldname: "sieve",
				// a blank first option, so the button has something to wait for
				options: [""].concat(free()) },
			parent: root.find(".ls-pick").get(0), render_input: true });
		F.pick.refresh();
		F.pick.$input.on("change", refreshPicker);
		refreshPicker();
		paintState();
	}
	const F = {};
	function refreshPicker() {
		if (!F.pick) return;
		const opts = free();
		const had = F.pick.get_value();
		const want = [""].concat(opts);
		if ((F.pick.df.options || []).join("|") !== want.join("|")) {
			F.pick.df.options = want;
			F.pick.refresh();
			if (had && opts.includes(had)) F.pick.set_value(had);
		}
		// the button only appears once a sieve is actually picked — an ADD that
		// does nothing until you have chosen something is a button that lies
		root.find(".ls-addbtn").toggle(!!(F.pick.get_value() || "").trim());
	}
	function paintState() {
		const map = { saving: __("saving…"), saved: __("saved"), failed: __("NOT SAVED — retrying"), "": __("nothing to save"), dirty: __("unsaved…") };
		root.find(".ls-state").attr("class", "ls-state " + (SAVE || "idle")).text(map[SAVE] || map[""]);
	}

	function paintTop() {
		const claimed = lotWt();
		const onTray = totLeftA(), s = totLeftS(), bought = totBought();
		// ASSORTED counts what has been bought as well. Those carats went through
		// the sieve and then left the tray, so measuring only what is still there
		// made a parcel look LESS sorted the more of it we kept — 400 claimed,
		// 80 on the tray and 135 already bought was reading as 320 left to do.
		const a = r3(onTray + bought);
		const rej = Math.max(onTray - s, 0);
		const left = claimed ? r3(claimed - a) : 0;
		const pct = onTray > 0 ? (s / onTray) * 100 : 0;

		// the ring: which sieves the parcel fell into, by weight
		const slices = ROWS.filter((x) => leftA(x) > 0)
			.map((x) => ({ sieve: x.sieve, ct: leftA(x) }))
			.sort((p, q) => q.ct - p.ct);
		const sum = slices.reduce((t, x) => t + x.ct, 0);
		let at = 0;
		const stops = slices.map((x, i) => {
			const from = (at / sum) * 100; at += x.ct;
			return `${HUES[i % HUES.length]} ${from.toFixed(2)}% ${((at / sum) * 100).toFixed(2)}%`;
		}).join(",");

		root.find(".ls-top").html(`
			${slices.length ? `<div class="ls-pie">
				<div class="ls-ring" style="background:conic-gradient(${stops});">
					<div class="ls-ringn">${slices.length}</div></div>
				<div class="ls-leg">${slices.map((x, i) => `<div>
					<i style="background:${HUES[i % HUES.length]}"></i>${esc(x.sieve)}
					<b>${((x.ct / sum) * 100).toFixed(0)}%</b></div>`).join("")}</div>
			</div>` : ""}
			${claimed ? `<div class="ls-kpi ${overLot() ? "bad" : "left"}">
				<div class="k">${overLot() ? __("Over the parcel") : __("Left to assort")}</div>
				<div class="v">${ct(overLot() ? a - claimed : Math.max(left, 0))}<span class="u">ct</span></div>
				<div class="sub">${__("of {0} ct booked in", [ct(claimed)])}</div></div>` : ""}
			<div class="ls-kpi"><div class="k">${__("Assorted")}</div>
				<div class="v">${ct(a)}<span class="u">ct</span></div>
				<div class="sub">${bought ? __("{0} on the tray · {1} bought", [ct(onTray), ct(bought)])
					: __("{0} sieve(s)", [ROWS.length])}</div></div>
			<div class="ls-kpi sel"><div class="k">${__("Selected")}</div>
				<div class="v">${ct(s)}<span class="u">ct</span></div>
				<div class="sub">${__("still on the tray to keep")}</div></div>
			<div class="ls-kpi sel"><div class="k">${__("Selected %")}</div>
				<div class="v">${pct.toFixed(1)}<span class="u">%</span></div>
				<div class="ls-bar2"><i style="width:${Math.min(pct, 100).toFixed(1)}%"></i></div></div>
			<div class="ls-kpi buy"><div class="k">${__("Purchased")}</div>
				<div class="v">${ct(bought)}<span class="u">ct</span></div>
				<div class="sub">${__("bought for stock — off the tray")}</div></div>
			<div class="ls-kpi rej ${overRow() ? "bad" : ""}"><div class="k">${__("Rejection")}</div>
				<div class="v">${overRow() ? __("over") : ct(rej) + `<span class="u">ct</span>`}</div>
				<div class="sub">${__("goes back to the provider")}</div></div>`);

		root.find(".ls-err").html(overLot()
			? __("The sieves add up to <b>{0} ct</b> — more than the <b>{1} ct</b> that came in. Nothing is being saved until that is fixed.",
				[ct(a), ct(claimed)])
			: (overRow() ? __("A sieve keeps more than it holds — fix the red line. Nothing is being saved until then.") : ""));
		root.find(".ls-hint").text(__("Rejection is worked out for you. Everything saves on its own — there is no save button."));
	}

	// ---- KEEP FOR STOCK ----------------------------------------------------
	// Assorting says what we WOULD keep. This asks to buy it, which is the point
	// at which stones stop being the provider's. So it is a request, it names the
	// carats per sieve, and only a manager decides it.
	const ASK = {};                       // sieve -> carats typed, kept across repaints

	function paintKeep() {
		if (!LOT) return root.find(".ls-keep").empty();
		// every sieve on the tray, even one just added with nothing against it —
		// waiting for it to appear is worse than a row of dashes
		const rows = ROWS.slice();
		const asked = Object.keys(ASK).reduce((a, k) => a + flt(ASK[k]), 0);
		const anyAsk = rows.some((x) => flt(ASK[x.sieve]) > 0);
		root.find(".ls-keep").html(`
			<div class="hd"><b>${__("Keep for stock")}</b>
				<span>${__("asking takes the carats off the tray at once — a rejection puts them back")}</span>
				<span class="sp">
					${asked ? `<span style="font-size:12px;font-weight:700;">${ct(asked)} ct</span>` : ""}
					<button class="ls-ask" ${anyAsk ? "" : "disabled"}>${__("REQUEST")}</button>
					${LOT.status === "Closed" ? "" :
						`<button class="ls-close">${__("CLOSE LOT")}</button>`}
				</span></div>
			${rows.length ? `<table class="ls-kt"><thead><tr>
				<th>${__("Sieve")}</th><th class="num">${__("Assorted now")}</th>
				<th class="num">${__("Bought")}</th><th class="num">${__("Awaiting")}</th>
				<th class="num">${__("Free to keep")}</th><th class="num">${__("Ask for")}</th>
				<th style="width:70px;"></th></tr></thead><tbody>
				${rows.map((x) => {
					const free = freeFor(x);
					return `<tr data-sv="${esc(x.sieve)}">
						<td style="font-weight:700;">${esc(x.sieve)}</td>
						<td class="num">${ct(leftS(x))}</td>
						<td class="num" style="color:#7a4fb5;">${flt(x.purchased) ? ct(x.purchased) : "—"}</td>
						<td class="num">${claimed(x.sieve) ? ct(claimed(x.sieve)) : "—"}</td>
						<td class="num"><b>${ct(free)}</b></td>
						<td class="num"><input type="number" step="0.001" min="0" class="ls-kin"
							data-sv="${esc(x.sieve)}" placeholder="0.000"
							value="${ASK[x.sieve] || ""}" ${free > 0.0005 ? "" : "disabled"}></td>
						<td>${free > 0.0005
							? `<button class="ls-full" data-sv="${esc(x.sieve)}">${__("all")}</button>` : ""}</td>
					</tr>`;
				}).join("")}</tbody></table>`
			: `<div class="ls-empty" style="padding:26px;">${
				__("Assort something first — you can only ask to keep what you have kept.")}</div>`}
			${(REQS.rows || []).map((q) => `
				<div class="ls-rq" data-name="${esc(q.name)}">
					<span class="ls-st ${esc((q.status || "").toLowerCase())}">${esc(q.status)}</span>
					<span class="ls-kind ${q.request_type === "Close" ? "close" : ""}">${
						esc(q.request_type === "Close" ? __("close") : __("buy"))}</span>
					<b>${ct(q.total_cts)} ct</b>
					<span class="who">${(q.items || []).map((i) => esc(i.sieve) + " " + ct(i.cts)).join(" · ")}</span>
					<span class="who">· ${esc(q.requested_label || "")} ${esc((q.requested_on || "").slice(0, 16))}${
						q.decided_label ? " · " + __("by") + " " + esc(q.decided_label) : ""}</span>
					${q.purchase_record ? `<a class="ls-pr" href="/app/purchase-history"
						title="${__("posted to Purchase History")}">${esc(q.purchase_record)}</a>` : ""}
					${q.status === "Pending" && REQS.can_approve ? `<span class="sp">
						<button class="ls-yes" data-name="${esc(q.name)}">${__("APPROVE")}</button>
						<button class="ls-no" data-name="${esc(q.name)}">${__("Reject")}</button></span>` : ""}
				</div>`).join("")}`);
	}

	root.on("input", ".ls-kin", function () {
		const sv = $(this).data("sv");
		const x = ROWS.find((r) => r.sieve === sv);
		const v = flt(this.value);
		if (v > 0) ASK[sv] = v; else delete ASK[sv];
		// never let somebody ask for more than is free — the server refuses it
		// anyway, but finding out at REQUEST is finding out too late
		const over = x && v > freeFor(x) + 0.0005;
		$(this).css("border-color", over ? "#b02a2a" : "");
		root.find(".ls-ask").prop("disabled", !Object.keys(ASK).length
			|| ROWS.some((r) => flt(ASK[r.sieve]) > freeFor(r) + 0.0005));
	});

	root.on("click", ".ls-full", function () {
		const sv = $(this).data("sv");
		const x = ROWS.find((r) => r.sieve === sv);
		if (!x) return;
		ASK[sv] = freeFor(x);
		paintKeep();
	});

	root.on("click", ".ls-ask", function () {
		const rows = Object.keys(ASK).map((sieve) => ({ sieve, cts: flt(ASK[sieve]) }))
			.filter((r) => r.cts > 0);
		if (!rows.length || !LOT) return;
		const total = rows.reduce((a, r) => a + r.cts, 0);
		frappe.confirm(
			__("Ask to keep <b>{0} ct</b> off {1}?", [ct(total), esc(LOT.name)]) + "<br><br>"
			+ rows.map((r) => `${esc(r.sieve)} — <b>${ct(r.cts)} ct</b>`).join("<br>")
			+ "<br><br>" + __("These come off the tray now and cannot be assorted again while it is decided. A rejection puts them back."),
			() => {
				frappe.dom.freeze(__("Requesting…"));
				// whatever is half-typed goes in FIRST. A debounced save landing
				// after the request would write the pre-request tray back over it.
				saveNow()
					.then(() => frappe.call({ method: API + ".create_stone_purchase_request",
						args: { lot: LOT.name, rows: JSON.stringify(rows) } }))
					.then((r) => {
						frappe.dom.unfreeze();
						Object.keys(ASK).forEach((k) => delete ASK[k]);
						frappe.show_alert({ indicator: "green", message:
							__("{0} — {1} ct off the tray, waiting on a manager.",
								[(r.message || {}).name, ct(total)]) }, 7);
						// the tray moved on the server; take it from there
						open(LOT.name);
					}).catch(() => frappe.dom.unfreeze());
			});
	});

	// Closing raises TWO things: whatever is still assorted goes up as a purchase
	// like any other — closing is not a way to buy without asking — and the rest
	// goes up as a close that writes it off to the provider.
	root.on("click", ".ls-close", function () {
		if (!LOT) return;
		const keep = ROWS.reduce((a, x) => a + leftS(x), 0);
		const back = ROWS.reduce((a, x) => a + Math.max(leftA(x) - leftS(x), 0), 0);
		frappe.confirm(
			__("Finish with {0}?", [esc(LOT.name)]) + "<br><br>"
			+ (keep ? __("<b>{0} ct</b> still assorted goes up as a purchase request.", [ct(keep)]) + "<br>" : "")
			+ (back ? __("<b>{0} ct</b> goes up as a close request — written off to the provider.", [ct(back)]) : "")
			+ "<br><br>" + __("Both need approving, and the close cannot go through until the purchase is settled."),
			() => {
				frappe.dom.freeze(__("Raising…"));
				saveNow()
					.then(() => frappe.call({ method: API + ".close_stone_lot_request",
						args: { lot: LOT.name } }))
					.then((r) => {
						frappe.dom.unfreeze();
						const m = r.message || {};
						frappe.show_alert({ indicator: "blue", message:
							__("Raised {0} — waiting on a manager.",
								[[m.purchase, m.close].filter(Boolean).join(" + ")]) }, 8);
						open(LOT.name);
					}).catch(() => frappe.dom.unfreeze());
			});
	});

	root.on("click", ".ls-no", function () {
		const nm = $(this).data("name");
		frappe.confirm(__("Reject {0}? The carats go back on the tray.", [esc(nm)]), () => {
			frappe.dom.freeze(__("Rejecting…"));
			frappe.call({ method: API + ".decide_stone_purchase_request",
				args: { name: nm, decision: "Rejected" } })
				.then(() => {
					frappe.dom.unfreeze();
					frappe.show_alert({ indicator: "orange", message: __("{0} rejected.", [nm]) }, 6);
					open(LOT.name);
				}).catch(() => frappe.dom.unfreeze());
		});
	});

	// APPROVING IS BUYING. So it shows the purchase before it makes it — the same
	// sheet Purchase Raw Material posts, filled in from the lot and the request
	// and READ ONLY: everything on it came from somewhere, and anything worth
	// changing should be changed there rather than typed over here.
	root.on("click", ".ls-yes", function () {
		const nm = $(this).data("name");
		const q = (REQS.rows || []).find((x) => x.name === nm) || {};
		if (q.request_type === "Close") {
			frappe.confirm(
				__("Close {0}?", [esc(LOT.name)]) + "<br><br>"
				+ __("<b>{0} ct</b> goes back to the provider and the lot is finished with.", [ct(q.total_cts)])
				+ "<br>" + (q.items || []).map((i) => `${esc(i.sieve)} — ${ct(i.cts)} ct`).join("<br>"),
				() => {
					frappe.dom.freeze(__("Closing…"));
					frappe.call({ method: API + ".decide_stone_purchase_request",
						args: { name: nm, decision: "Approved" } })
						.then(() => {
							frappe.dom.unfreeze();
							frappe.show_alert({ indicator: "green",
								message: __("{0} closed — {1} ct returned.", [LOT.name, ct(q.total_cts)]) }, 8);
							open(LOT.name);
						}).catch(() => frappe.dom.unfreeze());
				});
			return;
		}
		frappe.call({ method: API + ".get_stone_purchase_posting", args: { name: nm } }).then((r) => {
			const m = r.message || {};
			const d = new frappe.ui.Dialog({
				title: __("Purchase {0}", [nm]), size: "large",
				fields: [{ fieldtype: "HTML", fieldname: "h" }],
				primary_action_label: __("PURCHASE"),
				primary_action() {
					d.hide();
					frappe.dom.freeze(__("Posting the purchase…"));
					frappe.call({ method: API + ".decide_stone_purchase_request",
						args: { name: nm, decision: "Approved" } })
						.then((rr) => {
							frappe.dom.unfreeze();
							const x = rr.message || {};
							frappe.show_alert({ indicator: "green", message: x.purchase_record
								? __("{0} approved — posted as {1}.", [nm, x.purchase_record])
								: __("{0} approved.", [nm]) }, 8);
							open(LOT.name);
						}).catch(() => frappe.dom.unfreeze());
				},
			});
			const bad = (m.missing || []).length || !m.warehouse;
			d.fields_dict.h.$wrapper.html(`
				<div class="ls-po">
					<div class="r"><span>${__("Voucher type")}</span><b>${esc(m.voucher_type || "")}</b></div>
					<div class="r"><span>${__("Provider")}</span><b>${esc(m.supplier || "")}</b></div>
					<div class="r"><span>${__("Warehouse")}</span><b>${esc(m.warehouse || "—")}</b></div>
					<div class="r"><span>${__("Date")}</span><b>${esc(m.posting_date || "")}</b></div>
					<div class="r"><span>${__("From lot")}</span><b>${esc(m.lot || "")} · ${esc(m.quality || "")}</b></div>
				</div>
				<table class="ls-pt"><thead><tr><th>${__("Item")}</th><th>${__("Sieve")}</th>
					<th class="num">${__("Carat")}</th><th class="num">${__("Pieces")}</th>
					<th>${__("UOM")}</th></tr></thead><tbody>
					${(m.rows || []).map((x) => `<tr><td><b>${esc(x.item)}</b></td>
						<td>${esc(x.sieve)}</td><td class="num">${ct(x.carat)}</td>
						<td class="num">${x.count || "—"}</td>
						<td>${esc(x.uom)}</td></tr>`).join("")}
					<tr class="tot"><td colspan="2">${__("Total")}</td>
						<td class="num">${ct(m.total_cts)}</td>
						<td class="num">${(m.rows || []).reduce((a, x) => a + (x.count || 0), 0)}</td><td></td></tr>
				</tbody></table>
				<div class="ls-pn">${__("The piece count is worked out from the sieve chart's average carats — a lot is weighed, not counted.")}</div>
				${(m.missing || []).length ? `<div class="ls-pw">${
					__("No stock item for {0}. A lot is bought as its quality and sieve, so the item has to exist first.",
						[(m.missing || []).join(", ")])}</div>` : ""}
				${!m.warehouse ? `<div class="ls-pw">${__("No Stone Issue warehouse to buy into.")}</div>` : ""}
				<div class="ls-pn">${__("Nothing here can be edited — it all comes from the lot and the request. Purchasing posts it to Purchase History.")}</div>`);
			d.show();
			if (bad) d.get_primary_btn().prop("disabled", true);
		});
	});

	function loadReqs() {
		if (!LOT) return Promise.resolve();
		return frappe.call({ method: API + ".get_stone_purchase_requests", freeze: false,
			args: { lot: LOT.name } }).then((r) => {
			REQS = r.message || REQS;
			paintKeep();
			paintTable();
		});
	}

	function rowHtml(x, i) {
		// rejection is actual less selected, and buying takes the same amount off
		// BOTH — so what goes back to the provider never moves
		const rj = r3(flt(x.actual) - flt(x.selected));
		const bad = flt(x.selected) > flt(x.actual) + 0.0005;
		const bought = flt(x.purchased);
		return `<tr class="${bad ? "ls-bad" : ""}" data-i="${i}">
			<td class="ls-sv"><i data-dot="${i}"></i>${esc(x.sieve)}${
				bought ? `<div class="ls-bought">${__("{0} ct bought", [ct(bought)])}</div>` : ""}</td>
			<td class="num"><input type="number" step="0.001" min="0" class="ls-in"
				data-f="actual" data-i="${i}" placeholder="0.000" value="${x.actual || ""}"
				title="${__("as assorted — what has been bought is shown under the sieve")}"></td>
			<td class="num"><input type="number" step="0.001" min="0" class="ls-in"
				data-f="selected" data-i="${i}" placeholder="0.000" value="${x.selected || ""}"></td>
			<td class="num ls-rej ${rj ? "" : "zero"}">${bad ? __("over") : ct(rj)}</td>
			<td style="width:44px;text-align:right;"><button class="ls-x" data-i="${i}"
				title="${__("take the sieve off")}">&times;</button></td></tr>`;
	}

	// the row dot matches its slice in the ring, so the table and the chart are
	// obviously the same thing
	function paintDots() {
		const order = ROWS.map((x, i) => ({ i, ct: flt(x.actual) }))
			.filter((x) => x.ct > 0).sort((p, q) => q.ct - p.ct);
		root.find(".ls-sv i").css("background", "transparent");
		order.forEach((x, k) => root.find(`.ls-sv i[data-dot="${x.i}"]`).css("background", HUES[k % HUES.length]));
	}

	function paintTable() {
		root.find(".ls-t thead").html(`<tr>
			<th>${__("Sieve")}</th><th class="num">${__("Actual cts")}</th>
			<th class="num">${__("Select cts")}</th><th class="num">${__("Rejection cts")}</th>
			<th style="width:44px;"></th></tr>`);
		root.find(".ls-t tbody").html(ROWS.length ? ROWS.map(rowHtml).join("")
			: `<tr><td colspan="5" class="ls-empty">${
				__("Nothing on the tray yet — add the first sieve above.")}</td></tr>`);
		paintDots();
		paintTop();
		paintKeep();
	}

	root.on("click", ".ls-back", showBoard);

	// ---- saving: every input, quietly, never over the cursor ----------------
	// The response is deliberately NOT written back into the table. Somebody is
	// typing in it; refilling the rows from a save that started two keystrokes
	// ago would move the cursor and could overwrite what they have just entered.
	function saveNow() {
		if (!LOT || blocked()) return Promise.resolve();
		SAVE = "saving"; paintState();
		return frappe.call({ method: API + ".save_stone_lot_selection", freeze: false, args: {
			name: LOT.name, actual_cts: 0,
			rows: JSON.stringify(ROWS.map((x) => ({ sieve: x.sieve,
				actual: flt(x.actual), selected: flt(x.selected) }))),
		} }).then(() => { SAVE = "saved"; paintState(); })
			.catch(() => { SAVE = "failed"; paintState(); });
	}

	const doSave = frappe.utils.debounce(() => {
		if (!LOT || blocked()) return;
		SAVE = "saving"; paintState();
		frappe.call({ method: API + ".save_stone_lot_selection", freeze: false, args: {
			name: LOT.name, actual_cts: 0,
			rows: JSON.stringify(ROWS.map((x) => ({ sieve: x.sieve,
				actual: flt(x.actual), selected: flt(x.selected) }))),
		} }).then((r) => {
			if (r.message) { LOT.status = r.message.status; LOT.selected = r.message.selected; LOT.rejected = r.message.rejected; }
			SAVE = "saved"; paintState();
		}).catch(() => { SAVE = "failed"; paintState(); });
	}, 700);

	function touched() {
		SAVE = blocked() ? "" : "dirty";
		paintState();
		doSave();
	}

	root.on("input", ".ls-in", function () {
		const i = cint($(this).data("i"));
		if (!ROWS[i]) return;
		ROWS[i][$(this).data("f")] = flt(this.value);
		// only the derived cell and the top move — repainting the table under the
		// cursor would fight whoever is typing in it
		const x = ROWS[i];
		const rj = r3(flt(x.actual) - flt(x.selected));
		const bad = flt(x.selected) > flt(x.actual) + 0.0005;
		const $tr = $(this).closest("tr");
		$tr.toggleClass("ls-bad", bad);
		$tr.find("td.ls-rej").toggleClass("zero", !rj && !bad).text(bad ? __("over") : ct(rj));
		paintTop();
		paintDots();
		// the keep table lives on these figures too, so it moves with them — a
		// sieve added and typed into should be askable straight away, not after
		// some other thing happens to repaint the page. It is its own region, so
		// redrawing it cannot disturb the tray box being typed in; the one thing
		// it must not do is yank a keep box out from under its own cursor.
		if (!$(document.activeElement).hasClass("ls-kin")) paintKeep();
		touched();
	});

	// type, Enter, type, Enter, next sieve
	root.on("keydown", ".ls-in", function (e) {
		if (e.key !== "Enter") return;
		e.preventDefault();
		const $in = $(this);
		if ($in.data("f") === "actual") return $in.closest("tr").find('.ls-in[data-f="selected"]').focus().select();
		const $next = $in.closest("tr").next("tr").find('.ls-in[data-f="actual"]');
		if ($next.length) return $next.focus().select();
		root.find(".ls-addbtn").focus();
	});

	root.on("click", ".ls-x", function () {
		ROWS.splice(cint($(this).data("i")), 1);
		paintTable();
		refreshPicker();
		touched();
	});

	root.on("click", ".ls-addbtn", function () {
		const sv = (F.pick && F.pick.get_value()) || free()[0];
		if (!sv || used().has(sv)) return;
		ROWS.push({ sieve: sv, actual: 0, selected: 0, purchased: 0 });
		paintTable();
		if (F.pick) F.pick.set_value("");     // and it waits for the next pick
		refreshPicker();
		setTimeout(() => root.find(`.ls-in[data-f="actual"][data-i="${ROWS.length - 1}"]`).focus(), 30);
	});

	// an hour of assorting must not walk away through a closed tab
	$(window).on("beforeunload.lotsel", () => (SAVE === "dirty" || SAVE === "saving" || SAVE === "failed")
		? __("The tray is still saving.") : undefined);
	$(wrapper).on("remove", () => $(window).off(".lotsel"));

	function fill(lot) {
		ROWS.length = 0;
		((lot && lot.items) || []).forEach((i) =>
			ROWS.push({ sieve: i.sieve, actual: flt(i.actual), selected: flt(i.selected),
				purchased: flt(i.purchased) }));
	}

	function showBoard() {
		LOT = null; SAVE = "";
		REQS = { rows: [], can_approve: 0 };
		Object.keys(ASK).forEach((k) => delete ASK[k]);
		root.find(".ls-keep").empty();
		root.find(".ls-one").hide();
		root.find(".ls-board").show();
		page.set_title(__("Lot Selection"));
		loadLots();
	}

	function open(name) {
		frappe.call({ method: API + ".get_stone_lot", args: { name }, freeze: false }).then((r) => {
			LOT = r.message || null;
			if (!LOT) return;
			fill(LOT);
			SAVE = "";
			root.find(".ls-board").hide();
			root.find(".ls-one").show();
			page.set_title(LOT.name);
			paintBar();
			paintTable();
			loadReqs();
		});
	}

	function loadLots() {
		return frappe.call({ method: API + ".get_stone_lots", freeze: false, args: { status: "" } })
			.then((r) => { LOTS = (r.message || {}).rows || []; paintBoard(); });
	}

	frappe.call({ method: API + ".get_stone_lot_context" }).then((r) => {
		CTX = r.message || {};
		loadLots().then(() => {
			const route = frappe.get_route();
			if (route && route.length > 1 && route[1]) open(route[1]);
		});
	});

	page.set_secondary_action(__("Stone Lots"), () => frappe.set_route("stone-lots"), "list");
	this.page = page;
};
