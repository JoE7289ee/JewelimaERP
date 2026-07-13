// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Stone Issue (Manufacturing > Issue) — the stone-issuing control station.
// Scan a card to start; the card's BOM stone lines appear (metals never do).
// Enter Qty (pcs) + Carat weight per line and hit Issue: each line writes a
// Bag Material Ledger 'Stone Issue' row and moves the real stock
// Stone Issue warehouse -> In Bags. Route: /app/stone-issue

frappe.pages["stone-issue"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Stone Issue", single_column: true });
	const API = "jewelima.jewelima.api";
	const S = { card: null };
	const esc = frappe.utils.escape_html;

	$(page.main).append(`
		<style>
		.si-wrap{max-width:980px;}
		.si-scan{display:flex;gap:10px;align-items:end;margin-bottom:14px;}
		.si-scan .frappe-control{margin:0;flex:0 0 300px;}
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
		</style>
		<div class="si-wrap">
			<div class="si-scan"><div class="si-scan-box"></div><button class="btn btn-default si-clear">${__("Clear")}</button></div>
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
			<div class="si-foot"><button class="btn btn-primary si-go">${__("Issue Stones")}</button><span class="si-sum text-muted"></span></div>
			<div class="si-note">${__("Scan a card to start. Only the card's BOM STONES show here — gold is issued at Casting. Issuing moves the carats from the Stone Issue warehouse into the In Bags pool and writes the card's ledger.")}</div>
		</div>
	`);
	const root = $(page.main);

	const scan = frappe.ui.form.make_control({
		df: { fieldtype: "Data", label: __("Scan Card"), fieldname: "scan", placeholder: __("scan / type card no. + Enter") },
		parent: root.find(".si-scan-box").get(0), render_input: true,
	});
	scan.refresh();
	scan.$input.on("keydown", (e) => { if (e.key === "Enter") loadCard((scan.$input.val() || "").trim()); });

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
				<td>${esc(l.item)} <span class="text-muted">(${esc(l.stone_type)})</span></td>
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

	root.find(".si-go").on("click", () => {
		const lines = readLines();
		if (!lines.length) return frappe.msgprint(__("Enter a Qty + Carat weight on at least one stone line."));
		const bad = lines.find((l) => !(l.pcs > 0) || !(l.ct > 0));
		if (bad) return frappe.msgprint(__("{0}: enter both a Qty (pcs) and a Carat weight.", [bad.item]));
		const ct = lines.reduce((a, l) => a + l.ct, 0);
		frappe.confirm(__("Issue <b>{0} ct</b> across {1} line(s) into <b>{2}</b>?", [ct.toFixed(3), lines.length, S.card.order_bag]), () => {
			frappe.dom.freeze(__("Issuing..."));
			frappe.call({ method: API + ".stone_issue_apply", args: { order_bag: S.card.order_bag, lines } })
				.then((r) => {
					frappe.dom.unfreeze();
					frappe.show_alert({ message: __("Stones issued into {0}.", [S.card.order_bag]), indicator: "green" }, 5);
					S.card = r.message; // refreshed issued/available numbers
					paint();
				})
				.catch(() => frappe.dom.unfreeze());
		});
	});

	clearAll();
};
