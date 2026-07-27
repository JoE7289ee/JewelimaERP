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
	.ci-wrap{max-width:none;width:100%;}
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
		[["DMD", "dmd"], ["PS", "ps"], ["CS", "cs"], ["CZ", "cz"], ["CVD", "cvd"], ["PDMD", "pdmd"], ["POTH", "poth"]].forEach(([lb, b]) => {
			if (v[b + "_no"] || flt(v[b + "_w"])) p.push(`${lb} <b>${v[b + "_no"] || 0}</b>/<b>${g(v[b + "_w"])}</b>ct`);
		});
		return p.join(" &middot; ");
	}

	// forPrint = the concise one-pager (chain + slim tables); screen = everything.
	function buildHTML(d, forPrint) {
		const b = d.bag;
		const kv = (k, v) => (v == null || v === "" ? "" : `<span><span class="k">${k}</span> ${esc("" + v)}</span>`);
		const dt = (v) => (v ? frappe.datetime.str_to_user(v) : "");
		const dtt = (v) => (v ? frappe.datetime.str_to_user(v) + " " + (("" + v).split(" ")[1] || "").slice(0, 5) : "—");
		const finished = b.is_finished;

		const bkt = (src, pre) => {
			const o = {};
			["dmd", "ps", "cs", "cz", "cvd", "pdmd", "poth"].forEach((k) => { o[k + "_no"] = src[pre + k + "_no"]; o[k + "_w"] = src[pre + k + "_weight"]; });
			return o;
		};
		const act = wline({ gross: b.act_gross_weight, nett: b.act_nett_weight, pure: b.act_pure_weight, purity: b.act_purity, ...bkt(b, "act_") }, true);
		const plan = wline({ gross: b.gross_weight, nett: b.nett_weight, purity: b.purity, ...bkt(b, "") }, false);

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
				<td>${esc(s.work_type || "")}</td><td>${esc(s.collection_state || "")}</td>
				<td>${dtt(s.issued_at || s.time_in)}</td><td>${dtt(s.receipted_at || s.time_out)}</td>
				<td class="num">${flt(s.weight_out) ? g(s.weight_out) : ""}</td>
				<td class="num">${flt(s.weight_in) ? g(s.weight_in) : ""}</td>
				<td class="num">${flt(s.loss) ? "<b>" + g(s.loss) + "</b>" : ""}</td></tr>`).join("");
			stageTbl = `<table class="ci-tbl"><thead><tr><th>Bench</th><th>Employee</th><th>Status</th><th>Work</th><th>State</th><th>In</th><th>Out</th><th class="num">Wt Out</th><th class="num">Wt In</th><th class="num">Loss</th></tr></thead><tbody>${rows}</tbody></table>`;
		}

		// issue details — who issued what stones/gold into this card and when
		let issueTbl = '<span class="ci-empty">Nothing issued yet.</span>';
		if ((d.issues || []).length) {
			const rows = d.issues.map((r) => {
				const sign = r.direction === "Out" ? "−" : "";
				const uom = r.stone_type ? "ct" : "g";
				return `<tr>
					<td>${r.entry_type === "Stone Issue" ? "Stone" : "Gold"}</td>
					<td><b>${esc(r.item)}</b>${r.stone_type ? ` <span class="muted">(${esc(r.stone_type)})</span>` : ""}</td>
					<td class="num">${r.pcs ? r.pcs + " / " : ""}${sign}${flt(r.qty).toFixed(3)} ${uom}</td>
					<td>${esc(r.who || "—")}</td><td>${r.datetime ? frappe.datetime.str_to_user(r.datetime) : "—"}</td></tr>`;
			}).join("");
			issueTbl = `<table class="ci-tbl"><thead><tr><th>What</th><th>Item</th><th class="num">Qty</th><th>Issued By</th><th>When</th></tr></thead><tbody>${rows}</tbody></table>`;
		}

		const img = !forPrint && b.image ? `<img class="ci-img" src="${encodeURI(b.image)}" onerror="this.style.display='none'">` : "";
		const extraKvs = forPrint ? "" : `${kv("Job Order", b.job_order)}${kv("Tree", b.tree)}${kv("Party Date", dt(b.customer_date))}${kv("Held By", b.held_by)}`;
		const narration = !forPrint && b.narration ? `<div class="ci-sec"><h4>Remark</h4><div class="ci-line">${esc(b.narration)}</div></div>` : "";

		// ---- everything else we hold (screen only) ---------------------------
		const ex = d.extras || {};
		const chips = [];
		if (b.huid) chips.push(`HUID <b>${esc(b.huid)}</b>`);
		if (b.certifications) chips.push(`Certs <b>${esc(b.certifications)}</b>`);
		if ((ex.charge_categories || []).length) chips.push(`Tags <b>${ex.charge_categories.map(esc).join(", ")}</b>`);
		const identity = !forPrint && chips.length ? `<div class="ci-sec"><h4>Identity</h4><div class="ci-line">${chips.join(" &middot; ")}</div></div>` : "";

		const flags = [];
		if (b.stone_issue) flags.push(`<span style="color:#9a6700;font-weight:700;">AWAITING STONES</span> since ${dtt(b.stone_issue_on)}`);
		if (b.stone_oos) flags.push(`<span style="color:#b02a2a;font-weight:700;">OUT OF STOCK</span> ${esc(b.stone_oos_note || "")} (${dtt(b.stone_oos_on)})`);
		if (ex.bench_now && ex.bench_now.queue_reason) flags.push(`Reason <b>${esc(ex.bench_now.queue_reason)}</b>`);
		const pr = ex.priority || {};
		if (pr.manual) flags.push(`<span style="color:#d63031;font-weight:700;">MANUAL PRIORITY #${pr.manual}</span>`);
		else if (pr.bench_rank) flags.push(`Bench rank <b>P${pr.bench_rank}</b>`);
		if (ex.bench_now && ex.bench_now.status) flags.push(`Bench status <b>${esc(ex.bench_now.status)}</b>${ex.bench_now.employee_name ? " &middot; " + esc(ex.bench_now.employee_name) : ""}${ex.bench_now.work_type ? " &middot; " + esc(ex.bench_now.work_type) : ""}`);
		if ((ex.preps || []).length) flags.push(`On prepared bill <b>${ex.preps.map(esc).join(", ")}</b>`);
		const standing = !forPrint && flags.length ? `<div class="ci-sec"><h4>Standing</h4><div class="ci-line">${flags.join(" &middot; ")}</div></div>` : "";

		const cadSec = !forPrint && b.is_cad ? `<div class="ci-sec"><h4>CAD request</h4><div class="ci-line">
			${esc(b.cad_design_type || "")} &middot; ${esc(b.cad_karat || "")} &middot; gold ${esc(b.cad_gold_weight || "")} &middot; dmd ${esc(b.cad_diamond_weight || "")} ct &middot; ${b.cad_stone_no || 0} stones${b.cad_reference ? " &middot; ref " + esc(b.cad_reference) : ""}</div></div>` : "";

		let saleSec = "";
		if (!forPrint && ex.sale) {
			const sv = ex.sale;
			const money = (v) => "&#8377;" + (flt(v) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 });
			saleSec = `<div class="ci-sec"><h4>Sold</h4><div class="ci-line">
				<a href="/app/product-sale/${encodeURIComponent(sv.parent)}"><b>${esc(sv.parent)}</b></a>
				&middot; ${esc(sv.customer)} &middot; ${sv.sale_date ? frappe.datetime.str_to_user(sv.sale_date) : ""}
				&middot; ${esc(sv.chart_name || "")} @ ${sv.gold_rate}</div>
				<div class="ci-line">Gold ${money(sv.gold_value)} &middot; DMD ${money(sv.diamond_value)} &middot; Stones ${money(sv.stone_value)}
				&middot; Labour ${money(sv.labour_value)} &middot; Charges ${money(sv.charges_value)}
				&middot; <b>Piece ${money(sv.piece_total)}</b>${sv.tax_percent ? " &middot; bill incl. " + sv.tax_percent + "% tax" : ""}</div></div>`;
		}
		let holderSec = "";
		if (!forPrint && (ex.holder_transfers || []).length) {
			holderSec = `<div class="ci-sec"><h4>Holder history</h4><table class="ci-tbl">
				<thead><tr><th>From</th><th>To</th><th>When</th><th>By</th><th>Reason</th></tr></thead><tbody>
				${ex.holder_transfers.map((h) => `<tr><td>${esc(h.from || "—")}</td><td><b>${esc(h.to || "")}</b></td>
					<td>${dtt(h.when)}</td><td>${esc(h.by || "")}</td><td>${esc(h.reason || "")}</td></tr>`).join("")}
				</tbody></table></div>`;
		}
		const costingSec = !forPrint && frappe.user.has_role("System Manager")
			? `<div class="ci-sec"><h4>Costing <span class="muted" style="font-weight:400;font-size:11px;">(restricted)</span></h4>
				<div class="ci-line" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
					<input type="number" class="ci-rate" placeholder="gold rate /g" style="width:110px;border:1px solid var(--border-color);border-radius:6px;height:26px;padding:2px 8px;background:var(--fg-color);color:var(--text-color);">
					<button class="btn btn-xs ci-cost" data-name="${esc(b.name)}" style="background:#1f618d;border-color:#1f618d;color:#fff;">${__("Compute")}</button>
					<span class="ci-cost-out" style="font-size:12.5px;"></span>
				</div></div>` : "";

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
			${kv("Party", b.customer || b.held_by)}${kv("Salesman", b.salesman)}${kv("Type", b.order_type)}
			${kv("Qty", b.qty)}${kv("Size", b.size)}${kv("Ordered", dt(b.order_date))}${kv("Due", dt(b.due_date))}
			${extraKvs}
		</div></div>
		<div class="ci-sec"><h4>Weights</h4>
			${act ? `<div class="ci-line"><span class="tag">Actual</span> ${act}</div>` : ""}
			${plan ? `<div class="ci-line muted"><span class="tag">Plan</span> ${plan}</div>` : ""}
			${!act && !plan ? '<span class="ci-empty">—</span>' : ""}
		</div>
		<div class="ci-sec"><h4>Contents</h4><div class="ci-line">${contents}</div></div>
		<div class="ci-sec"><h4>Issue details</h4>${issueTbl}</div>
		${identity}
		${standing}
		${cadSec}
		${narration}
		<div class="ci-sec"><h4>Where it travelled</h4><div class="ci-chain">${travel}</div></div>
		<div class="ci-sec"><h4>Who worked on it</h4>${stageTbl}</div>
		${saleSec}
		${holderSec}
		${costingSec}`;
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
		// no branding loaded yet — still print in place through the shared iframe helper
		jewelima.print_window({}, state.data.bag.name, buildHTML(state.data, true),
			CSS + " body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#222;}");
	}

	// arriving from any card link with the number already punched in
	if (frappe.route_options && frappe.route_options.card) {
		const pre = frappe.route_options.card;
		frappe.route_options = null;
		setTimeout(() => load(pre), 150);
	}
	$(page.main).on("click", ".ci-cost", function () {
		const nm = $(this).data("name");
		const rate = $(page.main).find(".ci-rate").val() || 0;
		const $out = $(page.main).find(".ci-cost-out").text(__("computing…"));
		frappe.call({ method: "jewelima.jewelima.api.get_card_costing",
			args: { order_bag: nm, gold_rate: rate }, freeze: false }).then((r) => {
			const m = r.message || {};
			if (m.error) { $out.html(`<span style="color:#b02a2a;">${frappe.utils.escape_html(m.error)}</span>`); return; }
			const money = (v) => "₹" + (flt(v) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 });
			const parts = Object.values(m.components || {}).map((c) =>
				`${frappe.utils.escape_html(c.label)} ${c.value === null ? "<span style='color:#b02a2a;'>?</span>" : money(c.value)}`);
			const total = Object.values(m.components || {}).reduce((s2, c) => s2 + (flt(c.value) || 0), 0);
			$out.html(`${frappe.utils.escape_html(m.chart_name || "")}: ` + parts.join(" · ")
				+ ` · <b>${money(total)}</b>`);
		});
	});

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
