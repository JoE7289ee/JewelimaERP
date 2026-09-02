// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Tag Canvas (Delivery > Barcode) — printer alignment, before any real label.
//
// Two rectangles on a tag-sized canvas: A is the half that carries the weights
// and the code square, B is the half with the design and the card number. Drag
// them, nudge them, print, look at the tag, repeat. Nothing here reads or writes
// a card — it exists to find the numbers, and the numbers it finds are exactly
// the ones the real labels use (jewelima.BARCODE_DEFAULTS).
//
// When the placement is right, "Copy values" gives the four numbers to lock in.
// Route: /app/tag-canvas

frappe.pages["tag-canvas"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper, title: __("Tag Canvas"), single_column: true,
	});
	const IN = 96;                       // CSS pixels per inch, at 100% zoom
	const KEY = "jw_tag_canvas_v1";
	const D = () => (window.jewelima && jewelima.BARCODE_DEFAULTS) || {};

	// the tag, and the two blocks on it — inches throughout, never pixels
	const FRESH = () => ({
		tagW: 3.3, tagH: 0.475,
		a: { x: +(D().offsetA ?? 0.04), y: 0.01, w: 1.55, h: 0.45 },
		b: { x: +(D().offsetB ?? 0.22) + 1.6, y: 0.01, w: 1.55, h: 0.45 },
	});
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
		.tc-rect{position:absolute;box-sizing:border-box;cursor:move;
			display:flex;align-items:center;justify-content:center;
			font:700 9px/1 Arial,sans-serif;letter-spacing:.06em;user-select:none;}
		.tc-rect.a{border:1px solid #1f618d;background:rgba(31,97,141,.10);color:#1f618d;}
		.tc-rect.b{border:1px solid #b35a00;background:rgba(179,90,0,.10);color:#b35a00;}
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
		.tc-out{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;
			background:var(--control-bg);border:1px solid var(--border-color);border-radius:7px;
			padding:9px 11px;white-space:pre;overflow:auto;}
		</style>
		<div class="tc-wrap">
			<div class="tc-bar">
				<button class="btn btn-primary btn-sm tc-print">${__("Print test tag")}</button>
				<button class="btn btn-default btn-sm tc-copy">${__("Copy values")}</button>
				<button class="btn btn-default btn-sm tc-reset">${__("Reset")}</button>
				<span class="tc-note" style="margin:0 0 0 6px;">${
					__("Drag a block, or type exact inches. Nothing here touches a card.")}</span>
			</div>
			<div class="tc-stage"><div class="tc-tag">
				<div class="tc-rect a" data-k="a">A<div class="hd"></div></div>
				<div class="tc-rect b" data-k="b">B<div class="hd"></div></div>
			</div></div>
			<div class="tc-panel">
				<div class="tc-card"><h4>${__("Tag")}</h4>
					<div class="tc-row"><label>${__("Width")}</label>
						<input type="number" step="0.01" data-f="tagW"> <span class="u">in</span></div>
					<div class="tc-row"><label>${__("Height")}</label>
						<input type="number" step="0.005" data-f="tagH"> <span class="u">in</span></div>
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

	function paint() {
		const $tag = root.find(".tc-tag");
		$tag.css({ width: S.tagW * IN + "px", height: S.tagH * IN + "px" });
		["a", "b"].forEach((k) => {
			root.find(`.tc-rect.${k}`).css({
				left: S[k].x * IN + "px", top: S[k].y * IN + "px",
				width: S[k].w * IN + "px", height: S[k].h * IN + "px",
			});
		});
		root.find("input[data-f]").each(function () {
			if (document.activeElement === this) return;   // never fight the typist
			this.value = (+get(this.dataset.f)).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
		});
		// A's left IS offsetA; B's offset is measured from where the second half starts
		const offA = S.a.x;
		const offB = +(S.b.x - 1.6).toFixed(3);
		root.find(".tc-out").text(
			`tag        ${S.tagW}in x ${S.tagH}in\n`
			+ `A (weights & QR)  left ${S.a.x}in  top ${S.a.y}in  ${S.a.w} x ${S.a.h}in\n`
			+ `B (design & codes) left ${S.b.x}in  top ${S.b.y}in  ${S.b.w} x ${S.b.h}in\n`
			+ `\n`
			+ `BARCODE_DEFAULTS: offsetA ${offA}in   offsetB ${offB}in`);
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
		const rect = (k, lbl) => `<div style="position:absolute;box-sizing:border-box;`
			+ `left:${S[k].x}in;top:${S[k].y}in;width:${S[k].w}in;height:${S[k].h}in;`
			+ `border:1px solid #000;"></div>`;
		document.getElementById("jw-tc-frame")?.remove();
		const fr = document.createElement("iframe");
		fr.id = "jw-tc-frame";
		fr.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
		document.body.appendChild(fr);
		const doc = fr.contentDocument;
		doc.open();
		doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Tag Canvas</title><style>
			@page{size:${S.tagW}in ${S.tagH}in;margin:0;}
			html,body{margin:0;padding:0;}
			.tag{position:relative;width:${S.tagW}in;height:${S.tagH}in;overflow:hidden;}
			</style></head><body><div class="tag">${rect("a")}${rect("b")}</div></body></html>`);
		doc.close();
		setTimeout(() => { fr.contentWindow.focus(); fr.contentWindow.print(); }, 300);
		frappe.show_alert({ message: __("Sent one test tag to the printer."), indicator: "green" }, 5);
	});

	root.on("click", ".tc-copy", function () {
		const txt = root.find(".tc-out").text();
		frappe.utils.copy_to_clipboard(txt);
		frappe.show_alert({ message: __("Copied — paste these to lock them in."), indicator: "green" }, 5);
	});

	root.on("click", ".tc-reset", function () {
		S = FRESH();
		paint();
		frappe.show_alert({ message: __("Back to the current tag settings."), indicator: "blue" }, 4);
	});

	paint();
};
