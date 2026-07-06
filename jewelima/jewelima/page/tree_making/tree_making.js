// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Tree Making — cards arriving at TREE MAKING queue up by their casting karat (one
// purity per tree). Each karat with a queue gets its own table: tick the cards going
// onto the tree, optionally pick who's making it, and "Make Tree → Casting" creates a
// Wax Tree (T-<karat>-###), stamps it on the cards + bench records, and transfers the
// whole lot to CASTING. Route: /app/tree-making

frappe.pages["tree-making"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Tree Making", single_column: true });
	let queues = [];

	$(page.main).append(`
		<style>
		.tm-empty{border:1px dashed var(--border-color);border-radius:10px;padding:26px;text-align:center;color:var(--text-muted);}
		.tm-q{border:1px solid var(--border-color);border-radius:10px;background:var(--fg-color);margin-bottom:18px;overflow:hidden;}
		.tm-qh{display:flex;align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid var(--border-color);flex-wrap:wrap;}
		.tm-karat{font-weight:800;font-size:16px;}
		.tm-cnt{color:var(--text-muted);font-size:12px;margin-right:auto;}
		.tm-emp{width:220px;}
		.tm-emp .frappe-control{margin:0;}
		.tm-emp .control-label,.tm-emp .help-box{display:none !important;}
		table.tm-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;}
		table.tm-tbl th{background:var(--control-bg,var(--fg-color));border-bottom:2px solid var(--gray-400,#aeb6bf);padding:6px 10px;text-align:left;font-weight:700;}
		table.tm-tbl td{border-bottom:1px solid var(--border-color);padding:6px 10px;}
		table.tm-tbl tr:last-child td{border-bottom:none;}
		table.tm-tbl tr.on td{background:var(--bg-light-gray,#eef3ee);}
		table.tm-tbl input{width:15px;height:15px;cursor:pointer;}
		.tm-mk{white-space:nowrap;}
		</style>
		<div class="tm-out"></div>
	`);

	const esc = frappe.utils.escape_html;
	const $out = $(page.main).find(".tm-out");

	function render() {
		$out.empty();
		if (!queues.length) {
			$out.html('<div class="tm-empty">No cards waiting at TREE MAKING. Transfer cards here and they queue up by karat.</div>');
			return;
		}
		queues.forEach((q, qi) => {
			const label = q.karat === "OTHER" ? "OTHER (no karat gold in BOM)" : q.karat;
			const $q = $(`
				<div class="tm-q" data-qi="${qi}">
					<div class="tm-qh">
						<span class="tm-karat">${esc(label)}</span>
						<span class="tm-cnt">${q.cards.length} card(s) · next tree T-${esc(q.suffix)}-…</span>
						<div class="tm-emp"></div>
						<button class="btn btn-sm btn-primary tm-mk">Make Tree → Casting</button>
					</div>
					<table class="tm-tbl">
						<thead><tr><th style="width:34px"><input type="checkbox" class="tm-all" checked></th>
						<th>Order Bag</th><th>Design</th><th>Qty</th><th>Size</th><th>Customer</th><th>Due</th></tr></thead>
						<tbody>${q.cards.map((c, ci) => `
							<tr class="on"><td><input type="checkbox" class="tm-cb" data-ci="${ci}" checked></td>
							<td><b>${esc(c.name)}</b></td><td>${esc(c.design || "")}</td><td>${c.qty || ""}</td>
							<td>${esc(c.size || "")}</td><td>${esc(c.customer || "")}</td>
							<td>${c.due_date ? frappe.datetime.str_to_user(c.due_date) : ""}</td></tr>`).join("")}
						</tbody>
					</table>
				</div>`);
			$out.append($q);

			// who's making this tree — picker filtered to the TREE MAKING bench roster
			const emp = frappe.ui.form.make_control({
				df: {
					fieldtype: "Link", options: "Employee", fieldname: "employee", placeholder: "Employee (tree maker)",
					get_query: () => ({ query: "jewelima.jewelima.api.bench_employee_query", filters: { bench: "TREE MAKING" } }),
				},
				parent: $q.find(".tm-emp").get(0), render_input: true,
			});
			emp.refresh();
			q._emp = emp;

			$q.find(".tm-all").on("change", function () {
				$q.find(".tm-cb").prop("checked", $(this).is(":checked"));
				$q.find("tbody tr").toggleClass("on", $(this).is(":checked"));
			});
			$q.on("change", ".tm-cb", function () {
				$(this).closest("tr").toggleClass("on", this.checked);
			});
			$q.find(".tm-mk").on("click", () => {
				const names = $q.find(".tm-cb:checked").map((i, el) => q.cards[+el.getAttribute("data-ci")].name).get();
				if (!names.length) return frappe.msgprint(__("Tick at least one card for this tree."));
				frappe.confirm(
					__("Mount <b>{0}</b> card(s) on one <b>{1}</b> tree and send them to CASTING?", [names.length, esc(label)]),
					() => {
						frappe.dom.freeze(__("Making tree…"));
						frappe.call({
							method: "jewelima.jewelima.api.make_tree",
							args: { karat: q.karat, names: JSON.stringify(names), employee: emp.get_value() || null },
						}).then((r) => {
							frappe.dom.unfreeze();
							const res = r.message || {};
							frappe.show_alert({ message: __("Tree <b>{0}</b> made — {1} card(s) → CASTING.", [res.tree, res.count]), indicator: "green" }, 7);
							if (res.errors && res.errors.length) {
								frappe.msgprint({ title: __("Some not transferred"), message: res.errors.map((e) => `${e.name}: ${e.error}`).join("<br>"), indicator: "orange" });
							}
							load();
						}).catch(() => frappe.dom.unfreeze());
					}
				);
			});
		});
	}

	function load() {
		frappe.call({ method: "jewelima.jewelima.api.get_tree_queues" }).then((r) => {
			queues = r.message || [];
			render();
		});
	}

	page.add_inner_button(__("Refresh"), load);
	load();
};
