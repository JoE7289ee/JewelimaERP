// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Design Tags — create and manage the custom tags used by the Design Gallery. Add a tag,
// recolour it (inline), rename it (cascades to every design), delete it (removes it from
// all designs), or jump to the gallery filtered by that tag.
// Route: /app/design-tags

frappe.pages["design-tags"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Design Tags", single_column: true });
	const root = $(page.main);
	const API = "jewelima.jewelima.design_bank_api";
	const esc = frappe.utils.escape_html;

	root.append(`
	<style>
	.dt-wrap{max-width:760px;margin:6px auto 40px;}
	.dt-head{display:flex;align-items:center;margin:2px 0 12px;color:var(--text-muted);font-size:13px;}
	table.dt-tbl{width:100%;border-collapse:separate;border-spacing:0;background:var(--fg-color);
		border:1px solid var(--border-color);border-radius:8px;overflow:hidden;font-size:13px;}
	table.dt-tbl th{background:var(--control-bg);border-bottom:1px solid var(--border-color);padding:8px 12px;text-align:left;font-weight:700;}
	table.dt-tbl th.num,table.dt-tbl td.num{text-align:right;font-variant-numeric:tabular-nums;}
	table.dt-tbl td{border-bottom:1px solid var(--border-color);padding:7px 12px;vertical-align:middle;}
	table.dt-tbl tbody tr:last-child td{border-bottom:0;}
	table.dt-tbl tbody tr:hover td{background:var(--control-bg);}
	.dt-name{font-weight:600;}
	.dt-color{width:30px;height:24px;border:1px solid var(--border-color);border-radius:5px;padding:0;background:none;cursor:pointer;}
	.dt-act{text-align:right;white-space:nowrap;}
	.dt-act .btn{margin-left:4px;}
	</style>
	<div class="dt-wrap">
		<div class="dt-head"><span class="dt-count"></span></div>
		<table class="dt-tbl">
			<thead><tr><th style="width:48px">Colour</th><th>Tag</th><th class="num" style="width:90px">Designs</th><th class="dt-act" style="width:230px">Actions</th></tr></thead>
			<tbody></tbody>
		</table>
	</div>`);

	const $tb = root.find("tbody");

	page.set_primary_action("New Tag", () => newTag(), "add");

	function load() {
		frappe.call(API + ".get_tags", { with_counts: 1 }).then((r) => {
			const tags = r.message || [];
			root.find(".dt-count").text(`${tags.length} tags · ${tags.reduce((a, t) => a + t.count, 0).toLocaleString()} tagged designs`);
			$tb.empty();
			if (!tags.length) { $tb.append(`<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px">No tags yet — create one.</td></tr>`); return; }
			tags.forEach((t) => $tb.append(`
				<tr data-tag="${esc(t.tag)}">
					<td><input type="color" class="dt-color" value="${esc(t.color || "#6b7280")}"></td>
					<td class="dt-name">${esc(t.tag)}</td>
					<td class="num">${t.count.toLocaleString()}</td>
					<td class="dt-act">
						<button class="btn btn-xs btn-default dt-view">View</button>
						<button class="btn btn-xs btn-default dt-rename">Rename</button>
						<button class="btn btn-xs btn-danger dt-del">Delete</button>
					</td>
				</tr>`));
		});
	}

	$tb.on("change", ".dt-color", function () {
		const tag = $(this).closest("tr").data("tag");
		frappe.call(API + ".set_tag_color", { tag_name: tag, color: this.value })
			.then(() => frappe.show_alert({ message: "Colour updated", indicator: "green" }));
	});

	$tb.on("click", ".dt-view", function () {
		const tag = $(this).closest("tr").data("tag");
		frappe.route_options = { tag };
		frappe.set_route("design-gallery");
	});

	$tb.on("click", ".dt-rename", function () {
		const tag = $(this).closest("tr").data("tag");
		frappe.prompt(
			{ fieldname: "n", label: "New name", fieldtype: "Data", default: tag, reqd: 1 },
			(v) => frappe.call(API + ".rename_tag", { old: tag, new: v.n })
				.then(() => { frappe.show_alert({ message: "Renamed", indicator: "green" }); load(); }),
			"Rename tag"
		);
	});

	$tb.on("click", ".dt-del", function () {
		const tag = $(this).closest("tr").data("tag");
		frappe.confirm(
			`Delete tag <b>${esc(tag)}</b>? It will be removed from all designs that use it.`,
			() => frappe.call(API + ".delete_tag", { tag_name: tag })
				.then(() => { frappe.show_alert({ message: "Deleted", indicator: "red" }); load(); })
		);
	});

	function newTag() {
		const d = new frappe.ui.Dialog({
			title: "New Tag",
			fields: [
				{ fieldname: "tag_name", label: "Tag Name", fieldtype: "Data", reqd: 1 },
				{ fieldname: "color", label: "Colour", fieldtype: "Color", default: "#16a34a" },
			],
			primary_action_label: "Create",
			primary_action(v) {
				frappe.call(API + ".create_tag", { tag_name: v.tag_name, color: v.color })
					.then(() => { d.hide(); frappe.show_alert({ message: "Tag created", indicator: "green" }); load(); });
			},
		});
		d.show();
	}

	load();
};
