// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Stone Adjustment (Stones) — the loose stone room counted against the books.
//
// Every stone in Stone Issue is listed with what the warehouse says is there.
// You type what the tray ACTUALLY weighs; the difference is worked out and
// never typed. A line left blank is a line NOT COUNTED — it is not zero — and
// a line that agrees with the books is dropped, because it is not an
// adjustment.
//
// The gap is not a movement anybody made, so it is WRITTEN OFF against the
// company's Stock Adjustment account rather than issued to anyone. That is
// money leaving the books, so a manager signs for it in the table below and
// nothing moves until they do.
//
// Only Stone Issue is adjustable. Stones in Finished Goods, In Bags, At
// Certification or Stone Change belong to a card or a piece — that weight is
// the piece's story and is not something to correct from a tray count.
// Route: /app/stone-adjustment

frappe.pages["stone-adjustment"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Stone Adjustment"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const ct = (v) => flt(v).toFixed(3);
	const root = $(page.main);
	let CTX = { warehouse: "", can_approve: false };
	let ROWS = [], FAMS = [], FAM = "", Q = "", LIST = "Pending";
	const COUNT = {};                     // item -> {counted, pcs}, kept across repaints

	root.append(`
		<style>
		#page-stone-adjustment .container{max-width:100%;}
		.sa2-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px;}
		.sa2-f{border:1px solid var(--border-color);background:var(--fg-color);border-radius:999px;
			padding:5px 15px;font-size:12px;cursor:pointer;color:var(--text-muted);font-weight:600;}
		.sa2-f.on{background:#1f618d;border-color:#1f618d;color:#fff;}
		.sa2-q{width:240px;border:1px solid var(--border-color);border-radius:8px;height:31px;padding:2px 12px;
			background:var(--fg-color);color:var(--text-color);font-size:12.5px;}
		.sa2-note{font-size:11.5px;color:var(--text-muted);}

		.sa2-kpi{display:flex;gap:11px;flex-wrap:wrap;margin-bottom:13px;}
		.sa2-k{flex:1 1 140px;border:1px solid var(--border-color);border-radius:13px;
			padding:10px 15px;background:var(--fg-color);}
		.sa2-k .k{font-size:9.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);font-weight:700;}
		.sa2-k .v{font-size:22px;font-weight:800;line-height:1.25;font-variant-numeric:tabular-nums;letter-spacing:-.02em;}
		.sa2-k .v .u{font-size:11px;font-weight:600;color:var(--text-muted);margin-left:2px;}
		.sa2-k .sub{font-size:10.5px;color:var(--text-muted);margin-top:1px;}
		.sa2-k.short{border-left:3px solid #b02a2a;} .sa2-k.short .v{color:#b02a2a;}
		.sa2-k.over{border-left:3px solid #1d7a33;} .sa2-k.over .v{color:#1d7a33;}
		.sa2-k.done{border-left:3px solid #1f618d;} .sa2-k.done .v{color:#1f618d;}
		[data-theme="dark"] .sa2-k.short .v{color:#e08a8a;}
		[data-theme="dark"] .sa2-k.over .v{color:#7fc98f;}

		.sa2-box{border:1px solid var(--border-color);border-radius:14px;overflow:hidden;background:var(--fg-color);}
		.sa2-scroll{overflow:auto;max-height:calc(100vh - 430px);}
		table.sa2-t{width:100%;border-collapse:separate;border-spacing:0;}
		table.sa2-t th{position:sticky;top:0;z-index:2;background:var(--control-bg,var(--fg-color));
			border-bottom:1px solid var(--border-color);padding:9px 14px;text-align:left;
			font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);}
		table.sa2-t td{border-bottom:1px solid var(--border-color);padding:0 14px;height:46px;vertical-align:middle;}
		table.sa2-t tbody tr:last-child td{border-bottom:none;}
		table.sa2-t tbody tr:hover td{background:rgba(31,97,141,.04);}
		table.sa2-t th.num,table.sa2-t td.num{text-align:right;font-variant-numeric:tabular-nums;}
		td.sa2-it{font-size:13.5px;font-weight:700;}
		td.sa2-it .g{font-size:10.5px;color:var(--text-muted);font-weight:500;}
		td.sa2-bk{font-size:14px;font-weight:700;font-variant-numeric:tabular-nums;}
		table.sa2-t input.sa2-in{width:120px;text-align:right;border:1px solid transparent;border-radius:8px;
			background:transparent;height:34px;padding:0 10px;font-size:15px;font-weight:700;
			font-variant-numeric:tabular-nums;color:var(--text-color);-moz-appearance:textfield;transition:.1s;}
		table.sa2-t input.sa2-in:hover{border-color:var(--border-color);}
		table.sa2-t input.sa2-in:focus{border-color:#1f618d;background:var(--fg-color);
			box-shadow:0 0 0 3px rgba(31,97,141,.13);outline:none;}
		table.sa2-t input.sa2-pcs{width:74px;text-align:right;border:1px solid transparent;border-radius:8px;
			background:transparent;height:34px;padding:0 9px;font-size:13px;font-variant-numeric:tabular-nums;
			color:var(--text-muted);-moz-appearance:textfield;}
		table.sa2-t input.sa2-pcs:hover{border-color:var(--border-color);}
		.sa2-in::-webkit-inner-spin-button,.sa2-in::-webkit-outer-spin-button,
		.sa2-pcs::-webkit-inner-spin-button,.sa2-pcs::-webkit-outer-spin-button{-webkit-appearance:none;margin:0;}
		td.sa2-d{font-size:14.5px;font-weight:800;font-variant-numeric:tabular-nums;}
		td.sa2-d.minus{color:#b02a2a;} td.sa2-d.plus{color:#1d7a33;} td.sa2-d.zero{color:var(--text-muted);font-weight:500;}
		[data-theme="dark"] td.sa2-d.minus{color:#e08a8a;}
		[data-theme="dark"] td.sa2-d.plus{color:#7fc98f;}
		tr.sa2-touched td{background:rgba(31,97,141,.05);}
		.sa2-est{font-size:10.5px;color:var(--text-muted);}

		.sa2-foot{display:flex;gap:10px;align-items:end;margin-top:13px;flex-wrap:wrap;}
		.sa2-why{flex:1;min-width:280px;}
		.sa2-why .control-label{font-size:11px;color:var(--text-muted);}
		.sa2-go{background:#b02a2a;border:1px solid #b02a2a;color:#fff;font-weight:800;letter-spacing:.3px;
			border-radius:10px;padding:0 26px;height:40px;font-size:13px;cursor:pointer;white-space:nowrap;}
		.sa2-go:disabled{opacity:.4;cursor:not-allowed;}
		.sa2-clear{border:1px solid var(--border-color);background:var(--fg-color);border-radius:10px;
			padding:0 16px;height:40px;font-size:12.5px;cursor:pointer;color:var(--text-muted);}

		.sa2-panel{margin-top:18px;border:1px solid var(--border-color);border-radius:13px;
			background:var(--fg-color);overflow:hidden;}
		.sa2-panel .hd{display:flex;align-items:center;gap:10px;padding:10px 16px;
			border-bottom:1px solid var(--border-color);flex-wrap:wrap;}
		.sa2-panel .hd b{font-size:12.5px;} .sa2-panel .hd .n{font-size:11.5px;color:var(--text-muted);}
		.sa2-panel .hd .sp{margin-left:auto;display:flex;gap:6px;align-items:center;}
		.sa2-tab{border:1px solid var(--border-color);border-radius:8px;padding:4px 14px;font-size:12px;
			font-weight:700;cursor:pointer;background:var(--control-bg);}
		.sa2-tab.on{background:var(--primary);border-color:var(--primary);color:#fff;}
		.sa2-hist{border:1px solid var(--border-color);background:var(--fg-color);border-radius:8px;
			padding:4px 13px;font-size:11.5px;font-weight:700;cursor:pointer;color:var(--text-muted);}
		.sa2-hist:hover{border-color:#1f618d;color:#1f618d;}
		table.sa2-rt{width:100%;border-collapse:separate;border-spacing:0;font-size:12.5px;}
		table.sa2-rt th{background:var(--control-bg);border-bottom:1px solid var(--border-color);
			padding:7px 12px;text-align:left;font-weight:700;font-size:10px;text-transform:uppercase;
			letter-spacing:.06em;color:var(--text-muted);}
		table.sa2-rt td{border-bottom:1px solid var(--border-color);padding:7px 12px;vertical-align:top;}
		table.sa2-rt tbody tr:last-child td{border-bottom:0;}
		.sa2-st{font-weight:800;font-size:10.5px;padding:2px 9px;border-radius:9px;white-space:nowrap;}
		.sa2-st.Pending{background:rgba(184,134,11,.18);color:#8a6508;}
		.sa2-st.Approved{background:rgba(29,122,51,.16);color:#1d7a33;}
		.sa2-st.Rejected{background:rgba(176,42,42,.14);color:#b02a2a;}
		[data-theme="dark"] .sa2-st.Pending{color:#e8b84a;}
		[data-theme="dark"] .sa2-st.Approved{color:#7fc98f;}
		[data-theme="dark"] .sa2-st.Rejected{color:#e08a8a;}
		.sa2-sub{color:var(--text-muted);font-size:11px;}
		.sa2-neg{color:#b02a2a;font-weight:700;} .sa2-pos{color:#1d7a33;font-weight:700;}
		[data-theme="dark"] .sa2-neg{color:#e08a8a;} [data-theme="dark"] .sa2-pos{color:#7fc98f;}
		.sa2-empty{padding:40px;text-align:center;color:var(--text-muted);font-size:13px;}
		</style>
		<div class="sa2-bar">
			<span class="sa2-fams"></span>
			<input type="text" class="sa2-q" placeholder="${__("Find a stone…")}">
			<span class="sa2-note sa2-wh"></span>
		</div>
		<div class="sa2-kpi"></div>
		<div class="sa2-box"><div class="sa2-scroll">
			<table class="sa2-t"><thead></thead><tbody></tbody></table>
		</div></div>
		<div class="sa2-foot">
			<div class="sa2-why"></div>
			<button class="sa2-clear">${__("Clear count")}</button>
			<button class="sa2-go" disabled>${__("SUBMIT COUNT")}</button>
		</div>
		<div class="sa2-panel">
			<div class="hd">
				<b>${__("Adjustments")}</b>
				<span class="n">${__("nothing is written off until one is approved")}</span>
				<span class="sp">
					<span class="sa2-tab on" data-s="Pending">${__("Pending")}</span>
					<span class="sa2-tab" data-s="all">${__("Recent")}</span>
					<button class="sa2-hist">${__("HISTORY")}</button>
				</span>
			</div>
			<div class="sa2-body"></div>
		</div>`);

	const why = frappe.ui.form.make_control({
		df: { fieldtype: "Data", label: __("What the count found"), fieldname: "why",
			placeholder: __("e.g. quarterly count — the OOO-OO tray is light") },
		parent: root.find(".sa2-why").get(0), render_input: true });
	why.refresh();
	why.$input.on("input", () => paintFoot());

	// ---- the count ---------------------------------------------------------
	const diff = (r) => {
		const c = COUNT[r.item];
		if (!c || c.counted === "" || c.counted === undefined) return null;
		return Math.round((flt(c.counted) - r.stock) * 1000) / 1000;
	};
	const counted = () => ROWS.filter((r) => diff(r) !== null);
	const changed = () => counted().filter((r) => Math.abs(diff(r)) > 0.0005);
	const shortCt = () => changed().reduce((a, r) => a + (diff(r) < 0 ? -diff(r) : 0), 0);
	const overCt = () => changed().reduce((a, r) => a + (diff(r) > 0 ? diff(r) : 0), 0);

	function shown() {
		const q = Q.trim().toUpperCase();
		return ROWS.filter((r) => (!FAM || r.family === FAM)
			&& (!q || (r.item + " " + r.item_name).toUpperCase().includes(q)));
	}

	function paintKpi() {
		const all = ROWS.reduce((a, r) => a + r.stock, 0);
		root.find(".sa2-kpi").html(`
			<div class="sa2-k"><div class="k">${__("On the books")}</div>
				<div class="v">${ct(all)}<span class="u">ct</span></div>
				<div class="sub">${__("{0} stone(s) loose in the room", [ROWS.length])}</div></div>
			<div class="sa2-k done"><div class="k">${__("Counted")}</div>
				<div class="v">${counted().length}<span class="u">/ ${ROWS.length}</span></div>
				<div class="sub">${__("a blank line is not counted")}</div></div>
			<div class="sa2-k short"><div class="k">${__("Short")}</div>
				<div class="v">${ct(shortCt())}<span class="u">ct</span></div>
				<div class="sub">${__("written off the books")}</div></div>
			<div class="sa2-k over"><div class="k">${__("Over")}</div>
				<div class="v">${ct(overCt())}<span class="u">ct</span></div>
				<div class="sub">${__("more on the tray than booked")}</div></div>
			<div class="sa2-k"><div class="k">${__("Lines to adjust")}</div>
				<div class="v">${changed().length}</div>
				<div class="sub">${__("only what disagrees is kept")}</div></div>`);
	}

	function rowHtml(r) {
		const c = COUNT[r.item] || {};
		const d = diff(r);
		const cls = d === null ? "zero" : (d < -0.0005 ? "minus" : (d > 0.0005 ? "plus" : "zero"));
		const txt = d === null ? "—" : (d > 0.0005 ? "+" : "") + ct(d);
		return `<tr class="${d !== null ? "sa2-touched" : ""}" data-it="${esc(r.item)}">
			<td class="sa2-it">${esc(r.item)}
				<div class="g">${esc(r.group)}${r.avg ? " · " + __("avg {0} ct/pc", [r.avg]) : ""}</div></td>
			<td class="num sa2-bk">${ct(r.stock)}
				${r.est_pcs ? `<div class="sa2-est">${__("~{0} pc", [r.est_pcs])}</div>` : ""}</td>
			<td class="num"><input type="number" step="0.001" min="0" class="sa2-in"
				data-it="${esc(r.item)}" placeholder="${__("not counted")}"
				value="${c.counted === undefined ? "" : c.counted}"></td>
			<td class="num"><input type="number" step="1" min="0" class="sa2-pcs"
				data-it="${esc(r.item)}" placeholder="${r.est_pcs || ""}" value="${c.pcs || ""}"></td>
			<td class="num sa2-d ${cls}">${txt}</td></tr>`;
	}

	function paintTable() {
		root.find(".sa2-t thead").html(`<tr>
			<th>${__("Stone")}</th><th class="num">${__("On the books")}</th>
			<th class="num">${__("Counted (ct)")}</th><th class="num">${__("Pcs")}</th>
			<th class="num">${__("Difference")}</th></tr>`);
		const rows = shown();
		root.find(".sa2-t tbody").html(rows.length ? rows.map(rowHtml).join("")
			: `<tr><td colspan="5" class="sa2-empty">${ROWS.length
				? __("Nothing matches that.")
				: __("The stone room is empty — there is nothing to count.")}</td></tr>`);
		paintKpi();
		paintFoot();
	}

	function paintFoot() {
		const n = changed().length;
		root.find(".sa2-go")
			.prop("disabled", !n || !(why.get_value() || "").trim())
			.text(n ? __("WRITE OFF {0} LINE(S)", [n]) : __("SUBMIT COUNT"));
		root.find(".sa2-clear").toggle(counted().length > 0);
	}

	// typing the weight -> the difference and the top move; the row is not
	// redrawn, because somebody is typing in it
	root.on("input", ".sa2-in", function () {
		const it = $(this).data("it");
		const r = ROWS.find((x) => x.item === it);
		if (!r) return;
		COUNT[it] = COUNT[it] || {};
		COUNT[it].counted = this.value === "" ? undefined : this.value;
		// a weight typed with no piece count gets the chart's estimate
		if (r.avg && COUNT[it].counted !== undefined && !COUNT[it].manualPcs) {
			COUNT[it].pcs = Math.max(1, Math.round(flt(COUNT[it].counted) / r.avg));
			$(this).closest("tr").find(".sa2-pcs").val(COUNT[it].pcs || "");
		}
		const d = diff(r);
		const $tr = $(this).closest("tr");
		$tr.toggleClass("sa2-touched", d !== null);
		$tr.find("td.sa2-d")
			.attr("class", "num sa2-d " + (d === null ? "zero" : (d < -0.0005 ? "minus" : (d > 0.0005 ? "plus" : "zero"))))
			.text(d === null ? "—" : (d > 0.0005 ? "+" : "") + ct(d));
		paintKpi();
		paintFoot();
	});
	root.on("input", ".sa2-pcs", function () {
		const it = $(this).data("it");
		COUNT[it] = COUNT[it] || {};
		COUNT[it].pcs = this.value === "" ? undefined : Number(this.value);
		COUNT[it].manualPcs = true;
	});
	// type, Enter, next stone — a tray is counted straight down the list
	root.on("keydown", ".sa2-in", function (e) {
		if (e.key !== "Enter") return;
		e.preventDefault();
		const $next = $(this).closest("tr").next("tr").find(".sa2-in");
		if ($next.length) $next.focus().select();
	});

	root.on("click", ".sa2-f", function () {
		root.find(".sa2-f").removeClass("on"); $(this).addClass("on");
		FAM = $(this).data("f") || "";
		paintTable();
	});
	root.on("input", ".sa2-q", frappe.utils.debounce(function () { Q = this.value || ""; paintTable(); }, 200));
	root.find(".sa2-clear").on("click", () => {
		frappe.confirm(__("Throw the count away and start again?"), () => {
			Object.keys(COUNT).forEach((k) => delete COUNT[k]);
			paintTable();
		});
	});

	// ---- submit ------------------------------------------------------------
	root.find(".sa2-go").on("click", () => {
		const rows = changed();
		if (!rows.length) return;
		const short = shortCt(), over = overCt();
		frappe.confirm(
			__("Write this count off against the books?") + "<br><br>"
			+ rows.slice(0, 12).map((r) => {
				const d = diff(r);
				return `${esc(r.item)} — ${ct(r.stock)} → <b>${ct(flt(COUNT[r.item].counted))}</b> `
					+ `<span style="color:${d < 0 ? "#b02a2a" : "#1d7a33"};">(${d > 0 ? "+" : ""}${ct(d)} ct)</span>`;
			}).join("<br>")
			+ (rows.length > 12 ? `<br>${__("…and {0} more", [rows.length - 12])}` : "")
			+ "<br><br>"
			+ (short ? __("<b>{0} ct</b> goes off the books.", [ct(short)]) + " " : "")
			+ (over ? __("<b>{0} ct</b> comes on.", [ct(over)]) + " " : "")
			+ "<br>" + __("It is a manager who signs for it — nothing moves until then."),
			() => {
				frappe.dom.freeze(__("Booking the count…"));
				frappe.call({ method: API + ".create_stone_adjustment", args: {
					rows: JSON.stringify(rows.map((r) => ({
						item: r.item, counted: flt(COUNT[r.item].counted),
						pcs: COUNT[r.item].pcs || 0 }))),
					reason: why.get_value(),
				} }).then((r) => {
					frappe.dom.unfreeze();
					const m = r.message || {};
					frappe.show_alert({ indicator: "blue", message:
						__("{0} raised — {1} line(s), waiting on a manager.", [m.name, m.lines]) }, 7);
					Object.keys(COUNT).forEach((k) => delete COUNT[k]);
					why.set_value("");
					load();
				}).catch(() => frappe.dom.unfreeze());
			});
	});

	// ---- the adjustments underneath ---------------------------------------
	function paintList(d) {
		const rows = (d || {}).rows || [];
		root.find(".sa2-body").html(rows.length ? `<table class="sa2-rt"><thead><tr>
			<th>${__("Count")}</th><th>${__("What it found")}</th>
			<th class="num">${__("Short")}</th><th class="num">${__("Over")}</th>
			<th>${__("Status")}</th><th></th></tr></thead><tbody>`
			+ rows.map((x) => `<tr>
				<td><b>${esc(x.name)}</b>
					<div class="sa2-sub">${esc(x.counted_on)} · ${esc(x.counted_label)}</div></td>
				<td>${(x.items || []).slice(0, 6).map((i) => `${esc(i.item)} ${ct(i.system_qty)} → <b>${ct(i.counted_qty)}</b>
					<span class="${i.difference < 0 ? "sa2-neg" : "sa2-pos"}">(${i.difference > 0 ? "+" : ""}${ct(i.difference)})</span>`).join("<br>")}
					${(x.items || []).length > 6 ? `<div class="sa2-sub">${__("…and {0} more", [x.items.length - 6])}</div>` : ""}
					${x.reason ? `<div class="sa2-sub">${esc(x.reason)}</div>` : ""}</td>
				<td class="num sa2-neg">${x.total_short ? ct(x.total_short) : "—"}</td>
				<td class="num sa2-pos">${x.total_over ? ct(x.total_over) : "—"}</td>
				<td><span class="sa2-st ${esc(x.status)}">${esc(x.status)}</span>
					${x.decided_label ? `<div class="sa2-sub">${esc(x.decided_label)} · ${esc(x.approved_on)}</div>` : ""}
					${x.stock_reconciliation ? `<div class="sa2-sub">${esc(x.stock_reconciliation)}</div>` : ""}
					${x.reject_reason ? `<div class="sa2-sub" style="color:#b02a2a;">${esc(x.reject_reason)}</div>` : ""}</td>
				<td style="white-space:nowrap;">${x.status === "Pending" && CTX.can_approve
					? `<button class="btn btn-xs btn-success sa2-ok" data-n="${esc(x.name)}">${__("Approve")}</button>
					   <button class="btn btn-xs btn-danger sa2-no" data-n="${esc(x.name)}">${__("Reject")}</button>` : ""}</td>
			</tr>`).join("") + "</tbody></table>"
			: `<div class="sa2-empty" style="padding:26px;">${LIST === "Pending"
				? __("Nothing waiting to be signed for.") : __("No counts taken yet.")}</div>`);
	}
	function loadList() {
		return frappe.call({ method: API + ".list_stone_adjustments", freeze: false, args: { status: LIST } })
			.then((r) => { CTX.can_approve = (r.message || {}).can_approve; paintList(r.message); });
	}
	root.on("click", ".sa2-tab", function () {
		root.find(".sa2-tab").removeClass("on"); $(this).addClass("on");
		LIST = $(this).data("s"); loadList();
	});
	root.on("click", ".sa2-ok", function () {
		const n = $(this).data("n");
		frappe.confirm(__("Write <b>{0}</b> off? The books are set to what was counted, there and then.", [esc(n)]), () => {
			frappe.dom.freeze(__("Writing off…"));
			frappe.call({ method: API + ".approve_stone_adjustment", args: { name: n } }).then((r) => {
				frappe.dom.unfreeze();
				const m = r.message || {};
				frappe.show_alert({ indicator: "green", message:
					__("{0} written off — {1}.", [n, m.stock_reconciliation]) }, 7);
				load();
			}).catch(() => frappe.dom.unfreeze());
		});
	});
	root.on("click", ".sa2-no", function () {
		const n = $(this).data("n");
		frappe.prompt({ fieldname: "why", label: __("Reason"), fieldtype: "Data" }, (v) => {
			frappe.call({ method: API + ".reject_stone_adjustment", args: { name: n, reason: v.why || null } })
				.then(() => {
					frappe.show_alert({ indicator: "orange", message: __("{0} rejected.", [n]) }, 5);
					loadList();
				});
		}, __("Reject {0}", [n]));
	});
	root.on("click", ".sa2-hist", () => frappe.set_route("stone-adjustment-history"));

	// ---- load --------------------------------------------------------------
	function load() {
		return frappe.call({ method: API + ".get_stone_adjust_stock", freeze: false }).then((r) => {
			const m = r.message || {};
			ROWS = m.rows || [];
			FAMS = m.families || [];
			CTX.warehouse = m.warehouse || "";
			root.find(".sa2-wh").html(__("Counting <b>{0}</b> — the loose stone room. Stones on cards and pieces are not counted here.",
				[esc(CTX.warehouse)]));
			root.find(".sa2-fams").html([{ f: "", l: __("All") }].concat(FAMS.map((f) => ({ f, l: f })))
				.map((x) => `<span class="sa2-f ${FAM === x.f ? "on" : ""}" data-f="${esc(x.f)}">${esc(x.l)}</span>`).join(" "));
			paintTable();
			return loadList();
		});
	}

	page.set_primary_action(__("Refresh"), () => load(), "refresh");
	frappe.pages["stone-adjustment"].on_page_show = () => loadList();
	frappe.call({ method: API + ".get_stone_adjust_context" }).then((r) => {
		CTX = Object.assign(CTX, r.message || {});
		load();
	});
};
