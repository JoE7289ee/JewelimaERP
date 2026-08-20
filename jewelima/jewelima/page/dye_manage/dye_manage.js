// Dye Manage — the hands-on page: move dyes between drawers, take them out,
// add new tooling, and open or retire drawers.
frappe.pages["dye-manage"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Dye Manage"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const S = { rows: [], sel: new Set(), q: "", drawer: "" };

	$(page.main).append(`
		<style>
		#page-dye-manage .container{max-width:100%;}
		.dm-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px;}
		.dm-tools input,.dm-tools select{border:1px solid var(--border-color);border-radius:8px;height:32px;
			padding:2px 10px;background:var(--fg-color);color:var(--text-color);font-size:13px;}
		.dm-box{border:1px solid var(--border-color);border-radius:12px;overflow:auto;background:var(--fg-color);max-height:52vh;}
		table.dm-t{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.dm-t th{position:sticky;top:0;background:var(--control-bg);font-size:10px;text-transform:uppercase;
			color:var(--text-muted);padding:6px 10px;text-align:left;border-bottom:2px solid var(--border-color);}
		table.dm-t td{padding:5px 10px;border-bottom:1px solid var(--border-color);white-space:nowrap;}
		.dm-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px;padding:10px 12px;
			border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);}
		.dm-bar select{border:1px solid var(--border-color);border-radius:7px;height:30px;background:var(--fg-color);color:var(--text-color);}
		.dm-n{font-weight:800;}
		</style>
		<div class="dm-tools">
			<input type="text" class="dm-q" placeholder="${__("search a design…")}" style="min-width:220px;">
			<select class="dm-drawer"><option value="">${__("Any drawer")}</option></select>
			<span style="margin-left:auto;display:flex;gap:6px;">
				<button class="btn btn-xs btn-default dm-newdye">+ ${__("Add dyes")}</button>
				<button class="btn btn-xs btn-default dm-newdrawer">+ ${__("Add drawer")}</button>
				<button class="btn btn-xs btn-default dm-deldrawer" style="color:#b02a2a;">${__("Remove drawer")}</button>
			</span>
		</div>
		<div class="dm-box"><table class="dm-t"><thead><tr>
			<th style="width:26px;"><input type="checkbox" class="dm-all" style="width:14px;height:14px;"></th>
			<th>${__("Dye")}</th><th>${__("Drawer")}</th><th>${__("Design(s)")}</th><th>${__("Variant")}</th><th>${__("Status")}</th>
		</tr></thead><tbody class="dm-body"></tbody></table></div>
		<div class="dm-bar" style="display:none;">
			<span class="dm-n"></span>
			<span>${__("→ drawer")}</span><select class="dm-to"></select>
			<button class="btn btn-sm btn-primary dm-move">${__("Move")}</button>
			<button class="btn btn-sm btn-default dm-out">${__("Take out of drawer")}</button>
		</div>`);
	const root = $(page.main);
	let DRAWERS = [];

	function paint() {
		root.find(".dm-body").html(S.rows.map((r) => {
			const banks = (r.banks || "").split("|");
			const designs = (r.design_nos || "").split(" | ").map((d, i) =>
				banks[i] ? `<b>${esc(d)}</b>` : esc(d)).join(" · ");
			return `<tr data-n="${esc(r.name)}">
				<td><input type="checkbox" class="dm-cb" ${S.sel.has(r.name) ? "checked" : ""} style="width:14px;height:14px;"></td>
				<td>${esc(r.name)}</td><td><b>${esc(r.drawer || "—")}</b></td>
				<td>${designs}</td><td>${esc(r.variant_note || "")}</td><td>${esc(r.status)}</td></tr>`;
		}).join("") || `<tr><td colspan="6" style="padding:26px;text-align:center;color:var(--text-muted);">${__("Search a design or pick a drawer.")}</td></tr>`);
		root.find(".dm-bar").toggle(S.sel.size > 0);
		root.find(".dm-n").text(__("{0} dye(s) ticked", [S.sel.size]));
	}
	function load() {
		if (!S.q && !S.drawer) { S.rows = []; S.sel.clear(); return paint(); }
		frappe.call({ method: API + ".get_dye_bank", freeze: false,
			args: { start: 0, limit: 400, q: S.q || null, drawer: S.drawer || null } })
			.then((r) => { S.rows = (r.message || {}).rows || []; S.sel.clear(); paint(); });
	}

	root.find(".dm-q").on("input", frappe.utils.debounce(function () { S.q = this.value; load(); }, 300));
	root.find(".dm-drawer").on("change", function () { S.drawer = this.value; load(); });
	root.on("change", ".dm-cb", function () {
		const n = $(this).closest("tr").data("n");
		this.checked ? S.sel.add(n) : S.sel.delete(n);
		root.find(".dm-bar").toggle(S.sel.size > 0);
		root.find(".dm-n").text(__("{0} dye(s) ticked", [S.sel.size]));
	});
	root.on("change", ".dm-all", function () {
		const on = this.checked;
		root.find(".dm-cb").each(function () {
			this.checked = on;
			const n = $(this).closest("tr").data("n");
			on ? S.sel.add(n) : S.sel.delete(n);
		});
		root.find(".dm-bar").toggle(S.sel.size > 0);
		root.find(".dm-n").text(__("{0} dye(s) ticked", [S.sel.size]));
	});
	function move(to) {
		frappe.call({ method: API + ".move_dyes", args: { names: JSON.stringify([...S.sel]), to_drawer: to } })
			.then((r) => {
				const m = r.message || {};
				frappe.show_alert({ message: to ? __("{0} moved → drawer {1}", [m.moved, to])
					: __("{0} taken out of their drawer", [m.moved]), indicator: "green" }, 4);
				load(); loadDrawers();
			});
	}
	root.on("click", ".dm-move", () => {
		const to = root.find(".dm-to").val();
		if (!to) return frappe.msgprint(__("Pick the destination drawer."));
		move(to);
	});
	root.on("click", ".dm-out", () => move(null));

	root.on("click", ".dm-newdrawer", () => {
		frappe.prompt([{ fieldname: "no", fieldtype: "Data", label: __("Drawer number"), reqd: 1 },
			{ fieldname: "note", fieldtype: "Data", label: __("Note (shelf, cabinet…)") }],
			(v) => frappe.call({ method: API + ".add_dye_drawer", args: { drawer_no: v.no, note: v.note || "" } })
				.then(() => { frappe.show_alert({ message: __("Drawer {0} added.", [v.no]), indicator: "green" }, 4); loadDrawers(); }),
			__("New drawer"));
	});
	root.on("click", ".dm-deldrawer", () => {
		frappe.prompt([{ fieldname: "no", fieldtype: "Select", label: __("Drawer"), reqd: 1,
			options: DRAWERS.join("\n") }],
			(v) => frappe.call({ method: API + ".remove_dye_drawer", args: { drawer_no: v.no } })
				.then(() => { frappe.show_alert({ message: __("Drawer {0} removed.", [v.no]), indicator: "green" }, 4); loadDrawers(); }),
			__("Remove an empty drawer"));
	});
	root.on("click", ".dm-newdye", () => {
		frappe.prompt([
			{ fieldname: "design", fieldtype: "Data", label: __("Design number"), reqd: 1 },
			{ fieldname: "count", fieldtype: "Int", label: __("How many dyes"), default: 1, reqd: 1 },
			{ fieldname: "drawer", fieldtype: "Select", label: __("Into drawer"), options: [""].concat(DRAWERS).join("\n") },
			{ fieldname: "note", fieldtype: "Data", label: __("Variant note (STUD, RING…)") },
		], (v) => frappe.call({ method: API + ".add_dyes", args: {
			drawer: v.drawer || null, design_no: v.design, count: v.count || 1, note: v.note || "" } })
			.then((r) => {
				const m = r.message || {};
				frappe.show_alert({ message: __("{0} dye(s) added{1}.", [(m.made || []).length,
					m.matched ? "" : " — " + __("no card in the bank matched")]), indicator: m.matched ? "green" : "orange" }, 6);
				load();
			}), __("New dyes"));
	});

	function loadDrawers() {
		frappe.db.get_list("Dye Drawer", { fields: ["name"], limit: 0 }).then((rows) => {
			DRAWERS = (rows || []).map((x) => x.name).sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0));
			root.find(".dm-drawer").html(`<option value="">${__("Any drawer")}</option>` +
				DRAWERS.map((d) => `<option>${esc(d)}</option>`).join(""));
			root.find(".dm-to").html(DRAWERS.map((d) => `<option>${esc(d)}</option>`).join(""));
		});
	}
	loadDrawers();
};
