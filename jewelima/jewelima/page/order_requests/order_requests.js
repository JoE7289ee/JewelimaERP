// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Order Requests — thin wrapper: the SAME order-entry engine as Place Order
// (public/js/order_page.js), in request mode: "Request Order" files an Order
// Request (nothing placed; the logged-in user owns it), Notes replaces the Job
// Order No slot, and the "My Requests" list below tracks Open -> Placed.
// Route: /app/order-requests

frappe.pages["order-requests"].on_page_load = function (wrapper) {
	jewelima.buildOrderPage(wrapper, { mode: "request", title: __("Order Requests") });
};
