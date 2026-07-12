// Copyright (c) 2026, efeone and contributors
// Shared Jewelima print branding — a letterhead-style header (logo + contact) and a clean
// footer reused by every custom printout. Loaded app-wide via app_include_js.

import "./order_page"; // jewelima.buildOrderPage — shared by place-order + order-requests
import "./finished_matrix"; // jewelima.buildFinishedMatrix — shared by finished-stock + at-certification

frappe.provide("jewelima");

// small inline icons (lucide-style) for the contact line
jewelima._icons = {
	phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
	pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
	web: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
	mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>',
};

// Neutral print CSS (a fresh print window has no app styles, so keep it self-contained).
jewelima.print_css = `
body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,sans-serif;color:#1a1a1a;}
.jw-phead{display:flex;justify-content:space-between;align-items:center;gap:24px;border-bottom:1.5px solid #111;padding-bottom:10px;margin-bottom:2px;}
.jw-plogo{height:56px;width:auto;display:block;}
.jw-pco{font-size:20px;font-weight:800;letter-spacing:.5px;}
.jw-pcontact{display:flex;align-items:center;gap:13px;font-size:11px;color:#333;flex-wrap:wrap;justify-content:flex-end;}
.jw-ci{display:flex;align-items:center;gap:5px;}
.jw-ci svg{width:13px;height:13px;flex:0 0 auto;color:#111;}
.jw-sep{color:#cfd4da;font-weight:300;}
.jw-ptitle{font-size:12px;font-weight:700;color:#6b7785;text-transform:uppercase;letter-spacing:.09em;margin:8px 0 12px;}
.jw-pfoot{margin-top:16px;padding-top:6px;border-top:1px solid #e2e6ea;font-size:10px;color:#9aa6b2;display:flex;justify-content:space-between;align-items:center;}
.jw-pfoot .jw-fbrand{font-style:italic;letter-spacing:.3px;}
@media print{.jw-phead,.jw-ci svg{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
`;

// Letterhead header. `b` = the get_print_branding() payload.
jewelima.print_header = function (b, title) {
	b = b || {};
	const esc = frappe.utils.escape_html;
	const I = jewelima._icons;
	const logo = b.logo_url
		? `<img class="jw-plogo" src="${window.location.origin}${b.logo_url}" alt="${esc(b.company || "Jewelima")}">`
		: `<div class="jw-pco">${esc(b.company || "Jewelima")}</div>`;

	const items = [];
	if (b.phone) items.push(`<span class="jw-ci">${I.phone}${esc(b.phone)}</span>`);
	if (b.address) items.push(`<span class="jw-ci">${I.pin}${esc(b.address)}</span>`);
	if (b.website) items.push(`<span class="jw-ci">${I.web}${esc(b.website)}</span>`);
	else if (b.email) items.push(`<span class="jw-ci">${I.mail}${esc(b.email)}</span>`);
	const contact = items.join('<span class="jw-sep">|</span>');

	return `<div class="jw-phead"><div>${logo}</div>${contact ? `<div class="jw-pcontact">${contact}</div>` : ""}</div>
		${title ? `<div class="jw-ptitle">${esc(title)}</div>` : ""}`;
};

jewelima.print_footer = function (b) {
	b = b || {};
	const esc = frappe.utils.escape_html;
	const co = esc(b.company || "Jewelima Diamonds");
	const extra = b.gstin ? " &middot; GSTIN: " + esc(b.gstin) : "";
	return `<div class="jw-pfoot">
		<span class="jw-fbrand">${co} — Crafting for You${extra}</span>
		<span>Printed ${frappe.datetime.str_to_user(frappe.datetime.now_datetime())}</span>
	</div>`;
};

// Open a clean, branded print window. `bodyHTML` = the page-specific content;
// `extraCss` = any page-specific styles.
jewelima.print_window = function (branding, title, bodyHTML, extraCss) {
	const w = window.open("", "_blank", "width=820,height=960");
	w.document.write(
		`<html><head><title>${frappe.utils.escape_html(title || "Jewelima")}</title>` +
		`<style>body{padding:16px;}${jewelima.print_css}${extraCss || ""}</style></head><body>` +
		jewelima.print_header(branding, title) + bodyHTML + jewelima.print_footer(branding) +
		`</body></html>`
	);
	w.document.close();
	w.focus();
	setTimeout(() => w.print(), 350);
};

