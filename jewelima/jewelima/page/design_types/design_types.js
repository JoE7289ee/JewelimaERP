// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Design Types — manage the design-type masters AND the sizes linked to each
// (the Place Order Size dropdown follows the picked design's type). Add a type,
// delete an unused one, add/remove sizes per type. "Export CSV" captures the
// current table back into jewelima/data/design_types.csv (the shipped import file,
// loaded via jewelima.jewelima.imports.import_design_types.run).
// Route: /app/design-types

frappe.pages["design-types"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Design Types", single_column: true });
	const API = "jewelima.jewelima.api";
	let rows = [];

	$(page.main).append(`
		<style>
		.dt-wrap{width:100%;}
		.dt-top{display:flex;gap:8px;align-items:center;margin:2px 0 12px;}
		.dt-new{width:260px;border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);padding:4px 10px;height:30px;border-radius:5px;box-sizing:border-box;color:var(--text-color);font-size:13px;text-transform:uppercase;}
		.dt-count{color:var(--text-muted);font-size:12px;margin-left:auto;}
		.dt-box{border:1px solid var(--border-color);border-radius:8px;overflow:auto;max-height:calc(100vh - 220px);}
		table.dt-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;background:var(--fg-color);}
		table.dt-tbl th{position:sticky;top:0;z-index:1;background:var(--control-bg,var(--fg-color));border-bottom:2px solid var(--gray-400,#aeb6bf);padding:8px 10px;text-align:left;font-weight:700;}
		table.dt-tbl td{border-bottom:1px solid var(--border-color);padding:8px 10px;vertical-align:middle;}
		.dt-name{font-weight:600;white-space:nowrap;}
		.dt-used{color:var(--text-muted);font-size:11px;display:block;}
		.dt-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center;}
		.dt-chip{display:inline-flex;align-items:center;gap:5px;background:var(--bg-light-gray,#f1f3f5);border:1px solid var(--border-color);border-radius:14px;padding:2px 9px;font-size:12px;}
		.dt-chip .x{cursor:pointer;color:var(--text-muted);font-weight:700;}
		.dt-addsize{width:110px;border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);padding:2px 8px;height:26px;border-radius:13px;box-sizing:border-box;font-size:12px;color:var(--text-color);}
		.dt-none{color:var(--text-muted);font-size:12px;}
		.dt-hint{margin:10px 2px 0;color:var(--text-muted);font-size:12px;}
		</style>
		<div class="dt-wrap">
			<div class="dt-top">
				<input class="dt-new" type="text" placeholder="NEW TYPE NAME…">
				<button class="btn btn-sm btn-default dt-add">Add Type</button>
				<span class="dt-count"></span>
			</div>
			<div class="dt-box"><table class="dt-tbl">
				<thead><tr><th style="width:220px">Design Type</th><th>Sizes</th><th style="width:70px"></th></tr></thead>
				<tbody class="dt-body"></tbody>
			</table></div>
			<div class="dt-hint">Each design type carries its own size list — these are the options the team sees in the <b>Place Order</b> Size dropdown for that type. Type a size and press Enter to add it; click × to remove. A type can only be deleted while no designs are linked to it (🔒 in use = locked).</div>
		</div>
	`);

	const root = $(page.main)[0];
	const esc = frappe.utils.escape_html;

	function render() {
		const body = root.querySelector(".dt-body");
		root.querySelector(".dt-count").textContent = `${rows.length} type(s)`;
		body.innerHTML = rows.map((r, i) => `
			<tr>
				<td><span class="dt-name">${esc(r.design_type)}</span>
					<span class="dt-used">${r.used_by ? r.used_by + " design(s)" : "unused"}</span></td>
				<td><div class="dt-chips" data-idx="${i}">
					${r.sizes.map((s) => `<span class="dt-chip">${esc(s)}<span class="x" data-idx="${i}" data-size="${esc(s)}">×</span></span>`).join("")}
					${r.sizes.length ? "" : '<span class="dt-none">no sizes —</span>'}
					<input class="dt-addsize" data-idx="${i}" placeholder="+ size ⏎">
				</div></td>
				<td>${r.used_by
					? `<span class="dt-none" title="Delete is blocked while designs use this type">🔒 in use</span>`
					: `<button class="btn btn-xs btn-default dt-del" data-idx="${i}">Delete</button>`}</td>
			</tr>`).join("");

		body.querySelectorAll(".dt-addsize").forEach((inp) => {
			inp.addEventListener("keydown", (e) => {
				if (e.key !== "Enter") return;
				e.preventDefault();
				const r = rows[+inp.getAttribute("data-idx")];
				const v = (inp.value || "").trim();
				if (!v || r.sizes.includes(v)) { inp.value = ""; return; }
				saveSizes(r, r.sizes.concat([v]));
			});
		});
		body.querySelectorAll(".dt-chip .x").forEach((x) => {
			x.addEventListener("click", () => {
				const r = rows[+x.getAttribute("data-idx")], s = x.getAttribute("data-size");
				saveSizes(r, r.sizes.filter((z) => z !== s));
			});
		});
		body.querySelectorAll(".dt-del").forEach((b) => {
			b.addEventListener("click", () => {
				const r = rows[+b.getAttribute("data-idx")];
				frappe.confirm(__("Delete design type <b>{0}</b>?", [esc(r.design_type)]), () =>
					frappe.call({ method: API + ".delete_design_type", args: { name: r.design_type } }).then(load));
			});
		});
	}

	function saveSizes(r, sizes) {
		frappe.call({ method: API + ".set_design_type_sizes", args: { design_type: r.design_type, sizes: JSON.stringify(sizes) } })
			.then((res) => { r.sizes = (res.message || {}).sizes || sizes; render(); });
	}

	function load() {
		frappe.call({ method: API + ".get_design_types_with_sizes" }).then((r) => { rows = r.message || []; render(); });
	}

	root.querySelector(".dt-add").addEventListener("click", addType);
	root.querySelector(".dt-new").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addType(); } });
	function addType() {
		const v = (root.querySelector(".dt-new").value || "").trim();
		if (!v) return;
		frappe.call({ method: API + ".add_design_type", args: { name: v } }).then(() => { root.querySelector(".dt-new").value = ""; load(); });
	}

	page.add_inner_button(__("Refresh"), load);
	load();
};
