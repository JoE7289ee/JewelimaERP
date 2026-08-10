// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Photo Approvals (Graphics) — one page for every photo change awaiting sign-off.
// Pick a bucket (Product photo changes / Customer photo changes); each shows the
// current image vs the new candidate. APPROVE deletes the old image FOREVER and
// promotes the candidate; REJECT bins it and sends the design to the Rejection
// bucket to retry. Route: /app/photo-approvals

frappe.pages["photo-approvals"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Photo Approvals", single_column: true });
	const API = "jewelima.jewelima.design_bank_api";
	const esc = frappe.utils.escape_html;

	// bucket definitions — everything the page needs to fetch/act per type
	const BUCKETS = {
		product: {
			label: __("Product photo changes"),
			queue: "get_photo_approval_queue", approve: "approve_photo_update", reject: "reject_photo_update",
			current: (d) => d.photo || d.image || "", candidate: (d) => d.pending_photo, by: (d) => d.pending_photo_by,
		},
		customer: {
			label: __("Customer photo changes"),
			queue: "get_customer_approval_queue", approve: "approve_customer_update", reject: "reject_customer_update",
			current: (d) => d.customer_image || d.image || "", candidate: (d) => d.pending_customer_image, by: (d) => d.pending_customer_image_by,
		},
	};
	let mode = "product", start = 0;

	$(page.main).append(`
		<style>
		.pa-tabs{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;}
		.pa-tab{border:1px solid var(--border-color);border-radius:9px;padding:7px 16px;cursor:pointer;background:var(--control-bg);font-size:13px;}
		.pa-tab.on{border-color:#1f618d;box-shadow:0 0 0 1px #1f618d inset;font-weight:700;}
		.pa-tab .c{display:inline-block;min-width:20px;text-align:center;margin-left:6px;background:#1f618d;color:#fff;border-radius:9px;font-size:11px;padding:0 6px;}
		.pa-top{font-size:13px;color:var(--text-muted);margin-bottom:14px;}
		.pa-card{border:1px solid var(--border-color);border-radius:9px;background:var(--fg-color);padding:14px 18px;margin-bottom:16px;}
		.pa-no{font-size:16px;font-weight:800;}
		.pa-by{font-size:11.5px;color:var(--text-muted);margin-bottom:10px;}
		.pa-pair{display:flex;gap:16px;flex-wrap:wrap;}
		.pa-im{width:260px;text-align:center;}
		.pa-im .t{font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px;}
		.pa-im img{width:100%;height:250px;object-fit:contain;background:#fff;border:2px solid var(--border-color);border-radius:8px;}
		.pa-im.new img{border-color:#2e7d32;}
		.pa-actions{margin-top:10px;display:flex;gap:8px;}
		.pa-done{padding:36px;text-align:center;color:var(--text-muted);}
		</style>
		<div class="pa-tabs"></div>
		<div class="pa-top"></div>
		<div class="pa-list"></div>
		<button class="btn btn-default pa-more" style="display:none;">${__("Load more")}</button>
	`);
	const root = $(page.main);
	const bust = (u, m) => (u ? u + (u.includes("?") ? "&" : "?") + "m=" + encodeURIComponent(m || Date.now()) : u);

	function paintTabs(counts) {
		root.find(".pa-tabs").html(Object.keys(BUCKETS).map((k) => `
			<div class="pa-tab ${k === mode ? "on" : ""}" data-m="${k}">${BUCKETS[k].label}
				<span class="c">${counts && counts[k] != null ? counts[k] : "…"}</span></div>`).join(""));
	}
	root.on("click", ".pa-tab", function () {
		const m = $(this).data("m");
		if (m === mode) return;
		mode = m;
		load(true);
	});

	function load(reset) {
		if (reset) { start = 0; root.find(".pa-list").empty(); }
		const B = BUCKETS[mode];
		frappe.call({ method: API + "." + B.queue, args: { start, limit: 30 } }).then((r) => {
			const m = r.message || { rows: [], total: 0 };
			paintTabs({ [mode]: m.total });
			root.find(".pa-top").text(m.total ? __("{0} change(s) awaiting approval", [m.total]) : "");
			if (!m.total && !start) root.find(".pa-list").html(`<div class="pa-done">${__("Nothing waiting in this bucket.")}</div>`);
			root.find(".pa-list").append(m.rows.map((d) => `
				<div class="pa-card" data-name="${esc(d.name)}">
					<div class="pa-no">${esc(d.design_no)}</div>
					<div class="pa-by">${__("uploaded by {0}", [esc(((B.by(d)) || "?").split("@")[0])])}</div>
					<div class="pa-pair">
						<div class="pa-im"><div class="t">${__("Current (dies on approve)")}</div><img src="${esc(bust(B.current(d), d.modified))}"></div>
						<div class="pa-im new"><div class="t">${__("New (pending)")}</div><img src="${esc(bust(B.candidate(d), d.modified))}"></div>
					</div>
					<div class="pa-actions">
						<button class="btn btn-sm pa-ok" style="background:#2e7d32;border-color:#2e7d32;color:#fff;">${__("APPROVE — replace forever")}</button>
						<button class="btn btn-sm btn-default pa-rej" style="color:#b02a2a;">${__("Reject")}</button>
					</div>
				</div>`).join(""));
			start += m.rows.length;
			root.find(".pa-more").toggle(start < m.total);
		});
	}

	function act(el, method) {
		const card = $(el).closest(".pa-card");
		frappe.call({ method: API + "." + method, args: { name: card.data("name") } }).then((r) => {
			card.slideUp(200, () => card.remove());
			const left = (r.message || {}).left || 0;
			paintTabs({ [mode]: left });
			root.find(".pa-top").text(left ? __("{0} change(s) awaiting approval", [left]) : "");
			if (!left) root.find(".pa-list").html(`<div class="pa-done">${__("Nothing waiting in this bucket.")}</div>`);
		});
	}
	// one click fires it — no confirm (house style)
	root.on("click", ".pa-ok", function () { act(this, BUCKETS[mode].approve); });
	root.on("click", ".pa-rej", function () { act(this, BUCKETS[mode].reject); });
	root.find(".pa-more").on("click", () => load());

	paintTabs(null);
	load(true);
};
