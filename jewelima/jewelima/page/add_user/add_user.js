// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Add User (Setup > Employee) — desk logins are created ONLY from the Employee
// list: tick active employees without a login, adjust the suggested username if
// needed, pick the Jewelima roles they get, Create. Login is by USERNAME (the
// @jewelima.local email is just the record id). Passwords are NOT set here —
// they're set separately by management. Route: /app/add-user

frappe.pages["add-user"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Add User", single_column: true });
	const API = "jewelima.jewelima.api";
	const S = { rows: [], roles: [], term: "" };
	const esc = frappe.utils.escape_html;

	$(page.main).append(`
		<style>
		.au-top{display:flex;align-items:center;gap:10px;margin:2px 0 8px;flex-wrap:wrap;}
		.au-search{width:240px;border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);padding:4px 10px;height:30px;border-radius:5px;box-sizing:border-box;color:var(--text-color);font-size:13px;}
		.au-roles{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:12.5px;}
		.au-role{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--border-color);border-radius:12px;padding:2px 11px 2px 7px;font-weight:700;cursor:pointer;user-select:none;background:var(--control-bg);}
		.au-role input{margin:0;cursor:pointer;}
		.au-count{color:var(--text-muted);font-size:12px;margin-left:auto;}
		.au-box{border:1px solid var(--border-color);border-radius:8px;background:var(--fg-color);overflow:auto;max-height:calc(100vh - 260px);}
		table.au-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:12.5px;}
		table.au-tbl th{position:sticky;top:0;z-index:1;background:var(--control-bg,var(--fg-color));border-bottom:1px solid var(--gray-400,#aeb6bf);padding:4px 10px;text-align:left;white-space:nowrap;font-weight:700;}
		table.au-tbl td{border-bottom:1px solid var(--border-color);padding:4px 10px;white-space:nowrap;}
		table.au-tbl tr{cursor:pointer;}
		table.au-tbl tr.on td{background:#eaf6ec;}
		table.au-tbl input.au-un{width:180px;border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);border-radius:4px;height:26px;padding:1px 8px;font-size:12px;color:var(--text-color);box-sizing:border-box;font-weight:700;text-transform:uppercase;}
		.au-name{font-weight:700;}
		.au-sub{color:var(--text-muted);font-size:11px;}
		.au-mail{color:var(--text-muted);font-size:11.5px;}
		.au-empty{padding:22px;text-align:center;color:var(--text-muted);}
		.au-note{margin:8px 2px 0;color:var(--text-muted);font-size:12px;}
		</style>
		<div class="au-top">
			<input class="au-search" type="text" placeholder="${__("Search employees…")}">
			<span class="au-roles"></span>
			<span class="au-count"></span>
			<button class="btn btn-primary btn-sm au-go">${__("Create Users")}</button>
		</div>
		<div class="au-box"><table class="au-tbl">
			<thead><tr><th style="width:26px"><input type="checkbox" class="au-all"></th>
			<th>${__("Employee")}</th><th>${__("Username (login)")}</th><th>${__("Record Email")}</th></tr></thead>
			<tbody class="au-rows"></tbody></table></div>
		<div class="au-note">${__("Only active employees WITHOUT a login appear here. Staff log in with the USERNAME — the @jewelima.local email is just the record id. Passwords are not set here: set them afterwards through your usual password step.")}</div>
	`);
	const root = $(page.main)[0];

	function visible() {
		const t = S.term.toLowerCase().trim();
		return S.rows.filter((r) => !t || (r.employee_name + " " + r.designation).toLowerCase().includes(t));
	}

	function paint() {
		const rows = visible();
		$(root).find(".au-rows").html(rows.length ? rows.map((r) => `
			<tr data-emp="${esc(r.employee)}" class="${r.sel ? "on" : ""}">
				<td><input type="checkbox" ${r.sel ? "checked" : ""}></td>
				<td><span class="au-name">${esc(r.employee_name)}</span>
					<span class="au-sub"> ${esc(r.designation)}</span></td>
				<td><input class="au-un" value="${esc(r.username)}"></td>
				<td class="au-mail">${esc(r.username.toLowerCase())}@jewelima.local</td>
			</tr>`).join("")
			: `<tr><td colspan="4" class="au-empty">${__("Everyone active already has a login.")}</td></tr>`);
		$(root).find(".au-count").text(__("{0} selected / {1} without login", [S.rows.filter((r) => r.sel).length, S.rows.length]));
		$(root).find(".au-roles").html(S.roles.map((r, i) => `
			<label class="au-role"><input type="checkbox" class="au-rolecb" data-i="${i}" ${r.sel ? "checked" : ""}>${esc(r.name)}</label>`).join(""));
	}

	function load() {
		frappe.call({ method: API + ".get_employees_without_user" }).then((r) => {
			const m = r.message || {};
			S.rows = (m.employees || []).map((e) => Object.assign({ sel: false }, e));
			S.roles = (m.roles || []).map((name) => ({ name, sel: name === "Jewelima" }));
			paint();
		});
	}

	$(root).on("click", ".au-rows tr[data-emp]", function (e) {
		if (e.target.classList.contains("au-un")) return; // typing a username, not toggling
		const r = S.rows.find((x) => x.employee === this.getAttribute("data-emp"));
		r.sel = !r.sel;
		paint();
	});
	$(root).on("input", ".au-un", function () {
		const r = S.rows.find((x) => x.employee === $(this).closest("tr").attr("data-emp"));
		r.username = this.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
		$(this).closest("tr").find(".au-mail").text(r.username.toLowerCase() + "@jewelima.local");
	});
	$(root).on("click", ".au-all", function (e) {
		e.stopPropagation();
		visible().forEach((r) => (r.sel = this.checked));
		paint();
	});
	$(root).on("change", ".au-rolecb", function () {
		S.roles[+this.getAttribute("data-i")].sel = this.checked;
	});
	$(root).find(".au-search").on("input", frappe.utils.debounce(function () {
		S.term = this.value || "";
		paint();
	}, 200));

	$(root).find(".au-go").on("click", () => {
		const picked = S.rows.filter((r) => r.sel);
		if (!picked.length) {
			frappe.show_alert({ message: __("Tick at least one employee."), indicator: "orange" }, 4);
			return;
		}
		const roles = S.roles.filter((r) => r.sel).map((r) => r.name);
		frappe.confirm(__("Create {0} login(s) with role(s): {1}?<br>Passwords are set separately.", [picked.length, esc(roles.join(", ") || "—")]), () => {
			frappe.dom.freeze(__("Creating users..."));
			frappe.call({
				method: API + ".create_employee_users",
				args: { payload: { rows: picked.map((r) => ({ employee: r.employee, username: r.username })), roles } },
			}).then((r) => {
				frappe.dom.unfreeze();
				const m = r.message || {};
				frappe.msgprint({
					title: __("Users created"), indicator: "green",
					message: (m.created || []).map((u) => `${esc(u.employee)} → <b>${esc(u.username)}</b>`).join("<br>") +
						((m.skipped || []).length ? `<br><span class="text-muted">${__("Already had logins")}: ${esc(m.skipped.join(", "))}</span>` : "") +
						`<br><br>${__("Now set their passwords through your usual password step.")} <a href="/app/user-roles">${__("User Roles")}</a>`,
				});
				load();
			}).catch(() => frappe.dom.unfreeze());
		});
	});

	page.add_inner_button(__("User Roles"), () => frappe.set_route("user-roles"));
	page.add_inner_button(__("Refresh"), load);
	load();
};
