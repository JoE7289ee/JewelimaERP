// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Place Order — a pure-JS order-entry screen (no doctype form behind it).
// Header (Order No / Customer / Order Date / Due Date) on top, a full-width
// grid of Order Bag lines below. Picking an item AJAX-fetches its stone profile
// (DMD/PS/CS counts from the item's BOM) and fills the line. "Place Order"
// creates the Job Order header + one Order Bag per filled line.
// Route: /app/place-order

const PO_SIZES = ["-2.2/16", "2.0/16", "NA"];

const PO_COLUMNS = [
	{ key: "design", label: "Design", type: "link", options: "Design", width: "220px" },
	{ key: "qty", label: "Qty", type: "int", width: "60px" },
	{ key: "size", label: "Size", type: "select", options: PO_SIZES, width: "90px" },
	{ key: "design_type", label: "Type", type: "ro", width: "120px" },
	{ key: "gross_weight", label: "Gross (g)", type: "ro", width: "85px" },
	{ key: "nett_weight", label: "Nett (g)", type: "ro", width: "85px" },
	{ key: "purity", label: "Purity %", type: "ro", width: "75px" },
	{ key: "pure", label: "Pure (g)", type: "ro", width: "80px" },
	{ key: "dmd", label: "DMD (no/ct)", type: "stone", no: "dmd_no", wt: "dmd_weight", width: "105px" },
	{ key: "ps", label: "PS (no/ct)", type: "stone", no: "ps_no", wt: "ps_weight", width: "105px" },
	{ key: "cs", label: "CS (no/ct)", type: "stone", no: "cs_no", wt: "cs_weight", width: "105px" },
];

