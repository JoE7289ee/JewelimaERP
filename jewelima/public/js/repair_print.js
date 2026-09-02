// The two things the repair counter hands over: the order taken in, and the
// bill. Both print through a hidden iframe — the same trick the job cards use —
// so the dialog opens over the page with no pop-up to be blocked, and "Save as
// PDF" in that dialog is how either becomes a file.
//
// The BILL goes out on the Jewelima letterhead (jewelima.print_window), because
// it is the paper the customer keeps. The order slip stays plain — it is an
// internal receipt for the counter.
window.jewelima = window.jewelima || {};

// the table/typography rules both prints share — no body or @page rules here,
// so the branded bill can keep the letterhead's own font and page setup
const JW_REPAIR_TABLE_CSS = `
*{box-sizing:border-box;}
h1{font-size:16px;margin:0 0 2px;letter-spacing:.3px;}
.sub{font-size:10.5px;color:#333;margin-bottom:10px;}
.sub b{color:#000;}
table{width:100%;border-collapse:collapse;margin-bottom:10px;}
th{text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.04em;
   border-bottom:1.2px solid #000;padding:4px 6px;}
td{padding:4px 6px;border-bottom:1px solid #bbb;vertical-align:top;}
tr:nth-child(even) td{background:#f5f5f5;}
td.n,th.n{text-align:right;white-space:nowrap;}
thead{display:table-header-group;}
tr{page-break-inside:avoid;}
.tot{width:auto;min-width:230px;margin-left:auto;margin-bottom:0;}
.tot td{border:0;padding:2px 6px;}
.tot tr:nth-child(even) td{background:none;}
.tot .g td{border-top:1.2px solid #000;font-weight:800;font-size:13px;padding-top:5px;}
.note{margin-top:10px;font-size:10px;color:#333;white-space:pre-wrap;}
.sig{margin-top:22px;display:flex;justify-content:space-between;font-size:10px;color:#333;}
.sig div{border-top:1px solid #000;padding-top:3px;width:38%;text-align:center;}
.muted{color:#666;}
`;

const JW_REPAIR_PRINT_CSS = `
@page { size: A4 portrait; margin: 12mm 10mm; }
body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#000;font-size:11px;}
` + JW_REPAIR_TABLE_CSS;

// The bill: letterhead font stays, the signature block is pinned to the foot of
// the page (the counter signs at the bottom, not wherever the table happens to
// end), and the party + board rate head the document.
// NOTE the order: the shared rules come FIRST so these override them —
// .sig carries margin-top:22px there, which would beat margin-top:auto here
// and leave the signatures floating under the table instead of at the foot.
const JW_BILL_PRINT_CSS = JW_REPAIR_TABLE_CSS + `
@page { size: A4 portrait; margin: 12mm 10mm; }
body{font-size:11px;padding:0;display:flex;flex-direction:column;min-height:273mm;}
.rb-body{flex:1 1 auto;}
.rb-head{text-align:center;margin:0 0 12px;}
.rb-party{font-size:17px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;}
.rb-rate{font-size:13px;font-weight:800;margin-left:18px;white-space:nowrap;}
.rb-meta{font-size:9.5px;color:#666;margin-top:4px;letter-spacing:.04em;}
.sig{margin-top:auto;padding-top:30px;}
/* twelve columns of rupee amounts do not fit A4 at 11px — the piece table runs
   tighter than the rest of the bill so the Amount column stays on the page */
.rb-body table{font-size:9.5px;}
.rb-body table th{font-size:8px;padding:3px 4px;}
.rb-body table td{padding:3px 4px;}
.rb-body table.tot{font-size:11px;}
.rb-body table.tot td{padding:2px 6px;}
`;

