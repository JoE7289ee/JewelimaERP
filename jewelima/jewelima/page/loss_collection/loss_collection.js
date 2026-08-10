// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Loss Collection (Stock) — book a refining recovery WITHOUT sending gold away.
// Everything speaks PURE GOLD. One row per -LOSS warehouse; each row carries
// KARAT checkboxes (14K / 18K / 22K ... — whatever that bench holds, all
// checked by default). Rows start untaken — type a pure weight on a row and it
// activates; that pure splits across the row's TICKED karats (proportional to
// their pure content) and expands to item grams underneath. Confirm posts ONE
// Repack: dust out, recovered standard gold in. Route: /app/loss-collection

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
		.lc-box{border:1px solid var(--border-color);border-radius:11px;background:var(--fg-color);overflow:auto;max-height:calc(100vh - 300px);}
		table.lc-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;}
		table.lc-tbl th{position:sticky;top:0;z-index:1;background:var(--control-bg,var(--fg-color));border-bottom:1px solid var(--gray-400,#aeb6bf);padding:5px 10px;text-align:left;white-space:nowrap;font-weight:700;}
		table.lc-tbl td{border-bottom:1px solid var(--border-color);padding:6px 10px;white-space:nowrap;font-variant-numeric:tabular-nums;}
		table.lc-tbl td.r,table.lc-tbl th.r{text-align:right;}
		table.lc-tbl tr.on td{background:#fdf6f6;}
		table.lc-tbl input.lc-g{width:110px;border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);border-radius:4px;height:27px;padding:1px 8px;font-size:12.5px;text-align:right;color:var(--text-color);box-sizing:border-box;font-weight:700;}
		.lc-wh-name{font-weight:800;font-size:13.5px;}
		.lc-sub{color:var(--text-muted);font-size:11px;}
		.lc-pure{color:#8a6d1a;font-weight:800;}
		.lc-k{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--border-color);border-radius:12px;padding:2px 10px 2px 6px;margin-right:6px;font-size:11.5px;font-weight:700;cursor:pointer;user-select:none;background:var(--control-bg);}
		.lc-k input{margin:0;cursor:pointer;}
		.lc-k .kp{color:#8a6d1a;font-weight:700;}
		.lc-k.off{opacity:.45;text-decoration:line-through;}
		.lc-empty{padding:20px;text-align:center;color:var(--text-muted);}
		</style>
		<div class="lc-top">
			<div class="lc-item"></div><div class="lc-got"></div><div class="lc-wh"></div><div class="lc-remarks"></div>
			<span style="margin-left:auto;"></span>
			<button class="btn btn-primary lc-go">${__("Collect")}</button>
		</div>
		<div class="lc-bal off"></div>
		<div class="lc-box"><table class="lc-tbl">
			<thead><tr><th style="width:26px"><input type="checkbox" class="lc-all"></th>
			<th>${__("Loss Warehouse")}</th>
			<th>${__("Take From (karats)")}</th>
			<th class="r">${__("Pure Available (g)")}</th>
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
				strip();
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

	function selPure(w) {
		return w.karats.filter((k) => k.sel).reduce((s, k) => s + k.pure, 0);
	}

	// AUTO-BALANCE: manual (typed) rows stay pinned; the remaining needed pure
	// splits EQUALLY across the other ticked rows, capped by each row's ticked
	// karats (overflow re-spreads).
	function allocate() {
		S.whs.forEach((w) => {
			if (!w.sel) {
				w.take = 0;
				w.manual = false;
			} else if (w.manual) {
				w.take = Math.min(w.take, flt(selPure(w).toFixed(3)));
			} else {
				w.take = 0;
			}
		});
		let rest = Math.max(0, needPure() - S.whs.reduce((s, w) => s + (w.manual ? w.take : 0), 0));
		let open = S.whs.filter((w) => w.sel && !w.manual);
		while (rest > 0.0005 && open.length) {
			const share = rest / open.length;
			let leftover = 0;
			const next = [];
			open.forEach((w) => {
				const room = selPure(w) - w.take;
				if (room <= share + 0.0005) {
					w.take = flt(selPure(w).toFixed(3));
					leftover += share - room;
				} else {
					w.take = flt((w.take + share).toFixed(3));
					next.push(w);
				}
			});
			rest = leftover;
			if (next.length === open.length) rest = 0;
			open = next;
		}
		refreshAll();
	}

	function refreshAll() {
		S.whs.forEach((_, i) => refreshRow(i, true));
		strip();
	}

	function strip() {
		const give = S.whs.reduce((s, w) => s + w.take, 0);
		const need = needPure();
		const ok = need > 0 && Math.abs(need - give) <= 0.01;
		$(root).find(".lc-bal").toggleClass("ok", ok).toggleClass("off", !ok).html(
			`<span>${__("Recovering")} <b>${fmt(gotGrams())} g</b> ${esc(outItem.get_value() || "")} = <b>${fmt(need)} g ${__("pure")}</b></span>
			 <span>${__("Taking from loss")}: <b>${fmt(give)} g ${__("pure")}</b></span>
			 <span>${ok ? "✓ " + __("balanced") : __("difference {0} g pure", [fmt(need - give)])}</span>`);
	}

	function refreshRow(i, skipStrip) {
		const w = S.whs[i];
		const $tr = $(root).find(`.lc-rows tr[data-i="${i}"]`);
		const avail = selPure(w);
		if (w.take > avail) w.take = flt(avail.toFixed(3));
		$tr.toggleClass("on", w.take > 0);
		$tr.find(".lc-rowcb").prop("checked", !!w.sel);
		$tr.find(".lc-avail").text(fmt(avail));
		$tr.find(".lc-g").attr("max", avail);
		if (document.activeElement !== $tr.find(".lc-g").get(0)) $tr.find(".lc-g").val(w.take ? fmt(w.take) : "");
		w.karats.forEach((k, j) => $tr.find(`.lc-k[data-j="${j}"]`).toggleClass("off", !k.sel));
		if (!skipStrip) strip();
	}

	function paint() {
		const $b = $(root).find(".lc-rows");
		$b.html(S.whs.length ? S.whs.map((w, i) => `
			<tr data-i="${i}">
				<td><input type="checkbox" class="lc-rowcb"></td>
				<td><span class="lc-wh-name">${esc(w.label)}</span>
					<div class="lc-sub">${__("dust")} ${fmt(w.gross)} g</div></td>
				<td>${w.karats.map((k, j) => `
					<label class="lc-k" data-j="${j}"><input type="checkbox" class="lc-kcb" checked>
					${esc(k.label)} <span class="kp">${fmt(k.pure)} g</span></label>`).join("")}</td>
				<td class="r lc-pure lc-avail">${fmt(selPure(w))}</td>
				<td class="r"><input class="lc-g" type="number" step="0.001" min="0" max="${selPure(w)}" placeholder="0.000"></td>
			</tr>`).join("")
			: `<tr><td colspan="5" class="lc-empty">${__("The loss warehouses are empty.")}</td></tr>`);
		strip();
	}

	function load() {
		frappe.call({ method: API + ".get_loss_report" }).then((r) => {
			const d = r.message || {};
			S.whs = (d.warehouses || []).map((w) => {
				const groups = {};
				(d.items || []).forEach((it) => {
					const qty = it.cells[w.warehouse];
					if (!qty) return;
					// karat bucket from the item group: GOLD 14K -> 14K; anything else keeps its group
					const label = (it.group || "").startsWith("GOLD ") ? it.group.replace("GOLD ", "") : (it.group || "?");
					const g = groups[label] = groups[label] || { label, pure: 0, sel: true, items: [] };
					g.pure += qty * it.purity / 100;
					g.items.push({ item: it.item, qty, purity: it.purity });
				});
				const karats = Object.values(groups).sort((a, b) => a.label.localeCompare(b.label));
				karats.forEach((k) => (k.pure = flt(k.pure.toFixed(3))));
				return { warehouse: w.warehouse, label: w.label, gross: w.gross, take: 0, sel: false, manual: false, karats };
			});
			paint();
		});
	}

	// karat checkbox: include/exclude that karat's dust -> rebalance
	$(root).on("change", ".lc-kcb", function () {
		const $tr = $(this).closest("tr");
		const i = +$tr.attr("data-i");
		const j = +$(this).closest(".lc-k").attr("data-j");
		S.whs[i].karats[j].sel = this.checked;
		allocate();
	});
	// typing a pure weight PINS the row; the others auto-rebalance around it
	$(root).on("input", ".lc-g", function () {
		const i = +$(this).closest("tr").attr("data-i");
		const w = S.whs[i];
		w.take = Math.min(selPure(w), flt(this.value));
		w.manual = true;
		w.sel = true;
		allocate();
	});
	// tick a bench in / out of the auto-balance
	$(root).on("change", ".lc-rowcb", function () {
		const i = +$(this).closest("tr").attr("data-i");
		S.whs[i].sel = this.checked;
		if (!this.checked) S.whs[i].manual = false;
		allocate();
	});
	$(root).on("click", ".lc-all", function (e) {
		e.stopPropagation();
		S.whs.forEach((w) => {
			w.sel = this.checked;
			if (!this.checked) w.manual = false;
		});
		allocate();
	});

	$(root).find(".lc-go").on("click", () => {
		// each row's take splits across its TICKED karats proportional to their
		// pure; grams per item = qty x (row factor) inside those karats
		const lines = [];
		S.whs.filter((w) => w.take > 0).forEach((w) => {
			const pool = selPure(w);
			const f = Math.min(1, w.take / pool);
			w.karats.filter((k) => k.sel).forEach((k) => {
				k.items.forEach((it) => {
					const grams = flt((it.qty * f).toFixed(3));
					if (grams > 0) lines.push({ item: it.item, warehouse: w.warehouse, grams });
				});
			});
		});
		if (!lines.length) {
			frappe.show_alert({ message: __("Enter a pure weight on at least one bench."), indicator: "orange" }, 4);
			return;
		}
		const benches = S.whs.filter((w) => w.take > 0).map((w) => `${w.label} ${fmt(w.take)}g`).join(", ");
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
