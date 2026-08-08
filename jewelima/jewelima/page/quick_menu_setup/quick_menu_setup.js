// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Quick Menu Setup — the Ctrl+Space shortcuts, laid out by hand: drag a page
// from the whitelisted library onto one of the nine numbered slots (the slot
// IS the key you press). Everyone edits their own layout; System Managers can
// also lay one out for another USER or for a ROLE — a role layout is the
// default for everyone holding it who hasn't made a personal one.
// Route: /app/quick-menu-setup

frappe.pages["quick-menu-setup"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Quick Menu Setup", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	let CATALOG = [];      // [{route, label}]
	let SLOTS = Array(9).fill(null);
	let CAN_TARGET = false;
	let DRAG = null;       // { route, fromSlot|null }

	$(page.main).append(`
		<style>
		#page-quick-menu-setup .container{max-width:100%;}
		.qs-bar{display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin-bottom:14px;}
		.qs-bar .frappe-control{margin:0;min-width:200px;}
		.qs-note{color:var(--text-muted);font-size:12.5px;margin-bottom:14px;max-width:920px;}
		.qs-cols{display:flex;gap:22px;align-items:flex-start;flex-wrap:wrap;}
		.qs-lib{flex:1;min-width:340px;}
		.qs-slots{flex:0 0 380px;}
		.qs-h{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px;}
		.qs-chip{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--border-color);border-radius:8px;
			padding:6px 12px;margin:0 6px 6px 0;font-size:12.5px;font-weight:600;background:var(--fg-color);cursor:grab;user-select:none;}
		.qs-chip.used{opacity:.4;}
		.qs-chip:active{cursor:grabbing;}
		.qs-slot{display:flex;align-items:center;gap:10px;border:1.5px dashed var(--border-color);border-radius:9px;
			padding:8px 12px;margin-bottom:7px;min-height:42px;background:var(--fg-color);}
		.qs-slot.over{border-color:#1f618d;background:var(--control-bg);}
		.qs-slot .n{width:24px;height:24px;border-radius:6px;background:var(--control-bg);border:1px solid var(--border-color);
			display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:var(--text-muted);flex:none;}
		.qs-slot.filled{border-style:solid;}
		.qs-slot.filled .n{background:var(--primary);border-color:var(--primary);color:#fff;}
		.qs-slot .lbl{font-size:13px;font-weight:700;flex:1;cursor:grab;}
		.qs-slot .lbl.empty{color:var(--text-muted);font-weight:400;font-size:12px;cursor:default;}
		.qs-slot .x{color:#b02a2a;font-weight:800;cursor:pointer;padding:0 4px;}
		</style>
		<div class="qs-bar">
			<div class="qs-target" style="display:none;"></div>
			<div class="qs-user" style="display:none;"></div>
			<div class="qs-role" style="display:none;"></div>
		</div>
		<div class="qs-note">${__("Drag a page from the library onto a numbered slot — that number is the Ctrl+Space key for it. Drag between slots to move, × to clear. Only whitelisted pages can be placed; pages someone's role can't open simply skip on their menu.")}</div>
		<div class="qs-cols">
			<div class="qs-slots">
				<div class="qs-h">${__("Slots — Ctrl+Space, then the number")}</div>
				<div class="qs-slotlist"></div>
			</div>
			<div class="qs-lib">
				<div class="qs-h">${__("Page library (whitelisted)")}</div>
				<div class="qs-libbody"></div>
			</div>
		</div>
	`);
	const root = $(page.main);
	page.set_primary_action(__("Save"), () => save(), "check");

	const mk = (sel, df) => { const c = frappe.ui.form.make_control({ df, parent: root.find(sel).get(0), render_input: true }); c.refresh(); return c; };
	const fTarget = mk(".qs-target", { fieldtype: "Select", label: __("Layout for"), fieldname: "t",
		options: [__("My shortcuts"), __("A user"), __("A role")].join("\n"), default: __("My shortcuts"),
		onchange: () => { syncTargetInputs(); load(); } });
	fTarget.set_value(__("My shortcuts"));
	const fUser = mk(".qs-user", { fieldtype: "Link", label: __("User"), fieldname: "u", options: "User", only_select: 1,
		get_query: () => ({ filters: { enabled: 1, user_type: "System User" } }), onchange: () => load() });
	const fRole = mk(".qs-role", { fieldtype: "Link", label: __("Role"), fieldname: "r", options: "Role", only_select: 1,
		onchange: () => load() });

	function targetArgs() {
		const t = fTarget.get_value();
		if (t === __("A user") && fUser.get_value()) return { target_type: "user", target: fUser.get_value() };
		if (t === __("A role") && fRole.get_value()) return { target_type: "role", target: fRole.get_value() };
		return { target_type: "user", target: frappe.session.user };
	}

	function syncTargetInputs() {
		const t = fTarget.get_value();
		root.find(".qs-user").toggle(t === __("A user"));
		root.find(".qs-role").toggle(t === __("A role"));
	}

	function load() {
		const t = fTarget.get_value();
		if ((t === __("A user") && !fUser.get_value()) || (t === __("A role") && !fRole.get_value())) {
			SLOTS = Array(9).fill(null);
			paint();
			return;
		}
		frappe.call({ method: API + ".get_quick_menu_setup", args: targetArgs() }).then((r) => {
			const m = r.message || {};
			CATALOG = m.catalog || [];
			SLOTS = (m.slots || []).concat(Array(9).fill(null)).slice(0, 9);
			CAN_TARGET = !!m.can_target;
			root.find(".qs-target").toggle(CAN_TARGET);
			paint();
		});
	}

	function labelOf(route) {
		const c = CATALOG.find((x) => x.route === route);
		return c ? c.label : route;
	}

	function paint() {
		const used = new Set(SLOTS.filter(Boolean));
		root.find(".qs-libbody").html(CATALOG.map((c) => `
			<span class="qs-chip ${used.has(c.route) ? "used" : ""}" draggable="true" data-route="${esc(c.route)}">${esc(c.label)}</span>`).join("")
			|| `<span style="color:var(--text-muted);font-size:12px;">${__("loading…")}</span>`);
		root.find(".qs-slotlist").html(SLOTS.map((r, i) => `
			<div class="qs-slot ${r ? "filled" : ""}" data-i="${i}">
				<span class="n">${i + 1}</span>
				${r ? `<span class="lbl" draggable="true" data-route="${esc(r)}" data-from="${i}">${esc(labelOf(r))}</span>
					<span class="x" data-i="${i}" title="${__("clear slot")}">×</span>`
				: `<span class="lbl empty">${__("drop a page here")}</span>`}
			</div>`).join(""));
	}

	// ---- drag & drop: library chip -> slot, slot -> slot (move/swap) --------
	root.on("dragstart", ".qs-chip, .qs-slot .lbl[draggable]", function (e) {
		DRAG = { route: this.getAttribute("data-route"),
			fromSlot: this.hasAttribute("data-from") ? cint(this.getAttribute("data-from")) : null };
		e.originalEvent.dataTransfer.effectAllowed = "move";
		e.originalEvent.dataTransfer.setData("text/plain", DRAG.route);
	});
	root.on("dragover", ".qs-slot", function (e) {
		e.preventDefault();
		$(this).addClass("over");
	});
	root.on("dragleave drop", ".qs-slot", function () {
		$(this).removeClass("over");
	});
	root.on("drop", ".qs-slot", function (e) {
		e.preventDefault();
		if (!DRAG) return;
		const to = cint(this.getAttribute("data-i"));
		const route = DRAG.route;
		const from = DRAG.fromSlot;
		DRAG = null;
		if (from === to) return;
		const prev = SLOTS[to];
		// the same page never sits on two numbers — placing it moves it
		const dup = SLOTS.indexOf(route);
		if (dup >= 0) SLOTS[dup] = null;
		SLOTS[to] = route;
		if (from !== null && from !== dup) SLOTS[from] = prev; // slot->slot = swap
		paint();
	});
	root.on("click", ".qs-slot .x", function () {
		SLOTS[cint(this.getAttribute("data-i"))] = null;
		paint();
	});

	function save() {
		const t = fTarget.get_value();
		if (t === __("A user") && !fUser.get_value()) return frappe.show_alert({ message: __("Pick the user first."), indicator: "orange" }, 3);
		if (t === __("A role") && !fRole.get_value()) return frappe.show_alert({ message: __("Pick the role first."), indicator: "orange" }, 3);
		frappe.call({ method: API + ".save_quick_menu",
			args: Object.assign({ routes: JSON.stringify(SLOTS) }, targetArgs()) }).then(() => {
			if (window.jwQuickReload) window.jwQuickReload(); // next Ctrl+Space is fresh
			frappe.show_alert({ message: __("Quick Menu saved — Ctrl+Space to try it."), indicator: "green" }, 4);
		});
	}

	syncTargetInputs();
	load();
};
