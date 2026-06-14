// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt

const STAGE_ORDER = [
	"CAD", "CAM", "Tree Making", "Casting", "Grinding", "Filing",
	"Setting", "Pre Polish", "Wax Setting", "Final Polish", "Wax Cleaning", "Bag Extraction",
];

function renumber_stages(frm) {
	(frm.doc.stages || []).forEach((row, i) => {
		row.sequence = i + 1;
	});
}

function sync_new_design(frm) {
	// New Design is system-controlled: on whenever CAD is one of the stages.
	const has_cad = (frm.doc.stages || []).some((r) => r.stage === "CAD");
	const target = has_cad ? 1 : 0;
	if (cint(frm.doc.is_new_design) !== target) {
		frm.set_value("is_new_design", target);
	}
}

function lock_stage_grid(frm) {
	// The stages table is controlled entirely by the buttons — no direct editing.
	const grid = frm.fields_dict.stages && frm.fields_dict.stages.grid;
	if (!grid) return;
	grid.cannot_add_rows = true;
	grid.cannot_delete_rows = true;
	grid.refresh();
}

function toggle_stage(frm, stage) {
	const rows = frm.doc.stages || [];
	const existing = rows.find((r) => r.stage === stage);
	if (existing) {
		frm.doc.stages = rows.filter((r) => r.name !== existing.name);
	} else {
		frm.add_child("stages", { stage: stage });
	}
	renumber_stages(frm);
	sync_new_design(frm);
	frm.refresh_field("stages");
	render_stage_picker(frm);
	frm.dirty();
}

function render_stage_picker(frm) {
	const field = frm.fields_dict.stage_picker;
	if (!field || !field.$wrapper) return;
	const wrapper = field.$wrapper;
	wrapper.empty();

	const selected = new Set((frm.doc.stages || []).map((r) => r.stage));
	const $row = $('<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;"></div>');

	STAGE_ORDER.forEach((stage) => {
		const added = selected.has(stage);
		const cls = added ? "btn-danger" : "btn-default";
		const prefix = added ? "✓ " : "+ ";
		const $btn = $(
			`<button type="button" class="btn btn-xs ${cls}">${prefix}${frappe.utils.escape_html(stage)}</button>`
		);
		$btn.on("click", () => toggle_stage(frm, stage));
		$row.append($btn);
	});

	wrapper.append($row);
	wrapper.append(
		'<div class="text-muted" style="font-size:11px;">Red = added to this Job Order (click to remove). Drag rows in the table below to reorder them.</div>'
	);
}

frappe.ui.form.on("Job Order", {
	onload(frm) {
		// New Job Order: pre-add all stages in the default order.
		if (frm.is_new() && !(frm.doc.stages || []).length) {
			STAGE_ORDER.forEach((stage) => frm.add_child("stages", { stage: stage }));
			renumber_stages(frm);
			sync_new_design(frm);
			frm.refresh_field("stages");
		}
	},

	refresh(frm) {
		// A finalized Job Order is fully read-only (reference only).
		if (["Completed", "Cancelled"].includes(frm.doc.status)) {
			frm.disable_save();
			frm.set_read_only();
			frm.set_intro(
				__("This Job Order is {0} — read-only, for reference only.", [frm.doc.status]),
				"blue"
			);
			if (frm.doc.work_order) {
				frm.add_custom_button(__("Work Order"), () => {
					frappe.set_route("Form", "Work Order", frm.doc.work_order);
				});
			}
			return;
		}

		lock_stage_grid(frm);
		render_stage_picker(frm);
		sync_new_design(frm);

		if (!frm.is_new() && frm.doc.status === "Draft") {
			frm.add_custom_button(__("Start"), () => {
				frm.call("start_processing").then(() => frm.reload_doc());
			}).addClass("btn-primary");
		}
		if (frm.doc.work_order) {
			frm.add_custom_button(__("Work Order"), () => {
				frappe.set_route("Form", "Work Order", frm.doc.work_order);
			});
		}
	},

	// Keep picker + sequence + new-design flag in sync when rows change via the grid.
	stages_add(frm) {
		renumber_stages(frm);
		sync_new_design(frm);
		render_stage_picker(frm);
	},
	stages_remove(frm) {
		renumber_stages(frm);
		sync_new_design(frm);
		render_stage_picker(frm);
	},
	stages_move(frm) {
		renumber_stages(frm);
	},
});
