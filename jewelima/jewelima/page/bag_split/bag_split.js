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
		.bs-card{display:none;border:1px solid var(--border-color);border-radius:8px;padding:10px 14px;margin-bottom:10px;background:var(--fg-color);}
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
			state.started = false;
			state.gross = new Array(d.n).fill(0);
			setMsg("");
			renderDetails();
		});
	}

	// ---- Phase 1: card details + Start ----
	function renderDetails() {
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
				${cell("Purity", (b.purity || 0) + "%")}${cell("Gold in bag", d.gold_total + " g")}${cell("Stone wt", d.stone_g_total + " g")}${cell("Order", b.job_order)}
			</div>
			<table class="bs-mini"><thead><tr><th>Item</th><th>Purity</th><th class="num">Qty</th><th class="num">Weight</th></tr></thead><tbody>${rows}</tbody></table>
		`);
		$pieces.empty();
		$foot.removeClass("show");
		$actions.empty();
		$(`<button class="btn btn-primary btn-sm">${__("Start")}</button>`).appendTo($card).wrap('<div style="margin-top:12px;"></div>');
		$card.find(".btn-primary").on("click", doStart);
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
	function stoneGrams(i) {
		return state.data.items.filter((it) => !it.is_gold).reduce((s, it) => s + flt(it.per_piece[i].weight) * CT_TO_G, 0);
	}
	function goldOf(i) {
		return Math.round((flt(state.gross[i]) - stoneGrams(i)) * 1000) / 1000;
	}
	function pieceName(i) {
		return i === 0 ? state.data.bag.name : `${state.data.bag.name}-${i + 1}`;
	}
	function renderPieces() {
		const d = state.data;
		$pieces.empty();
		for (let i = 0; i < d.n; i++) {
			const itemRows = d.items
				.map((it) => {
					const pp = it.per_piece[i];
					const qty = it.is_gold ? "—" : `${pp.qty} no`;
					const wt = it.is_gold ? `<span class="bs-goldcell bs-gold-${i}">${goldOf(i).toFixed(3)} g</span>` : `${flt(pp.weight).toFixed(3)} ct`;
					return `<tr><td><b>${frappe.utils.escape_html(it.item)}</b></td><td>${(it.purity || 0)}%</td><td class="num">${qty}</td><td class="num">${wt}</td></tr>`;
				})
				.join("");
			$pieces.append(`
				<div class="bs-piece">
					<div class="ph">
						<span class="nm">${i + 1}. ${frappe.utils.escape_html(pieceName(i))}</span>
						<span><span class="lbl">Gross g</span> <input type="number" step="0.001" class="bs-gross" data-i="${i}" value="${state.gross[i] || ""}"></span>
					</div>
					<table class="bs-mini"><thead><tr><th>Item</th><th>Purity</th><th class="num">Qty</th><th class="num">Weight</th></tr></thead><tbody>${itemRows}</tbody></table>
				</div>`);
		}
		$pieces.find(".bs-gross").on("input", function () {
			const i = $(this).data("i");
			state.gross[i] = flt(this.value);
			$pieces.find(`.bs-gold-${i}`).text(goldOf(i).toFixed(3) + " g");
			recalcRemaining();
		});
		$foot.addClass("show");
		$actions.empty();
		$(`<button class="btn btn-primary btn-sm">${__("Split")}</button>`).appendTo($actions).on("click", doSplit);
		recalcRemaining();
		focusScan();
	}
	function recalcRemaining() {
		const d = state.data;
		let used = 0;
		for (let i = 0; i < d.n; i++) used += goldOf(i);
		used = Math.round(used * 1000) / 1000;
		const rem = Math.round((flt(d.gold_total) - used) * 1000) / 1000;
		$rem.removeClass("bad ok").addClass(Math.abs(rem) < 0.0005 ? "ok" : "bad");
		$rem.html(`Gold remaining in bag: <b>${rem.toFixed(3)}</b> g  ·  assigned ${used.toFixed(3)} / ${flt(d.gold_total).toFixed(3)} g`);
	}

	function buildPieces() {
		const d = state.data;
		const out = [];
		for (let i = 0; i < d.n; i++) {
			const items = d.items.map((it) => ({
				item: it.item,
				qty: it.is_gold ? 0 : it.per_piece[i].qty,
				weight: it.is_gold ? goldOf(i) : flt(it.per_piece[i].weight),
			}));
			out.push({ items });
		}
		return out;
	}
	function doSplit() {
		const d = state.data;
		let used = 0;
		for (let i = 0; i < d.n; i++) used += goldOf(i);
		const rem = flt(d.gold_total) - used;
		const go = () => {
			frappe.dom.freeze(__("Splitting…"));
			frappe.call({ method: "jewelima.jewelima.api.split_bag", args: { order_bag: d.bag.name, pieces: JSON.stringify(buildPieces()) } })
				.then((r) => {
					frappe.dom.unfreeze();
					const res = r.message || {};
					frappe.show_alert({ message: __("Split into {0} bags.", [res.count]), indicator: "green" }, 8);
					resetView();
				})
				.catch(() => frappe.dom.unfreeze());
		};
		if (Math.abs(rem) >= 0.0005) {
			frappe.confirm(__("Gold isn't fully assigned ({0} g remaining). Piece 1 absorbs the difference. Continue?", [rem.toFixed(3)]), go);
		} else {
			go();
		}
	}

	function resetView() {
		state.data = null; state.gross = []; state.started = false;
		scan.set_value("");
		$card.removeClass("show").empty();
		$pieces.empty();
		$foot.removeClass("show");
		focusScan();
	}

	scan.$input.on("keydown", (e) => {
		if (e.which === 13 || e.key === "Enter") { e.preventDefault(); const c = scan.$input.val(); scan.set_value(""); load(c); }
	});
	page.add_inner_button(__("Reset"), () => { setMsg(""); resetView(); });
	focusScan();
};
