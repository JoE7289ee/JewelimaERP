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
	const LABEL_CSS = `
	.bc-label{width:3.3in;height:0.475in;box-sizing:border-box;display:flex;align-items:center;
		justify-content:center;gap:0;
		padding:0 0.09in;overflow:hidden;
		font-family:"Arial Narrow","Liberation Sans Narrow","Roboto Condensed","Helvetica Neue Condensed",Arial,sans-serif;
		font-stretch:condensed;font-size:var(--bc-size,8pt);font-weight:400;font-style:normal;
		line-height:1.05;letter-spacing:-.2px;color:#000;}
	.bc-label .bc-col{display:flex;flex-direction:column;justify-content:center;}
	.bc-label .bc-left{flex:0 0 auto;white-space:nowrap;}
	.bc-label .bc-qr{flex:0 0 auto;}
	.bc-label .bc-qr img{height:var(--bc-qr,0.33in);width:var(--bc-qr,0.33in);display:block;}
	.bc-label .bc-right{flex:0 0 auto;white-space:nowrap;text-align:left;}
	.bc-label .bc-fallback{font-size:7.5pt;font-style:normal;}
	/* the two halves the label is split into — each nudges on its own, because a
	   tag's two printable zones rarely line up with one another */
	.bc-label .bc-half{display:flex;align-items:center;gap:0.045in;flex:0 0 auto;}
	.bc-label .bc-a{justify-content:flex-end;}
	.bc-label .bc-b{justify-content:flex-start;}`;

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

	function stoneLine(c) {
		if (c.dmd_no || c.dmd_wt) return `DIA:${c.dmd_no}/${flt(c.dmd_wt).toFixed(2)}ct`;
		if (c.ps_no || c.ps_wt) return `PS:${c.ps_no}/${flt(c.ps_wt).toFixed(2)}ct`;
		if (c.cs_no || c.cs_wt) return `CS:${c.cs_no}/${flt(c.cs_wt).toFixed(2)}ct`;
		return "";
	}

	// How far the whole block sits from where the printer thinks the label starts.
	// Thermal printers rarely agree on that, so this is a per-machine nudge kept in
	// the browser rather than a setting everyone shares.
	// Two nudges, one per half: "a" is the weights and the QR, "b" is the codes.
	// A tag's two printable zones rarely line up with each other, so each side
	// moves on its own. Kept in the browser — it describes this machine, not the
	// label everyone shares.
	const OFF_KEY = { a: "jw_barcode_offset_a_in", b: "jw_barcode_offset_b_in" };
	function offset(side) {
		let v = 0;
		try { v = parseFloat(localStorage.getItem(OFF_KEY[side]) || "0") || 0; } catch (e) { v = 0; }
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
	const SIZE_MIN = 7, SIZE_MAX = 13, SIZE_DEF = 8;
	function ptSize() {
		let v = SIZE_DEF;
		try { v = parseFloat(localStorage.getItem(SIZE_KEY) || "") || SIZE_DEF; } catch (e) { v = SIZE_DEF; }
		return Math.max(SIZE_MIN, Math.min(SIZE_MAX, v));
	}
	function setPtSize(v) {
		const n = Math.max(SIZE_MIN, Math.min(SIZE_MAX, Math.round(v * 2) / 2));
		try { localStorage.setItem(SIZE_KEY, String(n)); } catch (e) { /* private window */ }
		showOffsets();
		renderPreview(state.cards[state.cards.length - 1] || null);
	}
	// the code square grows with the type, but never past what the label can hold
	const qrSize = () => Math.min(0.42, Math.round((0.33 * ptSize() / SIZE_DEF) * 100) / 100);
	const sizeVars = () => `--bc-size:${ptSize()}pt;--bc-qr:${qrSize()}in;`;

	function showOffsets() {
		$(page.main).find(".pb-off-a").text(offset("a").toFixed(2) + " in");
		$(page.main).find(".pb-off-b").text(offset("b").toFixed(2) + " in");
		$(page.main).find(".pb-pt").text(ptSize().toFixed(1) + " pt");
	}
	const offsetStyle = () => "";   // the halves carry their own transform now

	// Build one label's HTML — matches the reference: weights (left) · QR · codes (right)
	function buildLabel(c) {
		const stone = stoneLine(c);
		const left = `<div class="bc-col bc-left"><div>GW:${flt(c.gw).toFixed(3)} gm</div>${stone ? `<div>${stone}</div>` : ""}</div>`;
		const qr = c.qr
			? `<div class="bc-col bc-qr"><img src="${c.qr}"></div>`
			: `<div class="bc-col bc-qr bc-fallback">${esc(c.name)}</div>`;
		const r1 = c.design_type ? `<div>${esc(c.design_type)}</div>` : "";
		const right = `<div class="bc-col bc-right">${r1}<div>${esc(c.design || "")}</div><div>${esc(c.name)}</div></div>`;
		// half A is everything up to and including the QR; half B is the rest
		return `<div class="bc-label" style="${sizeVars()}">`
			+ `<div class="bc-half bc-a" style="transform:translateX(${offset("a")}in);">${left}${qr}</div>`
			+ `<div class="bc-half bc-b" style="transform:translateX(${offset("b")}in);">${right}</div>`
			+ `</div>`;
	}

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
	$(page.main).on("click", ".pb-sz0", () => setPtSize(SIZE_DEF));
	$(page.main).on("click", ".pb-l", function () { const sd = this.dataset.s; setOffset(sd, offset(sd) - 0.02); });
	$(page.main).on("click", ".pb-r", function () { const sd = this.dataset.s; setOffset(sd, offset(sd) + 0.02); });
	$(page.main).on("click", ".pb-0", function () { setOffset(this.dataset.s, 0); });
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
		const body = state.cards.map(buildLabel).join("");
		const w = window.open("", "_blank", "width=600,height=400");
		w.document.write(`<html><head><title>Barcodes</title><style>
			@page{size:3.3in 0.475in;margin:0;}
			html,body{margin:0;padding:0;}
			${LABEL_CSS}
			.bc-label{page-break-after:always;}

			.bc-label:last-child{page-break-after:auto;}
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
};
