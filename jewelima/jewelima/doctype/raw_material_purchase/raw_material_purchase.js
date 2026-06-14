// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt

frappe.ui.form.on("Raw Material Purchase", {
	setup(frm) {
		// Only purchasable items.
		frm.set_query("item", "items", () => ({ filters: { is_purchase_item: 1 } }));
		// Only leaf (non-group) warehouses can receive stock.
		frm.set_query("set_warehouse", () => ({
			filters: { is_group: 0, company: frm.doc.company },
		}));
	},
	onload(frm) {
		if (!frm.is_new()) return;
		const company = frm.doc.company || frappe.defaults.get_default("company");
		if (!frm.doc.company) frm.set_value("company", company);
		if (!frm.doc.set_warehouse) {
			frappe.db
				.get_value("Warehouse", { warehouse_name: "Raw Materials Store", company: company }, "name")
				.then((r) => {
					if (r && r.message && r.message.name) frm.set_value("set_warehouse", r.message.name);
				});
		}
	},
	refresh(frm) {
		if (frm.doc.docstatus === 1 && frm.doc.purchase_receipt) {
			frm.add_custom_button(__("Purchase Receipt"), () => {
				frappe.set_route("Form", "Purchase Receipt", frm.doc.purchase_receipt);
			});
		}
	},
});

frappe.ui.form.on("Raw Material Purchase Item", {
	qty: (frm, cdt, cdn) => set_amount(cdt, cdn),
	rate: (frm, cdt, cdn) => set_amount(cdt, cdn),
});

function set_amount(cdt, cdn) {
	const row = locals[cdt][cdn];
	frappe.model.set_value(cdt, cdn, "amount", (row.qty || 0) * (row.rate || 0));
}
