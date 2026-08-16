// Look-Up Party — enter an old name, see its new party name(s), or "not created".
// Full flow lands in Step 3; this scaffold reserves the route.
// Route: /app/look-up-party
frappe.pages["look-up-party"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Look-Up Party"), single_column: true });
	$(page.main).html(
		`<div style="padding:40px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:10px;">
			${__("Look-Up Party — coming up next.")}
		</div>`);
};
