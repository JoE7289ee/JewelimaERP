// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Certification desk (Delivery) — PREPARE a batch: pick the certification +
// center first (locks the format and, for IGI, the ONE colour+clarity), then
// scan products into a LOCAL draft (nothing saved). Every rejected scan lands
// in the history with WHY. Hitting PREP creates the batch in one shot with its
// final code-series name (IGI-0001); the actual SEND happens on Send Certifications.
// Route: /app/certify

frappe.pages["certify"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Certification", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	let CTX = { types: [], centers: [], qualities: [] };
	let prep = null;    // a SAVED batch (opened from Send Certifications)
	let draft = null;   // the local unsaved list {cert_type, center, quality, rows}
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
		.cf-why{display:none;margin-left:8px;font-size:11.5px;color:#c0392b;}
		.cf-hrow:hover .cf-why{display:inline;}
		.cf-tip{position:fixed;z-index:2000;display:none;background:#1a1a1a;color:#fff;border-radius:7px;padding:8px 12px;font-size:12px;line-height:1.6;box-shadow:0 4px 14px rgba(0,0,0,.3);max-width:340px;pointer-events:none;}
		.cf-tip .t{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#aaa;margin-bottom:2px;}
		td.cf-bag{cursor:help;text-decoration:underline dotted;}
		</style>
		<div class="cf-setup">
			<div class="cf-type"></div><div class="cf-center"></div><div class="cf-qual" style="display:none;"></div>
			<button class="btn btn-primary cf-start">${__("Start Scanning")}</button>
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
					<button class="btn btn-primary cf-prep" style="background:#2e7d32;border-color:#2e7d32;display:none;">${__("PREP — create the batch")}</button>
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
	$(page.main).append('<div class="cf-tip"></div>');
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
		if (t === "IGI" && !fQual.get_value())
			return frappe.show_alert({ message: __("IGI batches carry ONE colour+clarity — pick it first."), indicator: "orange" }, 4);
		draft = { cert_type: t, center: fCenter.get_value() || null, quality: fQual.get_value() || "", rows: [] };
		prep = null;
		paint();
	});

	function load(name) {
		frappe.call({ method: API + ".get_cert_prep", args: { name } }).then((r) => { prep = r.message; paint(); });
	}
	function logScan(code, ok, note) {
		hist.unshift({ code, ok, note: note || "", t: frappe.datetime.now_time().slice(0, 5) });
		if (hist.length > 40) hist.pop();
		root.find(".cf-hist-t").text(__("{0} scan(s)", [hist.length]));
		root.find(".cf-hist-b").html(`<table><tbody>${hist.map((h) => `
			<tr class="cf-hrow"><td>${esc(h.code)}</td>
			<td><span class="cf-hb ${h.ok ? "ok" : "no"}">${h.ok ? __("ADDED") : __("REJECTED")}</span>
			${h.ok ? "" : `<span class="cf-why">${esc(h.note)}</span>`}</td>
			<td class="text-muted">${h.t}</td></tr>`).join("")}</tbody></table>`);
		root.find(".cf-panel").show();
	}

	const IGI_COLS = ["style_no", "metal_color", "color", "clarity", "shape", "gross", "dmd_ct"];
	const IGI_HEAD = [__("Style Number"), __("Metal Color"), __("Color Criteria"), __("Clarity Criteria"), __("Shape"), __("Gross Wt (g)"), __("Diamond Wt (ct)")];
	const BASIC_COLS = ["order_bag", "design", "design_type", "gross", "dmd_ct"];
	const BASIC_HEAD = [__("Card"), __("Design"), __("Type"), __("Gross (g)"), __("Diamond (ct)")];

	function paint() {
		const src = prep || {
			name: __("DRAFT — not prepped yet"), cert_type: draft.cert_type, center: draft.center || "",
			quality: draft.quality, status: "Draft", rows: draft.rows, count: draft.rows.length,
			gross: Math.round(draft.rows.reduce((a, r) => a + (r.gross || 0), 0) * 1000) / 1000,
			dmd_ct: Math.round(draft.rows.reduce((a, r) => a + (r.dmd_ct || 0), 0) * 1000) / 1000,
		};
		const igi = src.cert_type === "IGI";
		const locked = prep ? prep.status !== "Prepared" : false;
		root.find(".cf-setup, .cf-req").toggle(false);
		root.find(".cf-head").css("display", "flex").html(`
			<span class="nm">${esc(src.name)}</span>
			<span>${esc(src.cert_type)}${src.center ? " · " + esc(src.center.split("-").slice(1).join("-")) : ""}</span>
			${src.quality ? `<span class="cf-lock">${esc(src.quality)}</span>` : ""}
			<span class="cf-lock" style="background:${src.status === "Draft" ? "#b35a00" : src.status === "Prepared" ? "#7f8c8d" : src.status === "Cancelled" ? "#b02a2a" : "#2e7d32"};">${esc(src.status)}</span>`);
		const cols = igi ? IGI_COLS : BASIC_COLS;
		const head = igi ? IGI_HEAD : BASIC_HEAD;
		root.find(".cf-th").html(`<tr>${igi ? `<th>${__("Card")}</th>` : ""}${head.map((h) => `<th>${h}</th>`).join("")}${locked ? "" : "<th></th>"}</tr>`);
		root.find(".cf-tb").html(src.rows.map((r, i) => `<tr data-row="${esc(r.row || i)}" data-i="${i}">
			${igi ? `<td class="cf-bag" data-bag="${esc(r.order_bag)}"><b>${esc(r.order_bag)}</b></td>` : ""}
			${cols.map((c) => `<td class="${typeof r[c] === "number" ? "r" : ""}${c === "order_bag" ? " cf-bag" : ""}"${c === "order_bag" ? ` data-bag="${esc(r.order_bag)}"` : ""}>${typeof r[c] === "number" ? r[c].toFixed(3) : esc("" + (r[c] || ""))}</td>`).join("")}
			${locked ? "" : '<td class="del">&times;</td>'}</tr>`).join("")
			|| `<tr><td colspan="9" style="color:var(--text-muted);padding:14px;">${__("Scan the first product.")}</td></tr>`);
		root.find("table.cf-t").show();
		root.find(".cf-tot").show().text(__("{0} piece(s) · {1} g gross · {2} ct diamond", [src.count, src.gross, src.dmd_ct]));
		root.find(".cf-scanrow").css("display", locked ? "none" : "flex");
		root.find(".cf-actions").css("display", "flex");
		root.find(".cf-prep").toggle(!!draft && !prep && src.count > 0);
		root.find(".cf-xlsx").toggle(igi && src.count > 0);
		root.find(".cf-cancel").toggle(!locked);
		root.find(".cf-cancel").text(prep ? __("Cancel Batch") : __("Discard Draft"));
		if (!locked) setTimeout(() => scan.$input.focus(), 100);
	}

	function rejMsg(err) {
		let raw = "";
		try {
			const sm = (err && err._server_messages) || (err && err.responseJSON && err.responseJSON._server_messages);
			if (sm) raw = (JSON.parse(JSON.parse(sm)[0]).message || "");
		} catch (e) { /* fall through */ }
		raw = (raw || (err && err.message) || "").replace(/<[^>]*>/g, "");
		// hardcoded reasons — the hover text users actually read
		if (/does not exist/i.test(raw)) return __("This card doesn't exist");
		if (/already on (this|prepared)/i.test(raw)) {
			const m = raw.match(/prepared batch (\S+?)\.?$/);
			return m ? __("Already in a draft/batch ({0})", [m[1]]) : __("Already in this draft");
		}
		if (/is Sold/i.test(raw)) return __("This piece was sold");
		if (/is At Certification/i.test(raw)) return __("Already out at certification");
		if (/only pieces In Stock/i.test(raw)) {
			const m = raw.match(/ is (.+?) — /);
			return __("Not a piece in stock{0}", [m ? " (currently " + m[1] + ")" : ""]);
		}
		if (/not a product yet/i.test(raw)) return __("Not a product yet — make it a product first");
		return raw || __("Rejected");
	}
	scan.$input.on("keydown", (e) => {
		if (e.key !== "Enter") return;
		const v = (scan.$input.val() || "").trim();
		if (!v) return;
		scan.set_value("");
		if (draft && !prep) {
			// LOCAL list — validated server-side, saved only on PREP
			frappe.call({ method: API + ".cert_draft_scan", args: { cert_type: draft.cert_type,
				quality: draft.quality, barcode: v, existing: JSON.stringify(draft.rows.map((r) => r.order_bag)) }, freeze: false })
				.then((r) => { draft.rows.push(r.message); logScan(v, true, ""); paint(); })
				.catch((err) => { logScan(v, false, rejMsg(err)); scan.$input.focus(); });
			return;
		}
		frappe.call({ method: API + ".cert_prep_scan", args: { name: prep.name, barcode: v }, freeze: false })
			.then((r) => { prep = r.message; logScan(v, true, ""); paint(); })
			.catch((err) => { logScan(v, false, rejMsg(err)); scan.$input.focus(); });
	});
	root.on("click", "table.cf-t .del", function () {
		if (draft && !prep) {
			draft.rows.splice(cint($(this).closest("tr").data("i")), 1);
			paint();
			return;
		}
		frappe.call({ method: API + ".cert_prep_remove", args: { name: prep.name, row: $(this).closest("tr").data("row") } })
			.then((r) => { prep = r.message; paint(); });
	});
	root.find(".cf-cancel").on("click", () => {
		if (draft && !prep) {
			frappe.confirm(__("Discard this draft? Nothing was saved."), () => {
				draft = null;
				root.find(".cf-head, .cf-scanrow, table.cf-t, .cf-tot, .cf-actions").hide();
				root.find(".cf-setup, .cf-req").show();
			});
			return;
		}
		frappe.confirm(__("Cancel {0}? The record stays, marked Cancelled.", [prep.name]),
			() => frappe.call({ method: API + ".cert_prep_cancel", args: { name: prep.name } }).then(() => load(prep.name)));
	});
	root.find(".cf-prep").on("click", () => {
		frappe.confirm(__("Prep {0} piece(s) for {1}? The batch is created and NAMED now.", [draft.rows.length, draft.cert_type]), () => {
			frappe.dom.freeze(__("Prepping..."));
			frappe.call({ method: API + ".cert_prep_create_full", args: { cert_type: draft.cert_type,
				center: draft.center, quality: draft.quality, bags: JSON.stringify(draft.rows.map((r) => r.order_bag)) } })
				.then((r) => {
					frappe.dom.unfreeze();
					const m = r.message || {};
					frappe.show_alert({ message: __("{0} prepped — {1} piece(s).", [m.name, m.count]), indicator: "green" }, 5);
					draft = null;
					load(m.name);
				}).catch(() => frappe.dom.unfreeze());
		});
	});
	root.find(".cf-xlsx").on("click", () =>
		open_url_post("/api/method/jewelima.jewelima.api.export_igi_xlsx", { bags: JSON.stringify(((prep || draft).rows).map((r) => r.order_bag)) }));

	// hover a card no. -> its ACTUAL frozen BOM, so the row's values are explainable
	const bomCache = {};
	root.on("mouseenter", "td.cf-bag", function (e) {
		const bag = $(this).data("bag");
		const $tip = root.find(".cf-tip");
		const show = (lines) => {
			if (!lines.length) return;
			$tip.html(`<div class="t">${__("Actual BOM — {0}", [esc(bag)])}</div>` +
				lines.map((l) => esc(l)).join("<br>")).css({ left: e.clientX + 14, top: e.clientY + 12 }).show();
		};
		if (bomCache[bag]) return show(bomCache[bag]);
		frappe.call({ method: API + ".get_bag_bom_summary", args: { order_bag: bag }, freeze: false })
			.then((r) => { bomCache[bag] = (r.message || {}).lines || []; show(bomCache[bag]); });
	});
	root.on("mousemove", "td.cf-bag", function (e) {
		root.find(".cf-tip:visible").css({ left: e.clientX + 14, top: e.clientY + 12 });
	});
	root.on("mouseleave", "td.cf-bag", () => root.find(".cf-tip").hide());

	// arriving with a prep already picked (from Send Certifications)
	if (frappe.route_options && frappe.route_options.prep) { load(frappe.route_options.prep); frappe.route_options = null; }
};
