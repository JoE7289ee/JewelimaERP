// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Sieve Chart (Stones) — the diamond sieve table exactly like the excel it came
// from: SIEVE | MM | AVG CTS/STONE, every number editable in place. Tab / Enter /
// arrows walk the cells; edited cells go yellow until SAVE writes them all.
// The averages drive qty<->carat auto-fill in purchases and BOM entry.
// Route: /app/sieve-chart

frappe.pages["sieve-chart"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Sieve Chart", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	let ROWS = [];
	const dirty = new Set();
	// the chart is the ONE source of truth for all four groups — everyone
	// reads, only the System Manager writes
	const canEdit = frappe.user.has_role("System Manager");

	$(page.main).append(`
		<style>
		.sv-wrap{max-width:960px;}
		.sv-bar{display:flex;align-items:center;gap:12px;margin-bottom:10px;}
		.sv-count{color:var(--text-muted);font-size:12.5px;}
		.sv-save{margin-left:auto;background:#2e7d32;border:none;color:#fff;font-weight:800;letter-spacing:.4px;
			padding:9px 28px;border-radius:8px;font-size:13px;cursor:pointer;}
		.sv-save:disabled{opacity:.4;cursor:default;}
		table.sv-tbl{width:100%;border-collapse:collapse;font-size:13.5px;background:var(--fg-color);
			font-variant-numeric:tabular-nums;}
		.sv-tbl th{border:1px solid var(--border-color);background:var(--control-bg);padding:7px 10px;
			font-weight:800;text-transform:uppercase;font-size:11px;letter-spacing:.05em;text-align:center;}
		.sv-tbl td{border:1px solid var(--border-color);padding:0;}
		.sv-tbl td.lbl{padding:6px 12px;font-weight:700;background:var(--control-bg);width:160px;}
		.sv-tbl input{width:100%;border:none;background:transparent;padding:6px 12px;font:inherit;
			text-align:right;outline:none;}
		.sv-tbl td.cell:focus-within{outline:2px solid var(--primary);outline-offset:-2px;}
		.sv-tbl td.dirty{background:#fff3cd;}
		</style>
		<div class="sv-wrap">
			<div class="sv-bar">
				<span class="sv-count"></span>
				<button class="sv-save" disabled>${__("SAVE")}</button>
			</div>
			<table class="sv-tbl">
				<thead><tr><th>${__("Sieve")}</th><th>${__("MM Size")}</th>
					<th>${__("DMD Avg Cts")}</th><th>${__("CVD Avg Cts")}</th>
					<th>${__("CZ Avg Cts")}</th><th>${__("SW Avg Cts")}</th></tr></thead>
				<tbody></tbody>
			</table>
		</div>
	`);
	const root = $(page.main);

	function load() {
		frappe.call({ method: API + ".get_sieve_chart" }).then((r) => {
			ROWS = r.message || [];
			dirty.clear();
			paint();
		});
	}

	function paint() {
		const ro = canEdit ? "" : "readonly tabindex=-1";
		const cell = (r, i, fld, step) => `<td class="cell"><input type="number" step="${step}" ${ro}
			data-f="${fld}" data-i="${i}" value="${r[fld] ?? ""}"></td>`;
		root.find("tbody").html(ROWS.map((r, i) => `<tr data-n="${esc(r.name)}">
			<td class="lbl">${esc(r.sieve_size)}</td>
			${cell(r, i, "mm_size", "0.01")}
			${cell(r, i, "avg_cts", "0.0001")}
			${cell(r, i, "cvd_avg_cts", "0.0001")}
			${cell(r, i, "cz_avg_cts", "0.0001")}
			${cell(r, i, "sw_avg_cts", "0.0001")}
		</tr>`).join(""));
		root.find(".sv-count").text(__("{0} sieve sizes", [ROWS.length]) + (canEdit ? "" : " · " + __("read only")));
		root.find(".sv-save").toggle(canEdit).prop("disabled", !dirty.size);
	}

	root.on("input", ".sv-tbl input", function () {
		if (!canEdit) return;
		const r = ROWS[Number(this.dataset.i)];
		r[this.dataset.f] = this.value === "" ? 0 : Number(this.value);
		dirty.add(r.name);
		$(this).closest("td").addClass("dirty");
		root.find(".sv-save").prop("disabled", false);
	});

	// excel-style navigation: Enter/↓ next row, ↑ prev, Tab handled natively
	root.on("keydown", ".sv-tbl input", function (e) {
		if (!["Enter", "ArrowDown", "ArrowUp"].includes(e.key)) return;
		e.preventDefault();
		const i = Number(this.dataset.i) + (e.key === "ArrowUp" ? -1 : 1);
		const next = root.find(`input[data-f="${this.dataset.f}"][data-i="${i}"]`);
		if (next.length) next.focus().select();
	});

	root.find(".sv-save").on("click", () => {
		const rows = ROWS.filter((r) => dirty.has(r.name))
			.map((r) => ({ name: r.name, mm_size: r.mm_size, avg_cts: r.avg_cts,
				cvd_avg_cts: r.cvd_avg_cts, cz_avg_cts: r.cz_avg_cts, sw_avg_cts: r.sw_avg_cts }));
		frappe.call({ method: API + ".save_sieve_chart", args: { rows: JSON.stringify(rows) } })
			.then((r) => {
				frappe.show_alert({ message: __("{0} row(s) saved.", [(r.message || {}).saved || 0]), indicator: "green" }, 3);
				load();
			});
	});

	page.set_primary_action(__("Refresh"), () => load(), "refresh");
	load();
};
