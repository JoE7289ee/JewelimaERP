// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Purchase Raw Material — a pure-JS entry screen that posts a Purchase Receipt.
// Route: /app/purchase-raw-material

frappe.pages["purchase-raw-material"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Purchase Raw Material", single_column: true });
	const state = { rows: [], header: {} };

	const COLS = [
		{ key: "item", label: "Item", type: "link", options: "Item", width: "220px" },
		{ key: "uom", label: "UOM", type: "display", width: "70px" },
		{ key: "purity", label: "Purity %", type: "num", step: "0.01", width: "90px" },
		{ key: "count", label: "Qty", type: "num", step: "1", width: "90px" },
		{ key: "gram", label: "Gram", type: "num", step: "0.001", width: "110px" },
		{ key: "carat", label: "Carat", type: "num", step: "0.001", width: "110px" },
	];

	$(page.main).append(`
		<style>
		.pr-wrap{display:flex;flex-direction:column;height:calc(100vh - 95px);gap:12px;}
		/* the header is a card: three things to set, then the grid does the work */
		.pr-head{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px 14px;margin:0;
			border:1px solid var(--border-color);border-radius:13px;padding:13px 16px;
			background:var(--fg-color);}
		/* up to five, sized so five fit a laptop without wrapping to a second line */
		.pr-title{font-size:15px;font-weight:800;letter-spacing:.07em;color:var(--text-color);
			display:flex;align-items:baseline;gap:10px;}
		.pr-title .pr-sub{font-size:11.5px;font-weight:400;letter-spacing:0;color:var(--text-muted);
			text-transform:none;}
		.pr-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;}
		.pr-tile{border:1px solid var(--border-color);border-radius:12px;padding:10px 14px;
			background:var(--fg-color);}
		.pr-tile .k{font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;
			color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
		.pr-tile .v{font-size:21px;font-weight:800;font-variant-numeric:tabular-nums;
			color:var(--text-color);line-height:1.25;}
		.pr-tile .v .s{font-size:11px;font-weight:600;color:var(--text-muted);}
		/* the pure-gold tile is the headline number on this page */
		.pr-tile.gold{background:rgba(218,165,32,.10);border-color:rgba(218,165,32,.45);}
		.pr-tile.gold .k{color:#8a6200;}
		.pr-tile.empty .v{color:var(--text-muted);font-weight:400;}
		/* the server REFUSES a mismatched warehouse — this says so while there is
		   still a sheet to fix, rather than after Post Purchase is pressed */
		.pr-warn{display:none;border:1px solid #e0a800;background:rgba(230,168,0,.10);
			border-radius:11px;padding:10px 14px;font-size:12.5px;font-weight:600;color:#8a6200;}
		.pr-warn.on{display:block;}
		.pr-warn b{color:#6b4c00;}
		/* a row says whether it will actually post: green will, red will not */
		table.pr-grid tr.pr-ok > td:first-child{box-shadow:inset 3px 0 0 #1d7a33;}
		table.pr-grid tr.pr-bad > td:first-child{box-shadow:inset 3px 0 0 #b02a2a;}
		table.pr-grid tr.pr-bad > td{background:rgba(176,42,43,.055);}
		table.pr-grid tr.pr-ok > td{background:rgba(29,122,51,.045);}
		/* the row number carries the line's nature: gold warm, stone cool — so a
		   sheet of mixed lines reads as two kinds of thing at a glance */
		table.pr-grid td.pr-num{font-weight:800;}
		table.pr-grid tr.pr-metal td.pr-num{background:rgba(218,165,32,.20);color:#7a5a00;}
		table.pr-grid tr.pr-stone td.pr-num{background:rgba(31,97,141,.16);color:#1f618d;}
		table.pr-grid tbody tr:hover > td{background:rgba(31,97,141,.06);}
		table.pr-grid tfoot td{font-variant-numeric:tabular-nums;}
		.pr-head .frappe-control{margin:0;}
		.pr-head .control-label{font-size:11px;margin:0 0 1px;color:var(--text-muted);}
		.pr-head .control-input-wrapper .control-input,.pr-head .control-input input,.pr-head .control-value{min-height:26px;height:26px;line-height:24px;font-size:12px;}
		.pr-head .help-box,.pr-head .description{display:none !important;}
		.pr-gridbox{flex:1 1 auto;overflow:auto;border:1px solid var(--border-color);border-radius:13px;}
		table.pr-grid{width:100%;border-collapse:separate;border-spacing:0;font-size:12px;background:var(--fg-color);}
		table.pr-grid th{position:sticky;top:0;z-index:2;
			background:linear-gradient(var(--control-bg,#f4f5f6),var(--fg-color));
			border-right:1px solid var(--border-color);border-bottom:2px solid var(--gray-400, #aeb6bf);
			padding:6px 8px;text-align:left;white-space:nowrap;font-weight:800;
			font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);}
		table.pr-grid td{border-right:1px solid var(--border-color);border-bottom:1px solid var(--border-color);padding:0 2px;vertical-align:middle;background:var(--fg-color);height:30px;}
		table.pr-grid td.pr-num{color:var(--text-muted);text-align:center;width:30px;background:var(--control-bg);}
		table.pr-grid input,table.pr-grid select{width:100%;border:1px solid var(--gray-400, #aeb6bf);background:var(--fg-color);
			padding:1px 4px;font-size:12px;color:var(--text-color);border-radius:3px;height:26px;line-height:1.1;box-sizing:border-box;}
		table.pr-grid input:focus,table.pr-grid select:focus{box-shadow:inset 0 0 0 1px var(--primary);outline:none;}
		table.pr-grid .frappe-control,table.pr-grid .frappe-control .form-group{margin:0;}
		table.pr-grid .frappe-control .help-box,table.pr-grid .frappe-control .description,table.pr-grid .frappe-control .control-label{display:none !important;}
		table.pr-grid .frappe-control .control-input-wrapper,table.pr-grid .frappe-control .control-input{margin:0;padding:0;min-height:0;}
		table.pr-grid .frappe-control .control-input input{border:1px solid var(--gray-400, #aeb6bf);background:var(--fg-color);padding:1px 4px;height:26px;min-height:26px;line-height:1.1;box-sizing:border-box;border-radius:3px;}
		table.pr-grid .frappe-control .link-btn{display:none !important;}
		table.pr-grid .pr-disp{padding:0 8px;color:var(--text-muted);white-space:nowrap;font-variant-numeric:tabular-nums;}
		table.pr-grid tfoot td{position:sticky;bottom:0;z-index:2;background:var(--control-bg, var(--fg-color));border-top:2px solid var(--gray-400, #aeb6bf);border-right:1px solid var(--border-color);font-weight:700;padding:3px 6px;text-align:right;white-space:nowrap;}
		table.pr-grid tfoot td.pr-foot-label{text-align:left;}
		.pr-foot{margin-top:1px;color:var(--text-muted);font-size:12px;}
		</style>
		<div class="pr-wrap">
			<div class="pr-title">${__("PURCHASE RAW MATERIAL")}
				<span class="pr-sub">${__("gold and stones into stock")}</span></div>
			<div class="pr-head">
				<div class="pr-h-voucher"></div><div class="pr-h-supplier"></div><div class="pr-h-wh"></div>
			</div>
			<div class="pr-tiles"></div>
			<div class="pr-warn"></div>
			<div class="pr-gridbox">
				<table class="pr-grid"><thead><tr class="pr-headrow"></tr></thead><tbody class="pr-body"></tbody><tfoot><tr class="pr-footrow"></tr></tfoot></table>
			</div>
			<div class="pr-foot"><span class="pr-count">0</span> line(s). Pick an item first — metals fill <b>Gram</b>, stones fill <b>Qty</b> + <b>Carat</b>. A new row appears as you enter a weight. <b style="color:#1d7a33;">Green</b> lines will post; <b style="color:#b02a2a;">red</b> ones are missing something and would be dropped. Posts a submitted Purchase Receipt.</div>
		</div>
	`);

	const mk = (sel, df) => {
		const c = frappe.ui.form.make_control({ df, parent: $(page.main).find(sel).get(0), render_input: true });
		c.refresh();
		return c;
	};
	state.header.voucher = mk(".pr-h-voucher", { fieldtype: "Link", label: "Voucher Type", fieldname: "voucher_type", options: "Voucher Type", reqd: 1 });
	state.header.voucher.set_value("SIN"); // Stock Import unless the buyer says otherwise
	state.header.supplier = mk(".pr-h-supplier", { fieldtype: "Link", label: "Supplier", fieldname: "supplier", options: "Supplier" });
	state.header.warehouse = mk(".pr-h-wh", { fieldtype: "Link", label: "Warehouse", fieldname: "warehouse", options: "Warehouse", get_query: () => ({ filters: { is_group: 0, custom_is_purchase_location: 1 } }) });
	// posted today, always — a read-only box showing today's date is a field that
	// asks a question with one answer
	state.postingDate = frappe.datetime.get_today();

	// Supplier defaults; the WAREHOUSE deliberately does not. Defaulting to Gold
	// Issue meant a stone purchase started out pointed at the wrong warehouse and
	// only the server's own rule caught it. It is set from the first item picked
	// instead — gold to Gold Issue, stones to Stone Issue — and never overwritten
	// once a buyer has chosen for themselves.
	frappe.db.get_value("Supplier", "JD Stock", "name").then((r) => {
		if (r.message && r.message.name) state.header.supplier.set_value("JD Stock");
	});
	state.header.warehouse.$input.on("change", () => { state.whTouched = true; paintWarning(); });

	// ONE shot, on the FIRST item of the sheet. The flag is set before the lookup
	// returns, not after, so a second item picked while the first is still in
	// flight cannot start a second write — that race is how a stone added after
	// three gold lines moved the warehouse out from under the buyer.
	function warehouseFor(isStone) {
		if (state.whDecided || state.whTouched) return;
		state.whDecided = true;
		if (state.header.warehouse.get_value()) return;   // buyer already chose
		const want = isStone ? "Stone Issue" : "Gold Issue";
		frappe.db.get_value("Warehouse", { warehouse_name: want }, "name").then((r) => {
			if (r.message && r.message.name && !state.whTouched) {
				state.header.warehouse.set_value(r.message.name);
			}
		});
	}

	const $hr = $(page.main).find(".pr-headrow");
	$hr.append('<th class="pr-num">#</th>');
	COLS.forEach((c) => $hr.append(`<th style="min-width:${c.width}">${frappe.utils.escape_html(c.label)}</th>`));
	$hr.append('<th style="width:34px"></th>');

	const $body = $(page.main).find(".pr-body");

	const $fr = $(page.main).find(".pr-footrow");
	$fr.append('<td class="pr-foot-label">Total</td>');
	const totals = {};
	COLS.forEach((c) => {
		const $td = $("<td></td>").appendTo($fr);
		if (c.key === "count" || c.key === "gram" || c.key === "carat") totals[c.key] = $td;
	});
	$fr.append("<td></td>");

	// sieve averages per GROUP (DMD / CVD / CZ / SW — one chart, four columns).
	// Entering CARATS on any sized stone row judges the piece COUNT = carats /
	// that group's avg (editable after).
	// What a row counts towards on the tile strip.
	function bracketOf(group, isStone) {
		if (!group) return "";
		if (/finding/i.test(group)) return __("GOLD FINDINGS");
		if (!isStone) return group;                     // GOLD STANDARD, GOLD 14K …
		// A stone counts under its OWN group, never its parent. For diamonds that
		// parent is just "DIAMOND", and rolling VVS-EF in with SI-IJ would hide the
		// distinction the whole trade is priced on. The redundant "DIAMOND " prefix
		// comes off the label — the tile says VVS-EF, which is what it is called.
		return group.replace(/^DIAMOND\s+/i, "").trim() || group;
	}

	let SIEVE = {};
	frappe.call({ method: "jewelima.jewelima.api.get_sieve_map" }).then((r) => { SIEVE = r.message || {}; });
	function sieveAvg(item, stone_type) {
		const G = SIEVE._groups || {};
		const grp = stone_type === "Diamond" ? "DMD"
			: stone_type === "CVD" ? "CVD"
			: stone_type === "Cubic Zirconia" ? "CZ"
			: stone_type === "Swarovski" ? "SW"
			: stone_type === "Color Stone" && (item || "").startsWith("SW") ? "SW" : null;
		if (!grp) return 0;
		const size = (item || "").split(" ").slice(1).join(" ");
		return (G[grp] || {})[size] || 0;
	}

	// A row COUNTS only if the server would accept it: an item, a weight, and for a
	// sized stone a piece count. Anything else is either still being typed (the
	// blank trailing line) or will be silently dropped — and silently dropped is
	// what the colours exist to stop.
	function rowState(r) {
		const item = r.f.item.get();
		const wt = flt(r.isStone ? r.f.carat.get() : r.f.gram.get());
		const cnt = cint(r.f.count.get());
		if (!item && !wt && !cnt) return "";                     // the next line, untouched
		if (!item) return "bad";                                  // a weight with nothing to weigh
		if (wt <= 0) return "bad";                                // an item nobody said how much of
		if (r.isStone && r._avg && cnt <= 0) return "bad";        // sized stones need a count
		return "ok";
	}

	function recalc() {
		let csum = 0, gsum = 0, ctsum = 0, pure = 0, live = 0;
		const byGroup = {}, byStone = {};
		state.rows.forEach((r) => {
			const st = rowState(r);
			r.$tr.removeClass("pr-ok pr-bad");
			if (st) r.$tr.addClass(st === "ok" ? "pr-ok" : "pr-bad");
			csum += cint(r.f.count.get());
			gsum += flt(r.f.gram.get());
			ctsum += flt(r.f.carat.get());
			if (st !== "ok") return;                 // tiles count only what will post
			live++;
			const bracket = bracketOf(r.group, r.isStone);
			if (r.isStone) {
				// stones are bracketed the same way but measured in carats, so they
				// are kept apart from the gram totals rather than added to them
				const ct = flt(r.f.carat.get());
				if (bracket) byStone[bracket] = (byStone[bracket] || 0) + ct;
			} else {
				const g = flt(r.f.gram.get());
				// PURE gold is the weight through its own purity — 300 g of 995 is
				// 298.5 g of gold, and that is the number the vault cares about
				pure += g * (flt(r.purityPct) / 100);
				if (bracket) byGroup[bracket] = (byGroup[bracket] || 0) + g;
			}
		});
		if (totals.count) totals.count.text(csum || "");
		if (totals.gram) totals.gram.text(gsum ? gsum.toFixed(3) : "");
		if (totals.carat) totals.carat.text(ctsum ? ctsum.toFixed(3) : "");
		$(page.main).find(".pr-count").text(state.rows.length);
		paintTiles({ pure, byGroup, byStone, carats: ctsum, pieces: csum, live });
		paintWarning();
	}

	// Gold belongs in Gold Issue and stones in Stone Issue — the server throws on
	// the mix, so the whole sheet fails on Post. Saying it here costs nothing and
	// saves the buyer finding out after they have filled it in.
	function paintWarning() {
		const wh = state.header.warehouse.get_value() || "";
		const $w = $(page.main).find(".pr-warn");
		if (!wh) { $w.removeClass("on").empty(); return; }
		frappe.db.get_value("Warehouse", wh, "warehouse_name").then((r) => {
			const name = ((r.message || {}).warehouse_name) || "";
			const named = (stone) => state.rows
				.filter((x) => rowState(x) === "ok" && !!x.isStone === stone)
				.map((x) => x.f.item.get());
			let msg = "";
			// A heads-up, not a barrier: the mix is allowed, and the buyer may well
			// mean it. The wording says where things usually go and leaves the
			// decision where it belongs.
			if (name === "Gold Issue" && named(true).length) {
				msg = __("Heads up — <b>{0}</b> {1} a stone, and stones usually go into <b>Stone Issue</b>. Post it here if that is what you mean.",
					[named(true).join(", "), named(true).length > 1 ? __("are") : __("is")]);
			} else if (name === "Stone Issue" && named(false).length) {
				msg = __("Heads up — <b>{0}</b> {1} metal, and metal usually goes into <b>Gold Issue</b>. Post it here if that is what you mean.",
					[named(false).join(", "), named(false).length > 1 ? __("are") : __("is")]);
			}
			$w.html(msg).toggleClass("on", !!msg);
		});
	}

	// At most five, and only the ones that have something to say — an empty tile
	// is a number the reader has to rule out.
	function paintTiles(t) {
		const g3 = (v) => flt(v).toFixed(3);
		const tiles = [];
		if (t.pure > 0) {
			tiles.push({ k: __("Pure gold in"), v: g3(t.pure), s: "g", cls: "gold" });
		}
		// a fixed reading order, so the strip does not reshuffle as rows are typed
		const rank = (g) => (/standard/i.test(g) ? 0 : /finding/i.test(g) ? 1 : 2);
		Object.keys(t.byGroup).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
			.forEach((grp) => {
				if (tiles.length < 4) tiles.push({ k: grp, v: g3(t.byGroup[grp]), s: "g" });
			});
		Object.keys(t.byStone).sort().forEach((grp) => {
			if (tiles.length < 5) tiles.push({ k: grp, v: g3(t.byStone[grp]), s: "ct", cls: "stone" });
		});
		if (t.pieces > 0 && tiles.length < 5) tiles.push({ k: __("Pieces"), v: t.pieces, s: "" });
		$(page.main).find(".pr-tiles").html(tiles.slice(0, 5).map((x) => `
			<div class="pr-tile ${x.cls || ""}">
				<div class="k">${frappe.utils.escape_html(x.k)}</div>
				<div class="v">${x.v}${x.s ? ` <span class="s">${x.s}</span>` : ""}</div>
			</div>`).join("")
			|| `<div class="pr-tile empty"><div class="k">${__("Nothing entered yet")}</div>
				<div class="v">—</div></div>`);
	}
	function renumber() {
		$body.find("tr").each((i, tr) => $(tr).find(".pr-num").text(i + 1));
	}

	function onItem(row) {
		const item = row.f.item.get();
		if (!item || row._last === item) return;
		row._last = item;
		frappe.db.get_value("Item", item, ["weight_unit", "purity_percentage", "stone_type",
				"item_group"]).then((r) => {
			const v = r.message || {};
			if (row.setUom) row.setUom(v.weight_unit);
			row.isStone = !!v.stone_type;
			row.$tr.removeClass("pr-metal pr-stone").addClass(row.isStone ? "pr-stone" : "pr-metal");
			row.group = v.item_group || "";
			row.purityPct = flt(v.purity_percentage);
			warehouseFor(row.isStone);      // first item decides where it lands
			const $c = row.inputs.count, $g = row.inputs.gram, $ct = row.inputs.carat, $p = row.inputs.purity;
			if (row.isStone) {
				row._avg = sieveAvg(item, v.stone_type); // per-group chart: DMD/CVD/CZ/SW
				if ($ct && !row._sieveWired) {
					row._sieveWired = true;
					$ct.on("input", () => {
						const ct = parseFloat($ct.val());
						if (row._avg && ct > 0 && $c) { $c.val(Math.max(1, Math.round(ct / row._avg))); recalc(); }
					});
				}
				if ($c) $c.prop("disabled", false).attr("placeholder", "count");
				if ($g) $g.prop("disabled", true).val("").attr("placeholder", "—");
				if ($ct) $ct.prop("disabled", false).attr("placeholder", "carats");
				if ($p) $p.prop("disabled", true).val("").attr("placeholder", "—");
			} else {
				if ($c) $c.prop("disabled", true).val("").attr("placeholder", "—");
				if ($g) $g.prop("disabled", false).attr("placeholder", "grams");
				if ($ct) $ct.prop("disabled", true).val("").attr("placeholder", "—");
				// purity is the ITEM's — shown, never edited (stock is item-keyed,
				// so a typed purity could never land anywhere anyway)
				if ($p) $p.prop("disabled", true).val(v.purity_percentage || "").attr("placeholder", "%");
			}
			recalc();
		});
	}

	function addRow() {
		const $tr = $("<tr></tr>");
		$tr.append('<td class="pr-num"></td>');
		const row = { $tr, f: {}, inputs: {} };
		COLS.forEach((col) => {
			const $td = $("<td></td>").appendTo($tr);
			if (col.type === "link") {
				const ctrl = frappe.ui.form.make_control({
					df: { fieldtype: "Link", options: col.options, fieldname: col.key, placeholder: col.label, get_query: () => ({ query: "jewelima.jewelima.api.purchase_item_query" }) },
					parent: $td.get(0),
					render_input: true,
				});
				ctrl.refresh();
				row.f[col.key] = { get: () => ctrl.get_value(), set: (v) => ctrl.set_value(v || "") };
				ctrl.$input.on("change awesomplete-selectcomplete", () => setTimeout(() => onItem(row), 50));
			} else if (col.type === "display") {
				const $s = $('<div class="pr-disp"></div>').appendTo($td);
				row.f[col.key] = { get: () => $s.text(), set: (v) => $s.text(v == null ? "" : v) };
				if (col.key === "uom") row.setUom = (v) => $s.text(v || "");
			} else {
				const $i = $(`<input type="number" step="${col.step}" min="0">`).appendTo($td);
				row.f[col.key] = { get: () => $i.val(), set: (v) => $i.val(v == null ? "" : v) };
				row.inputs[col.key] = $i;
				$i.prop("disabled", true).attr("placeholder", "—"); // enabled by onItem once an item is picked
				if (col.key === "gram" || col.key === "carat") $i.on("input", () => maybeAddRow(row));
			}
		});
		const $rm = $('<td><button class="btn btn-xs btn-default" title="Remove">&times;</button></td>').appendTo($tr);
		$rm.find("button").on("click", () => {
			state.rows = state.rows.filter((r) => r !== row);
			$tr.remove();
			// There is no Add Row button any more — a line appears when the one
			// above it gets a weight. Delete the trailing blank and the sheet has
			// nowhere left to type, so the sheet always keeps one empty line.
			ensureBlankRow();
			renumber();
			recalc();
		});
		$body.append($tr);
		state.rows.push(row);
		renumber();
		recalc();
		return row;
	}
	state.addRow = addRow;

	// the sheet is never left with nothing to type into
	function ensureBlankRow() {
		const last = state.rows[state.rows.length - 1];
		const empty = last && !last.f.item.get()
			&& !flt(last.f.gram.get()) && !flt(last.f.carat.get());
		if (!empty) addRow();
	}

	// auto-append a fresh line once the last row gets a weight (gram or carat)
	function maybeAddRow(row) {
		const hasWeight = flt(row.f.gram.get()) > 0 || flt(row.f.carat.get()) > 0;
		if (hasWeight && state.rows[state.rows.length - 1] === row) addRow();
	}

	$body.on("input change", "input", () => recalc());

	addRow();

	// Print BEFORE posting: the sheet is checked on paper, or handed to whoever is
	// weighing, while it can still be changed. It prints exactly the lines that
	// would post — the red ones are left off, because they are not part of the
	// purchase and putting them on the paper would say otherwise.
	// Reset: a fresh sheet without reloading the page. The warehouse decision is
	// released too, so the next first item picks it again — a reset that kept the
	// old warehouse would quietly send the next purchase to the wrong place.
	function resetSheet() {
		$body.empty();
		state.rows = [];
		state.whTouched = false;
		state.whDecided = false;
		state.header.warehouse.set_value("");
		state.header.voucher.set_value("SIN");
		state.postingDate = frappe.datetime.get_today();
		$(page.main).find(".pr-warn").removeClass("on").empty();
		addRow();
		recalc();
		frappe.show_alert({ message: __("Sheet cleared."), indicator: "blue" }, 3);
	}
	page.add_inner_button(__("Reset"), () => {
		const typed = state.rows.some((r) => r.f.item.get()
			|| flt(r.f.gram.get()) || flt(r.f.carat.get()));
		if (!typed) return resetSheet();
		// there is work on the sheet — ask, because this cannot be undone
		frappe.confirm(__("Clear the whole sheet? Nothing here has been posted."), resetSheet);
	});
	page.add_inner_button(__("Print"), () => printSheet(page, state));
	page.set_primary_action(__("Post Purchase"), () => postPurchase(page, state, $body), "add");
};

