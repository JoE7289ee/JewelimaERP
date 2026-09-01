// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
// Thin wrapper — the page lives in jewelima.buildWorkstation (public/js/workstation.js).
// REWORK is a holding queue: no employee is issued the work and no work type is
// recorded, so the board shows what is waiting and where it came from, nothing else.

frappe.pages["ws-rework"].on_page_load = function (wrapper) {
	jewelima.buildWorkstation(wrapper, "REWORK");
};
