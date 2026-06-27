// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Melting — convert fine gold (e.g. Standard Gold 999) into a karat gold (22KYG, 18KPG…)
// by adding alloy, all within one warehouse. Pick the warehouse + what to create, enter the
// fine-gold weight, pick the alloy (its weight auto-calculates to hit the target purity),
// then MELT: a Repack Stock Entry consumes the inputs and produces the karat gold.
// Route: /app/melt-gold

frappe.pages["melt-gold"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Melting", single_column: true });
	const S = { gold: { purity: 0 }, alloy: { purity: 0 }, out: { purity: 0 } };

	$(page.main).append(`
		<style>
		.ml-wrap{max-width:760px;}
		.ml-bar{display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;margin:2px 0 14px;align-items:end;}
		.ml-bar .help-box,.ml-bar .description{display:none !important;}
		.ml-card{border:1px solid var(--border-color);border-radius:10px;padding:16px 18px;background:var(--fg-color);}
		table.ml-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;margin-bottom:4px;}
		table.ml-tbl th{color:var(--text-muted);font-weight:600;text-align:left;padding:0 8px 6px;border-bottom:1px solid var(--border-color);white-space:nowrap;}
		table.ml-tbl th.num,table.ml-tbl td.num{text-align:right;}
		table.ml-tbl td{padding:7px 8px;border-bottom:1px solid var(--border-color);vertical-align:middle;}
		table.ml-tbl .frappe-control,table.ml-tbl .frappe-control .form-group,table.ml-tbl .frappe-control .control-input-wrapper,table.ml-tbl .frappe-control .control-input{margin:0;}
		table.ml-tbl .frappe-control .help-box,table.ml-tbl .frappe-control .control-label,table.ml-tbl .frappe-control .link-btn{display:none !important;}
		table.ml-tbl input{width:120px;text-align:right;border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);padding:2px 6px;height:28px;border-radius:4px;box-sizing:border-box;color:var(--text-color);font-size:13px;}
		table.ml-tbl input:disabled{background:var(--control-bg);color:var(--text-muted);}
		table.ml-tbl .pur{color:var(--text-color);font-variant-numeric:tabular-nums;}
		.ml-sum{display:flex;gap:22px;flex-wrap:wrap;margin:14px 2px 4px;font-size:13px;color:var(--text-muted);}
		.ml-sum b{color:var(--text-color);font-variant-numeric:tabular-nums;}
		.ml-sum b.warn{color:#b00020;}
		.ml-outrow{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:14px;padding-top:14px;border-top:2px solid var(--gray-300,#d1d8dd);font-size:14px;}
		.ml-outrow .oname{font-weight:700;color:var(--text-color);}
		.ml-outrow input.ml-outwt{width:120px;text-align:right;border:1px solid var(--gray-400,#aeb6bf);padding:2px 6px;height:30px;border-radius:4px;box-sizing:border-box;font-size:14px;}
		.ml-outrow label{display:flex;align-items:center;gap:5px;color:var(--text-muted);cursor:pointer;margin:0;}
		.ml-outrow .loss{margin-left:auto;color:var(--text-muted);}
		.ml-outrow .loss b{color:var(--text-color);}
		.ml-hint{margin:6px 2px 0;color:var(--text-muted);font-size:12px;}
		</style>
		<div class="ml-wrap">
			<div class="ml-bar"><div class="ml-wh"></div><div class="ml-out"></div></div>
			<div class="ml-card">
				<table class="ml-tbl">
					<thead><tr><th style="width:46%">Material</th><th class="num" style="width:24%">Purity %</th><th class="num" style="width:30%">Weight (g)</th></tr></thead>
					<tbody>
						<tr><td class="ml-gold-item"></td><td class="num pur ml-gold-pur">—</td><td class="num"><input type="number" min="0" step="0.001" class="ml-gold-wt" placeholder="grams"></td></tr>
						<tr><td class="ml-alloy-item"></td><td class="num pur ml-alloy-pur">—</td><td class="num"><input type="number" min="0" step="0.001" class="ml-alloy-wt" placeholder="auto"></td></tr>
					</tbody>
				</table>
				<div class="ml-sum">
					<span>Current purity <b class="ml-cur">—</b></span>
					<span>Expected purity <b class="ml-exp">—</b></span>
					<span>Total in <b class="ml-tin">0.000 g</b></span>
				</div>
				<div class="ml-outrow">
					<span>Create <span class="oname ml-outname">— pick an item above —</span> &nbsp;&rarr;&nbsp;</span>
					<input type="number" min="0" step="0.001" class="ml-outwt" placeholder="grams">
					<label><input type="checkbox" class="ml-noloss" checked> No loss</label>
					<span class="loss">Loss <b class="ml-loss">0.000 g</b></span>
				</div>
			</div>
			<div class="ml-hint">Alloy weight auto-fills to bring the fine gold down to the target purity. Tick “No loss” to set the output to the full melted weight; untick to record a melt loss.</div>
		</div>
	`);

	const root = $(page.main)[0];
	const q = (s) => root.querySelector(s);
	const mk = (sel, df) => { const c = frappe.ui.form.make_control({ df, parent: root.querySelector(sel), render_input: true }); c.refresh(); return c; };

	// header: warehouse (source + destination) and "what to create"
	const whCtl = mk(".ml-wh", { fieldtype: "Link", label: "Warehouse", fieldname: "warehouse", options: "Warehouse", reqd: 1, get_query: () => ({ filters: { is_group: 0 } }) });
	const outCtl = mk(".ml-out", { fieldtype: "Link", label: "Create (karat gold)", fieldname: "out", options: "Item", reqd: 1, get_query: () => ({ filters: { item_group: "GOLD", metal_purity: ["!=", ""] } }) });
	// in-table item pickers
	const goldCtl = mk(".ml-gold-item", { fieldtype: "Link", fieldname: "gold", options: "Item", placeholder: "Fine gold", get_query: () => ({ filters: { item_group: "GOLD", purity_percentage: [">", 0] } }) });
	const alloyCtl = mk(".ml-alloy-item", { fieldtype: "Link", fieldname: "alloy", options: "Item", placeholder: "Alloy", get_query: () => ({ filters: { item_group: "ALLOY" } }) });

	const goldWt = q(".ml-gold-wt"), alloyWt = q(".ml-alloy-wt"), outWt = q(".ml-outwt"), noLoss = q(".ml-noloss");

	frappe.db.get_value("Warehouse", { warehouse_name: "Raw Materials Store" }, "name").then((r) => { if (r.message && r.message.name) whCtl.set_value(r.message.name); });
	frappe.db.get_value("Item", "Standard Gold 999", "purity_percentage").then((r) => {
		if (!r.message) return;
		goldCtl.set_value("Standard Gold 999"); S.gold.purity = flt(r.message.purity_percentage);
		q(".ml-gold-pur").textContent = S.gold.purity.toFixed(2) + "%"; recompute();
	});
	frappe.db.get_value("Item", "Alloy", "purity_percentage").then((r) => {
		if (!r.message) return;
		alloyCtl.set_value("Alloy"); S.alloy.purity = flt(r.message.purity_percentage);
		q(".ml-alloy-pur").textContent = S.alloy.purity.toFixed(2) + "%"; recompute();
	});

	function pur(item, cb) {
		if (!item) return cb(0);
		frappe.db.get_value("Item", item, "purity_percentage").then((r) => cb(flt((r.message || {}).purity_percentage)));
	}
	const fmt = (n) => (flt(n)).toFixed(3) + " g";

	// alloy weight to bring fine gold (G, purity pf) down to target Tf, alloy purity paf:
	//   A = G·(pf − Tf) / (Tf − paf)
	function autoAlloy() {
		const G = flt(goldWt.value), pf = S.gold.purity / 100, Tf = S.out.purity / 100, paf = S.alloy.purity / 100;
		if (G > 0 && Tf > 0 && Tf > paf && alloyCtl.get_value()) {
			const A = (G * (pf - Tf)) / (Tf - paf);
			alloyWt.value = A > 0 ? A.toFixed(3) : "0";
		}
		recompute();
	}

	function recompute() {
		const G = flt(goldWt.value), A = flt(alloyWt.value);
		const pure = G * (S.gold.purity / 100) + A * (S.alloy.purity / 100);
		const totalIn = G + A;
		q(".ml-tin").textContent = fmt(totalIn);
		q(".ml-cur").textContent = totalIn > 0 ? (pure / totalIn * 100).toFixed(2) + "%" : "—";
		q(".ml-exp").textContent = S.out.purity ? S.out.purity.toFixed(2) + "%" : "—";
		if (noLoss.checked) { outWt.value = totalIn ? totalIn.toFixed(3) : ""; outWt.disabled = true; }
		else outWt.disabled = false;
		const loss = totalIn - flt(outWt.value);
		const $loss = q(".ml-loss");
		$loss.textContent = fmt(loss);
		$loss.classList.toggle("warn", loss < -0.0005);
	}

	whCtl.df.onchange = () => {};
	outCtl.$input && outCtl.$input.on("change awesomplete-selectcomplete", () => setTimeout(() => {
		const v = outCtl.get_value();
		q(".ml-outname").textContent = v || "— pick an item above —";
		pur(v, (p) => { S.out.purity = p; autoAlloy(); });
	}, 60));
	goldCtl.$input && goldCtl.$input.on("change awesomplete-selectcomplete", () => setTimeout(() => {
		pur(goldCtl.get_value(), (p) => { S.gold.purity = p; q(".ml-gold-pur").textContent = p ? p.toFixed(2) + "%" : "—"; autoAlloy(); });
	}, 60));
	alloyCtl.$input && alloyCtl.$input.on("change awesomplete-selectcomplete", () => setTimeout(() => {
		pur(alloyCtl.get_value(), (p) => { S.alloy.purity = p; q(".ml-alloy-pur").textContent = (p || p === 0) ? p.toFixed(2) + "%" : "—"; autoAlloy(); });
	}, 60));
	goldWt.addEventListener("input", autoAlloy);
	alloyWt.addEventListener("input", recompute);   // manual alloy override
	outWt.addEventListener("input", recompute);
	noLoss.addEventListener("change", recompute);
	recompute();

	page.set_primary_action(__("Melt"), () => {
		const warehouse = whCtl.get_value(), output_item = outCtl.get_value();
		if (!warehouse) return frappe.msgprint(__("Pick a warehouse."));
		if (!output_item) return frappe.msgprint(__("Pick what to create."));
		const inputs = [];
		if (goldCtl.get_value() && flt(goldWt.value) > 0) inputs.push({ item: goldCtl.get_value(), weight: flt(goldWt.value) });
		if (alloyCtl.get_value() && flt(alloyWt.value) > 0) inputs.push({ item: alloyCtl.get_value(), weight: flt(alloyWt.value) });
		if (!inputs.length) return frappe.msgprint(__("Enter the fine-gold weight (and alloy)."));
		const output_weight = flt(outWt.value);
		if (output_weight <= 0) return frappe.msgprint(__("Output weight must be greater than zero."));

		frappe.dom.freeze(__("Melting…"));
		frappe.call({
			method: "jewelima.jewelima.api.melt_gold",
			args: { warehouse, output_item, output_weight, inputs: JSON.stringify(inputs) },
		}).then((r) => {
			frappe.dom.unfreeze();
			const res = r.message || {};
			if (!res.name) return;
			frappe.show_alert({ message: __("Melted {0} g → {1} g of {2} (loss {3} g)", [res.total_in, res.output, output_item, res.loss]), indicator: "green" }, 7);
			frappe.msgprint({ title: __("Melt complete"), indicator: "green",
				message: __("Stock Entry {0} posted. <a href='/app/stock-entry/{0}'>Open</a>", [res.name]) });
			goldWt.value = ""; alloyWt.value = ""; recompute();
		}).catch(() => frappe.dom.unfreeze());
	}, "add");
};
