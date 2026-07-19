// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Selection Tags — manage the SELECTION catalog's own tags (a separate master
// from the Design Bank's Design Tags; different purpose). Each row shows how
// many catalog photos carry the tag right now. Add, recolour (inline), rename
// (cascades to every photo), delete (removed from all photos), or jump to the
// Selection page filtered by that tag.
// Route: /app/selection-tags

frappe.pages["selection-tags"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Selection Tags", single_column: true });
	const root = $(page.main);
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;

	root.append(`
	<style>
	.slt-wrap{max-width:760px;margin:6px auto 40px;}
	.slt-head{display:flex;align-items:center;margin:2px 0 12px;color:var(--text-muted);font-size:13px;}
	table.slt-tbl{width:100%;border-collapse:separate;border-spacing:0;background:var(--fg-color);
		border:1px solid var(--border-color);border-radius:8px;overflow:hidden;font-size:13px;}
	table.slt-tbl th{background:var(--control-bg);border-bottom:1px solid var(--border-color);padding:8px 12px;text-align:left;font-weight:700;}
	table.slt-tbl th.num,table.slt-tbl td.num{text-align:right;font-variant-numeric:tabular-nums;}
	table.slt-tbl td{border-bottom:1px solid var(--border-color);padding:7px 12px;vertical-align:middle;}
	table.slt-tbl tbody tr:last-child td{border-bottom:0;}
	table.slt-tbl tbody tr:hover td{background:var(--control-bg);}
	.slt-name{font-weight:600;}
	.slt-color{width:30px;height:24px;border:1px solid var(--border-color);border-radius:5px;padding:0;background:none;cursor:pointer;}
	.slt-act{text-align:right;white-space:nowrap;}
	.slt-act .btn{margin-left:4px;}
	</style>
	<div class="slt-wrap">
		<div class="slt-head"><span class="slt-count"></span></div>
		<table class="slt-tbl">
			<thead><tr><th style="width:48px">${__("Colour")}</th><th>${__("Tag")}</th><th class="num" style="width:90px">${__("Photos")}</th><th class="slt-act" style="width:230px">${__("Actions")}</th></tr></thead>
			<tbody></tbody>
		</table>
	</div>`);

	const $tb = root.find("tbody");

	page.set_primary_action(__("New Tag"), () => newTag(), "add");
	page.add_inner_button(__("Selection"), () => frappe.set_route("select-photos"));

	function load() {
		frappe.call(API + ".get_selection_tags", { with_counts: 1 }).then((r) => {
			const tags = r.message || [];
			root.find(".slt-count").text(__("{0} tags · {1} tagged photos",
				[tags.length, tags.reduce((a, t) => a + (t.count || 0), 0).toLocaleString()]));
			$tb.empty();
			if (!tags.length) { $tb.append(`<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px">${__("No tags yet — create one.")}</td></tr>`); return; }
			tags.forEach((t) => $tb.append(`
				<tr data-tag="${esc(t.tag)}">
					<td><input type="color" class="slt-color" value="${esc(t.color || "#6b7280")}"></td>
					<td class="slt-name">${esc(t.tag)}</td>
					<td class="num">${(t.count || 0).toLocaleString()}</td>
					<td class="slt-act">
						<button class="btn btn-xs btn-default slt-view" ${t.count ? "" : "disabled"}>${__("View")}</button>
						<button class="btn btn-xs btn-default slt-rename">${__("Rename")}</button>
						<button class="btn btn-xs btn-danger slt-del">${__("Delete")}</button>
					</td>
				</tr>`));
		});
	}

	$tb.on("change", ".slt-color", function () {
		const tag = $(this).closest("tr").data("tag");
		frappe.call(API + ".set_selection_tag_color", { tag_name: tag, color: this.value })
			.then(() => frappe.show_alert({ message: __("Colour updated"), indicator: "green" }));
	});

	$tb.on("click", ".slt-view", function () {
		const tag = $(this).closest("tr").data("tag");
		frappe.route_options = { tag };
		frappe.set_route("select-photos");
	});

	$tb.on("click", ".slt-rename", function () {
		const tag = $(this).closest("tr").data("tag");
		frappe.prompt(
			{ fieldname: "n", label: __("New name"), fieldtype: "Data", default: tag, reqd: 1 },
			(v) => frappe.call(API + ".rename_selection_tag", { old: tag, new: v.n })
				.then(() => { frappe.show_alert({ message: __("Renamed"), indicator: "green" }); load(); }),
			__("Rename tag")
		);
	});

	$tb.on("click", ".slt-del", function () {
		const tag = $(this).closest("tr").data("tag");
		frappe.confirm(
			__("Delete tag <b>{0}</b>? It will be removed from every photo that uses it.", [esc(tag)]),
			() => frappe.call(API + ".delete_selection_tag", { tag_name: tag })
				.then(() => { frappe.show_alert({ message: __("Deleted"), indicator: "red" }); load(); })
		);
	});

	function newTag() {
		const d = new frappe.ui.Dialog({
			title: __("New Tag"),
			fields: [
				{ fieldname: "tag_name", label: __("Tag Name"), fieldtype: "Data", reqd: 1 },
				{ fieldname: "color", label: __("Colour"), fieldtype: "Color", default: "#16a34a" },
			],
			primary_action_label: __("Create"),
			primary_action(v) {
				frappe.call(API + ".create_selection_tag", { tag_name: v.tag_name, color: v.color })
					.then(() => { d.hide(); frappe.show_alert({ message: __("Tag created"), indicator: "green" }); load(); });
			},
		});
		d.show();
	}

	load();
};
