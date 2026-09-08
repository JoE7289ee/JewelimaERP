// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Scrub History (Records) — every gram of scrub ever booked, as a log.
//
// One row per handover: the card it came off, the bench it was collected at,
// who handed it over, and when. The Scrub desk shows totals; this is the record
// you read when one of those totals needs explaining — or when somebody asks
// which cards a bench's 4 g actually came from.
// Route: /app/scrub-history

frappe.pages["scrub-history"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Scrub History"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const root = $(page.main);
	const F = { bench: "", employee: "", order_bag: "" };
	let D = null;

	root.append(`
		<style>
		#page-scrub-history .container{max-width:100%;}
		.sh-bar{display:flex;gap:11px;flex-wrap:wrap;align-items:flex-end;margin-bottom:14px;
			border:1px solid var(--border-color);border-radius:13px;padding:12px 15px;
			background:var(--fg-color);}
		.sh-f label{display:block;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;
			color:var(--text-muted);margin-bottom:3px;}
		.sh-f select,.sh-f input{border:1px solid var(--border-color);border-radius:8px;height:33px;
			padding:2px 10px;font-size:13px;background:var(--control-bg);color:var(--text-color);
			min-width:170px;}
		.sh-sum{margin-left:auto;text-align:right;}
		.sh-sum .v{font-size:23px;font-weight:800;font-variant-numeric:tabular-nums;color:#8C6A00;}
		[data-theme="dark"] .sh-sum .v{color:#B98D10;}
		.sh-sum .k{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);}
		.sh-tw{overflow-x:auto;}
		table.sh-t{width:100%;border-collapse:collapse;font-size:12.5px;background:var(--fg-color);
			border:1px solid var(--border-color);border-radius:11px;overflow:hidden;
			font-variant-numeric:tabular-nums;}
		table.sh-t th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em;
			color:var(--text-muted);padding:8px 11px;background:var(--control-bg);
			border-bottom:1px solid var(--border-color);white-space:nowrap;}
		table.sh-t td{padding:7px 11px;border-bottom:1px solid var(--border-color);}
		table.sh-t td.num{text-align:right;}
		.wt{font-weight:700;color:#8C6A00;}
		[data-theme="dark"] .wt{color:#B98D10;}
		.sh-empty{padding:26px;text-align:center;color:var(--text-muted);font-size:13px;
			border:1px dashed var(--border-color);border-radius:12px;}
		</style>
		<div class="sh-bar">
			<div class="sh-f"><label>${__("Bench")}</label><select class="sh-bench"></select></div>
			<div class="sh-f"><label>${__("Who handed it in")}</label><select class="sh-emp"></select></div>
			<div class="sh-f"><label>${__("Card")}</label>
				<input type="text" class="sh-card" placeholder="${__("card no. — E optional")}"></div>
			<div class="sh-sum"><div class="k">${__("Shown")}</div><div class="v"></div></div>
		</div>
		<div class="sh-body"></div>
	`);

	function paint() {
		if (!D) return;
		const opts = (list, cur) => `<option value="">${__("all")}</option>`
			+ list.map((x) => `<option ${x === cur ? "selected" : ""}>${esc(x)}</option>`).join("");
		// the pickers list what is IN the log, so a filter can never come back empty
		root.find(".sh-bench").html(opts(D.benches || [], F.bench));
		root.find(".sh-emp").html(opts(D.people || [], F.employee));
		root.find(".sh-sum .v").text(flt(D.total).toFixed(3) + " g");

		root.find(".sh-body").html((D.rows || []).length ? `
			<div class="sh-tw"><table class="sh-t"><thead><tr>
				<th>${__("When")}</th><th>${__("Card")}</th><th>${__("Design")}</th>
				<th class="num">${__("Scrub")}</th><th>${__("Item")}</th>
				<th>${__("Bench")}</th><th>${__("Who handed it in")}</th><th>${__("Held by")}</th>
			</tr></thead><tbody>${D.rows.map((r) => `<tr>
				<td>${esc((r.datetime || "").slice(0, 16))}</td>
				<td><b>${esc(r.order_bag)}</b></td>
				<td>${esc(r.design_no || r.design || "")}</td>
				<td class="num wt">${flt(r.qty).toFixed(3)} g</td>
				<td>${esc(r.item)}</td>
				<td>${esc(r.bench || "")}</td>
				<td>${esc(r.employee_label || "")}</td>
				<td>${esc(r.held_by || "")}</td>
			</tr>`).join("")}</tbody></table></div>`
			: `<div class="sh-empty">${__("No scrub booked for this filter.")}</div>`);
	}

	function load() {
		return frappe.call({ method: API + ".get_scrub_history", freeze: false,
			args: { bench: F.bench, employee: F.employee, order_bag: F.order_bag, limit: 300 } })
			.then((r) => { D = r.message; paint(); });
	}

	// the employee filter goes to the server by NAME, which is what the log stores
	root.on("change", ".sh-bench", function () { F.bench = this.value; load(); });
	root.on("change", ".sh-emp", function () { F.employee = this.value; load(); });
	root.on("change", ".sh-card", function () { F.order_bag = this.value.trim(); load(); });

	page.set_secondary_action(__("Scrub desk"), () => frappe.set_route("scrub"));
	page.set_primary_action(__("Refresh"), load, "refresh");
	frappe.pages["scrub-history"].on_page_show = load;
	load();
};
