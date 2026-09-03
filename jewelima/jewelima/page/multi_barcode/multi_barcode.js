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
	// Roll only — the A4 sheet is gone. This page exists to feed a label printer,
	// and a sheet of tiled tags was a second answer to a question nobody asked.
	const D = jewelima.BARCODE_DEFAULTS;
	const S = { cards: [], stoneGrams: false, showFamily: true, showColor: true, freeText: "",
		familyText: "", gwLine: D.gwLine };

	root.append(`
		<style>
		#page-multi-barcode .container{max-width:100%;}
		.mb-top{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:14px;
			border:1px solid var(--border-color);border-radius:13px;padding:13px 16px;
			background:var(--fg-color);}
		.mb-scan{min-width:290px;}
		.mb-scan .control-label{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;
			color:var(--text-muted);}
		.mb-go{background:#1f618d;border:none;color:#fff;font-weight:800;letter-spacing:.4px;
			padding:10px 28px;border-radius:9px;font-size:13.5px;cursor:pointer;
			box-shadow:0 1px 3px rgba(31,97,141,.28);transition:background .15s;}
		.mb-go:hover:not(:disabled){background:#18506f;}
		.mb-go:disabled{opacity:.4;cursor:default;}
		.mb-btn{background:none;border:1px solid var(--border-color);border-radius:8px;
			padding:8px 15px;font-size:12.5px;cursor:pointer;color:var(--text-color);}
		/* the option strip: one card, so the choices read as a set that shapes the
		   tag rather than five loose controls scattered along a toolbar */
		/* the two buttons travel together — Clear wrapping onto its own line read
		   as a stray control rather than the quiet partner of Print */
		.mb-actions{display:flex;gap:9px;align-items:center;margin-left:auto;}
		.mb-opts{display:flex;gap:14px;align-items:center;flex-wrap:wrap;
			border:1px solid var(--border-color);border-radius:11px;padding:9px 14px;
			background:var(--fg-color);}
		.mb-chk{display:flex;align-items:center;gap:7px;font-size:12.5px;margin:0;
			white-space:nowrap;cursor:pointer;user-select:none;color:var(--text-color);}
		.mb-chk input{width:15px;height:15px;cursor:pointer;margin:0;}
		.mb-free{border:1px solid var(--border-color);border-radius:8px;height:30px;
			padding:2px 10px;font-size:12.5px;width:190px;
			background:var(--control-bg);color:var(--text-color);}
		.mb-free:focus{outline:2px solid rgba(31,97,141,.35);outline-offset:1px;}
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
		/* the preview is the tag as it will come off the roll — one per row, on a
		   paper-white ground so the label reads the same in either theme */
		.mb-sheet{margin-top:16px;border:1px solid var(--border-color);border-radius:12px;
			background:#fff;padding:14px;overflow:auto;}
		.mb-sheet .bc-grid{display:grid;gap:0.06in;}
		.mb-sheet .bc-label{border:1px dashed #bbb;background:#fff;}
		.mb-cap{font-size:11px;color:var(--text-muted);margin-bottom:7px;}
		</style>
		<div class="mb-top">
			<div class="mb-scan"></div>
			<div class="mb-opts">
				<label class="mb-chk" title="${__("one carat is 0.2 g — the same weight, stated in grams")}">
					<input type="checkbox" class="mb-grams"> ${__("Stone wt in grams")}</label>
				<label class="mb-chk" title="${__("EF, GH … — printed beside the diamond line")}">
					<input type="checkbox" class="mb-fam" checked> ${__("Stone family")}</label>
				<label class="mb-chk" title="${__("YG, WG, PG — printed under the card number")}">
					<input type="checkbox" class="mb-col" checked> ${__("Gold colour")}</label>
				<input type="text" class="mb-free mb-famtext" maxlength="8" style="width:92px;"
					placeholder="${__("family")}" title="${
						__("replaces the stone family on every tag in this run — e.g. EF, GH, SI; blank = the card's own")}">
				<input type="text" class="mb-free mb-gwline" maxlength="18" style="width:130px;"
					value="${esc(D.gwLine)}" title="${
						__("the weight line; {gw} is the grams — e.g. GW:{gw} gm, G.WT {gw}")}">
				<input type="text" class="mb-free" maxlength="24"
					placeholder="${__("free line (shop name…)")}" title="${
						__("one extra line on the right of every tag in this run")}">
			</div>
			<span class="mb-actions">
				<button class="mb-go" disabled>${__("PRINT")}</button>
				<button class="mb-btn mb-clear">${__("Clear")}</button>
			</span>
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
					<td>${esc(jewelima.barcodeStoneLine(c, S.stoneGrams) || "")}</td>
					<td><span class="mb-x" title="${__("remove")}">&times;</span></td></tr>`).join("")
				+ `</tbody></table>`);
			preview();
		}
		root.find(".mb-go").prop("disabled", !S.cards.length)
			.text(S.cards.length ? __("PRINT {0} LABEL(S)", [S.cards.length]) : __("PRINT LABELS"));
		page.set_indicator(`${S.cards.length} ${__("label(s)")}`, S.cards.length ? "blue" : "gray");
	}

	// on a roll the labels come off one under the other, so the preview shows them
	// that way too rather than in an across-the-page grid that will not happen
	// ONE set of options for the preview and the printer, so what is on screen is
	// what comes off the roll
	const labelOpts = () => jewelima.barcodeOpts({
		stoneGrams: S.stoneGrams, showFamily: S.showFamily,
		showColor: S.showColor, freeText: S.freeText,
		familyText: S.familyText, gwLine: S.gwLine || D.gwLine,
	});
	const grid = () => `<div class="bc-grid" style="grid-template-columns:repeat(1, ${D.tag.w}in);">`
		+ S.cards.map((c) => jewelima.buildBarcodeLabel(c, labelOpts())).join("") + `</div>`;

	function preview() {
		root.find(".mb-preview").html(`<div class="mb-cap">${
			__("{0} label(s) — one page each, for the label roll", [S.cards.length])}</div>`
			+ `<div class="mb-sheet"><style>${jewelima.BARCODE_LABEL_CSS}</style>${grid()}</div>`);
	}

	function add(code) {
		code = (code || "").trim();
		if (!code) return;
		if (S.cards.some((c) => c.name.toUpperCase() === code.toUpperCase())) {
			return msg("warn", __("<b>{0}</b> already on the sheet.", [esc(code)]));
		}
		return frappe.call({ method: API + ".get_barcode_card", args: { order_bag: code } }).then((r) => {
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
	root.on("change", ".mb-fam", function () { S.showFamily = this.checked; paint(); });
	root.on("change", ".mb-col", function () { S.showColor = this.checked; paint(); });
	// the free line lands on every tag in this run, so the preview follows it
	// keystroke by keystroke rather than waiting for a blur
	root.on("input", ".mb-free:not(.mb-famtext):not(.mb-gwline)", function () { S.freeText = this.value.trim(); paint(); });
	// the family and the weight line are reworded for the run, and the preview follows
	root.on("input", ".mb-famtext", function () { S.familyText = this.value.trim().toUpperCase(); this.value = S.familyText; paint(); });
	root.on("input", ".mb-gwline", function () { S.gwLine = this.value; paint(); });
	// repaint on toggle, so the preview shows exactly what will come off the printer
	root.on("change", ".mb-grams", function () { S.stoneGrams = this.checked; paint(); });
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
		// Every label is its own PAGE, sized to the label, so the printer is handed
		// as many jobs as there are pieces and feeds them one at a time. Each sits
		// in a PLAIN BLOCK wrapper carrying the break: .bc-label is display:flex,
		// and break properties on a flex box are unreliable — that is why the first
		// attempt at this still came out on one sheet.
		const labels = S.cards
			.map((c) => `<div class="bc-page">`
				+ jewelima.buildBarcodeLabel(c, labelOpts())
				+ `</div>`).join("");
		doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Barcodes</title><style>
			@page{size:${D.tag.w}in ${D.tag.h}in;margin:0;}
			html,body{margin:0;padding:0;}
			${jewelima.BARCODE_LABEL_CSS}
			.bc-page{break-after:page;page-break-after:always;
				break-inside:avoid;page-break-inside:avoid;
				width:${D.tag.w}in;height:${D.tag.h}in;overflow:hidden;}
			.bc-page:last-child{break-after:auto;page-break-after:auto;}
			</style></head><body>${labels}</body></html>`);
		doc.close();
		setTimeout(() => { fr.contentWindow.focus(); fr.contentWindow.print(); }, 350);
		msg("ok", __("Sent {0} label(s) to the printer.", [S.cards.length]));
	});

	// Arriving from Bag Split, which hands over the pieces it has just cut so they
	// can be looked at before any label stock is spent. Added one at a time
	// through the same add() every scan uses, so a piece that cannot be labelled
	// says so here exactly as it would if it had been scanned.
	if (frappe.route_options && Array.isArray(frappe.route_options.cards)) {
		const pre = frappe.route_options.cards.slice();
		frappe.route_options = null;
		pre.reduce((chain, n) => chain.then(() => add(n)), Promise.resolve())
			.then(() => {
				if (S.cards.length) {
					msg("ok", __("{0} piece(s) from the split — check the tags, then print.",
						[S.cards.length]));
				}
			});
	}

	paint();
	focusScan();
	frappe.pages["multi-barcode"].on_page_show = focusScan;
};
