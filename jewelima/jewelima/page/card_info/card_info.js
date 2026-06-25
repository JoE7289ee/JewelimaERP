// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Card Info — scan a card to see everything about it: where it is, where it
// travelled, who worked on it, plan vs actual weights, current contents. Pretty,
// with a Print option. Route: /app/card-info

frappe.pages["card-info"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Card Info", single_column: true });
	const state = { data: null };

	const CSS = `
	.ci-wrap{max-width:880px;}
	.ci-head{display:flex;justify-content:space-between;align-items:flex-start;border:1px solid #e2e6ea;border-radius:10px;padding:14px 18px;background:#fff;margin-bottom:14px;}
	.ci-code{font-size:24px;font-weight:800;letter-spacing:.5px;}
	.ci-sub{color:#6b7785;font-size:13px;margin-top:3px;}
	.ci-badge{display:inline-block;padding:3px 10px;border-radius:14px;font-size:12px;font-weight:700;margin-top:8px;}
	.ci-badge.prod{background:#eaf6ec;color:#1d7a33;}
	.ci-badge.wip{background:#eef2f7;color:#5a6b7b;}
	.ci-loc{font-size:12px;color:#8a96a3;text-align:right;}
	.ci-loc b{font-size:18px;color:#222;display:block;margin-top:2px;}
	.ci-sec{border:1px solid #e2e6ea;border-radius:10px;padding:12px 18px;background:#fff;margin-bottom:14px;}
	.ci-sec h4{margin:0 0 10px;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#6b7785;}
	.ci-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px 18px;font-size:13px;}
	.ci-grid .k{color:#8a96a3;font-size:11px;}
	.ci-grid .v{font-weight:600;}
	table.ci-tbl{width:100%;border-collapse:collapse;font-size:12.5px;}
	table.ci-tbl th,table.ci-tbl td{border:1px solid #e2e6ea;padding:5px 9px;text-align:left;}
	table.ci-tbl th{background:#f6f8fa;font-weight:700;}
	table.ci-tbl td.num,table.ci-tbl th.num{text-align:right;}
	.ci-trail{list-style:none;padding:0;margin:0;font-size:13px;}
	.ci-trail li{padding:4px 0;border-bottom:1px dashed #e2e6ea;}
	.ci-trail .ar{color:#8a96a3;}
	.ci-empty{color:#8a96a3;padding:10px 0;text-align:center;}
	`;

	$(page.main).append(`<style>${CSS}</style>
		<div class="ci-bar" style="max-width:420px;margin:2px 0 14px;"></div>
		<div class="ci-out ci-wrap"></div>`);

	const scan = frappe.ui.form.make_control({
		df: { fieldtype: "Data", label: "Scan Order Bag", fieldname: "scan", description: "Scan a card to see its full history." },
		parent: $(page.main).find(".ci-bar").get(0), render_input: true,
	});
	scan.refresh();
	const $out = $(page.main).find(".ci-out");
	const esc = frappe.utils.escape_html;
	const flt = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));
	const num = (v) => (v ? flt(v).toFixed(3) : "—");
	const focusScan = () => setTimeout(() => scan.$input.focus(), 30);

	function buildHTML(d) {
		const b = d.bag;
		const cell = (k, v) => `<div><div class="k">${k}</div><div class="v">${esc(v == null || v === "" ? "—" : "" + v)}</div></div>`;
		const wrow = (lbl, plan, act) => `<tr><td>${lbl}</td><td class="num">${plan}</td><td class="num">${act}</td></tr>`;
		const contents = (d.contents.items || []).map((m) => `<tr><td>${esc(m.item)}</td><td class="num">${m.pcs || ""}</td><td class="num">${m.qty}</td><td>${esc(m.uom || "")}</td></tr>`).join("") || `<tr><td colspan="4" class="ci-empty">Empty</td></tr>`;
		const trail = (d.transfers || []).map((t, i) => `<li>${i + 1}. <b>${esc(t.from_location || "—")}</b> <span class="ar">&rarr;</span> <b>${esc(t.to_location || "")}</b> &middot; ${t.transfer_time ? frappe.datetime.str_to_user(t.transfer_time) : ""} &middot; ${esc(t.transferred_by || "")}</li>`).join("") || `<li class="ci-empty">No transfers yet.</li>`;
		const stages = (d.stages || []).map((s) => `<tr><td><b>${esc(s.bench || "")}</b></td><td>${esc(s.employee_name || "—")}</td><td>${esc(s.status || "")}</td><td class="num">${s.loss ? flt(s.loss).toFixed(3) : ""}</td></tr>`).join("") || `<tr><td colspan="4" class="ci-empty">No bench activity yet.</td></tr>`;
		const finished = b.is_finished;
		return `
		<div class="ci-head">
			<div>
				<div class="ci-code">${esc(b.name)}</div>
				<div class="ci-sub">${esc(b.design || "")}${b.design_type ? " &middot; " + esc(b.design_type) : ""}${b.item ? " &middot; " + esc(b.item) : ""}</div>
				<span class="ci-badge ${finished ? "prod" : "wip"}">${finished ? "PRODUCT &mdash; " + esc(b.stock_status || "In Stock") : "IN PRODUCTION"}</span>
			</div>
			<div class="ci-loc">Location<b>${esc(b.location || "—")}</b></div>
		</div>
		<div class="ci-sec"><h4>Order</h4><div class="ci-grid">
			${cell("Customer", b.customer || b.held_by)}${cell("Held By", b.held_by)}${cell("Salesman", b.salesman)}${cell("Type", b.order_type)}
			${cell("Qty", b.qty)}${cell("Size", b.size)}${cell("Order Date", b.order_date ? frappe.datetime.str_to_user(b.order_date) : "")}${cell("Due", b.due_date ? frappe.datetime.str_to_user(b.due_date) : "")}
		</div></div>
		<div class="ci-sec"><h4>Weights</h4>
			<table class="ci-tbl"><thead><tr><th>Metric</th><th class="num">Plan</th><th class="num">Actual</th></tr></thead><tbody>
			${wrow("Gross (g)", num(b.gross_weight), num(b.act_gross_weight))}
			${wrow("Nett (g)", num(b.nett_weight), num(b.act_nett_weight))}
			${wrow("Pure (g)", "—", num(b.act_pure_weight))}
			${wrow("Purity (%)", b.purity ? flt(b.purity).toFixed(1) : "—", b.act_purity ? flt(b.act_purity).toFixed(1) : "—")}
			${wrow("DMD No", b.dmd_no || 0, b.act_dmd_no || 0)}
			${wrow("DMD (ct)", num(b.dmd_weight), num(b.act_dmd_weight))}
			${wrow("CS No", b.cs_no || 0, b.act_cs_no || 0)}
			${wrow("CS (ct)", num(b.cs_weight), num(b.act_cs_weight))}
			</tbody></table>
		</div>
		<div class="ci-sec"><h4>Current Contents (in bag)</h4>
			<table class="ci-tbl"><thead><tr><th>Material</th><th class="num">No.</th><th class="num">Qty</th><th>UOM</th></tr></thead><tbody>${contents}</tbody></table>
		</div>
		<div class="ci-sec"><h4>Where it travelled</h4><ul class="ci-trail">${trail}</ul></div>
		<div class="ci-sec"><h4>Who worked on it</h4>
			<table class="ci-tbl"><thead><tr><th>Bench</th><th>Employee</th><th>Status</th><th class="num">Loss (g)</th></tr></thead><tbody>${stages}</tbody></table>
		</div>`;
	}

	function load(code) {
		code = (code || "").trim();
		if (!code) return;
		frappe.call({ method: "jewelima.jewelima.api.get_card_passport", args: { order_bag: code } }).then((r) => {
			const d = r.message || {};
			if (!d.bag) {
				$out.html(`<div class="ci-sec ci-empty">No Order Bag <b>${esc(code)}</b>.</div>`);
				state.data = null;
				return;
			}
			state.data = d;
			$out.html(buildHTML(d));
		});
	}

	function printCard() {
		if (!state.data) return frappe.msgprint(__("Scan a card first."));
		const w = window.open("", "_blank", "width=820,height=940");
		w.document.write(`<html><head><title>${esc(state.data.bag.name)}</title><style>${CSS} body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;padding:18px;color:#222;}</style></head><body>${buildHTML(state.data)}</body></html>`);
		w.document.close();
		w.focus();
		setTimeout(() => w.print(), 350);
	}

	scan.$input.on("keydown", (e) => {
		if (e.which === 13 || e.key === "Enter") {
			e.preventDefault();
			const c = scan.$input.val();
			scan.set_value("");
			load(c);
		}
	});
	page.set_primary_action(__("Print"), printCard, "printer");
	focusScan();
};
