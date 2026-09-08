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
		.sx-card.processing{border-left-color:#b8860b;}
		.sx-card.sent{border-left-color:#1f618d;}
		.sx-card.closed{border-left-color:#7f8c8d;opacity:.85;}
		.sx-stage{font-size:10px;font-weight:800;letter-spacing:.06em;border-radius:9px;
			padding:2px 9px;text-transform:uppercase;}
		.sx-stage.processing{background:rgba(184,134,11,.18);color:#8a6508;}
		.sx-stage.sent{background:rgba(31,97,141,.16);color:#1f618d;}
		.sx-stage.done{background:rgba(127,140,141,.16);color:var(--text-muted);}
		[data-theme="dark"] .sx-stage.processing{color:#e8b84a;}
		[data-theme="dark"] .sx-stage.sent{color:#7FB3DA;}
		.sx-collect{background:#1f618d;border:1px solid #1f618d;color:#fff;font-weight:700;
			border-radius:8px;padding:8px 18px;font-size:12.5px;cursor:pointer;}
		.sx-send{background:#b8860b;border:1px solid #b8860b;color:#fff;font-weight:700;
			border-radius:8px;padding:8px 18px;font-size:12.5px;cursor:pointer;}
		.sx-head{display:flex;gap:14px;align-items:center;flex-wrap:wrap;padding:12px 16px;
			background:var(--control-bg);border-bottom:1px solid var(--border-color);}
		.sx-head .nm{font-size:16px;font-weight:800;}
		.sx-head .meta{font-size:12px;color:var(--text-muted);}
		.sx-head .act{margin-left:auto;display:flex;gap:8px;}
		.sx-age{font-size:10.5px;font-weight:800;border-radius:9px;padding:1px 9px;
			background:rgba(184,134,11,.16);color:#b8860b;text-transform:uppercase;letter-spacing:.04em;}
		[data-theme="dark"] .sx-age{color:#e8b84a;}
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

	// The tray has three stages and each offers exactly one action, so the card
	// never asks the desk to remember what comes next: being worked on -> send it
	// out -> bring it back. Anything already back is history and offers nothing.
	function card(b, stage) {
		const live = stage !== "done";
		const act = stage === "processing"
			? `<button class="sx-send">${__("STONES CHANGED — send it out again")}</button>`
			: stage === "sent"
				? `<button class="sx-collect">${__("COLLECT — bring the tray back")}</button>`
				: "";
		return `<div class="sx-card ${live ? stage : "closed"}" data-name="${esc(b.name)}">
			<div class="sx-head">
				<span class="nm">${esc(b.name)}</span>
				<span class="sx-stage ${live ? stage : "done"}">${
					stage === "processing" ? __("PROCESSING")
						: stage === "sent" ? __("SENT") : esc(b.status)}</span>
				<span class="meta">${__("opened")} ${esc(b.opened_on)} ${__("by")} ${esc(b.owner_label || "")}${
					b.sent_on ? " · " + __("sent") + " " + esc(b.sent_on) : ""}${
					b.closed_on ? " · " + __("back") + " " + esc(b.closed_on) : ""}${
					b.center ? " · " + esc(b.center) : ""}</span>
				${stage === "sent" && b.days_out > 0
					? `<span class="sx-age">${__("{0} day(s) away", [b.days_out])}</span>`
					: stage === "processing" && b.days > 0
						? `<span class="sx-age">${__("{0} day(s) on the floor", [b.days])}</span>` : ""}
				<span class="meta"><b>${b.pieces}</b> ${__("piece(s)")} · ${flt(b.gross).toFixed(3)} g · ${
					flt(b.dmd_ct).toFixed(3)} ct</span>
				${act ? `<span class="act">${act}</span>` : ""}
			</div>
			${rows(b, stage === "processing")}
		</div>`;
	}

	function paint() {
		const openPieces = (DATA.pieces_processing || 0) + (DATA.pieces_sent || 0);
		const oldest = (DATA.open || []).reduce((a, b) => Math.max(a, b.days || 0), 0);
		root.find(".sx-kpis").html(`
			<div class="sx-kpi hold"><div class="k">${__("Pieces out")}</div><div class="v">${openPieces}</div></div>
			<div class="sx-kpi"><div class="k">${__("On the floor")}</div>
				<div class="v">${(DATA.processing || []).length}</div></div>
			<div class="sx-kpi"><div class="k">${__("Sent back out")}</div>
				<div class="v">${(DATA.sent || []).length}</div></div>
			<div class="sx-kpi"><div class="k">${__("Longest out")}</div><div class="v">${
				oldest ? __("{0}d", [oldest]) : "—"}</div></div>
			<div class="sx-kpi"><div class="k">${__("Gold out")}</div><div class="v">${
				(DATA.open || []).reduce((a, b) => a + flt(b.gross), 0).toFixed(1)}<span style="font-size:13px;font-weight:400;color:var(--text-muted);"> g</span></div></div>`);

		const proc = DATA.processing || [], sent = DATA.sent || [];
		root.find(".sx-body").html(`
			<div class="sx-sec">${__("On the floor — stones being changed")}</div>
			${proc.length ? proc.map((b) => card(b, "processing")).join("")
				: `<div class="sx-empty">${__("Nothing being worked on. A tray opens itself when the Confirm desk marks pieces STONE CHANGE.")}</div>`}
			${sent.length ? `<div class="sx-sec">${__("Sent back out")}</div>
				<p class="sx-note">${__("away at the lab again — these also show on Out of House")}</p>`
				+ sent.map((b) => card(b, "sent")).join("") : ""}
			${DATA.recent.length ? `<div class="sx-sec">${__("Back in")}</div>
				<p class="sx-note">${__("collected — their pieces are waiting to be confirmed again")}</p>`
				+ DATA.recent.map((b) => card(b, "done")).join("") : ""}`);
	}

	function load() {
		return frappe.call({ method: API + ".get_stone_changes", freeze: false })
			.then((r) => { DATA = r.message || DATA; paint(); });
	}

	// the whole tray comes back at once, the way a certification batch is collected
	// stones done: the tray goes back out to the lab, exactly like a first trip
	// nothing to fill in: the tray goes back to the centre it came from, and the
	// only question worth asking is whether it is going now
	root.on("click", ".sx-send", function () {
		const nm = $(this).closest(".sx-card").data("name");
		const b = (DATA.processing || []).find((x) => x.name === nm) || {};
		frappe.confirm(
			__("Send {0} out again?", [nm]) + "<br><span style='color:var(--text-muted);font-size:12.5px;'>"
			+ __("{0} piece(s) go back to {1} and show on Out of House until they return.",
				[b.pieces || 0, b.center || __("the same centre")]) + "</span>",
			() => {
				frappe.dom.freeze(__("Sending…"));
				frappe.call({ method: API + ".send_stone_change", args: { name: nm } })
					.then((rr) => {
						frappe.dom.unfreeze();
						const m = rr.message || {};
						frappe.show_alert({ indicator: "green", message:
							__("{0} sent — {1} piece(s) out again{2}.",
								[nm, m.count, m.center ? " · " + m.center : ""]) }, 6);
						load();
					}).catch(() => frappe.dom.unfreeze());
			});
	});

	// and back again — which is what puts the pieces in front of the Confirm desk
	root.on("click", ".sx-collect", function () {
		const nm = $(this).closest(".sx-card").data("name");
		const b = (DATA.sent || []).find((x) => x.name === nm) || {};
		frappe.confirm(
			__("Bring {0} back?", [nm]) + "<br><span style='color:var(--text-muted);font-size:12.5px;'>"
			+ __("{0} piece(s) go back In Stock and return to the Confirm desk.", [b.pieces || 0])
			+ "</span>",
			() => {
				frappe.dom.freeze(__("Collecting…"));
				frappe.call({ method: API + ".collect_stone_change", args: { name: nm } })
					.then((rr) => {
						frappe.dom.unfreeze();
						const m = rr.message || {};
						frappe.show_alert({ indicator: "green", message:
							__("{0} back — {1} piece(s) waiting to be confirmed.", [nm, m.count]) }, 7);
						load();
					}).catch(() => frappe.dom.unfreeze());
			});
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
