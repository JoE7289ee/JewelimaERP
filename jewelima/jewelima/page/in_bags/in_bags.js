// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// In Bags (Reports > Stock) — the pooled In Bags warehouse EXPLODED: where every
// material physically sits on the floor. Matrix: rows = items (gold g / stones
// ct, heat-shaded), columns = benches holding material, with each bench's total
// and its status split (In Queue / Issued / Receipted) so you see what's out
// with workers. Route: /app/in-bags

frappe.pages["in-bags"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "In Bags", single_column: true });
	const API = "jewelima.jewelima.api";
	const S = { d: null, term: "", mode: "All" };

	$(page.main).append(`
		<style>
		.ib-cards{display:flex;gap:12px;flex-wrap:wrap;margin:2px 0 12px;}
		.ib-card{border:1px solid var(--border-color);border-radius:8px;background:var(--fg-color);padding:10px 16px;min-width:160px;}
		.ib-card .lb{font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;}
		.ib-card .v{font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;}
		.ib-card.gold{box-shadow:inset 3px 0 0 #b8860b;}
		.ib-card.stone{box-shadow:inset 3px 0 0 #1c5da8;}
		.ib-top{display:flex;align-items:center;gap:10px;margin:0 0 10px;flex-wrap:wrap;}
		.ib-search{width:260px;border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);padding:4px 10px;height:30px;border-radius:5px;box-sizing:border-box;color:var(--text-color);font-size:13px;}
		.ib-pill{border:1px solid var(--border-color);background:var(--fg-color);border-radius:14px;padding:3px 13px;font-size:12px;cursor:pointer;}
		.ib-pill.on{background:var(--primary);color:#fff;border-color:var(--primary);font-weight:600;}
		.ib-count{color:var(--text-muted);font-size:12px;margin-left:auto;}
		.ib-box{border:1px solid var(--border-color);border-radius:8px;overflow:auto;max-height:calc(100vh - 250px);background:var(--fg-color);}
		table.ib-tbl{border-collapse:separate;border-spacing:0;font-size:12.5px;min-width:100%;}
		table.ib-tbl th{position:sticky;top:0;z-index:2;background:var(--control-bg,var(--fg-color));border-bottom:2px solid var(--gray-400,#aeb6bf);padding:6px 10px;text-align:right;white-space:nowrap;font-weight:700;vertical-align:bottom;}
		table.ib-tbl th:first-child{left:0;z-index:3;text-align:left;}
		table.ib-tbl td:first-child{position:sticky;left:0;background:var(--fg-color);text-align:left;z-index:1;border-right:1px solid var(--border-color);}
		table.ib-tbl tr:hover td{filter:brightness(.97);}
		table.ib-tbl td{border-bottom:1px solid var(--border-color);padding:5px 10px;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}
		table.ib-tbl td.tot,table.ib-tbl th.tot{font-weight:800;border-left:2px solid var(--gray-400,#aeb6bf);}
		.ib-bench{font-weight:800;}
		.ib-bench-sub{font-size:10.5px;color:var(--text-muted);font-weight:400;}
		.ib-st{display:inline-block;border-radius:8px;padding:0 6px;font-size:10px;font-weight:700;margin-left:3px;}
		.ib-st.q{background:#eef2f7;color:#5a6b7b;}
		.ib-st.h{background:#fdeaea;color:#b02a2a;}
		.ib-st.i{background:#fdf3e3;color:#9a6700;}
		.ib-st.o{background:#e7f0fb;color:#1c5da8;}
		.ib-st.r{background:#eaf6ec;color:#1d7a33;}
		.ib-st.c{background:#e2f1e5;color:#155e26;}
		.ib-item{font-weight:700;}
		.ib-grp{display:block;font-size:10.5px;color:var(--text-muted);font-weight:400;}
		td.ib-gold-cell{background:rgba(184,134,11,var(--a,0));}
		td.ib-stone-cell{background:rgba(28,93,168,var(--a,0));}
		.ib-unit{color:var(--text-muted);font-size:10px;margin-left:2px;}
		.ib-empty{padding:18px;text-align:center;color:var(--text-muted);}
		.ib-hint{margin:10px 2px 0;color:var(--text-muted);font-size:12px;}
		</style>
		<div class="ib-cards"></div>
		<div class="ib-top">
			<input class="ib-search" type="text" placeholder="${__("Search materials…")}">
			<span class="ib-pills">
				${["All", "Gold", "Stones"].map((m) => `<span class="ib-pill${m === "All" ? " on" : ""}" data-m="${m}">${__(m)}</span>`).join("")}
			</span>
			<span class="ib-count"></span>
		</div>
		<div class="ib-box"><table class="ib-tbl"><thead class="ib-head"></thead><tbody class="ib-body"></tbody></table></div>
		<div class="ib-hint">${__("Everything inside the In Bags pool, split by the bench each card currently sits at (bag ledgers × locations). Darker cells hold more. Status chips per bench: Q in queue · H on hold · I issued · O ongoing · R receipted · ✓ completed.")}</div>
	`);

	const root = $(page.main)[0];
	const esc = frappe.utils.escape_html;
	const fmt = (v) => flt(v).toFixed(3);

	function render() {
		const d = S.d || {};
		const t = d.totals || {};
		root.querySelector(".ib-cards").innerHTML = `
			<div class="ib-card gold"><div class="lb">${__("Gold in bags")}</div><div class="v">${fmt(t.gold || 0)} g</div></div>
			<div class="ib-card stone"><div class="lb">${__("Stones in bags")}</div><div class="v">${fmt(t.stones || 0)} ct</div></div>
			<div class="ib-card"><div class="lb">${__("Benches holding")}</div><div class="v">${t.benches || 0}</div></div>
			<div class="ib-card"><div class="lb">${__("Materials")}</div><div class="v">${t.materials || 0}</div></div>`;

		const term = S.term.toLowerCase().trim();
		const items = (d.items || []).filter((r) =>
			(S.mode === "All" || (S.mode === "Gold" ? !r.is_stone : r.is_stone)) &&
			(!term || r.item.toLowerCase().includes(term) || r.group.toLowerCase().includes(term)));
		const locs = d.locations || [];
		root.querySelector(".ib-count").textContent = __("{0} material(s)", [items.length]);

		// bench-record statuses (benches.py STATUS_OPTIONS); unknown ones still render
		const ST = {
			"In Queue": ["q", "Q"], "On Hold": ["h", "H"], "Issued": ["i", "I"],
			"Ongoing": ["o", "O"], "Receipted": ["r", "R"], "Completed": ["c", "✓"],
		};
		const stChip = (sts) =>
			Object.keys(ST).concat(Object.keys(sts).filter((k) => !ST[k]))
				.filter((k) => sts[k] && sts[k].cards)
				.map((k) => {
					const [cls, lb] = ST[k] || ["q", k[0]];
					return `<span class="ib-st ${cls}" title="${esc(k)}: ${sts[k].cards} ${__("card(s)")} · ${fmt(sts[k].gold)} g · ${fmt(sts[k].stones)} ct">${lb}${sts[k].cards}</span>`;
				}).join("");
		root.querySelector(".ib-head").innerHTML = `<tr>
			<th>${__("Material")}</th>
			${locs.map((l) => `<th><span class="ib-bench">${esc(l.label)}</span>${stChip(l.statuses)}<br>
				<span class="ib-bench-sub">${fmt(l.gold)} g · ${fmt(l.stones)} ct</span></th>`).join("")}
			<th class="tot">${__("Total")}</th>
		</tr>`;

		const body = root.querySelector(".ib-body");
		body.innerHTML = items.length
			? items.map((r) => {
				const max = Math.max(...Object.values(r.cells), 0.0001);
				const unit = r.is_stone ? "ct" : "g";
				const cls = r.is_stone ? "ib-stone-cell" : "ib-gold-cell";
				return `<tr>
					<td><span class="ib-item">${esc(r.item)}</span><span class="ib-grp">${esc(r.group)}</span></td>
					${locs.map((l) => {
						const v = r.cells[l.location];
						const a = v ? (0.08 + 0.3 * (v / max)).toFixed(2) : 0;
						return `<td class="${v ? cls : ""}" style="--a:${a}">${v ? fmt(v) + `<span class="ib-unit">${unit}</span>` : "·"}</td>`;
					}).join("")}
					<td class="tot">${fmt(r.total)}<span class="ib-unit">${unit}</span></td>
				</tr>`;
			}).join("")
			: `<tr><td colspan="${locs.length + 2}" class="ib-empty">${(d.items || []).length ? __("Nothing matches.") : __("The In Bags pool is empty — no material issued to cards yet.")}</td></tr>`;
	}

	function load() {
		frappe.call({ method: API + ".get_in_bags_matrix" }).then((r) => {
			S.d = r.message || {};
			render();
		});
	}
	root.querySelector(".ib-search").addEventListener("input", frappe.utils.debounce(function () {
		S.term = this.value || "";
		render();
	}, 200));
	$(page.main).find(".ib-pill").on("click", function () {
		$(page.main).find(".ib-pill").removeClass("on");
		this.classList.add("on");
		S.mode = this.getAttribute("data-m");
		render();
	});
	page.add_inner_button(__("Refresh"), load);
	load();
};
