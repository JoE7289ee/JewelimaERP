// Repair Types (REPAIR > Repair Types) — the type of each piece taken in.
//
// Add, rename, retire or remove. A rename follows every repair that already
// names it. Removing is only allowed while nothing points at it — anything in
// use is retired instead, so history keeps its words.
// Route: /app/repair-types
frappe.pages["repair-types"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Repair Types"), single_column: true });
	const API = "jewelima.jewelima.repair_api";
	const esc = frappe.utils.escape_html;
	const S = { rows: [], q: "", showRetired: false };

	$(page.main).append(`
		<style>
		#page-repair-types .container{max-width:100%;}
		.rm-wrap{max-width:760px;}
		.rm-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px;}
		.rm-new{flex:1 1 260px;max-width:340px;border:1px solid var(--border-color);border-radius:8px;
			padding:8px 12px;font-size:13px;background:var(--fg-color);color:var(--text-color);}
		.rm-q{width:190px;border:1px solid var(--border-color);border-radius:8px;height:33px;
			padding:2px 11px;font-size:12.5px;background:var(--fg-color);color:var(--text-color);}
		.rm-pill{border:1px solid var(--border-color);background:var(--fg-color);color:var(--text-muted);
			border-radius:999px;padding:5px 13px;font-size:11.5px;cursor:pointer;font-weight:600;}
		.rm-pill.on{background:#1f618d;border-color:#1f618d;color:#fff;}
		.rm-box{border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);overflow:hidden;}
		table.rm-t{width:100%;border-collapse:collapse;font-size:13px;}
		table.rm-t th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;
			color:var(--text-muted);padding:8px 12px;font-weight:700;border-bottom:1px solid var(--border-color);}
		table.rm-t td{padding:7px 12px;border-bottom:1px solid var(--border-color);}
		table.rm-t tr:last-child td{border-bottom:none;}
		table.rm-t tr.off td{opacity:.5;}
		.rm-name{font-weight:700;cursor:text;}
		.rm-used{font-size:11.5px;color:var(--text-muted);}
		.rm-act{text-align:right;white-space:nowrap;}
		.rm-act button{border:none;background:none;cursor:pointer;font-size:11.5px;font-weight:700;
			color:var(--text-muted);padding:2px 7px;}
		.rm-act button:hover{color:var(--text-color);}
		.rm-act .del{color:#b02a2a;}
		.rm-none{padding:36px;text-align:center;color:var(--text-muted);}
		</style>
		<div class="rm-wrap">
			<div class="rm-bar">
				<input class="rm-new" placeholder="${__("a new type")}">
				<button class="btn btn-sm btn-primary rm-addbtn">${__("Add")}</button>
				<span style="flex:1;"></span>
				<input class="rm-q" placeholder="${__("Filter")}">
				<span class="rm-pill rm-retired">${__("Show retired")}</span>
			</div>
			<div class="rm-box"><table class="rm-t"><thead><tr>
				<th>${__("Type")}</th><th style="width:120px;">${__("In use")}</th>
				<th style="width:170px;"></th>
			</tr></thead><tbody class="rm-body"></tbody></table></div>
		</div>`);
	const root = $(page.main);

	function paint() {
		const q = S.q.trim().toLowerCase();
		const rows = S.rows.filter((r) => (S.showRetired || r.active) &&
			(!q || (r.type_name || "").toLowerCase().includes(q)));
		root.find(".rm-retired").toggleClass("on", S.showRetired);
		root.find(".rm-body").html(rows.length ? rows.map((r) => `
			<tr data-n="${esc(r.name)}" class="${r.active ? "" : "off"}">
				<td><span class="rm-name">${esc(r.type_name)}</span>
					${r.notes ? `<div class="rm-used">${esc(r.notes)}</div>` : ""}</td>
				<td class="rm-used">${r.used ? __("{0} repair(s)", [r.used]) : __("not yet")}</td>
				<td class="rm-act">
					<button class="ren">${__("Rename")}</button>
					<button class="act">${r.active ? __("Retire") : __("Bring back")}</button>
					${r.used ? "" : `<button class="del">${__("Delete")}</button>`}
				</td>
			</tr>`).join("") : `<tr><td colspan="3" class="rm-none">${
				q ? __("Nothing matches.") : __("Nothing here yet — add the first one.")}</td></tr>`);
	}

	function load() {
		frappe.call({ method: API + ".get_repair_types", args: { include_inactive: 1 }, freeze: false })
			.then((r) => {
				S.rows = r.message || [];
				// how many repairs already name each one — what makes deleting safe or not
				return frappe.call({ method: API + ".repair_type_usage", freeze: false });
			})
			.then((r) => {
				const used = (r && r.message) || {};
				S.rows.forEach((x) => { x.used = used[x.name] || 0; });
				paint();
			});
	}

	root.on("click", ".rm-addbtn", add);
	root.on("keydown", ".rm-new", (e) => { if (e.key === "Enter") add(); });
	function add() {
		const v = (root.find(".rm-new").val() || "").trim();
		if (!v) return;
		frappe.call({ method: API + ".add_repair_type", args: { type_name: v } }).then(() => {
			root.find(".rm-new").val("");
			frappe.show_alert({ message: __("Added {0}", [v]), indicator: "green" }, 3);
			load();
		});
	}
	root.on("input", ".rm-q", function () { S.q = this.value; paint(); });
	root.on("click", ".rm-retired", () => { S.showRetired = !S.showRetired; paint(); });
	root.on("click", ".ren", function () {
		const n = $(this).closest("tr").data("n");
		frappe.prompt({ fieldname: "v", fieldtype: "Data", label: __("New name"), default: n, reqd: 1 },
			(v) => frappe.call({ method: API + ".set_repair_type", args: { name: n, type_name: v.v } })
				.then(load), __("Rename"), __("Rename"));
	});
	root.on("click", ".act", function () {
		const $tr = $(this).closest("tr");
		const n = $tr.data("n");
		const row = S.rows.find((x) => x.name === n);
		frappe.call({ method: API + ".set_repair_type", args: { name: n, active: row && row.active ? 0 : 1 } })
			.then(load);
	});
	root.on("click", ".del", function () {
		const n = $(this).closest("tr").data("n");
		frappe.confirm(__("Delete <b>{0}</b>?", [esc(n)]),
			() => frappe.call({ method: API + ".delete_repair_type", args: { name: n } }).then(load));
	});

	page.add_inner_button(__("New Repair Order"), () => frappe.set_route("new-repair-order"));
	page.add_inner_button(__("Parties"), () => frappe.set_route("repair-parties"));
	page.add_inner_button(__("Types of Work"), () => frappe.set_route("repair-tow"));
	frappe.pages["repair-types"].on_page_show = load;
};
