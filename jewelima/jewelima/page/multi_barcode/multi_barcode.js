// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Multi Print (Delivery > Barcode) — scan a lot, print the sheet.
//
// The difference from Print Barcode is the PAPER, not the scanning. That page
// sends one label per label-sized page, which is what a roll printer wants.
// This one lines the same labels up on an A4 sheet for a plain office printer:
// two across, as many down as fit, with cut guides.
//
// The label markup is jewelima.buildBarcodeLabel — the same one the roll printer
// uses — so a tag reads identically whichever way it was produced.
// Route: /app/multi-barcode
frappe.pages["multi-barcode"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Multi Print"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const root = $(page.main);
	const S = { cards: [], cols: 2 };

	root.append(`
		<style>
		#page-multi-barcode .container{max-width:100%;}
		.mb-top{display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin-bottom:12px;}
		.mb-scan{min-width:300px;}
		.mb-go{background:#1f618d;border:none;color:#fff;font-weight:800;letter-spacing:.4px;
			padding:9px 26px;border-radius:8px;font-size:13.5px;cursor:pointer;}
		.mb-go:disabled{opacity:.4;cursor:default;}
		.mb-btn{background:none;border:1px solid var(--border-color);border-radius:8px;
			padding:8px 15px;font-size:12.5px;cursor:pointer;color:var(--text-color);}
		.mb-cols{border:1px solid var(--border-color);border-radius:8px;height:33px;padding:2px 10px;
			font-size:12.5px;background:var(--fg-color);color:var(--text-color);}
		.mb-msg{margin:8px 0;font-size:12.5px;min-height:18px;}
		.mb-msg.ok{color:#1d7a33;} .mb-msg.err{color:#b02a2a;} .mb-msg.warn{color:#8a6d00;}
		table.mb-t{width:100%;border-collapse:collapse;font-size:12.5px;background:var(--fg-color);
			border:1px solid var(--border-color);border-radius:10px;overflow:hidden;}
		table.mb-t th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em;
			color:var(--text-muted);padding:7px 10px;border-bottom:1px solid var(--border-color);
			background:var(--control-bg);}
		table.mb-t td{padding:6px 10px;border-bottom:1px solid var(--border-color);}
		table.mb-t tbody tr:nth-child(even) td{background:rgba(128,128,128,.055);}
		table.mb-t tr:last-child td{border-bottom:none;}
		table.mb-t td.num{text-align:right;font-variant-numeric:tabular-nums;}
		.mb-x{color:#b02a2a;cursor:pointer;font-weight:800;}
		.mb-warn{color:#b02a2a;font-size:10.5px;font-weight:800;}
		.mb-none{padding:30px;text-align:center;color:var(--text-muted);}
		/* the sheet as it will print, at a readable size on screen */
		.mb-sheet{margin-top:16px;border:1px solid var(--border-color);border-radius:10px;
			background:#fff;padding:14px;overflow:auto;}
		.mb-sheet .bc-grid{display:grid;gap:0.06in;}
		.mb-sheet .bc-label{border:1px dashed #bbb;}
		.mb-cap{font-size:11px;color:var(--text-muted);margin-bottom:7px;}
		</style>
		<div class="mb-top">
			<div class="mb-scan"></div>
			<div><div style="font-size:11px;color:var(--text-muted);">${__("Across")}</div>
				<select class="mb-cols"><option value="1">1</option><option value="2" selected>2</option>
					<option value="3">3</option></select></div>
			<button class="mb-go" disabled>${__("PRINT SHEET")}</button>
			<button class="mb-btn mb-clear">${__("Clear")}</button>
		</div>
		<div class="mb-msg"></div>
		<div class="mb-body"></div>
		<div class="mb-preview"></div>
	`);

	const scan = frappe.ui.form.make_control({
		df: { fieldtype: "Data", label: __("Scan card"), fieldname: "scan",
			description: __("one piece per card — a card holding more than one is refused") },
		parent: root.find(".mb-scan").get(0), render_input: true,
	});
	scan.refresh();
	const focusScan = () => setTimeout(() => scan.$input.focus(), 30);
	const msg = (k, h) => root.find(".mb-msg").removeClass("ok err warn").addClass(k).html(h);

	function paint() {
		const b = root.find(".mb-body");
		if (!S.cards.length) {
			b.html(`<div class="mb-none">${__("Scan the pieces for this sheet.")}</div>`);
			root.find(".mb-preview").html("");
		} else {
			b.html(`<table class="mb-t"><thead><tr>
				<th style="width:40px;">#</th><th>${__("Card")}</th><th>${__("Design")}</th>
				<th class="num">${__("GW g")}</th><th>${__("Stones")}</th>
				<th style="width:34px;"></th></tr></thead><tbody>`
				+ S.cards.map((c, i) => `<tr data-n="${esc(c.name)}">
					<td>${i + 1}</td>
					<td><b>${esc(c.name)}</b>${c.actual_empty
						? ` <span class="mb-warn">${__("no actual weight")}</span>` : ""}</td>
					<td>${esc(c.design || "")}</td>
					<td class="num">${flt(c.gw).toFixed(3)}</td>
					<td>${esc(jewelima.barcodeStoneLine(c) || "")}</td>
					<td><span class="mb-x" title="${__("remove")}">&times;</span></td></tr>`).join("")
				+ `</tbody></table>`);
			preview();
		}
		root.find(".mb-go").prop("disabled", !S.cards.length)
			.text(S.cards.length ? __("PRINT SHEET ({0})", [S.cards.length]) : __("PRINT SHEET"));
		page.set_indicator(`${S.cards.length} ${__("label(s)")}`, S.cards.length ? "blue" : "gray");
	}

	const grid = () => `<div class="bc-grid" style="grid-template-columns:repeat(${S.cols}, 3.3in);">`
		+ S.cards.map((c) => jewelima.buildBarcodeLabel(c)).join("") + `</div>`;

	function preview() {
		root.find(".mb-preview").html(`<div class="mb-cap">${
			__("{0} label(s), {1} across", [S.cards.length, S.cols])}</div>`
			+ `<div class="mb-sheet"><style>${jewelima.BARCODE_LABEL_CSS}</style>${grid()}</div>`);
	}

	function add(code) {
		code = (code || "").trim();
		if (!code) return;
		if (S.cards.some((c) => c.name.toUpperCase() === code.toUpperCase())) {
			return msg("warn", __("<b>{0}</b> already on the sheet.", [esc(code)]));
		}
		frappe.call({ method: API + ".get_barcode_card", args: { order_bag: code } }).then((r) => {
			const c = r.message;
			if (!c || c.error) return msg("err", esc((c && c.error) || __("No card {0}.", [code])));
			S.cards.push(c);
			paint();
			msg(c.actual_empty ? "warn" : "ok",
				c.actual_empty
					? __("Added <b>{0}</b> — it has no actual weight.", [esc(c.name)])
					: __("Added <b>{0}</b> · {1} on the sheet.", [esc(c.name), S.cards.length]));
		});
	}

	scan.$input.on("keydown", (e) => {
		if (e.which !== 13 && e.key !== "Enter") return;
		e.preventDefault();
		const v = scan.$input.val();
		scan.set_value("");
		add(v);
		focusScan();
	});
	root.on("click", ".mb-x", function () {
		S.cards = S.cards.filter((c) => c.name !== $(this).closest("tr").data("n"));
		paint();
	});
	root.on("change", ".mb-cols", function () { S.cols = parseInt(this.value, 10) || 2; paint(); });
	root.on("click", ".mb-clear", () => { S.cards = []; msg("", ""); paint(); focusScan(); });

	root.on("click", ".mb-go", () => {
		if (!S.cards.length) return;
		// printed through a hidden iframe, like the job cards — no pop-up to block
		document.getElementById("jw-mb-frame")?.remove();
		const fr = document.createElement("iframe");
		fr.id = "jw-mb-frame";
		fr.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
		document.body.appendChild(fr);
		const doc = fr.contentDocument;
		doc.open();
		doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Barcodes</title><style>
			@page{size:A4 portrait;margin:8mm;}
			html,body{margin:0;padding:0;}
			${jewelima.BARCODE_LABEL_CSS}
			.bc-grid{display:grid;grid-template-columns:repeat(${S.cols}, 3.3in);gap:0.06in;}
			.bc-label{border:1px dashed #ccc;}   /* a line to cut along */
			</style></head><body>${grid()}</body></html>`);
		doc.close();
		setTimeout(() => { fr.contentWindow.focus(); fr.contentWindow.print(); }, 350);
		msg("ok", __("Sent {0} label(s) to the printer.", [S.cards.length]));
	});

	paint();
	focusScan();
	frappe.pages["multi-barcode"].on_page_show = focusScan;
};
