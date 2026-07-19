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
	const S = { photos: [], batch: "", dtp: "", provider: "", tag: "", sel: new Set(), view: 0 };
	const esc = frappe.utils.escape_html;

	$(page.main).append(`
		<style>
		#page-select-photos .container{max-width:100%;}
		.sl2-wrap{display:flex;flex-direction:column;height:calc(100vh - 110px);}
		.sl2-top{flex:0 0 auto;display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin-bottom:8px;}
		.sl2-top .frappe-control{margin:0;flex:0 0 190px;}
		.sl2-top .sl2-rng .frappe-control{flex:0 0 82px;}
		.sl2-rng{display:flex;gap:6px;align-items:end;}
		.sl2-rng .dash{padding-bottom:8px;color:var(--text-muted);}
		.sl2-top .control-label{font-size:11px;color:var(--text-muted);}
		.sl2-pills{flex:0 0 auto;display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px;}
		.sl2-pills .lbl{font-size:10.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;}
		.sl2-pill{border:1px solid var(--border-color);border-radius:12px;padding:2px 12px;font-size:12px;font-weight:600;cursor:pointer;background:var(--control-bg);user-select:none;}
		.sl2-pill.on{background:var(--primary);border-color:var(--primary);color:#fff;}
		.sl2-grid{flex:1 1 auto;overflow-y:auto;min-height:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(165px,1fr));gap:12px;padding:4px 2px 10px;align-content:start;grid-auto-rows:min-content;}
		.sl2-card{border:2px solid var(--border-color);border-radius:9px;overflow:hidden;background:var(--fg-color);cursor:pointer;position:relative;}
		.sl2-card img{width:100%;height:230px;object-fit:contain;display:block;background:#111;}
		.sl2-card .cap{padding:4px 7px;font-size:11.5px;font-weight:700;display:flex;align-items:center;gap:5px;}
		.sl2-card .sub{padding:0 7px 5px;font-size:10.5px;color:var(--text-muted);}
		.sl2-card .stk{margin-left:auto;font-size:9.5px;font-weight:800;padding:1px 7px;border-radius:9px;background:#e8f5e9;color:#2e7d32;}
		.sl2-card .tgs{padding:0 7px 6px;display:flex;gap:4px;flex-wrap:wrap;}
		.sl2-card .tg{font-size:9px;font-weight:700;padding:1px 6px;border-radius:8px;background:var(--subtle-accent);color:var(--text-muted);letter-spacing:.03em;}
		.sl2-vedit{cursor:pointer;font-size:13px;color:#8fd0ff;border:1px solid #35566e;border-radius:6px;padding:3px 14px;}
		.sl2-vedit:hover{background:rgba(143,208,255,.12);}
		.sl2-vtags{display:flex;gap:5px;}
		.sl2-vtags .tg{font-size:10px;font-weight:700;padding:1px 8px;border-radius:9px;background:rgba(255,255,255,.14);color:#dfe6ec;}
		.sl2-card.on{border-color:#2e7d32;box-shadow:0 0 0 2px rgba(46,125,50,.25);}
		.sl2-card .tick{position:absolute;top:6px;right:6px;width:22px;height:22px;border-radius:50%;background:#2e7d32;color:#fff;display:none;align-items:center;justify-content:center;font-size:13px;font-weight:800;}
		.sl2-card.on .tick{display:flex;}
		.sl2-none{padding:40px;text-align:center;color:var(--text-muted);grid-column:1/-1;}
		.sl2-view{position:fixed;inset:0;z-index:1060;background:rgba(0,0,0,.92);display:none;flex-direction:column;}
		.sl2-view.on{display:flex;}
		.sl2-vhead{flex:0 0 auto;display:flex;align-items:center;gap:14px;padding:10px 18px;color:#fff;}
		.sl2-vhead .code{font-size:19px;font-weight:800;letter-spacing:.5px;}
		.sl2-vhead .meta{font-size:13px;color:#bfc7cf;}
		.sl2-vhead .count{margin-left:auto;font-size:13px;color:#bfc7cf;}
		.sl2-vhead .x{cursor:pointer;font-size:24px;line-height:1;color:#fff;padding:0 6px;}
		.sl2-vbody{flex:1 1 auto;display:flex;align-items:center;justify-content:center;min-height:0;position:relative;}
		.sl2-vbody img{max-width:92%;max-height:100%;object-fit:contain;}
		.sl2-nav{position:absolute;top:50%;transform:translateY(-50%);font-size:34px;color:#fff;cursor:pointer;
			background:rgba(0,0,0,.35);border-radius:50%;width:52px;height:52px;display:flex;align-items:center;justify-content:center;user-select:none;}
		.sl2-nav:hover{background:rgba(0,0,0,.6);}
		.sl2-nav.prev{left:14px;} .sl2-nav.next{right:14px;}
		.sl2-vfoot{flex:0 0 auto;display:flex;align-items:center;justify-content:center;gap:14px;padding:14px;}
		.sl2-pick{font-size:16px;font-weight:800;padding:11px 44px;border-radius:8px;border:2px solid #2e7d32;background:#2e7d32;color:#fff;cursor:pointer;}
		.sl2-pick.picked{background:#fff;color:#2e7d32;}
		.sl2-vhint{color:#8c959d;font-size:11.5px;}
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
				<div class="sl2-rng"><div class="sl2-gmin"></div><span class="dash">–</span><div class="sl2-gmax"></div></div>
				<div class="sl2-rng"><div class="sl2-cmin"></div><span class="dash">–</span><div class="sl2-cmax"></div></div>
				<button class="btn btn-default sl2-clear">${__("Clear picks")}</button>
			</div>
			<div class="sl2-pills sl2-dtypes"></div>
			<div class="sl2-pills sl2-tagrow"></div>
			<div class="sl2-pills sl2-more"></div>
			<div class="sl2-grid"></div>
			<div class="sl2-view">
				<div class="sl2-vhead">
					<span class="code sl2-vcode"></span><span class="meta sl2-vmeta"></span>
					<span class="sl2-vtags"></span>
					<span class="sl2-vedit">${__("Edit")}</span>
					<span class="count sl2-vcount"></span><span class="x sl2-vclose">&times;</span>
				</div>
				<div class="sl2-vbody">
					<span class="sl2-nav prev">&#8249;</span>
					<img class="sl2-vimg" src="">
					<span class="sl2-nav next">&#8250;</span>
				</div>
				<div class="sl2-vfoot">
					<button class="sl2-pick"></button>
					<span class="sl2-vhint">${__("← → browse · Space picks · Esc closes")}</span>
				</div>
			</div>
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
	const gmin = mk(".sl2-gmin", { fieldtype: "Float", label: __("Gold g from"), fieldname: "gmin" });
	const gmax = mk(".sl2-gmax", { fieldtype: "Float", label: __("to"), fieldname: "gmax" });
	const cmin = mk(".sl2-cmin", { fieldtype: "Float", label: __("Ct from"), fieldname: "cmin" });
	const cmax = mk(".sl2-cmax", { fieldtype: "Float", label: __("to"), fieldname: "cmax" });
	dt.set_value(frappe.datetime.get_today());
	search.$input.on("input", frappe.utils.debounce(() => load(), 400));
	[gmin, gmax, cmin, cmax].forEach((c) => c.$input.on("input", frappe.utils.debounce(() => load(), 500)));

	function load() {
		frappe.call({ method: API + ".get_selection_photos",
			args: { batch: S.batch || null, design_type: S.dtp || null, provider: S.provider || null,
				tag: S.tag || null, search: (search.get_value() || "").trim() || null,
				gold_min: gmin.get_value() || null, gold_max: gmax.get_value() || null,
				cts_min: cmin.get_value() || null, cts_max: cmax.get_value() || null } }).then((r) => {
			const m = r.message || {};
			S.photos = m.photos || [];
			paintPills(m);
			paintGrid();
		});
	}

	const pillRow = (lbl, list, cur, key) => (list.length
		? `<span class="lbl">${lbl}</span>
		   <span class="sl2-pill ${cur ? "" : "on"}" data-k="${key}" data-v="">${__("All")}</span>` +
		  list.map((b) => `<span class="sl2-pill ${cur === b ? "on" : ""}" data-k="${key}" data-v="${esc(b)}">${esc(b)}</span>`).join("")
		: "");

	function paintPills(m) {
		// levels: provider · design type · tags (no batch filter — the batch only
		// lives on the record)
		root.find(".sl2-dtypes").html(
			pillRow(__("Provider"), m.providers || [], S.provider, "provider"));
		root.find(".sl2-tagrow").html(
			pillRow(__("Design Type"), m.design_types || [], S.dtp, "dtp"));
		const tags = m.tags || [];
		root.find(".sl2-more").html(tags.length
			? `<span class="lbl">${__("Tags")}</span>
			   <span class="sl2-pill ${S.tag ? "" : "on"}" data-k="tag" data-v="">${__("All")}</span>` +
			  tags.map((t) => {
				const on = S.tag === t.tag;
				const c = t.color || "#6b7280";
				return `<span class="sl2-pill ${on ? "on" : ""}" data-k="tag" data-v="${esc(t.tag)}"
					style="${on ? `background:${c};border-color:${c};color:#fff;` : `border-color:${c};`}">
					<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${on ? "#fff" : c};margin-right:5px;"></span>${esc(t.tag)}</span>`;
			  }).join("")
			: "");
	}

	function paintGrid() {
		root.find(".sl2-grid").html(S.photos.length ? S.photos.map((p) => `
			<div class="sl2-card ${S.sel.has(p.name) ? "on" : ""}" data-n="${esc(p.name)}">
				<div class="tick">✓</div>
				<img src="${encodeURI(p.image || "")}" loading="lazy" onerror="this.style.visibility='hidden'">
				<div class="cap">${esc(p.code)}${p.stock_pcs ? `<span class="stk">${p.stock_pcs} ${__("in stock")}</span>` : ""}</div>
				<div class="sub">${[
					p.gold_gms ? p.gold_gms.toFixed(2) + " g" : "",
					p.cts ? p.cts.toFixed(2) + " ct" : "",
					p.design_type ? esc(p.design_type) : "",
				].filter(Boolean).join(" · ")}</div>
				${(p.tags || []).length ? `<div class="tgs">${p.tags.map((t) => `<span class="tg">${esc(t)}</span>`).join("")}</div>` : ""}
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

	// a card opens the photo full screen — picking happens in there
	root.on("click", ".sl2-card", function () {
		openViewer(S.photos.findIndex((p) => p.name === this.getAttribute("data-n")));
	});

	function openViewer(i) {
		if (i < 0 || !S.photos[i]) return;
		S.view = i;
		const p = S.photos[i];
		root.find(".sl2-vimg").attr("src", encodeURI(p.image || ""));
		root.find(".sl2-vcode").text(p.code);
		root.find(".sl2-vmeta").text([
			p.gold_gms ? p.gold_gms.toFixed(2) + " g" : "",
			p.cts ? p.cts.toFixed(2) + " ct" : "",
			p.design_type || "",
			p.provider || "",
			p.stock_pcs ? __("{0} pcs in stock", [p.stock_pcs]) : "",
		].filter(Boolean).join(" · "));
		root.find(".sl2-vtags").html((p.tags || []).map((t) => `<span class="tg">${esc(t)}</span>`).join(""));
		root.find(".sl2-vcount").text(__("{0} of {1} · {2} picked", [i + 1, S.photos.length, S.sel.size]));
		paintPick();
		root.find(".sl2-view").addClass("on");
	}
	function paintPick() {
		const p = S.photos[S.view];
		const picked = p && S.sel.has(p.name);
		root.find(".sl2-pick").toggleClass("picked", !!picked)
			.text(picked ? __("✓ Selected — click to remove") : __("Select this"));
	}
	function togglePick() {
		const p = S.photos[S.view];
		if (!p) return;
		S.sel.has(p.name) ? S.sel.delete(p.name) : S.sel.add(p.name);
		root.find(`.sl2-card[data-n="${p.name}"]`).toggleClass("on", S.sel.has(p.name));
		paintPick();
		root.find(".sl2-vcount").text(__("{0} of {1} · {2} picked", [S.view + 1, S.photos.length, S.sel.size]));
		sum();
	}
	const step = (d) => openViewer((S.view + d + S.photos.length) % S.photos.length);
	const closeViewer = () => root.find(".sl2-view").removeClass("on");

	root.find(".sl2-pick").on("click", togglePick);
	root.find(".sl2-vclose").on("click", closeViewer);
	root.find(".sl2-nav.prev").on("click", () => step(-1));
	root.find(".sl2-nav.next").on("click", () => step(1));
	root.find(".sl2-view").on("click", (e) => { if (e.target === root.find(".sl2-view").get(0)) closeViewer(); });
	$(document).on("keydown.sl2", (e) => {
		if (!root.find(".sl2-view").hasClass("on")) return;
		if (e.key === "Escape") closeViewer();
		else if (e.key === "ArrowLeft") step(-1);
		else if (e.key === "ArrowRight") step(1);
		else if (e.key === " " || e.key === "Enter") togglePick();
		else return;
		e.preventDefault();
	});
	root.on("click", ".sl2-pill", function () {
		S[this.getAttribute("data-k")] = this.getAttribute("data-v");
		load();
	});

	// --- Edit from the viewer: design type / provider / stock / tags ----------
	root.find(".sl2-vedit").on("click", () => {
		const p = S.photos[S.view];
		if (!p) return;
		const d = new frappe.ui.Dialog({
			title: __("Edit {0}", [p.code]),
			fields: [
				{ fieldtype: "Link", fieldname: "design_type", label: __("Design Type"),
					options: "Design Type", default: p.design_type || "" },
				{ fieldtype: "Link", fieldname: "provider", label: __("Provider"),
					options: "Supplier", default: p.provider || "" },
				{ fieldtype: "Int", fieldname: "stock_pcs", label: __("Stock (pcs)"),
					default: p.stock_pcs || 0 },
				{ fieldtype: "Data", fieldname: "tags", label: __("Tags"),
					default: (p.tags || []).join(", "),
					description: __("comma separated — new tags are created automatically") },
			],
			primary_action_label: __("Save"),
			primary_action: (v) => {
				d.hide();
				frappe.call({ method: API + ".update_selection_photo", args: {
					name: p.name, design_type: v.design_type || "", provider: v.provider || "",
					stock_pcs: v.stock_pcs || 0,
					tags: (v.tags || "").split(",").map((t) => t.trim()).filter(Boolean),
				} }).then((r) => {
					Object.assign(p, r.message || {});
					frappe.show_alert({ message: __("Saved."), indicator: "green" }, 3);
					paintGrid();
					openViewer(S.view);
				});
			},
		});
		d.show();
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
	page.add_inner_button(__("Export / Import"), () => frappe.set_route("selection-transfer"));
	page.add_inner_button(__("Manage Tags"), () => frappe.set_route("selection-tags"));
	page.add_inner_button(__("Providers"), () => frappe.set_route("selection-providers"));
	page.add_inner_button(__("Refresh"), load);
	// arriving from Selection Tags / Providers with a filter pre-picked
	if (frappe.route_options) {
		if (frappe.route_options.tag) S.tag = frappe.route_options.tag;
		if (frappe.route_options.provider) S.provider = frappe.route_options.provider;
		frappe.route_options = null;
	}
	load();
};
