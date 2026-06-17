// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt

frappe.ui.form.on("Design", {
	setup(frm) {
		// BOM materials are raw materials only (exclude the sellable design Items).
		frm.set_query("item", "materials", () => ({ filters: { is_sales_item: 0, is_stock_item: 1 } }));
	},
	refresh(frm) {
		if (frm.is_new()) return;

		// A design is immutable after creation — read-only, with View + Retire actions.
		frm.set_read_only();
		frm.disable_save();

		if (frm.doc.item) {
			frm.add_custom_button(__("Item"), () => frappe.set_route("Form", "Item", frm.doc.item));
		}
		if (frm.doc.bom) {
			frm.add_custom_button(__("BOM"), () => frappe.set_route("Form", "BOM", frm.doc.bom));
		}

		if (frm.doc.status === "Retired") {
			frm.set_intro(__("This design is retired."), "red");
			return;
		}
		frm.set_intro(__("Designs can't be edited after creation — you can only retire them."), "blue");
		frm.add_custom_button(__("Retire Design"), () => {
			frappe.confirm(__("Retire {0}? It can only be retired if nothing in manufacturing uses it.", [frm.doc.name]), () => {
				frm.call("retire").then(() => frm.reload_doc());
			});
		}).addClass("btn-danger");
	},
});
