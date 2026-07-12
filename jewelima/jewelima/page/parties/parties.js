// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Parties (Setup > Party) — review the imported parties and put groups on top
// of them: tick parties, type/pick a group, Assign. "Party" is our word for
// the Customer master; the import default (Individual) counts as ungrouped.
// Route: /app/parties

frappe.pages["parties"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Parties", single_column: true });
	const API = "jewelima.jewelima.api";
	const S = { parties: [], groups: [], sel: new Set(), term: "", pill: "" };
	const esc = frappe.utils.escape_html;

	$(page.main).append(`
		<style>
		.pt-top{display:flex;align-items:flex-end;gap:10px;margin:2px 0 8px;flex-wrap:wrap;}
		.pt-top .frappe-control{margin:0;}
		.pt-top .control-label{font-size:11px;margin:0 0 1px;color:var(--text-muted);}
		.pt-top .help-box,.pt-top .description{display:none !important;}
		.pt-group{width:250px;}
		.pt-search{width:230px;border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);padding:4px 10px;height:30px;border-radius:5px;box-sizing:border-box;color:var(--text-color);font-size:13px;}
		.pt-pills{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 8px;}
		.pt-pill{border:1px solid var(--border-color);background:var(--fg-color);border-radius:14px;padding:2px 12px;font-size:12px;cursor:pointer;}
		.pt-pill.on{background:var(--primary);color:#fff;border-color:var(--primary);font-weight:600;}
		.pt-box{border:1px solid var(--border-color);border-radius:8px;background:var(--fg-color);overflow:auto;max-height:calc(100vh - 240px);}
		table.pt-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:12.5px;}
		table.pt-tbl th{position:sticky;top:0;z-index:1;background:var(--control-bg,var(--fg-color));border-bottom:1px solid var(--gray-400,#aeb6bf);padding:4px 8px;text-align:left;white-space:nowrap;font-weight:700;}
		table.pt-tbl td{border-bottom:1px solid var(--border-color);padding:4px 8px;white-space:nowrap;}
		table.pt-tbl tr{cursor:pointer;}
		table.pt-tbl tr.on td{background:#eaf6ec;}
		.pt-name{font-weight:700;}
		.pt-grp{display:inline-block;border-radius:9px;padding:1px 9px;font-size:10.5px;font-weight:700;background:#e7f0fb;color:#1c5da8;}
		.pt-grp.none{background:var(--control-bg);color:var(--text-muted);font-weight:600;}
		.pt-foot{padding:6px 2px;color:var(--text-muted);font-size:12px;display:flex;gap:14px;}
		.pt-empty{padding:22px;text-align:center;color:var(--text-muted);}
		</style>
		<div class="pt-top">
			<input class="pt-search" type="text" placeholder="${__("Search parties…")}">
			<div class="pt-group"></div>
			<button class="btn btn-primary btn-sm pt-assign">${__("Assign Group to Selected")}</button>
			<span style="margin-left:auto;color:var(--text-muted);font-size:12px;"><b class="pt-selcount">0</b> ${__("selected")}</span>
		</div>
		<div class="pt-pills"></div>
		<div class="pt-box"><table class="pt-tbl">
			<thead><tr><th style="width:26px"><input type="checkbox" class="pt-all"></th>
			<th>${__("Party")}</th><th>${__("Group")}</th></tr></thead>
			<tbody class="pt-rows"></tbody></table></div>
		<div class="pt-foot"><span class="pt-count"></span><span>${__("Individual = not grouped yet. Type a NEW group name in the box to create it on the fly.")}</span></div>
	`);
	const root = $(page.main)[0];

	const group = frappe.ui.form.make_control({
		df: { fieldtype: "Data", label: __("Group"), fieldname: "group", placeholder: __("e.g. JOS / JOY / BHIMA…") },
		parent: $(root).find(".pt-group").get(0), render_input: true,
	});
	group.refresh();

	function visible() {
		const t = S.term.toLowerCase().trim();
		return S.parties.filter((p) =>
			(!S.pill || (S.pill === "__none" ? (!p.customer_group || p.customer_group === "Individual") : p.customer_group === S.pill)) &&
			(!t || p.name.toLowerCase().includes(t)));
	}

	function paint() {
		const rows = visible();
		$(root).find(".pt-rows").html(rows.length ? rows.map((p) => {
			const none = !p.customer_group || p.customer_group === "Individual";
			return `<tr data-name="${esc(p.name)}" class="${S.sel.has(p.name) ? "on" : ""}">
				<td><input type="checkbox" ${S.sel.has(p.name) ? "checked" : ""}></td>
				<td><span class="pt-name">${esc(p.name)}</span></td>
				<td><span class="pt-grp ${none ? "none" : ""}">${esc(none ? __("— ungrouped") : p.customer_group)}</span></td>
			</tr>`;
		}).join("") : `<tr><td colspan="3" class="pt-empty">${__("No parties match.")}</td></tr>`);
		const ungrouped = S.parties.filter((p) => !p.customer_group || p.customer_group === "Individual").length;
		$(root).find(".pt-count").html(__("{0} parties · {1} ungrouped", [S.parties.length, ungrouped]));
		$(root).find(".pt-selcount").text(S.sel.size);
		$(root).find(".pt-pills").html(
			[["", __("All")], ["__none", __("Ungrouped")]].concat(S.groups.map((g) => [g, g]))
				.map(([k, lb]) => `<span class="pt-pill${k === S.pill ? " on" : ""}" data-p="${esc(k)}">${esc(lb)}</span>`).join(""));
	}

	function load() {
		frappe.call({ method: API + ".get_parties" }).then((r) => {
			const m = r.message || {};
			S.parties = m.parties || [];
			S.groups = m.groups || [];
			S.sel = new Set([...S.sel].filter((n) => S.parties.some((p) => p.name === n)));
			paint();
		});
	}

	$(root).find(".pt-search").on("input", frappe.utils.debounce(function () {
		S.term = this.value || "";
		paint();
	}, 200));
	$(root).on("click", ".pt-pill", function () {
		S.pill = this.getAttribute("data-p") || "";
		paint();
	});
	$(root).on("click", ".pt-rows tr[data-name]", function () {
		const nm = this.getAttribute("data-name");
		if (S.sel.has(nm)) S.sel.delete(nm);
		else S.sel.add(nm);
		paint();
	});
	$(root).on("click", ".pt-all", function (e) {
		e.stopPropagation();
		const vis = visible();
		if (this.checked) vis.forEach((p) => S.sel.add(p.name));
		else vis.forEach((p) => S.sel.delete(p.name));
		paint();
	});
	$(root).find(".pt-assign").on("click", () => {
		const g = (group.get_value() || "").trim();
		if (!S.sel.size) {
			frappe.show_alert({ message: __("Tick at least one party."), indicator: "orange" }, 4);
			return;
		}
		if (!g) {
			frappe.show_alert({ message: __("Type the group name."), indicator: "orange" }, 4);
			return;
		}
		frappe.confirm(__("Put {0} part(y/ies) under <b>{1}</b>?", [S.sel.size, esc(g)]), () => {
			frappe.dom.freeze(__("Assigning..."));
			frappe.call({ method: API + ".set_party_group", args: { names: [...S.sel], group: g } })
				.then((r) => {
					frappe.dom.unfreeze();
					frappe.show_alert({ message: __("{0} part(y/ies) → {1}.", [(r.message || {}).count, esc(g)]), indicator: "green" }, 5);
					S.sel.clear();
					load();
				}).catch(() => frappe.dom.unfreeze());
		});
	});
	page.add_inner_button(__("Refresh"), load);
	load();
};
