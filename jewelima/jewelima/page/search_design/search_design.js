// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Search Design (Design Bank) — find ANY design number, retired included.
// Tiles show the RAW scan unless the card is Approved (then the info card);
// clicking a tile opens it BIG with Download raw / Prioritise / Retire —
// the latter two hidden from read-only (Jewelima Info) users.
// Route: /app/search-design

frappe.pages["search-design"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Search Design", single_column: true });
	const API = "jewelima.jewelima.design_bank_api";
	const esc = frappe.utils.escape_html;
	let timer = null;

	$(page.main).append(`
		<style>
		.sd-bar{max-width:360px;margin-bottom:14px;}
		.sd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;}
		.sd-tile{border:2px solid var(--border-color);border-radius:9px;overflow:hidden;background:#fff;cursor:pointer;text-align:center;position:relative;}
		.sd-tile:hover{border-color:#1f618d;}
		.sd-tile img{width:100%;height:200px;object-fit:contain;display:block;}
		.sd-tile .n{font-weight:700;font-size:13px;padding:5px 5px 8px;}
		.sd-st{position:absolute;top:6px;right:6px;font-size:9.5px;font-weight:700;border-radius:8px;padding:1px 7px;color:#fff;}
		.sd-st.Approved{background:#2e7d32;}.sd-st.Pending{background:#7f8c8d;}.sd-st.Retired{background:#b02a2a;}
		.sd-hint{color:var(--text-muted);padding:24px;font-size:13px;}
		</style>
		<div class="sd-bar"><input type="text" class="form-control sd-q" placeholder="${__("search any design no — retired included…")}"></div>
		<div class="sd-grid"></div>
		<div class="sd-hint">${__("Type at least 2 characters.")}</div>
	`);
	const root = $(page.main);
	root.find(".sd-q").on("input", function () {
		const v = this.value.trim();
		clearTimeout(timer);
		timer = setTimeout(() => search(v), 300);
	});
	setTimeout(() => root.find(".sd-q").focus(), 200);

	function search(q) {
		if (q.length < 2) { root.find(".sd-grid").empty(); root.find(".sd-hint").show().text(__("Type at least 2 characters.")); return; }
		jewelima.busyCall(root.find(".sd-grid"), __("Searching…"), { method: API + ".search_designs", args: { q }, freeze: false }).then((r) => {
			const rows = (r.message || {}).rows || [];
			lastRows = rows;
			root.find(".sd-hint").toggle(!rows.length).text(rows.length ? "" : __("No design matches {0}.", [q]));
			root.find(".sd-grid").html(rows.map((d, i) => `
				<div class="sd-tile" data-i="${i}" data-raw="${esc(d.raw)}" data-no="${esc(d.design_no)}">
					<span class="sd-st ${esc(d.status)}">${esc(d.status)}</span>
					<img loading="lazy" src="${esc(d.display)}" onerror="this.style.opacity=.2">
					<div class="n">${esc(d.design_no)}</div>
				</div>`).join(""));
		});
	}
	let lastRows = [];
	const canManage = frappe.user.has_role("Jewelima Design Bank")
		|| frappe.user.has_role("Jewelima Design Approver")
		|| (frappe.user.has_role("System Manager") || frappe.user.has_role("JW Manager"));

	function download(raw, name) {
		if (!raw) return frappe.show_alert({ message: __("No raw image on this card."), indicator: "orange" }, 3);
		const a = document.createElement("a");
		a.href = raw;
		a.download = name;
		document.body.appendChild(a);
		a.click();
		a.remove();
	}

	// click = the BIG view: image + download, and prioritise/retire for managers
	root.on("click", ".sd-tile", function () {
		const d = lastRows[+$(this).data("i")];
		if (!d) return;
		const dlg = new frappe.ui.Dialog({ title: d.design_no, size: "large",
			fields: [{ fieldtype: "HTML", fieldname: "b" }] });
		dlg.get_field("b").$wrapper.html(`
			<div style="text-align:center;">
				<div style="margin-bottom:8px;">
					<span style="font-size:10px;font-weight:700;border-radius:8px;padding:2px 9px;color:#fff;background:${d.status === "Approved" ? "#2e7d32" : d.status === "Retired" ? "#b02a2a" : "#7f8c8d"};">${esc(d.status)}</span>
					${d.priority ? `<span style="font-size:10px;font-weight:700;border-radius:8px;padding:2px 9px;color:#fff;background:#1f618d;margin-left:6px;">P${d.priority}</span>` : ""}
				</div>
				<img src="${esc(d.display)}" style="max-width:100%;max-height:62vh;border:1px solid var(--border-color);border-radius:8px;background:#fff;">
				<div style="margin-top:14px;display:flex;gap:10px;justify-content:center;">
					<button class="btn btn-default sd-dl">${__("Download raw")}</button>
					${canManage ? `<button class="btn btn-sm sd-pr" style="background:#1f618d;border-color:#1f618d;color:#fff;">${__("Prioritise")}</button>` : ""}
					${canManage && d.status !== "Retired" ? `<button class="btn btn-sm sd-rt" style="background:#b02a2a;border-color:#b02a2a;color:#fff;">${__("Retire")}</button>` : ""}
				</div>
			</div>`);
		dlg.$wrapper.on("click", ".sd-dl", () => download(d.raw, d.design_no));
		dlg.$wrapper.on("click", ".sd-pr", () => {
			dlg.hide();
			frappe.prompt([{ fieldname: "p", fieldtype: "Int", label: __("Priority (higher = sooner in Review)"), default: 10, reqd: 1 }],
				(v) => frappe.call({ method: API + ".set_design_priority",
					args: { names: JSON.stringify([d.name]), priority: v.p } }).then(() => {
					frappe.show_alert({ message: __("{0} set to priority {1}.", [d.design_no, v.p]), indicator: "green" }, 4);
					search(root.find(".sd-q").val().trim());
				}), __("Prioritise for review"), __("Set"));
		});
		dlg.$wrapper.on("click", ".sd-rt", () => {
			frappe.call({ method: API + ".set_design_retired", args: { names: JSON.stringify([d.name]) } })
				.then(() => {
					dlg.hide();
					frappe.show_alert({ message: __("{0} retired.", [d.design_no]), indicator: "red" }, 4);
					search(root.find(".sd-q").val().trim());
				});
		});
		dlg.show();
	});
};
