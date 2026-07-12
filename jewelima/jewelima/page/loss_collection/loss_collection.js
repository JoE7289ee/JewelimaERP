// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Loss Collection (Stock) — book a refining recovery WITHOUT sending gold away:
// enter what we got (standard gold), tick the loss lines it came from, and the
// page allocates the deduction per purity (grams = pure ÷ purity%). Confirm
// posts ONE Repack: dust out of the -LOSS warehouses, recovered gold into
// stock. Residue stays visible until management writes it off. Route: /app/loss-collection

frappe.pages["loss-collection"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Loss Collection", single_column: true });
	const API = "jewelima.jewelima.api";
	const S = { lines: [], outPurity: 99.9 };
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
		table.lc-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:12.5px;}
		table.lc-tbl th{position:sticky;top:0;z-index:1;background:var(--control-bg,var(--fg-color));border-bottom:1px solid var(--gray-400,#aeb6bf);padding:4px 8px;text-align:left;white-space:nowrap;font-weight:700;}
		table.lc-tbl td{border-bottom:1px solid var(--border-color);padding:4px 8px;white-space:nowrap;font-variant-numeric:tabular-nums;}
		table.lc-tbl td.r,table.lc-tbl th.r{text-align:right;}
		table.lc-tbl tr.on td{background:#fdf6f6;}
		table.lc-tbl input.lc-g{width:92px;border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);border-radius:4px;height:25px;padding:1px 6px;font-size:12px;text-align:right;color:var(--text-color);box-sizing:border-box;}
		.lc-wh-name{font-weight:700;}
		.lc-sub{color:var(--text-muted);font-size:11px;}
		.lc-pure{color:#8a6d1a;font-weight:700;}
		.lc-empty{padding:20px;text-align:center;color:var(--text-muted);}
		</style>
		<div class="lc-top">
			<div class="lc-item"></div><div class="lc-got"></div><div class="lc-wh"></div><div class="lc-remarks"></div>
			<span style="margin-left:auto;"></span>
			<button class="btn btn-primary lc-go">${__("Collect")}</button>
		</div>
		<div class="lc-bal off"></div>
		<div class="lc-box"><table class="lc-tbl">
			<thead><tr><th style="width:26px"></th><th>${__("Loss Warehouse")}</th><th>${__("Material")}</th>
			<th class="r">${__("Available g")}</th><th class="r">${__("Pure g")}</th>
			<th class="r">${__("Deduct g")}</th><th class="r">${__("Deduct pure g")}</th></tr></thead>
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

	// spread the needed pure across the TICKED lines, proportional to each line's
	// available pure; grams per line = its pure share ÷ its purity
	function allocate() {
		const need = needPure();
		const on = S.lines.filter((l) => l.sel);
		const totalPure = on.reduce((s, l) => s + l.pure, 0);
		S.lines.forEach((l) => (l.deduct = 0));
		if (need > 0 && totalPure > 0) {
			const f = Math.min(1, need / totalPure);
			on.forEach((l) => {
				l.deduct = Math.min(l.qty, flt((l.pure * f / (l.purity / 100)).toFixed(3)));
			});
		}
		paint(false);
	}

	function paint(rebuild = true) {
		const $b = $(root).find(".lc-rows");
		if (rebuild) {
			$b.html(S.lines.length ? S.lines.map((l, i) => `
				<tr data-i="${i}" class="${l.sel ? "on" : ""}">
					<td><input type="checkbox" class="lc-cb" ${l.sel ? "checked" : ""}></td>
					<td><span class="lc-wh-name">${esc(l.label)}</span></td>
					<td>${esc(l.item)}<div class="lc-sub">${esc(l.group)} · ${l.purity}%</div></td>
					<td class="r">${fmt(l.qty)}</td>
					<td class="r lc-pure">${fmt(l.pure)}</td>
					<td class="r"><input class="lc-g" type="number" step="0.001" min="0" max="${l.qty}" value="${fmt(l.deduct)}"></td>
					<td class="r lc-dp">${fmt(l.deduct * l.purity / 100)}</td>
				</tr>`).join("")
				: `<tr><td colspan="7" class="lc-empty">${__("The loss warehouses are empty.")}</td></tr>`);
		} else {
			S.lines.forEach((l, i) => {
				const $tr = $b.find(`tr[data-i="${i}"]`);
				$tr.toggleClass("on", !!l.sel);
				$tr.find(".lc-g").val(fmt(l.deduct));
				$tr.find(".lc-dp").text(fmt(l.deduct * l.purity / 100));
			});
		}
		const give = S.lines.reduce((s, l) => s + l.deduct * l.purity / 100, 0);
		const need = needPure();
		const ok = need > 0 && Math.abs(need - give) <= 0.01;
		$(root).find(".lc-bal").toggleClass("ok", ok).toggleClass("off", !ok).html(
			`<span>${__("Recovering")} <b>${fmt(gotGrams())} g</b> = <b>${fmt(need)} g ${__("pure")}</b></span>
			 <span>${__("Deducting from loss")}: <b>${fmt(give)} g ${__("pure")}</b></span>
			 <span>${ok ? "✓ " + __("balanced") : __("difference {0} g pure", [fmt(need - give)])}</span>`);
	}

	function load() {
		frappe.call({ method: API + ".get_loss_report" }).then((r) => {
			const d = r.message || {};
			S.lines = [];
			(d.items || []).forEach((it) => {
				(d.warehouses || []).forEach((w) => {
					const qty = it.cells[w.warehouse];
					if (qty) S.lines.push({
						item: it.item, group: it.group, purity: it.purity, warehouse: w.warehouse,
						label: w.label, qty, pure: flt((qty * it.purity / 100).toFixed(3)),
						sel: false, deduct: 0,
					});
				});
			});
			paint();
		});
	}

	$(root).on("change", ".lc-cb", function () {
		S.lines[+$(this).closest("tr").attr("data-i")].sel = this.checked;
		allocate();
	});
	$(root).on("input", ".lc-g", function () {
		const l = S.lines[+$(this).closest("tr").attr("data-i")];
		l.deduct = Math.min(l.qty, flt(this.value));
		l.sel = l.deduct > 0;
		paint(false);
	});

	$(root).find(".lc-go").on("click", () => {
		const lines = S.lines.filter((l) => l.deduct > 0)
			.map((l) => ({ item: l.item, warehouse: l.warehouse, grams: l.deduct }));
		if (!lines.length) {
			frappe.show_alert({ message: __("Tick the loss lines the recovery came from."), indicator: "orange" }, 4);
			return;
		}
		frappe.confirm(__("Book {0} g {1} recovered from {2} loss line(s)?", [fmt(gotGrams()), esc(outItem.get_value() || ""), lines.length]), () => {
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
