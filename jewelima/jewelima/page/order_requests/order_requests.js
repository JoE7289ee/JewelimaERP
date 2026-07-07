// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Order Requests — the REQUEST-ENTRY page for the wider team. Anyone with the
// base Jewelima role files a wish-list here (design/qty/size/remark + header);
// nothing is placed. The Order User reviews it on the restricted Place Order
// page (Requests -> Use) and places it — the request then shows Placed with
// its Job Order below. Route: /app/order-requests

frappe.pages["order-requests"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Order Requests", single_column: true });
	const API = "jewelima.jewelima.api";
	const state = { rows: [], header: {}, typeSizes: {} };

	$(page.main).append(`
		<style>
		.orq-head{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:2px 10px;margin:2px 0 6px;max-width:900px;}
		.orq-head .frappe-control{margin:0;}
		.orq-head .control-label{font-size:11px;margin:0 0 1px;color:var(--text-muted);}
		.orq-head .control-input-wrapper .control-input,.orq-head .control-input input,.orq-head .control-value{min-height:26px;height:26px;line-height:24px;font-size:12px;}
		.orq-head .help-box,.orq-head .description{display:none !important;}
		.orq-gridbox{border:1px solid var(--border-color);border-radius:8px;overflow:auto;max-height:45vh;}
		table.orq-grid{width:100%;border-collapse:separate;border-spacing:0;font-size:12px;background:var(--fg-color);}
		table.orq-grid th{position:sticky;top:0;z-index:2;background:var(--control-bg,var(--fg-color));border-right:1px solid var(--border-color);border-bottom:1px solid var(--gray-400,#aeb6bf);padding:3px 6px;text-align:left;white-space:nowrap;font-weight:700;}
		table.orq-grid td{border-right:1px solid var(--border-color);border-bottom:1px solid var(--border-color);padding:0 2px;vertical-align:middle;height:30px;}
		table.orq-grid td.orq-num{color:var(--text-muted);text-align:center;width:30px;background:var(--control-bg);}
		table.orq-grid input,table.orq-grid select{width:100%;border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);padding:1px 4px;font-size:12px;color:var(--text-color);border-radius:3px;height:26px;box-sizing:border-box;}
		table.orq-grid .frappe-control,table.orq-grid .frappe-control .form-group{margin:0;}
		table.orq-grid .frappe-control .help-box,table.orq-grid .frappe-control .control-label{display:none !important;}
		table.orq-grid .frappe-control .control-input-wrapper,table.orq-grid .frappe-control .control-input{margin:0;padding:0;min-height:0;}
		table.orq-grid .frappe-control .control-input input{border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);padding:1px 4px;height:26px;min-height:26px;box-sizing:border-box;border-radius:3px;}
		table.orq-grid .frappe-control .link-btn{display:none !important;}
		table.orq-grid td.orq-ro{padding:0 8px;color:var(--text-muted);white-space:nowrap;}
		.orq-mine{margin-top:16px;border:1px solid var(--border-color);border-radius:8px;overflow:hidden;}
		.orq-mine-head{padding:8px 12px;border-bottom:1px solid var(--border-color);font-weight:700;background:var(--fg-color);}
		.orq-mine table{width:100%;border-collapse:collapse;font-size:12.5px;background:var(--fg-color);}
		.orq-mine td,.orq-mine th{padding:6px 12px;border-bottom:1px solid var(--border-color);text-align:left;}
		.orq-mine tr:last-child td{border-bottom:none;}
		.orq-badge{border-radius:10px;padding:1px 9px;font-size:11px;font-weight:700;}
		.orq-badge.open{background:#e8f2fd;color:#1c5da8;}
		.orq-badge.placed{background:#e6f4ea;color:#2e7d32;}
		.orq-badge.cancelled{background:var(--control-bg);color:var(--text-muted);}
		.orq-empty{padding:14px;text-align:center;color:var(--text-muted);font-size:13px;}
		.orq-foot{margin-top:4px;color:var(--text-muted);font-size:12px;}
		</style>
		<div class="orq-head">
			<div class="orq-h-customer"></div><div class="orq-h-salesman"></div><div class="orq-h-ordertype"></div>
			<div class="orq-h-days"></div><div class="orq-h-custdays"></div><div class="orq-h-notes"></div>
		</div>
		<div class="orq-gridbox">
			<table class="orq-grid"><thead><tr>
				<th class="orq-num">#</th><th style="min-width:165px;width:1%">${__("Design")}</th>
				<th style="min-width:46px;width:1%">${__("Qty")}</th><th style="min-width:92px;width:1%">${__("Size")}</th>
				<th style="min-width:120px;width:1%">${__("Type")}</th><th>${__("Remark")}</th><th style="width:34px"></th>
			</tr></thead><tbody class="orq-body"></tbody></table>
		</div>
		<div class="orq-foot">${__("This only files a REQUEST — no order is placed. The order desk reviews requests and places them.")}</div>
		<div class="orq-mine">
			<div class="orq-mine-head">${__("My Requests")}</div>
			<div class="orq-mine-body"></div>
		</div>
	`);

	const esc = frappe.utils.escape_html;
	const mk = (sel, df) => {
		const c = frappe.ui.form.make_control({ df, parent: $(page.main).find(sel).get(0), render_input: true });
		c.refresh();
		return c;
	};
	state.header.customer = mk(".orq-h-customer", { fieldtype: "Link", label: __("Customer"), fieldname: "customer", options: "Customer" });
	state.header.salesman = mk(".orq-h-salesman", { fieldtype: "Link", label: __("Salesman"), fieldname: "salesman", options: "Sales Person", get_query: () => ({ filters: { is_group: 0, enabled: 1 } }) });
	state.header.order_type = mk(".orq-h-ordertype", { fieldtype: "Link", label: __("Type"), fieldname: "order_type", options: "Order Type", get_query: () => ({ filters: { disabled: 0 } }) });
	state.header.days = mk(".orq-h-days", { fieldtype: "Int", label: __("Days (Due Date)"), fieldname: "days" });
	state.header.cust_days = mk(".orq-h-custdays", { fieldtype: "Int", label: __("Days (Customer Date)"), fieldname: "cust_days" });
	state.header.notes = mk(".orq-h-notes", { fieldtype: "Data", label: __("Notes"), fieldname: "notes" });

	frappe.call({ method: API + ".get_design_types_with_sizes" }).then((r) => {
		(r.message || []).forEach((t) => (state.typeSizes[t.design_type] = { sizes: t.sizes || [], default: t.default || "" }));
	});

	const $body = $(page.main).find(".orq-body");

	function renumber() {
		$body.find("tr").each((i, tr) => $(tr).find(".orq-num").text(i + 1));
	}

	function addRow() {
		const $tr = $("<tr></tr>").appendTo($body);
		$tr.append('<td class="orq-num"></td>');
		const row = { $tr, f: {} };

		const $td = $("<td></td>").appendTo($tr);
		const ctrl = frappe.ui.form.make_control({
			df: { fieldtype: "Link", options: "Design", fieldname: "design", placeholder: __("Design"),
			      get_query: () => ({ filters: { status: "Active" } }) },
			parent: $td.get(0), render_input: true,
		});
		ctrl.refresh();
		row.f.design = { get: () => ctrl.get_value(), set: (v) => ctrl.set_value(v || "") };

		const $qty = $('<input type="number" step="1" min="0">').appendTo($("<td></td>").appendTo($tr));
		row.f.qty = { get: () => $qty.val(), set: (v) => $qty.val(v == null ? "" : v) };
		$qty.on("input change", () => {
			if (cint($qty.val()) > 0 && state.rows[state.rows.length - 1] === row) addRow();
		});

		const $size = $("<select></select>").appendTo($("<td></td>").appendTo($tr));
		$size.append('<option value=""></option>');
		row.f.size = {
			get: () => $size.val(),
			set: (v) => $size.val(v || ""),
			setOptions: (opts) => {
				const cur = $size.val();
				$size.empty().append('<option value=""></option>');
				(opts || []).forEach((o) => $size.append(`<option>${esc(o)}</option>`));
				if (cur && (opts || []).includes(cur)) $size.val(cur);
			},
		};

		const $type = $('<td class="orq-ro">—</td>').appendTo($tr);
		row.setType = (t) => {
			row._designType = t || "";
			$type.text(t || "—");
			const ts = state.typeSizes[row._designType] || { sizes: [], default: "" };
			row.f.size.setOptions(ts.sizes.length ? ts.sizes : ["NA"]);
			if (ts.default && !row.f.size.get()) row.f.size.set(ts.default);
		};

		const $remark = $('<input type="text" maxlength="140">').appendTo($("<td></td>").appendTo($tr));
		row.f.remark = { get: () => $remark.val(), set: (v) => $remark.val(v || "") };

		const $rm = $('<td style="text-align:center"><button class="btn btn-xs btn-default">&times;</button></td>').appendTo($tr);
		$rm.find("button").on("click", () => {
			state.rows = state.rows.filter((x) => x !== row);
			$tr.remove();
			renumber();
		});

		const onPick = () => {
			const design = ctrl.get_value();
			if (!design) { row.setType(""); return; }
			frappe.call({ method: API + ".get_design_materials", args: { design } })
				.then((r) => row.setType((r.message || {}).design_type || ""));
		};
		ctrl.$input.on("change awesomplete-selectcomplete", () => setTimeout(onPick, 50));
		ctrl.$input.on("input", frappe.utils.debounce(() => {
			if ((ctrl.$input.val() || "").trim()) return;
			Promise.resolve(ctrl.set_value("")).then(onPick);
		}, 300));

		state.rows.push(row);
		renumber();
		return row;
	}

	function resetPage() {
		$body.empty();
		state.rows = [];
		["customer", "salesman", "order_type", "notes"].forEach((k) => state.header[k].set_value(""));
		state.header.days.set_value(0);
		state.header.cust_days.set_value(0);
		addRow();
	}

	function loadMine() {
		frappe.call({ method: API + ".get_my_order_requests" }).then((r) => {
			const reqs = r.message || [];
			const box = $(page.main).find(".orq-mine-body");
			if (!reqs.length) { box.html(`<div class="orq-empty">${__("No requests filed yet.")}</div>`); return; }
			box.html(`
				<table><thead><tr>
					<th>${__("Request")}</th><th>${__("Date")}</th><th>${__("Customer")}</th>
					<th style="text-align:center">${__("Lines")}</th><th>${__("Status")}</th><th>${__("Order")}</th>
				</tr></thead><tbody>${reqs.map((q) => `
					<tr>
						<td><a href="/app/order-request/${encodeURIComponent(q.name)}"><b>${esc(q.name)}</b></a></td>
						<td>${esc(frappe.datetime.str_to_user(q.request_date) || "")}</td>
						<td>${esc(q.customer || "")}</td>
						<td style="text-align:center">${q.lines}</td>
						<td><span class="orq-badge ${q.status.toLowerCase()}">${esc(q.status)}</span></td>
						<td>${q.job_order ? `<a href="/app/job-order/${encodeURIComponent(q.job_order)}">${esc(q.job_order)}</a>` : "—"}</td>
					</tr>`).join("")}
				</tbody></table>`);
		});
	}

	function saveRequest() {
		const lines = state.rows
			.map((r) => ({ design: r.f.design.get(), qty: cint(r.f.qty.get()) || 1, size: r.f.size.get(), remark: r.f.remark.get() }))
			.filter((l) => l.design);
		if (!lines.length) { frappe.msgprint(__("Add at least one line with a Design.")); return; }
		const payload = {
			customer: state.header.customer.get_value(),
			salesman: state.header.salesman.get_value(),
			order_type: state.header.order_type.get_value(),
			days: cint(state.header.days.get_value()),
			cust_days: cint(state.header.cust_days.get_value()),
			notes: state.header.notes.get_value(),
			lines,
		};
		frappe.call({ method: API + ".save_order_request", args: { payload } }).then((r) => {
			frappe.show_alert({ message: __("Request {0} saved — no order placed.", [r.message]), indicator: "green" }, 6);
			resetPage();
			loadMine();
		});
	}

	page.set_primary_action(__("Save Request"), saveRequest, "add");
	page.add_inner_button(__("Add Row"), () => addRow());
	page.add_inner_button(__("Reset"), resetPage);

	addRow();
	loadMine();
};
