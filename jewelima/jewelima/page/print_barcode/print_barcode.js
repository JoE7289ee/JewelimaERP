// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Print Barcode — scan one or more cards and print jewellery barcode labels.
//  • Label: 3.3in x 0.475in, Arial Narrow 11pt, heavy + oblique, QR + actual weights.
//  • Weights are pulled from ACTUAL only (never the BOM); empty actuals warn the user.
//  • A card with qty > 1 is rejected (extract into single pieces first).
//  • No status restriction — a card can be printed at any manufacturing stage.
// Route: /app/print-barcode

frappe.pages["print-barcode"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Print Barcode", single_column: true });
	const state = { cards: [], history: [] };
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;

	// Label geometry/typography — exactly as specified.
	// the label itself lives in public/js/barcode_label.js, shared with Multi Print
	const LABEL_CSS = jewelima.BARCODE_LABEL_CSS;

	const UI_CSS = `
	.pb-wrap{max-width:780px;}
	.pb-bar{max-width:420px;margin:2px 0 10px;}
	.pb-prev-wrap{margin:6px 0 14px;}
	.pb-prev-wrap h4,.pb-qh{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#8a96a3;margin:0 0 5px;}
	.pb-qh{margin:6px 0 5px;}
	.pb-prev{display:inline-block;border:1px dashed #c4ccd4;border-radius:4px;background:#fff;position:relative;}
	/* the partition, drawn for the eye only — it never prints */
	.pb-prev .bc-label{position:relative;}
	.pb-prev .bc-label::after{content:"";position:absolute;top:6%;bottom:6%;left:50%;
		border-left:1px dashed #c9d3dc;pointer-events:none;}
	.pb-empty{color:#8a96a3;font-size:13px;}
	table.pb-tbl{width:100%;border-collapse:collapse;font-size:13px;}
	table.pb-tbl th,table.pb-tbl td{border-bottom:1px solid #eef1f4;padding:5px 8px;text-align:left;}
	table.pb-tbl th{color:#8a96a3;font-size:11px;text-transform:uppercase;letter-spacing:.04em;}
	table.pb-tbl td.num,table.pb-tbl th.num{text-align:right;font-variant-numeric:tabular-nums;}
	table.pb-tbl td.warn{color:#b4690e;}
	.pb-x{cursor:pointer;color:#c0392b;font-weight:700;}
	.pb-cal{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:2px 0 12px;font-size:12.5px;}
	.pb-cal .lbl{color:#8a96a3;text-transform:uppercase;font-size:10px;letter-spacing:.05em;font-weight:800;}
	.pb-cal button{border:1px solid #c4ccd4;background:#fff;border-radius:6px;width:26px;height:24px;
		cursor:pointer;font-weight:800;line-height:1;}
	.pb-cal .val{font-variant-numeric:tabular-nums;font-weight:700;min-width:52px;text-align:center;}
	.pb-cal .hint{color:#8a96a3;}`;

	$(page.main).append(`<style>${LABEL_CSS}${UI_CSS}</style>
		<div class="pb-wrap">
			<div class="pb-bar"></div>
			<div class="pb-cal">
				<span class="lbl" style="min-width:96px;">Print size</span>
				<button class="pb-sm" title="smaller">&#8722;</button>
				<span class="val pb-pt">8.0 pt</span>
				<button class="pb-bg" title="bigger">+</button>
				<button class="pb-sz0" style="width:auto;padding:0 8px;">reset</button>
				<span class="hint pb-fit">how big it prints on the tag</span>
			</div>
			<div class="pb-cal">
				<span class="lbl" style="min-width:96px;">Weights &amp; QR</span>
				<button class="pb-l" data-s="a" title="move this half left">&#8592;</button>
				<span class="val pb-off-a">0.00 in</span>
				<button class="pb-r" data-s="a" title="move this half right">&#8594;</button>
				<button class="pb-0" data-s="a" style="width:auto;padding:0 8px;">reset</button>
				<span class="hint">everything up to and including the code square</span>
			</div>
			<div class="pb-cal">
				<span class="lbl" style="min-width:96px;">Design &amp; codes</span>
				<button class="pb-l" data-s="b" title="move this half left">&#8592;</button>
				<span class="val pb-off-b">0.00 in</span>
				<button class="pb-r" data-s="b" title="move this half right">&#8594;</button>
				<button class="pb-0" data-s="b" style="width:auto;padding:0 8px;">reset</button>
				<span class="hint">the other side of the tag</span>
			</div>
			<div class="pb-prev-wrap"><h4>Label preview (actual size)</h4><div class="pb-prev-out"></div></div>
			<div class="pb-qh">Labels to print</div>
			<div class="pb-hist"></div>
		</div>`);

	const scan = frappe.ui.form.make_control({
		df: { fieldtype: "Data", label: "Scan Order Bag", fieldname: "scan", description: "Scan cards to add labels. Qty must be 1; weights are taken from Actual." },
		parent: $(page.main).find(".pb-bar").get(0), render_input: true,
	});
	scan.refresh();
	const $prev = $(page.main).find(".pb-prev-out");
	const $hist = $(page.main).find(".pb-hist");
	const focusScan = () => setTimeout(() => scan.$input.focus(), 30);

	const stoneLine = (c) => jewelima.barcodeStoneLine(c);

	// How far the whole block sits from where the printer thinks the label starts.
	// Thermal printers rarely agree on that, so this is a per-machine nudge kept in
	// the browser rather than a setting everyone shares.
	// Two nudges, one per half: "a" is the weights and the QR, "b" is the codes.
	// A tag's two printable zones rarely line up with each other, so each side
	// moves on its own. Kept in the browser — it describes this machine, not the
	// label everyone shares.
	const OFF_KEY = { a: "jw_barcode_nudge_a_v2", b: "jw_barcode_nudge_b_v2" };   // v1 keys held translate offsets
	// the tuned defaults live with the label, so every printer starts from the
	// same calibration; a browser already nudged keeps its own stored value
	const BD = (window.jewelima && jewelima.BARCODE_DEFAULTS)
		|| { pt: 9, offsetA: 0, offsetB: 0, qr: 0.41, a: { h: 0.43 }, tag: { w: 3.3, h: 0.475 } };
	const OFF_DEF = { a: BD.offsetA, b: BD.offsetB };

	function offset(side) {
		let v = 0;
		const d = OFF_DEF[side] || 0;
		try {
			const raw = localStorage.getItem(OFF_KEY[side]);
			v = raw === null ? d : (parseFloat(raw) || 0);
		} catch (e) { v = d; }
		return Math.max(-0.35, Math.min(0.35, v));
	}
	function setOffset(side, v) {
		const n = Math.max(-0.35, Math.min(0.35, Math.round(v * 100) / 100));
		try { localStorage.setItem(OFF_KEY[side], String(n)); } catch (e) { /* private window */ }
		showOffsets();
		renderPreview(state.cards[state.cards.length - 1] || null);
	}
	// How big the print is. The label height is fixed, so the type can only grow
	// so far before three lines stop fitting — the preview says when that happens
	// rather than letting it clip on the tag.
	const SIZE_KEY = "jw_barcode_pt";
	const SIZE_MIN = 7, SIZE_MAX = 13;
	// the layout the floor measured, falling back to what shipped — read through
	// barcodeOpts so this page cannot drift from Multi Print's Tag layout dialog
	const LAY = () => jewelima.barcodeOpts();
	const SIZE_DEF = () => flt(LAY().pt) || BD.pt;
	function ptSize() {
		let v = SIZE_DEF();
		try { v = parseFloat(localStorage.getItem(SIZE_KEY) || "") || SIZE_DEF(); } catch (e) { v = SIZE_DEF(); }
		return Math.max(SIZE_MIN, Math.min(SIZE_MAX, v));
	}
	function setPtSize(v) {
		const n = Math.max(SIZE_MIN, Math.min(SIZE_MAX, Math.round(v * 2) / 2));
		try { localStorage.setItem(SIZE_KEY, String(n)); } catch (e) { /* private window */ }
		showOffsets();
		renderPreview(state.cards[state.cards.length - 1] || null);
	}
	// the code square grows with the type, but never past what the label can hold
	// the code square grows with the print size, capped by the tag height (0.475in)
	const qrMax = () => { const a = LAY().a || BD.a; return Math.max(0.2, (a && a.h ? a.h : 0.43) - 0.02); };
	const qrSize = () => Math.min(qrMax(),
		Math.round((flt(LAY().qr) || BD.qr) * ptSize() / SIZE_DEF() * 100) / 100);

	function showOffsets() {
		$(page.main).find(".pb-off-a").text(offset("a").toFixed(2) + " in");
		$(page.main).find(".pb-off-b").text(offset("b").toFixed(2) + " in");
		$(page.main).find(".pb-pt").text(ptSize().toFixed(1) + " pt");
	}
	const offsetStyle = () => "";   // the halves carry their own transform now

	// Build one label's HTML — matches the reference: weights (left) · QR · codes (right)
	// through barcodeOpts, so the roll printer draws the SAME boxes as everyone and
	// only adds its per-machine nudge on top
	const buildLabel = (c) => jewelima.buildBarcodeLabel(c,
		jewelima.barcodeOpts({ pt: ptSize(), qr: qrSize(), offsetA: offset("a"), offsetB: offset("b") }));

	function renderPreview(c) {
		$prev.html(c ? `${offsetStyle()}<div class="pb-prev">${buildLabel(c)}</div>`
			: '<span class="pb-empty">Scan a card to preview its label.</span>');
		checkFit();
	}

	// The label is a fixed 0.475in tall, so past a certain size three lines of
	// type stop fitting. Say so here, where it can still be undone, instead of
	// letting it clip on the tag.
	function checkFit() {
		const $hint = $(page.main).find(".pb-fit");
		const lab = $prev.find(".bc-label").get(0);
		if (!lab) { $hint.text(__("how big it prints on the tag")).css("color", ""); return; }
		// a centred flex row does not report overflow through scrollHeight — the
		// columns simply spill past the clipped edge — so measure the tallest and
		// widest thing in it against the label itself
		const box = lab.getBoundingClientRect();
		let tallest = 0, spanL = Infinity, spanR = -Infinity;
		lab.querySelectorAll(".bc-col").forEach((el) => {
			const r = el.getBoundingClientRect();
			tallest = Math.max(tallest, r.height);
			spanL = Math.min(spanL, r.left);
			spanR = Math.max(spanR, r.right);
		});
		const over = tallest > box.height - 2 || spanL < box.left - 1 || spanR > box.right + 1;
		$hint.text(over
			? __("too big — it will be cut off on the tag")
			: __("how big it prints on the tag"))
			.css("color", over ? "#b4690e" : "");
	}

	$(page.main).on("click", ".pb-sm", () => setPtSize(ptSize() - 0.5));
	$(page.main).on("click", ".pb-bg", () => setPtSize(ptSize() + 0.5));
	$(page.main).on("click", ".pb-sz0", () => setPtSize(SIZE_DEF()));
	$(page.main).on("click", ".pb-l", function () { const sd = this.dataset.s; setOffset(sd, offset(sd) - 0.02); });
	$(page.main).on("click", ".pb-r", function () { const sd = this.dataset.s; setOffset(sd, offset(sd) + 0.02); });
	// reset goes back to the tuned default, not to zero — zero was never the
	// setting anyone wanted, it was just the value before the tag was calibrated
	$(page.main).on("click", ".pb-0", function () { setOffset(this.dataset.s, OFF_DEF[this.dataset.s] || 0); });
	showOffsets();

	function renderHistory() {
		if (!state.cards.length) {
			$hist.html('<span class="pb-empty">No cards scanned yet.</span>');
			page.set_indicator(`0 labels`, "gray");
			return;
		}
		const rows = state.cards
			.map((c, i) => `<tr>
				<td>${i + 1}</td>
				<td><b>${esc(c.name)}</b></td>
				<td>${esc(c.design || "")}</td>
				<td class="num ${c.actual_empty ? "warn" : ""}">${flt(c.gw).toFixed(3)}${c.actual_empty ? " ⚠" : ""}</td>
				<td>${esc(stoneLine(c) || "—")}</td>
				<td>${esc(c._t || "")}</td>
				<td><span class="pb-x" data-i="${i}">&times;</span></td>
			</tr>`)
			.join("");
		$hist.html(`<table class="pb-tbl"><thead><tr>
			<th>#</th><th>Card</th><th>Design</th><th class="num">GW (g)</th><th>Stone</th><th>Scanned</th><th></th>
			</tr></thead><tbody>${rows}</tbody></table>`);
		page.set_indicator(`${state.cards.length} label(s)`, "blue");
	}

	$hist.on("click", ".pb-x", (e) => {
		state.cards.splice(cint($(e.currentTarget).attr("data-i")), 1);
		renderHistory();
		renderPreview(state.cards[state.cards.length - 1] || null);
	});

	// Scan history — logs every scan attempt + its outcome (like the Transfer page).
	function logHistory(code, result, kind) {
		state.history.push({ time: frappe.datetime.now_datetime(), code: code, result: result, kind: kind || "ok" });
	}

	function showHistory() {
		const h = state.history;
		const body = h
			.slice()
			.reverse()
			.map((e, idx) => {
				const color = e.kind === "err" ? "#b00020" : e.kind === "warn" ? "#9a6700" : "#1d7a33";
				return `<tr><td>${h.length - idx}</td><td>${e.time ? frappe.datetime.str_to_user(e.time) : ""}</td>
					<td><b>${esc(e.code)}</b></td><td style="color:${color}">${esc(e.result)}</td></tr>`;
			})
			.join("");
		const d = new frappe.ui.Dialog({ title: __("Scan history ({0})", [h.length]), size: "large", fields: [{ fieldtype: "HTML", fieldname: "h" }] });
		d.fields_dict.h.$wrapper.html(
			h.length
				? `<table class="table table-bordered" style="font-size:12px;"><thead><tr><th style="width:40px">#</th><th>Time</th><th>Order Bag</th><th>Result</th></tr></thead><tbody>${body}</tbody></table>`
				: '<div class="text-muted" style="padding:12px;">No scans yet this session.</div>'
		);
		d.show();
	}

	function load(code) {
		code = (code || "").trim();
		if (!code) return;
		frappe.call({ method: "jewelima.jewelima.api.get_barcode_card", args: { order_bag: code } }).then((r) => {
			const c = r.message || {};
			if (c.error) {
				frappe.msgprint({ title: __("Can't add card"), message: esc(c.error), indicator: "red" });
				logHistory(code, c.error, "err");
				return focusScan();
			}
			if (state.cards.some((x) => x.name === c.name)) {
				frappe.show_alert({ message: __("{0} is already in the list.", [c.name]), indicator: "orange" });
				logHistory(c.name, __("Already in list"), "warn");
				return focusScan();
			}
			if (c.actual_empty) {
				frappe.show_alert({ message: __("{0}: no Actual weight yet — label will show 0.", [c.name]), indicator: "orange" }, 7);
			}
			c._t = frappe.datetime.now_time();
			state.cards.push(c);
			logHistory(c.name, c.actual_empty ? __("Added — no actual weight") : __("Added (GW {0} g)", [flt(c.gw).toFixed(3)]), c.actual_empty ? "warn" : "ok");
			renderHistory();
			renderPreview(c);
			focusScan();
		});
	}

	function printAll() {
		if (!state.cards.length) return frappe.msgprint(__("Scan at least one card first."));
		// each label in its own plain-block page — break properties on .bc-label
		// (display:flex) are unreliable, which is how several labels ended up
		// sharing one sheet
		const body = state.cards.map((c) => `<div class="bc-page">${buildLabel(c)}</div>`).join("");
		const w = window.open("", "_blank", "width=600,height=400");
		const tag = LAY().tag || BD.tag;
		w.document.write(`<html><head><title>Barcodes</title><style>
			@page{size:${tag.w}in ${tag.h}in;margin:0;}
			html,body{margin:0;padding:0;}
			${LABEL_CSS}
			.bc-page{break-after:page;page-break-after:always;
				break-inside:avoid;page-break-inside:avoid;
				width:${tag.w}in;height:${tag.h}in;overflow:hidden;}
			.bc-page:last-child{break-after:auto;page-break-after:auto;}
			</style></head><body>${body}</body></html>`);
		w.document.close();
		w.focus();
		setTimeout(() => w.print(), 350);
		logHistory("—", __("Printed {0} label(s)", [state.cards.length]), "ok");
	}

	scan.$input.on("keydown", (e) => {
		if (e.which === 13 || e.key === "Enter") {
			e.preventDefault();
			const c = scan.$input.val();
			scan.set_value("");
			load(c);
		}
	});
	page.set_primary_action(__("Print"), printAll, "printer");
	page.add_inner_button(__("History"), showHistory);
	page.add_inner_button(__("Clear"), () => {
		state.cards = []; // clears the print queue; scan history is kept for the session
		renderHistory();
		renderPreview(null);
		focusScan();
	});

	renderHistory();
	renderPreview(null);
	focusScan();
	// the layout Tag Canvas locked in — read before the first preview, so what
	// is on screen is what comes off the printer
	Promise.resolve(jewelima.loadBarcodeLayout()).then(() => renderPreview(null));

};
