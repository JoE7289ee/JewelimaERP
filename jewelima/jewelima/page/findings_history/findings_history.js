// Findings History (Stock > Findings) — every finding that left the shelf: what
// it was, what it became, where it went, and who sent it.
// Route: /app/findings-history
frappe.pages["findings-history"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Findings History"), single_column: true });
	const esc = frappe.utils.escape_html;
	const S = { period: "month", q: "", rows: [] };

	$(page.main).append(`
		<style>
		#page-findings-history .container{max-width:100%;}
		.fh-top{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px;}
		.fh-pill{border:1px solid var(--border-color);background:var(--fg-color);border-radius:14px;
			padding:4px 15px;font-size:12.5px;cursor:pointer;color:var(--text-muted);}
		.fh-pill.on{background:var(--btn-primary,#171717);border-color:var(--btn-primary,#171717);color:#fff;font-weight:700;}
		.fh-q{width:200px;border:1px solid var(--border-color);border-radius:8px;height:31px;padding:2px 12px;
			background:var(--fg-color);color:var(--text-color);font-size:12.5px;}
		.fh-when{margin-left:auto;font-size:12px;color:var(--text-muted);}
		.fh-tiles{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;}
		.fh-tile{border:1px solid var(--border-color);border-radius:11px;padding:8px 18px;background:var(--fg-color);min-width:120px;}
		.fh-tile .k{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;}
		.fh-tile .v{font-size:19px;font-weight:800;}
		.fh-box{border:1px solid var(--border-color);border-radius:12px;overflow:auto;background:var(--fg-color);max-height:calc(100vh - 260px);}
		table.fh-t{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.fh-t th{position:sticky;top:0;background:var(--control-bg);font-size:10px;text-transform:uppercase;
			color:var(--text-muted);padding:7px 10px;text-align:left;border-bottom:2px solid var(--border-color);}
		table.fh-t td{padding:6px 10px;border-bottom:1px solid var(--border-color);}
		table.fh-t td.num{text-align:right;font-variant-numeric:tabular-nums;}
		.fh-k{border-radius:9px;padding:1px 9px;font-size:10px;font-weight:800;}
		.fh-k.Card{background:#eef5fa;color:#1f618d;}
		.fh-k.Location{background:#f3eefa;color:#5b3d8f;}
		.fh-gold{font-weight:700;color:#8a6d00;}
		.fh-sub{font-size:10.5px;color:var(--text-muted);}
		.fh-none{padding:36px;text-align:center;color:var(--text-muted);}
		</style>
		<div class="fh-top">
			<span class="fh-pill" data-p="today">${__("Today")}</span>
			<span class="fh-pill" data-p="week">${__("This week")}</span>
			<span class="fh-pill on" data-p="month">${__("This month")}</span>
			<span class="fh-pill" data-p="year">${__("This year")}</span>
			<span class="fh-pill" data-p="all">${__("All")}</span>
			<input type="text" class="fh-q" placeholder="${__("search finding / card…")}">
			<span class="fh-when"></span>
		</div>
		<div class="fh-tiles"></div>
		<div class="fh-box"><table class="fh-t"><thead><tr>
			<th>${__("When")}</th><th>${__("Finding")}</th><th class="num">${__("Pcs")}</th>
			<th class="num">${__("Weight (g)")}</th><th>${__("Became")}</th><th>${__("Went to")}</th><th>${__("By")}</th>
		</tr></thead><tbody class="fh-body"></tbody></table></div>`);
	const root = $(page.main);

	function paint() {
		const q = S.q.trim().toLowerCase();
		const rows = S.rows.filter((r) => !q || (r.item + " " + r.to + " " + r.gold_item).toLowerCase().includes(q));
		root.find(".fh-body").html(rows.map((r) => `
			<tr>
				<td>${esc(r.when)}</td>
				<td><b>${esc(r.item)}</b><div class="fh-sub">${esc(r.item_name)}</div></td>
				<td class="num">${r.pcs || ""}</td>
				<td class="num">${r.weight.toFixed(3)}</td>
				<td class="fh-gold">${esc(r.gold_item)}</td>
				<td><span class="fh-k ${esc(r.target_type)}">${esc(r.target_type)}</span> ${esc(r.to)}
					${r.remarks ? `<div class="fh-sub">${esc(r.remarks)}</div>` : ""}</td>
				<td>${esc(r.who)}</td>
			</tr>`).join("") || `<tr><td colspan="7" class="fh-none">${__("Nothing issued in this window.")}</td></tr>`);
	}
	function load() {
		frappe.call({ method: "jewelima.jewelima.api.get_finding_issues", freeze: false,
			args: { period: S.period } }).then((r) => {
			const m = r.message || {};
			S.rows = m.rows || [];
			const t = m.totals || {};
			root.find(".fh-when").text(m.label || "");
			root.find(".fh-tiles").html(`
				<div class="fh-tile"><div class="k">${__("Issued")}</div><div class="v">${(t.weight || 0).toFixed(3)} g</div></div>
				<div class="fh-tile"><div class="k">${__("Pieces")}</div><div class="v">${t.pcs || 0}</div></div>
				<div class="fh-tile"><div class="k">${__("Issues")}</div><div class="v">${t.issues || 0}</div></div>`);
			paint();
		});
	}
	root.on("click", ".fh-pill", function () {
		root.find(".fh-pill").removeClass("on");
		this.classList.add("on");
		S.period = this.dataset.p;
		load();
	});
	root.find(".fh-q").on("input", frappe.utils.debounce(function () { S.q = this.value || ""; paint(); }, 200));
	page.add_inner_button(__("Issue"), () => frappe.set_route("issue-findings"));
	page.add_inner_button(__("Stock"), () => frappe.set_route("findings-stock"));
	frappe.pages["findings-history"].on_page_show = load;
	load();
};
