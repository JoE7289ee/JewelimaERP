// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Types & Salesmen — manage the two Place Order dropdown masters in one screen:
//   left  = Order Type ("Type"), right = Sales Person ("Salesman").
// Add new values; RETIRE hides a value from the dropdowns without touching old orders.
// Retiring is blocked while active Order Bags use it (Cancelled / Sold bags don't count);
// a value that was never used is deleted outright. Restore brings a retired value back.
// Route: /app/order-masters

frappe.pages["order-masters"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Types & Salesmen", single_column: true });
	const API = "jewelima.jewelima.api";
	const PANELS = [
		{ kind: "type", title: "Order Types", placeholder: "NEW TYPE…" },
		{ kind: "salesman", title: "Salesmen", placeholder: "NEW SALESMAN…" },
	];
	let data = { type: [], salesman: [] };

	$(page.main).append(`
		<style>
		.om-wrap{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start;}
		@media (max-width: 900px){.om-wrap{grid-template-columns:1fr;}}
		.om-panel{border:1px solid var(--border-color);border-radius:10px;background:var(--fg-color);overflow:hidden;}
		.om-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--border-color);}
		.om-title{font-weight:700;font-size:14px;margin-right:auto;}
		.om-new{width:180px;border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);padding:3px 10px;height:28px;border-radius:5px;box-sizing:border-box;font-size:12.5px;text-transform:uppercase;color:var(--text-color);}
		table.om-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;}
		table.om-tbl th{color:var(--text-muted);font-size:11px;text-transform:uppercase;letter-spacing:.04em;text-align:left;padding:7px 14px;border-bottom:1px solid var(--border-color);}
		table.om-tbl td{padding:7px 14px;border-bottom:1px solid var(--border-color);vertical-align:middle;}
		table.om-tbl tr:last-child td{border-bottom:none;}
		.om-name{font-weight:600;}
		.om-name.retired{color:var(--text-muted);text-decoration:line-through;}
		.om-use{color:var(--text-muted);font-size:11.5px;white-space:nowrap;}
		.om-lock{color:var(--text-muted);font-size:12px;}
		.om-empty{padding:16px;text-align:center;color:var(--text-muted);}
		.om-hint{grid-column:1 / -1;color:var(--text-muted);font-size:12px;margin-top:2px;}
		</style>
		<div class="om-wrap">
			${PANELS.map((p) => `
			<div class="om-panel" data-kind="${p.kind}">
				<div class="om-head">
					<span class="om-title">${p.title}</span>
					<input class="om-new" placeholder="${p.placeholder}">
					<button class="btn btn-sm btn-default om-add">Add</button>
				</div>
				<table class="om-tbl">
					<thead><tr><th>Name</th><th>Usage</th><th style="width:90px"></th></tr></thead>
					<tbody class="om-body"></tbody>
				</table>
			</div>`).join("")}
			<div class="om-hint">These feed the <b>Place Order</b> Type and Salesman dropdowns. Retiring hides a value from new orders — existing orders keep it. A value with active Order Bags (anything not Cancelled / Sold) is locked until those bags close out.</div>
		</div>
	`);

	const esc = frappe.utils.escape_html;

	function renderPanel(kind) {
		const body = $(page.main).find(`.om-panel[data-kind="${kind}"] .om-body`)[0];
		const rows = data[kind] || [];
		if (!rows.length) { body.innerHTML = `<tr><td colspan="3" class="om-empty">Nothing yet — add one above.</td></tr>`; return; }
		body.innerHTML = rows.map((r, i) => {
			const usage = r.total_bags
				? `${r.active_bags} active / ${r.total_bags} bag(s)` : "unused";
			let action;
			if (r.retired) action = `<button class="btn btn-xs btn-default om-act" data-kind="${kind}" data-idx="${i}" data-restore="1">Restore</button>`;
			else if (r.active_bags) action = `<span class="om-lock" title="Active Order Bags use this — close them out (or cancel) first">🔒 in use</span>`;
			else action = `<button class="btn btn-xs btn-default om-act" data-kind="${kind}" data-idx="${i}" data-restore="0">Retire</button>`;
			return `<tr>
				<td><span class="om-name ${r.retired ? "retired" : ""}">${esc(r.name)}</span></td>
				<td><span class="om-use">${usage}${r.retired ? " · retired" : ""}</span></td>
				<td>${action}</td></tr>`;
		}).join("");
		body.querySelectorAll(".om-act").forEach((b) => {
			b.addEventListener("click", () => {
				const kind = b.getAttribute("data-kind"), r = data[kind][+b.getAttribute("data-idx")];
				const restore = +b.getAttribute("data-restore");
				const go = () => frappe.call({ method: API + ".retire_order_master", args: { kind, name: r.name, restore } })
					.then((res) => {
						const st = (res.message || {}).state;
						frappe.show_alert({ message: __("{0} {1}.", [esc(r.name), st]), indicator: restore ? "green" : "orange" }, 4);
						load();
					});
				if (restore) go();
				else frappe.confirm(__("Retire <b>{0}</b>? It disappears from new orders (old orders keep it){1}.", [esc(r.name), r.total_bags ? "" : " — never used, so it will be deleted"]), go);
			});
		});
	}

	function load() {
		frappe.call({ method: API + ".get_order_masters" }).then((r) => {
			data = r.message || { type: [], salesman: [] };
			PANELS.forEach((p) => renderPanel(p.kind));
		});
	}

	PANELS.forEach((p) => {
		const $panel = $(page.main).find(`.om-panel[data-kind="${p.kind}"]`);
		const add = () => {
			const v = ($panel.find(".om-new").val() || "").trim();
			if (!v) return;
			frappe.call({ method: API + ".add_order_master", args: { kind: p.kind, name: v } })
				.then(() => { $panel.find(".om-new").val(""); load(); });
		};
		$panel.find(".om-add").on("click", add);
		$panel.find(".om-new").on("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } });
	});

	page.add_inner_button(__("Refresh"), load);
	load();
};