function jwRepairPrint(title, html) {
	document.getElementById("jw-repair-frame")?.remove();
	const fr = document.createElement("iframe");
	fr.id = "jw-repair-frame";
	fr.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
	document.body.appendChild(fr);
	const doc = fr.contentDocument;
	doc.open();
	doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>`
		+ `<style>${JW_REPAIR_PRINT_CSS}</style></head><body>${html}</body></html>`);
	doc.close();
	setTimeout(() => { fr.contentWindow.focus(); fr.contentWindow.print(); }, 250);
}

// The letterhead payload, fetched once per session — the bill is printed over
// and over at the counter and this never changes between prints.
function jwRepairBranding() {
	if (jewelima._repair_branding) return Promise.resolve(jewelima._repair_branding);
	return frappe.call({ method: "jewelima.jewelima.api.get_print_branding" })
		.then((r) => (jewelima._repair_branding = r.message || {}))
		.catch(() => ({}));       // no letterhead is better than no bill
}

// ---- what came in ---------------------------------------------------------
jewelima.printRepairOrder = function (d) {
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const cint = (v) => parseInt(v, 10) || 0;
	const rows = (d.items || []).map((i, n) => `<tr>
		<td class="n">${n + 1}</td>
		<td><b>${esc(i.repair || "")}</b></td>
		<td>${esc(i.design_type || "")}</td>
		<td class="n">${cint(i.qty)}</td>
		<td class="n">${flt(i.weight).toFixed(3)}</td>
		<td class="n">${esc(i.karat || "—")}</td>
		<td>${esc((i.work_types || []).join(", ")) || "—"}</td>
		<td>${(i.stones || []).length
			? (i.stones || []).map((s) => `${esc(s.bucket || s.stone || "")} ${esc(s.sieve || "")} `
				+ `${cint(s.pcs)}/${flt(s.ct).toFixed(3)}`).join("<br>") : "—"}</td>
		<td>${esc(i.narration || "")}</td></tr>`).join("");
	const qty = (d.items || []).reduce((a, i) => a + cint(i.qty), 0);
	const wt = (d.items || []).reduce((a, i) => a + flt(i.weight), 0);
	jwRepairPrint(d.name || "Repair Order", `
		<h1>${__("Repair Order")} ${esc(d.name || "")}</h1>
		<div class="sub"><b>${esc(d.party || "")}</b> &nbsp;·&nbsp; ${__("received")} ${esc(d.received_at || "")}
			${d.received_by_name ? " &nbsp;·&nbsp; " + __("by") + " " + esc(d.received_by_name) : ""}</div>
		<table><thead><tr><th class="n"></th><th>${__("Piece")}</th><th>${__("Design")}</th>
			<th class="n">${__("Qty")}</th><th class="n">${__("Weight g")}</th><th class="n">${__("Purity")}</th>
			<th>${__("Type of Work")}</th><th>${__("Stones")}</th><th>${__("Narration")}</th></tr></thead>
			<tbody>${rows}</tbody></table>
		<table class="tot"><tr><td>${__("Pieces")}</td><td class="n">${qty}</td></tr>
			<tr class="g"><td>${__("Total weight")}</td><td class="n">${wt.toFixed(3)} g</td></tr></table>
		${d.narration ? `<div class="note">${esc(d.narration)}</div>` : ""}
		<div class="sig"><div>${__("Received by")}</div><div>${__("Handed over by")}</div></div>`);
};

// ---- what it came to ------------------------------------------------------
jewelima.printRepairBill = function (b) {
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const cint = (v) => parseInt(v, 10) || 0;
	const m = (v) => format_currency(flt(v));
	const rows = (b.items || []).map((i, n) => `<tr>
		<td class="n">${n + 1}</td>
		<td><b>${esc(i.repair || "")}</b></td>
		<td>${esc(i.design_type || "")}</td>
		<td class="n">${esc(i.karat || "—")}</td>
		<td class="n">${flt(i.weight_in).toFixed(3)}</td>
		<td class="n">${flt(i.weight_out).toFixed(3)}</td>
		<td class="n">${flt(i.metal_added) >= 0 ? "+" : ""}${flt(i.metal_added).toFixed(3)}</td>
		<td class="n">${m(i.work_amount)}</td>
		<td class="n">${m(i.metal_amount)}</td>
		<td class="n">${m(i.stone_amount)}</td>
		<td class="n">${flt(i.manual_amount) ? m(i.manual_amount) : "—"}</td>
		<td class="n"><b>${m(i.amount)}</b></td></tr>`).join("");
	const stones = (b.stones || []).map((s) => `<tr><td>${esc(s.bucket || s.stone || "")}</td>
		<td>${esc(s.sieve || "—")}</td><td class="n">${cint(s.pcs)}</td>
		<td class="n">${flt(s.ct).toFixed(3)}</td><td class="n">${m(s.rate)}</td>
		<td class="n">${m(s.amount)}</td></tr>`).join("");

	// party and board rate head the bill, side by side; the bill number, the
	// order it came from and the date sit small underneath
	const meta = [b.name, b.repair_order, b.billed_at].filter(Boolean).map(esc).join(" &nbsp;·&nbsp; ");
	const body = `
		<div class="rb-body">
		<div class="rb-head">
			<div class="rb-party">${esc(b.party || "—")}${flt(b.gold_rate)
				? `<span class="rb-rate">${__("Board Rate")} ${m(b.gold_rate)}/g</span>` : ""}</div>
			${meta ? `<div class="rb-meta">${meta}</div>` : ""}
		</div>
		<table><thead><tr><th class="n"></th><th>${__("Piece")}</th><th>${__("Design")}</th>
			<th class="n">${__("Purity")}</th><th class="n">${__("In g")}</th><th class="n">${__("Out g")}</th>
			<th class="n">${__("Added")}</th><th class="n">${__("Repair Charge")}</th><th class="n">${__("Metal")}</th>
			<th class="n">${__("Stone")}</th><th class="n">${__("Manual")}</th>
			<th class="n">${__("Amount")}</th></tr></thead><tbody>${rows}</tbody></table>

		${stones ? `<table><thead><tr><th>${__("Stones")}</th><th>${__("Sieve")}</th>
			<th class="n">${__("Pcs")}</th><th class="n">${__("Cts")}</th><th class="n">${__("Rate/ct")}</th>
			<th class="n">${__("Amount")}</th></tr></thead><tbody>${stones}</tbody></table>` : ""}

		<table class="tot">
			<tr><td>${__("Repair Charge")}</td><td class="n">${m(b.total_work_amount)}</td></tr>
			<tr><td>${__("Metal")} <span class="muted">(${flt(b.total_metal_added).toFixed(3)} g)</span></td>
				<td class="n">${m(b.total_metal_amount)}</td></tr>
			<tr><td>${__("Stones")}</td><td class="n">${m(b.total_stone_amount)}</td></tr>
			${flt(b.total_manual_amount) ? `<tr><td>${__("Manual")}</td>
				<td class="n">${m(b.total_manual_amount)}</td></tr>` : ""}
			${flt(b.gst_percent) ? `<tr><td>${__("GST {0}%", [b.gst_percent])}</td>
				<td class="n">${m(b.gst_amount)}</td></tr>` : ""}
			<tr class="g"><td>${__("Total")}</td><td class="n">${m(b.grand_total)}</td></tr></table>
		${b.narration ? `<div class="note">${esc(b.narration)}</div>` : ""}
		</div>
		<div class="sig"><div>${__("Prepared by")}</div><div>${__("Received by")}</div></div>`;

	return jwRepairBranding().then((brand) => {
		if (window.jewelima && jewelima.print_window) {
			jewelima.print_window(brand, __("Repair Bill"), body, JW_BILL_PRINT_CSS);
		} else {
			jwRepairPrint(b.name || "Repair Bill", body);      // branding bundle missing
		}
	});
};
