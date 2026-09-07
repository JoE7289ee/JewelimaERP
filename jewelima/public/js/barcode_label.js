// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// The jewellery barcode label — one definition, used by every printer.
//
// A tag has two printable zones that never quite line up with one another, so
// the label is TWO BOXES placed in inches on a tag-sized canvas: A carries the
// weights and the code square, B the design and the card number. The boxes were
// measured on the Tag Canvas page against the real stock and are locked in here;
// the roll printer may still nudge them per machine, everything else prints them
// exactly as they are, so a tag off Multi Print, off a Bag Split or off the roll
// is the same tag.
window.jewelima = window.jewelima || {};

// Inches throughout, never pixels. qr is bounded by A's height — there is nowhere
// further to go on a 0.43in box.
jewelima.BARCODE_DEFAULTS = {
	pt: 11.0, qr: 0.41,
	tag: { w: 3.3, h: 0.475 },
	a: { x: 0.94, y: 0.03, w: 0.96, h: 0.43 },
	b: { x: 1.95, y: 0.03, w: 1.02, h: 0.43 },
	// per-machine nudges the roll printer adds to the box lefts; zero for everyone else
	offsetA: 0, offsetB: 0,
	// The type is the old software's, copied off its print dialog: Arial Narrow,
	// 11pt, Heavy, Oblique, on the same 3.3 x 0.475in page with no margins. That
	// machine's tags read cleanly on a Datamax head, and the reason is the WEIGHT
	// and the SIZE, not the family — a thermal head burns whole dots, and at 9pt
	// regular a condensed stem is about one dot wide, so it prints thin and breaks
	// up. Heavy gives the head something to lay down; the oblique keeps the
	// condensed glyphs from closing up on one another.
	//
	// All four are open in the layout dialog, because a different head or a
	// different stock may want something else. Geometry is unaffected by any of
	// them — only how the glyphs are drawn — so a tuned layout stays true.
	face: "condensed", weight: "heavy", italic: true,
	// everything on by default, so a tag reads the same whichever page printed it;
	// Multi Print's checkboxes are the per-run way to leave something off
	showFamily: true, showColor: true,
	// the two lines the operator may reword for a run. {gw} is the gross weight.
	gwLine: "GW:{gw} gm",
	familyText: "",
	// the family (EF, GH …) is never glued to the stone line: when the Stone
	// family box is ticked it prints as its OWN line, placed on its own; when it
	// is not, it does not print at all
	// EVERY line on the tag, placed on its own. The tag has two zones, but inside
	// them the lines do not want the same treatment — a card number reads better
	// hard right while the design sits left, and a stone line often wants a hair
	// of nudging that the whole box must not follow. align is left/center/right,
	// pt 0 means "inherit the tag's type size", dx/dy nudge in INCHES.
	lines: {
		gw:     { align: "left", pt: 0, dx: 0, dy: 0 },
		stone:  { align: "left", pt: 0, dx: 0, dy: 0 },
		family: { align: "left", pt: 0, dx: 0, dy: 0 },
		type:   { align: "left", pt: 0, dx: 0, dy: 0 },
		colour: { align: "left", pt: 0, dx: 0, dy: 0 },
		design: { align: "left", pt: 0, dx: 0, dy: 0 },
		card:   { align: "left", pt: 0, dx: 0, dy: 0 },
		free:   { align: "left", pt: 0, dx: 0, dy: 0 },
		free2:  { align: "left", pt: 0, dx: 0, dy: 0 },
	},
};

