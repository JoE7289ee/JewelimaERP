// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Bag Extraction — split one N-piece card into N individual order bags. Scan a card
// (must be In Queue at Bag Extraction); diamonds/stones auto-split evenly, gold is
// entered per piece with a live "remaining in bag" readout; Split creates the bags.
// Barcode print is a later step. Route: /app/bag-split

frappe.pages["bag-split"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Bag Extraction", single_column: true });
	const state = { data: null };

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
		.bs-box{border:1px solid var(--border-color);border-radius:8px;overflow:auto;}
		table.bs-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;background:var(--fg-color);}
		table.bs-tbl th{background:var(--control-bg,var(--fg-color));border-bottom:2px solid var(--gray-400,#aeb6bf);padding:6px 9px;text-align:left;font-weight:700;white-space:nowrap;}
		table.bs-tbl td{border-bottom:1px solid var(--border-color);padding:4px 9px;}
		table.bs-tbl td.num,table.bs-tbl th.num{text-align:right;}
		table.bs-tbl input{width:100%;text-align:right;box-sizing:border-box;}
		.bs-foot{display:none;justify-content:space-between;align-items:center;margin-top:10px;}
		.bs-foot.show{display:flex;}
		.bs-rem{font-size:14px;}.bs-rem b{font-size:18px;}
		.bs-rem.bad b{color:#b00020;}.bs-rem.ok b{color:#1d7a33;}
		</style>
		<div class="bs-bar"><div class="bs-scan"></div></div>
		<div class="bs-msg"></div>
		<div class="bs-card"></div>
		<div class="bs-box"><table class="bs-tbl"><thead></thead><tbody></tbody></table></div>
		<div class="bs-foot"><div class="bs-rem"></div><div class="bs-actions"></div></div>
	`);

	const scan = frappe.ui.form.make_control({ df: { fieldtype: "Data", label: "Scan Order Bag", fieldname: "scan", description: "Scan a card that is In Queue at Bag Extraction." }, parent: $(page.main).find(".bs-scan").get(0), render_input: true });
	scan.refresh();
	const $msg = $(page.main).find(".bs-msg");
	const $card = $(page.main).find(".bs-card");
	const $head = $(page.main).find(".bs-tbl thead");
	const $body = $(page.main).find(".bs-tbl tbody");
	const $foot = $(page.main).find(".bs-foot");
	const $rem = $(page.main).find(".bs-rem");
	const $actions = $(page.main).find(".bs-actions");
	const flt = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));
	const focusScan = () => setTimeout(() => scan.$input.focus(), 30);
	const setMsg = (h) => { $msg.removeClass("err").html(h || ""); if (h) $msg.addClass("err"); };

	let hasPs = false, hasCs = false;

	function load(code) {
		code = (code || "").trim();
		if (!code) return;
		frappe.call({ method: "jewelima.jewelima.api.get_bag_for_split", args: { order_bag: code } }).then((r) => {
			const d = r.message || {};
			if (d.error) { setMsg(d.error); reset(true); return; }
			state.data = d;
			setMsg("");
			render();
		});
	}

	function render() {
		const d = state.data, b = d.bag;
		hasPs = flt(b.ps_no) > 0 || flt(b.ps_weight) > 0;
		hasCs = flt(b.cs_no) > 0 || flt(b.cs_weight) > 0;
		const cell = (k, v) => `<div><span class="k">${k}</span><br><span class="v">${frappe.utils.escape_html(v == null || v === "" ? "—" : "" + v)}</span></div>`;
		$card.addClass("show").html(`<div class="bs-grid">
			${cell("Bag", b.name)}${cell("Design", b.design)}${cell("Size", b.size)}${cell("Pieces (qty)", d.n)}
			${cell("Purity", (b.purity || 0) + "%")}${cell("Gold in bag", d.gold_total + " g")}${cell("Stone wt", d.stone_g_total + " g")}${cell("Diamonds", (b.dmd_no || 0) + " no / " + (b.dmd_weight || 0) + " ct")}
		</div>`);

		const cols = ["#", "Gold (g)", "Diamonds (no/ct)"];
		if (hasPs) cols.push("Precious (no/ct)");
		if (hasCs) cols.push("Color (no/ct)");
		cols.push("Gross (g)");
		$head.html(`<tr>${cols.map((c) => `<th class="${c === "Gold (g)" || c === "Gross (g)" ? "num" : ""}">${c}</th>`).join("")}</tr>`);
		renderRows();
		$foot.addClass("show");
		$actions.empty();
		$(`<button class="btn btn-primary btn-sm">${__("Split")}</button>`).appendTo($actions).on("click", doSplit);
		focusScan();
	}

	function pieceGross(p) {
		return flt(p.gold) + (flt(p.dmd_ct) + flt(p.ps_ct) + flt(p.cs_ct)) * 0.2;
	}
	function renderRows() {
		const d = state.data;
		$body.empty();
		d.pieces.forEach((p, i) => {
			let cells = `<td>${i + 1}</td>
				<td class="num"><input type="number" step="0.001" class="bs-gold" data-i="${i}" value="${p.gold}"></td>
				<td>${p.dmd_no} no / ${flt(p.dmd_ct).toFixed(3)} ct</td>`;
			if (hasPs) cells += `<td>${p.ps_no} no / ${flt(p.ps_ct).toFixed(3)} ct</td>`;
			if (hasCs) cells += `<td>${p.cs_no} no / ${flt(p.cs_ct).toFixed(3)} ct</td>`;
			cells += `<td class="num bs-gross">${pieceGross(p).toFixed(3)}</td>`;
			$body.append(`<tr>${cells}</tr>`);
		});
		$body.find(".bs-gold").on("input", function () {
			const i = $(this).data("i");
			state.data.pieces[i].gold = flt(this.value);
			$(this).closest("tr").find(".bs-gross").text(pieceGross(state.data.pieces[i]).toFixed(3));
			recalcRemaining();
		});
		recalcRemaining();
	}
	function recalcRemaining() {
		const d = state.data;
		const used = d.pieces.reduce((s, p) => s + flt(p.gold), 0);
		const rem = Math.round((flt(d.gold_total) - used) * 1000) / 1000;
		$rem.removeClass("bad ok").addClass(Math.abs(rem) < 0.0005 ? "ok" : "bad");
		$rem.html(`Gold remaining in bag: <b>${rem.toFixed(3)}</b> g  ·  assigned ${used.toFixed(3)} / ${flt(d.gold_total).toFixed(3)} g`);
	}

	function doSplit() {
		const d = state.data;
		if (!d) return;
		const used = d.pieces.reduce((s, p) => s + flt(p.gold), 0);
		const rem = flt(d.gold_total) - used;
		const go = () => {
			frappe.dom.freeze(__("Splitting…"));
			frappe.call({ method: "jewelima.jewelima.api.split_bag", args: { order_bag: d.bag.name, pieces: JSON.stringify(d.pieces) } })
				.then((r) => {
					frappe.dom.unfreeze();
					const res = r.message || {};
					frappe.show_alert({ message: __("Split into {0} bags: {1}", [res.count, (res.created || []).join(", ")]), indicator: "green" }, 8);
					reset(true);
				})
				.catch(() => frappe.dom.unfreeze());
		};
		if (Math.abs(rem) >= 0.0005) {
			frappe.confirm(__("Gold isn't fully assigned ({0} g remaining). Piece 1 will absorb the difference. Continue?", [rem.toFixed(3)]), go);
		} else {
			go();
		}
	}

	function reset(keepMsg) {
		state.data = null;
		scan.set_value("");
		if (!keepMsg) setMsg("");
		$card.removeClass("show").empty();
		$head.empty(); $body.empty(); $foot.removeClass("show");
		focusScan();
	}

	scan.$input.on("keydown", (e) => {
		if (e.which === 13 || e.key === "Enter") { e.preventDefault(); const c = scan.$input.val(); scan.set_value(""); load(c); }
	});
	page.add_inner_button(__("Reset"), () => reset(false));
	focusScan();
};
