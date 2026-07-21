// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Workstation (CAD) — a CAD user's desk: the cards assigned to them, with per-row
// links (materials, CAD info, CAD sheet, photos). Read-only for CAD users; a lead
// (System Manager) assigns queue cards to CAD users. Top: CAD In-Queue count +
// a small who-has-what table. Approval workflow: later. Route: /app/workstation

frappe.pages["cad-workstation"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Workstation", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	let D = {};

	$(page.main).append(`
		<style>
		#page-workstation .container{max-width:100%;}
		.ws-top{display:flex;gap:16px;align-items:flex-start;margin-bottom:14px;flex-wrap:wrap;}
		.ws-tiles{display:flex;gap:12px;}
		.ws-tile{border:1px solid var(--border-color);border-radius:10px;padding:10px 22px;text-align:center;background:var(--fg-color);}
		.ws-tile .k{font-size:10.5px;font-weight:700;letter-spacing:.05em;color:var(--text-muted);text-transform:uppercase;}
		.ws-tile .v{font-size:24px;font-weight:800;}
		.ws-users{margin-left:auto;border:1px solid var(--border-color);border-radius:10px;background:var(--fg-color);
			padding:8px 12px;min-width:230px;}
		.ws-users h5{margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);}
		.ws-users table{width:100%;border-collapse:collapse;font-size:12.5px;}
		.ws-users td{padding:2px 6px;} .ws-users td.n{text-align:right;font-weight:700;font-variant-numeric:tabular-nums;}
		.ws-users tr.me{background:var(--subtle-accent);border-radius:4px;}
		.ws-sec{font-size:13px;font-weight:800;margin:16px 0 8px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);}
		.ws-tbl{width:100%;border-collapse:separate;border-spacing:0;background:var(--fg-color);
			border:1px solid var(--border-color);border-radius:9px;overflow:hidden;font-size:13px;}
		.ws-tbl th{background:var(--control-bg);border-bottom:1px solid var(--border-color);padding:7px 11px;text-align:left;font-weight:700;white-space:nowrap;}
		.ws-tbl td{border-bottom:1px solid var(--border-color);padding:6px 11px;vertical-align:middle;}
		.ws-tbl tbody tr:last-child td{border-bottom:0;}
		.ws-tbl td.num,.ws-tbl th.num{text-align:right;font-variant-numeric:tabular-nums;}
		.ws-act .btn{margin-right:4px;margin-bottom:2px;}
		.ws-none{padding:30px;text-align:center;color:var(--text-muted);}
		/* karat colours the row up to the actions; the actions cell switches to a
		   modifier colour when applicable (22K+customer -> light blue, 18K+bulk ->
		   yellow), otherwise the base colour extends through it. */
		.ws-tbl tr.k22 td{background:#1e3a8a;color:#fff;}
		.ws-tbl tr.k22 td b, .ws-tbl tr.k22 td span, .ws-tbl tr.k22 td a{color:#fff !important;}
		.ws-tbl tr.k18 td{background:#f7b8d4;}
		.ws-tbl tr.k22.mod td:last-child{background:#bcd6ff;}                 /* 22K customer */
		.ws-tbl tr.k22.mod td:last-child, .ws-tbl tr.k22.mod td:last-child *{color:#111 !important;}
		.ws-tbl tr.k18.mod td:last-child{background:#ffe08a;}                 /* 18K bulk */
		.ws-tbl tr.k-row td:last-child .btn{background:var(--fg-color);color:var(--text-color);}
		.ws-assign{border:1px solid var(--border-color);border-radius:6px;padding:3px 6px;font-size:12px;background:var(--control-bg);}
		</style>
		<div class="ws-top">
			<div class="ws-tiles">
				<div class="ws-tile"><div class="k">${__("CAD In Queue")}</div><div class="v ws-q">0</div></div>
				<div class="ws-tile"><div class="k">${__("My Cards")}</div><div class="v ws-my">0</div></div>
			</div>
			<div class="ws-users"><h5>${__("CAD Users")}</h5><div class="ws-userbody"></div></div>
		</div>
		<div class="ws-mine"></div>
		<div class="ws-leadwrap"></div>
	`);
	const root = $(page.main);

	function load() {
		frappe.call({ method: API + ".get_cad_workstation" }).then((r) => { D = r.message || {}; paint(); });
	}

	function actions(c) {
		return `<span class="ws-act">
			<button class="btn btn-xs btn-default" data-mat="${esc(c.name)}">${__("Materials")}</button>
			<button class="btn btn-xs btn-default" data-info="${esc(c.name)}">${__("CAD Info")}</button>
			<button class="btn btn-xs btn-default" data-sheet="${esc(c.name)}">${__("CAD Sheet")}</button>
			<button class="btn btn-xs btn-default" data-weight="${esc(c.name)}">${__("Weight")}</button>
			<button class="btn btn-xs btn-default" data-photos="${esc(c.name)}">${__("Photos")}</button>
		</span>`;
	}

	function karatClass(c) {
		if (!c.karat) return "";
		if (c.karat === "22K") return "k-row k22" + (c.is_bulk ? "" : " mod");   // customer -> light-blue actions
		if (c.karat === "18K") return "k-row k18" + (c.is_bulk ? " mod" : "");   // bulk -> yellow actions
		return "";
	}

	function cardTable(list, lead) {
		if (!list.length) return `<div class="ws-none">${lead ? __("Nothing unassigned.") : __("No cards assigned to you.")}</div>`;
		return `<table class="ws-tbl"><thead><tr>
			<th>${__("Order Bag")}</th><th>${__("Customer")}</th><th>${__("Order Date")}</th><th>${__("Due Date")}</th>
			<th class="num">${__("Gold Wt")}</th><th class="num">${__("Dia (ct)")}</th>
			${lead ? `<th>${__("Assign to")}</th>` : `<th>${__("Actions")}</th>`}</tr></thead><tbody>` +
			list.map((c) => `<tr class="${karatClass(c)}">
				<td><b>${esc(c.name)}</b> <span style="color:var(--text-muted);font-size:11px;">${esc(c.cad_design_type || "")}</span></td>
				<td>${esc(c.customer || "—")}</td>
				<td>${c.order_date ? frappe.datetime.str_to_user(c.order_date) : "—"}</td>
				<td>${c.due_date ? frappe.datetime.str_to_user(c.due_date) : "—"}</td>
				<td class="num">${esc(c.cad_gold_weight || "—")}</td>
				<td class="num">${c.cad_diamond_weight ? Number(c.cad_diamond_weight).toFixed(2) : "—"}</td>
				<td>${lead ? assignSelect(c) : actions(c)}</td>
			</tr>`).join("") + "</tbody></table>";
	}

	function assignSelect(c) {
		return `<select class="ws-assign" data-assign="${esc(c.name)}">
			<option value="">${__("— pick CAD user —")}</option>
			${(D.cad_users || []).map((u) => `<option value="${esc(u.employee)}">${esc(u.name)}</option>`).join("")}
		</select>`;
	}

	function paint() {
		root.find(".ws-q").text(D.in_queue || 0);
		root.find(".ws-my").text((D.my_cards || []).length);
		root.find(".ws-userbody").html(`<table>${(D.cad_users || []).map((u) =>
			`<tr class="${u.is_me ? "me" : ""}"><td>${esc(u.name)}</td><td class="n">${u.count}</td></tr>`).join("")}</table>`);
		root.find(".ws-mine").html(`<div class="ws-sec">${__("My Cards")}</div>` + cardTable(D.my_cards || [], false));
		if (D.is_lead) {
			root.find(".ws-leadwrap").html(`<div class="ws-sec">${__("Unassigned Queue — assign to a CAD user")}</div>`
				+ cardTable(D.unassigned || [], true));
		} else {
			root.find(".ws-leadwrap").empty();
		}
	}

	// ---- lead: assign ----
	root.on("change", ".ws-assign", function () {
		const bag = $(this).attr("data-assign");
		const emp = this.value;
		if (!emp) return;
		frappe.call({ method: API + ".assign_cad_card", args: { order_bag: bag, employee: emp } }).then(() => {
			frappe.show_alert({ message: __("{0} assigned.", [bag]), indicator: "green" }, 3);
			load();
		});
	});

	// ---- per-card dialogs / links ----
	root.on("click", "[data-sheet]", function () {
		frappe.route_options = { order_bag: $(this).attr("data-sheet") };
		frappe.set_route("cad-sheet");
	});
	root.on("click", "[data-weight]", function () {
		frappe.route_options = { order_bag: $(this).attr("data-weight") };
		frappe.set_route("weight-checker");
	});
	root.on("click", "[data-mat]", function () { detail($(this).attr("data-mat"), "materials"); });
	root.on("click", "[data-info]", function () { detail($(this).attr("data-info"), "info"); });
	root.on("click", "[data-photos]", function () {
		frappe.route_options = { order_bag: $(this).attr("data-photos") };
		frappe.set_route("order-bag-photos");
	});

	function detail(bag, which) {
		frappe.call({ method: API + ".get_cad_card_detail", args: { order_bag: bag } }).then((r) => {
			const m = r.message || {};
			const d = new frappe.ui.Dialog({ title: `${bag} — ${which === "materials" ? __("Materials") : which === "info" ? __("CAD Info") : __("Photos")}`, size: "large" });
			let html = "";
			if (which === "materials") {
				const srcNote = m.design ? `<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:6px;">${__("From design {0}", [esc(m.design)])}${m.mat_source === "bag" ? " (bag BOM)" : ""}</div>` : "";
				html = srcNote + ((m.materials || []).length
					? `<table class="ws-tbl"><thead><tr><th>${__("Item")}</th><th>${__("Qty")}</th><th>${__("Weight")}</th></tr></thead><tbody>`
						+ m.materials.map((x) => `<tr><td>${esc(x.item)}</td><td>${x.qty || 0}</td><td>${(x.weight || 0).toFixed(3)}</td></tr>`).join("")
						+ "</tbody></table>"
					: `<div class="ws-none">${__("No materials yet (CAD job — design not finalized).")}</div>`);
			} else if (which === "info") {
				const b = m.brief || {};
				const rowsB = [["Design Type", b.cad_design_type], ["Karat", b.cad_karat], ["Gold Wt", b.cad_gold_weight],
					["Diamond Budget (ct)", b.cad_diamond_weight], ["Stone No", b.cad_stone_no], ["Reference", b.cad_reference], ["Remarks", b.cad_remarks]];
				html = `<table class="ws-tbl"><tbody>` + rowsB.map(([k, v]) =>
					`<tr><td style="font-weight:700;width:200px;">${esc(k)}</td><td>${esc(v || "—")}</td></tr>`).join("") + "</tbody></table>";
			} else {
				html = (m.photos || []).length
					? `<div style="display:flex;flex-wrap:wrap;gap:10px;">` + m.photos.map((ph) =>
						`<div style="text-align:center;"><img src="${encodeURI(ph.image)}" style="max-width:220px;max-height:220px;border:1px solid var(--border-color);border-radius:8px;"><div style="font-size:11px;color:var(--text-muted);">${esc(ph.title || "")}</div></div>`).join("") + "</div>"
					: `<div class="ws-none">${__("No photos on this card.")}</div>`;
			}
			d.$body.html(html);
			d.show();
		});
	}

	page.set_primary_action(__("Refresh"), () => load(), "refresh");
	load();
};