function postPurchase(page, state, $body) {
	const supplier = state.header.supplier.get_value();
	const warehouse = state.header.warehouse.get_value();
	const posting_date = state.postingDate;
	const items = state.rows
		.map((r) => ({ item: r.f.item.get() || undefined, weight: flt(r.isStone ? r.f.carat.get() : r.f.gram.get()) || 0, count: cint(r.f.count.get()) || 0, purity: flt(r.f.purity.get()) || 0, isStone: !!r.isStone, hasSieve: !!r._avg }))
		.filter((l) => l.item && l.weight > 0);

	if (!items.length) return frappe.msgprint(__("Add at least one item with a weight."));
	// only SIZED stones need a count — bulk parents (e.g. CZ, no sieve) go in without one
	const badStone = items.find((l) => l.isStone && l.hasSieve && l.count <= 0);
	if (badStone) return frappe.msgprint(__("{0} is a sized stone — enter the piece count (Qty).", [badStone.item]));
	if (!supplier) return frappe.msgprint(__("Select a supplier."));
	const voucher_type = state.header.voucher.get_value();
	if (!voucher_type) return frappe.msgprint(__("Pick the voucher type."));
	if (!warehouse) return frappe.msgprint(__("Select a warehouse."));

	frappe.dom.freeze(__("Posting purchase…"));
	frappe.call({
		method: "jewelima.jewelima.api.post_raw_material_purchase",
		args: { supplier, warehouse, posting_date, voucher_type, items: JSON.stringify(items) },
	}).then((r) => {
		frappe.dom.unfreeze();
		const res = r.message || {};
		if (!res.name) return;
		frappe.show_alert({ message: __("Posted {0} · {1} (₹ {2})", [res.name, res.record, res.total]), indicator: "green" }, 6);
		$body.empty();
		state.rows = [];
		state.whDecided = false;      // a new sheet decides its warehouse again
		state.whTouched = false;
		state.addRow();
	}).catch(() => frappe.dom.unfreeze());
}


