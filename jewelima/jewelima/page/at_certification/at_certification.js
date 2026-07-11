// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// At Certification (Reports > Stock Reports) — pieces OUT at hallmarking /
// certification, grouped by design type x holder. Thin wrapper over
// jewelima.buildFinishedMatrix (branding bundle); Finished Stock is its
// sibling. Route: /app/at-certification

frappe.pages["at-certification"].on_page_load = function (wrapper) {
	jewelima.buildFinishedMatrix(wrapper, {
		title: __("At Certification"),
		status: "At Certification",
		hint: __("Pieces out at hallmarking / certification (At Certification warehouse) grouped by design type, split by the customer they are reserved to. Cells count pieces — hover for weights and card numbers."),
		empty: __("Nothing out at certification right now."),
	});
};
