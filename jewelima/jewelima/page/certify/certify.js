// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Certification desk (Delivery) — PREPARE a batch: pick the certification +
// center first (locks the format and, for IGI, the ONE colour+clarity), then
// scan products in. Every rejected scan lands in the history with WHY. The
// table mirrors the lab's submission format. Prep gets its final outgoing
// name (IGI-0001) immediately; the actual SEND happens on Send Certifications.
// Route: /app/certify

frappe.pages["certify"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Certification", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	let CTX = { types: [], centers: [], qualities: [] };
	let prep = null;
	const hist = [];

	$(page.main).append(`
		<style>
		.cf-setup{display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin-bottom:14px;}
		.cf-setup .frappe-control{margin:0;min-width:200px;}
		.cf-req{font-size:12px;color:var(--text-muted);max-width:900px;margin-bottom:12px;white-space:pre-wrap;}
		.cf-cols{display:flex;gap:20px;align-items:flex-start;}
		.cf-main{flex:1;min-width:0;}
		.cf-side{flex:0 0 340px;}
		.cf-head{display:none;gap:18px;align-items:baseline;flex-wrap:wrap;background:var(--control-bg);border:1px solid var(--border-color);border-radius:8px;padding:10px 16px;margin-bottom:12px;}
		.cf-head .nm{font-size:19px;font-weight:800;}
		.cf-lock{font-size:11px;font-weight:700;border-radius:10px;padding:2px 10px;background:#1f618d;color:#fff;}
		.cf-scanrow{display:none;gap:10px;align-items:end;margin-bottom:10px;}
		.cf-scanrow .frappe-control{margin:0;flex:0 0 260px;}
		table.cf-t{width:100%;border-collapse:collapse;font-size:12.5px;background:var(--fg-color);display:none;}
		table.cf-t th{background:var(--control-bg);font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);padding:6px 8px;border:1px solid var(--border-color);text-align:left;}
		table.cf-t td{border:1px solid var(--border-color);padding:5px 8px;}
		table.cf-t td.r{text-align:right;}
		table.cf-t .del{cursor:pointer;color:#b02a2a;font-weight:700;text-align:center;width:26px;}
		.cf-tot{display:none;margin-top:8px;font-weight:700;}
		.cf-actions{display:none;margin-top:14px;gap:8px;}
		.cf-panel{border:1px solid var(--border-color);border-radius:8px;background:var(--fg-color);overflow:hidden;display:none;}
		.cf-panel .h{background:var(--control-bg);padding:8px 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);display:flex;justify-content:space-between;}
		.cf-panel .b{max-height:420px;overflow:auto;}
		.cf-panel td{padding:4px 12px;border-top:1px solid var(--border-color);font-size:12px;}
		.cf-hb{display:inline-block;border-radius:10px;padding:1px 8px;font-size:10.5px;font-weight:700;color:#fff;}
		.cf-hb.ok{background:#2e7d32;}.cf-hb.no{background:#c0392b;}
		</style>
		<div class="cf-setup">
			<div class="cf-type"></div><div class="cf-center"></div><div class="cf-qual" style="display:none;"></div>
			<button class="btn btn-primary cf-start">${__("Start Prep")}</button>
		</div>
		<div class="cf-req"></div>
		<div class="cf-cols">
			<div class="cf-main">
				<div class="cf-head"></div>
				<div class="cf-scanrow"><div class="cf-scan"></div>
					<span style="font-size:11.5px;color:var(--text-muted);">${__("scan / type card no. + Enter — products only")}</span></div>
				<table class="cf-t"><thead class="cf-th"></thead><tbody class="cf-tb"></tbody></table>
				<div class="cf-tot"></div>
				<div class="cf-actions">
					<button class="btn btn-default cf-xlsx" style="display:none;">${__("Export IGI Excel")}</button>
					<button class="btn btn-default cf-cancel" style="color:#b02a2a;">${__("Cancel Batch")}</button>
					<a class="btn btn-default" href="/app/send-certifications">${__("Go to Send Certifications →")}</a>
				</div>
			</div>
			<div class="cf-side"><div class="cf-panel">
				<div class="h"><span>${__("Scan History")}</span><span class="cf-hist-t"></span></div>
				<div class="b cf-hist-b"></div>
			</div></div>
		</div>
	`);
	const root = $(page.main);
	const mk = (sel, df) => { const c = frappe.ui.form.make_control({ df, parent: root.find(sel).get(0), render_input: true }); c.refresh(); return c; };
	const fType = mk(".cf-type", { fieldtype: "Select", label: __("Certification"), fieldname: "ct", options: "" });
	const fCenter = mk(".cf-center", { fieldtype: "Select", label: __("Center"), fieldname: "cc", options: "" });
	const fQual = mk(".cf-qual", { fieldtype: "Select", label: __("Colour + Clarity (locked)"), fieldname: "q", options: "" });
	const scan = mk(".cf-scan", { fieldtype: "Data", label: __("Scan Product"), fieldname: "scan" });

	frappe.call({ method: API + ".get_cert_prep_context" }).then((r) => {
		CTX = r.message || CTX;
		fType.df.options = [""].concat(CTX.types.map((t) => t.name)).join("\n"); fType.refresh();
		fQual.df.options = [""].concat(CTX.qualities).join("\n"); fQual.refresh();
	});
	fType.$input.on("change", () => {
		const t = fType.get_value();
		fCenter.df.options = [""].concat(CTX.centers.filter((c) => c.certification_type === t).map((c) => c.name)).join("\n");
		fCenter.refresh();
		root.find(".cf-qual").toggle(t === "IGI");
		const ty = CTX.types.find((x) => x.name === t);
		root.find(".cf-req").text(ty && ty.excel_requirements ? __("Rules: ") + ty.excel_requirements : "");
	});

	root.find(".cf-start").on("click", () => {
		const t = fType.get_value();
		if (!t) return frappe.show_alert({ message: __("Pick the certification."), indicator: "orange" }, 3);
		frappe.call({ method: API + ".create_cert_prep", args: { cert_type: t, center: fCenter.get_value() || null, quality: fQual.get_value() || null } })
			.then((r) => load((r.message || {}).name));
	});

	function load(name) {
		frappe.call({ method: API + ".get_cert_prep", args: { name } }).then((r) => { prep = r.message; paint(); });
	}
	function logScan(code, ok, note) {
		hist.unshift({ code, ok, note: note || "", t: frappe.datetime.now_time().slice(0, 5) });
		if (hist.length > 40) hist.pop();
		root.find(".cf-hist-t").text(__("{0} scan(s)", [hist.length]));
		root.find(".cf-hist-b").html(`<table><tbody>${hist.map((h) => `
			<tr><td>${esc(h.code)}</td><td><span class="cf-hb ${h.ok ? "ok" : "no"}">${h.ok ? __("ADDED") : __("REJECTED")}</span></td>
			<td class="text-muted" title="${esc(h.note)}">${esc(h.note.slice(0, 44))}</td>
			<td class="text-muted">${h.t}</td></tr>`).join("")}</tbody></table>`);
		root.find(".cf-panel").show();
	}

	const IGI_COLS = ["style_no", "metal_color", "color", "clarity", "shape", "gross", "dmd_ct"];
	const IGI_HEAD = [__("Style Number"), __("Metal Color"), __("Color Criteria"), __("Clarity Criteria"), __("Shape"), __("Gross Wt (g)"), __("Diamond Wt (ct)")];
	const BASIC_COLS = ["order_bag", "design", "design_type", "gross", "dmd_ct"];
	const BASIC_HEAD = [__("Card"), __("Design"), __("Type"), __("Gross (g)"), __("Diamond (ct)")];

	function paint() {
		const igi = prep.cert_type === "IGI";
		const locked = prep.status !== "Prepared";
		root.find(".cf-setup, .cf-req").toggle(false);
		root.find(".cf-head").css("display", "flex").html(`
			<span class="nm">${esc(prep.name)}</span>
			<span>${esc(prep.cert_type)}${prep.center ? " · " + esc(prep.center.split("-").slice(1).join("-")) : ""}</span>
			${prep.quality ? `<span class="cf-lock">${esc(prep.quality)}</span>` : ""}
			<span class="cf-lock" style="background:${prep.status === "Prepared" ? "#7f8c8d" : prep.status === "Cancelled" ? "#b02a2a" : "#2e7d32"};">${esc(prep.status)}</span>`);
		const cols = igi ? IGI_COLS : BASIC_COLS;
		const head = igi ? IGI_HEAD : BASIC_HEAD;
		root.find(".cf-th").html(`<tr>${igi ? `<th>${__("Card")}</th>` : ""}${head.map((h) => `<th>${h}</th>`).join("")}${locked ? "" : "<th></th>"}</tr>`);
		root.find(".cf-tb").html(prep.rows.map((r) => `<tr data-row="${esc(r.row)}">
			${igi ? `<td><b>${esc(r.order_bag)}</b></td>` : ""}
			${cols.map((c) => `<td class="${typeof r[c] === "number" ? "r" : ""}">${typeof r[c] === "number" ? r[c].toFixed(3) : esc("" + (r[c] || ""))}</td>`).join("")}
			${locked ? "" : '<td class="del">&times;</td>'}</tr>`).join("")
			|| `<tr><td colspan="9" style="color:var(--text-muted);padding:14px;">${__("Scan the first product.")}</td></tr>`);
		root.find("table.cf-t").show();
		root.find(".cf-tot").show().text(__("{0} piece(s) · {1} g gross · {2} ct diamond", [prep.count, prep.gross, prep.dmd_ct]));
		root.find(".cf-scanrow").css("display", locked ? "none" : "flex");
		root.find(".cf-actions").css("display", "flex");
		root.find(".cf-xlsx").toggle(igi && prep.count > 0);
		root.find(".cf-cancel").toggle(!locked);
		if (!locked) setTimeout(() => scan.$input.focus(), 100);
	}

	scan.$input.on("keydown", (e) => {
		if (e.key !== "Enter") return;
		const v = (scan.$input.val() || "").trim();
		if (!v) return;
		scan.set_value("");
		frappe.call({ method: API + ".cert_prep_scan", args: { name: prep.name, barcode: v }, freeze: false })
			.then((r) => { prep = r.message; logScan(v, true, ""); paint(); })
			.catch((err) => {
				const msg = ((err && err._server_messages && JSON.parse(JSON.parse(err._server_messages)[0]).message) || __("Rejected")).replace(/<[^>]*>/g, "");
				logScan(v, false, msg);
				scan.$input.focus();
			});
	});
	root.on("click", "table.cf-t .del", function () {
		frappe.call({ method: API + ".cert_prep_remove", args: { name: prep.name, row: $(this).closest("tr").data("row") } })
			.then((r) => { prep = r.message; paint(); });
	});
	root.find(".cf-cancel").on("click", () => frappe.confirm(__("Cancel {0}? The record stays, marked Cancelled.", [prep.name]),
		() => frappe.call({ method: API + ".cert_prep_cancel", args: { name: prep.name } }).then(() => load(prep.name))));
	root.find(".cf-xlsx").on("click", () =>
		open_url_post("/api/method/jewelima.jewelima.api.export_igi_xlsx", { bags: JSON.stringify(prep.rows.map((r) => r.order_bag)) }));

	// arriving with a prep already picked (from Send Certifications)
	if (frappe.route_options && frappe.route_options.prep) { load(frappe.route_options.prep); frappe.route_options = null; }
};
