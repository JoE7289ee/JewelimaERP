// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
// Thin wrapper — the page lives in jewelima.buildWorkstation (public/js/workstation.js).

frappe.pages["ws-cad-ws"].on_page_load = function (wrapper) {
	jewelima.buildWorkstation(wrapper, "CAD");
};