// ---------------------------------------------------------------------------
// Reset-on-return for the Jewelima functional pages.
//
// Frappe builds a custom desk page ONCE (on_page_load) and merely re-shows it on
// later visits, so half-filled forms linger. Rule here: ROUTE AWAY and come back
// -> the page rebuilds fresh. Staying on the page (kept open in a tab, switching
// browser tabs/windows, reloads) never resets — only in-app navigation does.
// ---------------------------------------------------------------------------
(() => {
	const RESET_PAGES = new Set([
		"place-order", "purchase-raw-material", "melt-gold", "job-work", "assign-collect",
		"bag-split", "transfer-order-bag", "print-barcode", "weight-add", "weight-reduce",
		"stock-transfer", "make-products", "finished-items", "card-info", "job-order-status",
		"add-design", "retire-design", "design-gallery", "design-tags", "design-types",
		"order-masters", "warehouse-management", "print-order-bags", "order-bag-photos",
		"cad-jobs", "make-tree", "raw-materials", "stone-buckets", "party-stock", "party-metal", "order-requests", "all-requests", "gold-casting", "stock-analysis", "casting-queue", "casting-weigh", "in-bags", "import-stock", "finished-stock", "at-certification", "certify", "certification-out", "transfer-holder", "sell", "parties", "loss-report",
		"employee-performance", "item-stock",
	]);
	let last = null;

	function onRouteChange() {
		const cur = (frappe.get_route() || [])[0];
		if (last && last !== cur && RESET_PAGES.has(last) && frappe.pages[last]) {
			frappe.pages[last].__jw_stale = true; // left a functional page — rebuild on return
		}
		if (cur && RESET_PAGES.has(cur)) {
			const pg = frappe.pages[cur];
			if (pg && pg.__jw_stale && pg.on_page_load) {
				pg.__jw_stale = false;
				const wrapper = document.getElementById("page-" + cur);
				if (wrapper) {
					$(wrapper).empty();
					pg.on_page_load(wrapper);
				}
			}
		}
		last = cur;
	}

	function attach() {
		if (frappe.router && frappe.router.on) {
			last = (frappe.get_route() || [])[0];
			frappe.router.on("change", onRouteChange);
		}
	}
	if (window.frappe && frappe.router && frappe.router.on) attach();
	else $(document).on("app_ready", attach);
})();

// ---------------------------------------------------------------------------
// Sidebar: always load with only the section titles showing. Frappe persists
// each section's last open/closed state in localStorage and applies it AFTER
// keep_closed, so a reload re-opens whatever was left open — purge OUR
// workspace's entry every time the sidebar builds so keep_closed governs.
// (Fires before the items render; other workspaces keep their memory.)
// ---------------------------------------------------------------------------
// NOTE: sections use keep_closed so a FRESH browser starts with titles only,
// but the user's own open/closed choices persist across reloads (frappe's
// section-breaks-state). An earlier purge of that state snapped every section
// shut on each refresh — "the items keep going missing" — so it is gone.

