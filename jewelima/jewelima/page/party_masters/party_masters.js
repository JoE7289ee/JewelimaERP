// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Setup > Masters — the four party masters (Group / Zone / State / Special) in
// one place: every value with its CODE, full name and customer count; add new
// values inline; click a row to see exactly which customers carry it.
// Route: /app/party-masters

frappe.pages["party-masters"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Masters", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const KINDS = [
		{ kind: "group", title: __("Groups (Companies)"), hint: __("code up to 6 — UNIQUE, one per company") },
		{ kind: "zone", title: __("Zones (Localities)"), hint: __("up to 3 — may repeat across areas") },
		{ kind: "district", title: __("Districts"), hint: __("up to 6 — may repeat") },
		{ kind: "state", title: __("States"), hint: __("up to 3 — may repeat") },
		{ kind: "special", title: __("Specials"), hint: __("optional tag at the end (PTY)") },
	];
	let DATA = {};
	let open = null;   // {kind, code}

	$(page.main).append(`
		<style>
		.pm-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:start;}
		@media (max-width: 1100px){.pm-grid{grid-template-columns:1fr;}}
		.pm-card{border:1px solid var(--border-color);border-radius:11px;background:var(--fg-color);overflow:hidden;}
		.pm-card .h{background:var(--control-bg);padding:9px 14px;display:flex;justify-content:space-between;align-items:baseline;}
		.pm-card .h .t{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;}
		.pm-card .h .s{font-size:11px;color:var(--text-muted);}
		table.pm-tbl{width:100%;border-collapse:collapse;font-size:13px;}
		table.pm-tbl td{padding:6px 14px;border-top:1px solid var(--border-color);cursor:pointer;}
		table.pm-tbl tr:hover td{background:var(--control-bg);}
		table.pm-tbl tr.on td{background:var(--control-bg);}
		table.pm-tbl .c{font-weight:800;width:90px;letter-spacing:.03em;}
		table.pm-tbl .n{color:var(--text-color);}
		table.pm-tbl .u{text-align:right;color:var(--text-muted);white-space:nowrap;width:110px;}
		.pm-addrow{display:flex;gap:8px;padding:10px 14px;border-top:1px solid var(--border-color);background:var(--control-bg);}
		.pm-addrow input{border:1px solid var(--border-color);border-radius:6px;padding:5px 10px;background:var(--fg-color);}
		.pm-addrow .code{width:90px;text-transform:uppercase;}
		.pm-addrow .label{flex:1;}
		.pm-cust{display:none;border-top:2px solid var(--border-color);}
		.pm-cust .ch{padding:8px 14px;font-size:11.5px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;display:flex;justify-content:space-between;}
		.pm-cust .ch .x{cursor:pointer;color:#b02a2a;}
		.pm-cust .cb{max-height:260px;overflow:auto;}
		.pm-cust table{width:100%;border-collapse:collapse;font-size:12px;}
		.pm-cust td{padding:4px 14px;border-top:1px solid var(--border-color);}
		.pm-cust .empty{padding:12px 14px;color:var(--text-muted);font-size:12px;}
		</style>
		<div class="pm-grid"></div>
	`);
	const root = $(page.main);

	function load(keepOpen) {
		frappe.call({ method: API + ".get_party_masters" }).then((r) => {
			DATA = r.message || {};
			paint();
			if (keepOpen && open) drill(open.kind, open.code);
		});
	}

	function paint() {
		root.find(".pm-grid").html(KINDS.map((k) => {
			const rows = DATA[k.kind] || [];
			return `
			<div class="pm-card" data-kind="${k.kind}">
				<div class="h"><span class="t">${k.title}</span><span class="s">${k.hint}</span></div>
				<table class="pm-tbl"><tbody>
					${rows.map((r) => `
						<tr data-name="${esc(r.name)}" data-code="${esc(r.code)}" class="${open && open.kind === k.kind && open.name === r.name ? "on" : ""}">
							<td class="c">${esc(r.code)}</td>
							<td class="n">${esc(r.label || "")}</td>
							<td class="u">${r.customers ? __("{0} customer(s)", [r.customers]) : __("unused")}</td>
						</tr>`).join("") || `<tr><td class="n" style="color:var(--text-muted);">${__("Nothing yet.")}</td></tr>`}
				</tbody></table>
				<div class="pm-addrow">
					<input class="code" placeholder="${__("CODE")}"><input class="label" placeholder="${__("full name + Enter")}">
					<button class="btn btn-sm btn-default pm-add">${__("Add")}</button>
				</div>
				<div class="pm-cust"><div class="ch"><span class="pm-cust-t"></span><span class="x">&times;</span></div><div class="cb"></div></div>
			</div>`;
		}).join(""));
	}

	function add(card) {
		const kind = card.data("kind");
		const code = (card.find(".pm-addrow .code").val() || "").trim().toUpperCase();
		const label = (card.find(".pm-addrow .label").val() || "").trim();
		if (!code || !label) return frappe.show_alert({ message: __("Enter both the code and the full name."), indicator: "orange" }, 3);
		frappe.call({ method: API + ".add_party_master", args: { kind, code, label } }).then(() => {
			frappe.show_alert({ message: __("{0} added.", [code]), indicator: "green" }, 3);
			load(true);
		});
	}
	root.on("click", ".pm-add", function () { add($(this).closest(".pm-card")); });
	root.on("keydown", ".pm-addrow input", function (e) { if (e.key === "Enter") add($(this).closest(".pm-card")); });

	function drill(kind, name) {
		open = { kind, name };
		const card = root.find(`.pm-card[data-kind="${kind}"]`);
		root.find(".pm-cust").hide();
		root.find("table.pm-tbl tr").removeClass("on");
		card.find(`tr[data-name="${name}"]`).addClass("on");
		frappe.call({ method: API + ".get_master_customers", args: { kind, code: name } }).then((r) => {
			const rows = (r.message || {}).customers || [];
			card.find(".pm-cust-t").text(__("{0} — {1} customer(s)", [name, rows.length]));
			card.find(".cb").html(rows.length ? `<table><tbody>${rows.map((c) => `
				<tr><td><a href="/app/customer/${encodeURIComponent(c.name)}">${esc(c.name)}</a>${c.disabled ? ' <span style="color:var(--text-muted);">(off)</span>' : ""}</td>
				<td>${esc(c.name)}</td>
				<td>${esc(c.default_salesman || "")}</td></tr>`).join("")}</tbody></table>`
				: `<div class="empty">${__("No customers carry this yet.")}</div>`);
			card.find(".pm-cust").show();
		});
	}
	root.on("click", "table.pm-tbl tr[data-name]", function () {
		drill($(this).closest(".pm-card").data("kind"), $(this).data("name"));
	});
	root.on("click", ".pm-cust .x", function () {
		open = null;
		$(this).closest(".pm-cust").hide();
		root.find("table.pm-tbl tr").removeClass("on");
	});

	load();
};
