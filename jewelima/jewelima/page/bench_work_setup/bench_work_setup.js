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
	const BENCHES = ["ORDERING", "CAD", "CAM", "WAX INJECTING", "TREE MAKING", "CASTING", "GRINDING",
		"FILING", "SETTING", "PRE POLISH", "WAX SETTING", "FINAL POLISH", "WAX CLEANING", "BAG EXTRACTION"];
	let bench = null;
	let options = [];   // [{name, kind, value, in_use}]

	$(page.main).append(`
		<style>
		.bw-note{color:var(--text-muted);font-size:12.5px;margin-bottom:14px;max-width:900px;}
		.bw-pick{max-width:320px;margin-bottom:16px;}
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
		.bw-addrow{display:flex;gap:8px;margin-top:10px;}
		.bw-addrow input{flex:1;border:1px solid var(--border-color);border-radius:6px;padding:5px 10px;background:var(--control-bg);}
		.bw-empty{color:var(--text-muted);font-size:12px;padding:8px 0;}
		</style>
		<div class="bw-note">${__("Pick a bench, then manage its Work Types (chosen when work is issued or assigned — e.g. WAX INJECTING: wax inject, dye cutting, dye making), Collection States (chosen when work comes back — e.g. complete, partial complete, failed, QC failed) and In Queue Reasons (why a waiting card is stuck — e.g. WAX INJECTING: Awaiting Dye). Rename is always allowed and follows through to every record; delete only works while no record uses the option.")}</div>
		<div class="bw-pick"></div>
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

	const picker = frappe.ui.form.make_control({
		df: { fieldtype: "Select", label: __("Bench"), fieldname: "bench", options: [""].concat(BENCHES).join("\n") },
		parent: root.find(".bw-pick").get(0), render_input: true,
	});
	picker.refresh();
	picker.$input.on("change", () => { bench = picker.get_value() || null; bench ? load() : root.find(".bw-cols").hide(); });

	function load() {
		frappe.call({ method: API + ".get_bench_work_setup", args: { location: bench } }).then((r) => {
			options = (r.message || {}).options || [];
			paint();
			root.find(".bw-cols").css("display", "flex");
		});
	}

	function paint() {
		["Work Type", "Collection State", "Queue Reason"].forEach((kind) => {
			const list = options.filter((o) => o.kind === kind);
			const box = root.find(`.bw-list[data-kind="${kind}"]`);
			if (!list.length) { box.html(`<div class="bw-empty">${__("Nothing configured — the picker stays hidden at this bench.")}</div>`); return; }
			box.html(list.map((o) => `
				<div class="bw-row" data-name="${esc(o.name)}">
					<span class="v">${esc(o.value)}</span>
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

	root.on("click", ".bw-row .del", function () {
		if ($(this).hasClass("off")) return;
		const name = $(this).closest(".bw-row").data("name");
		const o = options.find((x) => x.name === name);
		frappe.confirm(__("Delete '{0}' from {1}?", [esc(o.value), esc(bench)]), () => {
			frappe.call({ method: API + ".bench_work_option_delete", args: { name } }).then(() => load());
		});
	});
};
