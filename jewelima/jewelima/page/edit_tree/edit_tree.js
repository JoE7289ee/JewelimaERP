// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Edit Tree — fix up a wax tree BEFORE it's cast: pick a tree, see its pieces,
// remove one that's no longer wanted (goes back to Tree Making) or add one that
// was waiting. Each edit re-weighs the tree (new wax weight optional — blank keeps
// the old one) and recomputes the casting numbers. Cast trees are read-only.
// Route: /app/edit-tree

frappe.pages["edit-tree"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Edit Tree", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const g = (v) => flt(v).toFixed(3);
	const S = { trees: [], sel: null, term: "", onlyOpen: true };

	$(page.main).append(`
		<style>
		#page-edit-tree .container{max-width:100%;}
		.et-wrap{display:grid;grid-template-columns:320px 1fr;gap:18px;align-items:start;}
		@media (max-width:900px){.et-wrap{grid-template-columns:1fr;}}
		.et-side{border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);overflow:hidden;}
		.et-tools{display:flex;gap:8px;align-items:center;padding:10px;border-bottom:1px solid var(--border-color);flex-wrap:wrap;}
		.et-search{flex:1;min-width:120px;border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);color:var(--text-color);height:30px;border-radius:6px;padding:2px 10px;font-size:13px;}
		.et-toggle{font-size:11.5px;color:var(--text-muted);display:flex;align-items:center;gap:5px;cursor:pointer;user-select:none;}
		.et-list{max-height:calc(100vh - 230px);overflow:auto;}
		.et-item{padding:9px 12px;border-bottom:1px solid var(--border-color);cursor:pointer;display:flex;flex-direction:column;gap:2px;}
		.et-item:hover{background:var(--control-bg);}
		.et-item.on{background:var(--bg-light-gray,#eef3ee);box-shadow:inset 3px 0 0 #1f618d;}
		.et-item .nm{font-weight:800;font-family:var(--font-family-monospace,monospace);font-size:13.5px;display:flex;align-items:center;gap:7px;}
		.et-item .sub{font-size:11px;color:var(--text-muted);}
		.et-k{border:1px solid var(--border-color);border-radius:10px;padding:0 7px;font-size:10.5px;font-weight:700;background:var(--control-bg);}
		.et-cast{background:#e3e7f5;color:#333d8f;border-radius:9px;padding:0 7px;font-size:10px;font-weight:800;}
		.et-open{background:#fdf3d0;color:#8a6d00;border-radius:9px;padding:0 7px;font-size:10px;font-weight:800;}
		.et-main{border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);padding:16px 18px;min-height:280px;}
		.et-empty{color:var(--text-muted);text-align:center;padding:60px 10px;}
		.et-h{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:4px;}
		.et-h .t{font-size:20px;font-weight:800;font-family:var(--font-family-monospace,monospace);}
		.et-facts{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0;}
		.et-tile{border:1px solid var(--border-color);border-radius:10px;padding:8px 15px;background:var(--control-bg);min-width:110px;}
		.et-tile .k{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;}
		.et-tile .v{font-size:17px;font-weight:800;font-variant-numeric:tabular-nums;}
		.et-tile.gold .v{color:#8a6d1a;}
		table.et-t{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;background:var(--fg-color);border:1px solid var(--border-color);border-radius:10px;overflow:hidden;}
		table.et-t th{background:var(--control-bg);font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);padding:7px 10px;text-align:left;border-bottom:1px solid var(--border-color);}
		table.et-t td{border-bottom:1px solid var(--border-color);padding:6px 10px;}
		table.et-t tr:last-child td{border-bottom:0;}
		table.et-t td.num,table.et-t th.num{text-align:right;font-variant-numeric:tabular-nums;}
		.et-rm{border:1px solid #e6b3b3;color:#b02a2a;background:#fff;border-radius:7px;padding:2px 10px;font-size:12px;font-weight:700;cursor:pointer;}
		.et-rm:hover{background:#fbeaea;}
		.et-rm:disabled{opacity:.4;cursor:not-allowed;}
		.et-add{border:1px dashed var(--border-color);border-radius:9px;background:transparent;color:#1f618d;font-weight:700;font-size:13px;padding:8px 16px;cursor:pointer;margin-top:12px;}
		.et-add:hover{background:var(--control-bg);}
		.et-note{font-size:12px;color:var(--text-muted);margin-top:10px;}
		</style>
		<div class="et-wrap">
			<div class="et-side">
				<div class="et-tools">
					<input class="et-search" type="text" placeholder="${__("Search trees…")}">
					<label class="et-toggle"><input type="checkbox" class="et-only" checked> ${__("hide cast")}</label>
				</div>
				<div class="et-list"></div>
			</div>
			<div class="et-main"><div class="et-empty">${__("Pick a tree on the left to edit its pieces.")}</div></div>
		</div>
	`);
	const root = $(page.main)[0];

	function renderList() {
		const term = S.term.trim().toLowerCase();
		const trees = S.trees.filter((t) =>
			!term || (t.tree_no || t.name).toLowerCase().includes(term) || (t.karat || "").toLowerCase().includes(term));
		root.querySelector(".et-list").innerHTML = trees.length ? trees.map((t) => `
			<div class="et-item ${S.sel === t.name ? "on" : ""}" data-tree="${esc(t.name)}">
				<div class="nm">${esc(t.tree_no || t.name)}
					${t.cast ? `<span class="et-cast">CAST</span>` : `<span class="et-open">OPEN</span>`}</div>
				<div class="sub"><span class="et-k">${esc(t.karat || "OTHER")}</span> · ${t.pieces} ${__("pc")} · ${t.wax_weight ? g(t.wax_weight) + " g wax" : __("no wax wt")}${t.made_on ? " · " + frappe.datetime.str_to_user(t.made_on.split(" ")[0]) : ""}</div>
			</div>`).join("") : `<div class="et-empty" style="padding:30px 10px;">${__("No trees.")}</div>`;
	}

	function renderDetail(d) {
		if (!d) { root.querySelector(".et-main").innerHTML = `<div class="et-empty">${__("Pick a tree on the left to edit its pieces.")}</div>`; return; }
		const locked = !!d.cast;
		const rows = (d.cards || []).map((c) => `<tr>
			<td><a class="jw-card-link" style="font-weight:800;color:#1f618d;cursor:pointer;font-family:var(--font-family-monospace,monospace);" data-card="${esc(c.order_bag)}">${esc(c.order_bag)}</a></td>
			<td>${esc(c.design || "")}</td>
			<td class="num">${c.qty || 1}</td>
			<td>${esc(c.location || "—")}</td>
			<td class="num">${c.cast_gold ? g(c.cast_gold) + " g" : ""}</td>
			<td class="num">${locked ? "" : `<button class="et-rm" data-card="${esc(c.order_bag)}" ${c.cast_gold ? "disabled title='Already cast-weighed'" : ""}>${__("Remove")}</button>`}</td>
		</tr>`).join("");
		root.querySelector(".et-main").innerHTML = `
			<div class="et-h">
				<span class="t">${esc(d.tree_no || d.tree)}</span>
				<span class="et-k">${esc(d.karat || "OTHER")}</span>
				${locked ? `<span class="et-cast">CAST${d.casting_date ? " · " + frappe.datetime.str_to_user(d.casting_date) : ""}</span>` : `<span class="et-open">OPEN — editable</span>`}
			</div>
			<div class="et-facts">
				<div class="et-tile"><div class="k">${__("Wax weight")}</div><div class="v">${d.wax_weight ? g(d.wax_weight) : "—"}<span style="font-size:11px;font-weight:600;color:var(--text-muted);"> g</span></div></div>
				<div class="et-tile"><div class="k">${__("Stone weight")}</div><div class="v">${d.stone_weight ? g(d.stone_weight) : "—"}<span style="font-size:11px;font-weight:600;color:var(--text-muted);"> g</span></div></div>
				<div class="et-tile gold"><div class="k">${__("Gold required")}</div><div class="v">${d.gold_required ? g(d.gold_required) : "—"}<span style="font-size:11px;font-weight:600;color:var(--text-muted);"> g</span></div></div>
				<div class="et-tile gold"><div class="k">${__("Pure gold")}</div><div class="v">${d.pure_gold_needed ? g(d.pure_gold_needed) : "—"}<span style="font-size:11px;font-weight:600;color:var(--text-muted);"> g</span></div></div>
			</div>
			<table class="et-t"><thead><tr>
				<th>${__("Card")}</th><th>${__("Design")}</th><th class="num">${__("Qty")}</th><th>${__("Location")}</th><th class="num">${__("Cast gold")}</th><th></th>
			</tr></thead><tbody>${rows}</tbody></table>
			${locked
				? `<div class="et-note">${__("This tree is already cast — pieces are locked.")}</div>`
				: `<button class="et-add">＋ ${__("Add a piece")}</button>
				<div class="et-note">${__("Removing a piece sends it back to Tree Making; adding pulls a waiting card onto this tree. You'll be asked for a new wax weight (optional — blank keeps {0} g).", [d.wax_weight ? g(d.wax_weight) : "0"])}</div>`}`;
	}

	// wax-weight prompt shared by add + remove
	function waxDialog(title, current, onGo) {
		const dlg = new frappe.ui.Dialog({
			title,
			fields: [{ fieldtype: "Float", fieldname: "wax", label: __("New wax weight (g) — optional"),
				precision: 3, description: __("Leave blank to keep the current {0} g.", [current ? g(current) : "0"]) }],
			primary_action_label: __("Apply"),
			primary_action(v) { dlg.hide(); onGo(v.wax || null); },
		});
		dlg.show();
	}

	function loadTree(name) {
		S.sel = name;
		renderList();
		frappe.call({ method: API + ".get_tree_edit", args: { tree: name } }).then((r) => renderDetail(r.message));
	}

	function load() {
		frappe.call({ method: API + ".get_trees", args: { only_open: S.onlyOpen ? 1 : 0 } }).then((r) => {
			S.trees = (r.message || {}).trees || [];
			if (S.sel && !S.trees.find((t) => t.name === S.sel)) S.sel = null;
			renderList();
			if (S.sel) loadTree(S.sel);
			else renderDetail(null);
		});
	}

	root.querySelector(".et-search").addEventListener("input", frappe.utils.debounce(function () {
		S.term = this.value || ""; renderList();
	}, 150));
	root.querySelector(".et-only").addEventListener("change", function () { S.onlyOpen = this.checked; load(); });
	$(root).on("click", ".et-item", function () { loadTree($(this).data("tree")); });

	$(root).on("click", ".et-rm", function () {
		const card = $(this).data("card");
		const tree = S.sel;
		frappe.confirm(__("Remove <b>{0}</b> from this tree? It goes back to Tree Making.", [card]), () => {
			const cur = (S.trees.find((t) => t.name === tree) || {}).wax_weight;
			waxDialog(__("Remove {0}", [card]), cur, (wax) => {
				frappe.call({ method: API + ".tree_remove_piece", args: { tree, order_bag: card, wax_weight: wax },
					freeze: true, freeze_message: __("Removing…") })
					.then((r) => { frappe.show_alert({ message: __("Removed {0}.", [card]), indicator: "blue" }, 4); renderDetail(r.message); load(); });
			});
		});
	});

	$(root).on("click", ".et-add", function () {
		const tree = S.sel;
		frappe.call({ method: API + ".get_tree_add_candidates", args: { tree } }).then((r) => {
			const cards = (r.message || {}).cards || [];
			const karat = (r.message || {}).karat || "";
			if (!cards.length) {
				frappe.msgprint({ title: __("Nothing to add"), indicator: "orange",
					message: __("No {0} cards are waiting at Tree Making (unassigned to a tree).", [karat]) });
				return;
			}
			const cur = (S.trees.find((t) => t.name === tree) || {}).wax_weight;
			const dlg = new frappe.ui.Dialog({
				title: __("Add a piece to {0}", [tree]),
				fields: [
					{ fieldtype: "Select", fieldname: "card", label: __("Waiting card ({0})", [karat]), reqd: 1,
						options: cards.map((c) => c.name).join("\n") },
					{ fieldtype: "Float", fieldname: "wax", label: __("New wax weight (g) — optional"), precision: 3,
						description: __("Leave blank to keep the current {0} g.", [cur ? g(cur) : "0"]) },
				],
				primary_action_label: __("Add to tree"),
				primary_action(v) {
					if (!v.card) return;
					dlg.hide();
					frappe.call({ method: API + ".tree_add_piece", args: { tree, order_bag: v.card, wax_weight: v.wax || null },
						freeze: true, freeze_message: __("Adding…") })
						.then((rr) => { frappe.show_alert({ message: __("Added {0}.", [v.card]), indicator: "green" }, 4); renderDetail(rr.message); load(); });
				},
			});
			// show each candidate's design as a hint under the select
			dlg.show();
		});
	});

	page.add_inner_button(__("Refresh"), load);
	load();
};
