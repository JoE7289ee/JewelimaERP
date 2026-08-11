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
		.rp2-grid{display:grid;grid-template-columns:minmax(300px,380px) 1fr;gap:16px;align-items:start;}
		@media (max-width:900px){.rp2-grid{grid-template-columns:1fr;}}
		.rp2-card{border:1px solid var(--border-color);border-radius:10px;background:var(--fg-color);padding:14px 18px;}
		.rp2-card h4{margin:0 0 10px;font-size:14px;}
		.rp2-card .control-label{font-size:11px;color:var(--text-muted);}
		.rp2-meta{font-size:12.5px;color:var(--text-muted);margin:8px 0;}
		.rp2-meta b{color:var(--text-color);}
		.rp2-tbl{border-collapse:collapse;font-size:12.5px;}
		.rp2-tbl th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);padding:3px 6px;white-space:nowrap;}
		.rp2-tbl td{padding:2px 6px;white-space:nowrap;}
		.rp2-tbl input.qty{width:74px;border:1px solid var(--border-color);border-radius:6px;padding:4px 7px;
			background:var(--control-bg);font-variant-numeric:tabular-nums;text-align:right;}
		.rp2-x{color:#b02a2a;cursor:pointer;font-weight:800;padding:0 6px;}
		.rp2-tbl input.pcs{width:58px;border:1px solid var(--border-color);border-radius:6px;padding:4px 7px;
			background:var(--control-bg);font-variant-numeric:tabular-nums;text-align:right;}
		.rp2-tbl td.qc-auto input.pcs{background:#e8f5e9;border-color:#2e7d32;}
		.rp2-tbl td.qc-man input.pcs{background:#fff3cd;border-color:#e0a800;}
		.rp2-avg{color:var(--text-muted);font-size:11.5px;white-space:nowrap;}
		.rp2-sieves{border:1px solid var(--border-color);border-radius:8px;overflow:auto;
			max-height:calc(100vh - 200px);}
		.rp2-sieves .rp2-tbl{width:100%;}
		.rp2-sieves .rp2-tbl th{position:sticky;top:0;background:var(--control-bg);z-index:1;}
		.rp2-bal{margin:10px 0;font-size:13px;font-weight:700;}
		.rp2-bal.ok{color:#2e7d32;} .rp2-bal.bad{color:#b02a2a;}
		.rp2-go{background:#2e7d32;border:none;color:#fff;font-weight:800;letter-spacing:.4px;
			padding:10px 28px;border-radius:8px;font-size:14px;cursor:pointer;}
		.rp2-go:disabled{opacity:.4;cursor:default;}
		.rp2-list{margin-top:18px;}
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
				<div class="rp2-bal"></div>
				<div class="rp2-remarks"></div>
				<button class="rp2-go" disabled style="margin-top:10px;width:100%;">${__("PLACE REQUEST")}</button>
			</div>
			<div class="rp2-card">
				<h4>${__("Split into")}</h4>
				<div class="rp2-addrow" style="display:flex;gap:8px;align-items:end;margin-bottom:8px;">
					<div class="rp2-tgroup" style="flex:1;display:none;"></div>
				</div>
				<div class="rp2-sieves"></div>
			</div>
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
		get_query: () => ({ query: "jewelima.jewelima.api.stone_item_search", filters: { stone_only: 1 } }),
		onchange: () => onSource() });
	const qty = mk(".rp2-qty", { fieldtype: "Float", label: __("Qty being repacked (ct) — auto from the split"), fieldname: "q",
		read_only: 1 });
	const tgroup = mk(".rp2-tgroup", { fieldtype: "Select", label: __("Split into quality"), fieldname: "tg",
		onchange: () => loadSieves() });
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
			if (CTX.family === "DIAMOND") {
				// pick the quality first — then that quality's sieves list
				root.find(".rp2-tgroup").show();
				tgroup.df.options = [""].concat(CTX.target_groups || []).join("\n");
				tgroup.refresh();
				tgroup.set_value("");
			} else {
				root.find(".rp2-tgroup").hide();
				loadSieves();
			}
			balance();
		});
	}

	// the WHOLE family sieve run appears automatically; weights typed in,
	// piece counts judged from the chart average (editable — green while
	// auto, yellow once hand-changed)
	function loadSieves() {
		const it = src.get_value();
		if (!it) return;
		const g = CTX.family === "DIAMOND" ? tgroup.get_value() : null;
		if (CTX.family === "DIAMOND" && !g) { TARGETS = []; paintTargets(); return; }
		frappe.call({ method: API + ".get_repack_sieves", args: { source_item: it, target_group: g } })
			.then((r) => {
				const m = r.message || {};
				TARGETS = (m.items || []).map((x) => ({ item: x.item, label: x.label, avg: x.avg, qty: 0, pcs: 0, manual: false }));
				paintTargets();
			});
	}

	function paintTargets() {
		const row = (t, i) => `<tr>
			<td>${esc(t.label || t.item)}</td>
			<td class="rp2-avg">${t.avg ? t.avg.toFixed(4) : "—"}</td>
			<td style="text-align:right"><input class="qty" type="number" step="0.001" data-i="${i}" value="${t.qty || ""}"></td>
			<td style="text-align:right" class="${t.qty > 0 ? (t.manual ? "qc-man" : "qc-auto") : ""}">
				<input class="pcs" type="number" step="1" data-i="${i}" value="${t.pcs || ""}"></td>
		</tr>`;
		if (!TARGETS.length) {
			root.find(".rp2-sieves").html(`<div style="color:var(--text-muted);padding:14px 8px;">${__("Pick a source (and quality) — its sieve run appears here.")}</div>`);
			return balance();
		}
		// ONE table, box runs to the bottom of the screen and scrolls inside
		root.find(".rp2-sieves").html(`<table class="rp2-tbl"><thead><tr>
			<th>${__("Sieve")}</th><th class="rp2-avg">${__("Avg ct/pc")}</th>
			<th style="text-align:right">${__("Weight (ct)")}</th><th style="text-align:right">${__("Qty (pcs)")}</th>
		</tr></thead><tbody>${TARGETS.map((t, i) => row(t, i)).join("")}</tbody></table>`);
		balance();
	}

	root.on("input", ".rp2-tbl input.qty", function () {
		const t = TARGETS[Number(this.dataset.i)];
		t.qty = Number(this.value) || 0;
		// carats entered -> pieces judged by the group average (until hand-edited)
		if (!t.manual) t.pcs = t.avg && t.qty > 0 ? Math.max(1, Math.round(t.qty / t.avg)) : 0;
		const $tr = $(this).closest("tr");
		$tr.find("input.pcs").val(t.pcs || "");
		$tr.find("td").eq(3).attr("class", t.qty > 0 ? (t.manual ? "qc-man" : "qc-auto") : "");
		balance();
	});
	root.on("input", ".rp2-tbl input.pcs", function () {
		const t = TARGETS[Number(this.dataset.i)];
		t.pcs = Number(this.value) || 0;
		t.manual = true; // hand count beats the average -> yellow
		// count entered -> weight (ct) filled by the group average (pcs × avg)
		if (t.avg && t.pcs > 0) {
			t.qty = Number((t.pcs * t.avg).toFixed(3));
			$(this).closest("tr").find("input.qty").val(t.qty || "");
		}
		$(this).closest("td").attr("class", t.qty > 0 ? "qc-man" : "");
		balance();
	});

	function balance() {
		const sum = TARGETS.reduce((a, t) => a + (t.qty || 0), 0);
		const lines = TARGETS.filter((t) => t.qty > 0).length;
		qty.set_value(sum ? Number(sum.toFixed(3)) : "");
		const avail = CTX.available || 0;
		const over = sum > avail + 0.0005;
		const ok = sum > 0 && lines > 0 && !over && !!src.get_value();
		const srcName = src.get_value() || "";
		root.find(".rp2-bal")
			.toggleClass("ok", ok).toggleClass("bad", !ok && sum > 0)
			.html(!srcName ? "" : over
				? __("Split {0} ct — only {1} ct available at Stone Issue", [sum.toFixed(3), avail.toFixed(3)])
				: sum
					? __("Repacking <b>{0} ct</b> ✓ &nbsp;·&nbsp; left in {1}: <b>{2} ct</b>", [sum.toFixed(3), frappe.utils.escape_html(srcName), (avail - sum).toFixed(3)])
					: __("Available: <b>{0} ct</b> — type the weights on the right", [avail.toFixed(3)]));
		root.find(".rp2-go").prop("disabled", !ok);
	}

	root.find(".rp2-go").on("click", () => {
		frappe.confirm(__("Place a repack request for <b>{0} ct</b> of <b>{1}</b> into {2} line(s)?<br>It only moves after approval.",
			[Number(qty.get_value()).toFixed(3), esc(src.get_value()), TARGETS.filter((t) => t.qty > 0).length]), () => {
			frappe.call({ method: API + ".create_repack_request", args: {
				source_item: src.get_value(), qty: qty.get_value(),
				targets: JSON.stringify(TARGETS.filter((t) => t.qty > 0).map((t) => ({ item: t.item, qty: t.qty, pcs: t.pcs }))),
				remarks: remarks.get_value() || null,
			} }).then((r) => {
				frappe.show_alert({ message: __("Request {0} placed — awaiting approval.", [(r.message || {}).name]), indicator: "green" }, 4);
				qty.set_value(""); remarks.set_value("");
				loadSieves();
			});
		});
	});

	frappe.call({ method: API + ".get_repack_context" }).then((r) => { CTX = r.message || CTX; });
	// approvals live on their own desk now — this page only PLACES requests
	page.add_inner_button(__("Requests"), () => frappe.set_route("repack-requests"));
	page.set_primary_action(__("Refresh"), () => onSource(), "refresh");
};