function printSheet(page, state) {
	const esc = frappe.utils.escape_html;
	const g3 = (v) => (parseFloat(v) || 0).toFixed(3);
	const lines = state.rows
		.map((r) => ({
			item: r.f.item.get(), isStone: !!r.isStone,
			purity: r.f.purity.get(), uom: r.f.uom.get(),
			count: parseInt(r.f.count.get(), 10) || 0,
			gram: parseFloat(r.f.gram.get()) || 0,
			carat: parseFloat(r.f.carat.get()) || 0,
		}))
		.filter((l) => l.item && (l.gram > 0 || l.carat > 0));
	if (!lines.length) {
		return frappe.msgprint(__("Nothing to print yet — add an item and a weight."));
	}
	const gsum = lines.reduce((a, l) => a + l.gram, 0);
	const ctsum = lines.reduce((a, l) => a + l.carat, 0);
	const csum = lines.reduce((a, l) => a + l.count, 0);
	const pure = lines.filter((l) => !l.isStone)
		.reduce((a, l) => a + l.gram * ((parseFloat(l.purity) || 0) / 100), 0);

	const rows = lines.map((l, i) => `<tr>
		<td class="n">${i + 1}</td>
		<td><b>${esc(l.item)}</b></td>
		<td>${esc(l.uom || "")}</td>
		<td class="n">${l.isStone ? "" : (l.purity || "")}</td>
		<td class="n">${l.count || ""}</td>
		<td class="n">${l.gram ? g3(l.gram) : ""}</td>
		<td class="n">${l.carat ? g3(l.carat) : ""}</td></tr>`).join("");

	const body = `
		<div class="ps-head">
			<div><span class="k">${__("Voucher")}</span> <b>${esc(state.header.voucher.get_value() || "")}</b></div>
			<div><span class="k">${__("Supplier")}</span> <b>${esc(state.header.supplier.get_value() || "")}</b></div>
			<div><span class="k">${__("Warehouse")}</span> <b>${esc(state.header.warehouse.get_value() || "")}</b></div>
			<div><span class="k">${__("Date")}</span> <b>${frappe.datetime.str_to_user(state.postingDate)}</b></div>
		</div>
		<table class="ps-t"><thead><tr>
			<th class="n"></th><th>${__("Item")}</th><th>${__("UOM")}</th>
			<th class="n">${__("Purity %")}</th><th class="n">${__("Qty")}</th>
			<th class="n">${__("Gram")}</th><th class="n">${__("Carat")}</th>
		</tr></thead><tbody>${rows}</tbody>
		<tfoot><tr><td></td><td>${__("Total")}</td><td></td><td></td>
			<td class="n">${csum || ""}</td>
			<td class="n">${gsum ? g3(gsum) : ""}</td>
			<td class="n">${ctsum ? g3(ctsum) : ""}</td></tr></tfoot></table>
		${pure > 0 ? `<div class="ps-pure">${__("Pure gold in")}: <b>${g3(pure)} g</b></div>` : ""}
		<div class="ps-note">${__("NOT YET POSTED — this is the sheet as entered.")}</div>
		<div class="ps-sig"><div>${__("Weighed by")}</div><div>${__("Checked by")}</div></div>`;

	const CSS = `
		@page{size:A4 portrait;margin:14mm 12mm;}
		.ps-head{display:flex;gap:26px;flex-wrap:wrap;font-size:12px;margin:0 0 12px;}
		.ps-head .k{color:#666;text-transform:uppercase;font-size:9.5px;letter-spacing:.05em;}
		table.ps-t{width:100%;border-collapse:collapse;font-size:11.5px;}
		table.ps-t th{text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.05em;
			border-bottom:1.2px solid #000;padding:5px 6px;}
		table.ps-t td{padding:4px 6px;border-bottom:1px solid #ccc;}
		table.ps-t .n{text-align:right;white-space:nowrap;}
		table.ps-t tfoot td{border-top:1.2px solid #000;border-bottom:none;font-weight:800;padding-top:6px;}
		.ps-pure{margin-top:10px;font-size:13px;}
		.ps-note{margin-top:14px;font-size:10.5px;color:#8a6200;font-weight:700;letter-spacing:.04em;}
		.ps-sig{margin-top:30px;display:flex;justify-content:space-between;font-size:10px;color:#333;}
		.ps-sig div{border-top:1px solid #000;padding-top:3px;width:38%;text-align:center;}`;

	frappe.call({ method: "jewelima.jewelima.api.get_print_branding" }).then((r) => {
		jewelima.print_window(r.message || {}, __("Purchase Raw Material"), body, CSS);
	});
}
