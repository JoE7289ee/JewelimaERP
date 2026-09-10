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
		.ls-tag.selected{background:rgba(29,122,51,.16);color:#1d7a33;}
		.ls-tag.returned{background:rgba(31,97,141,.16);color:#1f618d;}
		.ls-tag.cancelled{background:rgba(127,140,141,.16);color:var(--text-muted);}
		[data-theme="dark"] .ls-tag.open{color:#e8b84a;}
		[data-theme="dark"] .ls-tag.selected{color:#7fc98f;}

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
		</div>
	`);

	// ------------------------------------------------------------- the board
	function paintBoard() {
		const rows = (LOTS || []).filter((r) => !FILTER || r.status === FILTER);
		root.find(".ls-board").html(`
			<div class="ls-filters">
				${["Open", "Selected", ""].map((s) => `
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
						<div><div class="n">${__("Sieved")}</div><div class="b">${r.actual ? ct(r.actual) : "—"}</div></div>
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
	const tot = (k) => ROWS.reduce((a, x) => a + flt(x[k]), 0);
	const used = () => new Set(ROWS.map((x) => x.sieve));
	const free = () => (CTX.sieves || []).map((s) => s.sieve_size).filter((s) => !used().has(s));
	const lotWt = () => (LOT ? flt(LOT.claimed) : 0);
	const overRow = () => ROWS.some((x) => flt(x.selected) > flt(x.actual) + 0.0005);
	// the parcel is a ceiling: the sieves cannot hold more stone than came in
	const overLot = () => lotWt() > 0 && tot("actual") > lotWt() + 0.0005;
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
			df: { fieldtype: "Select", fieldname: "sieve", options: free() },
			parent: root.find(".ls-pick").get(0), render_input: true });
		F.pick.refresh();
		refreshPicker();
		paintState();
	}
	const F = {};
	function refreshPicker() {
		if (!F.pick) return;
		const opts = free();
		F.pick.df.options = opts;
		F.pick.refresh();
		root.find(".ls-addbtn").prop("disabled", !opts.length);
	}
	function paintState() {
		const map = { saving: __("saving…"), saved: __("saved"), failed: __("NOT SAVED — retrying"), "": __("nothing to save"), dirty: __("unsaved…") };
		root.find(".ls-state").attr("class", "ls-state " + (SAVE || "idle")).text(map[SAVE] || map[""]);
	}

	function paintTop() {
		const claimed = lotWt();
		const a = tot("actual"), s = tot("selected");
		const rej = Math.max(a - s, 0);
		const left = claimed ? r3(claimed - a) : 0;
		const pct = a > 0 ? (s / a) * 100 : 0;

		// the ring: which sieves the parcel fell into, by weight
		const slices = ROWS.filter((x) => flt(x.actual) > 0)
			.map((x) => ({ sieve: x.sieve, ct: flt(x.actual) }))
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
				<div class="k">${overLot() ? __("Over the parcel") : __("Left to sieve")}</div>
				<div class="v">${ct(overLot() ? a - claimed : Math.max(left, 0))}<span class="u">ct</span></div>
				<div class="sub">${__("of {0} ct booked in", [ct(claimed)])}</div></div>` : ""}
			<div class="ls-kpi"><div class="k">${__("Sieved")}</div>
				<div class="v">${ct(a)}<span class="u">ct</span></div>
				<div class="sub">${__("{0} sieve(s)", [ROWS.length])}</div></div>
			<div class="ls-kpi sel"><div class="k">${__("Selected")}</div>
				<div class="v">${ct(s)}<span class="u">ct</span></div>
				<div class="sub">${__("kept from the tray")}</div></div>
			<div class="ls-kpi sel"><div class="k">${__("Selected %")}</div>
				<div class="v">${pct.toFixed(1)}<span class="u">%</span></div>
				<div class="ls-bar2"><i style="width:${Math.min(pct, 100).toFixed(1)}%"></i></div></div>
			<div class="ls-kpi rej ${overRow() ? "bad" : ""}"><div class="k">${__("Rejection")}</div>
				<div class="v">${overRow() ? __("over") : ct(rej) + `<span class="u">ct</span>`}</div>
				<div class="sub">${__("goes back to the provider")}</div></div>`);

		root.find(".ls-err").html(overLot()
			? __("The sieves add up to <b>{0} ct</b> — more than the <b>{1} ct</b> that came in. Nothing is being saved until that is fixed.",
				[ct(a), ct(claimed)])
			: (overRow() ? __("A sieve keeps more than it holds — fix the red line. Nothing is being saved until then.") : ""));
		root.find(".ls-hint").text(__("Rejection is worked out for you. Everything saves on its own — there is no save button."));
	}

	function rowHtml(x, i) {
		const rj = r3(flt(x.actual) - flt(x.selected));
		const bad = flt(x.selected) > flt(x.actual) + 0.0005;
		return `<tr class="${bad ? "ls-bad" : ""}" data-i="${i}">
			<td class="ls-sv"><i data-dot="${i}"></i>${esc(x.sieve)}</td>
			<td class="num"><input type="number" step="0.001" min="0" class="ls-in"
				data-f="actual" data-i="${i}" placeholder="0.000" value="${x.actual || ""}"></td>
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
	}

	root.on("click", ".ls-back", showBoard);

	// ---- saving: every input, quietly, never over the cursor ----------------
	// The response is deliberately NOT written back into the table. Somebody is
	// typing in it; refilling the rows from a save that started two keystrokes
	// ago would move the cursor and could overwrite what they have just entered.
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
		ROWS.push({ sieve: sv, actual: 0, selected: 0 });
		paintTable();
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
			ROWS.push({ sieve: i.sieve, actual: flt(i.actual), selected: flt(i.selected) }));
	}

	function showBoard() {
		LOT = null; SAVE = "";
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
