// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Add Employee (Setup > Employee, SM only) — lean intake, importer conventions:
// full name (goes into first_name whole), gender, department + designation
// (typing a NEW one creates it on the fly), and bench allotment chips that land
// straight on the rosters. DOB/DOJ stay optional as always. After creating,
// jump to Add User to give them a login. Route: /app/add-employee

frappe.pages["add-employee"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Add Employee", single_column: true });
	const API = "jewelima.jewelima.api";
	const S = { benches: [], sel: new Set() };
	const esc = frappe.utils.escape_html;

	$(page.main).append(`
		<style>
		.ae-wrap{max-width:640px;}
		.ae-wrap .control-label{font-size:11px;color:var(--text-muted);}
		.ae-wrap .help-box,.ae-wrap .description{display:none !important;}
		.ae-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;}
		.ae-name{grid-column:1 / -1;}
		.ae-sec{font-weight:700;font-size:12px;color:var(--text-muted);margin:14px 0 6px;text-transform:uppercase;letter-spacing:.05em;}
		.ae-benches{display:flex;gap:7px;flex-wrap:wrap;}
		.ae-bench{border:1px solid var(--border-color);border-radius:13px;padding:3px 13px;font-size:12px;font-weight:700;cursor:pointer;user-select:none;background:var(--control-bg);}
		.ae-bench.on{background:var(--primary);color:#fff;border-color:var(--primary);}
		.ae-foot{margin-top:18px;display:flex;gap:12px;align-items:center;}
		.ae-note{margin-top:14px;color:var(--text-muted);font-size:12px;}
		</style>
		<div class="ae-wrap">
			<div class="ae-grid">
				<div class="ae-name"></div>
				<div class="ae-gender"></div><div class="ae-desig"></div>
				<div class="ae-dept"></div><div></div>
			</div>
			<div class="ae-sec">${__("Allot to Benches (optional)")}</div>
			<div class="ae-benches"></div>
			<div class="ae-foot">
				<button class="btn btn-primary ae-go">${__("Create Employee")}</button>
			</div>
			<div class="ae-note">${__("Typing a NEW department or designation creates it automatically. Date of birth / joining stay optional — fill them later on the Employee form if needed. Give them a login afterwards on Add User.")}</div>
		</div>
	`);
	const root = $(page.main)[0];

	const mk = (sel, df) => {
		const c = frappe.ui.form.make_control({ df, parent: $(root).find(sel).get(0), render_input: true });
		c.refresh();
		return c;
	};
	// Autocomplete controls lag live typing — trust the raw input
	const val = (c) => ((c.get_value() || c.$input.val() || "") + "").trim();
	const name = mk(".ae-name", { fieldtype: "Data", label: __("Full Name"), fieldname: "full_name", reqd: 1,
		placeholder: __("e.g. REENA ALEX") });
	const gender = mk(".ae-gender", { fieldtype: "Autocomplete", label: __("Gender"), fieldname: "gender", reqd: 1 });
	// plain inputs + native datalist: suggestions WITHOUT clearing free text
	// (frappe's Autocomplete wipes unknown values on blur — new ones must survive)
	const desig = mk(".ae-desig", { fieldtype: "Data", label: __("Designation"), fieldname: "designation",
		placeholder: __("pick or type new…") });
	desig.$input.attr("list", "ae-desig-list");
	const dept = mk(".ae-dept", { fieldtype: "Data", label: __("Department"), fieldname: "department",
		placeholder: __("pick or type new…") });
	dept.$input.attr("list", "ae-dept-list");
	$(root).append('<datalist id="ae-desig-list"></datalist><datalist id="ae-dept-list"></datalist>');

	function paintBenches() {
		$(root).find(".ae-benches").html(S.benches.map((b) => `
			<span class="ae-bench ${S.sel.has(b) ? "on" : ""}" data-b="${esc(b)}">${esc(b)}</span>`).join(""));
	}

	frappe.call({ method: API + ".get_employee_form_data" }).then((r) => {
		const m = r.message || {};
		gender.set_data(m.genders || []);
		$(root).find("#ae-desig-list").html((m.designations || []).map((x) => `<option value="${esc(x)}">`).join(""));
		$(root).find("#ae-dept-list").html((m.departments || []).map((x) => `<option value="${esc(x)}">`).join(""));
		S.benches = m.benches || [];
		paintBenches();
	});

	$(root).on("click", ".ae-bench", function () {
		const b = this.getAttribute("data-b");
		if (S.sel.has(b)) S.sel.delete(b);
		else S.sel.add(b);
		paintBenches();
	});

	$(root).find(".ae-go").on("click", () => {
		const full = (name.get_value() || "").trim().toUpperCase();
		if (!full) {
			frappe.show_alert({ message: __("Enter the employee's name."), indicator: "orange" }, 4);
			return;
		}
		if (!val(gender)) {
			frappe.show_alert({ message: __("Pick the gender."), indicator: "orange" }, 4);
			return;
		}
		frappe.confirm(__("Create employee <b>{0}</b>{1}?",
			[esc(full), S.sel.size ? " " + __("allotted to {0}", [esc([...S.sel].join(", "))]) : ""]), () => {
			frappe.dom.freeze(__("Creating..."));
			frappe.call({
				method: API + ".create_employee",
				args: { payload: {
					full_name: full, gender: val(gender), designation: val(desig),
					department: val(dept), benches: [...S.sel],
				} },
			}).then((r) => {
				frappe.dom.unfreeze();
				const m = r.message || {};
				frappe.msgprint({
					title: __("Employee created"), indicator: "green",
					message: __("<b>{0}</b> ({1}){2}.<br><br><a href='/app/add-user'>{3}</a> · <a href='/app/employee/{1}'>{4}</a>",
						[esc(m.employee_name), esc(m.employee),
						 (m.benches || []).length ? " — " + __("on {0}", [esc(m.benches.join(", "))]) : "",
						 __("Give them a login (Add User)"), __("Open Employee")]),
				});
				name.set_value("");
				gender.set_value("");
				desig.set_value("");
				dept.set_value("");
				S.sel.clear();
				paintBenches();
			}).catch(() => frappe.dom.unfreeze());
		});
	});

	page.add_inner_button(__("Add User"), () => frappe.set_route("add-user"));
};
