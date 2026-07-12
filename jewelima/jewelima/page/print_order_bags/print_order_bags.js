// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Print Order Bags — list Order Bags, filter by Location (+ customer / order),
// tick the ones you want, and print them as cards 6 per A4 page.
// Route: /app/print-order-bags

const POB_LOCATIONS = [
	"ORDERING", "CAD", "CAM", "WAX INJECTING", "TREE MAKING", "CASTING", "GRINDING",
	"FILING", "SETTING", "PRE POLISH", "WAX SETTING", "FINAL POLISH", "WAX CLEANING", "BAG EXTRACTION",
];

frappe.pages["print-order-bags"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Print Order Bags", single_column: true });
	const state = { f: {}, rows: [] };

	$(page.main).append(`
		<style>
		.pob-head{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:2px 10px;margin:2px 0 8px;}
		.pob-head .frappe-control{margin:0;}
		.pob-head .control-label{font-size:11px;margin:0 0 1px;color:var(--text-muted);}
		.pob-head .help-box{display:none !important;}
		.pob-box{border:1px solid var(--border-color);border-radius:8px;overflow:auto;max-height:calc(100vh - 220px);}
		table.pob-grid{width:100%;border-collapse:separate;border-spacing:0;font-size:12px;background:var(--fg-color);}
		table.pob-grid th{position:sticky;top:0;z-index:2;background:var(--control-bg,var(--fg-color));border-bottom:2px solid var(--gray-400,#aeb6bf);padding:5px 8px;text-align:left;white-space:nowrap;font-weight:700;}
		table.pob-grid td{border-bottom:1px solid var(--border-color);padding:4px 8px;white-space:nowrap;}
		table.pob-grid tr:hover td{background:var(--control-bg);}
		.pob-foot{margin-top:6px;color:var(--text-muted);font-size:12px;}
		</style>
		<div class="pob-head">
			<div class="pob-f-loc"></div><div class="pob-f-cust"></div><div class="pob-f-jo"></div><div class="pob-f-type"></div>
		</div>
		<div class="pob-box">
			<table class="pob-grid">
				<thead><tr>
					<th style="width:30px"><input type="checkbox" class="pob-all"></th>
					<th>Order Bag</th><th>Design</th><th>Location</th><th>Party</th><th>Type</th><th>Qty</th><th>Due</th>
				</tr></thead>
				<tbody class="pob-body"></tbody>
			</table>
		</div>
		<div class="pob-foot"><span class="pob-count">0</span> bag(s) · <span class="pob-sel">0</span> selected. Prints 6 cards per A4 page.</div>
	`);

	const mk = (sel, df) => {
		const c = frappe.ui.form.make_control({ df, parent: $(page.main).find(sel).get(0), render_input: true });
		c.refresh();
		return c;
	};
	state.f.location = mk(".pob-f-loc", { fieldtype: "Select", label: "Location", fieldname: "location", options: ["", ...POB_LOCATIONS].join("\n") });
	state.f.customer = mk(".pob-f-cust", { fieldtype: "Link", label: "Customer", fieldname: "customer", options: "Customer" });
	state.f.job_order = mk(".pob-f-jo", { fieldtype: "Link", label: "Job Order", fieldname: "job_order", options: "Job Order" });
	state.f.order_type = mk(".pob-f-type", { fieldtype: "Link", label: "Type", fieldname: "order_type", options: "Order Type" });
	// Select fires "change"; Link fields fire "awesomplete-selectcomplete" on pick
	// (and "change" on manual clear). Listen for both, let the value settle, then reload.
	Object.values(state.f).forEach((c) => {
		if (c.$input) c.$input.on("change awesomplete-selectcomplete", () => setTimeout(() => loadList(), 80));
	});

	const $body = $(page.main).find(".pob-body");

	function renderRows(rows) {
		state.rows = rows;
		$body.empty();
		rows.forEach((r) => {
			const $tr = $(`
				<tr>
					<td><input type="checkbox" class="pob-cb" data-name="${frappe.utils.escape_html(r.name)}"></td>
					<td><b>${frappe.utils.escape_html(r.name)}</b></td>
					<td>${frappe.utils.escape_html(r.design || "")}</td>
					<td>${frappe.utils.escape_html(r.location || "")}</td>
					<td>${frappe.utils.escape_html(r.customer || "")}</td>
					<td>${frappe.utils.escape_html(r.order_type || "")}</td>
					<td>${r.qty || ""}</td>
					<td>${r.due_date ? frappe.datetime.str_to_user(r.due_date) : ""}</td>
				</tr>`);
			$body.append($tr);
		});
		$(page.main).find(".pob-count").text(rows.length);
		$(page.main).find(".pob-all").prop("checked", false);
		updateSel();
	}

	function loadList() {
		const filters = { is_cad: 0 }; // CAD jobs print from the CAD Jobs page (their own card)
		const loc = state.f.location.get_value();
		const cust = state.f.customer.get_value();
		const jo = state.f.job_order.get_value();
		const tp = state.f.order_type.get_value();
		if (loc) filters.location = loc;
		if (cust) filters.customer = cust;
		if (jo) filters.job_order = jo;
		if (tp) filters.order_type = tp;
		frappe.db
			.get_list("Order Bag", {
				filters,
				fields: ["name", "design", "customer", "location", "order_type", "qty", "due_date"],
				order_by: "name asc",
				limit: 1000,
			})
			.then((rows) => renderRows(rows || []));
	}

	function selectedNames() {
		return $body.find(".pob-cb:checked").map((i, el) => $(el).data("name")).get();
	}
	function updateSel() {
		$(page.main).find(".pob-sel").text(selectedNames().length);
	}
	$(page.main).on("change", ".pob-all", function () {
		$body.find(".pob-cb").prop("checked", $(this).is(":checked"));
		updateSel();
	});
	$body.on("change", ".pob-cb", updateSel);

	page.set_primary_action(__("Print Selected (6/page)"), () => {
		const names = selectedNames();
		if (!names.length) {
			frappe.msgprint(__("Tick at least one Order Bag to print."));
			return;
		}
		frappe.call({
			method: "jewelima.jewelima.api.get_order_bag_cards",
			args: { names: JSON.stringify(names) },
		}).then((r) => printCards(r.message || []));
	}, "printer");
	page.add_inner_button(__("Refresh"), () => loadList());

	loadList();
};

