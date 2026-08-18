// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Edit Order — CARD-scan flow: scan (or type) a card, its plan comes up, change
// its MATERIALS. A card whose plan differs from its design wears a yellow
// "edited vs design" badge; one click resets to the design's original; a made
// ornament is locked. Together with Place Order these are the only doors where
// an order's materials change (change-logging comes later — parked).
// Route: /app/edit-order

frappe.pages["edit-order"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Edit Order", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	let CARD = null;

	$(page.main).append(`
		<style>
		#page-edit-order .container{max-width:100%;}
		.eo-scanwrap{display:flex;gap:12px;align-items:end;margin-bottom:14px;}
		.eo-scanwrap .frappe-control{margin:0;flex:0 0 280px;}
		.eo-scanwrap .control-label{font-size:11px;color:var(--text-muted);}
		.eo-card{display:flex;gap:22px;border:1px solid var(--border-color);border-radius:12px;
			background:var(--fg-color);padding:16px 20px;align-items:flex-start;max-width:1000px;}
		.eo-card img{width:190px;height:190px;object-fit:contain;background:#111;border-radius:9px;flex:0 0 auto;}
		.eo-main{flex:1 1 auto;}
		.eo-title{font-size:20px;font-weight:800;letter-spacing:.4px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
		.eo-badge{display:inline-block;font-size:10.5px;font-weight:800;padding:2px 10px;border-radius:9px;}
		.eo-badge.edited{background:#fff3cd;color:#8a6d00;}
		.eo-badge.locked{background:#fdecea;color:#b02a2a;}
		.eo-meta{font-size:13px;color:var(--text-muted);margin:6px 0 12px;line-height:1.7;}
		.eo-meta b{color:var(--text-color);}
		.eo-boxes{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;}
		.eo-b{border:1px solid var(--border-color);border-radius:8px;padding:5px 16px;text-align:center;background:var(--control-bg);min-width:92px;}
		.eo-b .k{font-size:10px;font-weight:700;letter-spacing:.06em;color:var(--text-muted);}
		.eo-b .v{font-size:15px;font-weight:800;font-variant-numeric:tabular-nums;}
		.eo-bom{font-size:12.5px;margin-bottom:14px;}
		.eo-bom table{border-collapse:collapse;}
		.eo-bom td,.eo-bom th{padding:3px 14px 3px 0;text-align:left;}
		.eo-bom th{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);}
		.eo-bom td.num{text-align:right;font-variant-numeric:tabular-nums;}
		.eo-mat{background:#1461d2;border:none;color:#fff;font-weight:800;letter-spacing:.3px;
			padding:10px 30px;border-radius:8px;font-size:14px;cursor:pointer;}
		.eo-mat:hover{background:#0f4ca8;}
		.eo-mat:disabled{opacity:.4;cursor:default;}
		.eo-none{padding:46px;text-align:center;color:var(--text-muted);max-width:1000px;}
		</style>
		<div class="eo-scanwrap"><div class="eo-scan"></div></div>
		<div class="eo-body"><div class="eo-none">${__("Scan a card to edit its materials.")}</div></div>
	`);
	const root = $(page.main);

	const scan = frappe.ui.form.make_control({
		df: { fieldtype: "Data", label: __("Scan Card"), fieldname: "scan", placeholder: __("E0123.4 …") },
		parent: root.find(".eo-scan").get(0), render_input: true,
	});
	scan.refresh();
	scan.$input.on("keydown", (e) => {
		if (e.key !== "Enter") return;
		e.preventDefault();
		const v = (scan.get_value() || "").trim();
		if (v) load(v);
	});
	setTimeout(() => scan.$input.focus(), 300);

	function load(name) {
		frappe.call({ method: API + ".get_card_for_edit", args: { order_bag: name } })
			.then((r) => {
				CARD = r.message;
				paint();
				scan.set_value("");
			})
			.catch(() => {
				root.find(".eo-body").html(`<div class="eo-none" style="color:#b02a2a;">${__("Card {0} not found.", [esc(name)])}</div>`);
			});
	}

	function bomTable(rows, title) {
		if (!rows.length) return "";
		return `<div class="eo-bom"><b style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;">${title}</b>
			<table><tr><th>${__("Item")}</th><th>${__("Qty")}</th><th>${__("Weight")}</th></tr>
			${rows.map((r) => `<tr><td>${esc(r.item)}</td><td class="num">${r.qty || 0}</td><td class="num">${(r.weight || 0).toFixed(3)}</td></tr>`).join("")}
			</table></div>`;
	}

	function paint() {
		const c = CARD;
		const badge = c.is_finished
			? `<span class="eo-badge locked">${__("ORNAMENT MADE — locked")}</span>`
			: (c.diverged ? `<span class="eo-badge edited">${__("edited vs design")}</span>` : "");
		root.find(".eo-body").html(`
			<div class="eo-card">
				<img src="${encodeURI(c.image || "")}" onerror="this.style.visibility='hidden'">
				<div class="eo-main">
					<div class="eo-title">${esc(c.name)} ${badge}</div>
					<div class="eo-meta">
						${__("Design")} <b>${esc(c.design || "—")}</b> · ${__("Qty")} <b>${c.qty || 0}</b>
						${c.size ? " · " + __("Size") + " <b>" + esc(c.size) + "</b>" : ""}<br>
						${__("Party")} <b>${esc(c.customer || "—")}</b> · ${esc(c.salesman || "")}
						· ${__("Due")} <b>${c.due_date ? frappe.datetime.str_to_user(c.due_date) : "—"}</b><br>
						${__("At")} <b>${esc(c.location || "—")}</b> · ${esc(c.stock_status || "")}
						· <a class="jw-card-link" href="/app/card-info" data-card="${esc(c.name)}">${__("open card")}</a>
					</div>
					<div class="eo-boxes">
						<div class="eo-b"><div class="k">${__("GROSS g")}</div><div class="v">${(c.gross_weight || 0).toFixed(3)}</div></div>
						<div class="eo-b"><div class="k">${__("NETT g")}</div><div class="v">${(c.nett_weight || 0).toFixed(3)}</div></div>
						<div class="eo-b"><div class="k">${__("PURITY %")}</div><div class="v">${(c.purity || 0).toFixed(1)}</div></div>
					</div>
					${bomTable(c.bom, __("Current plan"))}
					<button class="eo-mat" ${c.is_finished ? "disabled" : ""}>${__("EDIT MATERIALS")}</button>
				</div>
			</div>`);
	}

	root.on("click", ".eo-mat", () => openMaterials(CARD));

	function openMaterials(bag) {
		const d = new frappe.ui.Dialog({
			title: __("Materials — {0} ({1})", [bag.name, bag.design || __("no design")]),
			size: "large",
			fields: [
				{ fieldtype: "HTML", fieldname: "hint" },
				{ fieldtype: "Table", fieldname: "materials", label: __("Plan BOM"),
					cannot_add_rows: false, in_place_edit: true,
					data: bag.bom.map((r) => ({ ...r })),
					fields: [
						{ fieldtype: "Link", fieldname: "item", label: __("Item"), options: "Item",
							in_list_view: 1, columns: 5, reqd: 1 },
						{ fieldtype: "Float", fieldname: "qty", label: __("Qty (pcs)"), in_list_view: 1, columns: 2 },
						{ fieldtype: "Float", fieldname: "weight", label: __("Weight (g / ct)"), in_list_view: 1, columns: 3 },
					] },
			],
			primary_action_label: __("Save Materials"),
			primary_action: () => {
				const rows = (d.get_value("materials") || []).filter((r) => r.item);
				if (!rows.length) return frappe.show_alert({ message: __("At least one material."), indicator: "orange" }, 4);
				d.hide();
				frappe.dom.freeze(__("Saving..."));
				frappe.call({ method: API + ".save_bag_bom", args: {
					order_bag: bag.name, source: "Edit Order",
					rows: JSON.stringify(rows.map((r) => ({ item: r.item, qty: r.qty || 0, weight: r.weight || 0 }))),
				} }).then(() => {
					frappe.dom.unfreeze();
					frappe.show_alert({ message: __("{0} — plan updated and re-totalled.", [bag.name]), indicator: "green" }, 3);
					load(bag.name);
				}).catch(() => frappe.dom.unfreeze());
			},
			secondary_action_label: bag.design_bom.length ? __("Reset to design") : null,
			secondary_action: bag.design_bom.length ? () => {
				frappe.confirm(__("Replace this card's plan with the design's original BOM?"), () => {
					d.hide();
					frappe.call({ method: API + ".save_bag_bom", args: {
						order_bag: bag.name, source: "Edit Order", rows: JSON.stringify(bag.design_bom),
					} }).then(() => {
						frappe.show_alert({ message: __("Back to the design's BOM."), indicator: "green" }, 3);
						load(bag.name);
					});
				});
			} : null,
		});
		if (bag.design_bom.length) {
			const orig = bag.design_bom.map((r) => `${esc(r.item)} ×${r.qty} (${r.weight})`).join(" · ");
			d.fields_dict.hint.$wrapper.html(
				`<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">
					${__("Design {0} original:", [esc(bag.design)])} ${orig}</div>`);
		}
		d.show();
	}

	// arriving with a card pre-picked
	if (frappe.route_options && frappe.route_options.order_bag) {
		load(frappe.route_options.order_bag);
		frappe.route_options = null;
	}
	page.add_inner_button(__("Place Order"), () => frappe.set_route("place-order"));
};
