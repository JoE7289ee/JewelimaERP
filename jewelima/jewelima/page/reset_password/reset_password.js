// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Reset Password (Setup > Employee, SYSTEM MANAGER only) — the floor accounts
// have no real mailboxes, so the admin sets a new password here and hands it
// over. Old sessions are killed; the reset is logged on the User record (never
// the password itself). Route: /app/reset-password

frappe.pages["reset-password"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Reset Password", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;

	$(page.main).append(`
		<style>
		.rp-wrap{max-width:560px;}
		.rp-wrap .control-label{font-size:11px;color:var(--text-muted);}
		.rp-wrap .help-box,.rp-wrap .description{display:none !important;}
		.rp-card{border:1px solid var(--border-color);border-radius:10px;background:var(--fg-color);padding:16px 18px;margin-top:14px;}
		.rp-who{font-size:13px;color:var(--text-muted);margin:-4px 0 12px;min-height:18px;}
		.rp-who b{color:var(--text-color);}
		.rp-row{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;}
		.rp-pass{flex:1 1 240px;}
		.rp-note{margin-top:14px;color:var(--text-muted);font-size:12px;}
		.rp-go{background:#b02a2a;border:none;color:#fff;font-weight:800;letter-spacing:.5px;padding:9px 24px;border-radius:7px;font-size:13px;cursor:pointer;}
		.rp-go:hover{background:#8f1f1f;}
		</style>
		<div class="rp-wrap">
			<div class="rp-user"></div>
			<div class="rp-who"></div>
			<div class="rp-card">
				<div class="rp-row">
					<div class="rp-pass"></div>
					<button class="btn btn-sm rp-gen">${__("Generate")}</button>
					<button class="rp-go">${__("RESET")}</button>
				</div>
			</div>
			<div class="rp-note">${__("System Manager only. The new password is set immediately and every existing session of that user is logged out — hand the password over yourself. The reset is logged on the User record (never the password).")}</div>
		</div>
	`);
	const root = $(page.main)[0];

	const mk = (sel, df) => {
		const c = frappe.ui.form.make_control({ df, parent: $(root).find(sel).get(0), render_input: true });
		c.refresh();
		return c;
	};
	const user = mk(".rp-user", { fieldtype: "Link", label: __("User"), fieldname: "user", options: "User",
		get_query: () => ({ filters: { enabled: 1, user_type: "System User", name: ["!=", "Guest"] } }),
		onchange: () => who() });
	const pass = mk(".rp-pass", { fieldtype: "Data", label: __("New Password"), fieldname: "pwd",
		placeholder: __("min 6 characters") });

	function who() {
		const u = user.get_value();
		const $w = $(root).find(".rp-who");
		if (!u) {
			$w.html("");
			return;
		}
		Promise.all([
			frappe.db.get_value("User", u, ["full_name", "username"]),
			frappe.db.get_value("Employee", { user_id: u }, "employee_name"),
		]).then(([r1, r2]) => {
			const v = r1.message || {};
			const emp = (r2.message || {}).employee_name;
			$w.html(__("Resetting for <b>{0}</b> — login username <b>{1}</b>{2}",
				[esc(v.full_name || u), esc(v.username || "—"), emp ? " · " + esc(emp) : ""]));
		});
	}

	$(root).find(".rp-gen").on("click", () => {
		// simple pronounceable-ish throwaway: 2 letters blocks + 2 digits
		const c = "bcdfghjkmnpqrstvwxz", vo = "aeiou", d = "23456789";
		const pick = (s) => s[Math.floor(Math.random() * s.length)];
		pass.set_value(pick(c) + pick(vo) + pick(c) + pick(vo) + pick(c) + pick(d) + pick(d));
	});

	$(root).find(".rp-go").on("click", () => {
		const u = user.get_value();
		const p = (pass.get_value() || "").trim();
		if (!u) {
			frappe.show_alert({ message: __("Pick the user."), indicator: "orange" }, 4);
			return;
		}
		if (p.length < 6) {
			frappe.show_alert({ message: __("Password must be at least 6 characters."), indicator: "orange" }, 4);
			return;
		}
		frappe.confirm(__("Reset the password for <b>{0}</b>?<br>All their sessions will be logged out.", [esc(u)]), () => {
			frappe.dom.freeze(__("Resetting..."));
			frappe.call({ method: API + ".admin_reset_password", args: { user: u, new_password: p } })
				.then((r) => {
					frappe.dom.unfreeze();
					const m = r.message || {};
					frappe.msgprint({
						title: __("Password reset"), indicator: "green",
						message: __("Done — <b>{0}</b> (username <b>{1}</b>) can now log in with the new password. Hand it over yourself; it isn't stored anywhere readable.", [esc(m.user), esc(m.username || "—")]),
					});
					pass.set_value("");
				}).catch(() => frappe.dom.unfreeze());
		});
	});

	page.add_inner_button(__("User Roles"), () => frappe.set_route("user-roles"));
};
