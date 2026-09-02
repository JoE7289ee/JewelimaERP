// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// The jewellery barcode label — one definition, used by both printers.
//
// Print Barcode sends labels to a roll: one label per label-sized page, with
// per-machine nudge offsets because a tag's two printable zones rarely line up.
// Multi Print tiles the same labels onto a sheet. The MARKUP has to be the same
// or the two drift, and a label that prints differently depending on which page
// sent it is worse than having only one of them.
window.jewelima = window.jewelima || {};

// The calibration the tag printer is tuned to, in ONE place. Print Barcode can
// still nudge these per browser (it keeps its own values in localStorage, and a
// browser that has already been calibrated keeps what it has); every other label
// printer takes them as-is, so a label off Multi Print or off a Bag Split is the
// same label as one off the roll.
//
// qr is capped by the tag itself: the label is 0.475in tall, so 0.46 is as large
// as a code square can be and still sit on it — there is nowhere further to go.
jewelima.BARCODE_DEFAULTS = { pt: 9.0, offsetA: 0.04, offsetB: 0.22, qr: 0.46 };

// Ready-made opts for buildBarcodeLabel. Pass overrides (e.g. stoneGrams) and
// the tuned defaults fill in the rest.
jewelima.barcodeOpts = function (over) {
	const o = Object.assign({}, jewelima.BARCODE_DEFAULTS, over || {});
	return {
		sizeVars: `--bc-size:${o.pt}pt;--bc-qr:${o.qr}in;`,
		offsetA: o.offsetA,
		offsetB: o.offsetB,
		// the per-run label choices ride through as well — this helper is the only
		// way callers build opts, so anything it drops silently never reaches the tag
		stoneGrams: o.stoneGrams,
		showFamily: o.showFamily,
		showColor: o.showColor,
		freeText: o.freeText,
	};
};

jewelima.BARCODE_LABEL_CSS = `
.bc-label{width:3.3in;height:0.475in;box-sizing:border-box;display:flex;align-items:center;
	justify-content:center;gap:0;
	padding:0 0.09in;overflow:hidden;
	font-family:"Arial Narrow","Liberation Sans Narrow","Roboto Condensed","Helvetica Neue Condensed",Arial,sans-serif;
	font-stretch:condensed;font-size:var(--bc-size,9pt);font-weight:400;font-style:normal;
	line-height:1.05;letter-spacing:-.2px;color:#000;}
.bc-label .bc-col{display:flex;flex-direction:column;justify-content:center;}
.bc-label .bc-left{flex:0 0 auto;white-space:nowrap;}
.bc-label .bc-qr{flex:0 0 auto;}
.bc-label .bc-qr img{height:var(--bc-qr,0.46in);width:var(--bc-qr,0.46in);display:block;}
.bc-label .bc-right{flex:0 0 auto;white-space:nowrap;text-align:left;}
.bc-label .bc-fallback{font-size:7.5pt;font-style:normal;}
/* the two halves the label is split into — each nudges on its own, because a
   tag's two printable zones rarely line up with one another */
.bc-label .bc-half{display:flex;align-items:center;gap:0.045in;flex:0 0 auto;}
.bc-label .bc-a{justify-content:flex-end;}
.bc-label .bc-b{justify-content:flex-start;}`;

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

// opts: { sizeVars, offsetA, offsetB, stoneGrams, showFamily, showColor, freeText }
// — the roll printer passes its tuned values. stoneGrams prints stone weights in
// grams rather than carats; showFamily adds the stone family (EF / GH …) beside
// them; showColor adds the gold colour (YG / WG / PG); freeText is one line the
// operator types for this print run.
jewelima.buildBarcodeLabel = function (c, opts) {
	const o = opts || {};
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const stone = jewelima.barcodeStoneLine(c, o.stoneGrams);
	// LEFT: what the piece weighs and what is in it. The stone family (EF / GH …)
	// rides with the diamond line because it describes those stones.
	const fam = o.showFamily && c.stone_family ? esc(c.stone_family) : "";
	const left = `<div class="bc-col bc-left"><div>GW:${flt(c.gw).toFixed(3)} gm</div>`
		+ (stone ? `<div>${stone}${fam ? " " + fam : ""}</div>`
			: (fam ? `<div>${fam}</div>` : "")) + `</div>`;
	const qr = c.qr
		? `<div class="bc-col bc-qr"><img src="${c.qr}"></div>`
		: `<div class="bc-col bc-qr bc-fallback">${esc(c.name)}</div>`;
	// RIGHT: what it IS. Design type, design, the card number, and optionally the
	// gold colour and a free line the operator types for this run (a shop name,
	// usually). The free line is deliberately last — it is the least official
	// thing on the tag.
	const r1 = c.design_type ? `<div>${esc(c.design_type)}</div>` : "";
	const col = o.showColor && c.gold_color ? `<div>${esc(c.gold_color)}</div>` : "";
	const free = o.freeText ? `<div>${esc(o.freeText)}</div>` : "";
	const right = `<div class="bc-col bc-right">${r1}<div>${esc(c.design || "")}</div>`
		+ `<div>${esc(c.name)}</div>${col}${free}</div>`;
	const a = flt(o.offsetA), b = flt(o.offsetB);
	return `<div class="bc-label" style="${o.sizeVars || ""}">`
		+ `<div class="bc-half bc-a" style="transform:translateX(${a}in);">${left}${qr}</div>`
		+ `<div class="bc-half bc-b" style="transform:translateX(${b}in);">${right}</div>`
		+ `</div>`;
};
