// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Design Export / Import (Design Bank) — move designs between sites. One .zip
// carries the photo, the BOM and the masters; DESIGN NAME is the key, so the same
// file re-imports safely. Route: /app/design-transfer

frappe.pages["design-transfer"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Design Export / Import", single_column: true });
	const API = "jewelima.jewelima.design_transfer";
	const S = { file: "" };
	const esc = frappe.utils.escape_html;

	$(page.main).append(`
		<style>
		.dx-wrap{max-width:820px;}
		.dx-card{border:1px solid var(--border-color);border-radius:10px;background:var(--fg-color);padding:16px 18px;margin-bottom:16px;}
		.dx-card h4{margin:0 0 4px;font-size:14px;font-weight:800;}
		.dx-card .hint{font-size:12px;color:var(--text-muted);margin-bottom:12px;}
		.dx-row{display:flex;gap:10px;align-items:end;flex-wrap:wrap;}
		.dx-row .frappe-control{margin:0;flex:0 0 190px;}
		.dx-row .control-label{font-size:11px;color:var(--text-muted);}
		.dx-stat{font-size:12.5px;color:var(--text-muted);margin-top:10px;}
		.dx-go{background:#2e7d32;border-color:#2e7d32;color:#fff;font-weight:700;}
		.dx-rep{margin-top:12px;font-size:12.5px;}
		.dx-rep table{width:100%;border-collapse:collapse;margin-top:6px;}
		.dx-rep td,.dx-rep th{border:1px solid var(--border-color);padding:4px 8px;font-size:12px;text-align:left;}
		.dx-err{color:var(--red-600,#c0392b);}
		</style>
		<div class="dx-wrap">
			<div class="dx-card">
				<h4>${__("Export")}</h4>
				<div class="hint">${__("Downloads a .zip with each design's photo, BOM and masters. Design name is the key.")}</div>
				<div class="dx-row">
					<div class="dx-type"></div><div class="dx-status"></div>
					<button class="btn btn-sm dx-go dx-export">${__("Export .zip")}</button>
				</div>
				<div class="dx-stat dx-count"></div>
			</div>
			<div class="dx-card">
				<h4>${__("Import")}</h4>
				<div class="hint">${__("Upload a .zip exported from another site. Existing designs are matched on their NAME — skip leaves them untouched, update refreshes type / style / photo / BOM. Raw-material items must already exist here.")}</div>
				<div class="dx-row">
					<div class="dx-file"></div><div class="dx-mode"></div>
					<button class="btn btn-sm dx-go dx-import">${__("Import")}</button>
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
	const file = mk(".dx-file", { fieldtype: "Attach", label: __("Export .zip"), fieldname: "f" });
	const mode = mk(".dx-mode", { fieldtype: "Select", label: __("If it already exists"), fieldname: "m", options: "skip\nupdate", default: "skip" });

	function preview() {
		frappe.call({ method: API + ".preview_export", args: { design_type: type.get_value() || null, status: status.get_value() || null } })
			.then((r) => {
				const m = r.message || {};
				root.find(".dx-count").text(__("{0} design(s) · {1} with a photo · {2} BOM line(s) will be exported.",
					[m.count || 0, m.with_photo || 0, m.materials || 0]));
			});
	}
	type.$input.on("change", preview);
	status.$input.on("change", preview);

	root.find(".dx-export").on("click", () => {
		const q = [];
		if (type.get_value()) q.push("design_type=" + encodeURIComponent(type.get_value()));
		if (status.get_value()) q.push("status=" + encodeURIComponent(status.get_value()));
		window.open("/api/method/jewelima.jewelima.design_transfer.export_designs" + (q.length ? "?" + q.join("&") : ""), "_blank");
	});

	root.find(".dx-import").on("click", () => {
		const f = file.get_value();
		if (!f) return frappe.msgprint(__("Attach the export .zip first."));
		frappe.confirm(__("Import designs from this file (mode: <b>{0}</b>)?", [mode.get_value() || "skip"]), () => {
			frappe.dom.freeze(__("Importing..."));
			frappe.call({ method: API + ".import_designs", args: { file_url: f, mode: mode.get_value() || "skip" } })
				.then((r) => {
					frappe.dom.unfreeze();
					const m = r.message || {};
					const errs = (m.errors || []).map((e) => `<tr><td>${esc(e.design)}</td><td class="dx-err">${esc(e.error)}</td></tr>`).join("");
					root.find(".dx-rep").html(`
						<b>${__("Created")}: ${m.created}</b> · ${__("Updated")}: ${m.updated} · ${__("Skipped")}: ${m.skipped} ${__("of")} ${m.total}
						${errs ? `<table><thead><tr><th>${__("Design")}</th><th>${__("Not imported because")}</th></tr></thead><tbody>${errs}</tbody></table>` : ""}`);
					frappe.show_alert({ message: __("{0} created, {1} updated.", [m.created, m.updated]), indicator: "green" }, 6);
					preview();
				})
				.catch(() => frappe.dom.unfreeze());
		});
	});

	page.add_inner_button(__("Designs"), () => frappe.set_route("List", "Design"));
	preview();
};
