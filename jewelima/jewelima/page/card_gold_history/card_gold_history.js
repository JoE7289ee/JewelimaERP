// Card Gold History (Stock > Card Gold > History) — every gram put onto a card
// or taken back off it by hand, and who did it. Read-only record.
// Route: /app/card-gold-history
frappe.pages["card-gold-history"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Card Gold History"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const S = { period: "month", kind: "", q: "", data: null };

	$(page.main).append(`
		<style>
		#page-card-gold-history .container{max-width:100%;}
		.gh-wrap{max-width:1180px;}
		.gh-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px;}
		.gh-pill,.gh-kind{border:1px solid var(--border-color);background:var(--fg-color);color:var(--text-muted);
			border-radius:999px;padding:5px 14px;font-size:12px;cursor:pointer;font-weight:600;}
		.gh-pill.on,.gh-kind.on{background:#1f618d;border-color:#1f618d;color:#fff;}
		.gh-q{width:230px;border:1px solid var(--border-color);border-radius:8px;height:31px;padding:2px 12px;
			background:var(--fg-color);color:var(--text-color);font-size:12.5px;}
		.gh-tiles{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px;}
		.gh-tile{border:1px solid var(--border-color);border-radius:11px;background:var(--fg-color);
			padding:11px 16px;min-width:132px;}
		.gh-tile .k{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);}
		.gh-tile .v{font-size:21px;font-weight:800;font-variant-numeric:tabular-nums;}
		.gh-tile.add .v{color:#1d7a33;} .gh-tile.red .v{color:#b02a2a;}
		table.gh-t{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.gh-t th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;
			color:var(--text-muted);border-bottom:1px solid var(--border-color);padding:8px;font-weight:700;}
		table.gh-t td{padding:8px;border-bottom:1px solid var(--border-color);vertical-align:top;}
		table.gh-t td.num{text-align:right;font-variant-numeric:tabular-nums;font-weight:700;}
		table.gh-t tr:hover td{background:var(--control-bg);}
		.gh-add{color:#1d7a33;} .gh-red{color:#b02a2a;}
		.gh-card{font-weight:700;cursor:pointer;}
		.gh-card:hover{text-decoration:underline;}
		.gh-sub{color:var(--text-muted);font-size:11.5px;}
		.gh-none{padding:34px;text-align:center;color:var(--text-muted);}
		</style>
		<div class="gh-wrap">
			<div class="gh-bar">
				<span class="gh-pill" data-p="today">${__("Today")}</span>
				<span class="gh-pill" data-p="week">${__("7 days")}</span>
				<span class="gh-pill on" data-p="month">${__("30 days")}</span>
				<span class="gh-pill" data-p="year">${__("12 months")}</span>
				<span class="gh-pill" data-p="all">${__("All")}</span>
				<span style="width:12px;"></span>
				<span class="gh-kind on" data-k="">${__("Both")}</span>
				<span class="gh-kind" data-k="Added">${__("Added")}</span>
				<span class="gh-kind" data-k="Reduced">${__("Reduced")}</span>
				<input class="gh-q" placeholder="${__("Filter card, design or gold")}">
				<span class="gh-sub gh-when"></span>
			</div>
			<div class="gh-tiles"></div>
			<div class="gh-list"></div>
		</div>`);
	const root = $(page.main);

	function paint() {
		const d = S.data || { rows: [], totals: {} };
		const t = d.totals || {};
		root.find(".gh-when").text(d.label || "");
		root.find(".gh-tiles").html(`
			<div class="gh-tile add"><div class="k">${__("Added")}</div><div class="v">${(t.added || 0).toFixed(3)}<span style="font-size:11px;"> g</span></div></div>
			<div class="gh-tile red"><div class="k">${__("Reduced")}</div><div class="v">${(t.reduced || 0).toFixed(3)}<span style="font-size:11px;"> g</span></div></div>
			<div class="gh-tile"><div class="k">${__("Net")}</div><div class="v">${(t.net || 0).toFixed(3)}<span style="font-size:11px;"> g</span></div></div>
			<div class="gh-tile"><div class="k">${__("Moves")}</div><div class="v">${t.moves || 0}</div></div>
			<div class="gh-tile"><div class="k">${__("Cards")}</div><div class="v">${t.cards || 0}</div></div>`);

		const q = S.q.trim().toLowerCase();
		const rows = (d.rows || []).filter((r) => !q
			|| r.order_bag.toLowerCase().includes(q)
			|| (r.design || "").toLowerCase().includes(q)
			|| (r.item_name || r.item || "").toLowerCase().includes(q));
		root.find(".gh-list").html(rows.length ? `
			<table class="gh-t"><thead><tr>
				<th>${__("When")}</th><th>${__("Card")}</th><th>${__("What")}</th>
				<th class="num">${__("Weight")}</th><th>${__("Gold")}</th><th>${__("By")}</th>
			</tr></thead><tbody>${rows.map((r) => `
				<tr>
					<td>${esc(r.when)}</td>
					<td><span class="gh-card" data-c="${esc(r.order_bag)}">${esc(r.order_bag)}</span>
						<div class="gh-sub">${esc(r.design || "")}${r.location ? " · " + esc(r.location) : ""}</div></td>
					<td class="${r.kind === "Added" ? "gh-add" : "gh-red"}"><b>${esc(r.kind)}</b></td>
					<td class="num ${r.kind === "Added" ? "gh-add" : "gh-red"}">${
						r.kind === "Added" ? "+" : "−"}${r.qty.toFixed(3)} g</td>
					<td>${esc(r.item_name || r.item)}</td>
					<td>${esc(r.who || "")}${r.note ? `<div class="gh-sub">${esc(r.note)}</div>` : ""}</td>
				</tr>`).join("")}</tbody></table>`
			: `<div class="gh-none">${__("Nothing added or reduced in this window.")}</div>`);
	}

	function load() {
		frappe.call({ method: API + ".get_card_gold_history", freeze: false,
			args: { period: S.period, kind: S.kind || null } })
			.then((r) => { S.data = r.message || null; paint(); });
	}
	root.on("click", ".gh-pill", function () {
		root.find(".gh-pill").removeClass("on"); this.classList.add("on");
		S.period = this.dataset.p; load();
	});
	root.on("click", ".gh-kind", function () {
		root.find(".gh-kind").removeClass("on"); this.classList.add("on");
		S.kind = this.dataset.k; load();
	});
	root.on("input", ".gh-q", function () { S.q = this.value; paint(); });
	root.on("click", ".gh-card", function () {
		frappe.set_route("card-info", { card: $(this).data("c") });
	});
	page.add_inner_button(__("Add / reduce"), () => frappe.set_route("card-gold"));
	frappe.pages["card-gold-history"].on_page_show = load;
	load();
};
