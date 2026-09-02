// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Ordering > Track — a read-only tracker of every ACTIVE order card (not sold,
// not cancelled), grouped by the user who placed it. Tiles per user, KPIs, and
// a filterable table so no order slips out of hand. Info + filter only — no
// actions. Route: /app/order-tracker

frappe.pages["order-tracker"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Track Orders", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const S = { rows: [], users: [], kpi: {}, today: null, owner: "", stage: "", due: "", q: "", sortKey: "due_date", sortDir: 1, sel: new Set(), total: 0, totalAll: 0, stages: [], hasMore: false };

	$(page.main).append(`
		<style>
		#page-order-tracker .container{max-width:100%;}
		.ot-kpis{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px;}
		.ot-k{flex:1 1 130px;border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);padding:11px 16px;}
		.ot-k .kl{font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--text-muted);}
		.ot-k .kv{font-size:26px;font-weight:800;line-height:1.1;margin-top:2px;}
		.ot-k.red .kv{color:#b02a2a;} .ot-k.amber .kv{color:#b4690e;} .ot-k.green .kv{color:#1d7a33;} .ot-k.blue .kv{color:#1f618d;}
		.ot-lbl{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin:4px 0 8px;}
		.ot-users{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:16px;}
		.ot-u{border:1px solid var(--border-color);background:var(--fg-color);border-radius:11px;padding:7px 14px;cursor:pointer;display:flex;flex-direction:column;min-width:120px;transition:.1s;}
		.ot-u:hover{border-color:#1f618d;}
		.ot-u.on{background:#1f618d;border-color:#1f618d;color:#fff;}
		.ot-u .un{font-size:13px;font-weight:700;}
		.ot-u .uc{font-size:11px;color:var(--text-muted);margin-top:1px;}
		.ot-u.on .uc{color:rgba(255,255,255,.85);}
		.ot-u .ov{color:#b02a2a;font-weight:800;} .ot-u.on .ov{color:#ffd0d0;}
		.ot-filters{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px;}
		.ot-filters input,.ot-filters select{border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);color:var(--text-color);height:32px;border-radius:7px;padding:2px 10px;font-size:13px;}
		.ot-filters input{min-width:220px;}
		.ot-count{margin-left:auto;color:var(--text-muted);font-size:12px;}
		.ot-box{border:1px solid var(--border-color);border-radius:12px;overflow:auto;}
		table.ot-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;background:var(--fg-color);}
		table.ot-tbl th{position:sticky;top:0;z-index:1;background:var(--control-bg,var(--fg-color));border-bottom:2px solid var(--gray-400,#aeb6bf);padding:8px 10px;text-align:left;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.03em;color:var(--text-muted);cursor:pointer;white-space:nowrap;}
		table.ot-tbl th.num,table.ot-tbl td.num{text-align:right;}
		table.ot-tbl td{border-bottom:1px solid var(--border-color);padding:7px 10px;vertical-align:middle;white-space:nowrap;}
		table.ot-tbl tr.ovd td{background:rgba(176,42,42,.05);}
		.ot-oid{font-family:var(--font-family-monospace,monospace);font-weight:800;color:#1f618d;cursor:pointer;}
		.ot-badge{display:inline-block;border-radius:9px;padding:1px 9px;font-size:10.5px;font-weight:800;}
		.ot-badge.prod{background:#eef2f7;color:#5a6b7b;} .ot-badge.stock{background:#dcefe0;color:#1d7a33;}
		.ot-badge.cert{background:#d9f0ef;color:#0f6e66;}
		.ot-due{font-weight:700;} .ot-due.red{color:#b02a2a;} .ot-due.amber{color:#b4690e;} .ot-due.green{color:#1d7a33;}
		.ot-flag{display:inline-block;border-radius:8px;padding:0 7px;font-size:9.5px;font-weight:800;margin-left:4px;}
		.ot-flag.stn{background:#fff3cd;color:#8a6d00;} .ot-flag.oos{background:#fdecea;color:#b02a2a;}
		.ot-stones{display:inline-flex;gap:3px;flex-wrap:wrap;max-width:230px;}
		.ot-stone{border-radius:8px;padding:1px 7px;font-size:10px;font-weight:800;white-space:nowrap;letter-spacing:.02em;}
		.ot-stone.on{background:#dcefe0;color:#1d7a33;}
		.ot-stone.wait{background:var(--control-bg,#eef2f7);color:#8a94a0;border:1px dashed var(--gray-400,#c4ccd6);padding:0 6px;}
		.ot-nostone{color:var(--text-muted);}
		table.ot-tbl th.sel,table.ot-tbl td.sel{width:30px;text-align:center;padding-left:10px;padding-right:2px;cursor:default;}
		table.ot-tbl input[type=checkbox]{cursor:pointer;margin:0;vertical-align:middle;width:15px;height:15px;}
		.ot-star{color:#e0a800;font-size:12px;margin-left:5px;}
		.ot-none{padding:34px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:10px;}
		</style>
		<div class="ot-kpis" id="ot-kpis"></div>
		<div class="ot-lbl">${__("Placed by — pick a person to focus")}</div>
		<div class="ot-users" id="ot-users"></div>
		<div class="ot-filters">
			<input class="ot-q" placeholder="${__("Search card / design / customer / JO")}">
			<select class="ot-stage"><option value="">${__("All stages")}</option></select>
			<select class="ot-duef">
				<option value="">${__("Any due")}</option>
				<option value="overdue">${__("Overdue")}</option>
				<option value="due_soon">${__("Due ≤ 3 days")}</option>
			</select>
			<span class="ot-count"></span>
		</div>
		<div class="ot-box" id="ot-box"></div>
	`);
	const root = $(page.main);

	// Paged. The board used to ask for every active card at once — 150k of them is
	// a 79 MB reply, and the page sat blank while the browser chewed through it.
	// The KPIs and the user tiles still count EVERYTHING (the server totals them
	// on its side); only the cards on screen arrive a window at a time.
	const PAGE = 100;

	function load(more) {
		const $box = root.find("#ot-box");
		jewelima.busy($box, true, more ? __("Loading more cards…") : __("Loading orders…"));
		frappe.call({ method: API + ".get_order_tracker", freeze: false,
			args: { limit: PAGE, offset: more ? S.rows.length : 0,
				owner: S.owner || "", stage: S.stage || "",
				due: S.due || "", q: (S.q || "").trim() } })
			.then((r) => {
				const m = r.message || {};
				S.rows = more ? S.rows.concat(m.rows || []) : (m.rows || []);
				S.users = m.users || []; S.kpi = m.kpi || {}; S.today = m.today;
				S.total = m.total != null ? m.total : S.rows.length;
				S.totalAll = m.total_all != null ? m.total_all : S.total;
				S.stages = m.stages || S.stages || [];
				S.hasMore = !!m.has_more;
				if (!more) S.sel.clear();
				paintKpis(); paintUsers(); paintStages(); paint();
			})
			.always(() => jewelima.busy($box, false));
	}

	function paintKpis() {
		const k = S.kpi;
		const defs = [
			["total", __("Active orders"), ""], ["overdue", __("Overdue"), "red"],
			["due_soon", __("Due ≤ 3d"), "amber"], ["in_production", __("In production"), "blue"],
			["in_stock", __("In stock (unsold)"), "green"], ["at_cert", __("At certification"), ""],
			["awaiting_stone", __("Awaiting stone"), "amber"], ["oos", __("Out of stock"), "red"],
		];
		root.find("#ot-kpis").html(defs.map(([key, lbl, cls]) =>
			`<div class="ot-k ${(k[key] || 0) ? cls : ""}"><div class="kl">${lbl}</div><div class="kv">${k[key] || 0}</div></div>`).join(""));
	}

	function paintUsers() {
		// every tile counts the WHOLE board, not the loaded window — the per-user
		// tiles come from the server's full count, so "Everyone" must match them
		const all = S.users.reduce((a, u) => a + (u.count || 0), 0) || S.rows.length;
		const allOvd = S.users.reduce((a, u) => a + (u.overdue || 0), 0);
		const tiles = [`<div class="ot-u ${S.owner === "" ? "on" : ""}" data-u=""><span class="un">${__("Everyone")}</span><span class="uc">${all} ${__("orders")}${allOvd ? ` · <span class="ov">${allOvd} ${__("overdue")}</span>` : ""}</span></div>`]
			.concat(S.users.map((u) =>
				`<div class="ot-u ${S.owner === u.user ? "on" : ""}" data-u="${esc(u.user)}"><span class="un">${esc(u.name)}</span><span class="uc">${u.count} ${__("orders")}${u.overdue ? ` · <span class="ov">${u.overdue} ${__("overdue")}</span>` : ""}</span></div>`));
		root.find("#ot-users").html(tiles.join(""));
		root.find(".ot-u").on("click", function () { S.owner = this.getAttribute("data-u"); paintUsers(); load(); });
	}

	function paintStages() {
		// stages seen so far — the list grows as more windows load, and the
		// current pick survives even when this window happens not to contain it
		const stages = (S.stages && S.stages.length)
			? S.stages.slice()
			: [...new Set(S.rows.map((r) => r.stage))].sort();
		root.find(".ot-stage").html(`<option value="">${__("All stages")}</option>` +
			stages.map((s) => `<option ${s === S.stage ? "selected" : ""}>${esc(s)}</option>`).join(""));
	}

	// The SERVER applies owner / stage / due / search across the whole board and
	// returns only matching rows, so filtering here again would be a second, weaker
	// filter over an already-correct window. Sorting stays local to what is loaded.
	const visible = () => {
		let rs = S.rows.slice();
		const dir = S.sortDir, key = S.sortKey;
		rs = rs.slice().sort((a, b) => {
			let va = a[key], vb = b[key];
			if (key === "days_left" || key === "gross" || key === "qty" || key === "age_days") { va = flt(va); vb = flt(vb); }
			else { va = ("" + (va == null ? "" : va)).toLowerCase(); vb = ("" + (vb == null ? "" : vb)).toLowerCase(); }
			return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
		});
		return rs;
	};

	const COLS = [
		{ k: "_sel", t: "", sel: 1 },
		{ k: "card", t: __("Order ID") }, { k: "job_order", t: __("Job Order") },
		{ k: "design", t: __("Design") }, { k: "customer", t: __("Customer") },
		{ k: "order_date", t: __("Ordered") },
		{ k: "due_date", t: __("Due") }, { k: "stage", t: __("Where") },
		{ k: "qty", t: __("Qty"), num: 1 }, { k: "gross", t: __("Gross g"), num: 1 },
		{ k: "_stones", t: __("Stones"), nosort: 1 },
		{ k: "age_days", t: __("Age d"), num: 1 },
	];

	function stonesCell(r) {
		if (!r.stones || !r.stones.length) return `<span class="ot-nostone">—</span>`;
		return `<span class="ot-stones">` + r.stones.map((s) => {
			const wt = s.added ? s.aw : s.pw;
			const shown = wt ? wt.toFixed(2) : (s.added ? s.an : s.pn) + "p";
			const title = `${s.k} — ${__("plan")} ${s.pn || 0}pc / ${s.pw}ct` +
				(s.added ? ` · ${__("added")} ${s.an || 0}pc / ${s.aw}ct` : ` · ${__("not weighed yet")}`);
			return `<span class="ot-stone ${s.added ? "on" : "wait"}" title="${esc(title)}">${s.k} ${shown}</span>`;
		}).join("") + `</span>`;
	}

	function dueCell(r) {
		if (!r.due_date) return "";
		const cls = r.health === "overdue" ? "red" : r.health === "due_soon" ? "amber" : "green";
		const txt = frappe.datetime.str_to_user(r.due_date);
		const tag = r.days_left == null ? "" : r.days_left < 0 ? ` (${-r.days_left}d late)` : r.days_left === 0 ? " (today)" : ` (${r.days_left}d)`;
		return `<span class="ot-due ${cls}">${txt}${tag}</span>`;
	}
	function stageBadge(r) {
		const cls = r.stage === "In Stock" ? "stock" : r.stage === "At Certification" ? "cert" : "prod";
		return `<span class="ot-badge ${cls}">${esc(r.stage)}</span>` +
			(r.awaiting_stone ? `<span class="ot-flag stn" title="${__("Awaiting stone issue")}">STN</span>` : "") +
			(r.oos ? `<span class="ot-flag oos" title="${__("Out of stock")}">OOS</span>` : "");
	}

	function paint() {
		const rs = visible();
		const followable = [...new Set(rs.filter((r) => r.can_follow).map((r) => r.job_order))];
		const allSel = followable.length > 0 && followable.every((jo) => S.sel.has(jo));
		const selN = S.sel.size;
		root.find(".ot-count").text((selN ? __("{0} selected · ", [selN]) : "")
			+ __("{0} loaded of {1}", [S.rows.length, S.total])
			+ (S.filtered || S.owner || S.stage || S.due || (S.q || "").trim()
				? " " + __("matching") + " · " + __("{0} active", [S.totalAll || S.total]) : ""));
		refreshFollowBtns();
		const arrow = (k) => (S.sortKey === k ? (S.sortDir > 0 ? " ▲" : " ▼") : "");
		const head = `<thead><tr>${COLS.map((c) => {
			if (c.sel) return `<th class="sel" data-k="_sel"><input type="checkbox" class="ot-selall" ${allSel ? "checked" : ""} ${followable.length ? "" : "disabled"} title="${__("Select all you can follow")}"></th>`;
			return `<th class="${c.num ? "num" : ""}" data-k="${c.k}">${c.t}${arrow(c.k)}</th>`;
		}).join("")}</tr></thead>`;
		const body = rs.length ? rs.map((r) => `<tr class="${r.health === "overdue" ? "ovd" : ""}">
			<td class="sel">${r.can_follow ? `<input type="checkbox" class="ot-selrow" data-jo="${esc(r.job_order)}" ${S.sel.has(r.job_order) ? "checked" : ""}>` : ""}</td>
			<td><span class="ot-oid jw-card-link" data-card="${esc(r.card)}">${esc(r.card)}</span>${r.followed ? `<span class="ot-star" title="${__("Followed")}">★</span>` : ""}</td>
			<td>${esc(r.job_order)}</td><td>${esc(r.design)}</td>
			<td>${esc(r.customer)}</td>
			<td>${r.order_date ? frappe.datetime.str_to_user(r.order_date) : ""}</td>
			<td>${dueCell(r)}</td>
			<td>${stageBadge(r)}</td>
			<td class="num">${r.qty}</td><td class="num">${r.gross ? r.gross.toFixed(3) : ""}</td>
			<td>${stonesCell(r)}</td>
			<td class="num">${r.age_days}</td>
		</tr>`).join("") : `<tr><td colspan="${COLS.length}" class="ot-none">${__("No active orders match.")}</td></tr>`;
		root.find("#ot-box").html(`<table class="ot-tbl">${head}<tbody>${body}</tbody></table>`
			+ `<div class="ot-more"></div>`);
		// only the loaded window can be filtered or sorted, so say plainly how
		// much of the board is in hand before someone reads a filter as a total
		jewelima.moreBar(root.find(".ot-more"), S.rows.length, S.total || S.rows.length,
			() => load(true), __("Load 100 more"));
		root.find("#ot-box th").on("click", function (e) {
			if ($(e.target).is("input")) return; // the select-all checkbox handles itself
			const k = this.getAttribute("data-k");
			if (k.charAt(0) === "_") return; // select / stones columns don't sort
			if (S.sortKey === k) S.sortDir = -S.sortDir; else { S.sortKey = k; S.sortDir = 1; }
			paint();
		});
		root.find(".ot-selrow").on("change", function () {
			const jo = this.getAttribute("data-jo");
			if (this.checked) S.sel.add(jo); else S.sel.delete(jo);
			paint();
		});
		root.find(".ot-selall").on("change", function () {
			const on = this.checked;
			followable.forEach((jo) => { if (on) S.sel.add(jo); else S.sel.delete(jo); });
			paint();
		});
	}

	// typing re-queries the whole board, so wait for the typing to stop
	let qTimer = null;
	root.find(".ot-q").on("input", function () {
		S.q = this.value;
		clearTimeout(qTimer);
		qTimer = setTimeout(() => load(), 350);
	});
	root.find(".ot-stage").on("change", function () { S.stage = this.value; load(); });
	root.find(".ot-duef").on("change", function () { S.due = this.value; load(); });

	// One adaptive action on the ticked orders (placer-only rows carry a checkbox):
	// "Follow" normally, but "Unfollow" once every ticked order is already followed.
	let btnFollow;
	function selMeta() {
		const jos = [...S.sel];
		const followed = new Set(S.rows.filter((r) => r.followed).map((r) => r.job_order));
		return { n: jos.length, allFollowed: jos.length > 0 && jos.every((jo) => followed.has(jo)) };
	}
	function refreshFollowBtns() {
		if (!btnFollow) return;
		const { n, allFollowed } = selMeta();
		btnFollow.prop("disabled", !n)
			.text(!n ? __("★ Follow") : allFollowed ? __("Unfollow ({0})", [n]) : __("★ Follow ({0})", [n]));
	}
	function doFollow() {
		const jos = [...S.sel];
		if (!jos.length) return;
		const v = selMeta().allFollowed ? 0 : 1;
		frappe.dom.freeze(v ? __("Following…") : __("Unfollowing…"));
		Promise.all(jos.map((jo) => frappe.call({ method: API + ".set_order_follow", args: { job_order: jo, followed: v }, freeze: false })))
			.then(() => {
				frappe.dom.unfreeze();
				frappe.show_alert({ message: v ? __("Now following {0} order(s).", [jos.length]) : __("Unfollowed {0} order(s).", [jos.length]), indicator: v ? "green" : "orange" }, 5);
				load();
			}).catch(() => { frappe.dom.unfreeze(); load(); });
	}
	btnFollow = page.add_inner_button(__("★ Follow"), doFollow);
	page.add_inner_button(__("Refresh"), load);
	load();
};
