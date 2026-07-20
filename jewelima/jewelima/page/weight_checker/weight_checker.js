// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Weight Checker (CAD) — the diamond chart as a calculator: the sieve rows and
// averages come LIVE from the system's Sieve Chart; type the piece count (Nos)
// per sieve and each line totals nos x avg cts, with grand totals pinned at
// the bottom. COMPARE splits the pad into two side-by-side weights (A | B)
// with the difference shown. Nothing is saved — it's a checking pad.
// Route: /app/weight-checker

frappe.pages["weight-checker"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Weight Checker", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	let ROWS = [];
	let compare = false;
	let hideEmpty = false;
	const VALS = { A: {}, B: {} };   // row index -> nos (survives mode toggles)

	$(page.main).append(`
		<style>
		#page-weight-checker .container{max-width:100%;}
		.wc-wrap{width:100%;}
		tr.wc-hidden{display:none;}
		.wc-bar{display:flex;align-items:center;gap:12px;margin-bottom:10px;flex-wrap:wrap;}
		.wc-note{color:var(--text-muted);font-size:12.5px;}
		.wc-clear{margin-left:auto;}
		.wc-panels{display:grid;grid-template-columns:1fr;gap:16px;}
		.wc-panels.compare{grid-template-columns:1fr 1fr;}
		.wc-panel h4{margin:0 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);}
		table.wc-tbl{width:100%;border-collapse:collapse;font-size:13.5px;background:var(--fg-color);
			font-variant-numeric:tabular-nums;}
		.wc-tbl th{border:1px solid var(--border-color);background:var(--control-bg);padding:7px 10px;
			font-weight:800;text-transform:uppercase;font-size:11px;letter-spacing:.05em;text-align:center;}
		.wc-tbl td{border:1px solid var(--border-color);padding:5px 12px;}
		.wc-tbl td.lbl{font-weight:700;background:var(--control-bg);width:130px;}
		.wc-tbl td.num{text-align:right;color:var(--text-muted);width:90px;}
		.wc-tbl td.cell{padding:0;width:110px;}
		.wc-tbl td.cell input{width:100%;border:none;background:transparent;padding:5px 12px;font:inherit;
			text-align:right;outline:none;}
		.wc-tbl td.cell:focus-within{outline:2px solid var(--primary);outline-offset:-2px;}
		.wc-tbl td.tot{text-align:right;font-weight:700;width:110px;}
		.wc-tbl tr.hasval td.tot{color:#2e7d32;}
		.wc-foot{position:sticky;bottom:0;display:flex;gap:12px;align-items:center;margin-top:12px;
			border:2px solid var(--border-color);border-radius:10px;background:var(--fg-color);padding:10px 16px;flex-wrap:wrap;}
		.wc-foot.compare{justify-content:space-between;}
		.wc-fgroup{display:flex;gap:12px;}
		.wc-b{border:1px solid var(--border-color);border-radius:8px;padding:5px 20px;text-align:center;background:var(--control-bg);}
		.wc-b .k{font-size:10px;font-weight:700;letter-spacing:.06em;color:var(--text-muted);}
		.wc-b .v{font-size:17px;font-weight:800;font-variant-numeric:tabular-nums;}
		.wc-b.diff .v{color:#1461d2;}
		</style>
		<div class="wc-wrap">
			<div class="wc-bar">
				<span class="wc-note">${__("Averages come live from the Sieve Chart — edit them there, not here.")}</span>
				<button class="btn btn-default wc-compare">${__("Compare")}</button>
				<button class="btn btn-default wc-hide">${__("Hide empty")}</button>
				<button class="btn btn-default wc-xlsx">${__("Export Excel")}</button>
				<button class="btn btn-default wc-pdf">${__("PDF / Print")}</button>
				<button class="btn btn-default wc-clear">${__("Clear")}</button>
			</div>
			<div class="wc-panels"></div>
			<div class="wc-foot"></div>
		</div>
	`);
	const root = $(page.main);

	const panels = () => (compare ? ["A", "B"] : ["A"]);

	function panelHtml(k) {
		return `<div class="wc-panel" data-p="${k}">
			${compare ? `<h4>${__("Weight {0}", [k])}</h4>` : ""}
			<table class="wc-tbl">
				<thead><tr><th>${__("Sieve")}</th><th>${__("MM")}</th><th>${__("Avg Cts")}</th><th>${__("Nos")}</th><th>${__("Total Cts")}</th></tr></thead>
				<tbody>${ROWS.map((r, i) => `<tr data-i="${i}">
					<td class="lbl">${esc(r.sieve_size)}</td>
					<td class="num">${r.mm_size ?? ""}</td>
					<td class="num">${r.avg_cts ?? ""}</td>
					<td class="cell"><input type="number" min="0" step="1" data-p="${k}" data-i="${i}" value="${VALS[k][i] || ""}"></td>
					<td class="tot"></td>
				</tr>`).join("")}</tbody>
			</table>
		</div>`;
	}

	function paint() {
		root.find(".wc-panels").toggleClass("compare", compare)
			.html(panels().map(panelHtml).join(""));
		root.find(".wc-compare").text(compare ? __("Single") : __("Compare"))
			.toggleClass("btn-primary", compare);
		recalc();
	}

	function totalsOf(k) {
		let n = 0, ct = 0;
		ROWS.forEach((r, i) => {
			const nos = VALS[k][i] || 0;
			n += nos; ct += nos * (r.avg_cts || 0);
		});
		return { n, ct };
	}

	function recalc() {
		panels().forEach((k) => {
			root.find(`.wc-panel[data-p="${k}"] tbody tr`).each(function () {
				const i = Number(this.dataset.i);
				const nos = VALS[k][i] || 0;
				const t = nos * (ROWS[i].avg_cts || 0);
				$(this).toggleClass("hasval", nos > 0);
				$(this).find(".tot").text(nos > 0 ? t.toFixed(3) : "");
			});
		});
		applyHide();
		const A = totalsOf("A");
		let html;
		if (compare) {
			// A under the left table, the deltas in the middle, B under the right
			const B = totalsOf("B");
			html = `<div class="wc-fgroup">
					<div class="wc-b"><div class="k">${__("A — PIECES")}</div><div class="v">${A.n}</div></div>
					<div class="wc-b"><div class="k">${__("A — CARATS")}</div><div class="v">${A.ct.toFixed(3)}</div></div>
				</div>
				<div class="wc-fgroup">
					<div class="wc-b diff"><div class="k">${__("Δ CARATS (A−B)")}</div><div class="v">${(A.ct - B.ct).toFixed(3)}</div></div>
					<div class="wc-b diff"><div class="k">${__("Δ PIECES")}</div><div class="v">${A.n - B.n}</div></div>
				</div>
				<div class="wc-fgroup">
					<div class="wc-b"><div class="k">${__("B — PIECES")}</div><div class="v">${B.n}</div></div>
					<div class="wc-b"><div class="k">${__("B — CARATS")}</div><div class="v">${B.ct.toFixed(3)}</div></div>
				</div>`;
		} else {
			html = `<div class="wc-b"><div class="k">${__("TOTAL PIECES")}</div><div class="v">${A.n}</div></div>
				<div class="wc-b"><div class="k">${__("TOTAL CARATS")}</div><div class="v">${A.ct.toFixed(3)}</div></div>`;
		}
		root.find(".wc-foot").toggleClass("compare", compare).html(html);
	}

	function applyHide() {
		root.find(".wc-hide").text(hideEmpty ? __("Show all") : __("Hide empty"))
			.toggleClass("btn-primary", hideEmpty);
		ROWS.forEach((r, i) => {
			const any = panels().some((k) => (VALS[k][i] || 0) > 0);
			root.find(`tbody tr[data-i="${i}"]`).toggleClass("wc-hidden", hideEmpty && !any);
		});
	}

	root.on("input", "tbody input", function () {
		VALS[this.dataset.p][Number(this.dataset.i)] = Number(this.value) || 0;
		recalc();
	});
	root.on("keydown", "tbody input", function (e) {
		if (!["Enter", "ArrowDown", "ArrowUp"].includes(e.key)) return;
		e.preventDefault();
		const i = Number(this.dataset.i) + (e.key === "ArrowUp" ? -1 : 1);
		const next = root.find(`tbody input[data-p="${this.dataset.p}"][data-i="${i}"]`);
		if (next.length) next.focus().select();
	});

	root.find(".wc-compare").on("click", () => { compare = !compare; paint(); });
	root.find(".wc-hide").on("click", () => { hideEmpty = !hideEmpty; applyHide(); });
	root.find(".wc-clear").on("click", () => {
		VALS.A = {}; VALS.B = {}; hideEmpty = false;
		paint();
	});

	// ---- exports: the filled lines + totals, both weights when comparing ----
	function exportData() {
		const cols = panels();
		const head = [__("Sieve"), __("MM"), __("Avg Cts")];
		cols.forEach((k) => head.push(compare ? __("Nos {0}", [k]) : __("Nos"), compare ? __("Cts {0}", [k]) : __("Total Cts")));
		const data = [head];
		ROWS.forEach((r, i) => {
			if (!cols.some((k) => (VALS[k][i] || 0) > 0)) return;
			const line = [r.sieve_size, r.mm_size, r.avg_cts];
			cols.forEach((k) => {
				const nos = VALS[k][i] || 0;
				line.push(nos || "", nos ? Number((nos * (r.avg_cts || 0)).toFixed(3)) : "");
			});
			data.push(line);
		});
		const totals = ["", "", __("TOTAL")];
		cols.forEach((k) => {
			const t = totalsOf(k);
			totals.push(t.n, Number(t.ct.toFixed(3)));
		});
		data.push(totals);
		return data;
	}

	root.find(".wc-xlsx").on("click", () => {
		const data = exportData();
		if (data.length < 3) return frappe.show_alert({ message: __("Nothing to export — type some Nos first."), indicator: "orange" }, 3);
		open_url_post("/api/method/jewelima.jewelima.api.export_table_xlsx",
			{ title: `weight-check-${frappe.datetime.get_today()}`, data: JSON.stringify(data) });
	});

	root.find(".wc-pdf").on("click", () => {
		const data = exportData();
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
		setTimeout(() => root.find('tbody input[data-i="0"]').first().focus(), 200);
	});
};