frappe.pages["place-order"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Place Order", single_column: true });
	const state = { rows: [], header: {} };

	$(page.main).append(`
		<style>
		.po-wrap{display:flex;flex-direction:column;height:calc(100vh - 95px);}
		.po-head{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:2px 10px;margin:2px 0 6px;}
		.po-head .frappe-control{margin:0;}
		.po-head .control-label{font-size:11px;margin:0 0 1px;color:var(--text-muted);}
		.po-head .control-input-wrapper .control-input,.po-head .control-input input,.po-head .control-value{min-height:26px;height:26px;line-height:24px;font-size:12px;}
		.po-head .help-box,.po-head .description,.po-head p.help-box{display:none !important;}
		.po-due{font-size:11px;color:var(--text-muted);margin:1px 0 0 2px;white-space:nowrap;}
		.po-gridbox{flex:1 1 auto;overflow:auto;border:1px solid var(--border-color);border-radius:8px;}
		table.po-grid{width:100%;border-collapse:separate;border-spacing:0;font-size:12px;background:var(--fg-color);}
		table.po-grid th{position:sticky;top:0;z-index:2;background:var(--control-bg, var(--fg-color));
			border-right:1px solid var(--border-color);border-bottom:1px solid var(--gray-400, #aeb6bf);padding:3px 6px;text-align:left;white-space:nowrap;font-weight:700;}
		table.po-grid td{border-right:1px solid var(--border-color);border-bottom:1px solid var(--border-color);padding:0 2px;vertical-align:middle;background:var(--fg-color);height:30px;}
		table.po-grid td.po-num{color:var(--text-muted);text-align:center;width:30px;background:var(--control-bg);}
		table.po-grid tfoot td{position:sticky;bottom:0;z-index:2;background:var(--control-bg, var(--fg-color));border-top:2px solid var(--gray-400, #aeb6bf);border-right:1px solid var(--border-color);font-weight:700;padding:3px 6px;text-align:right;white-space:nowrap;}
		table.po-grid tfoot td.po-foot-label{text-align:left;}
		table.po-grid input,table.po-grid select{width:100%;border:1px solid var(--gray-400, #aeb6bf);background:var(--fg-color);
			padding:1px 4px;font-size:12px;color:var(--text-color);border-radius:3px;height:26px;line-height:1.1;box-sizing:border-box;}
		table.po-grid input:focus,table.po-grid select:focus{box-shadow:inset 0 0 0 1px var(--primary);outline:none;}
		table.po-grid .frappe-control,table.po-grid .frappe-control .form-group{margin:0;}
		table.po-grid .frappe-control .help-box,table.po-grid .frappe-control .description,table.po-grid .frappe-control .control-label{display:none !important;}
		table.po-grid .frappe-control .control-input-wrapper,table.po-grid .frappe-control .control-input{margin:0;padding:0;min-height:0;}
		table.po-grid .frappe-control .control-input input{border:1px solid var(--gray-400, #aeb6bf);background:var(--fg-color);padding:1px 4px;height:26px;min-height:26px;line-height:1.1;box-sizing:border-box;border-radius:3px;}
		table.po-grid .frappe-control .link-btn{display:none !important;} /* no jump-to-record arrow; info is via the Design button */
		table.po-grid td.po-ro{padding:0 8px;text-align:right;white-space:nowrap;color:var(--text-color);font-variant-numeric:tabular-nums;}
		table.po-grid td.po-act{text-align:center;padding:0 4px;}
		table.po-grid td.po-act .btn{padding:1px 7px;font-size:11px;height:24px;line-height:1;margin:0 1px;}
		table.po-grid td.po-act .btn:disabled{opacity:.4;cursor:not-allowed;}
		table.po-grid td.po-act .btn.po-new.ready{background:#b00020;border-color:#b00020;color:#fff;font-weight:600;}
		.po-foot{margin-top:1px;color:var(--text-muted);font-size:12px;}
		</style>
		<div class="po-wrap">
			<div class="po-head">
				<div class="po-h-orderno"></div><div class="po-h-customer"></div><div class="po-h-salesman"></div><div class="po-h-ordertype"></div>
				<div class="po-h-orderdate"></div><div class="po-h-days"></div><div class="po-h-custdays"></div>
			</div>
			<div class="po-gridbox">
				<table class="po-grid"><thead><tr class="po-headrow"></tr></thead><tbody class="po-body"></tbody><tfoot><tr class="po-footrow"></tr></tfoot></table>
			</div>
			<div class="po-foot"><span class="po-count">0</span> line(s). Empty lines are ignored. Picking a design pulls its BOM — <b>Materials</b> edits a line's BOM, <b>Reset</b> restores it.</div>
		</div>
	`);

	const mk = (sel, df) => {
		const c = frappe.ui.form.make_control({ df, parent: $(page.main).find(sel).get(0), render_input: true });
		c.refresh();
		return c;
	};
	state.header.order_no = mk(".po-h-orderno", {
		fieldtype: "Data", label: "Job Order No", fieldname: "order_no", read_only: 1,
		description: "Auto-assigned (E####) when you place the order.",
	});
	state.header.customer = mk(".po-h-customer", { fieldtype: "Link", label: "Customer", fieldname: "customer", options: "Customer" });
	state.header.salesman = mk(".po-h-salesman", { fieldtype: "Link", label: "Salesman", fieldname: "salesman", options: "Sales Person", get_query: () => ({ filters: { is_group: 0, enabled: 1 } }) });
	state.header.order_type = mk(".po-h-ordertype", { fieldtype: "Link", label: "Type", fieldname: "order_type", options: "Order Type", get_query: () => ({ filters: { disabled: 0 } }) });
	state.header.order_date = mk(".po-h-orderdate", { fieldtype: "Date", label: "Order Date", fieldname: "order_date", read_only: 1 });
	state.header.days = mk(".po-h-days", {
		fieldtype: "Int", label: "Days (Due Date)", fieldname: "days",
		description: "Due date = today + N days.",
	});
	state.header.cust_days = mk(".po-h-custdays", {
		fieldtype: "Int", label: "Days (Customer Date)", fieldname: "cust_days",
		description: "Date promised to the customer — empty copies the Due Date.",
	});
	state.header.order_date.set_value(frappe.datetime.get_today());
	$(page.main).find(".po-h-days").append('<div class="po-due"></div>');
	$(page.main).find(".po-h-custdays").append('<div class="po-due po-custdue"></div>');

	// Order Date is fixed to today (read-only). Days is the lead time; the Due Date
	// (today + Days) is derived — shown live under Days and computed when placing the order.
	// Customer Date works the same off its own Days; left empty it copies the Due Date.
	const dueFromDays = () => {
		const n = cint(state.header.days.get_value());
		return n > 0 ? frappe.datetime.add_days(frappe.datetime.get_today(), n) : "";
	};
	const custFromDays = () => {
		const n = cint(state.header.cust_days.get_value());
		return n > 0 ? frappe.datetime.add_days(frappe.datetime.get_today(), n) : dueFromDays();
	};
	state.dueFromDays = dueFromDays; // placeOrder() reads these
	state.custFromDays = custFromDays;
	const showDue = () => {
		const dd = dueFromDays();
		$(page.main).find(".po-due").not(".po-custdue").text(dd ? __("Due {0}", [frappe.datetime.str_to_user(dd)]) : "");
		const cd = custFromDays();
		const copied = !cint(state.header.cust_days.get_value());
		$(page.main).find(".po-custdue").text(cd ? __("Customer {0}{1}", [frappe.datetime.str_to_user(cd), copied ? " (= due date)" : ""]) : "");
	};
	state.showDue = showDue;
	state.header.days.$input.on("input change", () => {
		if (cint(state.header.days.get_value()) < 0) state.header.days.set_value(0);
		showDue();
	});
	state.header.cust_days.$input.on("input change", () => {
		if (cint(state.header.cust_days.get_value()) < 0) state.header.cust_days.set_value(0);
		showDue();
	});

	// Pre-fill Days / Type / Salesman from the global Order Settings (Setup → Order Settings).
	frappe.call({ method: "jewelima.jewelima.api.get_order_defaults" }).then((r) => {
		const d = r.message || {};
		if (cint(d.days) && !cint(state.header.days.get_value())) {
			// set_value resolves async — show the date only once the value has landed
			Promise.resolve(state.header.days.set_value(cint(d.days))).then(() => showDue());
		}
		if (d.order_type && !state.header.order_type.get_value()) state.header.order_type.set_value(d.order_type);
		if (d.salesman && !state.header.salesman.get_value()) state.header.salesman.set_value(d.salesman);
	});

	const $headrow = $(page.main).find(".po-headrow");
	$headrow.append('<th class="po-num">#</th>');
	PO_COLUMNS.forEach((c) => $headrow.append(`<th style="min-width:${c.width}">${frappe.utils.escape_html(c.label)}</th>`));
	$headrow.append('<th style="width:285px;text-align:center">Functions</th>');
	$headrow.append('<th style="width:34px"></th>');

	const $body = $(page.main).find(".po-body");

	// ---- live totals footer ----
	const $footrow = $(page.main).find(".po-footrow");
	$footrow.append('<td class="po-foot-label">Total</td>');
	const totalCells = {};
	PO_COLUMNS.forEach((c) => (totalCells[c.key] = $("<td></td>").appendTo($footrow)));
	$footrow.append("<td></td>"); // actions (Split)
	$footrow.append("<td></td>"); // remove
	function recalcTotals() {
		const s = { qty: 0, gross_weight: 0, nett_weight: 0, pure: 0, dmd_no: 0, dmd_weight: 0, ps_no: 0, ps_weight: 0, cs_no: 0, cs_weight: 0 };
		state.rows.forEach((r) => {
			s.qty += cint(r.f.qty.get()) || 0;
			["gross_weight", "nett_weight", "pure", "dmd_weight", "ps_weight", "cs_weight"].forEach((k) => (s[k] += flt(r.f[k].get()) || 0));
			["dmd_no", "ps_no", "cs_no"].forEach((k) => (s[k] += cint(r.f[k].get()) || 0));
		});
		totalCells.qty.text(s.qty || "");
		totalCells.gross_weight.text(s.gross_weight ? s.gross_weight.toFixed(3) : "");
		totalCells.nett_weight.text(s.nett_weight ? s.nett_weight.toFixed(3) : "");
		totalCells.pure.text(s.pure ? s.pure.toFixed(3) : "");
		[["dmd", "dmd_no", "dmd_weight"], ["ps", "ps_no", "ps_weight"], ["cs", "cs_no", "cs_weight"]].forEach(([gk, nk, wk]) => {
			totalCells[gk].text(s[nk] || s[wk] ? `${s[nk]} / ${s[wk].toFixed(3)}` : "");
		});
	}
	state.recalcTotals = recalcTotals;
	$body.on("input change", "input,select", () => recalcTotals());

	// Press Enter to jump to the next field (Design → Size → Qty → next row) for fast
	// keyboard entry. On the Design field, if the autocomplete list is open Enter still
	// picks from it (press Enter again to advance).
	$body.on("keydown", "input,select", (e) => {
		if (e.which !== 13 && e.key !== "Enter") return;
		const $ul = $(e.target).closest(".awesomplete").find("ul");
		if ($ul.length && !$ul.prop("hidden") && $ul.find("li").length) return; // let it pick from the list
		e.preventDefault();
		const fields = $body.find("input:visible,select:visible").toArray();
		const i = fields.indexOf(e.target);
		if (i === -1) return;
		if (i < fields.length - 1) {
			const nx = fields[i + 1];
			nx.focus();
			if (nx.select) nx.select();
		} else {
			const row = addRow(); // last field → start a new line
			setTimeout(() => row.$tr.find("input,select").first().focus(), 30);
		}
	});

	function renumber() {
		$body.find("tr").each((i, tr) => $(tr).find(".po-num").text(i + 1));
		$(page.main).find(".po-count").text(state.rows.length);
	}

	function addRow(afterRow) {
		const $tr = $("<tr></tr>");
		$tr.append('<td class="po-num"></td>');
		const row = { $tr, f: {} };
		PO_COLUMNS.forEach((col) => {
			const $td = $("<td></td>").appendTo($tr);
			if (col.type === "link") {
				const df = { fieldtype: "Link", options: col.options, fieldname: col.key, placeholder: col.label };
				if (col.key === "design") df.get_query = () => ({ filters: { status: "Active" } });
				const ctrl = frappe.ui.form.make_control({ df, parent: $td.get(0), render_input: true });
				ctrl.refresh();
				row.f[col.key] = { get: () => ctrl.get_value(), set: (v) => ctrl.set_value(v || "") };
				if (col.key === "design") {
					// AJAX: when the design changes, pull its stone profile and fill the line.
					ctrl.$input.on("change awesomplete-selectcomplete", () =>
						setTimeout(() => { onDesignPicked(row); updateDesignBtn(row); }, 50)
					);
				}
			} else if (col.type === "select") {
				const $s = $("<select></select>").appendTo($td);
				const fill = (opts) => {
					const cur = $s.val();
					$s.empty().append('<option value=""></option>');
					(opts || []).forEach((o) => $s.append(`<option>${frappe.utils.escape_html(o)}</option>`));
					if (cur && (opts || []).includes(cur)) $s.val(cur);
				};
				fill(col.options);
				row.f[col.key] = {
					get: () => $s.val(),
					set: (v) => $s.val(v || ""),
					setOptions: (opts) => { fill(opts); if ((opts || []).length === 1) $s.val(opts[0]); },
				};
			} else if (col.type === "ro") {
				// read-only, derived from the design (no input)
				$td.addClass("po-ro").text("—");
				const isPurity = col.key === "purity";
				row.f[col.key] = {
					get: () => $td.attr("data-v") || "",
					set: (v) => { $td.attr("data-v", v == null ? "" : v); $td.text(v ? (isPurity ? flt(v).toFixed(1) + "%" : v) : "—"); },
				};
			} else if (col.type === "stone") {
				// one read-only cell showing "no / ct" (derived from the design)
				$td.addClass("po-ro");
				const render = () => {
					const no = cint($td.attr("data-no")) || 0, wt = flt($td.attr("data-wt")) || 0;
					$td.text(no || wt ? `${no} / ${wt.toFixed(3)}` : "—");
				};
				row.f[col.no] = { get: () => $td.attr("data-no") || "", set: (v) => { $td.attr("data-no", v == null ? "" : v); render(); } };
				row.f[col.wt] = { get: () => $td.attr("data-wt") || "", set: (v) => { $td.attr("data-wt", v == null ? "" : v); render(); } };
				render();
			} else {
				// editable number (qty)
				const $i = $(`<input type="number" step="1" min="0">`).appendTo($td);
				row.f[col.key] = { get: () => $i.val(), set: (v) => $i.val(v == null ? "" : v) };
				if (col.key === "qty")
					$i.on("input change", () => {
						applyProfile(row);
						updateSplitBtn(row); // enable/disable Split as qty crosses 1
						// auto-append a fresh line once the last row gets a qty
						if (cint(row.f.qty.get()) > 0 && state.rows[state.rows.length - 1] === row) addRow();
					});
			}
		});
		// actions cell — Split (enabled only when qty > 1); more buttons can live here later
		const $act = $('<td class="po-act"></td>').appendTo($tr);
		row.$design = $('<button class="btn btn-xs btn-default" title="Edit this bag\'s materials (BOM)">Materials</button>').appendTo($act);
		row.$design.on("click", () => editMaterials(row));
		row.$split = $('<button class="btn btn-xs btn-default" title="Split this line into multiple bags">Split</button>').appendTo($act);
		row.$split.on("click", () => doSplit(row));
		row._remark = "";
		row.$remark = $('<button class="btn btn-xs btn-default" title="Add a remark">Remark</button>').appendTo($act);
		row.$remark.on("click", () => editRemark(row));
		row.$reset = $('<button class="btn btn-xs btn-default" title="Reset this line to the design\'s BOM">Reset</button>').appendTo($act);
		row.$reset.on("click", () => resetLine(row));
		row.$new = $('<button class="btn btn-xs btn-default po-new" title="Create a purity variant of this design (e.g. 22KYG → 18KPG)">New</button>').appendTo($act);
		row.$new.on("click", () => openVariantPicker(row));
		updateNewBtn(row);
		updateDesignBtn(row);
		updateSplitBtn(row);
		updateRemarkBtn(row);

		const $rm = $('<td><button class="btn btn-xs btn-default" title="Remove">&times;</button></td>').appendTo($tr);
		$rm.find("button").on("click", () => {
			state.rows = state.rows.filter((r) => r !== row);
			$tr.remove();
			renumber();
			recalcTotals();
		});
		if (afterRow) {
			afterRow.$tr.after($tr); // insert right below the given row
			state.rows.splice(state.rows.indexOf(afterRow) + 1, 0, row);
		} else {
			$body.append($tr);
			state.rows.push(row);
		}
		renumber();
		recalcTotals();
		return row;
	}

	function updateSplitBtn(row) {
		if (row.$split) row.$split.prop("disabled", cint(row.f.qty.get()) <= 1);
	}

	function updateDesignBtn(row) {
		if (row.$design) row.$design.prop("disabled", !row.f.design.get());
		updateNewBtn(row);
	}

	// "New" goes RED (ready) once a design is chosen on the line
	function updateNewBtn(row) {
		if (!row.$new) return;
		const has = !!row.f.design.get();
		row.$new.prop("disabled", !has).toggleClass("ready", has);
	}

	// select a design onto the line programmatically (set_value is async and does not fire
	// the input change handler — chain, clear the guard, then pull the BOM explicitly)
	function selectDesign(row, name) {
		Promise.resolve(row.f.design.set(name)).then(() => {
			row._lastDesign = null;
			onDesignPicked(row);
			updateDesignBtn(row);
		});
	}
	state.selectDesign = selectDesign;

	// The per-line "New" flow: show the design's current gold + every other karat gold.
	// RED = variant doesn't exist yet (click -> prefilled New Design dialog);
	// BLACK = variant already exists (click -> select it on this line).
	function openVariantPicker(row) {
		const design = row.f.design.get();
		if (!design) return;
		frappe.call({ method: "jewelima.jewelima.api.get_design_variants", args: { design } }).then((r) => {
			const v = r.message || {};
			const esc = frappe.utils.escape_html;
			const dlg = new frappe.ui.Dialog({ title: __("New purity variant — {0}", [esc(design)]) });
			const btns = (v.variants || []).map((x, i) =>
				`<button class="btn btn-sm pv-btn" data-i="${i}" style="min-width:96px;margin:4px;${x.exists
					? "background:#171717;border-color:#171717;color:#fff;"
					: "background:#b00020;border-color:#b00020;color:#fff;"}"
					title="${esc(x.variant_name)}${x.exists ? " — already exists, click to use it" : " — click to create"}">
					${esc(x.karat)}${x.exists ? " ●" : ""}</button>`
			).join("");
			$(dlg.body).html(`
				<div style="margin:0 0 10px;color:var(--text-muted);font-size:13px;">
					Current gold: <b style="color:var(--text-color)">${esc(v.current_gold)}</b> (${flt(v.current_purity).toFixed(1)}%)
					&nbsp;·&nbsp; base name <b style="color:var(--text-color)">${esc(v.base)}</b></div>
				<div style="display:flex;flex-wrap:wrap;">${btns}</div>
				<div style="margin-top:10px;color:var(--text-muted);font-size:12px;">
					<span style="color:#b00020;font-weight:600;">Red</span> = create this variant ·
					<span style="font-weight:600;">Black ●</span> = exists, click to use it on this line.</div>`);
			$(dlg.body).find(".pv-btn").on("click", function () {
				const x = v.variants[+this.getAttribute("data-i")];
				dlg.hide();
				if (x.exists) return selectDesign(row, x.variant_name);
				// build the prefilled BOM: same rows, gold swapped to the chosen karat
				frappe.call({ method: "jewelima.jewelima.api.get_design_materials", args: { design } }).then((mr) => {
					const mats = ((mr.message || {}).materials || []).map((m) =>
						m.item === v.current_gold
							? { ...m, item: x.karat, purity: x.purity, pure: (flt(m.weight) * flt(x.purity)) / 100 }
							: { ...m, pure: m.stone_type ? 0 : (flt(m.weight) * flt(m.purity)) / 100 }
					);
					openNewDesignDialog(state, {
						design_name: x.variant_name, design_type: v.design_type,
						design_style: v.design_style, image: v.image, materials: mats, row,
					});
				});
			});
			dlg.show();
		});
	}

	// Per-piece plan profile from a materials list — mirrors api._plan_values: gross = metal
	// grams + stone grams (1 ct = 0.2 g), nett = metal grams, gram-weighted metal purity.
	// Lets edited materials recompute the line's numbers instantly (no round-trip).
	function planProfile(mats) {
		let metal = 0, pnum = 0, dmd_no = 0, dmd_w = 0, ps_no = 0, ps_w = 0, cs_no = 0, cs_w = 0;
		const mp = [];
		(mats || []).forEach((m) => {
			const st = m.stone_type, wt = flt(m.weight), q = cint(m.qty);
			if (st === "Diamond") { dmd_no += q; dmd_w += wt; }
			else if (st === "Precious Stone") { ps_no += q; ps_w += wt; }
			else if (st === "Color Stone") { cs_no += q; cs_w += wt; }
			else { const pu = flt(m.purity); metal += wt; pnum += wt * pu; if (pu) mp.push(pu); }
		});
		const stone_g = (dmd_w + ps_w + cs_w) * 0.2;
		const purity = metal ? pnum / metal : (mp.length ? mp.reduce((a, b) => a + b, 0) / mp.length : 0);
		return {
			gross_weight: +(metal + stone_g).toFixed(3), nett_weight: +metal.toFixed(3), purity: +purity.toFixed(3),
			dmd_no, dmd_weight: +dmd_w.toFixed(3), ps_no, ps_weight: +ps_w.toFixed(3), cs_no, cs_weight: +cs_w.toFixed(3),
		};
	}

	// Pull the design's BOM into this line's editable working copy + recompute.
	// type -> {sizes, default} (Setup → Design Types); the row's Size dropdown follows the type
	state.typeSizes = {};
	frappe.call({ method: "jewelima.jewelima.api.get_design_types_with_sizes" }).then((r) => {
		(r.message || []).forEach((t) => (state.typeSizes[t.design_type] = { sizes: t.sizes || [], default: t.default || "" }));
	});
	function applyTypeSizes(row) {
		if (!row.f.size || !row.f.size.setOptions) return;
		const t = state.typeSizes[row._designType] || { sizes: [], default: "" };
		row.f.size.setOptions(t.sizes.length ? t.sizes : ["NA"]);
		if (t.default && !row.f.size.get()) row.f.size.set(t.default); // pre-select the type's default
	}

	function pullDesignBOM(row) {
		const design = row.f.design.get();
		if (row.f.design_type) row.f.design_type.set("");
		if (!design) { row._materials = []; row._profile = null; applyProfile(row); return; }
		frappe.call({ method: "jewelima.jewelima.api.get_design_materials", args: { design } }).then((r) => {
			const msg = r.message || {};
			row._materials = (msg.materials || []).map((m) => ({ item: m.item, qty: m.qty, weight: m.weight, purity: m.purity, uom: m.uom, stone_type: m.stone_type }));
			row._image = msg.image || "";
			row._designType = msg.design_type || "";
			if (row.f.design_type) row.f.design_type.set(row._designType);
			applyTypeSizes(row);
			row._edited = false;
			row._profile = planProfile(row._materials);
			applyProfile(row);
		});
	}

	// Per-line reset: re-pull the design's BOM (discarding edits) and recompute. With no
	// design picked yet, just clear the line's size/qty.
	function resetLine(row) {
		if (row.f.design.get()) {
			pullDesignBOM(row);
			frappe.show_alert({ message: __("Line reset to the design's BOM."), indicator: "blue" }, 3);
		} else {
			row.f.size.set(""); row.f.qty.set("");
			row._materials = []; row._profile = null; applyProfile(row);
		}
	}

	// Edit this bag's OWN materials (BOM) and see the photo. Seeded from the design's BOM;
	// edits recompute the line's weights/stones and are saved into Order Bag.bag_bom on placing.
	function editMaterials(row) {
		const design = row.f.design.get();
		if (!design) return frappe.msgprint(__("Pick a Design on this line first."));
		if (row._materials && row._materials.length) return openMaterials(row, design);
		// not pulled yet — fetch the design's BOM + photo first, then open
		frappe.call({ method: "jewelima.jewelima.api.get_design_materials", args: { design } }).then((r) => {
			const msg = r.message || {};
			row._materials = (msg.materials || []).map((m) => ({ item: m.item, qty: m.qty, weight: m.weight, purity: m.purity, uom: m.uom, stone_type: m.stone_type }));
			row._image = msg.image || "";
			row._profile = planProfile(row._materials);
			applyProfile(row);
			openMaterials(row, design);
		});
	}

	function openMaterials(row, design) {
		function itemChanged() {
			const r = this.doc || (this.grid_row && this.grid_row.doc);
			if (!r) return;
			if (!r.item) { r.purity = 0; r.uom = ""; r.pure = 0; r.stone_type = ""; dd.fields_dict.materials.grid.refresh(); return; }
			frappe.db.get_value("Item", r.item, ["purity_percentage", "weight_unit", "stone_type"]).then((res) => {
				const v = res.message || {};
				r.purity = flt(v.purity_percentage); r.uom = v.weight_unit || ""; r.stone_type = v.stone_type || "";
				if (!v.stone_type) r.qty = 0;
				r.pure = v.stone_type ? 0 : (flt(r.weight) * flt(r.purity)) / 100;
				dd.fields_dict.materials.grid.refresh();
			});
		}
		function weightChanged() {
			const r = this.doc || (this.grid_row && this.grid_row.doc);
			if (!r) return;
			r.pure = r.stone_type ? 0 : (flt(r.weight) * flt(r.purity)) / 100;
			dd.fields_dict.materials.grid.refresh();
		}
		const dd = new frappe.ui.Dialog({
			title: __("Materials — {0}", [design]),
			size: "large",
			fields: [
				{ fieldname: "photo", fieldtype: "HTML" },
				{
					fieldname: "materials", fieldtype: "Table", reqd: 1, options: "Design BOM Item", data: [],
					description: __("This bag's own BOM (copied from the design). Stones need a Qty + Weight (ct); metals need a Weight (g). The line updates on Apply."),
					fields: [
						{ fieldname: "item", fieldtype: "Link", options: "Item", label: __("Material"), in_list_view: 1, columns: 3, reqd: 1, get_query: () => ({ filters: { is_sales_item: 0, is_stock_item: 1 } }), onchange: itemChanged },
						{ fieldname: "purity", fieldtype: "Float", label: __("Purity %"), read_only: 1, in_list_view: 1, columns: 1 },
						{ fieldname: "uom", fieldtype: "Data", label: __("UOM"), read_only: 1, in_list_view: 1, columns: 1 },
						{ fieldname: "qty", fieldtype: "Float", label: __("Qty"), in_list_view: 1, columns: 1, mandatory_depends_on: "eval:doc.stone_type", read_only_depends_on: "eval:!doc.stone_type" },
						{ fieldname: "weight", fieldtype: "Float", label: __("Weight"), in_list_view: 1, columns: 1, reqd: 1, onchange: weightChanged },
						{ fieldname: "pure", fieldtype: "Float", label: __("Pure (g)"), read_only: 1, in_list_view: 1, columns: 1 },
					],
				},
			],
			primary_action_label: __("Apply"),
			primary_action(values) {
				const raw = (values.materials || []).filter((m) => m.item);
				if (!raw.length) return frappe.msgprint(__("Add at least one material."));
				const bad = raw.find((m) => (m.stone_type ? (flt(m.qty) <= 0 || flt(m.weight) <= 0) : flt(m.weight) <= 0));
				if (bad) return frappe.msgprint(bad.stone_type ? __("{0} is a stone — enter both a Qty and a Weight.", [bad.item]) : __("{0} needs a Weight (grams).", [bad.item]));
				row._materials = raw.map((m) => ({ item: m.item, qty: m.stone_type ? (flt(m.qty) || 0) : 0, weight: flt(m.weight) || 0, purity: flt(m.purity) || 0, uom: m.uom || "", stone_type: m.stone_type || "" }));
				row._edited = true;
				row._profile = planProfile(row._materials);
				applyProfile(row);
				dd.hide();
				frappe.show_alert({ message: __("Line materials updated."), indicator: "green" }, 3);
			},
		});
		dd.show();
		if (row._image) {
			dd.fields_dict.photo.$wrapper.html(`<div style="text-align:center;margin:0 0 12px;"><img src="${encodeURI(row._image)}" style="max-height:200px;max-width:100%;border-radius:8px;border:1px solid var(--border-color);" onerror="this.closest('div').style.display='none'"></div>`);
		}
		// seed the grid with this line's current materials (static-mode dialog grid)
		const grid = dd.fields_dict.materials.grid;
		grid.df.data = (row._materials || []).map((m, i) => ({ idx: i + 1, name: "new-mat-" + (i + 1), item: m.item, qty: m.qty, weight: m.weight, purity: m.purity, uom: m.uom, stone_type: m.stone_type }));
		grid.refresh();
	}

	function updateRemarkBtn(row) {
		const has = !!(row._remark || "").trim();
		row.$remark.toggleClass("btn-success", has).toggleClass("btn-default", !has);
		row.$remark.attr("title", has ? row._remark : __("Add a remark"));
	}

	// remark lives in a dialog (not an inline field) to save space; button turns green when set
	function editRemark(row) {
		frappe.prompt(
			{ fieldname: "remark", fieldtype: "Small Text", label: __("Remark"), default: row._remark || "" },
			(v) => { row._remark = (v.remark || "").trim(); updateRemarkBtn(row); },
			__("Remark"),
			__("Save")
		);
	}

	// Split a line's qty across N bags. Divides as evenly as possible; the last line
	// takes any remainder (e.g. 50 → 4 bags = 12, 12, 12, 14).
	function doSplit(row) {
		const total = cint(row.f.qty.get());
		if (!row.f.design.get()) return frappe.msgprint(__("Pick a Design on this line first."));
		if (total <= 1) return frappe.msgprint(__("This line has only 1 — nothing to split."));
		frappe.prompt(
			{
				fieldname: "bags", fieldtype: "Int", reqd: 1, default: 2,
				label: __("Split into how many bags?"),
				description: __("{0} qty will be divided across this many lines (the last line takes any remainder).", [total]),
			},
			(v) => {
				const n = cint(v.bags);
				if (n < 2) return frappe.msgprint(__("Enter 2 or more."));
				if (n > total) return frappe.msgprint(__("Can't split {0} into more than {0} bags (each bag needs at least 1).", [total]));
				const base = Math.floor(total / n);
				const qtys = [];
				for (let i = 0; i < n - 1; i++) qtys.push(base);
				qtys.push(total - base * (n - 1)); // last line gets the remainder
				const design = row.f.design.get(), size = row.f.size.get();
				row.f.qty.set(qtys[0]); // original line becomes the first bag
				applyProfile(row);
				updateSplitBtn(row);
				let prev = row;
				for (let i = 1; i < n; i++) {
					const nr = addRow(prev);
					nr._profile = row._profile;
					nr._materials = (row._materials || []).map((m) => ({ ...m }));
					nr._designType = row._designType;
					nr._lastDesign = design;
					nr.f.design.set(design);
					applyTypeSizes(nr);
					nr.f.size.set(size);
					if (nr.f.design_type) nr.f.design_type.set(row._designType || "");
					nr.f.qty.set(qtys[i]);
					applyProfile(nr);
					updateSplitBtn(nr);
					updateDesignBtn(nr);
					nr._remark = row._remark; // split bags inherit the line's remark
					updateRemarkBtn(nr);
					prev = nr;
				}
				recalcTotals();
				frappe.show_alert({ message: __("Split into {0} bags: {1}", [n, qtys.join(" + ")]), indicator: "green" });
			},
			__("Split Line"),
			__("Split")
		);
	}

	function onDesignPicked(row) {
		const design = row.f.design.get();
		if (!design || row._lastDesign === design) return;
		row._lastDesign = design;
		pullDesignBOM(row); // copy the design's BOM into the line, then recompute
	}

	// Fill the line from the design's PER-PIECE profile, scaled by qty.
	// Weights + stone counts are totals (per-piece × qty); purity is a ratio (unscaled).
	function applyProfile(row) {
		const p = row._profile;
		if (!p) return;
		const q = cint(row.f.qty.get()) || 1;
		const set = (k, v) => { if (row.f[k]) row.f[k].set(v || ""); };
		set("purity", p.purity);
		["gross_weight", "nett_weight", "dmd_weight", "ps_weight", "cs_weight"].forEach((k) => {
			const v = flt(p[k]) * q;
			set(k, v ? v.toFixed(3) : "");
		});
		const pure = (flt(p.nett_weight) * q * flt(p.purity)) / 100; // pure gold grams (scales with qty)
		set("pure", pure ? pure.toFixed(3) : "");
		["dmd_no", "ps_no", "cs_no"].forEach((k) => set(k, cint(p[k]) * q || ""));
		recalcTotals();
	}

	// expose for the New Design dialog to drop a freshly-created design onto a row
	state.onDesignPicked = onDesignPicked;
	state.addRow = addRow;

	const addRows = (n) => { let last; for (let i = 0; i < n; i++) last = addRow(); return last; };

	page.add_inner_button(__("New Design"), () => openNewDesignDialog(state));
	page.add_inner_button(__("Add Row"), () => addRow());
	page.add_inner_button(__("Add 10 Rows"), () => addRows(10));
	page.add_inner_button(__("Reset"), () => {
		$body.empty();
		state.rows = [];
		state.header.customer.set_value("");
		state.header.salesman.set_value("");
		state.header.order_type.set_value("");
		state.header.days.set_value(0);
		state.header.cust_days.set_value(0);
		if (state.showDue) state.showDue();
		state.header.order_no.set_value("");
		state.header.order_date.set_value(frappe.datetime.get_today());
		addRow();
	});

	addRow(); // start with a single line

	page.set_primary_action(__("Place Order"), () => placeOrder(page, state, renumber, addRow, $body), "add");
};

