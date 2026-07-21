// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Prepare for Sale — the two-step sale. Build a priced list against the party's
// Price Chart (scan pieces; every chart guard applies), edit any value cell —
// the chart price is kept and the change is recorded (who + remark), export the
// confirmation excel for the party, mark it Sent, and only when they confirm
// hit SELL: stock moves, bags go Sold, the Product Sale carries the override
// trail. Route: /app/prepare-sale

frappe.pages["prepare-sale"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Prepare for Sale", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const money = (v) => (flt(v) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
	const VF = ["gold_value", "diamond_value", "stone_value", "labour_value", "charges_value"];
	let cur = null;

	$(page.main).append(`
		<style>
		.ps-cols{display:flex;gap:20px;align-items:flex-start;}
		.ps-left{flex:0 0 280px;}
		.ps-right{flex:1;min-width:0;}
		.ps-list{border:1px solid var(--border-color);border-radius:8px;background:var(--fg-color);overflow:auto;max-height:calc(100vh - 180px);}
		.ps-li{padding:9px 14px;border-bottom:1px solid var(--border-color);cursor:pointer;}
		.ps-li:hover,.ps-li.on{background:var(--control-bg);}
		.ps-li .t{font-weight:700;display:flex;justify-content:space-between;}
		.ps-li .s{font-size:11px;color:var(--text-muted);display:flex;justify-content:space-between;}
		.ps-st{font-size:10px;font-weight:700;border-radius:8px;padding:1px 8px;color:#fff;}
		.ps-st.Draft{background:#7f8c8d;}.ps-st.Sent{background:#1f618d;}.ps-st.Sold{background:#2e7d32;}.ps-st.Cancelled{background:#b02a2a;}
		.ps-ed{border:1px solid var(--border-color);border-radius:8px;background:var(--fg-color);padding:16px 20px;display:none;}
		.ps-head{display:flex;gap:18px;flex-wrap:wrap;align-items:baseline;margin-bottom:8px;}
		.ps-head .nm{font-size:19px;font-weight:800;}
		.ps-scanrow{display:flex;gap:10px;align-items:end;margin:10px 0;}
		.ps-scanrow .frappe-control{margin:0;flex:0 0 240px;}
		table.ps-t{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.ps-t th{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);padding:4px 6px;border-bottom:1px solid var(--border-color);text-align:right;}
		table.ps-t th:first-child{text-align:left;}
		table.ps-t td{padding:4px 6px;border-bottom:1px solid var(--border-color);text-align:right;}
		table.ps-t td:first-child{text-align:left;font-weight:600;}
		table.ps-t input.v{width:86px;border:1px solid var(--border-color);border-radius:4px;padding:2px 6px;text-align:right;background:var(--control-bg);}
		table.ps-t td.ov input.v{border-color:#b35a00;background:rgba(230,126,34,.08);}
		table.ps-t .del{cursor:pointer;color:#b02a2a;font-weight:700;}
		.ps-tot{margin-top:10px;font-size:16px;font-weight:800;text-align:right;}
		.ps-actions{margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;}
		.ps-ovnote{font-size:11.5px;color:#b35a00;margin-top:6px;}
		.ps-hint{color:var(--text-muted);font-size:12px;margin-top:12px;}
		</style>
		<div class="ps-cols">
			<div class="ps-left"><div class="ps-list"></div></div>
			<div class="ps-right"><div class="ps-ed"></div>
				<div class="ps-hint ps-pick">${__("Pick a preparation or start one with New Preparation above.")}</div></div>
		</div>
	`);
	const root = $(page.main);
	page.set_primary_action(__("New Preparation"), newPrep, "add");

	function loadList(sel) {
		frappe.call({ method: API + ".get_sale_preparations" }).then((r) => {
			const preps = (r.message || {}).preps || [];
			root.find(".ps-list").html(preps.map((p) => `
				<div class="ps-li ${cur && cur.name === p.name ? "on" : ""}" data-name="${esc(p.name)}">
					<div class="t"><span>${esc(p.customer)}</span><span class="ps-st ${esc(p.status)}">${esc(p.status)}</span></div>
					<div class="s"><span>${esc(p.name)} · ${esc(p.price_chart || "")}</span><span>₹ ${money(p.grand_total)}</span></div>
				</div>`).join("") || `<div style="padding:16px;color:var(--text-muted);font-size:12.5px;">${__("Nothing prepared yet.")}</div>`);
			if (sel) open(sel);
		});
	}
	root.on("click", ".ps-li", function () { open($(this).data("name")); });

	function newPrep() {
		const dlg = new frappe.ui.Dialog({
			title: __("New Sale Preparation"),
			fields: [
				{ fieldname: "customer", fieldtype: "Link", label: __("Party"), options: "Customer", reqd: 1 },
				{ fieldname: "price_chart", fieldtype: "Link", label: __("Price Chart"), options: "Price Chart", reqd: 1,
					get_query: () => ({ filters: { status: "Active" } }) },
				{ fieldname: "gold_rate", fieldtype: "Float", label: __("Gold Rate /g"), reqd: 1 },
			],
			primary_action_label: __("Create"),
			primary_action(v) {
				dlg.hide();
				frappe.call({ method: API + ".create_sale_preparation", args: v })
					.then((r) => loadList((r.message || {}).name));
			},
		});
		// party's default chart prefills
		dlg.fields_dict.customer.$input.on("change", () => setTimeout(() => {
			const c = dlg.get_value("customer");
			if (c) frappe.db.get_value("Customer", c, "default_price_chart").then((r) => {
				const pc = (r.message || {}).default_price_chart;
				if (pc && !dlg.get_value("price_chart")) dlg.set_value("price_chart", pc);
			});
		}, 100));
		dlg.show();
	}

	function open(name) {
		frappe.call({ method: API + ".get_sale_preparation", args: { name } }).then((r) => {
			cur = r.message;
			root.find(".ps-li").removeClass("on").filter(`[data-name="${cur.name}"]`).addClass("on");
			paint();
		});
	}

	function paint() {
		const locked = !(cur.status === "Draft" || cur.status === "Sent");
		root.find(".ps-pick").hide();
		const ovs = cur.items.filter((i) => i.overridden);
		root.find(".ps-ed").show().html(`
			<div class="ps-head">
				<span class="nm">${esc(cur.customer)}</span>
				<span class="ps-st ${esc(cur.status)}">${esc(cur.status)}</span>
				<span style="color:var(--text-muted);">${esc(cur.name)} · ${esc(cur.price_chart)} · ${__("gold")} ₹${money(cur.gold_rate)}/g</span>
				${cur.sale ? `<a href="/app/product-sale/${encodeURIComponent(cur.sale)}">${esc(cur.sale)}</a>` : ""}
			</div>
			${locked ? "" : `<div class="ps-scanrow"><div class="ps-scan"></div>
				<span style="font-size:11.5px;color:var(--text-muted);">${__("scan / type card no. + Enter — chart guards apply")}</span></div>`}
			<table class="ps-t"><thead><tr>
				<th>${__("Card")}</th><th>${__("Nett g")}</th><th>${__("Dmd ct")}</th><th>${__("Sol ct")}</th>
				<th>${__("Gold")}</th><th>${__("Diamond")}</th><th>${__("Stone")}</th><th>${__("Labour")}</th><th>${__("Charges")}</th>
				<th>${__("Total")}</th>${locked ? "" : "<th></th>"}
			</tr></thead><tbody>
				${cur.items.map((it) => `<tr data-row="${esc(it.row)}">
					<td>${esc(it.order_bag)}${it.overridden ? ' <span title="' + esc(__("chart {0} — changed by {1} {2}", [it.chart_gold + it.chart_diamond + it.chart_stone + it.chart_labour + it.chart_charges, it.changed_by, it.override_remark])) + '" style="color:#b35a00;">✎</span>' : ""}</td>
					<td>${it.nett}</td><td>${it.dmd_ct}</td><td>${it.solitaire_ct || ""}</td>
					${VF.map((f) => {
						const ch = it["chart_" + f.replace("_value", "")];
						const ov = Math.abs(flt(it[f]) - flt(ch)) > 0.005;
						return `<td class="${ov ? "ov" : ""}" title="${__("chart: {0}", [money(ch)])}">${locked ? money(it[f])
							: `<input class="v" data-f="${f}" type="number" step="1" value="${flt(it[f])}">`}</td>`;
					}).join("")}
					<td><b>₹ ${money(it.piece_total)}</b></td>
					${locked ? "" : '<td class="del">&times;</td>'}
				</tr>`).join("") || `<tr><td colspan="11" style="text-align:left;color:var(--text-muted);padding:14px;">${__("Scan the first piece.")}</td></tr>`}
			</tbody></table>
			${ovs.length ? `<div class="ps-ovnote">${__("{0} line(s) manually changed — the sale will record chart vs sold vs who.", [ovs.length])}</div>` : ""}
			<div class="ps-tot">${__("GRAND TOTAL")} — ₹ ${money(cur.grand_total)}</div>
			<div class="ps-actions">
				<button class="btn btn-default ps-xlsx">${__("Export Confirmation Excel")}</button>
				${cur.status === "Draft" ? `<button class="btn btn-default ps-sent">${__("Mark Sent to Party")}</button>` : ""}
				${cur.status !== "Sold" && cur.status !== "Cancelled" ? `
					<button class="btn btn-primary ps-sell" style="background:#2e7d32;border-color:#2e7d32;">${__("SELL — move stock")}</button>
					<button class="btn btn-default ps-cancel" style="color:#b02a2a;">${__("Cancel")}</button>` : ""}
			</div>
		`);
		if (!locked) {
			const scan = frappe.ui.form.make_control({
				df: { fieldtype: "Data", label: __("Scan piece"), fieldname: "scan" },
				parent: root.find(".ps-scan").get(0), render_input: true });
			scan.refresh();
			scan.$input.on("keydown", (e) => {
				if (e.key !== "Enter") return;
				const v = (scan.$input.val() || "").trim();
				if (!v) return;
				frappe.call({ method: API + ".prep_add_piece", args: { name: cur.name, barcode: v } })
					.then((r) => { cur = r.message; paint(); loadList(); });
			});
			setTimeout(() => scan.$input.focus(), 100);
		}
	}

	// value edits: blur commits, with an optional remark prompt on real changes
	root.on("change", "table.ps-t input.v", function () {
		const row = $(this).closest("tr").data("row");
		const f = $(this).data("f");
		const val = flt($(this).val());
		const it = cur.items.find((x) => x.row === row);
		const chart = flt(it["chart_" + f.replace("_value", "")]);
		const commit = (remark) => frappe.call({ method: API + ".prep_set_line",
			args: { name: cur.name, row, field: f, value: val, remark } })
			.then((r) => { cur = r.message; paint(); loadList(); });
		if (Math.abs(val - chart) > 0.005) {
			frappe.prompt([{ fieldname: "rm", fieldtype: "Data", label: __("Remark (why the change?)") }],
				(v2) => commit(v2.rm || ""), __("Chart price is {0} — recording the change under your name", [money(chart)]), __("Record"));
		} else commit(null);
	});
	root.on("click", "table.ps-t .del", function () {
		frappe.call({ method: API + ".prep_remove_line", args: { name: cur.name, row: $(this).closest("tr").data("row") } })
			.then((r) => { cur = r.message; paint(); loadList(); });
	});
	root.on("click", ".ps-xlsx", () => open_url_post("/api/method/jewelima.jewelima.api.export_sale_prep_xlsx", { name: cur.name }));
	root.on("click", ".ps-sent", () => frappe.call({ method: API + ".prep_set_status", args: { name: cur.name, status: "Sent" } }).then(() => open(cur.name) || loadList()));
	root.on("click", ".ps-cancel", () => frappe.confirm(__("Cancel {0}?", [cur.name]),
		() => frappe.call({ method: API + ".prep_set_status", args: { name: cur.name, status: "Cancelled" } }).then(() => { open(cur.name); loadList(); })));
	root.on("click", ".ps-sell", () => {
		frappe.confirm(__("Sell {0} piece(s) to <b>{1}</b> for <b>₹ {2}</b>? Stock moves out and the bags go SOLD.",
			[cur.items.length, esc(cur.customer), money(cur.grand_total)]), () => {
			frappe.dom.freeze(__("Selling..."));
			frappe.call({ method: API + ".sell_preparation", args: { name: cur.name } })
				.then((r) => {
					frappe.dom.unfreeze();
					frappe.show_alert({ message: __("Sold — {0}.", [(r.message || {}).name]), indicator: "green" }, 5);
					open(cur.name); loadList();
				}).catch(() => frappe.dom.unfreeze());
		});
	});

	loadList();
};
