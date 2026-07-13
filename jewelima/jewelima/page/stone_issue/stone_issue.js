// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Stone Issue (Manufacturing > Issue) — the stone-issuing control station.
// LEFT: scan a card, its BOM stone lines (metals never show), edit a line
// (sieve swap / piece count — plan carats follow the per-piece average), add a
// brand-new stone (blank plan fills from the actual on issue), enter pcs + ct
// and Issue (Bag Material Ledger row + stock Stone Issue -> In Bags + a
// Material Issue record). RIGHT: what the picked issuer handed out today, and
// the Stone Issue warehouse stock. Route: /app/stone-issue

frappe.pages["stone-issue"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Stone Issue", single_column: true });
	const API = "jewelima.jewelima.api";
	const S = { card: null };
	const esc = frappe.utils.escape_html;

	$(page.main).append(`
		<style>
		.si-cols{display:flex;gap:20px;align-items:flex-start;}
		.si-main{flex:1;min-width:0;}
		.si-side{flex:0 0 340px;display:flex;flex-direction:column;gap:16px;}
		.si-scan{display:flex;gap:10px;align-items:end;margin-bottom:14px;}
		.si-scan .frappe-control{margin:0;flex:0 0 260px;}
		.si-scan .control-label{font-size:11px;color:var(--text-muted);}
		.si-head{display:none;gap:26px;flex-wrap:wrap;background:var(--control-bg);border:1px solid var(--border-color);border-radius:8px;padding:10px 16px;margin-bottom:12px;}
		.si-head .k{font-size:10.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;}
		.si-head .v{font-size:14.5px;font-weight:700;}
		table.si-grid{width:100%;border-collapse:collapse;font-size:13px;background:var(--fg-color);display:none;}
		table.si-grid th{background:var(--control-bg);font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);padding:6px 10px;border:1px solid var(--border-color);text-align:right;}
		table.si-grid th:first-child{text-align:left;}
		table.si-grid td{border:1px solid var(--border-color);padding:5px 10px;text-align:right;}
		table.si-grid td:first-child{text-align:left;font-weight:600;}
		table.si-grid td.mut{color:var(--text-muted);}
		table.si-grid td.low{color:var(--red-600,#c0392b);font-weight:700;}
		table.si-grid input{width:76px;border:1px solid var(--border-color);border-radius:4px;padding:2px 6px;text-align:right;background:var(--control-bg);}
		.si-foot{display:none;margin-top:14px;gap:12px;align-items:center;}
		.si-note{color:var(--text-muted);font-size:12px;margin-top:12px;}
		.si-panel{border:1px solid var(--border-color);border-radius:8px;background:var(--fg-color);overflow:hidden;}
		.si-panel .p-head{background:var(--control-bg);padding:8px 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);display:flex;justify-content:space-between;}
		.si-panel .p-body{max-height:340px;overflow-y:auto;}
		.si-panel table{width:100%;border-collapse:collapse;font-size:12px;}
		.si-panel td{padding:4px 12px;border-top:1px solid var(--border-color);}
		.si-panel td.r{text-align:right;white-space:nowrap;}
		.si-panel .p-empty{padding:14px;text-align:center;color:var(--text-muted);font-size:12px;}
		.si-panel .p-total{font-weight:700;background:var(--control-bg);}
		</style>
		<div class="si-cols">
			<div class="si-main">
				<div class="si-scan"><div class="si-scan-box"></div><div class="si-by-box"></div><button class="btn btn-default si-clear">${__("Clear")}</button></div>
				<div class="si-head">
					<div><div class="k">${__("Card")}</div><div class="v si-bag"></div></div>
					<div><div class="k">${__("Design")}</div><div class="v si-design"></div></div>
					<div><div class="k">${__("Type")}</div><div class="v si-type"></div></div>
					<div><div class="k">${__("Location")}</div><div class="v si-loc"></div></div>
					<div><div class="k">${__("From Warehouse")}</div><div class="v si-wh"></div></div>
				</div>
				<table class="si-grid">
					<thead><tr>
						<th>${__("Stone")}</th><th>${__("Plan (pcs / ct)")}</th><th>${__("Issued (pcs / ct)")}</th>
						<th>${__("Available (ct)")}</th><th>${__("Issue Pcs")}</th><th>${__("Issue Ct")}</th>
					</tr></thead><tbody></tbody>
				</table>
				<div class="si-foot">
					<button class="btn btn-primary si-go">${__("Issue Stones")}</button>
					<button class="btn btn-default si-add">${__("Add Stone")}</button>
					<span class="si-sum text-muted"></span>
				</div>
				<div class="si-note">${__("Scan a card to start. Only the card's BOM STONES show here — gold is issued at Casting. ✎ edits a line (swap the sieve size or change the piece count — the plan carats follow the per-piece average). Add Stone puts a brand-new material on the card; leave its weight blank and the actual issued carats become the plan. Issuing moves the carats from the Stone Issue warehouse into the In Bags pool and writes the card's ledger.")}</div>
			</div>
			<div class="si-side">
				<div class="si-panel si-today-panel" style="display:none;">
					<div class="p-head"><span>${__("Issued Today")}</span><span class="si-today-t"></span></div>
					<div class="p-body si-today-b"></div>
				</div>
				<div class="si-panel">
					<div class="p-head"><span>${__("Stone Issue Stock")}</span><span class="si-stock-t"></span></div>
					<div class="p-body si-stock-b"></div>
				</div>
			</div>
		</div>
	`);
	const root = $(page.main);

	const scan = frappe.ui.form.make_control({
		df: { fieldtype: "Data", label: __("Scan Card"), fieldname: "scan", placeholder: __("scan / type card no. + Enter") },
		parent: root.find(".si-scan-box").get(0), render_input: true,
	});
	scan.refresh();
	scan.$input.on("keydown", (e) => { if (e.key === "Enter") loadCard((scan.$input.val() || "").trim()); });

	// who physically hands the stones over — lands on the ledger + Material Issue record
	const issuedBy = frappe.ui.form.make_control({
		df: { fieldtype: "Link", label: __("Issued By"), fieldname: "issued_by", options: "Employee", reqd: 1,
			get_query: () => ({ filters: { status: "Active" } }) },
		parent: root.find(".si-by-box").get(0), render_input: true,
	});
	issuedBy.refresh();

	// RIGHT PANEL 1 — the picked issuer's day, line by line
	function refreshToday() {
		const emp = issuedBy.get_value();
		if (!emp) { root.find(".si-today-panel").hide(); return; }
		frappe.call({ method: API + ".get_stone_issuer_today", args: { employee: emp } }).then((r) => {
			const t = r.message || {};
			root.find(".si-today-t").text(__("{0} pcs · {1} ct", [t.pcs || 0, (t.ct || 0).toFixed(3)]));
			const rows = (t.lines || []).map((l) => `
				<tr><td>${esc(l.item)}</td><td class="r">${l.pcs} / ${l.ct.toFixed(3)}</td>
				<td class="r">${esc(l.order_bag)}</td>
				<td class="r text-muted">${frappe.datetime.str_to_user(l.time).split(" ").slice(1).join(" ")}</td></tr>`).join("");
			root.find(".si-today-b").html(rows
				? `<table><tbody>${rows}</tbody></table>`
				: `<div class="p-empty">${__("Nothing issued today yet.")}</div>`);
			root.find(".si-today-panel").show();
		});
	}
	issuedBy.$input.on("change awesomplete-selectcomplete", () => setTimeout(refreshToday, 100));

	// RIGHT PANEL 2 — everything in the Stone Issue warehouse
	function refreshStock() {
		frappe.call({ method: API + ".get_stone_issue_stock" }).then((r) => {
			const s = r.message || {};
			root.find(".si-stock-t").text(__("{0} ct", [(s.total_ct || 0).toFixed(3)]));
			const rows = (s.items || []).map((l) => `
				<tr><td>${esc(l.item)}</td><td class="r">${l.ct.toFixed(3)} ct</td></tr>`).join("");
			root.find(".si-stock-b").html(rows
				? `<table><tbody>${rows}</tbody></table>`
				: `<div class="p-empty">${__("The warehouse is empty.")}</div>`);
		});
	}

	function clearAll() {
		S.card = null;
		scan.set_value("");
		root.find(".si-head, table.si-grid, .si-foot").hide();
		scan.$input.focus();
	}
	root.find(".si-clear").on("click", clearAll);

	function loadCard(nm) {
		if (!nm) return;
		frappe.call({ method: API + ".get_stone_issue_card", args: { barcode: nm } }).then((r) => {
			if (!r.message) return;
			S.card = r.message;
			paint();
		});
	}

	function paint() {
		const c = S.card;
		root.find(".si-bag").text(c.order_bag);
		root.find(".si-design").text(c.design || "—");
		root.find(".si-type").text(c.design_type || "—");
		root.find(".si-loc").text(c.location || "—");
		root.find(".si-wh").text(c.warehouse);
		root.find("table.si-grid tbody").html(c.lines.map((l, i) => `
			<tr data-i="${i}">
				<td>${esc(l.item)} <span class="text-muted">(${esc(l.stone_type)})</span>
					<button class="btn btn-xs btn-default si-edit" title="${__("Edit this line — swap the stone or change the piece count")}">✎</button></td>
				<td class="mut">${l.plan_pcs} / ${l.plan_ct.toFixed(3)}</td>
				<td class="mut">${l.issued_pcs} / ${l.issued_ct.toFixed(3)}</td>
				<td class="${l.available_ct <= 0 ? "low" : ""}">${l.available_ct.toFixed(3)}</td>
				<td><input type="number" class="si-pcs" min="0" step="1" placeholder="0"></td>
				<td><input type="number" class="si-ct" min="0" step="0.001" placeholder="0.000"></td>
			</tr>`).join(""));
		root.find(".si-head").css("display", "flex");
		root.find("table.si-grid").show();
		root.find(".si-foot").css("display", "flex");
		sum();
		root.find("table.si-grid tbody tr:first .si-pcs").focus();
	}

	function readLines() {
		const out = [];
		root.find("table.si-grid tbody tr").each(function () {
			const i = cint(this.getAttribute("data-i"));
			const pcs = cint($(this).find(".si-pcs").val());
			const ct = flt($(this).find(".si-ct").val());
			if (pcs || ct) out.push({ item: S.card.lines[i].item, pcs, ct });
		});
		return out;
	}

	function sum() {
		const ls = readLines();
		const pcs = ls.reduce((a, l) => a + l.pcs, 0), ct = ls.reduce((a, l) => a + l.ct, 0);
		root.find(".si-sum").text(ls.length ? __("{0} line(s) — {1} pcs, {2} ct", [ls.length, pcs, ct.toFixed(3)]) : "");
	}
	root.on("input", ".si-pcs,.si-ct", sum);

	// Enter walks the grid: Pcs -> Ct -> next row's Pcs -> … -> Issue button
	root.on("keydown", ".si-pcs,.si-ct", function (e) {
		if (e.key !== "Enter") return;
		e.preventDefault();
		const inputs = root.find("table.si-grid tbody input").toArray();
		const next = inputs[inputs.indexOf(this) + 1];
		next ? $(next).focus().select() : root.find(".si-go").focus();
	});

	// ✎ — swap the stone (sieve size doesn't work) and/or change the piece count;
	// when pieces change, the plan carats scale by the line's per-piece average
	root.on("click", ".si-edit", function () {
		const i = cint($(this).closest("tr").attr("data-i"));
		const l = S.card.lines[i];
		const d = new frappe.ui.Dialog({
			title: __("Edit {0}", [l.item]),
			fields: [
				{ fieldname: "to_item", fieldtype: "Link", label: __("Stone"), options: "Item", default: l.item, reqd: 1,
					get_query: () => ({ filters: { stone_type: ["is", "set"] } }),
					description: __("Pick a different size if the plan's doesn't work.") },
				{ fieldname: "pcs", fieldtype: "Int", label: __("Pieces (plan)"), default: l.plan_pcs, reqd: 1,
					description: __("Changing the count scales the plan carats by the per-piece average.") },
			],
			primary_action_label: __("Save"),
			primary_action(v) {
				d.hide();
				frappe.dom.freeze(__("Saving..."));
				frappe.call({ method: API + ".stone_issue_edit", args: {
					order_bag: S.card.order_bag, from_item: l.item, to_item: v.to_item, pcs: v.pcs,
				} }).then((r) => {
					frappe.dom.unfreeze();
					frappe.show_alert({ message: __("Line updated on the card's BOM."), indicator: "green" }, 4);
					S.card = r.message;
					paint();
				}).catch(() => frappe.dom.unfreeze());
			},
		});
		d.show();
	});

	// a stone the design never had — new BOM line; blank weight = plan fills from the actual
	root.on("click", ".si-add", () => {
		const d = new frappe.ui.Dialog({
			title: __("Add Stone — {0}", [S.card.order_bag]),
			fields: [
				{ fieldname: "item", fieldtype: "Link", label: __("Stone"), options: "Item", reqd: 1,
					get_query: () => ({ filters: { stone_type: ["is", "set"] } }) },
				{ fieldname: "pcs", fieldtype: "Int", label: __("Pieces (plan)") },
				{ fieldname: "weight", fieldtype: "Float", label: __("Weight ct (plan)"), precision: 3,
					description: __("Leave blank — the actual carats you issue become the plan.") },
			],
			primary_action_label: __("Add"),
			primary_action(v) {
				d.hide();
				frappe.dom.freeze(__("Adding..."));
				frappe.call({ method: API + ".stone_issue_add", args: {
					order_bag: S.card.order_bag, item: v.item, pcs: v.pcs || 0, weight: v.weight || 0,
				} }).then((r) => {
					frappe.dom.unfreeze();
					frappe.show_alert({ message: __("{0} added to the card's BOM.", [v.item]), indicator: "green" }, 4);
					S.card = r.message;
					paint();
				}).catch(() => frappe.dom.unfreeze());
			},
		});
		d.show();
	});

	root.find(".si-go").on("click", () => {
		const lines = readLines();
		if (!lines.length) return frappe.msgprint(__("Enter a Qty + Carat weight on at least one stone line."));
		const bad = lines.find((l) => !(l.pcs > 0) || !(l.ct > 0));
		if (bad) return frappe.msgprint(__("{0}: enter both a Qty (pcs) and a Carat weight.", [bad.item]));
		const by = issuedBy.get_value();
		if (!by) return frappe.msgprint(__("Pick who is issuing these stones."));
		const ct = lines.reduce((a, l) => a + l.ct, 0);
		frappe.confirm(__("Issue <b>{0} ct</b> across {1} line(s) into <b>{2}</b>?", [ct.toFixed(3), lines.length, S.card.order_bag]), () => {
			frappe.dom.freeze(__("Issuing..."));
			frappe.call({ method: API + ".stone_issue_apply", args: { order_bag: S.card.order_bag, lines, issued_by: by } })
				.then((r) => {
					frappe.dom.unfreeze();
					frappe.show_alert({ message: __("Stones issued into {0}.", [S.card.order_bag]), indicator: "green" }, 5);
					S.card = r.message; // refreshed issued/available numbers
					paint();
					refreshToday();
					refreshStock();
				})
				.catch(() => frappe.dom.unfreeze());
		});
	});

	clearAll();
	refreshStock();
};
