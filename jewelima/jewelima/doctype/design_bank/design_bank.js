// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt

frappe.ui.form.on("Design Bank", {
	refresh(frm) {
		if (frm.doc.item) {
			frm.add_custom_button(__("Item"), () =>
				frappe.set_route("Form", "Item", frm.doc.item)
			);
		}
		if (frm.doc.bom) {
			frm.add_custom_button(__("BOM"), () => frappe.set_route("Form", "BOM", frm.doc.bom));
		}
	},
});
