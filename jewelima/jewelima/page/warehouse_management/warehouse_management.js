// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Warehouse Management — a flags-only grid: every leaf warehouse as a row, each custom
// Warehouse flag (Issue / Loss / Purchase Location / Melt …) as a tickable column. Toggling
// a box saves immediately. No warehouse creation or renaming here — flags only.
// Route: /app/warehouse-management

frappe.pages["warehouse-management"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Warehouse Management", single_column: true });
	const API = "jewelima.jewelima.api";
	const S = { flags: [], warehouses: [] };

	$(page.main).append(`
		<style>
		.wm-wrap{max-width:980px;}
		.wm-top{display:flex;align-items:center;gap:12px;margin:2px 0 12px;}
		.wm-search{width:280px;border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);padding:4px 10px;height:30px;border-radius:5px;box-sizing:border-box;color:var(--text-color);font-size:13px;}
		.wm-count{color:var(--text-muted);font-size:12px;}
		.wm-box{border:1px solid var(--border-color);border-radius:8px;overflow:auto;max-height:calc(100vh - 220px);}
		table.wm-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;background:var(--fg-color);}
		table.wm-tbl th{position:sticky;top:0;z-index:1;background:var(--control-bg,var(--fg-color));border-bottom:2px solid var(--gray-400,#aeb6bf);padding:8px 10px;text-align:left;font-weight:700;white-space:nowrap;}
		table.wm-tbl th.flag,table.wm-tbl td.flag{text-align:center;width:130px;}
		table.wm-tbl td{border-bottom:1px solid var(--border-color);padding:7px 10px;vertical-align:middle;}
		table.wm-tbl tr:hover td{background:var(--control-bg);}
		table.wm-tbl .wm-wh{font-weight:600;}
		table.wm-tbl .wm-cb{width:16px;height:16px;cursor:pointer;}
		.wm-empty{padding:18px;text-align:center;color:var(--text-muted);}
		.wm-hint{margin:10px 2px 0;color:var(--text-muted);font-size:12px;}
		</style>
		<div class="wm-wrap">
			<div class="wm-top">
				<input class="wm-search" type="text" placeholder="Filter warehouses…">
				<span class="wm-count"></span>
			</div>
			<div class="wm-box"><table class="wm-tbl"><thead class="wm-head"></thead><tbody class="wm-body"></tbody></table></div>
			<div class="wm-hint">Flags only. To create or rename a warehouse, use the <a href="/app/warehouse">Warehouse</a> list.</div>
		</div>
	`);

	const root = $(page.main)[0];
	const esc = frappe.utils.escape_html;
	const $search = root.querySelector(".wm-search");

	function renderHead() {
		root.querySelector(".wm-head").innerHTML =
			`<tr><th>Warehouse</th>${S.flags.map((f) => `<th class="flag">${esc(f.label || f.fieldname)}</th>`).join("")}</tr>`;
	}

	function renderBody() {
		const term = ($search.value || "").toLowerCase().trim();
		const list = S.warehouses.filter((w) => !term || (w.warehouse_name || w.name).toLowerCase().includes(term));
		const body = root.querySelector(".wm-body");
		if (!S.flags.length) { body.innerHTML = `<tr><td class="wm-empty">No warehouse flags defined.</td></tr>`; return; }
		if (!list.length) { body.innerHTML = `<tr><td class="wm-empty" colspan="${S.flags.length + 1}">No warehouses match.</td></tr>`; return; }
		body.innerHTML = list.map((w) => {
			const cells = S.flags.map((f) =>
				`<td class="flag"><input type="checkbox" class="wm-cb" data-wh="${esc(w.name)}" data-flag="${esc(f.fieldname)}" ${w[f.fieldname] ? "checked" : ""}></td>`
			).join("");
			return `<tr><td class="wm-wh">${esc(w.warehouse_name || w.name)}</td>${cells}</tr>`;
		}).join("");
		root.querySelectorAll(".wm-cb").forEach((cb) => cb.addEventListener("change", onToggle));
	}

	function onToggle() {
		const wh = this.getAttribute("data-wh"), flag = this.getAttribute("data-flag"), value = this.checked ? 1 : 0;
		const cb = this;
		cb.disabled = true;
		frappe.call({ method: API + ".set_warehouse_flag", args: { warehouse: wh, flag, value } })
			.then((r) => {
				cb.disabled = false;
				const row = S.warehouses.find((w) => w.name === wh);
				if (row) row[flag] = value;
				const label = (S.flags.find((f) => f.fieldname === flag) || {}).label || flag;
				frappe.show_alert({ message: __("{0}: {1} {2}", [wh.replace(/ - [A-Za-z]+$/, ""), label, value ? "✓" : "✗"]), indicator: value ? "green" : "gray" }, 3);
			})
			.catch(() => { cb.disabled = false; cb.checked = !cb.checked; });
	}

	function load() {
		frappe.call({ method: API + ".get_warehouse_flags" }).then((r) => {
			const d = r.message || {};
			S.flags = d.flags || [];
			S.warehouses = d.warehouses || [];
			root.querySelector(".wm-count").textContent = `${S.warehouses.length} warehouse(s) · ${S.flags.length} flag(s)`;
			renderHead();
			renderBody();
		});
	}

	$search.addEventListener("input", renderBody);
	page.add_inner_button(__("Refresh"), load);
	load();
};
