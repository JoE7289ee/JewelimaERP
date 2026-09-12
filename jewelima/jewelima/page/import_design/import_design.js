// Import Design (Stock > Import Design) — the designs a supplier's sheet
// describes, made in one go.
//
// Every supplier sends a different excel. The first file from one is mapped
// column by column and that mapping is kept against them, so their next file
// needs nothing. What comes out is our standard shape: a piece, its stone lines
// under it. The designs are then read off it — a code, the variant its own
// materials spell out, and the bill of materials its pieces average to. The one
// thing no supplier sends is the design type, so that is picked here.
// Route: /app/import-design
frappe.pages["import-design"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Import Design"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const cint = (v) => parseInt(v, 10) || 0;
	const g3 = (v) => flt(v).toFixed(3);

	const S = {
		ctx: null,            // design types, colours, stone families, saved formats
		file: null,           // { dataurl, name }
		sniff: null,          // what the file looks like
		fmt: null,            // the mapping being used / edited
		conv: null,           // converted standard pieces
		pv: null,             // the designs those pieces make
		sel: new Set(),
	};

	$(page.main).append(`
		<style>
		#page-import-design .container{max-width:100%;}
		.id-wrap{max-width:100%;}
		.id-tiles{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;}
		.id-tile{border:1px solid var(--border-color);border-radius:11px;background:var(--fg-color);
			padding:10px 15px;min-width:112px;}
		.id-tile .k{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);}
		.id-tile .v{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums;}
		.id-tile .s{font-size:10.5px;color:var(--text-muted);}
		.id-tile.ok .v{color:#1d7a33;} .id-tile.warn .v{color:#8a5a00;}
		.id-box{border:1px solid var(--border-color);border-radius:11px;background:var(--fg-color);
			padding:12px 14px;margin-bottom:12px;}
		.id-box .h{font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;
			color:var(--text-muted);margin-bottom:9px;}
		.id-split{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;}
		.id-main{flex:1 1 640px;min-width:520px;}
		.id-side{flex:0 0 300px;}
		.id-side label{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.05em;
			color:var(--text-muted);margin:9px 0 3px;}
		.id-bar{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-bottom:9px;}
		.id-mini{border:1px solid var(--border-color);border-radius:6px;padding:3px 6px;font-size:12px;
			background:var(--fg-color);color:var(--text-color);max-width:100%;}
		.id-gridbox{max-height:58vh;overflow:auto;border:1px solid var(--border-color);border-radius:9px;}
		table.id-t{width:100%;border-collapse:separate;border-spacing:0;font-size:12px;background:var(--fg-color);}
		table.id-t th{position:sticky;top:0;z-index:2;background:var(--fg-color);text-align:left;
			font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);
			border-bottom:1px solid var(--border-color);padding:7px;font-weight:700;white-space:nowrap;}
		table.id-t td{padding:5px 7px;border-bottom:1px solid var(--border-color);vertical-align:top;}
		table.id-t td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}
		table.id-t tr.sel td{background:#eaf2fa;}
		table.id-t tr.bad td{background:#fdf9f1;}
		table.id-t tr.have td{opacity:.62;}
		.id-mats{font-size:11px;color:var(--text-muted);line-height:1.5;}
		.id-need{color:#b4690e;font-weight:700;font-size:11px;}
		.id-ok{color:#1d7a33;font-weight:700;font-size:11px;}
		.id-have{color:#1f618d;font-weight:700;font-size:11px;}
		.id-empty{padding:46px;text-align:center;color:var(--text-muted);}
		.id-warn{border:1px solid #e6c98f;background:#fdf9f1;color:#8a5a00;border-radius:9px;
			padding:9px 12px;font-size:12px;margin-bottom:11px;}
		.id-act{display:flex;gap:8px;flex-wrap:wrap;margin-top:11px;}
		table.id-map{width:100%;font-size:12.5px;border-collapse:collapse;}
		table.id-map td{padding:4px 6px;border-bottom:1px solid var(--border-color);}
		table.id-map td.lbl{width:140px;color:var(--text-muted);font-size:11.5px;}
		</style>
		<div class="id-wrap">
			<div class="id-tiles"></div>
			<div class="id-split">
				<div class="id-main">
					<div class="id-box">
						<div class="id-bar">
							<span class="id-selinfo" style="font-size:11.5px;color:var(--text-muted);"></span>
							<span style="flex:1;"></span>
							<select class="id-mini id-btype" style="width:170px;">
								<option value="">${__("set type on selected…")}</option>
							</select>
						</div>
						<div class="id-gridbox"><table class="id-t">
							<thead><tr>
								<th style="width:24px;"><input type="checkbox" class="id-all"></th>
								<th>${__("Design")}</th><th>${__("Type")}</th>
								<th class="num">${__("Pcs")}</th><th class="num">${__("Gold g")}</th>
								<th>${__("Bill of materials")}</th><th>${__("Status")}</th>
							</tr></thead><tbody class="id-body"></tbody>
						</table></div>
					</div>
				</div>
				<div class="id-side"></div>
			</div>
		</div>`);
	const root = $(page.main);

	// ---- loading a file ---------------------------------------------------
	function loadFile() {
		new frappe.ui.FileUploader({
			as_dataurl: true, allow_multiple: false,
			on_success: (file) => {
				S.file = { dataurl: file.dataurl, name: file.file_name };
				S.conv = null; S.pv = null; S.sel.clear();
				frappe.dom.freeze(__("Reading the sheet…"));
				frappe.call({ method: API + ".sniff_supplier_sheet", args: { filedata: file.dataurl } })
					.then((r) => {
						S.sniff = r.message;
						const best = (S.sniff.sheets || [])[0] || {};
						// a saved format is the whole point — offer it before mapping again
						if ((S.ctx.formats || []).length) openPickFormat(best);
						else openMapping(best, null);
					})
					.always(() => frappe.dom.unfreeze());
			},
		});
	}

	function openPickFormat(best) {
		const d = new frappe.ui.Dialog({ title: __("Whose sheet is this?"), size: "large" });
		$(d.body).html(`
			<table class="id-t"><thead><tr>
				<th>${__("Supplier")}</th><th>${__("Format")}</th><th>${__("Code")}</th>
				<th>${__("Quality")}</th><th>${__("Diamonds")}</th>
			</tr></thead><tbody>${(S.ctx.formats || []).map((f) => `
				<tr class="id-pick" data-n="${esc(f.name)}" style="cursor:pointer;">
					<td><b>${esc(f.supplier)}</b></td><td>${esc(f.format_name || "")}</td>
					<td>${esc(f.supplier_code || "")}</td><td>${esc(f.default_quality || "—")}</td>
					<td>${esc(f.default_stone_family || "—")}</td></tr>`).join("")}
			</tbody></table>
			<div class="id-act"><button class="btn btn-sm btn-default id-newfmt">${__("New supplier — map it")}</button></div>`);
		$(d.body).on("click", ".id-pick", function () {
			const name = $(this).data("n");
			d.hide();
			frappe.call({ method: API + ".get_supplier_format", args: { name } })
				.then((r) => { S.fmt = r.message; convert(); });
		});
		$(d.body).on("click", ".id-newfmt", () => { d.hide(); openMapping(best, null); });
		d.show();
	}

	// ---- the mapping screen ------------------------------------------------
	function openMapping(sheet, fmt) {
		const sheets = S.sniff.sheets || [];
		const cur = sheet || sheets[0] || { columns: [], header_row: 1, sheet: "" };
		const fields = S.sniff.fields || [];
		const d = new frappe.ui.Dialog({
			title: __("Read {0}", [esc(S.file.name || "")]), size: "extra-large",
			primary_action_label: __("Read it"),
			primary_action: () => { d.hide(); takeMapping($(d.body), cur); },
		});
		const seen = {};
		(fmt ? fmt.columns : cur.columns.filter((c) => c.field).map((c) => ({ field: c.field, header: c.header })))
			.forEach((c) => (seen[c.field] = c.header));
		$(d.body).html(`
			<div class="id-split" style="gap:16px;">
				<div style="flex:1 1 320px;min-width:300px;">
					<div class="id-box"><div class="h">${__("Supplier")}</div>
						<table class="id-map">
							<tr><td class="lbl">${__("Supplier")}</td><td><div class="m-supp"></div></td></tr>
							<tr><td class="lbl">${__("Format name")}</td><td><input class="id-mini m-fmtname" style="width:100%;"
								value="${esc((fmt && fmt.format_name) || "Packing List")}"></td></tr>
							<tr><td class="lbl">${__("Short code")}</td><td><input class="id-mini m-code" style="width:100%;"
								placeholder="SAL" value="${esc((fmt && fmt.supplier_code) || "")}"></td></tr>
							<tr><td class="lbl">${__("Worksheet")}</td><td><select class="id-mini m-sheet" style="width:100%;">
								${sheets.map((s) => `<option value="${esc(s.sheet)}"${s.sheet === cur.sheet ? " selected" : ""}>${esc(s.sheet)} · ${s.rows} ${__("rows")}</option>`).join("")}
							</select></td></tr>
							<tr><td class="lbl">${__("Heading row")}</td><td><input class="id-mini m-hrow" type="number" min="1"
								style="width:80px;" value="${cint(cur.header_row) || 1}"></td></tr>
							<tr><td class="lbl">${__("Design code")}</td><td><label style="font-size:12px;font-weight:400;">
								<input type="checkbox" class="m-strip" ${(!fmt || cint(fmt.strip_piece_number)) ? "checked" : ""}>
								${__("AJBG0261-1 is piece 1 of AJBG0261")}</label></td></tr>
						</table>
					</div>
					<div class="id-box"><div class="h">${__("The batch")}</div>
						<table class="id-map">
							<tr><td class="lbl">${__("Quality")}</td><td><input class="id-mini m-qual" style="width:100%;"
								placeholder="EF" value="${esc((fmt && fmt.default_quality) || "")}"></td></tr>
							<tr><td class="lbl">${__("Diamonds")}</td><td><select class="id-mini m-fam" style="width:100%;">
								<option value="">—</option>
								${(S.ctx.stone_families || []).map((f) => `<option value="${esc(f)}"${(fmt && fmt.default_stone_family) === f ? " selected" : ""}>${esc(f)}</option>`).join("")}
							</select></td></tr>
							<tr><td class="lbl">${__("Design type")}</td><td><select class="id-mini m-dtype" style="width:100%;">
								<option value="">${__("pick per design")}</option>
								${(S.ctx.design_types || []).map((t) => `<option value="${esc(t)}"${(fmt && fmt.default_design_type) === t ? " selected" : ""}>${esc(t)}</option>`).join("")}
							</select></td></tr>
						</table>
					</div>
				</div>
				<div style="flex:1 1 380px;min-width:340px;">
					<div class="id-box"><div class="h">${__("Which column is which")}</div>
						<table class="id-map">${fields.map((f) => `
							<tr><td class="lbl">${esc(f.label)}</td><td>
								<select class="id-mini m-col" data-f="${esc(f.key)}" style="width:100%;">
									<option value="">—</option>
									${cur.columns.map((c) => `<option value="${esc(c.header)}"${seen[f.key] === c.header ? " selected" : ""}>${esc(c.header)}</option>`).join("")}
								</select></td></tr>`).join("")}
						</table>
					</div>
					<div class="id-box"><div class="h">${__("What their words mean")}</div>
						<div class="m-vals"></div>
						<button class="btn btn-xs btn-default m-addval">+ ${__("word")}</button>
					</div>
				</div>
			</div>
			<label style="font-size:12px;font-weight:400;margin-top:4px;display:block;">
				<input type="checkbox" class="m-save" checked> ${__("Remember this for the supplier")}</label>`);

		const supp = frappe.ui.form.make_control({
			parent: $(d.body).find(".m-supp")[0], render_input: true,
			df: { fieldtype: "Link", options: "Supplier", fieldname: "supplier", placeholder: __("Pick…") },
		});
		if (fmt && fmt.supplier) supp.set_value(fmt.supplier);
		$(d.body).data("supp", supp);

		const valRow = (v) => `
			<div class="m-vrow" style="display:flex;gap:5px;margin-bottom:5px;align-items:center;">
				<select class="id-mini v-f" style="flex:0 0 110px;">
					${fields.map((f) => `<option value="${esc(f.key)}"${v && v.field === f.key ? " selected" : ""}>${esc(f.label)}</option>`).join("")}
				</select>
				<input class="id-mini v-them" style="flex:1 1 80px;" placeholder="${__("they write")}" value="${esc((v && v.their_value) || "")}">
				<span style="color:var(--text-muted);">→</span>
				<input class="id-mini v-us" style="flex:1 1 80px;" placeholder="${__("we mean")}" value="${esc((v && v.our_value) || "")}">
				<button class="btn btn-xs btn-default v-del">&times;</button>
			</div>`;
		const vals = (fmt && fmt.values && fmt.values.length) ? fmt.values : [{ field: "colour", their_value: "", our_value: "" }];
		$(d.body).find(".m-vals").html(vals.map(valRow).join(""));
		$(d.body).on("click", ".m-addval", () => $(d.body).find(".m-vals").append(valRow(null)));
		$(d.body).on("click", ".v-del", function () { $(this).closest(".m-vrow").remove(); });
		$(d.body).on("change", ".m-sheet", function () {
			const s = sheets.find((x) => x.sheet === this.value);
			if (s) { d.hide(); openMapping(s, readMapping($(d.body))); }
		});
		d.show();
	}

	function readMapping($b) {
		const cols = [];
		$b.find(".m-col").each(function () {
			if (this.value) cols.push({ field: $(this).data("f"), header: this.value });
		});
		const values = [];
		$b.find(".m-vrow").each(function () {
			const them = $(this).find(".v-them").val();
			if (them) values.push({ field: $(this).find(".v-f").val(), their_value: them, our_value: $(this).find(".v-us").val() });
		});
		const supp = $b.data("supp");
		return {
			supplier: (supp && supp.get_value()) || "",
			format_name: $b.find(".m-fmtname").val() || "Packing List",
			supplier_code: ($b.find(".m-code").val() || "").trim(),
			sheet_name: $b.find(".m-sheet").val() || "",
			header_row: cint($b.find(".m-hrow").val()) || 1,
			strip_piece_number: $b.find(".m-strip").is(":checked") ? 1 : 0,
			default_quality: ($b.find(".m-qual").val() || "").trim(),
			default_stone_family: $b.find(".m-fam").val() || "",
			default_design_type: $b.find(".m-dtype").val() || "",
			columns: cols, values,
		};
	}

	function takeMapping($b) {
		const m = readMapping($b);
		if (!m.supplier_code) return frappe.msgprint(__("Give the supplier a short code — it goes in front of every design name."));
		if (!m.columns.find((c) => c.field === "piece_ref") && !m.columns.find((c) => c.field === "design_code"))
			return frappe.msgprint(__("Say which column holds their design number."));
		S.fmt = m;
		if ($b.find(".m-save").is(":checked") && m.supplier) {
			frappe.call({ method: API + ".save_supplier_format", args: { payload: JSON.stringify(m) } })
				.then((r) => { S.fmt = r.message; refreshFormats(); convert(); });
		} else {
			convert();
		}
	}

	function refreshFormats() {
		frappe.call({ method: API + ".list_supplier_formats" })
			.then((r) => { S.ctx.formats = r.message || []; });
	}

	// ---- convert, then read the designs off it -----------------------------
	function convert() {
		if (!S.file || !S.fmt) return;
		frappe.dom.freeze(__("Converting…"));
		const args = { filedata: S.file.dataurl };
		if (S.fmt.name) args.format = S.fmt.name;
		else args.mapping = JSON.stringify(S.fmt);
		frappe.call({ method: API + ".convert_supplier_sheet", args })
			.then((r) => { S.conv = r.message; return preview(); })
			.always(() => frappe.dom.unfreeze());
	}

	function preview() {
		if (!S.conv) return;
		return frappe.call({
			method: API + ".preview_import_designs",
			args: {
				pieces: JSON.stringify(S.conv.pieces),
				supplier_code: S.fmt.supplier_code,
				quality: S.fmt.default_quality || "",
				stone_family: S.fmt.default_stone_family || "",
				design_type: S.fmt.default_design_type || "",
			},
		}).then((r) => { S.pv = r.message; S.sel.clear(); paint(); });
	}

	// ---- painting ----------------------------------------------------------
	const designs = () => (S.pv && S.pv.designs) || [];
	const makeable = () => designs().filter((d) => !d.exists && !d.problems.length && d.design_type);

	function paint() {
		paintTiles(); paintRows(); paintSide(); paintBulk();
	}

	function paintTiles() {
		if (!S.pv) return root.find(".id-tiles").empty();
		const s = S.pv.summary, t = (S.conv && S.conv.totals) || {};
		const tile = (k, v, sub, cls) =>
			`<div class="id-tile ${cls || ""}"><div class="k">${k}</div><div class="v">${v}</div>
				<div class="s">${sub || "&nbsp;"}</div></div>`;
		root.find(".id-tiles").html(
			tile(__("Designs"), s.designs, __("{0} piece(s)", [s.pieces])) +
			tile(__("New"), s.new, __("ready to make"), s.new ? "ok" : "") +
			tile(__("Already here"), s.existing, "") +
			(s.blocked ? tile(__("Blocked"), s.blocked, __("needs a look"), "warn") : "") +
			tile(__("Gross"), g3(t.gross), __("grams")) +
			tile(__("Gold"), g3(t.net), __("grams")) +
			tile(__("Stones"), t.stone_pcs || 0, `${g3(t.carats)} ct`));
	}

	function paintRows() {
		if (!S.pv) {
			return root.find(".id-body").html(
				`<tr><td colspan="7" class="id-empty">${__("Load a supplier's sheet to begin.")}</td></tr>`);
		}
		const types = S.ctx.design_types || [];
		root.find(".id-body").html(designs().map((d, i) => {
			const mats = (d.materials || []).map((m) =>
				`${esc(m.item)} · ${m.stone ? `${cint(m.qty)} pc · ${g3(m.weight)} ct` : `${g3(m.weight)} g`}`).join("<br>");
			const status = d.exists
				? `<span class="id-have">${__("already here")}</span>`
				: (d.problems.length
					? `<span class="id-need">${esc(d.problems.join("; "))}</span>`
					: (d.design_type ? `<span class="id-ok">${__("ready")}</span>`
						: `<span class="id-need">${__("pick a type")}</span>`));
			return `<tr class="${S.sel.has(d.name) ? "sel" : ""} ${d.problems.length ? "bad" : ""} ${d.exists ? "have" : ""}" data-i="${i}">
				<td><input type="checkbox" class="id-cb" ${S.sel.has(d.name) ? "checked" : ""} ${d.exists ? "disabled" : ""}></td>
				<td><b>${esc(d.name || d.code || "?")}</b>
					<div class="id-mats">${esc(d.pieces.slice(0, 4).join(", "))}${d.pieces.length > 4 ? " …" : ""}</div></td>
				<td>${d.exists ? esc(d.design_type || "") : `<select class="id-mini id-dt" style="width:130px;">
					<option value="">—</option>
					${types.map((t) => `<option value="${esc(t)}"${d.design_type === t ? " selected" : ""}>${esc(t)}</option>`).join("")}
				</select>`}</td>
				<td class="num">${d.piece_count}</td>
				<td class="num">${g3(d.gold_g)}</td>
				<td class="id-mats">${mats || "—"}</td>
				<td>${status}</td>
			</tr>`;
		}).join("") || `<tr><td colspan="7" class="id-empty">${__("Nothing on this sheet.")}</td></tr>`);
	}

	function paintBulk() {
		const types = S.ctx.design_types || [];
		const $b = root.find(".id-btype");
		if ($b.children().length <= 1)
			$b.append(types.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join(""));
		root.find(".id-selinfo").text(S.sel.size ? __("{0} selected", [S.sel.size]) : "");
	}

	function paintSide() {
		if (!S.pv) return root.find(".id-side").empty();
		const w = (S.conv && S.conv.warnings) || [];
		const n = makeable().length;
		root.find(".id-side").html(`
			${w.length ? `<div class="id-warn">${w.map(esc).join("<br>")}</div>` : ""}
			<div class="id-box">
				<div class="h">${__("This sheet")}</div>
				<table class="id-map">
					<tr><td class="lbl">${__("File")}</td><td>${esc(S.file ? S.file.name : "")}</td></tr>
					<tr><td class="lbl">${__("Worksheet")}</td><td>${esc(S.conv.sheet)}</td></tr>
					<tr><td class="lbl">${__("Supplier")}</td><td>${esc(S.fmt.supplier || "—")}</td></tr>
					<tr><td class="lbl">${__("Short code")}</td><td><b>${esc(S.fmt.supplier_code)}</b></td></tr>
					<tr><td class="lbl">${__("Quality")}</td><td>${esc(S.fmt.default_quality || "—")}</td></tr>
					<tr><td class="lbl">${__("Diamonds")}</td><td>${esc(S.fmt.default_stone_family || "—")}</td></tr>
				</table>
				<div class="id-act">
					<button class="btn btn-xs btn-default id-remap">${__("Change the mapping")}</button>
				</div>
			</div>
			<div class="id-box">
				<div class="h">${__("Make them")}</div>
				<div class="id-act">
					<button class="btn btn-sm btn-primary id-make" ${n ? "" : "disabled"}>${__("Create {0} design(s)", [n])}</button>
				</div>
			</div>`);
	}

	// ---- events -------------------------------------------------------------
	root.on("change", ".id-cb", function () {
		const d = designs()[cint($(this).closest("tr").data("i"))];
		if (!d) return;
		this.checked ? S.sel.add(d.name) : S.sel.delete(d.name);
		paintBulk(); paintRows();
	});
	root.on("change", ".id-all", function () {
		designs().forEach((d) => {
			if (d.exists) return;
			this.checked ? S.sel.add(d.name) : S.sel.delete(d.name);
		});
		paintBulk(); paintRows();
	});
	root.on("change", ".id-dt", function () {
		const d = designs()[cint($(this).closest("tr").data("i"))];
		if (d) { d.design_type = this.value; paintRows(); paintSide(); }
	});
	root.on("change", ".id-btype", function () {
		const t = this.value;
		if (!t) return;
		designs().forEach((d) => { if (!d.exists && S.sel.has(d.name)) d.design_type = t; });
		this.value = "";
		paintRows(); paintSide();
	});
	root.on("click", ".id-remap", () => {
		const sheet = (S.sniff.sheets || []).find((s) => s.sheet === S.conv.sheet) || (S.sniff.sheets || [])[0];
		openMapping(sheet, S.fmt);
	});
	root.on("click", ".id-make", () => {
		const rows = makeable();
		if (!rows.length) return;
		frappe.confirm(
			__("Create {0} design(s)? Each gets its own item and bill of materials, and a design cannot be edited afterwards.", [rows.length]),
			() => {
				frappe.dom.freeze(__("Making the designs…"));
				frappe.call({ method: API + ".create_import_designs", args: { designs: JSON.stringify(rows) } })
					.then((r) => {
						const m = r.message || {};
						frappe.msgprint({
							title: __("Designs"), indicator: (m.failed || []).length ? "orange" : "green",
							message: [
								__("Made: {0}", [(m.made || []).length]),
								(m.skipped || []).length ? __("Already there: {0}", [(m.skipped || []).length]) : "",
								(m.failed || []).length
									? __("Did not go in:") + "<br>" + m.failed.map((f) => `${esc(f.name)} — ${esc(f.why)}`).join("<br>")
									: "",
							].filter(Boolean).join("<br>"),
						});
						preview();
					})
					.always(() => frappe.dom.unfreeze());
			});
	});

	page.set_primary_action(__("Load sheet"), loadFile, "upload");
	page.add_inner_button(__("Our template"), () =>
		window.open("/api/method/jewelima.jewelima.api.download_standard_sheet_template"));
	page.add_inner_button(__("Saved formats"), () =>
		frappe.set_route("List", "Supplier Sheet Format"));

	function boot() {
		frappe.call({ method: API + ".get_import_design_context" }).then((r) => {
			S.ctx = r.message || {};
			paint();
		});
	}
	frappe.pages["import-design"].on_page_show = function () { if (!S.ctx) boot(); };
	boot();
};
