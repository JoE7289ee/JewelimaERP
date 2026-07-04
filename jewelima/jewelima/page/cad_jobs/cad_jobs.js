// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// CAD Jobs — every Order Bag still awaiting its CAD design, with the target budgets.
// Finalize opens the shared dialog (jewelima.finalize_cad). Print produces the CAD JOB
// cards (4 per A4, Code-128 barcode, big sketch space) — CAD bags are excluded from the normal
// Print Order Bags page to avoid confusion. Route: /app/cad-jobs

frappe.pages["cad-jobs"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "CAD Jobs", single_column: true });
	let rows = [];

	$(page.main).append(`
		<style>
		.cj-box{border:1px solid var(--border-color);border-radius:8px;overflow:auto;max-height:calc(100vh - 180px);}
		table.cj-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;background:var(--fg-color);}
		table.cj-tbl th{position:sticky;top:0;z-index:1;background:var(--control-bg,var(--fg-color));border-bottom:2px solid var(--gray-400,#aeb6bf);padding:7px 10px;text-align:left;font-weight:700;white-space:nowrap;}
		table.cj-tbl td{border-bottom:1px solid var(--border-color);padding:6px 10px;vertical-align:middle;}
		table.cj-tbl td.num,table.cj-tbl th.num{text-align:right;font-variant-numeric:tabular-nums;}
		table.cj-tbl input.cj-cb{width:15px;height:15px;cursor:pointer;}
		.cj-rm{color:var(--text-muted);font-size:11.5px;display:block;max-width:260px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
		.cj-empty{padding:22px;text-align:center;color:var(--text-muted);}
		.cj-count{color:var(--text-muted);font-size:12px;margin:0 0 8px;display:block;}
		</style>
		<span class="cj-count"></span>
		<div class="cj-box"><table class="cj-tbl">
			<thead><tr><th style="width:34px"><input type="checkbox" class="cj-all cj-cb"></th>
			<th>Order Bag</th><th>Type</th><th>Size</th><th>Qty</th><th>Purity</th>
			<th>Gold Target</th><th class="num">DMD (ct)</th><th class="num">Pcs</th><th>Ref</th>
			<th>Location</th><th>Customer</th><th>Due</th><th style="width:90px"></th></tr></thead>
			<tbody class="cj-body"></tbody>
		</table></div>
	`);

	const esc = frappe.utils.escape_html;

	function load() {
		frappe.call({ method: "jewelima.jewelima.api.get_cad_jobs" }).then((r) => {
			rows = r.message || [];
			$(page.main).find(".cj-count").text(`${rows.length} CAD job(s) awaiting a design`);
			const body = $(page.main).find(".cj-body")[0];
			body.innerHTML = rows.length
				? rows.map((b, i) => `<tr>
					<td><input type="checkbox" class="cj-cb cj-pick" data-i="${i}"></td>
					<td><b>${esc(b.name)}</b>${b.cad_remarks ? `<span class="cj-rm" title="${esc(b.cad_remarks)}">${esc(b.cad_remarks)}</span>` : ""}</td>
					<td>${esc(b.cad_design_type || "")}</td><td>${esc(b.size || "")}</td><td>${b.qty || ""}</td>
					<td>${esc(b.cad_karat || "")}</td>
					<td>${esc(b.cad_gold_weight || "")}</td>
					<td class="num">${flt(b.cad_diamond_weight) ? flt(b.cad_diamond_weight).toFixed(2) : ""}</td>
					<td class="num">${b.cad_stone_no || ""}</td>
					<td>${esc(b.cad_reference || "")}</td>
					<td>${esc(b.location || "")}</td><td>${esc(b.customer || "")}</td>
					<td>${b.due_date ? frappe.datetime.str_to_user(b.due_date) : ""}</td>
					<td><button class="btn btn-xs btn-primary cj-fin" data-i="${i}">Finalize</button></td>
				</tr>`).join("")
				: '<tr><td colspan="14" class="cj-empty">No CAD jobs pending — everything has a design. 🎉</td></tr>';
			body.querySelectorAll(".cj-fin").forEach((btn) => {
				btn.addEventListener("click", () => jewelima.finalize_cad(rows[+btn.getAttribute("data-i")].name, load));
			});
		});
	}
	$(page.main).on("change", ".cj-all", function () {
		$(page.main).find(".cj-pick").prop("checked", $(this).is(":checked"));
	});

	function printSelected() {
		const picked = $(page.main).find(".cj-pick:checked").map((i, el) => rows[+el.getAttribute("data-i")].name).get();
		const names = picked.length ? picked : rows.map((b) => b.name); // none ticked -> print all
		if (!names.length) return frappe.msgprint(__("No CAD jobs to print."));
		frappe.call({ method: "jewelima.jewelima.api.get_order_bag_cards", args: { names: JSON.stringify(names) } })
			.then((r) => cjPrint((r.message || []).filter((c) => c.is_cad)));
	}

	page.set_primary_action(__("Print Cards (4/page)"), printSelected, "printer");
	page.add_inner_button(__("Refresh"), load);
	load();
};

