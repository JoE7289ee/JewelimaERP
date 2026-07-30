// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Ordering Workstation — standalone desk for the ORDERING room (deliberately
// NOT the bench engine). TOP: the day's placement report — orders placed,
// pieces, and BY WHOM (date picker). BOTTOM: every card still sitting in
// ORDERING — the un-dispatched backlog — filterable and sortable.
// Route: /app/ws-ordering

frappe.pages["ws-ordering"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Ordering Workstation", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	let D = null;
	let sortKey = "creation", sortDir = 1;

	$(page.main).append(`
		<style>
		#page-ws-ordering .container{max-width:100%;}
		.od-top{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px;}
		.od-top input[type=date]{border:1px solid var(--border-color);border-radius:7px;padding:4px 10px;background:var(--fg-color);color:var(--text-color);}
		.od-kpis{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px;}
		.od-tile{border:1px solid var(--border-color);border-radius:9px;padding:8px 18px;background:var(--control-bg);}
		.od-tile .k{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;}
		.od-tile .v{font-size:20px;font-weight:800;}
		.od-tile.main{border-width:2px;background:var(--fg-color);}
		.od-tile.main .v{color:#1f618d;}
		.od-by{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;}
		.od-who{border:1px solid var(--border-color);border-radius:999px;padding:3px 12px;font-size:12px;background:var(--fg-color);}
		.od-who b{color:#1f618d;}
		.od-sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin:14px 0 6px;}
		.od-filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;}
		.od-filters input,.od-filters select{border:1px solid var(--border-color);border-radius:7px;padding:4px 10px;font-size:12.5px;background:var(--fg-color);color:var(--text-color);}
		table.od-t{width:100%;border-collapse:collapse;font-size:12.5px;background:var(--fg-color);}
		table.od-t th{background:var(--control-bg);font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);padding:6px 10px;border:1px solid var(--border-color);text-align:left;cursor:pointer;user-select:none;white-space:nowrap;}
		table.od-t th .dir{color:#1f618d;}
		table.od-t td{border:1px solid var(--border-color);padding:5px 10px;}
		table.od-t td.num{text-align:right;font-variant-numeric:tabular-nums;}
		.od-card{font-family:var(--font-family-monospace,monospace);font-weight:800;color:#1f618d;cursor:pointer;}
		.od-age{border-radius:9px;padding:1px 8px;font-size:11px;font-weight:800;color:#fff;background:#7f8c8d;}
		.od-age.old{background:#e0a800;color:#3a2c00;}
		.od-age.vold{background:#b02a2a;}
		.od-none{padding:34px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:10px;}
		</style>
		<div class="od-top">
			<span style="font-size:12px;color:var(--text-muted);">${__("Placed on")}</span>
			<input type="date" class="od-date" value="${frappe.datetime.get_today()}">
			<button class="btn btn-sm od-xl" style="background:#1f618d;border-color:#1f618d;color:#fff;font-weight:700;">${__("Daily Report ⤓")}</button>
			<button class="btn btn-sm od-tr" style="background:#2e7d32;border-color:#2e7d32;color:#fff;font-weight:700;">${__("Transfer →")}</button>
		</div>
		<div class="od-kpis"></div>
		<div class="od-by"></div>
		<div class="od-sec">${__("Still in Ordering")} <span class="od-count" style="font-weight:400;text-transform:none;"></span></div>
		<div class="od-filters">
			<input type="text" class="od-q" placeholder="${__("filter card / design / party…")}" style="min-width:240px;">
			<select class="od-type"><option value="">${__("All types")}</option></select>
			<select class="od-kind"><option value="">${__("All lines")}</option>
				<option value="design">${__("Design lines")}</option><option value="cad">${__("CAD lines")}</option></select>
		</div>
		<div class="od-body"></div>
	`);
	const root = $(page.main);

	const COLS = [
		["name", "Card"], ["design", "Design"], ["qty", "Qty"], ["size", "Size"],
		["party", "Party"], ["salesman", "Salesman"], ["order_type", "Type"],
		["order_date", "Ordered"], ["due", "Due"], ["waiting_days", "Waiting"],
	];

	function ageChip(d) {
		const cls = d >= 7 ? "vold" : d >= 3 ? "old" : "";
		return `<span class="od-age ${cls}">${d}d</span>`;
	}

	function filtered() {
		const q = (root.find(".od-q").val() || "").toUpperCase();
		const ty = root.find(".od-type").val();
		const kind = root.find(".od-kind").val();
		let rows = (D.rows || []).filter((r) =>
			(!q || [r.name, r.design, r.party, r.salesman].some((v) => (v || "").toUpperCase().includes(q)))
			&& (!ty || r.order_type === ty)
			&& (!kind || (kind === "cad" ? r.is_cad : !r.is_cad)));
		rows = rows.slice().sort((a, b) => {
			let x = a[sortKey], y = b[sortKey];
			if (typeof x === "string") { x = (x || "").toUpperCase(); y = (y || "").toUpperCase(); }
			return (x > y ? 1 : x < y ? -1 : 0) * sortDir;
		});
		return rows;
	}

	function paintTable() {
		const rows = filtered();
		root.find(".od-count").text(`— ${rows.length} / ${(D.rows || []).length} ${__("card(s)")}`);
		root.find(".od-body").html(rows.length ? `
			<table class="od-t"><thead><tr>
				${COLS.map(([k, l]) => `<th data-k="${k}">${__(l)}${sortKey === k ? ` <span class="dir">${sortDir > 0 ? "▲" : "▼"}</span>` : ""}</th>`).join("")}
			</tr></thead><tbody>
			${rows.map((r) => `<tr>
				<td><a class="jw-card-link od-card" data-card="${esc(r.name)}">${esc(r.name)}</a></td>
				<td>${r.is_cad ? `<span style="color:#9a6b1f;font-weight:700;">CAD</span> ${esc(r.design || "")}` : esc(r.design || "")}</td>
				<td class="num">${r.qty || ""}</td><td>${esc(r.size || "")}</td>
				<td>${esc(r.party || "")}</td><td>${esc(r.salesman || "")}</td>
				<td>${esc(r.order_type || "")}</td>
				<td>${r.order_date ? frappe.datetime.str_to_user(r.order_date) : ""}</td>
				<td>${r.due ? frappe.datetime.str_to_user(r.due) : ""}</td>
				<td>${ageChip(r.waiting_days)}</td>
			</tr>`).join("")}</tbody></table>`
			: `<div class="od-none">${__("Nothing sits in Ordering — everything has been dispatched.")}</div>`);
	}

	function paintTop() {
		const K = D.kpis || {};
		root.find(".od-kpis").html(`
			<div class="od-tile main"><div class="k">${__("Orders placed")}</div><div class="v">${K.orders || 0}</div></div>
			<div class="od-tile"><div class="k">${__("Pieces")}</div><div class="v">${K.bags || 0}</div></div>
			<div class="od-tile"><div class="k">${__("Still in Ordering")}</div><div class="v">${K.in_ordering || 0}</div></div>`);
		root.find(".od-by").html((D.by || []).map((b) =>
			`<span class="od-who"><b>${esc(b.who)}</b> — ${b.orders} ${__("order(s)")} · ${b.bags} ${__("pc")}</span>`).join("")
			|| `<span style="font-size:12px;color:var(--text-muted);">${__("No orders placed on this day.")}</span>`);
		// type filter options from the data
		const types = [...new Set((D.rows || []).map((r) => r.order_type).filter(Boolean))].sort();
		const cur = root.find(".od-type").val();
		root.find(".od-type").html(`<option value="">${__("All types")}</option>` +
			types.map((t) => `<option ${t === cur ? "selected" : ""}>${esc(t)}</option>`).join(""));
	}

	function load() {
		frappe.call({ method: API + ".get_ordering_workstation",
			args: { date: root.find(".od-date").val() }, freeze: false })
			.then((r) => {
				D = r.message;
				if (!D) return;
				paintTop();
				paintTable();
			});
	}

	// scan-and-transfer: ORDERING is ALWAYS the source, and only the two first
	// stations are reachable from here — anything else goes through the global
	// Transfer page (rules, holders, issue combos live there)
	root.find(".od-tr").on("click", () => {
		const picked = new Map(); // name -> 1
		const dlg = new frappe.ui.Dialog({
			title: __("Transfer from ORDERING"),
			fields: [
				{ fieldname: "to", fieldtype: "Select", label: __("To"), reqd: 1,
					options: "CAD\nWAX INJECTING", default: "CAD" },
				{ fieldname: "scan", fieldtype: "Data", label: __("Scan card"),
					description: __("Enter adds the card — it must be sitting in ORDERING") },
				{ fieldname: "list", fieldtype: "HTML" },
			],
			primary_action_label: __("Transfer"),
			primary_action(v) {
				const names = [...picked.keys()];
				if (!names.length) return frappe.show_alert({ message: __("Scan at least one card."), indicator: "orange" }, 3);
				frappe.call({ method: API + ".transfer_order_bags",
					args: { names: JSON.stringify(names), to_location: v.to, remarks: "Ordering desk" } })
					.then((r) => {
						const m = r.message || {};
						dlg.hide();
						if ((m.errors || []).length) {
							frappe.msgprint(m.errors.map((e) => `<b>${esc(e.name)}</b>: ${esc(e.error)}`).join("<br>"));
						}
						frappe.show_alert({ message: __("{0} card(s) → {1}", [m.count || 0, v.to]),
							indicator: (m.errors || []).length ? "orange" : "green" }, 5);
						load();
					});
			},
		});
		const paintList = () => {
			dlg.get_field("list").$wrapper.html([...picked.keys()].map((n) =>
				`<span style="display:inline-block;margin:3px 6px 0 0;padding:3px 10px;border:1px solid var(--border-color);border-radius:9px;font-family:var(--font-family-monospace,monospace);font-weight:700;">
					${esc(n)} <span data-rm="${esc(n)}" style="cursor:pointer;color:#b02a2a;font-weight:800;">&times;</span></span>`).join("")
				|| `<span style="color:var(--text-muted);font-size:12px;">${__("nothing scanned yet")}</span>`);
			dlg.get_primary_btn().text(__("Transfer {0} card(s)", [picked.size]));
		};
		dlg.get_field("list").$wrapper.on("click", "[data-rm]", function () {
			picked.delete($(this).data("rm"));
			paintList();
		});
		dlg.get_field("scan").$input.on("keydown", function (e) {
			if (e.key !== "Enter") return;
			e.preventDefault();
			const code = (this.value || "").trim().toUpperCase();
			this.value = "";
			if (!code || picked.has(code)) return;
			frappe.db.get_value("Order Bag", code, ["location", "is_finished"]).then((r) => {
				const b = (r.message || {});
				if (!b.location) return frappe.show_alert({ message: __("No card {0}.", [code]), indicator: "red" }, 3);
				if (b.is_finished) return frappe.show_alert({ message: __("{0} is a product — not from here.", [code]), indicator: "red" }, 4);
				if (b.location !== "ORDERING")
					return frappe.show_alert({ message: __("{0} is at {1} — use the Transfer page for anything not in ORDERING.", [code, b.location]), indicator: "orange" }, 5);
				picked.set(code, 1);
				paintList();
			});
		});
		dlg.show();
		paintList();
		setTimeout(() => dlg.get_field("scan").$input.focus(), 300);
	});

	root.find(".od-date").on("change", load);
	// the house DAILY REPORT excel for the picked date — karat sections + CO/BULK
	root.find(".od-xl").on("click", () =>
		open_url_post("/api/method/jewelima.jewelima.api.export_daily_orders_xlsx",
			{ date: root.find(".od-date").val() }));
	root.on("input change", ".od-q, .od-type, .od-kind", paintTable);
	root.on("click", ".od-t th", function () {
		const k = $(this).data("k");
		if (sortKey === k) sortDir = -sortDir;
		else { sortKey = k; sortDir = 1; }
		paintTable();
	});

	load();
	const t = setInterval(() => { if ($(wrapper).is(":visible")) load(); }, 60000);
	$(wrapper).on("remove", () => clearInterval(t));
};