function po_readLine(r) {
	const g = (k) => r.f[k].get();
	return {
		design: g("design") || undefined,
		size: g("size") || undefined,
		qty: cint(g("qty")) || 0,
		gross_weight: flt(g("gross_weight")) || 0,
		nett_weight: flt(g("nett_weight")) || 0,
		purity: flt(g("purity")) || 0,
		dmd_no: cint(g("dmd_no")) || 0, dmd_weight: flt(g("dmd_weight")) || 0,
		ps_no: cint(g("ps_no")) || 0, ps_weight: flt(g("ps_weight")) || 0,
		cs_no: cint(g("cs_no")) || 0, cs_weight: flt(g("cs_weight")) || 0,
		narration: r._remark || undefined,
		bag_bom: (r._materials || []).map((m) => ({ item: m.item, qty: flt(m.qty) || 0, weight: flt(m.weight) || 0 })),
	};
}

async function placeOrder(page, state, renumber, addRow, $body) {
	const customer = state.header.customer.get_value();
	const salesman = state.header.salesman.get_value();
	const order_type = state.header.order_type.get_value();
	const order_date = state.header.order_date.get_value() || frappe.datetime.get_today();
	const due_date = state.dueFromDays ? state.dueFromDays() : "";
	const customer_date = (state.custFromDays ? state.custFromDays() : "") || due_date; // empty -> copies due date

	const all = state.rows.map(po_readLine);
	const lines = all.filter((l) => l.design); // rows without a Design are denied
	const ghosts = all.filter((l) => !l.design && l.qty); // qty typed but Design forgotten
	if (ghosts.length) {
		frappe.msgprint(__("{0} line(s) have a Qty but no Design — add a Design or clear the Qty before placing the order.", [ghosts.length]));
		return;
	}
	if (!lines.length) {
		frappe.msgprint(__("Add at least one line with a Design."));
		return;
	}

	frappe.dom.freeze(__("Placing order…"));
	try {
		const order = await frappe.db.insert({
			doctype: "Job Order",
			order_date: order_date || frappe.datetime.get_today(),
			due_date: due_date || undefined,
			customer_date: customer_date || undefined,
			customer: customer || undefined,
			salesman: salesman || undefined,
			order_type: order_type || undefined,
		});
		let made = 0;
		for (const l of lines) {
			await frappe.db.insert({
				doctype: "Order Bag", job_order: order.name, design: l.design, qty: l.qty || 1,
				size: l.size, gross_weight: l.gross_weight, nett_weight: l.nett_weight, purity: l.purity,
				dmd_no: l.dmd_no, dmd_weight: l.dmd_weight, ps_no: l.ps_no, ps_weight: l.ps_weight,
				cs_no: l.cs_no, cs_weight: l.cs_weight, narration: l.narration,
				bag_bom: l.bag_bom && l.bag_bom.length ? l.bag_bom : undefined,
			});
			made++;
		}
		frappe.dom.unfreeze();
		state.header.order_no.set_value(order.name);
		frappe.show_alert({ message: __("Placed {0} with {1} card(s).", [order.name, made]), indicator: "green" }, 7);
		frappe.msgprint({
			title: __("Order placed"), indicator: "green",
			message: __("{0} created with {1} Order Bag(s). <a href='/app/job-order/{0}'>Open order</a>", [order.name, made]),
		});
		$body.empty();
		state.rows = [];
		addRow();
		renumber();
	} catch (e) {
		frappe.dom.unfreeze();
	}
}

