// jewelima.buildWorkstation — the bench WORKSTATION page: the small live
// picture a worker glances at (the board page stays the deep filter/export
// view). Three parts: NEXT UP + the waiting queue in priority order (with
// one-click "why is it waiting" reasons), and WHO'S WORKING on what (type
// of work, since when). Auto-refreshes every 30s.

frappe.provide("jewelima");

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
		</style>
		<div class="wk-loc"><span class="tag">${__("Workstation")}</span>${esc(bench)}</div>
		<div class="wk-kpis"></div>
		<div class="wk-cols">
			<div class="wk-q"><div class="wk-sec">${__("Waiting — priority order")}</div>
				<div class="wk-next" style="display:none;"></div><div class="wk-qbody"></div></div>
			<div class="wk-w"><div class="wk-sec">${__("Working now")}</div><div class="wk-wbody"></div></div>
		</div>
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
				<th>${__("Party")}</th><th>${__("Due")}</th><th>${__("Why waiting")}</th>
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
			</div>`).join("")}</div>`).join("")
			: `<div class="wk-none">${__("Nobody holds a card here right now.")}</div>`);
	}

	function load() {
		frappe.call({ method: API + ".get_bench_workstation", args: { bench }, freeze: false }).then((r) => {
			D = r.message;
			if (D) paint();
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

	load();
	const t = setInterval(() => { if ($(wrapper).is(":visible")) load(); }, 30000);
	$(wrapper).on("remove", () => clearInterval(t));
};
