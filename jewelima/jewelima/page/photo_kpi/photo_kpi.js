// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Photo KPI (Graphics) — a live dashboard of every photo bucket: how many are
// pending in each, a bar chart to compare load, and 'done' progress bars for
// the whole bank. Each tile jumps to its page. Route: /app/photo-kpi

frappe.pages["photo-kpi"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Photo KPI", single_column: true });
	const API = "jewelima.jewelima.design_bank_api";

	// bucket -> {label, route, colour}
	const B = [
		["photo_update", __("Photo Update"), "/app/photo-update", "#1f618d"],
		["photo_urgent", __("Photo Urgent"), "/app/photo-urgent", "#b02a2a"],
		["photo_queue", __("Photo Queue"), "/app/photo-queue", "#8a6d00"],
		["customer_add", __("Customer Add"), "/app/customer-photos", "#0e7a5f"],
		["customer_update", __("Customer Update"), "/app/customer-update", "#6a3ea1"],
		["product_approvals", __("Product Approvals"), "/app/photo-approvals", "#2e7d32"],
		["customer_approvals", __("Customer Approvals"), "/app/photo-approvals", "#2e7d32"],
		["rejections", __("Rejection"), "/app/rejection", "#b02a2a"],
	];

	$(page.main).append(`
		<style>
		#page-photo-kpi .container{max-width:100%;}
		.pk-head{font-size:12.5px;color:var(--text-muted);margin-bottom:14px;}
		.pk-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:22px;}
		.pk-tile{border:1px solid var(--border-color);border-left-width:5px;border-radius:10px;background:var(--fg-color);padding:12px 14px;cursor:pointer;transition:box-shadow .1s;}
		.pk-tile:hover{box-shadow:0 2px 10px rgba(0,0,0,.08);}
		.pk-tile .v{font-size:30px;font-weight:800;line-height:1;}
		.pk-tile .k{font-size:11.5px;color:var(--text-muted);margin-top:5px;text-transform:uppercase;letter-spacing:.04em;}
		.pk-sec{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);margin:6px 0 12px;}
		.pk-bars{border:1px solid var(--border-color);border-radius:11px;background:var(--fg-color);padding:16px 18px;margin-bottom:22px;}
		.pk-bar{display:flex;align-items:center;gap:10px;margin:7px 0;font-size:12.5px;}
		.pk-bar .lbl{flex:0 0 150px;color:var(--text-color);}
		.pk-bar .track{flex:1;background:var(--control-bg);border-radius:6px;height:18px;overflow:hidden;}
		.pk-bar .fill{height:100%;border-radius:6px;}
		.pk-bar .num{flex:0 0 48px;text-align:right;font-weight:700;}
		.pk-done{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;}
		.pk-prog{border:1px solid var(--border-color);border-radius:11px;background:var(--fg-color);padding:14px 16px;}
		.pk-prog .t{font-size:12px;color:var(--text-muted);margin-bottom:8px;}
		.pk-prog .track{background:var(--control-bg);border-radius:6px;height:14px;overflow:hidden;}
		.pk-prog .fill{height:100%;background:#2e7d32;border-radius:6px;}
		.pk-prog .n{font-size:13px;font-weight:700;margin-top:7px;}
		</style>
		<div class="pk-head">${__("loading…")}</div>
		<div class="pk-tiles"></div>
		<div class="pk-sec">${__("Pending by bucket")}</div>
		<div class="pk-bars"></div>
		<div class="pk-sec">${__("Bank coverage (done)")}</div>
		<div class="pk-done"></div>
	`);
	const root = $(page.main);

	frappe.call({ method: API + ".get_photo_kpi" }).then((r) => {
		const m = r.message || { buckets: {}, done: {} };
		const bk = m.buckets || {}, dn = m.done || {};
		const totalPending = B.reduce((s, [k]) => s + (bk[k] || 0), 0);
		root.find(".pk-head").text(__("{0} item(s) pending across all photo buckets · {1} designs in the bank",
			[totalPending, dn.total || 0]));

		// tiles
		root.find(".pk-tiles").html(B.map(([k, lbl, route, col]) => `
			<div class="pk-tile" data-route="${route}" style="border-left-color:${col};">
				<div class="v" style="color:${col};">${bk[k] || 0}</div>
				<div class="k">${lbl}</div>
			</div>`).join(""));
		root.on("click", ".pk-tile", function () { frappe.set_route($(this).data("route").replace("/app/", "")); });

		// bar chart (share of the pending load)
		const max = Math.max(1, ...B.map(([k]) => bk[k] || 0));
		root.find(".pk-bars").html(B.map(([k, lbl, , col]) => {
			const v = bk[k] || 0;
			return `<div class="pk-bar"><div class="lbl">${lbl}</div>
				<div class="track"><div class="fill" style="width:${Math.round((v / max) * 100)}%;background:${col};"></div></div>
				<div class="num">${v}</div></div>`;
		}).join(""));

		// done coverage
		const total = dn.total || 0;
		const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
		const prog = [
			[__("Approved (live)"), dn.approved_total || 0],
			[__("Has product photo"), dn.with_photo || 0],
			[__("Has customer photo"), dn.customer_done || 0],
		];
		root.find(".pk-done").html(prog.map(([t, n]) => `
			<div class="pk-prog"><div class="t">${t}</div>
				<div class="track"><div class="fill" style="width:${pct(n)}%;"></div></div>
				<div class="n">${n.toLocaleString()} / ${total.toLocaleString()} · ${pct(n)}%</div>
			</div>`).join(""));
	});
};
