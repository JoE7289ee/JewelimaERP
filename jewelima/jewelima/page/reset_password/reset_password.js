// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Login Accounts (SYSTEM MANAGER only) — one table of every desk account: login
// name, email, who it is, last login, live sessions, and a per-row reset. The
// floor accounts have no real mailboxes, so the admin sets a password here and
// hands it over. Old sessions are killed on reset; the reset is logged on the
// User record (never the password itself). Route: /app/reset-password

frappe.pages["reset-password"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Login Accounts", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	let ROWS = [];

	$(page.main).append(`
		<style>
		.la-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px;}
		.la-search{flex:0 1 260px;}
		.la-count{color:var(--text-muted);font-size:12px;margin-left:auto;}
		.la-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;}
		.la-tbl th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.4px;
			color:var(--text-muted);font-weight:600;padding:8px 10px;border-bottom:1px solid var(--border-color);
			white-space:nowrap;}
		.la-tbl td{padding:9px 10px;border-bottom:1px solid var(--border-color);vertical-align:middle;}
		.la-tbl tbody tr:hover{background:var(--bg-light-gray,var(--subtle-accent));}
		.la-login{font-weight:700;letter-spacing:.3px;}
		.la-email{color:var(--text-muted);}
		.la-sub{display:block;font-size:11px;color:var(--text-muted);}
		.la-never{color:#b02a2a;font-weight:600;}
		.la-dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:6px;
			background:var(--text-muted);vertical-align:middle;}
		.la-dot.on{background:#22a06b;}
		.la-off{opacity:.5;}
		.la-pill{display:inline-block;padding:1px 7px;border-radius:9px;font-size:10px;font-weight:700;
			background:var(--subtle-accent);color:var(--text-muted);margin-right:4px;}
		.la-reset{background:#b02a2a;border:none;color:#fff;font-weight:700;letter-spacing:.4px;
			padding:5px 14px;border-radius:6px;font-size:11px;cursor:pointer;}
		.la-reset:hover{background:#8f1f1f;}
		.la-kick{font-size:11px;}
		.la-note{margin-top:14px;color:var(--text-muted);font-size:12px;}
		.la-empty{padding:30px;text-align:center;color:var(--text-muted);}
		</style>
		<div class="la-bar">
			<div class="la-search"></div>
			<label class="la-showdis" style="font-size:12px;color:var(--text-muted);margin:0;">
				<input type="checkbox" class="la-dis-cb"> ${__("Show disabled")}</label>
			<span class="la-count"></span>
		</div>
		<div class="la-body"></div>
		<div class="la-note">${__("System Manager only. A reset takes effect immediately and logs that user out everywhere — hand the password over yourself; it isn't stored anywhere readable.")}</div>
	`);
	const root = $(page.main)[0];

	const search = frappe.ui.form.make_control({
		df: { fieldtype: "Data", label: __("Search"), placeholder: __("login, email or name"),
			onchange: () => render() },
		parent: $(root).find(".la-search").get(0), render_input: true,
	});
	search.refresh();
	$(root).find(".la-dis-cb").on("change", () => render());

	const when = (v) => (v ? `${frappe.datetime.str_to_user(v)}<span class="la-sub">${frappe.datetime.comment_when(v)}</span>` : `<span class="la-never">${__("never")}</span>`);

	function render() {
		const q = (search.get_value() || "").toLowerCase().trim();
		const show_disabled = $(root).find(".la-dis-cb").is(":checked");
		const rows = ROWS.filter((r) => {
			if (!show_disabled && !r.enabled) return false;
			if (!q) return true;
			return [r.username, r.user, r.full_name].join(" ").toLowerCase().includes(q);
		});

		$(root).find(".la-count").text(
			__("{0} account(s) · {1} logged in now", [rows.length, ROWS.reduce((a, r) => a + (r.sessions ? 1 : 0), 0)]));

		if (!rows.length) {
			$(root).find(".la-body").html(`<div class="la-empty">${__("No accounts match.")}</div>`);
			return;
		}

		const body = rows.map((r) => {
			const roles = (r.roles || []).filter((x) => x !== "All").slice(0, 3)
				.map((x) => `<span class="la-pill">${esc(x)}</span>`).join("");
			return `<tr class="${r.enabled ? "" : "la-off"}" data-user="${esc(r.user)}">
				<td><span class="la-login">${esc(r.username || "—")}</span>
					${r.enabled ? "" : `<span class="la-sub">${__("disabled")}</span>`}</td>
				<td class="la-email">${esc(r.user)}</td>
				<td>${esc(r.full_name || "—")}
					<span class="la-sub">${roles || ""}${r.designation ? esc(r.designation) : ""}</span></td>
				<td>${when(r.last_login)}</td>
				<td><span class="la-dot ${r.sessions ? "on" : ""}"></span>${r.sessions || 0}
					${r.sessions ? `<a class="la-kick" href="#" data-kick="${esc(r.user)}">${__("log out")}</a>` : ""}</td>
				<td style="text-align:right;"><button class="la-reset" data-reset="${esc(r.user)}">${__("RESET")}</button></td>
			</tr>`;
		}).join("");

		$(root).find(".la-body").html(`<table class="la-tbl">
			<thead><tr>
				<th>${__("Login Name")}</th><th>${__("Email")}</th><th>${__("Name")}</th>
				<th>${__("Last Login")}</th><th>${__("Sessions")}</th><th></th>
			</tr></thead><tbody>${body}</tbody></table>`);
	}

	function load() {
		frappe.call({ method: API + ".get_login_accounts" }).then((r) => {
			ROWS = r.message || [];
			render();
		});
	}

	// --- reset dialog -------------------------------------------------------
	const gen = () => {
		const c = "bcdfghjkmnpqrstvwxz", vo = "aeiou", d = "23456789";
		const pick = (s) => s[Math.floor(Math.random() * s.length)];
		return pick(c) + pick(vo) + pick(c) + pick(vo) + pick(c) + pick(d) + pick(d);
	};

	function reset_dialog(user) {
		const row = ROWS.find((r) => r.user === user) || {};
		const d = new frappe.ui.Dialog({
			title: __("Reset password"),
			fields: [
				{ fieldtype: "HTML", fieldname: "who" },
				{ fieldtype: "Data", fieldname: "pwd", label: __("New Password"),
					description: __("min 6 characters"), reqd: 1 },
				{ fieldtype: "Button", fieldname: "gen", label: __("Generate"),
					click: () => d.set_value("pwd", gen()) },
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
				frappe.call({ method: API + ".admin_reset_password", args: { user, new_password: p } })
					.then((r) => {
						frappe.dom.unfreeze();
						const m = r.message || {};
						frappe.msgprint({
							title: __("Password reset"), indicator: "green",
							message: __("<b>{0}</b> can now log in with username <b>{1}</b> and the new password.<br><br>Hand it over yourself — it isn't stored anywhere readable.",
								[esc(m.user), esc(m.username || "—")]),
						});
						load();
					}).catch(() => frappe.dom.unfreeze());
			},
		});
		d.fields_dict.who.$wrapper.html(
			`<div style="font-size:13px;margin-bottom:10px;color:var(--text-muted);">${
				__("For <b>{0}</b> — login username <b>{1}</b>{2}",
					[esc(row.full_name || user), esc(row.username || "—"),
						row.sessions ? " · " + __("{0} session(s) will be logged out", [row.sessions]) : ""])
			}</div>`);
		d.show();
	}

	$(root).on("click", "[data-reset]", function () {
		reset_dialog($(this).attr("data-reset"));
	});

	$(root).on("click", "[data-kick]", function (e) {
		e.preventDefault();
		const user = $(this).attr("data-kick");
		frappe.confirm(__("Log <b>{0}</b> out of every device?", [esc(user)]), () => {
			frappe.call({ method: API + ".end_user_sessions", args: { user } }).then(() => {
				frappe.show_alert({ message: __("Logged out."), indicator: "green" }, 3);
				load();
			});
		});
	});

	page.set_primary_action(__("Refresh"), () => load(), "refresh");
	page.add_inner_button(__("User Roles"), () => frappe.set_route("user-roles"));
	page.add_inner_button(__("Add User"), () => frappe.set_route("add-user"));
	load();
};
