// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// My Account — self-service login name + password for any staff user (the tight
// personas can't open the User form, so this is their safe way to change both).
// Reached from the bottom-left avatar. Route: /app/my-account

frappe.pages["my-account"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "My Account", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;

	$(page.main).append(`
		<style>
		#page-my-account .container{max-width:100%;}
		.ma-wrap{max-width:520px;}
		.ma-who{display:flex;align-items:center;gap:12px;margin-bottom:18px;}
		.ma-av{width:46px;height:46px;border-radius:50%;background:#1f618d;color:#fff;font-weight:800;font-size:18px;display:flex;align-items:center;justify-content:center;}
		.ma-name{font-size:16px;font-weight:800;line-height:1.2;}
		.ma-email{font-size:12.5px;color:var(--text-muted);}
		.ma-card{border:1px solid var(--border-color);border-radius:13px;background:var(--fg-color);padding:16px 18px;margin-bottom:16px;}
		.ma-card h3{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin:0 0 12px;}
		.ma-row{display:flex;flex-direction:column;gap:5px;margin-bottom:12px;}
		.ma-row label{font-size:12px;font-weight:600;color:var(--text-muted);}
		.ma-row input{border:1px solid var(--gray-400,#aeb6bf);background:var(--control-bg);color:var(--text-color);height:36px;border-radius:8px;padding:2px 12px;font-size:14px;}
		.ma-row input:focus{outline:2px solid #1f618d;outline-offset:1px;}
		.ma-btn{background:#1f618d;border:none;color:#fff;font-weight:700;border-radius:8px;padding:9px 20px;font-size:13.5px;cursor:pointer;}
		.ma-btn:hover{background:#184e70;}
		.ma-hint{font-size:11.5px;color:var(--text-muted);margin-top:2px;}
		.ma-signout{margin-left:auto;background:transparent;border:1px solid var(--gray-400,#aeb6bf);color:var(--text-muted);border-radius:8px;padding:7px 16px;font-weight:700;font-size:13px;cursor:pointer;}
		.ma-signout:hover{border-color:#b02a2a;color:#b02a2a;}
		</style>
		<div class="ma-wrap">
			<div class="ma-who"><div class="ma-av" id="ma-av"></div>
				<div><div class="ma-name" id="ma-name"></div><div class="ma-email" id="ma-email"></div></div>
				<button class="ma-signout">${__("Sign out")}</button></div>

			<div class="ma-card">
				<h3>${__("Login name")}</h3>
				<div class="ma-row">
					<label>${__("Username you sign in with")}</label>
					<input type="text" class="ma-username" autocomplete="off">
				</div>
				<button class="ma-btn ma-save-un">${__("Save login name")}</button>
			</div>

			<div class="ma-card">
				<h3>${__("Password")}</h3>
				<div class="ma-row">
					<label>${__("New password")}</label>
					<input type="password" class="ma-pw1" autocomplete="new-password">
					<div class="ma-hint">${__("At least 6 characters.")}</div>
				</div>
				<div class="ma-row">
					<label>${__("Confirm new password")}</label>
					<input type="password" class="ma-pw2" autocomplete="new-password">
				</div>
				<button class="ma-btn ma-save-pw">${__("Change password")}</button>
			</div>
		</div>
	`);
	const root = $(page.main);

	frappe.call({ method: API + ".get_my_account" }).then((r) => {
		const m = r.message || {};
		root.find("#ma-name").text(m.full_name || m.user);
		root.find("#ma-email").text(m.user);
		root.find("#ma-av").text((m.full_name || m.user || "?").trim().charAt(0).toUpperCase());
		root.find(".ma-username").val(m.username || "");
	});

	root.find(".ma-save-un").on("click", function () {
		const u = (root.find(".ma-username").val() || "").trim();
		if (!u) { frappe.show_alert({ message: __("Enter a login name."), indicator: "orange" }, 4); return; }
		frappe.call({ method: API + ".set_my_username", args: { username: u }, freeze: true, freeze_message: __("Saving…") })
			.then(() => frappe.show_alert({ message: __("Login name saved — use it next time you sign in."), indicator: "green" }, 6));
	});

	root.find(".ma-signout").on("click", function () {
		frappe.call({ method: "logout" }).always(() => { window.location.href = "/login"; });
	});

	root.find(".ma-save-pw").on("click", function () {
		const p1 = root.find(".ma-pw1").val() || "", p2 = root.find(".ma-pw2").val() || "";
		if (p1.length < 6) { frappe.show_alert({ message: __("Password must be at least 6 characters."), indicator: "orange" }, 4); return; }
		if (p1 !== p2) { frappe.show_alert({ message: __("The two passwords don’t match."), indicator: "orange" }, 4); return; }
		frappe.call({ method: API + ".set_my_password", args: { new_password: p1 }, freeze: true, freeze_message: __("Changing…") })
			.then(() => {
				root.find(".ma-pw1, .ma-pw2").val("");
				frappe.show_alert({ message: __("Password changed — use it next time you sign in."), indicator: "green" }, 7);
			});
	});
};
