// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Stone Audit (Reports > Stock Reports, management only) — per-card stone lines
// whose net PIECES and net CARATS disagree. Weight is the stock truth; the two
// fixes make the piece story match it: "Zero count" writes a corrective
// Adjustment (pcs left, carats gone) and "Sweep" books residual carats into a
// stage's -LOSS bucket (pcs gone, carats left — Option B, residue is collected).
// Route: /app/stone-audit

frappe.pages["stone-audit"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Stone Audit", single_column: true });
	const API = "jewelima.jewelima.api";
	const S = { rows: [], benches: [] };
	const esc = frappe.utils.escape_html;

	const PROBLEM = {
		count_without_weight: { label: __("Count without weight"), hint: __("pcs remain but the carats are gone"), fix: "zero_pcs", btn: __("Zero count") },
		weight_without_count: { label: __("Weight without count"), hint: __("residual carats with no stones"), fix: "sweep", btn: __("Sweep to -LOSS") },
		negative: { label: __("Negative books"), hint: __("net went below zero — inspect the card's ledger by hand"), fix: null },
	};

	$(page.main).append(`
		<style>
		.sa-wrap{max-width:1080px;}
		table.sa-grid{width:100%;border-collapse:collapse;font-size:13px;background:var(--fg-color);}
		table.sa-grid th{background:var(--control-bg);font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);padding:6px 10px;border:1px solid var(--border-color);text-align:left;}
		table.sa-grid td{border:1px solid var(--border-color);padding:6px 10px;}
		table.sa-grid td.r{text-align:right;}
		.sa-tag{border-radius:10px;padding:1px 10px;font-size:11px;font-weight:700;}
		.sa-tag.count_without_weight{background:#fff3cd;color:#8a6d00;}
		.sa-tag.weight_without_count{background:#e8f2fd;color:#1c5da8;}
		.sa-tag.negative{background:#fdecea;color:#c0392b;}
		.sa-empty{padding:40px;text-align:center;color:var(--text-muted);}
		.sa-note{color:var(--text-muted);font-size:12px;margin-top:12px;}
		</style>
		<div class="sa-wrap">
			<div class="sa-body"></div>
			<div class="sa-note">${__("Weight is the stock truth — these fixes make the piece story match it. Tolerance: carats under 0.005 count as zero (rounding dust). Cards already made into products never show here; their weights are frozen.")}</div>
		</div>
	`);
	const root = $(page.main);

	function load() {
		frappe.call({ method: API + ".get_stone_audit" }).then((r) => {
			const m = r.message || {};
			S.rows = m.rows || [];
			S.benches = m.loss_benches || [];
			paint();
		});
	}

	function paint() {
		if (!S.rows.length) {
			root.find(".sa-body").html(`<div class="sa-empty">${__("All clean — every stone line's count agrees with its weight.")}</div>`);
			return;
		}
		root.find(".sa-body").html(`
			<table class="sa-grid">
				<thead><tr><th>${__("Card")}</th><th>${__("Design")}</th><th>${__("Location")}</th><th>${__("Stone")}</th>
				<th style="text-align:right">${__("Net Pcs")}</th><th style="text-align:right">${__("Net Ct")}</th><th>${__("Problem")}</th><th></th></tr></thead>
				<tbody>${S.rows.map((r, i) => {
					const p = PROBLEM[r.problem] || {};
					return `<tr data-i="${i}">
						<td><a href="/app/order-bag/${encodeURIComponent(r.order_bag)}">${esc(r.order_bag)}</a></td>
						<td>${esc(r.design)}</td><td>${esc(r.location)}</td><td>${esc(r.item)}</td>
						<td class="r">${r.net_pcs}</td><td class="r">${r.net_ct.toFixed(3)}</td>
						<td><span class="sa-tag ${r.problem}" title="${esc(p.hint || "")}">${p.label || r.problem}</span></td>
						<td>${p.fix ? `<button class="btn btn-xs btn-default sa-fix" data-fix="${p.fix}">${p.btn}</button>` : ""}</td>
					</tr>`;
				}).join("")}</tbody>
			</table>`);
	}

	root.on("click", ".sa-fix", function () {
		const r = S.rows[cint($(this).closest("tr").attr("data-i"))];
		const fix = this.getAttribute("data-fix");
		const apply = (bench) => {
			frappe.dom.freeze(__("Fixing..."));
			frappe.call({ method: API + ".stone_audit_fix", args: { order_bag: r.order_bag, item: r.item, action: fix, bench: bench || null } })
				.then((res) => {
					frappe.dom.unfreeze();
					frappe.show_alert({ message: __("{0} on {1} resolved.", [r.item, r.order_bag]), indicator: "green" }, 5);
					const m = res.message || {};
					S.rows = m.rows || [];
					S.benches = m.loss_benches || [];
					paint();
				})
				.catch(() => frappe.dom.unfreeze());
		};
		if (fix === "zero_pcs") {
			frappe.confirm(__("Write off the count — <b>{0} pcs</b> of {1} on {2} (carats already zero)?", [r.net_pcs, esc(r.item), esc(r.order_bag)]), () => apply());
		} else {
			const d = new frappe.ui.Dialog({
				title: __("Sweep {0} ct of {1}", [r.net_ct.toFixed(3), r.item]),
				fields: [{ fieldname: "bench", fieldtype: "Select", label: __("Book against which stage's -LOSS?"), reqd: 1,
					options: S.benches.join("\n"), description: __("Where the residue physically arose.") }],
				primary_action_label: __("Sweep"),
				primary_action(v) { d.hide(); apply(v.bench); },
			});
			d.show();
		}
	});

	page.add_inner_button(__("Refresh"), load);
	load();
};
