// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// At Hallmarking (Reports > Stock Reports) — pieces OUT at a hallmarking centre,
// grouped by design type x holder. Thin wrapper over jewelima.buildFinishedMatrix
// (branding bundle); Finished Stock and At Certification are its siblings.
//
// It exists because hallmarking used to share certification's stock state, which
// made At Certification count hallmarked pieces as lab work.
// Route: /app/at-hallmarking

frappe.pages["at-hallmarking"].on_page_load = function (wrapper) {
	jewelima.buildFinishedMatrix(wrapper, {
		title: __("At Hallmarking"),
		status: "At Hallmarking",
		hint: __("Pieces out at a hallmarking centre (At Hallmarking warehouse) grouped by design type, split by the customer they are reserved to. Cells count pieces — hover for weights and card numbers."),
		empty: __("Nothing out at hallmarking right now."),
	});
};
