// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Repack Stock (Stones) — split bulk stone stock into sieves, WITH APPROVAL.
// Left: what's being repacked (locked to the Stone Issue warehouse, live stock
// shown). Right: what it splits into — targets restricted to the source's own
// family (CZ -> CZ sieves; DIAMOND -> any diamond quality + sieve) and they must
// add up EXACTLY. Placing only creates a REQUEST; a System/Stock Manager
// approves below, and only then a Repack Stock Entry moves the stock.
// Route: /app/repack-stock

frappe.pages["repack-stock"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Repack Stock", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	let CTX = { warehouse: "", can_approve: false, target_groups: [], available: 0 };
	let TARGETS = [];

	$(page.main).append(`
		<style>
		#page-repack-stock .container{max-width:100%;}
		.rp2-grid{display:grid;grid-template-columns:1fr 1.4fr;gap:16px;max-width:1150px;align-items:start;}
		@media (max-width:900px){.rp2-grid{grid-template-columns:1fr;}}
		.rp2-card{border:1px solid var(--border-color);border-radius:10px;background:var(--fg-color);padding:14px 18px;}
		.rp2-card h4{margin:0 0 10px;font-size:14px;}
		.rp2-card .control-label{font-size:11px;color:var(--text-muted);}
		.rp2-meta{font-size:12.5px;color:var(--text-muted);margin:8px 0;}
		.rp2-meta b{color:var(--text-color);}
		.rp2-tbl{width:100%;border-collapse:collapse;font-size:13px;}
		.rp2-tbl th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);padding:4px 8px;}
		.rp2-tbl td{padding:3px 8px;}
		.rp2-tbl input.qty{width:110px;border:1px solid var(--border-color);border-radius:6px;padding:6px 9px;
			background:var(--control-bg);font-variant-numeric:tabular-nums;text-align:right;}
		.rp2-x{color:#b02a2a;cursor:pointer;font-weight:800;padding:0 6px;}
		.rp2-bal{margin:10px 0;font-size:13px;font-weight:700;}
		.rp2-bal.ok{color:#2e7d32;} .rp2-bal.bad{color:#b02a2a;}
		.rp2-go{background:#2e7d32;border:none;color:#fff;font-weight:800;letter-spacing:.4px;
			padding:10px 28px;border-radius:8px;font-size:14px;cursor:pointer;}
		.rp2-go:disabled{opacity:.4;cursor:default;}
		.rp2-list{margin-top:18px;max-width:1150px;}
		.rp2-reqtbl{width:100%;border-collapse:separate;border-spacing:0;background:var(--fg-color);
			border:1px solid var(--border-color);border-radius:9px;overflow:hidden;font-size:12.5px;}
		.rp2-reqtbl th{background:var(--control-bg);border-bottom:1px solid var(--border-color);padding:7px 10px;text-align:left;font-weight:700;}
		.rp2-reqtbl td{border-bottom:1px solid var(--border-color);padding:6px 10px;vertical-align:top;}
		.rp2-reqtbl tbody tr:last-child td{border-bottom:0;}
		.rp2-st{font-weight:800;font-size:11px;padding:1px 9px;border-radius:9px;}
		.rp2-st.Pending{background:#fff3cd;color:#8a6d00;} .rp2-st.Approved{background:#e8f5e9;color:#2e7d32;}
		.rp2-st.Rejected{background:#fdecea;color:#b02a2a;}
		.rp2-tabs{display:flex;gap:6px;margin:0 0 8px;}
		.rp2-tab{border:1px solid var(--border-color);border-radius:8px;padding:4px 14px;font-size:12px;font-weight:700;cursor:pointer;background:var(--control-bg);}
		.rp2-tab.on{background:var(--primary);border-color:var(--primary);color:#fff;}
		</style>
		<div class="rp2-grid">
			<div class="rp2-card">
				<h4>${__("Repack — what")}</h4>
				<div class="rp2-src"></div>
				<div class="rp2-qty"></div>
				<div class="rp2-meta rp2-info">${__("Locked to the Stone Issue warehouse.")}</div>
			</div>
			<div class="rp2-card">
				<h4>${__("Split into")}</h4>
				<div class="rp2-addrow" style="display:flex;gap:8px;align-items:end;margin-bottom:8px;">
					<div class="rp2-titem" style="flex:1;"></div>
					<button class="btn btn-sm btn-default rp2-add">${__("Add line")}</button>
				</div>
				<table class="rp2-tbl"><thead><tr><th>${__("Item")}</th><th style="text-align:right">${__("Qty (ct)")}</th><th></th></tr></thead>
					<tbody class="rp2-tbody"></tbody></table>
				<div class="rp2-bal"></div>
				<div style="display:flex;gap:10px;align-items:end;">
					<div class="rp2-remarks" style="flex:1;"></div>
					<button class="rp2-go" disabled>${__("PLACE REQUEST")}</button>
				</div>
			</div>
		</div>
		<div class="rp2-list">
			<h4 style="margin:0 0 8px;">${__("Requests")}</h4>
			<div class="rp2-tabs">
				<span class="rp2-tab on" data-s="Pending">${__("Pending")}</span>
				<span class="rp2-tab" data-s="all">${__("All")}</span>
			</div>
			<div class="rp2-reqbody"></div>
		</div>
	`);
	const root = $(page.main);
	let listStatus = "Pending";

	const mk = (sel, df) => {
		const c = frappe.ui.form.make_control({ df, parent: root.find(sel).get(0), render_input: true });
		c.refresh();
		return c;
	};
	const src = mk(".rp2-src", { fieldtype: "Link", label: __("Source Item"), fieldname: "src", options: "Item",
		get_query: () => ({ filters: { stone_type: ["is", "set"], is_stock_item: 1 } }),
		onchange: () => onSource() });
	const qty = mk(".rp2-qty", { fieldtype: "Float", label: __("Qty being repacked (ct)"), fieldname: "q",
		onchange: () => balance() });
	const titem = mk(".rp2-titem", { fieldtype: "Link", label: __("Target item"), fieldname: "t", options: "Item" });
	const remarks = mk(".rp2-remarks", { fieldtype: "Data", label: __("Remarks"), fieldname: "r" });

	function onSource() {
		const it = src.get_value();
		TARGETS = [];
		paintTargets();
		if (!it) return;
		frappe.call({ method: API + ".get_repack_context", args: { source_item: it } }).then((r) => {
			CTX = r.message || CTX;
			root.find(".rp2-info").html(__("Warehouse <b>{0}</b> · available there: <b>{1} ct</b> · family: <b>{2}</b>",
				[esc(CTX.warehouse || "—"), (CTX.available || 0).toFixed(3), esc(CTX.family || "—")]));
			titem.df.get_query = () => ({ filters: {
				item_group: ["in", CTX.target_groups || []], is_stock_item: 1, name: ["!=", it] } });
			balance();
		});
	}

	root.find(".rp2-add").on("click", () => {
		const it = titem.get_value();
		if (!it) return;
		if (TARGETS.some((t) => t.item === it)) {
			frappe.show_alert({ message: __("{0} is already a line.", [esc(it)]), indicator: "orange" }, 3);
			return;
		}
		TARGETS.push({ item: it, qty: 0 });
		titem.set_value("");
		paintTargets();
	});

	function paintTargets() {
		root.find(".rp2-tbody").html(TARGETS.map((t, i) => `<tr>
			<td>${esc(t.item)}</td>
			<td style="text-align:right"><input class="qty" type="number" step="0.001" data-i="${i}" value="${t.qty || ""}"></td>
			<td><span class="rp2-x" data-i="${i}">✕</span></td>
		</tr>`).join("") || `<tr><td colspan="3" style="color:var(--text-muted);padding:14px 8px;">${__("Pick the sieve items this stock splits into.")}</td></tr>`);
		balance();
	}

	root.on("input", ".rp2-tbl input.qty", function () {
		TARGETS[Number(this.dataset.i)].qty = Number(this.value) || 0;
		balance();
	});
	root.on("click", ".rp2-x", function () {
		TARGETS.splice(Number($(this).attr("data-i")), 1);
		paintTargets();
	});

	function balance() {
		const q = Number(qty.get_value()) || 0;
		const sum = TARGETS.reduce((a, t) => a + (t.qty || 0), 0);
		const ok = q > 0 && TARGETS.length && Math.abs(sum - q) < 0.0005;
		root.find(".rp2-bal")
			.toggleClass("ok", ok).toggleClass("bad", !ok)
			.text(q || sum ? __("Targets {0} ct of {1} ct — {2}", [sum.toFixed(3), q.toFixed(3),
				ok ? __("balanced ✓") : __("must match exactly")]) : "");
		root.find(".rp2-go").prop("disabled", !ok || !src.get_value());
	}

	root.find(".rp2-go").on("click", () => {
		frappe.confirm(__("Place a repack request for <b>{0} ct</b> of <b>{1}</b> into {2} line(s)?<br>It only moves after approval.",
			[Number(qty.get_value()).toFixed(3), esc(src.get_value()), TARGETS.length]), () => {
			frappe.call({ method: API + ".create_repack_request", args: {
				source_item: src.get_value(), qty: qty.get_value(),
				targets: JSON.stringify(TARGETS), remarks: remarks.get_value() || null,
			} }).then((r) => {
				frappe.show_alert({ message: __("Request {0} placed — awaiting approval.", [(r.message || {}).name]), indicator: "green" }, 4);
				TARGETS = []; qty.set_value(""); remarks.set_value("");
				paintTargets(); loadList();
			});
		});
	});

	// ---- requests list + approval ----
	function loadList() {
		frappe.call({ method: API + ".list_repack_requests", args: { status: listStatus } }).then((r) => {
			const rows = r.message || [];
			root.find(".rp2-reqbody").html(rows.length ? `<table class="rp2-reqtbl"><thead><tr>
				<th>${__("Request")}</th><th>${__("Source")}</th><th>${__("Split into")}</th><th>${__("By")}</th>
				<th>${__("Status")}</th><th></th></tr></thead><tbody>` +
				rows.map((x) => `<tr>
					<td><b>${esc(x.name)}</b><br><span style="color:var(--text-muted);font-size:11px;">${esc((x.requested_on || "").slice(0, 16))}</span></td>
					<td>${esc(x.source_item)} · <b>${(x.qty || 0).toFixed(3)} ct</b></td>
					<td>${x.targets.map((t) => `${esc(t.item)} — ${t.qty.toFixed(3)}`).join("<br>")}</td>
					<td>${esc(x.requested_by || "")}</td>
					<td><span class="rp2-st ${x.status}">${esc(x.status)}</span>
						${x.stock_entry ? `<br><span style="font-size:11px;color:var(--text-muted);">${esc(x.stock_entry)}</span>` : ""}
						${x.reject_reason ? `<br><span style="font-size:11px;color:#b02a2a;">${esc(x.reject_reason)}</span>` : ""}</td>
					<td style="white-space:nowrap;">${x.status === "Pending" && CTX.can_approve
						? `<button class="btn btn-xs btn-success rp2-ok" data-n="${esc(x.name)}">${__("Approve")}</button>
						   <button class="btn btn-xs btn-danger rp2-no" data-n="${esc(x.name)}">${__("Reject")}</button>` : ""}</td>
				</tr>`).join("") + "</tbody></table>"
				: `<div style="padding:20px;color:var(--text-muted);">${__("No requests.")}</div>`);
		});
	}

	root.on("click", ".rp2-tab", function () {
		root.find(".rp2-tab").removeClass("on"); $(this).addClass("on");
		listStatus = $(this).attr("data-s");
		loadList();
	});
	root.on("click", ".rp2-ok", function () {
		const n = $(this).attr("data-n");
		frappe.confirm(__("Approve <b>{0}</b>? Stock moves immediately (Repack entry).", [esc(n)]), () => {
			frappe.call({ method: API + ".approve_repack", args: { name: n } }).then((r) => {
				frappe.show_alert({ message: __("{0} approved — {1}.", [n, (r.message || {}).stock_entry]), indicator: "green" }, 4);
				loadList(); onSource();
			});
		});
	});
	root.on("click", ".rp2-no", function () {
		const n = $(this).attr("data-n");
		frappe.prompt({ fieldname: "why", label: __("Reason"), fieldtype: "Data" }, (v) => {
			frappe.call({ method: API + ".reject_repack", args: { name: n, reason: v.why || null } }).then(() => {
				frappe.show_alert({ message: __("{0} rejected.", [n]), indicator: "red" }, 3);
				loadList();
			});
		}, __("Reject {0}", [n]));
	});

	frappe.call({ method: API + ".get_repack_context" }).then((r) => { CTX = r.message || CTX; loadList(); });
	page.set_primary_action(__("Refresh"), () => { loadList(); onSource(); }, "refresh");
};
