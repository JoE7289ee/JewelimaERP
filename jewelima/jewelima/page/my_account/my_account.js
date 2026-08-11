// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// My Account — self-service: the logged-in user changes their own login
// username and/or password (current password required to confirm). Reached from
// the desk avatar (route_to_user is overridden in branding.bundle.js).
// Route: /app/my-account

frappe.pages["my-account"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "My Account", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;

	$(page.main).append(`
		<style>
		#page-my-account .container{max-width:100%;}
		.ma-wrap{max-width:460px;margin:6px auto 0;}
		.ma-card{border:1px solid var(--border-color);border-radius:14px;background:var(--fg-color);padding:22px 24px;box-shadow:0 2px 10px rgba(0,0,0,.05);}
		.ma-who{font-size:13px;color:var(--text-muted);margin-bottom:2px;}
		.ma-who b{color:var(--text-color);}
		.ma-h{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);margin:18px 0 8px;}
		.ma-lbl{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);margin:10px 0 3px;}
		.ma-in{width:100%;box-sizing:border-box;border:1px solid var(--border-color);border-radius:8px;padding:9px 11px;font-size:14px;background:var(--control-bg);color:var(--text-color);}
		.ma-in:focus{outline:none;border-color:#1f618d;box-shadow:0 0 0 2px rgba(31,97,141,.15);}
		.ma-hint{font-size:11.5px;color:var(--text-muted);margin-top:3px;}
		.ma-save{margin-top:20px;width:100%;border:none;border-radius:9px;padding:11px;font-size:14px;font-weight:800;color:#fff;background:#2e7d32;cursor:pointer;}
		.ma-save:disabled{opacity:.55;cursor:default;}
		.ma-note{margin-top:12px;font-size:12px;color:var(--text-muted);border-top:1px dashed var(--border-color);padding-top:10px;}
		</style>
		<div class="ma-wrap"><div class="ma-card">
			<div class="ma-who">${__("Signed in as")} <b class="ma-name">…</b></div>
			<div class="ma-h">${__("Login username")}</div>
			<label class="ma-lbl">${__("Username (this is what you log in with)")}</label>
			<input type="text" class="ma-in ma-username" autocomplete="off">
			<div class="ma-h">${__("Change password")}</div>
			<label class="ma-lbl">${__("New password")}</label>
			<input type="password" class="ma-in ma-new" autocomplete="new-password" placeholder="${__("leave blank to keep current")}">
			<label class="ma-lbl">${__("Confirm new password")}</label>
			<input type="password" class="ma-in ma-confirm" autocomplete="new-password">
			<div class="ma-h">${__("Confirm it's you")}</div>
			<label class="ma-lbl">${__("Current password")}</label>
			<input type="password" class="ma-in ma-current" autocomplete="current-password">
			<div class="ma-hint">${__("Required to save any change.")}</div>
			<button class="ma-save">${__("Save changes")}</button>
			<div class="ma-note">${__("Tip: after changing your username or password, use the new one the next time you log in.")}</div>
		</div></div>
	`);
	const root = $(page.main);
	let ORIG_USER = "";

	frappe.call({ method: API + ".get_my_login" }).then((r) => {
		const m = r.message || {};
		ORIG_USER = m.username || "";
		root.find(".ma-name").text(m.full_name || m.user || "");
		root.find(".ma-username").val(m.username || "");
	});

	root.find(".ma-save").on("click", function () {
		const username = (root.find(".ma-username").val() || "").trim();
		const np = root.find(".ma-new").val() || "";
		const confirm = root.find(".ma-confirm").val() || "";
		const cur = root.find(".ma-current").val() || "";

		const changingName = username && username !== ORIG_USER;
		const changingPwd = !!np;
		if (!changingName && !changingPwd) {
			return frappe.msgprint(__("Change your username or enter a new password first."));
		}
		if (changingPwd && np !== confirm) {
			return frappe.msgprint(__("The new password and its confirmation don't match."));
		}
		if (changingPwd && np.length < 6) {
			return frappe.msgprint(__("Password must be at least 6 characters."));
		}
		if (!cur) {
			return frappe.msgprint(__("Enter your current password to confirm the change."));
		}

		frappe.dom.freeze(__("Saving…"));
		frappe.call({
			method: API + ".change_my_login",
			args: { current_password: cur, new_username: changingName ? username : "", new_password: changingPwd ? np : "" },
		}).then((r) => {
			frappe.dom.unfreeze();
			const m = r.message || {};
			ORIG_USER = m.username || ORIG_USER;
			root.find(".ma-new, .ma-confirm, .ma-current").val("");
			const what = (m.changed || []).join(" & ");
			frappe.msgprint({
				title: __("Saved"), indicator: "green",
				message: __("Your {0} was updated. Use your new login details next time you sign in.", [what || __("account")]),
			});
		}).catch(() => frappe.dom.unfreeze());
	});
};
