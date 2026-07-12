// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// User Roles (Setup > Employee) — who holds which roles, at a glance: rows =
// enabled system users, columns = the Jewelima roles (+ System / Stock
// Manager), everything else as chips. Read-only — click a user to open their
// User form for changes. Route: /app/user-roles

frappe.pages["user-roles"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "User Roles", single_column: true });
	const S = { d: null, term: "" };
	const esc = frappe.utils.escape_html;

	$(page.main).append(`
		<style>
		.ur-top{display:flex;align-items:center;gap:10px;margin:2px 0 10px;flex-wrap:wrap;}
		.ur-search{width:260px;border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);padding:4px 10px;height:30px;border-radius:5px;box-sizing:border-box;color:var(--text-color);font-size:13px;}
		.ur-count{color:var(--text-muted);font-size:12px;margin-left:auto;}
		.ur-box{border:1px solid var(--border-color);border-radius:8px;overflow:auto;max-height:calc(100vh - 200px);background:var(--fg-color);}
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

	$(root).on("click", ".ur-name", function () {
		frappe.set_route("Form", "User", this.getAttribute("data-user"));
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
