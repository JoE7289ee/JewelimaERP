// Import Old Stock (Stock > Import Old Stock) — the old software's stock, taken
// in piece by piece.
//
// The quotation excel gives weights, design codes and stone counts. What it
// cannot give is the COLOUR of each piece and WHICH stone every diamond line
// really is — so the sheet is worked on over as many sittings as it takes, and
// only a complete one may be imported. Designs are not created here: a code the
// system does not know is reported so it can be made in the Design Bank first.
// Route: /app/import-old-stock
frappe.pages["import-old-stock"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Import Old Stock"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const cint = (v) => parseInt(v, 10) || 0;
	const g3 = (v) => flt(v).toFixed(3);
	const S = { session: null, sel: new Set(), q: "", filter: "all", dirty: false };

	$(page.main).append(`
		<style>
		#page-import-old-stock .container{max-width:100%;}
		.os-wrap{max-width:100%;}
		.os-top{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px;}
		.os-title{font-size:15px;font-weight:800;}
		.os-badge{font-size:11px;padding:2px 10px;border-radius:999px;font-weight:700;}
		.os-badge.draft{background:#fdf3e3;color:#8a5a00;border:1px solid #e6c98f;}
		.os-badge.ready{background:#eaf6ec;color:#1d7a33;border:1px solid #bfe3c6;}
		.os-badge.imported{background:#e9f0f7;color:#1f618d;border:1px solid #b9d0e6;}

		.os-tiles{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;}
		.os-tile{border:1px solid var(--border-color);border-radius:11px;background:var(--fg-color);
			padding:10px 15px;min-width:118px;}
		.os-tile .k{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);}
		.os-tile .v{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums;}
		.os-tile .s{font-size:10.5px;color:var(--text-muted);}
		.os-tile.warn{border-color:#e6c98f;background:#fdf9f1;} .os-tile.warn .v{color:#8a5a00;}
		.os-tile.ok .v{color:#1d7a33;}

		.os-split{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;}
		.os-main{flex:1 1 640px;min-width:520px;}
		.os-side{flex:0 0 310px;}
		.os-box{border:1px solid var(--border-color);border-radius:11px;background:var(--fg-color);
			padding:12px 14px;margin-bottom:12px;}
		.os-box .h{font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;
			color:var(--text-muted);margin-bottom:8px;}

		.os-bar{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-bottom:9px;}
		.os-pill{border:1px solid var(--border-color);background:var(--fg-color);color:var(--text-muted);
			border-radius:999px;padding:4px 12px;font-size:11.5px;cursor:pointer;font-weight:600;}
		.os-pill.on{background:#1f618d;border-color:#1f618d;color:#fff;}
		.os-q{width:200px;border:1px solid var(--border-color);border-radius:8px;height:29px;padding:2px 11px;
			background:var(--fg-color);color:var(--text-color);font-size:12.5px;}

		.os-gridbox{max-height:60vh;overflow:auto;border:1px solid var(--border-color);border-radius:9px;}
		table.os-t{width:100%;border-collapse:separate;border-spacing:0;font-size:12px;background:var(--fg-color);}
		table.os-t th{position:sticky;top:0;z-index:2;background:var(--fg-color);text-align:left;
			font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);
			border-bottom:1px solid var(--border-color);padding:7px 7px;font-weight:700;white-space:nowrap;}
		table.os-t td{padding:5px 7px;border-bottom:1px solid var(--border-color);white-space:nowrap;}
		table.os-t td.num{text-align:right;font-variant-numeric:tabular-nums;}
		table.os-t tr.sel td{background:#eaf2fa;}
		table.os-t tr.bad td{background:#fdf9f1;}
		.os-need{color:#b4690e;font-weight:700;font-size:11px;}
		.os-ok{color:#1d7a33;font-weight:700;}
		.os-mini{border:1px solid var(--border-color);border-radius:6px;padding:2px 5px;font-size:11.5px;
			background:var(--fg-color);color:var(--text-color);max-width:180px;}
		.os-stones{font-size:11px;color:var(--text-muted);}
		.os-empty{padding:40px;text-align:center;color:var(--text-muted);}
		.os-missing{font-size:12px;}
		.os-missing div{padding:3px 0;border-bottom:1px solid var(--border-color);}
		.os-act{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;}
		.os-side label{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.05em;
			color:var(--text-muted);margin:9px 0 3px;}
		</style>
		<div class="os-wrap">
			<div class="os-top"></div>
			<div class="os-tiles"></div>
			<div class="os-split">
				<div class="os-main">
					<div class="os-box">
						<div class="os-bar">
							<span class="os-pill on" data-f="all">${__("All")}</span>
							<span class="os-pill" data-f="todo">${__("Needs work")}</span>
							<span class="os-pill" data-f="done">${__("Done")}</span>
							<input class="os-q" placeholder="${__("Filter id, design or item")}">
							<span style="flex:1;"></span>
							<span class="os-selinfo" style="font-size:11.5px;color:var(--text-muted);"></span>
						</div>
						<div class="os-bulk"></div>
						<div class="os-gridbox"><table class="os-t">
							<thead><tr>
								<th style="width:24px;"><input type="checkbox" class="os-all"></th>
								<th>${__("Old ID")}</th><th>${__("Item")}</th><th>${__("Design code")}</th>
								<th class="num">${__("Gross")}</th><th class="num">${__("Nett")}</th>
								<th>${__("Karat")}</th><th>${__("Colour")}</th><th>${__("Design")}</th>
								<th>${__("Stones")}</th>
							</tr></thead><tbody class="os-body"></tbody>
						</table></div>
					</div>
				</div>
				<div class="os-side"></div>
			</div>
		</div>`);
	const root = $(page.main);

	// ---- sessions ---------------------------------------------------------
	function openSessions() {
		frappe.call({ method: API + ".list_old_stock_sessions" }).then((r) => {
			const rows = r.message || [];
			const d = new frappe.ui.Dialog({ title: __("Old stock imports"), size: "large" });
			$(d.body).html(rows.length ? `
				<table class="os-t"><thead><tr>
					<th>${__("Title")}</th><th>${__("Status")}</th><th class="num">${__("Pieces")}</th>
					<th>${__("Job Order")}</th><th>${__("Touched")}</th>
				</tr></thead><tbody>${rows.map((x) => `
					<tr class="os-pick" data-n="${esc(x.name)}" style="cursor:pointer;">
						<td><b>${esc(x.title || x.name)}</b></td>
						<td>${esc(x.status)}</td><td class="num">${x.piece_count || 0}</td>
						<td>${esc(x.job_order || "—")}</td>
						<td>${esc((x.modified || "").slice(0, 16))}</td>
					</tr>`).join("")}</tbody></table>`
				: `<div class="os-empty">${__("Nothing imported yet — start by loading an excel.")}</div>`);
			$(d.body).on("click", ".os-pick", function () {
				d.hide();
				frappe.set_route("import-old-stock", $(this).data("n"));
			});
			d.show();
		});
	}

	function loadExcel() {
		new frappe.ui.FileUploader({
			as_dataurl: true, allow_multiple: false,
			on_success: (file) => {
				frappe.dom.freeze(__("Reading the sheet…"));
				frappe.call({ method: API + ".parse_old_stock_excel",
					args: { filedata: file.dataurl, source_file: file.file_name } })
					.then((r) => {
						S.session = r.message; S.sel.clear(); paint();
						frappe.set_route("import-old-stock", r.message.name);
					})
					.always(() => frappe.dom.unfreeze());
			},
		});
	}

	function load(name) {
		frappe.call({ method: API + ".get_old_stock_session", args: { name } })
			.then((r) => { S.session = r.message; S.sel.clear(); S.dirty = false; paint(); });
	}

	function save(extra) {
		if (!S.session) return Promise.resolve();
		const a = Object.assign({ name: S.session.name, pieces: JSON.stringify(S.session.pieces) }, extra || {});
		return frappe.call({ method: API + ".save_old_stock_session", args: a }).then((r) => {
			const m = r.message || {};
			S.session.status = m.status;
			S.session.review = m.review;
			S.dirty = false;
			paint();
		});
	}

	// ---- helpers ----------------------------------------------------------
	const pieces = () => (S.session && S.session.pieces) || [];
	const opts = () => (S.session && S.session.options) || { colours: [], sieves: [], stones: [] };
	function needs(p) {
		const want = cint(p.dmd_pcs) + cint(p.ps_pcs) + cint(p.stn_pcs);
		const got = (p.stones || []).reduce((a, s) => a + cint(s.pcs), 0);
		const list = [];
		if (!p.colour) list.push(__("colour"));
		if (!p.design) list.push(__("design"));
		if (want && got !== want) list.push(__("stones"));
		return list;
	}
	function visible() {
		const q = S.q.trim().toLowerCase();
		return pieces().filter((p) => {
			if (S.filter === "todo" && !needs(p).length) return false;
			if (S.filter === "done" && needs(p).length) return false;
			if (!q) return true;
			return String(p.legacy_id || "").toLowerCase().includes(q)
				|| String(p.design_code || "").toLowerCase().includes(q)
				|| String(p.design || "").toLowerCase().includes(q)
				|| String(p.item || "").toLowerCase().includes(q);
		});
	}

	// ---- paint ------------------------------------------------------------
	function paint() {
		if (!S.session) {
			root.find(".os-top").html(`<span class="os-title">${__("Import Old Stock")}</span>
				<span style="color:var(--text-muted);font-size:12.5px;">${
					__("Load the old software's quotation excel to begin.")}</span>`);
			root.find(".os-tiles, .os-side, .os-bulk").html("");
			root.find(".os-body").html(`<tr><td colspan="10" class="os-empty">${
				__("No sheet loaded.")}</td></tr>`);
			return;
		}
		const S1 = S.session, rev = S1.review || {}, t = rev.totals || {};
		const st = (S1.status || "Draft").toLowerCase();
		root.find(".os-top").html(`
			<span class="os-title">${esc(S1.title || S1.name)}</span>
			<span class="os-badge ${st}">${esc(S1.status)}</span>
			<span style="color:var(--text-muted);font-size:11.5px;">${esc(S1.source_file || "")}</span>
			${S1.job_order ? `<span style="font-size:11.5px;">${__("Job Order")} <b>${esc(S1.job_order)}</b></span>` : ""}
			${S.dirty ? `<span style="color:#b4690e;font-size:11.5px;">${__("unsaved")}</span>` : ""}`);

		const blockers = rev.blockers || [];
		root.find(".os-tiles").html(`
			<div class="os-tile"><div class="k">${__("Pieces")}</div><div class="v">${rev.pieces || 0}</div>
				<div class="s">${t.designs || 0} ${__("designs")} · ${t.types || 0} ${__("types")}</div></div>
			<div class="os-tile"><div class="k">${__("Gold")}</div><div class="v">${g3(t.nett)}<span style="font-size:11px;"> g</span></div>
				<div class="s">${__("gross")} ${g3(t.gross)} · ${__("pure")} ${g3(t.pure)}</div></div>
			<div class="os-tile"><div class="k">${__("Diamonds")}</div><div class="v">${t.dmd_pcs || 0}</div>
				<div class="s">${g3(t.dmd_ct)} ct</div></div>
			<div class="os-tile"><div class="k">${__("Other stones")}</div><div class="v">${t.other_pcs || 0}</div>
				<div class="s">${g3(t.other_ct)} ct</div></div>
			<div class="os-tile"><div class="k">${__("Sieve brackets")}</div><div class="v">${(rev.sieves || []).length}</div>
				<div class="s">${(rev.stones || []).length} ${__("stone type(s)")}</div></div>
			${blockers.length
				? `<div class="os-tile warn"><div class="k">${__("Still to do")}</div>
					<div class="v">${blockers.reduce((a, b) => a + b.count, 0)}</div>
					<div class="s">${blockers.map((b) => `${b.count} ${esc(b.what)}`).join(" · ")}</div></div>`
				: `<div class="os-tile ok"><div class="k">${__("Ready")}</div><div class="v">✓</div>
					<div class="s">${__("every piece is complete")}</div></div>`}`);

		paintBulk();
		paintRows();
		paintSide();
	}

	function paintBulk() {
		const n = S.sel.size;
		root.find(".os-selinfo").text(n ? __("{0} ticked", [n]) : "");
		if (!n || S.session.status === "Imported") { root.find(".os-bulk").html(""); return; }
		const o = opts();
		root.find(".os-bulk").html(`
			<div class="os-bar" style="background:var(--control-bg);padding:7px 9px;border-radius:8px;">
				<b style="font-size:11.5px;">${__("Apply to {0} ticked", [n])}:</b>
				<select class="os-mini os-bcol"><option value="">${__("colour…")}</option>
					${o.colours.map((c) => `<option value="${esc(c.code)}">${esc(c.label)}</option>`).join("")}</select>
				<select class="os-mini os-bsieve"><option value="">${__("diamond sieve…")}</option>
					${o.sieves.map((s) => `<option value="${esc(s.name)}">${esc(s.label)}</option>`).join("")}</select>
				<select class="os-mini os-bstone"><option value="">${__("diamond item…")}</option>
					${o.stones.map((s) => `<option value="${esc(s.name)}">${esc(s.item_name || s.name)}</option>`).join("")}</select>
				<button class="btn btn-xs btn-primary os-bapply">${__("Apply")}</button>
				<button class="btn btn-xs btn-default os-bclear">${__("Untick all")}</button>
			</div>`);
	}

	function paintRows() {
		const o = opts();
		const locked = S.session.status === "Imported";
		const rows = visible();
		root.find(".os-body").html(rows.length ? rows.map((p) => {
			const nd = needs(p);
			const stones = (p.stones || []).map((s) =>
				`${cint(s.pcs)}× ${esc(s.item || "?")}${s.sieve ? ` (${esc(s.sieve)})` : ""} · ${g3(s.ct)} ct`).join("<br>");
			const want = cint(p.dmd_pcs) + cint(p.ps_pcs) + cint(p.stn_pcs);
			return `<tr class="${S.sel.has(p.legacy_id) ? "sel" : ""} ${nd.length ? "bad" : ""}" data-id="${esc(p.legacy_id)}">
				<td><input type="checkbox" class="os-cb" ${S.sel.has(p.legacy_id) ? "checked" : ""} ${locked ? "disabled" : ""}></td>
				<td><b>${esc(p.legacy_id)}</b>${p.huid ? `<div class="os-stones">${esc(p.huid)}</div>` : ""}</td>
				<td>${esc(p.item || "")}</td>
				<td>${esc(p.design_code || "")}</td>
				<td class="num">${g3(p.gross)}</td>
				<td class="num">${g3(p.nett)}</td>
				<td>${p.karat_label ? esc(p.karat_label) : `<span class="os-need">${__("?")}</span>`}</td>
				<td>${locked ? esc(p.colour || "") : `<select class="os-mini os-col">
					<option value="">—</option>
					${o.colours.map((c) => `<option value="${esc(c.code)}"${p.colour === c.code ? " selected" : ""}>${esc(c.label)}</option>`).join("")}
				</select>`}</td>
				<td>${p.design
					? `<span class="os-ok">${esc(p.design)}</span>`
					: `<span class="os-need">${__("not matched")}</span>`}</td>
				<td>${want
					? (stones || `<span class="os-need">${__("{0} pc(s) unassigned", [want])}</span>`)
					: `<span style="color:var(--text-muted);">${__("none")}</span>`}
					${locked ? "" : `<button class="btn btn-xs btn-default os-stbtn" style="margin-left:6px;">${__("Set")}</button>`}</td>
			</tr>`;
		}).join("") : `<tr><td colspan="10" class="os-empty">${__("Nothing matches.")}</td></tr>`);
	}

	function paintSide() {
		const S1 = S.session, rev = S1.review || {};
		const miss = rev.missing_designs || [];
		const locked = S1.status === "Imported";
		root.find(".os-side").html(`
			${miss.length ? `<div class="os-box" style="border-color:#e6c98f;background:#fdf9f1;">
				<div class="h" style="color:#8a5a00;">${__("Designs to create first ({0})", [miss.length])}</div>
				<div class="os-missing">${miss.map((m) =>
					`<div><b>${esc(m.design)}</b> <span style="color:var(--text-muted);">· ${m.pieces} ${__("pc(s)")}</span></div>`).join("")}</div>
				<div class="os-act"><button class="btn btn-xs btn-default os-designbank">${__("Open Design Bank")}</button>
					<button class="btn btn-xs btn-default os-recheck">${__("Check again")}</button></div>
			</div>` : ""}

			<div class="os-box">
				<div class="h">${__("Gold by colour")}</div>
				${(rev.gold || []).length ? (rev.gold || []).map(([item, n, gms]) =>
					`<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0;">
						<span>${esc(item)} <span style="color:var(--text-muted);">· ${n} ${__("pc")}</span></span>
						<b>${g3(gms)} g</b></div>`).join("")
					: `<div style="color:var(--text-muted);font-size:12px;">${__("set the colours to see this")}</div>`}
			</div>

			<div class="os-box">
				<div class="h">${__("Sieves & stones")}</div>
				${(rev.sieves || []).length ? (rev.sieves || []).map(([sv, pcs, ct]) =>
					`<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0;">
						<span>${esc(sv)}</span><b>${pcs} · ${g3(ct)} ct</b></div>`).join("")
					: `<div style="color:var(--text-muted);font-size:12px;">${__("no stones assigned yet")}</div>`}
				${(rev.stones || []).length ? `<div style="margin-top:7px;border-top:1px solid var(--border-color);padding-top:6px;">
					${(rev.stones || []).map(([it, pcs, ct]) =>
					`<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0;">
						<span>${esc(it)}</span><b>${pcs} · ${g3(ct)} ct</b></div>`).join("")}</div>` : ""}
			</div>

			<div class="os-box">
				<div class="h">${__("Bring it in")}</div>
				<label>${__("Held by")}</label><div class="os-cust"></div>
				<label>${__("Supplier")}</label><div class="os-supp"></div>
				<label>${__("Quality (for design names)")}</label>
				<input class="os-mini os-qual" style="width:100%;" value="${esc(S1.quality_token || "")}" placeholder="EF / GH / SI">
				<div class="os-act">
					<button class="btn btn-sm btn-default os-save" ${locked ? "disabled" : ""}>${__("Save")}</button>
					<button class="btn btn-sm btn-primary os-import" ${locked || !rev.ready ? "disabled" : ""}>${
						locked ? __("Imported") : __("Import {0} piece(s)", [rev.pieces || 0])}</button>
				</div>
				${!locked && !rev.ready ? `<div style="font-size:11.5px;color:#8a5a00;margin-top:7px;">${
					__("Finish every piece before importing.")}</div>` : ""}
			</div>`);

		if (!locked) {
			const mk = (sel, dt, field) => {
				const c = frappe.ui.form.make_control({
					parent: root.find(sel)[0], df: { fieldtype: "Link", options: dt, fieldname: field,
						placeholder: __("Pick…"), onchange: () => { S.dirty = true; } },
					render_input: true,
				});
				c.set_value(S1[field] || "");
				c.$input && c.$input.attr("placeholder", __("Pick…"));
				return c;
			};
			S.custCtl = mk(".os-cust", "Customer", "customer");
			S.suppCtl = mk(".os-supp", "Supplier", "supplier");
		}
	}

	// ---- stone assignment -------------------------------------------------
	function setStones(id) {
		const p = pieces().find((x) => String(x.legacy_id) === String(id));
		if (!p) return;
		const o = opts();
		const want = cint(p.dmd_pcs) + cint(p.ps_pcs) + cint(p.stn_pcs);
		const d = new frappe.ui.Dialog({
			title: __("Stones on {0}", [p.legacy_id]),
			size: "large",
			primary_action_label: __("Save"),
			primary_action: () => {
				const rows = [];
				$(d.body).find(".os-srow").each(function () {
					const item = $(this).find(".s-item").val();
					const pcs = cint($(this).find(".s-pcs").val());
					const ct = flt($(this).find(".s-ct").val());
					const sieve = $(this).find(".s-sieve").val() || "";
					if (item && pcs > 0 && ct > 0) rows.push({ item, pcs, ct, sieve });
				});
				const got = rows.reduce((a, r) => a + r.pcs, 0);
				if (want && got !== want)
					return frappe.msgprint(__("The sheet says {0} stone(s); you have assigned {1}.", [want, got]));
				p.stones = rows;
				d.hide();
				S.dirty = true;
				save();
			},
		});
		const line = (s) => `
			<div class="os-srow" style="display:flex;gap:6px;margin-bottom:6px;align-items:center;">
				<select class="os-mini s-item" style="flex:1 1 200px;">
					<option value="">${__("stone…")}</option>
					${o.stones.map((x) => `<option value="${esc(x.name)}"${s && s.item === x.name ? " selected" : ""}>${esc(x.item_name || x.name)}</option>`).join("")}
				</select>
				<select class="os-mini s-sieve" style="flex:0 0 130px;">
					<option value="">${__("sieve…")}</option>
					${o.sieves.map((x) => `<option value="${esc(x.name)}"${s && s.sieve === x.name ? " selected" : ""}>${esc(x.label)}</option>`).join("")}
				</select>
				<input class="os-mini s-pcs" type="number" min="0" step="1" style="flex:0 0 70px;"
					placeholder="${__("pcs")}" value="${s ? cint(s.pcs) : ""}">
				<input class="os-mini s-ct" type="number" min="0" step="0.001" style="flex:0 0 90px;"
					placeholder="${__("ct")}" value="${s ? s.ct : ""}">
				<button class="btn btn-xs btn-default s-del">&times;</button>
			</div>`;
		$(d.body).html(`
			<div style="font-size:12.5px;margin-bottom:9px;color:var(--text-muted);">
				${__("The sheet says")}: <b>${cint(p.dmd_pcs)}</b> ${__("diamond")}${p.clarity ? ` (${esc(p.clarity)})` : ""}
				· ${g3(p.dmd_ct)} ct${cint(p.ps_pcs) ? ` &middot; <b>${cint(p.ps_pcs)}</b> PS · ${g3(p.ps_ct)} ct` : ""}${
					cint(p.stn_pcs) ? ` &middot; <b>${cint(p.stn_pcs)}</b> STN · ${g3(p.stn_ct)} ct` : ""}
			</div>
			<div class="os-lines">${(p.stones || []).length
				? (p.stones || []).map(line).join("")
				: line({ item: "", sieve: "", pcs: cint(p.dmd_pcs) || "", ct: flt(p.dmd_ct) || "" })}</div>
			<button class="btn btn-xs btn-default os-addline">+ ${__("another stone")}</button>`);
		$(d.body).on("click", ".os-addline", () => $(d.body).find(".os-lines").append(line(null)));
		$(d.body).on("click", ".s-del", function () { $(this).closest(".os-srow").remove(); });
		d.show();
	}

	// ---- events -----------------------------------------------------------
	root.on("click", ".os-pill", function () {
		root.find(".os-pill").removeClass("on"); this.classList.add("on");
		S.filter = this.dataset.f; paintRows();
	});
	root.on("input", ".os-q", function () { S.q = this.value; paintRows(); });
	root.on("change", ".os-cb", function () {
		const id = $(this).closest("tr").data("id");
		this.checked ? S.sel.add(id) : S.sel.delete(id);
		paintBulk(); paintRows();
	});
	root.on("change", ".os-all", function () {
		visible().forEach((p) => (this.checked ? S.sel.add(p.legacy_id) : S.sel.delete(p.legacy_id)));
		paintBulk(); paintRows();
	});
	root.on("click", ".os-bclear", () => { S.sel.clear(); paintBulk(); paintRows(); });
	root.on("change", ".os-col", function () {
		const id = $(this).closest("tr").data("id");
		const p = pieces().find((x) => String(x.legacy_id) === String(id));
		if (p) { p.colour = this.value; S.dirty = true; save().then(matchDesigns); }
	});
	root.on("click", ".os-stbtn", function () { setStones($(this).closest("tr").data("id")); });
	root.on("click", ".os-bapply", function () {
		const col = root.find(".os-bcol").val();
		const sieve = root.find(".os-bsieve").val();
		const stone = root.find(".os-bstone").val();
		if (!col && !sieve && !stone) return frappe.msgprint(__("Pick something to apply."));
		pieces().forEach((p) => {
			if (!S.sel.has(p.legacy_id)) return;
			if (col) p.colour = col;
			// a diamond line the sheet already counted — give it its item and bracket
			if ((sieve || stone) && cint(p.dmd_pcs) > 0) {
				const cur = (p.stones || []).find((s) => s._d) || { _d: 1 };
				cur.pcs = cint(p.dmd_pcs);
				cur.ct = flt(p.dmd_ct);
				if (stone) cur.item = stone;
				if (sieve) cur.sieve = sieve;
				p.stones = [cur].concat((p.stones || []).filter((s) => !s._d));
			}
		});
		S.dirty = true;
		save().then(matchDesigns);
	});
	root.on("click", ".os-save", () => save({
		customer: (S.custCtl && S.custCtl.get_value()) || null,
		supplier: (S.suppCtl && S.suppCtl.get_value()) || null,
		quality_token: root.find(".os-qual").val() || null,
	}).then(() => frappe.show_alert({ message: __("Saved"), indicator: "green" }, 3)));
	root.on("click", ".os-recheck", matchDesigns);
	root.on("click", ".os-designbank", () => frappe.set_route("design-bank-report"));
	root.on("click", ".os-import", function () {
		const rev = S.session.review || {};
		frappe.confirm(
			__("Bring in {0} piece(s) as finished stock? New order IDs are created and cannot be undone.", [rev.pieces]),
			() => {
				save({
					customer: (S.custCtl && S.custCtl.get_value()) || null,
					supplier: (S.suppCtl && S.suppCtl.get_value()) || null,
					quality_token: root.find(".os-qual").val() || null,
				}).then(() => {
					frappe.dom.freeze(__("Bringing the stock in…"));
					frappe.call({ method: API + ".commit_old_stock_import", args: { name: S.session.name } })
						.then((r) => {
							const m = r.message || {};
							frappe.msgprint({ title: __("Stock imported"), indicator: "green",
								message: __("{0} piece(s) in on Job Order <b>{1}</b>.", [m.pieces, esc(m.job_order || "")]) });
							load(S.session.name);
						})
						.always(() => frappe.dom.unfreeze());
				});
			});
	});

	function matchDesigns() {
		if (!S.session) return;
		frappe.call({ method: API + ".suggest_old_stock_designs", args: { name: S.session.name } })
			.then((r) => { S.session = r.message; paint(); });
	}

	page.set_primary_action(__("Load excel"), loadExcel, "upload");
	page.add_inner_button(__("Open a session"), openSessions);
	page.add_inner_button(__("Match designs"), matchDesigns);

	// /app/import-old-stock/OSI-0001 opens that session straight away, so a
	// half-finished sheet can be linked to and picked up where it was left
	function fromRoute() {
		const r = frappe.get_route() || [];
		const name = r[1];
		if (name && (!S.session || S.session.name !== name)) load(name);
		else if (!S.session) paint();
	}
	frappe.pages["import-old-stock"].on_page_show = fromRoute;
	fromRoute();
};
