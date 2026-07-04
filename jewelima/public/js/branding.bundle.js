// Copyright (c) 2026, efeone and contributors
// Shared Jewelima print branding — a letterhead-style header (logo + contact) and a clean
// footer reused by every custom printout. Loaded app-wide via app_include_js.

frappe.provide("jewelima");

// small inline icons (lucide-style) for the contact line
jewelima._icons = {
	phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
	pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
	web: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
	mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>',
};

// Neutral print CSS (a fresh print window has no app styles, so keep it self-contained).
jewelima.print_css = `
body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,sans-serif;color:#1a1a1a;}
.jw-phead{display:flex;justify-content:space-between;align-items:center;gap:24px;border-bottom:1.5px solid #111;padding-bottom:10px;margin-bottom:2px;}
.jw-plogo{height:56px;width:auto;display:block;}
.jw-pco{font-size:20px;font-weight:800;letter-spacing:.5px;}
.jw-pcontact{display:flex;align-items:center;gap:13px;font-size:11px;color:#333;flex-wrap:wrap;justify-content:flex-end;}
.jw-ci{display:flex;align-items:center;gap:5px;}
.jw-ci svg{width:13px;height:13px;flex:0 0 auto;color:#111;}
.jw-sep{color:#cfd4da;font-weight:300;}
.jw-ptitle{font-size:12px;font-weight:700;color:#6b7785;text-transform:uppercase;letter-spacing:.09em;margin:8px 0 12px;}
.jw-pfoot{margin-top:16px;padding-top:6px;border-top:1px solid #e2e6ea;font-size:10px;color:#9aa6b2;display:flex;justify-content:space-between;align-items:center;}
.jw-pfoot .jw-fbrand{font-style:italic;letter-spacing:.3px;}
@media print{.jw-phead,.jw-ci svg{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
`;

// Letterhead header. `b` = the get_print_branding() payload.
jewelima.print_header = function (b, title) {
	b = b || {};
	const esc = frappe.utils.escape_html;
	const I = jewelima._icons;
	const logo = b.logo_url
		? `<img class="jw-plogo" src="${window.location.origin}${b.logo_url}" alt="${esc(b.company || "Jewelima")}">`
		: `<div class="jw-pco">${esc(b.company || "Jewelima")}</div>`;

	const items = [];
	if (b.phone) items.push(`<span class="jw-ci">${I.phone}${esc(b.phone)}</span>`);
	if (b.address) items.push(`<span class="jw-ci">${I.pin}${esc(b.address)}</span>`);
	if (b.website) items.push(`<span class="jw-ci">${I.web}${esc(b.website)}</span>`);
	else if (b.email) items.push(`<span class="jw-ci">${I.mail}${esc(b.email)}</span>`);
	const contact = items.join('<span class="jw-sep">|</span>');

	return `<div class="jw-phead"><div>${logo}</div>${contact ? `<div class="jw-pcontact">${contact}</div>` : ""}</div>
		${title ? `<div class="jw-ptitle">${esc(title)}</div>` : ""}`;
};

jewelima.print_footer = function (b) {
	b = b || {};
	const esc = frappe.utils.escape_html;
	const co = esc(b.company || "Jewelima Diamonds");
	const extra = b.gstin ? " &middot; GSTIN: " + esc(b.gstin) : "";
	return `<div class="jw-pfoot">
		<span class="jw-fbrand">${co} — Crafting for You${extra}</span>
		<span>Printed ${frappe.datetime.str_to_user(frappe.datetime.now_datetime())}</span>
	</div>`;
};

// Open a clean, branded print window. `bodyHTML` = the page-specific content;
// `extraCss` = any page-specific styles.
jewelima.print_window = function (branding, title, bodyHTML, extraCss) {
	const w = window.open("", "_blank", "width=820,height=960");
	w.document.write(
		`<html><head><title>${frappe.utils.escape_html(title || "Jewelima")}</title>` +
		`<style>body{padding:16px;}${jewelima.print_css}${extraCss || ""}</style></head><body>` +
		jewelima.print_header(branding, title) + bodyHTML + jewelima.print_footer(branding) +
		`</body></html>`
	);
	w.document.close();
	w.focus();
	setTimeout(() => w.print(), 350);
};

// ---------------------------------------------------------------------------
// Reset-on-return for the Jewelima functional pages.
//
// Frappe builds a custom desk page ONCE (on_page_load) and merely re-shows it on
// later visits, so half-filled forms linger. Rule here: ROUTE AWAY and come back
// -> the page rebuilds fresh. Staying on the page (kept open in a tab, switching
// browser tabs/windows, reloads) never resets — only in-app navigation does.
// ---------------------------------------------------------------------------
(() => {
	const RESET_PAGES = new Set([
		"place-order", "purchase-raw-material", "melt-gold", "job-work", "assign-collect",
		"bag-split", "transfer-order-bag", "print-barcode", "weight-add", "weight-reduce",
		"stock-transfer", "make-products", "finished-items", "card-info", "job-order-status",
		"add-design", "retire-design", "design-gallery", "design-tags", "design-types",
		"order-masters", "warehouse-management", "print-order-bags", "order-bag-photos",
		"bench-dashboard", "employee-performance", "warehouse-stock", "item-stock",
	]);
	let last = null;

	function onRouteChange() {
		const cur = (frappe.get_route() || [])[0];
		if (last && last !== cur && RESET_PAGES.has(last) && frappe.pages[last]) {
			frappe.pages[last].__jw_stale = true; // left a functional page — rebuild on return
		}
		if (cur && RESET_PAGES.has(cur)) {
			const pg = frappe.pages[cur];
			if (pg && pg.__jw_stale && pg.on_page_load) {
				pg.__jw_stale = false;
				const wrapper = document.getElementById("page-" + cur);
				if (wrapper) {
					$(wrapper).empty();
					pg.on_page_load(wrapper);
				}
			}
		}
		last = cur;
	}

	function attach() {
		if (frappe.router && frappe.router.on) {
			last = (frappe.get_route() || [])[0];
			frappe.router.on("change", onRouteChange);
		}
	}
	if (window.frappe && frappe.router && frappe.router.on) attach();
	else $(document).on("app_ready", attach);
})();
