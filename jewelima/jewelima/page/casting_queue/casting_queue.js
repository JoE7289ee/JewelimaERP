// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Casting (Manufacturing) — the caster's bench. LEFT: trees in queue (cast=0,
// cards at CASTING) with weigh progress and a plannable Casting Date. RIGHT:
// what the Casting warehouse currently holds (rule 1: casting gold lives
// there). "Weight Add" (top) opens the scan-and-weigh page; each tree row's
// Weigh jumps straight there with the tree loaded. Route: /app/casting-queue

frappe.pages["casting-queue"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Casting", single_column: true });
	const API = "jewelima.jewelima.api";

	$(page.main).append(`
		<style>
		#page-casting-queue .container{max-width:100%;}
		.cq-h{font-weight:700;margin:16px 2px 6px;}
		.cq-h:first-child{margin-top:2px;}
		.cq-box{border:1px solid var(--border-color);border-radius:11px;overflow:auto;background:var(--fg-color);}
		.cq-stockbox{max-width:560px;}
		table.cq-tbl{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.cq-tbl th{position:sticky;top:0;z-index:1;background:var(--control-bg,var(--fg-color));border-bottom:2px solid var(--gray-400,#aeb6bf);padding:6px 10px;text-align:right;white-space:nowrap;font-weight:700;}
		table.cq-tbl td{border-bottom:1px solid var(--border-color);padding:6px 10px;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}
		table.cq-tbl th.l,table.cq-tbl td.l{text-align:left;}
		table.cq-tbl th.c,table.cq-tbl td.c{text-align:center;}
		table.cq-tbl tr:hover td{background:var(--control-bg);}
		.cq-prog{border-radius:10px;padding:1px 9px;font-size:11px;font-weight:700;}
		.cq-prog.none{background:var(--control-bg);color:var(--text-muted);}
		.cq-prog.some{background:#fdf3d8;color:#8a6d1a;}
		.cq-prog.all{background:#e6f4ea;color:#2e7d32;}
		.cq-tree{font-weight:800;color:#1f618d;cursor:pointer;}
		.cq-datecell{color:#1f618d;cursor:pointer;font-weight:600;}
		.cq-datecell.unset{color:var(--text-muted);font-weight:400;}
		.cq-empty{padding:18px;text-align:center;color:var(--text-muted);}
		.cqd-quick{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;}
		.cqd-quick button{border:1px solid var(--border-color);background:var(--control-bg);border-radius:8px;padding:8px 15px;font-weight:700;font-size:13px;cursor:pointer;}
		.cqd-quick button:hover{border-color:#1f618d;color:#1f618d;}
		table.cqt{width:100%;border-collapse:collapse;font-size:13px;}
		table.cqt th{background:var(--control-bg);border-bottom:2px solid var(--gray-400,#aeb6bf);padding:6px 9px;text-align:left;font-weight:700;cursor:pointer;user-select:none;white-space:nowrap;position:sticky;top:0;}
		table.cqt th.num{text-align:right;}
		table.cqt td{border-bottom:1px solid var(--border-color);padding:5px 9px;}
		table.cqt td.num{text-align:right;font-variant-numeric:tabular-nums;}
		table.cqt input.cqf{width:100%;box-sizing:border-box;height:24px;font-size:11px;font-weight:400;border:1px solid var(--border-color);border-radius:4px;padding:1px 6px;background:var(--fg-color);color:var(--text-color);}
		</style>
		<div class="cq-wrap">
			<div class="cq-h">${__("Trees in queue")}</div>
			<div class="cq-box"><table class="cq-tbl"><thead><tr>
				<th class="l">${__("Tree")}</th><th class="l">${__("Gold")}</th><th class="c">${__("Cards")}</th>
				<th>${__("Wax (g)")}</th><th>${__("Gold Req (g)")}</th>
				<th class="l">${__("Casting Date")}</th><th class="l">${__("Made By")}</th><th></th>
			</tr></thead><tbody class="cq-body"></tbody></table></div>

			<div class="cq-h">${__("Stock at")} <span class="cq-wh"></span></div>
			<div class="cq-box cq-stockbox"><table class="cq-tbl"><thead><tr>
				<th class="l">${__("Item")}</th><th>${__("Purity %")}</th><th>${__("Qty (g)")}</th>
			</tr></thead><tbody class="cq-stock"></tbody></table></div>
		</div>
	`);

	const root = $(page.main)[0];
	const esc = frappe.utils.escape_html;
	const fmt = (v) => (v ? flt(v).toFixed(3) : "—");

	function render(d) {
		root.querySelector(".cq-wh").textContent = (d.casting_warehouse || "").replace(/ - [A-Za-z]+$/, "");
		const body = root.querySelector(".cq-body");
		body.innerHTML = (d.trees || []).length
			? d.trees.map((t) => {
				const cls = !t.weighted ? "none" : t.weighted < t.cards ? "some" : "all";
				return `<tr>
					<td class="l"><a class="cq-tree" data-tree="${esc(t.tree)}"><b>${esc(t.tree)}</b></a></td>
					<td class="l">${esc(t.karat)}</td>
					<td class="c"><span class="cq-prog ${cls}">${t.weighted}/${t.cards}</span></td>
					<td>${fmt(t.wax_weight)}</td>
					<td><b>${fmt(t.gold_required)}</b></td>
					<td class="l"><a class="cq-datecell ${t.casting_date ? "" : "unset"}" data-tree="${esc(t.tree)}" data-date="${esc(t.casting_date || "")}">${t.casting_date ? frappe.datetime.str_to_user(t.casting_date) : "＋ " + __("set date")}</a></td>
					<td class="l">${esc(t.employee)}</td>
					<td><button class="btn btn-primary btn-xs cq-weigh" data-tree="${esc(t.tree)}">${__("Weigh")}</button></td>
				</tr>`;
			}).join("")
			: `<tr><td colspan="8" class="cq-empty">${__("No trees waiting — make trees on the Tree Making board.")}</td></tr>`;

		body.querySelectorAll(".cq-tree").forEach((el) =>
			el.addEventListener("click", () => showTreeCards(el.getAttribute("data-tree"))));
		body.querySelectorAll(".cq-datecell").forEach((el) =>
			el.addEventListener("click", () => openDatePicker(el.getAttribute("data-tree"), el.getAttribute("data-date"))));
		body.querySelectorAll(".cq-weigh").forEach((el) =>
			el.addEventListener("click", function () {
				frappe.route_options = { cast_tree: this.getAttribute("data-tree") };
				frappe.set_route("casting-weigh");
			})
		);

		root.querySelector(".cq-stock").innerHTML = (d.stock || []).length
			? d.stock.map((s) => `<tr>
					<td><b>${esc(s.item)}</b></td>
					<td>${s.purity ? flt(s.purity).toFixed(1) + "%" : "—"}</td>
					<td>${fmt(s.qty)}</td>
				</tr>`).join("")
			: `<tr><td colspan="3" class="cq-empty">${__("Nothing in the Casting warehouse — melt & send first.")}</td></tr>`;
	}

	// click a tree -> read-only dialog of its cards, sortable + filterable
	function showTreeCards(tree) {
		frappe.call({ method: API + ".get_tree_edit", args: { tree } }).then((r) => {
			const d = r.message || {};
			const cols = [
				{ k: "order_bag", label: __("Card") },
				{ k: "design", label: __("Design") },
				{ k: "qty", label: __("Qty"), num: true },
				{ k: "location", label: __("Location") },
				{ k: "cast_gold", label: __("Cast gold"), num: true },
			];
			const F = { raw: d.cards || [], sortKey: null, sortDir: 1, filters: {} };
			const disp = (c, r) => (c.num ? (flt(r[c.k]) ? flt(r[c.k]).toFixed(c.k === "cast_gold" ? 3 : 0) : "") : (r[c.k] != null ? String(r[c.k]) : ""));
			const dlg = new frappe.ui.Dialog({ title: __("{0} — {1} piece(s)", [d.tree_no || tree, (d.cards || []).length]), size: "large" });
			function rows() {
				let rs = F.raw.slice();
				cols.forEach((c) => { const q = (F.filters[c.k] || "").trim().toLowerCase(); if (q) rs = rs.filter((r) => disp(c, r).toLowerCase().indexOf(q) !== -1); });
				if (F.sortKey) { const c = cols.find((x) => x.k === F.sortKey); rs.sort((a, b) => { let va, vb; if (c.num) { va = flt(a[c.k]); vb = flt(b[c.k]); } else { va = disp(c, a).toLowerCase(); vb = disp(c, b).toLowerCase(); } return (va < vb ? -1 : va > vb ? 1 : 0) * F.sortDir; }); }
				return rs;
			}
			function paint() {
				const rs = rows();
				$(dlg.body).find(".cqt-count").text(__("{0} of {1}", [rs.length, F.raw.length]));
				$(dlg.body).find(".cqt-body").html(rs.length ? rs.map((r) => `<tr>
					<td><a class="jw-card-link" style="font-weight:800;color:#1f618d;cursor:pointer;" data-card="${esc(r.order_bag)}">${esc(r.order_bag)}</a></td>
					<td>${esc(r.design || "")}</td>
					<td class="num">${r.qty != null ? r.qty : ""}</td>
					<td>${esc(r.location || "")}</td>
					<td class="num">${r.cast_gold ? flt(r.cast_gold).toFixed(3) + " g" : ""}</td>
				</tr>`).join("") : `<tr><td colspan="5" style="text-align:center;padding:18px;color:var(--text-muted);">${__("Nothing matches.")}</td></tr>`);
				$(dlg.body).find(".cqt-sort .ar").text("");
				if (F.sortKey) $(dlg.body).find('.cqt-sort[data-k="' + F.sortKey + '"] .ar').text(F.sortDir > 0 ? " ▲" : " ▼");
			}
			$(dlg.body).html(`
				<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">${esc(d.karat || "")}${d.wax_weight ? " · " + flt(d.wax_weight).toFixed(3) + " g wax" : ""}${d.gold_required ? " · " + __("gold req {0} g", [flt(d.gold_required).toFixed(3)]) : ""}<span class="cqt-count" style="float:right;"></span></div>
				<div style="border:1px solid var(--border-color);border-radius:10px;overflow:auto;max-height:60vh;">
				<table class="cqt"><thead>
					<tr>${cols.map((c) => `<th class="cqt-sort ${c.num ? "num" : ""}" data-k="${c.k}" title="${__("Sort")}">${esc(c.label)}<span class="ar"></span></th>`).join("")}</tr>
					<tr>${cols.map((c) => `<th style="padding:3px 5px;"><input class="cqf" data-k="${c.k}" placeholder="${__("filter")}"></th>`).join("")}</tr>
				</thead><tbody class="cqt-body"></tbody></table></div>`);
			$(dlg.body).on("input", ".cqf", function () { F.filters[this.dataset.k] = this.value || ""; paint(); });
			$(dlg.body).on("click", ".cqt-sort", function () { const k = this.getAttribute("data-k"); if (F.sortKey === k) F.sortDir = -F.sortDir; else { F.sortKey = k; F.sortDir = 1; } paint(); });
			paint();
			dlg.show();
		});
	}

	// click the casting date -> quick Today / Tomorrow / Day After + a no-past calendar
	function openDatePicker(tree, current) {
		const today = frappe.datetime.get_today();
		const add = (n) => frappe.datetime.add_days(today, n);
		const dlg = new frappe.ui.Dialog({ title: __("Plan casting date — {0}", [tree]) });
		$(dlg.body).html(`
			<div class="cqd-quick">
				<button data-d="${today}">${__("Today")}</button>
				<button data-d="${add(1)}">${__("Tomorrow")}</button>
				<button data-d="${add(2)}">${__("Day After Tomorrow")}</button>
			</div>
			<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
				<label style="font-size:12.5px;color:var(--text-muted);display:flex;align-items:center;gap:6px;margin:0;">${__("Or pick a date")}
					<input type="date" class="cqd-cal" min="${today}" value="${esc(current || "")}" style="border:1px solid var(--border-color);border-radius:6px;height:30px;padding:2px 8px;background:var(--fg-color);color:var(--text-color);"></label>
				${current ? `<button class="btn btn-xs btn-default cqd-clear" style="color:#b02a2a;">${__("Clear date")}</button>` : ""}
			</div>`);
		const save = (date) => frappe.call({ method: API + ".set_tree_casting_date", args: { tree, date: date || "" } })
			.then(() => { dlg.hide(); frappe.show_alert({ message: date ? __("Casting date set.") : __("Casting date cleared."), indicator: "green" }, 3); load(); });
		$(dlg.body).on("click", ".cqd-quick button", function () { save(this.getAttribute("data-d")); });
		$(dlg.body).on("change", ".cqd-cal", function () { if (this.value && this.value < today) { frappe.msgprint(__("No past dates allowed.")); this.value = ""; return; } save(this.value); });
		$(dlg.body).on("click", ".cqd-clear", () => save(""));
		dlg.show();
	}

	function load() {
		frappe.call({ method: API + ".get_casting_queue" }).then((r) => render(r.message || {}));
	}
	page.add_inner_button(__("Weight Add"), () => frappe.set_route("casting-weigh"));
	page.add_inner_button(__("Refresh"), load);
	frappe.pages["casting-queue"].on_page_show = load;     // covers the first show too
};