function openNewDesignDialog(state, prefill) {
	// prefill (optional) = a purity-variant seed: {design_name, design_type, design_style,
	// image, materials, row} — everything copied from the source design, gold already swapped.
	// fetch_from doesn't fire in a Dialog grid, so fill Purity / UOM / Pure ourselves.
	function bomItemChanged() {
		const row = this.doc || (this.grid_row && this.grid_row.doc);
		if (!row) return;
		if (!row.item) { row.purity = 0; row.uom = ""; row.pure = 0; d.fields_dict.materials.grid.refresh(); return; }
		frappe.db.get_value("Item", row.item, ["purity_percentage", "weight_unit", "stone_type"]).then((r) => {
			const v = r.message || {};
			row.purity = flt(v.purity_percentage);
			row.uom = v.weight_unit || "";
			row.stone_type = v.stone_type || "";
			if (!v.stone_type) row.qty = 0;   // metals are weighed, not counted
			row.pure = v.stone_type ? 0 : (flt(row.weight) * flt(row.purity)) / 100;
			d.fields_dict.materials.grid.refresh();
		});
	}
	function bomWeightChanged() {
		const row = this.doc || (this.grid_row && this.grid_row.doc);
		if (!row) return;
		row.pure = row.stone_type ? 0 : (flt(row.weight) * flt(row.purity)) / 100;
		d.fields_dict.materials.grid.refresh();
	}
	const d = new frappe.ui.Dialog({
		title: __("New Design"),
		size: "large",
		fields: [
			{ fieldname: "design_name", fieldtype: "Data", label: __("Design Name"), reqd: 1 },
			{ fieldname: "cb1", fieldtype: "Column Break" },
			{ fieldname: "design_type", fieldtype: "Link", label: __("Design Type"), options: "Design Type", reqd: 1 },
			{ fieldname: "design_style", fieldtype: "Link", label: __("Design Style"), options: "Design Style" },
			{ fieldname: "sb_img", fieldtype: "Section Break" },
			{
				fieldname: "image", fieldtype: "Attach Image", label: __("Design Image"),
				onchange() {
					// show the attached image itself, not just the file link
					const url = d.get_value("image");
					d.fields_dict.image_preview.$wrapper.html(
						url
							? `<div style="text-align:center;margin:4px 0 8px;"><img src="${encodeURI(url)}" style="max-height:220px;max-width:100%;border-radius:8px;border:1px solid var(--border-color);" onerror="this.closest('div').style.display='none'"></div>`
							: ""
					);
				},
			},
			{ fieldname: "image_preview", fieldtype: "HTML" },
			{ fieldname: "sb_bom", fieldtype: "Section Break", label: __("Bill of Materials") },
			{
				fieldname: "materials", fieldtype: "Table", label: __("Materials"), reqd: 1, options: "Design BOM Item", data: [],
				description: __("Stones need both a Qty (count) and a Weight (carats). Metals need a Weight (grams)."),
				fields: [
					{ fieldname: "item", fieldtype: "Link", options: "Item", label: __("Material"), in_list_view: 1, columns: 3, reqd: 1, get_query: () => ({ filters: { is_sales_item: 0, is_stock_item: 1 } }), onchange: bomItemChanged },
					{ fieldname: "purity", fieldtype: "Float", label: __("Purity %"), read_only: 1, in_list_view: 1, columns: 1 },
					{ fieldname: "uom", fieldtype: "Data", label: __("UOM"), read_only: 1, in_list_view: 1, columns: 1 },
					{ fieldname: "qty", fieldtype: "Float", label: __("Qty"), in_list_view: 1, columns: 1, mandatory_depends_on: "eval:doc.stone_type", read_only_depends_on: "eval:!doc.stone_type" },
					{ fieldname: "weight", fieldtype: "Float", label: __("Weight"), in_list_view: 1, columns: 1, reqd: 1, onchange: bomWeightChanged },
					{ fieldname: "pure", fieldtype: "Float", label: __("Pure (g)"), read_only: 1, in_list_view: 1, columns: 1 },
				],
			},
		],
		primary_action_label: __("Create Design"),
		primary_action(values) {
			const raw = (values.materials || []).filter((m) => m.item);
			if (!raw.length) {
				frappe.msgprint(__("Add at least one material to the design's BOM."));
				return;
			}
			const bad = raw.find((m) => (m.stone_type ? (flt(m.qty) <= 0 || flt(m.weight) <= 0) : flt(m.weight) <= 0));
			if (bad) {
				frappe.msgprint(bad.stone_type
					? __("{0} is a stone — enter both a Qty and a Weight.", [bad.item])
					: __("{0} needs a Weight (grams).", [bad.item]));
				return;
			}
			// metals carry no piece qty
			const materials = raw.map((m) => ({ item: m.item, qty: m.stone_type ? (flt(m.qty) || 0) : 0, weight: flt(m.weight) || 0 }));
			frappe.call({
				method: "jewelima.jewelima.api.create_design",
				args: {
					design_name: values.design_name,
					design_type: values.design_type,
					design_style: values.design_style,
					image: values.image,
					materials: JSON.stringify(materials),
				},
			}).then((r) => {
				const res = r.message || {};
				if (!res.name) return;
				d.hide();
				frappe.show_alert({ message: __("Design {0} created.", [res.name]), indicator: "green" }, 5);
				// drop the new design onto its line: the variant's source row, else the first
				// empty one. selectDesign chains the async set_value so the materials pull too.
				let row = (prefill && prefill.row) || state.rows.find((rr) => !rr.f.design.get());
				if (!row) row = state.addRow();
				state.selectDesign(row, res.name);
			});
		},
	});
	d.show();
	if (prefill) {
		d.set_value("design_name", prefill.design_name);
		d.set_value("design_type", prefill.design_type || "");
		d.set_value("design_style", prefill.design_style || "");
		Promise.resolve(d.set_value("image", prefill.image || "")).then(() => {
			if (d.fields_dict.image.df.onchange) d.fields_dict.image.df.onchange();
		});
		const grid = d.fields_dict.materials.grid;
		grid.df.data = (prefill.materials || []).map((m, i) => ({
			idx: i + 1, name: "new-var-" + (i + 1), item: m.item, purity: m.purity, uom: m.uom,
			stone_type: m.stone_type, qty: m.qty, weight: m.weight, pure: m.pure,
		}));
		grid.refresh();
	}
}
