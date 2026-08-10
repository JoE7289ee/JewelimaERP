// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Photo Approvals (Graphics) — one page for every photo change awaiting sign-off.
// Pick a bucket (Product / Customer). Glance-and-go: every candidate is ticked by
// default; untick or REJECT the few bad ones, then "Approve selected" sends the
// rest through in one shot. APPROVE deletes the old image forever and promotes the
// candidate; REJECT bins it and sends the design to Rejection. Route: /app/photo-approvals

frappe.pages["photo-approvals"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Photo Approvals", single_column: true });
	const API = "jewelima.jewelima.design_bank_api";
	const esc = frappe.utils.escape_html;

	const BUCKETS = {
		product: {
			label: __("Product photo changes"),
			queue: "get_photo_approval_queue", approve: "approve_photo_update", reject: "reject_photo_update", bulk: "approve_photo_updates_bulk",
			current: (d) => d.photo || d.image || "", candidate: (d) => d.pending_photo, by: (d) => d.pending_photo_by,
		},
		customer: {
			label: __("Customer photo changes"),
			queue: "get_customer_approval_queue", approve: "approve_customer_update", reject: "reject_customer_update", bulk: "approve_customer_updates_bulk",
			current: (d) => d.customer_image || d.image || "", candidate: (d) => d.pending_customer_image, by: (d) => d.pending_customer_image_by,
		},
	};
	let mode = "product", start = 0;

	$(page.main).append(`
		<style>
		.pa-tabs{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;}
		.pa-tab{border:1px solid var(--border-color);border-radius:9px;padding:7px 16px;cursor:pointer;background:var(--control-bg);font-size:13px;}
		.pa-tab.on{border-color:#1f618d;box-shadow:0 0 0 1px #1f618d inset;font-weight:700;}
		.pa-tab .c{display:inline-block;min-width:20px;text-align:center;margin-left:6px;background:#1f618d;color:#fff;border-radius:9px;font-size:11px;padding:0 6px;}
		.pa-bulk{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:14px;flex-wrap:wrap;background:var(--fg-color);border:1px solid var(--border-color);border-radius:10px;padding:9px 14px;margin-bottom:14px;}
		.pa-bulk label{cursor:pointer;font-size:13px;}
		.pa-cnt{color:var(--text-muted);font-size:12.5px;}
		.pa-approve-sel{margin-left:auto;background:#2e7d32;border-color:#2e7d32;color:#fff;font-weight:700;}
		.pa-card{border:1px solid var(--border-color);border-radius:9px;background:var(--fg-color);padding:12px 16px;margin-bottom:14px;position:relative;}
		.pa-card.sel{border-color:#2e7d32;box-shadow:0 0 0 1px #2e7d32 inset;}
		.pa-sel-wrap{position:absolute;top:12px;right:14px;font-size:12.5px;color:var(--text-muted);cursor:pointer;user-select:none;}
		.pa-sel-wrap input{transform:scale(1.25);margin-right:5px;vertical-align:middle;}
		.pa-no{font-size:16px;font-weight:800;}
		.pa-by{font-size:11.5px;color:var(--text-muted);margin-bottom:10px;}
		.pa-pair{display:flex;gap:16px;flex-wrap:wrap;}
		.pa-im{width:240px;text-align:center;}
		.pa-im .t{font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px;}
		.pa-im img{width:100%;height:230px;object-fit:contain;background:#fff;border:2px solid var(--border-color);border-radius:8px;}
		.pa-im.new img{border-color:#2e7d32;}
		.pa-actions{margin-top:10px;}
		.pa-done{padding:36px;text-align:center;color:var(--text-muted);}
		</style>
		<div class="pa-tabs"></div>
		<div class="pa-bulk" style="display:none;">
			<label><input type="checkbox" class="pa-all" checked> ${__("Select all")}</label>
			<span class="pa-cnt"></span>
			<button class="btn btn-sm pa-approve-sel">${__("Approve selected")}</button>
		</div>
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
		mode = m; load(true);
	});

	function refreshCount() {
		const total = root.find(".pa-card").length;
		const sel = root.find(".pa-sel:checked").length;
		root.find(".pa-cnt").text(__("{0} of {1} selected", [sel, total]));
		root.find(".pa-approve-sel").text(__("Approve {0} selected", [sel])).prop("disabled", sel === 0);
		root.find(".pa-bulk").toggle(total > 0);
		root.find(".pa-all").prop("checked", total > 0 && sel === total);
		root.find(".pa-card").each(function () {
			$(this).toggleClass("sel", $(this).find(".pa-sel").is(":checked"));
		});
	}

	function load(reset) {
		if (reset) { start = 0; root.find(".pa-list").empty(); }
		const B = BUCKETS[mode];
		frappe.call({ method: API + "." + B.queue, args: { start, limit: 60 } }).then((r) => {
			const m = r.message || { rows: [], total: 0 };
			paintTabs({ [mode]: m.total });
			if (!m.total && !start) root.find(".pa-list").html(`<div class="pa-done">${__("Nothing waiting in this bucket.")}</div>`);
			root.find(".pa-list").append(m.rows.map((d) => `
				<div class="pa-card sel" data-name="${esc(d.name)}">
					<label class="pa-sel-wrap"><input type="checkbox" class="pa-sel" checked> ${__("approve")}</label>
					<div class="pa-no">${esc(d.design_no)}</div>
					<div class="pa-by">${__("uploaded by {0}", [esc(((B.by(d)) || "?").split("@")[0])])}</div>
					<div class="pa-pair">
						<div class="pa-im"><div class="t">${__("Current (dies on approve)")}</div><img src="${esc(bust(B.current(d), d.modified))}"></div>
						<div class="pa-im new"><div class="t">${__("New (pending)")}</div><img src="${esc(bust(B.candidate(d), d.modified))}"></div>
					</div>
					<div class="pa-actions">
						<button class="btn btn-sm btn-default pa-rej" style="color:#b02a2a;">${__("Reject")}</button>
					</div>
				</div>`).join(""));
			start += m.rows.length;
			root.find(".pa-more").toggle(start < m.total);
			refreshCount();
		});
	}

	root.on("change", ".pa-sel", refreshCount);
	root.on("change", ".pa-all", function () {
		root.find(".pa-sel").prop("checked", this.checked);
		refreshCount();
	});

	// single reject (immediate) — sends the design to the Rejection bucket
	root.on("click", ".pa-rej", function () {
		const card = $(this).closest(".pa-card");
		frappe.call({ method: API + "." + BUCKETS[mode].reject, args: { name: card.data("name") } }).then((r) => {
			card.slideUp(150, () => { card.remove(); afterChange((r.message || {}).left); });
		});
	});

	// bulk approve the checked cards in one shot
	root.on("click", ".pa-approve-sel", function () {
		const names = root.find(".pa-card").filter(function () { return $(this).find(".pa-sel").is(":checked"); })
			.map(function () { return $(this).data("name"); }).get();
		if (!names.length) return;
		frappe.confirm(__("Approve {0} photo change(s)? Each replaces the current image forever.", [names.length]), () => {
			frappe.dom.freeze(__("Approving {0}…", [names.length]));
			frappe.call({ method: API + "." + BUCKETS[mode].bulk, args: { names: JSON.stringify(names) } })
				.then((r) => {
					frappe.dom.unfreeze();
					const res = r.message || {};
					const failed = new Set(res.failed || []);
					root.find(".pa-card").each(function () {
						if (!failed.has($(this).data("name")) && $(this).find(".pa-sel").is(":checked")) $(this).remove();
					});
					frappe.show_alert({ message: __("Approved {0}{1}.", [res.done || 0,
						(res.failed && res.failed.length) ? __(" · {0} failed", [res.failed.length]) : ""]),
						indicator: (res.failed && res.failed.length) ? "orange" : "green" }, 5);
					afterChange(res.left);
				}).catch(() => frappe.dom.unfreeze());
		});
	});

	function afterChange(left) {
		paintTabs({ [mode]: left != null ? left : root.find(".pa-card").length });
		if (!root.find(".pa-card").length) root.find(".pa-list").html(`<div class="pa-done">${__("Nothing waiting in this bucket.")}</div>`);
		refreshCount();
	}

	root.find(".pa-more").on("click", () => load());
	paintTabs(null);
	load(true);
};
