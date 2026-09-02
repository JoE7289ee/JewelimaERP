// Repair Billing (REPAIR > Billing) — the floor of what is still to bill, and
// the batch weighed out and priced.
//
// It opens on the batches with pieces still to bill, one tile each, because
// that is the question someone at the counter actually has: what is waiting.
// Picking one opens it.
//
// A batch is rarely finished all at once: half goes back to the party while the
// rest is still on the bench. So pieces are TICKED and only the ticked ones are
// billed; the rest stay open and get their own bill later. A piece belongs to
// one bill, and the server refuses to bill it twice.
//
// The weigh-out is not held hostage to billing either — a weight can be written
// on a piece and saved on its own, which is how it happens in practice. Same for
// the work a piece turns out to need, which is often only obvious at this
// counter, so it can be added here rather than back at the intake.
//
// The difference between the weights is metal added: a soldered piece comes back
// heavier and that gold belongs on the bill, so it is its own figure rather than
// buried in the weights. Work is priced by TYPE on the right, not piece by
// piece — five solderings is one line at a rate, because that is how it is agreed.
// Route: /app/repair-billing
frappe.pages["repair-billing"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Repair Billing"), single_column: true });
	const API = "jewelima.jewelima.repair_api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const cint = (v) => parseInt(v, 10) || 0;
	const g3 = (v) => flt(v).toFixed(3);
	const $w = $(page.main);

	// D = the batch on screen; picked = the pieces ticked to bill now
	const S = { tiles: [], D: null, picked: new Set(), rates: {}, stoneRates: {},
		gold: 0, gst: 0, sieves: [], saving: false };

	// The same split the bill does. Keeping it here means the screen shows the
	// money the server will store, not an estimate of it — see rate_for_karat
	// in repair_bill.py, which is the one place the derivation lives.
	// Kept in step with rate_for_karat() in repair_bill.py — the board rate is
	// quoted WITH GST, so the tax comes out of it (board / 1.03, not board less
	// 3%) before the karat's purity is taken.
	const GST = 3;
	const PURITY = { "22": 91.6, "18": 75, "14": 58.3, "9": 37.5 };
	const rateForKarat = (board, karat) => {
		const k = String(karat || "").trim();
		if (!k) return flt(board);
		const net = flt(board) / (1 + GST / 100);
		return net * (PURITY[k] !== undefined ? PURITY[k] : flt(k) * 100 / 24) / 100;
	};
	const sKey = (st) => `${st.bucket || ""}||${st.sieve || ""}`;

	function priceRow(i) {
		const work = (i.work_types || []).reduce(
			(a, w) => a + flt(S.rates[w]) * (cint((i.work_counts || {})[w]) || 1), 0);
		const added = flt(i.weight_out) ? flt(i.weight_out) - flt(i.weight_in) : 0;
		const rate = rateForKarat(S.gold, i.karat);
		const metal = added * rate;
		const stone = (i.stones || []).reduce((a, st) => a + flt(st.ct) * flt(S.stoneRates[sKey(st)]), 0);
		const manual = flt(i.manual_amount);
		return { work, metal, stone, manual, total: work + metal + stone + manual, added, rate };
	}

	// Nobody should have to take a figure on trust. Each money cell carries the
	// sum that produced it — the metal one especially, now that the board rate
	// goes through GST and a purity before it reaches the piece.
	const money = (v) => format_currency(v);
	function whyWork(i) {
		const w = (i.work_types || []);
		if (!w.length) return __("No type of work on this piece.");
		const parts = w.map((n) => `${n} ${money(flt(S.rates[n]))}`);
		const total = w.reduce((a, n) => a + flt(S.rates[n]), 0);
		return __("One rate per type of work on the piece:") + "\n  "
			+ parts.join("\n  ") + "\n  " + __("= {0}", [money(total)]);
	}
	function whyMetal(i) {
		if (!flt(i.weight_out)) return __("Weigh the piece out first.");
		const P = priceRow(i);
		if (!flt(S.gold)) return __("No gold board rate entered, so metal is not charged.");
		const net = flt(S.gold) / (1 + GST / 100);
		const pur = PURITY[i.karat];
		return [
			__("Board rate {0} (with {1}% GST in it)", [money(S.gold), GST]),
			__("GST taken out ({0} / 1.{1}) = {2}", [money(S.gold), GST < 10 ? "0" + GST : GST, money(net)]),
			i.karat ? __("{0}k is {1}% of that = {2} / g", [i.karat, pur, money(P.rate)])
			        : __("no karat set, so the board rate is used as it is"),
			__("{0} g added x {1} = {2}", [g3(P.added), money(P.rate), money(P.metal)]),
		].join("\n");
	}
	function whyStone(i) {
		const st = (i.stones || []);
		if (!st.length) return __("No stones on this piece.");
		return __("Each line at its rate per carat:") + "\n  "
			+ st.map((x) => `${x.bucket || x.stone} ${x.sieve || ""} ${flt(x.ct).toFixed(3)} ct `
				+ `x ${money(flt(S.stoneRates[sKey(x)]))} = ${money(flt(x.ct) * flt(S.stoneRates[sKey(x)]))}`).join("\n  ");
	}

	$w.append(`
		<style>
		#page-repair-billing .container{max-width:100%;}
		.rb-wrap{max-width:100%;}
		.rb-bar{display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin-bottom:13px;}
		.rb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:13px;}
		.rb-card2{border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);
			padding:13px 15px;cursor:pointer;transition:box-shadow .12s,transform .12s;}
		.rb-card2:hover{box-shadow:0 3px 12px rgba(0,0,0,.10);transform:translateY(-1px);}
		.rb-card2 .p{font-size:14px;font-weight:800;margin-bottom:1px;}
		.rb-card2 .r{font-size:11px;color:var(--text-muted);margin-bottom:9px;}
		.rb-card2 .n{display:flex;gap:14px;align-items:baseline;}
		.rb-card2 .n b{font-size:21px;font-weight:800;font-variant-numeric:tabular-nums;}
		.rb-card2 .n span{font-size:11px;color:var(--text-muted);}
		.rb-flag{display:inline-block;font-size:9.5px;font-weight:800;text-transform:uppercase;
			letter-spacing:.04em;border-radius:9px;padding:1px 7px;margin-left:6px;vertical-align:2px;}
		.rb-flag.part{background:#fff3cd;color:#8a6d00;border:1px solid #e8d18a;}
		.rb-flag.ready{background:#e6f4ea;color:#1d7a33;border:1px solid #a8d5b5;}
		.rb-hint{font-size:11px;color:var(--text-muted);margin-top:8px;}

		.rb-tiles{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;}
		.rb-tile{border:1px solid var(--border-color);border-radius:11px;background:var(--fg-color);
			padding:9px 16px;min-width:120px;}
		.rb-tile .k{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);}
		.rb-tile .v{font-size:19px;font-weight:800;font-variant-numeric:tabular-nums;}
		.rb-tile.add .v{color:#1d7a33;} .rb-tile.less .v{color:#b02a2a;}
		.rb-tile.money .v{color:#1f618d;}

		.rb-cols{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;}
		/* the pieces table runs the full width — it carries the money breakup now,
		   so the charge panels sit under it rather than stealing a third of it */
		.rb-half{flex:1 1 420px;min-width:340px;}
		.rb-tile.rate .v input{width:120px;border:1px solid var(--border-color);border-radius:7px;
			padding:2px 8px;font-size:17px;font-weight:800;text-align:right;background:var(--fg-color);
			color:var(--text-color);font-variant-numeric:tabular-nums;}
		.rb-tile.grand{background:rgba(31,97,141,.10);border-color:rgba(31,97,141,.40);}
		.rb-tile.grand .v{color:#1f618d;}
		[data-theme="dark"] .rb-tile.grand .v{color:#8fc1e8;}
		[data-theme="dark"] .rb-tile.money .v{color:#8fc1e8;}
		.rb-grand{font-size:15px;margin-bottom:8px;}
		.rb-grand b{font-size:20px;font-variant-numeric:tabular-nums;}
		table.rb-t select.rb-kt{width:100%;border:1px solid var(--border-color);border-radius:7px;
			padding:4px 6px;font-size:12.5px;background:var(--fg-color);color:var(--text-color);}
		td.rb-st{font-size:11px;line-height:1.45;cursor:pointer;}
		td.rb-st:hover{color:var(--text-color);}
		.rb-add{color:var(--text-muted);font-style:italic;border-bottom:1px dashed var(--border-color);}
		.rb-card{border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);
			overflow:hidden;margin-bottom:12px;}
		.rb-h{padding:10px 14px;border-bottom:1px solid var(--border-color);background:var(--control-bg);
			font-size:11.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--text-muted);
			display:flex;justify-content:space-between;align-items:center;gap:8px;}
		/* a colour per panel, the same three the intake screen uses: amber for the
		   pieces, blue for what is being charged for them */
		.rb-card{border-left:3px solid var(--border-color);}
		.rb-card.pieces{border-left-color:#8a6d00;}
		.rb-card.pieces > .rb-h{background:rgba(224,168,0,.13);color:#8a6d00;}
		.rb-card.work{border-left-color:#1f618d;}
		.rb-card.work > .rb-h{background:rgba(31,97,141,.09);color:#1f618d;}
		.rb-card.stones{border-left-color:#1f618d;}
		.rb-card.stones > .rb-h{background:rgba(31,97,141,.09);color:#1f618d;}
		[data-theme="dark"] .rb-card.pieces{border-left-color:#d4a72c;}
		[data-theme="dark"] .rb-card.pieces > .rb-h{color:#e8c66b;}
		[data-theme="dark"] .rb-card.work,[data-theme="dark"] .rb-card.stones{border-left-color:#5b9bd5;}
		[data-theme="dark"] .rb-card.work > .rb-h,[data-theme="dark"] .rb-card.stones > .rb-h{color:#8fc1e8;}
		table.rb-t{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.rb-t th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em;
			color:var(--text-muted);padding:7px 10px;font-weight:700;border-bottom:1px solid var(--border-color);}
		table.rb-t td{padding:5px 10px;border-bottom:1px solid var(--border-color);vertical-align:middle;}
		table.rb-t tr:last-child td{border-bottom:none;}
		table.rb-t td.num{text-align:right;font-variant-numeric:tabular-nums;}
		table.rb-t input[type=number]{width:100%;box-sizing:border-box;border:1px solid var(--border-color);
			border-radius:7px;padding:5px 9px;font-size:12.5px;text-align:right;
			background:var(--fg-color);color:var(--text-color);font-variant-numeric:tabular-nums;}
		table.rb-t tbody tr:nth-child(even) td{background:rgba(128,128,128,.055);}
		table.rb-t tbody tr:hover td{background:rgba(31,97,141,.09);}
		tr.rb-done{opacity:.55;}
		tr.rb-on{background:var(--control-bg);}
		/* Colour here marks what is NOT ready, so the eye lands on the pieces
		   that still need something rather than on decoration. */
		tr.rb-warn td{background:rgba(224,168,0,.10);}
		tr.rb-warn.rb-on td{background:rgba(224,168,0,.16);}
		td.rb-miss input{border-color:#d9534f !important;background:rgba(217,83,79,.07);}
		td.rb-miss input::placeholder{color:#b02a2a;}
		.rb-flag2{display:inline-block;font-size:9px;font-weight:800;text-transform:uppercase;
			letter-spacing:.04em;border-radius:8px;padding:0 5px;margin-left:5px;vertical-align:1px;
			background:#fdecea;color:#b02a2a;border:1px solid #f0b6b2;}
		.rb-tile.warn{border-color:rgba(224,168,0,.45);background:rgba(224,168,0,.10);}
		.rb-tile.warn .v{color:#8a6d00;}
		[data-theme="dark"] .rb-tile.warn .v{color:#e8c66b;}
		.rb-tile.rate.unset .v input{border-color:#d9534f;background:rgba(217,83,79,.07);}
		/* a figure you can ask about */
		.rb-why{cursor:help;}
		.rb-why:hover{background:var(--control-bg);}
		.rb-added{font-weight:700;} .rb-added.up{color:#1d7a33;} .rb-added.down{color:#b02a2a;}
		.rb-work{font-size:11px;color:var(--text-muted);cursor:pointer;border-bottom:1px dashed var(--border-color);}
		.rb-work:hover{color:var(--text-color);}
		.rb-work.none{font-style:italic;}
		.rb-none{padding:40px;text-align:center;color:var(--text-muted);}
		.rb-foot{padding:9px 14px;border-top:1px solid var(--border-color);display:flex;
			justify-content:space-between;font-size:13px;font-weight:800;}
		.rb-note{width:100%;box-sizing:border-box;border:1px solid var(--border-color);border-radius:8px;
			padding:8px 11px;font-size:13px;background:var(--fg-color);color:var(--text-color);}
		.rb-billed{font-size:10.5px;color:var(--text-muted);}
		.rb-print{cursor:pointer;text-decoration:underline dotted;}
		.rb-print:hover{color:var(--text-color);}
		</style>
		<div class="rb-wrap"><div class="rb-body"></div></div>
	`);
	const $body = $w.find(".rb-body");

	// ---- the floor: batches with pieces still to bill ----------------------
	function showFloor() {
		S.D = null; S.picked.clear();
		page.set_title(__("Repair Billing"));
		page.clear_secondary_action();
		frappe.call({ method: API + ".list_open_repairs", freeze: false }).then((r) => {
			S.tiles = r.message || [];
			if (!S.tiles.length) {
				$body.html(`<div class="rb-none">${__("Nothing waiting to be billed.")}</div>`);
				return;
			}
			$body.html(`<div class="rb-grid">` + S.tiles.map((t) => {
				const flag = t.state === "part"
					? `<span class="rb-flag part">${__("part billed")}</span>`
					: (t.weighed_out === t.pieces_open && t.pieces_open
						? `<span class="rb-flag ready">${__("weighed out")}</span>` : "");
				const notes = [];
				if (t.no_work) notes.push(__("{0} with no work set", [t.no_work]));
				if (t.pieces_billed) notes.push(__("{0} already billed", [t.pieces_billed]));
				return `<div class="rb-card2" data-o="${esc(t.repair_order)}">
					<div class="p">${esc(t.party || "—")}${flag}</div>
					<div class="r">${esc(t.repair_order)} · ${esc(t.received_at || "")}</div>
					<div class="n">
						<b>${t.pieces_open}</b><span>${__("to bill")}</span>
						<b>${g3(t.weight_in_open)}</b><span>${__("g in")}</span>
					</div>
					${notes.length ? `<div class="rb-hint">${esc(notes.join(" · "))}</div>` : ""}
				</div>`;
			}).join("") + `</div>`);
		});
	}

	$body.on("click", ".rb-card2", function () { openBatch(this.dataset.o); });

	// ---- one batch ---------------------------------------------------------
	function openBatch(order) {
		if (!S.sieves.length) {
			frappe.call({ method: API + ".get_repair_sieves" })
				.then((r) => { S.sieves = r.message || []; });
		}
		frappe.call({ method: API + ".get_repair_for_billing", args: { repair_order: order } })
			.then((r) => {
				S.D = r.message;
				S.picked = new Set(S.D.items.filter((i) => !i.bill).map((i) => i.repair));
				S.rates = {}; S.stoneRates = {};
				(S.D.charges || []).forEach((c) => { S.rates[c.work_type] = c.rate; });
				(S.D.stone_lines || []).forEach((l) => {
					S.stoneRates[sKey(l)] = l.rate; });
				S.gold = flt(S.D.gold_rate) || S.gold;
				S.gst = flt(S.D.gst_percent) || 0;
				page.set_title(__("Billing {0}", [S.D.party || order]));
				page.set_secondary_action(__("← All repairs"), showFloor);
				drawBatch();
			});
	}

	function openRows() { return (S.D.items || []).filter((i) => !i.bill); }

	function drawBatch() {
		const D = S.D;
		const KARATS = ["", "22", "18", "14", "9"];
		const rows = D.items.map((i) => {
			const done = !!i.bill;
			const on = S.picked.has(i.repair);
			const P = priceRow(i);
			const work = (i.work_types || []).map((w) => {
				const q = cint((i.work_counts || {})[w]) || 1;
				return q > 1 ? `${w} \u00d7${q}` : w;
			}).join(", ");
			const stones = (i.stones || []);
			const noOut = !done && !flt(i.weight_out);
			const noWork = !done && !(i.work_types || []).length;
			const stTxt = stones.length
				? stones.map((st) => `${esc(st.bucket || st.stone || "")} ${esc(st.sieve || "")} ${
					cint(st.pcs)}/${flt(st.ct).toFixed(3)}`).join("<br>")
				: `<span class="rb-add">${__("add stone")}</span>`;
			return `<tr class="${done ? "rb-done" : ""} ${on ? "rb-on" : ""} ${
				(noOut || noWork) && on ? "rb-warn" : ""}" data-r="${esc(i.repair)}">
				<td>${done ? `<span class="rb-billed rb-print" title="${__("Print this bill")}">${esc(i.bill)}</span>`
					: `<input type="checkbox" class="rb-pick2" ${on ? "checked" : ""}>`}</td>
				<td><b>${esc(i.repair)}</b>${noOut ? `<span class="rb-flag2">${__("no weight out")}</span>` : ""}
					<div class="rb-work ${work ? "" : "none"}">${esc(work || __("add work"))}</div></td>
				<td>${esc(i.design_type || "")}</td>
				<td>${done ? esc(i.karat || "—")
					: `<select class="rb-kt">${KARATS.map((k) =>
						`<option value="${k}" ${(i.karat || "") === k ? "selected" : ""}>${k || "—"}</option>`).join("")}</select>`}</td>
				<td class="num">${cint(i.qty)}</td>
				<td class="num">${g3(i.weight_in)}</td>
				<td class="num ${noOut ? "rb-miss" : ""}">${done ? g3(i.weight_out)
					: `<input type="number" step="0.001" min="0" class="rb-out" value="${
						flt(i.weight_out) ? g3(i.weight_out) : ""}" placeholder="—">`}</td>
				<td class="num rb-added ${!flt(i.weight_out) ? "" : (P.added >= 0 ? "up" : "down")}">${
					!flt(i.weight_out) ? "—" : (P.added >= 0 ? "+" : "") + g3(P.added)}</td>
				<td class="rb-st">${stTxt}</td>
				<td class="num rb-m-work rb-why" title="${esc(whyWork(i))}">${format_currency(P.work)}</td>
				<td class="num rb-m-metal rb-why" title="${esc(whyMetal(i))}">${format_currency(P.metal)}</td>
				<td class="num rb-m-stone rb-why" title="${esc(whyStone(i))}">${format_currency(P.stone)}</td>
				<td class="num">${done ? format_currency(P.manual)
					: `<input type="number" step="0.01" class="rb-man" value="${
						flt(i.manual_amount) || ""}" placeholder="0">`}</td>
				<td class="num rb-m-tot"><b>${format_currency(P.total)}</b></td>
			</tr>`;
		}).join("");

		const picked = D.items.filter((i) => S.picked.has(i.repair) && !i.bill);
		const wIn = picked.reduce((a, i) => a + flt(i.weight_in), 0);
		const wOut = picked.reduce((a, i) => a + flt(i.weight_out), 0);
		const metalG = picked.length && picked.every((i) => flt(i.weight_out)) ? wOut - wIn : null;
		const sums = picked.reduce((a, i) => {
			const P = priceRow(i);
			return { work: a.work + P.work, metal: a.metal + P.metal,
				stone: a.stone + P.stone, manual: a.manual + P.manual };
		}, { work: 0, metal: 0, stone: 0, manual: 0 });
		const sub = sums.work + sums.metal + sums.stone + sums.manual;
		const gst = sub * flt(S.gst) / 100;
		const grand = sub + gst;

		// work on the ticked pieces, priced by type
		const tally = {};
		// a piece can carry several of the same work — count the work, not the piece
		picked.forEach((i) => (i.work_types || []).forEach((w) => {
			tally[w] = (tally[w] || 0) + (cint((i.work_counts || {})[w]) || 1);
		}));
		const charges = Object.keys(tally).sort((a, b) => tally[b] - tally[a] || a.localeCompare(b));

		// stones on the ticked pieces, priced by quality + sieve
		const sg = {};
		picked.forEach((i) => (i.stones || []).forEach((st) => {
			const k = sKey(st);
			const g = sg[k] || (sg[k] = { bucket: st.bucket || "", stone: st.stone || "",
				sieve: st.sieve || "", pcs: 0, ct: 0 });
			g.pcs += cint(st.pcs); g.ct += flt(st.ct);
		}));
		const stoneKeys = Object.keys(sg).sort();

		$body.html(`
			<div class="rb-tiles">
				<div class="rb-tile ${picked.some((i) => !flt(i.weight_out)) ? "warn" : ""}">
					<div class="k">${__("Picked")}</div>
					<div class="v">${picked.length}<span style="font-size:12px;color:var(--text-muted);"> / ${openRows().length}</span></div></div>
				<div class="rb-tile"><div class="k">${__("Weight In")}</div><div class="v">${g3(wIn)}</div></div>
				<div class="rb-tile"><div class="k">${__("Weight Out")}</div><div class="v">${g3(wOut)}</div></div>
				<div class="rb-tile ${metalG === null ? "" : (metalG >= 0 ? "add" : "less")}">
					<div class="k">${__("Metal Added")}</div>
					<div class="v">${metalG === null ? "—" : (metalG >= 0 ? "+" : "") + g3(metalG)}</div></div>
				<div class="rb-tile rate ${!flt(S.gold) && picked.some((i) =>
					flt(i.weight_out) > flt(i.weight_in)) ? "unset" : ""}">
					<div class="k">${__("Gold Board Rate / g")}</div>
					<div class="v"><input type="number" step="0.01" min="0" class="rb-gold" value="${
						S.gold || ""}" placeholder="0"></div></div>
				<div class="rb-tile money"><div class="k">${__("Work")}</div><div class="v">${format_currency(sums.work)}</div></div>
				<div class="rb-tile money"><div class="k">${__("Metal")}</div><div class="v">${format_currency(sums.metal)}</div></div>
				<div class="rb-tile money"><div class="k">${__("Stones")}</div><div class="v">${format_currency(sums.stone)}</div></div>
				${sums.manual ? `<div class="rb-tile money"><div class="k">${__("Manual")}</div>
					<div class="v">${format_currency(sums.manual)}</div></div>` : ""}
				${flt(S.gst) ? `<div class="rb-tile money"><div class="k">${__("GST {0}%", [S.gst])}</div>
					<div class="v">${format_currency(gst)}</div></div>` : ""}
				<div class="rb-tile grand"><div class="k">${__("Total")}</div><div class="v">${format_currency(grand)}</div></div>
			</div>

			<div class="rb-card pieces">
				<div class="rb-h"><span>${__("Pieces")} — ${esc(D.repair_order)} · ${esc(D.party || "")}</span>
					<span><a class="rb-all">${__("all")}</a> · <a class="rb-non">${__("none")}</a>
						· <button class="btn btn-default btn-xs rb-copyw">${__("Copy weights")}</button>
						· <button class="btn btn-default btn-xs rb-savew">${__("Update")}</button></span></div>
				<table class="rb-t">
					<thead><tr><th style="width:34px;"></th><th>${__("Piece")}</th><th>${__("Design")}</th>
						<th style="width:74px;">${__("Purity")}</th>
						<th class="num">${__("Qty")}</th><th class="num">${__("In (g)")}</th>
						<th class="num" style="width:104px;">${__("Out (g)")}</th>
						<th class="num">${__("Added")}</th>
						<th style="width:150px;">${__("Stones")}</th>
						<th class="num">${__("Work")}</th><th class="num">${__("Metal")}</th>
						<th class="num">${__("Stone")}</th>
						<th class="num" style="width:96px;">${__("Manual")}</th>
						<th class="num">${__("Amount")}</th></tr></thead>
					<tbody>${rows}</tbody>
				</table>
			</div>

			<div class="rb-cols">
				<div class="rb-half">
					<div class="rb-card work">
						<div class="rb-h">${__("Work Charged")}</div>
						${charges.length ? `<table class="rb-t">
							<thead><tr><th>${__("Type")}</th><th class="num">${__("Pcs")}</th>
								<th class="num" style="width:104px;">${__("Rate")}</th>
								<th class="num">${__("Amount")}</th></tr></thead>
							<tbody>${charges.map((w) => `<tr data-w="${esc(w)}">
								<td>${esc(w)}</td><td class="num">${tally[w]}</td>
								<td class="num"><input type="number" step="0.01" min="0" class="rb-rate"
									value="${flt(S.rates[w]) || ""}" placeholder="0"></td>
								<td class="num">${format_currency(tally[w] * flt(S.rates[w]))}</td></tr>`).join("")}</tbody>
						</table>
						<div class="rb-foot"><span>${__("Work")}</span><span>${format_currency(sums.work)}</span></div>`
						: `<div class="rb-none">${__("No work set on the picked pieces.")}</div>`}
					</div>
				</div>
				<div class="rb-half">
					<div class="rb-card stones">
						<div class="rb-h">${__("Stones Charged")}</div>
						${stoneKeys.length ? `<table class="rb-t">
							<thead><tr><th>${__("Bucket")}</th><th>${__("Sieve")}</th>
								<th class="num">${__("Pcs")}</th><th class="num">${__("Cts")}</th>
								<th class="num" style="width:104px;">${__("Rate / ct")}</th>
								<th class="num">${__("Amount")}</th></tr></thead>
							<tbody>${stoneKeys.map((k) => { const g = sg[k]; return `<tr data-s="${esc(k)}">
								<td>${esc(g.bucket || g.stone || "—")}</td><td>${esc(g.sieve || "—")}</td>
								<td class="num">${g.pcs}</td><td class="num">${flt(g.ct).toFixed(3)}</td>
								<td class="num"><input type="number" step="0.01" min="0" class="rb-srate"
									value="${flt(S.stoneRates[k]) || ""}" placeholder="0"></td>
								<td class="num">${format_currency(flt(g.ct) * flt(S.stoneRates[k]))}</td></tr>`; }).join("")}</tbody>
						</table>
						<div class="rb-foot"><span>${__("Stones")}</span><span>${format_currency(sums.stone)}</span></div>`
						: `<div class="rb-none">${__("No stones on the picked pieces.")}</div>`}
					</div>
				</div>
			</div>

			<div class="rb-cols">
				<div class="rb-half"><div class="rb-card"><div class="rb-h">${__("Note")}</div>
					<div style="padding:11px 14px;">
						<textarea class="rb-note" rows="2">${esc(D.narration || "")}</textarea></div></div></div>
				<div class="rb-half" style="text-align:right;">
					<div class="rb-grand">${__("Total")} <b>${format_currency(grand)}</b></div>
					<button class="btn btn-default btn-sm rb-gst" style="margin-bottom:8px;">${
						flt(S.gst) ? __("Remove {0}% GST", [S.gst]) : __("Add 3% GST")}</button>
					<button class="btn btn-default btn-sm rb-preview" ${picked.length ? "" : "disabled"}
						style="margin-bottom:8px;margin-right:6px;" title="${__("print the bill before committing it")}">
						${__("Print")}</button>
					<button class="btn btn-primary rb-bill" ${picked.length ? "" : "disabled"}>
						${__("Bill {0} piece(s)", [picked.length])}</button>
				</div>
			</div>
		`);
	}

	// ---- ticking, weighing, pricing ----------------------------------------
	$body.on("change", ".rb-pick2", function () {
		const id = $(this).closest("tr").data("r");
		if (this.checked) S.picked.add(id); else S.picked.delete(id);
		drawBatch();
	});
	$body.on("click", ".rb-all", () => { openRows().forEach((i) => S.picked.add(i.repair)); drawBatch(); });
	$body.on("click", ".rb-non", () => { S.picked.clear(); drawBatch(); });

	// A weight must never rebuild the table. Redrawing on every keystroke — or
	// even on change — replaces the input being typed in, which drops the entry
	// and the focus with it: tabbing down a column of weights kept only the
	// first one. So the row object is updated and just the figures that depend
	// on it are patched in place.
	$body.on("input", ".rb-out", function () {
		const $tr = $(this).closest("tr");
		const row = S.D.items.find((i) => i.repair === $tr.data("r"));
		if (!row) return;
		row.weight_out = flt(this.value);
		const added = flt(row.weight_out) ? flt(row.weight_out) - flt(row.weight_in) : null;
		$tr.find(".rb-added")
			.removeClass("up down")
			.addClass(added === null ? "" : (added >= 0 ? "up" : "down"))
			.text(added === null ? "—" : (added >= 0 ? "+" : "") + g3(added));

		// the "not ready" marks belong to the weight, so they clear as it is typed
		// — the row is not redrawn here, so they are cleared by hand
		const noOut = !flt(row.weight_out);
		const noWork = !(row.work_types || []).length;
		$tr.find("td").eq(6).toggleClass("rb-miss", noOut);
		$tr.find(".rb-flag2").remove();
		if (noOut) $tr.find("td").eq(1).find("b").after(
			`<span class="rb-flag2">${__("no weight out")}</span>`);
		$tr.toggleClass("rb-warn", (noOut || noWork) && S.picked.has(row.repair));

		// the money columns move with the weight too
		const P = priceRow(row);
		$tr.find(".rb-m-metal").text(format_currency(P.metal));
		$tr.find(".rb-m-tot").html(`<b>${format_currency(P.total)}</b>`);
		syncTotals();
	});
	// A rate changes every money column, so the table is redrawn — but only on
	// change (leaving the field), never per keystroke, so typing is not
	// interrupted the way the weights were.
	// 10 adds ten to the piece, -10 takes ten off. Patched in place like the
	// weights — redrawing would replace the box being typed in.
	$body.on("input", ".rb-man", function () {
		const $tr = $(this).closest("tr");
		const row = S.D.items.find((i) => i.repair === $tr.data("r"));
		if (!row) return;
		row.manual_amount = flt(this.value);
		const P = priceRow(row);
		$tr.find(".rb-m-tot").html(`<b>${format_currency(P.total)}</b>`);
		syncTotals();
	});

	$body.on("input", ".rb-rate", function () {
		S.rates[$(this).closest("tr").data("w")] = flt(this.value);
	});
	$body.on("change", ".rb-rate", () => drawBatch());
	$body.on("input", ".rb-srate", function () {
		S.stoneRates[$(this).closest("tr").data("s")] = flt(this.value);
	});
	$body.on("change", ".rb-srate", () => drawBatch());
	$body.on("input", ".rb-gold", function () { S.gold = flt(this.value); });
	$body.on("change", ".rb-gold", () => drawBatch());

	// karat is saved with the weights, not on its own — they are set together
	$body.on("change", ".rb-kt", function () {
		const row = S.D.items.find((i) => i.repair === $(this).closest("tr").data("r"));
		if (row) { row.karat = this.value || ""; drawBatch(); }
	});

	// Nothing was done to the metal on these pieces, so they leave at the weight
	// they came in at. Fills the blanks only — a weight somebody already took is
	// never overwritten — and leaves saving to Update, so it can be looked over
	// first.
	$body.on("click", ".rb-copyw", function () {
		const blanks = openRows().filter((i) => !flt(i.weight_out));
		if (!blanks.length) {
			return frappe.show_alert({ message: __("Every piece already has a weight out."),
				indicator: "orange" }, 4);
		}
		blanks.forEach((i) => { i.weight_out = flt(i.weight_in); });
		drawBatch();
		frappe.show_alert({ message: __("{0} piece(s) copied in → out. Press Update to save.",
			[blanks.length]), indicator: "blue" }, 5);
	});

	$body.on("click", ".rb-savew", function () {
		const rows = openRows().map((i) => ({ repair: i.repair, weight_out: flt(i.weight_out),
			karat: i.karat || "" }));
		frappe.call({ method: API + ".save_repair_weights",
			args: { repair_order: S.D.repair_order, rows: JSON.stringify(rows) } })
			.then((r) => {
				S.D = r.message;
				frappe.show_alert({ message: __("Updated — weights and purity saved"),
					indicator: "green" });
				drawBatch();
			});
	});

	function syncTotals() {
		const picked = S.D.items.filter((i) => S.picked.has(i.repair) && !i.bill);
		const money = picked.reduce((a, i) => {
			const P = priceRow(i);
			return a + P.work + P.metal + P.stone + P.manual; }, 0);
		$body.find(".rb-tile.grand .v").text(format_currency(money));
		$body.find(".rb-grand b").text(format_currency(money));
		const wIn = picked.reduce((a, i) => a + flt(i.weight_in), 0);
		const wOut = picked.reduce((a, i) => a + flt(i.weight_out), 0);
		const metal = picked.length && picked.every((i) => flt(i.weight_out)) ? wOut - wIn : null;
		const $t = $body.find(".rb-tile");
		$t.eq(1).find(".v").text(g3(wIn));
		$t.eq(2).find(".v").text(g3(wOut));
		$t.filter(".rate").toggleClass("unset", !flt(S.gold) &&
			picked.some((i) => flt(i.weight_out) > flt(i.weight_in)));
		$t.filter(".rb-tile").first().toggleClass("warn", picked.some((i) => !flt(i.weight_out)));
		$t.eq(3).removeClass("add less")
			.addClass(metal === null ? "" : (metal >= 0 ? "add" : "less"))
			.find(".v").text(metal === null ? "—" : (metal >= 0 ? "+" : "") + g3(metal));
	}

	// ---- the work a piece needs, set from here ------------------------------
	$body.on("click", ".rb-work", function () {
		const id = $(this).closest("tr").data("r");
		const row = S.D.items.find((i) => i.repair === id);
		if (!row || row.bill) return;
		frappe.call({ method: API + ".get_repair_work_types" }).then((r) => {
			const all = (r.message || []).map((w) => w.name || w.work_name || w);
			const d = new frappe.ui.Dialog({
				title: __("Work on {0}", [id]),
				fields: [{
					fieldname: "works", fieldtype: "MultiSelectPills", label: __("Types of Work"),
					// A name that is not on the list yet is offered as itself, so it can
					// be picked and used here and now. The server creates it on save
					// (_master with create=True) — it always could; the box just had no
					// way to hand it a word it had never seen.
					get_data: (txt) => {
						const q = (txt || "").trim();
						const hits = all.filter((w) => !q || w.toLowerCase().includes(q.toLowerCase()));
						const known = hits.some((w) => w.toLowerCase() === q.toLowerCase());
						return (q && !known)
							? [{ value: q.toUpperCase(), description: __("new type of work") }, ...hits]
							: hits;
					},
					default: row.work_types || [],
					// how many of each — a piece of five can carry fifteen solderings,
					// and it is the count that is billed, not the piece
					onchange: () => paintQty(),
				}, {
					fieldname: "qty_html", fieldtype: "HTML", label: __("How many of each"),
				}],
				primary_action_label: __("Save"),
				primary_action: () => {
					const works = d.get_value("works") || [];
					const out = works.map((w) => ({
						work_type: w,
						qty: Math.max(cint($(d.fields_dict.qty_html.wrapper).find(`input[data-w="${escAttr(w)}"]`).val()) || 1, 1),
					}));
					d.hide();
					frappe.call({ method: API + ".set_piece_work_types",
						args: { repair_order: S.D.repair_order, repair: id,
							work_types: JSON.stringify(out) } })
						.then((res) => { S.D = res.message; drawBatch(); });
				},
			});
			// the qty boxes follow whatever is picked, keeping any number already typed
			function escAttr(v) { return String(v).replace(/"/g, "&quot;"); }
			function paintQty() {
				const works = d.get_value("works") || [];
				const $w = $(d.fields_dict.qty_html.wrapper);
				const had = {};
				$w.find("input[data-w]").each(function () { had[$(this).data("w")] = this.value; });
				$w.html(works.length ? `<div style="display:flex;flex-direction:column;gap:6px;">`
					+ works.map((w) => `<div style="display:flex;align-items:center;gap:9px;">
						<span style="flex:1;font-size:13px;">${frappe.utils.escape_html(w)}</span>
						<input type="number" min="1" step="1" data-w="${escAttr(w)}"
							value="${had[w] != null ? had[w] : (row.work_counts && row.work_counts[w]) || 1}"
							style="width:88px;text-align:right;border:1px solid var(--border-color);
								border-radius:6px;padding:3px 8px;background:var(--control-bg);color:var(--text-color);">
					</div>`).join("") + `</div>`
					: `<div style="font-size:12px;color:var(--text-muted);">${
						__("Pick the work above, then say how many of each.")}</div>`);
			}
			d.show();
			d.fields_dict.works.set_value(row.work_types || []);
			paintQty();
		});
	});

	// ---- the stones set into a piece ---------------------------------------
	$body.on("click", "td.rb-st", function () {
		const id = $(this).closest("tr").data("r");
		const row = S.D.items.find((i) => i.repair === id);
		if (!row || row.bill) return;
		jewelima.repairStoneDialog(row.stones || [], S.sieves, (out) => {
			frappe.call({ method: API + ".set_piece_stones",
				args: { repair_order: S.D.repair_order, repair: id, stones: JSON.stringify(out) } })
				.then((r) => { S.D = r.message; drawBatch(); });
		});
	});

	// ---- billing what is ticked --------------------------------------------
	// 3% on or off the whole bill, and it is stored, so a reprint shows the same
	$body.on("click", ".rb-print", function (e) {
		e.stopPropagation();
		const name = this.textContent.trim();
		frappe.call({ method: API + ".get_repair_bill", args: { name } })
			.then((r) => jewelima.printRepairBill(r.message));
	});

	$body.on("click", ".rb-gst", function () {
		S.gst = flt(S.gst) ? 0 : 3;
		drawBatch();
	});

	// ONE payload, used by Print and by Bill. If the preview built its own the two
	// would drift, and the paper handed over would stop matching the bill saved.
	function billPayload(picked) {
		const tally = {};
		// a piece can carry several of the same work — count the work, not the piece
		picked.forEach((i) => (i.work_types || []).forEach((w) => {
			tally[w] = (tally[w] || 0) + (cint((i.work_counts || {})[w]) || 1);
		}));
		return {
			repair_order: S.D.repair_order,
			gold_rate: flt(S.gold),
			gst_percent: flt(S.gst),
			stone_lines: Object.keys(S.stoneRates).map((k) => ({
				bucket: k.split("||")[0], sieve: k.split("||")[1] || "",
				rate: flt(S.stoneRates[k]) })),
			items: picked.map((i) => ({ repair: i.repair, weight_out: flt(i.weight_out),
				manual_amount: flt(i.manual_amount) })),
			charges: Object.keys(tally).map((w) => ({
				work_type: w, pieces: tally[w], rate: flt(S.rates[w]) })),
			narration: $body.find(".rb-note").val(),
		};
	}

	// print the bill BEFORE committing it — the server runs the same maths on an
	// unsaved doc, so the sheet is the bill, not an estimate of it
	$body.on("click", ".rb-preview", function () {
		const picked = S.D.items.filter((i) => S.picked.has(i.repair) && !i.bill);
		if (!picked.length) return;
		frappe.call({ method: API + ".preview_repair_bill",
			args: { payload: JSON.stringify(billPayload(picked)) },
			freeze: true, freeze_message: __("Building the bill…") })
			.then((r) => { if (r.message) jewelima.printRepairBill(r.message); });
	});

	$body.on("click", ".rb-bill", function () {
		if (S.saving) return;
		const picked = S.D.items.filter((i) => S.picked.has(i.repair) && !i.bill);
		if (!picked.length) return;
		const missing = picked.filter((i) => !flt(i.weight_out));
		const go = () => {
			S.saving = true;
			frappe.call({
				method: API + ".save_repair_bill",
				args: { payload: JSON.stringify(billPayload(picked)) },
			}).then((r) => {
				S.saving = false;
				const b = r.message;
				frappe.show_alert({ message: __("{0} saved — {1} piece(s)", [b.name, b.items.length]),
					indicator: "green" });
				// straight to the printer, which is what happens next at the counter
				frappe.confirm(__("{0} saved. Print it?", [b.name]),
					() => jewelima.printRepairBill(b));
				openBatch(S.D.repair_order);      // the rest of the batch, still to bill
			}).catch(() => { S.saving = false; });
		};
		// Forgetting the board rate bills every gram of added metal at nothing, and
		// the bill still looks finished — so it is worth asking rather than
		// quietly undercharging.
		const addedMetal = picked.some((i) => flt(i.weight_out) && flt(i.weight_out) > flt(i.weight_in));
		const ask = [];
		if (missing.length)
			ask.push(__("{0} of the picked pieces have no weight out.", [missing.length]));
		if (addedMetal && !flt(S.gold))
			ask.push(__("There is metal added but no gold board rate, so it will be charged at nothing."));
		if (ask.length) {
			frappe.confirm(ask.join("<br><br>") + "<br><br>" + __("Bill anyway?"), go);
		} else { go(); }
	});

	// on_page_show covers the first show too — see the workstations note
	frappe.pages["repair-billing"].on_page_show = function () {
		if (S.D) openBatch(S.D.repair_order); else showFloor();
	};
};
