// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Employee Performance — a TV-friendly live leaderboard of shop-floor performance
// (pieces completed, gold handled, loss %, work in hand). Dark, large fonts, auto-refresh.
// Point a kiosk browser (TV Bro / Fully Kiosk) at this page on a wall TV. Route:
// /app/employee-performance

frappe.pages["employee-performance"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Employee Performance", single_column: true });
	const state = { days: 30, timer: null };
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;

	const CSS = `
	.ep-tv{background:#0f1419;color:#e8edf2;min-height:calc(100vh - 70px);margin:-15px -15px 0;padding:18px 28px 26px;
		font-family:-apple-system,Segoe UI,Roboto,Helvetica,sans-serif;}
	.ep-head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #2a3138;padding-bottom:12px;margin-bottom:4px;}
	.ep-title{font-size:30px;font-weight:800;letter-spacing:.4px;}
	.ep-title span{color:#c9a227;}
	.ep-meta{font-size:14px;color:#8a97a3;text-align:right;line-height:1.3;}
	.ep-meta b{color:#e8edf2;font-size:15px;}
	table.ep-tbl{width:100%;border-collapse:collapse;font-size:21px;}
	table.ep-tbl th{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#7c8a96;text-align:right;padding:12px 16px 10px;border-bottom:1px solid #2a3138;}
	table.ep-tbl th.l{text-align:left;}
	table.ep-tbl td{padding:10px 16px;text-align:right;border-bottom:1px solid #1b2228;font-variant-numeric:tabular-nums;}
	table.ep-tbl td.l{text-align:left;}
	table.ep-tbl tbody tr:nth-child(even){background:#141b21;}
	.ep-rank{width:54px;font-weight:800;color:#7c8a96;}
	.ep-name{font-weight:600;}
	.ep-top1{background:#1d2433 !important;} .ep-top1 .ep-rank{color:#ffd24a;}
	.ep-top2 .ep-rank{color:#cfd6dd;} .ep-top3 .ep-rank{color:#d8954a;}
	.ep-pieces{font-weight:800;font-size:25px;color:#7fd1a3;}
	.ep-ok{color:#7fd1a3;} .ep-mid{color:#e6b450;} .ep-hi{color:#e06b6b;}
	.ep-dim{color:#5e6b76;}`;

	$(page.main).append(`<style>${CSS}</style>
		<div class="ep-tv">
			<div class="ep-head">
				<div class="ep-title">JEWELIMA &middot; <span>Employee Performance</span></div>
				<div class="ep-meta">Last <b class="ep-period">—</b><br><span class="ep-asof"></span></div>
			</div>
			<div class="ep-out"></div>
		</div>`);
	const $out = $(page.main).find(".ep-out");

	const lossCls = (p) => (p < 1 ? "ep-ok" : p < 2 ? "ep-mid" : "ep-hi");

	function render(d) {
		$(page.main).find(".ep-period").text(`${d.period_days} days`);
		$(page.main).find(".ep-asof").text(`as of ${d.as_of}`);
		const rows =
			(d.rows || [])
				.slice(0, 15)
				.map((r, i) => `<tr class="${i < 3 ? "ep-top" + (i + 1) : ""}">
					<td class="l ep-rank">${i + 1}</td>
					<td class="l ep-name">${esc(r.name)}</td>
					<td class="ep-pieces">${r.pieces}</td>
					<td>${r.today ? r.today : '<span class="ep-dim">0</span>'}</td>
					<td>${r.active ? r.active : '<span class="ep-dim">0</span>'}</td>
					<td>${flt(r.gold).toFixed(1)}</td>
					<td>${flt(r.loss).toFixed(2)}</td>
					<td class="${lossCls(r.loss_pct)}">${flt(r.loss_pct).toFixed(2)}%</td>
					<td>${r.holding ? flt(r.holding).toFixed(2) : '<span class="ep-dim">—</span>'}</td>
				</tr>`)
				.join("") || '<tr><td class="l ep-dim" colspan="9">No bench activity in this period yet.</td></tr>';
		$out.html(`<table class="ep-tbl"><thead><tr>
			<th class="l" style="width:54px">#</th><th class="l">Employee</th>
			<th>Pieces</th><th>Today</th><th>In&nbsp;Hand</th><th>Gold&nbsp;(g)</th><th>Loss&nbsp;(g)</th><th>Loss&nbsp;%</th><th>Holding&nbsp;(g)</th>
		</tr></thead><tbody>${rows}</tbody></table>`);
	}

	function load() {
		frappe.call({ method: "jewelima.jewelima.api.get_employee_performance", args: { days: state.days } })
			.then((r) => render(r.message || {}));
	}

	page.add_inner_button(__("7 days"), () => { state.days = 7; load(); });
	page.add_inner_button(__("30 days"), () => { state.days = 30; load(); });
	page.add_inner_button(__("90 days"), () => { state.days = 90; load(); });
	page.set_primary_action(__("Refresh"), load, "refresh");

	load();
	state.timer = setInterval(load, 25000); // live auto-refresh every 25s
	$(wrapper).on("remove", () => clearInterval(state.timer));
};
