// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
// Thin wrapper — the whole board lives in jewelima.buildBenchBoard (public/js/bench_board.js).

frappe.pages["bench-final-polish"].on_page_load = function (wrapper) {
	jewelima.buildBenchBoard(wrapper, "FINAL POLISH");
};
