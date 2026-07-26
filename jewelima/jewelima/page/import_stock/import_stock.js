// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Import Stock (Delivery) — bring pre-existing finished pieces (vault / opening
// stock) into the system. One row = ONE piece (its own HUID). Every batch is
// backed by a stock entry: mode "From Issue Stock" consumes Gold/Stone Issue,
// mode "New Purchase" posts a Purchase Receipt straight into Finished Goods.
// Pieces land as finished Order Bags, In Stock, held by the chosen customer.
// Route: /app/import-stock

frappe.pages["import-stock"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Import Stock", single_column: true });
	const state = { rows: [], header: {}, cats: [], typeSizes: {} };
	const esc = frappe.utils.escape_html;

	$(page.main).append(`
		<style>
		.is-wrap{display:flex;flex-direction:column;height:calc(100vh - 95px);}
		.is-head{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:2px 10px;margin:2px 0 6px;}
		.is-head .frappe-control{margin:0;}
		.is-head .control-label{font-size:11px;margin:0 0 1px;color:var(--text-muted);}
		.is-head .control-input-wrapper .control-input,.is-head .control-input input,.is-head .control-input select,.is-head .control-value{min-height:26px;height:26px;line-height:24px;font-size:12px;}
		.is-head .help-box,.is-head .description{display:none !important;}
		.is-gridbox{flex:1 1 auto;overflow:auto;border:1px solid var(--border-color);border-radius:8px;}
		table.is-grid{width:100%;border-collapse:separate;border-spacing:0;font-size:12px;background:var(--fg-color);}
		table.is-grid th{position:sticky;top:0;z-index:2;background:var(--control-bg, var(--fg-color));
			border-right:1px solid var(--border-color);border-bottom:1px solid var(--gray-400, #aeb6bf);padding:3px 6px;text-align:left;white-space:nowrap;font-weight:700;}
		table.is-grid td{border-right:1px solid var(--border-color);border-bottom:1px solid var(--border-color);padding:0 2px;vertical-align:middle;background:var(--fg-color);height:30px;}
		table.is-grid td.is-num{color:var(--text-muted);text-align:center;width:30px;background:var(--control-bg);font-weight:700;}
		table.is-grid tr.is-ok td.is-num{background:#eaf6ec;color:#1d7a33;}
		table.is-grid tr.is-bad td.is-num{background:#fdeaea;color:#b02a2a;}
		table.is-grid input{width:100%;border:1px solid var(--gray-400, #aeb6bf);background:var(--fg-color);
			padding:1px 4px;font-size:12px;color:var(--text-color);border-radius:3px;height:26px;line-height:1.1;box-sizing:border-box;}
		table.is-grid input:focus{box-shadow:inset 0 0 0 1px var(--primary);outline:none;}
		table.is-grid select{width:100%;border:1px solid var(--gray-400, #aeb6bf);background:var(--fg-color);padding:1px 4px;font-size:12px;color:var(--text-color);border-radius:3px;height:26px;box-sizing:border-box;}
		table.is-grid .frappe-control,table.is-grid .frappe-control .form-group{margin:0;}
		table.is-grid .frappe-control .help-box,table.is-grid .frappe-control .description,table.is-grid .frappe-control .control-label{display:none !important;}
		table.is-grid .frappe-control .control-input-wrapper,table.is-grid .frappe-control .control-input{margin:0;padding:0;min-height:0;}
		table.is-grid .frappe-control .control-input input{border:1px solid var(--gray-400, #aeb6bf);background:var(--fg-color);padding:1px 4px;height:26px;min-height:26px;line-height:1.1;box-sizing:border-box;border-radius:3px;}
		table.is-grid .frappe-control .link-btn{display:none !important;}
		.is-chipbtn{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--gray-400,#aeb6bf);border-radius:4px;background:var(--control-bg);
			padding:2px 8px;font-size:11.5px;cursor:pointer;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis;}
		.is-chipbtn:hover{border-color:var(--primary);}
		.is-chipbtn .on{color:var(--primary);font-weight:700;}
		.is-x{border:none;background:none;color:var(--text-muted);cursor:pointer;font-size:14px;padding:2px 6px;}
		.is-x:hover{color:#b02a2a;}
		.is-dup{border:none;background:none;color:var(--text-muted);cursor:pointer;font-size:13px;padding:2px 6px;}
		.is-dup:hover{color:var(--primary);}
		.is-foot{margin-top:1px;color:var(--text-muted);font-size:12px;}
		</style>
		<div class="is-wrap">
			<div class="is-head">
				<div class="is-h-mode"></div><div class="is-h-holder"></div><div class="is-h-supplier"></div><div class="is-h-remarks"></div>
			</div>
			<div class="is-gridbox">
				<table class="is-grid"><thead><tr class="is-headrow">
					<th class="is-num">#</th>
					<th style="min-width:190px">${__("Design")}</th>
					<th style="min-width:110px">${__("Karat")}</th>
					<th style="min-width:85px">${__("Gold g")}</th>
					<th style="min-width:85px">${__("Gross g")}</th>
					<th style="min-width:150px">${__("Stones")}</th>
					<th style="min-width:100px">${__("HUID")}</th>
					<th style="min-width:110px">${__("Certifications")}</th>
					<th style="min-width:70px">${__("Size")}</th>
					<th style="min-width:130px">${__("Special Works")}</th>
					<th style="width:64px"></th>
				</tr></thead><tbody class="is-body"></tbody></table>
			</div>
			<div class="is-foot"><span class="is-count">0</span> ${__("piece(s) ready. One row = ONE piece (its own HUID) — use ⧉ to duplicate lookalikes. Green rows go in. The batch posts its backing stock entry first; without it no cards are created.")}</div>
		</div>
	`);

	const mk = (sel, df) => {
		const c = frappe.ui.form.make_control({ df, parent: $(page.main).find(sel).get(0), render_input: true });
		c.refresh();
		return c;
	};
	state.header.mode = mk(".is-h-mode", {
		fieldtype: "Select", label: __("Materials From"), fieldname: "mode",
		options: [
			{ label: __("Issue Stock (Gold/Stone Issue)"), value: "issue" },
			{ label: __("New Purchase → Finished Goods"), value: "purchase" },
		],
	});
	state.header.holder = mk(".is-h-holder", { fieldtype: "Link", label: __("Held By (Party)"), fieldname: "customer", options: "Customer" });
	state.header.supplier = mk(".is-h-supplier", { fieldtype: "Link", label: __("Supplier (purchase mode)"), fieldname: "supplier", options: "Supplier" });
	state.header.remarks = mk(".is-h-remarks", { fieldtype: "Data", label: __("Remarks"), fieldname: "remarks" });
	state.header.mode.set_value("issue");
	frappe.db.get_value("Customer", "JD Stock", "name").then((r) => {
		if (r.message && r.message.name && !state.header.holder.get_value()) state.header.holder.set_value("JD Stock");
	});
	frappe.db.get_value("Supplier", "JD Stock", "name").then((r) => {
		if (r.message && r.message.name) state.header.supplier.set_value("JD Stock");
	});
	state.header.mode.$input.on("change", () => {
		$(page.main).find(".is-h-supplier").toggle(state.header.mode.get_value() === "purchase");
	});
	$(page.main).find(".is-h-supplier").hide();

	frappe.db.get_list("Charge Category", { filters: { disabled: 0 }, pluck: "name", limit: 100 })
		.then((names) => { state.cats = names || []; });
	// Size dropdown follows the design's TYPE (Setup -> Design Types size lists)
	frappe.call({ method: "jewelima.jewelima.api.get_design_types_with_sizes" }).then((r) => {
		(r.message || []).forEach((t) => (state.typeSizes[t.design_type] = { sizes: t.sizes || [], default: t.default || "" }));
	});

	const $body = $(page.main).find(".is-body");

	function stoneChip(row) {
		const st = row.stones || [];
		if (!st.length) return __("+ stones");
		const pcs = st.reduce((s, x) => s + (parseInt(x.pcs, 10) || 0), 0);
		const ct = st.reduce((s, x) => s + (parseFloat(x.ct) || 0), 0);
		return `<span class="on">${pcs} ${__("pcs")} · ${ct.toFixed(3)} ct</span>`;
	}
	function worksChip(row) {
		const t = row.tags || [];
		return t.length ? `<span class="on">${esc(t.join(", "))}</span>` : __("+ works");
	}

	function recalcGold(row) {
		// gold = gross − stones (ct × 0.2) — the same conversion used everywhere
		const gross = parseFloat(row.gross);
		if (isNaN(gross)) return;
		const stoneG = (row.stones || []).reduce((t, x) => t + (parseFloat(x.ct) || 0) * 0.2, 0);
		row.gold = Math.max(0, gross - stoneG).toFixed(3);
		row.$tr.find(".c-gold").val(row.gold);
	}

	function paint(row) {
		const ok = row.design && row.karat && parseFloat(row.gold) > 0 && parseFloat(row.gross) > 0 &&
			parseFloat(row.gross) + 0.0005 >= parseFloat(row.gold);
		const partial = row.design || row.karat || parseFloat(row.gold) > 0 || parseFloat(row.gross) > 0;
		row.$tr.toggleClass("is-ok", !!ok).toggleClass("is-bad", !ok && !!partial);
		row.ok = !!ok;
		$(page.main).find(".is-count").text(state.rows.filter((r) => r.ok).length);
	}

	function addRow(preset) {
		const row = Object.assign({ design: "", karat: "", gold: "", gross: "", huid: "", cert: "", size: "", stones: [], tags: [] }, preset || {});
		const $tr = $(`<tr>
			<td class="is-num">${state.rows.length + 1}</td>
			<td class="c-design"></td><td class="c-karat"></td>
			<td><input class="c-gold" type="number" step="0.001" min="0" placeholder="auto"></td>
			<td><input class="c-gross" type="number" step="0.001" min="0"></td>
			<td><span class="is-chipbtn c-stones"></span></td>
			<td><input class="c-huid" maxlength="12"></td>
			<td><input class="c-cert"></td>
			<td><select class="c-size"></select></td>
			<td><span class="is-chipbtn c-works"></span></td>
			<td style="white-space:nowrap"><button class="is-dup" title="${__("Duplicate row")}">⧉</button><button class="is-x" title="${__("Remove")}">✕</button></td>
		</tr>`).appendTo($body);
		row.$tr = $tr;

		function setSizeOptions(keep) {
			const t = state.typeSizes[row.designType] || { sizes: [], default: "" };
			const opts = t.sizes.length ? t.sizes : ["NA"];
			const $s = $tr.find(".c-size");
			$s.html(['<option value=""></option>'].concat(opts.map((o) => `<option>${esc(o)}</option>`)).join(""));
			row.size = keep && opts.includes(keep) ? keep : (t.default || "");
			$s.val(row.size);
		}
		row.cDesign = frappe.ui.form.make_control({
			df: { fieldtype: "Link", fieldname: "design", options: "Design", placeholder: __("Design"),
				onchange: () => {
					row.design = row.cDesign.get_value();
					if (row.design) {
						frappe.db.get_value("Design", row.design, "design_type").then((r) => {
							row.designType = (r.message || {}).design_type || "";
							setSizeOptions(row.size);
						});
					}
					paint(row);
					maybeGrow();
				} },
			parent: $tr.find(".c-design").get(0), render_input: true,
		});
		row.cKarat = frappe.ui.form.make_control({
			df: { fieldtype: "Link", fieldname: "karat", options: "Item", placeholder: __("22KYG"),
				get_query: () => ({ filters: { item_group: ["like", "GOLD%"], disabled: 0 } }),
				onchange: () => { row.karat = row.cKarat.get_value(); paint(row); } },
			parent: $tr.find(".c-karat").get(0), render_input: true,
		});
		if (row.design) row.cDesign.set_value(row.design);
		if (row.karat) row.cKarat.set_value(row.karat);
		$tr.find(".c-gold").val(row.gold).on("input", function () { row.gold = this.value; paint(row); });
		$tr.find(".c-gross").val(row.gross).on("input", function () { row.gross = this.value; recalcGold(row); paint(row); });
		$tr.find(".c-huid").val(row.huid).on("input", function () { row.huid = this.value.toUpperCase(); this.value = row.huid; });
		$tr.find(".c-cert").val(row.cert).on("input", function () { row.cert = this.value; });
		setSizeOptions(row.size);
		$tr.find(".c-size").on("change", function () { row.size = this.value; });
		$tr.find(".c-stones").html(stoneChip(row)).on("click", () => stonesDialog(row));
		$tr.find(".c-works").html(worksChip(row)).on("click", () => worksDialog(row));
		$tr.find(".is-dup").on("click", () => {
			addRow({ design: row.design, karat: row.karat, gold: row.gold, gross: row.gross, size: row.size,
				designType: row.designType,
				stones: (row.stones || []).map((s) => Object.assign({}, s)), tags: (row.tags || []).slice() });
		});
		$tr.find(".is-x").on("click", () => {
			state.rows = state.rows.filter((r) => r !== row);
			$tr.remove();
			renumber();
			paintAll();
		});
		state.rows.push(row);
		paint(row);
		return row;
	}
	function renumber() {
		$body.find("tr").each(function (i) { $(this).find(".is-num").text(i + 1); });
	}
	function paintAll() {
		state.rows.forEach(paint);
	}
	function maybeGrow() {
		const last = state.rows[state.rows.length - 1];
		if (!last || last.design) addRow();
	}

	function stonesDialog(row) {
		const fields = [{
			fieldname: "stones", fieldtype: "Table", label: __("Stones in this piece"), cannot_add_rows: false,
			in_place_edit: true, data: (row.stones || []).map((s) => Object.assign({}, s)),
			fields: [
				{ fieldname: "item", fieldtype: "Link", label: __("Stone"), options: "Item", in_list_view: 1, columns: 5,
				  get_query: () => ({ filters: { stone_type: ["!=", ""], disabled: 0 } }) },
				{ fieldname: "pcs", fieldtype: "Int", label: __("Pcs"), in_list_view: 1, columns: 2 },
				{ fieldname: "ct", fieldtype: "Float", label: __("Carat"), in_list_view: 1, columns: 3, precision: 3 },
			],
		}];
		const d = new frappe.ui.Dialog({
			title: __("Stones — actual weights"), fields, size: "large",
			primary_action_label: __("Set"),
			primary_action: (v) => {
				row.stones = (v.stones || []).filter((s) => s.item && flt(s.ct) > 0 && cint(s.pcs) > 0)
					.map((s) => ({ item: s.item, pcs: cint(s.pcs), ct: flt(s.ct) }));
				row.$tr.find(".c-stones").html(stoneChip(row));
				recalcGold(row);
				paint(row);
				d.hide();
			},
		});
		d.show();
	}

	function worksDialog(row) {
		if (!state.cats.length) {
			frappe.msgprint(__("No Charge Categories defined."));
			return;
		}
		const d = new frappe.ui.Dialog({
			title: __("Special works / charge categories"),
			fields: [{ fieldname: "tags", fieldtype: "MultiCheck", label: __("Applies to this piece"), columns: 2,
				options: state.cats.map((c) => ({ label: c, value: c, checked: (row.tags || []).includes(c) })) }],
			primary_action_label: __("Set"),
			primary_action: () => {
				row.tags = d.fields_dict.tags.get_checked_options();
				row.$tr.find(".c-works").html(worksChip(row));
				d.hide();
			},
		});
		d.show();
	}

	function doImport() {
		const pieces = state.rows.filter((r) => r.ok).map((r) => ({
			design: r.design, karat: r.karat, gold: flt(r.gold), gross: flt(r.gross),
			size: r.size || "", huid: r.huid || "", certifications: r.cert || "",
			stones: r.stones || [], tags: r.tags || [],
		}));
		if (!pieces.length) {
			frappe.msgprint(__("No complete rows — each piece needs a Design, Karat, Gold g and Gross g."));
			return;
		}
		const customer = state.header.holder.get_value();
		if (!customer) {
			frappe.msgprint(__("Pick who holds these pieces (JD Stock = ourselves)."));
			return;
		}
		const mode = state.header.mode.get_value();
		frappe.confirm(
			__("Import {0} piece(s) held by {1}?<br>{2}", [pieces.length, esc(customer),
				mode === "purchase" ? __("A Purchase Receipt posts straight into Finished Goods.") : __("Materials are consumed from Gold/Stone Issue stock.")]),
			() => {
				frappe.dom.freeze(__("Importing..."));
				frappe.call({
					method: "jewelima.jewelima.api.import_finished_stock",
					args: { payload: { mode, customer, supplier: state.header.supplier.get_value(), remarks: state.header.remarks.get_value(), pieces } },
				}).then((r) => {
					frappe.dom.unfreeze();
					const m = r.message || {};
					frappe.msgprint({
						title: __("Imported"), indicator: "green",
						message: __("{0} piece(s) now In Stock under <a href='/app/job-order/{1}'>{1}</a> (held by {2}).<br>Stock entry: {3}<br><br>{4}<br><br><a href='/app/print-barcode'>Print Barcode</a>",
							[m.bags.length, m.job_order, esc(customer), esc(m.stock_doc || ""), m.bags.map(esc).join(", ")]),
					});
					state.rows = [];
					$body.empty();
					addRow();
				}).catch(() => frappe.dom.unfreeze());
			}
		);
	}

	page.set_primary_action(__("Import Stock"), doImport);
	page.add_inner_button(__("Add Row"), () => addRow());
	addRow();
};
