// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Tag Canvas (Delivery > Barcode) — where the label's geometry is measured.
//
// The tag is drawn at TRUE SIZE with a REAL LABEL on it: scan a card and its own
// weights, code square, design and number render inside the two boxes, so what
// is being adjusted is the thing that prints rather than two empty rectangles.
// Box A carries the weights and the code square, box B the design and the card
// number. Drag them, resize them, nudge them with the arrow keys, change the
// type size, print, look at the stock, repeat.
//
// It STARTS from what is locked in (jewelima.BARCODE_DEFAULTS) and prints the
// same markup every other printer uses, so the canvas cannot drift from the
// tags the floor actually gets. When the placement is right, "Copy values"
// gives the block to paste back into BARCODE_DEFAULTS.
// Route: /app/tag-canvas

frappe.pages["tag-canvas"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper, title: __("Tag Canvas"), single_column: true,
	});
	const IN = 96;                       // CSS pixels per inch, at 100% zoom
	const KEY = "jw_tag_canvas_v2";      // v1 held the pre-lock guesses
	const D = () => (window.jewelima && jewelima.BARCODE_DEFAULTS) || {};

	// the tag, and the two blocks on it — inches throughout, never pixels. Starts
	// from what is LOCKED IN, so the canvas shows the real label's boxes.
	const FRESH = () => ({
		tagW: D().tag ? D().tag.w : 3.3, tagH: D().tag ? D().tag.h : 0.475,
		a: Object.assign({ x: 0.94, y: 0.03, w: 0.96, h: 0.43 }, D().a || {}),
		b: Object.assign({ x: 1.95, y: 0.03, w: 1.02, h: 0.43 }, D().b || {}),
		pt: +(D().pt || 9), qr: +(D().qr || 0.41),
	});
	// A stand-in card so the page is useful before anything is scanned — and on a
	// site with no products at all. The code square is a plain black frame at the
	// real size: a truthful placeholder, because the square is the biggest thing
	// on the tag and calibrating against a line of text instead would mislead.
	const QR_STUB = "data:image/svg+xml;utf8," + encodeURIComponent(
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">'
		+ '<rect width="40" height="40" fill="#fff" stroke="#000" stroke-width="2"/>'
		+ '<rect x="6" y="6" width="10" height="10" fill="#000"/>'
		+ '<rect x="24" y="6" width="10" height="10" fill="#000"/>'
		+ '<rect x="6" y="24" width="10" height="10" fill="#000"/>'
		+ '<rect x="24" y="26" width="6" height="6" fill="#000"/></svg>');
	const SAMPLE = { name: "E0001.1.1", design: "A13010NP-18EF-Y", design_type: "NOSEPIN",
		gw: 2.487, dmd_no: 12, dmd_wt: 0.108, stone_family: "EF", gold_color: "YG", qr: QR_STUB };
	let CARD = SAMPLE;
	let S = FRESH();
	try {
		const raw = localStorage.getItem(KEY);
		if (raw) S = Object.assign(FRESH(), JSON.parse(raw));
	} catch (e) { /* private window — defaults are fine */ }
	const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

	$(page.main).append(`
		<style>
		.tc-wrap{max-width:1040px;}
		.tc-note{font-size:12.5px;color:var(--text-muted);margin:0 0 14px;}
		.tc-stage{background:var(--fg-color);border:1px solid var(--border-color);
			border-radius:10px;padding:26px;overflow:auto;}
		/* the tag at TRUE SIZE — what is on screen is what goes on the stock */
		.tc-tag{position:relative;background:#fff;border:1px solid #b9c2cc;
			box-shadow:0 1px 3px rgba(0,0,0,.10);margin:0 auto;}
		/* the real label sits underneath; these are the handles over it */
		.tc-live{position:absolute;inset:0;overflow:hidden;}
		.tc-live .bc-label{border:0;}
		.tc-rect{position:absolute;box-sizing:border-box;cursor:move;
			font:700 8px/1 Arial,sans-serif;letter-spacing:.06em;user-select:none;}
		.tc-rect .tag-l{position:absolute;top:-1px;left:-1px;padding:0 3px;
			background:currentColor;color:#fff;font-size:7.5px;line-height:1.5;}
		.tc-rect.a{border:1px dashed #1f618d;background:rgba(31,97,141,.07);color:#1f618d;}
		.tc-rect.b{border:1px dashed #b35a00;background:rgba(179,90,0,.07);color:#b35a00;}
		.tc-rect.clip{border-style:solid;border-width:2px;background:rgba(176,42,42,.13);}
		.tc-rect .hd{position:absolute;right:-4px;bottom:-4px;width:9px;height:9px;
			background:var(--fg-color);border:1px solid currentColor;cursor:nwse-resize;}
		.tc-rect.on{box-shadow:0 0 0 2px rgba(31,97,141,.35);}
		.tc-panel{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));
			gap:14px;margin-top:16px;}
		.tc-card{border:1px solid var(--border-color);border-radius:9px;padding:11px 13px;
			background:var(--fg-color);}
		.tc-card h4{margin:0 0 9px;font-size:11px;text-transform:uppercase;
			letter-spacing:.06em;color:var(--text-muted);}
		.tc-row{display:flex;align-items:center;gap:7px;margin-bottom:6px;font-size:12.5px;}
		.tc-row label{width:74px;color:var(--text-muted);}
		.tc-row input{width:84px;border:1px solid var(--border-color);border-radius:6px;
			padding:3px 7px;text-align:right;background:var(--control-bg);color:var(--text-color);}
		.tc-row .u{color:var(--text-muted);font-size:11px;}
		.tc-bar{display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin-bottom:12px;}
		.tc-bar .btn{height:32px;}
		.tc-scan{border:2px solid var(--primary);border-radius:7px;height:32px;padding:2px 10px;
			font-size:13px;font-weight:600;width:190px;background:var(--control-bg);color:var(--text-color);}
		.tc-clipmsg{font-size:12.5px;font-weight:700;color:#b02a2a;margin-top:9px;min-height:18px;}
		.tc-out{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;
			background:var(--control-bg);border:1px solid var(--border-color);border-radius:7px;
			padding:9px 11px;white-space:pre;overflow:auto;}
		</style>
		<div class="tc-wrap">
			<div class="tc-bar">
				<input class="tc-scan" type="text" placeholder="${__("scan a card + Enter")}"
					title="${__("its own weights and code square render on the tag")}">
				<button class="btn btn-default btn-sm tc-sample">${__("Sample")}</button>
				<button class="btn btn-primary btn-sm tc-print">${__("Print test tag")}</button>
				<button class="btn btn-default btn-sm tc-copy">${__("Copy values")}</button>
				<button class="btn btn-default btn-sm tc-reset">${__("Reset")}</button>
				<span class="tc-note" style="margin:0 0 0 6px;">${
					__("Drag a box, or type exact inches. Nothing is written to the card.")}</span>
			</div>
			<div class="tc-stage"><div class="tc-tag">
				<div class="tc-live"></div>
				<div class="tc-rect a" data-k="a"><span class="tag-l">A</span><div class="hd"></div></div>
				<div class="tc-rect b" data-k="b"><span class="tag-l">B</span><div class="hd"></div></div>
			</div></div>
			<div class="tc-clipmsg"></div>
			<div class="tc-panel">
				<div class="tc-card"><h4>${__("Tag & type")}</h4>
					<div class="tc-row"><label>${__("Width")}</label>
						<input type="number" step="0.01" data-f="tagW"> <span class="u">in</span></div>
					<div class="tc-row"><label>${__("Height")}</label>
						<input type="number" step="0.005" data-f="tagH"> <span class="u">in</span></div>
					<div class="tc-row"><label>${__("Type size")}</label>
						<input type="number" step="0.5" min="6" max="14" data-f="pt"> <span class="u">pt</span></div>
					<div class="tc-row"><label>${__("Code square")}</label>
						<input type="number" step="0.01" data-f="qr"> <span class="u">in</span></div>
				</div>
				<div class="tc-card"><h4>${__("A — weights & code square")}</h4>
					<div class="tc-row"><label>${__("Left")}</label><input type="number" step="0.01" data-f="a.x"> <span class="u">in</span></div>
					<div class="tc-row"><label>${__("Top")}</label><input type="number" step="0.01" data-f="a.y"> <span class="u">in</span></div>
					<div class="tc-row"><label>${__("Width")}</label><input type="number" step="0.01" data-f="a.w"> <span class="u">in</span></div>
					<div class="tc-row"><label>${__("Height")}</label><input type="number" step="0.01" data-f="a.h"> <span class="u">in</span></div>
				</div>
				<div class="tc-card"><h4>${__("B — design & codes")}</h4>
					<div class="tc-row"><label>${__("Left")}</label><input type="number" step="0.01" data-f="b.x"> <span class="u">in</span></div>
					<div class="tc-row"><label>${__("Top")}</label><input type="number" step="0.01" data-f="b.y"> <span class="u">in</span></div>
					<div class="tc-row"><label>${__("Width")}</label><input type="number" step="0.01" data-f="b.w"> <span class="u">in</span></div>
					<div class="tc-row"><label>${__("Height")}</label><input type="number" step="0.01" data-f="b.h"> <span class="u">in</span></div>
				</div>
			</div>
			<div class="tc-card" style="margin-top:14px;">
				<h4>${__("What to lock in")}</h4>
				<div class="tc-out"></div>
			</div>
		</div>
	`);
	const root = $(page.main);

	const get = (path) => path.split(".").reduce((o, k) => o[k], S);
	const set = (path, v) => {
		const ks = path.split(".");
		const last = ks.pop();
		ks.reduce((o, k) => o[k], S)[last] = v;
	};

	// the canvas's numbers, in the shape barcodeOpts hands to the label
	const opts = () => jewelima.barcodeOpts({
		pt: S.pt, qr: S.qr, tag: { w: S.tagW, h: S.tagH },
		a: S.a, b: S.b, offsetA: 0, offsetB: 0,
	});

	function paint() {
		const $tag = root.find(".tc-tag");
		$tag.css({ width: S.tagW * IN + "px", height: S.tagH * IN + "px" });
		// the actual label, same builder every printer uses — so this cannot drift
		root.find(".tc-live").html(`<style>${jewelima.BARCODE_LABEL_CSS}</style>`
			+ jewelima.buildBarcodeLabel(CARD, opts()));
		["a", "b"].forEach((k) => {
			root.find(`.tc-rect.${k}`).css({
				left: S[k].x * IN + "px", top: S[k].y * IN + "px",
				width: S[k].w * IN + "px", height: S[k].h * IN + "px",
			});
		});
		// does the content actually FIT? A box whose text overflows is the whole
		// reason to look at a real label instead of an empty rectangle.
		const clipped = [];
		["a", "b"].forEach((k) => {
			const el = root.find(`.tc-live .bc-${k}`).get(0);
			const off = el && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
			root.find(`.tc-rect.${k}`).toggleClass("clip", !!off);
			if (off) clipped.push(k.toUpperCase());
		});
		const over = S.a.x + S.a.w > S.tagW + 0.001 || S.b.x + S.b.w > S.tagW + 0.001
			|| S.a.y + S.a.h > S.tagH + 0.001 || S.b.y + S.b.h > S.tagH + 0.001;
		root.find(".tc-clipmsg").text([
			clipped.length === 1 ? __("Box {0} clips its content — widen it or drop the type size.", [clipped[0]])
				: clipped.length ? __("Boxes {0} clip their content — widen them or drop the type size.", [clipped.join(" & ")]) : "",
			over ? __("A box runs off the tag.") : "",
		].filter(Boolean).join("  "));
		root.find("input[data-f]").each(function () {
			if (document.activeElement === this) return;   // never fight the typist
			this.value = (+get(this.dataset.f)).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
		});
		// exactly the shape BARCODE_DEFAULTS carries, so it can be pasted straight in
		root.find(".tc-out").text(
			`pt: ${(+S.pt).toFixed(1)}, qr: ${S.qr},\n`
			+ `tag: { w: ${S.tagW}, h: ${S.tagH} },\n`
			+ `a: { x: ${S.a.x}, y: ${S.a.y}, w: ${S.a.w}, h: ${S.a.h} },\n`
			+ `b: { x: ${S.b.x}, y: ${S.b.y}, w: ${S.b.w}, h: ${S.b.h} },`);
		save();
	}

	// ---- drag and resize, in inches ----------------------------------------
	let drag = null;
	root.on("mousedown", ".tc-rect", function (e) {
		const k = this.dataset.k;
		root.find(".tc-rect").removeClass("on");
		$(this).addClass("on");
		drag = {
			k, mode: $(e.target).hasClass("hd") ? "size" : "move",
			x0: e.clientX, y0: e.clientY, s: Object.assign({}, S[k]),
		};
		e.preventDefault();
	});
	$(document).on("mousemove.tagcanvas", function (e) {
		if (!drag) return;
		const dx = (e.clientX - drag.x0) / IN, dy = (e.clientY - drag.y0) / IN;
		const r = S[drag.k], o = drag.s;
		const snap = (v) => Math.round(v * 200) / 200;      // 0.005in
		if (drag.mode === "move") {
			r.x = snap(o.x + dx); r.y = snap(o.y + dy);
		} else {
			r.w = Math.max(0.05, snap(o.w + dx));
			r.h = Math.max(0.05, snap(o.h + dy));
		}
		paint();
	});
	$(document).on("mouseup.tagcanvas", () => { drag = null; });
	// the page is rebuilt on revisit, so the document handlers must not pile up
	$(wrapper).on("remove", () => $(document).off(".tagcanvas"));

	root.on("input", "input[data-f]", function () {
		const v = parseFloat(this.value);
		if (!isNaN(v)) { set(this.dataset.f, v); paint(); }
	});

	// arrow keys nudge the picked block, 0.005in a press
	root.on("keydown", function (e) {
		const k = root.find(".tc-rect.on").data("k");
		if (!k || !e.key.startsWith("Arrow")) return;
		if ($(e.target).is("input")) return;
		e.preventDefault();
		const d = e.shiftKey ? 0.05 : 0.005;
		if (e.key === "ArrowLeft") S[k].x = +(S[k].x - d).toFixed(3);
		if (e.key === "ArrowRight") S[k].x = +(S[k].x + d).toFixed(3);
		if (e.key === "ArrowUp") S[k].y = +(S[k].y - d).toFixed(3);
		if (e.key === "ArrowDown") S[k].y = +(S[k].y + d).toFixed(3);
		paint();
	});

	// ---- print exactly what is on the canvas --------------------------------
	root.on("click", ".tc-print", function () {
		document.getElementById("jw-tc-frame")?.remove();
		const fr = document.createElement("iframe");
		fr.id = "jw-tc-frame";
		fr.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
		document.body.appendChild(fr);
		const doc = fr.contentDocument;
		doc.open();
		// the real label off the shared builder — a test tag that prints something
		// other than what the floor gets would be worse than no test tag
		doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Tag Canvas</title><style>
			@page{size:${S.tagW}in ${S.tagH}in;margin:0;}
			html,body{margin:0;padding:0;}
			${jewelima.BARCODE_LABEL_CSS}
			</style></head><body>${jewelima.buildBarcodeLabel(CARD, opts())}</body></html>`);
		doc.close();
		setTimeout(() => { fr.contentWindow.focus(); fr.contentWindow.print(); }, 300);
		frappe.show_alert({ message: __("Sent one test tag — {0} — to the printer.", [CARD.name]), indicator: "green" }, 5);
	});

	// scan a real card and the tag shows ITS weights, code square and numbers
	root.on("keydown", ".tc-scan", function (e) {
		if (e.key !== "Enter") return;
		e.preventDefault();
		const code = (this.value || "").trim();
		if (!code) return;
		frappe.call({ method: "jewelima.jewelima.api.get_barcode_card",
			args: { order_bag: code }, freeze: false }).then((r) => {
			const c = r.message;
			if (!c || c.error) {
				return frappe.show_alert({ message: (c && c.error) || __("No card {0}.", [code]), indicator: "red" }, 5);
			}
			CARD = c;
			paint();
			frappe.show_alert({ message: __("Showing {0}.", [c.name])
				+ (c.actual_empty ? " " + __("It has no actual weight yet.") : ""), indicator: "blue" }, 5);
		});
	});
	root.on("click", ".tc-sample", function () {
		CARD = SAMPLE;
		root.find(".tc-scan").val("");
		paint();
	});

	root.on("click", ".tc-copy", function () {
		const txt = root.find(".tc-out").text();
		frappe.utils.copy_to_clipboard(txt);
		frappe.show_alert({ message: __("Copied — paste these to lock them in."), indicator: "green" }, 5);
	});

	root.on("click", ".tc-reset", function () {
		S = FRESH();
		paint();
		frappe.show_alert({ message: __("Back to the locked-in values."), indicator: "blue" }, 4);
	});

	paint();
};