// ---------------------------------------------------------------------------
// Sidebar: sub-group headers (Records, Order Setup, …) are DATA-siblings of
// their parent section, so core leaves them visible when the section is
// closed — orphan headers floating between closed titles. Hide every
// sub-section whose governing top section is collapsed. Jewelima sidebar only.
// ---------------------------------------------------------------------------
(() => {
	// core's sidebar render is fragile: prepare() swallows exceptions and a failed
	// pass leaves section headers with open carets and NO items ("the lines go
	// missing"). The boot data stays intact, so: realign any caret/content
	// mismatch, and if sections rendered without children, rebuild once.
	let _rebuilds = 0, _lastRebuild = 0;
	function sync() {
		document.querySelectorAll('[data-title="Jewelima"]').forEach((sb) => {
			if (sb.offsetParent === null) return;
			let closed = false, emptySections = 0;
			sb.querySelectorAll(".sidebar-item-container.section-item").forEach((el) => {
				const isSub = el.querySelector(":scope > .standard-sidebar-item.indent");
				const di = el.querySelector(".drop-icon");
				const nested = el.querySelector(":scope > .nested-container");
				if (di && nested) {
					// caret and content must agree — a broken render leaves them apart
					nested.classList.toggle("hidden", di.getAttribute("data-state") === "closed");
				}
				if (!isSub) {
					closed = !!di && di.getAttribute("data-state") === "closed";
					if (nested && nested.children.length === 0) emptySections++;
					return;
				}
				el.classList.toggle("hidden", closed);
			});
			if (emptySections >= 2 && _rebuilds < 3 && Date.now() - _lastRebuild > 5000
				&& frappe.app && frappe.app.sidebar && frappe.app.sidebar.make_sidebar) {
				_rebuilds++;
				_lastRebuild = Date.now();
				console.warn("[jewelima] sidebar rendered without items — rebuilding");
				try { frappe.app.sidebar.make_sidebar(); } catch (e) { /* keep the page alive */ }
				setTimeout(sync, 80);
				setTimeout(sync, 500);
			}
		});
	}
	// the Setup section holds only sub-groups; core refuses to render a section
	// with no direct links, so the JSON gives it an invisible Spacer child — hide
	// the blank row it produces (label-less container inside our sidebar)
	$("<style>").text('[data-title="Jewelima"] .nested-container .sidebar-item-container[title=""]{display:none;}').appendTo("head");
	const later = () => {
		setTimeout(orphanNet, 0);
		setTimeout(sync, 0);
		setTimeout(sync, 300);
		setTimeout(sync, 900); // late pass — saved open-states apply during render
	};
	// pages reached by BUTTON only (no sidebar link) can't be mapped to a
	// workspace by core's resolver — a deep link or reload renders a NULL
	// sidebar. Pre-seed core's own remembered-choice map, plus a direct net.
	const ORPHAN_ROUTES = ["casting-weigh"];
	try {
		const m = JSON.parse(localStorage.getItem("sidebar_item_map") || "{}");
		let dirty = false;
		ORPHAN_ROUTES.forEach((r) => {
			if (!(m[r] || [])[0]) { m[r] = ["Jewelima"]; dirty = true; }
		});
		if (dirty) localStorage.setItem("sidebar_item_map", JSON.stringify(m));
	} catch (e) { /* storage unavailable — the net below still covers it */ }
	function orphanNet() {
		const r = (frappe.get_route() || [])[0];
		if (ORPHAN_ROUTES.includes(r) && frappe.app && frappe.app.sidebar
			&& frappe.app.sidebar.sidebar_title !== "Jewelima") {
			try { frappe.app.sidebar.setup("Jewelima"); } catch (e) { /* noop */ }
		}
	}

	// frappe's own per-section state save CLOBBERS the map (each section holds a
	// stale build-time copy, so the last click wins and every other section snaps
	// shut on reload). After every toggle, write the COMPLETE truthful state from
	// the DOM — sections AND sub-groups, keyed by their (unique) titles.
	function saveAll() {
		const sb = [...document.querySelectorAll('[data-title="Jewelima"]')].find((x) => x.offsetParent);
		if (!sb) return;
		try {
			const st = JSON.parse(localStorage.getItem("section-breaks-state") || "{}");
			const m = {};
			sb.querySelectorAll(".sidebar-item-container.section-item").forEach((el) => {
				const di = el.querySelector(".drop-icon");
				const t = el.getAttribute("title");
				if (di && t) m[t] = di.getAttribute("data-state") === "closed";
			});
			st.jewelima = m;
			localStorage.setItem("section-breaks-state", JSON.stringify(st));
		} catch (e) {
			/* never break the sidebar over storage */
		}
	}
	$(document).on("sidebar_setup sidebar-expand", later);
	$(document).on("app_ready", () => frappe.router && frappe.router.on && frappe.router.on("change", later));
	$(document).on("click", ".body-sidebar .standard-sidebar-item", () => {
		later();
		setTimeout(saveAll, 80);
	});
	$(document).on("app_ready", later);
	later();
})();

