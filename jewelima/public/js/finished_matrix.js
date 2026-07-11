// Shared engine for the finished-pool matrix pages (Finished Stock / At
// Certification): rows = DESIGN TYPES, columns = holders (held_by), cells =
// piece counts with weights + card barcodes in the tooltip. One builder, two
// thin page wrappers — same pattern as jewelima.buildOrderPage.

frappe.provide("jewelima");

jewelima.buildFinishedMatrix = function (wrapper, OPTS) {
	// OPTS = { title, status ("In Stock" | "At Certification"), hint, empty }
	const page = frappe.ui.make_app_page({ parent: wrapper, title: OPTS.title, single_column: true });
	const S = { d: null, term: "" };
	const esc = frappe.utils.escape_html;
	const fmt = (v) => flt(v).toFixed(3);

	$(page.main).append(`
		<style>
		.fm-cards{display:flex;gap:12px;flex-wrap:wrap;margin:2px 0 12px;}
		.fm-card{border:1px solid var(--border-color);border-radius:8px;background:var(--fg-color);padding:10px 16px;min-width:150px;}
		.fm-card .lb{font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;}
		.fm-card .v{font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;}
		.fm-card.gold{box-shadow:inset 3px 0 0 #b8860b;}
		.fm-card.stone{box-shadow:inset 3px 0 0 #1c5da8;}
		.fm-top{display:flex;align-items:center;gap:10px;margin:0 0 10px;flex-wrap:wrap;}
		.fm-search{width:260px;border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);padding:4px 10px;height:30px;border-radius:5px;box-sizing:border-box;color:var(--text-color);font-size:13px;}
		.fm-count{color:var(--text-muted);font-size:12px;margin-left:auto;}
		.fm-box{border:1px solid var(--border-color);border-radius:8px;overflow:auto;max-height:calc(100vh - 250px);background:var(--fg-color);}
		table.fm-tbl{border-collapse:separate;border-spacing:0;font-size:12.5px;min-width:100%;}
		table.fm-tbl th{position:sticky;top:0;z-index:2;background:var(--control-bg,var(--fg-color));border-bottom:2px solid var(--gray-400,#aeb6bf);padding:6px 10px;text-align:right;white-space:nowrap;font-weight:700;vertical-align:bottom;}
		table.fm-tbl th:first-child{left:0;z-index:3;text-align:left;}
		table.fm-tbl td:first-child{position:sticky;left:0;background:var(--fg-color);text-align:left;z-index:1;border-right:1px solid var(--border-color);}
		table.fm-tbl tr:hover td{filter:brightness(.97);}
		table.fm-tbl td{border-bottom:1px solid var(--border-color);padding:5px 10px;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}
		table.fm-tbl td.tot,table.fm-tbl th.tot{font-weight:800;border-left:2px solid var(--gray-400,#aeb6bf);}
		.fm-holder{font-weight:800;}
		.fm-holder-sub{font-size:10.5px;color:var(--text-muted);font-weight:400;}
		.fm-name{font-weight:700;}
		.fm-sub{display:block;font-size:10.5px;color:var(--text-muted);font-weight:400;}
		td.fm-cell{background:rgba(29,122,51,var(--a,0));cursor:default;}
		td.fm-cell.cert{background:rgba(154,103,0,var(--a,0));}
		.fm-pc{font-weight:700;}
		.fm-unit{color:var(--text-muted);font-size:10px;margin-left:2px;}
		.fm-wt{display:block;font-size:10px;color:var(--text-muted);}
		.fm-empty{padding:18px;text-align:center;color:var(--text-muted);}
		.fm-hint{margin:10px 2px 0;color:var(--text-muted);font-size:12px;}
		</style>
		<div class="fm-cards"></div>
		<div class="fm-top">
			<input class="fm-search" type="text" placeholder="${__("Search design types…")}">
			<span class="fm-count"></span>
		</div>
		<div class="fm-box"><table class="fm-tbl"><thead class="fm-head"></thead><tbody class="fm-body"></tbody></table></div>
		<div class="fm-hint">${esc(OPTS.hint)}</div>
	`);

	const root = $(page.main)[0];
	const cellCls = OPTS.status === "At Certification" ? "fm-cell cert" : "fm-cell";

	function render() {
		const d = S.d || {};
		const t = d.totals || {};
		root.querySelector(".fm-cards").innerHTML = `
			<div class="fm-card"><div class="lb">${__("Pieces")}</div><div class="v">${t.pieces || 0}</div></div>
			<div class="fm-card"><div class="lb">${__("Design Types")}</div><div class="v">${t.types || 0}</div></div>
			<div class="fm-card"><div class="lb">${__("Holders")}</div><div class="v">${t.holders || 0}</div></div>
			<div class="fm-card gold"><div class="lb">${__("Gold in pieces")}</div><div class="v">${fmt(t.gold || 0)} g</div></div>
			<div class="fm-card stone"><div class="lb">${__("Stones in pieces")}</div><div class="v">${fmt(t.stones || 0)} ct</div></div>`;

		const term = S.term.toLowerCase().trim();
		const rows = (d.types || []).filter((r) => !term || r.design_type.toLowerCase().includes(term));
		const locs = d.locations || [];
		root.querySelector(".fm-count").textContent = __("{0} type(s)", [rows.length]);

		root.querySelector(".fm-head").innerHTML = `<tr>
			<th>${__("Design Type")}</th>
			${locs.map((l) => `<th><span class="fm-holder">${esc(l.label)}</span><br>
				<span class="fm-holder-sub">${l.cards} ${__("pc")} · ${fmt(l.gold)} g · ${fmt(l.stones)} ct</span></th>`).join("")}
			<th class="tot">${__("Total")}</th>
		</tr>`;

		const body = root.querySelector(".fm-body");
		body.innerHTML = rows.length
			? rows.map((r) => {
				const max = Math.max(...Object.values(r.cells).map((c) => c.pc), 1);
				return `<tr>
					<td><span class="fm-name">${esc(r.design_type)}</span>
						<span class="fm-sub">${fmt(r.gold)} g · ${fmt(r.stones)} ct</span></td>
					${locs.map((l) => {
						const c = r.cells[l.location];
						if (!c) return `<td>·</td>`;
						const a = (0.10 + 0.32 * (c.pc / max)).toFixed(2);
						const tip = `${c.pc} ${__("piece(s)")} · ${fmt(c.gold)} g · ${fmt(c.stones)} ct\n${(c.bags || []).join(" · ")}`;
						return `<td class="${cellCls}" style="--a:${a}" title="${esc(tip)}">
							<span class="fm-pc">${c.pc}</span><span class="fm-unit">pc</span>
							<span class="fm-wt">${fmt(c.gold)} g · ${fmt(c.stones)} ct</span></td>`;
					}).join("")}
					<td class="tot">${r.pieces}<span class="fm-unit">pc</span></td>
				</tr>`;
			}).join("")
			: `<tr><td colspan="${locs.length + 2}" class="fm-empty">${(d.types || []).length ? __("Nothing matches.") : esc(OPTS.empty)}</td></tr>`;
	}

	function load() {
		frappe.call({ method: "jewelima.jewelima.api.get_finished_stock_matrix", args: { status: OPTS.status } })
			.then((r) => {
				S.d = r.message || {};
				render();
			});
	}
	root.querySelector(".fm-search").addEventListener("input", frappe.utils.debounce(function () {
		S.term = this.value || "";
		render();
	}, 200));
	page.add_inner_button(__("Refresh"), load);
	load();
};
