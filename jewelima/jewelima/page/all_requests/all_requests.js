// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// All Requests — the order desk's review board (Setup > Order Setup). Every
// Order Request from every user, filterable by status / customer / type /
// salesman / design. "Place Order" on an Open row jumps to the Place Order
// page with the whole request filled in (route_options handoff) — placing it
// there stamps the request Placed. Route: /app/all-requests

frappe.pages["all-requests"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "All Requests", single_column: true });
	const API = "jewelima.jewelima.api";
	const S = { status: "Open", rows: [] };

	$(page.main).append(`
		<style>
		.arq-top{display:flex;align-items:flex-end;gap:10px;margin:2px 0 12px;flex-wrap:wrap;}
		.arq-f{min-width:170px;}
		.arq-f .frappe-control{margin:0;}
		.arq-f .control-label{font-size:11px;margin:0 0 1px;color:var(--text-muted);}
		.arq-f .control-input-wrapper .control-input,.arq-f .control-input input{min-height:28px;height:28px;font-size:12.5px;}
		.arq-f .help-box,.arq-f .description{display:none !important;}
		.arq-pills{display:flex;gap:4px;}
		.arq-pill{border:1px solid var(--border-color);background:var(--fg-color);border-radius:14px;padding:3px 13px;font-size:12px;cursor:pointer;}
		.arq-pill.on{background:var(--primary);color:#fff;border-color:var(--primary);font-weight:600;}
		.arq-count{color:var(--text-muted);font-size:12px;margin-left:auto;}
		.arq-box{border:1px solid var(--border-color);border-radius:8px;overflow:auto;max-height:calc(100vh - 210px);background:var(--fg-color);}
		table.arq-tbl{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.arq-tbl th{position:sticky;top:0;z-index:1;background:var(--control-bg,var(--fg-color));border-bottom:2px solid var(--gray-400,#aeb6bf);padding:7px 10px;text-align:left;white-space:nowrap;font-weight:700;}
		table.arq-tbl td{border-bottom:1px solid var(--border-color);padding:6px 10px;vertical-align:middle;}
		table.arq-tbl tr:hover td{background:var(--control-bg);}
		.arq-badge{border-radius:10px;padding:1px 9px;font-size:11px;font-weight:700;white-space:nowrap;}
		.arq-badge.open{background:#e8f2fd;color:#1c5da8;}
		.arq-badge.placed{background:#e6f4ea;color:#2e7d32;}
		.arq-badge.cancelled{background:var(--control-bg);color:var(--text-muted);}
		.arq-notes{color:var(--text-muted);font-size:11.5px;}
		.arq-empty{padding:18px;text-align:center;color:var(--text-muted);}
		</style>
		<div class="arq-top">
			<div class="arq-pills">
				${["Open", "Placed", "All"].map((s) => `<span class="arq-pill${s === "Open" ? " on" : ""}" data-s="${s}">${__(s)}</span>`).join("")}
			</div>
			<div class="arq-f arq-f-customer"></div>
			<div class="arq-f arq-f-type"></div>
			<div class="arq-f arq-f-salesman"></div>
			<div class="arq-f arq-f-design"></div>
			<span class="arq-count"></span>
		</div>
		<div class="arq-box"><table class="arq-tbl"><thead><tr>
			<th>${__("Request")}</th><th>${__("Date")}</th><th>${__("By")}</th><th>${__("Customer")}</th>
			<th>${__("Type")}</th><th>${__("Salesman")}</th>
			<th style="text-align:center">${__("Lines")}</th><th style="text-align:center">${__("Qty")}</th>
			<th>${__("Designs")}</th><th>${__("Status")}</th><th>${__("Order")}</th><th></th>
		</tr></thead><tbody class="arq-body"></tbody></table></div>
	`);

	const root = $(page.main)[0];
	const esc = frappe.utils.escape_html;
	const mk = (sel, df) => {
		const c = frappe.ui.form.make_control({ df, parent: $(page.main).find(sel).get(0), render_input: true });
		c.refresh();
		c.$input.on("change awesomplete-selectcomplete", () => setTimeout(load, 80));
		c.$input.on("input", frappe.utils.debounce(() => { if (!(c.$input.val() || "").trim()) { c.set_value(""); load(); } }, 300));
		return c;
	};
	const F = {
		customer: mk(".arq-f-customer", { fieldtype: "Link", label: __("Customer"), fieldname: "customer", options: "Customer" }),
		order_type: mk(".arq-f-type", { fieldtype: "Link", label: __("Type"), fieldname: "order_type", options: "Order Type" }),
		salesman: mk(".arq-f-salesman", { fieldtype: "Link", label: __("Salesman"), fieldname: "salesman", options: "Sales Person", get_query: () => ({ filters: { is_group: 0 } }) }),
		design: mk(".arq-f-design", { fieldtype: "Link", label: __("Design"), fieldname: "design", options: "Design" }),
	};

	$(page.main).find(".arq-pill").on("click", function () {
		$(page.main).find(".arq-pill").removeClass("on");
		this.classList.add("on");
		S.status = this.getAttribute("data-s");
		load();
	});

	function load() {
		frappe.call({
			method: API + ".get_all_order_requests",
			args: {
				status: S.status,
				customer: F.customer.get_value(),
				order_type: F.order_type.get_value(),
				salesman: F.salesman.get_value(),
				design: F.design.get_value(),
			},
		}).then((r) => {
			S.rows = r.message || [];
			render();
		});
	}

	function render() {
		const body = root.querySelector(".arq-body");
		root.querySelector(".arq-count").textContent = __("{0} request(s)", [S.rows.length]);
		if (!S.rows.length) {
			body.innerHTML = `<tr><td colspan="12" class="arq-empty">${__("No requests match.")}</td></tr>`;
			return;
		}
		body.innerHTML = S.rows.map((q) => `
			<tr>
				<td><a href="/app/order-request/${encodeURIComponent(q.name)}"><b>${esc(q.name)}</b></a></td>
				<td>${esc(frappe.datetime.str_to_user(q.request_date) || "")}</td>
				<td>${esc(q.requested_by)}</td>
				<td>${esc(q.customer)}</td>
				<td>${esc(q.order_type)}</td>
				<td>${esc(q.salesman)}</td>
				<td style="text-align:center">${q.lines}</td>
				<td style="text-align:center">${q.qty}</td>
				<td>${esc(q.designs)}${q.notes ? `<div class="arq-notes">${esc(q.notes)}</div>` : ""}</td>
				<td><span class="arq-badge ${q.status.toLowerCase()}">${esc(q.status)}</span></td>
				<td>${q.job_order ? `<a href="/app/job-order/${encodeURIComponent(q.job_order)}">${esc(q.job_order)}</a>` : "—"}</td>
				<td style="text-align:center">${q.status === "Open"
					? `<button class="btn btn-primary btn-xs arq-place" data-name="${esc(q.name)}">${__("Place Order")}</button>`
					: ""}</td>
			</tr>`).join("");
		body.querySelectorAll(".arq-place").forEach((el) =>
			el.addEventListener("click", function () {
				// hand the request to the Place Order page — it fills itself and
				// stamps the request once the order is placed
				frappe.route_options = { order_request: this.getAttribute("data-name") };
				frappe.set_route("place-order");
			})
		);
	}

	load();
};
