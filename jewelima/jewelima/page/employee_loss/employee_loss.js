// Employee Loss (Stock > Loss) — who lost the gold, how much of what they
// handled, and at which bench. One row per person, heaviest loss first; the
// bench chips on each row say where that loss actually happened.
// Route: /app/employee-loss
frappe.pages["employee-loss"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Employee Loss"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const S = { period: "month", bench: "", q: "", data: null };

	$(page.main).append(`
		<style>
		#page-employee-loss .container{max-width:100%;}
		.el-top{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px;}
		.el-pill{border:1px solid var(--border-color);background:var(--fg-color);border-radius:14px;
			padding:4px 15px;font-size:12.5px;cursor:pointer;color:var(--text-muted);}
		.el-pill.on{background:var(--btn-primary,#171717);border-color:var(--btn-primary,#171717);color:#fff;font-weight:700;}
		.el-sel,.el-q{border:1px solid var(--border-color);border-radius:8px;height:31px;padding:2px 10px;
			background:var(--fg-color);color:var(--text-color);font-size:12.5px;}
		.el-q{width:190px;}
		.el-when{margin-left:auto;font-size:12px;color:var(--text-muted);}
		.el-tiles{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;}
		.el-tile{border:1px solid var(--border-color);border-radius:11px;padding:8px 18px;background:var(--fg-color);min-width:120px;}
		.el-tile .k{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;}
		.el-tile .v{font-size:19px;font-weight:800;}
		.el-tile.loss .v{color:#b02a2a;}
		.el-cols{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;}
		.el-main{flex:1 1 640px;min-width:520px;}
		.el-side{flex:0 0 270px;}
		.el-box{border:1px solid var(--border-color);border-radius:12px;overflow:auto;background:var(--fg-color);max-height:calc(100vh - 290px);}
		table.el-t{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.el-t th{position:sticky;top:0;background:var(--control-bg);font-size:10px;text-transform:uppercase;
			color:var(--text-muted);padding:7px 10px;text-align:left;border-bottom:2px solid var(--border-color);white-space:nowrap;}
		table.el-t td{padding:7px 10px;border-bottom:1px solid var(--border-color);vertical-align:top;}
		table.el-t td.num,table.el-t th.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;}
		.el-nm{font-weight:700;}
		.el-sub{font-size:10.5px;color:var(--text-muted);}
		.el-loss{color:#b02a2a;font-weight:800;}
		.el-pct{border-radius:9px;padding:1px 8px;font-size:10.5px;font-weight:800;background:var(--control-bg);}
		.el-pct.hi{background:#fdeaea;color:#b02a2a;}
		.el-pct.mid{background:#fdf3e3;color:#9a6700;}
		.el-pct.low{background:#eaf6ec;color:#1d7a33;}
		.el-chip{display:inline-block;border:1px solid var(--border-color);border-radius:9px;padding:1px 8px;
			font-size:10.5px;margin:0 4px 4px 0;background:var(--control-bg);white-space:nowrap;cursor:pointer;}
		.el-chip:hover{border-color:#1f618d;color:#1f618d;}
		.el-bench{border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);padding:12px 14px;}
		.el-bench .h{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:8px;}
		.el-brow{display:flex;align-items:center;gap:8px;font-size:12px;padding:4px 0;border-bottom:1px solid var(--border-color);cursor:pointer;}
		.el-brow:last-child{border-bottom:none;}
		.el-brow:hover{color:#1f618d;}
		.el-brow .b{flex:1;}
		.el-brow .g{font-weight:800;color:#b02a2a;font-variant-numeric:tabular-nums;}
		.el-bar{height:4px;border-radius:3px;background:#b02a2a22;margin-top:2px;}
		.el-bar i{display:block;height:100%;border-radius:3px;background:#b02a2a;}
		.el-none{padding:40px;text-align:center;color:var(--text-muted);}
		</style>
		<div class="el-top">
			<span class="el-pill" data-p="today">${__("Today")}</span>
			<span class="el-pill" data-p="week">${__("This week")}</span>
			<span class="el-pill on" data-p="month">${__("This month")}</span>
			<span class="el-pill" data-p="year">${__("This year")}</span>
			<span class="el-pill" data-p="all">${__("All")}</span>
			<select class="el-sel el-bench-f"><option value="">${__("Every bench")}</option></select>
			<input type="text" class="el-q" placeholder="${__("search a person…")}">
			<span class="el-when"></span>
		</div>
		<div class="el-tiles"></div>
		<div class="el-cols">
			<div class="el-main">
				<div class="el-box"><table class="el-t"><thead><tr>
					<th>${__("Employee")}</th>
					<th class="num">${__("Gold out (g)")}</th>
					<th class="num">${__("Loss (g)")}</th>
					<th class="num">${__("Loss %")}</th>
					<th>${__("Where the loss happened")}</th>
				</tr></thead><tbody class="el-body"></tbody></table></div>
			</div>
			<div class="el-side"><div class="el-bench"><div class="h">${__("Loss by bench")}</div><div class="el-bl"></div></div></div>
		</div>`);
	const root = $(page.main);
	const f3 = (n) => (n || 0).toFixed(3);

	function pctClass(p) { return p >= 2 ? "hi" : p >= 1 ? "mid" : "low"; }

	function paint() {
		const d = S.data || { rows: [], benches: [], totals: {} };
		const t = d.totals || {};
		root.find(".el-when").text(d.label || "");
		root.find(".el-tiles").html(`
			<div class="el-tile loss"><div class="k">${__("Total loss")}</div><div class="v">${f3(t.loss)} g</div></div>
			<div class="el-tile"><div class="k">${__("Gold handled")}</div><div class="v">${f3(t.gold)} g</div></div>
			<div class="el-tile"><div class="k">${__("Loss %")}</div><div class="v">${(t.loss_pct || 0).toFixed(2)}%</div></div>
			<div class="el-tile"><div class="k">${__("People")}</div><div class="v">${t.people || 0}</div></div>
			<div class="el-tile"><div class="k">${__("Sessions")}</div><div class="v">${t.sessions || 0}</div></div>`);

		const q = S.q.trim().toLowerCase();
		const rows = (d.rows || []).filter((r) => !q || r.name.toLowerCase().includes(q) || r.employee.toLowerCase().includes(q));
		root.find(".el-body").html(rows.map((r) => `
			<tr>
				<td><div class="el-nm">${esc(r.name)}</div>
					<div class="el-sub">${__("{0} session(s) · {1} card(s)", [r.sessions, r.cards])}${r.last ? " · " + __("last") + " " + esc(r.last) : ""}</div></td>
				<td class="num">${f3(r.gold)}</td>
				<td class="num el-loss">${f3(r.loss)}</td>
				<td class="num"><span class="el-pct ${pctClass(r.loss_pct)}">${r.loss_pct.toFixed(2)}%</span></td>
				<td>${r.benches.length
					? r.benches.map(([b, g]) => `<span class="el-chip" data-b="${esc(b)}">${esc(b)} · ${f3(g)} g</span>`).join("")
					: `<span class="el-sub">${__("no loss booked")}</span>`}</td>
			</tr>`).join("") || `<tr><td colspan="5" class="el-none">${__("No receipted work in this window.")}</td></tr>`);

		const top = (d.benches || [])[0] ? d.benches[0][1] : 0;
		root.find(".el-bl").html((d.benches || []).length ? d.benches.map(([b, loss, gold, n]) => `
			<div class="el-brow" data-b="${esc(b)}">
				<div class="b">${esc(b)}<div class="el-sub">${__("{0} session(s) · {1} g out", [n, f3(gold)])}</div>
					<div class="el-bar"><i style="width:${top ? Math.max(2, (loss / top) * 100) : 0}%;"></i></div></div>
				<span class="g">${f3(loss)}</span>
			</div>`).join("") : `<div class="el-sub">${__("nothing yet")}</div>`);
	}

	function load() {
		frappe.call({ method: API + ".get_employee_loss", freeze: false,
			args: { period: S.period, bench: S.bench || null } })
			.then((r) => { S.data = r.message || null; paint(); });
	}

	root.on("click", ".el-pill", function () {
		root.find(".el-pill").removeClass("on");
		this.classList.add("on");
		S.period = this.dataset.p;
		load();
	});
	root.find(".el-bench-f").on("change", function () { S.bench = this.value; load(); });
	root.find(".el-q").on("input", frappe.utils.debounce(function () { S.q = this.value || ""; paint(); }, 200));
	// a bench chip (either side) filters the whole page to that bench
	root.on("click", ".el-chip, .el-brow", function () {
		S.bench = $(this).data("b") || "";
		root.find(".el-bench-f").val(S.bench);
		load();
	});

	// the bench list for the filter — every bench that books metal
	frappe.db.get_list("Bench", { fields: ["name"], limit: 0 }).then((rows) => {
		root.find(".el-bench-f").append((rows || []).map((b) => `<option>${esc(b.name)}</option>`).join(""));
	});

	page.add_inner_button(__("Refresh"), load);
	frappe.pages["employee-loss"].on_page_show = load;
	load();
};
