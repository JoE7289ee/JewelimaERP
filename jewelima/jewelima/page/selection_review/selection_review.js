// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Selection Review — after every import, a human confirms each photo: code,
// gold, dia, stock — then ticks REVIEWED and the row leaves the queue. Values
// save as you type (on blur); Enter jumps to the next row's gold field. A code
// is a design's identity: renaming onto a code that already exists brings both
// photos up SIDE BY SIDE and one of them has to be deleted before the rename
// lands. Route: /app/selection-review

frappe.pages["selection-review"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Selection Review", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const S = { rows: [], status: "pending" };

	$(page.main).append(`
		<style>
		#page-selection-review .container{max-width:100%;}
		.rv-top{display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin-bottom:10px;}
		.rv-top .frappe-control{margin:0;flex:0 0 200px;}
		.rv-top .control-label{font-size:11px;color:var(--text-muted);}
		.rv-tabs{display:flex;gap:6px;}
		.rv-tab{border:1px solid var(--border-color);border-radius:8px;padding:5px 16px;font-size:12.5px;font-weight:700;cursor:pointer;background:var(--control-bg);}
		.rv-tab.on{background:var(--primary);border-color:var(--primary);color:#fff;}
		.rv-prog{margin-left:auto;font-size:13px;color:var(--text-muted);}
		.rv-prog b{color:var(--text-color);}
		.rv-list{display:flex;flex-direction:column;gap:8px;}
		.rv-row{display:flex;gap:14px;align-items:center;border:1px solid var(--border-color);
			border-radius:10px;background:var(--fg-color);padding:8px 14px;}
		.rv-row.done{opacity:.55;}
		.rv-row img{width:110px;height:110px;object-fit:contain;background:#111;border-radius:7px;cursor:zoom-in;flex:0 0 110px;}
		.rv-f{display:flex;flex-direction:column;gap:2px;}
		.rv-f label{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);font-weight:700;}
		.rv-f input{border:1px solid var(--border-color);border-radius:6px;padding:6px 9px;font-size:13.5px;
			background:var(--control-bg);width:110px;font-variant-numeric:tabular-nums;}
		.rv-f input.rv-code{width:130px;font-weight:800;letter-spacing:.4px;}
		.rv-f input:focus{outline:2px solid var(--primary);border-color:var(--primary);}
		.rv-meta{font-size:11px;color:var(--text-muted);min-width:110px;}
		.rv-ok{margin-left:auto;display:flex;align-items:center;gap:8px;}
		.rv-ok label{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:800;cursor:pointer;
			border:2px solid #2e7d32;border-radius:8px;padding:8px 18px;color:#2e7d32;user-select:none;margin:0;}
		.rv-ok input{width:19px;height:19px;accent-color:#2e7d32;cursor:pointer;}
		.rv-row.done .rv-ok label{background:#2e7d32;color:#fff;}
		.rv-none{padding:50px;text-align:center;color:var(--text-muted);font-size:14px;}
		.rv-more{margin:14px 0 30px;text-align:center;}
		/* side-by-side conflict */
		.rv-cmp{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
		.rv-cmp .side{border:1px solid var(--border-color);border-radius:10px;padding:12px;text-align:center;}
		.rv-cmp img{max-width:100%;height:260px;object-fit:contain;background:#111;border-radius:7px;}
		.rv-cmp h5{margin:8px 0 4px;font-size:14px;}
		.rv-cmp .vals{font-size:12.5px;color:var(--text-muted);margin-bottom:10px;}
		.rv-cmp .btn-danger{font-weight:700;}
		</style>
		<div class="rv-top">
			<div class="rv-tabs">
				<span class="rv-tab on" data-s="pending">${__("To Review")}</span>
				<span class="rv-tab" data-s="done">${__("Reviewed")}</span>
				<span class="rv-tab" data-s="all">${__("All")}</span>
			</div>
			<div class="rv-search"></div>
			<span class="rv-prog"></span>
		</div>
		<div class="rv-list"></div>
		<div class="rv-more"><button class="btn btn-default rv-loadmore" style="display:none;">${__("Load more")}</button></div>
	`);
	const root = $(page.main);

	const search = frappe.ui.form.make_control({
		df: { fieldtype: "Data", label: __("Search code"), placeholder: __("SM-…"),
			onchange: () => load() },
		parent: root.find(".rv-search").get(0), render_input: true,
	});
	search.refresh();

	function load(append) {
		frappe.call({ method: API + ".get_selection_review", args: {
			status: S.status, search: (search.get_value() || "").trim() || null,
			limit: append ? S.rows.length + 100 : 100,
		} }).then((r) => {
			const m = r.message || {};
			S.rows = m.rows || [];
			root.find(".rv-prog").html(__("<b>{0}</b> of {1} reviewed", [m.reviewed || 0, m.total || 0]));
			paint();
		});
	}

	function rowHtml(p) {
		return `<div class="rv-row ${p.reviewed ? "done" : ""}" data-n="${esc(p.name)}">
			<img src="${encodeURI(p.image || "")}" loading="lazy" onerror="this.style.visibility='hidden'">
			<div class="rv-f"><label>${__("Code")}</label>
				<input class="rv-code" data-f="code" value="${esc(p.code)}"></div>
			<div class="rv-f"><label>${__("Gold g")}</label>
				<input type="number" step="0.001" data-f="gold_gms" value="${p.gold_gms || ""}"></div>
			<div class="rv-f"><label>${__("Diamond ct")}</label>
				<input type="number" step="0.01" data-f="cts" value="${p.cts || ""}"></div>
			<div class="rv-f"><label>${__("Stock pcs")}</label>
				<input type="number" step="1" data-f="stock_pcs" value="${p.stock_pcs || 0}"></div>
			<div class="rv-meta">${esc(p.design_type || "—")}<br>${esc(p.provider || "—")}</div>
			<div class="rv-ok"><label><input type="checkbox" class="rv-check" ${p.reviewed ? "checked" : ""}> ${__("REVIEWED")}</label></div>
		</div>`;
	}

	function paint() {
		root.find(".rv-list").html(S.rows.length ? S.rows.map(rowHtml).join("")
			: `<div class="rv-none">${S.status === "pending" ? __("Nothing left to review. 🎉") : __("No photos match.")}</div>`);
		root.find(".rv-loadmore").toggle(S.rows.length >= 100);
	}

	const rowOf = (el) => $(el).closest(".rv-row");
	const dataOf = (el) => S.rows.find((r) => r.name === rowOf(el).attr("data-n"));

	// values save on blur
	root.on("change", ".rv-row input[data-f]:not(.rv-code)", function () {
		const p = dataOf(this);
		const f = this.getAttribute("data-f");
		const v = Number(this.value) || 0;
		p[f] = v;
		frappe.call({ method: API + ".review_save", args: { name: p.name, [f]: v } })
			.then(() => frappe.show_alert({ message: __("Saved"), indicator: "green" }, 1.5));
	});

	// Enter in any field -> next row's gold input
	root.on("keydown", ".rv-row input", function (e) {
		if (e.key !== "Enter") return;
		e.preventDefault();
		this.blur();
		const next = rowOf(this).next(".rv-row");
		if (next.length) next.find("input[data-f='gold_gms']").focus().select();
	});

	// reviewed tick
	root.on("change", ".rv-check", function () {
		const p = dataOf(this);
		const on = this.checked ? 1 : 0;
		p.reviewed = on;
		rowOf(this).toggleClass("done", !!on);
		frappe.call({ method: API + ".review_save", args: { name: p.name, reviewed: on } })
			.then(() => {
				const prog = root.find(".rv-prog b");
				prog.text(Number(prog.text()) + (on ? 1 : -1));
				if (on && S.status === "pending") {
					const row = root.find(`.rv-row[data-n="${p.name}"]`);
					row.slideUp(180, () => row.remove());
				}
			});
	});

	// code rename + conflict flow
	root.on("change", ".rv-code", function () {
		const p = dataOf(this);
		const input = this;
		const code = (this.value || "").trim().toUpperCase();
		if (!code || code === p.name) { this.value = p.code; return; }
		frappe.call({ method: API + ".review_rename_code", args: { name: p.name, new_code: code } })
			.then((r) => {
				const m = r.message || {};
				if (m.renamed) {
					p.name = p.code = m.name;
					rowOf(input).attr("data-n", m.name);
					input.value = m.name;
					frappe.show_alert({ message: __("Code changed to {0}", [m.name]), indicator: "green" }, 3);
				} else if (m.conflict) {
					input.value = p.code;   // revert until resolved
					compare(m, p, code);
				}
			}).catch(() => { input.value = p.code; });
	});

	function side(d, label) {
		return `<div class="side">
			<img src="${encodeURI(d.image || "")}">
			<h5>${esc(d.name)} <span style="color:var(--text-muted);font-weight:400;">(${label})</span></h5>
			<div class="vals">${__("Gold {0} g · Dia {1} ct · Stock {2}", [d.gold_gms || 0, d.cts || 0, d.stock_pcs || 0])}
				${d.reviewed ? " · ✓ " + __("reviewed") : ""}<br>
				${d.selections ? __("used in {0} selection(s)", [d.selections]) : __("in no selections")}</div>
			<button class="btn btn-danger btn-sm rv-del" data-del="${esc(d.name)}">${__("Delete this one")}</button>
		</div>`;
	}

	function compare(m, p, wanted) {
		const d = new frappe.ui.Dialog({
			title: __("{0} already exists — same design under two codes?", [wanted]),
			size: "large",
			fields: [{ fieldtype: "HTML", fieldname: "cmp" }],
		});
		d.fields_dict.cmp.$wrapper.html(`
			<div style="font-size:13px;color:var(--text-muted);margin-bottom:10px;">
				${__("One design must live under ONE code. Compare the two — delete the wrong one, then set the code again.")}</div>
			<div class="rv-cmp">${side(m.mine, __("being renamed"))}${side(m.existing, __("already has the code"))}</div>`);
		d.fields_dict.cmp.$wrapper.find(".rv-del").on("click", function () {
			const victim = $(this).attr("data-del");
			frappe.confirm(__("Delete <b>{0}</b>? It will also be removed from any selection that picked it.", [esc(victim)]), () => {
				frappe.call({ method: API + ".review_delete_photo", args: { name: victim } }).then(() => {
					d.hide();
					frappe.show_alert({ message: __("{0} deleted.", [victim]), indicator: "red" }, 4);
					// if the OTHER one was deleted, complete the rename automatically
					if (victim !== m.mine.name) {
						frappe.call({ method: API + ".review_rename_code",
							args: { name: m.mine.name, new_code: wanted } }).then(() => load(true));
					} else {
						load(true);
					}
				});
			});
		});
		d.show();
	}

	// image click -> full size in a new tab
	root.on("click", ".rv-row img", function () {
		const src = this.getAttribute("src");
		if (src) window.open(src, "_blank");
	});

	root.on("click", ".rv-tab", function () {
		root.find(".rv-tab").removeClass("on");
		$(this).addClass("on");
		S.status = this.getAttribute("data-s");
		load();
	});
	root.find(".rv-loadmore").on("click", () => load(true));

	page.add_inner_button(__("Selection"), () => frappe.set_route("select-photos"));
	page.set_primary_action(__("Refresh"), () => load(), "refresh");
	load();
};