// Ready-made opts for buildBarcodeLabel. Pass overrides and the locked defaults
// fill in the rest. This is the ONLY way callers build opts, so anything it
// dropped would silently never reach the tag — every per-run choice is listed.
// The layout the floor has agreed on, saved from Tag Canvas. It sits between
// the shipped defaults and a caller's per-run overrides, so a tag printed from
// any page picks up the same geometry without anyone editing code.
jewelima.BARCODE_LAYOUT = null;
jewelima.BARCODE_LAYOUT_META = null;     // {saved_on, saved_by} when a saved layout is in force
jewelima.BARCODE_LAYOUT_ERROR = false;   // the fetch failed: tags are on the SHIPPED defaults
jewelima.loadBarcodeLayout = function (force) {
	if (jewelima._layoutLoad && !force) return jewelima._layoutLoad;
	jewelima.BARCODE_LAYOUT_ERROR = false;
	jewelima._layoutLoad = frappe.call({
		method: "jewelima.jewelima.api.get_barcode_layout", freeze: false,
	}).then((r) => {
		const m = r.message || {};
		if (m.layout && typeof m.layout === "object") {
			jewelima.BARCODE_LAYOUT = m.layout;
			jewelima.BARCODE_LAYOUT_META = { saved_on: m.saved_on || "", saved_by: m.saved_by || "" };
		}
		return jewelima.BARCODE_LAYOUT;
	}).catch(() => {
		// a failed fetch used to be swallowed, so every tag quietly printed on the
		// shipped defaults and the layout looked "not saved". Say it, and do not
		// memoise the failure — the next page or the next open retries.
		jewelima.BARCODE_LAYOUT_ERROR = true;
		jewelima._layoutLoad = null;
		frappe.show_alert({ indicator: "red", message:
			__("The saved tag layout could not be loaded — tags are on the shipped defaults. Reload the page.") }, 10);
		return null;
	});
	return jewelima._layoutLoad;
};

// what the old software called Normal / Bold / Heavy
jewelima.BARCODE_WEIGHTS = { normal: 400, bold: 700, heavy: 900 };

jewelima.barcodeOpts = function (over) {
	const WEIGHT = jewelima.BARCODE_WEIGHTS;
	const saved = jewelima.BARCODE_LAYOUT || {};
	const o = Object.assign({}, jewelima.BARCODE_DEFAULTS, saved, over || {});
	// A layout SAVED before the weight and the oblique existed keeps printing the
	// way it prints today — the shipped default must not reach in and restyle a
	// tag the floor already tuned. It says nothing about weight, so it meant the
	// regular upright it was measured in; an explicit bold still means bold.
	// Clicking "Match the old software" is how a saved layout adopts the new type.
	const chosen = Object.assign({}, saved, over || {});
	if (chosen.weight == null && jewelima.BARCODE_LAYOUT) {
		o.weight = saved.bold || chosen.bold ? "bold" : "normal";
		if (chosen.italic == null) o.italic = false;
	}
	// `lines` is a map, so a shallow assign would drop every line the saved
	// layout did not mention — and each line is COPIED, because a shared
	// reference here lets a caller's edit write straight into the saved layout
	const merged = Object.assign({}, jewelima.BARCODE_DEFAULTS.lines,
		saved.lines || {}, (over || {}).lines || {});
	o.lines = {};
	for (const k in merged) o.lines[k] = Object.assign({}, merged[k]);
	return {
		sizeVars: `--bc-size:${o.pt}pt;--bc-qr:${o.qr}in;--bc-w:${o.tag.w}in;--bc-h:${o.tag.h}in;`
			+ (o.face === "normal"
				? `--bc-family:Arial,Helvetica,"Liberation Sans",sans-serif;`
					+ `--bc-stretch:normal;--bc-track:0;`
				: "")
			+ `--bc-weight:${WEIGHT[o.weight] || WEIGHT.heavy};`
			+ `--bc-style:${o.italic ? "oblique" : "normal"};`,
		// the numbers themselves, not only the CSS they were baked into — the
		// layout editor needs to read them back without parsing a style string
		pt: o.pt, qr: o.qr,
		tag: o.tag, a: o.a, b: o.b,
		offsetA: o.offsetA, offsetB: o.offsetB,
		face: o.face, weight: o.weight, italic: o.italic,
		stoneGrams: o.stoneGrams,
		showFamily: o.showFamily,
		showColor: o.showColor,
		freeText: o.freeText,
		freeText2: o.freeText2,
		gwLine: o.gwLine,
		familyText: o.familyText,
		lines: Object.assign({}, jewelima.BARCODE_DEFAULTS.lines, o.lines || {}),
	};
};