// ---- CAD JOB card print: 4 per A4 (2x2), barcode, bold text, big sketch space ----
const CJ_PRINT_CSS = `
@page { size: A4 portrait; margin: 8mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; }
.page { width: 194mm; height: 281mm; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 4mm; page-break-after: always; }
.page:last-child { page-break-after: auto; }
.card { border: 1.5px solid #000; padding: 4mm; display: flex; flex-direction: column; overflow: hidden; font-size: 12px; line-height: 1.45; }
.hd { display: flex; justify-content: space-between; align-items: flex-start; }
.hd .bc svg { width: 42mm; height: 11mm; }
.hd .num { font-size: 12px; font-weight: 700; letter-spacing: 1px; margin-top: 0.5mm; }
.tag { border: 2px solid #000; padding: 1mm 3mm; font-weight: 800; font-size: 14px; letter-spacing: 2px; }
.mid { display: grid; grid-template-columns: 1fr 1.1fr; gap: 3mm; padding: 2.5mm 0; flex: 1 1 auto; min-height: 0; }
.kv div { margin-bottom: 1.8mm; }
.kv .lb { font-weight: 400; }
.kv span.val { font-weight: 800; font-size: 13px; }
.kv .blank { display: inline-block; border-bottom: 1.5px solid #000; min-width: 34mm; }
.sketch { border: 1.5px solid #000; height: 100%; min-height: 55mm; display: flex; align-items: center; justify-content: center; color: #bbb; font-size: 10px; overflow: hidden; }
.sketch img { max-width: 100%; max-height: 100%; object-fit: contain; }
.bud { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 3mm; text-align: center; }
.bud .bx { border: 1.5px solid #000; padding: 2mm 1mm; }
.bud .bx .v { font-size: 15px; font-weight: 800; }
.bud .bx .k { font-size: 9px; letter-spacing: .5px; margin-top: 0.5mm; }
.rem { border-top: 1.5px solid #000; margin-top: 2.5mm; padding-top: 1.5mm; font-size: 13px; min-height: 14mm; }
.ft { display: flex; justify-content: space-between; border-top: 1.5px solid #000; padding-top: 1.5mm; text-align: center; }
.ft .v { font-size: 12px; font-weight: 700; display: block; }
.ft .l { font-size: 8.5px; color: #555; display: block; letter-spacing: .5px; }
`;

function pobSafe(u) { return encodeURI(u || ""); }

function cjCardHTML(c) {
	const esc = frappe.utils.escape_html;
	return `
	<div class="card">
		<div class="hd">
			<div class="bc">${cjBarcodeSVG(c.name)}<div class="num">${esc(c.name)}</div></div>
			<div class="tag">CAD JOB</div>
		</div>
		<div class="mid">
			<div class="kv">
				<div><span class="lb">D TYPE:</span> <span class="val">${esc(c.cad_design_type || "")}</span></div>
				<div><span class="lb">D NAME:</span> <span class="blank">&nbsp;</span></div>
				<div><span class="lb">D SIZE:</span> <span class="val">${esc(c.size || "NA")}</span></div>
				<div><span class="lb">QTY:</span> <span class="val">${esc(String(c.qty || ""))}</span></div>
				<div><span class="lb">REF:</span> <span class="val">${esc(c.cad_reference || "")}</span></div>
			</div>
			<div class="sketch">${c.image ? `<img src="${pobSafe(c.image)}">` : "D IMAGE"}</div>
		</div>
		<div class="bud">
			<div class="bx"><div class="v">${esc(c.cad_gold_weight || "—")}</div><div class="k">GOLD TARGET</div></div>
			<div class="bx"><div class="v">${flt(c.cad_diamond_weight) ? flt(c.cad_diamond_weight).toFixed(2) : "—"}${c.cad_stone_no ? " / " + c.cad_stone_no : ""}</div><div class="k">BUDGET CW (ct${c.cad_stone_no ? " / pcs" : ""})</div></div>
			<div class="bx"><div class="v">${esc(c.cad_karat || "—")}</div><div class="k">PURITY</div></div>
		</div>
		<div class="rem"><b>Remarks:</b> ${esc(c.cad_remarks || "")}${c.narration ? "<br>" + esc(c.narration) : ""}</div>
		<div class="ft">
			<span><span class="v">${esc(c.order_date || "")}</span><span class="l">order</span></span>
			<span><span class="v">${esc(c.customer || "")}</span></span>
			<span><span class="v">${esc(c.due_date || "")}</span><span class="l">due</span></span>
		</div>
	</div>`;
}

function cjPrint(cards) {
	if (!cards.length) return frappe.msgprint(__("Nothing to print."));
	const pages = [];
	for (let i = 0; i < cards.length; i += 4) pages.push(cards.slice(i, i + 4));
	const body = pages.map((g) => `<div class="page">${g.map(cjCardHTML).join("")}</div>`).join("");
	const w = window.open("", "_blank");
	if (!w) return frappe.msgprint(__("Allow pop-ups for this site to print."));
	w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>CAD Jobs</title><style>${CJ_PRINT_CSS}</style></head><body>${body}</body></html>`);
	w.document.close();
	w.focus();
	setTimeout(() => w.print(), 400);
}


// ---- self-contained Code 128-B barcode (offline, no deps) ----
const CJ_C128 = [
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

function cjBarcodeSVG(text, module = 1.0, height = 42) {
	text = String(text || "");
	const codes = [104]; // Start B
	for (let i = 0; i < text.length; i++) codes.push(text.charCodeAt(i) - 32);
	let sum = 104;
	for (let i = 1; i < codes.length; i++) sum += codes[i] * i;
	codes.push(sum % 103, 106); // checksum + stop
	let x = 0;
	const bars = [];
	codes.forEach((c) => {
		const pat = CJ_C128[c];
		for (let i = 0; i < pat.length; i++) {
			const w = +pat[i] * module;
			if (i % 2 === 0) bars.push(`<rect x="${x}" y="0" width="${w}" height="${height}"/>`);
			x += w;
		}
	});
	return `<svg viewBox="0 0 ${x} ${height}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${bars.join("")}</svg>`;
}
