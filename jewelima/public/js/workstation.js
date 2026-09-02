// jewelima.buildWorkstation — the bench WORKSTATION page: the small live
// picture a worker glances at (the board page stays the deep filter/export
// view). Three parts: NEXT UP + the waiting queue in priority order (with
// one-click "why is it waiting" reasons), and WHO'S WORKING on what (type
// of work, since when). Auto-refreshes every 30s.

frappe.provide("jewelima");

const WK_NO_ISSUE = ["CAM"];              // info-only queues
const WK_EXTRACT = ["BAG EXTRACTION"];    // no assign — straight to Bag Split
const WK_STONE_REQ = ["WAX SETTING", "SETTING"];  // benches that request stones

jewelima.buildWorkstation = function (wrapper, bench, opts) {
	opts = opts || {};
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Workstation — {0}", [bench]), single_column: true });
	// opened from the Workstations tiles: offer the way back
	if (opts.onBack) page.set_secondary_action(__("← All workstations"), opts.onBack);
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	let D = null;

	$(page.main).append(`
		<style>
		.wk-loc{font-size:24px;font-weight:800;letter-spacing:.5px;margin:0 0 12px;display:flex;align-items:center;gap:12px;}
		.wk-loc .tag{font-size:11px;font-weight:700;letter-spacing:.08em;color:var(--text-muted);text-transform:uppercase;border:1px solid var(--border-color);border-radius:9px;padding:2px 10px;background:var(--control-bg);}
		.wk-kpis{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px;}
		.wk-tile{border:1px solid var(--border-color);border-radius:9px;padding:8px 18px;background:var(--control-bg);}
		.wk-tile .k{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;}
		.wk-tile .v{font-size:20px;font-weight:800;}
		.wk-cols{display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap;}
		.wk-q{flex:1.2;min-width:420px;}
		.wk-w{flex:1;min-width:340px;}
		.wk-sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin:0 0 6px;}
		.wk-next{border:2px solid #d63031;border-radius:10px;padding:10px 16px;margin-bottom:10px;display:flex;align-items:center;gap:14px;background:var(--fg-color);}
		.wk-next .k{font-size:10px;font-weight:800;letter-spacing:.08em;color:#d63031;text-transform:uppercase;}
		.wk-next .v{font-size:18px;font-weight:800;}
		.wk-next .sub{font-size:12px;color:var(--text-muted);}
		table.wk-t{width:100%;border-collapse:collapse;font-size:12.5px;background:var(--fg-color);}
		table.wk-t th{background:var(--control-bg);font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);padding:5px 9px;border:1px solid var(--border-color);text-align:left;}
		table.wk-t td{border:1px solid var(--border-color);padding:4px 9px;}
		.wk-pr{display:inline-block;min-width:24px;text-align:center;border-radius:9px;padding:1px 6px;font-size:11px;font-weight:800;background:var(--control-bg);}
		.wk-pr.man{background:#d63031;color:#fff;}
		.wk-qr{border-radius:10px;padding:1px 8px;font-size:11px;font-weight:700;background:#fff6e0;color:#7a5b00;border:1px solid #e0a800;cursor:pointer;}
		.wk-qr.add{background:transparent;color:var(--text-muted);border:1px dashed var(--border-color);}
		tr.wk-stok > td{background:#f0f9f1;}
		tr.wk-stok > td:first-child{box-shadow:inset 3px 0 0 #2e7d32;}
		tr.wk-stneed > td{background:#fff8e6;}
		tr.wk-stneed > td:first-child{box-shadow:inset 3px 0 0 #e0a800;}
		.wk-tile.wk-await{cursor:pointer;border-color:#e0a800;background:#fff8e6;}
		.wk-tile.wk-await .v{color:#8a6d00;}
		.wk-tile.wk-done{cursor:pointer;border-color:#2e7d32;background:#eaf6ec;}
		.wk-tile.wk-done .v{color:#1d7a33;}
		.wk-req-done{font-size:10px;font-weight:800;color:#8a6d00;background:#fff3cd;border-radius:9px;padding:2px 8px;white-space:nowrap;}
		.wk-emp{border:1px solid var(--border-color);border-radius:9px;background:var(--fg-color);margin-bottom:10px;overflow:hidden;}
		.wk-emp .h{background:var(--control-bg);padding:7px 12px;font-weight:700;font-size:13px;display:flex;justify-content:space-between;}
		.wk-emp .h .n{color:var(--text-muted);font-weight:600;font-size:12px;}
		.wk-emp .c{padding:6px 12px;border-top:1px solid var(--border-color);display:flex;gap:10px;align-items:center;font-size:12.5px;flex-wrap:wrap;}
		.wk-emp .c b{min-width:110px;}
		.wk-wt{border-radius:9px;padding:1px 8px;font-size:11px;font-weight:700;background:var(--control-bg);}
		.wk-since{color:var(--text-muted);font-size:11px;margin-left:auto;}
		.wk-none{padding:22px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:9px;}
		.wk-dt{border:1px solid var(--border-color);border-radius:9px;padding:4px 12px;background:var(--control-bg);text-align:center;}
		.wk-flow{cursor:pointer;transition:border-color .1s,box-shadow .1s;}
		.wk-flow:hover{border-color:#1f618d;box-shadow:0 1px 5px rgba(31,97,141,.18);}
		.wk-dt .k{font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;}
		.wk-dt .v{font-size:14px;font-weight:800;display:block;}
		.wk-dt .s{font-size:9.5px;color:var(--text-muted);display:block;white-space:nowrap;}
		.wk-day{margin-top:16px;}
		table.wk-dw{width:100%;border-collapse:collapse;font-size:12px;background:var(--fg-color);}
		table.wk-dw th{background:var(--control-bg);font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);padding:4px 9px;border:1px solid var(--border-color);text-align:left;}
		table.wk-dw td{border:1px solid var(--border-color);padding:4px 9px;}
		table.wk-dw tr.emp td{background:var(--control-bg);font-weight:700;}
		</style>
		<div class="wk-loc"><span class="tag">${__("Workstation")}</span>${esc(bench)}
			<span style="margin-left:auto;display:flex;align-items:center;gap:8px;">
				<span class="wk-day-tiles" style="display:flex;gap:8px;"></span>
			</span></div>
		<div class="wk-kpis"></div>
		<div class="wk-bulk" style="display:none;border:1px solid #e0a800;border-radius:9px;background:var(--fg-color);padding:10px 14px;margin-bottom:12px;">
			<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
				<b style="font-size:12px;">${__("Bulk reason")}</b>
				<select class="wk-bulk-sel" style="border:1px solid var(--border-color);border-radius:6px;height:28px;font-size:12px;background:var(--fg-color);color:var(--text-color);"></select>
				<input type="text" class="wk-bulk-scan" placeholder="${__("scan card…")}" style="border:1px solid var(--border-color);border-radius:6px;height:28px;padding:2px 8px;font-size:12px;width:170px;background:var(--fg-color);color:var(--text-color);">
				<button class="btn btn-xs wk-bulk-go" style="background:#e0a800;border-color:#e0a800;color:#3a2c00;font-weight:700;">${__("Apply")}</button>
				<button class="btn btn-xs btn-default wk-bulk-x">${__("Close")}</button>
			</div>
			<div class="wk-bulk-chips" style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;"></div>
		</div>
		<div class="wk-cols">
			<div class="wk-q"><div class="wk-sec">${__("Waiting — priority order")}</div>
				<div class="wk-next" style="display:none;"></div><div class="wk-qbody"></div></div>
			<div class="wk-w"><div class="wk-sec">${__("Working now")}</div><div class="wk-wbody"></div></div>
		</div>
		<div class="wk-day"><div class="wk-sec wk-day-title"></div><div class="wk-day-body"></div></div>
	`);
	const root = $(page.main);

	function paint() {
		const c = D.counts;
		// Weight (gold) benches issue and receipt through the Job Work page ONLY —
		// their workstation stays a board: stone requests yes, issue/collect no.
		const canIssue = D.can_act && D.flow !== "weights";
		const actCol = D.can_act && !WK_NO_ISSUE.includes(bench)
			&& (canIssue || WK_EXTRACT.includes(bench) || WK_STONE_REQ.includes(bench));
		root.find(".wk-kpis").html(
			`<div class="wk-tile"><div class="k">${__("Waiting")}</div><div class="v">${c.waiting}</div></div>
			<div class="wk-tile"><div class="k">${__("Working")}</div><div class="v">${c.working}</div></div>
			${D.awaiting_stones ? `<div class="wk-tile wk-await" title="${__("click for the list")}">
				<div class="k">${__("Awaiting stones")}</div><div class="v">${D.awaiting_stones.length}</div></div>` : ""}
			${c.completed ? `<div class="wk-tile wk-done" title="${__("click for the list")}">
				<div class="k">${__("Completed · not transferred")}</div><div class="v">${c.completed}</div></div>` : ""}
			<div class="wk-tile"><div class="k">${__("Total at bench")}</div><div class="v">${c.total}</div></div>`);

		const next = D.queue[0];
		root.find(".wk-next").css("display", next ? "flex" : "none").html(next ? `
			<span class="k">${__("Next up")}</span><span class="v">${esc(next.name)}</span>
			<span class="sub">${esc(next.design || "")}${next.due ? " · " + __("due") + " " + frappe.datetime.str_to_user(next.due) : ""}${next.prio_manual ? " · " + __("MANUAL PRIORITY") : ""}</span>` : "");

		root.find(".wk-qbody").html(D.queue.length ? `
			<table class="wk-t"><thead><tr>
				${D.ranked ? `<th style="width:40px">P#</th>` : ""}<th>${__("Card")}</th><th>${__("Design")}</th>
				<th>${__("Party")}</th><th>${__("Due")}</th><th>${__("Why waiting")}</th>${actCol ? `<th style="width:70px"></th>` : ""}
			</tr></thead><tbody>
			${D.queue.map((r) => `<tr class="${r.stones_ok == null ? "" : r.stones_ok ? "wk-stok" : "wk-stneed"}"${r.stones_pending ? ` title="${esc(__("Stones short"))}: ${esc(r.stones_pending)}"` : ""}>
				${D.ranked ? `<td><span class="wk-pr ${r.prio_manual ? "man" : ""}">${r.prio_rank || ""}</span></td>` : ""}
				<td><b>${esc(r.name)}</b>${r.status === "On Hold" ? " · " + __("On Hold") : ""}</td>
				<td>${esc(r.design || "")}</td>
				<td>${esc(r.party || "")}</td>
				<td>${r.due ? frappe.datetime.str_to_user(r.due) : ""}</td>
				<td>${r.queue_reason
					? `<span class="wk-qr" data-name="${esc(r.name)}">${esc(r.queue_reason)}</span>`
					: `<span class="wk-qr add" data-name="${esc(r.name)}">+ ${__("reason")}</span>`}</td>
				${actCol && WK_EXTRACT.includes(bench) ? `<td><button class="btn btn-xs wk-extract" data-name="${esc(r.name)}"
					style="background:#2e7d32;border-color:#2e7d32;color:#fff;">${__("Extract →")}</button></td>`
				: actCol ? `<td>${r.stones_ok === 0
					? (r.stone_requested
						? `<span class="wk-req-done">${__("REQUESTED")}</span>`
						: `<button class="btn btn-xs wk-streq" data-name="${esc(r.name)}"
							style="background:#e0a800;border-color:#e0a800;color:#3a2c00;font-weight:700;">${__("Stone Request")}</button>`)
					: canIssue ? `<button class="btn btn-xs wk-issue" data-name="${esc(r.name)}"
						style="background:#1f618d;border-color:#1f618d;color:#fff;">${__("Assign")}</button>` : ""}</td>` : ""}
			</tr>`).join("")}</tbody></table><div class="wk-qmore"></div>`
			: `<div class="wk-none">${__("Nothing waiting — the bench is clear.")}</div>`);
		// the tile count is the WHOLE queue; this says how much of it is on screen
		jewelima.moreBar(root.find(".wk-qmore"), (D.queue || []).length,
			D.queue_total != null ? D.queue_total : (D.queue || []).length,
			() => load(true), __("Load 1000 more"));

		root.find(".wk-wbody").html(D.working.length ? D.working.map((g) => `
			<div class="wk-emp"><div class="h"><span>${esc(g.employee_name)}</span>
				<span class="n">${g.cards.length} ${__("card(s)")}</span></div>
			${g.cards.map((cd) => `<div class="c">
				<b>${esc(cd.name)}</b><span>${esc(cd.design || "")}</span>
				${cd.work_type ? `<span class="wk-wt">${esc(cd.work_type)}</span>` : ""}
				<span>${esc(cd.status)}</span>
				<span class="wk-since">${cd.since ? frappe.datetime.comment_when(cd.since) : ""}</span>
				${canIssue ? `<button class="btn btn-xs btn-default wk-collect" data-name="${esc(cd.name)}" data-emp="${esc(g.employee)}">${__("Collect")}</button>` : ""}
			</div>`).join("")}</div>`).join("")
			: `<div class="wk-none">${__("Nobody holds a card here right now.")}</div>`);
	}

	// coming back to a workstation must show TODAY's board, not what was on screen
	// when it was first opened — Frappe keeps the page alive between visits
	const _route = (frappe.get_route() || [])[0];
	if (_route && frappe.pages[_route]) {
		frappe.pages[_route].on_page_show = function () { load(); loadDay(); };
	}

	// The queue arrives a window at a time — a bench can hold thousands of cards
	// and the worker only ever works the top of it, but the browser still had to
	// lay out every row before anything appeared.
	const QPAGE = 1000;

	function load(more) {
		const $q = root.find(".wk-qbody");
		jewelima.busy($q, true, more ? __("Loading more cards…") : __("Loading the bench…"));
		frappe.call({ method: API + ".get_bench_workstation", freeze: false,
			args: { bench, limit: QPAGE, offset: more && D ? (D.queue || []).length : 0 } })
			.then((r) => {
				const m = r.message;
				if (!m) return;
				if (more && D) m.queue = (D.queue || []).concat(m.queue || []);
				D = m;
				paint();
			})
			.always(() => jewelima.busy($q, false));
		if (!more) loadDay();
	}

	// ---- the DAY panel: transfers in/out + finished work by worker -------------
	function dayDate() {
		// the DAY panel always reflects today; the IN/OUT tiles open their own
		// date-filtered dialog that leaves this untouched.
		return frappe.datetime.get_today();
	}
	function loadDay() {
		frappe.call({ method: API + ".get_bench_day", args: { bench, date: dayDate() }, freeze: false }).then((r) => {
			const d = r.message;
			if (!d) return;
			const chips = (st) => Object.entries(st || {})
				.map(([k, v]) => `${k} ${v.pcs}/${v.ct.toFixed(3)}ct`).join(" · ");
			// weight columns only where the bench books metal; the no-gold benches
			// (CAD, Waxing, Wax Setting, Wax Cleaning) show cards · qty, not grams.
			const wcols = D && D.flow === "weights";
			const noGold = D && D.no_gold;
			const tile = (label, dir, x) => `<span class="wk-dt wk-flow" data-dir="${dir}" title="${__("Click to see the cards — with a date filter")}">
				<span class="k">${label}</span>
				<span class="v">${noGold ? `${x.count} · ${x.qty || 0} pcs` : `${x.count} · ${x.gold_g.toFixed(3)} g`}</span>
				${Object.keys(x.stones || {}).length ? `<span class="s">${chips(x.stones)}</span>` : ""}</span>`;
			root.find(".wk-day-tiles").html(tile(__("In today"), "in", d.in) + tile(__("Out today"), "out", d.out));
			root.find(".wk-day-title").text(__("Work done on {0} — {1} card(s)", [frappe.datetime.str_to_user(d.date), d.done_count]));
			// summary per worker — the card-by-card detail lives in the bench records
			const sum = (arr, k) => arr.reduce((t, x) => t + (x[k] || 0), 0);
			const types = (cards) => {
				const m = {};
				cards.forEach((c) => { const k = c.work_type || "—"; m[k] = (m[k] || 0) + 1; });
				return Object.entries(m).map(([k, n]) => `${esc(k)} ×${n}`).join(", ");
			};
			// weight columns only where the bench actually books metal (wcols set above)
			root.find(".wk-day-body").html(d.done.length ? `
				<table class="wk-dw"><thead><tr><th>${__("Worker")}</th><th>${__("Cards done")}</th>
					<th>${__("Work types")}</th>${wcols ? `<th>${__("In g")}</th><th>${__("Loss g")}</th>` : ""}</tr></thead><tbody>
				${d.done.map((g) => `<tr>
					<td><b>${esc(g.employee_name)}</b></td>
					<td>${g.cards.length}</td>
					<td>${types(g.cards)}</td>
					${wcols ? `<td>${g.weight_in ? g.weight_in.toFixed(3) : ""}</td>
					<td>${g.loss ? g.loss.toFixed(3) : ""}</td>` : ""}
				</tr>`).join("")}
				<tr class="emp"><td>${__("TOTAL")}</td><td>${d.done_count}</td><td></td>
					${wcols ? `<td>${sum(d.done, "weight_in") ? sum(d.done, "weight_in").toFixed(3) : ""}</td>
					<td>${sum(d.done, "loss") ? sum(d.done, "loss").toFixed(3) : ""}</td>` : ""}</tr>
				</tbody></table>`
				: `<div class="wk-none">${__("No finished work recorded this day.")}</div>`);
		});
	}

	// "why is it waiting" — INLINE: the chip swaps into a select right in the cell
	// the AWAITING STONES tile -> the full list in a dialog
	root.on("click", ".wk-await", function () {
		const rows = (D && D.awaiting_stones) || [];
		const dlg = new frappe.ui.Dialog({ title: __("Awaiting stones — {0}", [bench]), size: "large" });
		$(dlg.body).html(rows.length ? `
			<table class="wk-t"><thead><tr>
				<th>${__("Card")}</th><th>${__("Design")}</th><th>${__("Party")}</th>
				<th>${__("Due")}</th><th>${__("Requested")}</th><th>${__("Short")}</th>
			</tr></thead><tbody>
			${rows.map((r) => `<tr>
				<td><a class="jw-card-link" style="font-weight:800;color:#1f618d;cursor:pointer;" data-card="${esc(r.name)}">${esc(r.name)}</a></td>
				<td>${esc(r.design || "")}</td><td>${esc(r.party || "")}</td>
				<td>${r.due ? frappe.datetime.str_to_user(r.due) : ""}</td>
				<td>${r.since ? frappe.datetime.comment_when(r.since) : ""}</td>
				<td style="font-size:11.5px;color:#8a6d00;">${esc(r.stones_pending || "")}</td>
			</tr>`).join("")}</tbody></table>`
			: `<div style="padding:24px;text-align:center;color:var(--text-muted);">${__("Nothing awaiting stones.")}</div>`);
		dlg.show();
	});

	root.on("click", ".wk-done", function () {
		const rows = (D && D.completed_untransferred) || [];
		const dlg = new frappe.ui.Dialog({ title: __("Completed — not transferred — {0}", [bench]), size: "large" });
		$(dlg.body).html(rows.length ? `
			<div style="font-size:12.5px;color:var(--text-muted);margin-bottom:8px;">${__("Done at this bench but still sitting here — transfer them onward.")}</div>
			<table class="wk-t"><thead><tr>
				<th>${__("Card")}</th><th>${__("Design")}</th><th>${__("Type")}</th><th>${__("Party")}</th><th>${__("Due")}</th>
			</tr></thead><tbody>
			${rows.map((r) => `<tr>
				<td><a class="jw-card-link" style="font-weight:800;color:#1f618d;cursor:pointer;" data-card="${esc(r.name)}">${esc(r.name)}</a></td>
				<td>${esc(r.design || "")}</td><td>${esc(r.design_type || "")}</td><td>${esc(r.party || "")}</td>
				<td>${r.due ? frappe.datetime.str_to_user(r.due) : ""}</td>
			</tr>`).join("")}</tbody></table>`
			: `<div style="padding:24px;text-align:center;color:var(--text-muted);">${__("Nothing completed is waiting to transfer.")}</div>`);
		dlg.show();
	});

	// IN / OUT tiles -> the actual cards that moved, with a from/to date filter.
	// The dialog owns its own dates; the page's DAY panel stays on today.
	root.on("click", ".wk-flow", function () {
		const dir = $(this).data("dir");
		const isIn = dir === "in";
		const today = frappe.datetime.get_today();
		const dlg = new frappe.ui.Dialog({
			title: isIn ? __("Cards in — {0}", [bench]) : __("Cards out — {0}", [bench]),
			size: "large",
		});
		$(dlg.body).html(`
			<div style="display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
				<label style="font-size:11px;color:var(--text-muted);">${__("From")}<br>
					<input type="date" class="wf-from form-control" style="width:150px;" value="${today}"></label>
				<label style="font-size:11px;color:var(--text-muted);">${__("To")}<br>
					<input type="date" class="wf-to form-control" style="width:150px;" value="${today}"></label>
				<button class="btn btn-xs btn-default wf-today" style="margin-bottom:1px;">${__("Today")}</button>
				<button class="btn btn-xs btn-default wf-clearf" style="margin-bottom:1px;">${__("Clear filters")}</button>
				<span class="wf-count" style="margin-left:auto;font-size:12px;color:var(--text-muted);"></span>
			</div>
			<div class="wf-body"></div>`);

		// every column sorts (click header) and filters (type in the row below it)
		const cols = [
			{ key: "order_bag", label: __("Card"), link: true },
			{ key: "design", label: __("Design") },
			{ key: "qty", label: __("Qty"), num: true },
			{ key: "other", label: isIn ? __("From") : __("To") },
			{ key: "time", label: __("When"), disp: (r) => (r.time ? frappe.datetime.str_to_user(r.time) : "") },
			{ key: "by", label: __("By") },
		];
		const F = { raw: [], filters: {}, sortKey: null, sortDir: 1 };
		const dispVal = (c, r) => (c.disp ? c.disp(r) : (r[c.key] != null ? String(r[c.key]) : ""));

		function computeRows() {
			let rows = F.raw.slice();
			cols.forEach((c) => {
				const q = (F.filters[c.key] || "").trim().toLowerCase();
				if (q) rows = rows.filter((r) => dispVal(c, r).toLowerCase().indexOf(q) !== -1);
			});
			if (F.sortKey) {
				const c = cols.find((x) => x.key === F.sortKey);
				rows.sort((a, b) => {
					let va, vb;
					if (c && c.num) { va = flt(a[c.key]); vb = flt(b[c.key]); }
					else { va = dispVal(c, a).toLowerCase(); vb = dispVal(c, b).toLowerCase(); }
					return (va < vb ? -1 : va > vb ? 1 : 0) * F.sortDir;
				});
			}
			return rows;
		}
		function rowHtml(r) {
			return `<tr>
				<td><a class="jw-card-link" style="font-weight:800;color:#1f618d;cursor:pointer;" data-card="${esc(r.order_bag)}">${esc(r.order_bag)}</a></td>
				<td>${esc(r.design || "")}</td><td>${r.qty != null ? r.qty : ""}</td>
				<td>${esc(r.other || "")}</td>
				<td>${r.time ? frappe.datetime.str_to_user(r.time) : ""}</td>
				<td>${esc(r.by || "")}</td>
			</tr>`;
		}
		function repaint() {
			const rows = computeRows();
			$(dlg.body).find(".wf-count").text(__("{0} of {1} card(s)", [rows.length, F.raw.length]));
			$(dlg.body).find(".wf-tbody").html(rows.length ? rows.map(rowHtml).join("")
				: `<tr><td colspan="${cols.length}" style="padding:18px;text-align:center;color:var(--text-muted);">${__("Nothing matches the filters.")}</td></tr>`);
			$(dlg.body).find(".wf-sort .wf-ar").text("");
			if (F.sortKey) $(dlg.body).find('.wf-sort[data-k="' + F.sortKey + '"] .wf-ar').text(F.sortDir > 0 ? " ▲" : " ▼");
		}
		function build() {
			if (!F.raw.length) {
				$(dlg.body).find(".wf-body").html(`<div style="padding:24px;text-align:center;color:var(--text-muted);">${__("No cards in this date range.")}</div>`);
				return;
			}
			$(dlg.body).find(".wf-body").html(`
				<table class="wk-t wf-tbl">
				<thead>
					<tr>${cols.map((c) => `<th class="wf-sort" data-k="${c.key}" title="${__("Sort")}" style="cursor:pointer;white-space:nowrap;user-select:none;">${esc(c.label)}<span class="wf-ar"></span></th>`).join("")}</tr>
					<tr>${cols.map((c) => `<th style="padding:3px 5px;"><input class="wf-f" data-k="${c.key}" placeholder="${__("filter")}" value="${esc(F.filters[c.key] || "")}" style="width:100%;box-sizing:border-box;height:24px;font-size:11px;font-weight:400;text-transform:none;letter-spacing:0;border:1px solid var(--border-color);border-radius:4px;padding:1px 6px;background:var(--fg-color);color:var(--text-color);"></th>`).join("")}</tr>
				</thead>
				<tbody class="wf-tbody"></tbody>
				</table>`);
			repaint();
		}

		function reload() {
			const from_date = $(dlg.body).find(".wf-from").val() || today;
			const to_date = $(dlg.body).find(".wf-to").val() || from_date;
			frappe.call({ method: API + ".get_bench_flow",
				args: { bench, direction: dir, from_date, to_date } })
				.then((r) => { F.raw = (r.message && r.message.rows) || []; build(); });
		}

		$(dlg.body).on("change", ".wf-from,.wf-to", reload);
		$(dlg.body).on("click", ".wf-today", function () {
			$(dlg.body).find(".wf-from,.wf-to").val(today);
			reload();
		});
		$(dlg.body).on("input", ".wf-f", function () {
			F.filters[this.dataset.k] = this.value || "";
			repaint();
		});
		$(dlg.body).on("click", ".wf-sort", function () {
			const k = this.getAttribute("data-k");
			if (F.sortKey === k) F.sortDir = -F.sortDir;
			else { F.sortKey = k; F.sortDir = 1; }
			repaint();
		});
		$(dlg.body).on("click", ".wf-clearf", function () {
			F.filters = {};
			$(dlg.body).find(".wf-f").val("");
			repaint();
		});
		reload();
		dlg.show();
	});

	// yellow rows: one click files the stone request — the card lands in the
	// Stone Issue queue (Stones Info) and the button becomes REQUESTED
	root.on("click", ".wk-streq", function () {
		const nm = $(this).data("name");
		frappe.call({ method: API + ".mark_stone_issue", args: { bags: JSON.stringify([nm]) } })
			.then(() => {
				frappe.show_alert({ message: __("{0} sent to the stone issue queue.", [nm]), indicator: "green" }, 4);
				load();
			});
	});

	root.on("click", ".wk-qr", function () {
		const $chip = $(this);
		const nm = $chip.data("name");
		const cur = D.queue.find((q) => q.name === nm);
		const reasons = D.queue_reasons || [];
		if (!reasons.length) {
			frappe.show_alert({ message: __("No In-Queue reasons configured for {0} — add them on Bench Setup.", [bench]), indicator: "orange" }, 5);
			return;
		}
		if ($chip.next().is("select.wk-qr-sel")) return; // already editing
		// system-stamped reasons (Awaiting Stone / Out of Stock) may not be in
		// the bench's configured list — keep the current value selectable
		const curVal = (cur && cur.queue_reason) || "";
		const opts = [""].concat(reasons);
		if (curVal && !opts.includes(curVal)) opts.splice(1, 0, curVal);
		const sel = $(`<select class="wk-qr-sel" style="border:1px solid #e0a800;border-radius:6px;height:24px;font-size:11px;background:var(--fg-color);color:var(--text-color);max-width:150px;">`
			+ opts.map((o) => `<option value="${esc(o)}" ${o === ((cur && cur.queue_reason) || "") ? "selected" : ""}>${o ? esc(o) : "— " + __("none") + " —"}</option>`).join("")
			+ `</select>`);
		$chip.hide().after(sel);
		sel.on("change", function () {
			frappe.call({ method: API + ".set_bench_queue_reason",
				args: { order_bag: nm, location: bench, reason: this.value || "" } }).then(load);
		});
		sel.on("blur", () => { sel.remove(); $chip.show(); });
		sel.trigger("focus");
	});

	// issue/assign a waiting card — same backend as the global pages, bench-pinned
	root.on("click", ".wk-issue", function () {
		const nm = $(this).data("name");
		const flds = [{ fieldname: "emp", fieldtype: "Link", label: __("Employee"), options: "Employee", reqd: 1,
			get_query: () => ({ query: "jewelima.jewelima.api.bench_employee_query", filters: { bench } }) }];
		if ((D.work_types || []).length) {
			flds.push({ fieldname: "wt", fieldtype: "Select", label: __("Type of work"),
				options: D.work_types.join("\n"), default: D.default_work_type || D.work_types[0], reqd: 1 });
		}
		frappe.prompt(flds, (v) => {
			frappe.call({ method: API + ".ws_issue_cards", args: {
				bench, names: JSON.stringify([nm]), employee: v.emp, work_type: v.wt || null,
			} }).then(() => {
				frappe.show_alert({ message: __("{0} issued.", [nm]), indicator: "green" }, 4);
				load();
			});
		}, __("{0} — issue {1}", [bench, nm]), D.flow === "weights" ? __("Issue") : __("Assign"));
	});

	// collect / receipt a working card — INLINE, same feel as the reason picker:
	// the button swaps into (weight g +) state select + a ✓ right in the row
	function doCollect(nm, emp, state, weight) {
		return frappe.call({ method: API + ".ws_collect_card", args: {
			bench, order_bag: nm, collection_state: state || null,
			weight_in: weight, employee: emp || null,
		} }).then((r) => {
			const m = (r.message || {});
			frappe.show_alert({ message: __("{0} collected{1}", [nm,
				m.total_loss ? " — " + __("loss {0} g", [m.total_loss]) : "."]), indicator: "green" }, 5);
			load();
		});
	}
	root.on("click", ".wk-collect", function () {
		const $btn = $(this);
		const nm = $btn.data("name");
		const emp = $btn.data("emp");
		const states = D.collection_states || [];
		const weights = D.flow === "weights";
		if (!weights && !states.length) {
			doCollect(nm, emp, "", null);   // nothing to ask — one click collects
			return;
		}
		if ($btn.next().is(".wk-col-inline")) return;
		const grp = $(`<span class="wk-col-inline" style="display:inline-flex;gap:5px;align-items:center;">
			${weights ? `<input type="number" step="0.001" class="ci-w" placeholder="${__("g back")}"
				style="width:82px;border:1px solid #2e7d32;border-radius:6px;height:24px;padding:1px 6px;font-size:11px;background:var(--fg-color);color:var(--text-color);">` : ""}
			${states.length ? `<select class="ci-s" style="border:1px solid var(--border-color);border-radius:6px;height:24px;font-size:11px;max-width:130px;background:var(--fg-color);color:var(--text-color);">
				${[""].concat(states).map((o) => `<option value="${esc(o)}">${o ? esc(o) : "— " + __("state") + " —"}</option>`).join("")}</select>` : ""}
			<button class="btn btn-xs ci-go" style="background:#2e7d32;border-color:#2e7d32;color:#fff;font-weight:700;">✓</button>
			<button class="btn btn-xs btn-default ci-x">✕</button>
		</span>`);
		$btn.hide().after(grp);
		const done = () => { grp.remove(); $btn.show(); };
		grp.find(".ci-x").on("click", done);
		const submit = () => {
			const w = grp.find(".ci-w").val();
			if (weights && (w === "" || w === undefined)) {
				frappe.show_alert({ message: __("Give the weight coming back (g)."), indicator: "orange" }, 3);
				grp.find(".ci-w").trigger("focus");
				return;
			}
			doCollect(nm, emp, grp.find(".ci-s").val() || "", weights ? w : null);
		};
		grp.find(".ci-go").on("click", submit);
		grp.on("keydown", "input, select", (e) => { if (e.key === "Enter") submit(); });
		grp.find(weights ? ".ci-w" : ".ci-s").trigger("focus");
	});

	// Bag Extraction: every card (single qty too) goes through Bag Split —
	// jump there with the card already scanned (barcode printing plugs in later)
	root.on("click", ".wk-extract", function () {
		frappe.route_options = { order_bag: $(this).data("name") };
		frappe.set_route("bag-split");
	});

	// Request Stones (WAX SETTING / SETTING): pick from the bench's cards or
	// scan, build the list below, one click marks them all -> Awaiting Stone
	if (WK_STONE_REQ.includes(bench)) {
		page.set_primary_action(__("Request Stones"), () => {
			const picked = [];
			const dlg = new frappe.ui.Dialog({
				title: __("Request stones — {0}", [bench]), size: "large",
				fields: [{ fieldtype: "HTML", fieldname: "b" }],
				primary_action_label: __("Request for 0 card(s)"),
				primary_action: () => {
					if (!picked.length) return;
					frappe.call({ method: API + ".mark_stone_issue", args: { bags: JSON.stringify(picked) } })
						.then((r) => {
							const m = r.message || {};
							dlg.hide();
							frappe.show_alert({ message: __("{0} card(s) now Awaiting Stone.", [(m.marked || []).length]), indicator: "green" }, 5);
							load();
						});
				},
			});
			const $b = dlg.get_field("b").$wrapper;
			const rebtn = () => dlg.get_primary_btn().text(__("Request for {0} card(s)", [picked.length]));
			function paintDlg(rows) {
				$b.html(`
					<div style="margin-bottom:8px;display:flex;gap:8px;align-items:center;">
						<input type="text" class="form-control rs-scan" style="max-width:220px;" placeholder="${__("scan card…")}">
						<span style="font-size:11.5px;color:var(--text-muted);">${__("or click rows below — already-requested cards are dimmed")}</span>
					</div>
					<div style="max-height:40vh;overflow:auto;border:1px solid var(--border-color);border-radius:7px;">
					<table class="wk-t"><thead><tr><th></th><th>${__("Card")}</th><th>${__("Design")}</th>
						<th>${__("Party")}</th><th>${__("Due")}</th></tr></thead><tbody>
					${rows.map((r) => `<tr class="rs-row" data-name="${esc(r.name)}"
							style="${r.stone_issue ? "opacity:.4;" : "cursor:pointer;"}">
						<td>${r.stone_issue ? "✓" : `<input type="checkbox" class="rs-cb" data-name="${esc(r.name)}">`}</td>
						<td><b>${esc(r.name)}</b></td><td>${esc(r.design || "")}</td>
						<td>${esc(r.party || "")}</td>
						<td>${r.due ? frappe.datetime.str_to_user(r.due) : ""}</td>
					</tr>`).join("")}</tbody></table></div>
					<div class="rs-picked" style="margin-top:10px;font-size:12.5px;"></div>`);
				const paintPicked = () => {
					$b.find(".rs-picked").html(picked.length
						? __("Requesting:") + " " + picked.map((p) => `<b>${esc(p)}</b>`).join(", ")
						: `<span style="color:var(--text-muted);">${__("Nothing picked yet.")}</span>`);
					rebtn();
				};
				$b.on("change", ".rs-cb", function () {
					const nm = $(this).data("name");
					if (this.checked) { if (!picked.includes(nm)) picked.push(nm); }
					else picked.splice(picked.indexOf(nm), 1);
					paintPicked();
				});
				$b.on("keydown", ".rs-scan", function (e) {
					if (e.key !== "Enter") return;
					const code = this.value.trim();
					this.value = "";
					if (!code) return;
					const row = rows.find((r) => r.name === code);
					if (!row) {
						frappe.show_alert({ message: __("{0} is not at {1}.", [code, bench]), indicator: "red" }, 4);
					} else if (row.stone_issue) {
						frappe.show_alert({ message: __("{0} already requested.", [code]), indicator: "orange" }, 3);
					} else if (!picked.includes(code)) {
						picked.push(code);
						$b.find(`.rs-cb[data-name="${CSS.escape(code)}"]`).prop("checked", true);
						paintPicked();
					}
				});
				paintPicked();
			}
			frappe.call({ method: API + ".get_ws_stone_candidates", args: { bench } })
				.then((r) => paintDlg((r.message || {}).rows || []));
			dlg.show();
		});
	}

	// ---- bulk reason: scan several waiting cards, stamp ONE reason on all
	const BK = { cards: [] };
	function paintBulk() {
		root.find(".wk-bulk-chips").html(BK.cards.length
			? BK.cards.map((c) => `<span style="border:1px solid var(--border-color);border-radius:12px;padding:2px 10px;font-size:12px;">
				<b>${esc(c)}</b> <span class="wk-bulk-rm" data-name="${esc(c)}" style="cursor:pointer;color:var(--text-muted);">✕</span></span>`).join("")
			: `<span style="font-size:12px;color:var(--text-muted);">${__("Scan waiting cards — the picked reason lands on all of them.")}</span>`);
		root.find(".wk-bulk-go").text(BK.cards.length ? __("Apply to {0}", [BK.cards.length]) : __("Apply"));
	}
	page.add_inner_button(__("Bulk Reason"), () => {
		const reasons = (D && D.queue_reasons) || [];
		if (!reasons.length) {
			frappe.show_alert({ message: __("No In-Queue reasons configured for {0} — add them on Bench Setup.", [bench]), indicator: "orange" }, 5);
			return;
		}
		root.find(".wk-bulk-sel").html([""].concat(reasons).map((o) =>
			`<option value="${esc(o)}">${o ? esc(o) : "— " + __("clear reason") + " —"}</option>`).join(""));
		BK.cards = [];
		paintBulk();
		root.find(".wk-bulk").slideDown(120);
		root.find(".wk-bulk-scan").trigger("focus");
	});
	root.find(".wk-bulk-x").on("click", () => root.find(".wk-bulk").slideUp(120));
	root.on("click", ".wk-bulk-rm", function () {
		BK.cards = BK.cards.filter((c) => c !== $(this).data("name"));
		paintBulk();
	});
	root.find(".wk-bulk-scan").on("keydown", function (e) {
		if (e.key !== "Enter") return;
		const code = this.value.trim();
		this.value = "";
		if (!code) return;
		if (BK.cards.includes(code)) {
			frappe.show_alert({ message: __("{0} already scanned.", [code]), indicator: "orange" }, 3);
			return;
		}
		if (!(D.queue || []).some((q) => q.name === code)) {
			frappe.show_alert({ message: __("{0} is not WAITING at {1}.", [code, bench]), indicator: "red" }, 4);
			return;
		}
		BK.cards.push(code);
		paintBulk();
	});
	root.find(".wk-bulk-go").on("click", () => {
		if (!BK.cards.length) return;
		const reason = root.find(".wk-bulk-sel").val() || "";
		frappe.dom.freeze(__("Stamping..."));
		Promise.all(BK.cards.map((nm) => frappe.call({ method: API + ".set_bench_queue_reason",
			args: { order_bag: nm, location: bench, reason } })))
			.then(() => {
				frappe.dom.unfreeze();
				frappe.show_alert({ message: reason
					? __("{0} card(s) → {1}.", [BK.cards.length, reason])
					: __("Reason cleared on {0} card(s).", [BK.cards.length]), indicator: "green" }, 5);
				BK.cards = [];
				root.find(".wk-bulk").slideUp(120);
				load();
			}).catch(() => frappe.dom.unfreeze());
	});

	// Coming back to a bench must show the bench as it is NOW. The poll below
	// keeps it live while you watch, but on its own it leaves you looking at a
	// board up to half a minute old the moment you navigate back.
	//
	// A ws- page IS one bench, so hooking the route's on_page_show reloads it on
	// every return, first show included — no load() here, or entering would fetch
	// twice. The workstations floor is different: it swaps between its tiles and a
	// bench inside ONE page, so it owns that hook already. Taking it there would
	// replace showTiles with this bench's load, and the floor would never come
	// back. That page passes ownRefresh and drives the reloading itself.
	if (opts && opts.ownRefresh) {
		load();                        // the host decides when to build; build means load
	} else {
		const route = (frappe.get_route() || [])[0];
		if (route && frappe.pages[route]) frappe.pages[route].on_page_show = load;
		else load();                   // no route to hook — load the once
	}

	// One poll per wrapper. The floor rebuilds into the same wrapper each time a
	// bench is opened, and that wrapper is not removed in between, so without
	// clearing the old timer every visit would leave another poll running.
	clearInterval($(wrapper).data("jw-ws-poll"));
	const t = setInterval(() => { if ($(wrapper).is(":visible")) load(); }, 30000);
	$(wrapper).data("jw-ws-poll", t);
	$(wrapper).on("remove", () => clearInterval(t));
};