jewelima.BARCODE_LABEL_CSS = `
.bc-label{position:relative;width:var(--bc-w,3.3in);height:var(--bc-h,0.475in);box-sizing:border-box;
	overflow:hidden;
	font-family:var(--bc-family,"Arial Narrow","Liberation Sans Narrow","Roboto Condensed","Helvetica Neue Condensed",Arial,sans-serif);
	font-stretch:var(--bc-stretch,condensed);font-size:var(--bc-size,9pt);
	font-weight:var(--bc-weight,900);font-style:var(--bc-style,oblique);
	line-height:1.05;letter-spacing:var(--bc-track,-.2px);color:#000;
	/* the printer must lay the ink down as pure black, not a dithered grey */
	-webkit-print-color-adjust:exact;print-color-adjust:exact;}
/* a line can be placed on its own inside its box, so the columns give it the
   full width to be aligned in — without that, text-align has nothing to move in */
.bc-label .bc-half{position:absolute;box-sizing:border-box;display:flex;align-items:center;overflow:hidden;}
.bc-label .bc-a{justify-content:space-between;gap:0.04in;}
/* lines are anchored to the TOP of their box and never re-centre: a tag with the
   free text and one without must put every other line in the same place, or a
   layout tuned with the free text on is wrong the moment it is off */
.bc-label .bc-b{flex-direction:column;justify-content:flex-start;align-items:stretch;line-height:.82;}
.bc-label .bc-col{display:flex;flex-direction:column;justify-content:flex-start;min-width:0;}
.bc-label .bc-left{flex:1 1 auto;white-space:nowrap;}
.bc-label .bc-qr{flex:0 0 auto;}
.bc-label .bc-qr img{height:var(--bc-qr,0.41in);width:var(--bc-qr,0.41in);display:block;}
.bc-label .bc-right{white-space:nowrap;text-align:left;width:100%;}
.bc-label .bc-ln{position:relative;}
.bc-label .bc-fallback{font-size:7.5pt;font-style:normal;}`;

// Stone weights print in CARATS by default, which is how the trade quotes them.
// `inGrams` prints the same weight in grams instead — one carat is exactly 0.2 g,
// so this is a conversion, not a different number. Grams get three decimals
// because two would round a small stone away (0.05 ct is 0.010 g).
jewelima.barcodeStoneParts = function (c, inGrams) {
	const flt = (v) => parseFloat(v) || 0;
	const w = (ct) => (inGrams
		? `${(flt(ct) * 0.2).toFixed(3)}g`
		: `${flt(ct).toFixed(2)}ct`);
	if (c.dmd_no || c.dmd_wt) return { head: `DIA:${c.dmd_no}`, wt: w(c.dmd_wt) };
	if (c.ps_no || c.ps_wt) return { head: `PS:${c.ps_no}`, wt: w(c.ps_wt) };
	if (c.cs_no || c.cs_wt) return { head: `CS:${c.cs_no}`, wt: w(c.cs_wt) };
	return { head: "", wt: "" };
};

// the one-line form every tag has printed until now: DIA:12/0.11ct
jewelima.barcodeStoneLine = function (c, inGrams) {
	const p = jewelima.barcodeStoneParts(c, inGrams);
	return p.head ? `${p.head}/${p.wt}` : "";
};

