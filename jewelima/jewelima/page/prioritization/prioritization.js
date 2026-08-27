// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Prioritisation — the manual override queue. Scan a card and it joins the
// BOTTOM of this list; drag rows to rearrange (top = most urgent). Every
// workbench queue puts these cards first, in exactly this order, ahead of
// the automatic due-date/CUST ranking. Colors run red (top) -> green
// (bottom). Remove a card and it falls back to automatic ranking.
// Route: /app/prioritization

frappe.pages["prioritization"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Prioritisation", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	let rows = [];

	$(page.main).append(`
		<style>
		.pz-top{display:flex;align-items:flex-end;gap:14px;margin-bottom:14px;flex-wrap:wrap;}
		.pz-scan{width:260px;}
		.pz-note{font-size:12px;color:var(--text-muted);max-width:640px;}
		table.pz-t{width:100%;border-collapse:collapse;font-size:12.5px;background:var(--fg-color);}
		table.pz-t th{background:var(--control-bg);font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);padding:6px 10px;border:1px solid var(--border-color);text-align:left;}
		table.pz-t td{border:1px solid var(--border-color);padding:6px 10px;}
		table.pz-t tr{cursor:grab;}
		table.pz-t tr.drag{opacity:.4;}
		table.pz-t tr.over td{border-top:3px solid var(--primary);}
		.pz-rank{font-weight:800;width:44px;text-align:center;}
		.pz-x{border:none;background:none;color:var(--text-muted);cursor:pointer;font-size:14px;}
		.pz-x:hover{color:#b02a2a;}
		.pz-empty{padding:36px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:9px;}
		.pz-grip{color:var(--text-muted);cursor:grab;}
		</style>
		<div class="pz-top">
			<div class="pz-scan"></div>
			<div class="pz-note">${__("Scan a card — it lands at the BOTTOM of this list. Drag rows to rearrange; the top row is the most urgent card in the whole factory. Every workbench shows these first, in this order.")}</div>
		</div>
		<div class="pz-body"></div>
	`);
	const root = $(page.main);
	const scan = frappe.ui.form.make_control({
		df: { fieldtype: "Data", label: __("Scan card"), fieldname: "scan", placeholder: __("Scan barcode…") },
		parent: root.find(".pz-scan").get(0), render_input: true,
	});
	scan.refresh();
	const focusScan = () => setTimeout(() => scan.$input.focus(), 50);

	// red (top) -> green (bottom) — a smooth urgency gradient per row
	function rowColor(i, n) {
		if (n <= 1) return "rgba(214,48,49,.14)";
		const t = i / (n - 1);                       // 0 top .. 1 bottom
		const r = Math.round(214 + (46 - 214) * t);
		const g = Math.round(48 + (125 - 48) * t);
		const b = Math.round(49 + (50 - 49) * t);
		return `rgba(${r},${g},${b},.14)`;
	}

	function paint() {
		if (!rows.length) {
			root.find(".pz-body").html(`<div class="pz-empty">${__("Nothing manually prioritised — every bench runs on due date + CUST-first automatically.")}</div>`);
			return;
		}
		root.find(".pz-body").html(`
			<table class="pz-t"><thead><tr>
				<th style="width:44px">#</th><th style="width:26px"></th><th>${__("Card")}</th><th>${__("Design")}</th>
				<th>${__("At Bench")}</th><th>${__("Party")}</th><th>${__("Order Type")}</th><th>${__("Due")}</th>
				<th>${__("Added by")}</th><th style="width:30px"></th>
			</tr></thead><tbody>
			${rows.map((r, i) => `
				<tr draggable="true" data-bag="${esc(r.name)}" style="background:${rowColor(i, rows.length)}">
					<td class="pz-rank">${i + 1}</td>
					<td class="pz-grip">⠿</td>
					<td><b>${esc(r.name)}</b></td>
					<td>${esc(r.design || "")}</td>
					<td>${esc(r.location || "")}${r.stock_status && r.stock_status !== "In Production" ? " · " + esc(r.stock_status) : ""}</td>
					<td>${esc(r.party || "")}</td>
					<td>${esc(r.order_type || "")}</td>
					<td>${r.due ? frappe.datetime.str_to_user(r.due) : ""}</td>
					<td>${esc((r.added_by || "").split("@")[0])}</td>
					<td><button class="pz-x" title="${__("Remove — back to automatic ranking")}">✕</button></td>
				</tr>`).join("")}
			</tbody></table>`);
	}

	function load() {
		frappe.call({ method: API + ".get_priority_list" }).then((r) => {
			rows = (r.message || {}).rows || [];
			paint();
		});
	}

	scan.$input.on("keydown", (e) => {
		if (e.key !== "Enter") return;
		const code = (scan.get_value() || "").trim();
		scan.set_value("");
		if (!code) return;
		frappe.call({ method: API + ".priority_scan", args: { code } }).then((r) => {
			rows = (r.message || {}).rows || [];
			paint();
			frappe.show_alert({ message: __("{0} added at the bottom — drag it up if it must jump the line.", [code]), indicator: "blue" }, 5);
			focusScan();
		}).catch(() => focusScan());
	});

	root.on("click", ".pz-x", function () {
		const bag = $(this).closest("tr").data("bag");
		frappe.call({ method: API + ".priority_remove", args: { code: bag } }).then((r) => {
			rows = (r.message || {}).rows || [];
			paint();
			frappe.show_alert({ message: __("{0} removed — automatic ranking applies.", [bag]), indicator: "orange" }, 4);
			focusScan();
		});
	});

	// drag & drop reorder
	let dragBag = null;
	root.on("dragstart", "tr[draggable]", function () {
		dragBag = $(this).data("bag");
		$(this).addClass("drag");
	});
	root.on("dragend", "tr[draggable]", function () {
		$(this).removeClass("drag");
		root.find("tr.over").removeClass("over");
	});
	root.on("dragover", "tr[draggable]", function (e) {
		e.preventDefault();
		root.find("tr.over").removeClass("over");
		$(this).addClass("over");
	});
	root.on("drop", "tr[draggable]", function (e) {
		e.preventDefault();
		const target = $(this).data("bag");
		if (!dragBag || dragBag === target) return;
		const order = rows.map((r) => r.name);
		order.splice(order.indexOf(dragBag), 1);
		order.splice(order.indexOf(target), 0, dragBag);
		rows.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
		paint();
		frappe.call({ method: API + ".priority_reorder", args: { bags: JSON.stringify(order) } });
		dragBag = null;
	});

	// ---- Cards picker: browse EVERY live card, filter by party / order
	// type / due date, tick, add the batch to the bottom of the list
	function showCards() {
		const S = { party: "", otype: "", due: "", q: "", rows: [], sel: new Set() };
		const dlg = new frappe.ui.Dialog({
			title: __("Pick cards to prioritise"),
			size: "extra-large",
			primary_action_label: __("Add to priority list"),
			primary_action() {
				if (!S.sel.size) return frappe.msgprint(__("Tick at least one card."));
				dlg.hide();
				frappe.call({ method: API + ".priority_add_many", args: { bags: JSON.stringify([...S.sel]) } })
					.then((r) => {
						const m = r.message || {};
						rows = m.rows || [];
						paint();
						frappe.show_alert({ message: __("{0} card(s) added at the bottom{1}", [(m.added || []).length,
							(m.skipped || []).length ? " · " + __("{0} skipped (already listed / not live)", [m.skipped.length]) : "."]), indicator: "blue" }, 6);
						focusScan();
					});
			},
		});
		const $b = $(dlg.body);
		$b.html(`
			<style>
			.pc-top{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px;}
			.pc-top select,.pc-top input{border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);color:var(--text-color);height:30px;border-radius:5px;padding:2px 8px;font-size:13px;}
			.pc-count{margin-left:auto;color:var(--text-muted);font-size:12px;}
			.pc-box{border:1px solid var(--border-color);border-radius:11px;overflow:auto;height:calc(100vh - 330px);min-height:280px;}
			table.pc-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;background:var(--fg-color);}
			table.pc-tbl th{position:sticky;top:0;z-index:1;background:var(--control-bg,var(--fg-color));border-bottom:2px solid var(--gray-400,#aeb6bf);padding:6px 8px;text-align:left;font-weight:700;}
			table.pc-tbl td{border-bottom:1px solid var(--border-color);padding:5px 8px;}
			table.pc-tbl tr.on td{background:var(--bg-light-gray,#eef3ee);}
			.pc-empty{padding:18px;text-align:center;color:var(--text-muted);}
			</style>
			<div class="pc-top">
				<select class="pc-party"><option value="">${__("— party —")}</option></select>
				<select class="pc-otype"><option value="">${__("— order type —")}</option></select>
				<label style="font-size:12px;color:var(--text-muted);margin:0;">${__("due by")}
					<input type="date" class="pc-due" style="margin-left:4px;"></label>
				<input type="text" class="pc-q" placeholder="${__("search card / design…")}" style="width:180px;">
				<button class="btn btn-xs btn-default pc-all">${__("Select all")}</button>
				<button class="btn btn-xs btn-default pc-none">${__("Clear")}</button>
				<span class="pc-count"></span>
			</div>
			<div class="pc-box"><table class="pc-tbl">
				<thead><tr><th style="width:34px"></th><th>${__("Order Bag")}</th><th>${__("Design")}</th>
				<th>${__("Party")}</th><th>${__("Order Type")}</th><th>${__("Due")}</th><th>${__("At")}</th></tr></thead>
				<tbody class="pc-body"><tr><td colspan="7" class="pc-empty">${__("Loading…")}</td></tr></tbody>
			</table></div>`);

		const listed = new Set(rows.map((r) => r.name));
		const visible = () => S.rows.filter((r) =>
			(!S.party || r.party === S.party)
			&& (!S.otype || r.order_type === S.otype)
			&& (!S.due || (r.due && r.due <= S.due))
			&& (!S.q || (r.name + " " + (r.design || "")).toLowerCase().includes(S.q)));
		function paintDlg() {
			const vis = visible();
			$b.find(".pc-body").html(vis.length
				? vis.map((r) => `<tr class="${S.sel.has(r.name) ? "on" : ""}">
					<td><input type="checkbox" data-nm="${esc(r.name)}" ${S.sel.has(r.name) ? "checked" : ""} ${listed.has(r.name) ? "disabled title='Already on the priority list'" : ""}></td>
					<td><b>${esc(r.name)}</b></td><td>${esc(r.design || "")}</td>
					<td>${esc(r.party || "")}</td><td>${esc(r.order_type || "")}</td>
					<td>${r.due ? frappe.datetime.str_to_user(r.due) : ""}</td><td>${esc(r.location || "")}</td></tr>`).join("")
				: `<tr><td colspan="7" class="pc-empty">${__("No cards match the filters.")}</td></tr>`);
			$b.find(".pc-count").text(__("{0} selected · {1} shown · {2} live", [S.sel.size, vis.length, S.rows.length]));
			// click one, shift-click another: everything between follows
			jewelima.shiftSelect($b, ".pc-body input");
			$b.find(".pc-body input").on("change", function () {
				this.checked ? S.sel.add(this.dataset.nm) : S.sel.delete(this.dataset.nm);
				paintDlg();
			});
			dlg.get_primary_btn().text(S.sel.size ? __("Add {0} to priority list", [S.sel.size]) : __("Add to priority list"));
		}
		frappe.call({ method: API + ".get_priority_candidates" }).then((r) => {
			S.rows = (r.message || {}).rows || [];
			const parties = [...new Set(S.rows.map((x) => x.party).filter(Boolean))].sort();
			const otypes = [...new Set(S.rows.map((x) => x.order_type).filter(Boolean))].sort();
			$b.find(".pc-party").append(parties.map((p) => `<option>${esc(p)}</option>`).join(""));
			$b.find(".pc-otype").append(otypes.map((p) => `<option>${esc(p)}</option>`).join(""));
			paintDlg();
		});
		$b.find(".pc-party").on("change", function () { S.party = this.value; paintDlg(); });
		$b.find(".pc-otype").on("change", function () { S.otype = this.value; paintDlg(); });
		$b.find(".pc-due").on("change", function () { S.due = this.value; paintDlg(); });
		$b.find(".pc-q").on("input", function () { S.q = this.value.trim().toLowerCase(); paintDlg(); });
		$b.find(".pc-all").on("click", () => { visible().forEach((r) => { if (!listed.has(r.name)) S.sel.add(r.name); }); paintDlg(); });
		$b.find(".pc-none").on("click", () => { S.sel.clear(); paintDlg(); });
		dlg.show();
	}
	page.add_inner_button(__("Cards"), showCards);

	load();
	focusScan();
};
