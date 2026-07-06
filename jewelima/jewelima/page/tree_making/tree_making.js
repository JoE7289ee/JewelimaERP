// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Tree Making — cards arriving at TREE MAKING queue up by their casting karat (one
// purity per tree). One tinted panel per karat (pink/yellow/white gold), side by side:
// tick the cards (Order No + Gram), pick who's making the tree, "MAKE TREE" creates a
// Wax Tree (T-<karat>-###), stamps it everywhere and transfers the lot to CASTING.
// Route: /app/tree-making

frappe.pages["tree-making"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Tree Making", single_column: true });
	let queues = [];

	// per-color palette: panel tint, accent text, selected-row tint, border
	const TONES = {
		P: { bg: "#f7f2fb", fg: "#5b2d8e", sel: "#efe3fa", bd: "#e2d5f0", label: "PINK GOLD" },
		Y: { bg: "#fdf8e7", fg: "#8a6d1a", sel: "#faf0c8", bd: "#efe2b0", label: "YELLOW GOLD" },
		W: { bg: "#f4f5f7", fg: "#4a5560", sel: "#e8ebef", bd: "#dde1e6", label: "WHITE GOLD" },
		X: { bg: "#f7f7f7", fg: "#555555", sel: "#ededed", bd: "#e0e0e0", label: "NO KARAT GOLD" },
	};
	const toneOf = (karat) => {
		const m = /^(\d+)K([PWY])G$/.exec(karat || "");
		return m ? TONES[m[2]] : TONES.X;
	};

	$(page.main).append(`
		<style>
		.tm-grid{display:grid;grid-template-columns:repeat(auto-fit, minmax(430px, 1fr));gap:20px;align-items:start;}
		.tm-empty{border:1px dashed var(--border-color);border-radius:12px;padding:34px;text-align:center;color:var(--text-muted);grid-column:1/-1;}
		.tm-q{border-radius:12px;overflow:hidden;border:1px solid;}
		.tm-qh{padding:14px 18px 10px;}
		.tm-karat{font-weight:800;font-size:20px;letter-spacing:.5px;}
		.tm-kind{font-size:13px;font-weight:600;opacity:.75;margin-left:8px;}
		table.tm-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:13.5px;background:#fff;}
		table.tm-tbl th{padding:9px 14px;text-align:left;font-weight:700;font-size:11px;letter-spacing:.08em;text-transform:uppercase;border-bottom:1.5px solid;}
		table.tm-tbl th.num,table.tm-tbl td.num{text-align:right;}
		table.tm-tbl td{padding:10px 14px;border-bottom:1px solid #f0f0f0;font-variant-numeric:tabular-nums;}
		table.tm-tbl td.code{font-weight:700;letter-spacing:.3px;}
		table.tm-tbl input{width:16px;height:16px;cursor:pointer;}
		.tm-ft{display:flex;align-items:center;gap:12px;padding:10px 14px;flex-wrap:wrap;font-size:12.5px;}
		.tm-tot{margin-right:auto;font-weight:600;}
		.tm-emp{width:200px;}
		.tm-emp .frappe-control{margin:0;}
		.tm-emp .control-label,.tm-emp .help-box{display:none !important;}
		.tm-emp input{height:30px;}
		.tm-mk{font-weight:700;letter-spacing:.5px;}
		.tm-note{margin-top:14px;color:var(--text-muted);font-size:12px;}
		</style>
		<div class="tm-grid tm-out"></div>
		<div class="tm-note">One purity per tree. Ticked cards go onto a single tree (T-&lt;karat&gt;-###) and transfer to CASTING together. Gram = the card's planned gold weight.</div>
	`);

	const esc = frappe.utils.escape_html;
	const $out = $(page.main).find(".tm-out");
	const flt0 = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));

	function render() {
		$out.empty();
		if (!queues.length) {
			$out.html('<div class="tm-empty">No cards waiting at TREE MAKING.<br>Transfer cards here and they queue up by karat — one panel per purity.</div>');
			return;
		}
		queues.forEach((q) => {
			const t = toneOf(q.karat === "OTHER" ? null : q.karat);
			const title = q.karat === "OTHER" ? "OTHER" : q.karat;
			const $q = $(`
				<div class="tm-q" style="background:${t.bg};border-color:${t.bd};">
					<div class="tm-qh" style="color:${t.fg};">
						<span class="tm-karat">${esc(title)}</span><span class="tm-kind">(${t.label})</span>
					</div>
					<table class="tm-tbl">
						<thead><tr style="color:${t.fg};">
							<th style="width:44px;border-color:${t.bd};background:${t.bg};"><input type="checkbox" class="tm-all" checked></th>
							<th style="border-color:${t.bd};background:${t.bg};">Order No</th>
							<th class="num" style="border-color:${t.bd};background:${t.bg};">Gram</th>
						</tr></thead>
						<tbody>${q.cards.map((c, ci) => `
							<tr style="background:${t.sel};"><td><input type="checkbox" class="tm-cb" data-ci="${ci}" checked></td>
							<td class="code" title="${esc(c.design || "")} · qty ${c.qty || 1}${c.size ? " · " + esc(c.size) : ""}">${esc(c.name)}</td>
							<td class="num">${flt0(c.nett_weight) ? flt0(c.nett_weight).toFixed(3) : "—"}</td></tr>`).join("")}
						</tbody>
					</table>
					<div class="tm-ft" style="color:${t.fg};">
						<span class="tm-tot"></span>
						<div class="tm-emp"></div>
						<button class="btn btn-sm btn-primary tm-mk" style="background:${t.fg};border-color:${t.fg};">MAKE TREE → CASTING</button>
					</div>
				</div>`);
			$out.append($q);

			// who's making this tree — picker filtered to the TREE MAKING bench roster
			const emp = frappe.ui.form.make_control({
				df: {
					fieldtype: "Link", options: "Employee", fieldname: "employee", placeholder: "Tree maker…",
					get_query: () => ({ query: "jewelima.jewelima.api.bench_employee_query", filters: { bench: "TREE MAKING" } }),
				},
				parent: $q.find(".tm-emp").get(0), render_input: true,
			});
			emp.refresh();

			const refreshTotals = () => {
				const picked = $q.find(".tm-cb:checked").map((i, el) => q.cards[+el.getAttribute("data-ci")]).get();
				const grams = picked.reduce((s, c) => s + flt0(c.nett_weight), 0);
				$q.find(".tm-tot").text(`${picked.length} of ${q.cards.length} selected · ${grams.toFixed(3)} g`);
			};
			$q.find(".tm-all").on("change", function () {
				$q.find(".tm-cb").prop("checked", $(this).is(":checked"));
				$q.find("tbody tr").css("background", $(this).is(":checked") ? t.sel : "#fff");
				refreshTotals();
			});
			$q.on("change", ".tm-cb", function () {
				$(this).closest("tr").css("background", this.checked ? t.sel : "#fff");
				refreshTotals();
			});
			refreshTotals();

			$q.find(".tm-mk").on("click", () => {
				const names = $q.find(".tm-cb:checked").map((i, el) => q.cards[+el.getAttribute("data-ci")].name).get();
				if (!names.length) return frappe.msgprint(__("Tick at least one card for this tree."));
				frappe.confirm(
					__("Mount <b>{0}</b> card(s) on one <b>{1}</b> tree and send them to CASTING?", [names.length, esc(title)]),
					() => {
						frappe.dom.freeze(__("Making tree…"));
						frappe.call({
							method: "jewelima.jewelima.api.make_tree",
							args: { karat: q.karat, names: JSON.stringify(names), employee: emp.get_value() || null },
						}).then((r) => {
							frappe.dom.unfreeze();
							const res = r.message || {};
							frappe.show_alert({ message: __("Tree <b>{0}</b> made — {1} card(s) → CASTING.", [res.tree, res.count]), indicator: "green" }, 7);
							if (res.errors && res.errors.length) {
								frappe.msgprint({ title: __("Some not transferred"), message: res.errors.map((e) => `${e.name}: ${e.error}`).join("<br>"), indicator: "orange" });
							}
							load();
						}).catch(() => frappe.dom.unfreeze());
					}
				);
			});
		});
	}

	function load() {
		frappe.call({ method: "jewelima.jewelima.api.get_tree_queues" }).then((r) => {
			queues = r.message || [];
			render();
		});
	}

	page.add_inner_button(__("Refresh"), load);
	load();
};
