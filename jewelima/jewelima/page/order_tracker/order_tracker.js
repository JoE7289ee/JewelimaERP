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
	const S = { rows: [], users: [], kpi: {}, today: null, owner: "", stage: "", due: "", q: "", sortKey: "due_date", sortDir: 1 };

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
		table.ot-tbl th.act,table.ot-tbl td.act{text-align:center;cursor:default;}
		.ot-follow{border:1px solid var(--gray-500,#8d97a3);background:transparent;color:var(--text-muted);border-radius:7px;padding:2px 9px;font-size:11.5px;font-weight:700;cursor:pointer;white-space:nowrap;}
		.ot-follow:hover{border-color:#1f618d;color:#1f618d;}
		.ot-follow.on{border-color:#1c7d3a;background:#e6f4ea;color:#1c7d3a;}
		.ot-follow.on:hover{background:#d3ebd9;}
		.ot-ftag{display:inline-block;border-radius:7px;padding:1px 8px;font-size:10.5px;font-weight:800;background:#e6f4ea;color:#1c7d3a;white-space:nowrap;}
		.ot-none{padding:34px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:10px;}
		</style>
		<div class="ot-kpis" id="ot-kpis"></div>
		<div class="ot-lbl">${__("Placed by — pick a person to focus")}</div>
		<div class="ot-users" id="ot-users"></div>
		<div class="ot-filters">
			<input class="ot-q" placeholder="${__("Search card / design / customer / salesman / JO")}">
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

	function load() {
		frappe.call({ method: API + ".get_order_tracker" }).then((r) => {
			const m = r.message || {};
			S.rows = m.rows || []; S.users = m.users || []; S.kpi = m.kpi || {}; S.today = m.today;
			paintKpis(); paintUsers(); paintStages(); paint();
		});
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
		const all = S.rows.length;
		const allOvd = S.users.reduce((a, u) => a + (u.overdue || 0), 0);
		const tiles = [`<div class="ot-u ${S.owner === "" ? "on" : ""}" data-u=""><span class="un">${__("Everyone")}</span><span class="uc">${all} ${__("orders")}${allOvd ? ` · <span class="ov">${allOvd} ${__("overdue")}</span>` : ""}</span></div>`]
			.concat(S.users.map((u) =>
				`<div class="ot-u ${S.owner === u.user ? "on" : ""}" data-u="${esc(u.user)}"><span class="un">${esc(u.name)}</span><span class="uc">${u.count} ${__("orders")}${u.overdue ? ` · <span class="ov">${u.overdue} ${__("overdue")}</span>` : ""}</span></div>`));
		root.find("#ot-users").html(tiles.join(""));
		root.find(".ot-u").on("click", function () { S.owner = this.getAttribute("data-u"); paintUsers(); paint(); });
	}

	function paintStages() {
		const stages = [...new Set(S.rows.map((r) => r.stage))].sort();
		root.find(".ot-stage").html(`<option value="">${__("All stages")}</option>` +
			stages.map((s) => `<option ${s === S.stage ? "selected" : ""}>${esc(s)}</option>`).join(""));
	}

	const visible = () => {
		const q = (S.q || "").trim().toLowerCase();
		let rs = S.rows.filter((r) =>
			(!S.owner || r.owner === S.owner) &&
			(!S.stage || r.stage === S.stage) &&
			(!S.due || r.health === S.due) &&
			(!q || (r.card + " " + r.design + " " + r.customer + " " + r.salesman + " " + r.job_order).toLowerCase().indexOf(q) !== -1));
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
		{ k: "card", t: __("Order ID") }, { k: "job_order", t: __("Job Order") },
		{ k: "design", t: __("Design") }, { k: "customer", t: __("Customer") },
		{ k: "salesman", t: __("Salesman") }, { k: "order_date", t: __("Ordered") },
		{ k: "due_date", t: __("Due") }, { k: "stage", t: __("Where") },
		{ k: "qty", t: __("Qty"), num: 1 }, { k: "gross", t: __("Gross g"), num: 1 },
		{ k: "age_days", t: __("Age d"), num: 1 }, { k: "owner_name", t: __("Placed by") },
		{ k: "_follow", t: __("Follow"), act: 1 },
	];

	function followCell(r) {
		if (r.can_follow) {
			return `<button class="ot-follow ${r.followed ? "on" : ""}" data-jo="${esc(r.job_order)}" data-on="${r.followed ? 1 : 0}">${r.followed ? "★ " + __("Following") : "☆ " + __("Follow")}</button>`;
		}
		return r.followed ? `<span class="ot-ftag" title="${__("Followed by the person who placed it")}">★ ${__("Followed")}</span>` : "";
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
		root.find(".ot-count").text(__("{0} of {1} shown", [rs.length, S.rows.length]));
		const arrow = (k) => (S.sortKey === k ? (S.sortDir > 0 ? " ▲" : " ▼") : "");
		const head = `<thead><tr>${COLS.map((c) => `<th class="${c.num ? "num" : ""}${c.act ? " act" : ""}" data-k="${c.k}">${c.t}${c.act ? "" : arrow(c.k)}</th>`).join("")}</tr></thead>`;
		const body = rs.length ? rs.map((r) => `<tr class="${r.health === "overdue" ? "ovd" : ""}">
			<td><span class="ot-oid jw-card-link" data-card="${esc(r.card)}">${esc(r.card)}</span></td>
			<td>${esc(r.job_order)}</td><td>${esc(r.design)}</td>
			<td>${esc(r.customer)}</td><td>${esc(r.salesman)}</td>
			<td>${r.order_date ? frappe.datetime.str_to_user(r.order_date) : ""}</td>
			<td>${dueCell(r)}</td>
			<td>${stageBadge(r)}</td>
			<td class="num">${r.qty}</td><td class="num">${r.gross ? r.gross.toFixed(3) : ""}</td>
			<td class="num">${r.age_days}</td><td>${esc(r.owner_name)}</td>
			<td class="act">${followCell(r)}</td>
		</tr>`).join("") : `<tr><td colspan="${COLS.length}" class="ot-none">${__("No active orders match.")}</td></tr>`;
		root.find("#ot-box").html(`<table class="ot-tbl">${head}<tbody>${body}</tbody></table>`);
		root.find("#ot-box th").on("click", function () {
			const k = this.getAttribute("data-k");
			if (k.charAt(0) === "_") return; // action columns don't sort
			if (S.sortKey === k) S.sortDir = -S.sortDir; else { S.sortKey = k; S.sortDir = 1; }
			paint();
		});
		root.find(".ot-follow").on("click", function () {
			const jo = this.getAttribute("data-jo");
			const on = this.getAttribute("data-on") === "1";
			frappe.call({ method: API + ".set_order_follow", args: { job_order: jo, followed: on ? 0 : 1 },
				freeze: true, freeze_message: on ? __("Unfollowing…") : __("Following…") }).then(() => {
				frappe.show_alert({ message: on ? __("Unfollowed {0}.", [jo]) : __("Following {0}.", [jo]),
					indicator: on ? "orange" : "green" }, 4);
				load();
			});
		});
	}

	root.find(".ot-q").on("input", function () { S.q = this.value; paint(); });
	root.find(".ot-stage").on("change", function () { S.stage = this.value; paint(); });
	root.find(".ot-duef").on("change", function () { S.due = this.value; paint(); });
	page.add_inner_button(__("Refresh"), load);
	load();
};
