// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Design Export / Import (Design Bank) — move designs between sites.
// EXPORT: filter, then TICK the designs you want -> one .zip (photo + BOM + masters).
// IMPORT: attach a .zip, read what's inside, then TICK what you want to bring in.
// DESIGN NAME is the key, so the same file re-imports safely.
// Route: /app/design-transfer

frappe.pages["design-transfer"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Design Export / Import", single_column: true });
	const API = "jewelima.jewelima.design_transfer";
	const S = { rows: [], sel: new Set(), imp: [], isel: new Set() };
	const esc = frappe.utils.escape_html;

	$(page.main).append(`
		<style>
		.dx-wrap{max-width:960px;}
		.dx-card{border:1px solid var(--border-color);border-radius:10px;background:var(--fg-color);padding:16px 18px;margin-bottom:16px;}
		.dx-card h4{margin:0 0 4px;font-size:14px;font-weight:800;}
		.dx-card .hint{font-size:12px;color:var(--text-muted);margin-bottom:12px;}
		.dx-row{display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin-bottom:10px;}
		.dx-row .frappe-control{margin:0;flex:0 0 180px;}
		.dx-row .control-label{font-size:11px;color:var(--text-muted);}
		.dx-list{border:1px solid var(--border-color);border-radius:8px;max-height:280px;overflow:auto;}
		.dx-list table{width:100%;border-collapse:collapse;font-size:12.5px;}
		.dx-list th{position:sticky;top:0;background:var(--control-bg);font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;
			color:var(--text-muted);padding:5px 8px;text-align:left;border-bottom:1px solid var(--border-color);}
		.dx-list td{padding:4px 8px;border-bottom:1px solid var(--border-color);}
		.dx-list tr.blocked td{opacity:.5;}
		.dx-list tbody tr{cursor:pointer;}
		.dx-tag{border-radius:9px;padding:1px 8px;font-size:10.5px;font-weight:700;}
		.dx-tag.new{background:#e6f4ea;color:#1d7a33;}
		.dx-tag.exists{background:#fff3cd;color:#8a6d00;}
		.dx-tag.bad{background:#fdecea;color:#c0392b;}
		.dx-bar{display:flex;gap:10px;align-items:center;margin-top:10px;flex-wrap:wrap;}
		.dx-bar .n{font-weight:800;}
		.dx-go{background:#2e7d32;border-color:#2e7d32;color:#fff;font-weight:700;margin-left:auto;}
		.dx-none{padding:22px;text-align:center;color:var(--text-muted);}
		.dx-rep{margin-top:10px;font-size:12.5px;}
		.dx-rep table{width:100%;border-collapse:collapse;margin-top:6px;}
		.dx-rep td,.dx-rep th{border:1px solid var(--border-color);padding:4px 8px;font-size:12px;text-align:left;}
		.dx-err{color:var(--red-600,#c0392b);}
		</style>
		<div class="dx-wrap">
			<div class="dx-card">
				<h4>${__("Export")}</h4>
				<div class="hint">${__("Filter, then tick the designs to export. The .zip carries each one's photo, BOM and masters.")}</div>
				<div class="dx-row">
					<div class="dx-type"></div><div class="dx-status"></div><div class="dx-search"></div>
				</div>
				<div class="dx-list dx-elist"></div>
				<div class="dx-bar">
					<button class="btn btn-xs btn-default dx-all">${__("Select all")}</button>
					<button class="btn btn-xs btn-default dx-none-btn">${__("None")}</button>
					<span class="dx-count"></span>
					<button class="btn btn-sm dx-go dx-export">${__("Export selected")}</button>
				</div>
			</div>

			<div class="dx-card">
				<h4>${__("Import")}</h4>
				<div class="hint">${__("Attach a .zip and read it first — nothing is written until you pick. Designs are matched on their NAME. Raw-material items must already exist here.")}</div>
				<div class="dx-row">
					<div class="dx-file"></div><div class="dx-mode"></div>
					<button class="btn btn-sm btn-default dx-inspect">${__("Read file")}</button>
				</div>
				<div class="dx-list dx-ilist"><div class="dx-none">${__("Attach an export .zip and press Read file.")}</div></div>
				<div class="dx-bar">
					<button class="btn btn-xs btn-default dx-iall">${__("Select all")}</button>
					<button class="btn btn-xs btn-default dx-inone">${__("None")}</button>
					<span class="dx-icount"></span>
					<button class="btn btn-sm dx-go dx-import">${__("Import selected")}</button>
				</div>
				<div class="dx-rep"></div>
			</div>
		</div>
	`);
	const root = $(page.main);
	const mk = (sel, df) => {
		const c = frappe.ui.form.make_control({ df, parent: root.find(sel).get(0), render_input: true });
		c.refresh();
		return c;
	};
	const type = mk(".dx-type", { fieldtype: "Link", label: __("Design Type"), fieldname: "t", options: "Design Type" });
	const status = mk(".dx-status", { fieldtype: "Select", label: __("Status"), fieldname: "s", options: "\nActive\nRetired" });
	const search = mk(".dx-search", { fieldtype: "Data", label: __("Search name"), fieldname: "q" });
	const file = mk(".dx-file", { fieldtype: "Attach", label: __("Export .zip"), fieldname: "f" });
	const mode = mk(".dx-mode", { fieldtype: "Select", label: __("If it already exists"), fieldname: "m", options: "skip\nupdate", default: "skip" });

	// ---------- export side ----------
	function load() {
		frappe.call({ method: API + ".list_designs", args: {
			design_type: type.get_value() || null, status: status.get_value() || null,
			search: (search.get_value() || "").trim() || null,
		} }).then((r) => { S.rows = r.message || []; paintExport(); });
	}
	type.$input.on("change", load);
	status.$input.on("change", load);
	search.$input.on("input", frappe.utils.debounce(load, 400));

	function paintExport() {
		root.find(".dx-elist").html(S.rows.length ? `
			<table><thead><tr><th style="width:26px"></th><th>${__("Design")}</th><th>${__("Type")}</th>
				<th>${__("Status")}</th><th>${__("BOM")}</th><th>${__("Photo")}</th></tr></thead>
			<tbody>${S.rows.map((r) => `
				<tr data-n="${esc(r.name)}">
					<td><input type="checkbox" class="dx-cb" ${S.sel.has(r.name) ? "checked" : ""}></td>
					<td><b>${esc(r.design_name)}</b></td><td>${esc(r.design_type || "")}</td>
					<td>${esc(r.status || "")}</td><td>${r.materials}</td><td>${r.has_photo ? "✓" : ""}</td>
				</tr>`).join("")}</tbody></table>`
			: `<div class="dx-none">${__("No designs match.")}</div>`);
		sumExport();
	}
	const sumExport = () => root.find(".dx-count").html(__("<span class='n'>{0}</span> of {1} selected", [S.sel.size, S.rows.length]));

	root.on("click", ".dx-elist tbody tr", function () {
		const n = this.getAttribute("data-n");
		S.sel.has(n) ? S.sel.delete(n) : S.sel.add(n);
		$(this).find(".dx-cb").prop("checked", S.sel.has(n));
		sumExport();
	});
	root.find(".dx-all").on("click", () => { S.rows.forEach((r) => S.sel.add(r.name)); paintExport(); });
	root.find(".dx-none-btn").on("click", () => { S.sel.clear(); paintExport(); });

	root.find(".dx-export").on("click", () => {
		if (!S.sel.size) return frappe.msgprint(__("Tick the designs to export."));
		// POST: a long list of names would blow a query string
		open_url_post("/api/method/jewelima.jewelima.design_transfer.export_designs",
			{ designs: JSON.stringify([...S.sel]) });
	});

	// ---------- import side ----------
	root.find(".dx-inspect").on("click", () => {
		const f = file.get_value();
		if (!f) return frappe.msgprint(__("Attach the export .zip first."));
		frappe.dom.freeze(__("Reading..."));
		frappe.call({ method: API + ".inspect_import", args: { file_url: f } })
			.then((r) => {
				frappe.dom.unfreeze();
				const m = r.message || {};
				S.imp = m.designs || [];
				S.manifest = m.manifest || {};
				// default tick: the ones that are new here AND can actually land
				S.isel = new Set(S.imp.filter((d) => !d.blocked && !d.exists).map((d) => d.design_name));
				paintImport();
			})
			.catch(() => frappe.dom.unfreeze());
	});

	function paintImport() {
		const mf = S.manifest || {};
		const head = mf.count ? `<div class="hint" style="padding:6px 8px;margin:0;">${
			__("{0} design(s) in the file · exported {1} from {2}", [mf.count, mf.exported_on || "?", mf.site || "?"])}</div>` : "";
		root.find(".dx-ilist").html(S.imp.length ? head + `
			<table><thead><tr><th style="width:26px"></th><th>${__("Design")}</th><th>${__("Type")}</th>
				<th>${__("BOM")}</th><th>${__("Photo")}</th><th>${__("Here")}</th></tr></thead>
			<tbody>${S.imp.map((d) => `
				<tr data-n="${esc(d.design_name)}" class="${d.blocked ? "blocked" : ""}">
					<td><input type="checkbox" class="dx-icb" ${S.isel.has(d.design_name) ? "checked" : ""} ${d.blocked ? "disabled" : ""}></td>
					<td><b>${esc(d.design_name)}</b></td><td>${esc(d.design_type || "")}</td>
					<td>${d.materials}</td><td>${d.has_photo ? "✓" : ""}</td>
					<td>${d.blocked
						? `<span class="dx-tag bad">${(d.missing || []).length ? __("missing {0}", [esc(d.missing.join(", "))]) : __("no BOM")}</span>`
						: d.exists ? `<span class="dx-tag exists">${__("exists")}</span>` : `<span class="dx-tag new">${__("new")}</span>`}</td>
				</tr>`).join("")}</tbody></table>`
			: `<div class="dx-none">${__("Nothing in that file.")}</div>`);
		sumImport();
	}
	const sumImport = () => root.find(".dx-icount").html(__("<span class='n'>{0}</span> of {1} selected", [S.isel.size, S.imp.length]));

	root.on("click", ".dx-ilist tbody tr", function () {
		const n = this.getAttribute("data-n");
		const d = S.imp.find((x) => x.design_name === n);
		if (!d || d.blocked) return;   // can't land — its raw material isn't here
		S.isel.has(n) ? S.isel.delete(n) : S.isel.add(n);
		$(this).find(".dx-icb").prop("checked", S.isel.has(n));
		sumImport();
	});
	root.find(".dx-iall").on("click", () => { S.imp.filter((d) => !d.blocked).forEach((d) => S.isel.add(d.design_name)); paintImport(); });
	root.find(".dx-inone").on("click", () => { S.isel.clear(); paintImport(); });

	root.find(".dx-import").on("click", () => {
		if (!S.isel.size) return frappe.msgprint(__("Tick what to import."));
		const m = mode.get_value() || "skip";
		const exists = [...S.isel].filter((n) => (S.imp.find((d) => d.design_name === n) || {}).exists).length;
		frappe.confirm(__("Import <b>{0}</b> design(s)?{1}", [S.isel.size,
			exists ? " " + __("{0} already here — mode is <b>{1}</b>.", [exists, m]) : ""]), () => {
			frappe.dom.freeze(__("Importing..."));
			frappe.call({ method: API + ".import_designs", args: { file_url: file.get_value(), mode: m, designs: [...S.isel] } })
				.then((r) => {
					frappe.dom.unfreeze();
					const x = r.message || {};
					const errs = (x.errors || []).map((e) => `<tr><td>${esc(e.design)}</td><td class="dx-err">${esc(e.error)}</td></tr>`).join("");
					root.find(".dx-rep").html(`<b>${__("Created")}: ${x.created}</b> · ${__("Updated")}: ${x.updated} · ${__("Skipped")}: ${x.skipped} ${__("of")} ${x.total}
						${errs ? `<table><thead><tr><th>${__("Design")}</th><th>${__("Not imported because")}</th></tr></thead><tbody>${errs}</tbody></table>` : ""}`);
					frappe.show_alert({ message: __("{0} created, {1} updated.", [x.created, x.updated]), indicator: "green" }, 6);
					load();
				})
				.catch(() => frappe.dom.unfreeze());
		});
	});

	page.add_inner_button(__("Designs"), () => frappe.set_route("List", "Design"));
	load();
};