// opts come from barcodeOpts. stoneGrams prints stone weights in grams; showFamily
// prints the stone family (EF / GH …) beside them, and familyText replaces the
// card's own family for this run; gwLine rewords the weight line ({gw} = grams);
// showColor adds the gold colour (YG / WG / PG); freeText is one line the
// operator types for this run.
jewelima.buildBarcodeLabel = function (c, opts) {
	const o = opts || jewelima.barcodeOpts();
	const D = jewelima.BARCODE_DEFAULTS;
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const box = (r, nudge) => `left:${(flt(r.x) + flt(nudge)).toFixed(3)}in;top:${flt(r.y).toFixed(3)}in;`
		+ `width:${flt(r.w).toFixed(3)}in;height:${flt(r.h).toFixed(3)}in;`;
	const a = o.a || D.a, b = o.b || D.b;
	// one line's own placement: alignment inside its box, its own type size if it
	// was given one, and a nudge that moves it without moving the box
	const L = Object.assign({}, D.lines, o.lines || {});
	const ln = (k, hide) => {
		const s = L[k] || {};
		return `class="bc-ln" style="text-align:${s.align || "left"};`
			+ (flt(s.pt) ? `font-size:${flt(s.pt)}pt;` : "")
			+ (flt(s.dx) ? `left:${flt(s.dx).toFixed(3)}in;` : "")
			+ (flt(s.dy) ? `top:${flt(s.dy).toFixed(3)}in;` : "")
			+ (hide ? "visibility:hidden;" : "")
			+ `"`;
	};
	// A line the operator switched OFF must not move the lines under it: the
	// layout was tuned against the tag as a whole, so unticking Gold colour has
	// to leave a hole, not pull the design and the card number up a line. The
	// slot is held by a hidden glyph, which reserves exactly one line box at
	// whatever type size that line carries.
	//
	// A line missing because the piece HAS no such value is different and still
	// collapses — a tag for a piece with no stones is genuinely a shorter tag.
	const slot = (k) => `<div ${ln(k, true)}>0</div>`;

	// A — what the piece weighs and what is in it, then the code square
	const gwText = (o.gwLine || D.gwLine).replace("{gw}", flt(c.gw).toFixed(3));
	const sp = jewelima.barcodeStoneParts(c, o.stoneGrams);
	const famRaw = (o.familyText || "").trim() || c.stone_family || "";
	const fam = o.showFamily && famRaw ? esc(famRaw) : "";
	// split: what the stones are on one line, what they weigh on the next, each
	// placeable on its own. Joined: the single line every tag has carried.
	let stoneRows = sp.head ? `<div ${ln("stone")}>${sp.head}/${sp.wt}</div>` : "";
	if (fam) stoneRows += `<div ${ln("family")}>${fam}</div>`;
	else if (famRaw) stoneRows += slot("family");     // switched off, not absent
	const left = `<div class="bc-col bc-left"><div ${ln("gw")}>${esc(gwText)}</div>`
		+ stoneRows + `</div>`;
	const qr = c.qr
		? `<div class="bc-col bc-qr"><img src="${c.qr}"></div>`
		: `<div class="bc-col bc-qr bc-fallback">${esc(c.name)}</div>`;

	// B — what it IS: type + colour, design, card number, then the free line.
	// The colour rides ON the type line rather than taking one of its own: box B
	// is 0.43in and fits THREE lines at 9pt, so a fourth shaved the top off the
	// type and the bottom off the colour on every tag that carried it.
	// the first line names the PARTY the piece is for (the design type stands in
	// for a card with no party); the colour is its OWN line, on when the Gold
	// colour box is ticked, placed on its own
	const head = c.party || c.design_type || "";
	const r1 = head ? `<div ${ln("type")}>${esc(head)}</div>` : "";
	// the colour prints as karat + letter — 18Y, 18W, 18P — which is what the
	// floor reads it as. A piece whose karat could not be resolved still gets the
	// plain YG rather than nothing, because a colour is worth having either way.
	const colCode = c.gold_code || c.gold_color || "";
	const colLine = colCode
		? (o.showColor ? `<div ${ln("colour")}>${esc(colCode)}</div>` : slot("colour"))
		: "";
	const free = o.freeText ? `<div ${ln("free")}>${esc(o.freeText)}</div>` : "";
	// a two-character code the run is stamped with — a counter, a tray, a batch
	const free2 = o.freeText2 ? `<div ${ln("free2")}>${esc(o.freeText2)}</div>` : "";
	// a free line IS a fourth, so the column tightens to keep it on the tag
	// the DESIGN, not the variant — a tag is read by whoever holds the piece
	const right = `<div class="bc-col bc-right">${r1}${colLine}`
		+ `<div ${ln("design")}>${esc(c.design_no || c.design || "")}</div>`
		+ `<div ${ln("card")}>${esc(c.name)}</div>${free}${free2}</div>`;

	return `<div class="bc-label" style="${o.sizeVars || ""}">`
		+ `<div class="bc-half bc-a" style="${box(a, o.offsetA)}">${left}${qr}</div>`
		+ `<div class="bc-half bc-b" style="${box(b, o.offsetB)}">${right}</div>`
		+ `</div>`;
};
