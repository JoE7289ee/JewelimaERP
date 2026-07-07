// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Stone Buckets — read-only view of the six stone buckets (DMD / PS / CS / CVD /
// PDMD / POTH) that every plan/actual/print column tallies into. An item's bucket
// IS its Stone Type; each bucket expands to list every item that feeds it, in the
// same order as the code registry. PDMD/POTH ship empty (party stones are
// customer-given and arrive with orders).
// Route: /app/stone-buckets

frappe.pages["stone-buckets"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Stone Buckets", single_column: true });
	const API = "jewelima.jewelima.api";
	const S = { buckets: [], open: new Set(), term: "" };

	$(page.main).append(`
		<style>
		.sbk-wrap{max-width:1100px;}
		.sbk-top{display:flex;align-items:center;gap:10px;margin:2px 0 12px;flex-wrap:wrap;}
		.sbk-search{width:300px;border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);padding:4px 10px;height:30px;border-radius:5px;box-sizing:border-box;color:var(--text-color);font-size:13px;}
		.sbk-count{color:var(--text-muted);font-size:12px;}
		.sbk-top .btn{height:30px;}
		.sbk-box{border:1px solid var(--border-color);border-radius:8px;overflow:auto;max-height:calc(100vh - 200px);background:var(--fg-color);font-size:13px;}
		.sbk-row{display:flex;align-items:center;gap:8px;padding:6px 12px;border-bottom:1px solid var(--border-color);}
		.sbk-row:last-child{border-bottom:none;}
		.sbk-grp{cursor:pointer;user-select:none;}
		.sbk-grp:hover{background:var(--control-bg);}
		.sbk-caret{width:14px;flex:0 0 14px;text-align:center;color:var(--text-muted);font-size:10px;}
		.sbk-code{font-weight:800;letter-spacing:.4px;min-width:52px;}
		.sbk-stype{color:var(--text-muted);}
		.sbk-badge{margin-left:auto;background:var(--control-bg);border:1px solid var(--border-color);border-radius:10px;padding:0 9px;font-size:11px;color:var(--text-muted);white-space:nowrap;}
		.sbk-item .sbk-iname{color:var(--text-color);text-decoration:none;}
		.sbk-item .sbk-iname:hover{text-decoration:underline;}
		.sbk-item.sbk-disabled .sbk-iname{text-decoration:line-through;color:var(--text-muted);}
		.sbk-chips{margin-left:auto;display:flex;gap:6px;flex-wrap:wrap;}
		.sbk-chip{background:var(--control-bg);border-radius:4px;padding:1px 7px;font-size:11px;color:var(--text-muted);white-space:nowrap;}
		.sbk-chip.extra{background:#fde8e8;color:#b52a2a;font-weight:600;}
		.sbk-note{color:var(--text-muted);font-style:italic;padding:6px 12px 6px 48px;border-bottom:1px solid var(--border-color);font-size:12px;}
		.sbk-empty{padding:18px;text-align:center;color:var(--text-muted);}
		.sbk-hint{margin:10px 2px 0;color:var(--text-muted);font-size:12px;}
		</style>
		<div class="sbk-wrap">
			<div class="sbk-top">
				<input class="sbk-search" type="text" placeholder="Search stones…">
				<button class="btn btn-default btn-sm sbk-expand">${__("Expand All")}</button>
				<button class="btn btn-default btn-sm sbk-collapse">${__("Collapse All")}</button>
				<span class="sbk-count"></span>
			</div>
			<div class="sbk-box"><div class="sbk-body"></div></div>
			<div class="sbk-hint">${__("An item's bucket is its <b>Stone Type</b> — change it on the Item and every plan/actual recomputes into the right column. SW and CZ tally as Color Stone.")}</div>
		</div>
	`);

	const root = $(page.main)[0];
	const esc = frappe.utils.escape_html;
	const $search = root.querySelector(".sbk-search");

	function chips(it) {
		const c = [];
		if (it.group) c.push(`<span class="sbk-chip">${esc(it.group)}</span>`);
		c.push(`<span class="sbk-chip">${esc(it.uom)}</span>`);
		if (!it.in_registry) c.push(`<span class="sbk-chip extra">${__("extra")}</span>`);
		if (it.disabled) c.push(`<span class="sbk-chip">${__("disabled")}</span>`);
		return c.join("");
	}

	function render() {
		const body = root.querySelector(".sbk-body");
		const term = S.term.toLowerCase().trim();
		let shown = 0;
		const html = [];
		S.buckets.forEach((b) => {
			const items = term ? b.items.filter((i) => i.name.toLowerCase().includes(term)) : b.items;
			const bucketHit = b.code.toLowerCase().includes(term) || b.stone_type.toLowerCase().includes(term);
			if (term && !items.length && !bucketHit) return;
			const list = term && !items.length && bucketHit ? b.items : items;
			shown += list.length;
			const open = !!term || S.open.has(b.code);
			html.push(
				`<div class="sbk-row sbk-grp" data-b="${esc(b.code)}">
					<span class="sbk-caret">${open ? "▼" : "▶"}</span>
					<span class="sbk-code">${esc(b.code)}</span>
					<span class="sbk-stype">${esc(b.stone_type)}</span>
					<span class="sbk-badge">${b.count} ${__("items")}</span>
				</div>`
			);
			if (!open) return;
			if (!b.count) {
				html.push(`<div class="sbk-note">${__("No items yet — party stones are customer-given and get created on demand from the Party Stock page.")}</div>`);
				return;
			}
			list.forEach((it) => {
				html.push(
					`<div class="sbk-row sbk-item${it.disabled ? " sbk-disabled" : ""}" style="padding-left:48px">
						<a class="sbk-iname" href="/app/item/${encodeURIComponent(it.name)}">${esc(it.name)}</a>
						<span class="sbk-chips">${chips(it)}</span>
					</div>`
				);
			});
		});
		root.querySelector(".sbk-count").textContent = term
			? __("{0} stones matching", [shown])
			: __("{0} stones in {1} buckets", [S.buckets.reduce((s, b) => s + b.count, 0), S.buckets.length]);
		body.innerHTML = html.length ? html.join("") : `<div class="sbk-empty">${__("Nothing matches.")}</div>`;
		body.querySelectorAll(".sbk-grp").forEach((el) =>
			el.addEventListener("click", function () {
				const b = this.getAttribute("data-b");
				S.open.has(b) ? S.open.delete(b) : S.open.add(b);
				render();
			})
		);
	}

	root.querySelector(".sbk-expand").addEventListener("click", () => {
		S.open = new Set(S.buckets.map((b) => b.code));
		render();
	});
	root.querySelector(".sbk-collapse").addEventListener("click", () => { S.open = new Set(); render(); });
	$search.addEventListener("input", frappe.utils.debounce(() => { S.term = $search.value || ""; render(); }, 200));

	frappe.call({ method: API + ".get_stone_buckets" }).then((r) => {
		S.buckets = (r.message || {}).buckets || [];
		render();
	});
};
