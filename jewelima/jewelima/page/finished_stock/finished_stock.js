// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Finished Stock (Reports > Stock Reports) — pieces IN STOCK, grouped by design
// type x holder. Thin wrapper over jewelima.buildFinishedMatrix (branding
// bundle); the At Certification page is its sibling. Route: /app/finished-stock

frappe.pages["finished-stock"].on_page_load = function (wrapper) {
	jewelima.buildFinishedMatrix(wrapper, {
		title: __("Finished Stock"),
		status: "In Stock",
		hint: __("Finished pieces in stock (Finished Goods warehouse) grouped by design type, split by the customer holding them. Cells count pieces — hover for weights and card numbers."),
		empty: __("No finished pieces in stock yet — make products or import stock first."),
	});
};
