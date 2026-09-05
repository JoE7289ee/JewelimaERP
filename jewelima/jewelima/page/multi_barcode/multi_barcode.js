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
	// the tag's own size comes from the SAVED layout when there is one — the print
	// CSS below sizes the page from it, and reading the shipped default there is
	// what made a printed sheet disagree with the preview
	const TAG = () => (jewelima.barcodeOpts().tag) || D.tag;
	// measuring the tag is a manager's job: these numbers are the floor's, not
	// one operator's, and everything printed anywhere picks them up
	const CAN_LAYOUT = ["System Manager", "JW Manager"].some((r) => frappe.user_roles.includes(r));
	const IN = 96;                       // CSS pixels per inch at 100% zoom
	const S = { cards: [], stoneGrams: false, showFamily: true, showColor: true, freeText: "",
		freeText2: "", familyText: "", gwLine: D.gwLine };

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
				<input type="text" class="mb-free mb-free2" maxlength="2" style="width:52px;text-align:center;"
					placeholder="${__("2")}" title="${
						__("a two-character mark on every tag in this run — a counter, a tray, a batch. Place it under Tag layout.")}">
			</div>
			<span class="mb-actions">
				${CAN_LAYOUT ? `<button class="mb-btn mb-layout">${__("Tag layout…")}</button>` : ""}
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
		showColor: S.showColor, freeText: S.freeText, freeText2: S.freeText2,
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
	root.on("input", ".mb-free:not(.mb-famtext):not(.mb-gwline):not(.mb-free2)", function () { S.freeText = this.value.trim(); paint(); });
	// two characters, upper case: it is a mark, not a sentence
	root.on("input", ".mb-free2", function () {
		S.freeText2 = (this.value || "").trim().toUpperCase().slice(0, 2);
		this.value = S.freeText2;
		paint();
	});
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
			@page{size:${TAG().w}in ${TAG().h}in;margin:0;}
			html,body{margin:0;padding:0;}
			${jewelima.BARCODE_LABEL_CSS}
			.bc-page{break-after:page;page-break-after:always;
				break-inside:avoid;page-break-inside:avoid;
				width:${TAG().w}in;height:${TAG().h}in;overflow:hidden;}
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


	// ------------------------------------------------------------------------
	// Tag layout — what used to be the Tag Canvas page, now a dialog HERE.
	//
	// It belongs beside the printer. On its own page it measured the tag against
	// its own idea of the run: the family, the colour, the grams toggle were all
	// whatever the canvas happened to have, so a layout that looked right there
	// printed differently from this page with different boxes ticked. Inside the
	// dialog the preview is built from THIS page's options and THIS page's first
	// card, so what is being adjusted is the tag that is about to come out.
	// ------------------------------------------------------------------------
	const LINES = [
		{ k: "gw", box: "A", label: __("GW line") },
		{ k: "stone", box: "A", label: __("Stone line") },
		{ k: "dia", box: "A", label: __("Stone weight") },
		{ k: "family", box: "A", label: __("Stone family") },
		{ k: "type", box: "B", label: __("Party + colour") },
		{ k: "design", box: "B", label: __("Design") },
		{ k: "card", box: "B", label: __("Card number") },
		{ k: "free", box: "B", label: __("Free text") },
		{ k: "free2", box: "B", label: __("Free text 2") },
	];
	// a stand-in so the dialog is useful before anything is scanned. The code
	// square is a plain black frame at the real size: truthful, because the square
	// is the biggest thing on the tag and calibrating against text would mislead.
	const QR_STUB = "data:image/svg+xml;utf8," + encodeURIComponent(
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">'
		+ '<rect width="40" height="40" fill="#fff" stroke="#000" stroke-width="2"/>'
		+ '<rect x="6" y="6" width="10" height="10" fill="#000"/>'
		+ '<rect x="24" y="6" width="10" height="10" fill="#000"/>'
		+ '<rect x="6" y="24" width="10" height="10" fill="#000"/>'
		+ '<rect x="24" y="26" width="6" height="6" fill="#000"/></svg>');
	const SAMPLE = { name: "E0001.1.1", design: "A13010NP-18EF-Y", design_no: "A 13010",
		design_type: "NOSEPIN", party: "JOS TRICHUR", gw: 2.487, dmd_no: 12, dmd_wt: 0.108,
		stone_family: "EF", gold_color: "YG", qr: QR_STUB };

	function showLayout() {
		if (!CAN_LAYOUT) return;
		// the saved layout may still be in flight; opening on the shipped defaults
		// and pressing Save would publish those defaults over the floor's own
		// measurements, so wait for it
		if (!jewelima.BARCODE_LAYOUT && (jewelima._layoutLoad || jewelima.BARCODE_LAYOUT_ERROR)) {
			frappe.dom.freeze(__("Loading the saved layout…"));
			// a failed load is retried here rather than opening on the shipped
			// defaults as though they were what the floor saved
			return Promise.resolve(jewelima.loadBarcodeLayout(!!jewelima.BARCODE_LAYOUT_ERROR))
				.then(() => { frappe.dom.unfreeze(); if (jewelima.BARCODE_LAYOUT_ERROR) {
					frappe.msgprint(__("The saved layout could not be loaded, so this would open on the shipped defaults. Reload the page and try again."));
				} else openLayout(); })
				.catch(() => frappe.dom.unfreeze());
		}
		openLayout();
	}

	function openLayout() {
		const base = jewelima.barcodeOpts();     // saved layout over the shipped defaults
		// what Reset goes back to: the layout the floor is actually using, not the
		// numbers that happened to ship
		const SAVED = JSON.parse(JSON.stringify({
			tagW: base.tag.w, tagH: base.tag.h, pt: flt(base.pt) || D.pt, qr: flt(base.qr) || D.qr,
			a: base.a, b: base.b, lines: base.lines,
			splitStone: !!base.splitStone, splitFamily: !!base.splitFamily,
		}));
		const L = {
			tagW: base.tag.w, tagH: base.tag.h,
			pt: flt(base.pt) || D.pt, qr: flt(base.qr) || D.qr,
			a: Object.assign({}, base.a), b: Object.assign({}, base.b),
			lines: JSON.parse(JSON.stringify(base.lines || {})),
			splitStone: !!base.splitStone, splitFamily: !!base.splitFamily,
		};
		// THIS page's card and THIS page's options — that is the whole point
		const card = S.cards[0] || SAMPLE;

		// the title says WHICH layout this is, so saved-vs-shipped is never a guess
		const meta = jewelima.BARCODE_LAYOUT_META;
		const source = jewelima.BARCODE_LAYOUT
			? (meta && meta.saved_on
				? __("saved {0} by {1}", [frappe.datetime.str_to_user(meta.saved_on), meta.saved_by || "?"])
				: __("saved layout"))
			: __("SHIPPED DEFAULTS — nothing saved yet");
		const dlg = new frappe.ui.Dialog({
			title: __("Tag layout · {0}", [source]), size: "extra-large",
			primary_action_label: __("Save layout"),
			primary_action() {
				const payload = {
					pt: L.pt, qr: L.qr, tag: { w: L.tagW, h: L.tagH }, a: L.a, b: L.b,
					lines: L.lines, splitStone: L.splitStone, splitFamily: L.splitFamily,
				};
				frappe.call({ method: API + ".save_barcode_layout",
					args: { layout: JSON.stringify(payload) } })
					.then(() => {
						jewelima.BARCODE_LAYOUT = payload;
						jewelima.BARCODE_LAYOUT_META = { saved_on: frappe.datetime.now_datetime(),
							saved_by: frappe.session.user_fullname || frappe.session.user };
						dlg.hide();
						paint();      // the sheet below redraws on the new geometry
						frappe.show_alert({ indicator: "green", message:
							__("Layout saved — every page that prints a tag uses it now.") }, 6);
					});
			},
			secondary_action_label: __("Reset"),
			secondary_action() {
				Object.assign(L, JSON.parse(JSON.stringify(SAVED)));
				draw();
				frappe.show_alert({ indicator: "blue",
					message: __("Back to the saved layout.") }, 4);
			},
		});
		const $b = $(dlg.body);
		$b.html(`
			<style>
			.tl-cols{display:grid;grid-template-columns:minmax(0,1fr) 400px;gap:16px;align-items:start;}
			.tl-stage{background:var(--fg-color);border:1px solid var(--border-color);
				border-radius:10px;padding:22px;overflow:auto;}
			.tl-tag{position:relative;background:#fff;border:1px solid #b9c2cc;
				box-shadow:0 1px 3px rgba(0,0,0,.10);margin:0 auto;}
			.tl-live{position:absolute;inset:0;overflow:hidden;}
			.tl-live .bc-label{border:0;}
			.tl-rect{position:absolute;box-sizing:border-box;cursor:move;
				font:700 8px/1 Arial,sans-serif;letter-spacing:.06em;user-select:none;}
			.tl-rect .tag-l{position:absolute;top:-1px;left:-1px;padding:0 3px;
				background:currentColor;color:#fff;font-size:7.5px;line-height:1.5;}
			.tl-rect.a{border:1px dashed #1f618d;background:rgba(31,97,141,.07);color:#1f618d;}
			.tl-rect.b{border:1px dashed #b35a00;background:rgba(179,90,0,.07);color:#b35a00;}
			.tl-rect.clip{border-style:solid;border-width:2px;background:rgba(176,42,42,.13);}
			.tl-rect .hd{position:absolute;right:-4px;bottom:-4px;width:9px;height:9px;
				background:var(--fg-color);border:1px solid currentColor;cursor:nwse-resize;}
			.tl-rect.on{box-shadow:0 0 0 2px rgba(31,97,141,.35);}
			.tl-clip{font-size:12.5px;font-weight:700;color:#b02a2a;margin-top:9px;min-height:18px;}
			.tl-card{border:1px solid var(--border-color);border-radius:9px;padding:10px 12px;
				background:var(--fg-color);margin-bottom:10px;}
			.tl-card h4{margin:0 0 8px;font-size:10.5px;text-transform:uppercase;
				letter-spacing:.06em;color:var(--text-muted);}
			.tl-row{display:flex;align-items:center;gap:7px;margin-bottom:5px;font-size:12.5px;}
			.tl-row label{width:70px;color:var(--text-muted);}
			.tl-row input{width:78px;border:1px solid var(--border-color);border-radius:6px;
				padding:3px 7px;text-align:right;background:var(--control-bg);color:var(--text-color);}
			.tl-row .u{color:var(--text-muted);font-size:11px;}
			.tl-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
			.tl-splits{display:flex;gap:16px;font-size:12.5px;color:var(--text-muted);margin:2px 0 9px;}
			table.tl-lines{width:100%;border-collapse:collapse;font-size:12.5px;}
			table.tl-lines th{text-align:left;font-size:9.5px;text-transform:uppercase;
				letter-spacing:.05em;color:var(--text-muted);padding:4px 6px;
				border-bottom:1px solid var(--border-color);}
			table.tl-lines td{padding:3px 6px;border-bottom:1px solid var(--border-color);}
			table.tl-lines td.bx{font-weight:800;color:var(--text-muted);}
			table.tl-lines input{width:64px;border:1px solid var(--border-color);border-radius:6px;
				padding:3px 6px;text-align:right;background:var(--control-bg);color:var(--text-color);}
			.tl-al{border:1px solid var(--border-color);background:var(--control-bg);
				color:var(--text-color);border-radius:6px;width:28px;height:25px;cursor:pointer;
				font-size:12px;line-height:1;}
			.tl-al + .tl-al{margin-left:3px;}
			.tl-al.on{background:#1f618d;border-color:#1f618d;color:#fff;font-weight:800;}
			</style>
			<div class="tl-cols">
				<div>
					<div class="tl-stage"><div class="tl-tag">
						<div class="tl-live"></div>
						<div class="tl-rect a" data-k="a"><span class="tag-l">A</span><div class="hd"></div></div>
						<div class="tl-rect b" data-k="b"><span class="tag-l">B</span><div class="hd"></div></div>
					</div></div>
					<div class="tl-clip"></div>
					<div class="tl-splits">
						<label><input type="checkbox" class="tl-split"> ${__("stone weight on its own line")}</label>
						<label><input type="checkbox" class="tl-splitfam"> ${__("family on its own line")}</label>
						<label>${__("FREE TEXT")}
							<input type="text" class="tl-ft" maxlength="24" style="width:130px;"></label>
						<label>${__("FREE TEXT 2")}
							<input type="text" class="tl-ft2" maxlength="2" style="width:42px;text-align:center;"></label>
					</div>
					<table class="tl-lines"><thead><tr>
						<th>${__("Line")}</th><th>${__("Box")}</th><th>${__("Align")}</th>
						<th>${__("Size")}</th><th>${__("Nudge X")}</th><th>${__("Nudge Y")}</th>
					</tr></thead><tbody>${LINES.map((l) => `<tr data-k="${l.k}">
						<td>${l.label}</td><td class="bx">${l.box}</td>
						<td>${["left", "center", "right"].map((a) =>
							`<button class="tl-al" data-a="${a}">${
								{ left: "←", center: "↔", right: "→" }[a]}</button>`).join("")}</td>
						<td><input type="number" step="0.5" min="0" max="16" data-l="pt" placeholder="${__("auto")}"></td>
						<td><input type="number" step="0.005" data-l="dx"></td>
						<td><input type="number" step="0.005" data-l="dy"></td>
					</tr>`).join("")}</tbody></table>
				</div>
				<div>
					<div class="tl-card"><h4>${__("Tag & type")}</h4>
						<div class="tl-row"><label>${__("Width")}</label>
							<input type="number" step="0.01" data-f="tagW"> <span class="u">in</span></div>
						<div class="tl-row"><label>${__("Height")}</label>
							<input type="number" step="0.005" data-f="tagH"> <span class="u">in</span></div>
						<div class="tl-row"><label>${__("Type size")}</label>
							<input type="number" step="0.5" min="6" max="14" data-f="pt"> <span class="u">pt</span></div>
						<div class="tl-row"><label>${__("Code square")}</label>
							<input type="number" step="0.01" data-f="qr"> <span class="u">in</span></div>
					</div>
					<div class="tl-grid">
						<div class="tl-card"><h4>${__("A — weights & code")}</h4>
							${["x", "y", "w", "h"].map((f) => `<div class="tl-row">
								<label>${{ x: __("Left"), y: __("Top"), w: __("Width"), h: __("Height") }[f]}</label>
								<input type="number" step="0.01" data-f="a.${f}"></div>`).join("")}
						</div>
						<div class="tl-card"><h4>${__("B — design & codes")}</h4>
							${["x", "y", "w", "h"].map((f) => `<div class="tl-row">
								<label>${{ x: __("Left"), y: __("Top"), w: __("Width"), h: __("Height") }[f]}</label>
								<input type="number" step="0.01" data-f="b.${f}"></div>`).join("")}
						</div>
					</div>
					<button class="btn btn-sm btn-default tl-print" style="width:100%;margin-bottom:10px;">${
						__("Print a test tag (this layout, not saved)")}</button>
					<div style="font-size:12px;color:var(--text-muted);">${
						__("Drag a box or type inches. Arrow keys nudge the picked box by 0.005in, shift for 0.05in. The tag shows {0} with this run's options.",
							[S.cards.length ? card.name : __("a sample card")])}</div>
				</div>
			</div>`);

		const get = (path) => path.split(".").reduce((o, k) => o[k], L);
		const set = (path, v) => {
			const ks = path.split("."), last = ks.pop();
			ks.reduce((o, k) => o[k], L)[last] = v;
		};
		// the run's own wording rides along, so the preview is this sheet's tag
		const dopts = () => jewelima.barcodeOpts({
			pt: L.pt, qr: L.qr, tag: { w: L.tagW, h: L.tagH }, a: L.a, b: L.b,
			lines: L.lines, splitStone: L.splitStone, splitFamily: L.splitFamily,
			offsetA: 0, offsetB: 0,
			stoneGrams: S.stoneGrams, showFamily: S.showFamily, showColor: S.showColor,
			freeText: S.freeText, freeText2: S.freeText2,
			familyText: S.familyText, gwLine: S.gwLine || D.gwLine,
		});

		function draw() {
			$b.find(".tl-tag").css({ width: L.tagW * IN + "px", height: L.tagH * IN + "px" });
			$b.find(".tl-live").html(`<style>${jewelima.BARCODE_LABEL_CSS}</style>`
				+ jewelima.buildBarcodeLabel(card, dopts()));
			["a", "b"].forEach((k) => $b.find(`.tl-rect.${k}`).css({
				left: L[k].x * IN + "px", top: L[k].y * IN + "px",
				width: L[k].w * IN + "px", height: L[k].h * IN + "px",
			}));
			// does the content actually FIT? that is the whole reason to look at a
			// real label instead of two empty rectangles
			const clipped = [];
			["a", "b"].forEach((k) => {
				const el = $b.find(`.tl-live .bc-${k}`).get(0);
				const off = el && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
				$b.find(`.tl-rect.${k}`).toggleClass("clip", !!off);
				if (off) clipped.push(k.toUpperCase());
			});
			const over = L.a.x + L.a.w > L.tagW + 0.001 || L.b.x + L.b.w > L.tagW + 0.001
				|| L.a.y + L.a.h > L.tagH + 0.001 || L.b.y + L.b.h > L.tagH + 0.001;
			$b.find(".tl-clip").text([
				clipped.length === 1
					? __("Box {0} clips its content — widen it or drop the type size.", [clipped[0]])
					: clipped.length
						? __("Boxes {0} clip their content — widen them or drop the type size.",
							[clipped.join(" & ")]) : "",
				over ? __("A box runs off the tag.") : "",
			].filter(Boolean).join("  "));
			$b.find("input[data-f]").each(function () {
				if (document.activeElement === this) return;   // never fight the typist
				this.value = (+get(this.dataset.f)).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
			});
			$b.find(".tl-lines tr[data-k]").each(function () {
				const v = L.lines[this.dataset.k] || {};
				$(this).find(".tl-al").each(function () {
					$(this).toggleClass("on", (v.align || "left") === this.dataset.a);
				});
				$(this).find("input[data-l]").each(function () {
					if (document.activeElement === this) return;
					const n = +v[this.dataset.l] || 0;
					this.value = n ? String(+n.toFixed(3)) : "";
				});
			});
			$b.find(".tl-split").prop("checked", L.splitStone);
			$b.find(".tl-splitfam").prop("checked", L.splitFamily);
			[[".tl-ft", "freeText"], [".tl-ft2", "freeText2"]].forEach(([sel, key]) => {
				const el = $b.find(sel)[0];
				if (el && document.activeElement !== el) el.value = S[key] || "";
			});
			// a line with no text does not render, so its row cannot be placed —
			// say that rather than letting the controls look broken
			[["free", "freeText"], ["free2", "freeText2"]].forEach(([k, key]) => {
				$b.find(`tr[data-k="${k}"]`).css("opacity", S[key] ? "" : ".45")
					.attr("title", S[key] ? "" : __("type this line's text to place it"));
			});
		}

		// printed through a hidden iframe, like the sheet itself — and sized from the
		// WORKING numbers, so a trial layout can meet real stock before anyone else
		// is made to print on it
		$b.on("click", ".tl-print", function () {
			document.getElementById("jw-tl-frame")?.remove();
			const fr = document.createElement("iframe");
			fr.id = "jw-tl-frame";
			fr.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
			document.body.appendChild(fr);
			const doc = fr.contentDocument;
			doc.open();
			doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Tag layout</title><style>
				@page{size:${L.tagW}in ${L.tagH}in;margin:0;}
				html,body{margin:0;padding:0;}
				${jewelima.BARCODE_LABEL_CSS}
				</style></head><body>${jewelima.buildBarcodeLabel(card, dopts())}</body></html>`);
			doc.close();
			setTimeout(() => { fr.contentWindow.focus(); fr.contentWindow.print(); }, 300);
			frappe.show_alert({ indicator: "green",
				message: __("Sent one test tag — {0} — at the layout on screen.", [card.name]) }, 5);
		});

		let drag = null;
		$b.on("mousedown", ".tl-rect", function (e) {
			$b.find(".tl-rect").removeClass("on");
			$(this).addClass("on");
			drag = { k: this.dataset.k, mode: $(e.target).hasClass("hd") ? "size" : "move",
				x0: e.clientX, y0: e.clientY, s: Object.assign({}, L[this.dataset.k]) };
			e.preventDefault();
		});
		// bound to the document because a drag leaves the box; cleared when the
		// dialog goes, so a second open does not stack a second set
		const onMove = (e) => {
			if (!drag) return;
			const dx = (e.clientX - drag.x0) / IN, dy = (e.clientY - drag.y0) / IN;
			const r = L[drag.k], o = drag.s, snap = (v) => Math.round(v * 200) / 200;
			if (drag.mode === "move") { r.x = snap(o.x + dx); r.y = snap(o.y + dy); }
			else { r.w = Math.max(0.05, snap(o.w + dx)); r.h = Math.max(0.05, snap(o.h + dy)); }
			draw();
		};
		const onUp = () => { drag = null; };
		$(document).on("mousemove.tlayout", onMove).on("mouseup.tlayout", onUp);
		dlg.onhide = () => $(document).off(".tlayout");

		$b.on("input", "input[data-f]", function () {
			const v = parseFloat(this.value);
			if (!isNaN(v)) { set(this.dataset.f, v); draw(); }
		});
		$b.on("click", ".tl-al", function () {
			const k = $(this).closest("tr").data("k");
			(L.lines[k] = L.lines[k] || {}).align = this.dataset.a;
			draw();
		});
		$b.on("input", ".tl-lines input[data-l]", function () {
			const k = $(this).closest("tr").data("k");
			(L.lines[k] = L.lines[k] || {})[this.dataset.l] = parseFloat(this.value) || 0;
			draw();
		});
		$b.on("input", ".tl-ft", function () {
			S.freeText = this.value.trim();
			root.find(".mb-free:not(.mb-famtext):not(.mb-gwline):not(.mb-free2)").val(S.freeText);
			draw();
		});
		$b.on("input", ".tl-ft2", function () {
			S.freeText2 = (this.value || "").trim().toUpperCase().slice(0, 2);
			this.value = S.freeText2;
			root.find(".mb-free2").val(S.freeText2);
			draw();
		});
		$b.on("change", ".tl-split", function () { L.splitStone = this.checked; draw(); });
		$b.on("change", ".tl-splitfam", function () { L.splitFamily = this.checked; draw(); });
		dlg.$wrapper.on("keydown", function (e) {
			const k = $b.find(".tl-rect.on").data("k");
			if (!k || !e.key.startsWith("Arrow") || $(e.target).is("input")) return;
			e.preventDefault();
			const d = e.shiftKey ? 0.05 : 0.005;
			if (e.key === "ArrowLeft") L[k].x = +(L[k].x - d).toFixed(3);
			if (e.key === "ArrowRight") L[k].x = +(L[k].x + d).toFixed(3);
			if (e.key === "ArrowUp") L[k].y = +(L[k].y - d).toFixed(3);
			if (e.key === "ArrowDown") L[k].y = +(L[k].y + d).toFixed(3);
			draw();
		});

		dlg.show();
		draw();          // after show(): a detached box measures 0 and never clips
	}
	root.on("click", ".mb-layout", showLayout);

	paint();
	focusScan();
	frappe.pages["multi-barcode"].on_page_show = focusScan;
	// the layout Tag Canvas locked in — read before the first preview, so what
	// is on screen is what comes off the printer
	Promise.resolve(jewelima.loadBarcodeLayout()).then(() => paint());

};
