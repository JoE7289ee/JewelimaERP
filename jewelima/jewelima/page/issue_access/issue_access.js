// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Setup > Issue > Issue Access — admin-only. Per-employee locks on which stone
// buckets each issuer may hand out at the Stone Issue station. A fully-ticked row
// leaves the employee unrestricted; unticking a bucket blocks it. Route: /app/issue-access

frappe.pages["issue-access"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Issue Access", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	let BUCKETS = [];
	let rows = [];   // [{employee, employee_name, buckets:{CODE:0/1}}]

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
		</style>
		<div class="ia-note">${__("Lock which stone buckets each issuer may hand out at the Stone Issue station. A row with every box ticked leaves that person unrestricted; untick a bucket to stop them issuing it. People with the Stone Issue role show up here automatically — add anyone else below.")}</div>
		<div class="ia-add"><div class="ia-pick"></div><button class="btn btn-default ia-addbtn">${__("Add Employee")}</button></div>
		<div class="ia-table"></div>
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

	function save() {
		frappe.dom.freeze(__("Saving..."));
		frappe.call({ method: API + ".save_issue_access", args: { rows: JSON.stringify(rows) } })
			.then((r) => {
				frappe.dom.unfreeze();
				frappe.show_alert({ message: __("Saved access for {0} issuer(s).", [(r.message || {}).saved || 0]), indicator: "green" }, 4);
			}).catch(() => frappe.dom.unfreeze());
	}

	frappe.call({ method: API + ".get_issue_access" }).then((r) => {
		const m = r.message || {};
		BUCKETS = m.buckets || [];
		rows = m.rows || [];
		paint();
	});
};
