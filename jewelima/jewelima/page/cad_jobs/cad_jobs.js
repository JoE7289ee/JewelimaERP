// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// CAD Jobs — every Order Bag still awaiting its CAD design, with the target budgets.
// Finalize opens the shared dialog (jewelima.finalize_cad). Print produces the CAD JOB
// cards (4 per A4, QR code, big sketch space) — CAD bags are excluded from the normal
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
			<th>Gold Target</th><th class="num">DMD (ct)</th><th class="num">Pcs</th>
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
					<td>${esc(b.location || "")}</td><td>${esc(b.customer || "")}</td>
					<td>${b.due_date ? frappe.datetime.str_to_user(b.due_date) : ""}</td>
					<td><button class="btn btn-xs btn-primary cj-fin" data-i="${i}">Finalize</button></td>
				</tr>`).join("")
				: '<tr><td colspan="13" class="cj-empty">No CAD jobs pending — everything has a design. 🎉</td></tr>';
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

// ---- CAD JOB card print: 4 per A4 (2x2), QR code, bold text, big sketch space ----
const CJ_PRINT_CSS = `
@page { size: A4 portrait; margin: 8mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; }
.page { width: 194mm; height: 281mm; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 4mm; page-break-after: always; }
.page:last-child { page-break-after: auto; }
.card { border: 1.5px solid #000; padding: 4mm; display: flex; flex-direction: column; overflow: hidden; font-size: 12px; line-height: 1.45; }
.hd { display: flex; justify-content: space-between; align-items: flex-start; }
.hd img.qr { width: 24mm; height: 24mm; }
.hd .num { font-size: 15px; font-weight: 800; letter-spacing: 1px; margin-top: 1mm; }
.tag { border: 2px solid #000; padding: 1mm 3mm; font-weight: 800; font-size: 14px; letter-spacing: 2px; }
.mid { display: grid; grid-template-columns: 1fr 42mm; gap: 3mm; padding: 2.5mm 0; }
.kv div { margin-bottom: 1.6mm; font-weight: 700; }
.kv span { font-weight: 700; }
.kv .blank { display: inline-block; border-bottom: 1.5px solid #000; min-width: 34mm; }
.sketch { border: 1.5px solid #000; min-height: 40mm; display: flex; align-items: center; justify-content: center; color: #bbb; font-size: 10px; }
.bud { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 3mm; text-align: center; }
.bud .bx { border: 1.5px solid #000; padding: 2mm 1mm; }
.bud .bx .v { font-size: 15px; font-weight: 800; }
.bud .bx .k { font-size: 9px; letter-spacing: .5px; margin-top: 0.5mm; }
.rem { flex: 1 1 auto; border-top: 1.5px solid #000; margin-top: 2.5mm; padding-top: 1.5mm; font-size: 11px; }
.ft { display: flex; justify-content: space-between; border-top: 1.5px solid #000; padding-top: 1.5mm; font-size: 12px; font-weight: 700; }
`;

function cjCardHTML(c) {
	const esc = frappe.utils.escape_html;
	return `
	<div class="card">
		<div class="hd">
			<div>${c.qr ? `<img class="qr" src="${c.qr}">` : ""}<div class="num">${esc(c.name)}</div></div>
			<div class="tag">CAD JOB</div>
		</div>
		<div class="mid">
			<div class="kv">
				<div>DESIGN TYPE: <span>${esc(c.cad_design_type || "")}</span></div>
				<div>DESIGN NAME: <span class="blank">&nbsp;</span></div>
				<div>DESIGN SIZE: <span>${esc(c.size || "NA")}</span></div>
				<div>QTY: <span>${esc(String(c.qty || ""))}</span></div>
			</div>
			<div class="sketch">design</div>
		</div>
		<div class="bud">
			<div class="bx"><div class="v">${esc(c.cad_gold_weight || "—")}</div><div class="k">GOLD TARGET</div></div>
			<div class="bx"><div class="v">${flt(c.cad_diamond_weight) ? flt(c.cad_diamond_weight).toFixed(2) : "—"}${c.cad_stone_no ? " / " + c.cad_stone_no : ""}</div><div class="k">BUDGET CW (ct${c.cad_stone_no ? " / pcs" : ""})</div></div>
			<div class="bx"><div class="v">${esc(c.cad_karat || "—")}</div><div class="k">PURITY</div></div>
		</div>
		<div class="rem"><b>Remarks:</b> ${esc(c.cad_remarks || "")}${c.narration ? "<br>" + esc(c.narration) : ""}</div>
		<div class="ft"><span>${esc(c.order_date || "")}</span><span>${esc(c.customer || "")}</span><span>${esc(c.due_date || "")}</span></div>
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
