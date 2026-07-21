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
	let subImgs = [];   // additional images, base64 (never uploaded)
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
		.cs-mwrap{margin-top:12px;}
		.cs-mwrap .lbl{font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-bottom:5px;display:block;}
		.cs-mline{width:100%;border:1px solid var(--border-color);border-radius:6px;padding:6px 9px;font:inherit;
			background:var(--control-bg);margin-bottom:6px;outline:none;}
		.cs-mline:focus{outline:2px solid var(--primary);outline-offset:-2px;}
		.cs-subthumbs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:6px;}
		.cs-subt{position:relative;width:84px;height:84px;border:1px solid var(--border-color);border-radius:6px;overflow:hidden;}
		.cs-subt img{width:100%;height:100%;object-fit:cover;}
		.cs-subt .x{position:absolute;top:2px;right:2px;background:#b02a2a;color:#fff;border-radius:50%;width:18px;height:18px;
			font-size:12px;font-weight:800;text-align:center;line-height:18px;cursor:pointer;}
		.cs-sw{width:38px;height:26px;border:1px solid var(--border-color);border-radius:5px;cursor:pointer;padding:0;
			background:repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%) 0/10px 10px;}
		.cs-sw.set{background-image:none;}
		.cs-swx{cursor:pointer;color:#b02a2a;font-weight:800;margin-left:5px;display:none;}
		.cs-sw.set + .cs-swx{display:inline;}
		.cs-foot{position:sticky;bottom:0;display:flex;gap:12px;align-items:center;margin-top:12px;
			border:2px solid var(--border-color);border-radius:10px;background:var(--fg-color);padding:10px 14px;flex-wrap:wrap;}
		.cs-b{border:1px solid var(--border-color);border-radius:8px;padding:5px 18px;text-align:center;background:var(--control-bg);}
		.cs-b .k{font-size:10px;font-weight:700;color:var(--text-muted);letter-spacing:.05em;}
		.cs-b .v{font-size:16px;font-weight:800;}
		.cs-exp{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap;align-items:end;}
		.cs-go{background:#2e7d32;border:none;color:#fff;font-weight:800;padding:9px 22px;border-radius:8px;cursor:pointer;}
		.cs-go.x{background:#1461d2;}
		</style>
		<div class="cs-grid">
			<div class="cs-card">
				<div class="cs-drop"><span class="cs-ph">${__("Click to upload the design image")}</span></div>
				<input type="file" accept="image/*" class="cs-file" style="display:none;">
				<div style="margin-top:8px;"><button class="btn btn-xs btn-default cs-clearimg" style="display:none;">${__("Remove image")}</button></div>
				<div class="cs-mwrap">
					<span class="lbl">${__("Manual lines")}</span>
					<div class="cs-mlist"><input class="cs-mline" placeholder="${__("e.g. PEARL Stone 17mm D blue")}"></div>
				</div>
				<div class="cs-mwrap">
					<span class="lbl">${__("More images")}</span>
					<div class="cs-subthumbs"></div>
					<button class="btn btn-xs btn-default cs-subadd">${__("+ Add images")}</button>
					<input type="file" accept="image/*" multiple class="cs-subfile" style="display:none;">
				</div>
			</div>
			<div>
				<div class="cs-card cs-hd" style="margin-bottom:14px;">
					<div class="cs-style"></div><div class="cs-dtype"></div><div class="cs-purity"></div><div class="cs-gold"></div><div class="cs-length"></div>
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
				<button class="cs-go cs-pdf" style="background:#b02a2a;">${__("Export PDF")}</button>
				<div class="cs-obwrap" style="display:flex;gap:8px;align-items:end;margin-left:12px;">
					<div class="cs-ob" style="min-width:200px;"></div>
					<button class="cs-go cs-upload" style="background:#8a6d00;">${__("Upload to Order Bag")}</button>
				</div>
			</div>
		</div>
	`);
	const root = $(page.main);
	let hideEmpty = false;

	const mk = (sel, df) => { const c = frappe.ui.form.make_control({ df, parent: root.find(sel).get(0), render_input: true }); c.refresh(); return c; };
	const fStyle = mk(".cs-style", { fieldtype: "Data", label: __("Design Number"), fieldname: "s" });
	const fGold = mk(".cs-gold", { fieldtype: "Data", label: __("Approx Gold Wt (g)"), fieldname: "g" });
	const fDType = mk(".cs-dtype", { fieldtype: "Link", label: __("Design Type"), fieldname: "dt", options: "Design Type" });
	const fPurity = mk(".cs-purity", { fieldtype: "Data", label: __("Purity"), fieldname: "p" });
	const fLength = mk(".cs-length", { fieldtype: "Data", label: __("Length"), fieldname: "l" });
	const fDia = mk(".cs-dia", { fieldtype: "Data", label: __("Diamond Wt (ct) — auto, editable"), fieldname: "d" });
	const fApprover = mk(".cs-approver", { fieldtype: "Data", label: __("Created By"), fieldname: "a", read_only: 1 });
	fApprover.set_value(frappe.session.user_fullname || frappe.session.user);
	fDia.$input.on("input", () => { diaManual = true; });

	// image: read locally as base64, never uploaded — one persistent input
	const fileInput = root.find(".cs-file").get(0);
	root.find(".cs-drop").on("click", () => fileInput.click());
	root.find(".cs-file").on("change", function () {
		const file = this.files[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			imgB64 = reader.result;
			root.find(".cs-drop").html(`<img src="${imgB64}">`);
			root.find(".cs-clearimg").show();
		};
		reader.readAsDataURL(file);
	});
	root.find(".cs-clearimg").on("click", (e) => {
		e.stopPropagation();
		imgB64 = "";
		fileInput.value = "";
		root.find(".cs-drop").html(`<span class="cs-ph">${__("Click to upload the design image")}</span>`);
		root.find(".cs-clearimg").hide();
	});

	// additional images — multi-select, base64, never uploaded
	const subInput = root.find(".cs-subfile").get(0);
	root.find(".cs-subadd").on("click", () => subInput.click());
	root.find(".cs-subfile").on("change", function () {
		[...this.files].forEach((f) => {
			const rd = new FileReader();
			rd.onload = () => { subImgs.push(rd.result); paintSubs(); };
			rd.readAsDataURL(f);
		});
		this.value = "";
	});
	function paintSubs() {
		root.find(".cs-subthumbs").html(subImgs.map((b, i) =>
			`<div class="cs-subt"><img src="${b}"><span class="x" data-i="${i}">×</span></div>`).join(""));
	}
	root.on("click", ".cs-subt .x", function () {
		subImgs.splice(Number($(this).attr("data-i")), 1); paintSubs();
	});

	function paint() {
		root.find("tbody").html(ROWS.map((r, i) => `<tr data-i="${i}">
			<td style="text-align:center;white-space:nowrap;">
				<button class="cs-sw" data-i="${i}" title="${__("Pick colour")}"></button><span class="cs-swx" data-i="${i}">×</span>
				<input type="color" class="cs-colinp" data-i="${i}" style="display:none;">
			</td>
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

	// manual lines — always keep exactly one trailing empty input
	root.on("input", ".cs-mline", function () {
		const $all = root.find(".cs-mline");
		const isLast = this === $all.get($all.length - 1);
		if (isLast && this.value.trim()) {
			$(this).closest(".cs-mlist").append(`<input class="cs-mline" placeholder="${__("e.g. PEARL Stone 17mm D blue")}">`);
		} else if (!isLast && !this.value.trim() && $all.length > 1) {
			$(this).remove();
		}
	});

	// COL = visual colour swatch: click opens the OS picker; × clears it
	root.on("click", ".cs-sw", function () { root.find(`.cs-colinp[data-i="${this.dataset.i}"]`).get(0).click(); });
	root.on("input", ".cs-colinp", function () {
		const hex = this.value;
		root.find(`.cs-sw[data-i="${this.dataset.i}"]`).addClass("set").css("background", hex).attr("data-hex", hex);
	});
	root.on("click", ".cs-swx", function () {
		root.find(`.cs-sw[data-i="${this.dataset.i}"]`).removeClass("set").css("background", "").removeAttr("data-hex");
	});

	function collect() {
		const rows = [];
		root.find("tbody tr").each(function () {
			const i = Number(this.dataset.i);
			const q = Number($(this).find("input.q").val()) || 0;
			if (q <= 0) return;
			rows.push({ col: $(this).find(".cs-sw").attr("data-hex") || "", sieve: ROWS[i].sieve_size,
				mm: ROWS[i].mm_size, wt: ROWS[i].avg_cts, qty: q, total: Number((q * (ROWS[i].avg_cts || 0)).toFixed(4)) });
		});
		const manual = root.find(".cs-mline").map((_, el) => el.value.trim()).get().filter(Boolean);
		return { style_no: fStyle.get_value() || "", design_type: fDType.get_value() || "", purity: fPurity.get_value() || "",
			gold_wt: fGold.get_value() || "", length: fLength.get_value() || "", dia_wt: fDia.get_value() || "",
			approver: fApprover.get_value() || "", rows, manual_lines: manual, image_b64: imgB64, sub_images: subImgs };
	}

	function exportSheet(fmt) {
		const p = collect();
		if (!p.rows.length && !imgB64 && !p.manual_lines.length && !subImgs.length) return frappe.show_alert({ message: __("Add an image, stones, or a line first."), indicator: "orange" }, 3);
		open_url_post(`/api/method/jewelima.jewelima.api.export_cad_sheet_${fmt}`, { payload: JSON.stringify(p) });
	}
	const fOrderBag = mk(".cs-ob", { fieldtype: "Link", label: __("Order Bag"), fieldname: "ob", options: "Order Bag" });
	root.find(".cs-upload").on("click", () => {
		const bag = fOrderBag.get_value();
		if (!bag) return frappe.show_alert({ message: __("Pick the Order Bag first."), indicator: "orange" }, 3);
		const p = collect();
		if (!p.rows.length && !imgB64 && !p.manual_lines.length && !subImgs.length)
			return frappe.show_alert({ message: __("Nothing to upload yet."), indicator: "orange" }, 3);
		frappe.dom.freeze(__("Uploading..."));
		frappe.call({ method: "jewelima.jewelima.api.attach_cad_sheet_to_card", args: { order_bag: bag, payload: JSON.stringify(p) } })
			.then((r) => {
				frappe.dom.unfreeze();
				const m = r.message || {};
				frappe.msgprint({ title: __("Uploaded"), indicator: "green",
					message: __("CAD sheet added to <a href='/app/order-bag-photos'>{0}</a> — it now has {1} photo(s).", [esc(m.order_bag), m.count]) });
			}).catch(() => frappe.dom.unfreeze());
	});

	root.find(".cs-img").on("click", () => exportSheet("image"));
	root.find(".cs-xlsx").on("click", () => exportSheet("xlsx"));
	root.find(".cs-pdf").on("click", () => exportSheet("pdf"));

	frappe.call({ method: API + ".get_sieve_chart" }).then((r) => {
		ROWS = r.message || [];
		paint();
		// arriving from the Weight Checker with stones pre-picked
		if (frappe.route_options && frappe.route_options.order_bag) {
			fOrderBag.set_value(frappe.route_options.order_bag);
		}
		if (frappe.route_options && frappe.route_options.cad_stones) {
			const stones = frappe.route_options.cad_stones;
			stones.forEach((st) => {
				const i = ROWS.findIndex((rr) => rr.sieve_size === st.sieve);
				if (i >= 0) root.find(`tbody input.q[data-i="${i}"]`).val(st.qty);
			});
			recalc();
			hideEmpty = true;   // arriving prefilled — show just the filled sieves
			applyHide();
		}
		frappe.route_options = null;
	});
};
