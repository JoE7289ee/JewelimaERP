// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Cancellation — kill a wrongly placed order. Two sides:
//   ORDER BAG  — scan (or type) a card. Empty bag -> one red button. A bag
//                holding gold/stones first RETURNS every line to one of the
//                two ISSUE warehouses (stones -> Stone Issue, metal -> Gold
//                Issue, switchable per line), THEN cancels.
//   JOB ORDER  — the whole order at once. Allowed only when every open bag
//                is material-free; otherwise the desk names the bags to
//                clear one by one on the bag side first.
// Sold / finished / at-certification cards never cancel here.
// Route: /app/cancellation

frappe.pages["cancellation"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Cancellation", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const g3 = (v) => (v || 0).toLocaleString("en-IN", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
	let MODE = "bag"; // "bag" | "jo"
	let BAG = null;   // get_cancel_bag payload
	let JO = null;    // get_cancel_job_order payload

	$(page.main).append(`
		<style>
		#page-cancellation .container{max-width:100%;}
		.cx-modes{display:inline-flex;border:1px solid var(--border-color);border-radius:8px;overflow:hidden;margin-bottom:12px;}
		.cx-modes button{border:none;padding:9px 22px;font-size:12.5px;font-weight:700;background:var(--control-bg);color:var(--text-color);cursor:pointer;}
		.cx-modes button.on{background:#8a2f2f;color:#fff;}
		.cx-scanwrap{display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin-bottom:14px;}
		.cx-scanwrap label{display:block;font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px;}
		.cx-scan{border:2px solid #8a2f2f;border-radius:9px;padding:10px 14px;font-size:15px;font-weight:700;width:300px;background:var(--fg-color);color:var(--text-color);outline:none;}
		.cx-btn{border:none;color:#fff;font-weight:800;padding:10px 22px;border-radius:8px;cursor:pointer;}
		.cx-card{border:1px solid var(--border-color);border-radius:10px;background:var(--fg-color);padding:14px 16px;max-width:960px;}
		.cx-head{display:flex;gap:18px;flex-wrap:wrap;align-items:baseline;margin-bottom:8px;}
		.cx-head .nm{font-size:17px;font-weight:800;}
		.cx-head .kv{font-size:12px;color:var(--text-muted);}
		.cx-head .kv b{color:var(--text-color);}
		.cx-block{border:1.5px solid #b02a2a;background:rgba(176,42,42,.07);border-radius:8px;padding:9px 14px;color:#b02a2a;font-weight:700;font-size:12.5px;margin:8px 0;}
		.cx-ok{border:1.5px solid #2e7d32;background:rgba(46,125,50,.07);border-radius:8px;padding:9px 14px;color:#1d7a33;font-weight:700;font-size:12.5px;margin:8px 0;}
		table.cx-t{width:100%;border-collapse:collapse;font-size:12px;background:var(--fg-color);}
		table.cx-t th{background:var(--control-bg);font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);padding:5px 8px;border:1px solid var(--border-color);text-align:left;}
		table.cx-t td{border:1px solid var(--border-color);padding:4px 8px;font-variant-numeric:tabular-nums;}
		table.cx-t select{border:1px solid var(--border-color);border-radius:6px;padding:3px 6px;font-size:11.5px;background:var(--fg-color);color:var(--text-color);}
		tr.cx-bad td{background:rgba(176,42,42,.06);}
		.cx-chip{display:inline-block;border-radius:10px;padding:1px 9px;font-size:10.5px;font-weight:700;}
		.cx-chip.ip{background:#fdf3d0;color:#8a6d00;}
		.cx-chip.cn{background:#f5dddd;color:#b02a2a;}
		.cx-chip.ok{background:#dcefe0;color:#1d7a33;}
		</style>
		<div class="cx-modes">
			<button data-m="bag" class="on">${__("ORDER BAG")}</button>
			<button data-m="jo">${__("JOB ORDER")}</button>
		</div>
		<div class="cx-scanwrap">
			<span><label class="cx-scanlbl">${__("Scan / type the bag")}</label>
			<input class="cx-scan" placeholder="${__("scan card…")}" autocomplete="off"></span>
			<button class="cx-btn cx-go" style="background:#1f618d;">${__("Look up")}</button>
		</div>
		<div class="cx-body"></div>
	`);
	const root = $(page.main);
	const focus = () => setTimeout(() => root.find(".cx-scan").trigger("focus").select(), 80);

	root.on("click", ".cx-modes button", function () {
		MODE = $(this).data("m");
		root.find(".cx-modes button").removeClass("on");
		$(this).addClass("on");
		root.find(".cx-scanlbl").text(MODE === "bag" ? __("Scan / type the bag") : __("Job Order no"));
		root.find(".cx-scan").attr("placeholder", MODE === "bag" ? __("scan card…") : __("JO-…"));
		BAG = JO = null;
		root.find(".cx-body").empty();
		focus();
	});

	function lookup() {
		const v = (root.find(".cx-scan").val() || "").trim();
		if (!v) return;
		if (MODE === "bag") {
			frappe.call({ method: API + ".get_cancel_bag", args: { order_bag: v } }).then((r) => {
				BAG = r.message;
				paintBag();
			});
		} else {
			frappe.call({ method: API + ".get_cancel_job_order", args: { job_order: v } }).then((r) => {
				JO = r.message;
				paintJO();
			});
		}
	}
	root.on("click", ".cx-go", lookup);
	root.on("keydown", ".cx-scan", (e) => {
		if (e.key === "Enter") lookup();
	});

	// ------------------------------------------------------------- bag side
	function paintBag() {
		const b = BAG;
		const chip = b.status === "Cancelled" ? "cn" : b.status === "In Production" ? "ip" : "ok";
		const whOpts = (sel) => b.issue_warehouses.map((w) => `<option ${w === sel ? "selected" : ""}>${esc(w)}</option>`).join("");
		root.find(".cx-body").html(`
			<div class="cx-card">
				<div class="cx-head">
					<span class="nm">${esc(b.name)}</span>
					<span class="cx-chip ${chip}">${esc(b.status || "")}</span>
					<span class="kv">${__("design")} <b>${esc(b.design || "—")}</b></span>
					<span class="kv">${__("job order")} <b>${esc(b.job_order || "—")}</b></span>
					<span class="kv">${__("customer")} <b>${esc(b.customer || "—")}</b></span>
					<span class="kv">${__("location")} <b>${esc(b.location || "—")}</b></span>
					<span class="kv">${__("qty")} <b>${b.qty || 1}</b></span>
				</div>
				${b.blocker ? `<div class="cx-block">⛔ ${b.blocker}</div>` : b.materials.length ? `
					<div class="cx-block" style="border-color:#b35a00;background:rgba(179,90,0,.07);color:#b35a00;">
						${__("This bag HOLDS materials — they return to an ISSUE warehouse, then the bag cancels.")}</div>
					<table class="cx-t" style="max-width:720px;"><thead><tr>
						<th>${__("Item")}</th><th>${__("Qty")}</th><th>${__("Pcs")}</th><th>${__("Type")}</th><th>${__("Return to")}</th>
					</tr></thead><tbody>
					${b.materials.map((m, i) => `<tr>
						<td><b>${esc(m.item)}</b></td><td>${g3(m.qty)} ${esc(m.uom || "")}</td><td>${m.pcs || ""}</td>
						<td>${m.is_stone ? __("stone") : __("metal")}</td>
						<td><select class="cx-wh" data-item="${esc(m.item)}">${whOpts(m.warehouse)}</select></td>
					</tr>`).join("")}</tbody></table>
					<div style="margin-top:12px;">
						<button class="cx-btn cx-cancelbag" style="background:#b35a00;">${__("Return materials → Cancel bag")}</button>
					</div>`
				: `<div class="cx-ok">${__("No materials in this bag — it cancels outright.")}</div>
					<button class="cx-btn cx-cancelbag" style="background:#b02a2a;">${__("Cancel this bag")}</button>`}
			</div>`);
		focus();
	}

	root.on("click", ".cx-cancelbag", () => {
		if (!BAG || BAG.blocker) return;
		const returns = {};
		root.find(".cx-wh").each(function () {
			returns[this.getAttribute("data-item")] = this.value;
		});
		const msg = BAG.materials.length
			? __("Return {0} material line(s) to the issue warehouses and CANCEL {1}?", [BAG.materials.length, BAG.name])
			: __("CANCEL {0}? The card closes for good.", [BAG.name]);
		frappe.confirm(msg, () =>
			frappe.call({ method: API + ".cancel_order_bag",
				args: { order_bag: BAG.name, returns: JSON.stringify(returns) } }).then((r) => {
				const moved = (r.message || {}).moved || [];
				frappe.show_alert({ message: moved.length
					? __("{0} cancelled — {1} line(s) returned.", [BAG.name, moved.length])
					: __("{0} cancelled.", [BAG.name]), indicator: "green" }, 5);
				BAG = null;
				root.find(".cx-scan").val("");
				root.find(".cx-body").html(`<div class="cx-ok" style="max-width:960px;">✓ ${__("{0} is CANCELLED.", [r.message.name])}
					${moved.map((m) => `<div style="font-weight:400;font-size:11.5px;color:var(--text-muted);">↩ ${esc(m.item)} · ${g3(m.qty)} → ${esc(m.warehouse)} (${esc(m.stock_entry || "")})</div>`).join("")}</div>`);
				focus();
			}));
	});

	// ------------------------------------------------------------- JO side
	function paintJO() {
		const j = JO;
		const open = j.bags.filter((b) => !b.skip);
		root.find(".cx-body").html(`
			<div class="cx-card" style="max-width:1100px;">
				<div class="cx-head">
					<span class="nm">${esc(j.job_order)}</span>
					<span class="kv">${__("customer")} <b>${esc((j.info || {}).customer || "—")}</b></span>
					<span class="kv">${__("ordered")} <b>${esc((j.info || {}).order_date || "—")}</b></span>
					<span class="kv">${__("salesman")} <b>${esc((j.info || {}).salesman || "—")}</b></span>
					<span class="kv"><b>${open.length}</b> ${__("open bag(s)")} / ${j.bags.length}</span>
				</div>
				<table class="cx-t"><thead><tr>
					<th>${__("Bag")}</th><th>${__("Design")}</th><th>${__("Qty")}</th><th>${__("Location")}</th>
					<th>${__("Status")}</th><th>${__("Holds")}</th>
				</tr></thead><tbody>
				${j.bags.map((b) => {
					const holds = (b.materials || []).map((m) => `${esc(m.item)} ${g3(m.qty)}`).join(", ");
					const bad = !b.skip && (b.blocker || (b.materials || []).length);
					return `<tr class="${bad ? "cx-bad" : ""}">
						<td><b>${esc(b.name)}</b></td><td>${esc(b.design || "")}</td><td>${b.qty || 1}</td>
						<td>${esc(b.location || "")}</td>
						<td><span class="cx-chip ${b.stock_status === "Cancelled" ? "cn" : b.stock_status === "In Production" ? "ip" : "ok"}">${esc(b.stock_status || "")}</span></td>
						<td>${b.blocker ? `<span style="color:#b02a2a;font-weight:700;">${esc(b.blocker)}</span>`
							: holds ? `<span style="color:#b35a00;font-weight:700;">${holds}</span>` : b.skip ? "" : "—"}</td>
					</tr>`;
				}).join("")}</tbody></table>
				<div style="margin-top:12px;">
				${!open.length ? `<div class="cx-block">${__("No open bags — nothing to cancel.")}</div>`
				: j.can_cancel ? `<button class="cx-btn cx-canceljo" style="background:#b02a2a;">${__("Cancel Job Order — {0} bag(s)", [open.length])}</button>`
				: `<div class="cx-block">⛔ ${__("Not possible to cancel this job order — the highlighted bag(s) still hold materials. Cancel those one by one on the ORDER BAG side (scan each, return the materials), then try again.")}</div>`}
				</div>
			</div>`);
		focus();
	}

	root.on("click", ".cx-canceljo", () => {
		if (!JO || !JO.can_cancel) return;
		frappe.confirm(__("CANCEL {0} and all its open bags? This closes them for good.", [JO.job_order]), () =>
			frappe.call({ method: API + ".cancel_job_order", args: { job_order: JO.job_order } }).then((r) => {
				const done = (r.message || {}).cancelled || [];
				frappe.show_alert({ message: __("{0} cancelled — {1} bag(s) closed.", [JO.job_order, done.length]), indicator: "green" }, 5);
				frappe.call({ method: API + ".get_cancel_job_order", args: { job_order: JO.job_order } }).then((r2) => {
					JO = r2.message;
					paintJO();
				});
			}));
	});

	focus();
};
