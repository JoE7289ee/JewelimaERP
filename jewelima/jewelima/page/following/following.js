// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Ordering > Following — the FOLLOWED job orders (ticked at Place Order) that
// still have an unsold card, grouped by the person who placed them, with KPIs.
// Read-only for everyone; only the placer (or a System Manager) sees Unfollow,
// which drops that order off the page. Route: /app/following

frappe.pages["following"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Following", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const S = { rows: [], users: [], kpi: {}, me: "", owner: "", due: "", q: "", sortKey: "due_date", sortDir: 1 };

	$(page.main).append(`
		<style>
		#page-following .container{max-width:100%;}
		.fw-kpis{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px;}
		.fw-k{flex:1 1 130px;border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);padding:11px 16px;}
		.fw-k .kl{font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--text-muted);}
		.fw-k .kv{font-size:26px;font-weight:800;line-height:1.1;margin-top:2px;}
		.fw-k.red .kv{color:#b02a2a;} .fw-k.amber .kv{color:#b4690e;} .fw-k.green .kv{color:#1d7a33;} .fw-k.blue .kv{color:#1f618d;}
		.fw-lbl{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin:4px 0 8px;}
		.fw-users{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:16px;}
		.fw-u{border:1px solid var(--border-color);background:var(--fg-color);border-radius:11px;padding:7px 14px;cursor:pointer;display:flex;flex-direction:column;min-width:120px;transition:.1s;}
		.fw-u:hover{border-color:#1f618d;}
		.fw-u.on{background:#1f618d;border-color:#1f618d;color:#fff;}
		.fw-u .un{font-size:13px;font-weight:700;}
		.fw-u .uc{font-size:11px;color:var(--text-muted);margin-top:1px;}
		.fw-u.on .uc{color:rgba(255,255,255,.85);}
		.fw-u .ov{color:#b02a2a;font-weight:800;} .fw-u.on .ov{color:#ffd0d0;}
		.fw-mine{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;background:#e8f2fd;color:#1c5da8;border-radius:7px;padding:0 6px;margin-left:6px;}
		.fw-u.on .fw-mine{background:rgba(255,255,255,.25);color:#fff;}
		.fw-filters{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px;}
		.fw-filters input,.fw-filters select{border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);color:var(--text-color);height:32px;border-radius:7px;padding:2px 10px;font-size:13px;}
		.fw-filters input{min-width:230px;}
		.fw-count{margin-left:auto;color:var(--text-muted);font-size:12px;}
		.fw-box{border:1px solid var(--border-color);border-radius:12px;overflow:auto;}
		table.fw-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;background:var(--fg-color);}
		table.fw-tbl th{position:sticky;top:0;z-index:1;background:var(--control-bg,var(--fg-color));border-bottom:2px solid var(--gray-400,#aeb6bf);padding:8px 10px;text-align:left;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.03em;color:var(--text-muted);cursor:pointer;white-space:nowrap;}
		table.fw-tbl th.num,table.fw-tbl td.num{text-align:right;}
		table.fw-tbl th.act,table.fw-tbl td.act{text-align:center;cursor:default;}
		table.fw-tbl td{border-bottom:1px solid var(--border-color);padding:7px 10px;vertical-align:middle;white-space:nowrap;}
		table.fw-tbl tr.ovd td{background:rgba(176,42,42,.05);}
		.fw-jo{font-family:var(--font-family-monospace,monospace);font-weight:800;color:#1f618d;}
		.fw-where{display:inline-flex;gap:4px;flex-wrap:wrap;}
		.fw-chip{display:inline-block;border-radius:9px;padding:1px 8px;font-size:10.5px;font-weight:800;}
		.fw-chip.prod{background:#eef2f7;color:#5a6b7b;} .fw-chip.stock{background:#dcefe0;color:#1d7a33;} .fw-chip.cert{background:#d9f0ef;color:#0f6e66;}
		.fw-due{font-weight:700;} .fw-due.red{color:#b02a2a;} .fw-due.amber{color:#b4690e;} .fw-due.green{color:#1d7a33;}
		.fw-flag{display:inline-block;border-radius:8px;padding:0 7px;font-size:9.5px;font-weight:800;margin-left:4px;}
		.fw-flag.stn{background:#fff3cd;color:#8a6d00;} .fw-flag.oos{background:#fdecea;color:#b02a2a;}
		.fw-unfollow{border:1px solid #b02a2a;background:transparent;color:#b02a2a;border-radius:7px;padding:2px 10px;font-size:11.5px;font-weight:700;cursor:pointer;}
		.fw-unfollow:hover{background:#b02a2a;color:#fff;}
		.fw-none{padding:40px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:10px;}
		.fw-none b{color:var(--text-color);}
		</style>
		<div class="fw-kpis" id="fw-kpis"></div>
		<div class="fw-lbl">${__("Placed by — pick a person to focus")}</div>
		<div class="fw-users" id="fw-users"></div>
		<div class="fw-filters">
			<input class="fw-q" placeholder="${__("Search job order / customer / salesman")}">
			<select class="fw-duef">
				<option value="">${__("Any due")}</option>
				<option value="overdue">${__("Overdue")}</option>
				<option value="due_soon">${__("Due ≤ 3 days")}</option>
			</select>
			<span class="fw-count"></span>
		</div>
		<div class="fw-box" id="fw-box"></div>
	`);
	const root = $(page.main);

	function load() {
		frappe.call({ method: API + ".get_following" }).then((r) => {
			const m = r.message || {};
			S.rows = m.rows || []; S.users = m.users || []; S.kpi = m.kpi || {}; S.me = m.me || "";
			paintKpis(); paintUsers(); paint();
		});
	}

	function paintKpis() {
		const k = S.kpi;
		const defs = [
			["total", __("Following"), ""], ["cards", __("Cards"), "blue"],
			["overdue", __("Overdue"), "red"], ["due_soon", __("Due ≤ 3d"), "amber"],
			["in_production", __("In production"), "blue"], ["in_stock", __("In stock"), "green"],
			["awaiting_stone", __("Awaiting stone"), "amber"], ["oos", __("Out of stock"), "red"],
		];
		root.find("#fw-kpis").html(defs.map(([key, lbl, cls]) =>
			`<div class="fw-k ${(k[key] || 0) ? cls : ""}"><div class="kl">${lbl}</div><div class="kv">${k[key] || 0}</div></div>`).join(""));
	}

	function paintUsers() {
		const all = S.rows.length;
		const allOvd = S.users.reduce((a, u) => a + (u.overdue || 0), 0);
		const tiles = [`<div class="fw-u ${S.owner === "" ? "on" : ""}" data-u=""><span class="un">${__("Everyone")}</span><span class="uc">${all} ${__("orders")}${allOvd ? ` · <span class="ov">${allOvd} ${__("overdue")}</span>` : ""}</span></div>`]
			.concat(S.users.map((u) =>
				`<div class="fw-u ${S.owner === u.user ? "on" : ""}" data-u="${esc(u.user)}"><span class="un">${esc(u.name)}${u.user === S.me ? `<span class="fw-mine">${__("You")}</span>` : ""}</span><span class="uc">${u.count} ${__("orders")}${u.overdue ? ` · <span class="ov">${u.overdue} ${__("overdue")}</span>` : ""}</span></div>`));
		root.find("#fw-users").html(tiles.join(""));
		root.find(".fw-u").on("click", function () { S.owner = this.getAttribute("data-u"); paintUsers(); paint(); });
	}

	const visible = () => {
		const q = (S.q || "").trim().toLowerCase();
		let rs = S.rows.filter((r) =>
			(!S.owner || r.owner === S.owner) &&
			(!S.due || r.health === S.due) &&
			(!q || (r.job_order + " " + r.customer + " " + r.salesman).toLowerCase().indexOf(q) !== -1));
		const dir = S.sortDir, key = S.sortKey;
		rs = rs.slice().sort((a, b) => {
			let va = a[key], vb = b[key];
			if (key === "days_left" || key === "gross" || key === "cards" || key === "age_days") { va = flt(va); vb = flt(vb); }
			else { va = ("" + (va == null ? "" : va)).toLowerCase(); vb = ("" + (vb == null ? "" : vb)).toLowerCase(); }
			return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
		});
		return rs;
	};

	const COLS = [
		{ k: "job_order", t: __("Job Order") }, { k: "customer", t: __("Customer") },
		{ k: "salesman", t: __("Salesman") }, { k: "order_date", t: __("Ordered") },
		{ k: "due_date", t: __("Due") }, { k: "cards", t: __("Cards"), num: 1 },
		{ k: "where", t: __("Where") }, { k: "gross", t: __("Gross g"), num: 1 },
		{ k: "age_days", t: __("Age d"), num: 1 }, { k: "owner_name", t: __("Placed by") },
		{ k: "_act", t: "", act: 1 },
	];

	function dueCell(r) {
		if (!r.due_date) return "";
		const cls = r.health === "overdue" ? "red" : r.health === "due_soon" ? "amber" : "green";
		const txt = frappe.datetime.str_to_user(r.due_date);
		const tag = r.days_left == null ? "" : r.days_left < 0 ? ` (${-r.days_left}d late)` : r.days_left === 0 ? " (today)" : ` (${r.days_left}d)`;
		return `<span class="fw-due ${cls}">${txt}${tag}</span>`;
	}
	function whereCell(r) {
		const chips = (r.where || []).map((w) => `<span class="fw-chip ${w.cls}">${esc(w.stage)} ${w.n}</span>`).join("");
		return `<span class="fw-where">${chips}` +
			(r.awaiting_stone ? `<span class="fw-flag stn" title="${__("Awaiting stone issue")}">STN</span>` : "") +
			(r.oos ? `<span class="fw-flag oos" title="${__("Out of stock")}">OOS</span>` : "") + `</span>`;
	}

	function paint() {
		const rs = visible();
		root.find(".fw-count").text(__("{0} of {1} shown", [rs.length, S.rows.length]));
		const arrow = (k) => (S.sortKey === k ? (S.sortDir > 0 ? " ▲" : " ▼") : "");
		const head = `<thead><tr>${COLS.map((c) => `<th class="${c.num ? "num" : ""}${c.act ? " act" : ""}" data-k="${c.k}">${c.t}${c.act ? "" : arrow(c.k)}</th>`).join("")}</tr></thead>`;
		const body = rs.length ? rs.map((r) => `<tr class="${r.health === "overdue" ? "ovd" : ""}">
			<td><span class="fw-jo">${esc(r.job_order)}</span></td>
			<td>${esc(r.customer)}</td><td>${esc(r.salesman)}</td>
			<td>${r.order_date ? frappe.datetime.str_to_user(r.order_date) : ""}</td>
			<td>${dueCell(r)}</td>
			<td class="num">${r.cards}</td>
			<td>${whereCell(r)}</td>
			<td class="num">${r.gross ? r.gross.toFixed(3) : ""}</td>
			<td class="num">${r.age_days}</td><td>${esc(r.owner_name)}</td>
			<td class="act">${r.can_unfollow ? `<button class="fw-unfollow" data-jo="${esc(r.job_order)}">${__("Unfollow")}</button>` : ""}</td>
		</tr>`).join("") : `<tr><td colspan="${COLS.length}" class="fw-none">${__("Nothing followed yet. Tick <b>Follow</b> on Place Order to watch an order here.")}</td></tr>`;
		root.find("#fw-box").html(`<table class="fw-tbl">${head}<tbody>${body}</tbody></table>`);
		root.find("#fw-box th").on("click", function () {
			const k = this.getAttribute("data-k");
			if (k === "_act") return;
			if (S.sortKey === k) S.sortDir = -S.sortDir; else { S.sortKey = k; S.sortDir = 1; }
			paint();
		});
		root.find(".fw-unfollow").on("click", function () {
			const jo = this.getAttribute("data-jo");
			frappe.confirm(__("Stop following {0}? It will drop off this page.", [jo]), () => {
				frappe.call({ method: API + ".following_unfollow", args: { job_order: jo }, freeze: true,
					freeze_message: __("Unfollowing…") }).then(() => {
					frappe.show_alert({ message: __("Unfollowed {0}.", [jo]), indicator: "orange" }, 5);
					load();
				});
			});
		});
	}

	root.find(".fw-q").on("input", function () { S.q = this.value; paint(); });
	root.find(".fw-duef").on("change", function () { S.due = this.value; paint(); });
	page.add_inner_button(__("Refresh"), load);
	load();
};
