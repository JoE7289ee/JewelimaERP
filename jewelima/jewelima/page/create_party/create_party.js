// Create Party — build a new party from the code masters (Group-Zone-District-
// State[-Special]) and, optionally, migrate: link a legacy old name onto it.
// Route: /app/create-party
frappe.pages["create-party"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Create Party"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const code = (v) => (v || "").split(" - ")[0]; // composite master name -> short code

	$(page.main).append(`
		<style>
		.cp-wrap{max-width:640px;}
		.cp-card{border:1px solid var(--border-color);border-radius:10px;background:var(--fg-color);padding:20px 24px;margin-bottom:16px;}
		.cp-sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin:0 0 12px;}
		.cp-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;}
		.cp-grid .frappe-control{margin:0;}
		.cp-full{grid-column:1 / -1;}
		.cp-preview{font-size:22px;font-weight:800;letter-spacing:.02em;margin:16px 0 4px;min-height:28px;}
		.cp-preview .muted{color:var(--text-muted);font-weight:600;font-size:14px;}
		.cp-hint{font-size:12px;color:var(--text-muted);margin-bottom:14px;}
		</style>
		<div class="cp-wrap">
			<div class="cp-card">
				<div class="cp-sec">${__("Identity")}</div>
				<div class="cp-grid">
					<div class="cp-group"></div><div class="cp-zone"></div>
					<div class="cp-district"></div><div class="cp-state"></div>
					<div class="cp-special cp-full"></div>
				</div>
				<div class="cp-preview"><span class="muted">${__("Pick group, district and state…")}</span></div>
			</div>
			<div class="cp-card">
				<div class="cp-sec">${__("Migrate (optional)")}</div>
				<div class="cp-hint">${__("Link a legacy old name to this party — it'll resolve in Look-Up. Leave empty to skip.")}</div>
				<div class="cp-old"></div>
			</div>
			<button class="btn btn-primary cp-create">${__("Create Party")}</button>
		</div>
	`);
	const root = $(page.main);
	const mk = (sel, df) => { const c = frappe.ui.form.make_control({ df, parent: root.find(sel).get(0), render_input: true }); c.refresh(); return c; };

	const fG = mk(".cp-group", { fieldtype: "Link", label: __("Group (Company)"), fieldname: "group", options: "Party Group", reqd: 1 });
	const fZ = mk(".cp-zone", { fieldtype: "Link", label: __("Zone / Locality (optional)"), fieldname: "zone", options: "Party Zone" });
	const fD = mk(".cp-district", { fieldtype: "Link", label: __("District"), fieldname: "district", options: "Party District", reqd: 1 });
	const fS = mk(".cp-state", { fieldtype: "Link", label: __("State"), fieldname: "state", options: "Party State", reqd: 1 });
	const fSp = mk(".cp-special", { fieldtype: "Link", label: __("Special (optional)"), fieldname: "special", options: "Party Special" });
	const fOld = mk(".cp-old", { fieldtype: "Link", label: __("Old name"), fieldname: "old", options: "Party Old Name",
		description: __("Pick the legacy name (imported old names are here).") });

	function preview() {
		const g = fG.get_value(), z = fZ.get_value(), d = fD.get_value(), s = fS.get_value(), sp = fSp.get_value();
		const parts = [g, code(z), code(d), code(s)].filter(Boolean);
		if (sp) parts.push(code(sp));
		const $p = root.find(".cp-preview");
		if (g && d && s) $p.html(`→ ${esc(parts.join("-"))}`);
		else $p.html(`<span class="muted">${__("Pick group, district and state…")}</span>`);
	}
	[fG, fZ, fD, fS, fSp].forEach((f) => f.$input.on("change", () => setTimeout(preview, 80)));

	root.find(".cp-create").on("click", () => {
		const args = { group: fG.get_value(), zone: fZ.get_value() || null, district: fD.get_value(),
			state: fS.get_value(), special: fSp.get_value() || null };
		if (!args.group || !args.district || !args.state)
			return frappe.msgprint(__("Group, District and State are required."));
		const old = fOld.get_value();
		frappe.dom.freeze(__("Creating…"));
		frappe.call({ method: API + ".make_party", args }).then((r) => {
			const nm = (r.message || {}).name;
			if (!nm) { frappe.dom.unfreeze(); return; }
			const done = () => {
				frappe.dom.unfreeze();
				frappe.show_alert({ message: __("{0} created.", [nm]), indicator: "green" }, 5);
				[fZ, fD, fS, fSp, fOld].forEach((f) => f.set_value(""));
				preview();
			};
			if (old) {
				frappe.call({ method: API + ".assign_old_name", args: { old_name: old, party: nm } }).then(done);
			} else { done(); }
		}).catch(() => frappe.dom.unfreeze());
	});
};
