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
	pt: 9.0, qr: 0.41,
	tag: { w: 3.3, h: 0.475 },
	a: { x: 0.94, y: 0.03, w: 0.96, h: 0.43 },
	b: { x: 1.95, y: 0.03, w: 1.02, h: 0.43 },
	// per-machine nudges the roll printer adds to the box lefts; zero for everyone else
	offsetA: 0, offsetB: 0,
	// everything on by default, so a tag reads the same whichever page printed it;
	// Multi Print's checkboxes are the per-run way to leave something off
	showFamily: true, showColor: true,
	// the two lines the operator may reword for a run. {gw} is the gross weight.
	gwLine: "GW:{gw} gm",
	familyText: "",
};

// Ready-made opts for buildBarcodeLabel. Pass overrides and the locked defaults
// fill in the rest. This is the ONLY way callers build opts, so anything it
// dropped would silently never reach the tag — every per-run choice is listed.
jewelima.barcodeOpts = function (over) {
	const o = Object.assign({}, jewelima.BARCODE_DEFAULTS, over || {});
	return {
		sizeVars: `--bc-size:${o.pt}pt;--bc-qr:${o.qr}in;--bc-w:${o.tag.w}in;--bc-h:${o.tag.h}in;`,
		tag: o.tag, a: o.a, b: o.b,
		offsetA: o.offsetA, offsetB: o.offsetB,
		stoneGrams: o.stoneGrams,
		showFamily: o.showFamily,
		showColor: o.showColor,
		freeText: o.freeText,
		gwLine: o.gwLine,
		familyText: o.familyText,
	};
};

jewelima.BARCODE_LABEL_CSS = `
.bc-label{position:relative;width:var(--bc-w,3.3in);height:var(--bc-h,0.475in);box-sizing:border-box;
	overflow:hidden;
	font-family:"Arial Narrow","Liberation Sans Narrow","Roboto Condensed","Helvetica Neue Condensed",Arial,sans-serif;
	font-stretch:condensed;font-size:var(--bc-size,9pt);font-weight:400;font-style:normal;
	line-height:1.05;letter-spacing:-.2px;color:#000;}
/* the two boxes, placed in inches; everything inside is aligned to its own box */
.bc-label .bc-half{position:absolute;box-sizing:border-box;display:flex;align-items:center;overflow:hidden;}
.bc-label .bc-a{justify-content:space-between;gap:0.04in;}
.bc-label .bc-b{flex-direction:column;justify-content:center;align-items:flex-start;}
.bc-label .bc-col{display:flex;flex-direction:column;justify-content:center;min-width:0;}
.bc-label .bc-left{flex:1 1 auto;white-space:nowrap;}
.bc-label .bc-qr{flex:0 0 auto;}
.bc-label .bc-qr img{height:var(--bc-qr,0.41in);width:var(--bc-qr,0.41in);display:block;}
.bc-label .bc-right{white-space:nowrap;text-align:left;}
.bc-label .bc-fallback{font-size:7.5pt;font-style:normal;}`;

// Stone weights print in CARATS by default, which is how the trade quotes them.
// `inGrams` prints the same weight in grams instead — one carat is exactly 0.2 g,
// so this is a conversion, not a different number. Grams get three decimals
// because two would round a small stone away (0.05 ct is 0.010 g).
jewelima.barcodeStoneLine = function (c, inGrams) {
	const flt = (v) => parseFloat(v) || 0;
	const w = (ct) => (inGrams
		? `${(flt(ct) * 0.2).toFixed(3)}g`
		: `${flt(ct).toFixed(2)}ct`);
	if (c.dmd_no || c.dmd_wt) return `DIA:${c.dmd_no}/${w(c.dmd_wt)}`;
	if (c.ps_no || c.ps_wt) return `PS:${c.ps_no}/${w(c.ps_wt)}`;
	if (c.cs_no || c.cs_wt) return `CS:${c.cs_no}/${w(c.cs_wt)}`;
	return "";
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

	// A — what the piece weighs and what is in it, then the code square
	const gwText = (o.gwLine || D.gwLine).replace("{gw}", flt(c.gw).toFixed(3));
	const stone = jewelima.barcodeStoneLine(c, o.stoneGrams);
	const famRaw = (o.familyText || "").trim() || c.stone_family || "";
	const fam = o.showFamily && famRaw ? esc(famRaw) : "";
	const left = `<div class="bc-col bc-left"><div>${esc(gwText)}</div>`
		+ (stone ? `<div>${stone}${fam ? " " + fam : ""}</div>`
			: (fam ? `<div>${fam}</div>` : "")) + `</div>`;
	const qr = c.qr
		? `<div class="bc-col bc-qr"><img src="${c.qr}"></div>`
		: `<div class="bc-col bc-qr bc-fallback">${esc(c.name)}</div>`;

	// B — what it IS: type, design, card number, gold colour, the free line last
	const r1 = c.design_type ? `<div>${esc(c.design_type)}</div>` : "";
	const col = o.showColor && c.gold_color ? `<div>${esc(c.gold_color)}</div>` : "";
	const free = o.freeText ? `<div>${esc(o.freeText)}</div>` : "";
	const right = `<div class="bc-col bc-right">${r1}<div>${esc(c.design || "")}</div>`
		+ `<div>${esc(c.name)}</div>${col}${free}</div>`;

	return `<div class="bc-label" style="${o.sizeVars || ""}">`
		+ `<div class="bc-half bc-a" style="${box(a, o.offsetA)}">${left}${qr}</div>`
		+ `<div class="bc-half bc-b" style="${box(b, o.offsetB)}">${right}</div>`
		+ `</div>`;
};
