// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Assign Benches — manage each bench's employee roster (the Bench.employees
// allotment the bench pickers read), instead of editing the raw Bench doctype.
// System Manager only. Route: /app/assign-bench

frappe.pages["assign-bench"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Assign Benches", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;

	$(page.main).append(`
		<style>
		#page-assign-bench .container{max-width:100%;}
		.ab-head{font-size:12.5px;color:var(--text-muted);margin-bottom:14px;}
		.ab-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;}
		.ab-card{border:1px solid var(--border-color);border-radius:13px;background:var(--fg-color);padding:14px 16px;}
		.ab-card .h{display:flex;align-items:baseline;gap:8px;margin-bottom:10px;}
		.ab-card .h .name{font-size:15px;font-weight:800;}
		.ab-card .h .n{font-size:11.5px;color:var(--text-muted);}
		.ab-emps{display:flex;flex-wrap:wrap;gap:7px;min-height:26px;}
		.ab-chip{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--border-color);border-radius:20px;padding:3px 6px 3px 12px;font-size:12.5px;background:var(--control-bg);}
		.ab-chip .rm{cursor:pointer;color:#b02a2a;font-weight:800;border-radius:50%;width:17px;height:17px;display:inline-flex;align-items:center;justify-content:center;}
		.ab-chip .rm:hover{background:#f5dddd;}
		.ab-none{color:var(--text-muted);font-size:12px;font-style:italic;}
		.ab-add{margin-top:12px;border:1px dashed var(--border-color);border-radius:8px;background:transparent;color:#1f618d;font-weight:700;font-size:12.5px;padding:6px 12px;cursor:pointer;width:100%;}
		.ab-add:hover{background:var(--control-bg);}
		</style>
		<div class="ab-head">${__("loading…")}</div>
		<div class="ab-grid"></div>
	`);
	const root = $(page.main);

	function load() {
		frappe.call({ method: API + ".get_bench_rosters" }).then((r) => {
			const rosters = r.message || [];
			const total = rosters.reduce((a, b) => a + (b.employees || []).length, 0);
			root.find(".ab-head").text(__("{0} benches · {1} employee allotment(s). Add or remove who works at each bench.",
				[rosters.length, total]));
			root.find(".ab-grid").html(rosters.map((b) => `
				<div class="ab-card" data-bench="${esc(b.bench)}">
					<div class="h"><span class="name">${esc(b.bench)}</span><span class="n">${(b.employees || []).length} ${__("people")}</span></div>
					<div class="ab-emps">${(b.employees || []).length
						? b.employees.map((e) => `<span class="ab-chip">${esc(e.employee_name)}
							<span class="rm" data-emp="${esc(e.employee)}" title="${__("remove")}">&times;</span></span>`).join("")
						: `<span class="ab-none">${__("nobody assigned yet")}</span>`}</div>
					<button class="ab-add">＋ ${__("Add employee")}</button>
				</div>`).join(""));
		});
	}

	root.on("click", ".ab-chip .rm", function () {
		const bench = $(this).closest(".ab-card").data("bench");
		const employee = $(this).data("emp");
		frappe.call({ method: API + ".set_bench_employee", args: { bench, employee, add: 0 } })
			.then(() => { frappe.show_alert({ message: __("Removed from {0}.", [bench]), indicator: "blue" }, 3); load(); });
	});

	root.on("click", ".ab-add", function () {
		const bench = $(this).closest(".ab-card").data("bench");
		const d = new frappe.ui.Dialog({
			title: __("Add to {0}", [bench]),
			fields: [{ fieldname: "employee", fieldtype: "Link", options: "Employee", label: __("Employee"), reqd: 1 }],
			primary_action_label: __("Add"),
			primary_action(v) {
				if (!v.employee) return;
				frappe.call({ method: API + ".set_bench_employee", args: { bench, employee: v.employee, add: 1 } })
					.then(() => { d.hide(); frappe.show_alert({ message: __("Added to {0}.", [bench]), indicator: "green" }, 3); load(); });
			},
		});
		d.show();
	});

	load();
};
