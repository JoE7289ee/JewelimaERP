// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Transfer Weight (Stock) — empty a collection warehouse.
//
// Scrub and the per-bench -LOSS warehouses are holding pens: metal accumulates
// in them off the floor and eventually has to go somewhere real, usually
// refining. This is the one screen that moves it, and it is deliberately narrow
// — you may take FROM a place that collects weight and give TO a place allowed
// to receive it, and nothing else. Both ends are checked on the server, not
// merely offered here, so the page is a convenience rather than the rule.
// Route: /app/transfer-weight

frappe.pages["transfer-weight"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Transfer Weight"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const root = $(page.main);
	const S = { ctx: null, source: "", item: "", qty: "", target: "", done: [] };

	root.append(`
		<style>
		#page-transfer-weight .container{max-width:1000px;}
		.tw-sec{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;
			color:var(--text-muted);margin:20px 0 4px;padding-bottom:5px;
			border-bottom:1px solid var(--border-color);}
		.tw-note{font-size:12.5px;color:var(--text-muted);margin:0 0 12px;}
		.tw-cards{display:flex;gap:11px;flex-wrap:wrap;}
		.tw-card{flex:1 1 230px;border:1px solid var(--border-color);border-radius:12px;
			padding:11px 14px;background:var(--fg-color);cursor:pointer;}
		.tw-card.on{border:2px solid #1f618d;background:rgba(31,97,141,.07);}
		.tw-card .nm{font-weight:800;font-size:13.5px;}
		.tw-card .v{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums;
			color:#8C6A00;margin-top:3px;}
		[data-theme="dark"] .tw-card .v{color:#B98D10;}
		.tw-card .n{font-size:11px;color:var(--text-muted);}
		.tw-form{border:1px solid var(--border-color);border-radius:13px;padding:14px 17px;
			background:var(--fg-color);display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;}
		.tw-f label{display:block;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;
			color:var(--text-muted);margin-bottom:3px;}
		.tw-f select,.tw-f input{border:1px solid var(--border-color);border-radius:8px;height:34px;
			padding:2px 10px;font-size:13.5px;background:var(--control-bg);color:var(--text-color);
			min-width:190px;}
		.tw-f input[type=number]{text-align:right;min-width:130px;}
		.tw-go{background:#1f618d;border:1px solid #1f618d;color:#fff;font-weight:800;
			border-radius:9px;padding:9px 22px;font-size:13.5px;cursor:pointer;}
		.tw-go:disabled{background:var(--control-bg);border-color:var(--border-color);
			color:var(--text-muted);cursor:default;font-weight:600;}
		table.tw-t{width:100%;border-collapse:collapse;font-size:12.5px;background:var(--fg-color);
			border:1px solid var(--border-color);border-radius:11px;overflow:hidden;
			font-variant-numeric:tabular-nums;}
		table.tw-t th{text-align:left;font-size:10px;text-transform:uppercase;color:var(--text-muted);
			padding:7px 11px;background:var(--control-bg);border-bottom:1px solid var(--border-color);}
		table.tw-t td{padding:6px 11px;border-bottom:1px solid var(--border-color);}
		table.tw-t td.num{text-align:right;}
		.tw-empty{padding:26px;text-align:center;color:var(--text-muted);font-size:13px;
			border:1px dashed var(--border-color);border-radius:12px;}
		</style>
		<div class="tw-sec">${__("Take it from")}</div>
		<p class="tw-note">${__("the places that collect weight off the floor — pick one to see what it holds")}</p>
		<div class="tw-cards"></div>
		<div class="tw-body"></div>
		<div class="tw-sec">${__("Moved in this session")}</div>
		<div class="tw-done"></div>
	`);

	function paint() {
		const c = S.ctx;
		if (!c) return;
		root.find(".tw-cards").html(c.sources.length ? c.sources.map((s) => `
			<div class="tw-card ${s.warehouse === S.source ? "on" : ""}" data-w="${esc(s.warehouse)}">
				<div class="nm">${esc(s.label)}</div>
				<div class="v">${flt(s.total).toFixed(3)}<span style="font-size:12px;font-weight:400;color:var(--text-muted);"> g</span></div>
				<div class="n">${s.items.length} ${__("item(s)")}</div>
			</div>`).join("")
			: `<div class="tw-empty">${__("Nothing is holding collected weight right now.")}</div>`);

		const src = c.sources.find((s) => s.warehouse === S.source);
		if (!src) { root.find(".tw-body").empty(); return; }
		if (!src.items.some((i) => i.item === S.item)) S.item = (src.items[0] || {}).item || "";
		const held = flt((src.items.find((i) => i.item === S.item) || {}).qty);
		root.find(".tw-body").html(`
			<div class="tw-sec">${__("Move")}</div>
			<div class="tw-form">
				<div class="tw-f"><label>${__("Item")}</label>
					<select class="tw-item">${src.items.map((i) =>
						`<option value="${esc(i.item)}" ${i.item === S.item ? "selected" : ""}>${
							esc(i.item)} — ${flt(i.qty).toFixed(3)} g</option>`).join("")}</select></div>
				<div class="tw-f"><label>${__("Weight (g)")}</label>
					<input type="number" class="tw-qty" step="0.001" min="0" max="${held}"
						value="${S.qty}" placeholder="${held.toFixed(3)}"></div>
				<div class="tw-f"><label>${__("To")}</label>
					<select class="tw-target"><option value="">${__("— pick —")}</option>
						${c.targets.filter((t) => t.warehouse !== S.source).map((t) =>
							`<option value="${esc(t.warehouse)}" ${t.warehouse === S.target ? "selected" : ""}>${
								esc(t.label)}</option>`).join("")}</select></div>
				<div class="tw-f" style="flex:1;min-width:200px;"><label>${__("Note")}</label>
					<input type="text" class="tw-note-in" style="width:100%;"
						placeholder="${__("sent to refining, tray no…")}"></div>
				<button class="tw-go" ${!S.target || flt(S.qty) <= 0 ? "disabled" : ""}>${
					__("MOVE {0} g", [flt(S.qty).toFixed(3)])}</button>
			</div>
			<p class="tw-note" style="margin-top:9px;">${
				__("{0} holds {1} g of {2}. Both ends are checked on the server — a warehouse that does not collect weight cannot be a source, and one not allowed to receive it cannot be a target.",
					[esc(S.source), held.toFixed(3), esc(S.item)])}</p>`);

		root.find(".tw-done").html(S.done.length ? `<table class="tw-t"><thead><tr>
			<th>${__("Item")}</th><th class="num">${__("Weight")}</th><th>${__("From")}</th>
			<th>${__("To")}</th><th>${__("Stock Entry")}</th></tr></thead><tbody>${
			S.done.map((d) => `<tr><td>${esc(d.item)}</td>
				<td class="num">${flt(d.qty).toFixed(3)} g</td><td>${esc(d.source)}</td>
				<td>${esc(d.target)}</td><td>${esc(d.stock_entry)}</td></tr>`).join("")}</tbody></table>`
			: `<div class="tw-empty">${__("Nothing moved yet.")}</div>`);
	}

	root.on("click", ".tw-card", function () {
		S.source = $(this).data("w"); S.item = ""; S.qty = ""; paint();
	});
	root.on("change", ".tw-item", function () { S.item = this.value; paint(); });
	root.on("input", ".tw-qty", function () {
		S.qty = this.value;
		root.find(".tw-go").prop("disabled", !S.target || flt(S.qty) <= 0)
			.text(__("MOVE {0} g", [flt(S.qty).toFixed(3)]));
	});
	root.on("change", ".tw-target", function () {
		S.target = this.value;
		root.find(".tw-go").prop("disabled", !S.target || flt(S.qty) <= 0);
	});

	root.on("click", ".tw-go", function () {
		const note = root.find(".tw-note-in").val() || "";
		// gold leaving a collection point is worth one question before it goes
		frappe.confirm(
			__("Move <b>{0} g</b> of {1} from <b>{2}</b> to <b>{3}</b>?",
				[flt(S.qty).toFixed(3), esc(S.item), esc(S.source), esc(S.target)]),
			() => {
				frappe.dom.freeze(__("Moving…"));
				frappe.call({ method: API + ".transfer_weight", args: {
					source: S.source, target: S.target, item: S.item, qty: flt(S.qty), remarks: note } })
					.then((r) => {
						frappe.dom.unfreeze();
						const m = r.message || {};
						S.done.unshift(m);
						S.qty = "";
						frappe.show_alert({ indicator: "green", message:
							__("{0} g moved — {1}", [flt(m.qty).toFixed(3), m.stock_entry]) }, 6);
						load();
					}).catch(() => frappe.dom.unfreeze());
			});
	});

	function load() {
		return frappe.call({ method: API + ".get_weight_transfer_context", freeze: false })
			.then((r) => {
				S.ctx = r.message || { sources: [], targets: [] };
				if (!S.source && S.ctx.sources.length) S.source = S.ctx.sources[0].warehouse;
				paint();
			});
	}

	page.set_primary_action(__("Refresh"), load, "refresh");
	frappe.pages["transfer-weight"].on_page_show = load;
	load();
};
