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
		.oc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px;}
		.oc-tile{border:1px solid var(--border-color);border-radius:8px;overflow:hidden;background:#fff;text-align:center;}
		.oc-tile img{width:100%;height:170px;object-fit:contain;display:block;}
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
				<div style="display:flex;gap:8px;">
					<button class="btn btn-sm oc-prio" style="background:#1f618d;border-color:#1f618d;color:#fff;display:none;"></button>
					<button class="btn btn-sm oc-ret" style="background:#b02a2a;border-color:#b02a2a;color:#fff;display:none;"></button>
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
				root.find(".oc-title").text(`${curFolder} — ${m.total} ${__("design(s)")}`);
				root.find(".oc-grid").append(m.rows.map((d) => `
					<div class="oc-tile ${selected.has(d.name) ? "sel" : ""} ${d.status === "Retired" ? "ret" : ""}" data-name="${esc(d.name)}">
					${d.priority ? `<span class="oc-pri" title="${__("already prioritised")}">P${d.priority}</span>` : ""}
					${d.status === "Retired" ? `<span class="oc-retb">${__("RETIRED")}</span>` : ""}
					<img loading="lazy" src="${esc(d.display)}" onerror="this.style.opacity=.2">
					<div class="n">${esc(d.design_no)}</div></div>`).join(""));
				start += m.rows.length;
				root.find(".oc-more").toggle(start < m.total);
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

	// selection -> bulk prioritise
	const canPrio = frappe.user.has_role("Jewelima Design Bank") || frappe.user.has_role("Jewelima Design Approver") || frappe.user.has_role("System Manager");
	const selected = new Set();
	const canRetire = canPrio; // Design Bank, Approver and System Manager may retire
	function paintPrio() {
		// jQuery .toggle() with a NON-boolean argument animates a show/hide flip
		// (the odd/even-selection bug) — always hand it a real boolean
		root.find(".oc-prio").toggle(!!(canPrio && selected.size > 0))
			.text(__("Prioritise {0} selected", [selected.size]));
		root.find(".oc-ret").toggle(!!(canRetire && selected.size > 0))
			.text(__("Retire {0} selected", [selected.size]));
	}
	root.on("click", ".oc-tile", function () {
		if (!canPrio) return;
		const nm = $(this).data("name");
		if (selected.has(nm)) { selected.delete(nm); $(this).removeClass("sel"); }
		else { selected.add(nm); $(this).addClass("sel"); }
		paintPrio();
	});
	root.find(".oc-prio").on("click", () => {
		frappe.prompt([{ fieldname: "p", fieldtype: "Int", label: __("Priority (higher = sooner in Review)"), default: 10, reqd: 1 }],
			(v) => frappe.call({ method: API + ".set_design_priority",
				args: { names: JSON.stringify([...selected]), priority: v.p } }).then((r) => {
				frappe.show_alert({ message: __("{0} card(s) set to priority {1}.", [(r.message || {}).updated, v.p]), indicator: "green" }, 4);
				selected.clear(); paintPrio(); load(true);
			}), __("Prioritise for review"), __("Set"));
	});
	// bulk retire — one click, no confirm (house style); codes stay reserved
	root.find(".oc-ret").on("click", () => {
		frappe.call({ method: API + ".set_design_retired", args: { names: JSON.stringify([...selected]) } })
			.then((r) => {
				frappe.show_alert({ message: __("{0} card(s) retired.", [(r.message || {}).retired]), indicator: "red" }, 4);
				selected.clear(); paintPrio(); load(true);
			});
	});
};
