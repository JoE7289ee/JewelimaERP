// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Weight Checker (CAD) — the diamond chart as a calculator: the sieve rows and
// averages come LIVE from the system's Sieve Chart; type the piece count (Nos)
// per sieve and each line totals nos x avg cts, with grand totals pinned at
// the bottom. Nothing is saved — it's a checking pad for CAD budgets.
// Route: /app/weight-checker

frappe.pages["weight-checker"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Weight Checker", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	let ROWS = [];

	$(page.main).append(`
		<style>
		#page-weight-checker .container{max-width:100%;}
		.wc-wrap{width:100%;}
		tr.wc-hidden{display:none;}
		.wc-bar{display:flex;align-items:center;gap:12px;margin-bottom:10px;}
		.wc-note{color:var(--text-muted);font-size:12.5px;}
		.wc-clear{margin-left:auto;}
		table.wc-tbl{width:100%;border-collapse:collapse;font-size:13.5px;background:var(--fg-color);
			font-variant-numeric:tabular-nums;}
		.wc-tbl th{border:1px solid var(--border-color);background:var(--control-bg);padding:7px 10px;
			font-weight:800;text-transform:uppercase;font-size:11px;letter-spacing:.05em;text-align:center;}
		.wc-tbl td{border:1px solid var(--border-color);padding:5px 12px;}
		.wc-tbl td.lbl{font-weight:700;background:var(--control-bg);width:150px;}
		.wc-tbl td.num{text-align:right;color:var(--text-muted);width:100px;}
		.wc-tbl td.cell{padding:0;width:120px;}
		.wc-tbl td.cell input{width:100%;border:none;background:transparent;padding:5px 12px;font:inherit;
			text-align:right;outline:none;}
		.wc-tbl td.cell:focus-within{outline:2px solid var(--primary);outline-offset:-2px;}
		.wc-tbl td.tot{text-align:right;font-weight:700;width:120px;}
		.wc-tbl tr.hasval td.tot{color:#2e7d32;}
		.wc-foot{position:sticky;bottom:0;display:flex;gap:12px;align-items:center;margin-top:12px;
			border:2px solid var(--border-color);border-radius:10px;background:var(--fg-color);padding:10px 16px;}
		.wc-b{border:1px solid var(--border-color);border-radius:8px;padding:5px 20px;text-align:center;background:var(--control-bg);}
		.wc-b .k{font-size:10px;font-weight:700;letter-spacing:.06em;color:var(--text-muted);}
		.wc-b .v{font-size:17px;font-weight:800;font-variant-numeric:tabular-nums;}
		</style>
		<div class="wc-wrap">
			<div class="wc-bar">
				<span class="wc-note">${__("Averages come live from the Sieve Chart — edit them there, not here.")}</span>
				<button class="btn btn-default wc-hide">${__("Hide empty")}</button>
				<button class="btn btn-default wc-xlsx">${__("Export Excel")}</button>
				<button class="btn btn-default wc-pdf">${__("PDF / Print")}</button>
				<button class="btn btn-default wc-clear">${__("Clear")}</button>
			</div>
			<table class="wc-tbl">
				<thead><tr><th>${__("Sieve")}</th><th>${__("MM")}</th><th>${__("Avg Cts")}</th><th>${__("Nos")}</th><th>${__("Total Cts")}</th></tr></thead>
				<tbody></tbody>
			</table>
			<div class="wc-foot">
				<div class="wc-b"><div class="k">${__("TOTAL PIECES")}</div><div class="v wc-n">0</div></div>
				<div class="wc-b"><div class="k">${__("TOTAL CARATS")}</div><div class="v wc-ct">0.000</div></div>
			</div>
		</div>
	`);
	const root = $(page.main);

	function paint() {
		root.find("tbody").html(ROWS.map((r, i) => `<tr data-i="${i}">
			<td class="lbl">${esc(r.sieve_size)}</td>
			<td class="num">${r.mm_size ?? ""}</td>
			<td class="num">${r.avg_cts ?? ""}</td>
			<td class="cell"><input type="number" min="0" step="1" data-i="${i}" placeholder=""></td>
			<td class="tot"></td>
		</tr>`).join(""));
	}

	function recalc() {
		let n = 0, ct = 0;
		root.find("tbody tr").each(function () {
			const i = Number(this.dataset.i);
			const nos = Number($(this).find("input").val()) || 0;
			const t = nos * (ROWS[i].avg_cts || 0);
			$(this).toggleClass("hasval", nos > 0);
			$(this).find(".tot").text(nos > 0 ? t.toFixed(3) : "");
			n += nos; ct += t;
		});
		root.find(".wc-n").text(n);
		root.find(".wc-ct").text(ct.toFixed(3));
	}

	root.on("input", "tbody input", recalc);
	root.on("keydown", "tbody input", function (e) {
		if (!["Enter", "ArrowDown", "ArrowUp"].includes(e.key)) return;
		e.preventDefault();
		const i = Number(this.dataset.i) + (e.key === "ArrowUp" ? -1 : 1);
		const next = root.find(`tbody input[data-i="${i}"]`);
		if (next.length) next.focus().select();
	});
	root.find(".wc-clear").on("click", () => { root.find("tbody input").val(""); hideEmpty = false; applyHide(); recalc(); });

	// ---- hide sieves with no Nos (toggle) ----
	let hideEmpty = false;
	function applyHide() {
		root.find(".wc-hide").text(hideEmpty ? __("Show all") : __("Hide empty"))
			.toggleClass("btn-primary", hideEmpty);
		root.find("tbody tr").each(function () {
			const nos = Number($(this).find("input").val()) || 0;
			$(this).toggleClass("wc-hidden", hideEmpty && nos <= 0);
		});
	}
	root.find(".wc-hide").on("click", () => { hideEmpty = !hideEmpty; applyHide(); });

	// ---- exports: the filled lines + totals, exactly as shown ----
	function exportData() {
		const data = [[__("Sieve"), __("MM"), __("Avg Cts"), __("Nos"), __("Total Cts")]];
		let n = 0, ct = 0;
		root.find("tbody tr").each(function () {
			const i = Number(this.dataset.i);
			const nos = Number($(this).find("input").val()) || 0;
			if (nos <= 0) return;
			const t = nos * (ROWS[i].avg_cts || 0);
			data.push([ROWS[i].sieve_size, ROWS[i].mm_size, ROWS[i].avg_cts, nos, Number(t.toFixed(3))]);
			n += nos; ct += t;
		});
		data.push(["", "", __("TOTAL"), n, Number(ct.toFixed(3))]);
		return { data, n, ct };
	}

	root.find(".wc-xlsx").on("click", () => {
		const { data, n } = exportData();
		if (data.length < 3) return frappe.show_alert({ message: __("Nothing to export — type some Nos first."), indicator: "orange" }, 3);
		open_url_post("/api/method/jewelima.jewelima.api.export_table_xlsx",
			{ title: `weight-check-${frappe.datetime.get_today()}`, data: JSON.stringify(data) });
	});

	root.find(".wc-pdf").on("click", () => {
		const { data } = exportData();
		if (data.length < 3) return frappe.show_alert({ message: __("Nothing to print — type some Nos first."), indicator: "orange" }, 3);
		const rows = data.map((r, i) => `<tr>${r.map((c) => `<t${i === 0 ? "h" : "d"}>${esc(String(c))}</t${i === 0 ? "h" : "d"}>`).join("")}</tr>`).join("");
		const w = window.open("", "_blank");
		w.document.write(`<html><head><title>Weight Check ${frappe.datetime.get_today()}</title><style>
			body{font-family:sans-serif;padding:24px;} h3{margin:0 0 12px;}
			table{border-collapse:collapse;font-size:13px;} td,th{border:1px solid #999;padding:5px 14px;text-align:right;}
			th{background:#eee;} td:first-child,th:first-child{text-align:left;}
			tr:last-child td{font-weight:bold;background:#f5f5f5;}
			</style></head><body><h3>Weight Check — ${frappe.datetime.str_to_user(frappe.datetime.get_today())}</h3>
			<table>${rows}</table><script>window.print()</` + `script></body></html>`);
		w.document.close();
	});

	page.add_inner_button(__("Sieve Chart"), () => frappe.set_route("sieve-chart"));
	frappe.call({ method: API + ".get_sieve_chart" }).then((r) => {
		ROWS = r.message || [];
		paint();
		setTimeout(() => root.find('tbody input[data-i="0"]').focus(), 200);
	});
};
