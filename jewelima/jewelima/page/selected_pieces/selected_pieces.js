// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Selected Pieces (Selection > Selected Pieces) — what has been selected, and by
// whom. Filter by party / batch / date; the left rail lists the selection records
// (click one to focus it), the right shows the actual picked photos.
//
// Two things can be changed here: a piece's NOTE — what the party asked for on
// it ("no round diamond", "create as pendant"), written in the viewer and saved
// against the pick as you leave the box — and, once a record is focused, which
// pieces the party is keeping.
// Route: /app/selected-pieces

frappe.pages["selected-pieces"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Selected Pieces", single_column: true });
	const API = "jewelima.jewelima.api";
	const S = { party: "", batch: "", sel: "", data: null, keep: null, view: 0 };
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
		.sp-card.pick{cursor:pointer;}
		.sp-card.gone{opacity:.35;}
		.sp-card.gone .cap:after{content:" — removed";color:var(--red-600,#c0392b);font-weight:700;}
		.sp-editbar{flex:0 0 auto;display:none;align-items:center;gap:12px;background:var(--control-bg);border:1px solid var(--border-color);
			border-radius:9px;padding:7px 14px;margin-bottom:8px;}
		.sp-editbar.on{display:flex;}
		.sp-editbar .msg{font-size:12.5px;}
		.sp-editbar .sp-update{margin-left:auto;font-weight:700;background:#2e7d32;border-color:#2e7d32;color:#fff;}
		.sp-view{position:fixed;inset:0;z-index:1060;background:rgba(0,0,0,.92);display:none;flex-direction:column;}
		.sp-view.on{display:flex;}
		/* the note is written here, against the piece, and saves as you leave the box */
		.sp-vnoteedit{flex:1 1 320px;max-width:520px;font-size:13px;padding:9px 13px;border-radius:8px;
			border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#eef2f6;}
		.sp-vnoteedit::placeholder{color:#9aa6b2;}
		.sp-vnoteedit:focus{outline:none;border-color:#b4690e;background:rgba(255,255,255,.14);}
		.sp-vsaved{display:none;font-size:11.5px;font-weight:700;color:#7ed492;}
		.sp-vsaved.on{display:inline;}
		.sp-card{position:relative;}
		.sp-card .noted{position:absolute;top:6px;left:6px;font-size:10px;font-weight:800;
			padding:1px 7px;border-radius:9px;background:#b4690e;color:#fff;}
		.sp-vhead{flex:0 0 auto;display:flex;align-items:center;gap:14px;padding:10px 18px;color:#fff;}
		.sp-vhead .code{font-size:19px;font-weight:800;letter-spacing:.5px;}
		.sp-vhead .meta{font-size:13px;color:#bfc7cf;}
		.sp-vhead .count{margin-left:auto;font-size:13px;color:#bfc7cf;}
		.sp-vhead .x{cursor:pointer;font-size:24px;line-height:1;color:#fff;padding:0 6px;}
		.sp-vbody{flex:1 1 auto;display:flex;align-items:center;justify-content:center;min-height:0;position:relative;}
		.sp-vbody img{max-width:92%;max-height:100%;object-fit:contain;}
		.sp-nav{position:absolute;top:50%;transform:translateY(-50%);font-size:34px;color:#fff;cursor:pointer;background:rgba(0,0,0,.35);
			border-radius:50%;width:52px;height:52px;display:flex;align-items:center;justify-content:center;user-select:none;}
		.sp-nav:hover{background:rgba(0,0,0,.6);} .sp-nav.prev{left:14px;} .sp-nav.next{right:14px;}
		.sp-vfoot{flex:0 0 auto;display:flex;align-items:center;justify-content:center;gap:14px;padding:14px;}
		.sp-keep{font-size:16px;font-weight:800;padding:11px 40px;border-radius:8px;cursor:pointer;border:2px solid #2e7d32;background:#2e7d32;color:#fff;}
		.sp-keep.out{border-color:#c0392b;background:#fff;color:#c0392b;}
		.sp-vhint{color:#8c959d;font-size:11.5px;}
		</style>
		<div class="sp-wrap">
			<div class="sp-top">
				<div class="sp-party"></div><div class="sp-from"></div><div class="sp-to"></div>
				<button class="btn btn-default sp-clear">${__("Clear filters")}</button>
			</div>
			<div class="sp-pills sp-batches"></div>
			<div class="sp-tiles"></div>
			<div class="sp-editbar">
				<span class="msg sp-emsg"></span>
				<button class="btn btn-xs btn-default sp-reset">${__("Reset")}</button>
				<button class="btn btn-sm sp-update">${__("Update Selection")}</button>
			</div>
			<div class="sp-view">
				<div class="sp-vhead">
					<span class="code sp-vcode"></span><span class="meta sp-vmeta"></span>
					<span class="sp-vnote"></span>
					<span class="count sp-vcount"></span><span class="x sp-vclose">&times;</span>
				</div>
				<div class="sp-vbody">
					<span class="sp-nav prev">&#8249;</span>
					<img class="sp-vimg" src="">
					<span class="sp-nav next">&#8250;</span>
				</div>
				<div class="sp-vfoot">
					<button class="sp-keep"></button>
					<input class="sp-vnoteedit" placeholder="${
						__("Note for this piece — e.g. no round diamond, create as pendant")}">
					<span class="sp-vsaved">${__("saved")}</span>
					<span class="sp-vhint">${__("← → browse · Space keeps/removes · Esc closes")}</span>
				</div>
			</div>
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
			[__("18K g"), (m.total_gold_18k || 0).toFixed(3)],
			[__("14K g"), (m.total_gold_14k || 0).toFixed(3)],
			[__("9K g"), (m.total_gold_9k || 0).toFixed(3)],
			[__("Dia pcs"), m.total_dmd_no || 0],
			[__("Dia ct"), (m.total_dmd_weight || 0).toFixed(3)],
			[__("CS pcs"), m.total_cs_no || 0],
			[__("CS ct"), (m.total_cs_weight || 0).toFixed(3)],
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
		// focusing ONE record turns the grid into a review pass: click to open big,
		// unselect what the party dropped, then Update Selection.
		const editing = !!S.sel && !!S.keep;
		root.find(".sp-grid").html(items.length ? items.map((p, i) => `
			<div class="sp-card ${editing ? "pick" : ""} ${editing && !S.keep.has(p.photo) ? "gone" : ""}" data-i="${i}" data-p="${esc(p.photo)}">
				<img src="${encodeURI(p.image || "")}" loading="lazy" onerror="this.style.visibility='hidden'">
				${p.note ? `<span class="noted" title="${esc(p.note)}">${__("note")}</span>` : ""}
				<div class="cap">${esc(p.code || p.photo)}</div>
				<div class="sub">${esc(p.party || "")} · <a href="/app/selection/${encodeURIComponent(p.selection)}">${esc(p.selection)}</a></div>
			</div>`).join("") : `<div class="sp-none">${__("Nothing selected for these filters.")}</div>`);
		paintEditBar();
	}

	function paintEditBar() {
		const editing = !!S.sel && !!S.keep;
		root.find(".sp-editbar").toggleClass("on", editing);
		if (!editing) return;
		const total = (S.data.items || []).length;
		const dropped = total - S.keep.size;
		root.find(".sp-emsg").html(dropped
			? __("<b>{0}</b>: keeping <b>{1}</b> of {2} — {3} removed.", [S.sel, S.keep.size, total, dropped])
			: __("<b>{0}</b>: {1} photo(s). Click a photo to review it · PDF is in the top bar.", [S.sel, total]));
		root.find(".sp-update").prop("disabled", !dropped || !S.keep.size);
	}

	// ---- fullscreen review: open big, keep or remove ---------------------------
	function openViewer(i) {
		const items = (S.data || {}).items || [];
		if (!items[i]) return;
		S.view = i;
		const p = items[i];
		root.find(".sp-vimg").attr("src", encodeURI(p.image || ""));
		root.find(".sp-vcode").text(p.code || p.photo);
		const gold = ["18k", "14k", "9k"].filter((k) => p["gold_" + k])
			.map((k) => `${k.toUpperCase()} ${p["gold_" + k].toFixed(2)} g`).join(" · ");
		const stones = [
			p.dmd_weight || p.dmd_no ? `DIA ${p.dmd_no || 0}/${(p.dmd_weight || 0).toFixed(2)} ct` : "",
			p.cs_weight || p.cs_no ? `CS ${p.cs_no || 0}/${(p.cs_weight || 0).toFixed(2)} ct` : "",
		].filter(Boolean).join(" · ");
		root.find(".sp-vmeta").text([gold, stones].filter(Boolean).join(" · "));
		root.find(".sp-vnote").text(p.note || "").toggle(!!p.note);
		root.find(".sp-vnoteedit").val(p.note || "");
		root.find(".sp-vsaved").removeClass("on");
		paintKeep();
		root.find(".sp-keep").toggle(!!(S.sel && S.keep));
		root.find(".sp-view").addClass("on");
	}
	function paintKeep() {
		const items = (S.data || {}).items || [];
		const p = items[S.view];
		if (!p) return;
		const kept = S.keep ? S.keep.has(p.photo) : true;
		root.find(".sp-keep").toggleClass("out", !kept)
			.text(kept ? __("✓ Selected — click to remove") : __("✕ Removed — click to keep"));
		root.find(".sp-vcount").text(__("{0} of {1} · keeping {2}", [S.view + 1, items.length, S.keep ? S.keep.size : items.length]));
	}
	function toggleKeep() {
		if (!S.keep) return;
		const p = ((S.data || {}).items || [])[S.view];
		if (!p) return;
		S.keep.has(p.photo) ? S.keep.delete(p.photo) : S.keep.add(p.photo);
		root.find(`.sp-card[data-p="${p.photo}"]`).toggleClass("gone", !S.keep.has(p.photo));
		paintKeep();
		paintEditBar();
	}
	const stepV = (d) => {
		const n = ((S.data || {}).items || []).length;
		if (n) openViewer((S.view + d + n) % n);
	};
	const closeViewer = () => root.find(".sp-view").removeClass("on");

	root.on("click", ".sp-card", function () { openViewer(cint(this.getAttribute("data-i"))); });

	// the note saves against the piece as you leave the box, or on Enter
	function saveNote($input) {
		const items = (S.data || {}).items || [];
		const p = items[S.view];
		if (!p) return;
		const val = ($input.val() || "").trim();
		if (val === (p.note || "")) return;          // nothing changed
		// Enter blurs, and blur saves — without this the two fire together and
		// the second save of the same document comes back a conflict
		if (p._saving) return;
		p._saving = true;
		frappe.call({ method: API + ".set_selection_note", freeze: false,
			args: { selection: p.selection, photo: p.photo, note: val } })
			.then(() => {
				p.note = val || null;
				root.find(".sp-vnote").text(val).toggle(!!val);
				root.find(".sp-vsaved").addClass("on");
				setTimeout(() => root.find(".sp-vsaved").removeClass("on"), 1400);
				// keep the grid marker honest without redrawing the whole board
				const $card = root.find(`.sp-card[data-i="${S.view}"]`);
				$card.find(".noted").remove();
				if (val) $card.append(`<span class="noted" title="${frappe.utils.escape_html(val)}">${__("note")}</span>`);
			})
			.fail(() => frappe.show_alert({ message: __("That note did not save."), indicator: "red" }, 5))
			.always(() => { p._saving = false; });
	}
	root.on("blur", ".sp-vnoteedit", function () { saveNote($(this)); });
	root.on("keydown", ".sp-vnoteedit", function (e) {
		e.stopPropagation();                          // Space must type, not keep/remove
		if (e.key === "Enter") { e.preventDefault(); this.blur(); }   // blur saves it
	});
	root.find(".sp-keep").on("click", toggleKeep);
	root.find(".sp-vclose").on("click", closeViewer);
	root.find(".sp-nav.prev").on("click", () => stepV(-1));
	root.find(".sp-nav.next").on("click", () => stepV(1));
	root.find(".sp-view").on("click", (e) => { if (e.target === root.find(".sp-view").get(0)) closeViewer(); });
	$(document).on("keydown.sp", (e) => {
		if (!root.find(".sp-view").hasClass("on")) return;
		if (e.key === "Escape") closeViewer();
		else if (e.key === "ArrowLeft") stepV(-1);
		else if (e.key === "ArrowRight") stepV(1);
		else if (e.key === " " || e.key === "Enter") toggleKeep();
		else return;
		e.preventDefault();
	});

	root.find(".sp-reset").on("click", () => {
		S.keep = new Set(((S.data || {}).items || []).map((p) => p.photo));
		paint();
	});
	root.find(".sp-update").on("click", () => {
		if (!S.sel || !S.keep) return;
		const dropped = ((S.data || {}).items || []).length - S.keep.size;
		frappe.confirm(__("Update <b>{0}</b> — keep {1} photo(s), remove {2}?", [S.sel, S.keep.size, dropped]), () => {
			frappe.dom.freeze(__("Updating..."));
			frappe.call({ method: API + ".update_selection", args: { name: S.sel, photos: [...S.keep] } })
				.then((r) => {
					frappe.dom.unfreeze();
					const m = r.message || {};
					frappe.show_alert({ message: __("{0} updated — {1} photo(s).", [m.name, m.total_photos]), indicator: "green" }, 6);
					S.keep = null;
					load();   // reload the record, fresh keep-set on focus
				})
				.catch(() => frappe.dom.unfreeze());
		});
	});

	root.on("click", ".sp-pill", function () { S.batch = this.getAttribute("data-b"); S.sel = ""; load(); });
	root.on("click", ".sp-rec", function () {
		const n = this.getAttribute("data-n");
		S.sel = S.sel === n ? "" : n;   // click again to show everything
		S.keep = null;                  // seeded once the focused record loads
		frappe.call({ method: API + ".get_selected_pieces", args: {
			party: party.get_value() || null, batch: S.batch || null,
			from_date: fd.get_value() || null, to_date: td.get_value() || null,
			selection: S.sel || null,
		} }).then((r) => {
			S.data = r.message || {};
			if (S.sel) S.keep = new Set((S.data.items || []).map((p) => p.photo));
			paint();
		});
	});
	root.find(".sp-clear").on("click", () => {
		S.party = S.batch = S.sel = "";
		S.keep = null;
		party.set_value("");
		fd.set_value("");
		td.set_value("");
		load();
	});

	function pdf() {
		if (!S.sel) return frappe.msgprint(__("Pick a selection from the list first."));
		window.open("/api/method/frappe.utils.print_format.download_pdf?doctype=" + encodeURIComponent("Selection") +
			"&name=" + encodeURIComponent(S.sel) + "&format=" + encodeURIComponent("Selection Sheet") + "&no_letterhead=1", "_blank");
	}
	page.add_inner_button(__("PDF"), pdf);
	page.add_inner_button(__("New Selection"), () => frappe.set_route("select-photos"));
	page.add_inner_button(__("Refresh"), load);
	load();
};
