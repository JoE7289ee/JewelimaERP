// jewelima.buildWorkstation — the bench WORKSTATION page: the small live
// picture a worker glances at (the board page stays the deep filter/export
// view). Three parts: NEXT UP + the waiting queue in priority order (with
// one-click "why is it waiting" reasons), and WHO'S WORKING on what (type
// of work, since when). Auto-refreshes every 30s.

frappe.provide("jewelima");

const WK_NO_ISSUE = ["CAM"];              // info-only queues
const WK_EXTRACT = ["BAG EXTRACTION"];    // no assign — straight to Bag Split

jewelima.buildWorkstation = function (wrapper, bench) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Workstation — {0}", [bench]), single_column: true });
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
		.wk-emp{border:1px solid var(--border-color);border-radius:9px;background:var(--fg-color);margin-bottom:10px;overflow:hidden;}
		.wk-emp .h{background:var(--control-bg);padding:7px 12px;font-weight:700;font-size:13px;display:flex;justify-content:space-between;}
		.wk-emp .h .n{color:var(--text-muted);font-weight:600;font-size:12px;}
		.wk-emp .c{padding:6px 12px;border-top:1px solid var(--border-color);display:flex;gap:10px;align-items:center;font-size:12.5px;flex-wrap:wrap;}
		.wk-emp .c b{min-width:110px;}
		.wk-wt{border-radius:9px;padding:1px 8px;font-size:11px;font-weight:700;background:var(--control-bg);}
		.wk-since{color:var(--text-muted);font-size:11px;margin-left:auto;}
		.wk-none{padding:22px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:9px;}
		.wk-dt{border:1px solid var(--border-color);border-radius:9px;padding:4px 12px;background:var(--control-bg);text-align:center;}
		.wk-dt .k{font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;}
		.wk-dt .v{font-size:14px;font-weight:800;}
		.wk-day{margin-top:16px;}
		table.wk-dw{width:100%;border-collapse:collapse;font-size:12px;background:var(--fg-color);}
		table.wk-dw th{background:var(--control-bg);font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);padding:4px 9px;border:1px solid var(--border-color);text-align:left;}
		table.wk-dw td{border:1px solid var(--border-color);padding:4px 9px;}
		table.wk-dw tr.emp td{background:var(--control-bg);font-weight:700;}
		</style>
		<div class="wk-loc"><span class="tag">${__("Workstation")}</span>${esc(bench)}
			<span style="margin-left:auto;display:flex;align-items:center;gap:8px;">
				<input type="date" class="wk-date" style="border:1px solid var(--border-color);border-radius:6px;padding:3px 8px;background:var(--control-bg);color:var(--text-color);font-size:12px;">
				<span class="wk-day-tiles" style="display:flex;gap:8px;"></span>
			</span></div>
		<div class="wk-kpis"></div>
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
		root.find(".wk-kpis").html(
			`<div class="wk-tile"><div class="k">${__("Waiting")}</div><div class="v">${c.waiting}</div></div>
			<div class="wk-tile"><div class="k">${__("Working")}</div><div class="v">${c.working}</div></div>
			<div class="wk-tile"><div class="k">${__("Total at bench")}</div><div class="v">${c.total}</div></div>`);

		const next = D.queue[0];
		root.find(".wk-next").css("display", next ? "flex" : "none").html(next ? `
			<span class="k">${__("Next up")}</span><span class="v">${esc(next.name)}</span>
			<span class="sub">${esc(next.design || "")}${next.due ? " · " + __("due") + " " + frappe.datetime.str_to_user(next.due) : ""}${next.prio_manual ? " · " + __("MANUAL PRIORITY") : ""}</span>` : "");

		root.find(".wk-qbody").html(D.queue.length ? `
			<table class="wk-t"><thead><tr>
				${D.ranked ? `<th style="width:40px">P#</th>` : ""}<th>${__("Card")}</th><th>${__("Design")}</th>
				<th>${__("Party")}</th><th>${__("Due")}</th><th>${__("Why waiting")}</th>${D.can_act && !WK_NO_ISSUE.includes(bench) ? `<th style="width:70px"></th>` : ""}
			</tr></thead><tbody>
			${D.queue.map((r) => `<tr>
				${D.ranked ? `<td><span class="wk-pr ${r.prio_manual ? "man" : ""}">${r.prio_rank || ""}</span></td>` : ""}
				<td><b>${esc(r.name)}</b>${r.status === "On Hold" ? " · " + __("On Hold") : ""}</td>
				<td>${esc(r.design || "")}</td>
				<td>${esc(r.party || "")}</td>
				<td>${r.due ? frappe.datetime.str_to_user(r.due) : ""}</td>
				<td>${r.queue_reason
					? `<span class="wk-qr" data-name="${esc(r.name)}">${esc(r.queue_reason)}</span>`
					: `<span class="wk-qr add" data-name="${esc(r.name)}">+ ${__("reason")}</span>`}</td>
				${D.can_act && WK_EXTRACT.includes(bench) ? `<td><button class="btn btn-xs wk-extract" data-name="${esc(r.name)}"
					style="background:#2e7d32;border-color:#2e7d32;color:#fff;">${__("Extract →")}</button></td>`
				: D.can_act && !WK_NO_ISSUE.includes(bench) ? `<td><button class="btn btn-xs wk-issue" data-name="${esc(r.name)}"
					style="background:#1f618d;border-color:#1f618d;color:#fff;">${D.flow === "weights" ? __("Issue") : __("Assign")}</button></td>` : ""}
			</tr>`).join("")}</tbody></table>`
			: `<div class="wk-none">${__("Nothing waiting — the bench is clear.")}</div>`);

		root.find(".wk-wbody").html(D.working.length ? D.working.map((g) => `
			<div class="wk-emp"><div class="h"><span>${esc(g.employee_name)}</span>
				<span class="n">${g.cards.length} ${__("card(s)")}</span></div>
			${g.cards.map((cd) => `<div class="c">
				<b>${esc(cd.name)}</b><span>${esc(cd.design || "")}</span>
				${cd.work_type ? `<span class="wk-wt">${esc(cd.work_type)}</span>` : ""}
				<span>${esc(cd.status)}</span>
				<span class="wk-since">${cd.since ? frappe.datetime.comment_when(cd.since) : ""}</span>
				${D.can_act ? `<button class="btn btn-xs btn-default wk-collect" data-name="${esc(cd.name)}" data-emp="${esc(g.employee)}">${D.flow === "weights" ? __("Receipt") : __("Collect")}</button>` : ""}
			</div>`).join("")}</div>`).join("")
			: `<div class="wk-none">${__("Nobody holds a card here right now.")}</div>`);
	}

	function load() {
		frappe.call({ method: API + ".get_bench_workstation", args: { bench }, freeze: false }).then((r) => {
			D = r.message;
			if (D) paint();
		});
		loadDay();
	}

	// ---- the DAY panel: transfers in/out + finished work by worker -------------
	function dayDate() {
		return root.find(".wk-date").val() || frappe.datetime.get_today();
	}
	function loadDay() {
		frappe.call({ method: API + ".get_bench_day", args: { bench, date: dayDate() }, freeze: false }).then((r) => {
			const d = r.message;
			if (!d) return;
			root.find(".wk-day-tiles").html(`
				<span class="wk-dt"><span class="k">${__("In today")}</span><span class="v">${d.in.count} · ${d.in.gold_g.toFixed(3)} g</span></span>
				<span class="wk-dt"><span class="k">${__("Out today")}</span><span class="v">${d.out.count} · ${d.out.gold_g.toFixed(3)} g</span></span>`);
			root.find(".wk-day-title").text(__("Work done on {0} — {1} card(s)", [frappe.datetime.str_to_user(d.date), d.done_count]));
			root.find(".wk-day-body").html(d.done.length ? `
				<table class="wk-dw"><thead><tr><th>${__("Card")}</th><th>${__("Work type")}</th><th>${__("State")}</th>
					<th>${__("Out g")}</th><th>${__("In g")}</th><th>${__("Loss g")}</th><th>${__("When")}</th></tr></thead><tbody>
				${d.done.map((g) => `
					<tr class="emp"><td colspan="5">${esc(g.employee_name)} — ${g.cards.length} ${__("card(s)")}</td>
						<td>${g.loss ? g.loss.toFixed(3) : ""}</td><td></td></tr>
					${g.cards.map((c) => `<tr>
						<td><b>${esc(c.order_bag)}</b></td>
						<td>${esc(c.work_type || "")}</td>
						<td>${esc(c.collection_state || "")}</td>
						<td>${c.weight_out ? c.weight_out.toFixed(3) : ""}</td>
						<td>${c.weight_in ? c.weight_in.toFixed(3) : ""}</td>
						<td>${c.loss ? c.loss.toFixed(3) : ""}</td>
						<td>${c.done_at ? frappe.datetime.str_to_user(c.done_at) : ""}</td>
					</tr>`).join("")}`).join("")}</tbody></table>`
				: `<div class="wk-none">${__("No finished work recorded this day.")}</div>`);
		});
	}

	// one-click "why is it waiting" — the bench's configured reasons
	root.on("click", ".wk-qr", function () {
		const nm = $(this).data("name");
		const reasons = D.queue_reasons || [];
		if (!reasons.length) {
			frappe.show_alert({ message: __("No In-Queue reasons configured for {0} — add them on Bench Setup.", [bench]), indicator: "orange" }, 5);
			return;
		}
		frappe.prompt([{ fieldname: "v", fieldtype: "Select", label: __("In Queue reason"),
			options: [""].concat(reasons).join("\n") }],
			(vals) => frappe.call({ method: API + ".set_bench_queue_reason",
				args: { order_bag: nm, location: bench, reason: vals.v || "" } }).then(load),
			__("Why is {0} waiting?", [nm]), __("Set"));
	});

	// issue/assign a waiting card — same backend as the global pages, bench-pinned
	root.on("click", ".wk-issue", function () {
		const nm = $(this).data("name");
		const flds = [{ fieldname: "emp", fieldtype: "Link", label: __("Employee"), options: "Employee", reqd: 1 }];
		if ((D.work_types || []).length) {
			flds.push({ fieldname: "wt", fieldtype: "Select", label: __("Type of work"),
				options: [""].concat(D.work_types).join("\n") });
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

	// collect / receipt a working card — weight benches book the metal back
	root.on("click", ".wk-collect", function () {
		const nm = $(this).data("name");
		const emp = $(this).data("emp");
		const flds = [];
		if (D.flow === "weights") {
			flds.push({ fieldname: "w", fieldtype: "Float", label: __("Weight coming back (g)"), reqd: 1 });
		}
		if ((D.collection_states || []).length) {
			flds.push({ fieldname: "cs", fieldtype: "Select", label: __("Collection state"),
				options: [""].concat(D.collection_states).join("\n") });
		}
		const go = (v) => frappe.call({ method: API + ".ws_collect_card", args: {
			bench, order_bag: nm, collection_state: (v && v.cs) || null,
			weight_in: v && v.w, employee: emp || null,
		} }).then((r) => {
			const m = (r.message || {});
			frappe.show_alert({ message: __("{0} collected{1}", [nm,
				m.total_loss ? " — " + __("loss {0} g", [m.total_loss]) : "."]), indicator: "green" }, 5);
			load();
		});
		flds.length ? frappe.prompt(flds, go, __("{0} — collect {1}", [bench, nm]),
			D.flow === "weights" ? __("Receipt") : __("Collect")) : go(null);
	});

	// Bag Extraction: every card (single qty too) goes through Bag Split —
	// jump there with the card already scanned (barcode printing plugs in later)
	root.on("click", ".wk-extract", function () {
		frappe.route_options = { order_bag: $(this).data("name") };
		frappe.set_route("bag-split");
	});

	root.find(".wk-date").val(frappe.datetime.get_today()).on("change", loadDay);

	load();
	const t = setInterval(() => { if ($(wrapper).is(":visible")) load(); }, 30000);
	$(wrapper).on("remove", () => clearInterval(t));
};
