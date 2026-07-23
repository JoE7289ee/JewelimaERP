// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Card Builder (Design Bank) — the Photoshop replacement. RIGHT: the fields
// (design no with the never-reuse code guard + series helper, design type,
// GW/DW, stones/sieves, extra lines, photo upload). LEFT: the card itself,
// re-rendered live as fields change. Save renders the real PNG into the
// Design Bank record (raw photo kept for future re-renders, photoupdate
// cleared). Edit mode pulls any existing card. Route: /app/card-builder

frappe.pages["card-builder"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Card Builder", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	let cur = { name: null, design_no: "", design_type: "", gross_weight: "", diamond_weight: "",
		note: "", extra_lines: "", photo: "", stones: [] };
	let timer = null;

	$(page.main).append(`
		<style>
		.cb-cols{display:flex;gap:24px;align-items:flex-start;}
		.cb-left{flex:0 0 460px;position:sticky;top:70px;}
		.cb-prev{width:100%;border:1px solid var(--border-color);border-radius:10px;background:#fff;min-height:400px;}
		.cb-right{flex:1;min-width:0;max-width:760px;}
		.cb-row{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:6px;}
		.cb-row .frappe-control{margin:0;min-width:200px;flex:1;}
		.cb-code{display:flex;gap:8px;align-items:end;}
		.cb-code .frappe-control{flex:1;}
		.cb-codechk{font-size:12px;font-weight:700;align-self:center;margin-top:14px;}
		.cb-codechk.ok{color:#2e7d32;}
		.cb-codechk.bad{color:#b02a2a;}
		.cb-sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin:16px 0 6px;border-top:1px solid var(--border-color);padding-top:10px;display:flex;justify-content:space-between;}
		.cb-sec .add{cursor:pointer;font-weight:400;text-transform:none;color:var(--text-color);}
		table.cb-t{width:100%;border-collapse:collapse;font-size:13px;}
		table.cb-t th{font-size:10px;text-transform:uppercase;color:var(--text-muted);text-align:left;padding:3px 6px;}
		table.cb-t td{padding:3px 6px;}
		table.cb-t input{width:100%;border:1px solid var(--border-color);border-radius:5px;padding:4px 8px;background:var(--control-bg);}
		table.cb-t .del{cursor:pointer;color:#b02a2a;font-weight:700;width:24px;text-align:center;}
		.cb-photo{border:2px dashed var(--border-color);border-radius:8px;padding:14px;text-align:center;color:var(--text-muted);cursor:pointer;font-size:12.5px;}
		.cb-extra textarea{width:100%;border:1px solid var(--border-color);border-radius:6px;padding:6px 10px;background:var(--control-bg);min-height:60px;font-size:12.5px;}
		.cb-actions{margin-top:16px;display:flex;gap:10px;}
		</style>
		<div class="cb-cols">
			<div class="cb-left"><img class="cb-prev" alt=""></div>
			<div class="cb-right">
				<div class="cb-row"><div class="cb-pick"></div><div class="cb-series"></div>
					<button class="btn btn-default cb-new" style="align-self:end;">${__("New Card")}</button></div>
				<div class="cb-code"><div class="cb-no"></div><span class="cb-codechk"></span></div>
				<div class="cb-row"><div class="cb-dtype"></div><div class="cb-gw"></div><div class="cb-dw"></div></div>
				<div class="cb-sec">${__("Stones / Sieves")}<span class="add cb-addstone">+ ${__("row")}</span></div>
				<table class="cb-t"><thead><tr><th>${__("Stone / Colour")}</th><th>${__("Sieve")}</th><th>${__("Pcs")}</th><th>${__("Ct")}</th><th></th></tr></thead>
					<tbody class="cb-stones"></tbody></table>
				<div class="cb-sec">${__("Note & Extra Lines")}</div>
				<div class="cb-row"><div class="cb-note" style="flex:1;"></div></div>
				<div class="cb-extra"><textarea placeholder="${__("anything else on the card, one line each")}"></textarea></div>
				<div class="cb-sec">${__("Photo")}</div>
				<div class="cb-photo">${__("click to upload the product photo")}</div>
				<input type="file" class="cb-file" accept="image/*" style="display:none;">
				<div class="cb-actions">
					<button class="btn btn-primary cb-save" style="background:#2e7d32;border-color:#2e7d32;">${__("Save — render into Design Bank")}</button>
				</div>
			</div>
		</div>
	`);
	const root = $(page.main);
	const mk = (sel, df) => { const c = frappe.ui.form.make_control({ df, parent: root.find(sel).get(0), render_input: true }); c.refresh(); return c; };
	const fPick = mk(".cb-pick", { fieldtype: "Link", label: __("Edit existing (design no)"), fieldname: "pick", options: "Design Bank" });
	const fSeries = mk(".cb-series", { fieldtype: "Data", label: __("New series prefix (JS / JN...)"), fieldname: "ser" });
	const fNo = mk(".cb-no", { fieldtype: "Data", label: __("Design Number"), fieldname: "no" });
	const fType = mk(".cb-dtype", { fieldtype: "Link", label: __("Design Type"), fieldname: "dt", options: "Design Type" });
	const fGW = mk(".cb-gw", { fieldtype: "Float", label: __("Gross Weight (g)"), fieldname: "gw" });
	const fDW = mk(".cb-dw", { fieldtype: "Float", label: __("Diamond Weight (ct)"), fieldname: "dw" });
	const fNote = mk(".cb-note", { fieldtype: "Data", label: __("Note (card middle line)"), fieldname: "nt" });

	function collect() {
		cur.design_no = fNo.get_value() || "";
		cur.design_type = fType.get_value() || "";
		cur.gross_weight = fGW.get_value() || 0;
		cur.diamond_weight = fDW.get_value() || 0;
		cur.note = fNote.get_value() || "";
		cur.extra_lines = root.find(".cb-extra textarea").val() || "";
		cur.stones = root.find(".cb-stones tr").map(function () {
			return { stone: $(this).find(".s").val(), sieve: $(this).find(".v").val(),
				pcs: cint($(this).find(".p").val()), ct: flt($(this).find(".c").val()) };
		}).get().filter((r) => r.stone || r.sieve);
		return cur;
	}

	// the live card: every change re-renders (debounced — one call per pause)
	function preview() {
		clearTimeout(timer);
		timer = setTimeout(() => {
			frappe.call({ method: API + ".design_card_preview", args: { payload: JSON.stringify(collect()) }, freeze: false })
				.then((r) => root.find(".cb-prev").attr("src", (r.message || {}).image || ""));
		}, 450);
	}
	root.on("input change", "input, textarea", preview);

	function paintStones() {
		root.find(".cb-stones").html((cur.stones.length ? cur.stones : [{}]).map((r) => `
			<tr><td><input class="s" value="${esc(r.stone || "")}" placeholder="DMD / RUBY..."></td>
			<td><input class="v" value="${esc(r.sieve || "")}" placeholder="+6-6.5"></td>
			<td><input class="p" type="number" value="${r.pcs || ""}"></td>
			<td><input class="c" type="number" step="0.001" value="${r.ct || ""}"></td>
			<td class="del">&times;</td></tr>`).join(""));
	}
	root.find(".cb-addstone").on("click", () => { collect(); cur.stones.push({}); paintStones(); });
	root.on("click", ".cb-t .del", function () { $(this).closest("tr").remove(); preview(); });

	// photo upload -> base64 into the payload (stored only on Save)
	root.find(".cb-photo").on("click", () => root.find(".cb-file").get(0).click());
	root.find(".cb-file").on("change", function () {
		const file = this.files[0];
		if (!file) return;
		const rd = new FileReader();
		rd.onload = () => { cur.photo = rd.result; root.find(".cb-photo").text(file.name); preview(); };
		rd.readAsDataURL(file);
	});

	// code guard: exact match against live + retired, live as you type
	fNo.$input.on("input", () => {
		const v = (fNo.get_value() || "").trim();
		if (!v) return root.find(".cb-codechk").text("");
		frappe.call({ method: API + ".check_design_code", args: { code: v }, freeze: false }).then((r) => {
			const m = r.message || {};
			const mine = cur.name && m.record === cur.name;
			root.find(".cb-codechk")
				.toggleClass("ok", !m.taken || mine).toggleClass("bad", m.taken && !mine)
				.text(!m.taken || mine ? __("✓ free") : __("✗ taken ({0})", [m.status]));
		});
	});
	fSeries.$input.on("change", () => {
		const p = (fSeries.get_value() || "").trim();
		if (!p) return;
		frappe.call({ method: API + ".next_design_code", args: { prefix: p } })
			.then((r) => { fNo.set_value((r.message || {}).code || ""); fNo.$input.trigger("input"); preview(); });
	});

	function loadCard(name) {
		frappe.call({ method: API + ".get_design_card", args: { name } }).then((r) => {
			const m = r.message || {};
			cur = { name: m.name, photo: m.photo || "", stones: m.stones || [] };
			fNo.set_value(m.design_no); fType.set_value(m.design_type);
			fGW.set_value(m.gross_weight || ""); fDW.set_value(m.diamond_weight || "");
			fNote.set_value(m.note); root.find(".cb-extra textarea").val(m.extra_lines);
			root.find(".cb-photo").text(m.photo ? __("photo on record — click to replace") : __("click to upload the product photo"));
			paintStones();
			if (!m.photo && m.image) root.find(".cb-prev").attr("src", m.image);
			else preview();
		});
	}
	fPick.$input.on("change awesomplete-selectcomplete", () => setTimeout(() => {
		const v = fPick.get_value();
		if (v) loadCard(v);
	}, 100));
	root.find(".cb-new").on("click", () => {
		cur = { name: null, photo: "", stones: [] };
		fPick.set_value(""); fNo.set_value(""); fType.set_value("");
		fGW.set_value(""); fDW.set_value(""); fNote.set_value("");
		root.find(".cb-extra textarea").val("");
		root.find(".cb-photo").text(__("click to upload the product photo"));
		root.find(".cb-prev").attr("src", "");
		paintStones(); preview();
	});

	root.find(".cb-save").on("click", () => {
		const p = collect();
		if (!p.design_no.trim()) return frappe.show_alert({ message: __("Give the design number."), indicator: "orange" }, 3);
		p.name = cur.name; p.photo = cur.photo;
		frappe.dom.freeze(__("Rendering & saving..."));
		frappe.call({ method: API + ".save_design_card", args: { payload: JSON.stringify(p) } })
			.then((r) => {
				frappe.dom.unfreeze();
				const m = r.message || {};
				cur.name = m.name;
				frappe.show_alert({ message: __("{0} saved — card rendered.", [m.design_no]), indicator: "green" }, 4);
				if (m.image) root.find(".cb-prev").attr("src", m.image + "?t=" + Date.now());
			}).catch(() => frappe.dom.unfreeze());
	});

	// arriving from the gallery with a card picked
	if (frappe.route_options && frappe.route_options.card) { loadCard(frappe.route_options.card); frappe.route_options = null; }
	else paintStones();
};
