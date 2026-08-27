// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Setup > Bench Setup > Work Types & States — admin-only. Per-bench lists of
// Work Types (picked when issuing/assigning) and Collection States (picked when
// collecting/receipting). Options can always be RENAMED (the rename follows
// through to every bench record); DELETE only works while nothing uses the
// option. Route: /app/bench-work-setup

frappe.pages["bench-work-setup"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Work Types & States", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const BENCHES = ["ORDERING", "CAD", "CAM", "WAXING", "TREE MAKING", "CASTING", "GRINDING",
		"FILING", "SETTING", "PRE POLISH", "WAX SETTING", "FINAL POLISH", "WAX CLEANING", "BAG EXTRACTION"];
	let bench = null;
	let options = [];   // [{name, kind, value, in_use}]

	$(page.main).append(`
		<style>
		.bw-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px;margin-bottom:18px;}
		.bw-tile{border:1px solid var(--border-color);border-radius:11px;background:var(--fg-color);padding:11px 14px;cursor:pointer;transition:transform .1s,box-shadow .1s,border-color .1s;}
		.bw-tile:hover{transform:translateY(-2px);box-shadow:0 6px 14px rgba(0,0,0,.08);}
		.bw-tile.on{border-color:#1f618d;box-shadow:0 0 0 2px rgba(31,97,141,.25);}
		.bw-tile .nm{font-weight:800;font-size:13.5px;margin-bottom:7px;}
		.bw-tile .cts{display:flex;gap:6px;flex-wrap:wrap;}
		.bw-tile .ct{font-size:11px;font-weight:700;border-radius:9px;padding:1px 8px;}
		.bw-tile .ct.w{background:#e3e7f5;color:#333d8f;}
		.bw-tile .ct.s{background:#dcefe0;color:#1d7a33;}
		.bw-tile .ct.q{background:#fdf3d0;color:#8a6d00;}
		.bw-cols{display:none;gap:20px;align-items:flex-start;}
		.bw-col{flex:1;border:1px solid var(--border-color);border-radius:8px;background:var(--fg-color);overflow:hidden;}
		.bw-col .h{background:var(--control-bg);padding:10px 14px;font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);}
		.bw-col .b{padding:8px 14px 14px;}
		.bw-row{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border-color);}
		.bw-row:last-child{border-bottom:0;}
		.bw-row .v{flex:1;font-weight:600;}
		.bw-row .u{font-size:11px;color:var(--text-muted);white-space:nowrap;}
		.bw-row .act{cursor:pointer;font-size:12px;}
		.bw-row .ren{color:var(--text-muted);}
		.bw-row .del{color:#b02a2a;font-weight:700;}
		.bw-row .del.off{opacity:.3;cursor:not-allowed;}
		.bw-row .disp{cursor:pointer;font-size:11px;font-weight:700;border-radius:9px;padding:1px 9px;white-space:nowrap;}
		.bw-row .def{cursor:pointer;font-size:10.5px;font-weight:800;border-radius:9px;padding:1px 9px;white-space:nowrap;border:1px solid var(--border-color);color:var(--text-muted);}
		.bw-row .def.on{background:#e3f0e6;border-color:#a7d3b0;color:#1d7a33;cursor:default;}
		.bw-row .disp.tr{background:#dcefe0;color:#1d7a33;}
		.bw-row .disp.q{background:#fdf3d0;color:#8a6d00;}
		.bw-addrow{display:flex;gap:8px;margin-top:10px;}
		.bw-addrow input{flex:1;border:1px solid var(--border-color);border-radius:6px;padding:5px 10px;background:var(--control-bg);}
		.bw-empty{color:var(--text-muted);font-size:12px;padding:8px 0;}
		</style>
		<div class="bw-tiles"></div>
		<div class="bw-cols">
			<div class="bw-col"><div class="h">${__("Types of Work")}</div><div class="b">
				<div class="bw-list" data-kind="Work Type"></div>
				<div class="bw-addrow"><input data-kind="Work Type" placeholder="${__("new work type + Enter")}"><button class="btn btn-default btn-sm bw-add" data-kind="Work Type">${__("Add")}</button></div>
			</div></div>
			<div class="bw-col"><div class="h">${__("States of Collection")}</div><div class="b">
				<div class="bw-list" data-kind="Collection State"></div>
				<div class="bw-addrow"><input data-kind="Collection State" placeholder="${__("new collection state + Enter")}"><button class="btn btn-default btn-sm bw-add" data-kind="Collection State">${__("Add")}</button></div>
			</div></div>
			<div class="bw-col"><div class="h">${__("In Queue Reasons")}</div><div class="b">
				<div class="bw-list" data-kind="Queue Reason"></div>
				<div class="bw-addrow"><input data-kind="Queue Reason" placeholder="${__("new queue reason + Enter")}"><button class="btn btn-default btn-sm bw-add" data-kind="Queue Reason">${__("Add")}</button></div>
			</div></div>
		</div>
	`);
	const root = $(page.main);

	let tiles = [];
	function renderTiles() {
		root.find(".bw-tiles").html(tiles.map((b) => `
			<div class="bw-tile ${bench === b.bench ? "on" : ""}" data-bench="${esc(b.bench)}">
				<div class="nm">${esc(b.bench)}</div>
				<div class="cts">
					<span class="ct w">${b.work_types} ${__("work")}</span>
					<span class="ct s">${b.collection_states} ${__("collection")}</span>
					<span class="ct q">${b.queue_reasons} ${__("reasons")}</span>
				</div>
			</div>`).join(""));
	}
	function loadTiles() {
		frappe.call({ method: API + ".get_bench_work_counts" }).then((r) => {
			tiles = (r.message || {}).benches || [];
			renderTiles();
		});
	}
	root.on("click", ".bw-tile", function () {
		bench = $(this).data("bench");
		renderTiles();
		load();
	});

	function load() {
		frappe.call({ method: API + ".get_bench_work_setup", args: { location: bench } }).then((r) => {
			options = (r.message || {}).options || [];
			paint();
			root.find(".bw-cols").css("display", "flex");
			loadTiles();  // keep the tile counts fresh after add / delete
		});
	}
	loadTiles();

	function paint() {
		["Work Type", "Collection State", "Queue Reason"].forEach((kind) => {
			const list = options.filter((o) => o.kind === kind);
			const box = root.find(`.bw-list[data-kind="${kind}"]`);
			if (!list.length) { box.html(`<div class="bw-empty">${__("Nothing configured — the picker stays hidden at this bench.")}</div>`); return; }
			box.html(list.map((o) => `
				<div class="bw-row" data-name="${esc(o.name)}">
					<span class="v">${esc(o.value)}</span>
					${kind === "Work Type" || kind === "Collection State" ? (o.is_default
						? `<span class="def on" title="${kind === "Work Type"
							? __("Default — used when a card is issued without a work type picked")
							: __("Default — the collect/receipt picker opens on this state")}">★ ${__("default")}</span>`
						: `<span class="def" title="${__("Click to make this the default")}">${__("set default")}</span>`) : ""}
					${kind === "Collection State" ? `<span class="disp ${o.disposition === "Back to In Queue" ? "q" : "tr"}" title="${__("Click to change what happens to the card after this state")}">${o.disposition === "Back to In Queue" ? "↺ " + __("back to queue") : "→ " + __("ready to transfer")}</span>` : ""}
					<span class="u">${o.in_use ? __("{0} record(s)", [o.in_use]) : __("unused")}</span>
					<span class="act ren" title="${__("Rename — follows through to every record")}">${__("rename")}</span>
					<span class="act del ${o.in_use ? "off" : ""}" title="${o.in_use ? __("In use — rename instead") : __("Delete")}">&times;</span>
				</div>`).join(""));
		});
	}

	function add(kind, input) {
		const v = (input.val() || "").trim();
		if (!v) return;
		frappe.call({ method: API + ".bench_work_option_add", args: { location: bench, kind, value: v } })
			.then(() => { input.val(""); load(); });
	}
	root.find(".bw-add").on("click", function () { add($(this).data("kind"), root.find(`.bw-addrow input[data-kind="${$(this).data("kind")}"]`)); });
	root.on("keydown", ".bw-addrow input", function (e) { if (e.key === "Enter") add($(this).data("kind"), $(this)); });

	root.on("click", ".bw-row .ren", function () {
		const name = $(this).closest(".bw-row").data("name");
		const o = options.find((x) => x.name === name);
		frappe.prompt(
			[{ fieldname: "v", fieldtype: "Data", label: __("New name"), default: o.value, reqd: 1 }],
			(vals) => {
				frappe.call({ method: API + ".bench_work_option_rename", args: { name, new_value: vals.v } })
					.then((r) => {
						const m = r.message || {};
						frappe.show_alert({ message: __("Renamed — {0} record(s) updated.", [m.records_updated || 0]), indicator: "green" }, 4);
						load();
					});
			}, __("Rename '{0}'", [o.value]), __("Rename"));
	});

	root.on("click", ".bw-row .def:not(.on)", function () {
		const name = $(this).closest(".bw-row").data("name");
		frappe.call({ method: API + ".bench_work_option_set_default", args: { name } })
			.then(() => { frappe.show_alert({ message: __("Default set."), indicator: "green" }, 3); load(); });
	});

	root.on("click", ".bw-row .disp", function () {
		const name = $(this).closest(".bw-row").data("name");
		const o = options.find((x) => x.name === name);
		const next = o.disposition === "Back to In Queue" ? "Ready to Transfer" : "Back to In Queue";
		frappe.call({ method: API + ".bench_work_option_set_disposition", args: { name, disposition: next } })
			.then(() => { frappe.show_alert({ message: __("Outcome updated."), indicator: "blue" }, 3); load(); });
	});

	root.on("click", ".bw-row .del", function () {
		if ($(this).hasClass("off")) return;
		const name = $(this).closest(".bw-row").data("name");
		const o = options.find((x) => x.name === name);
		frappe.confirm(__("Delete '{0}' from {1}?", [esc(o.value), esc(bench)]), () => {
			frappe.call({ method: API + ".bench_work_option_delete", args: { name } }).then(() => load());
		});
	});
};
