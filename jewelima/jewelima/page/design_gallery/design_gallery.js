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
	.dg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;padding:14px 2px;}
	.dg-tile{position:relative;border-radius:10px;overflow:hidden;background:var(--control-bg);aspect-ratio:1/1;
		cursor:pointer;border:2px solid transparent;}
	.dg-tile img{width:100%;height:100%;object-fit:cover;display:block;background:#fff;}
	.dg-tile .code{position:absolute;left:0;right:0;bottom:0;padding:14px 8px 5px;font-size:11px;color:#fff;
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
			<img loading="lazy" src="${esc(d.image || "")}" onerror="this.style.opacity=.25">
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
		dlg.set_primary_action(__("Create New Design"), () => {
			dlg.hide();
			frappe.model.with_doctype("Design", () => {
				const nd = frappe.model.get_new_doc("Design");
				nd.design_name = d.design_no; // pulled from the catalog (Design name is unique)
				nd.image = d.image;           // same image, referenced
				nd.design_bank = d.name;      // link back to this catalog entry
				frappe.set_route("Form", "Design", nd.name);
			});
		});
		dlg.show();
	}

	// init — honour a preset tag passed from the tag manager ("View")
	if (frappe.route_options && frappe.route_options.tag) {
		state.tags.add(frappe.route_options.tag);
		frappe.route_options = null;
	}
	loadTags();
	load();
};
