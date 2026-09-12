// Quick Check (REPAIR > Quick Check) — what would this cost?
//
// The question at the counter before anything is taken in. It prices the same
// way Billing does — work by type, metal at the board rate through GST and the
// karat, stones per carat — and the rate boxes open on what this party was
// charged on their last bill, so a quote starts from what they actually paid.
//
// Nothing here is saved. No receipt, no bill, no piece: it is a calculator with
// a print, and leaving the page loses it.
// Route: /app/repair-quick-check
frappe.pages["repair-quick-check"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Quick Check"), single_column: true });
	const API = "jewelima.jewelima.repair_api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const cint = (v) => parseInt(v, 10) || 0;
	const g3 = (v) => flt(v).toFixed(3);
	const money = (v) => format_currency(flt(v));
	const $w = $(page.main);

	// the same sum the bill does — repair_rates.js, shared with Billing
	const rateForKarat = jewelima.repairRateForKarat;
	const GST = jewelima.REPAIR_GOLD_GST;
	const PURITY = jewelima.REPAIR_KARAT_PURITY;
	const sKey = (st) => `${st.bucket || ""}||${st.sieve || ""}`;

	const S = {
		ctx: null, rows: [], party: "", gold: 0, gst: 0,
		rates: {}, stoneRates: {}, narration: "",
	};

	function blank() {
		return { item: "", qty: 1, karat: "18", weight_in: "", weight_out: "",
			work_types: [], work_counts: {}, stones: [], manual: "", narration: "" };
	}

	// What the piece comes back heavier by, the way the bill works it out: only a
	// piece with a weight OUT has a difference, and metal taken off is a credit,
	// so the sign carries through rather than being clamped at zero.
	const addedOn = (i) => (flt(i.weight_out) ? flt(i.weight_out) - flt(i.weight_in) : 0);

	function priceRow(i) {
		const work = (i.work_types || []).reduce(
			(a, w) => a + flt(S.rates[w]) * (cint((i.work_counts || {})[w]) || 1), 0);
		const rate = rateForKarat(S.gold, i.karat);
		const added = addedOn(i);
		const metal = added * rate;
		const stone = (i.stones || []).reduce((a, st) => a + flt(st.ct) * flt(S.stoneRates[sKey(st)]), 0);
		const manual = flt(i.manual);
		return { work, metal, stone, manual, rate, added, total: work + metal + stone + manual };
	}

	// the row waiting at the bottom is not a piece until something is put on it
	const filled = (i) => !!(i.item || flt(i.weight_in) || flt(i.weight_out) || flt(i.manual)
		|| (i.work_types || []).length || (i.stones || []).length);

	function totals() {
		let work = 0, metal = 0, stone = 0, manual = 0, wt = 0, add = 0, qty = 0;
		S.rows.filter(filled).forEach((i) => {
			const P = priceRow(i);
			work += P.work; metal += P.metal; stone += P.stone; manual += P.manual;
			wt += flt(i.weight_in); add += P.added; qty += cint(i.qty) || 1;
		});
		const sub = work + metal + stone + manual;
		const gst = sub * flt(S.gst) / 100;
		return { work, metal, stone, manual, wt, add, qty, sub, gst, grand: sub + gst };
	}

	// every type of work used across the rows, and how many of each
	function workTally() {
		const t = {};
		S.rows.forEach((i) => (i.work_types || []).forEach((w) => {
			t[w] = (t[w] || 0) + (cint((i.work_counts || {})[w]) || 1);
		}));
		return t;
	}
	function stoneTally() {
		const g = {};
		S.rows.forEach((i) => (i.stones || []).forEach((st) => {
			const k = sKey(st);
			const e = g[k] || (g[k] = { bucket: st.bucket || "", sieve: st.sieve || "", pcs: 0, ct: 0 });
			e.pcs += cint(st.pcs); e.ct += flt(st.ct);
		}));
		return g;
	}

	// why a figure is what it is — the same courtesy Billing pays
	function whyWork(i) {
		const w = i.work_types || [];
		if (!w.length) return __("No type of work on this row.");
		return __("One rate per type of work, times how many:") + "\n  "
			+ w.map((n) => `${n} x${cint((i.work_counts || {})[n]) || 1} ${money(S.rates[n])}`
				+ ` = ${money(flt(S.rates[n]) * (cint((i.work_counts || {})[n]) || 1))}`).join("\n  ");
	}
	function whyMetal(i) {
		if (!flt(i.weight_out)) return __("Weigh the piece out and the difference is the metal.");
		if (!flt(S.gold)) return __("No board rate entered, so metal is not charged.");
		const P = priceRow(i);
		const net = flt(S.gold) / (1 + GST / 100);
		return [
			__("Board rate {0} (with {1}% GST in it)", [money(S.gold), GST]),
			__("GST taken out ({0} / 1.0{1}) = {2}", [money(S.gold), GST, money(net)]),
			i.karat ? __("{0}k is {1}% of that = {2} / g", [i.karat, PURITY[i.karat], money(P.rate)])
				: __("no karat set, so the board rate is used as it is"),
			__("{0} g out less {1} g in = {2} g", [g3(i.weight_out), g3(i.weight_in), g3(P.added)]),
			__("{0} g x {1} = {2}", [g3(P.added), money(P.rate), money(P.metal)]),
		].join("\n");
	}
	function whyStone(i) {
		const st = i.stones || [];
		if (!st.length) return __("No stones on this row.");
		return __("Each line at its rate per carat:") + "\n  "
			+ st.map((x) => `${x.bucket || ""} ${x.sieve || ""} ${g3(x.ct)} ct x `
				+ `${money(S.stoneRates[sKey(x)])} = ${money(flt(x.ct) * flt(S.stoneRates[sKey(x)]))}`).join("\n  ");
	}

	$w.append(`
		<style>
		#page-repair-quick-check .container{max-width:100%;}
		.qc-head{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:2px 12px;margin:2px 0 10px;}
		.qc-head .frappe-control{margin:0;}
		.qc-head .control-label{font-size:11px;margin:0 0 1px;color:var(--text-muted);}
		.qc-head .help-box,.qc-head .description{display:none !important;}
		.qc-tiles{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;}
		.qc-tile{border:1px solid var(--border-color);border-radius:11px;background:var(--fg-color);
			padding:9px 16px;min-width:112px;}
		.qc-tile .k{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);}
		.qc-tile .v{font-size:19px;font-weight:800;font-variant-numeric:tabular-nums;}
		.qc-tile.money .v{color:#1f618d;}
		.qc-tile.grand{background:rgba(31,97,141,.10);border-color:rgba(31,97,141,.40);}
		.qc-tile.grand .v{color:#1f618d;}
		[data-theme="dark"] .qc-tile.grand .v,[data-theme="dark"] .qc-tile.money .v{color:#8fc1e8;}

		.qc-gridbox{overflow:auto;border:1px solid var(--border-color);border-radius:9px;margin-bottom:12px;}
		table.qc-t{width:100%;border-collapse:separate;border-spacing:0;font-size:12px;background:var(--fg-color);}
		table.qc-t th{position:sticky;top:0;z-index:2;background:var(--control-bg,var(--fg-color));text-align:left;
			font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);
			border-bottom:1px solid var(--gray-400,#aeb6bf);padding:5px 6px;font-weight:700;white-space:nowrap;}
		table.qc-t td{padding:2px 5px;border-bottom:1px solid var(--border-color);vertical-align:middle;height:32px;}
		table.qc-t td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}
		table.qc-t td.n0{color:var(--text-muted);text-align:center;width:28px;background:var(--control-bg);font-weight:700;}
		table.qc-t input,table.qc-t select{width:100%;border:1px solid var(--gray-400,#aeb6bf);
			background:var(--fg-color);color:var(--text-color);border-radius:4px;height:26px;
			padding:1px 5px;font-size:12px;box-sizing:border-box;}
		table.qc-t input.num{text-align:right;font-variant-numeric:tabular-nums;}
		.qc-chip{display:inline-flex;align-items:center;border:1px solid var(--gray-400,#aeb6bf);
			border-radius:4px;background:var(--control-bg);padding:2px 8px;font-size:11.5px;cursor:pointer;
			white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis;}
		.qc-chip:hover{border-color:var(--primary);}
		.qc-chip .on{color:var(--primary);font-weight:700;}
		.qc-why{cursor:help;}
		.qc-add{color:#1d7a33;font-weight:700;}
		.qc-less{color:#b02a2a;font-weight:700;}
		.qc-x{border:none;background:none;color:var(--text-muted);cursor:pointer;font-size:14px;padding:0 5px;}
		.qc-x:hover{color:#b02a2a;}
		.qc-dup{border:none;background:none;color:var(--text-muted);cursor:pointer;font-size:13px;padding:0 5px;}
		.qc-dup:hover{color:var(--primary);}

		.qc-cols{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;}
		.qc-half{flex:1 1 340px;min-width:300px;}
		.qc-box{border:1px solid var(--border-color);border-radius:11px;background:var(--fg-color);
			padding:11px 13px;margin-bottom:12px;}
		.qc-box .h{font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;
			color:var(--text-muted);margin-bottom:8px;}
		table.qc-r{width:100%;border-collapse:collapse;font-size:12px;}
		table.qc-r th{text-align:left;font-size:9.5px;text-transform:uppercase;color:var(--text-muted);
			padding:3px 5px;border-bottom:1px solid var(--border-color);font-weight:700;}
		table.qc-r td{padding:3px 5px;border-bottom:1px solid var(--border-color);}
		table.qc-r td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}
		table.qc-r input{width:100px;border:1px solid var(--border-color);border-radius:6px;
			padding:2px 7px;text-align:right;background:var(--fg-color);color:var(--text-color);
			font-variant-numeric:tabular-nums;font-size:12px;}
		.qc-none{color:var(--text-muted);font-size:12px;padding:4px 0;}
		.qc-from{font-size:11px;color:var(--text-muted);margin-top:7px;}
		</style>
		<div class="qc-head">
			<div class="qc-h-party"></div><div class="qc-h-gold"></div>
			<div class="qc-h-gst"></div><div class="qc-h-note"></div>
		</div>
		<div class="qc-tiles"></div>
		<div class="qc-gridbox"><table class="qc-t">
			<thead><tr>
				<th class="n0"></th>
				<th style="min-width:150px">${__("Item")}</th>
				<th style="width:58px">${__("Qty")}</th>
				<th style="width:76px">${__("Purity")}</th>
				<th style="width:92px">${__("In Wt g")}</th>
				<th style="width:92px">${__("Out Wt g")}</th>
				<th class="num" style="width:80px">${__("Added")}</th>
				<th style="min-width:150px">${__("Type of Work")}</th>
				<th style="min-width:130px">${__("Stones")}</th>
				<th style="width:92px">${__("Manual")}</th>
				<th class="num" style="width:88px">${__("Work")}</th>
				<th class="num" style="width:88px">${__("Metal")}</th>
				<th class="num" style="width:88px">${__("Stone")}</th>
				<th class="num" style="width:100px">${__("Amount")}</th>
				<th style="width:56px"></th>
			</tr></thead><tbody class="qc-body"></tbody>
		</table></div>
		<div class="qc-cols">
			<div class="qc-half qc-work"></div>
			<div class="qc-half qc-stone"></div>
		</div>`);

	const $body = $w.find(".qc-body");

	const mk = (sel, df) => {
		const c = frappe.ui.form.make_control({ df, parent: $w.find(sel).get(0), render_input: true });
		c.refresh();
		return c;
	};

	// ---- rows ---------------------------------------------------------------
	function paintRows() {
		$body.html(S.rows.map((i, n) => {
			const P = priceRow(i);   // used by the Added cell as well as the money
			const works = (i.work_types || []);
			const wlabel = works.length
				? `<span class="on">${esc(works.map((w) => (cint(i.work_counts[w]) > 1
					? `${w} x${cint(i.work_counts[w])}` : w)).join(", "))}</span>`
				: __("+ work");
			const st = (i.stones || []);
			const slabel = st.length
				? `<span class="on">${st.reduce((a, x) => a + cint(x.pcs), 0)} ${__("pcs")} · ${
					g3(st.reduce((a, x) => a + flt(x.ct), 0))} ct</span>`
				: __("+ stones");
			return `<tr data-i="${n}">
				<td class="n0">${n + 1}</td>
				<td><select class="c-item"><option value="">—</option>${
					(S.ctx.design_types || []).map((t) => `<option value="${esc(t)}"${i.item === t ? " selected" : ""}>${esc(t)}</option>`).join("")
				}</select></td>
				<td><input class="c-qty num" type="number" min="1" step="1" value="${cint(i.qty) || 1}"></td>
				<td><select class="c-karat"><option value="">—</option>${
					(S.ctx.karats || []).map((k) => `<option value="${k}"${i.karat === k ? " selected" : ""}>${k}k</option>`).join("")
				}</select></td>
				<td><input class="c-win num" type="number" min="0" step="0.001" value="${esc(i.weight_in)}" placeholder="0.000"></td>
				<td><input class="c-wout num" type="number" min="0" step="0.001" value="${esc(i.weight_out)}" placeholder="0.000"></td>
				<td class="num ${P.added > 0 ? "qc-add" : (P.added < 0 ? "qc-less" : "")}">${
					flt(i.weight_out) ? (P.added >= 0 ? "+" : "") + g3(P.added) : "—"}</td>
				<td><span class="qc-chip c-work">${wlabel}</span></td>
				<td><span class="qc-chip c-stones">${slabel}</span></td>
				<td><input class="c-manual num" type="number" step="0.01" value="${esc(i.manual)}" placeholder="0"></td>
				<td class="num qc-why" title="${esc(whyWork(i))}">${money(P.work)}</td>
				<td class="num qc-why" title="${esc(whyMetal(i))}">${money(P.metal)}</td>
				<td class="num qc-why" title="${esc(whyStone(i))}">${money(P.stone)}</td>
				<td class="num"><b>${money(P.total)}</b></td>
				<td style="white-space:nowrap;">
					<button class="qc-dup" title="${__("Duplicate row")}">⧉</button>
					<button class="qc-x" title="${__("Remove")}">✕</button></td>
			</tr>`;
		}).join(""));
	}

	function paintTiles() {
		const T = totals();
		const tile = (k, v, cls) => `<div class="qc-tile ${cls || ""}"><div class="k">${k}</div><div class="v">${v}</div></div>`;
		$w.find(".qc-tiles").html(
			tile(__("Pieces"), T.qty) +
			tile(__("Weight in"), g3(T.wt) + " g") +
			(T.add ? tile(__("Metal added"), (T.add >= 0 ? "+" : "") + g3(T.add) + " g") : "") +
			tile(__("Work"), money(T.work), "money") +
			tile(__("Metal"), money(T.metal), "money") +
			tile(__("Stones"), money(T.stone), "money") +
			(flt(S.gst) ? tile(__("GST {0}%", [S.gst]), money(T.gst), "money") : "") +
			tile(__("Total"), money(T.grand), "grand"));
	}

	function paintPanels() {
		const tally = workTally();
		const names = Object.keys(tally).sort((a, b) => tally[b] - tally[a] || a.localeCompare(b));
		$w.find(".qc-work").html(`<div class="qc-box">
			<div class="h">${__("Repair charges")}</div>
			${names.length ? `<table class="qc-r"><thead><tr>
				<th>${__("Type of Work")}</th><th class="num">${__("How many")}</th>
				<th class="num">${__("Rate")}</th><th class="num">${__("Amount")}</th>
			</tr></thead><tbody>${names.map((w) => `<tr data-w="${esc(w)}">
				<td>${esc(w)}</td><td class="num">${tally[w]}</td>
				<td class="num"><input class="qc-wrate" type="number" min="0" step="1"
					value="${flt(S.rates[w]) || ""}" placeholder="0"></td>
				<td class="num">${money(tally[w] * flt(S.rates[w]))}</td></tr>`).join("")}</tbody></table>`
			: `<div class="qc-none">${__("Put the work on a row and its rate comes here.")}</div>`}
			${S.ctx.from_bill ? `<div class="qc-from">${__("Rates from {0}, {1}", [esc(S.ctx.from_bill), esc(S.ctx.from_date || "")])}</div>` : ""}
		</div>`);

		const g = stoneTally();
		const keys = Object.keys(g).sort();
		$w.find(".qc-stone").html(`<div class="qc-box">
			<div class="h">${__("Stones")}</div>
			${keys.length ? `<table class="qc-r"><thead><tr>
				<th>${__("Quality")}</th><th>${__("Sieve")}</th><th class="num">${__("Pcs")}</th>
				<th class="num">${__("Cts")}</th><th class="num">${__("Rate/ct")}</th><th class="num">${__("Amount")}</th>
			</tr></thead><tbody>${keys.map((k) => `<tr data-s="${esc(k)}">
				<td>${esc(g[k].bucket)}</td><td>${esc(g[k].sieve || "—")}</td>
				<td class="num">${g[k].pcs}</td><td class="num">${g3(g[k].ct)}</td>
				<td class="num"><input class="qc-srate" type="number" min="0" step="1"
					value="${flt(S.stoneRates[k]) || ""}" placeholder="0"></td>
				<td class="num">${money(flt(g[k].ct) * flt(S.stoneRates[k]))}</td></tr>`).join("")}</tbody></table>`
			: `<div class="qc-none">${__("Put stones on a row and their rate comes here.")}</div>`}
		</div>`);
	}

	function paint() { paintRows(); paintTiles(); paintPanels(); }

	function rowOf(el) { return S.rows[cint($(el).closest("tr").data("i"))]; }
	function grow() {
		const last = S.rows[S.rows.length - 1];
		if (!last || filled(last)) S.rows.push(blank());
	}

	// ---- typing in the grid --------------------------------------------------
	$body.on("input change", "input,select", function () {
		const i = rowOf(this);
		if (!i) return;
		const $t = $(this);
		if ($t.hasClass("c-item")) i.item = this.value;
		else if ($t.hasClass("c-qty")) i.qty = cint(this.value) || 1;
		else if ($t.hasClass("c-karat")) i.karat = this.value;
		else if ($t.hasClass("c-win")) i.weight_in = this.value;
		else if ($t.hasClass("c-wout")) i.weight_out = this.value;
		else if ($t.hasClass("c-manual")) i.manual = this.value;
		// repainting the whole grid would steal focus mid-type, so only the figures
		const P = priceRow(i);
		const $tr = $t.closest("tr");
		$tr.find("td.num").eq(0)
			.removeClass("qc-add qc-less").addClass(P.added > 0 ? "qc-add" : (P.added < 0 ? "qc-less" : ""))
			.text(flt(i.weight_out) ? (P.added >= 0 ? "+" : "") + g3(P.added) : "—");
		$tr.find("td.num").eq(1).attr("title", whyWork(i)).text(money(P.work));
		$tr.find("td.num").eq(2).attr("title", whyMetal(i)).text(money(P.metal));
		$tr.find("td.num").eq(3).attr("title", whyStone(i)).text(money(P.stone));
		$tr.find("td.num").eq(4).html(`<b>${money(P.total)}</b>`);
		paintTiles();
	});
	$body.on("change", ".c-item,.c-win,.c-wout", () => { grow(); paint(); });
	$body.on("click", ".qc-x", function () {
		S.rows.splice(cint($(this).closest("tr").data("i")), 1);
		if (!S.rows.length) S.rows.push(blank());
		paint();
	});
	$body.on("click", ".qc-dup", function () {
		const i = rowOf(this);
		S.rows.push(JSON.parse(JSON.stringify(i)));
		paint();
	});

	// ---- the work on a row ---------------------------------------------------
	$body.on("click", ".c-work", function () {
		const i = rowOf(this);
		const all = S.ctx.work_types || [];
		const d = new frappe.ui.Dialog({
			title: __("Work on this row"),
			fields: [
				{ fieldname: "works", fieldtype: "MultiSelectPills", label: __("Types of Work"),
					get_data: (txt) => {
						const q = (txt || "").trim();
						const hits = all.filter((w) => !q || w.toLowerCase().includes(q.toLowerCase()));
						const known = hits.some((w) => w.toLowerCase() === q.toLowerCase());
						return (q && !known)
							? [{ value: q.toUpperCase(), description: __("new type of work") }, ...hits]
							: hits;
					},
					default: i.work_types || [], onchange: () => paintQty() },
				{ fieldname: "qty_html", fieldtype: "HTML", label: __("How many of each") },
			],
			primary_action_label: __("Set"),
			primary_action: () => {
				const works = d.get_value("works") || [];
				const counts = {};
				works.forEach((w) => {
					counts[w] = Math.max(cint($(d.fields_dict.qty_html.wrapper)
						.find(`input[data-w="${String(w).replace(/"/g, "&quot;")}"]`).val()) || 1, 1);
				});
				i.work_types = works;
				i.work_counts = counts;
				d.hide();
				grow(); paint();
			},
		});
		function paintQty() {
			const works = d.get_value("works") || [];
			const $q = $(d.fields_dict.qty_html.wrapper);
			const had = {};
			$q.find("input[data-w]").each(function () { had[$(this).data("w")] = this.value; });
			$q.html(works.length
				? `<div style="display:flex;flex-direction:column;gap:6px;">` + works.map((w) => `
					<div style="display:flex;align-items:center;gap:9px;">
						<span style="flex:1;font-size:13px;">${esc(w)}</span>
						<input type="number" min="1" step="1" data-w="${String(w).replace(/"/g, "&quot;")}"
							value="${had[w] != null ? had[w] : (i.work_counts[w] || 1)}"
							style="width:88px;text-align:right;border:1px solid var(--border-color);
								border-radius:6px;padding:3px 8px;background:var(--control-bg);color:var(--text-color);">
					</div>`).join("") + `</div>`
				: `<div style="font-size:12px;color:var(--text-muted);">${__("Pick the work above, then say how many of each.")}</div>`);
		}
		d.show();
		d.fields_dict.works.set_value(i.work_types || []);
		paintQty();
	});

	// ---- the stones on a row — the same dialog the repair desk uses -----------
	$body.on("click", ".c-stones", function () {
		const i = rowOf(this);
		jewelima.repairStoneDialog(i.stones || [], S.ctx.sieves || [], (out) => {
			i.stones = out;
			grow(); paint();
		});
	});

	// ---- the rate boxes ------------------------------------------------------
	$w.on("input", ".qc-wrate", function () {
		S.rates[$(this).closest("tr").data("w")] = flt(this.value);
		paintRows(); paintTiles();
		$(this).closest("tr").find("td.num").last().text(
			money(workTally()[$(this).closest("tr").data("w")] * flt(this.value)));
	});
	$w.on("change", ".qc-wrate", () => paint());
	$w.on("input", ".qc-srate", function () {
		S.stoneRates[$(this).closest("tr").data("s")] = flt(this.value);
		paintRows(); paintTiles();
	});
	$w.on("change", ".qc-srate", () => paint());

	// ---- the paper -----------------------------------------------------------
	function quote() {
		const T = totals();
		const g = stoneTally();
		return {
			party: S.party, gold_rate: S.gold, gst_percent: S.gst,
			quoted_at: frappe.datetime.str_to_user(frappe.datetime.now_datetime()),
			narration: S.narration,
			items: S.rows.filter(filled).map((i) => Object.assign({}, i, priceRow(i))),
			stone_lines: Object.keys(g).map((k) => Object.assign({}, g[k], { rate: flt(S.stoneRates[k]) })),
			total_work: T.work, total_metal: T.metal, total_stone: T.stone,
			total_manual: T.manual, total_added: T.add,
			gst_amount: T.gst, grand_total: T.grand,
		};
	}

	function boot(party) {
		return frappe.call({ method: API + ".get_quick_check_context", args: { party: party || null } })
			.then((r) => {
				const c = r.message || {};
				S.ctx = Object.assign(S.ctx || {}, c);
				// only fill what has not been typed over
				if (!S.gold) S.gold = flt(c.gold_rate);
				if (!S.gst) S.gst = flt(c.gst_percent);
				Object.keys(c.work_rates || {}).forEach((w) => {
					if (!S.rates[w]) S.rates[w] = flt(c.work_rates[w]);
				});
				(c.stone_rates || []).forEach((l) => {
					const k = sKey(l);
					if (!S.stoneRates[k]) S.stoneRates[k] = flt(l.rate);
				});
				if (S.goldCtl) S.goldCtl.set_value(S.gold);
				if (S.gstCtl) S.gstCtl.set_value(S.gst);
			});
	}

	S.partyCtl = mk(".qc-h-party", {
		fieldtype: "Link", label: __("Party"), fieldname: "party", options: "Repair Party",
		onchange: () => {
			S.party = S.partyCtl.get_value() || "";
			// their last bill's rates, for the ones not typed over yet
			boot(S.party).then(paint);
		},
	});
	S.goldCtl = mk(".qc-h-gold", {
		fieldtype: "Currency", label: __("Board Rate / g"), fieldname: "gold_rate",
		onchange: () => { S.gold = flt(S.goldCtl.get_value()); paint(); },
	});
	S.gstCtl = mk(".qc-h-gst", {
		fieldtype: "Percent", label: __("GST %"), fieldname: "gst",
		onchange: () => { S.gst = flt(S.gstCtl.get_value()); paint(); },
	});
	S.noteCtl = mk(".qc-h-note", {
		fieldtype: "Data", label: __("Note on the quotation"), fieldname: "narration",
		onchange: () => { S.narration = S.noteCtl.get_value() || ""; },
	});

	// ---- today's board -------------------------------------------------------
	// Which line is "our board rate" is the counter's call, not ours, so the
	// board is shown as it is quoted and picking a line fills the box. The karat
	// figures beside each line are derived, so they are labelled as such.
	function pickBoard() {
		frappe.dom.freeze(__("Reading the board…"));
		frappe.call({ method: API + ".get_quick_check_board" })
			.always(() => frappe.dom.unfreeze())
			.then((r) => {
				const lines = ((r.message || {}).lines || []);
				const live = lines.filter((l) => flt(l.rate));
				const d = new frappe.ui.Dialog({ title: __("Board rate"), size: "large" });
				$(d.body).html(live.length ? `
					<table class="qc-r"><thead><tr>
						<th>${__("Board")}</th><th>${__("Line")}</th>
						<th class="num">${__("Rate / g")}</th><th>${__("As of")}</th>
					</tr></thead><tbody>${live.map((l, n) => `
						<tr class="qc-bpick" data-n="${n}" style="cursor:pointer;">
							<td><b>${esc(l.name || "")}</b><div style="font-size:11px;color:var(--text-muted);">${esc(l.of || "")}</div></td>
							<td>${esc(l.label || "")}</td>
							<td class="num"><b>${money(l.rate)}</b></td>
							<td style="font-size:11px;color:var(--text-muted);">${esc(l.as_of || "")}</td></tr>`).join("")}
					</tbody></table>`
					: `<div class="qc-none">${__("The board is not answering just now.")}${
						lines.length ? "<br>" + lines.map((l) => esc(`${l.name}: ${l.error || "—"}`)).join("<br>") : ""}</div>`);
				$(d.body).on("click", ".qc-bpick", function () {
					const l = live[cint($(this).data("n"))];
					S.gold = flt(l.rate);
					S.goldCtl.set_value(S.gold);
					d.hide();
					paint();
				});
				d.show();
			});
	}

	page.set_primary_action(__("Print Quotation"), () => {
		const q = quote();
		if (!q.items.length) return frappe.msgprint(__("Nothing on the sheet yet."));
		jewelima.printRepairQuote(q);
	}, "printer");
	page.add_inner_button(__("Board Rate"), pickBoard);
	page.add_inner_button(__("Add Row"), () => { S.rows.push(blank()); paint(); });
	page.add_inner_button(__("Clear"), () => {
		frappe.confirm(__("Clear the sheet? Nothing here is saved."), () => {
			S.rows = [blank()];
			S.narration = "";
			S.noteCtl.set_value("");
			paint();
		});
	});

	S.rows = [blank()];
	boot().then(paint);
};