// ---------------------------------------------------------------------------
// jewelima.finalize_cad(order_bag, done) — the "CAD done" dialog.
// Creates the REAL design from the bag's CAD targets (prefilled gold row at the
// budget), attaches it to the bag + same-target siblings, clears is_cad.
// Shared by Assign/Collect (collect gate) and the CAD Jobs page.
// ---------------------------------------------------------------------------
frappe.provide("jewelima");
jewelima.finalize_cad = function (order_bag, done) {
	frappe.call({ method: "jewelima.jewelima.api.get_cad_bag_info", args: { order_bag } }).then((r) => {
		const info = r.message || {};
		if (!info.is_cad) return frappe.msgprint(__("{0} is not awaiting a CAD design.", [order_bag]));
		const esc = frappe.utils.escape_html;

		function itemChanged() {
			const row = this.doc || (this.grid_row && this.grid_row.doc);
			if (!row) return;
			if (!row.item) { row.purity = 0; row.uom = ""; row.pure = 0; row.stone_type = ""; d.fields_dict.materials.grid.refresh(); return; }
			frappe.db.get_value("Item", row.item, ["purity_percentage", "weight_unit", "stone_type"]).then((res) => {
				const v = res.message || {};
				row.purity = flt(v.purity_percentage); row.uom = v.weight_unit || ""; row.stone_type = v.stone_type || "";
				if (!v.stone_type) row.qty = 0;
				row.pure = v.stone_type ? 0 : (flt(row.weight) * flt(row.purity)) / 100;
				d.fields_dict.materials.grid.refresh();
			});
		}
		function weightChanged() {
			const row = this.doc || (this.grid_row && this.grid_row.doc);
			if (!row) return;
			row.pure = row.stone_type ? 0 : (flt(row.weight) * flt(row.purity)) / 100;
			d.fields_dict.materials.grid.refresh();
		}

		const d = new frappe.ui.Dialog({
			title: __("Finalize CAD design — {0}", [esc(order_bag)]),
			size: "large",
			fields: [
				{ fieldname: "budget", fieldtype: "HTML" },
				{ fieldname: "design_name", fieldtype: "Data", label: __("Design Name"), reqd: 1 },
				{ fieldname: "name_tools", fieldtype: "HTML" },
				{ fieldname: "cb1", fieldtype: "Column Break" },
				{ fieldname: "design_style", fieldtype: "Link", label: __("Design Style"), options: "Design Style", default: "General" },
				{ fieldname: "sb_img", fieldtype: "Section Break" },
				{
					fieldname: "image", fieldtype: "Attach Image", label: __("Design Image"),
					onchange() {
						const url = d.get_value("image");
						d.fields_dict.image_preview.$wrapper.html(url
							? `<div style="text-align:center;margin:4px 0 8px;"><img src="${encodeURI(url)}" style="max-height:200px;max-width:100%;border-radius:8px;border:1px solid var(--border-color);" onerror="this.closest('div').style.display='none'"></div>`
							: "");
					},
				},
				{ fieldname: "image_preview", fieldtype: "HTML" },
				{ fieldname: "sb_bom", fieldtype: "Section Break", label: __("Bill of Materials") },
				{
					fieldname: "materials", fieldtype: "Table", label: __("Materials"), reqd: 1, options: "Design BOM Item", data: [],
					description: __("Gold row prefilled from the CAD budget — adjust to what CAD actually produced; add the stone rows."),
					fields: [
						{ fieldname: "item", fieldtype: "Link", options: "Item", label: __("Material"), in_list_view: 1, columns: 3, reqd: 1, get_query: () => ({ filters: { is_sales_item: 0, is_stock_item: 1 } }), onchange: itemChanged },
						{ fieldname: "purity", fieldtype: "Float", label: __("Purity %"), read_only: 1, in_list_view: 1, columns: 1 },
						{ fieldname: "uom", fieldtype: "Data", label: __("UOM"), read_only: 1, in_list_view: 1, columns: 1 },
						{ fieldname: "qty", fieldtype: "Float", label: __("Qty"), in_list_view: 1, columns: 1, mandatory_depends_on: "eval:doc.stone_type", read_only_depends_on: "eval:!doc.stone_type" },
						{ fieldname: "weight", fieldtype: "Float", label: __("Weight"), in_list_view: 1, columns: 1, reqd: 1, onchange: weightChanged },
						{ fieldname: "pure", fieldtype: "Float", label: __("Pure (g)"), read_only: 1, in_list_view: 1, columns: 1 },
					],
				},
				...(info.siblings && info.siblings.length
					? [{ fieldname: "apply_to_siblings", fieldtype: "Check", label: __("Also attach to {0} twin bag(s): {1}", [info.siblings.length, info.siblings.join(", ")]), default: 1 }]
					: []),
			],
			primary_action_label: __("Create & Attach"),
			primary_action(values) {
				const raw = (values.materials || []).filter((m) => m.item);
				if (!raw.length) return frappe.msgprint(__("Add at least one material."));
				const bad = raw.find((m) => (m.stone_type ? (flt(m.qty) <= 0 || flt(m.weight) <= 0) : flt(m.weight) <= 0));
				if (bad) return frappe.msgprint(bad.stone_type ? __("{0} is a stone — enter both a Qty and a Weight.", [bad.item]) : __("{0} needs a Weight (grams).", [bad.item]));
				const materials = raw.map((m) => ({ item: m.item, qty: m.stone_type ? (flt(m.qty) || 0) : 0, weight: flt(m.weight) || 0 }));
				frappe.dom.freeze(__("Creating design…"));
				frappe.call({
					method: "jewelima.jewelima.api.finalize_cad_design",
					args: {
						order_bag, design_name: values.design_name, design_style: values.design_style,
						image: values.image, materials: JSON.stringify(materials),
						apply_to_siblings: values.apply_to_siblings == null ? 1 : values.apply_to_siblings,
					},
				}).then((res) => {
					frappe.dom.unfreeze();
					const m = res.message || {};
					if (!m.design) return;
					d.hide();
					frappe.show_alert({ message: __("Design {0} created & attached to {1} bag(s).", [m.design, (m.bags || []).length]), indicator: "green" }, 7);
					if (done) done(m);
				}).catch(() => frappe.dom.unfreeze());
			},
		});

		d.fields_dict.budget.$wrapper.html(`
			<div style="border:1px solid var(--border-color);border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:12.5px;color:var(--text-muted);">
				<b style="color:var(--text-color)">CAD budget</b> — ${esc(info.cad_design_type || "—")} · size ${esc(info.size || "—")} · qty ${info.qty || 1}
				&nbsp;·&nbsp; ${esc(info.cad_karat || "—")} <b style="color:var(--text-color)">${esc(info.cad_gold_weight || "—")}</b>
				&nbsp;·&nbsp; DMD <b style="color:var(--text-color)">${flt(info.cad_diamond_weight).toFixed(2)} ct</b>${info.cad_stone_no ? " / " + info.cad_stone_no + " pcs" : ""}
				${info.cad_remarks ? `<div style="margin-top:4px;">${esc(info.cad_remarks)}</div>` : ""}
			</div>`);

		// Check / Auto-number helpers for the new design name
		d.fields_dict.name_tools.$wrapper.html(`
			<div style="margin:-6px 0 8px;display:flex;gap:6px;">
				<button class="btn btn-xs btn-default fc-check">✓ Check</button>
				<button class="btn btn-xs btn-default fc-auto" title="Type a prefix (A, BA…) first — fills the next unused number">⚙ Auto-number</button>
				<span class="fc-msg" style="font-size:12px;align-self:center;"></span>
			</div>`);
		const $msg = d.fields_dict.name_tools.$wrapper.find(".fc-msg");
		d.fields_dict.name_tools.$wrapper.find(".fc-check").on("click", () => {
			const v = (d.get_value("design_name") || "").trim();
			if (!v) return $msg.css("color", "#9a6700").text(__("Type a name first."));
			frappe.db.exists("Design", v).then((ex) => {
				$msg.css("color", ex ? "#b00020" : "#1d7a33").text(ex ? __("✗ already exists") : __("✓ available"));
			});
		});
		d.fields_dict.name_tools.$wrapper.find(".fc-auto").on("click", () => {
			frappe.call({ method: "jewelima.jewelima.design_bank_api.next_design_no", args: { prefix: d.get_value("design_name") || "" } }).then((res) => {
				const nm = (res.message || {}).design_no;
				if (nm) { d.set_value("design_name", nm); $msg.css("color", "#1d7a33").text(__("✓ {0} — never used", [nm])); }
			});
		});

		d.show();
		// prefill the gold row from the budget
		if (info.cad_karat) {
			frappe.db.get_value("Item", info.cad_karat, "purity_percentage").then((res) => {
				const pur = flt(((res || {}).message || {}).purity_percentage);
				const grid = d.fields_dict.materials.grid;
				grid.df.data = [{
					idx: 1, name: "cad-gold-1", item: info.cad_karat, purity: pur, uom: "Gram",
					stone_type: "", qty: 0, weight: flt(info.cad_gold_weight),
					pure: (flt(info.cad_gold_weight) * pur) / 100,
				}];
				grid.refresh();
			});
		}
	});
};
