// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Lot Selection (Stones > Stone Lots) — the assorting table.
//
// Somebody sits at a sieve tray with this open for an hour. So the page is the
// TABLE and almost nothing else: sieve, what it actually weighed, what we are
// keeping, and what goes back. Four columns, big figures, and the keyboard
// carries you through them — type, Enter, type, Enter, next sieve.
//
// REJECTION is never typed. It is the actual less the selection, on every line
// and in the footer, because that is the figure the provider is handed back and
// the one nobody should be able to get wrong.
//
// What is deliberately NOT here yet: the purchase side and the return. What was
// claimed, what it cost, the day the rejection went back — none of that helps
// the person doing the assorting, and all of it was in the way. It comes later,
// on its own screen.
// Route: /app/lot-selection

frappe.pages["lot-selection"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Lot Selection"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const root = $(page.main);
	let CTX = null, LOT = null, LOTS = [], FILTER = "Open";
	const ROWS = [];                      // [{sieve, actual, selected}]

	const ct = (v) => flt(v).toFixed(3);
	const r3 = (v) => Math.round(flt(v) * 1000) / 1000;

	root.append(`
		<style>
		#page-lot-selection .container{max-width:100%;}
		#page-lot-selection .page-head{padding-bottom:0;}

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
		.ls-bar{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:14px;}
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
		.ls-save{background:#1d7a33;border:1px solid #1d7a33;color:#fff;font-weight:800;letter-spacing:.3px;
			border-radius:10px;padding:0 26px;height:38px;font-size:13px;cursor:pointer;}
		.ls-save[disabled]{opacity:.4;cursor:not-allowed;}

		/* the table IS the page */
		.ls-box{border:1px solid var(--border-color);border-radius:16px;overflow:hidden;background:var(--fg-color);}
		.ls-scroll{overflow:auto;max-height:calc(100vh - 300px);}
		table.ls-t{width:100%;border-collapse:separate;border-spacing:0;}
		table.ls-t th{position:sticky;top:0;z-index:2;background:var(--control-bg,var(--fg-color));
			border-bottom:1px solid var(--border-color);padding:11px 16px;text-align:left;
			font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);}
		table.ls-t td{border-bottom:1px solid var(--border-color);padding:0 16px;height:52px;vertical-align:middle;}
		table.ls-t tbody tr:last-child td{border-bottom:none;}
		table.ls-t tbody tr:hover td{background:rgba(29,122,51,.035);}
		table.ls-t th.num,table.ls-t td.num{text-align:right;}
		td.ls-sv{font-size:15px;font-weight:800;letter-spacing:-.01em;}
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
		tr.ls-bad td.ls-rej{color:#b02a2a;}
		.ls-x{border:none;background:none;color:var(--border-color);cursor:pointer;font-size:19px;line-height:1;padding:0 6px;}
		tr:hover .ls-x{color:var(--text-muted);}
		.ls-x:hover{color:#b02a2a !important;}

		tfoot td{position:sticky;bottom:0;background:var(--control-bg,var(--fg-color));
			border-top:2px solid var(--gray-400,#aeb6bf);height:58px;padding:0 16px;
			font-size:19px;font-weight:800;font-variant-numeric:tabular-nums;}
		tfoot td.lbl{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);}
		tfoot td.sel{color:#1d7a33;} tfoot td.rej{color:#b02a2a;}
		[data-theme="dark"] tfoot td.sel{color:#7fc98f;}
		[data-theme="dark"] tfoot td.rej{color:#e08a8a;}
		tfoot td .u{font-size:11px;font-weight:600;color:var(--text-muted);margin-left:3px;}

		.ls-hint{font-size:11.5px;color:var(--text-muted);margin-top:9px;}
		.ls-empty{padding:46px 20px;text-align:center;color:var(--text-muted);font-size:13.5px;}
		.ls-over{font-size:12.5px;color:#b02a2a;font-weight:700;margin-top:9px;}
		</style>
		<div class="ls-board"></div>
		<div class="ls-one" style="display:none;">
			<div class="ls-bar"></div>
			<div class="ls-box"><div class="ls-scroll">
				<table class="ls-t"><thead></thead><tbody></tbody><tfoot></tfoot></table>
			</div></div>
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
	const over = () => ROWS.some((x) => flt(x.selected) > flt(x.actual) + 0.0005);

	function paintBar() {
		root.find(".ls-bar").html(`
			<button class="ls-back">${__("← Lots")}</button>
			<span class="nm">${esc(LOT.name)}</span>
			<span class="meta">${esc(LOT.supplier)}${LOT.quality ? " · " + esc(LOT.quality) : ""}</span>
			<span class="ls-spacer">
				<span class="ls-pick"></span>
				<button class="ls-addbtn">+ ${__("Sieve")}</button>
				<button class="ls-save">${__("SAVE")}</button>
			</span>`);
		F.pick = frappe.ui.form.make_control({
			df: { fieldtype: "Select", fieldname: "sieve", options: free() },
			parent: root.find(".ls-pick").get(0), render_input: true });
		F.pick.refresh();
		refreshPicker();
	}
	const F = {};
	function refreshPicker() {
		if (!F.pick) return;
		const opts = free();
		F.pick.df.options = opts;
		F.pick.refresh();
		root.find(".ls-addbtn").prop("disabled", !opts.length);
		root.find(".ls-save").prop("disabled", over());
	}

	function paintFoot() {
		const a = tot("actual"), s = tot("selected"), rj = Math.max(a - s, 0);
		root.find(".ls-t tfoot").html(!ROWS.length ? "" : `<tr>
			<td class="lbl">${__("{0} sieve(s)", [ROWS.length])}</td>
			<td class="num">${ct(a)}<span class="u">ct</span></td>
			<td class="num sel">${ct(s)}<span class="u">ct</span></td>
			<td class="num rej">${over() ? __("over") : ct(rj)}${over() ? "" : `<span class="u">ct</span>`}</td>
			<td></td></tr>`);
		root.find(".ls-hint").html(over()
			? `<div class="ls-over">${__("A sieve keeps more than it holds — fix the red line before saving.")}</div>`
			: __("Rejection is worked out for you: what the sieve weighed, less what you keep. Enter moves to the next box."));
		root.find(".ls-save").prop("disabled", over());
	}

	function rowHtml(x, i) {
		const rj = r3(flt(x.actual) - flt(x.selected));
		const bad = flt(x.selected) > flt(x.actual) + 0.0005;
		return `<tr class="${bad ? "ls-bad" : ""}" data-i="${i}">
			<td class="ls-sv">${esc(x.sieve)}</td>
			<td class="num"><input type="number" step="0.001" min="0" class="ls-in"
				data-f="actual" data-i="${i}" placeholder="0.000" value="${x.actual || ""}"></td>
			<td class="num"><input type="number" step="0.001" min="0" class="ls-in"
				data-f="selected" data-i="${i}" placeholder="0.000" value="${x.selected || ""}"></td>
			<td class="num ls-rej ${rj ? "" : "zero"}">${bad ? __("over") : ct(rj)}</td>
			<td style="width:44px;text-align:right;"><button class="ls-x" data-i="${i}"
				title="${__("take the sieve off")}">&times;</button></td></tr>`;
	}

	function paintTable() {
		root.find(".ls-t thead").html(`<tr>
			<th>${__("Sieve")}</th><th class="num">${__("Actual cts")}</th>
			<th class="num">${__("Select cts")}</th><th class="num">${__("Rejection cts")}</th>
			<th style="width:44px;"></th></tr>`);
		root.find(".ls-t tbody").html(ROWS.length ? ROWS.map(rowHtml).join("")
			: `<tr><td colspan="5" class="ls-empty">${
				__("Nothing on the tray yet — add the first sieve above.")}</td></tr>`);
		paintFoot();
	}

	root.on("click", ".ls-back", showBoard);

	root.on("input", ".ls-in", function () {
		const i = cint($(this).data("i"));
		if (!ROWS[i]) return;
		ROWS[i][$(this).data("f")] = flt(this.value);
		// only the derived cell and the footer move — repainting the table under
		// the cursor would fight whoever is typing in it
		const x = ROWS[i];
		const rj = r3(flt(x.actual) - flt(x.selected));
		const bad = flt(x.selected) > flt(x.actual) + 0.0005;
		const $tr = $(this).closest("tr");
		$tr.toggleClass("ls-bad", bad);
		$tr.find("td.ls-rej").toggleClass("zero", !rj && !bad).text(bad ? __("over") : ct(rj));
		paintFoot();
	});

	// the whole point of the keyboard here: type, Enter, type, Enter, next sieve
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
	});

	root.on("click", ".ls-addbtn", function () {
		const sv = (F.pick && F.pick.get_value()) || free()[0];
		if (!sv || used().has(sv)) return;
		ROWS.push({ sieve: sv, actual: 0, selected: 0 });
		paintTable();
		refreshPicker();
		setTimeout(() => root.find(`.ls-in[data-f="actual"][data-i="${ROWS.length - 1}"]`).focus(), 30);
	});

	root.on("click", ".ls-save", function () {
		if (!LOT || over()) return;
		frappe.dom.freeze(__("Saving…"));
		// the lot's own weight is the sieves added up — there is no parcel figure
		// typed anywhere any more, so nothing can disagree with the tray
		frappe.call({ method: API + ".save_stone_lot_selection", args: {
			name: LOT.name, actual_cts: 0,
			rows: JSON.stringify(ROWS.map((x) => ({ sieve: x.sieve,
				actual: flt(x.actual), selected: flt(x.selected) }))),
		} }).then((r) => {
			frappe.dom.unfreeze();
			LOT = r.message || LOT;
			frappe.show_alert({ indicator: "green", message:
				__("{0} saved — {1} ct kept, {2} ct back.",
					[LOT.name, ct(LOT.selected), ct(LOT.rejected)]) }, 6);
			fill(LOT);
			paintTable();
			refreshPicker();
		}).catch(() => frappe.dom.unfreeze());
	});

	function fill(lot) {
		ROWS.length = 0;
		((lot && lot.items) || []).forEach((i) =>
			ROWS.push({ sieve: i.sieve, actual: flt(i.actual), selected: flt(i.selected) }));
	}

	function showBoard() {
		LOT = null;
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