// ---- print rendering: cards, 6 per A4 page ----
function printCards(cards) {
	if (!cards.length) return;
	const pages = [];
	for (let i = 0; i < cards.length; i += 6) pages.push(cards.slice(i, i + 6));
	const body = pages
		.map((group) => `<div class="page">${group.map(pob_cardHTML).join("")}</div>`)
		.join("");
	const w = window.open("", "_blank");
	if (!w) {
		frappe.msgprint(__("Allow pop-ups for this site to print."));
		return;
	}
	w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Order Bags</title><style>${POB_PRINT_CSS}</style></head><body>${body}</body></html>`);
	w.document.close();
	w.focus();
	setTimeout(() => w.print(), 350);
}

const POB_PRINT_CSS = `
@page { size: A4 portrait; margin: 6mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; }
.page { width: 198mm; height: 285mm; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: repeat(3, 1fr); gap: 3mm; page-break-after: always; }
.page:last-child { page-break-after: auto; }
.card { border: 1px solid #000; padding: 2mm 2.5mm; display: flex; flex-direction: column; overflow: hidden; font-size: 9px; line-height: 1.25; }
.card .hd { display: grid; grid-template-columns: 1.1fr 1fr 0.9fr; gap: 4px; border-bottom: 1px solid #000; padding-bottom: 1.5mm; }
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
.card .ft { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; align-items: end; border-top: 1px solid #000; padding-top: 1mm; }
.card .ft .bc svg { width: 88%; height: 9mm; }
.card .ft .num { font-size: 10px; font-weight: 700; letter-spacing: 1px; }
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
	[["DMD", "dmd"], ["PS", "ps"], ["CS", "cs"], ["CVD", "cvd"], ["PDMD", "pdmd"], ["POTH", "poth"]].forEach(([lb, b]) => {
		if (c[b + "_no"] || c[b + "_weight"]) stones.push(`${lb} ${c[b + "_no"] || 0}/${flt(c[b + "_weight"])}ct`);
	});
	return `
	<div class="card">
		<div class="hd">
			<div><b>D TYPE:</b> ${pob_esc(c.design_type)}<br><b>D NAME:</b> ${pob_esc(c.design)}<br><b>D SIZE:</b> ${pob_esc(c.size || "NA")}</div>
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
	const quiet = 10;
	let widths = "";
	codes.forEach((c) => (widths += POB_C128[c]));
	let x = quiet * module;
	let rects = "";
	for (let i = 0; i < widths.length; i++) {
		const w = parseInt(widths[i], 10) * module;
		if (i % 2 === 0) rects += `<rect x="${x}" y="0" width="${w}" height="${height}" fill="#000"/>`;
		x += w;
	}
	const total = x + quiet * module;
	return `<svg viewBox="0 0 ${total} ${height}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;
}
