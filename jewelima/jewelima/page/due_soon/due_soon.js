// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Due Soon — every bench as its own table of EVERYTHING due within N days
// (default 5, editable) or overdue (red) — cast or not; the Gold column
// shows who still carries nothing. One click prioritises a card or a
// bench. Route: /app/due-soon

frappe.pages["due-soon"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Due Soon", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	let D = null;

	$(page.main).append(`
		<style>
		.dr-top{display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap;}
		.dr-top input{width:70px;border:1px solid var(--border-color);border-radius:6px;height:30px;padding:2px 8px;background:var(--fg-color);color:var(--text-color);}
		.dr-note{font-size:12px;color:var(--text-muted);}
		.dr-total{margin-left:auto;font-size:13px;font-weight:700;}
		.dr-bench{border:1px solid var(--border-color);border-radius:9px;background:var(--fg-color);margin-bottom:14px;overflow:hidden;}
		.dr-bench .h{background:var(--control-bg);padding:8px 14px;display:flex;align-items:center;gap:10px;}
		.dr-bench .h b{font-size:13px;letter-spacing:.03em;}
		.dr-bench .h .n{color:var(--text-muted);font-size:12px;}
		table.dr-t{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.dr-t th{background:var(--control-bg);font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);padding:4px 10px;border-top:1px solid var(--border-color);border-bottom:1px solid var(--border-color);text-align:left;}
		table.dr-t td{border-bottom:1px solid var(--border-color);padding:5px 10px;}
		table.dr-t tr:last-child td{border-bottom:0;}
		.dr-days{border-radius:9px;padding:1px 9px;font-size:11px;font-weight:800;color:#fff;}
		.dr-days.over{background:#b02a2a;}
		.dr-days.soon{background:#e0a800;color:#3a2c00;}
		.dr-onp{border-radius:9px;padding:1px 8px;font-size:10.5px;font-weight:800;background:#d63031;color:#fff;}
		.dr-none{padding:36px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:9px;}
		</style>
		<div class="dr-top">
			<label style="margin:0;font-size:12.5px;">${__("Due within")}
				<input type="number" class="dr-days-in" value="5" min="0"> ${__("day(s)")}</label>
			<span class="dr-note">${__("every live card approaching its due date — overdue in red; Gold 0.000 = not cast yet")}</span>
			<span class="dr-total"></span>
		</div>
		<div class="dr-body"></div>
	`);
	const root = $(page.main);

	function chip(d) {
		if (d === null || d === undefined) return "";
		if (d < 0) return `<span class="dr-days over">${__("{0}d OVER", [-d])}</span>`;
		return `<span class="dr-days soon">${d}${__("d left")}</span>`;
	}

	function paint() {
		root.find(".dr-total").text(__("{0} card(s) at risk", [D.total]));
		root.find(".dr-body").html(D.total ? D.benches.map((b) => `
			<div class="dr-bench">
				<div class="h"><b>${esc(b.bench)}</b><span class="n">${b.rows.length} ${__("card(s)")}</span>
					<button class="btn btn-xs dr-pall" data-bench="${esc(b.bench)}"
						style="margin-left:auto;background:#d63031;border-color:#d63031;color:#fff;font-weight:700;">${__("Prioritise all")}</button></div>
				<table class="dr-t"><thead><tr>
					<th>${__("Card")}</th><th>${__("Design")}</th><th>${__("Qty")}</th><th>${__("Party")}</th>
					<th>${__("Order Type")}</th><th>${__("Gold g")}</th><th>${__("Due")}</th><th>${__("Days")}</th><th style="width:90px"></th>
				</tr></thead><tbody>
				${b.rows.map((r) => `<tr>
					<td><b>${esc(r.name)}</b></td>
					<td>${esc(r.design || "")}</td><td>${r.qty || ""}</td>
					<td>${esc(r.party || "")}</td><td>${esc(r.order_type || "")}</td>
					<td style="${(r.gold_g || 0) <= 0.0005 ? "color:#b02a2a;font-weight:700;" : ""}">${(r.gold_g || 0).toFixed(3)}</td>
					<td>${r.due ? frappe.datetime.str_to_user(r.due) : ""}</td>
					<td>${chip(r.days_left)}</td>
					<td>${r.on_priority ? `<span class="dr-onp">${__("ON LIST")}</span>`
						: `<button class="btn btn-xs btn-default dr-p1" data-name="${esc(r.name)}">${__("Prioritise")}</button>`}</td>
				</tr>`).join("")}</tbody></table>
			</div>`).join("")
			: `<div class="dr-none">${__("Nothing due within the window.")}</div>`);
	}

	function load() {
		frappe.call({ method: API + ".get_due_soon", args: { days: root.find(".dr-days-in").val() || 5 } })
			.then((r) => { D = r.message; if (D) paint(); });
	}
	root.find(".dr-days-in").on("change", load);

	function addToPriority(bags) {
		frappe.call({ method: API + ".priority_add_many", args: { bags: JSON.stringify(bags) } }).then((r) => {
			const m = r.message || {};
			frappe.show_alert({ message: __("{0} card(s) added to the Priority Queue (bottom — drag to order).", [(m.added || []).length]), indicator: "green" }, 5);
			load();
		});
	}
	root.on("click", ".dr-p1", function () { addToPriority([$(this).data("name")]); });
	root.on("click", ".dr-pall", function () {
		const bench = $(this).data("bench");
		const b = (D.benches || []).find((x) => x.bench === bench);
		addToPriority(b.rows.filter((r) => !r.on_priority).map((r) => r.name));
	});

	page.add_inner_button(__("Priority Queue"), () => frappe.set_route("prioritization"));
	load();
};
