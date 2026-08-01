// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// OLD FORMAT — convert the old software's QUOTATION excel into the NEW
// billing-format template that Sell Old accepts. The user enriches what the
// old file is missing: per-piece COLOR (plus size / gents-ladies / shape),
// and the certification lab + running CERT NO (the number the team marks on
// the product physically, so the excel points at the piece directly).
// Straight data — nothing stored; refresh and it's gone.
// Route: /app/old-format

frappe.pages["old-format"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "OLD FORMAT", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	let FILE = null;   // {b64, name}
	let ROWS = [];     // parsed + user-enriched rows
	let COVER = {};

	$(page.main).append(`
		<style>
		#page-old-format .container{max-width:100%;}
		.of-bar{display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin-bottom:12px;}
		.of-bar .frappe-control{margin:0;min-width:150px;}
		.of-bar .control-label{font-size:11px;color:var(--text-muted);}
		.of-file{border:2px dashed var(--border-color);border-radius:9px;padding:9px 16px;cursor:pointer;font-size:12.5px;color:var(--text-muted);}
		.of-file.has{border-color:#2e7d32;color:#1d7a33;font-weight:700;}
		.of-btn{border:none;color:#fff;font-weight:800;padding:9px 20px;border-radius:8px;cursor:pointer;}
		.of-dl{background:#2e7d32;display:none;}
		.of-auto{background:#5b3a8e;display:none;}
		.of-cover{font-size:12.5px;color:var(--text-muted);margin-bottom:10px;}
		.of-cover b{color:var(--text-color);}
		table.of-t{width:100%;border-collapse:collapse;font-size:12px;background:var(--fg-color);}
		table.of-t th{background:var(--control-bg);font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);padding:5px 8px;border:1px solid var(--border-color);text-align:left;white-space:nowrap;}
		table.of-t td{border:1px solid var(--border-color);padding:3px 6px;font-variant-numeric:tabular-nums;white-space:nowrap;}
		table.of-t td.num{text-align:right;}
		table.of-t input, table.of-t select{border:1px solid var(--border-color);border-radius:5px;padding:1px 5px;font-size:11.5px;background:var(--fg-color);color:var(--text-color);}
		table.of-t input{text-transform:uppercase;}
		.of-none{padding:34px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:10px;}
		</style>
		<div class="of-bar">
			<label class="of-file">${__("📄 Pick the OLD quotation .xlsx")}</label>
			<input type="file" class="of-input" accept=".xlsx" style="display:none;">
			<div class="of-qual"></div>
			<div class="of-party"></div>
			<div class="of-color"></div>
			<button class="of-btn of-auto">${__("Auto-number certs")}</button>
			<button class="of-btn of-dl">${__("Download NEW format ⤓")}</button>
		</div>
		<div class="of-cover"></div>
		<div class="of-body"><div class="of-none">${__("Upload the OLD quotation excel — fill COLOR (and anything else missing), tag certifications with their number, then download the NEW format for Sell Old.")}</div></div>
		<datalist id="of-colors"><option>YELLOW</option><option>ROSE</option><option>WHITE</option></datalist>
		<datalist id="of-labs"><option>IGI</option><option>SGL</option><option>DHC</option><option>GIA</option></datalist>
	`);
	const root = $(page.main);
	const mk = (sel, df) => { const c = frappe.ui.form.make_control({ df, parent: root.find(sel).get(0), render_input: true }); c.refresh(); return c; };
	const fQual = mk(".of-qual", { fieldtype: "Select", label: __("Diamond quality token"), fieldname: "q",
		options: ["EF", "GH", "SI", "CZ", "CVD"].join("\n"), default: "EF" });
	fQual.set_value("EF");
	const fParty = mk(".of-party", { fieldtype: "Data", label: __("Shop / party"), fieldname: "party" });
	const fColor = mk(".of-color", { fieldtype: "Data", label: __("Fill COLOR on empty rows"), fieldname: "col",
		description: __("type + Enter, e.g. YELLOW") });

	root.find(".of-file").on("click", () => root.find(".of-input").get(0).click());
	root.find(".of-input").on("change", function () {
		const file = this.files[0];
		if (!file) return;
		const rd = new FileReader();
		rd.onload = () => {
			FILE = { b64: rd.result, name: file.name };
			root.find(".of-file").addClass("has").text("📄 " + file.name);
			frappe.call({ method: API + ".parse_old_format_excel", args: { filedata: FILE.b64 } }).then((r) => {
				const m = r.message || {};
				ROWS = m.rows || [];
				COVER = m.cover || {};
				if (COVER.party && !fParty.get_value()) fParty.set_value(COVER.party);
				root.find(".of-cover").html(__("Invoice <b>{0}</b> · party <b>{1}</b> · <b>{2}</b> piece(s) — order and SL# are rebuilt on download (item → colour → below-1g first)",
					[esc(COVER.invoice_no || "—"), esc(COVER.party || "—"), m.count || 0]));
				paint();
				root.find(".of-dl, .of-auto").show();
			});
		};
		rd.readAsDataURL(file);
	});

	function paint() {
		root.find(".of-body").html(ROWS.length ? `
			<table class="of-t"><thead><tr>
				<th>#</th><th>${__("Unique ID")}</th><th>${__("HUID")}</th><th>${__("Item")}</th><th>${__("Design")}</th>
				<th class="num">${__("GS g")}</th><th class="num">${__("NT g")}</th><th class="num">${__("DMD ct/pcs")}</th>
				<th>${__("COLOR")}</th><th>${__("Size")}</th><th>${__("G/L")}</th><th>${__("Shape")}</th>
				<th>${__("Cert")}</th><th title="${__("marked on the product physically — printed in the JOS export")}">${__("Cert No")}</th>
			</tr></thead><tbody>
			${ROWS.map((r, i) => `<tr data-i="${i}">
				<td>${r.sl}</td><td><b>${esc(r.unique_id)}</b></td><td>${esc(r.huid)}</td>
				<td>${esc(r.item)}</td><td>${esc(r.design)}</td>
				<td class="num">${r.gs}</td><td class="num">${r.nt}</td>
				<td class="num">${r.dmd_ct || ""}${r.dmd_pcs ? " / " + r.dmd_pcs : ""}</td>
				<td><input data-f="colour" list="of-colors" value="${esc(r.colour)}" style="width:76px;"></td>
				<td><input data-f="size" value="${esc(r.size)}" style="width:48px;"></td>
				<td><select data-f="style"><option value=""></option>
					<option ${r.style === "GENTS" ? "selected" : ""}>GENTS</option>
					<option ${r.style === "LADIES" ? "selected" : ""}>LADIES</option></select></td>
				<td><input data-f="shape" value="${esc(r.shape)}" style="width:64px;"></td>
				<td><input data-f="cert" list="of-labs" value="${esc(r.cert)}" style="width:56px;"></td>
				<td><input data-f="cert_no" value="${esc(r.cert_no)}" style="width:56px;"></td>
			</tr>`).join("")}</tbody></table>`
			: `<div class="of-none">${__("No pieces found in the Design sheet.")}</div>`);
	}

	root.on("change", "table.of-t [data-f]", function () {
		const i = cint($(this).closest("tr").data("i"));
		const f = $(this).data("f");
		let v = ($(this).val() || "").trim();
		if (f !== "size" && f !== "cert_no") v = v.toUpperCase();
		if (this.tagName === "INPUT") this.value = v;
		ROWS[i][f] = v;
	});

	// bulk COLOR for still-empty rows
	fColor.$input.on("keydown", (e) => {
		if (e.key !== "Enter") return;
		const v = (fColor.get_value() || "").trim().toUpperCase();
		if (!v) return;
		let n = 0;
		ROWS.forEach((r) => { if (!r.colour) { r.colour = v; n++; } });
		paint();
		frappe.show_alert({ message: __("{0} row(s) coloured {1}.", [n, v]), indicator: "green" }, 3);
	});

	// sequential CERT NO for every row with a lab but no number yet
	root.on("click", ".of-auto", () => {
		let next = 1 + Math.max(0, ...ROWS.map((r) => cint(r.cert_no) || 0));
		let n = 0;
		ROWS.forEach((r) => { if (r.cert && !r.cert_no) { r.cert_no = String(next++); n++; } });
		paint();
		frappe.show_alert({ message: n ? __("{0} cert(s) numbered.", [n]) : __("Nothing to number — set a Cert lab first."), indicator: n ? "green" : "orange" }, 3);
	});

	root.on("click", ".of-dl", () => {
		if (!ROWS.length) return;
		const missing = ROWS.filter((r) => !r.colour).length;
		if (missing) return frappe.show_alert({ message: __("{0} row(s) still have no COLOR — fill them first.", [missing]), indicator: "orange" }, 4);
		const half = ROWS.filter((r) => (r.cert && !r.cert_no) || (!r.cert && r.cert_no)).length;
		if (half) return frappe.show_alert({ message: __("{0} row(s) have a Cert lab without a number (or the other way) — complete them.", [half]), indicator: "orange" }, 4);
		open_url_post("/api/method/jewelima.jewelima.api.export_old_format_billing", {
			rows: JSON.stringify(ROWS), quality_token: fQual.get_value() || "EF",
			party: fParty.get_value() || "",
			filename: "NEW " + (FILE.name || "format").replace(/\.xlsx$/i, ""),
		});
	});
};
