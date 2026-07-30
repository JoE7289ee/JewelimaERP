// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Job-card printing — ONE renderer for every page that prints bag cards
// (Print Order Bags is the anywhere/reprint desk; the Ordering desk prints
// the daily 90%). 6 cards per A4 page, code128 barcode, same format always.
// Exposed as jewelima.printJobCards(cards); cards come from
// jewelima.jewelima.api.get_order_bag_cards.

window.jewelima = window.jewelima || {};


function printCards(cards) {
	if (!cards.length) return;
	const pages = [];
	for (let i = 0; i < cards.length; i += 6) pages.push(cards.slice(i, i + 6));
	const body = pages
		.map((group) => `<div class="page">${group.map(pob_cardHTML).join("")}</div>`)
		.join("");
	// print IN PLACE through a hidden iframe (same trick as
	// jewelima.print_window) — no pop-up window, no pop-up blockers, the
	// dialog opens right over the current page
	document.getElementById("jw-cards-frame")?.remove();
	const fr = document.createElement("iframe");
	fr.id = "jw-cards-frame";
	fr.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
	document.body.appendChild(fr);
	const doc = fr.contentDocument;
	doc.open();
	doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Order Bags</title><style>${POB_PRINT_CSS}</style></head><body>${body}</body></html>`);
	doc.close();
	// let the photos land before the dialog opens
	setTimeout(() => { fr.contentWindow.focus(); fr.contentWindow.print(); }, 450);
}

const POB_PRINT_CSS = `
@page { size: A4 portrait; margin: 6mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; }
.page { width: 198mm; height: 285mm; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: repeat(3, 1fr); gap: 3mm; page-break-after: always; }
.page:last-child { page-break-after: auto; }
.card { border: 1px solid #000; padding: 2mm 2.5mm; display: flex; flex-direction: column; overflow: hidden; font-size: 9px; line-height: 1.25; }
.card .hd { display: grid; grid-template-columns: 1.2fr 1fr 0.9fr; gap: 4px; border-bottom: 1px solid #000; padding-bottom: 1.5mm; font-size: 10.5px; line-height: 1.35; }
.card .hd b { font-weight: 700; }
.card .hd .pur { float: right; font-size: 13px; font-weight: 800; margin-left: 4px; }
.card .md { display: grid; grid-template-columns: 34mm 1fr; gap: 3px; flex: 1 1 auto; min-height: 0; padding: 1.5mm 0; }
.card .img { display: flex; flex-direction: column; align-items: center; justify-content: center; border: 1px solid #000; }
.card .img img { max-width: 100%; max-height: 30mm; object-fit: contain; }
.card .img .cap { font-size: 8px; margin-top: 1px; }
.card .it table { width: 100%; border-collapse: collapse; font-size: 8.5px; }
.card .it th, .card .it td { border: 1px solid #000; padding: 1px 3px; text-align: left; }
.card .it th { background: #eee; }
/* Qty + Weight stay EMPTY on print — the floor writes actual weights in; rows are
   tall enough to write in by hand */
.card .it td { height: 6.5mm; }
.card .it th:nth-child(2), .card .it td:nth-child(2) { width: 17%; }
.card .it th:nth-child(3), .card .it td:nth-child(3) { width: 30%; }
.card .it .sum { margin-top: 1mm; font-size: 8.5px; }
.card .ft { display: grid; grid-template-columns: 34mm 1fr; gap: 3px; align-items: end; border-top: 1px solid #000; padding-top: 1mm; }
.card .ft .bc svg { width: 26mm; height: 4.5mm; display: block; margin: 0; }
.card .ft .num { font-size: 9px; font-weight: 700; letter-spacing: .5px; }
.card .ft .rm { font-size: 8.5px; align-self: start; }
`;

function pob_esc(s) {
	return frappe.utils.escape_html(s == null ? "" : String(s));
}

function pob_cardHTML(c) {
	// Qty/Weight print as EMPTY boxes — the card collects the ACTUAL weights by hand;
	// the planned targets stay on the summary line below the table.
	const mats = (c.materials || [])
		.map((m) => `<tr><td>${pob_esc(m.item)}${m.purity ? " - " + flt(m.purity) : ""}</td><td></td><td></td></tr>`)
		.join("");
	// top-right badge: the karat gold CODE (22KPG …) — the BOM's metal row, or the
	// CAD karat target; falls back to the purity % if neither is there
	const gold = (c.materials || []).find((m) => (m.uom || "") !== "Carat" && flt(m.purity) > 0);
	const purBadge = gold ? gold.item : (c.cad_karat || (c.purity ? flt(c.purity) + "%" : ""));
	const stones = [];
	[["DMD", "dmd"], ["PS", "ps"], ["CS", "cs"], ["CZ", "cz"], ["CVD", "cvd"], ["PDMD", "pdmd"], ["POTH", "poth"]].forEach(([lb, b]) => {
		if (c[b + "_no"] || c[b + "_weight"]) stones.push(`${lb} ${c[b + "_no"] || 0}/${flt(c[b + "_weight"])}ct`);
	});
	return `
	<div class="card">
		<div class="hd">
			<div><b>D TYPE:</b> ${pob_esc(c.design_type)}<br><b>D NAME:</b> ${pob_esc(c.bank_no || c.design)}<br><b>D VARIANT:</b> ${pob_esc(c.design)}<br><b>D SIZE:</b> ${pob_esc(c.size || "NA")}</div>
			<div>${pob_esc(c.customer)}<br><b>ORD:</b> ${pob_esc(c.order_date)}<br><b>DUE:</b> ${pob_esc(c.due_date)}</div>
			<div>${purBadge ? `<span class="pur">${pob_esc(purBadge)}</span>` : ""}<b>${pob_esc(c.order_type)}</b><br><b>ORD:</b> ${pob_esc(c.job_order)}<br><b>QTY:</b> ${pob_esc(c.qty)}</div>
		</div>
		<div class="md">
			<div class="img">${c.image ? `<img src="${pob_esc(c.image)}">` : ""}<div class="cap">${pob_esc(c.design)}</div></div>
			<div class="it">
				<table><tr><th>Items</th><th>Qty</th><th>Weight</th></tr>${mats}</table>
				<div class="sum"><b>G</b> ${flt(c.gross_weight)} · <b>N</b> ${flt(c.nett_weight)} · ${flt(c.purity)}%${stones.length ? " · " + stones.join(" · ") : ""}</div>
			</div>
		</div>
		<div class="ft">
			<div class="bc">${pob_barcodeSVG(c.name)}<div class="num">${pob_esc(c.name)}</div></div>
			<div class="rm"><b>Remarks:</b> ${pob_esc(c.narration)}</div>
		</div>
	</div>`;
}

// ---- self-contained Code 128-B barcode (offline, no deps) ----
const POB_C128 = [
	"212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
	"221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
	"221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
	"212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
	"231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
	"231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
	"314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
	"112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
	"111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
	"214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
	"114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

function pob_barcodeSVG(text, module = 1.0, height = 42) {
	text = String(text || "");
	const codes = [104]; // Start B
	for (let i = 0; i < text.length; i++) codes.push(text.charCodeAt(i) - 32);
	let sum = 104;
	for (let i = 1; i < codes.length; i++) sum += codes[i] * i;
	codes.push(sum % 103); // checksum
	codes.push(106); // Stop
	const quiet = 10; // kept on the RIGHT only — the card's white padding is the left quiet zone, so the bars align with the number's E
	let widths = "";
	codes.forEach((c) => (widths += POB_C128[c]));
	let x = 0;
	let rects = "";
	for (let i = 0; i < widths.length; i++) {
		const w = parseInt(widths[i], 10) * module;
		if (i % 2 === 0) rects += `<rect x="${x}" y="0" width="${w}" height="${height}" fill="#000"/>`;
		x += w;
	}
	const total = x + quiet * module;
	return `<svg viewBox="0 0 ${total} ${height}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;
}

jewelima.printJobCards = printCards;
