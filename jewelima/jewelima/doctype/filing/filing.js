// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt

frappe.ui.form.on("Filing", {
	refresh(frm) {
		if (!frm.is_new() && frm.doc.status === "Completed") {
			frm.set_read_only();
			frm.disable_save();
			frm.set_intro(__("This stage is completed and locked."), "blue");
		}
	},
});
