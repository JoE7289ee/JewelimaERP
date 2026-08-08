// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Repair Setup — the module's masters in one place: parties (diamond rate
// + party extras like SCREW MAKING), item types (per-piece polish MC, the
// number that used to hide inside the sheet's IF formula), and the global
// rate constants. The warehouse link is parked here for Phase 2 (stock
// issue of added gold / stones). Route: /app/repair-setup

frappe.pages["repair-setup"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Repair Setup", single_column: true });
	const API = "jewelima.jewelima.repair_api";
	const esc = frappe.utils.escape_html;
	let BOOT = null;

	$(page.main).append(`
		<style>
		#page-repair-setup .container{max-width:100%;}
		.rs-cols{display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;}
		.rs-col{flex:1;min-width:340px;}
		.rs-h{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px;}
		table.rs-t{width:100%;border-collapse:collapse;font-size:12px;background:var(--fg-color);}
		table.rs-t th{background:var(--control-bg);font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);padding:5px 8px;border:1px solid var(--border-color);text-align:left;}
		table.rs-t td{border:1px solid var(--border-color);padding:3px 6px;}
		table.rs-t td input{width:100%;border:none;background:transparent;color:var(--text-color);font-size:12px;padding:3px 2px;outline:none;}
		.rs-x{color:#b02a2a;font-weight:800;cursor:pointer;padding:0 6px;}
		.rs-btn{border:none;color:#fff;font-weight:800;padding:8px 16px;border-radius:8px;cursor:pointer;background:#2e7d32;margin-top:8px;}
		.rs-extras{font-size:10.5px;color:var(--text-muted);cursor:pointer;}
		.rs-set{display:grid;grid-template-columns:auto 130px;gap:6px 12px;align-items:center;font-size:12.5px;max-width:420px;}
		.rs-set input{border:1px solid var(--border-color);border-radius:7px;padding:6px 9px;font-size:12.5px;background:var(--fg-color);color:var(--text-color);}
		</style>
		<div class="rs-cols">
			<div class="rs-col">
				<div class="rs-h">${__("Parties — diamond rate / ct")}</div>
				<div class="rs-parties"></div>
			</div>
			<div class="rs-col">
				<div class="rs-h">${__("Item types — polish MC / pc")}</div>
				<div class="rs-types"></div>
			</div>
			<div class="rs-col">
				<div class="rs-h">${__("Rates & constants")}</div>
				<div class="rs-settings"></div>
			</div>
		</div>
	`);
	const root = $(page.main);

	function boot() {
		frappe.call({ method: API + ".get_repair_boot" }).then((r) => {
			BOOT = r.message || {};
			paint();
		});
	}

	function paint() {
		root.find(".rs-parties").html(`
			<table class="rs-t"><thead><tr><th>${__("Party")}</th><th style="width:110px;">${__("Dia rate")}</th><th style="width:120px;">${__("Extras")}</th></tr></thead><tbody>
			${(BOOT.parties || []).map((p) => `<tr>
				<td><b>${esc(p.name)}</b>${p.active ? "" : ` <span style="color:#b02a2a;font-size:10px;">${__("inactive")}</span>`}</td>
				<td><input type="number" class="rs-prate" data-p="${esc(p.name)}" value="${p.dia_rate || ""}"></td>
				<td><span class="rs-extras" data-p="${esc(p.name)}">${(p.extras || []).length
					? (p.extras || []).map((e) => `${esc(e.charge_name)} ${e.rate}`).join(", ")
					: __("+ extra charge")}</span></td>
			</tr>`).join("")}
			<tr><td><input class="rs-newp" placeholder="${__("new party…")}"></td>
				<td><input type="number" class="rs-newp-rate" placeholder="0"></td>
				<td><button class="rs-btn rs-addp" style="margin:0;padding:4px 12px;">＋</button></td></tr>
			</tbody></table>
			<button class="rs-btn rs-savep">${__("Save party rates")}</button>`);
		root.find(".rs-types").html(`
			<table class="rs-t"><thead><tr><th>${__("Item type")}</th><th style="width:110px;">${__("Polish MC")}</th><th style="width:40px;"></th></tr></thead><tbody>
			${(BOOT.item_types || []).map((t) => `<tr>
				<td><b>${esc(t.name)}</b></td>
				<td><input type="number" class="rs-trate" data-t="${esc(t.name)}" value="${t.polish_rate || 0}"></td>
				<td><span class="rs-x rs-delt" data-t="${esc(t.name)}">×</span></td>
			</tr>`).join("")}
			<tr><td><input class="rs-newt" placeholder="${__("new type…")}"></td>
				<td><input type="number" class="rs-newt-rate" placeholder="200"></td>
				<td><button class="rs-btn rs-addt" style="margin:0;padding:4px 12px;">＋</button></td></tr>
			</tbody></table>
			<button class="rs-btn rs-savet">${__("Save polish rates")}</button>`);
		const s = BOOT.settings || {};
		root.find(".rs-settings").html(`
			<div class="rs-set">
				<span>${__("Soldering / joint")}</span><input type="number" class="rs-s" data-k="soldering_rate" value="${s.soldering_rate || 0}">
				<span>${__("Stone fix / unit")}</span><input type="number" class="rs-s" data-k="stone_fix_rate" value="${s.stone_fix_rate || 0}">
				<span>${__("GST % stripped from TM")}</span><input type="number" class="rs-s" data-k="gst_percent" value="${s.gst_percent || 0}">
				<span>${__("75-add — % of base rate")}</span><input type="number" class="rs-s" data-k="factor_75" value="${s.factor_75 || 0}">
				<span>${__("92-add — % of base rate")}</span><input type="number" class="rs-s" data-k="factor_92" value="${s.factor_92 || 0}">
				<span>${__("Repair warehouse")} <span style="color:var(--text-muted);font-size:10px;">(${__("Phase 2 — parked")})</span></span>
				<input class="rs-s" data-k="repair_warehouse" value="${esc(BOOT.repair_warehouse || "")}" placeholder="${__("warehouse name")}">
			</div>
			<button class="rs-btn rs-saves">${__("Save constants")}</button>`);
	}

	// ---- parties ----
	root.on("click", ".rs-addp", () => {
		const n = (root.find(".rs-newp").val() || "").trim().toUpperCase();
		if (!n) return;
		frappe.call({ method: API + ".save_repair_party", args: { payload: JSON.stringify({
			party_name: n, dia_rate: flt(root.find(".rs-newp-rate").val()) }) } }).then(boot);
	});
	root.on("click", ".rs-savep", () => {
		const calls = [];
		root.find(".rs-prate").each(function () {
			const p = (BOOT.parties || []).find((x) => x.name === this.getAttribute("data-p"));
			if (p && flt(this.value) !== flt(p.dia_rate)) {
				calls.push(frappe.call({ method: API + ".save_repair_party", args: { payload: JSON.stringify({
					party_name: p.name, dia_rate: flt(this.value), active: p.active, extras: p.extras }) } }));
			}
		});
		Promise.all(calls).then(() => {
			frappe.show_alert({ message: __("{0} part(ies) updated.", [calls.length]), indicator: "green" }, 3);
			boot();
		});
	});
	root.on("click", ".rs-extras", function () {
		const name = this.getAttribute("data-p");
		const p = (BOOT.parties || []).find((x) => x.name === name);
		const d = new frappe.ui.Dialog({
			title: __("Extras — {0}", [name]),
			fields: [{ fieldtype: "HTML", fieldname: "b" }],
			primary_action_label: __("Save"),
			primary_action() {
				const extras = [];
				d.$wrapper.find(".rs-exrow").each(function () {
					const cn = $(this).find(".rs-exn").val().trim();
					if (cn) extras.push({ charge_name: cn, rate: flt($(this).find(".rs-exr").val()) });
				});
				frappe.call({ method: API + ".save_repair_party", args: { payload: JSON.stringify({
					party_name: name, dia_rate: p.dia_rate, active: p.active, extras }) } }).then(() => {
					d.hide();
					boot();
				});
			},
		});
		const row = (e) => `<div class="rs-exrow" style="display:flex;gap:8px;margin-bottom:6px;">
			<input class="rs-exn form-control input-sm" placeholder="${__("charge name")}" value="${esc((e || {}).charge_name || "")}" style="flex:1;">
			<input class="rs-exr form-control input-sm" type="number" placeholder="0" value="${(e || {}).rate || ""}" style="width:100px;"></div>`;
		d.get_field("b").$wrapper.html(`<div class="rs-exlist">${((p || {}).extras || []).map(row).join("") || row()}</div>
			<button class="rs-exadd" style="border:none;background:none;color:#1f618d;font-weight:700;cursor:pointer;">${__("+ another")}</button>`);
		d.$wrapper.on("click", ".rs-exadd", () => d.$wrapper.find(".rs-exlist").append(row()));
		d.show();
	});

	// ---- item types ----
	root.on("click", ".rs-addt", () => {
		const n = (root.find(".rs-newt").val() || "").trim().toUpperCase();
		if (!n) return;
		frappe.call({ method: API + ".save_repair_item_type",
			args: { type_name: n, polish_rate: flt(root.find(".rs-newt-rate").val()) || 200 } }).then(boot);
	});
	root.on("click", ".rs-savet", () => {
		const calls = [];
		root.find(".rs-trate").each(function () {
			const t = (BOOT.item_types || []).find((x) => x.name === this.getAttribute("data-t"));
			if (t && flt(this.value) !== flt(t.polish_rate)) {
				calls.push(frappe.call({ method: API + ".save_repair_item_type",
					args: { type_name: t.name, polish_rate: flt(this.value) } }));
			}
		});
		Promise.all(calls).then(() => {
			frappe.show_alert({ message: __("{0} type(s) updated.", [calls.length]), indicator: "green" }, 3);
			boot();
		});
	});
	root.on("click", ".rs-delt", function () {
		const t = this.getAttribute("data-t");
		frappe.confirm(__("Delete item type {0}?", [t]), () =>
			frappe.call({ method: API + ".delete_repair_item_type", args: { type_name: t } }).then(boot));
	});

	// ---- settings ----
	root.on("click", ".rs-saves", () => {
		const p = {};
		root.find(".rs-s").each(function () {
			const k = this.getAttribute("data-k");
			p[k] = k === "repair_warehouse" ? this.value.trim() : flt(this.value);
		});
		frappe.call({ method: API + ".save_repair_settings", args: { payload: JSON.stringify(p) } }).then(() => {
			frappe.show_alert({ message: __("Constants saved."), indicator: "green" }, 3);
			boot();
		});
	});

	boot();
};
