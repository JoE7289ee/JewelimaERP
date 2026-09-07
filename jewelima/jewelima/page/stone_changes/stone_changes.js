// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Stone Changes (Delivery > Certification) — the pieces the lab handed back
// because a stone has to be replaced.
//
// A batch is opened by the Confirm desk: everything marked STONE CHANGE in one
// save becomes one batch, and its materials leave Finished Goods for the Stone
// Change warehouse. The pieces are not sellable and not at a lab — they owe work
// on our own floor, and this is where that work is tracked.
//
// Closing a batch brings the whole tray back: stock returns to Finished Goods,
// every piece goes back In Stock in its own bucket, and from there it is an
// ordinary finished piece again — scan it onto a fresh certification batch to
// send it back out.
// Route: /app/stone-changes

frappe.pages["stone-changes"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Stone Changes"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const root = $(page.main);
	let DATA = { open: [], recent: [], pieces_open: 0 };

	root.append(`
		<style>
		#page-stone-changes .container{max-width:100%;}
		.sx-kpis{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;}
		.sx-kpi{flex:1 1 160px;border:1px solid var(--border-color);border-radius:12px;
			padding:11px 15px;background:var(--fg-color);}
		.sx-kpi .k{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);}
		.sx-kpi .v{font-size:24px;font-weight:800;line-height:1.2;font-variant-numeric:tabular-nums;}
		.sx-kpi.hold{border-left:3px solid #b8860b;} .sx-kpi.hold .v{color:#b8860b;}
		.sx-sec{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;
			color:var(--text-muted);margin:22px 0 10px;padding-bottom:5px;
			border-bottom:1px solid var(--border-color);}
		.sx-card{border:1px solid var(--border-color);border-left:3px solid #b8860b;
			border-radius:12px;background:var(--fg-color);margin-bottom:14px;overflow:hidden;}
		.sx-card.closed{border-left-color:#7f8c8d;opacity:.85;}
		.sx-head{display:flex;gap:14px;align-items:center;flex-wrap:wrap;padding:12px 16px;
			background:var(--control-bg);border-bottom:1px solid var(--border-color);}
		.sx-head .nm{font-size:16px;font-weight:800;}
		.sx-head .meta{font-size:12px;color:var(--text-muted);}
		.sx-head .act{margin-left:auto;display:flex;gap:8px;}
		.sx-age{font-size:10.5px;font-weight:800;border-radius:9px;padding:1px 9px;
			background:rgba(184,134,11,.16);color:#b8860b;text-transform:uppercase;letter-spacing:.04em;}
		[data-theme="dark"] .sx-age{color:#e8b84a;}
		.sx-close{background:#2e7d32;border:1px solid #2e7d32;color:#fff;font-weight:700;
			border-radius:8px;padding:8px 18px;font-size:12.5px;cursor:pointer;}
		table.sx-t{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.sx-t th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em;
			color:var(--text-muted);padding:7px 16px;border-bottom:1px solid var(--border-color);}
		table.sx-t td{padding:7px 16px;border-bottom:1px solid var(--border-color);}
		table.sx-t tr:last-child td{border-bottom:0;}
		table.sx-t td.num,table.sx-t th.num{text-align:right;font-variant-numeric:tabular-nums;}
		.sx-note{color:var(--text-muted);cursor:pointer;border-bottom:1px dashed var(--border-color);}
		.sx-note.set{color:var(--text-color);border-bottom-style:solid;}
		.sx-empty{padding:26px;text-align:center;color:var(--text-muted);font-size:13px;
			border:1px dashed var(--border-color);border-radius:12px;}
		</style>
		<div class="sx-kpis"></div>
		<div class="sx-body"></div>
	`);

	function rows(b, open) {
		return `<table class="sx-t"><thead><tr>
			<th>${__("Piece")}</th><th>${__("Design")}</th><th>${__("Type")}</th>
			<th class="num">${__("Gross g")}</th><th class="num">${__("Dmd ct")}</th>
			<th>${__("From")}</th><th>${__("What has to change")}</th>
		</tr></thead><tbody>${b.items.map((i) => `<tr>
			<td><b>${esc(i.order_bag)}</b></td>
			<td>${esc(i.design || "")}</td>
			<td>${esc(i.design_type || "")}</td>
			<td class="num">${flt(i.gross).toFixed(3)}</td>
			<td class="num">${flt(i.dmd_ct).toFixed(3)}</td>
			<td>${esc(i.from_certification || "")}</td>
			<td>${open
				? `<span class="sx-note ${i.note ? "set" : ""}" data-b="${esc(b.name)}" data-r="${esc(i.name)}">${
					esc(i.note || __("add a note"))}</span>`
				: esc(i.note || "")}</td>
		</tr>`).join("")}</tbody></table>`;
	}

	function card(b, open) {
		return `<div class="sx-card ${open ? "" : "closed"}" data-name="${esc(b.name)}">
			<div class="sx-head">
				<span class="nm">${esc(b.name)}</span>
				<span class="meta">${__("opened")} ${esc(b.opened_on)} ${__("by")} ${esc(b.owner_label || "")}${
					b.closed_on ? " · " + __("closed") + " " + esc(b.closed_on) : ""}</span>
				${open && b.days > 0 ? `<span class="sx-age">${__("{0} day(s) out", [b.days])}</span>` : ""}
				<span class="meta"><b>${b.pieces}</b> ${__("piece(s)")} · ${flt(b.gross).toFixed(3)} g · ${
					flt(b.dmd_ct).toFixed(3)} ct</span>
				${open ? `<span class="act"><button class="sx-close">${
					__("STONES CHANGED — bring the tray back")}</button></span>` : ""}
			</div>
			${rows(b, open)}
		</div>`;
	}

	function paint() {
		const openPieces = DATA.pieces_open || 0;
		const oldest = DATA.open.reduce((a, b) => Math.max(a, b.days || 0), 0);
		root.find(".sx-kpis").html(`
			<div class="sx-kpi hold"><div class="k">${__("Pieces out")}</div><div class="v">${openPieces}</div></div>
			<div class="sx-kpi"><div class="k">${__("Open batches")}</div><div class="v">${DATA.open.length}</div></div>
			<div class="sx-kpi"><div class="k">${__("Longest out")}</div><div class="v">${
				oldest ? __("{0}d", [oldest]) : "—"}</div></div>
			<div class="sx-kpi"><div class="k">${__("Gold held")}</div><div class="v">${
				DATA.open.reduce((a, b) => a + flt(b.gross), 0).toFixed(1)}<span style="font-size:13px;font-weight:400;color:var(--text-muted);"> g</span></div></div>`);

		root.find(".sx-body").html(`
			<div class="sx-sec">${__("Out for a stone change")}</div>
			${DATA.open.length ? DATA.open.map((b) => card(b, true)).join("")
				: `<div class="sx-empty">${__("Nothing out. A batch opens itself when the Confirm desk marks pieces STONE CHANGE.")}</div>`}
			${DATA.recent.length ? `<div class="sx-sec">${__("Back in")}</div>`
				+ DATA.recent.map((b) => card(b, false)).join("") : ""}`);
	}

	function load() {
		return frappe.call({ method: API + ".get_stone_changes", freeze: false })
			.then((r) => { DATA = r.message || DATA; paint(); });
	}

	// the whole tray comes back at once, the way a certification batch is collected
	root.on("click", ".sx-close", function () {
		const nm = $(this).closest(".sx-card").data("name");
		const b = DATA.open.find((x) => x.name === nm) || {};
		const d = new frappe.ui.Dialog({
			title: __("Bring {0} back", [nm]),
			fields: [
				{ fieldtype: "HTML", fieldname: "note" },
				{ fieldtype: "Small Text", fieldname: "remarks", label: __("Anything to record") },
			],
			primary_action_label: __("Stones changed — back in stock"),
			primary_action(v) {
				d.hide();
				frappe.dom.freeze(__("Bringing the tray back…"));
				frappe.call({ method: API + ".close_stone_change",
					args: { name: nm, remarks: v.remarks || "" } })
					.then((rr) => {
						frappe.dom.unfreeze();
						frappe.show_alert({ indicator: "green", message:
							__("{0} closed — {1} piece(s) back In Stock.",
								[nm, (rr.message || {}).count]) }, 6);
						load();
					}).catch(() => frappe.dom.unfreeze());
			},
		});
		d.fields_dict.note.$wrapper.html(`<div style="font-size:12.5px;color:var(--text-muted);">${
			__("{0} piece(s) move Stone Change → Finished Goods and go back In Stock in their own buckets. From there, scan them onto a new certification batch to send them out again.",
				[b.pieces || 0])}</div>`);
		d.show();
	});

	// what the lab actually asked for, written where the bench will read it
	root.on("click", ".sx-note", function () {
		const $n = $(this);
		const d = new frappe.ui.Dialog({
			title: __("What has to change"),
			fields: [{ fieldtype: "Small Text", fieldname: "note", label: __("Note"),
				default: $n.hasClass("set") ? $n.text() : "" }],
			primary_action_label: __("Save"),
			primary_action(v) {
				d.hide();
				frappe.call({ method: API + ".set_stone_change_note",
					args: { name: $n.data("b"), row: $n.data("r"), note: v.note || "" } })
					.then(() => load());
			},
		});
		d.show();
	});

	page.set_primary_action(__("Refresh"), load, "refresh");
	frappe.pages["stone-changes"].on_page_show = load;
	load();
};
