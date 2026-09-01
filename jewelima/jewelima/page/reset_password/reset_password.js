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


	function exportSheet() {
		frappe.call({ method: API + ".get_login_export" }).then((r) => {
			const d = r.message || {};
			const rows = d.rows || [];
			if (!rows.length) return frappe.msgprint(__("No logins to export."));
			const esc = frappe.utils.escape_html;
			const picked = new Set(rows.map((x) => x.user));   // all in, to start

			const dlg = new frappe.ui.Dialog({
				title: __("Export logins"), size: "large",
				fields: [{ fieldname: "html", fieldtype: "HTML" }],
				primary_action_label: __("Download CSV"),
				primary_action() {
					const take = rows.filter((x) => picked.has(x.user));
					if (!take.length) return frappe.msgprint(__("Nothing ticked."));
					const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
					const csv = [["Username", "Name", "Roles", "Password"].map(q).join(",")]
						.concat(take.map((x) => [x.username, x.full_name, x.roles.join(", "),
							// never invent a password for someone who changed theirs
							x.password || __("changed")].map(q).join(",")))
						.join("\n");
					const a = document.createElement("a");
					a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" }));
					a.download = "jewelima-logins-" + frappe.datetime.get_today() + ".csv";
					document.body.appendChild(a); a.click(); a.remove();
					URL.revokeObjectURL(a.href);
					dlg.hide();
					frappe.show_alert({ message: __("{0} login(s) exported", [take.length]), indicator: "green" }, 5);
				},
			});

			const changed = rows.filter((x) => x.changed).length;
			dlg.fields_dict.html.$wrapper.html(`
				<style>
				.ex-bar{display:flex;gap:10px;align-items:center;margin-bottom:9px;font-size:12px;}
				.ex-bar a{cursor:pointer;font-weight:700;}
				.ex-count{margin-left:auto;color:var(--text-muted);}
				.ex-t{width:100%;border-collapse:collapse;font-size:12.5px;}
				.ex-t th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em;
					color:var(--text-muted);padding:6px 8px;border-bottom:1px solid var(--border-color);}
				.ex-t td{padding:5px 8px;border-bottom:1px solid var(--border-color);vertical-align:top;}
				.ex-t tr:last-child td{border-bottom:0;}
				.ex-wrap{max-height:52vh;overflow:auto;border:1px solid var(--border-color);border-radius:8px;}
				.ex-roles{font-size:11px;color:var(--text-muted);}
				.ex-pw{font-family:monospace;font-weight:700;}
				.ex-pw.ch{font-family:inherit;font-weight:400;color:#b02a2a;font-style:italic;}
				.ex-off{opacity:.55;}
				</style>
				<div class="ex-bar">
					<a class="ex-all">${__("Select all")}</a> ·
					<a class="ex-none">${__("Clear all")}</a>
					<span class="ex-count"></span>
				</div>
				<div class="ex-wrap"><table class="ex-t">
					<thead><tr><th style="width:34px;"></th><th>${__("Username")}</th>
						<th>${__("Name")}</th><th>${__("Roles")}</th><th style="width:110px;">${__("Password")}</th></tr></thead>
					<tbody>${rows.map((x) => `<tr class="${x.enabled ? "" : "ex-off"}" data-u="${esc(x.user)}">
						<td><input type="checkbox" class="ex-c" checked></td>
						<td><b>${esc(x.username)}</b>${x.enabled ? "" : ` <small>(${__("disabled")})</small>`}</td>
						<td>${esc(x.full_name)}</td>
						<td class="ex-roles">${esc(x.roles.join(", ")) || "—"}</td>
						<td class="ex-pw ${x.changed ? "ch" : ""}">${x.changed ? __("changed") : esc(x.password)}</td>
					</tr>`).join("")}</tbody>
				</table></div>
				${changed ? `<div style="margin-top:8px;font-size:11.5px;color:var(--text-muted);">${
					__("{0} of these have changed their own password, so there is none to hand out.", [changed])
				}</div>` : ""}
			`);

			const $w = dlg.fields_dict.html.$wrapper;
			const count = () => $w.find(".ex-count").text(__("{0} of {1} ticked", [picked.size, rows.length]));
			$w.on("change", ".ex-c", function () {
				const u = $(this).closest("tr").data("u");
				if (this.checked) picked.add(u); else picked.delete(u);
				count();
			});
			$w.on("click", ".ex-all", () => {
				rows.forEach((x) => picked.add(x.user));
				$w.find(".ex-c").prop("checked", true); count();
			});
			$w.on("click", ".ex-none", () => {
				picked.clear(); $w.find(".ex-c").prop("checked", false); count();
			});
			count();
			dlg.show();
		});
	}

	page.set_primary_action(__("Refresh"), () => load(), "refresh");
	// ---- the hand-out sheet ------------------------------------------------
	// Everyone by default, because that is the usual job; the list is there to
	// take people OUT of, and to pick one or two when that is all you need.
	page.add_inner_button(__("Export"), exportSheet);

	page.add_inner_button(__("User Roles"), () => frappe.set_route("user-roles"));
	page.add_inner_button(__("Add User"), () => frappe.set_route("add-user"));
	load();
};
