// Repair Masters (REPAIR > Repair Masters) — the three lists the intake page
// picks from, on one screen: who sends work in, the kinds of work, and the type
// of a piece. Side by side rather than three pages, because they are short lists
// and setting up a new party usually means setting up its work in the same sitting.
//
// Each behaves the same: add, rename (which follows every repair already naming
// it), retire, and delete only while nothing points at it — anything in use is
// retired instead, so a past repair keeps its own words.
// Route: /app/repair-masters
frappe.pages["repair-masters"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Repair Masters"), single_column: true });
	const API = "jewelima.jewelima.repair_api";
	const esc = frappe.utils.escape_html;

	// one description per list — everything below is driven off this
	const LISTS = [
		{ key: "party", title: __("Parties"), col: __("Party"), field: "party_name",
		  add: __("a new party's name"), blurb: __("who sends work in"),
		  get: "get_repair_parties", set: "set_repair_party",
		  create: "add_repair_party", del: "delete_repair_party",
		  usage: "repair_party_usage", arg: "party_name" },
		{ key: "work", title: __("Types of Work"), col: __("Type of Work"), field: "work_name",
		  add: __("a new type of work"), blurb: __("what needs doing to a piece"),
		  get: "get_repair_work_types", set: "set_repair_work_type",
		  create: "add_repair_work_type", del: "delete_repair_work_type",
		  usage: "repair_work_type_usage", arg: "work_name" },
		{ key: "type", title: __("Types"), col: __("Type"), field: "type_name",
		  add: __("a new type"), blurb: __("what kind of piece it is"),
		  get: "get_repair_types", set: "set_repair_type",
		  create: "add_repair_type", del: "delete_repair_type",
		  usage: "repair_type_usage", arg: "type_name" },
	];
	const S = {};
	LISTS.forEach((l) => (S[l.key] = { rows: [], q: "", retired: false }));

	$(page.main).append(`
		<style>
		#page-repair-masters .container{max-width:100%;}
		.rm-wrap{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;max-width:100%;}
		.rm-col{flex:1 1 330px;min-width:300px;}
		.rm-card{border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);
			overflow:hidden;}
		.rm-head{padding:11px 14px;border-bottom:1px solid var(--border-color);background:var(--control-bg);}
		.rm-head .t{font-size:12.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;}
		.rm-head .b{font-size:11.5px;color:var(--text-muted);margin-top:1px;}
		.rm-bar{display:flex;gap:6px;align-items:center;padding:9px 12px;flex-wrap:wrap;
			border-bottom:1px solid var(--border-color);}
		.rm-new{flex:1 1 140px;min-width:120px;border:1px solid var(--border-color);border-radius:8px;
			padding:7px 11px;font-size:12.5px;background:var(--fg-color);color:var(--text-color);}
		.rm-q{flex:1 1 110px;min-width:90px;border:1px solid var(--border-color);border-radius:8px;
			padding:6px 10px;font-size:12px;background:var(--fg-color);color:var(--text-color);}
		.rm-pill{border:1px solid var(--border-color);background:var(--fg-color);color:var(--text-muted);
			border-radius:999px;padding:4px 11px;font-size:11px;cursor:pointer;font-weight:600;white-space:nowrap;}
		.rm-pill.on{background:#1f618d;border-color:#1f618d;color:#fff;}
		table.rm-t{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.rm-t td{padding:7px 12px;border-bottom:1px solid var(--border-color);}
		table.rm-t tr:last-child td{border-bottom:none;}
		table.rm-t tr.off td{opacity:.5;}
		table.rm-t tr:hover td{background:var(--control-bg);}
		.rm-name{font-weight:700;}
		.rm-used{font-size:11px;color:var(--text-muted);}
		.rm-act{text-align:right;white-space:nowrap;width:1%;}
		.rm-act button{border:none;background:none;cursor:pointer;font-size:11px;font-weight:700;
			color:var(--text-muted);padding:2px 5px;}
		.rm-act button:hover{color:var(--text-color);}
		.rm-act .del{color:#b02a2a;}
		.rm-none{padding:26px 14px;text-align:center;color:var(--text-muted);font-size:12px;}
		.rm-count{font-size:11px;color:var(--text-muted);margin-left:auto;}
		</style>
		<div class="rm-wrap">
			${LISTS.map((l) => `
				<div class="rm-col" data-k="${l.key}">
					<div class="rm-card">
						<div class="rm-head"><div class="t">${esc(l.title)}</div>
							<div class="b">${esc(l.blurb)}</div></div>
						<div class="rm-bar">
							<input class="rm-new" placeholder="${esc(l.add)}">
							<button class="btn btn-xs btn-primary rm-addbtn">${__("Add")}</button>
							<input class="rm-q" placeholder="${__("Filter")}">
							<span class="rm-pill rm-retired">${__("Retired")}</span>
							<span class="rm-count"></span>
						</div>
						<table class="rm-t"><tbody class="rm-body"></tbody></table>
					</div>
				</div>`).join("")}
		</div>`);
	const root = $(page.main);
	const spec = (key) => LISTS.find((l) => l.key === key);
	const colOf = (el) => $(el).closest(".rm-col").data("k");

	function paint(key) {
		const l = spec(key), st = S[key];
		const q = st.q.trim().toLowerCase();
		const rows = st.rows.filter((r) => (st.retired || r.active) &&
			(!q || (r[l.field] || "").toLowerCase().includes(q)));
		const $c = root.find(`.rm-col[data-k="${key}"]`);
		$c.find(".rm-retired").toggleClass("on", st.retired);
		$c.find(".rm-count").text(__("{0} of {1}", [rows.length, st.rows.length]));
		$c.find(".rm-body").html(rows.length ? rows.map((r) => `
			<tr data-n="${esc(r.name)}" class="${r.active ? "" : "off"}">
				<td><span class="rm-name">${esc(r[l.field])}</span>
					<div class="rm-used">${r.used
						? __("on {0} repair(s)", [r.used])
						: __("not used yet")}${r.active ? "" : " · " + __("retired")}</div></td>
				<td class="rm-act">
					<button class="ren">${__("Rename")}</button>
					<button class="act">${r.active ? __("Retire") : __("Restore")}</button>
					${r.used ? "" : `<button class="del">${__("Delete")}</button>`}
				</td>
			</tr>`).join("") : `<tr><td colspan="2" class="rm-none">${
				q ? __("Nothing matches.") : __("Nothing here yet.")}</td></tr>`);
	}

	function load(key) {
		const l = spec(key);
		return frappe.call({ method: API + "." + l.get, args: { include_inactive: 1 }, freeze: false })
			.then((r) => {
				S[key].rows = r.message || [];
				return frappe.call({ method: API + "." + l.usage, freeze: false });
			})
			.then((r) => {
				const used = (r && r.message) || {};
				S[key].rows.forEach((x) => (x.used = used[x.name] || 0));
				paint(key);
			});
	}
	const loadAll = () => LISTS.forEach((l) => load(l.key));

	function add($col) {
		const key = $col.data("k"), l = spec(key);
		const $in = $col.find(".rm-new");
		const v = ($in.val() || "").trim();
		if (!v) return;
		frappe.call({ method: API + "." + l.create, args: { [l.arg]: v } }).then(() => {
			$in.val("").trigger("focus");
			frappe.show_alert({ message: __("Added {0}", [v]), indicator: "green" }, 3);
			load(key);
		});
	}
	root.on("click", ".rm-addbtn", function () { add($(this).closest(".rm-col")); });
	root.on("keydown", ".rm-new", function (e) {
		if (e.key === "Enter") add($(this).closest(".rm-col"));
	});
	root.on("input", ".rm-q", function () {
		const k = colOf(this); S[k].q = this.value; paint(k);
	});
	root.on("click", ".rm-retired", function () {
		const k = colOf(this); S[k].retired = !S[k].retired; paint(k);
	});
	root.on("click", ".ren", function () {
		const k = colOf(this), l = spec(k), n = $(this).closest("tr").data("n");
		frappe.prompt({ fieldname: "v", fieldtype: "Data", label: __("New name"), default: n, reqd: 1 },
			(v) => frappe.call({ method: API + "." + l.set, args: { name: n, [l.arg]: v.v } })
				.then(() => load(k)), __("Rename"), __("Rename"));
	});
	root.on("click", ".act", function () {
		const k = colOf(this), l = spec(k), n = $(this).closest("tr").data("n");
		const row = S[k].rows.find((x) => x.name === n);
		frappe.call({ method: API + "." + l.set, args: { name: n, active: row && row.active ? 0 : 1 } })
			.then(() => load(k));
	});
	root.on("click", ".del", function () {
		const k = colOf(this), l = spec(k), n = $(this).closest("tr").data("n");
		frappe.confirm(__("Delete <b>{0}</b>?", [esc(n)]),
			() => frappe.call({ method: API + "." + l.del, args: { name: n } }).then(() => load(k)));
	});

	page.add_inner_button(__("New Repair Order"), () => frappe.set_route("new-repair-order"));
	frappe.pages["repair-masters"].on_page_show = loadAll;
};
