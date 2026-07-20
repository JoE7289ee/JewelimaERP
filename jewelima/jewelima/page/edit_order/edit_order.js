// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Edit Order — the ONLY place (besides Place Order itself) where an order
// changes after it's placed: per-card MATERIALS (the plan BOM — a card whose
// plan differs from its design shows a yellow "edited" badge) and the order's
// dates. A card whose ornament is already made is locked. Change-logging of
// these edits comes later (parked).
// Route: /app/edit-order

frappe.pages["edit-order"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Edit Order", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const S = { order: null, bags: [] };

	$(page.main).append(`
		<style>
		#page-edit-order .container{max-width:100%;}
		.eo-top{display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin-bottom:12px;}
		.eo-top .frappe-control{margin:0;flex:0 0 220px;}
		.eo-top .control-label{font-size:11px;color:var(--text-muted);}
		.eo-head{display:flex;gap:26px;flex-wrap:wrap;border:1px solid var(--border-color);border-radius:10px;
			background:var(--fg-color);padding:12px 18px;margin-bottom:12px;align-items:end;}
		.eo-h{font-size:13px;}
		.eo-h .k{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);font-weight:700;display:block;}
		.eo-h .frappe-control{margin:0;width:150px;}
		.eo-tbl{width:100%;border-collapse:separate;border-spacing:0;background:var(--fg-color);
			border:1px solid var(--border-color);border-radius:9px;overflow:hidden;font-size:13px;}
		.eo-tbl th{background:var(--control-bg);border-bottom:1px solid var(--border-color);padding:8px 12px;text-align:left;font-weight:700;white-space:nowrap;}
		.eo-tbl td{border-bottom:1px solid var(--border-color);padding:7px 12px;vertical-align:middle;}
		.eo-tbl tbody tr:last-child td{border-bottom:0;}
		.eo-tbl td.num{text-align:right;font-variant-numeric:tabular-nums;}
		.eo-card{font-weight:700;}
		.eo-badge{display:inline-block;font-size:10px;font-weight:800;padding:1px 8px;border-radius:9px;margin-left:6px;}
		.eo-badge.edited{background:#fff3cd;color:#8a6d00;}
		.eo-badge.locked{background:var(--subtle-accent);color:var(--text-muted);}
		.eo-mat{background:#1461d2;border:none;color:#fff;font-weight:700;padding:5px 16px;border-radius:6px;font-size:12px;cursor:pointer;}
		.eo-mat:disabled{opacity:.4;cursor:default;}
		.eo-none{padding:44px;text-align:center;color:var(--text-muted);}
		</style>
		<div class="eo-top"><div class="eo-jo"></div></div>
		<div class="eo-body"><div class="eo-none">${__("Pick a Job Order to edit.")}</div></div>
	`);
	const root = $(page.main);

	const jo = frappe.ui.form.make_control({
		df: { fieldtype: "Link", label: __("Job Order"), fieldname: "jo", options: "Job Order", reqd: 1,
			onchange: () => { if (jo.get_value()) load(jo.get_value()); } },
		parent: root.find(".eo-jo").get(0), render_input: true,
	});
	jo.refresh();

	let due, pdate;

	function load(name) {
		frappe.call({ method: API + ".get_order_for_edit", args: { job_order: name } }).then((r) => {
			const m = r.message || {};
			S.order = m.order; S.bags = m.bags || [];
			paint();
		});
	}

	function paint() {
		const o = S.order;
		root.find(".eo-body").html(`
			<div class="eo-head">
				<div class="eo-h"><span class="k">${__("Order")}</span><b>${esc(o.name)}</b></div>
				<div class="eo-h"><span class="k">${__("Party")}</span>${esc(o.customer || "—")}</div>
				<div class="eo-h"><span class="k">${__("Salesman")}</span>${esc(o.salesman || "—")}</div>
				<div class="eo-h"><span class="k">${__("Type")}</span>${esc(o.order_type || "—")}</div>
				<div class="eo-h"><span class="k">${__("Order Date")}</span>${frappe.datetime.str_to_user(o.order_date) || "—"}</div>
				<div class="eo-h"><span class="k">${__("Due Date")}</span><div class="eo-due"></div></div>
				<div class="eo-h"><span class="k">${__("Party Date")}</span><div class="eo-pdate"></div></div>
				<button class="btn btn-sm btn-default eo-savedates">${__("Update Dates")}</button>
			</div>
			<table class="eo-tbl"><thead><tr>
				<th>${__("Card")}</th><th>${__("Design")}</th><th class="num">${__("Qty")}</th>
				<th>${__("Location")}</th><th class="num">${__("Gross g")}</th><th class="num">${__("Nett g")}</th>
				<th style="text-align:right">${__("Materials")}</th>
			</tr></thead><tbody>${S.bags.map(rowHtml).join("")}</tbody></table>`);

		due = frappe.ui.form.make_control({ df: { fieldtype: "Date", fieldname: "due" },
			parent: root.find(".eo-due").get(0), render_input: true });
		due.refresh(); due.set_value(o.due_date);
		pdate = frappe.ui.form.make_control({ df: { fieldtype: "Date", fieldname: "pdate" },
			parent: root.find(".eo-pdate").get(0), render_input: true });
		pdate.refresh(); pdate.set_value(o.customer_date);
	}

	function rowHtml(b) {
		const badge = b.is_finished ? `<span class="eo-badge locked">${__("MADE — locked")}</span>`
			: (b.diverged ? `<span class="eo-badge edited">${__("edited vs design")}</span>` : "");
		return `<tr data-n="${esc(b.name)}">
			<td class="eo-card">${esc(b.name)}${badge}</td>
			<td>${esc(b.design || "—")}</td>
			<td class="num">${b.qty || 0}</td>
			<td>${esc(b.location || "—")} <span style="color:var(--text-muted);font-size:11px;">${esc(b.stock_status || "")}</span></td>
			<td class="num">${(b.gross_weight || 0).toFixed(3)}</td>
			<td class="num">${(b.nett_weight || 0).toFixed(3)}</td>
			<td style="text-align:right"><button class="eo-mat" ${b.is_finished ? "disabled" : ""}>${__("Materials")}</button></td>
		</tr>`;
	}

	root.on("click", ".eo-savedates", () => {
		frappe.call({ method: API + ".update_order_dates", args: {
			job_order: S.order.name, due_date: due.get_value() || null, customer_date: pdate.get_value() || null,
		} }).then(() => {
			frappe.show_alert({ message: __("Dates updated on the order and every card."), indicator: "green" }, 3);
			load(S.order.name);
		});
	});

	root.on("click", ".eo-mat", function () {
		const bag = S.bags.find((b) => b.name === $(this).closest("tr").attr("data-n"));
		if (!bag) return;
		openMaterials(bag);
	});

	function openMaterials(bag) {
		const d = new frappe.ui.Dialog({
			title: __("Materials — {0} ({1})", [bag.name, bag.design || __("no design")]),
			size: "large",
			fields: [
				{ fieldtype: "HTML", fieldname: "hint" },
				{ fieldtype: "Table", fieldname: "materials", label: __("Plan BOM"),
					cannot_add_rows: false, in_place_edit: true,
					data: bag.bom.map((r) => ({ ...r })),
					fields: [
						{ fieldtype: "Link", fieldname: "item", label: __("Item"), options: "Item",
							in_list_view: 1, columns: 5, reqd: 1 },
						{ fieldtype: "Float", fieldname: "qty", label: __("Qty (pcs)"), in_list_view: 1, columns: 2 },
						{ fieldtype: "Float", fieldname: "weight", label: __("Weight (g / ct)"), in_list_view: 1, columns: 3 },
					] },
			],
			primary_action_label: __("Save Materials"),
			primary_action: () => {
				const rows = (d.get_value("materials") || []).filter((r) => r.item);
				if (!rows.length) return frappe.show_alert({ message: __("At least one material."), indicator: "orange" }, 4);
				d.hide();
				frappe.dom.freeze(__("Saving..."));
				frappe.call({ method: API + ".save_bag_bom", args: {
					order_bag: bag.name, rows: JSON.stringify(rows.map((r) => ({ item: r.item, qty: r.qty || 0, weight: r.weight || 0 }))),
				} }).then(() => {
					frappe.dom.unfreeze();
					frappe.show_alert({ message: __("{0} — plan updated and re-totalled.", [bag.name]), indicator: "green" }, 3);
					load(S.order.name);
				}).catch(() => frappe.dom.unfreeze());
			},
			secondary_action_label: bag.design ? __("Reset to design") : null,
			secondary_action: bag.design ? () => {
				frappe.confirm(__("Replace this card's plan with the design's original BOM?"), () => {
					d.hide();
					frappe.call({ method: API + ".save_bag_bom", args: {
						order_bag: bag.name, rows: JSON.stringify(bag.design_bom),
					} }).then(() => {
						frappe.show_alert({ message: __("Back to the design's BOM."), indicator: "green" }, 3);
						load(S.order.name);
					});
				});
			} : null,
		});
		if (bag.design_bom.length) {
			const orig = bag.design_bom.map((r) => `${esc(r.item)} ×${r.qty} (${r.weight})`).join(" · ");
			d.fields_dict.hint.$wrapper.html(
				`<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">
					${__("Design {0} original:", [esc(bag.design)])} ${orig}</div>`);
		}
		d.show();
	}

	// arriving with a job order pre-picked (e.g. from another page)
	if (frappe.route_options && frappe.route_options.job_order) {
		jo.set_value(frappe.route_options.job_order);
		frappe.route_options = null;
	}
	page.add_inner_button(__("Place Order"), () => frappe.set_route("place-order"));
};
