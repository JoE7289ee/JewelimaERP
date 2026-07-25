// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Photo Approvals (Design Bank) — old vs new side by side. APPROVE deletes the
// old product photo FOREVER (disk included), promotes the candidate to
// <code>.photo.png and re-renders the info card; REJECT bins the candidate and
// the card returns to the update queue. Route: /app/photo-approvals

frappe.pages["photo-approvals"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Photo Approvals", single_column: true });
	const API = "jewelima.jewelima.design_bank_api";
	const esc = frappe.utils.escape_html;
	let start = 0;

	$(page.main).append(`
		<style>
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
		<div class="pa-top"></div>
		<div class="pa-list"></div>
		<button class="btn btn-default pa-more" style="display:none;">${__("Load more")}</button>
	`);
	const root = $(page.main);

	function load(reset) {
		if (reset) { start = 0; root.find(".pa-list").empty(); }
		frappe.call({ method: API + ".get_photo_approval_queue", args: { start, limit: 30 } }).then((r) => {
			const m = r.message || { rows: [], total: 0 };
			root.find(".pa-top").text(m.total ? __("{0} photo change(s) awaiting approval", [m.total]) : "");
			if (!m.total && !start) root.find(".pa-list").html(`<div class="pa-done">${__("Nothing waiting for approval.")}</div>`);
			root.find(".pa-list").append(m.rows.map((d) => `
				<div class="pa-card" data-name="${esc(d.name)}">
					<div class="pa-no">${esc(d.design_no)}</div>
					<div class="pa-by">${__("uploaded by {0}", [esc((d.pending_photo_by || "?").split("@")[0])])}</div>
					<div class="pa-pair">
						<div class="pa-im"><div class="t">${__("Current (dies on approve)")}</div><img src="${esc(bust(d.photo || d.image || "", d.modified))}"></div>
						<div class="pa-im new"><div class="t">${__("New (pending)")}</div><img src="${esc(bust(d.pending_photo, d.modified))}"></div>
					</div>
					<div class="pa-actions">
						<button class="btn btn-sm pa-ok" style="background:#2e7d32;border-color:#2e7d32;color:#fff;">${__("APPROVE — replace forever")}</button>
						<button class="btn btn-sm btn-default pa-no-btn" style="color:#b02a2a;">${__("Reject")}</button>
					</div>
				</div>`).join(""));
			start += m.rows.length;
			root.find(".pa-more").toggle(start < m.total);
		});
	}
	const bust = (u, m) => (u ? u + (u.includes("?") ? "&" : "?") + "m=" + encodeURIComponent(m || Date.now()) : u);
	function act(el, method, confirmMsg) {
		const card = $(el).closest(".pa-card");
		const go = () => frappe.call({ method: API + "." + method, args: { name: card.data("name") } })
			.then((r) => {
				card.slideUp(200, () => card.remove());
				const left = (r.message || {}).left || 0;
				root.find(".pa-top").text(left ? __("{0} photo change(s) awaiting approval", [left]) : "");
				if (!left) root.find(".pa-list").html(`<div class="pa-done">${__("Nothing waiting for approval.")}</div>`);
			});
		confirmMsg ? frappe.confirm(confirmMsg, go) : go();
	}
	// one click fires the approval — no confirm (house style)
	root.on("click", ".pa-ok", function () {
		act(this, "approve_photo_update");
	});
	root.on("click", ".pa-no-btn", function () { act(this, "reject_photo_update"); });
	root.find(".pa-more").on("click", () => load());
	load(true);
};
