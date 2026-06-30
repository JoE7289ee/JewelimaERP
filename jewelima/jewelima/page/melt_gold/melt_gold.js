// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Melting — blend gold sources (999, 995, scrap…) + alloy into a karat gold.
//   • "Gold Issue" warehouse picker is limited to is_melt_warehouse warehouses.
//   • Enter the grams you NEED (output); pick the karat to create (its purity = target).
//   • The materials table starts empty; tick stock rows on the right to add them as sources.
//   • Each gold source is sized by an EVEN split to hit the required grams at the target
//     purity; alloy balances. Edit any weight to override — the rest re-solve.
//   • "Strict out" locks the required grams (output = required). Unticked, the output floats:
//     add more of a source and it shows what you can actually get. "No loss" as before.
// MELT posts a Repack Stock Entry. Route: /app/melt-gold

frappe.pages["melt-gold"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Melting", single_column: true });
	const S = { rows: [], out: { purity: 0 }, stock: [] };

	$(page.main).append(`
		<style>
		.ml-page{display:flex;flex-direction:column;gap:20px;}
		.ml-left{width:100%;}
		.ml-right{width:100%;}
		.ml-bar{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px 16px;margin:2px 0 10px;align-items:end;}
		.ml-bar .help-box,.ml-bar .description{display:none !important;}
		.ml-bar .frappe-control{margin:0;}
		.ml-opts{display:flex;gap:22px;margin:0 2px 12px;font-size:13px;}
		.ml-opts label{display:flex;align-items:center;gap:6px;color:var(--text-color);cursor:pointer;margin:0;}
		.ml-opts .ml-help{color:var(--text-muted);font-size:11px;}
		.ml-card{border:1px solid var(--border-color);border-radius:10px;padding:14px 16px;background:var(--fg-color);}
		table.ml-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;}
		table.ml-tbl th{color:var(--text-muted);font-weight:600;text-align:left;padding:0 8px 6px;border-bottom:1px solid var(--border-color);white-space:nowrap;}
		table.ml-tbl th.num,table.ml-tbl td.num{text-align:right;}
		table.ml-tbl td{padding:6px 8px;border-bottom:1px solid var(--border-color);vertical-align:middle;}
		table.ml-tbl tr.locked td{background:var(--bg-light-gray,#f6f4ec);}
		table.ml-tbl input.ml-wt{width:110px;text-align:right;border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);padding:2px 6px;height:28px;border-radius:4px;box-sizing:border-box;color:var(--text-color);font-size:13px;}
		table.ml-tbl .pur{color:var(--text-color);font-variant-numeric:tabular-nums;}
		table.ml-tbl td.avail{color:var(--text-muted);font-variant-numeric:tabular-nums;}
		table.ml-tbl tr.over td.avail{color:#b00020;font-weight:600;}
		table.ml-tbl input.ml-wt.over{border-color:#b00020;color:#b00020;}
		.ml-warn.err{color:#b00020;}
		.ml-full{padding:0 9px;}
		.ml-empty{color:var(--text-muted);text-align:center;padding:18px 8px !important;}
		.ml-rm{padding:0 7px;}
		.ml-sum{display:flex;gap:22px;flex-wrap:wrap;margin:14px 2px 4px;font-size:13px;color:var(--text-muted);}
		.ml-sum b{color:var(--text-color);font-variant-numeric:tabular-nums;}
		.ml-outrow{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:14px;padding-top:14px;border-top:2px solid var(--gray-300,#d1d8dd);font-size:14px;}
		.ml-outrow input.ml-outwt{width:120px;text-align:right;border:1px solid var(--gray-400,#aeb6bf);padding:2px 6px;height:30px;border-radius:4px;box-sizing:border-box;font-size:14px;}
		.ml-outrow input.ml-outwt:disabled{background:var(--control-bg);color:var(--text-muted);}
		.ml-outrow .loss{color:var(--text-muted);}
		.ml-outrow .loss b{color:var(--text-color);}
		.ml-warn{color:#9a6700;font-size:12px;margin-left:auto;text-align:right;max-width:300px;}
		.ml-hint{margin:8px 2px 0;color:var(--text-muted);font-size:12px;}
		.ml-stock-head{font-weight:700;font-size:15px;margin:0 0 8px;display:flex;justify-content:space-between;align-items:baseline;gap:10px;}
		.ml-stock-head span{color:var(--text-muted);font-weight:400;font-size:12px;white-space:nowrap;}
		.ml-stock-box{border:1px solid var(--border-color);border-radius:8px;overflow:auto;max-height:62vh;}
		table.ml-stock-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:12px;background:var(--fg-color);}
		table.ml-stock-tbl th{position:sticky;top:0;z-index:1;background:var(--control-bg,var(--fg-color));border-bottom:1px solid var(--gray-400,#aeb6bf);padding:5px 8px;text-align:left;font-weight:700;white-space:nowrap;}
		table.ml-stock-tbl th.num,table.ml-stock-tbl td.num{text-align:right;}
		table.ml-stock-tbl td{border-bottom:1px solid var(--border-color);padding:4px 8px;white-space:nowrap;}
		table.ml-stock-tbl td.num{font-variant-numeric:tabular-nums;}
		table.ml-stock-tbl tr:hover td{background:var(--control-bg);}
		table.ml-stock-tbl tr.picked td{background:var(--bg-light-gray,#eef3ee);}
		.ml-stock-cb{cursor:pointer;width:15px;height:15px;}
		.ml-stock-empty{padding:16px;color:var(--text-muted);text-align:center;}
		</style>
		<div class="ml-page">
			<div class="ml-left">
				<div class="ml-bar">
					<div class="ml-wh"></div>
					<div class="ml-out"></div>
					<div class="ml-req"></div>
				</div>
				<div class="ml-opts">
					<label><input type="checkbox" class="ml-strict" checked> Strict out <span class="ml-help">lock the required grams</span></label>
					<label><input type="checkbox" class="ml-noloss" checked> No loss</label>
				</div>
				<div class="ml-card">
					<table class="ml-tbl">
						<thead><tr><th style="width:40%">Material</th><th class="num" style="width:18%">Purity %</th><th class="num" style="width:24%">Weight (g)</th><th class="num" style="width:16%">Available</th><th style="width:30px"></th></tr></thead>
						<tbody class="ml-body"><tr><td colspan="5" class="ml-empty">Tick stock on the right to add materials.</td></tr></tbody>
					</table>
					<div class="ml-sum">
						<span>Total in <b class="ml-tin">0.000 g</b></span>
						<span>Current purity <b class="ml-cur">—</b></span>
						<span>Target purity <b class="ml-exp">—</b></span>
					</div>
					<div class="ml-outrow">
						<span>Output &nbsp;&rarr;&nbsp;</span>
						<input type="number" min="0" step="0.001" class="ml-outwt" placeholder="grams">
						<span class="loss">Loss <b class="ml-loss">0.000 g</b></span>
						<span class="ml-warn"></span>
					</div>
				</div>
				<div class="ml-hint">Pick the karat to create (its purity is the target), enter the grams you need, then tick gold + alloy from the stock below — or hit “Full” to use all of an item (capped at what's needed). Edit any weight to override; the rest re-balance. You can't melt more than the available stock.</div>
			</div>
			<div class="ml-right">
				<div class="ml-stock-head">Stock <span class="ml-stock-wh"></span></div>
				<div class="ml-stock-box">
					<table class="ml-stock-tbl">
						<thead><tr><th style="width:26px"></th><th>Item</th><th>Group</th><th class="num">Purity</th><th class="num">Available</th><th class="num">Pure</th><th style="width:64px"></th></tr></thead>
						<tbody class="ml-stock-body"><tr><td colspan="7" class="ml-stock-empty">Pick a warehouse</td></tr></tbody>
					</table>
				</div>
			</div>
		</div>
	`);

	const root = $(page.main)[0];
	const q = (s) => root.querySelector(s);
	const mk = (sel, df) => { const c = frappe.ui.form.make_control({ df, parent: root.querySelector(sel), render_input: true }); c.refresh(); return c; };
	const fmt = (n) => flt(n).toFixed(3);

	const whCtl = mk(".ml-wh", { fieldtype: "Link", label: "Gold Issue", fieldname: "warehouse", options: "Warehouse", reqd: 1, get_query: () => ({ filters: { is_melt_warehouse: 1, is_group: 0 } }) });
	const outCtl = mk(".ml-out", { fieldtype: "Link", label: "Create (karat gold)", fieldname: "out", options: "Item", reqd: 1, get_query: () => ({ filters: { item_group: "GOLD", metal_purity: ["!=", ""] } }) });
	const reqCtl = mk(".ml-req", { fieldtype: "Float", label: "Required (g)", fieldname: "required", precision: "3" });
	const strict = q(".ml-strict"), noLoss = q(".ml-noloss"), outWt = q(".ml-outwt");

	// default to the first melt warehouse so the stock panel isn't empty
	frappe.db.get_value("Warehouse", { is_melt_warehouse: 1, is_group: 0 }, "name").then((r) => {
		const wh = (r.message || {}).name;
		if (wh) { whCtl.set_value(wh); loadStock(wh); }
	});

	function pur(item, cb) {
		if (!item) return cb(0);
		frappe.db.get_value("Item", item, "purity_percentage").then((r) => cb(flt((r.message || {}).purity_percentage)));
	}

	// ---- the blend solver -----------------------------------------------------
	// Free (unlocked) gold rows even-split to provide the pure gold the output needs;
	// alloy balances. Strict: alloy fills weight to the required grams (output = required).
	// Non-strict: alloy fills to the target purity (output floats with the inputs).
	function solve() {
		const T = S.out.purity, Tf = T / 100, W = flt(reqCtl.get_value());
		const golds = S.rows.filter((r) => r.purity > 0.001);
		const alloys = S.rows.filter((r) => r.purity <= 0.001);
		const pureNeeded = W * Tf;

		const lockedGoldPure = golds.filter((r) => r.locked).reduce((s, r) => s + flt(r.weight) * r.purity / 100, 0);
		const freeGolds = golds.filter((r) => !r.locked);
		const sumFreePf = freeGolds.reduce((s, r) => s + r.purity / 100, 0);
		const g = sumFreePf > 0 ? Math.max((pureNeeded - lockedGoldPure) / sumFreePf, 0) : 0;
		freeGolds.forEach((r) => (r.weight = g));

		const totalGold = golds.reduce((s, r) => s + flt(r.weight), 0);
		const totalGoldPure = golds.reduce((s, r) => s + flt(r.weight) * r.purity / 100, 0);
		const lockedAlloyWt = alloys.filter((r) => r.locked).reduce((s, r) => s + flt(r.weight), 0);
		const want = strict.checked ? W : (Tf > 0 ? totalGoldPure / Tf : totalGold);
		let alloyTot = Math.max(want - totalGold - lockedAlloyWt, 0);
		const freeAlloys = alloys.filter((r) => !r.locked);
		if (freeAlloys.length) { const a = alloyTot / freeAlloys.length; freeAlloys.forEach((r) => (r.weight = a)); }

		// push computed weights into the free rows' inputs (never the one being edited)
		S.rows.forEach((r) => { if (!r.locked && r.$wt) r.$wt.value = r.weight ? fmt(r.weight) : ""; });
		// flag any row that exceeds its available stock — you can't melt more than you have
		S.rows.forEach((r) => {
			const over = flt(r.weight) > flt(r.available) + 0.0005;
			if (r.$tr) r.$tr.classList.toggle("over", over);
			if (r.$wt) r.$wt.classList.toggle("over", over);
		});
		updateSummary();
	}

	function updateSummary() {
		const T = S.out.purity;
		const totalIn = S.rows.reduce((s, r) => s + flt(r.weight), 0);
		const pure = S.rows.reduce((s, r) => s + flt(r.weight) * r.purity / 100, 0);
		q(".ml-tin").textContent = fmt(totalIn) + " g";
		const cur = totalIn > 0 ? pure / totalIn * 100 : 0;
		q(".ml-cur").textContent = totalIn > 0 ? cur.toFixed(2) + "%" : "—";
		q(".ml-exp").textContent = T ? T.toFixed(2) + "%" : "—";
		if (noLoss.checked) { outWt.value = totalIn ? fmt(totalIn) : ""; outWt.disabled = true; }
		else outWt.disabled = false;
		const loss = totalIn - flt(outWt.value);
		q(".ml-loss").textContent = fmt(loss) + " g";
		const over = S.rows.filter((r) => flt(r.weight) > flt(r.available) + 0.0005);
		let warn = "";
		if (over.length) warn = `Not enough stock: ${over.map((r) => r.item + " (have " + fmt(r.available) + " g)").join(", ")}.`;
		else if (T && totalIn > 0 && Math.abs(cur - T) > 0.05) warn = `Blend is ${cur.toFixed(2)}% vs target ${T.toFixed(2)}% — add/adjust alloy or gold.`;
		q(".ml-warn").textContent = warn;
		q(".ml-warn").classList.toggle("err", !!over.length);
	}

	// ---- materials table ------------------------------------------------------
	function renderMaterials() {
		const body = q(".ml-body");
		if (!S.rows.length) { body.innerHTML = '<tr><td colspan="5" class="ml-empty">Tick stock on the right to add materials.</td></tr>'; return; }
		body.innerHTML = "";
		S.rows.forEach((r) => {
			const tr = document.createElement("tr");
			const purTxt = r.purity ? r.purity.toFixed(2) + "%" : (r.group === "ALLOY" ? "alloy" : "—");
			tr.innerHTML = `<td>${frappe.utils.escape_html(r.item)}</td>`
				+ `<td class="num pur">${purTxt}</td>`
				+ `<td class="num"><input type="number" min="0" step="0.001" class="ml-wt"></td>`
				+ `<td class="num avail">${fmt(r.available)}</td>`
				+ `<td class="num"><button class="btn btn-xs btn-default ml-rm" title="Remove">&times;</button></td>`;
			body.appendChild(tr);
			r.$tr = tr; r.$wt = tr.querySelector(".ml-wt");
			r.$wt.value = r.weight ? fmt(r.weight) : "";
			tr.classList.toggle("locked", !!r.locked);
			r.$wt.addEventListener("input", () => { r.locked = true; r.weight = flt(r.$wt.value); tr.classList.add("locked"); solve(); });
			tr.querySelector(".ml-rm").addEventListener("click", () => removeSource(r.item));
		});
	}

	function addSource(x) {
		if (S.rows.some((r) => r.item === x.item)) return;
		S.rows.push({ item: x.item, purity: flt(x.purity), group: x.item_group || "", available: flt(x.weight), uom: x.uom || "Gram", weight: 0, locked: false });
		renderMaterials(); solve();
		markStockRow(x.item, true);
	}
	function removeSource(item) {
		S.rows = S.rows.filter((r) => r.item !== item);
		renderMaterials(); solve();
		markStockRow(item, false);
	}
	function markStockRow(item, on) {
		const cb = root.querySelector(`.ml-stock-cb[data-item="${(window.CSS && CSS.escape) ? CSS.escape(item) : item}"]`);
		if (cb) { cb.checked = on; cb.closest("tr").classList.toggle("picked", on); }
	}

	// "Full": use this item up to what the blend needs, capped at its available stock — so if
	// 20 g is left it uses 20, and if 100 g is there but only 20 is needed it takes 20. Adds the
	// row first if needed, then locks it (the rest re-balance around it).
	function fullSource(x) {
		if (!x) return;
		if (!S.rows.some((r) => r.item === x.item)) addSource(x); // adds + solves -> a proposed weight
		const row = S.rows.find((r) => r.item === x.item);
		if (!row) return;
		const proposed = flt(row.weight); // what the blend wants from this item
		row.weight = Math.min(flt(row.available), proposed > 0.0005 ? proposed : flt(row.available));
		row.locked = true;
		renderMaterials();
		solve();
	}

	// ---- stock panel (with tick-to-add) ---------------------------------------
	function loadStock(whOverride) {
		const wh = whOverride || whCtl.get_value();
		q(".ml-stock-wh").textContent = wh ? wh.replace(/ - [A-Za-z]+$/, "") : "";
		const body = q(".ml-stock-body");
		if (!wh) { body.innerHTML = '<tr><td colspan="7" class="ml-stock-empty">Pick a warehouse</td></tr>'; return; }
		frappe.call({ method: "jewelima.jewelima.api.get_melt_stock", args: { warehouse: wh } }).then((r) => {
			S.stock = ((r.message || {}).rows || []).filter((x) => x.purity > 0 || x.item_group === "ALLOY"); // meltable only
			if (!S.stock.length) { body.innerHTML = '<tr><td colspan="7" class="ml-stock-empty">No gold/alloy stock here</td></tr>'; return; }
			body.innerHTML = S.stock.map((x, i) => {
				const picked = S.rows.some((r) => r.item === x.item);
				return `<tr class="${picked ? "picked" : ""}">`
					+ `<td><input type="checkbox" class="ml-stock-cb" data-idx="${i}" data-item="${frappe.utils.escape_html(x.item)}" ${picked ? "checked" : ""}></td>`
					+ `<td>${frappe.utils.escape_html(x.item)}</td><td>${frappe.utils.escape_html(x.item_group)}</td>`
					+ `<td class="num">${x.purity ? x.purity.toFixed(2) + "%" : "—"}</td>`
					+ `<td class="num">${fmt(x.weight)}${x.uom === "Carat" ? " ct" : " g"}</td>`
					+ `<td class="num">${x.pure ? fmt(x.pure) + " g" : "—"}</td>`
					+ `<td class="num"><button class="btn btn-xs btn-default ml-full" data-idx="${i}" title="Use this item — up to what's needed, capped at its available stock">Full</button></td></tr>`;
			}).join("");
			body.querySelectorAll(".ml-stock-cb").forEach((cb) => {
				cb.addEventListener("change", () => {
					const x = S.stock[+cb.getAttribute("data-idx")];
					if (x && cb.checked) addSource(x); else removeSource((x || {}).item);
				});
			});
			body.querySelectorAll(".ml-full").forEach((b) => {
				b.addEventListener("click", () => fullSource(S.stock[+b.getAttribute("data-idx")]));
			});
		});
	}

	whCtl.$input && whCtl.$input.on("change awesomplete-selectcomplete", () => setTimeout(() => {
		S.rows = []; renderMaterials(); solve(); loadStock();
	}, 60));
	outCtl.$input && outCtl.$input.on("change awesomplete-selectcomplete", () => setTimeout(() => {
		pur(outCtl.get_value(), (p) => { S.out.purity = p; solve(); });
	}, 60));
	reqCtl.$input.on("input", solve);
	strict.addEventListener("change", solve);
	noLoss.addEventListener("change", updateSummary);
	outWt.addEventListener("input", updateSummary);

	page.add_inner_button(__("Re-balance"), () => { S.rows.forEach((r) => { r.locked = false; }); renderMaterials(); solve(); });
	page.add_inner_button(__("Reset"), () => {
		S.rows = []; S.out.purity = 0; outCtl.set_value(""); reqCtl.set_value(0); strict.checked = true; noLoss.checked = true;
		renderMaterials(); solve(); loadStock();
	});

	page.set_primary_action(__("Melt"), () => {
		const warehouse = whCtl.get_value(), output_item = outCtl.get_value();
		if (!warehouse) return frappe.msgprint(__("Pick the Gold Issue warehouse."));
		if (!output_item) return frappe.msgprint(__("Pick what to create."));
		const inputs = S.rows.filter((r) => flt(r.weight) > 0).map((r) => ({ item: r.item, weight: flt(r.weight) }));
		if (!inputs.length) return frappe.msgprint(__("Tick at least one material with a weight."));
		const output_weight = flt(outWt.value);
		if (output_weight <= 0) return frappe.msgprint(__("Output weight must be greater than zero."));
		const over = S.rows.filter((r) => flt(r.weight) > flt(r.available) + 0.0005);
		if (over.length) return frappe.msgprint(__("Not enough stock: {0}. Use “Full” or lower the weight.", [over.map((r) => `${r.item} (need ${fmt(r.weight)}, have ${fmt(r.available)})`).join("; ")]));

		frappe.dom.freeze(__("Melting…"));
		frappe.call({
			method: "jewelima.jewelima.api.melt_gold",
			args: { warehouse, output_item, output_weight, inputs: JSON.stringify(inputs) },
		}).then((r) => {
			frappe.dom.unfreeze();
			const res = r.message || {};
			if (!res.name) return;
			frappe.show_alert({ message: __("Melted {0} g → {1} g of {2} (loss {3} g)", [res.total_in, res.output, output_item, res.loss]), indicator: "green" }, 7);
			frappe.msgprint({ title: __("Melt complete"), indicator: "green", message: __("Stock Entry {0} posted. <a href='/app/stock-entry/{0}'>Open</a>", [res.name]) });
			S.rows = []; renderMaterials(); solve(); loadStock();
		}).catch(() => frappe.dom.unfreeze());
	}, "add");

	renderMaterials();
	solve();
};
