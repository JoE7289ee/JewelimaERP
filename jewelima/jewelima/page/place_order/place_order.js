// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Place Order — thin wrapper: the whole order-entry engine lives in
// public/js/order_page.js (jewelima.buildOrderPage) and is SHARED with the
// order-requests page so the two stay identical. This mode places Job Orders.
// Route: /app/place-order

frappe.pages["place-order"].on_page_load = function (wrapper) {
	jewelima.buildOrderPage(wrapper, { mode: "order", title: __("Place Order") });
};
