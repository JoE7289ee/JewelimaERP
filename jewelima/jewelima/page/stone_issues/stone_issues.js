// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Stone Issues (Reports > Stock Reports) — what stones went into cards on a day.
// Pick the date; filter by stone TYPE (Diamond, Color Stone, …) and item GROUP
// (the sieve/quality families) with pills. Top: totals + per-item rollup;
// below: the line-by-line trail (card, who, when). Route: /app/stone-issues

frappe.pages["stone-issues"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Stone Issues", single_column: true });
	const API = "jewelima.jewelima.api";
	const S = { date: "", type: "", group: "" };
	const esc = frappe.utils.escape_html;

	$(page.main).append(`
		<style>
		.sis-bar{display:flex;gap:10px;align-items:end;margin-bottom:10px;flex-wrap:wrap;}
		.sis-bar .frappe-control{margin:0;flex:0 0 200px;}
		.sis-bar .control-label{font-size:11px;color:var(--text-muted);}
		.sis-tiles{display:flex;gap:12px;margin:4px 0 12px;}
		.sis-tile{border:1px solid var(--border-color);border-radius:9px;padding:8px 18px;background:var(--control-bg);min-width:120px;}
		.sis-tile .k{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;}
		.sis-tile .v{font-size:18px;font-weight:800;}
		.sis-pills{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 10px;align-items:center;}
		.sis-pills .lbl{font-size:10.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-right:2px;}
		.sis-pill{border:1px solid var(--border-color);border-radius:12px;padding:2px 12px;font-size:12px;font-weight:600;cursor:pointer;background:var(--control-bg);user-select:none;}
		.sis-pill.on{background:var(--primary);border-color:var(--primary);color:#fff;}
		table.sis-t{width:100%;border-collapse:collapse;font-size:12.5px;background:var(--fg-color);margin-bottom:16px;}
		table.sis-t th{background:var(--control-bg);font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);padding:5px 10px;border:1px solid var(--border-color);text-align:left;}
		table.sis-t td{border:1px solid var(--border-color);padding:4px 10px;}
		table.sis-t td.r,table.sis-t th.r{text-align:right;}
		table.sis-t tr.tot td{font-weight:700;background:var(--control-bg);}
		.sis-none{padding:30px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:9px;}
		.sis-sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin:14px 0 6px;}
		</style>
		<div class="sis-bar"><div class="sis-date"></div></div>
		<div class="sis-tiles"></div>
		<div class="sis-pills sis-types"></div>
		<div class="sis-pills sis-groups"></div>
		<div class="sis-body"></div>
	`);
	const root = $(page.main);

	const dateCtl = frappe.ui.form.make_control({
		df: { fieldtype: "Date", label: __("Date"), fieldname: "date", reqd: 1 },
		parent: root.find(".sis-date").get(0), render_input: true,
	});
	dateCtl.refresh();
	dateCtl.$input.on("change", () => { S.date = dateCtl.get_value(); S.type = S.group = ""; load(); });

	function load() {
		if (!S.date) return;
		frappe.call({ method: API + ".get_stone_issues_day",
			args: { date: S.date, stone_type: S.type || null, item_group: S.group || null } }).then((r) => {
			paint(r.message || {});
		});
	}

	function pills($box, label, values, cur, key) {
		$box.html(values.length ? `<span class="lbl">${label}</span>
			<span class="sis-pill ${cur ? "" : "on"}" data-k="${key}" data-v="">${__("All")}</span>` +
			values.map((v) => `<span class="sis-pill ${cur === v ? "on" : ""}" data-k="${key}" data-v="${esc(v)}">${esc(v)}</span>`).join("") : "");
	}

	function paint(m) {
		root.find(".sis-tiles").html([
			["Pieces (pcs)", m.total_pcs || 0], ["Carats", (m.total_ct || 0).toFixed(3) + " ct"],
			["Cards touched", m.cards || 0], ["Stone lines", (m.rows || []).length],
		].map(([k, v]) => `<div class="sis-tile"><div class="k">${k}</div><div class="v">${v}</div></div>`).join(""));
		pills(root.find(".sis-types"), __("Stone type"), m.types || [], S.type, "type");
		pills(root.find(".sis-groups"), __("Group"), m.groups || [], S.group, "group");

		if (!(m.rows || []).length) {
			root.find(".sis-body").html(`<div class="sis-none">${__("No stones issued on {0}{1}.", [frappe.datetime.str_to_user(m.date), S.type || S.group ? " " + __("with these filters") : ""])}</div>`);
			return;
		}
		const items = (m.items || []).map((x) => `
			<tr><td>${esc(x.item)}</td><td>${esc(x.stone_type || "")}</td><td>${esc(x.item_group || "")}</td>
			<td class="r">${x.pcs}</td><td class="r">${x.ct.toFixed(3)}</td><td class="r">${x.lines}</td></tr>`).join("");
		const lines = m.rows.map((r, i) => `
			<tr><td>${i + 1}</td><td>${esc(r.item)}</td><td>${esc(r.item_group || "")}</td>
			<td><a href="/app/order-bag/${encodeURIComponent(r.order_bag)}">${esc(r.order_bag)}</a></td>
			<td class="r">${r.pcs}</td><td class="r">${r.ct.toFixed(3)}</td>
			<td>${esc(r.who)}</td><td>${frappe.datetime.str_to_user(r.datetime).split(" ").slice(1).join(" ")}</td></tr>`).join("");
		root.find(".sis-body").html(`
			<div class="sis-sec">${__("By item")}</div>
			<table class="sis-t"><thead><tr><th>${__("Stone")}</th><th>${__("Type")}</th><th>${__("Group")}</th>
				<th class="r">${__("Pcs")}</th><th class="r">${__("Ct")}</th><th class="r">${__("Issues")}</th></tr></thead>
			<tbody>${items}<tr class="tot"><td colspan="3">${__("Total")}</td>
				<td class="r">${m.total_pcs}</td><td class="r">${m.total_ct.toFixed(3)}</td><td class="r">${m.rows.length}</td></tr></tbody></table>
			<div class="sis-sec">${__("Line by line")}</div>
			<table class="sis-t"><thead><tr><th style="width:34px">#</th><th>${__("Stone")}</th><th>${__("Group")}</th>
				<th>${__("Card")}</th><th class="r">${__("Pcs")}</th><th class="r">${__("Ct")}</th>
				<th>${__("Issued By")}</th><th>${__("Time")}</th></tr></thead><tbody>${lines}</tbody></table>`);
	}

	root.on("click", ".sis-pill", function () {
		const k = this.getAttribute("data-k"), v = this.getAttribute("data-v");
		if (k === "type") S.type = v;
		else S.group = v;
		load();
	});

	page.add_inner_button(__("Refresh"), load);
	S.date = frappe.datetime.get_today();
	dateCtl.set_value(S.date);
	setTimeout(load, 300);
};
