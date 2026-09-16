// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Setup > Issue > Issue Access — admin-only. TWO layers, and the stricter wins.
//
//   EMPLOYEES  — what each employee may be handed at the Stone Issue station.
//   OPERATORS  — what each DESK USER may do: which employees they may issue to
//                (BALAN and his three), and which buckets they may hand out.
//
// A fully-ticked row, or a user with no row at all, is unrestricted — so the
// station behaves exactly as before until somebody is deliberately locked down.
// Route: /app/issue-access

frappe.pages["issue-access"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Issue Access", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	let BUCKETS = [];
	let rows = [];   // [{employee, employee_name, buckets:{CODE:0/1}}]
	let ops = [];    // [{user, user_name, buckets:{CODE:0/1}, employees:[{employee, employee_name}]}]
	let CANDIDATES = [];

	$(page.main).append(`
		<style>
		.ia-note{color:var(--text-muted);font-size:12.5px;margin-bottom:14px;max-width:900px;}
		.ia-add{display:flex;gap:10px;align-items:end;margin-bottom:14px;}
		.ia-add .frappe-control{margin:0;flex:0 0 300px;}
		table.ia-grid{width:100%;border-collapse:collapse;font-size:13px;background:var(--fg-color);}
		table.ia-grid th{background:var(--control-bg);font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);padding:8px 10px;border:1px solid var(--border-color);text-align:center;}
		table.ia-grid th:first-child{text-align:left;}
		table.ia-grid td{border:1px solid var(--border-color);padding:6px 10px;text-align:center;}
		table.ia-grid td:first-child{text-align:left;font-weight:600;}
		table.ia-grid input[type=checkbox]{width:17px;height:17px;cursor:pointer;}
		.ia-rm{cursor:pointer;color:#b02a2a;font-weight:700;}
		.ia-empty{padding:24px;text-align:center;color:var(--text-muted);}
		.ia-sec{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;
			color:var(--text-muted);margin:26px 0 8px;padding-top:16px;border-top:1px solid var(--border-color);}
		.ia-emps{display:flex;gap:5px;flex-wrap:wrap;align-items:center;}
		.ia-emp{border:1px solid var(--border-color);border-radius:20px;padding:1px 8px;font-size:11.5px;
			background:var(--control-bg);white-space:nowrap;}
		.ia-emp .x{cursor:pointer;color:#b02a2a;font-weight:700;margin-left:5px;}
		.ia-addemp{border:1px dashed var(--border-color);border-radius:20px;padding:1px 9px;font-size:11.5px;
			cursor:pointer;color:var(--text-muted);background:none;}
		.ia-addemp:hover{border-color:var(--primary);color:var(--primary);}
		table.ia-grid td.ia-empcell{text-align:left;font-weight:400;min-width:280px;}
		</style>
		<div class="ia-note">${__("Lock which stone buckets each issuer may hand out at the Stone Issue station. A row with every box ticked leaves that person unrestricted; untick a bucket to stop them issuing it. People with the Stone Issue role show up here automatically — add anyone else below.")}</div>
		<div class="ia-add"><div class="ia-pick"></div><button class="btn btn-default ia-addbtn">${__("Add Employee")}</button></div>
		<div class="ia-table"></div>

		<div class="ia-sec">${__("Who each desk user may issue for")}</div>
		<div class="ia-note">${__("A user listed here can only issue to the employees named on their row, and only in the buckets ticked. Leave the employee list empty and they may issue to anyone their role already allows. A user not listed at all is unrestricted.")}</div>
		<div class="ia-add"><div class="ia-upick"></div><button class="btn btn-default ia-addop">${__("Add User")}</button></div>
		<div class="ia-optable"></div>
		<div class="ia-tol" style="margin-top:20px;max-width:900px;">
			<div style="font-weight:800;font-size:13px;margin-bottom:4px;">${__("Weight validation (± % of the sieve average)")}</div>
			<div class="ia-note">${__("A tolerance on a bucket makes the Stone Issue station check every weigh: the entered carats ÷ pieces must land within that % of the sieve chart's average per stone, or the issue is refused. 0 = no check. Buckets without a chart average (PS/CS/PDMD/POTH) can't be checked.")}</div>
			<div class="ia-tol-grid" style="display:flex;gap:14px;flex-wrap:wrap;"></div>
		</div>
	`);
	const root = $(page.main);
	page.set_primary_action(__("Save"), () => { save(); saveTol(); }, "check");

	const TOLB = ["dmd", "ps", "cs", "cz", "cvd", "sw", "pdmd", "poth"];
	function paintTol(t) {
		root.find(".ia-tol-grid").html(TOLB.map((c) => `
			<label style="display:flex;flex-direction:column;gap:3px;font-size:10.5px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">
				${c.toUpperCase()}
				<input type="number" min="0" step="0.5" class="ia-tolv" data-c="${c}" value="${t["tol_" + c] || ""}"
					style="width:84px;border:1px solid var(--border-color);border-radius:6px;padding:5px 8px;font-size:13px;background:var(--fg-color);color:var(--text-color);" placeholder="off">
			</label>`).join(""));
	}
	frappe.call({ method: API + ".get_stone_issue_tolerance" }).then((r) => paintTol(r.message || {}));
	function saveTol() {
		const p = {};
		root.find(".ia-tolv").each(function () { p["tol_" + this.getAttribute("data-c")] = flt(this.value) || 0; });
		frappe.call({ method: API + ".save_stone_issue_tolerance", args: { payload: JSON.stringify(p) } })
			.then(() => frappe.show_alert({ message: __("Weight tolerances saved."), indicator: "green" }, 3));
	}

	const picker = frappe.ui.form.make_control({
		df: { fieldtype: "Link", label: __("Employee"), fieldname: "emp", options: "Employee",
			get_query: () => ({ filters: { status: "Active" } }) },
		parent: root.find(".ia-pick").get(0), render_input: true,
	});
	picker.refresh();

	const upicker = frappe.ui.form.make_control({
		df: { fieldtype: "Link", label: __("Desk user"), fieldname: "usr", options: "User",
			get_query: () => ({ filters: { enabled: 1 } }) },
		parent: root.find(".ia-upick").get(0), render_input: true,
	});
	upicker.refresh();

	root.find(".ia-addbtn").on("click", () => {
		const e = picker.get_value();
		if (!e) return;
		if (rows.some((r) => r.employee === e)) return frappe.show_alert({ message: __("Already listed."), indicator: "orange" }, 3);
		const buckets = {}; BUCKETS.forEach((b) => (buckets[b] = 1));
		frappe.db.get_value("Employee", e, "employee_name").then((r) => {
			rows.push({ employee: e, employee_name: (r.message || {}).employee_name || e, buckets });
			picker.set_value(""); paint();
		});
	});

	function paint() {
		if (!rows.length) { root.find(".ia-table").html(`<div class="ia-empty">${__("No issuers yet — add an employee above.")}</div>`); return; }
		const head = `<tr><th>${__("Employee")}</th>${BUCKETS.map((b) => `<th>${b}</th>`).join("")}<th></th></tr>`;
		const body = rows.map((r, i) => `
			<tr data-i="${i}">
				<td>${esc(r.employee_name || r.employee)} <span class="text-muted">(${esc(r.employee)})</span></td>
				${BUCKETS.map((b) => `<td><input type="checkbox" data-b="${b}" ${r.buckets[b] ? "checked" : ""}></td>`).join("")}
				<td><span class="ia-rm" title="${__("Remove from the list (reverts to all-allowed)")}">&times;</span></td>
			</tr>`).join("");
		root.find(".ia-table").html(`<table class="ia-grid"><thead>${head}</thead><tbody>${body}</tbody></table>`);
	}

	root.on("change", ".ia-grid input[type=checkbox]", function () {
		const i = cint($(this).closest("tr").attr("data-i"));
		rows[i].buckets[$(this).data("b")] = this.checked ? 1 : 0;
	});
	root.on("click", ".ia-rm", function () {
		const i = cint($(this).closest("tr").attr("data-i"));
		rows.splice(i, 1); paint();
	});

	function paintOps() {
		if (!ops.length) {
			root.find(".ia-optable").html(`<div class="ia-empty">${
				__("No user is limited — everyone issues as their role allows.")}</div>`);
			return;
		}
		const head = `<tr><th>${__("Desk user")}</th><th>${__("May issue for")}</th>${
			BUCKETS.map((b) => `<th>${b}</th>`).join("")}<th></th></tr>`;
		const body = ops.map((o, i) => `
			<tr data-o="${i}">
				<td>${esc(o.user_name || o.user)} <span class="text-muted">(${esc(o.user)})</span></td>
				<td class="ia-empcell"><div class="ia-emps">
					${(o.employees || []).map((e, j) => `<span class="ia-emp">${esc(e.employee_name || e.employee)}
						<span class="x" data-j="${j}" title="${__("Remove")}">&times;</span></span>`).join("")}
					<button class="ia-addemp">+ ${__("employee")}</button>
					${(o.employees || []).length ? "" : `<span class="text-muted" style="font-size:11.5px;">${
						__("anyone their role allows")}</span>`}
				</div></td>
				${BUCKETS.map((b) => `<td><input type="checkbox" class="ia-ob" data-b="${b}" ${
					o.buckets[b] ? "checked" : ""}></td>`).join("")}
				<td><span class="ia-oprm" title="${__("Remove the lock — this user goes back to unrestricted")}">&times;</span></td>
			</tr>`).join("");
		root.find(".ia-optable").html(`<table class="ia-grid"><thead>${head}</thead><tbody>${body}</tbody></table>`);
	}

	root.find(".ia-addop").on("click", () => {
		const u = upicker.get_value();
		if (!u) return;
		if (ops.some((o) => o.user === u)) return frappe.show_alert({ message: __("Already listed."), indicator: "orange" }, 3);
		const buckets = {}; BUCKETS.forEach((b) => (buckets[b] = 1));
		frappe.db.get_value("User", u, "full_name").then((r) => {
			ops.push({ user: u, user_name: (r.message || {}).full_name || u, buckets, employees: [] });
			upicker.set_value(""); paintOps();
		});
	});
	root.on("change", ".ia-ob", function () {
		const i = cint($(this).closest("tr").attr("data-o"));
		ops[i].buckets[$(this).data("b")] = this.checked ? 1 : 0;
	});
	root.on("click", ".ia-oprm", function () {
		ops.splice(cint($(this).closest("tr").attr("data-o")), 1); paintOps();
	});
	root.on("click", ".ia-emp .x", function () {
		const i = cint($(this).closest("tr").attr("data-o"));
		ops[i].employees.splice(cint($(this).data("j")), 1); paintOps();
	});
	root.on("click", ".ia-addemp", function () {
		const i = cint($(this).closest("tr").attr("data-o"));
		const d = new frappe.ui.Dialog({
			title: __("Add an employee to {0}", [ops[i].user_name || ops[i].user]),
			fields: [{ fieldname: "emp", fieldtype: "Link", label: __("Employee"), options: "Employee",
				reqd: 1, get_query: () => ({ filters: { status: "Active" } }) }],
			primary_action_label: __("Add"),
			primary_action(v) {
				d.hide();
				if (ops[i].employees.some((e) => e.employee === v.emp)) return;
				frappe.db.get_value("Employee", v.emp, "employee_name").then((r) => {
					ops[i].employees.push({ employee: v.emp,
						employee_name: (r.message || {}).employee_name || v.emp });
					paintOps();
				});
			},
		});
		d.show();
	});

	function save() {
		frappe.dom.freeze(__("Saving..."));
		frappe.call({ method: API + ".save_issue_access",
			args: { rows: JSON.stringify(rows), operators: JSON.stringify(ops) } })
			.then((r) => {
				frappe.dom.unfreeze();
				const m = r.message || {};
				frappe.show_alert({ message: __("Saved: {0} employee row(s), {1} user(s).",
					[m.saved || 0, m.operators || 0]), indicator: "green" }, 4);
			}).catch(() => frappe.dom.unfreeze());
	}

	function load() {
		return frappe.call({ method: API + ".get_issue_access" }).then((r) => {
		const m = r.message || {};
		BUCKETS = m.buckets || [];
		rows = m.rows || [];
		ops = m.operators || [];
		CANDIDATES = m.candidates || [];
		paint();
		paintOps();
		});
	}
	load();

	// come back to the page, come back to what is actually saved
	frappe.pages["issue-access"].on_page_show = () => { load(); };
};
