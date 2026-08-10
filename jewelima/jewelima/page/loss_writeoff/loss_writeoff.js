// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Loss Write-off (Stock, MANAGEMENT ONLY — System Manager) — remove
// unrecoverable dust from the -LOSS warehouses: tick lines (grams editable,
// default = everything there), give a reason, confirm. One Material Issue;
// nothing is produced. Route: /app/loss-writeoff

frappe.pages["loss-writeoff"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Loss Write-off", single_column: true });
	const API = "jewelima.jewelima.api";
	const S = { lines: [] };
	const esc = frappe.utils.escape_html;
	const fmt = (v) => flt(v).toFixed(3);

	$(page.main).append(`
		<style>
		.lw-top{display:flex;align-items:flex-end;gap:12px;margin:2px 0 10px;flex-wrap:wrap;}
		.lw-top .frappe-control{margin:0;}
		.lw-top .control-label{font-size:11px;margin:0 0 1px;color:var(--text-muted);}
		.lw-top .help-box,.lw-top .description{display:none !important;}
		.lw-reason{flex:1 1 300px;}
		.lw-sum{margin:0 0 10px;padding:7px 12px;border-radius:7px;font-size:12.5px;background:#fdecec;color:#b00020;border:1px solid #e6b3b3;display:flex;gap:16px;flex-wrap:wrap;}
		.lw-sum b{font-variant-numeric:tabular-nums;}
		.lw-box{border:1px solid var(--border-color);border-radius:11px;background:var(--fg-color);overflow:auto;max-height:calc(100vh - 290px);}
		table.lw-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:12.5px;}
		table.lw-tbl th{position:sticky;top:0;z-index:1;background:var(--control-bg,var(--fg-color));border-bottom:1px solid var(--gray-400,#aeb6bf);padding:4px 8px;text-align:left;white-space:nowrap;font-weight:700;}
		table.lw-tbl td{border-bottom:1px solid var(--border-color);padding:4px 8px;white-space:nowrap;font-variant-numeric:tabular-nums;}
		table.lw-tbl td.r,table.lw-tbl th.r{text-align:right;}
		table.lw-tbl tr.on td{background:#fdecec;}
		table.lw-tbl input.lw-g{width:92px;border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);border-radius:4px;height:25px;padding:1px 6px;font-size:12px;text-align:right;color:var(--text-color);box-sizing:border-box;}
		.lw-wh{font-weight:700;}
		.lw-sub{color:var(--text-muted);font-size:11px;}
		.lw-pure{color:#8a6d1a;font-weight:700;}
		.lw-empty{padding:20px;text-align:center;color:var(--text-muted);}
		.lw-go{background:#b02a2a;border:none;color:#fff;font-weight:800;letter-spacing:.6px;padding:8px 22px;border-radius:7px;font-size:13px;cursor:pointer;}
		.lw-go:hover{background:#8f1f1f;}
		</style>
		<div class="lw-top">
			<div class="lw-reason"></div>
			<span style="margin-left:auto;"></span>
			<button class="lw-go">${__("WRITE OFF")}</button>
		</div>
		<div class="lw-sum"></div>
		<div class="lw-box"><table class="lw-tbl">
			<thead><tr><th style="width:26px"><input type="checkbox" class="lw-all"></th>
			<th>${__("Loss Warehouse")}</th><th>${__("Material")}</th>
			<th class="r">${__("Available g")}</th><th class="r">${__("Pure g")}</th><th class="r">${__("Write off g")}</th></tr></thead>
			<tbody class="lw-rows"></tbody></table></div>
	`);
	const root = $(page.main)[0];
	const reason = frappe.ui.form.make_control({
		df: { fieldtype: "Data", label: __("Reason (required)"), fieldname: "reason",
			placeholder: __("e.g. refining residue after 3 recoveries — unrecoverable") },
		parent: $(root).find(".lw-reason").get(0), render_input: true,
	});
	reason.refresh();

	function paint() {
		const $b = $(root).find(".lw-rows");
		$b.html(S.lines.length ? S.lines.map((l, i) => `
			<tr data-i="${i}" class="${l.sel ? "on" : ""}">
				<td><input type="checkbox" class="lw-cb" ${l.sel ? "checked" : ""}></td>
				<td><span class="lw-wh">${esc(l.label)}</span></td>
				<td>${esc(l.item)}<div class="lw-sub">${esc(l.group)} · ${l.purity}%</div></td>
				<td class="r">${fmt(l.qty)}</td>
				<td class="r lw-pure">${fmt(l.pure)}</td>
				<td class="r"><input class="lw-g" type="number" step="0.001" min="0" max="${l.qty}" value="${l.sel ? fmt(l.grams) : ""}" ${l.sel ? "" : "disabled"}></td>
			</tr>`).join("")
			: `<tr><td colspan="6" class="lw-empty">${__("The loss warehouses are empty — nothing to write off.")}</td></tr>`);
		const on = S.lines.filter((l) => l.sel);
		const g = on.reduce((s, l) => s + l.grams, 0);
		const p = on.reduce((s, l) => s + l.grams * l.purity / 100, 0);
		$(root).find(".lw-sum").html(
			`<span><b>${on.length}</b> ${__("line(s)")}</span>
			 <span>${__("Writing off")} <b>${fmt(g)} g</b> ${__("dust")}</span>
			 <span>= <b>${fmt(p)} g ${__("pure gold")}</b> ${__("gone for good")}</span>`);
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
						sel: false, grams: qty,
					});
				});
			});
			paint();
		});
	}

	$(root).on("change", ".lw-cb", function () {
		const l = S.lines[+$(this).closest("tr").attr("data-i")];
		l.sel = this.checked;
		if (l.sel && !l.grams) l.grams = l.qty;
		paint();
	});
	$(root).on("click", ".lw-all", function (e) {
		e.stopPropagation();
		S.lines.forEach((l) => {
			l.sel = this.checked;
			if (l.sel && !l.grams) l.grams = l.qty;
		});
		paint();
	});
	$(root).on("input", ".lw-g", function () {
		const l = S.lines[+$(this).closest("tr").attr("data-i")];
		l.grams = Math.min(l.qty, flt(this.value));
		const on = S.lines.filter((x) => x.sel);
		const g = on.reduce((s, x) => s + x.grams, 0);
		const p = on.reduce((s, x) => s + x.grams * x.purity / 100, 0);
		$(root).find(".lw-sum").html(
			`<span><b>${on.length}</b> ${__("line(s)")}</span>
			 <span>${__("Writing off")} <b>${fmt(g)} g</b> ${__("dust")}</span>
			 <span>= <b>${fmt(p)} g ${__("pure gold")}</b> ${__("gone for good")}</span>`);
	});

	$(root).find(".lw-go").on("click", () => {
		const lines = S.lines.filter((l) => l.sel && l.grams > 0)
			.map((l) => ({ item: l.item, warehouse: l.warehouse, grams: l.grams }));
		const why = (reason.get_value() || "").trim();
		if (!lines.length) {
			frappe.show_alert({ message: __("Tick what to write off."), indicator: "orange" }, 4);
			return;
		}
		if (!why) {
			frappe.show_alert({ message: __("A reason is required."), indicator: "orange" }, 4);
			return;
		}
		const pure = S.lines.filter((l) => l.sel).reduce((s, l) => s + l.grams * l.purity / 100, 0);
		frappe.confirm(__("Write off {0} line(s) — <b>{1} g pure gold gone for good</b>?<br>Reason: {2}", [lines.length, fmt(pure), esc(why)]), () => {
			frappe.dom.freeze(__("Writing off..."));
			frappe.call({ method: API + ".writeoff_loss", args: { payload: { reason: why, lines } } })
				.then((r) => {
					frappe.dom.unfreeze();
					const m = r.message || {};
					frappe.show_alert({ message: __("Written off {0} g pure — {1}.", [m.pure, m.stock_entry]), indicator: "red" }, 6);
					reason.set_value("");
					load();
				}).catch(() => frappe.dom.unfreeze());
		});
	});

	page.add_inner_button(__("Refresh"), load);
	page.add_inner_button(__("Loss Report"), () => frappe.set_route("loss-report"));
	load();
};
