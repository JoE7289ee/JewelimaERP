// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Design Gallery — a Google-Photos-style grid of every Design Bank photo. The tag bar on
// top lets you filter (click tags; Any/All match) and search by design no. Select photos
// (hover checkbox) to apply or remove tags in bulk. Click a photo for a full preview where
// you can edit its tags. Custom tag system (Design Tag), not Frappe tags.
// Route: /app/design-gallery

frappe.pages["design-gallery"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Design Gallery", single_column: true });
	const root = $(page.main);
	const API = "jewelima.jewelima.design_bank_api";
	const API2 = "jewelima.jewelima.api"; // variant naming lives with the core APIs
	const esc = frappe.utils.escape_html;

	root.append(`
	<style>
	.dg-wrap{display:flex;flex-direction:column;min-height:calc(100vh - 80px);}
	.dg-bar{position:sticky;top:0;z-index:5;background:var(--fg-color);padding:10px 2px 8px;border-bottom:1px solid var(--border-color);}
	.dg-row1{display:flex;gap:10px;align-items:center;margin-bottom:8px;flex-wrap:wrap;}
	.dg-search{max-width:280px;}
	.dg-match{display:inline-flex;border:1px solid var(--border-color);border-radius:6px;overflow:hidden;font-size:12px;}
	.dg-match button{border:0;background:var(--fg-color);padding:4px 10px;cursor:pointer;color:var(--text-muted);}
	.dg-match button.on{background:var(--primary);color:#fff;}
	.dg-count{color:var(--text-muted);font-size:12px;margin-left:auto;}
	.dg-tags{display:flex;flex-wrap:wrap;gap:6px;max-height:88px;overflow:auto;}
	.dg-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border-color);border-radius:999px;
		padding:3px 10px;font-size:12px;cursor:pointer;user-select:none;background:var(--fg-color);white-space:nowrap;}
	.dg-chip .dot{width:9px;height:9px;border-radius:50%;background:var(--c,#6b7280);flex:none;}
	.dg-chip b{color:var(--text-muted);font-weight:600;}
	.dg-chip.on{background:var(--c,#6b7280);border-color:var(--c,#6b7280);color:#fff;}
	.dg-chip.on .dot{background:#fff;}
	.dg-chip.on b{color:rgba(255,255,255,.85);}
	.dg-actions{display:none;align-items:center;gap:10px;background:var(--bg-light-gray,#f4f5f6);border:1px solid var(--border-color);
		border-radius:8px;padding:8px 12px;margin:10px 0 2px;font-size:13px;position:sticky;top:118px;z-index:4;}
	.dg-actions .sel{font-weight:700;}
	.dg-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;padding:14px 2px;}
	.dg-tile{position:relative;border-radius:10px;overflow:hidden;background:var(--control-bg);aspect-ratio:3/4;
		cursor:pointer;border:2px solid transparent;}
	.dg-tile img{width:100%;height:100%;object-fit:contain;display:block;background:#fff;}
	.dg-tile .code{position:absolute;left:0;right:0;bottom:0;padding:18px 10px 7px;font-size:15px;font-weight:700;color:#fff;
		background:linear-gradient(transparent,rgba(0,0,0,.65));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
	.dg-tile .dots{position:absolute;top:6px;right:6px;display:flex;gap:3px;}
	.dg-tile .dots i{width:8px;height:8px;border-radius:50%;display:block;box-shadow:0 0 0 1px rgba(0,0,0,.2);}
	.dg-check{position:absolute;top:6px;left:6px;width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,.85);
		border:1.5px solid var(--gray-500,#8d99a6);display:none;align-items:center;justify-content:center;color:transparent;font-size:13px;z-index:2;}
	.dg-tile:hover .dg-check{display:flex;}
	.dg-tile.sel{border-color:var(--primary);}
	.dg-tile.sel .dg-check{display:flex;background:var(--primary);border-color:var(--primary);color:#fff;}
	.dg-status{text-align:center;color:var(--text-muted);font-size:12px;padding:14px;}
	.dg-prev-img{width:100%;max-height:62vh;object-fit:contain;background:#fff;border-radius:8px;}
	.dg-prev-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;}
	.dg-prev-tags .t{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:3px 10px;font-size:12px;color:#fff;}
	.dg-prev-tags .t span{cursor:pointer;font-weight:700;opacity:.8;}
	.dg-meta{font-size:13px;color:var(--text-muted);margin-top:8px;display:flex;gap:18px;flex-wrap:wrap;}
	</style>
	<div class="dg-wrap">
		<div class="dg-bar">
			<div class="dg-row1">
				<input type="text" class="form-control input-sm dg-search" placeholder="Search design no…">
				<select class="form-control input-sm dg-dtype" style="max-width:150px;margin-left:8px;display:inline-block;"><option value="">${__("All types")}</option></select>
				<input type="number" class="form-control input-sm dg-gwmin" placeholder="${__("gold ≥ g")}" style="max-width:86px;display:inline-block;">
				<input type="number" class="form-control input-sm dg-gwmax" placeholder="${__("gold ≤ g")}" style="max-width:86px;display:inline-block;">
				<input type="number" class="form-control input-sm dg-dwmin" step="0.01" placeholder="${__("dmd ≥ ct")}" style="max-width:86px;display:inline-block;">
				<input type="number" class="form-control input-sm dg-dwmax" step="0.01" placeholder="${__("dmd ≤ ct")}" style="max-width:86px;display:inline-block;">
				<div class="btn-group dg-modes" style="margin-left:8px;">
					<button class="btn btn-xs btn-primary" data-mode="info">${__("Info")}</button>
					<button class="btn btn-xs btn-default" data-mode="print">${__("Print")}</button>
					<button class="btn btn-xs btn-default" data-mode="customer">${__("Customer")}</button>
				</div>
				<span class="dg-match" title="Match any / all of the selected tags">
					<button data-m="any" class="on">Any</button><button data-m="all">All</button>
				</span>
				<button class="btn btn-xs btn-default dg-clear">Clear filters</button>
				<a class="btn btn-xs btn-default" href="/app/design-tags">Manage tags</a>
				<span class="dg-count"></span>
			</div>
			<div class="dg-tags"></div>
		</div>
		<div class="dg-actions">
			<span class="sel">0 selected</span>
			<button class="btn btn-xs btn-primary dg-apply">Apply tag…</button>
			<button class="btn btn-xs btn-default dg-remove">Remove tag…</button>
			<button class="btn btn-xs btn-default dg-clearsel">Clear selection</button>
		</div>
		<div class="dg-grid"></div>
		<div class="dg-status"></div>
		<div class="dg-sentinel" style="height:1px"></div>
	</div>`);

	const $grid = root.find(".dg-grid");
	const $tags = root.find(".dg-tags");
	const $status = root.find(".dg-status");
	const $count = root.find(".dg-count");
	const $actions = root.find(".dg-actions");

	const state = {
		search: "", tags: new Set(), match: "any",
		start: 0, limit: 60, total: 0, loading: false, done: false,
		selected: new Map(), tagColor: {},
	};

	// ---- tag bar ----
	function loadTags() {
		frappe.call(API + ".get_tags", { with_counts: 1 }).then((r) => {
			const tags = r.message || [];
			state.tagColor = {};
			$tags.empty();
			tags.forEach((t) => {
				state.tagColor[t.tag] = t.color || "#6b7280";
				const on = state.tags.has(t.tag) ? "on" : "";
				$tags.append(
					`<span class="dg-chip ${on}" data-tag="${esc(t.tag)}" style="--c:${esc(t.color || "#6b7280")}">
						<i class="dot"></i>${esc(t.tag)} <b>${t.count}</b></span>`
				);
			});
		});
	}

	$tags.on("click", ".dg-chip", function () {
		const tag = $(this).data("tag");
		if (state.tags.has(tag)) state.tags.delete(tag);
		else state.tags.add(tag);
		$(this).toggleClass("on");
		reload();
	});

	root.find(".dg-match button").on("click", function () {
		state.match = $(this).data("m");
		root.find(".dg-match button").removeClass("on");
		$(this).addClass("on");
		if (state.tags.size > 1) reload();
	});

	root.find(".dg-clear").on("click", () => {
		state.tags.clear();
		state.search = "";
		root.find(".dg-search").val("");
		$tags.find(".dg-chip").removeClass("on");
		reload();
	});

	let searchTimer;
	frappe.call({ method: "frappe.client.get_list", args: { doctype: "Design Type",
		fields: ["name"], limit_page_length: 0, order_by: "name" } }).then((r) => {
		root.find(".dg-dtype").append((r.message || []).map((t) =>
			`<option>${frappe.utils.escape_html(t.name)}</option>`).join(""));
	});
	root.on("change", ".dg-dtype, .dg-gwmin, .dg-gwmax, .dg-dwmin, .dg-dwmax", () => reload());
	root.on("click", ".dg-modes button", function () {
		state.mode = $(this).data("mode");
		root.find(".dg-modes button").removeClass("btn-primary").addClass("btn-default");
		$(this).removeClass("btn-default").addClass("btn-primary");
		reload();
	});
	root.find(".dg-search").on("input", function () {
		const v = this.value;
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => { state.search = v; reload(); }, 300);
	});

	// ---- grid ----
	function tileHtml(d) {
		const dots = (d.tags || [])
			.slice(0, 4)
			.map((t) => `<i style="background:${esc(state.tagColor[t] || "#6b7280")}"></i>`)
			.join("");
		const selected = state.selected.has(d.name) ? "sel" : "";
		return `<div class="dg-tile ${selected}" data-name="${esc(d.name)}">
			<div class="dg-check">&#10003;</div>
			<div class="dots">${dots}</div>
			<img loading="lazy" src="${esc(d.image ? d.image + (d.image.includes("?") ? "&" : "?") + "m=" + encodeURIComponent(d.modified || "") : "")}" onerror="this.style.opacity=.25">
			<div class="code">${esc(d.design_no || "")}</div>
		</div>`;
	}

	function reload() {
		state.start = 0;
		state.done = false;
		$grid.empty();
		state._cache = {};
		load();
	}

	function load() {
		if (state.loading || state.done) return;
		state.loading = true;
		$status.text("Loading…");
		frappe.call(API + ".get_designs", {
			mode: state.mode || "info",
			design_type: root.find(".dg-dtype").val() || null,
			gw_min: root.find(".dg-gwmin").val() || null,
			gw_max: root.find(".dg-gwmax").val() || null,
			dw_min: root.find(".dg-dwmin").val() || null,
			dw_max: root.find(".dg-dwmax").val() || null,
			search: state.search,
			tags: JSON.stringify([...state.tags]),
			match: state.match,
			start: state.start,
			limit: state.limit,
		}).then((r) => {
			const res = r.message || { rows: [], total: 0 };
			state.total = res.total;
			state._cache = state._cache || {};
			res.rows.forEach((d) => { state._cache[d.name] = d; });
			$grid.append(res.rows.map(tileHtml).join(""));
			state.start += res.rows.length;
			state.done = state.start >= res.total || res.rows.length === 0;
			state.loading = false;
			$count.text(`${state.total.toLocaleString()} designs`);
			$status.text(state.done ? (state.total ? "— end —" : "No designs match.") : "");
		});
	}

	// infinite scroll
	const io = new IntersectionObserver((entries) => {
		if (entries[0].isIntersecting) load();
	}, { rootMargin: "600px" });
	io.observe(root.find(".dg-sentinel")[0]);

	// ---- selection ----
	$grid.on("click", ".dg-check", function (e) {
		e.stopPropagation();
		const name = $(this).closest(".dg-tile").data("name");
		if (state.selected.has(name)) state.selected.delete(name);
		else state.selected.set(name, 1);
		$(this).closest(".dg-tile").toggleClass("sel");
		syncActions();
	});

	function syncActions() {
		const n = state.selected.size;
		$actions.toggle(n > 0);
		$actions.find(".sel").text(`${n} selected`);
	}

	root.find(".dg-clearsel").on("click", () => {
		state.selected.clear();
		$grid.find(".dg-tile.sel").removeClass("sel");
		syncActions();
	});

	function pickTag(title, cb) {
		const d = new frappe.ui.Dialog({
			title,
			fields: [
				{ fieldname: "tag", fieldtype: "Link", options: "Design Tag", label: "Tag", reqd: 1,
					description: "Pick an existing tag or type a new name and create it." },
			],
			primary_action_label: "Apply",
			primary_action(v) { d.hide(); cb(v.tag); },
		});
		d.show();
	}

	root.find(".dg-apply").on("click", () => {
		pickTag("Apply tag to " + state.selected.size + " design(s)", (tag) => {
			frappe.call(API + ".set_design_tags", {
				designs: JSON.stringify([...state.selected.keys()]), add: JSON.stringify([tag]),
			}).then(() => { frappe.show_alert({ message: `Tagged with “${tag}”`, indicator: "green" }); afterTagChange(); });
		});
	});
	root.find(".dg-remove").on("click", () => {
		pickTag("Remove tag from " + state.selected.size + " design(s)", (tag) => {
			frappe.call(API + ".set_design_tags", {
				designs: JSON.stringify([...state.selected.keys()]), remove: JSON.stringify([tag]),
			}).then(() => { frappe.show_alert({ message: `Removed “${tag}”`, indicator: "orange" }); afterTagChange(); });
		});
	});

	function afterTagChange() {
		state.selected.clear();
		syncActions();
		loadTags();
		reload();
	}

	// ---- preview ----
	$grid.on("click", ".dg-tile", function () {
		const d = state._cache[$(this).data("name")];
		if (d) preview(d);
	});

	function preview(d) {
		const dlg = new frappe.ui.Dialog({ title: d.design_no || "Design", size: "large" });
		const body = $(dlg.body);
		const render = (doc) => {
			const tags = (doc.tags || []).map((t) =>
				`<span class="t" style="background:${esc(state.tagColor[t] || "#6b7280")}">${esc(t)}
					<span data-rm="${esc(t)}" title="Remove">&times;</span></span>`).join("");
			body.html(`
				<img class="dg-prev-img" src="${esc(doc.image || "")}">
				<div class="dg-meta">
					<span><b>${esc(doc.design_no || "")}</b></span>
					<span>GW: ${doc.gross_weight ? doc.gross_weight + " g" : "—"}</span>
					<span>DW: ${doc.diamond_weight ? doc.diamond_weight + " ct" : "—"}</span>
					${doc.note ? `<span>Note: ${esc(doc.note)}</span>` : ""}
				</div>
				<div class="dg-prev-tags">${tags}
					<span class="t" style="background:var(--gray-600,#5e6b7a);cursor:pointer" data-add="1">+ tag</span>
				</div>`);
		};
		render(d);
		body.on("click", "[data-rm]", function () {
			const tag = $(this).data("rm");
			frappe.call(API + ".set_design_tags", { designs: JSON.stringify([d.name]), remove: JSON.stringify([tag]) })
				.then(() => { d.tags = (d.tags || []).filter((t) => t !== tag); render(d); loadTags(); });
		});
		body.on("click", "[data-add]", function () {
			pickTag("Add tag", (tag) => {
				frappe.call(API + ".set_design_tags", { designs: JSON.stringify([d.name]), add: JSON.stringify([tag]) })
					.then(() => { if (!(d.tags || []).includes(tag)) (d.tags = d.tags || []).push(tag); render(d); loadTags(); });
			});
		});
		// straight into the Card Builder with this card loaded (approved cards
		// edit there; anything else the builder bounces to Review with a hint)
		dlg.set_secondary_action_label(__("Edit Card"));
		dlg.set_secondary_action(() => {
			dlg.hide();
			frappe.route_options = { card: d.name };
			frappe.set_route("card-builder");
		});
		dlg.set_primary_action(__("Create Design"), () => {
			dlg.hide();
			createVariant(d);
		});
		dlg.show();
	}

	// ---- variant mint: karat + stone token (+ colour) -> the ONE canonical
	// Design name (A13047A-22EF / A13047A-18EF-Y). Existing variant opens;
	// a new one opens a prefilled Design form — created only when saved.
	let NAMING = null;
	function createVariant(d) {
		const go = (N) => {
			const vd = new frappe.ui.Dialog({
				title: __("Create Design — {0}", [d.design_no]),
				fields: [
					{ fieldname: "karat", fieldtype: "Select", label: __("Karat"), reqd: 1,
						options: N.karats.join("\n"), default: "22K" },
					{ fieldname: "quality", fieldtype: "Select", label: __("Stones"),
						options: [""].concat(N.tokens).join("\n"),
						description: __("empty = plain gold, no token in the name") },
					{ fieldname: "color", fieldtype: "Select", label: __("Gold colour"),
						options: N.colors.join("\n"), default: "YG",
						depends_on: `eval:!${JSON.stringify(N.karat_color_limit)}[doc.karat] || ${JSON.stringify(N.karat_color_limit)}[doc.karat].length > 1` },
					{ fieldname: "prev", fieldtype: "HTML" },
				],
				primary_action_label: __("Create"),
				primary_action(v) {
					frappe.call({ method: API2 + ".resolve_design_variant",
						args: { design_bank: d.name, karat: v.karat, quality: v.quality || "", color: v.color || "" } })
						.then((r) => {
							const m = r.message || {};
							vd.hide();
							if (m.exists) {
								frappe.show_alert({ message: __("{0} already exists — opening it.", [m.name]), indicator: "blue" }, 4);
								frappe.set_route("Form", "Design", m.name);
								return;
							}
							frappe.model.with_doctype("Design", () => {
								const nd = frappe.model.get_new_doc("Design");
								nd.design_name = m.name;        // canonical — the grammar decided it
								nd.design_type = m.design_type; // burned in from the card
								nd.image = m.image;
								nd.design_bank = m.design_bank;
								frappe.set_route("Form", "Design", nd.name);
							});
						});
				},
			});
			// live name preview + exists check on every change
			const judge = () => {
				const v = vd.get_values(true) || {};
				if (!v.karat) return;
				frappe.call({ method: API2 + ".resolve_design_variant", freeze: false,
					args: { design_bank: d.name, karat: v.karat, quality: v.quality || "", color: v.color || "" } })
					.then((r) => {
						const m = r.message || {};
						vd.get_field("prev").$wrapper.html(
							`<div style="font-size:15px;font-weight:800;font-family:var(--font-family-monospace,monospace);margin:4px 0;">${esc(m.name || "")}</div>
							<div style="font-size:12px;color:${m.exists ? "#e0a800" : "#2e7d32"};font-weight:700;">
								${m.exists ? __("already exists — Create opens it") : __("new — Create opens a prefilled Design to fill & save")}</div>`);
						vd.set_primary_action_label(m.exists ? __("Open") : __("Create"));
					})
					.catch(() => vd.get_field("prev").$wrapper.html(""));
			};
			vd.show();
			vd.$wrapper.on("change", "select", judge);
			judge();
		};
		if (NAMING) go(NAMING);
		else frappe.call({ method: API2 + ".get_variant_naming" }).then((r) => { NAMING = r.message; go(NAMING); });
	}

	// init — honour a preset tag passed from the tag manager ("View")
	if (frappe.route_options && frappe.route_options.tag) {
		state.tags.add(frappe.route_options.tag);
		frappe.route_options = null;
	}
	loadTags();
	load();
};
