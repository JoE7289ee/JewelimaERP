// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Providers — who makes the pieces in the Selection catalog (plain Suppliers
// underneath, so the same party works everywhere in ERPNext). Add, rename
// (cascades to every photo), delete (refused while photos still point at it),
// or jump to the Selection page filtered by that provider.
// Route: /app/selection-providers

frappe.pages["selection-providers"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Providers", single_column: true });
	const root = $(page.main);
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;

	root.append(`
	<style>
	.pv-wrap{max-width:680px;margin:6px auto 40px;}
	.pv-head{display:flex;align-items:center;margin:2px 0 12px;color:var(--text-muted);font-size:13px;}
	table.pv-tbl{width:100%;border-collapse:separate;border-spacing:0;background:var(--fg-color);
		border:1px solid var(--border-color);border-radius:8px;overflow:hidden;font-size:13px;}
	table.pv-tbl th{background:var(--control-bg);border-bottom:1px solid var(--border-color);padding:8px 12px;text-align:left;font-weight:700;}
	table.pv-tbl th.num,table.pv-tbl td.num{text-align:right;font-variant-numeric:tabular-nums;}
	table.pv-tbl td{border-bottom:1px solid var(--border-color);padding:7px 12px;vertical-align:middle;}
	table.pv-tbl tbody tr:last-child td{border-bottom:0;}
	table.pv-tbl tbody tr:hover td{background:var(--control-bg);}
	.pv-name{font-weight:600;}
	.pv-act{text-align:right;white-space:nowrap;}
	.pv-act .btn{margin-left:4px;}
	</style>
	<div class="pv-wrap">
		<div class="pv-head"><span class="pv-count"></span></div>
		<table class="pv-tbl">
			<thead><tr><th>${__("Provider")}</th><th class="num" style="width:90px">${__("Photos")}</th><th class="pv-act" style="width:230px">${__("Actions")}</th></tr></thead>
			<tbody></tbody>
		</table>
	</div>`);

	const $tb = root.find("tbody");

	page.set_primary_action(__("New Provider"), () => newProvider(), "add");
	page.add_inner_button(__("Selection"), () => frappe.set_route("select-photos"));

	function load() {
		frappe.call(API + ".get_selection_providers").then((r) => {
			const rows = r.message || [];
			root.find(".pv-count").text(__("{0} provider(s) · {1} photos assigned",
				[rows.length, rows.reduce((a, p) => a + (p.count || 0), 0).toLocaleString()]));
			$tb.empty();
			if (!rows.length) { $tb.append(`<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:20px">${__("No providers yet — create one.")}</td></tr>`); return; }
			rows.forEach((p) => $tb.append(`
				<tr data-name="${esc(p.name)}">
					<td class="pv-name">${esc(p.supplier_name || p.name)}</td>
					<td class="num">${(p.count || 0).toLocaleString()}</td>
					<td class="pv-act">
						<button class="btn btn-xs btn-default pv-view" ${p.count ? "" : "disabled"}>${__("View")}</button>
						<button class="btn btn-xs btn-default pv-rename">${__("Rename")}</button>
						<button class="btn btn-xs btn-danger pv-del" ${p.count ? "disabled" : ""}>${__("Delete")}</button>
					</td>
				</tr>`));
		});
	}

	$tb.on("click", ".pv-view", function () {
		const name = $(this).closest("tr").data("name");
		frappe.route_options = { provider: name };
		frappe.set_route("select-photos");
	});

	$tb.on("click", ".pv-rename", function () {
		const name = $(this).closest("tr").data("name");
		frappe.prompt(
			{ fieldname: "n", label: __("New name"), fieldtype: "Data", default: name, reqd: 1 },
			(v) => frappe.call(API + ".rename_selection_provider", { old: name, new: v.n })
				.then(() => { frappe.show_alert({ message: __("Renamed"), indicator: "green" }); load(); }),
			__("Rename provider")
		);
	});

	$tb.on("click", ".pv-del", function () {
		const name = $(this).closest("tr").data("name");
		frappe.confirm(
			__("Delete provider <b>{0}</b>?", [esc(name)]),
			() => frappe.call(API + ".delete_selection_provider", { name })
				.then(() => { frappe.show_alert({ message: __("Deleted"), indicator: "red" }); load(); })
		);
	});

	function newProvider() {
		frappe.prompt(
			{ fieldname: "n", label: __("Provider Name"), fieldtype: "Data", reqd: 1 },
			(v) => frappe.call(API + ".create_selection_provider", { provider_name: v.n })
				.then(() => { frappe.show_alert({ message: __("Provider created"), indicator: "green" }); load(); }),
			__("New Provider")
		);
	}

	load();
};
