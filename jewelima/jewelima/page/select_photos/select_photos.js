// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Selection (Selection > Selection) — the party sits with the photo book: pick a
// batch, click the photos they like, and Save. The record keeps WHAT was selected
// and HOW MANY (plus gold/ct totals once the cards are OCR'd).
// Route: /app/select-photos

frappe.pages["select-photos"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Selection", single_column: true });
	const API = "jewelima.jewelima.api";
	const S = { photos: [], batch: "", sel: new Set() };
	const esc = frappe.utils.escape_html;

	$(page.main).append(`
		<style>
		#page-select-photos .container{max-width:100%;}
		.sl2-wrap{display:flex;flex-direction:column;height:calc(100vh - 110px);}
		.sl2-top{flex:0 0 auto;display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin-bottom:8px;}
		.sl2-top .frappe-control{margin:0;flex:0 0 190px;}
		.sl2-top .control-label{font-size:11px;color:var(--text-muted);}
		.sl2-pills{flex:0 0 auto;display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px;}
		.sl2-pills .lbl{font-size:10.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;}
		.sl2-pill{border:1px solid var(--border-color);border-radius:12px;padding:2px 12px;font-size:12px;font-weight:600;cursor:pointer;background:var(--control-bg);user-select:none;}
		.sl2-pill.on{background:var(--primary);border-color:var(--primary);color:#fff;}
		.sl2-grid{flex:1 1 auto;overflow-y:auto;min-height:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(165px,1fr));gap:12px;padding:4px 2px 10px;align-content:start;grid-auto-rows:min-content;}
		.sl2-card{border:2px solid var(--border-color);border-radius:9px;overflow:hidden;background:var(--fg-color);cursor:pointer;position:relative;}
		.sl2-card img{width:100%;height:230px;object-fit:contain;display:block;background:#111;}
		.sl2-card .cap{padding:4px 7px;font-size:11.5px;font-weight:700;}
		.sl2-card .sub{padding:0 7px 5px;font-size:10.5px;color:var(--text-muted);}
		.sl2-card.on{border-color:#2e7d32;box-shadow:0 0 0 2px rgba(46,125,50,.25);}
		.sl2-card .tick{position:absolute;top:6px;right:6px;width:22px;height:22px;border-radius:50%;background:#2e7d32;color:#fff;display:none;align-items:center;justify-content:center;font-size:13px;font-weight:800;}
		.sl2-card.on .tick{display:flex;}
		.sl2-none{padding:40px;text-align:center;color:var(--text-muted);grid-column:1/-1;}
		.sl2-strip{flex:0 0 auto;display:flex;align-items:center;gap:12px;border-top:2px solid var(--border-color);background:var(--fg-color);padding:9px 14px;flex-wrap:wrap;}
		.sl2-strip .b{border:1px solid var(--border-color);border-radius:8px;padding:4px 16px;text-align:center;background:var(--control-bg);min-width:96px;}
		.sl2-strip .b .bk{font-size:10px;font-weight:700;letter-spacing:.06em;color:var(--text-muted);}
		.sl2-strip .b .bv{font-size:15px;font-weight:800;}
		.sl2-strip .b.tot{background:var(--fg-color);border-width:2px;}
		.sl2-strip .sl2-save{margin-left:auto;font-size:15px;font-weight:700;padding:9px 30px;background:#2e7d32;border-color:#2e7d32;color:#fff;}
		.sl2-strip .sl2-save:hover{background:#256628;border-color:#256628;}
		</style>
		<div class="sl2-wrap">
			<div class="sl2-top">
				<div class="sl2-party"></div><div class="sl2-date"></div><div class="sl2-search"></div>
				<button class="btn btn-default sl2-clear">${__("Clear picks")}</button>
			</div>
			<div class="sl2-pills sl2-batches"></div>
			<div class="sl2-grid"></div>
			<div class="sl2-strip">
				<div class="b tot"><div class="bk">${__("SELECTED")}</div><div class="bv sl2-n">0</div></div>
				<div class="b"><div class="bk">${__("OF")}</div><div class="bv sl2-of">0</div></div>
				<div class="b"><div class="bk">${__("GOLD g")}</div><div class="bv sl2-gold">0.000</div></div>
				<div class="b"><div class="bk">${__("DIAMOND ct")}</div><div class="bv sl2-cts">0.000</div></div>
				<button class="btn btn-primary sl2-save">${__("Save Selection")}</button>
			</div>
		</div>
	`);
	const root = $(page.main);

	const mk = (sel, df) => {
		const c = frappe.ui.form.make_control({ df, parent: root.find(sel).get(0), render_input: true });
		c.refresh();
		return c;
	};
	const party = mk(".sl2-party", { fieldtype: "Link", label: __("Party"), fieldname: "party", options: "Customer", reqd: 1 });
	const dt = mk(".sl2-date", { fieldtype: "Date", label: __("Date"), fieldname: "selection_date", reqd: 1 });
	const search = mk(".sl2-search", { fieldtype: "Data", label: __("Search code"), fieldname: "search", placeholder: __("SM-…") });
	dt.set_value(frappe.datetime.get_today());
	search.$input.on("input", frappe.utils.debounce(() => load(), 400));

	function load() {
		frappe.call({ method: API + ".get_selection_photos",
			args: { batch: S.batch || null, search: (search.get_value() || "").trim() || null } }).then((r) => {
			const m = r.message || {};
			S.photos = m.photos || [];
			paintBatches(m.batches || []);
			paintGrid();
		});
	}

	function paintBatches(batches) {
		root.find(".sl2-batches").html(batches.length
			? `<span class="lbl">${__("Batch")}</span>
			   <span class="sl2-pill ${S.batch ? "" : "on"}" data-b="">${__("All")}</span>` +
			  batches.map((b) => `<span class="sl2-pill ${S.batch === b ? "on" : ""}" data-b="${esc(b)}">${esc(b)}</span>`).join("")
			: "");
	}

	function paintGrid() {
		root.find(".sl2-grid").html(S.photos.length ? S.photos.map((p) => `
			<div class="sl2-card ${S.sel.has(p.name) ? "on" : ""}" data-n="${esc(p.name)}">
				<div class="tick">✓</div>
				<img src="${encodeURI(p.image || "")}" loading="lazy" onerror="this.style.visibility='hidden'">
				<div class="cap">${esc(p.code)}</div>
				<div class="sub">${p.gold_gms ? p.gold_gms.toFixed(2) + " g" : ""}${p.gold_gms && p.cts ? " · " : ""}${p.cts ? p.cts.toFixed(2) + " ct" : ""}</div>
			</div>`).join("") : `<div class="sl2-none">${__("No photos. Import a batch first.")}</div>`);
		sum();
	}

	function sum() {
		const picked = S.photos.filter((p) => S.sel.has(p.name));
		// count every pick, even ones filtered out of view right now
		root.find(".sl2-n").text(S.sel.size);
		root.find(".sl2-of").text(S.photos.length);
		root.find(".sl2-gold").text(picked.reduce((a, p) => a + (p.gold_gms || 0), 0).toFixed(3));
		root.find(".sl2-cts").text(picked.reduce((a, p) => a + (p.cts || 0), 0).toFixed(3));
	}

	root.on("click", ".sl2-card", function () {
		const n = this.getAttribute("data-n");
		S.sel.has(n) ? S.sel.delete(n) : S.sel.add(n);
		$(this).toggleClass("on", S.sel.has(n));
		sum();
	});
	root.on("click", ".sl2-pill", function () {
		S.batch = this.getAttribute("data-b");
		load();
	});
	root.find(".sl2-clear").on("click", () => { S.sel.clear(); paintGrid(); });

	root.find(".sl2-save").on("click", () => {
		if (!S.sel.size) return frappe.msgprint(__("Select at least one photo."));
		const p = party.get_value();
		if (!p) return frappe.msgprint(__("Pick the Party."));
		frappe.confirm(__("Save <b>{0}</b> photo(s) selected by <b>{1}</b>?", [S.sel.size, esc(p)]), () => {
			frappe.dom.freeze(__("Saving..."));
			frappe.call({ method: API + ".create_selection", args: { payload: {
				party: p, selection_date: dt.get_value(), batch: S.batch || null,
				remarks: "", photos: [...S.sel],
			} } }).then((r) => {
				frappe.dom.unfreeze();
				const m = r.message || {};
				frappe.msgprint({ title: __("Selection saved"), indicator: "green",
					message: __("<a href='/app/selection/{0}'><b>{0}</b></a> — {1} photo(s).", [m.name, m.total_photos]) });
				S.sel.clear();
				paintGrid();
			}).catch(() => frappe.dom.unfreeze());
		});
	});

	page.add_inner_button(__("Records"), () => frappe.set_route("List", "Selection"));
	page.add_inner_button(__("Refresh"), load);
	load();
};
