// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Transfer Order Bag — the ONLY way an Order Bag changes location.
// Scan/select a bag, pick the new location, Transfer. Records an Order Bag
// Transfer and updates the bag's (read-only) location.
// Route: /app/transfer-order-bag

const TOB_LOCATIONS =
	"\nORDERING\nCAD\nCAM\nWAX INJECTING\nTREE MAKING\nCASTING\nGRINDING\nFILING\nSETTING\nPRE POLISH\nWAX SETTING\nFINAL POLISH\nWAX CLEANING\nBAG EXTRACTION";

frappe.pages["transfer-order-bag"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Transfer Order Bag", single_column: true });
	const state = {};

	$(page.main).append(`
		<style>
		.tob-head{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px 12px;margin:4px 0 14px;}
		.tob-head .control-label{font-size:11px;color:var(--text-muted);}
		.tob-head .help-box{display:none !important;}
		.tob-recent{margin-top:10px;}
		.tob-recent table{font-size:12px;}
		</style>
		<div class="tob-head">
			<div class="tob-bag"></div><div class="tob-cur"></div><div class="tob-to"></div><div class="tob-rem"></div>
		</div>
		<div class="tob-recent">
			<div class="text-muted" style="font-size:12px;margin-bottom:4px;">Transfers this session</div>
			<table class="table table-bordered"><thead><tr><th>Order Bag</th><th>From</th><th>To</th><th>Time</th></tr></thead><tbody class="tob-rbody"></tbody></table>
		</div>
	`);

	const mk = (sel, df) => {
		const c = frappe.ui.form.make_control({ df, parent: $(page.main).find(sel).get(0), render_input: true });
		c.refresh();
		return c;
	};
	state.bag = mk(".tob-bag", { fieldtype: "Link", label: "Order Bag (scan or type)", fieldname: "order_bag", options: "Order Bag" });
	state.cur = mk(".tob-cur", { fieldtype: "Data", label: "Current Location", fieldname: "cur", read_only: 1 });
	state.to = mk(".tob-to", { fieldtype: "Select", label: "New Location", fieldname: "to_location", options: TOB_LOCATIONS });
	state.rem = mk(".tob-rem", { fieldtype: "Data", label: "Remarks", fieldname: "remarks" });

	state.bag.$input.on("change awesomplete-selectcomplete", () => setTimeout(loadCurrent, 80));

	function loadCurrent() {
		const b = state.bag.get_value();
		if (!b) { state.cur.set_value(""); return; }
		frappe.db.get_value("Order Bag", b, "location").then((r) => {
			state.cur.set_value((r.message && r.message.location) || "");
		});
	}

	function doTransfer() {
		const b = state.bag.get_value();
		const to = state.to.get_value();
		if (!b) return frappe.msgprint(__("Scan or select an Order Bag."));
		if (!to) return frappe.msgprint(__("Pick a new location."));
		frappe.call({
			method: "jewelima.jewelima.api.transfer_order_bag",
			args: { order_bag: b, to_location: to, remarks: state.rem.get_value() || "" },
		}).then((r) => {
			const res = r.message || {};
			frappe.show_alert({ message: __("{0}: {1} → {2}", [b, res.from_location || "—", res.to_location]), indicator: "green" }, 5);
			$(page.main).find(".tob-rbody").prepend(
				`<tr><td><b>${frappe.utils.escape_html(b)}</b></td><td>${frappe.utils.escape_html(res.from_location || "—")}</td><td>${frappe.utils.escape_html(res.to_location)}</td><td>${frappe.datetime.str_to_user(frappe.datetime.now_datetime())}</td></tr>`
			);
			state.bag.set_value("");
			state.to.set_value("");
			state.rem.set_value("");
			state.cur.set_value("");
			setTimeout(() => state.bag.$input.focus(), 100);
		});
	}

	page.set_primary_action(__("Transfer"), doTransfer, "arrow-right");
	setTimeout(() => state.bag.$input.focus(), 200);
};
