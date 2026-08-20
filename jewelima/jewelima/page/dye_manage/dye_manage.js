// Dye Manage — the cabinet wall: KPIs on top, a tile per drawer, and clicking a
// drawer opens it. Inside a drawer: its dyes, move / take out, and Add dyes
// straight into it. Drawers themselves are opened/retired from the wall.
frappe.pages["dye-manage"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Dye Manage"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const ni = (v) => (v || 0).toLocaleString();
	let DRAWERS = [];

	$(page.main).append(`
		<style>
		#page-dye-manage .container{max-width:100%;}
		.dm-hero{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px;}
		.dm-tile{border:1px solid var(--border-color);border-radius:14px;background:var(--fg-color);padding:12px 15px;}
		.dm-tile .k{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);font-weight:700;}
		.dm-tile .v{font-size:24px;font-weight:800;margin-top:2px;font-variant-numeric:tabular-nums;}
		.dm-tile.good .v{color:#1d7a33;} .dm-tile.bad .v{color:#b02a2a;}
		.dm-bar{display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap;}
		.dm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;}
		.dm-d{border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);padding:10px 13px;
			cursor:pointer;transition:box-shadow .12s,transform .12s;font-size:12.5px;}
		.dm-d:hover{box-shadow:0 6px 16px rgba(0,0,0,.12);transform:translateY(-2px);}
		.dm-d b{font-size:16px;}
		.dm-d .n{color:var(--text-muted);}
		.dm-d .dmg{color:#b02a2a;font-weight:700;font-size:10.5px;}
		.dm-d.empty{opacity:.5;}
		/* the open drawer */
		.dm-box{border:1px solid var(--border-color);border-radius:12px;overflow:auto;background:var(--fg-color);max-height:calc(100vh - 210px);}
		table.dm-t td.act{text-align:right;}
		.dm-rowbtn{border:1px solid var(--border-color);border-radius:7px;background:var(--fg-color);
			font-size:11px;font-weight:700;padding:2px 10px;cursor:pointer;margin-left:5px;}
		.dm-rowbtn:hover{border-color:#1f618d;}
		.dm-rowbtn.red{color:#b02a2a;} .dm-rowbtn.amber{color:#7a5b00;} .dm-rowbtn.green{color:#1d7a33;}
		table.dm-t{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.dm-t th{position:sticky;top:0;background:var(--control-bg);font-size:10px;text-transform:uppercase;
			color:var(--text-muted);padding:6px 10px;text-align:left;border-bottom:2px solid var(--border-color);}
		table.dm-t td{padding:5px 10px;border-bottom:1px solid var(--border-color);white-space:nowrap;}
		.dm-st{border-radius:10px;padding:1px 9px;font-size:10.5px;font-weight:800;}
		.dm-st.h{background:#f0f8f1;color:#1d7a33;} .dm-st.d{background:#fdf0f0;color:#b02a2a;}
		.dm-act{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px;padding:10px 12px;
			border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);}
		.dm-act select{border:1px solid var(--border-color);border-radius:7px;height:30px;background:var(--fg-color);color:var(--text-color);}
		</style>
		<div class="dm-root"></div>`);
	const root = $(page.main).find(".dm-root");

	// ---------- the wall ----------
	function showWall() {
		frappe.call({ method: API + ".get_dye_info", freeze: false }).then((r) => {
			const m = r.message || {};
			DRAWERS = (m.drawers || []).map((d) => d.name);
			const tile = (cls, k, v) => `<div class="dm-tile ${cls}"><div class="k">${k}</div><div class="v">${v}</div></div>`;
			root.html(`
				<div class="dm-hero">
					${tile("", __("Designs"), ni(m.entries))}
					${tile("", __("Dyes"), ni(m.total))}
					${tile("good", __("Healthy"), ni(m.healthy))}
					${tile("bad", __("Damaged"), ni(m.damaged))}
					${tile("", __("Drawers"), ni((m.drawers || []).length))}
					${m.unplaced ? tile("bad", __("Unplaced"), ni(m.unplaced)) : ""}
				</div>
				<div class="dm-bar">
					<input type="text" class="dm-wq" placeholder="${__("search a design across all drawers…")}"
						style="min-width:260px;border:1px solid var(--border-color);border-radius:8px;height:32px;
						padding:2px 12px;background:var(--fg-color);color:var(--text-color);font-size:13px;">
					<span style="font-size:12px;color:var(--text-muted);">${__("or click a drawer")}</span>
					<span style="margin-left:auto;display:flex;gap:6px;">
						<button class="btn btn-xs btn-default dm-history">${__("History")}</button>
						<button class="btn btn-xs btn-default dm-newdrawer">+ ${__("Add drawer")}</button>
					</span>
				</div>
				<div class="dm-grid">
					${(m.drawers || []).map((d) => `
						<div class="dm-d ${d.n ? "" : "empty"}" data-d="${esc(d.name)}">
							<b>${esc(d.name)}</b> <span class="n">· ${ni(d.n)} ${__("designs")}</span>
							<span class="n">· ${ni(d.dyes)} ${__("dyes")}</span>
							${d.damaged ? `<span class="dmg"> · ${ni(d.damaged)} ${__("dmg")}</span>` : ""}
						</div>`).join("")}
					${m.unplaced ? `<div class="dm-d" data-d="__none__" style="border-style:dashed;">
						<b>${__("Unplaced")}</b> <span class="n">· ${ni(m.unplaced)}</span></div>` : ""}
				</div>`);
		});
	}

	// ---------- one drawer ----------
	function openDrawer(no, q) {
		const search = !!q;
		const unplaced = no === "__none__";
		const sel = new Set();
		const refresh = () => openDrawer(no, q);
		frappe.call({ method: API + ".get_dye_bank", freeze: false,
			args: search ? { start: 0, limit: 500, q: q }
				: unplaced ? { start: 0, limit: 500, drawer: null, q: null }
				: { start: 0, limit: 500, drawer: no } }).then((r) => {
			let rows = (r.message || {}).rows || [];
			if (unplaced) rows = rows.filter((x) => !x.drawer);
			root.html(`
				<div class="dm-bar">
					<button class="btn btn-sm btn-default dm-back">← ${__("All drawers")}</button>
					<span style="font-size:16px;font-weight:800;">${search ? __("Search — {0}", [esc(q)])
						: unplaced ? __("Unplaced dyes") : __("Drawer {0}", [esc(no)])}</span>
					<span style="font-size:12px;color:var(--text-muted);">${rows.length} ${__("dye(s)")}</span>
					<span style="margin-left:auto;">
						${unplaced ? "" : `<button class="btn btn-xs btn-primary dm-newdye">+ ${__("Add dyes to this drawer")}</button>`}
					</span>
				</div>
				<div class="dm-box"><table class="dm-t"><thead><tr>
					<th style="width:26px;"><input type="checkbox" class="dm-all" style="width:14px;height:14px;"></th>
					<th style="width:44px;">#</th>${search ? `<th style="width:80px;">${__("Drawer")}</th>` : ""}<th>${__("Design(s)")}</th><th style="width:70px;">${__("Dyes")}</th>
					<th>${__("Variant")}</th><th style="width:90px;">${__("Status")}</th><th style="text-align:right;">${__("Actions")}</th>
				</tr></thead><tbody>
				${rows.map((x, ix) => {
					const banks = (x.banks || "").split("|");
					const designs = (x.design_nos || "").split(" | ").map((d, i) =>
						banks[i] ? `<b>${esc(d)}</b>` : esc(d)).join(" · ");
					return `<tr data-n="${esc(x.name)}">
						<td><input type="checkbox" class="dm-cb" style="width:14px;height:14px;"></td>
						<td><b>${ix + 1}</b></td>${search ? `<td><b>${esc(x.drawer || "—")}</b></td>` : ""}<td>${designs}</td><td><b>${x.dye_count || 1}</b></td>
						<td>${esc(x.variant_note || "")}</td>
						<td><span class="dm-st ${x.status === "Healthy" ? "h" : "d"}">${esc(x.status)}</span></td>
						<td class="act">
							<button class="dm-rowbtn r-shift">${__("Shift")}</button>
							<button class="dm-rowbtn ${x.status === "Healthy" ? "amber r-dmg" : "green r-heal"}">${x.status === "Healthy" ? __("Mark Damaged") : __("Mark Healthy")}</button>
							<button class="dm-rowbtn red r-rm">${__("Remove")}</button>
						</td></tr>`;
				}).join("") || `<tr><td colspan="7" style="padding:26px;text-align:center;color:var(--text-muted);">${__("Empty drawer.")}</td></tr>`}
				</tbody></table></div>
				<div class="dm-act" style="display:none;">
					<span class="dm-n" style="font-weight:800;"></span>
					<span>${__("→ drawer")}</span>
					<select class="dm-to">${DRAWERS.map((d) => `<option ${d === no ? "disabled" : ""}>${esc(d)}</option>`).join("")}</select>
					<button class="btn btn-sm btn-primary dm-move">${__("Move")}</button>
					<button class="btn btn-sm btn-default dm-scrap" style="color:#b02a2a;">${__("Scrap a dye")}</button>
				</div>`);

			const paintSel = () => {
				root.find(".dm-act").toggle(sel.size > 0);
				root.find(".dm-n").text(__("{0} ticked", [sel.size]));
			};
			const rowName = (el) => $(el).closest("tr").data("n");
			root.find(".r-shift").on("click", function () {
				const n = rowName(this);
				frappe.prompt([{ fieldname: "to", fieldtype: "Select", label: __("Drawer"), reqd: 1,
					options: DRAWERS.filter((d) => d !== no).join("\n") }],
					(v) => frappe.call({ method: API + ".move_dyes",
						args: { names: JSON.stringify([n]), to_drawer: v.to } })
						.then(() => { frappe.show_alert({ message: __("Shifted → drawer {0}", [v.to]), indicator: "green" }, 4); refresh(); }),
					__("Shift to which drawer?"));
			});
			root.find(".r-dmg, .r-heal").on("click", function () {
				const n = rowName(this), to = $(this).hasClass("r-dmg") ? "Damaged" : "Healthy";
				frappe.call({ method: API + ".set_dye_status", args: { names: JSON.stringify([n]), status: to } })
					.then(refresh);
			});
			root.find(".r-rm").on("click", function () {
				const n = rowName(this);
				frappe.confirm(__("Remove ONE dye off this entry? At zero the entry disappears."), () =>
					frappe.call({ method: API + ".scrap_dyes", args: { names: JSON.stringify([n]) } })
						.then(refresh));
			});
			root.find(".dm-t tbody tr[data-n]").css("cursor", "pointer").on("click", function (e) {
				if ($(e.target).is("input,button,a")) return;
				frappe.route_options = { dye: this.dataset.n };
				frappe.set_route("dye-info");
			});
			root.find(".dm-cb").on("change", function () {
				const n = $(this).closest("tr").data("n");
				this.checked ? sel.add(n) : sel.delete(n);
				paintSel();
			});
			root.find(".dm-all").on("change", function () {
				const on = this.checked;
				root.find(".dm-cb").each(function () {
					this.checked = on;
					const n = $(this).closest("tr").data("n");
					on ? sel.add(n) : sel.delete(n);
				});
				paintSel();
			});
			const move = (to) => frappe.call({ method: API + ".move_dyes",
				args: { names: JSON.stringify([...sel]), to_drawer: to } }).then((rr) => {
				const mm = rr.message || {};
				frappe.show_alert({ message: to ? __("{0} moved → drawer {1}", [mm.moved, to])
					: __("{0} taken out", [mm.moved]), indicator: "green" }, 4);
				refresh();
			});
			root.find(".dm-move").on("click", () => {
				const to = root.find(".dm-to").val();
				if (!to || to === no) return frappe.msgprint(__("Pick a different drawer."));
				frappe.confirm(__("Move <b>{0}</b> entr(ies) to drawer <b>{1}</b>?", [sel.size, to]), () => move(to));
			});

			root.find(".dm-scrap").on("click", () => {
				frappe.confirm(__("Scrap ONE dye off each of the {0} ticked entr(ies)? An entry at zero disappears.", [sel.size]), () =>
					frappe.call({ method: API + ".scrap_dyes", args: { names: JSON.stringify([...sel]) } })
						.then((rr) => {
							const mm = rr.message || {};
							frappe.show_alert({ message: __("Scrapped — {0} reduced, {1} gone.",
								[(mm.reduced || []).length, (mm.deleted || []).length]), indicator: "orange" }, 5);
							openDrawer(no);
						}));
			});
			root.find(".dm-back").on("click", showWall);
			root.find(".dm-newdye").on("click", () => addDyes(no));
		});
	}

	// ---------- dialogs ----------
	function addDyes(drawer) {
		frappe.prompt([
			{ fieldname: "design", fieldtype: "Data", label: __("Design number"), reqd: 1 },
			{ fieldname: "count", fieldtype: "Int", label: __("How many dyes"), default: 1, reqd: 1 },
			{ fieldname: "note", fieldtype: "Data", label: __("Variant note (STUD, RING…)") },
		], (v) => frappe.call({ method: API + ".add_dyes", args: {
			drawer, design_no: v.design, count: v.count || 1, note: v.note || "" } })
			.then((r) => {
				const m = r.message || {};
				frappe.show_alert({ message: __("{0} dye(s) into drawer {1}{2}.", [(m.made || []).length, drawer,
					m.matched ? "" : " — " + __("no card in the bank matched")]), indicator: m.matched ? "green" : "orange" }, 6);
				openDrawer(drawer);
			}), __("New dyes — drawer {0}", [drawer]));
	}
	root.on("click", ".dm-history", () => {
		const D = { action: "", q: "" };
		const dlg = new frappe.ui.Dialog({ title: __("Dye history"), size: "extra-large",
			fields: [{ fieldname: "html", fieldtype: "HTML" }] });
		const paint = () => frappe.call({ method: API + ".get_dye_logs",
			args: { action: D.action || null, q: D.q || null } }).then((r) => {
			const rows = (r.message || {}).rows || [];
			dlg.get_field("html").$wrapper.find(".hl-body").html(rows.length ? `
				<table class="dm-t"><thead><tr><th>${__("When")}</th><th>${__("Who")}</th>
					<th>${__("Action")}</th><th>${__("Design")}</th><th>${__("Dyes")}</th><th>${__("From → To")}</th></tr></thead>
				<tbody>${rows.map((x) => `<tr>
					<td>${esc((x.creation || "").slice(0, 16))}</td><td>${esc(x.who)}</td>
					<td><b>${esc(x.action)}</b></td><td>${esc(x.design_no)}</td><td>${x.count || ""}</td>
					<td>${x.action === "Added" ? "→ " + esc(x.to_drawer)
						: x.action === "Scrapped" ? esc(x.from_drawer) + " →"
						: esc(x.from_drawer) + " → " + esc(x.to_drawer)}</td></tr>`).join("")}
				</tbody></table>`
				: `<div style="padding:26px;text-align:center;color:var(--text-muted);">${__("Nothing yet.")}</div>`);
		});
		dlg.get_field("html").$wrapper.html(`
			<div style="display:flex;gap:8px;margin-bottom:10px;">
				<select class="hl-a" style="border:1px solid var(--border-color);border-radius:7px;height:30px;background:var(--fg-color);color:var(--text-color);">
					<option value="">${__("All actions")}</option><option>Moved</option><option>Added</option><option>Scrapped</option></select>
				<input type="text" class="hl-q" placeholder="${__("design / drawer / person…")}"
					style="border:1px solid var(--border-color);border-radius:7px;height:30px;padding:2px 10px;background:var(--fg-color);color:var(--text-color);min-width:220px;">
			</div><div class="hl-body" style="max-height:62vh;overflow:auto;"></div>`);
		const $w = dlg.get_field("html").$wrapper;
		$w.on("change", ".hl-a", function () { D.action = this.value; paint(); });
		$w.on("input", ".hl-q", frappe.utils.debounce(function () { D.q = this.value; paint(); }, 250));
		dlg.show();
		paint();
	});
	root.on("click", ".dm-newdrawer", () => {
		frappe.prompt([{ fieldname: "no", fieldtype: "Data", label: __("Drawer number"), reqd: 1 },
			{ fieldname: "note", fieldtype: "Data", label: __("Note (shelf, cabinet…)") }],
			(v) => frappe.call({ method: API + ".add_dye_drawer", args: { drawer_no: v.no, note: v.note || "" } })
				.then(() => { frappe.show_alert({ message: __("Drawer {0} added.", [v.no]), indicator: "green" }, 4); showWall(); }),
			__("New drawer"));
	});

	root.on("click", ".dm-d", function () { openDrawer(this.dataset.d); });
	root.on("keydown", ".dm-wq", function (e) {
		if (e.key === "Enter" && (this.value || "").trim().length >= 2) openDrawer(null, this.value.trim());
	});

	frappe.pages["dye-manage"].on_page_show = showWall;
	showWall();
};
