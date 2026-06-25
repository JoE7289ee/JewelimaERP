// Copyright (c) 2026, efeone and contributors
// Shared Jewelima print branding — a common header/footer + print CSS reused by all
// custom printouts (Card Info now, others later). Loaded app-wide via app_include_js.

frappe.provide("jewelima");

// Neutral print CSS (a fresh print window has no app styles, so keep it self-contained).
jewelima.print_css = `
body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#222;}
.jw-phead{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #222;padding-bottom:8px;margin-bottom:12px;}
.jw-pbrand{display:flex;gap:12px;align-items:center;}
.jw-pbrand img{height:50px;width:auto;}
.jw-pco{font-size:18px;font-weight:800;letter-spacing:.3px;}
.jw-pmeta{font-size:11px;color:#6b7785;line-height:1.5;margin-top:2px;}
.jw-ptitle{font-size:13px;font-weight:700;color:#6b7785;text-transform:uppercase;letter-spacing:.06em;text-align:right;white-space:nowrap;}
.jw-pfoot{margin-top:14px;padding-top:6px;border-top:1px solid #e2e6ea;font-size:10px;color:#9aa6b2;text-align:center;}
@media print{.jw-phead{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
`;

// Branded header HTML for a printout. `b` = the get_print_branding() payload.
jewelima.print_header = function (b, title) {
	b = b || {};
	const esc = frappe.utils.escape_html;
	const logo = b.logo_url ? `<img src="${window.location.origin}${b.logo_url}" alt="">` : "";
	const meta = [
		b.address,
		[b.phone ? "Ph: " + b.phone : "", b.email || ""].filter(Boolean).join("  ·  "),
		b.gstin ? "GSTIN: " + b.gstin : "",
	].filter(Boolean).map(esc).join("<br>");
	return `<div class="jw-phead">
		<div class="jw-pbrand">${logo}<div><div class="jw-pco">${esc(b.company || "Jewelima")}</div><div class="jw-pmeta">${meta}</div></div></div>
		${title ? `<div class="jw-ptitle">${esc(title)}</div>` : ""}
	</div>`;
};

jewelima.print_footer = function () {
	return `<div class="jw-pfoot">Printed ${frappe.datetime.str_to_user(frappe.datetime.now_datetime())} &middot; Jewelima</div>`;
};

// Open a clean, branded print window. `bodyHTML` = the page-specific content;
// `extraCss` = any page-specific styles.
jewelima.print_window = function (branding, title, bodyHTML, extraCss) {
	const w = window.open("", "_blank", "width=800,height=940");
	w.document.write(
		`<html><head><title>${frappe.utils.escape_html(title || "Jewelima")}</title>` +
		`<style>body{padding:16px;}${jewelima.print_css}${extraCss || ""}</style></head><body>` +
		jewelima.print_header(branding, title) + bodyHTML + jewelima.print_footer() +
		`</body></html>`
	);
	w.document.close();
	w.focus();
	setTimeout(() => w.print(), 350);
};
