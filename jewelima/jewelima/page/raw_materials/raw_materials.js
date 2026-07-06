// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Raw Materials — read-only browser of the RAW MATERIAL branch of the Item Group
// tree: MAIN TYPE -> TYPE -> GROUP -> leaf, with every item under its group.
// Structural levels start open, item-holding groups start closed. Searching
// filters items/groups and force-opens the matching branches. Items not in the
// shipped code registry (jewelima/raw_materials.py) are flagged "extra".
// Route: /app/raw-materials

frappe.pages["raw-materials"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Raw Materials", single_column: true });
	const API = "jewelima.jewelima.api";
	const S = { tree: null, open: new Set(), term: "" };

	$(page.main).append(`
		<style>
		.rm-wrap{max-width:1100px;}
		.rm-top{display:flex;align-items:center;gap:10px;margin:2px 0 12px;flex-wrap:wrap;}
		.rm-search{width:300px;border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);padding:4px 10px;height:30px;border-radius:5px;box-sizing:border-box;color:var(--text-color);font-size:13px;}
		.rm-count{color:var(--text-muted);font-size:12px;}
		.rm-top .btn{height:30px;}
		.rm-box{border:1px solid var(--border-color);border-radius:8px;overflow:auto;max-height:calc(100vh - 200px);background:var(--fg-color);font-size:13px;}
		.rm-row{display:flex;align-items:center;gap:8px;padding:6px 12px;border-bottom:1px solid var(--border-color);}
		.rm-row:last-child{border-bottom:none;}
		.rm-grp{cursor:pointer;user-select:none;}
		.rm-grp:hover{background:var(--control-bg);}
		.rm-caret{width:14px;flex:0 0 14px;text-align:center;color:var(--text-muted);font-size:10px;}
		.rm-name{font-weight:600;}
		.rm-l0 .rm-name{font-weight:700;text-transform:uppercase;letter-spacing:.4px;}
		.rm-l1 .rm-name{font-weight:700;}
		.rm-badge{margin-left:auto;background:var(--control-bg);border:1px solid var(--border-color);border-radius:10px;padding:0 9px;font-size:11px;color:var(--text-muted);white-space:nowrap;}
		.rm-item .rm-iname{color:var(--text-color);text-decoration:none;}
		.rm-item .rm-iname:hover{text-decoration:underline;}
		.rm-item.rm-disabled .rm-iname{text-decoration:line-through;color:var(--text-muted);}
		.rm-chips{margin-left:auto;display:flex;gap:6px;flex-wrap:wrap;}
		.rm-chip{background:var(--control-bg);border-radius:4px;padding:1px 7px;font-size:11px;color:var(--text-muted);white-space:nowrap;}
		.rm-chip.karat{background:#fdf3d8;color:#8a6d1a;font-weight:600;}
		.rm-chip.extra{background:#fde8e8;color:#b52a2a;font-weight:600;}
		.rm-empty{padding:18px;text-align:center;color:var(--text-muted);}
		.rm-hint{margin:10px 2px 0;color:var(--text-muted);font-size:12px;}
		</style>
		<div class="rm-wrap">
			<div class="rm-top">
				<input class="rm-search" type="text" placeholder="Search materials…">
				<button class="btn btn-default btn-sm rm-expand">${__("Expand All")}</button>
				<button class="btn btn-default btn-sm rm-collapse">${__("Collapse All")}</button>
				<span class="rm-count"></span>
			</div>
			<div class="rm-box"><div class="rm-body"></div></div>
			<div class="rm-hint">${__("Read-only view of the RAW MATERIAL item-group tree. The base set ships in code with the app; items marked <b>extra</b> exist on this site but are not part of it.")}</div>
		</div>
	`);

	const root = $(page.main)[0];
	const esc = frappe.utils.escape_html;
	const $search = root.querySelector(".rm-search");

	function allGroups(node, out) {
		out.push(node.name);
		node.children.forEach((c) => allGroups(c, out));
		return out;
	}

	function defaultOpen(node) {
		// structural nodes (having child groups) start open; item-holders start closed
		if (node.children.length) {
			S.open.add(node.name);
			node.children.forEach(defaultOpen);
		}
	}

	// returns the node filtered to the search term, or null if nothing matches
	function filterNode(node, term) {
		const groupHit = node.name.toLowerCase().includes(term);
		const items = groupHit ? node.items : node.items.filter((i) => i.name.toLowerCase().includes(term));
		const children = node.children.map((c) => filterNode(c, term)).filter(Boolean);
		if (!groupHit && !items.length && !children.length) return null;
		const kids = groupHit ? node.children : children;
		const its = groupHit ? node.items : items;
		return { ...node, children: kids, items: its, count: its.length + kids.reduce((s, k) => s + k.count, 0) };
	}

	function chips(it) {
		const c = [];
		if (it.metal_purity) c.push(`<span class="rm-chip karat">${esc(it.metal_purity)}</span>`);
		if (it.purity) c.push(`<span class="rm-chip">${it.purity}%</span>`);
		if (it.stone_type) c.push(`<span class="rm-chip">${esc(it.stone_type)}</span>`);
		c.push(`<span class="rm-chip">${esc(it.uom)}</span>`);
		if (!it.in_registry) c.push(`<span class="rm-chip extra">${__("extra")}</span>`);
		if (it.disabled) c.push(`<span class="rm-chip">${__("disabled")}</span>`);
		return c.join("");
	}

	function renderNode(node, depth, forceOpen, html) {
		const open = forceOpen || S.open.has(node.name);
		const pad = 12 + depth * 24;
		html.push(
			`<div class="rm-row rm-grp rm-l${depth}" data-grp="${esc(node.name)}" style="padding-left:${pad}px">
				<span class="rm-caret">${open ? "▼" : "▶"}</span>
				<span class="rm-name">${esc(node.name)}</span>
				<span class="rm-badge">${node.count} ${__("items")}</span>
			</div>`
		);
		if (!open) return;
		node.children.forEach((c) => renderNode(c, depth + 1, forceOpen, html));
		node.items.forEach((it) => {
			html.push(
				`<div class="rm-row rm-item${it.disabled ? " rm-disabled" : ""}" style="padding-left:${pad + 38}px">
					<a class="rm-iname" href="/app/item/${encodeURIComponent(it.name)}">${esc(it.name)}</a>
					<span class="rm-chips">${chips(it)}</span>
				</div>`
			);
		});
	}

	function render() {
		const body = root.querySelector(".rm-body");
		if (!S.tree) { body.innerHTML = `<div class="rm-empty">${__("Item group tree not built yet.")}</div>`; return; }
		const term = S.term.toLowerCase().trim();
		const tree = term ? filterNode(S.tree, term) : S.tree;
		root.querySelector(".rm-count").textContent = tree
			? __("{0} items", [tree.count]) + (term ? " " + __("matching") : "")
			: "";
		if (!tree) { body.innerHTML = `<div class="rm-empty">${__("Nothing matches.")}</div>`; return; }
		const html = [];
		renderNode(tree, 0, !!term, html);
		body.innerHTML = html.join("");
		body.querySelectorAll(".rm-grp").forEach((el) =>
			el.addEventListener("click", function () {
				const g = this.getAttribute("data-grp");
				S.open.has(g) ? S.open.delete(g) : S.open.add(g);
				render();
			})
		);
	}

	root.querySelector(".rm-expand").addEventListener("click", () => {
		S.open = new Set(allGroups(S.tree, []));
		render();
	});
	root.querySelector(".rm-collapse").addEventListener("click", () => {
		S.open = new Set([S.tree.name]);
		render();
	});
	$search.addEventListener("input", frappe.utils.debounce(() => { S.term = $search.value || ""; render(); }, 200));

	frappe.call({ method: API + ".get_raw_material_tree" }).then((r) => {
		S.tree = (r.message || {}).tree;
		if (S.tree) defaultOpen(S.tree);
		render();
	});
};
