// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Selection Export / Import — move the whole photo book (photos + meta + tags +
// the Selection records) to another system as one .zip. Export left, import
// right. Photo CODE is the key: importing the same file twice is safe.
// Route: /app/selection-transfer

frappe.pages["selection-transfer"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Selection Export / Import", single_column: true });
	const API = "jewelima.jewelima.selection_transfer";
	const esc = frappe.utils.escape_html;

	$(page.main).append(`
		<style>
		.st-wrap{display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:1050px;}
		@media (max-width: 900px){.st-wrap{grid-template-columns:1fr;}}
		.st-card{border:1px solid var(--border-color);border-radius:10px;background:var(--fg-color);padding:16px 18px;}
		.st-card h4{margin:0 0 4px;font-size:15px;}
		.st-card .hint{font-size:12px;color:var(--text-muted);margin-bottom:12px;}
		.st-card .control-label{font-size:11px;color:var(--text-muted);}
		.st-sum{border:1px dashed var(--border-color);border-radius:8px;padding:10px 12px;font-size:12.5px;
			color:var(--text-muted);margin:10px 0;min-height:40px;}
		.st-sum b{color:var(--text-color);}
		.st-go{background:#2e7d32;border:none;color:#fff;font-weight:800;letter-spacing:.4px;
			padding:9px 26px;border-radius:7px;font-size:13px;cursor:pointer;}
		.st-go:hover{background:#256628;}
		.st-go:disabled{opacity:.45;cursor:default;}
		.st-mode{display:flex;gap:14px;font-size:12.5px;margin:8px 0;}
		</style>
		<div class="st-wrap">
			<div class="st-card">
				<h4>${__("Export")}</h4>
				<div class="hint">${__("One .zip: every photo (image + code, design type, provider, stock, weights, tags) plus all Selection records. Leave the filters empty to take everything.")}</div>
				<div class="st-e-dtype"></div>
				<div class="st-e-provider"></div>
				<div class="st-sum st-e-sum">${__("…")}</div>
				<button class="st-go st-export">${__("EXPORT .ZIP")}</button>
			</div>
			<div class="st-card">
				<h4>${__("Import")}</h4>
				<div class="hint">${__("Upload a selection export .zip from the other system. Photos land keyed on CODE; design types, providers and tags are created automatically if missing.")}</div>
				<div class="st-i-file"></div>
				<div class="st-sum st-i-sum">${__("Upload the .zip to see what's inside.")}</div>
				<div class="st-mode">
					<label><input type="radio" name="st-mode" value="skip" checked> ${__("Skip photos that already exist")}</label>
					<label><input type="radio" name="st-mode" value="update"> ${__("Update existing photos")}</label>
				</div>
				<div class="st-mode">
					<label><input type="checkbox" class="st-with-sel" checked> ${__("Also import the Selection records")}</label>
				</div>
				<button class="st-go st-import" disabled>${__("IMPORT")}</button>
			</div>
		</div>
	`);
	const root = $(page.main);

	const mk = (sel, df) => {
		const c = frappe.ui.form.make_control({ df, parent: root.find(sel).get(0), render_input: true });
		c.refresh();
		return c;
	};
	const eDtype = mk(".st-e-dtype", { fieldtype: "Link", label: __("Design Type (optional)"), fieldname: "dt",
		options: "Design Type", onchange: () => preview() });
	const eProv = mk(".st-e-provider", { fieldtype: "Link", label: __("Provider (optional)"), fieldname: "pr",
		options: "Supplier", onchange: () => preview() });
	const iFile = mk(".st-i-file", { fieldtype: "Attach", label: __("Export .zip"), fieldname: "zip",
		onchange: () => inspect() });

	const eArgs = () => ({
		design_type: eDtype.get_value() || null,
		provider: eProv.get_value() || null,
	});

	function preview() {
		frappe.call({ method: API + ".preview_export", args: eArgs() }).then((r) => {
			const m = r.message || {};
			root.find(".st-e-sum").html(__("<b>{0}</b> photo(s) match ({1} with an image) · <b>{2}</b> selection record(s) travel along",
				[m.photos || 0, m.with_image || 0, m.selections || 0]));
		});
	}

	root.find(".st-export").on("click", () => {
		const a = eArgs();
		open_url_post("/api/method/" + API + ".export_selection", a);
	});

	function inspect() {
		const f = iFile.get_value();
		if (!f) {
			root.find(".st-i-sum").text(__("Upload the .zip to see what's inside."));
			root.find(".st-import").prop("disabled", true);
			return;
		}
		frappe.call({ method: API + ".inspect_import", args: { file_url: f } }).then((r) => {
			const m = r.message || {};
			root.find(".st-i-sum").html(__("From <b>{0}</b> ({1}): <b>{2}</b> photo(s) — <b>{3} new</b> here, {4} already exist · {5} selection record(s)",
				[esc((m.manifest || {}).site || "?"), esc((m.manifest || {}).exported_on || ""),
					m.photos || 0, m.new || 0, m.existing || 0, m.selections || 0]));
			root.find(".st-import").prop("disabled", false);
		}).catch(() => {
			root.find(".st-i-sum").html(`<span style="color:#b02a2a;">${__("That file isn't a selection export.")}</span>`);
			root.find(".st-import").prop("disabled", true);
		});
	}

	root.find(".st-import").on("click", () => {
		const f = iFile.get_value();
		if (!f) return;
		const mode = root.find("input[name='st-mode']:checked").val();
		frappe.confirm(__("Import this file? Mode: <b>{0}</b>.", [mode]), () => {
			frappe.dom.freeze(__("Importing..."));
			frappe.call({ method: API + ".import_selection", args: {
				file_url: f, mode, with_selections: root.find(".st-with-sel").is(":checked") ? 1 : 0,
			} }).then((r) => {
				frappe.dom.unfreeze();
				const m = r.message || {};
				const errs = (m.errors || []).slice(0, 8)
					.map((e) => `<div style="color:#b02a2a;font-size:12px;">${esc(e.code)}: ${esc(e.error)}</div>`).join("");
				frappe.msgprint({
					title: __("Import finished"), indicator: (m.errors || []).length ? "orange" : "green",
					message: __("Photos — created: <b>{0}</b>, updated: <b>{1}</b>, skipped: {2}.<br>Selections — created: <b>{3}</b>, already here: {4}.",
						[m.created || 0, m.updated || 0, m.skipped || 0, m.selections_created || 0, m.selections_skipped || 0]) + (errs ? "<hr>" + errs : ""),
				});
				inspect();
			}).catch(() => frappe.dom.unfreeze());
		});
	});

	page.add_inner_button(__("Selection"), () => frappe.set_route("select-photos"));
	preview();
};
