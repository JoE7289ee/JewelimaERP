// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Selected Pieces (Selection > Selected Pieces) — what has been selected, and by
// whom. Filter by party / batch / date; the left rail lists the selection records
// (click one to focus it), the right shows the actual picked photos. Info only.
// Route: /app/selected-pieces

frappe.pages["selected-pieces"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Selected Pieces", single_column: true });
	const API = "jewelima.jewelima.api";
	const S = { party: "", batch: "", sel: "", data: null };
	const esc = frappe.utils.escape_html;

	$(page.main).append(`
		<style>
		#page-selected-pieces .container{max-width:100%;}
		.sp-wrap{display:flex;flex-direction:column;height:calc(100vh - 110px);}
		.sp-top{flex:0 0 auto;display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin-bottom:8px;}
		.sp-top .frappe-control{margin:0;flex:0 0 175px;}
		.sp-top .control-label{font-size:11px;color:var(--text-muted);}
		.sp-tiles{flex:0 0 auto;display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px;}
		.sp-tile{border:1px solid var(--border-color);border-radius:9px;padding:6px 16px;background:var(--control-bg);min-width:96px;}
		.sp-tile .k{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;}
		.sp-tile .v{font-size:17px;font-weight:800;}
		.sp-pills{flex:0 0 auto;display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px;}
		.sp-pills .lbl{font-size:10.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;}
		.sp-pill{border:1px solid var(--border-color);border-radius:12px;padding:2px 12px;font-size:12px;font-weight:600;cursor:pointer;background:var(--control-bg);user-select:none;}
		.sp-pill.on{background:var(--primary);border-color:var(--primary);color:#fff;}
		.sp-cols{flex:1 1 auto;display:flex;gap:14px;min-height:0;}
		.sp-rail{flex:0 0 260px;overflow:auto;border:1px solid var(--border-color);border-radius:9px;background:var(--fg-color);}
		.sp-rec{padding:8px 12px;border-bottom:1px solid var(--border-color);cursor:pointer;}
		.sp-rec:hover{background:var(--control-bg);}
		.sp-rec.on{background:var(--control-bg);border-left:3px solid var(--primary);}
		.sp-rec .r1{font-weight:700;font-size:12.5px;display:flex;justify-content:space-between;gap:6px;}
		.sp-rec .r2{font-size:11px;color:var(--text-muted);}
		.sp-grid{flex:1 1 auto;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(165px,1fr));gap:12px;align-content:start;grid-auto-rows:min-content;padding-bottom:10px;}
		.sp-card{border:1px solid var(--border-color);border-radius:9px;overflow:hidden;background:var(--fg-color);}
		.sp-card img{width:100%;height:230px;object-fit:contain;display:block;background:#111;}
		.sp-card .cap{padding:4px 7px;font-size:11.5px;font-weight:700;}
		.sp-card .sub{padding:0 7px 5px;font-size:10.5px;color:var(--text-muted);}
		.sp-none{padding:40px;text-align:center;color:var(--text-muted);grid-column:1/-1;}
		</style>
		<div class="sp-wrap">
			<div class="sp-top">
				<div class="sp-party"></div><div class="sp-from"></div><div class="sp-to"></div>
				<button class="btn btn-default sp-clear">${__("Clear filters")}</button>
			</div>
			<div class="sp-pills sp-batches"></div>
			<div class="sp-tiles"></div>
			<div class="sp-cols">
				<div class="sp-rail"></div>
				<div class="sp-grid"></div>
			</div>
		</div>
	`);
	const root = $(page.main);

	const mk = (sel, df) => {
		const c = frappe.ui.form.make_control({ df, parent: root.find(sel).get(0), render_input: true });
		c.refresh();
		return c;
	};
	const party = mk(".sp-party", { fieldtype: "Link", label: __("Party"), fieldname: "party", options: "Customer" });
	const fd = mk(".sp-from", { fieldtype: "Date", label: __("From"), fieldname: "from_date" });
	const td = mk(".sp-to", { fieldtype: "Date", label: __("To"), fieldname: "to_date" });
	[party, fd, td].forEach((c) => c.$input.on("change", () => { S.sel = ""; load(); }));

	function load() {
		frappe.call({ method: API + ".get_selected_pieces", args: {
			party: party.get_value() || null, batch: S.batch || null,
			from_date: fd.get_value() || null, to_date: td.get_value() || null,
			selection: S.sel || null,
		} }).then((r) => { S.data = r.message || {}; paint(); });
	}

	function paint() {
		const m = S.data || {};
		root.find(".sp-tiles").html([
			[__("Selections"), m.total_selections || 0],
			[__("Photos picked"), m.total_photos || 0],
			[__("Unique photos"), m.unique_photos || 0],
			[__("Gold g"), (m.total_gold || 0).toFixed(3)],
			[__("Diamond ct"), (m.total_cts || 0).toFixed(3)],
		].map(([k, v]) => `<div class="sp-tile"><div class="k">${k}</div><div class="v">${v}</div></div>`).join(""));

		const bs = m.batches || [];
		root.find(".sp-batches").html(bs.length ? `<span class="lbl">${__("Batch")}</span>
			<span class="sp-pill ${S.batch ? "" : "on"}" data-b="">${__("All")}</span>` +
			bs.map((b) => `<span class="sp-pill ${S.batch === b ? "on" : ""}" data-b="${esc(b)}">${esc(b)}</span>`).join("") : "");

		const recs = m.selections || [];
		root.find(".sp-rail").html(recs.length ? recs.map((r) => `
			<div class="sp-rec ${S.sel === r.name ? "on" : ""}" data-n="${esc(r.name)}">
				<div class="r1"><span>${esc(r.party || "—")}</span><span>${r.total_photos}</span></div>
				<div class="r2">${esc(r.name)} · ${r.selection_date ? frappe.datetime.str_to_user(r.selection_date) : ""}${r.batch ? " · " + esc(r.batch) : ""}</div>
			</div>`).join("") : `<div class="sp-none" style="padding:24px;">${__("No selections.")}</div>`);

		const items = m.items || [];
		root.find(".sp-grid").html(items.length ? items.map((p) => `
			<div class="sp-card">
				<img src="${encodeURI(p.image || "")}" loading="lazy" onerror="this.style.visibility='hidden'">
				<div class="cap">${esc(p.code || p.photo)}</div>
				<div class="sub">${esc(p.party || "")} · <a href="/app/selection/${encodeURIComponent(p.selection)}">${esc(p.selection)}</a></div>
			</div>`).join("") : `<div class="sp-none">${__("Nothing selected for these filters.")}</div>`);
	}

	root.on("click", ".sp-pill", function () { S.batch = this.getAttribute("data-b"); S.sel = ""; load(); });
	root.on("click", ".sp-rec", function () {
		const n = this.getAttribute("data-n");
		S.sel = S.sel === n ? "" : n;   // click again to show everything
		load();
	});
	root.find(".sp-clear").on("click", () => {
		S.party = S.batch = S.sel = "";
		party.set_value("");
		fd.set_value("");
		td.set_value("");
		load();
	});

	page.add_inner_button(__("New Selection"), () => frappe.set_route("select-photos"));
	page.add_inner_button(__("Refresh"), load);
	load();
};
