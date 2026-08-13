// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Old Categories (Design Bank) — the catalog EXACTLY as it lived before the
// import: every original folder with its cards. Pure reference — completely
// separate from the tag system, nothing here edits anything.
// Route: /app/old-categories

frappe.pages["old-categories"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Old Categories", single_column: true });
	const API = "jewelima.jewelima.design_bank_api";
	const esc = frappe.utils.escape_html;
	let FOLDERS = [];
	let curFolder = null, start = 0;

	$(page.main).append(`
		<style>
		.oc-cols{display:flex;gap:20px;align-items:flex-start;}
		.oc-left{flex:0 0 340px;}
		.oc-list{border:1px solid var(--border-color);border-radius:8px;background:var(--fg-color);overflow:auto;max-height:calc(100vh - 180px);}
		.oc-f{padding:7px 14px;border-bottom:1px solid var(--border-color);cursor:pointer;display:flex;justify-content:space-between;font-size:12.5px;}
		.oc-f:hover,.oc-f.on{background:var(--control-bg);}
		.oc-f .c{color:var(--text-muted);}
		.oc-search{margin-bottom:8px;}
		.oc-right{flex:1;min-width:0;}
		.oc-title{font-size:15px;font-weight:700;margin-bottom:10px;}
		.oc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;}
		.oc-tile{border:1px solid var(--border-color);border-radius:11px;overflow:hidden;background:#fff;text-align:center;}
		.oc-tile img{width:100%;height:240px;object-fit:contain;display:block;}
		.oc-tile .n{font-size:12px;font-weight:700;padding:4px;}
		.oc-tile{cursor:pointer;position:relative;}
		.oc-tile.sel{border-color:#1f618d;box-shadow:0 0 0 2px #1f618d;}
		.oc-pri{position:absolute;top:6px;left:6px;background:#1f618d;color:#fff;font-size:10px;font-weight:700;border-radius:8px;padding:1px 7px;}
		.oc-retb{position:absolute;top:6px;right:6px;background:#b02a2a;color:#fff;font-size:9px;font-weight:800;letter-spacing:.05em;border-radius:8px;padding:1px 7px;}
		.oc-tile.ret img{filter:grayscale(1);opacity:.55;}
		.oc-tile.ret .n{color:#b02a2a;text-decoration:line-through;}
		.oc-hint{color:var(--text-muted);padding:20px;font-size:13px;}
		</style>
		<div class="oc-cols">
			<div class="oc-left">
				<div style="display:flex;gap:8px;margin-bottom:8px;">
				<input type="text" class="form-control input-sm oc-search" style="flex:1;" placeholder="${__("filter folders…")}">
				<button class="btn btn-xs btn-default oc-reset">${__("Reset tree")}</button>
			</div>
				<div class="oc-list"></div>
			</div>
			<div class="oc-right">
				<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
				<div class="oc-title" style="margin:0;"></div>
				<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
					<span class="oc-seltype" style="font-size:12px;color:var(--text-muted);"></span>
					<button class="btn btn-sm btn-default oc-selall" style="display:none;">${__("Select all")}</button>
					<button class="btn btn-sm btn-default oc-selnone" style="display:none;">${__("Deselect all")}</button>
					<span class="oc-actions" style="display:flex;gap:8px;"></span>
				</div>
			</div>
				<div class="oc-grid"></div>
				<button class="btn btn-default oc-more" style="margin-top:12px;display:none;">${__("Load more")}</button>
				<div class="oc-hint">${__("Pick a folder — this is the catalog exactly as it was kept before the import. Reference only.")}</div>
			</div>
		</div>
	`);
	const root = $(page.main);

	// tree view: top-level parents only; clicking a parent unfolds its
	// children in place (and shows the whole branch's cards)
	let openParents = new Set();
	function paintFolders(filter) {
		const q = (filter || "").toUpperCase();
		const groups = {};
		FOLDERS.forEach((f) => {
			const top = f.folder.split("/")[0];
			const g = groups[top] || (groups[top] = { count: 0, children: [] });
			g.count += f.count;
			if (f.folder !== top) g.children.push(f);
			else g.self = f;
		});
		const html = Object.keys(groups).sort().map((top) => {
			const g = groups[top];
			const matches = !q || top.toUpperCase().includes(q) ||
				g.children.some((c) => c.folder.toUpperCase().includes(q));
			if (!matches) return "";
			const opened = openParents.has(top) || (q && g.children.some((c) => c.folder.toUpperCase().includes(q)));
			return `<div class="oc-f parent ${top === curFolder ? "on" : ""}" data-f="${esc(top)}" data-parent="1">
					<span>${g.children.length ? (opened ? "▾ " : "▸ ") : ""}${esc(top)}</span><span class="c">${g.count}</span></div>` +
				(opened ? g.children
					.filter((c) => !q || c.folder.toUpperCase().includes(q) || top.toUpperCase().includes(q))
					.map((c) => `<div class="oc-f child ${c.folder === curFolder ? "on" : ""}" data-f="${esc(c.folder)}" style="padding-left:30px;font-size:12px;">
						<span>${esc(c.folder.split("/").slice(1).join("/"))}</span><span class="c">${c.count}</span></div>`).join("") : "");
		}).join("");
		root.find(".oc-list").html(html);
	}
	frappe.call({ method: API + ".get_old_categories" }).then((r) => {
		FOLDERS = (r.message || {}).folders || [];
		paintFolders();
	});
	root.find(".oc-search").on("input", function () { paintFolders(this.value); });

	function load(reset) {
		if (reset) { start = 0; root.find(".oc-grid").empty(); }
		frappe.call({ method: API + ".get_old_category_designs", args: { folder: curFolder, start, limit: 60, subtree: curSubtree } })
			.then((r) => {
				const m = r.message || { rows: [], total: 0 };
				m.rows.forEach((d) => { meta[d.name] = { status: d.status, priority: d.priority || 0 }; });
				root.find(".oc-title").text(`${curFolder} — ${m.total} ${__("design(s)")}`);
				root.find(".oc-grid").append(m.rows.map((d) => `
					<div class="oc-tile ${selected.has(d.name) ? "sel" : ""} ${d.status === "Retired" ? "ret" : ""}" data-name="${esc(d.name)}">
					${d.priority ? `<span class="oc-pri" title="${__("already prioritised")}">P${d.priority}</span>` : ""}
					${d.status === "Retired" ? `<span class="oc-retb">${__("RETIRED")}</span>` : ""}
					<img loading="lazy" src="${esc(d.display)}" onerror="this.style.opacity=.2">
					<div class="n">${esc(d.design_no)}</div></div>`).join(""));
				start += m.rows.length;
				root.find(".oc-more").toggle(start < m.total);
				paintPrio(); // tiles just landed -> Select all appears
			});
	}
	let curSubtree = 0;
	root.on("click", ".oc-f", function () {
		curFolder = $(this).data("f");
		curSubtree = $(this).data("parent") ? 1 : 0;
		if (curSubtree) {
			// toggle the branch open/closed and show the whole branch's cards
			openParents.has(curFolder) ? openParents.delete(curFolder) : openParents.add(curFolder);
		}
		root.find(".oc-hint").hide();
		paintFolders(root.find(".oc-search").val());
		load(true);
	});
	root.find(".oc-more").on("click", () => load());

	// reset tree: fold every branch, clear the pick
	root.find(".oc-reset").on("click", () => {
		openParents.clear();
		root.find(".oc-search").val("");
		paintFolders();
	});

	// single-type selection -> the action buttons change with the type
	const canPrio = frappe.user.has_role("Jewelima Design Bank") || frappe.user.has_role("Jewelima Design Approver") || (frappe.user.has_role("System Manager") || frappe.user.has_role("JW Manager"));
	const selected = new Set();
	const meta = {};        // name -> {status, priority}, filled as tiles load
	let selType = null;     // the ONE type the current selection is of

	function typeOf(name) {
		const o = meta[name] || {};
		if (o.status === "Retired") return "retired";
		if (o.status === "Approved") return "approved";
		return (o.priority || 0) > 0 ? "prioritised" : "pending";
	}
	const TYPE_LABEL = { pending: __("pending"), prioritised: __("prioritised"), retired: __("retired"), approved: __("approved") };
	const B = "#1f618d", R = "#b02a2a", G = "#1d7a33";
	// the buttons offered per selection type (op -> design_bulk_action)
	const ACTIONS = {
		pending: [{ l: "Prioritise", op: "prioritise", ask: 1, c: B }, { l: "Retire", op: "retire", c: R }],
		prioritised: [{ l: "Deprioritise", op: "to_pending", c: B }, { l: "Deprioritise & Retire", op: "retire_clear_prio", c: R }],
		retired: [{ l: "Bring back to pending", op: "to_pending", c: B }, { l: "Bring back & prioritise", op: "prioritise", ask: 1, c: G }],
		approved: [{ l: "Retire", op: "retire", c: R }],
	};

	function paintPrio() {
		const n = selected.size;
		root.find(".oc-seltype").text(n ? __("{0} selected \u00b7 {1}", [n, TYPE_LABEL[selType] || selType]) : "");
		root.find(".oc-selnone").toggle(!!n);
		root.find(".oc-selall").toggle(!!(canPrio && selType && root.find(".oc-tile").length));
		const box = root.find(".oc-actions");
		if (!n || !canPrio) { box.empty(); return; }
		box.html((ACTIONS[selType] || []).map((a) =>
			`<button class="btn btn-sm oc-act" data-op="${a.op}" data-ask="${a.ask ? 1 : 0}" style="background:${a.c};border-color:${a.c};color:#fff;">${__(a.l)} (${n})</button>`).join(""));
	}

	// Select all LOADED tiles OF THE CURRENT TYPE (keeps the selection single-type)
	root.find(".oc-selall").on("click", () => {
		if (!selType) return;
		root.find(".oc-tile").each(function () {
			const nm = $(this).data("name");
			if (typeOf(nm) === selType) { selected.add(nm); $(this).addClass("sel"); }
		});
		paintPrio();
	});
	root.find(".oc-selnone").on("click", () => {
		selected.clear(); selType = null;
		root.find(".oc-tile").removeClass("sel");
		paintPrio();
	});
	root.on("click", ".oc-tile", function () {
		if (!canPrio) return;
		const nm = $(this).data("name");
		if (selected.has(nm)) {
			selected.delete(nm); $(this).removeClass("sel");
			if (!selected.size) selType = null;
		} else {
			const t = typeOf(nm);
			if (selected.size && t !== selType) {   // different type -> start a fresh selection
				selected.clear(); root.find(".oc-tile").removeClass("sel");
			}
			selType = t; selected.add(nm); $(this).addClass("sel");
		}
		paintPrio();
	});

	// run the picked workflow action on the whole (single-type) selection
	root.on("click", ".oc-act", function () {
		const op = this.dataset.op, ask = this.dataset.ask === "1";
		const names = [...selected];
		if (!names.length) return;
		const run = (priority) => frappe.call({ method: API + ".design_bulk_action",
			args: { names: JSON.stringify(names), action: op, priority: priority == null ? null : priority } })
			.then((r) => {
				frappe.show_alert({ message: __("{0} card(s) updated.", [(r.message || {}).updated]), indicator: "green" }, 4);
				selected.clear(); selType = null; paintPrio(); load(true);
			});
		if (ask) {
			frappe.prompt([{ fieldname: "p", fieldtype: "Int", label: __("Priority (higher = sooner in Review)"), default: 10, reqd: 1 }],
				(v) => run(v.p), __("Set priority"), __("Set"));
		} else { run(null); }
	});

};
