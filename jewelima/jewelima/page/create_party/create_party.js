// Create Party — build a new party from the code masters, or migrate an old
// name onto a party. Full flow lands in Step 3; this scaffold reserves the route.
// Route: /app/create-party
frappe.pages["create-party"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Create Party"), single_column: true });
	$(page.main).html(
		`<div style="padding:40px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:10px;">
			${__("Create Party — coming up next.")}
		</div>`);
};
