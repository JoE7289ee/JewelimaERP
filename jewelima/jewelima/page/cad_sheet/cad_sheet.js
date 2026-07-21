// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// CAD Sheet (CAD) — build the design sheet the workshop makes in excel: upload a
// design image, fill the header (style / gold / length / approver; diamond wt
// auto-sums from the table), fill the stone table (sieve rows from the chart +
// a COL column), then Export Image or Export Excel — both composited server-side.
// The uploaded image is read in the BROWSER as base64 and never stored on the
// server; nothing to delete. Route: /app/cad-sheet

frappe.pages["cad-sheet"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "CAD Sheet", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	let ROWS = [];              // sieve chart
	let imgB64 = "";
	let diaManual = false;      // once the user edits Diamond Wt, stop auto-filling

	$(page.main).append(`
		<style>
		#page-cad-sheet .container{max-width:100%;}
		.cs-grid{display:grid;grid-template-columns:380px 1fr;gap:20px;align-items:start;}
		@media (max-width:900px){.cs-grid{grid-template-columns:1fr;}}
		.cs-card{border:1px solid var(--border-color);border-radius:10px;background:var(--fg-color);padding:14px 16px;}
		.cs-drop{border:2px dashed var(--border-color);border-radius:10px;min-height:230px;display:flex;
			align-items:center;justify-content:center;text-align:center;color:var(--text-muted);cursor:pointer;overflow:hidden;}
		.cs-drop img{max-width:100%;max-height:340px;display:block;}
		.cs-hd .frappe-control{margin:0 0 8px;}
		.cs-hd .control-label{font-size:11px;color:var(--text-muted);}
		table.cs-tbl{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums;}
		.cs-tbl th{border:1px solid var(--border-color);background:var(--control-bg);padding:6px 8px;font-size:10.5px;
			text-transform:uppercase;letter-spacing:.04em;font-weight:800;text-align:center;}
		.cs-tbl td{border:1px solid var(--border-color);padding:0;}
		.cs-tbl td.lbl{padding:5px 8px;font-weight:700;background:var(--control-bg);}
		.cs-tbl td.mm,.cs-tbl td.wt{padding:5px 8px;text-align:right;color:var(--text-muted);}
		.cs-tbl td.tot{padding:5px 8px;text-align:right;font-weight:600;}
		.cs-tbl input{width:100%;border:none;background:transparent;padding:5px 8px;font:inherit;outline:none;}
		.cs-tbl input.q{text-align:right;}
		.cs-tbl td:focus-within{outline:2px solid var(--primary);outline-offset:-2px;}
		.cs-tbl tr.hasq td.tot{color:#2e7d32;font-weight:700;}
		tr.cs-hidden{display:none;}
		.cs-foot{position:sticky;bottom:0;display:flex;gap:12px;align-items:center;margin-top:12px;
			border:2px solid var(--border-color);border-radius:10px;background:var(--fg-color);padding:10px 14px;flex-wrap:wrap;}
		.cs-b{border:1px solid var(--border-color);border-radius:8px;padding:5px 18px;text-align:center;background:var(--control-bg);}
		.cs-b .k{font-size:10px;font-weight:700;color:var(--text-muted);letter-spacing:.05em;}
		.cs-b .v{font-size:16px;font-weight:800;}
		.cs-exp{margin-left:auto;display:flex;gap:8px;}
		.cs-go{background:#2e7d32;border:none;color:#fff;font-weight:800;padding:9px 22px;border-radius:8px;cursor:pointer;}
		.cs-go.x{background:#1461d2;}
		</style>
		<div class="cs-grid">
			<div class="cs-card">
				<div class="cs-drop">${__("Click to upload the design image")}<input type="file" accept="image/*" class="cs-file" style="display:none;"></div>
				<div style="margin-top:8px;"><button class="btn btn-xs btn-default cs-clearimg" style="display:none;">${__("Remove image")}</button></div>
			</div>
			<div>
				<div class="cs-card cs-hd" style="margin-bottom:14px;">
					<div class="cs-style"></div><div class="cs-gold"></div><div class="cs-length"></div>
					<div class="cs-dia"></div><div class="cs-approver"></div>
				</div>
				<div class="cs-card">
					<div style="display:flex;align-items:center;margin-bottom:8px;">
						<b style="font-size:13px;">${__("Stones")}</b>
						<button class="btn btn-xs btn-default cs-hide" style="margin-left:auto;">${__("Hide empty")}</button>
					</div>
					<table class="cs-tbl">
						<thead><tr><th>${__("COL")}</th><th>${__("S.Size")}</th><th>${__("MM")}</th><th>${__("WT/CT")}</th><th>${__("Qty")}</th><th>${__("Total WT")}</th></tr></thead>
						<tbody></tbody>
					</table>
				</div>
			</div>
		</div>
		<div class="cs-foot">
			<div class="cs-b"><div class="k">${__("PIECES")}</div><div class="v cs-n">0</div></div>
			<div class="cs-b"><div class="k">${__("TOTAL CT")}</div><div class="v cs-ct">0.0000</div></div>
			<div class="cs-exp">
				<button class="cs-go cs-img">${__("Export Image")}</button>
				<button class="cs-go x cs-xlsx">${__("Export Excel")}</button>
			</div>
		</div>
	`);
	const root = $(page.main);
	let hideEmpty = false;

	const mk = (sel, df) => { const c = frappe.ui.form.make_control({ df, parent: root.find(sel).get(0), render_input: true }); c.refresh(); return c; };
	const fStyle = mk(".cs-style", { fieldtype: "Data", label: __("Style No"), fieldname: "s" });
	const fGold = mk(".cs-gold", { fieldtype: "Data", label: __("Approx Gold Wt (g)"), fieldname: "g" });
	const fLength = mk(".cs-length", { fieldtype: "Data", label: __("Length"), fieldname: "l" });
	const fDia = mk(".cs-dia", { fieldtype: "Data", label: __("Diamond Wt (ct) — auto, editable"), fieldname: "d" });
	const fApprover = mk(".cs-approver", { fieldtype: "Data", label: __("Approved By"), fieldname: "a" });
	fDia.$input.on("input", () => { diaManual = true; });

	// image: read locally as base64, never uploaded
	root.find(".cs-drop").on("click", (e) => { if (e.target.tagName !== "BUTTON") root.find(".cs-file").click(); });
	root.find(".cs-file").on("change", function () {
		const file = this.files[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			imgB64 = reader.result;
			root.find(".cs-drop").html(`<img src="${imgB64}">`).append('<input type="file" accept="image/*" class="cs-file" style="display:none;">');
			bindFile();
			root.find(".cs-clearimg").show();
		};
		reader.readAsDataURL(file);
	});
	function bindFile() {
		root.find(".cs-file").off("change").on("change", function () {
			const f = this.files[0]; if (!f) return;
			const rd = new FileReader(); rd.onload = () => { imgB64 = rd.result; root.find(".cs-drop img").attr("src", imgB64); }; rd.readAsDataURL(f);
		});
	}
	root.find(".cs-clearimg").on("click", (e) => {
		e.stopPropagation(); imgB64 = "";
		root.find(".cs-drop").html(__("Click to upload the design image") + '<input type="file" accept="image/*" class="cs-file" style="display:none;">');
		root.find(".cs-clearimg").hide();
		root.find(".cs-drop").off("click").on("click", (ev) => { if (ev.target.tagName !== "BUTTON") root.find(".cs-file").click(); });
		root.find(".cs-file").on("change", root.find(".cs-file").get(0) && arguments.callee);
		location.reload();  // simplest reset of the file input
	});

	function paint() {
		root.find("tbody").html(ROWS.map((r, i) => `<tr data-i="${i}">
			<td><input data-f="col" data-i="${i}" placeholder=""></td>
			<td class="lbl">${esc(r.sieve_size)}</td>
			<td class="mm">${r.mm_size ?? ""}</td>
			<td class="wt">${r.avg_cts ?? ""}</td>
			<td><input class="q" type="number" min="0" step="1" data-f="qty" data-i="${i}"></td>
			<td class="tot"></td>
		</tr>`).join(""));
	}

	function recalc() {
		let n = 0, ct = 0;
		root.find("tbody tr").each(function () {
			const i = Number(this.dataset.i);
			const q = Number($(this).find("input.q").val()) || 0;
			const t = q * (ROWS[i].avg_cts || 0);
			$(this).toggleClass("hasq", q > 0).find(".tot").text(q > 0 ? t.toFixed(4) : "");
			n += q; ct += t;
		});
		root.find(".cs-n").text(n);
		root.find(".cs-ct").text(ct.toFixed(4));
		if (!diaManual) fDia.set_value(ct ? ct.toFixed(3) : "");
		applyHide();
	}
	function applyHide() {
		root.find(".cs-hide").text(hideEmpty ? __("Show all") : __("Hide empty")).toggleClass("btn-primary", hideEmpty);
		root.find("tbody tr").each(function () {
			const q = Number($(this).find("input.q").val()) || 0;
			$(this).toggleClass("cs-hidden", hideEmpty && q <= 0);
		});
	}
	root.on("input", "tbody input", recalc);
	root.on("keydown", "tbody input.q", function (e) {
		if (!["Enter", "ArrowDown", "ArrowUp"].includes(e.key)) return;
		e.preventDefault();
		const i = Number(this.dataset.i) + (e.key === "ArrowUp" ? -1 : 1);
		const nx = root.find(`tbody input.q[data-i="${i}"]`); if (nx.length) nx.focus().select();
	});
	root.find(".cs-hide").on("click", () => { hideEmpty = !hideEmpty; applyHide(); });

	function collect() {
		const rows = [];
		root.find("tbody tr").each(function () {
			const i = Number(this.dataset.i);
			const q = Number($(this).find("input.q").val()) || 0;
			if (q <= 0) return;
			rows.push({ col: $(this).find('input[data-f="col"]').val() || "", sieve: ROWS[i].sieve_size,
				mm: ROWS[i].mm_size, wt: ROWS[i].avg_cts, qty: q, total: Number((q * (ROWS[i].avg_cts || 0)).toFixed(4)) });
		});
		return { style_no: fStyle.get_value() || "", gold_wt: fGold.get_value() || "", length: fLength.get_value() || "",
			dia_wt: fDia.get_value() || "", approver: fApprover.get_value() || "", rows, image_b64: imgB64 };
	}

	function exportSheet(fmt) {
		const p = collect();
		if (!p.rows.length && !imgB64) return frappe.show_alert({ message: __("Add an image or some stones first."), indicator: "orange" }, 3);
		open_url_post(`/api/method/jewelima.jewelima.api.export_cad_sheet_${fmt}`, { payload: JSON.stringify(p) });
	}
	root.find(".cs-img").on("click", () => exportSheet("image"));
	root.find(".cs-xlsx").on("click", () => exportSheet("xlsx"));

	frappe.call({ method: API + ".get_sieve_chart" }).then((r) => { ROWS = r.message || []; paint(); });
};
