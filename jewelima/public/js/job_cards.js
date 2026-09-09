// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Job-card printing — ONE renderer for every page that prints bag cards
// (Print Order Bags is the anywhere/reprint desk; the Ordering desk prints
// the daily 90%). A reprint has to be the same piece of paper as the original,
// which is why there is one renderer and not two.
//
// ONE CARD PER A6 LANDSCAPE PAGE. It used to be six to an A4 sheet, which meant
// a 99x95mm card that had to be cut apart by hand and left the items table with
// about 30mm to say everything in. A6 landscape is 148x105mm — half again the
// area, no cutting, and the table has room for the rows the floor actually
// writes in.
// Exposed as jewelima.printJobCards(cards); cards come from
// jewelima.jewelima.api.get_order_bag_cards.

window.jewelima = window.jewelima || {};


function printCards(cards) {
	if (!cards.length) return;
	// Every card is its own PAGE, so the printer is handed as many jobs as there
	// are cards and feeds them one at a time. Each sits in a PLAIN BLOCK wrapper
	// carrying the break: .card is display:flex, and break properties on a flex
	// box are unreliable — that is what put the barcode labels all on one sheet
	// the first time.
	const body = cards.map((c) => `<div class="jc-page">${pob_cardHTML(c)}</div>`).join("");
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
@page { size: 148mm 105mm; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: Arial, Helvetica, sans-serif; color: #000;
	-webkit-print-color-adjust: exact; print-color-adjust: exact; }
/* the plain block that carries the page break — never the flex card itself */
.jc-page { width: 148mm; height: 105mm; overflow: hidden;
	break-after: page; page-break-after: always;
	break-inside: avoid; page-break-inside: avoid; }
.jc-page:last-child { break-after: auto; page-break-after: auto; }
.card { width: 148mm; height: 105mm; padding: 4mm 5.5mm; display: flex; flex-direction: column;
	overflow: hidden; font-size: 10.5px; line-height: 1.3; }
/* the header sits in a touch from the card edge — hard against it reads as an
   overflow rather than as a margin */
.card .hd { display: grid; grid-template-columns: 1.4fr 1fr auto; gap: 5mm;
	border-bottom: 1.2px solid #000; padding: 0 0 2mm 1.5mm;
	font-size: 12px; line-height: 1.45; }
.card .hd b { font-weight: 700; }
.card .hd .c3 { text-align: right; white-space: nowrap; }
/* The karat code used to sit up here as a headline badge, which said the same
   thing as the first line of the items table and ate the corner doing it. The
   table says it now — the metal row is bold, which is enough to find it. */
.card .hd .pur2 { display: inline-block; font-size: 10px; font-weight: 800;
	border: 1px solid #000; border-radius: 1.5mm; padding: 0.1mm 1.2mm; margin-left: 1mm;
	line-height: 1.35; }
.card .hd .badges { margin-bottom: 1mm; }
/* the photo is the thing a bench recognises the piece by, so it gets the room
   the bigger card freed up: 44mm -> 60mm across, 46mm -> 56mm tall */
.card .md { display: grid; grid-template-columns: 60mm 1fr; gap: 4.5mm;
	flex: 1 1 auto; min-height: 0; padding: 2.5mm 0; }
/* No caption under the photo: it printed the design variant, which the header
   already carries as D V, and it was stealing the last few mm from the image. */
.card .img { display: flex; align-items: center; justify-content: center;
	border: 1px solid #000; overflow: hidden; padding: 1mm; }
.card .img img { max-width: 100%; max-height: 100%; object-fit: contain; }
.card .img .cap { font-size: 10px; color: #444; }
.card .it { display: flex; flex-direction: column; min-height: 0; }
.card .it table { width: 100%; border-collapse: collapse; font-size: 10px; }
.card .it th, .card .it td { border: 1px solid #000; padding: 1px 4px; text-align: left; }
.card .it th { background: #eee; font-size: 9.5px; }
/* the raw material — the metal the piece is made of. Bold because it is the one
   row on the card somebody looks for. */
.card .it tr.metal td { font-weight: 700; }
/* Qty + Weight stay EMPTY on print — the floor writes actual weights in; rows are
   tall enough to write in by hand, and A6 finally gives them the room */
.card .it td { height: 7mm; }
.card .it th:nth-child(2), .card .it td:nth-child(2) { width: 17%; }
.card .it th:nth-child(3), .card .it td:nth-child(3) { width: 30%; }
.card .it .sum { margin-top: 1.5mm; font-size: 10px; }
.card .ft { display: grid; grid-template-columns: 50mm 1fr; gap: 4mm; align-items: end;
	border-top: 1.2px solid #000; padding-top: 1.5mm; }
.card .ft .bc svg { width: 46mm; height: 9mm; display: block; margin: 0; }
.card .ft .num { font-size: 10.5px; font-weight: 700; letter-spacing: .5px; }
.card .ft .rm { font-size: 10px; align-self: start; }
`;

function pob_esc(s) {
	return frappe.utils.escape_html(s == null ? "" : String(s));
}

function pob_cardHTML(c) {
	// Qty/Weight print as EMPTY boxes — the card collects the ACTUAL weights by hand;
	// the planned targets stay on the summary line below the table.
	// Stones get their PLANNED qty pre-printed; metals stay blank (weighed by hand).
	// Weight column stays blank for everyone — the floor writes the actual weights.
	const mats = (c.materials || [])
		.map((m) => {
			const stone = (m.uom || "") === "Carat";
			const qtyCell = stone && flt(m.qty) ? flt(m.qty) : "";
			// the metal row is the raw material; bolding it is what replaced the
			// karat badge that used to shout the same thing from the corner
			return `<tr class="${stone ? "" : "metal"}"><td>${pob_esc(m.item)}</td><td>${qtyCell}</td><td></td></tr>`;
		})
		.join("");
	// CZ / CVD badges only — the karat code is no longer badged up here, it is the
	// bold metal row in the items table
	const purExtra = [];
	if (c.cz_no || c.cz_weight) purExtra.push("CZ");
	if (c.cvd_no || c.cvd_weight) purExtra.push("CVD");
	const stones = [];
	[["DMD", "dmd"], ["PS", "ps"], ["CS", "cs"], ["CZ", "cz"], ["CVD", "cvd"], ["PDMD", "pdmd"], ["POTH", "poth"]].forEach(([lb, b]) => {
		if (c[b + "_no"] || c[b + "_weight"]) stones.push(`${lb} ${c[b + "_no"] || 0}/${flt(c[b + "_weight"])}ct`);
	});
	return `
	<div class="card">
		<div class="hd">
			<div><b>D TYPE:</b> ${pob_esc(c.design_type)}<br><b>D NAME:</b> ${pob_esc(c.bank_no || c.design)}<br><b>D V:</b> ${pob_esc(c.design)}<br><b>D SIZE:</b> ${pob_esc(c.size || "NA")}</div>
			<div>${pob_esc(c.customer)}${c.party_group ? `<br>${pob_esc(c.party_group)}` : ""}<br><b>ORD:</b> ${pob_esc(c.order_date)}<br><b>DUE:</b> ${pob_esc(c.due_date)}</div>
			<div class="c3">${purExtra.length
				? `<div class="badges">${purExtra.map((x) => `<span class="pur2">${x}</span>`).join("")}</div>`
				: ""}<b>${pob_esc(c.order_type)}</b><br><b>ORD:</b> ${pob_esc(c.job_order)}<br><b>QTY:</b> ${pob_esc(c.qty)}</div>
		</div>
		<div class="md">
			<div class="img">${c.image
				? `<img src="${pob_esc(c.image)}">`
				: `<div class="cap">${pob_esc(c.design)}</div>`}</div>
			<div class="it">
				<table><tr><th>Items</th><th>Qty</th><th>Weight</th></tr>${mats}</table>
				<div class="sum"><b>G</b> ${flt(c.gross_weight)} · <b>N</b> ${flt(c.nett_weight)}${stones.length ? " · " + stones.join(" · ") : ""}</div>
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
	const quiet = 12; // quiet zone baked into the SVG on BOTH sides so scanners get clean margins (needed for reliable reads)
	let widths = "";
	codes.forEach((c) => (widths += POB_C128[c]));
	let x = quiet * module; // start after the left quiet zone
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
