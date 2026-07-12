// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Loss Collection (Stock) — book a refining recovery WITHOUT sending gold away.
// Everything speaks PURE GOLD: one row per -LOSS warehouse (materials stay
// hidden), tick where the recovery came from, and the needed pure splits
// EQUALLY across the ticked benches (capped by what each holds; overflow
// re-spreads). Per-bench takes stay editable. Confirm posts ONE Repack — the
// take expands to item grams behind the scenes (taking X% of a bench's pure =
// X% of each of its items' grams). Route: /app/loss-collection

frappe.pages["loss-collection"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Loss Collection", single_column: true });
	const API = "jewelima.jewelima.api";
	const S = { whs: [], outPurity: 99.9 };
	const esc = frappe.utils.escape_html;
	const fmt = (v) => flt(v).toFixed(3);

	$(page.main).append(`
		<style>
		.lc-top{display:flex;align-items:flex-end;gap:12px;margin:2px 0 10px;flex-wrap:wrap;}
		.lc-top .frappe-control{margin:0;}
		.lc-top .control-label{font-size:11px;margin:0 0 1px;color:var(--text-muted);}
		.lc-top .help-box,.lc-top .description{display:none !important;}
		.lc-item{width:190px;}.lc-got{width:130px;}.lc-wh{width:230px;}.lc-remarks{width:220px;}
		.lc-bal{margin:0 0 10px;padding:7px 12px;border-radius:7px;font-size:12.5px;display:flex;gap:16px;flex-wrap:wrap;align-items:center;}
		.lc-bal.ok{background:#eaf6ec;color:#1d7a33;border:1px solid #bfe3c6;}
		.lc-bal.off{background:#fdf3e3;color:#9a6700;border:1px solid #f0d9a8;}
		.lc-bal b{font-variant-numeric:tabular-nums;}
		.lc-box{border:1px solid var(--border-color);border-radius:8px;background:var(--fg-color);overflow:auto;max-height:calc(100vh - 300px);}
		table.lc-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;}
		table.lc-tbl th{position:sticky;top:0;z-index:1;background:var(--control-bg,var(--fg-color));border-bottom:1px solid var(--gray-400,#aeb6bf);padding:5px 10px;text-align:left;white-space:nowrap;font-weight:700;}
		table.lc-tbl td{border-bottom:1px solid var(--border-color);padding:6px 10px;white-space:nowrap;font-variant-numeric:tabular-nums;}
		table.lc-tbl td.r,table.lc-tbl th.r{text-align:right;}
		table.lc-tbl tr.on td{background:#fdf6f6;}
		table.lc-tbl input.lc-g{width:110px;border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);border-radius:4px;height:27px;padding:1px 8px;font-size:12.5px;text-align:right;color:var(--text-color);box-sizing:border-box;font-weight:700;}
		.lc-wh-name{font-weight:800;font-size:13.5px;}
		.lc-sub{color:var(--text-muted);font-size:11px;}
		.lc-pure{color:#8a6d1a;font-weight:800;}
		.lc-empty{padding:20px;text-align:center;color:var(--text-muted);}
		</style>
		<div class="lc-top">
			<div class="lc-item"></div><div class="lc-got"></div><div class="lc-wh"></div><div class="lc-remarks"></div>
			<span style="margin-left:auto;"></span>
			<button class="btn btn-sm lc-eq">${__("Split Equally")}</button>
			<button class="btn btn-primary lc-go">${__("Collect")}</button>
		</div>
		<div class="lc-bal off"></div>
		<div class="lc-box"><table class="lc-tbl">
			<thead><tr><th style="width:30px"><input type="checkbox" class="lc-all"></th>
			<th>${__("Loss Warehouse")}</th>
			<th class="r">${__("Pure Gold Available (g)")}</th>
			<th class="r">${__("Dust (g)")}</th>
			<th class="r">${__("Take Pure (g)")}</th></tr></thead>
			<tbody class="lc-rows"></tbody></table></div>
	`);
	const root = $(page.main)[0];

	const mk = (sel, df) => {
		const c = frappe.ui.form.make_control({ df, parent: $(root).find(sel).get(0), render_input: true });
		c.refresh();
		return c;
	};
	const outItem = mk(".lc-item", { fieldtype: "Link", label: __("Recovered Gold"), fieldname: "out", options: "Item",
		get_query: () => ({ filters: { item_group: "GOLD STANDARD", disabled: 0 } }),
		onchange: () => {
			const v = outItem.get_value();
			if (v) frappe.db.get_value("Item", v, "purity_percentage").then((r) => {
				S.outPurity = flt((r.message || {}).purity_percentage) || 100;
				allocate();
			});
		} });
	const got = mk(".lc-got", { fieldtype: "Float", label: __("Got (g)"), fieldname: "got" });
	const outWh = mk(".lc-wh", { fieldtype: "Link", label: __("Into Warehouse"), fieldname: "wh", options: "Warehouse",
		get_query: () => ({ filters: { is_group: 0 } }) });
	const remarks = mk(".lc-remarks", { fieldtype: "Data", label: __("Remarks"), fieldname: "remarks" });
	frappe.db.get_value("Item", "Standard Gold 999", "name").then((r) => {
		if (r.message && r.message.name) outItem.set_value("Standard Gold 999");
	});
	frappe.db.get_value("Warehouse", { warehouse_name: "Gold Issue" }, "name").then((r) => {
		if (r.message && r.message.name) outWh.set_value(r.message.name);
	});
	got.$input.on("input change", () => allocate());

	function gotGrams() {
		// read the raw input — the Float control's get_value() lags live typing
		return flt(got.$input.val());
	}

	function needPure() {
		return gotGrams() * S.outPurity / 100.0;
	}

	// EQUAL split of the needed pure across ticked benches, capped by what each
	// holds; whatever a full bench can't take re-spreads equally over the rest.
	function allocate() {
		const need = needPure();
		S.whs.forEach((w) => (w.take = 0));
		let rest = need;
		let open = S.whs.filter((w) => w.sel);
		while (rest > 0.0005 && open.length) {
			const share = rest / open.length;
			let leftover = 0;
			const next = [];
			open.forEach((w) => {
				const room = w.pure - w.take;
				if (room <= share + 0.0005) {
					w.take = w.pure;
					leftover += share - room;
				} else {
					w.take = flt((w.take + share).toFixed(3));
					next.push(w);
				}
			});
			rest = leftover;
			if (next.length === open.length) rest = 0; // everyone absorbed their share
			open = next;
		}
		paint(false);
	}

	function paint(rebuild = true) {
		const $b = $(root).find(".lc-rows");
		if (rebuild) {
			$b.html(S.whs.length ? S.whs.map((w, i) => `
				<tr data-i="${i}" class="${w.sel ? "on" : ""}">
					<td><input type="checkbox" class="lc-cb" ${w.sel ? "checked" : ""}></td>
					<td><span class="lc-wh-name">${esc(w.label)}</span>
						<div class="lc-sub">${w.items.length} ${__("material(s)")}</div></td>
					<td class="r lc-pure">${fmt(w.pure)}</td>
					<td class="r">${fmt(w.gross)}</td>
					<td class="r"><input class="lc-g" type="number" step="0.001" min="0" max="${w.pure}" value="${fmt(w.take)}" ${w.sel ? "" : "disabled"}></td>
				</tr>`).join("")
				: `<tr><td colspan="5" class="lc-empty">${__("The loss warehouses are empty.")}</td></tr>`);
		} else {
			S.whs.forEach((w, i) => {
				const $tr = $b.find(`tr[data-i="${i}"]`);
				$tr.toggleClass("on", !!w.sel);
				$tr.find(".lc-g").prop("disabled", !w.sel).val(fmt(w.take));
			});
		}
		const give = S.whs.reduce((s, w) => s + w.take, 0);
		const need = needPure();
		const ok = need > 0 && Math.abs(need - give) <= 0.01;
		$(root).find(".lc-bal").toggleClass("ok", ok).toggleClass("off", !ok).html(
			`<span>${__("Recovering")} <b>${fmt(gotGrams())} g</b> ${esc(outItem.get_value() || "")} = <b>${fmt(need)} g ${__("pure")}</b></span>
			 <span>${__("Taking from loss")}: <b>${fmt(give)} g ${__("pure")}</b></span>
			 <span>${ok ? "✓ " + __("balanced") : __("difference {0} g pure", [fmt(need - give)])}</span>`);
	}

	function load() {
		frappe.call({ method: API + ".get_loss_report" }).then((r) => {
			const d = r.message || {};
			S.whs = (d.warehouses || []).map((w) => ({
				warehouse: w.warehouse, label: w.label, gross: w.gross, pure: w.pure,
				sel: true, take: 0, // everything present starts CHECKED — just enter the weight
				items: (d.items || []).filter((it) => it.cells[w.warehouse]).map((it) => ({
					item: it.item, qty: it.cells[w.warehouse], purity: it.purity,
				})),
			}));
			paint();
			$(root).find(".lc-all").prop("checked", S.whs.length > 0);
			allocate();
		});
	}

	$(root).on("change", ".lc-cb", function () {
		S.whs[+$(this).closest("tr").attr("data-i")].sel = this.checked;
		allocate();
	});
	$(root).on("click", ".lc-all", function (e) {
		e.stopPropagation();
		S.whs.forEach((w) => (w.sel = this.checked));
		allocate();
	});
	$(root).on("input", ".lc-g", function () {
		const w = S.whs[+$(this).closest("tr").attr("data-i")];
		w.take = Math.min(w.pure, flt(this.value));
		paint(false);
	});
	$(root).find(".lc-eq").on("click", () => allocate());

	$(root).find(".lc-go").on("click", () => {
		// expand each bench's pure take into item grams: factor = take/purePool,
		// grams per item = qty x factor
		const lines = [];
		S.whs.filter((w) => w.take > 0).forEach((w) => {
			const f = Math.min(1, w.take / w.pure);
			w.items.forEach((it) => {
				const grams = flt((it.qty * f).toFixed(3));
				if (grams > 0) lines.push({ item: it.item, warehouse: w.warehouse, grams });
			});
		});
		if (!lines.length) {
			frappe.show_alert({ message: __("Tick the benches the recovery came from."), indicator: "orange" }, 4);
			return;
		}
		const benches = S.whs.filter((w) => w.take > 0).map((w) => w.label).join(", ");
		frappe.confirm(__("Book {0} g {1} recovered from: {2}?", [fmt(gotGrams()), esc(outItem.get_value() || ""), esc(benches)]), () => {
			frappe.dom.freeze(__("Booking recovery..."));
			frappe.call({
				method: API + ".collect_loss",
				args: { payload: { output_item: outItem.get_value(), got_grams: gotGrams(),
					warehouse: outWh.get_value(), remarks: remarks.get_value(), lines } },
			}).then((r) => {
				frappe.dom.unfreeze();
				const m = r.message || {};
				frappe.show_alert({ message: __("Recovered {0} g pure — {1}.", [m.pure, m.stock_entry]), indicator: "green" }, 6);
				got.set_value(0);
				load();
			}).catch(() => frappe.dom.unfreeze());
		});
	});

	page.add_inner_button(__("Refresh"), load);
	page.add_inner_button(__("Loss Report"), () => frappe.set_route("loss-report"));
	load();
};
