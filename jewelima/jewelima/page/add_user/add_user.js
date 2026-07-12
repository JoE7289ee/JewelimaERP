// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Add User (Setup > Employee) — one login at a time, straight from the Employee
// list: pick an employee from the dropdown (only active ones WITHOUT a login
// appear), adjust the suggested username, tick the roles, Create. Login is by
// USERNAME (the @jewelima.local email is just the record id). Passwords are NOT
// set here — they're set separately by management. Route: /app/add-user

frappe.pages["add-user"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Add User", single_column: true });
	const API = "jewelima.jewelima.api";
	const S = { list: [], roles: [], picked: null };
	const esc = frappe.utils.escape_html;

	$(page.main).append(`
		<style>
		.au-wrap{max-width:640px;}
		.au-pick .control-label{font-size:11px;color:var(--text-muted);}
		.au-pick .help-box,.au-pick .description{display:none !important;}
		.au-card{border:1px solid var(--border-color);border-radius:10px;background:var(--fg-color);padding:16px 18px;margin-top:14px;display:none;}
		.au-card.show{display:block;}
		.au-emp{font-size:16px;font-weight:800;}
		.au-desig{color:var(--text-muted);font-size:12px;margin-bottom:12px;}
		.au-row{display:flex;gap:14px;align-items:center;margin:8px 0;flex-wrap:wrap;}
		.au-lb{width:130px;font-size:12px;color:var(--text-muted);font-weight:600;}
		input.au-un{width:220px;border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);border-radius:5px;height:30px;padding:1px 10px;font-size:13px;color:var(--text-color);box-sizing:border-box;font-weight:700;text-transform:uppercase;}
		.au-mail{color:var(--text-muted);font-size:12px;}
		.au-roles{display:flex;gap:8px;flex-wrap:wrap;}
		.au-role{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--border-color);border-radius:12px;padding:3px 12px 3px 8px;font-size:12.5px;font-weight:700;cursor:pointer;user-select:none;background:var(--control-bg);}
		.au-role input{margin:0;cursor:pointer;}
		.au-foot{margin-top:14px;display:flex;align-items:center;gap:12px;}
		.au-note{margin-top:14px;color:var(--text-muted);font-size:12px;max-width:640px;}
		.au-left{color:var(--text-muted);font-size:12px;margin-left:auto;}
		</style>
		<div class="au-wrap">
			<div class="au-pick"></div>
			<div class="au-card">
				<div class="au-emp"></div>
				<div class="au-desig"></div>
				<div class="au-row"><span class="au-lb">${__("Username (login)")}</span><input class="au-un"></div>
				<div class="au-row"><span class="au-lb">${__("Record Email")}</span><span class="au-mail"></span></div>
				<div class="au-row" style="align-items:flex-start;"><span class="au-lb">${__("Roles")}</span><span class="au-roles"></span></div>
				<div class="au-foot">
					<button class="btn btn-primary au-go">${__("Create User")}</button>
					<span class="au-left"></span>
				</div>
			</div>
			<div class="au-note">${__("Only active employees WITHOUT a login appear in the dropdown. Staff log in with the USERNAME — the @jewelima.local email is just the record id. Passwords are not set here: set them afterwards through your usual password step.")}</div>
		</div>
	`);
	const root = $(page.main)[0];

	const picker = frappe.ui.form.make_control({
		df: {
			fieldtype: "Autocomplete", fieldname: "employee", label: __("Employee"),
			placeholder: __("Pick an employee without a login…"),
			onchange: () => pick(picker.get_value()),
		},
		parent: $(root).find(".au-pick").get(0), render_input: true,
	});
	picker.refresh();

	function pick(label) {
		const r = S.list.find((x) => x.label === label);
		S.picked = r || null;
		const $c = $(root).find(".au-card");
		if (!r) {
			$c.removeClass("show");
			return;
		}
		$c.addClass("show");
		$c.find(".au-emp").text(r.employee_name);
		$c.find(".au-desig").text(r.designation || "—");
		$c.find(".au-un").val(r.username);
		$c.find(".au-mail").text(r.username.toLowerCase() + "@jewelima.local");
		$c.find(".au-roles").html(S.roles.map((x, i) => `
			<label class="au-role"><input type="checkbox" class="au-rolecb" data-i="${i}" ${x.sel ? "checked" : ""}>${esc(x.name)}</label>`).join(""));
	}

	function load(keepRoles) {
		frappe.call({ method: API + ".get_employees_without_user" }).then((r) => {
			const m = r.message || {};
			S.list = (m.employees || []).map((e) => Object.assign({
				label: e.employee_name + (e.designation ? " — " + e.designation : ""),
			}, e));
			if (!keepRoles) S.roles = (m.roles || []).map((name) => ({ name, sel: name === "Jewelima" }));
			picker.set_data(S.list.map((x) => x.label));
			picker.set_value("");
			S.picked = null;
			$(root).find(".au-card").removeClass("show");
			$(root).find(".au-left").text(__("{0} employee(s) without a login", [S.list.length]));
		});
	}

	$(root).on("input", ".au-un", function () {
		if (!S.picked) return;
		S.picked.username = this.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
		$(root).find(".au-mail").text(S.picked.username.toLowerCase() + "@jewelima.local");
	});
	$(root).on("change", ".au-rolecb", function () {
		S.roles[+this.getAttribute("data-i")].sel = this.checked;
	});

	$(root).find(".au-go").on("click", () => {
		if (!S.picked) {
			frappe.show_alert({ message: __("Pick an employee first."), indicator: "orange" }, 4);
			return;
		}
		const roles = S.roles.filter((x) => x.sel).map((x) => x.name);
		frappe.confirm(__("Create login <b>{0}</b> for {1} with role(s): {2}?<br>Password is set separately.",
			[esc(S.picked.username), esc(S.picked.employee_name), esc(roles.join(", ") || "—")]), () => {
			frappe.dom.freeze(__("Creating user..."));
			frappe.call({
				method: API + ".create_employee_users",
				args: { payload: { rows: [{ employee: S.picked.employee, username: S.picked.username }], roles } },
			}).then((r) => {
				frappe.dom.unfreeze();
				const u = ((r.message || {}).created || [])[0];
				frappe.msgprint({
					title: __("User created"), indicator: "green",
					message: u ? __("{0} → <b>{1}</b><br><br>Now set the password through your usual password step. <a href='/app/user-roles'>User Roles</a>", [esc(u.employee), esc(u.username)]) : __("Done."),
				});
				load(true);
			}).catch(() => frappe.dom.unfreeze());
		});
	});

	page.add_inner_button(__("User Roles"), () => frappe.set_route("user-roles"));
	page.add_inner_button(__("Refresh"), () => load(true));
	load();
};
