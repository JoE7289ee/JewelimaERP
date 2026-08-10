// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Design Bank Report — the bank at a glance: a hero with the headline totals,
// coverage progress bars, the work-queue KPIs grouped by colour, and a
// new-designs-by-type bar chart. Live-refreshes every 30s. Route: /app/design-bank-report

frappe.pages["design-bank-report"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Design Bank Report", single_column: true });
	const esc = frappe.utils.escape_html;
	const nf = (n) => (n || 0).toLocaleString("en-IN");

	// how each KPI label is grouped + coloured (unknown labels fall through to a neutral group)
	const GROUPS = [
		{ title: "Work queues", color: "#e0872a", keys: [
			"In Review Queue", "Prioritised in Queue", "In Duplicate Queue", "Awaiting Rebuild (OCR/crop)", "Raw Images Left"] },
		{ title: "Photo desk", color: "#2b7cd3", keys: [
			"Photo Change Pending", "Awaiting Photo Approval", "Customer Photos Pending", "Customer Photos Done"] },
		{ title: "Composition", color: "#8b5cf6", keys: [
			"New In-House Designs", "Provider Pieces", "Dye Available", "Linked to ERP Designs"] },
	];

	$(page.main).append(`
		<style>
		#page-design-bank-report .container{max-width:100%;}
		.db-hero{border-radius:16px;padding:22px 26px;margin-bottom:20px;color:#fff;
			background:linear-gradient(120deg,#243b6b,#3a2e78 60%,#6a2f6e);box-shadow:0 8px 26px rgba(40,30,90,.22);}
		.db-hero .lbl{font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.8;}
		.db-hero .tot{font-size:46px;font-weight:900;line-height:1;margin:2px 0 10px;}
		.db-chips{display:flex;gap:10px;flex-wrap:wrap;}
		.db-chip{background:rgba(255,255,255,.16);border-radius:20px;padding:5px 14px;font-size:13px;font-weight:700;}
		.db-sec{font-size:11px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--text-muted);margin:20px 0 10px;}
		.db-cov{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;}
		.db-bar{border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);padding:14px 16px;}
		.db-bar .t{font-size:12px;color:var(--text-muted);display:flex;justify-content:space-between;margin-bottom:8px;}
		.db-bar .t b{color:var(--text-color);}
		.db-track{background:var(--control-bg);border-radius:7px;height:16px;overflow:hidden;}
		.db-fill{height:100%;border-radius:7px;transition:width .9s cubic-bezier(.2,.8,.2,1);}
		.db-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px;}
		.db-k{border:1px solid var(--border-color);border-left-width:5px;border-radius:11px;background:var(--fg-color);padding:13px 15px;}
		.db-k .t{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);}
		.db-k .v{font-size:28px;font-weight:800;margin-top:3px;}
		.db-types{border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);padding:16px 18px;}
		.db-trow{display:flex;align-items:center;gap:10px;margin:6px 0;font-size:12.5px;}
		.db-trow .n{flex:0 0 190px;color:var(--text-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
		.db-trow .track{flex:1;background:var(--control-bg);border-radius:6px;height:16px;overflow:hidden;}
		.db-trow .track .f{height:100%;background:linear-gradient(90deg,#3a2e78,#6a2f6e);border-radius:6px;}
		.db-trow .num{flex:0 0 54px;text-align:right;font-weight:700;}
		.db-updated{font-size:11px;color:var(--text-muted);margin-top:14px;text-align:right;}
		</style>
		<div class="db-hero">
			<div class="lbl">Design Bank</div>
			<div class="tot">—</div>
			<div class="db-chips"></div>
		</div>
		<div class="db-sec">Coverage</div>
		<div class="db-cov"></div>
		<div class="db-groups"></div>
		<div class="db-sec">New designs by type</div>
		<div class="db-types"></div>
		<div class="db-updated"></div>
	`);
	const root = $(page.main);

	function bar(label, n, total, color) {
		const pct = total ? Math.round((n / total) * 100) : 0;
		return `<div class="db-bar"><div class="t"><span>${label}</span><b>${nf(n)} / ${nf(total)} · ${pct}%</b></div>
			<div class="db-track"><div class="db-fill" style="width:${pct}%;background:${color};"></div></div></div>`;
	}

	function load() {
		frappe.call({ method: "jewelima.jewelima.design_bank_api.design_bank_report", freeze: false }).then((r) => {
			const m = r.message || {};
			const K = {}; (m.kpis || []).forEach(([t, v]) => { K[t] = v || 0; });
			const cov = m.coverage || {};
			const total = cov.total || K["Total Designs"] || 0;

			root.find(".db-hero .tot").text(nf(total));
			root.find(".db-chips").html([
				["✅ " + nf(cov.approved) + " approved", ""],
				["🕒 " + nf(cov.pending) + " pending", ""],
				["🗂️ " + nf(cov.retired) + " retired", ""],
				["💎 " + nf(cov.variants) + " variants", ""],
			].map(([t]) => `<div class="db-chip">${esc(t)}</div>`).join(""));

			root.find(".db-cov").html([
				bar("Approved (live)", cov.approved, total, "#2e9e4f"),
				bar("Has product photo", cov.with_photo, total, "#2b7cd3"),
				bar("Has customer photo", cov.customer_done, total, "#12a594"),
				bar("Retired (culled)", cov.retired, total, "#d1495b"),
			].join(""));

			// grouped KPI tiles
			const shown = new Set(["Total Designs"]);
			root.find(".db-groups").html(GROUPS.map((g) => {
				const tiles = g.keys.filter((k) => k in K).map((k) => {
					shown.add(k);
					return `<div class="db-k" style="border-left-color:${g.color};">
						<div class="t">${esc(k)}</div><div class="v" style="color:${g.color};">${nf(K[k])}</div></div>`;
				}).join("");
				return tiles ? `<div class="db-sec">${g.title}</div><div class="db-grid">${tiles}</div>` : "";
			}).join(""));

			// by-type bar chart
			const sr = m.series || [];
			const max = Math.max(1, ...sr.map(([, v]) => v || 0));
			root.find(".db-types").html(sr.length
				? sr.map(([t, v]) => `<div class="db-trow"><div class="n">${esc(t)}</div>
					<div class="track"><div class="f" style="width:${Math.round((v / max) * 100)}%;"></div></div>
					<div class="num">${nf(v)}</div></div>`).join("")
				: `<div style="color:var(--text-muted);padding:8px;">No series data.</div>`);

			root.find(".db-updated").text(__("updated {0}", [frappe.datetime.now_time()]));
		});
	}

	page.set_primary_action(__("Refresh"), load, "refresh-cw");
	load();
	const t = setInterval(() => { if ($(wrapper).is(":visible")) load(); }, 30000);
	$(wrapper).on("remove", () => clearInterval(t));
};
