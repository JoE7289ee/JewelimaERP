// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Setup > Masters > Delivery Masters — Certifications with code + full name + usage; add
// inline; click a row to drill into what uses it. Route: /app/delivery-masters

frappe.pages["delivery-masters"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Delivery Masters", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	let rows = [];

	$(page.main).append(`
		<style>
		.pm-grid{display:grid;grid-template-columns:1fr;gap:18px;}
		.pm-card{border:1px solid var(--border-color);border-radius:8px;background:var(--fg-color);overflow:hidden;}
		.pm-card .h{background:var(--control-bg);padding:9px 14px;display:flex;justify-content:space-between;align-items:baseline;}
		.pm-card .h .t{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;}
		.pm-card .h .s{font-size:11px;color:var(--text-muted);}
		table.pm-tbl{width:100%;border-collapse:collapse;font-size:13px;}
		table.pm-tbl td{padding:6px 14px;border-top:1px solid var(--border-color);cursor:pointer;}
		table.pm-tbl tr:hover td{background:var(--control-bg);}
		table.pm-tbl .c{font-weight:800;width:90px;letter-spacing:.03em;}
		table.pm-tbl .u{text-align:right;color:var(--text-muted);white-space:nowrap;width:120px;}
		.pm-addrow{display:flex;gap:8px;padding:10px 14px;border-top:1px solid var(--border-color);background:var(--control-bg);}
		.pm-addrow input{border:1px solid var(--border-color);border-radius:6px;padding:5px 10px;background:var(--fg-color);}
		.pm-addrow .code{width:90px;text-transform:uppercase;}
		.pm-addrow .label{flex:1;}
		.pm-cust{display:none;border-top:2px solid var(--border-color);}
		.pm-cust .ch{padding:8px 14px;font-size:11.5px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;display:flex;justify-content:space-between;}
		.pm-cust .ch .x{cursor:pointer;color:#b02a2a;}
		.pm-cust .cb{max-height:300px;overflow:auto;}
		.pm-cust table{width:100%;border-collapse:collapse;font-size:12px;}
		.pm-cust td{padding:4px 14px;border-top:1px solid var(--border-color);}
		.pm-cust .empty{padding:12px 14px;color:var(--text-muted);font-size:12px;}
		</style>
		<div class="pm-grid"><div class="pm-card">
			<div class="h"><span class="t">${__("Certifications")}</span><span class="s">${__("labs; code leads the batch series (IGI-0001) — click for centers; more delivery masters land here later")}</span></div>
			<table class="pm-tbl"><tbody class="pm-body"></tbody></table>
			<div class="pm-addrow">
				<input class="code" placeholder="${__("CODE")}"><input class="label" placeholder="${__("full name + Enter")}">
				<button class="btn btn-sm btn-default pm-add">${__("Add")}</button>
			</div>
			<div class="pm-cust"><div class="ch"><span class="pm-cust-t"></span><span class="x">&times;</span></div><div class="cb"></div></div>
		</div></div>
	`);
	const root = $(page.main);

	function load() {
		frappe.call({ method: API + ".get_party_masters" }).then((r) => {
			rows = ((r.message || {})["cert"]) || [];
			root.find(".pm-body").html(rows.map((x) => `
				<tr data-code="${esc(x.code)}"><td class="c">${esc(x.code)}</td>
				<td>${esc(x.label || "")}</td>
				<td class="u">${x.customers ? __("{0} center(s)", [x.customers]) : __("unused")}</td></tr>`).join("")
				|| `<tr><td style="color:var(--text-muted);">${__("Nothing yet.")}</td></tr>`);
		});
	}
	root.on("click", ".pm-add", add);
	root.on("keydown", ".pm-addrow input", (e) => { if (e.key === "Enter") add(); });
	function add() {
		const code = (root.find(".pm-addrow .code").val() || "").trim().toUpperCase();
		const label = (root.find(".pm-addrow .label").val() || "").trim();
		if (!code || !label) return frappe.show_alert({ message: __("Enter both the code and the full name."), indicator: "orange" }, 3);
		frappe.call({ method: API + ".add_party_master", args: { kind: "cert", code, label } }).then(() => {
			root.find(".pm-addrow input").val("");
			frappe.show_alert({ message: __("{0} added.", [code]), indicator: "green" }, 3);
			load();
		});
	}
	root.on("click", "table.pm-tbl tr[data-code]", function () {
		const code = $(this).data("code");
		frappe.call({ method: "frappe.client.get_list", args: { doctype: "Certification Center",
			filters: { certification_type: code }, fields: ["name", "center_name", "location", "email"],
			order_by: "center_name", limit_page_length: 50 } }).then((r) => {
			const list = r.message || [];
			root.find(".pm-cust-t").text(__("{0} — {1} center(s)", [code, list.length]));
			root.find(".cb").html(list.length ? `<table><tbody>${list.map((c) => `
				<tr><td><a href="/app/certification-center/${encodeURIComponent(c.name)}"><b>${esc(c.center_name)}</b></a></td>
				<td>${esc((c.location || "").split(",")[0])}</td><td>${esc(c.email || "")}</td></tr>`).join("")}</tbody></table>`
				: `<div class="empty">${__("No centers yet — add them in the Certification Center doctype.")}</div>`);
			root.find(".pm-cust").show();
		});
	});
	root.on("click", ".pm-cust .x", function () { $(this).closest(".pm-cust").hide(); });

	load();
};
