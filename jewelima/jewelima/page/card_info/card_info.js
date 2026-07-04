// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Card Info — scan a card to see everything about it: where it is, where it
// travelled, who worked on it, plan vs actual weights, current contents. Slim +
// printable (Print opens a clean one-page view). Route: /app/card-info

frappe.pages["card-info"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Card Info", single_column: true });
	const state = { data: null };

	const CSS = `
	.ci-wrap{max-width:900px;}
	.ci-img{height:84px;width:84px;object-fit:cover;border-radius:8px;border:1px solid #e2e6ea;margin:0 12px;}
	.ci-head{display:flex;justify-content:space-between;align-items:flex-start;border:1px solid #e2e6ea;border-radius:9px;padding:10px 14px;background:#fff;margin-bottom:8px;}
	.ci-code{font-size:20px;font-weight:800;letter-spacing:.4px;}
	.ci-sub{color:#6b7785;font-size:12px;margin-top:2px;}
	.ci-badge{display:inline-block;padding:2px 9px;border-radius:12px;font-size:11px;font-weight:700;margin-top:6px;}
	.ci-badge.prod{background:#eaf6ec;color:#1d7a33;}
	.ci-badge.wip{background:#eef2f7;color:#5a6b7b;}
	.ci-loc{font-size:11px;color:#8a96a3;text-align:right;}
	.ci-loc b{font-size:16px;color:#222;display:block;margin-top:2px;}
	.ci-sec{border:1px solid #e2e6ea;border-radius:9px;padding:9px 14px;background:#fff;margin-bottom:8px;}
	.ci-sec h4{margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#8a96a3;}
	.ci-kvs{display:flex;flex-wrap:wrap;gap:4px 16px;font-size:12.5px;}
	.ci-kvs .k{color:#8a96a3;}
	.ci-line{font-size:13px;margin:2px 0;}
	.ci-line .tag{display:inline-block;min-width:46px;color:#8a96a3;font-size:11px;font-weight:700;text-transform:uppercase;}
	.ci-line.muted{color:#6b7785;}
	.ci-chain{font-size:13px;line-height:1.7;}
	.ci-chain .ar{color:#b3bdc7;margin:0 3px;}
	table.ci-tbl{width:100%;border-collapse:collapse;font-size:12px;}
	table.ci-tbl th,table.ci-tbl td{border-bottom:1px solid #eef1f4;padding:3px 6px;text-align:left;}
	table.ci-tbl th{color:#8a96a3;font-weight:700;font-size:11px;}
	table.ci-tbl td.num,table.ci-tbl th.num{text-align:right;}
	.ci-empty{color:#8a96a3;}
	`;

	$(page.main).append(`<style>${CSS}</style>
		<div class="ci-bar" style="max-width:420px;margin:2px 0 12px;"></div>
		<div class="ci-out ci-wrap"></div>`);

	const scan = frappe.ui.form.make_control({
		df: { fieldtype: "Data", label: "Scan Order Bag", fieldname: "scan", description: "Scan a card to see its full history." },
		parent: $(page.main).find(".ci-bar").get(0), render_input: true,
	});
	scan.refresh();
	frappe.call({ method: "jewelima.jewelima.api.get_print_branding" }).then((r) => (state.branding = r.message || {}));
	const $out = $(page.main).find(".ci-out");
	const esc = frappe.utils.escape_html;
	const flt = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));
	const g = (v) => flt(v).toFixed(3);
	const focusScan = () => setTimeout(() => scan.$input.focus(), 30);

	// compact weight line, skipping anything zero/empty
	function wline(v, pure) {
		const p = [];
		if (flt(v.gross)) p.push(`Gross <b>${g(v.gross)}</b>g`);
		if (flt(v.nett)) p.push(`Nett <b>${g(v.nett)}</b>g`);
		if (pure && flt(v.pure)) p.push(`Pure <b>${g(v.pure)}</b>g`);
		if (flt(v.purity)) p.push(`<b>${flt(v.purity).toFixed(1)}%</b>`);
		if (v.dmd_no || flt(v.dmd_w)) p.push(`DMD <b>${v.dmd_no || 0}</b>/<b>${g(v.dmd_w)}</b>ct`);
		if (v.ps_no || flt(v.ps_w)) p.push(`PS <b>${v.ps_no || 0}</b>/<b>${g(v.ps_w)}</b>ct`);
		if (v.cs_no || flt(v.cs_w)) p.push(`CS <b>${v.cs_no || 0}</b>/<b>${g(v.cs_w)}</b>ct`);
		return p.join(" &middot; ");
	}

	// forPrint = the concise one-pager (chain + slim tables); screen = everything.
	function buildHTML(d, forPrint) {
		const b = d.bag;
		const kv = (k, v) => (v == null || v === "" ? "" : `<span><span class="k">${k}</span> ${esc("" + v)}</span>`);
		const dt = (v) => (v ? frappe.datetime.str_to_user(v) : "");
		const dtt = (v) => (v ? frappe.datetime.str_to_user(v) + " " + (("" + v).split(" ")[1] || "").slice(0, 5) : "—");
		const finished = b.is_finished;

		const act = wline({ gross: b.act_gross_weight, nett: b.act_nett_weight, pure: b.act_pure_weight, purity: b.act_purity, dmd_no: b.act_dmd_no, dmd_w: b.act_dmd_weight, ps_no: b.act_ps_no, ps_w: b.act_ps_weight, cs_no: b.act_cs_no, cs_w: b.act_cs_weight }, true);
		const plan = wline({ gross: b.gross_weight, nett: b.nett_weight, purity: b.purity, dmd_no: b.dmd_no, dmd_w: b.dmd_weight, ps_no: b.ps_no, ps_w: b.ps_weight, cs_no: b.cs_no, cs_w: b.cs_weight }, false);

		const contents = (d.contents.items || []).map((m) => `${esc(m.item)} <b>${m.pcs ? m.pcs + " / " : ""}${m.qty} ${esc(m.uom || "")}</b>`).join(" &middot; ") || '<span class="ci-empty">Empty</span>';

		// travel: print = the compact location chain; screen = the full trail with when/who
		let travel = '<span class="ci-empty">No transfers yet.</span>';
		if ((d.transfers || []).length) {
			if (forPrint) {
				const locs = [d.transfers[0].from_location || "—"].concat(d.transfers.map((t) => t.to_location || ""));
				travel = locs.map((l) => `<b>${esc(l)}</b>`).join('<span class="ar">&rarr;</span>');
			} else {
				travel = `<table class="ci-tbl"><thead><tr><th>From</th><th>To</th><th>When</th><th>By</th></tr></thead><tbody>${d.transfers
					.map((t) => `<tr><td>${esc(t.from_location || "—")}</td><td><b>${esc(t.to_location || "")}</b></td><td>${dtt(t.transfer_time)}</td><td>${esc(t.transferred_by || "")}</td></tr>`)
					.join("")}</tbody></table>`;
			}
		}

		// bench work: print = slim (bench/employee/status/loss, active rows only);
		// screen = every stage with in/out times and weights
		let stageTbl = '<span class="ci-empty">No bench work yet.</span>';
		if (forPrint) {
			const stages = (d.stages || []).filter((s) => s.employee_name || flt(s.loss) || (s.status && s.status !== "In Queue"));
			const rows = stages.map((s) => `<tr><td><b>${esc(s.bench || "")}</b></td><td>${esc(s.employee_name || "—")}</td><td>${esc(s.status || "")}</td><td class="num">${flt(s.loss) ? g(s.loss) : ""}</td></tr>`).join("");
			if (rows) stageTbl = `<table class="ci-tbl"><thead><tr><th>Bench</th><th>Employee</th><th>Status</th><th class="num">Loss</th></tr></thead><tbody>${rows}</tbody></table>`;
		} else if ((d.stages || []).length) {
			const rows = d.stages.map((s) => `<tr>
				<td><b>${esc(s.bench || "")}</b></td><td>${esc(s.employee_name || "—")}</td><td>${esc(s.status || "")}</td>
				<td>${dtt(s.issued_at || s.time_in)}</td><td>${dtt(s.receipted_at || s.time_out)}</td>
				<td class="num">${flt(s.weight_out) ? g(s.weight_out) : ""}</td>
				<td class="num">${flt(s.weight_in) ? g(s.weight_in) : ""}</td>
				<td class="num">${flt(s.loss) ? "<b>" + g(s.loss) + "</b>" : ""}</td></tr>`).join("");
			stageTbl = `<table class="ci-tbl"><thead><tr><th>Bench</th><th>Employee</th><th>Status</th><th>In</th><th>Out</th><th class="num">Wt Out</th><th class="num">Wt In</th><th class="num">Loss</th></tr></thead><tbody>${rows}</tbody></table>`;
		}

		const img = !forPrint && b.image ? `<img class="ci-img" src="${encodeURI(b.image)}" onerror="this.style.display='none'">` : "";
		const extraKvs = forPrint ? "" : `${kv("Job Order", b.job_order)}${kv("Customer Date", dt(b.customer_date))}${kv("Held By", b.held_by)}`;
		const narration = !forPrint && b.narration ? `<div class="ci-sec"><h4>Remark</h4><div class="ci-line">${esc(b.narration)}</div></div>` : "";

		return `
		<div class="ci-head">
			<div>
				<div class="ci-code">${esc(b.name)}</div>
				<div class="ci-sub">${esc(b.design || "")}${b.design_type ? " &middot; " + esc(b.design_type) : ""}${b.item ? " &middot; " + esc(b.item) : ""}</div>
				<span class="ci-badge ${finished ? "prod" : "wip"}">${finished ? "PRODUCT &mdash; " + esc(b.stock_status || "In Stock") : "IN PRODUCTION"}</span>
			</div>
			${img}
			<div class="ci-loc">Location<b>${esc(b.location || "—")}</b></div>
		</div>
		<div class="ci-sec"><div class="ci-kvs">
			${kv("Customer", b.customer || b.held_by)}${kv("Salesman", b.salesman)}${kv("Type", b.order_type)}
			${kv("Qty", b.qty)}${kv("Size", b.size)}${kv("Ordered", dt(b.order_date))}${kv("Due", dt(b.due_date))}
			${extraKvs}
		</div></div>
		<div class="ci-sec"><h4>Weights</h4>
			${act ? `<div class="ci-line"><span class="tag">Actual</span> ${act}</div>` : ""}
			${plan ? `<div class="ci-line muted"><span class="tag">Plan</span> ${plan}</div>` : ""}
			${!act && !plan ? '<span class="ci-empty">—</span>' : ""}
		</div>
		<div class="ci-sec"><h4>Contents</h4><div class="ci-line">${contents}</div></div>
		${narration}
		<div class="ci-sec"><h4>Where it travelled</h4><div class="ci-chain">${travel}</div></div>
		<div class="ci-sec"><h4>Who worked on it</h4>${stageTbl}</div>`;
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
		const title = "Card " + state.data.bag.name;
		if (window.jewelima && jewelima.print_window) {
			// shared branded header/footer + this page's CSS — CONCISE print layout
			jewelima.print_window(state.branding || {}, title, buildHTML(state.data, true), CSS);
			return;
		}
		const w = window.open("", "_blank", "width=780,height=900");
		w.document.write(`<html><head><title>${esc(state.data.bag.name)}</title><style>${CSS} body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;padding:14px;color:#222;}</style></head><body>${buildHTML(state.data, true)}</body></html>`);
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
