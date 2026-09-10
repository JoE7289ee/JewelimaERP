// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Lot Selection (Stones > Stone Lots) — the sieve table.
//
// The page opens on the LOTS, as tiles, the way Send Certifications does: the
// first question at this desk is which parcel am I sitting down with, and a
// dropdown answers that badly — you cannot see from it which lots are still
// open or how heavy they are.
//
// Inside a lot, sieves are ADDED one at a time from a picker rather than the
// whole chart being laid out. A parcel touches a handful of sieves; laying out
// forty rows so five can be typed into makes the five hard to find, and makes
// an empty row look like a real answer.
//
// Each line carries what that sieve ACTUALLY weighed and what we are KEEPING
// of it. The REJECTION is never typed — it is the actual less the selection, on
// every line and at the foot — because that is the figure the provider is
// handed back, sieve by sieve, and the one nobody should be able to get wrong.
//
// Nothing here is stock. A rejected stone was never ours; it goes back to the
// provider with the parcel.
// Route: /app/lot-selection

frappe.pages["lot-selection"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Lot Selection"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const root = $(page.main);
	let CTX = null, LOT = null, LOTS = [], FILTER = "Open";
	const ROWS = [];                // [{sieve, actual, selected}] — the page's own state

	const ct = (v) => flt(v).toFixed(3);

	root.append(`
		<style>
		#page-lot-selection .container{max-width:100%;}

		/* ---- the lot board ---- */
		.ls-filters{display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;align-items:center;}
		.ls-f{border:1px solid var(--border-color);background:var(--fg-color);border-radius:9px;
			padding:5px 15px;font-size:12.5px;cursor:pointer;color:var(--text-color);}
		.ls-f.on{background:var(--btn-primary,#171717);color:#fff;border-color:var(--btn-primary,#171717);font-weight:700;}
		.ls-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:14px;}
		.ls-card{border:1px solid var(--border-color);border-radius:14px;background:var(--fg-color);
			padding:15px 17px;cursor:pointer;transition:border-color .12s,box-shadow .12s;}
		.ls-card:hover{border-color:#1d7a33;box-shadow:var(--shadow-sm);}
		.ls-card .nm{font-size:16px;font-weight:800;letter-spacing:-.01em;}
		.ls-card .sup{font-size:12.5px;color:var(--text-muted);margin:3px 0 11px;}
		.ls-card .nums{display:flex;gap:16px;flex-wrap:wrap;}
		.ls-card .nums .n{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);}
		.ls-card .nums .b{font-size:17px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.2;}
		.ls-card .sel .b{color:#1d7a33;} .ls-card .rej .b{color:#b02a2a;}
		[data-theme="dark"] .ls-card .sel .b{color:#7fc98f;}
		[data-theme="dark"] .ls-card .rej .b{color:#e08a8a;}

		.ls-tag{font-size:10px;font-weight:800;letter-spacing:.05em;border-radius:9px;
			padding:2px 9px;text-transform:uppercase;}
		.ls-tag.open{background:rgba(184,134,11,.18);color:#8a6508;}
		.ls-tag.selected{background:rgba(29,122,51,.16);color:#1d7a33;}
		.ls-tag.returned{background:rgba(31,97,141,.16);color:#1f618d;}
		.ls-tag.cancelled{background:rgba(127,140,141,.16);color:var(--text-muted);}
		[data-theme="dark"] .ls-tag.open{color:#e8b84a;}
		[data-theme="dark"] .ls-tag.selected{color:#7fc98f;}
		[data-theme="dark"] .ls-tag.returned{color:#7FB3DA;}

		/* ---- one lot ---- */
		.ls-head{border:1px solid var(--border-color);border-radius:14px;background:var(--fg-color);
			padding:15px 18px;margin-bottom:14px;display:flex;gap:20px;flex-wrap:wrap;align-items:center;}
		.ls-head .nm{font-size:20px;font-weight:800;}
		.ls-head .meta{font-size:12.5px;color:var(--text-muted);}
		.ls-back{border:1px solid var(--border-color);background:var(--fg-color);border-radius:9px;
			padding:5px 13px;font-size:12.5px;cursor:pointer;color:var(--text-color);margin-right:2px;}
		.ls-back:hover{border-color:var(--text-muted);}

		.ls-kpis{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;}
		.ls-kpi{flex:1 1 155px;border:1px solid var(--border-color);border-radius:12px;
			padding:11px 15px;background:var(--fg-color);}
		.ls-kpi .k{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);font-weight:600;}
		.ls-kpi .v{font-size:23px;font-weight:800;line-height:1.2;font-variant-numeric:tabular-nums;}
		.ls-kpi.sel{border-left:3px solid #1d7a33;} .ls-kpi.sel .v{color:#1d7a33;}
		.ls-kpi.rej{border-left:3px solid #b02a2a;} .ls-kpi.rej .v{color:#b02a2a;}
		.ls-kpi .sub{font-size:11px;color:var(--text-muted);margin-top:2px;}
		[data-theme="dark"] .ls-kpi.sel .v{color:#7fc98f;}
		[data-theme="dark"] .ls-kpi.rej .v{color:#e08a8a;}
		.ls-over .v{color:#b02a2a !important;}

		.ls-add{display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin-bottom:12px;
			border:1px solid var(--border-color);border-radius:12px;padding:12px 15px;background:var(--fg-color);}
		.ls-add .control-label{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);}
		.ls-add .help-box{display:none !important;}
		.ls-pick{min-width:210px;} .ls-top-actual{min-width:170px;} .ls-ret{min-width:170px;}
		.ls-addbtn{background:#1d7a33;border:1px solid #1d7a33;color:#fff;font-weight:700;
			border-radius:9px;padding:7px 18px;font-size:12.5px;cursor:pointer;height:32px;}
		.ls-addbtn[disabled]{opacity:.45;cursor:not-allowed;}

		.ls-box{border:1px solid var(--border-color);border-radius:12px;overflow:auto;max-height:calc(100vh - 460px);}
		table.ls-t{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;background:var(--fg-color);}
		table.ls-t th{position:sticky;top:0;z-index:1;background:var(--control-bg,var(--fg-color));
			border-bottom:2px solid var(--gray-400,#aeb6bf);padding:8px 10px;text-align:left;font-weight:700;
			font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);}
		table.ls-t td{border-bottom:1px solid var(--border-color);padding:5px 10px;}
		table.ls-t td.num,table.ls-t th.num{text-align:right;font-variant-numeric:tabular-nums;}
		table.ls-t td.sv{font-weight:700;}
		table.ls-t input.ls-in{display:inline-block;width:110px;text-align:right;-moz-appearance:textfield;}
		.ls-in::-webkit-inner-spin-button,.ls-in::-webkit-outer-spin-button{-webkit-appearance:none;margin:0;}
		td.ls-rej{font-weight:700;color:#b02a2a;font-variant-numeric:tabular-nums;text-align:right;}
		[data-theme="dark"] td.ls-rej{color:#e08a8a;}
		tr.ls-bad td{background:rgba(176,0,32,.07);}
		.ls-x{border:none;background:none;color:var(--text-muted);cursor:pointer;font-size:15px;line-height:1;padding:0 4px;}
		.ls-x:hover{color:#b02a2a;}

		.ls-actions{margin-top:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;}
		.ls-save{background:#1d7a33;border:1px solid #1d7a33;color:#fff;font-weight:700;
			border-radius:9px;padding:10px 24px;font-size:13px;cursor:pointer;}
		.ls-save[disabled]{opacity:.45;cursor:not-allowed;}
		.ls-note{font-size:12px;color:var(--text-muted);}
		.ls-empty{padding:34px;text-align:center;color:var(--text-muted);font-size:13px;}
		</style>
		<div class="ls-board"></div>
		<div class="ls-one" style="display:none;">
			<div class="ls-head"></div>
			<div class="ls-kpis"></div>
			<div class="ls-add">
				<div class="ls-pick"></div>
				<button class="ls-addbtn" disabled>${__("ADD SIEVE")}</button>
				<div class="ls-top-actual"></div>
				<div class="ls-ret"></div>
			</div>
			<div class="ls-box"><table class="ls-t"><thead></thead><tbody></tbody></table></div>
			<div class="ls-actions"></div>
		</div>
	`);

	const mk = (sel, df) => {
		const c = frappe.ui.form.make_control({ df, parent: root.find(sel).get(0), render_input: true });
		c.refresh();
		return c;
	};
	const F = {};

	// ---------------------------------------------------------------- the board
	function paintBoard() {
		const rows = (LOTS || []).filter((r) => !FILTER || r.status === FILTER);
		root.find(".ls-board").html(`
			<div class="ls-filters">
				${["Open", "Selected", "Returned", ""].map((s) => `
					<button class="ls-f ${FILTER === s ? "on" : ""}" data-s="${esc(s)}">${
						s ? __(s) : __("All")}</button>`).join("")}
				<span class="ls-note" style="margin-left:6px;">${
					__("Pick the parcel you are sitting down with.")}</span>
			</div>
			${rows.length ? `<div class="ls-grid">${rows.map((r) => {
				const st = (r.status || "Open").toLowerCase();
				return `<div class="ls-card" data-name="${esc(r.name)}">
					<div style="display:flex;justify-content:space-between;align-items:start;gap:8px;">
						<span class="nm">${esc(r.name)}</span>
						<span class="ls-tag ${st}">${esc(r.status)}</span></div>
					<div class="sup">${esc(r.supplier)} · ${__("in")} ${esc(r.received_on)}${
						r.quality ? " · " + esc(r.quality) : ""}</div>
					<div class="nums">
						<div><div class="n">${__("Claimed")}</div><div class="b">${ct(r.claimed)}</div></div>
						<div><div class="n">${__("Actual")}</div><div class="b">${r.actual ? ct(r.actual) : "—"}</div></div>
						<div class="sel"><div class="n">${__("Selected")}</div><div class="b">${r.selected ? ct(r.selected) : "—"}</div></div>
						<div class="rej"><div class="n">${__("Rejection")}</div><div class="b">${r.rejected ? ct(r.rejected) : "—"}</div></div>
					</div></div>`;
			}).join("")}</div>`
			: `<div class="ls-empty">${FILTER
				? __("No {0} lots. Try another tab — or book a parcel in on Stone Lots.", [__(FILTER).toLowerCase()])
				: __("No lots yet — book a parcel in on Stone Lots.")}</div>`}`);
	}

	root.on("click", ".ls-f", function () {
		FILTER = $(this).data("s") || "";
		paintBoard();
	});
	root.on("click", ".ls-card", function () { open($(this).data("name")); });

	// ------------------------------------------------------------------ one lot
	const rowsTotal = (k) => ROWS.reduce((a, r) => a + flt(r[k]), 0);
	const usedSieves = () => new Set(ROWS.map((r) => r.sieve));

	function sieveOptions() {
		const used = usedSieves();
		return (CTX.sieves || []).map((s) => s.sieve_size).filter((s) => !used.has(s));
	}

	function refreshPicker() {
		const opts = sieveOptions();
		F.pick.df.options = opts;
		F.pick.refresh();
		root.find(".ls-addbtn").prop("disabled", !opts.length);
	}

	function paintKpis() {
		const actual = flt(F.actual.get_value());
		const sieved = rowsTotal("actual");
		const sel = rowsTotal("selected");
		const rej = Math.max(sieved - sel, 0);
		const over = ROWS.some((r) => flt(r.selected) > flt(r.actual) + 0.0005);
		const claimed = LOT ? flt(LOT.claimed) : 0;
		const short = claimed && actual ? claimed - actual : 0;
		// the sieves should account for the parcel; when they do not, say so
		// rather than letting two totals sit side by side disagreeing quietly
		const gap = actual && sieved ? round3(actual - sieved) : 0;

		root.find(".ls-kpis").html(`
			<div class="ls-kpi"><div class="k">${__("Claimed")}</div><div class="v">${ct(claimed)}</div>
				<div class="sub">${__("what the provider said")}</div></div>
			<div class="ls-kpi"><div class="k">${__("Actual")}</div><div class="v">${ct(actual)}</div>
				<div class="sub">${short > 0.0005
					? `<span style="color:#b02a2a;">${__("{0} ct lighter", [ct(short)])}</span>`
					: (actual ? __("on our scale") : __("not weighed yet"))}</div></div>
			<div class="ls-kpi"><div class="k">${__("Sieved")}</div><div class="v">${ct(sieved)}</div>
				<div class="sub">${Math.abs(gap) > 0.0005
					? `<span style="color:#8a6508;">${__("{0} ct unaccounted", [ct(Math.abs(gap))])}</span>`
					: __("{0} sieve(s)", [ROWS.length])}</div></div>
			<div class="ls-kpi sel"><div class="k">${__("Selected")}</div><div class="v">${ct(sel)}</div>
				<div class="sub">${__("kept from {0} ct", [ct(sieved)])}</div></div>
			<div class="ls-kpi rej ${over ? "ls-over" : ""}"><div class="k">${__("Rejection")}</div>
				<div class="v">${over ? __("over") : ct(rej)}</div>
				<div class="sub">${over
					? `<span style="color:#b02a2a;">${__("a sieve keeps more than it holds")}</span>`
					: __("goes back to the provider")}</div></div>`);

		root.find(".ls-save").prop("disabled", !LOT || over);
	}
	const round3 = (v) => Math.round(flt(v) * 1000) / 1000;

	function paintRows() {
		root.find(".ls-t thead").html(ROWS.length ? `<tr>
			<th>${__("Sieve")}</th><th class="num">${__("Actual (ct)")}</th>
			<th class="num">${__("Selected (ct)")}</th><th class="num">${__("Rejection (ct)")}</th>
			<th style="width:34px;"></th></tr>` : "");
		root.find(".ls-t tbody").html(ROWS.length ? ROWS.map((r, i) => {
			const rej = round3(flt(r.actual) - flt(r.selected));
			const bad = flt(r.selected) > flt(r.actual) + 0.0005;
			return `<tr class="${bad ? "ls-bad" : ""}" data-i="${i}">
				<td class="sv">${esc(r.sieve)}</td>
				<td class="num"><input type="number" step="0.001" min="0" class="form-control input-xs ls-in"
					data-f="actual" data-i="${i}" value="${r.actual || ""}"></td>
				<td class="num"><input type="number" step="0.001" min="0" class="form-control input-xs ls-in"
					data-f="selected" data-i="${i}" value="${r.selected || ""}"></td>
				<td class="ls-rej">${bad ? __("over") : ct(rej)}</td>
				<td><button class="ls-x" data-i="${i}" title="${__("take the sieve off")}">&times;</button></td>
			</tr>`;
		}).join("")
			: `<tr><td colspan="5" class="ls-empty">${
				__("No sieves yet — pick one above and add it.")}</td></tr>`);
	}

	function paintOne() {
		if (!LOT) return;
		const st = (LOT.status || "Open").toLowerCase();
		root.find(".ls-head").html(`
			<button class="ls-back">${__("← Lots")}</button>
			<span class="nm">${esc(LOT.name)}</span>
			<span class="ls-tag ${st}">${esc(LOT.status)}</span>
			<span class="meta">${esc(LOT.supplier)} · ${__("received")} ${esc(LOT.received_on)}${
				LOT.quality ? " · " + esc(LOT.quality) : ""}${
				LOT.owner_label ? " · " + __("booked by") + " " + esc(LOT.owner_label) : ""}</span>`);
		root.find(".ls-actions").html(`
			<button class="ls-save">${__("SAVE SELECTION")}</button>
			<span class="ls-note">${
				__("The rejection is worked out for you, on every line — what the sieve weighed, less what you keep.")}</span>`);
		paintRows();
		paintKpis();
		refreshPicker();
	}

	function showBoard() {
		LOT = null;
		root.find(".ls-one").hide();
		root.find(".ls-board").show();
		page.set_title(__("Lot Selection"));
		loadLots();
	}

	root.on("click", ".ls-back", showBoard);

	root.on("input", ".ls-in", function () {
		const i = cint($(this).data("i"));
		if (!ROWS[i]) return;
		ROWS[i][$(this).data("f")] = flt(this.value);
		// only the derived cells and the totals move — retyping the whole table
		// under the cursor would fight whoever is typing in it
		const r = ROWS[i];
		const rej = round3(flt(r.actual) - flt(r.selected));
		const bad = flt(r.selected) > flt(r.actual) + 0.0005;
		const $tr = $(this).closest("tr");
		$tr.toggleClass("ls-bad", bad);
		$tr.find("td.ls-rej").text(bad ? __("over") : ct(rej));
		paintKpis();
	});

	root.on("click", ".ls-x", function () {
		ROWS.splice(cint($(this).data("i")), 1);
		paintRows();
		paintKpis();
		refreshPicker();
	});

	root.on("click", ".ls-addbtn", function () {
		const sv = F.pick.get_value() || sieveOptions()[0];
		if (!sv || usedSieves().has(sv)) return;
		ROWS.unshift({ sieve: sv, actual: 0, selected: 0 });
		paintRows();
		paintKpis();
		refreshPicker();
		setTimeout(() => root.find('.ls-t input[data-f="actual"][data-i="0"]').focus(), 30);
	});

	root.on("click", ".ls-save", function () {
		if (!LOT) return;
		frappe.dom.freeze(__("Saving…"));
		frappe.call({ method: API + ".save_stone_lot_selection", args: {
			name: LOT.name,
			actual_cts: flt(F.actual.get_value()),
			rows: JSON.stringify(ROWS.map((r) => ({ sieve: r.sieve,
				actual: flt(r.actual), selected: flt(r.selected) }))),
			returned_on: F.ret.get_value() || "",
		} }).then((r) => {
			frappe.dom.unfreeze();
			LOT = r.message || LOT;
			frappe.show_alert({ indicator: "green", message:
				__("{0} saved — {1} ct selected, {2} ct back to {3}.",
					[LOT.name, ct(LOT.selected), ct(LOT.rejected), LOT.supplier]) }, 7);
			fill(LOT);
			paintOne();
		}).catch(() => frappe.dom.unfreeze());
	});

	function fill(lot) {
		ROWS.length = 0;
		((lot && lot.items) || []).forEach((i) =>
			ROWS.push({ sieve: i.sieve, actual: flt(i.actual), selected: flt(i.selected) }));
		F.actual.set_value(lot ? lot.actual : 0);
		F.ret.set_value(lot && lot.returned_on ? lot.returned_on : "");
	}

	function open(name) {
		frappe.call({ method: API + ".get_stone_lot", args: { name }, freeze: false }).then((r) => {
			LOT = r.message || null;
			if (!LOT) return;
			fill(LOT);
			root.find(".ls-board").hide();
			root.find(".ls-one").show();
			page.set_title(LOT.name);
			paintOne();
		});
	}

	function loadLots() {
		return frappe.call({ method: API + ".get_stone_lots", freeze: false, args: { status: "" } })
			.then((r) => { LOTS = (r.message || {}).rows || []; paintBoard(); });
	}

	frappe.call({ method: API + ".get_stone_lot_context" }).then((r) => {
		CTX = r.message || {};
		F.pick = mk(".ls-pick", { fieldtype: "Select", label: __("Sieve"), fieldname: "sieve",
			options: (CTX.sieves || []).map((s) => s.sieve_size) });
		F.actual = mk(".ls-top-actual", { fieldtype: "Float", label: __("Parcel weight (ct)"),
			fieldname: "actual_cts", precision: 3, change: () => paintKpis() });
		F.ret = mk(".ls-ret", { fieldtype: "Date", label: __("Rejection returned on"), fieldname: "returned_on" });
		loadLots().then(() => {
			// /app/lot-selection/LOT-SALONI-00001 opens straight onto that lot
			const route = frappe.get_route();
			if (route && route.length > 1 && route[1]) open(route[1]);
		});
	});

	page.set_secondary_action(__("Stone Lots"), () => frappe.set_route("stone-lots"), "list");
	this.page = page;
};
