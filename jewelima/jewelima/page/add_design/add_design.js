// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Add Design — create a Design Bank catalog entry by hand.
//   Design No: type it in full and hit "Check" (is it free?), OR type just the
//   prefix (A, BA, SM…) and hit "Auto-number" to fill the next unused number for it.
//   Plus image upload, GW, DMD weight, a note, and tags (pick existing or type new).
// Route: /app/add-design

frappe.pages["add-design"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Add Design", single_column: true });
	const API = "jewelima.jewelima.design_bank_api";
	let allTags = [];
	const selectedTags = [];

	$(page.main).append(`
		<style>
		.ad-wrap{max-width:760px;margin:4px auto 40px;}
		.ad-card{border:1px solid var(--border-color);border-radius:10px;background:var(--fg-color);padding:20px 22px;}
		.ad-dno{display:flex;gap:8px;align-items:flex-end;}
		.ad-dno-control{flex:1;}
		.ad-dno-btns{display:flex;gap:6px;padding-bottom:1px;}
		.ad-status{min-height:20px;margin:6px 2px 14px;font-size:12.5px;}
		.ad-status.ok{color:#1d7a33;} .ad-status.err{color:#b00020;} .ad-status.warn{color:#9a6700;}
		.ad-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px 20px;}
		.ad-weights{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-content:start;}
		.ad-tagbox{margin-top:16px;}
		.ad-tagbox > label{font-size:var(--text-sm);color:var(--text-muted);margin-bottom:4px;display:block;}
		.ad-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;}
		.ad-chip{display:inline-flex;align-items:center;gap:5px;background:var(--bg-light-gray,#f1f3f5);border:1px solid var(--border-color);border-radius:14px;padding:2px 8px;font-size:12px;}
		.ad-chip .x{cursor:pointer;color:var(--text-muted);font-weight:700;}
		.ad-note-box{margin-top:16px;}
		.ad-actions{margin-top:22px;display:flex;gap:10px;align-items:center;}
		.ad-hint{color:var(--text-muted);font-size:12px;}
		</style>
		<div class="ad-wrap"><div class="ad-card">
			<div class="ad-dno">
				<div class="ad-dno-control"></div>
				<div class="ad-dno-btns">
					<button class="btn btn-default btn-sm ad-auto" title="Fill the next unused number for the prefix you typed">⚙ Auto-number</button>
					<button class="btn btn-default btn-sm ad-check">✓ Check</button>
				</div>
			</div>
			<div class="ad-status"></div>
			<div class="ad-grid">
				<div class="ad-img"></div>
				<div class="ad-weights"><div class="ad-gw"></div><div class="ad-dw"></div></div>
			</div>
			<div class="ad-tagbox">
				<label>Tags</label>
				<div class="ad-chips"></div>
				<input class="form-control input-sm ad-tag-input" list="ad-tag-list" placeholder="Pick a tag or type a new one, then press Enter">
				<datalist id="ad-tag-list"></datalist>
			</div>
			<div class="ad-note-box"></div>
			<div class="ad-actions">
				<button class="btn btn-primary ad-create">Create Design</button>
				<span class="ad-hint">Design No is required. Tags you type that don't exist will be created.</span>
			</div>
		</div></div>
	`);

	const mk = (sel, df) => {
		const c = frappe.ui.form.make_control({ df, parent: $(page.main).find(sel).get(0), render_input: true });
		c.refresh();
		return c;
	};
	const dno = mk(".ad-dno-control", { fieldtype: "Data", label: "Design No", fieldname: "design_no", reqd: 1 });
	const img = mk(".ad-img", {
		fieldtype: "Attach Image", label: "Image", fieldname: "image",
		onchange() {
			// show the attached photo itself, not just the file link
			const url = img.get_value();
			$(page.main).find(".ad-img-preview").html(
				url
					? `<img src="${encodeURI(url)}" style="max-height:200px;max-width:100%;border-radius:8px;border:1px solid var(--border-color);" onerror="this.parentElement.innerHTML=''">`
					: ""
			);
		},
	});
	$(page.main).find(".ad-img").append('<div class="ad-img-preview" style="text-align:center;margin-top:6px;"></div>');
	const gw = mk(".ad-gw", { fieldtype: "Float", label: "GW (g)", fieldname: "gross_weight", precision: "3" });
	const dw = mk(".ad-dw", { fieldtype: "Float", label: "DW (ct)", fieldname: "diamond_weight", precision: "2" });
	const note = mk(".ad-note-box", { fieldtype: "Data", label: "Note", fieldname: "note" });

	const $status = $(page.main).find(".ad-status");
	const $chips = $(page.main).find(".ad-chips");
	const $tagInput = $(page.main).find(".ad-tag-input");
	const $datalist = $(page.main).find("#ad-tag-list");

	function setStatus(html, kind) {
		$status.removeClass("ok err warn").html(html || "");
		if (html) $status.addClass(kind || "");
	}

	// --- tags -------------------------------------------------------------------
	function loadTags() {
		frappe.call(API + ".get_tags", { with_counts: 0 }).then((r) => {
			allTags = (r.message || []).map((t) => t.tag);
			$datalist.html(allTags.map((t) => `<option value="${frappe.utils.escape_html(t)}">`).join(""));
		});
	}
	function renderChips() {
		$chips.html(
			selectedTags
				.map((t) => `<span class="ad-chip">${frappe.utils.escape_html(t)}<span class="x" data-tag="${frappe.utils.escape_html(t)}">×</span></span>`)
				.join("")
		);
	}
	function addTag(t) {
		t = (t || "").trim();
		if (t && !selectedTags.includes(t)) {
			selectedTags.push(t);
			renderChips();
		}
	}
	$chips.on("click", ".x", function () {
		const i = selectedTags.indexOf($(this).data("tag"));
		if (i > -1) selectedTags.splice(i, 1);
		renderChips();
	});
	$tagInput.on("keydown", (e) => {
		if (e.which === 13 || e.key === "Enter") {
			e.preventDefault();
			addTag($tagInput.val());
			$tagInput.val("");
		}
	});

	// --- design-no helpers ------------------------------------------------------
	$(page.main).find(".ad-auto").on("click", () => {
		const prefix = dno.get_value() || "";
		frappe.call(API + ".next_design_no", { prefix }).then((r) => {
			const m = r.message || {};
			dno.set_value(m.design_no);
			setStatus(`Suggested <b>${frappe.utils.escape_html(m.design_no)}</b> — never used.`, "ok");
		});
	});
	$(page.main).find(".ad-check").on("click", () => {
		const v = (dno.get_value() || "").trim();
		if (!v) return setStatus("Type a design no first (or a prefix, then Auto-number).", "warn");
		frappe.call(API + ".check_design_no", { design_no: v }).then((r) => {
			const m = r.message || {};
			if (m.exists) setStatus(`✗ <b>${frappe.utils.escape_html(v)}</b> already exists.`, "err");
			else setStatus(`✓ <b>${frappe.utils.escape_html(v)}</b> is available.`, "ok");
		});
	});

	// --- create -----------------------------------------------------------------
	function resetForm() {
		dno.set_value("");
		img.set_value("");
		$(page.main).find(".ad-img-preview").empty();
		gw.set_value(null);
		dw.set_value(null);
		note.set_value("");
		selectedTags.length = 0;
		renderChips();
		$tagInput.val("");
		setStatus("");
		setTimeout(() => dno.$input && dno.$input.focus(), 50);
	}
	$(page.main).find(".ad-create").on("click", () => {
		const v = (dno.get_value() || "").trim();
		if (!v) return frappe.msgprint(__("Design No is required."));
		frappe.dom.freeze(__("Creating…"));
		frappe.call(API + ".create_design_bank", {
			design_no: v,
			gross_weight: gw.get_value(),
			diamond_weight: dw.get_value(),
			note: note.get_value(),
			image: img.get_value(),
			tags: JSON.stringify(selectedTags),
		})
			.then((r) => {
				frappe.dom.unfreeze();
				const m = r.message || {};
				frappe.show_alert(
					{
						message: __("Created {0} — <a href='/app/design-bank/{1}'>open</a>", [frappe.utils.escape_html(m.design_no), encodeURIComponent(m.name)]),
						indicator: "green",
					},
					8
				);
				resetForm();
			})
			.catch(() => frappe.dom.unfreeze());
	});

	page.add_inner_button(__("Open Gallery"), () => frappe.set_route("design-gallery"));
	loadTags();
	resetForm();
};
