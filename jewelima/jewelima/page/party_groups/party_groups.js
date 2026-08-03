// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Party Groups — the interactive face of the Party Group Map lookup: every
// group is a card of tap-to-pick party chips. Pick chips (from anywhere) and
// move them to a group, unmap them, rename a whole group, or add a mapping
// by hand. Party Gold groups its report through exactly this table.
// Route: /app/party-groups

frappe.pages["party-groups"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Party Groups", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	let MAP = {};   // party -> group
	const PICK = new Set();
	let FILTER = "";

	$(page.main).append(`
		<style>
		#page-party-groups .container{max-width:100%;}
		.gm-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:var(--control-bg);
			border:1px solid var(--border-color);border-radius:10px;padding:8px 14px;margin-bottom:12px;}
		.gm-bar .lbl{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);font-weight:700;}
		.gm-bar input{border:1px solid var(--border-color);border-radius:6px;padding:4px 9px;font-size:12px;
			background:var(--fg-color);color:var(--text-color);}
		.gm-bar input.up{text-transform:uppercase;}
		.gm-btn{border:none;border-radius:6px;padding:5px 14px;font-size:11.5px;font-weight:700;color:#fff;background:#1f618d;cursor:pointer;}
		.gm-btn.warn{background:#8a2f2f;}
		.gm-btn.alt{background:#5b3a8e;}
		.gm-count{font-size:12px;font-weight:800;}
		.gm-sep{width:1px;height:22px;background:var(--border-color);}
		.gm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px;}
		.gm-card{border:1px solid var(--border-color);border-radius:10px;background:var(--fg-color);padding:10px 12px;}
		.gm-card .hd{display:flex;align-items:center;gap:8px;margin-bottom:7px;}
		.gm-card .nm{font-weight:800;font-size:13.5px;}
		.gm-card .n{font-size:11px;color:var(--text-muted);}
		.gm-card .rn{cursor:pointer;color:var(--text-muted);font-size:12px;margin-left:auto;}
		.gm-card .rn:hover{color:var(--text-color);}
		.gm-chip{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--border-color);border-radius:14px;
			padding:2px 10px;margin:2px 4px 2px 0;font-size:11.5px;cursor:pointer;background:var(--control-bg);}
		.gm-chip.on{background:#1f618d;border-color:#1f618d;color:#fff;font-weight:700;}
		.gm-chip .x{color:var(--text-muted);font-weight:800;cursor:pointer;}
		.gm-chip.on .x{color:#fff;}
		.gm-none{padding:34px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:10px;}
		</style>
		<div class="gm-bar">
			<span class="gm-count">0 ${__("picked")}</span>
			<button class="gm-btn warn gm-clear">${__("Clear")}</button>
			<span class="gm-sep"></span>
			<span class="lbl">${__("Move picked to")}</span>
			<input class="gm-move up" style="width:140px;">
			<button class="gm-btn gm-move-go">${__("Move")}</button>
			<button class="gm-btn warn gm-unmap">${__("Unmap picked")}</button>
			<span class="gm-sep"></span>
			<span class="lbl">${__("Add mapping")}</span>
			<input class="gm-add-p up" placeholder="${__("party as in the report")}" style="width:190px;">
			<span class="lbl">→</span>
			<input class="gm-add-g up" style="width:130px;">
			<button class="gm-btn alt gm-add-go">${__("Add")}</button>
			<span class="gm-sep"></span>
			<input class="gm-search" placeholder="${__("search…")}" style="width:150px;margin-left:auto;">
		</div>
		<div class="gm-body"><div class="gm-none">${__("Loading…")}</div></div>
	`);
	const root = $(page.main);

	function load() {
		frappe.call({ method: API + ".get_party_group_map" }).then((r) => {
			MAP = r.message || {};
			[...PICK].forEach((p) => { if (!(p in MAP)) PICK.delete(p); });
			paint();
		});
	}

	function paint() {
		const groups = {};
		Object.keys(MAP).forEach((p) => {
			(groups[MAP[p]] = groups[MAP[p]] || []).push(p);
		});
		const q = FILTER.toUpperCase();
		const gnames = Object.keys(groups).sort().filter((g) =>
			!q || g.includes(q) || groups[g].some((p) => p.includes(q)));
		root.find(".gm-count").text(__("{0} picked", [PICK.size]));
		root.find(".gm-body").html(gnames.length ? `<div class="gm-grid">
			${gnames.map((g) => `<div class="gm-card">
				<div class="hd"><span class="nm">${esc(g)}</span>
					<span class="n">${groups[g].length} ${__("parties")}</span>
					<span class="rn" data-g="${esc(g)}" title="${__("rename group")}">✎ ${__("rename")}</span></div>
				${groups[g].sort().filter((p) => !q || g.includes(q) || p.includes(q))
					.map((p) => `<span class="gm-chip ${PICK.has(p) ? "on" : ""}" data-p="${esc(p)}">
						${esc(p)}<span class="x" data-p="${esc(p)}" title="${__("unmap")}">×</span></span>`).join("")}
			</div>`).join("")}</div>`
			: `<div class="gm-none">${Object.keys(MAP).length
				? __("Nothing matches the search.")
				: __("No mappings yet — assign parties from the Party Gold page, or add one above.")}</div>`);
	}

	root.on("click", ".gm-chip", function (e) {
		if ($(e.target).hasClass("x")) return;
		const p = $(this).data("p");
		PICK.has(p) ? PICK.delete(p) : PICK.add(p);
		$(this).toggleClass("on", PICK.has(p));
		root.find(".gm-count").text(__("{0} picked", [PICK.size]));
	});
	root.on("click", ".gm-chip .x", function () {
		const p = $(this).data("p");
		frappe.call({ method: API + ".remove_party_group", args: { parties: JSON.stringify([p]) } }).then(() => {
			delete MAP[p];
			PICK.delete(p);
			paint();
			frappe.show_alert({ message: __("{0} unmapped.", [p]), indicator: "green" }, 3);
		});
	});
	root.on("click", ".gm-clear", () => { PICK.clear(); paint(); });

	root.on("click", ".gm-move-go", () => {
		const g = (root.find(".gm-move").val() || "").trim().toUpperCase();
		if (!g) return frappe.show_alert({ message: __("Type the target group."), indicator: "orange" }, 3);
		if (!PICK.size) return frappe.show_alert({ message: __("Pick some parties first."), indicator: "orange" }, 3);
		frappe.call({ method: API + ".set_party_group", args: { parties: JSON.stringify([...PICK]), group: g } }).then(() => {
			[...PICK].forEach((p) => { MAP[p] = g; });
			PICK.clear();
			root.find(".gm-move").val("");
			paint();
			frappe.show_alert({ message: __("Moved to {0}.", [g]), indicator: "green" }, 3);
		});
	});

	root.on("click", ".gm-unmap", () => {
		if (!PICK.size) return frappe.show_alert({ message: __("Pick some parties first."), indicator: "orange" }, 3);
		frappe.call({ method: API + ".remove_party_group", args: { parties: JSON.stringify([...PICK]) } }).then((r) => {
			[...PICK].forEach((p) => { delete MAP[p]; });
			PICK.clear();
			paint();
			frappe.show_alert({ message: __("{0} mapping(s) removed.", [(r.message || {}).count || 0]), indicator: "green" }, 3);
		});
	});

	root.on("click", ".gm-add-go", () => {
		const p = (root.find(".gm-add-p").val() || "").trim().toUpperCase();
		const g = (root.find(".gm-add-g").val() || "").trim().toUpperCase();
		if (!p || !g) return frappe.show_alert({ message: __("Type both the party and its group."), indicator: "orange" }, 3);
		frappe.call({ method: API + ".set_party_group", args: { parties: JSON.stringify([p]), group: g } }).then(() => {
			MAP[p] = g;
			root.find(".gm-add-p, .gm-add-g").val("");
			paint();
			frappe.show_alert({ message: __("{0} → {1} saved.", [p, g]), indicator: "green" }, 3);
		});
	});

	root.on("click", ".gm-card .rn", function () {
		const old = $(this).data("g");
		frappe.prompt({ fieldname: "nm", fieldtype: "Data", label: __("New group name"), reqd: 1, default: old },
			(v) => {
				frappe.call({ method: API + ".rename_party_group", args: { old, new: (v.nm || "").toUpperCase() } }).then((r) => {
					load();
					frappe.show_alert({ message: __("{0} mapping(s) now under {1}.", [(r.message || {}).count || 0, (v.nm || "").toUpperCase()]), indicator: "green" }, 3);
				});
			}, __("Rename group {0}", [old]));
	});

	root.on("input", ".gm-search", function () {
		FILTER = this.value || "";
		paint();
	});

	load();
};
