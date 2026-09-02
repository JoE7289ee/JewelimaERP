// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Print Order Bags — list Order Bags, filter by Location (+ customer / order),
// tick the ones you want, and print them as cards 6 per A4 page.
// Route: /app/print-order-bags

const POB_LOCATIONS = [
	"ORDERING", "CAD", "CAM", "WAXING", "TREE MAKING", "CASTING", "GRINDING",
	"FILING", "SETTING", "PRE POLISH", "WAX SETTING", "FINAL POLISH", "BAG EXTRACTION",
];

frappe.pages["print-order-bags"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Print Order Bags", single_column: true });
	const state = { f: {}, rows: [] };

	$(page.main).append(`
		<style>
		.pob-head{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:2px 10px;margin:2px 0 8px;}
		.pob-head .frappe-control{margin:0;}
		.pob-head .control-label{font-size:11px;margin:0 0 1px;color:var(--text-muted);}
		.pob-head .help-box{display:none !important;}
		.pob-box{border:1px solid var(--border-color);border-radius:11px;overflow:auto;max-height:calc(100vh - 220px);}
		table.pob-grid{width:100%;border-collapse:separate;border-spacing:0;font-size:12px;background:var(--fg-color);}
		table.pob-grid th{position:sticky;top:0;z-index:2;background:var(--control-bg,var(--fg-color));border-bottom:2px solid var(--gray-400,#aeb6bf);padding:5px 8px;text-align:left;white-space:nowrap;font-weight:700;}
		table.pob-grid td{border-bottom:1px solid var(--border-color);padding:4px 8px;white-space:nowrap;}
		table.pob-grid tr:hover td{background:var(--control-bg);}
		.pob-foot{margin-top:6px;color:var(--text-muted);font-size:12px;}
		</style>
		<div class="pob-head">
			<div class="pob-f-loc"></div><div class="pob-f-cust"></div><div class="pob-f-jo"></div><div class="pob-f-type"></div>
		</div>
		<div class="pob-box">
			<table class="pob-grid">
				<thead><tr>
					<th style="width:30px"><input type="checkbox" class="pob-all"></th>
					<th>Order Bag</th><th>Design</th><th>Location</th><th>Party</th><th>Type</th><th>Qty</th><th>Due</th>
				</tr></thead>
				<tbody class="pob-body"></tbody>
			</table>
		</div>
		<div class="pob-foot"><span class="pob-count">0</span> bag(s) · <span class="pob-sel">0</span> selected. Prints 6 cards per A4 page.</div>
	`);

	const mk = (sel, df) => {
		const c = frappe.ui.form.make_control({ df, parent: $(page.main).find(sel).get(0), render_input: true });
		c.refresh();
		return c;
	};
	state.f.location = mk(".pob-f-loc", { fieldtype: "Select", label: "Location", fieldname: "location", options: ["", ...POB_LOCATIONS].join("\n") });
	state.f.customer = mk(".pob-f-cust", { fieldtype: "Link", label: "Customer", fieldname: "customer", options: "Customer" });
	state.f.job_order = mk(".pob-f-jo", { fieldtype: "Link", label: "Job Order", fieldname: "job_order", options: "Job Order" });
	state.f.order_type = mk(".pob-f-type", { fieldtype: "Link", label: "Type", fieldname: "order_type", options: "Order Type" });
	// Select fires "change"; Link fields fire "awesomplete-selectcomplete" on pick
	// (and "change" on manual clear). Listen for both, let the value settle, then reload.
	Object.values(state.f).forEach((c) => {
		if (c.$input) c.$input.on("change awesomplete-selectcomplete", () => setTimeout(() => loadList(), 80));
	});

	const $body = $(page.main).find(".pob-body");

	function renderRows(rows) {
		state.rows = rows;
		$body.empty();
		rows.forEach((r) => {
			const $tr = $(`
				<tr>
					<td><input type="checkbox" class="pob-cb" data-name="${frappe.utils.escape_html(r.name)}"></td>
					<td><b>${frappe.utils.escape_html(r.name)}</b></td>
					<td>${frappe.utils.escape_html(r.design || "")}</td>
					<td>${frappe.utils.escape_html(r.location || "")}</td>
					<td>${frappe.utils.escape_html(r.customer || "")}</td>
					<td>${frappe.utils.escape_html(r.order_type || "")}</td>
					<td>${r.qty || ""}</td>
					<td>${r.due_date ? frappe.datetime.str_to_user(r.due_date) : ""}</td>
				</tr>`);
			$body.append($tr);
		});
		$(page.main).find(".pob-count").text(rows.length);
		$(page.main).find(".pob-all").prop("checked", false);
		updateSel();
	}

	function loadList() {
		const filters = { is_cad: 0 }; // CAD jobs print from the CAD Jobs page (their own card)
		const loc = state.f.location.get_value();
		const cust = state.f.customer.get_value();
		const jo = state.f.job_order.get_value();
		const tp = state.f.order_type.get_value();
		if (loc) filters.location = loc;
		if (cust) filters.customer = cust;
		if (jo) filters.job_order = jo;
		if (tp) filters.order_type = tp;
		frappe.db
			.get_list("Order Bag", {
				filters,
				fields: ["name", "design", "customer", "location", "order_type", "qty", "due_date"],
				order_by: "name asc",
				limit: 1000,
			})
			.then((rows) => renderRows(rows || []));
	}

	function selectedNames() {
		return $body.find(".pob-cb:checked").map((i, el) => $(el).data("name")).get();
	}
	function updateSel() {
		$(page.main).find(".pob-sel").text(selectedNames().length);
	}
	$(page.main).on("change", ".pob-all", function () {
		$body.find(".pob-cb").prop("checked", $(this).is(":checked"));
		updateSel();
	});
	// click one, shift-click another: every card between them follows
	jewelima.shiftSelect($body, ".pob-cb");
	$body.on("change", ".pob-cb", updateSel);

	page.set_primary_action(__("Print Selected (6/page)"), () => {
		const names = selectedNames();
		if (!names.length) {
			frappe.msgprint(__("Tick at least one Order Bag to print."));
			return;
		}
		frappe.call({
			method: "jewelima.jewelima.api.get_order_bag_cards",
			args: { names: JSON.stringify(names) },
		}).then((r) => jewelima.printJobCards(r.message || []));
	}, "printer");
	page.add_inner_button(__("Refresh"), () => loadList());

	loadList();
};

// print rendering lives in public/js/job_cards.js (jewelima.printJobCards)
// so the Ordering desk prints the EXACT same cards from the same code.
