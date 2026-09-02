// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Bag Extraction — split one N-piece card into N individual order bags.
//  Phase 1: scan -> show the card's item list + Start.
//  Phase 2 (after Start, which assigns the worker + start time): one block per piece
//  showing the FULL item list; stones auto-split & rounded to .000 (carats), gold per
//  piece = entered GROSS - stone weight, with a live "remaining in bag" readout.
//  Split creates the individual bags. Barcode print is a later step. Route: /app/bag-split

frappe.pages["bag-split"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Bag Extraction", single_column: true });
	const state = { data: null, gross: [], started: false };
	const CT_TO_G = 0.2;

	$(page.main).append(`
		<style>
		.bs-bar{max-width:420px;margin:2px 0 12px;}
		.bs-bar .help-box{display:none !important;}
		.bs-msg{display:none;margin:0 0 10px;padding:8px 12px;border-radius:6px;font-size:13px;}
		.bs-msg.err{display:block;background:#fbeaea;color:#b00020;border:1px solid #e6b3b3;}
		.bs-card{display:none;border:1px solid var(--border-color);border-radius:11px;padding:10px 14px;margin-bottom:10px;background:var(--fg-color);}
		.bs-card.show{display:block;}
		.bs-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px 18px;font-size:12px;}
		.bs-grid .k{color:var(--text-muted);}.bs-grid .v{font-weight:600;}
		table.bs-mini{width:100%;border-collapse:separate;border-spacing:0;font-size:12px;background:var(--fg-color);}
		table.bs-mini th{background:var(--control-bg,var(--fg-color));border-bottom:1px solid var(--gray-400,#aeb6bf);padding:4px 8px;text-align:left;font-weight:600;}
		table.bs-mini td{border-bottom:1px solid var(--border-color);padding:3px 8px;}
		table.bs-mini td.num,table.bs-mini th.num{text-align:right;}
		.bs-pieces{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;}
		.bs-piece{border:1px solid var(--border-color);border-radius:8px;overflow:hidden;background:var(--fg-color);}
		.bs-piece .ph{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 10px;background:var(--bg-light-gray,#f4f5f6);border-bottom:1px solid var(--border-color);}
		.bs-piece .ph .nm{font-weight:700;font-size:13px;}
		.bs-piece .ph input{width:110px;text-align:right;}
		.bs-piece .ph .lbl{font-size:11px;color:var(--text-muted);}
		.bs-goldcell{color:#1d7a33;font-weight:600;}
		.bs-foot{display:none;justify-content:space-between;align-items:center;margin:12px 0;}
		.bs-foot.show{display:flex;}
		.bs-rem{font-size:14px;}.bs-rem b{font-size:18px;}
		.bs-rem.bad b{color:#b00020;}.bs-rem.ok b{color:#1d7a33;}
		</style>
		<div class="bs-bar"><div class="bs-scan"></div></div>
		<div class="bs-msg"></div>
		<div class="bs-card"></div>
		<div class="bs-foot"><div class="bs-rem"></div><div class="bs-actions"></div></div>
		<div class="bs-pieces"></div>
	`);

	const scan = frappe.ui.form.make_control({ df: { fieldtype: "Data", label: "Scan Order Bag", fieldname: "scan", description: "Scan a card that is In Queue at Bag Extraction." }, parent: $(page.main).find(".bs-scan").get(0), render_input: true });
	scan.refresh();
	const $msg = $(page.main).find(".bs-msg");
	const $card = $(page.main).find(".bs-card");
	const $pieces = $(page.main).find(".bs-pieces");
	const $foot = $(page.main).find(".bs-foot");
	const $rem = $(page.main).find(".bs-rem");
	const $actions = $(page.main).find(".bs-actions");
	const flt = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));
	const focusScan = () => setTimeout(() => scan.$input.focus(), 30);
	const setMsg = (h) => { $msg.removeClass("err").html(h || ""); if (h) $msg.addClass("err"); };

	function load(code) {
		code = (code || "").trim();
		if (!code) return;
		frappe.call({ method: "jewelima.jewelima.api.get_bag_for_split", args: { order_bag: code } }).then((r) => {
			const d = r.message || {};
			if (d.error) { setMsg(d.error); resetView(); return; }
			state.data = d;
			state.manual = false;
			state.gross = new Array(d.n).fill(0);
			setMsg("");
			if (d.status === "Ongoing") {
				// already started (e.g. browser was closed) — resume straight to split
				state.started = true;
				frappe.show_alert({ message: __("Resuming {0} (already in progress)", [d.bag.name]), indicator: "blue" }, 4);
				renderDetails(false);
				renderPieces();
			} else {
				state.started = false;
				renderDetails(true);
			}
		});
	}

	// ---- Phase 1: card details + Start ----
	function renderDetails(showStart) {
		const d = state.data, b = d.bag;
		const cell = (k, v) => `<div><span class="k">${k}</span><br><span class="v">${frappe.utils.escape_html(v == null || v === "" ? "—" : "" + v)}</span></div>`;
		const totQty = (it) => it.per_piece.reduce((s, p) => s + flt(p.qty), 0);
		const totWt = (it) => (it.is_gold ? d.gold_total : it.per_piece.reduce((s, p) => s + flt(p.weight), 0));
		const rows = d.items
			.map((it) => `<tr>
				<td><b>${frappe.utils.escape_html(it.item)}</b></td>
				<td>${(it.purity || 0)}%</td>
				<td class="num">${it.is_gold ? "—" : totQty(it) + " no"}</td>
				<td class="num">${flt(totWt(it)).toFixed(3)} ${it.is_gold ? "g" : "ct"}</td>
			</tr>`)
			.join("");
		$card.addClass("show").html(`
			<div class="bs-grid" style="margin-bottom:10px;">
				${cell("Bag", b.name)}${cell("Design", b.design)}${cell("Size", b.size)}${cell("Pieces (qty)", d.n)}
				${cell("Purity", (b.purity || 0) + "%")}${cell("Gold in bag", d.gold_total + " g")}${cell("Stone wt", d.stone_ct_total + " ct")}${cell("Order", b.job_order)}
			</div>
			<table class="bs-mini"><thead><tr><th>Item</th><th>Purity</th><th class="num">Qty</th><th class="num">Weight</th></tr></thead><tbody>${rows}</tbody></table>
		`);
		$pieces.empty();
		$foot.removeClass("show");
		$actions.empty();
		if (showStart) {
			$(`<button class="btn btn-primary btn-sm">${__("Start")}</button>`).appendTo($card).wrap('<div style="margin-top:12px;"></div>');
			$card.find(".btn-primary").on("click", doStart);
		}
	}

	function doStart() {
		const d = state.data;
		frappe.dom.freeze(__("Starting…"));
		frappe.call({ method: "jewelima.jewelima.api.start_bag_split", args: { order_bag: d.bag.name } })
			.then((r) => {
				frappe.dom.unfreeze();
				state.started = true;
				frappe.show_alert({ message: __("Started — assigned to {0}", [(r.message || {}).employee || frappe.session.user]), indicator: "blue" }, 4);
				renderPieces();
			})
			.catch(() => frappe.dom.unfreeze());
	}

	// ---- Phase 2: per-piece item tables ----
	function goldItems() { return state.data.items.filter((it) => it.is_gold); }
	function stoneGrams(i) {
		return state.data.items.filter((it) => !it.is_gold).reduce((s, it) => s + flt(it.per_piece[i].weight) * CT_TO_G, 0);
	}
	function applyAutoGold(i) {
		// piece gold = gross - stone weight, distributed across gold items by their share
		const goldForPiece = Math.round((flt(state.gross[i]) - stoneGrams(i)) * 1000) / 1000;
		const totalAll = flt(state.data.gold_total);
		goldItems().forEach((it, k) => {
			const w = totalAll > 0 ? goldForPiece * (flt(it.total) / totalAll) : k === 0 ? goldForPiece : 0;
			it.per_piece[i].weight = Math.round(w * 1000) / 1000;
		});
	}
	function pieceName(i) {
		return i === 0 ? state.data.bag.name : `${state.data.bag.name}-${i + 1}`;
	}
	function renderPieces() {
		const d = state.data;
		$pieces.empty();
		for (let i = 0; i < d.n; i++) {
			const itemRows = d.items
				.map((it, k) => {
					const pp = it.per_piece[i];
					let qtyCell, wtCell;
					if (it.is_gold) {
						qtyCell = "—";
						wtCell = state.manual
							? `<input type="number" step="0.001" class="bs-w" data-i="${i}" data-k="${k}" value="${flt(pp.weight) || ""}"> g`
							: `<span class="bs-goldcell bs-w-${i}-${k}">${flt(pp.weight).toFixed(3)} g</span>`;
					} else {
						qtyCell = state.manual ? `<input type="number" step="1" class="bs-q" data-i="${i}" data-k="${k}" value="${pp.qty}"> no` : `${pp.qty} no`;
						wtCell = state.manual ? `<input type="number" step="0.001" class="bs-w" data-i="${i}" data-k="${k}" value="${flt(pp.weight)}"> ct` : `${flt(pp.weight).toFixed(3)} ct`;
					}
					return `<tr><td><b>${frappe.utils.escape_html(it.item)}</b></td><td>${(it.purity || 0)}%</td><td class="num">${qtyCell}</td><td class="num">${wtCell}</td></tr>`;
				})
				.join("");
			const grossInput = state.manual ? "" : `<span><span class="lbl">Gross g</span> <input type="number" step="0.001" class="bs-gross" data-i="${i}" value="${state.gross[i] || ""}"></span>`;
			$pieces.append(`
				<div class="bs-piece">
					<div class="ph"><span class="nm">${i + 1}. ${frappe.utils.escape_html(pieceName(i))}</span>${grossInput}</div>
					<table class="bs-mini"><thead><tr><th>Item</th><th>Purity</th><th class="num">Qty</th><th class="num">Weight</th></tr></thead><tbody>${itemRows}</tbody></table>
				</div>`);
		}
		$pieces.find(".bs-gross").on("input", function () {
			const i = $(this).data("i");
			state.gross[i] = flt(this.value);
			applyAutoGold(i);
			goldItems().forEach((it, k) => $pieces.find(`.bs-w-${i}-${k}`).text(flt(it.per_piece[i].weight).toFixed(3) + " g"));
			recalcRemaining();
		});
		$pieces.find(".bs-w").on("input", function () {
			state.data.items[$(this).data("k")].per_piece[$(this).data("i")].weight = flt(this.value);
			recalcRemaining();
		});
		$pieces.find(".bs-q").on("input", function () {
			state.data.items[$(this).data("k")].per_piece[$(this).data("i")].qty = parseInt(this.value || "0", 10);
		});
		$foot.addClass("show");
		renderActions();
		recalcRemaining();
		focusScan();
	}
	function renderActions() {
		$actions.empty();
		$(`<button class="btn btn-default btn-sm">${state.manual ? __("Auto (gross)") : __("Edit manually")}</button>`)
			.appendTo($actions)
			.on("click", () => { state.manual = !state.manual; renderPieces(); });
		$(`<button class="btn btn-default btn-sm bs-splitrem" style="display:none">${__("Split remaining")}</button>`).appendTo($actions).on("click", splitRemaining);
		$(`<button class="btn btn-primary btn-sm bs-splitbtn">${__("Split")}</button>`).appendTo($actions).on("click", doSplit);
	}
	function totals() {
		const d = state.data;
		let used = 0, over = null;
		goldItems().forEach((it) => {
			const s = it.per_piece.reduce((a, p) => a + flt(p.weight), 0);
			used += s;
			if (s > flt(it.total) + 0.0005) over = it.item;
		});
		used = Math.round(used * 1000) / 1000;
		const rem = Math.round((flt(d.gold_total) - used) * 1000) / 1000;
		return { used, rem, over };
	}
	function recalcRemaining() {
		const d = state.data, t = totals();
		const ok = Math.abs(t.rem) < 0.0005 && !t.over;
		$rem.removeClass("bad ok").addClass(ok ? "ok" : "bad");
		// gross picture: product gross (gold + stones), how much is put in the pieces,
		// and how much is left in the bag
		const productGross = Math.round((flt(d.gold_total) + flt(d.stone_ct_total) * 0.2) * 1000) / 1000;
		let put = 0;
		for (let i = 0; i < d.n; i++) {
			d.items.forEach((it) => {
				const w = flt(it.per_piece[i].weight);
				put += it.is_gold ? w : w * 0.2;
			});
		}
		put = Math.round(put * 1000) / 1000;
		const left = Math.round((productGross - put) * 1000) / 1000;
		let txt = `Gold remaining in bag: <b>${t.rem.toFixed(3)}</b> g  ·  assigned ${t.used.toFixed(3)} / ${flt(d.gold_total).toFixed(3)} g`;
		if (t.over) txt += ` · <span style="color:#b00020">too much ${frappe.utils.escape_html(t.over)}</span>`;
		txt += `<div style="font-size:12px;color:var(--text-muted);margin-top:3px;">Product gross: <b>${productGross.toFixed(3)}</b> g  ·  put in pieces: <b>${put.toFixed(3)}</b> g  ·  left in bag: <b>${left.toFixed(3)}</b> g</div>`;
		$rem.html(txt);
		$(page.main).find(".bs-splitbtn").prop("disabled", !ok).css("opacity", ok ? 1 : 0.5);
		// offer "Split remaining" when only a tiny sliver of gold is left (<= 0.010 g)
		$(page.main).find(".bs-splitrem").toggle(t.rem > 0.0005 && t.rem <= 0.0105 && !t.over);
	}

	function splitRemaining() {
		// sprinkle the tiny leftover gold across pieces in 0.001 g steps (random order)
		const d = state.data, gis = goldItems();
		if (!gis.length) return;
		let rem = flt(d.gold_total);
		gis.forEach((it) => it.per_piece.forEach((p) => (rem -= flt(p.weight))));
		let steps = Math.round(rem * 1000);
		if (steps <= 0) return;
		const order = Array.from({ length: d.n }, (_, i) => i);
		for (let i = order.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[order[i], order[j]] = [order[j], order[i]];
		}
		for (let s = 0; s < steps; s++) {
			const i = order[s % d.n];
			if (state.manual) {
				gis[0].per_piece[i].weight = Math.round((flt(gis[0].per_piece[i].weight) + 0.001) * 1000) / 1000;
			} else {
				state.gross[i] = Math.round((flt(state.gross[i]) + 0.001) * 1000) / 1000;
				applyAutoGold(i);
			}
		}
		renderPieces();
	}

	function buildPieces() {
		const d = state.data;
		const out = [];
		for (let i = 0; i < d.n; i++) {
			out.push({ items: d.items.map((it) => ({ item: it.item, qty: it.is_gold ? 0 : it.per_piece[i].qty, weight: flt(it.per_piece[i].weight) })) });
		}
		return out;
	}
	function doSplit() {
		const t = totals();
		if (Math.abs(t.rem) >= 0.0005) return frappe.msgprint(__("Assign all the gold first — {0} g still unassigned.", [t.rem.toFixed(3)]));
		if (t.over) return frappe.msgprint(__("Too much {0} assigned — more than the bag holds.", [t.over]));
		frappe.dom.freeze(__("Splitting…"));
		frappe.call({ method: "jewelima.jewelima.api.split_bag", args: { order_bag: state.data.bag.name, pieces: JSON.stringify(buildPieces()) } })
			.then((r) => {
				frappe.dom.unfreeze();
				const m = r.message || {};
				frappe.show_alert({ message: __("Split into {0} bags.", [m.count]), indicator: "green" }, 8);
				// the pieces are new cards and each needs its own label — offer it
				// here, while they are in the operator's hand, rather than sending
				// them to Print Barcode to be scanned back in one at a time
				offerLabels(m.created || []);
				resetView();
			})
			.catch(() => frappe.dom.unfreeze());
	}

	// ---- barcodes for the pieces just cut ---------------------------------
	function offerLabels(names) {
		if (!names.length) return;
		const dlg = new frappe.ui.Dialog({
			title: __("Print barcodes for the {0} new piece(s)?", [names.length]),
			fields: [{ fieldtype: "HTML", fieldname: "list" }],
			primary_action_label: __("Print {0} label(s)", [names.length]),
			primary_action: () => { dlg.hide(); printLabels(names); },
			secondary_action_label: __("Not now"),
		});
		dlg.fields_dict.list.$wrapper.html(
			`<div style="font-size:13px;line-height:1.9;">`
			+ names.map((n) => `<b>${frappe.utils.escape_html(n)}</b>`).join(" &nbsp;·&nbsp; ")
			+ `</div>`);
		dlg.show();
	}

	function printLabels(names) {
		frappe.dom.freeze(__("Building labels…"));
		// one fetch per piece — get_barcode_card is the single-card label source the
		// roll printer uses, so a label off this page is the same label as any other
		Promise.all(names.map((n) => frappe.call({
			method: "jewelima.jewelima.api.get_barcode_card",
			args: { order_bag: n }, freeze: false,
		}).then((r) => r.message).catch(() => null)))
			.then((cards) => {
				frappe.dom.unfreeze();
				const ok = (cards || []).filter((c) => c && !c.error);
				const bad = (cards || []).length - ok.length;
				if (!ok.length) {
					frappe.msgprint(__("Could not build a label for any of the new pieces."));
					return;
				}
				document.getElementById("jw-bs-frame")?.remove();
				const fr = document.createElement("iframe");
				fr.id = "jw-bs-frame";
				fr.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
				document.body.appendChild(fr);
				const doc = fr.contentDocument;
				doc.open();
				doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Barcodes</title><style>
					@page{size:A4 portrait;margin:8mm;}
					html,body{margin:0;padding:0;}
					${jewelima.BARCODE_LABEL_CSS}
					.bc-grid{display:grid;grid-template-columns:repeat(2, 3.3in);gap:0.06in;}
					.bc-label{border:1px dashed #ccc;}
					</style></head><body><div class="bc-grid">`
					+ ok.map((c) => jewelima.buildBarcodeLabel(c)).join("")
					+ `</div></body></html>`);
				doc.close();
				setTimeout(() => { fr.contentWindow.focus(); fr.contentWindow.print(); }, 350);
				frappe.show_alert({
					message: bad
						? __("Sent {0} label(s); {1} could not be built.", [ok.length, bad])
						: __("Sent {0} label(s) to the printer.", [ok.length]),
					indicator: bad ? "orange" : "green",
				}, 7);
			})
			.catch(() => frappe.dom.unfreeze());
	}

	function resetView() {
		state.data = null; state.gross = []; state.started = false;
		scan.set_value("");
		$card.removeClass("show").empty();
		$pieces.empty();
		$foot.removeClass("show");
		focusScan();
	}

	// arriving from a workstation with the card already picked
	if (frappe.route_options && frappe.route_options.order_bag) {
		const pre = frappe.route_options.order_bag;
		frappe.route_options = null;
		setTimeout(() => load(pre), 200);
	}
	scan.$input.on("keydown", (e) => {
		if (e.which === 13 || e.key === "Enter") { e.preventDefault(); const c = scan.$input.val(); scan.set_value(""); load(c); }
	});
	page.add_inner_button(__("Reset"), () => { setMsg(""); resetView(); });
	focusScan();
};
