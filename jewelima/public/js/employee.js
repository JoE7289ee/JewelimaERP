// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Employee > Login Details — the desk account behind the person: login name,
// email, last login, live sessions, roles, and a jump to the reset. Painted into
// the jw_login_html custom field. SYSTEM MANAGER only: everyone else never sees
// the section (the API is only_for System Manager and would just throw).

frappe.ui.form.on("Employee", {
	refresh(frm) {
		render(frm);
	},
	user_id(frm) {
		render(frm);
	},
});

function render(frm) {
	const fld = frm.get_field("jw_login_html");
	if (!fld) return;
	const sm = frappe.user.has_role("System Manager");

	// no account / not an admin -> the section is noise; hide it
	if (frm.is_new() || !sm || !frm.doc.user_id) {
		frm.set_df_property("jw_login_section", "hidden", 1);
		fld.$wrapper.empty();
		if (sm && !frm.is_new() && !frm.doc.user_id) {
			frm.set_df_property("jw_login_section", "hidden", 0);
			fld.$wrapper.html(`<div class="text-muted" style="font-size:13px;padding:4px 0;">
				${__("No desk account linked to this employee.")}
				<a href="/app/add-user">${__("Add User")}</a></div>`);
		}
		return;
	}
	frm.set_df_property("jw_login_section", "hidden", 0);

	frappe.call({ method: "jewelima.jewelima.api.get_login_accounts", args: { user: frm.doc.user_id } })
		.then((r) => {
			const a = (r.message || [])[0];
			if (!a) {
				fld.$wrapper.html(`<div class="text-muted" style="font-size:13px;">${
					__("Linked to {0}, but that user no longer exists.", [frappe.utils.escape_html(frm.doc.user_id)])}</div>`);
				return;
			}
			const esc = frappe.utils.escape_html;
			const when = (v) => (v
				? `${frappe.datetime.str_to_user(v)} <span style="color:var(--text-muted);">(${frappe.datetime.comment_when(v)})</span>`
				: `<span style="color:#b02a2a;font-weight:600;">${__("never logged in")}</span>`);
			const roles = (a.roles || []).filter((x) => x !== "All")
				.map((x) => `<span style="display:inline-block;padding:1px 7px;border-radius:9px;font-size:10px;
					font-weight:700;background:var(--subtle-accent);color:var(--text-muted);margin:0 4px 4px 0;">${esc(x)}</span>`)
				.join("") || `<span style="color:var(--text-muted);">${__("none")}</span>`;

			const cell = (label, value) => `<div style="margin-bottom:10px;">
				<div style="font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted);
					font-weight:600;margin-bottom:2px;">${label}</div>
				<div style="font-size:13px;">${value}</div></div>`;

			fld.$wrapper.html(`
				<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:0 20px;
					border:1px solid var(--border-color);border-radius:8px;padding:14px 16px;background:var(--fg-color);">
					${cell(__("Login Name"), `<b style="letter-spacing:.3px;">${esc(a.username || "—")}</b>${
						a.enabled ? "" : ` <span style="color:#b02a2a;font-size:11px;">${__("disabled")}</span>`}`)}
					${cell(__("Email"), esc(a.user))}
					${cell(__("Last Login"), when(a.last_login))}
					${cell(__("Sessions Active"), `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;
						margin-right:6px;background:${a.sessions ? "#22a06b" : "var(--text-muted)"};"></span>${a.sessions || 0}`)}
					<div style="grid-column:1/-1;">${cell(__("Roles"), roles)}</div>
				</div>
				<div style="margin-top:10px;">
					<button class="btn btn-xs btn-default jw-reset">${__("Reset Password")}</button>
					<button class="btn btn-xs btn-default jw-accounts">${__("All Login Accounts")}</button>
				</div>`);

			fld.$wrapper.find(".jw-reset").on("click", () => reset_dialog(a, frm));
			fld.$wrapper.find(".jw-accounts").on("click", () => frappe.set_route("reset-password"));
		})
		.catch(() => fld.$wrapper.empty());
}

// Reset right here — same API and the same rules as the Login Accounts page:
// takes effect at once, kills every session, never stores the password.
function reset_dialog(a, frm) {
	const esc = frappe.utils.escape_html;
	const d = new frappe.ui.Dialog({
		title: __("Reset password"),
		fields: [
			{ fieldtype: "HTML", fieldname: "who" },
			{ fieldtype: "Data", fieldname: "pwd", label: __("New Password"),
				description: __("min 6 characters"), reqd: 1 },
			{ fieldtype: "Button", fieldname: "gen", label: __("Generate"), click: () => {
				const c = "bcdfghjkmnpqrstvwxz", vo = "aeiou", dg = "23456789";
				const pick = (s) => s[Math.floor(Math.random() * s.length)];
				d.set_value("pwd", pick(c) + pick(vo) + pick(c) + pick(vo) + pick(c) + pick(dg) + pick(dg));
			} },
		],
		primary_action_label: __("Reset"),
		primary_action: () => {
			const p = (d.get_value("pwd") || "").trim();
			if (p.length < 6) {
				frappe.show_alert({ message: __("Password must be at least 6 characters."), indicator: "orange" }, 4);
				return;
			}
			d.hide();
			frappe.dom.freeze(__("Resetting..."));
			frappe.call({ method: "jewelima.jewelima.api.admin_reset_password",
				args: { user: a.user, new_password: p } })
				.then(() => {
					frappe.dom.unfreeze();
					frappe.msgprint({
						title: __("Password reset"), indicator: "green",
						message: __("<b>{0}</b> can now log in with username <b>{1}</b> and the new password.<br><br>Hand it over yourself — it isn't stored anywhere readable.",
							[esc(a.full_name || a.user), esc(a.username || "—")]),
					});
					render(frm);
				})
				.catch(() => frappe.dom.unfreeze());
		},
	});
	d.fields_dict.who.$wrapper.html(`<div style="font-size:13px;margin-bottom:10px;color:var(--text-muted);">${
		__("For <b>{0}</b> — login username <b>{1}</b>{2}", [esc(a.full_name || a.user), esc(a.username || "—"),
			a.sessions ? " · " + __("{0} session(s) will be logged out", [a.sessions]) : ""])}</div>`);
	d.show();
}
