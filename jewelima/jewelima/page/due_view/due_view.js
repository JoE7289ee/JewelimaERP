// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Due View — the READ-ONLY Due Soon: every bench's cards due within N days
// (or overdue, red), same data as the managers' Due Soon page but with NO
// prioritise actions. Click a card -> Card Info; click its design ->
// Design Info. Built for the lookup roles (Jewelima Info + Ordering).
// Route: /app/due-view

frappe.pages["due-view"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Due View", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	let D = null;

	$(page.main).append(`
		<style>
		.dv-top{display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap;}
		.dv-top input{width:70px;border:1px solid var(--border-color);border-radius:6px;height:30px;padding:2px 8px;background:var(--fg-color);color:var(--text-color);}
		.dv-note{font-size:12px;color:var(--text-muted);}
		.dv-total{margin-left:auto;font-size:13px;font-weight:700;}
		.dv-bench{border:1px solid var(--border-color);border-radius:9px;background:var(--fg-color);margin-bottom:14px;overflow:hidden;}
		.dv-bench .h{background:var(--control-bg);padding:8px 14px;display:flex;align-items:center;gap:10px;}
		.dv-bench .h b{font-size:13px;letter-spacing:.03em;}
		.dv-bench .h .n{color:var(--text-muted);font-size:12px;}
		table.dv-t{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.dv-t th{background:var(--control-bg);font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);padding:4px 10px;border-top:1px solid var(--border-color);border-bottom:1px solid var(--border-color);text-align:left;}
		table.dv-t td{border-bottom:1px solid var(--border-color);padding:5px 10px;}
		table.dv-t tr:last-child td{border-bottom:0;}
		.dv-link{cursor:pointer;font-weight:700;}
		.dv-link:hover{text-decoration:underline;color:#1f618d;}
		.dv-days{border-radius:9px;padding:1px 9px;font-size:11px;font-weight:800;color:#fff;}
		.dv-days.over{background:#b02a2a;}
		.dv-days.soon{background:#e0a800;color:#3a2c00;}
		.dv-none{padding:36px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:9px;}
		.dv-stones{display:inline-flex;gap:3px;flex-wrap:wrap;max-width:230px;}
		.dv-stone{border-radius:8px;padding:1px 7px;font-size:10px;font-weight:800;white-space:nowrap;letter-spacing:.02em;}
		.dv-stone.on{background:#dcefe0;color:#1d7a33;}
		.dv-stone.wait{background:var(--control-bg,#eef2f7);color:#8a94a0;border:1px dashed var(--gray-400,#c4ccd6);padding:0 6px;}
		.dv-nostone{color:var(--text-muted);}
		</style>
		<div class="dv-top">
			<label style="margin:0;font-size:12.5px;">${__("Due within")}
				<input type="number" min="0" class="dv-days-in" value="5"> ${__("day(s)")}</label>
			<span class="dv-note">${__("view only — click a card for its Card Info, a design for its Design Info")}</span>
			<span class="dv-total"></span>
		</div>
		<div class="dv-body"></div>
	`);
	const root = $(page.main);

	function chip(d) {
		if (d === null || d === undefined) return "";
		if (d < 0) return `<span class="dv-days over">${__("{0}d OVER", [-d])}</span>`;
		return `<span class="dv-days soon">${d}${__("d left")}</span>`;
	}

	function stonesCell(r) {
		if (!r.stones || !r.stones.length) return `<span class="dv-nostone">—</span>`;
		return `<span class="dv-stones">` + r.stones.map((s) => {
			const wt = s.added ? s.aw : s.pw;
			const shown = wt ? wt.toFixed(2) : (s.added ? s.an : s.pn) + "p";
			const title = `${s.k} — ${__("plan")} ${s.pn || 0}pc / ${s.pw}ct` +
				(s.added ? ` · ${__("added")} ${s.an || 0}pc / ${s.aw}ct` : ` · ${__("not weighed yet")}`);
			return `<span class="dv-stone ${s.added ? "on" : "wait"}" title="${esc(title)}">${s.k} ${shown}</span>`;
		}).join("") + `</span>`;
	}

	function paint() {
		root.find(".dv-total").text(__("{0} card(s) at risk", [D.total]));
		root.find(".dv-body").html(D.total ? D.benches.map((b) => `
			<div class="dv-bench">
				<div class="h"><b>${esc(b.bench)}</b><span class="n">${b.rows.length} ${__("card(s)")}</span></div>
				<table class="dv-t"><thead><tr>
					<th>${__("Card")}</th><th>${__("Design")}</th><th>${__("Qty")}</th><th>${__("Party")}</th>
					<th>${__("Order Type")}</th><th>${__("Gold g")}</th><th>${__("Stones")}</th><th>${__("Due")}</th><th>${__("Days")}</th>
				</tr></thead><tbody>
				${b.rows.map((r) => `<tr>
					<td><span class="dv-link dv-card" data-card="${esc(r.name)}" title="${__("open Card Info")}">${esc(r.name)}</span></td>
					<td>${r.design ? `<span class="dv-link dv-design" data-design="${esc(r.design)}" title="${__("open Design Info")}">${esc(r.design)}</span>` : ""}</td>
					<td>${r.qty || ""}</td>
					<td>${esc(r.party || "")}</td><td>${esc(r.order_type || "")}</td>
					<td style="${(r.gold_g || 0) <= 0.0005 ? "color:#b02a2a;font-weight:700;" : ""}">${(r.gold_g || 0).toFixed(3)}</td>
					<td>${stonesCell(r)}</td>
					<td>${r.due ? frappe.datetime.str_to_user(r.due) : ""}</td>
					<td>${chip(r.days_left)}</td>
				</tr>`).join("")}</tbody></table>
			</div>`).join("")
			: `<div class="dv-none">${__("Nothing due within the window.")}</div>`);
	}

	function load() {
		frappe.call({ method: API + ".get_due_soon", args: { days: root.find(".dv-days-in").val() || 5 } })
			.then((r) => { D = r.message; if (D) paint(); });
	}
	root.find(".dv-days-in").on("change", load);

	root.on("click", ".dv-card", function () {
		frappe.route_options = { card: $(this).data("card") };
		frappe.set_route("card-info");
	});
	root.on("click", ".dv-design", function () {
		frappe.route_options = { design: $(this).data("design") };
		frappe.set_route("design-info");
	});

	load();
};
