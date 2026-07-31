// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Repack Requests — the approval desk, split off Repack Stock so the placing
// page stays clean. Pending / All tabs; System Manager approves (stock moves
// via ONE Repack entry) or rejects with a reason.
// Route: /app/repack-requests

frappe.pages["repack-requests"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Repack Requests", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	let canApprove = false;
	let listStatus = "Pending";

	$(page.main).append(`
		<style>
		#page-repack-requests .container{max-width:100%;}
		.rq-tabs{display:flex;gap:6px;margin:0 0 10px;}
		.rq-tab{border:1px solid var(--border-color);border-radius:8px;padding:4px 14px;font-size:12px;font-weight:700;cursor:pointer;background:var(--control-bg);}
		.rq-tab.on{background:var(--primary);border-color:var(--primary);color:#fff;}
		.rq-tbl{width:100%;border-collapse:separate;border-spacing:0;background:var(--fg-color);
			border:1px solid var(--border-color);border-radius:9px;overflow:hidden;font-size:12.5px;}
		.rq-tbl th{background:var(--control-bg);border-bottom:1px solid var(--border-color);padding:7px 10px;text-align:left;font-weight:700;}
		.rq-tbl td{border-bottom:1px solid var(--border-color);padding:6px 10px;vertical-align:top;}
		.rq-tbl tbody tr:last-child td{border-bottom:0;}
		.rq-st{font-weight:800;font-size:11px;padding:1px 9px;border-radius:9px;}
		.rq-st.Pending{background:#fff3cd;color:#8a6d00;} .rq-st.Approved{background:#e8f5e9;color:#2e7d32;}
		.rq-st.Rejected{background:#fdecea;color:#b02a2a;}
		</style>
		<div class="rq-tabs">
			<span class="rq-tab on" data-s="Pending">${__("Pending")}</span>
			<span class="rq-tab" data-s="all">${__("All")}</span>
		</div>
		<div class="rq-body"></div>
	`);
	const root = $(page.main);

	function loadList() {
		frappe.call({ method: API + ".list_repack_requests", args: { status: listStatus } }).then((r) => {
			const rows = r.message || [];
			root.find(".rq-body").html(rows.length ? `<table class="rq-tbl"><thead><tr>
				<th>${__("Request")}</th><th>${__("Source")}</th><th>${__("Split into")}</th><th>${__("By")}</th>
				<th>${__("Status")}</th><th></th></tr></thead><tbody>` +
				rows.map((x) => `<tr>
					<td><b>${esc(x.name)}</b><br><span style="color:var(--text-muted);font-size:11px;">${esc((x.requested_on || "").slice(0, 16))}</span></td>
					<td>${esc(x.source_item)} · <b>${(x.qty || 0).toFixed(3)} ct</b></td>
					<td>${x.targets.map((t) => `${esc(t.item)} — ${t.qty.toFixed(3)}${t.pcs ? " ct · " + t.pcs + " pc" : ""}`).join("<br>")}</td>
					<td>${esc(x.requested_by || "")}</td>
					<td><span class="rq-st ${x.status}">${esc(x.status)}</span>
						${x.stock_entry ? `<br><span style="font-size:11px;color:var(--text-muted);">${esc(x.stock_entry)}</span>` : ""}
						${x.reject_reason ? `<br><span style="font-size:11px;color:#b02a2a;">${esc(x.reject_reason)}</span>` : ""}</td>
					<td style="white-space:nowrap;">${x.status === "Pending" && canApprove
						? `<button class="btn btn-xs btn-success rq-ok" data-n="${esc(x.name)}">${__("Approve")}</button>
						   <button class="btn btn-xs btn-danger rq-no" data-n="${esc(x.name)}">${__("Reject")}</button>` : ""}</td>
				</tr>`).join("") + "</tbody></table>"
				: `<div style="padding:24px;color:var(--text-muted);">${__("No requests.")}</div>`);
		});
	}

	root.on("click", ".rq-tab", function () {
		root.find(".rq-tab").removeClass("on"); $(this).addClass("on");
		listStatus = $(this).attr("data-s");
		loadList();
	});
	root.on("click", ".rq-ok", function () {
		const n = $(this).attr("data-n");
		frappe.confirm(__("Approve <b>{0}</b>? Stock moves immediately (Repack entry).", [esc(n)]), () => {
			frappe.call({ method: API + ".approve_repack", args: { name: n } }).then((r) => {
				frappe.show_alert({ message: __("{0} approved — {1}.", [n, (r.message || {}).stock_entry]), indicator: "green" }, 4);
				loadList();
			});
		});
	});
	root.on("click", ".rq-no", function () {
		const n = $(this).attr("data-n");
		frappe.prompt({ fieldname: "why", label: __("Reason"), fieldtype: "Data" }, (v) => {
			frappe.call({ method: API + ".reject_repack", args: { name: n, reason: v.why || null } }).then(() => {
				frappe.show_alert({ message: __("{0} rejected.", [n]), indicator: "red" }, 3);
				loadList();
			});
		}, __("Reject {0}", [n]));
	});

	page.add_inner_button(__("Repack Stock"), () => frappe.set_route("repack-stock"));
	page.set_primary_action(__("Refresh"), () => loadList(), "refresh");
	frappe.call({ method: API + ".get_repack_context" }).then((r) => {
		canApprove = !!(r.message || {}).can_approve;
		loadList();
	});
};
