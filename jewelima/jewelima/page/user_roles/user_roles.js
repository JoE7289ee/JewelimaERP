// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// User Roles (Setup > Employee) — who holds which roles, at a glance: rows =
// enabled system users, columns = the Jewelima roles (+ System / Stock
// Manager), everything else as chips. Click a user to ASSIGN / RE-ASSIGN
// their roles right here (Administrator stays hands-off; you cannot strip
// System Manager from yourself). Route: /app/user-roles

frappe.pages["user-roles"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "User Roles", single_column: true });
	const S = { d: null, term: "" };
	const esc = frappe.utils.escape_html;

	$(page.main).append(`
		<style>
		.ur-top{display:flex;align-items:center;gap:10px;margin:2px 0 10px;flex-wrap:wrap;}
		.ur-search{width:260px;border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);padding:4px 10px;height:30px;border-radius:5px;box-sizing:border-box;color:var(--text-color);font-size:13px;}
		.ur-count{color:var(--text-muted);font-size:12px;margin-left:auto;}
		.ur-box{border:1px solid var(--border-color);border-radius:11px;overflow:auto;max-height:calc(100vh - 200px);background:var(--fg-color);}
		table.ur-tbl{border-collapse:separate;border-spacing:0;font-size:12.5px;min-width:100%;}
		table.ur-tbl th{position:sticky;top:0;z-index:2;background:var(--control-bg,var(--fg-color));border-bottom:2px solid var(--gray-400,#aeb6bf);padding:6px 10px;text-align:center;white-space:nowrap;font-weight:700;}
		table.ur-tbl th:first-child{left:0;z-index:3;text-align:left;}
		table.ur-tbl td:first-child{position:sticky;left:0;background:var(--fg-color);text-align:left;z-index:1;border-right:1px solid var(--border-color);}
		table.ur-tbl td{border-bottom:1px solid var(--border-color);padding:5px 10px;text-align:center;white-space:nowrap;}
		table.ur-tbl tr:hover td{filter:brightness(.97);}
		.ur-name{font-weight:700;cursor:pointer;}
		.ur-name:hover{color:var(--primary);text-decoration:underline;}
		.ur-sub{display:block;font-size:10.5px;color:var(--text-muted);}
		.ur-yes{display:inline-block;width:20px;height:20px;line-height:20px;border-radius:50%;background:#eaf6ec;color:#1d7a33;font-weight:800;}
		.ur-no{color:var(--text-muted);opacity:.5;}
		.ur-chip{display:inline-block;border-radius:9px;background:var(--control-bg);padding:1px 8px;font-size:10.5px;font-weight:600;margin:1px 2px;color:var(--text-muted);}
		.ur-prof{display:inline-block;border-radius:9px;background:#e7f0fb;color:#1c5da8;padding:1px 8px;font-size:10.5px;font-weight:700;}
		.ur-empty{padding:20px;text-align:center;color:var(--text-muted);}
		td.ur-others{text-align:left;max-width:320px;white-space:normal;}
		</style>
		<div class="ur-top">
			<input class="ur-search" type="text" placeholder="${__("Search users…")}">
			<span class="ur-count"></span>
		</div>
		<div class="ur-box"><table class="ur-tbl"><thead class="ur-head"></thead><tbody class="ur-rows"></tbody></table></div>
	`);
	const root = $(page.main)[0];

	function render() {
		const d = S.d || {};
		const cols = d.columns || [];
		const term = S.term.toLowerCase().trim();
		const users = (d.users || []).filter((u) =>
			!term || [u.user, u.full_name, u.employee, u.role_profile].join(" ").toLowerCase().includes(term));
		root.querySelector(".ur-count").textContent = __("{0} user(s)", [users.length]);

		root.querySelector(".ur-head").innerHTML = `<tr><th>${__("User")}</th>
			${cols.map((c) => `<th>${esc(c.replace("Jewelima ", "Jw "))}</th>`).join("")}
			<th style="text-align:left">${__("Other Roles")}</th></tr>`;

		root.querySelector(".ur-rows").innerHTML = users.length ? users.map((u) => `
			<tr>
				<td><span class="ur-name" data-user="${esc(u.user)}">${esc(u.full_name)}</span>
					<span class="ur-sub">${esc(u.user)}${u.employee && u.employee !== u.full_name ? " · " + esc(u.employee) : ""}</span>
					${u.role_profile ? `<span class="ur-prof">${esc(u.role_profile)}</span>` : ""}</td>
				${cols.map((c) => `<td>${u.has[c] ? '<span class="ur-yes">✓</span>' : '<span class="ur-no">·</span>'}</td>`).join("")}
				<td class="ur-others">${(u.others || []).map((r) => `<span class="ur-chip">${esc(r)}</span>`).join("") || '<span class="ur-no">·</span>'}</td>
			</tr>`).join("")
			: `<tr><td colspan="${cols.length + 2}" class="ur-empty">${__("No users match.")}</td></tr>`;
	}

	// click a user -> the assign dialog (tick roles, Save; Jewelima's first)
	$(root).on("click", ".ur-name", function () {
		const user = this.getAttribute("data-user");
		if (user === "Administrator") {
			frappe.show_alert({ message: __("Administrator's roles are not managed here."), indicator: "orange" }, 4);
			return;
		}
		frappe.call({ method: "jewelima.jewelima.api.get_user_role_editor", args: { user } }).then((r) => {
			const m = r.message || {};
			const has = new Set(m.has || []);
			const cb = (role) => `<label style="display:flex;align-items:center;gap:7px;font-size:12.5px;padding:3px 2px;cursor:pointer;">
				<input type="checkbox" class="ur-cb" value="${esc(role)}" ${has.has(role) ? "checked" : ""}
					style="width:15px;height:15px;accent-color:#1f618d;">${esc(role)}</label>`;
			const grid = (roles) => `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:0 14px;">
				${roles.map(cb).join("")}</div>`;
			const d = new frappe.ui.Dialog({
				title: __("Roles — {0}", [m.full_name || user]),
				size: "large",
				fields: [{ fieldtype: "HTML", fieldname: "b" }],
				primary_action_label: __("Save"),
				primary_action() {
					const picked = [];
					d.$wrapper.find(".ur-cb:checked").each(function () { picked.push(this.value); });
					frappe.call({ method: "jewelima.jewelima.api.set_user_roles",
						args: { user, roles: JSON.stringify(picked) } }).then(() => {
						d.hide();
						frappe.show_alert({ message: __("{0} now holds {1} role(s).", [m.full_name || user, picked.length]), indicator: "green" }, 4);
						load();
					});
				},
			});
			d.get_field("b").$wrapper.html(`
				<div style="font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--text-muted);margin-bottom:5px;">${__("Jewelima roles")}</div>
				${grid(m.jewelima || [])}
				<div style="font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--text-muted);margin:14px 0 5px;">${__("Other roles")}</div>
				${grid(m.others || [])}
				<div style="margin-top:12px;font-size:11.5px;">
					<a href="/app/user/${encodeURIComponent(user)}">${__("open the full User form instead")}</a></div>`);
			d.show();
		});
	});
	root.querySelector(".ur-search").addEventListener("input", frappe.utils.debounce(function () {
		S.term = this.value || "";
		render();
	}, 200));

	function load() {
		frappe.call({ method: "jewelima.jewelima.api.get_user_roles" }).then((r) => {
			S.d = r.message || {};
			render();
		});
	}
	page.add_inner_button(__("Refresh"), load);
	load();
};
