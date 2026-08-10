// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Bag Status — upload the old software's BAG STATUS report and see the WIP
// map of the factory. Four views, each printable landscape with every level
// opened:
//   LOCATION — location -> design types ("what's sitting at which stage")
//   USER     — holder -> locations (who's holding how much)
//   PARTY    — party group -> locations (whose orders are stuck where;
//              the Party Group Map lookup, new spellings auto-file to OTHER)
//   CUST     — customer-marked bags (Salesman = CUST / CO-*): each location a
//              title with its pieces beneath, most past DUE first; the top
//              strip of location ticks filters table AND print; due filter =
//              past-due or a picked date; order date prints only when ticked.
//   KPI      — the analyst dashboard: WIP exposure, aging, bottleneck
//              stages, holder load, CUST delivery risk, oldest-bag hunt
//              list. Read-only; location/user lines drill into the views.
// Rejection-location bags are dropped at the door (a tile counts them).
// Aging runs on the ORDER date (due dates in these files are junk); the
// age buckets carry PIECES. Straight data — nothing stored.
// Route: /app/bag-status

frappe.pages["bag-status"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Bag Status", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const g3 = (v) => (v || 0).toLocaleString("en-IN", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
	let FILE = null;  // {b64, name}
	let RAW = [];     // per-bag rows {user, loc, bag, item, size, dtype, qty, gw, nt, dmd_q, dmd, ps, cs, order_no, odate, days, party, cust}
	let MAP = {};     // party -> group (Party Group Map)
	let VIEW = "loc"; // "loc" | "user" | "party" | "cust"
	let OPEN = new Set();
	const CUSTOFF = new Set(); // locations ticked OUT of the CUST print
	let CUSTDUE = "all"; // due filter: all | past | within (N days to due, past excluded)
	let PRINT_ODATE = false; // CUST print carries the order date only when ticked
	let FILT = {};          // per-column text filters on the flat (CUST/BULK) view
	let SORT = { key: "overdue", dir: -1 }; // flat view sort (col + direction)

	const VIEWS = {
		loc: { label: __("Location"), l2: __("Location / Design type") },
		user: { label: __("User"), l2: __("User / Location") },
		party: { label: __("Party"), l2: __("Party group / Location") },
		cust: { label: __("CUST"), l2: "" },
		bulk: { label: __("BULK"), l2: "" },
		kpi: { label: __("KPI 📊"), l2: "" },
	};

	$(page.main).append(`
		<style>
		#page-bag-status .container{max-width:100%;}
		.bs-bar{display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin-bottom:10px;}
		.bs-file{border:2px dashed var(--border-color);border-radius:9px;padding:9px 16px;cursor:pointer;font-size:12.5px;color:var(--text-muted);}
		.bs-file.has{border-color:#2e7d32;color:#1d7a33;font-weight:700;}
		.bs-btn{border:none;color:#fff;font-weight:800;padding:9px 20px;border-radius:8px;cursor:pointer;}
		.bs-print{background:#5b3a8e;display:none;}
		.bs-views{display:none;gap:0;border:1px solid var(--border-color);border-radius:8px;overflow:hidden;}
		.bs-views button{border:none;padding:9px 16px;font-size:12px;font-weight:700;background:var(--control-bg);color:var(--text-color);cursor:pointer;}
		.bs-views button.on{background:#1f618d;color:#fff;}
		.bs-tiles{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:10px;}
		.bs-tile{border:1px solid var(--border-color);border-radius:9px;padding:7px 16px;background:var(--control-bg);}
		.bs-tile .k{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;}
		.bs-tile .v{font-size:16px;font-weight:800;}
		table.bs-t{width:100%;border-collapse:collapse;font-size:12px;background:var(--fg-color);}
		table.bs-t th{background:var(--control-bg);font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);padding:5px 8px;border:1px solid var(--border-color);text-align:right;white-space:nowrap;}
		table.bs-t th.l{text-align:left;}
		table.bs-t td{border:1px solid var(--border-color);padding:4px 8px;font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right;}
		table.bs-t td.l{text-align:left;}
		tr.bs-grp td{background:var(--control-bg);font-weight:800;cursor:pointer;}
		tr.bs-grp.flat td{cursor:default;}
		tr.bs-kid td.l:first-child{padding-left:26px;color:var(--text-muted);}
		td.bs-old{color:#a15c00;font-weight:700;}
		.bs-none{padding:34px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:10px;}
		.bs-ksec{margin-bottom:16px;}
		.bs-kh{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);margin-bottom:7px;}
		.bs-khs{font-weight:400;text-transform:none;letter-spacing:0;}
		.bs-ktiles{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px;}
		.bs-tile .ks{font-size:10.5px;color:var(--text-muted);margin-top:1px;}
		.bs-kbars{max-width:600px;margin-top:6px;}
		.bs-kbrow{display:flex;align-items:center;gap:10px;margin-bottom:4px;font-size:11.5px;}
		.bs-kbrow .lbl{width:64px;color:var(--text-muted);text-align:right;flex:none;}
		.bs-kbrow .tr{flex:1;background:var(--control-bg);border-radius:4px;height:12px;overflow:hidden;}
		.bs-kbrow .bar{display:block;height:100%;border-radius:4px;}
		.bs-kbrow .val{width:180px;flex:none;font-variant-numeric:tabular-nums;}
		.bs-kcols{display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start;}
		.bs-klist{flex:1;min-width:330px;}
		tr.bs-kj{cursor:pointer;}
		/* flat (CUST/BULK) view: scroll box + sticky header/filter, sortable cols */
		.bs-scroll{max-height:calc(100vh - 250px);overflow:auto;border:1px solid var(--border-color);border-radius:8px;}
		table.bs-flat{width:100%;border-collapse:separate;border-spacing:0;font-size:12px;background:var(--fg-color);}
		table.bs-flat th{position:sticky;top:0;z-index:3;background:var(--control-bg);font-size:10px;text-transform:uppercase;letter-spacing:.03em;color:var(--text-muted);padding:5px 8px;border-bottom:2px solid var(--gray-400,#aeb6bf);border-right:1px solid var(--border-color);text-align:left;white-space:nowrap;cursor:pointer;user-select:none;}
		table.bs-flat th .ar{color:#1f618d;font-weight:800;}
		table.bs-flat tr.bs-frow th{position:sticky;top:26px;z-index:2;background:var(--fg-color);padding:2px 4px;border-bottom:1px solid var(--border-color);}
		table.bs-flat tr.bs-frow input{width:100%;box-sizing:border-box;border:1px solid var(--border-color);border-radius:4px;padding:2px 5px;font-size:11px;background:var(--fg-color);color:var(--text-color);font-weight:400;text-transform:none;}
		table.bs-flat td{padding:4px 8px;border-bottom:1px solid var(--border-color);border-right:1px solid var(--border-color);font-variant-numeric:tabular-nums;white-space:nowrap;}
		table.bs-flat tr:hover td{background:var(--control-bg);}
		table.bs-flat tfoot td{position:sticky;bottom:0;background:var(--control-bg);font-weight:800;border-top:2px solid var(--gray-400,#aeb6bf);}
		td.bs-fnum,th.bs-fnum{text-align:right;}
		.bs-charts{display:flex;gap:18px;flex-wrap:wrap;margin:4px 0 18px;}
		.bs-chart{border:1px solid var(--border-color);border-radius:10px;background:var(--fg-color);padding:12px 14px;flex:1;min-width:320px;}
		.bs-chart .ct{font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px;}
		.bs-hb{display:flex;align-items:center;gap:8px;margin-bottom:5px;font-size:11.5px;}
		.bs-hb .lb{width:120px;text-align:right;color:var(--text-muted);flex:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
		.bs-hb .track{flex:1;background:var(--control-bg);border-radius:4px;height:14px;overflow:hidden;}
		.bs-hb .fill{display:block;height:100%;border-radius:4px;}
		.bs-hb .vv{width:96px;flex:none;font-variant-numeric:tabular-nums;}
		</style>
		<div class="bs-bar">
			<label class="bs-file">${__("📄 Pick the BAG STATUS .xlsx")}</label>
			<input type="file" class="bs-input" accept=".xlsx" style="display:none;">
			<div class="bs-views">
				${Object.keys(VIEWS).map((v) => `<button data-v="${v}">${VIEWS[v].label}</button>`).join("")}
			</div>
			<select class="bs-due" style="display:none;border:1px solid var(--border-color);border-radius:8px;padding:8px 10px;font-size:12px;font-weight:700;background:var(--control-bg);color:var(--text-color);">
				<option value="all">${__("Due: all")}</option>
				<option value="past">${__("Already past due")}</option>
				<option value="within">${__("Due in next … days")}</option>
			</select>
			<input type="number" min="0" step="1" class="bs-duein" placeholder="${__("days")}"
				style="display:none;width:74px;border:1px solid var(--border-color);border-radius:8px;padding:7px 10px;font-size:12px;background:var(--fg-color);color:var(--text-color);">
			<label class="bs-podate" style="display:none;align-items:center;gap:5px;font-size:11.5px;color:var(--text-muted);cursor:pointer;">
				<input type="checkbox" class="bs-podate-cb">${__("Order date in print")}</label>
			<button class="bs-btn bs-print">${__("Print 🖨")}</button>
		</div>
		<div class="bs-tiles"></div>
		<div class="bs-body"><div class="bs-none">${__("Upload the old software's BAG STATUS report — the factory WIP map by location, user and party, with the CUST pieces called out.")}</div></div>
	`);
	const root = $(page.main);

	root.find(".bs-file").on("click", () => root.find(".bs-input").get(0).click());
	root.find(".bs-input").on("change", function () {
		const file = this.files[0];
		if (!file) return;
		const rd = new FileReader();
		rd.onload = () => {
			FILE = { b64: rd.result, name: file.name };
			root.find(".bs-file").addClass("has").text("📄 " + file.name);
			Promise.all([
				frappe.call({ method: API + ".parse_bag_status_excel", args: { filedata: FILE.b64 } }),
				frappe.call({ method: API + ".get_party_group_map" }),
			]).then(([r1, r2]) => {
				RAW = (r1.message || {}).rows || [];
				MAP = r2.message || {};
				OPEN.clear();
				// CUST starts with every location unticked — the user opts in
				CUSTOFF.clear();
				RAW.forEach((r) => CUSTOFF.add(r.loc)); // all locations opt-in (CUST + BULK)
				root.find(".bs-views").css("display", "inline-flex");
				root.find(".bs-print").show();
				// first-time spellings persist straight into OTHER (same rule
				// as Party Gold) — redistribute them on Party Groups
				const fresh = [...new Set(RAW.map((r) => r.party).filter((p) => p && !MAP[p]))];
				if (fresh.length) {
					frappe.call({ method: API + ".set_party_group",
						args: { parties: JSON.stringify(fresh), group: "OTHER" } }).then(() => {
						fresh.forEach((p) => { MAP[p] = "OTHER"; });
						paint();
						frappe.show_alert({ message: __("{0} new part(ies) filed under OTHER — sort them on Party Groups when needed.", [fresh.length]), indicator: "blue" }, 5);
					});
				}
				paint();
			});
		};
		rd.readAsDataURL(file);
	});

	const bucketOf = (d) => (d <= 30 ? 0 : d <= 90 ? 1 : d <= 180 ? 2 : 3);
	const partyOf = (r) => r.party || __("(NO PARTY)");
	const groupOf = (r) => MAP[partyOf(r)] || "OTHER";
	const isFlat = (v) => v === "cust" || v === "bulk";
	const modeRows = (mode) => RAW.filter((r) => (mode === "cust" ? r.cust : !r.cust));
	const FCOLS = [
		{ k: "bag", h: __("Bag"), g: (r) => r.bag },
		{ k: "item", h: __("Item"), g: (r) => r.item },
		{ k: "loc", h: __("Location"), g: (r) => r.loc },
		{ k: "mark", h: __("Mark"), g: (r) => r.mark },
		{ k: "purity", h: __("Purity"), g: (r) => r.purity },
		{ k: "user", h: __("User"), g: (r) => r.user },
		{ k: "party", h: __("Party"), g: (r) => r.party },
		{ k: "qty", h: __("Qty"), g: (r) => r.qty, num: 1 },
		{ k: "dmd", h: __("DMD ct"), g: (r) => r.dmd, num: 1 },
		{ k: "odate", h: __("Order date"), g: (r) => r.odate },
		{ k: "days", h: __("Age d"), g: (r) => r.days, num: 1 },
		{ k: "ddate", h: __("Due date"), g: (r) => r.ddate },
		{ k: "overdue", h: __("Overdue d"), g: (r) => r.overdue, num: 1 },
	];

	function blankAgg() {
		return { bags: 0, pcs: 0, gw: 0, nt: 0, dmd: 0, ps: 0, cs: 0, b: [0, 0, 0, 0], oldest: 0 };
	}

	function addTo(x, r) {
		x.bags += 1;
		x.pcs += r.qty || 0;
		x.gw += r.gw || 0;
		x.nt += r.nt || 0;
		x.dmd += r.dmd || 0;
		x.ps += r.ps || 0;
		x.cs += r.cs || 0;
		x.b[bucketOf(r.days || 0)] += r.qty || 0;
		x.oldest = Math.max(x.oldest, r.days || 0);
	}

	function aggBy(k1, k2) {
		const out = {};
		RAW.forEach((r) => {
			const a = k1(r), b = k2(r);
			const L1 = (out[a] = out[a] || Object.assign({ items: {} }, blankAgg()));
			const L2 = (L1.items[b] = L1.items[b] || blankAgg());
			addTo(L1, r);
			addTo(L2, r);
		});
		return out;
	}

	function rollup() {
		if (VIEW === "loc") return aggBy((r) => r.loc, (r) => r.dtype);
		if (VIEW === "user") return aggBy((r) => r.user || "(NO USER)", (r) => r.loc);
		return aggBy(groupOf, (r) => r.loc);
	}

	const sortedKeys = (obj) => Object.keys(obj).sort((a, b) => obj[b].pcs - obj[a].pcs);

	function cellsHtml(x, cls) {
		return `<td>${x.bags}</td><td>${x.pcs}</td><td>${g3(x.gw)}</td><td><b>${g3(x.nt)}</b></td><td>${g3(x.dmd)}</td>
			<td>${x.b[0]}</td><td>${x.b[1]}</td><td>${x.b[2]}</td><td>${x.b[3]}</td>
			<td class="${x.oldest > 180 ? (cls || "bs-old") : ""}">${x.oldest}</td>`;
	}

	function paint() {
		if (!RAW.length) return;
		root.find(".bs-views button").each(function () {
			$(this).toggleClass("on", $(this).data("v") === VIEW);
		});
		root.find(".bs-print").toggle(VIEW !== "kpi");
		if (VIEW === "kpi") {
			root.find(".bs-due, .bs-podate, .bs-duein").hide();
			root.find(".bs-tiles").empty();
			return paintKPI();
		}
		const tot = blankAgg();
		let custN;
		if (isFlat(VIEW)) {
			flatFiltered(VIEW).forEach((r) => addTo(tot, r));
			custN = tot.bags;
		} else {
			RAW.forEach((r) => addTo(tot, r));
			custN = RAW.filter((r) => r.cust).length;
		}
		root.find(".bs-due, .bs-podate").css("display", isFlat(VIEW) ? "inline-flex" : "none");
		root.find(".bs-duein").toggle(isFlat(VIEW) && CUSTDUE === "within");
		root.find(".bs-tiles").html(`
			<div class="bs-tile"><div class="k">${__("Bags")}</div><div class="v">${tot.bags}</div></div>
			<div class="bs-tile"><div class="k">${__("Pieces")}</div><div class="v">${tot.pcs}</div></div>
			<div class="bs-tile"><div class="k">${__("Gross")}</div><div class="v">${g3(tot.gw)} g</div></div>
			<div class="bs-tile"><div class="k">${__("Net gold")}</div><div class="v">${g3(tot.nt)} g</div></div>
			<div class="bs-tile"><div class="k">${__("DMD")}</div><div class="v">${g3(tot.dmd)} ct</div></div>
			<div class="bs-tile"><div class="k">${isFlat(VIEW) ? (VIEW === "cust" ? __("CUST bags") : __("BULK bags")) : __("CUST bags")}</div><div class="v">${custN}</div></div>
			<div class="bs-tile"><div class="k">${__("Oldest order")}</div><div class="v">${tot.oldest} ${__("days")}</div></div>`);
		if (isFlat(VIEW)) return paintFlat(VIEW);
		const R = rollup();
		root.find(".bs-body").html(`
			<table class="bs-t"><thead><tr>
				<th class="l">${VIEWS[VIEW].l2}</th><th>${__("Bags")}</th><th>${__("Pcs")}</th><th>${__("GW g")}</th><th>${__("NT g")}</th><th>${__("DMD ct")}</th>
				<th title="${__("pieces per order-age band")}">0–30 d</th><th>31–90 d</th><th>91–180 d</th><th>180+ d</th><th>${__("Oldest")}</th>
			</tr></thead><tbody>
			${sortedKeys(R).map((name) => {
				const G = R[name];
				const kids = sortedKeys(G.items);
				return `<tr class="bs-grp" data-g="${esc(name)}">
					<td class="l">${OPEN.has(name) ? "" : "▸ "}${esc(name)} <span style="font-weight:400;color:var(--text-muted);">(${kids.length})</span></td>
					${cellsHtml(G)}
				</tr>` + (OPEN.has(name) ? kids.map((k) => `<tr class="bs-kid">
					<td class="l">${esc(k)}</td>${cellsHtml(G.items[k])}
				</tr>`).join("") : "");
			}).join("")}</tbody></table>`);
	}

	// due filter (shared by CUST + BULK flat views)
	function duePass(r) {
		if (CUSTDUE === "past") return (r.overdue || 0) > 0;
		if (CUSTDUE === "within") {
			const n = cint(root.find(".bs-duein").val());
			if (!n && n !== 0) return true;
			const o = r.overdue || 0;
			return o <= 0 && o >= -n;
		}
		return true;
	}
	function dueLabel() {
		if (CUSTDUE === "past") return __("already past due");
		if (CUSTDUE === "within" && root.find(".bs-duein").val())
			return __("due in the next {0} day(s)", [cint(root.find(".bs-duein").val())]);
		return "";
	}

	// every location in this mode, before the tick-out (the top strip lists them)
	function flatLocs(mode) {
		const locs = {};
		modeRows(mode).forEach((r) => { locs[r.loc] = (locs[r.loc] || 0) + 1; });
		return Object.keys(locs).sort((a, b) => locs[b] - locs[a]).map((l) => [l, locs[l]]);
	}

	// rows after location ticks + due filter + per-column text filters, then sorted
	function flatFiltered(mode) {
		let rows = modeRows(mode).filter((r) => !CUSTOFF.has(r.loc) && duePass(r));
		for (const c of FCOLS) {
			const q = (FILT[c.k] || "").trim().toLowerCase();
			if (q) rows = rows.filter((r) => String(c.g(r) == null ? "" : c.g(r)).toLowerCase().includes(q));
		}
		const col = FCOLS.find((c) => c.k === SORT.key) || FCOLS[0];
		rows = rows.slice().sort((a, b) => {
			let va = col.g(a), vb = col.g(b);
			if (col.num) { va = flt(va); vb = flt(vb); return (va - vb) * SORT.dir; }
			return String(va || "").localeCompare(String(vb || "")) * SORT.dir;
		});
		return rows;
	}


	function flatBodyHtml(rows) {
		return rows.map((r) => `<tr>${FCOLS.map((c) => {
			const v = c.g(r);
			const hot = (c.k === "overdue" && (r.overdue || 0) > 0) || (c.k === "days" && (r.days || 0) > 180);
			return `<td class="${c.num ? "bs-fnum" : ""} ${hot ? "bs-old" : ""}">${c.k === "dmd" ? g3(v) : esc(v == null ? "" : v)}</td>`;
		}).join("")}</tr>`).join("");
	}
	function flatFootHtml(rows) {
		const tot = blankAgg(); rows.forEach((r) => addTo(tot, r));
		return `<tr><td colspan="7">${__("TOTAL")} — ${rows.length} ${__("bag(s)")}</td>
			<td class="bs-fnum">${tot.pcs}</td><td class="bs-fnum">${g3(tot.dmd)}</td>
			<td></td><td class="bs-fnum">${tot.oldest}</td><td></td><td></td></tr>`;
	}

	// ---- the on-screen flat table: sticky header, per-column filters, sort ----
	function paintFlat(mode) {
		const rows = flatFiltered(mode);
		const strip = flatLocs(mode).map(([l, n]) => `
			<label style="display:inline-flex;align-items:center;gap:5px;border:1px solid var(--border-color);border-radius:14px;
				padding:2px 10px;margin:2px 6px 2px 0;font-size:11.5px;cursor:pointer;background:${CUSTOFF.has(l) ? "var(--control-bg)" : "var(--fg-color)"};
				${CUSTOFF.has(l) ? "opacity:.55;" : ""}">
				<input type="checkbox" class="bs-custloc" data-loc="${esc(l)}" ${CUSTOFF.has(l) ? "" : "checked"}
					style="width:13px;height:13px;accent-color:#1f618d;">${esc(l)} <span style="color:var(--text-muted);">(${n})</span></label>`).join("");
		const arrow = (k) => SORT.key === k ? `<span class="ar">${SORT.dir < 0 ? "▼" : "▲"}</span>` : "";
		const head = FCOLS.map((c) => `<th class="${c.num ? "bs-fnum" : ""}" data-sort="${c.k}">${c.h} ${arrow(c.k)}</th>`).join("");
		const frow = FCOLS.map((c) => `<th><input class="bs-filt" data-k="${c.k}" value="${esc(FILT[c.k] || "")}" placeholder="${__("filter")}"></th>`).join("");
		const body = flatBodyHtml(rows);
		root.find(".bs-body").html(`
			<div style="margin-bottom:8px;">
				<button class="bs-locall" style="border:none;border-radius:6px;padding:3px 12px;font-size:11px;font-weight:700;color:#fff;background:#1f618d;cursor:pointer;margin-right:4px;">${__("Select all")}</button>
				<button class="bs-locnone" style="border:none;border-radius:6px;padding:3px 12px;font-size:11px;font-weight:700;color:#fff;background:#8a2f2f;cursor:pointer;margin-right:8px;">${__("Unselect all")}</button>
				${strip}</div>
			${rows.length ? `<div class="bs-scroll"><table class="bs-flat">
				<thead><tr>${head}</tr><tr class="bs-frow">${frow}</tr></thead>
				<tbody>${body}</tbody>
				<tfoot>${flatFootHtml(rows)}</tfoot>
			</table></div>`
			: `<div class="bs-none">${__("Nothing matches the location ticks / due / column filters.")}</div>`}`);
	}

	root.on("click", ".bs-locall", () => {
		modeRows(VIEW).forEach((r) => CUSTOFF.delete(r.loc)); // show all of this mode
		paint();
	});
	root.on("click", ".bs-locnone", () => {
		modeRows(VIEW).forEach((r) => CUSTOFF.add(r.loc));
		paint();
	});
	// per-column filter — repaint ONLY tbody/tfoot so the focused input survives
	root.on("input", ".bs-filt", function () {
		FILT[this.getAttribute("data-k")] = this.value;
		const rows = flatFiltered(VIEW);
		root.find(".bs-flat tbody").html(flatBodyHtml(rows));
		root.find(".bs-flat tfoot").html(flatFootHtml(rows));
	});
	// click a column header to sort (toggle direction)
	root.on("click", ".bs-flat th[data-sort]", function () {
		const k = this.getAttribute("data-sort");
		if (SORT.key === k) SORT.dir = -SORT.dir;
		else SORT = { key: k, dir: 1 };
		paintFlat(VIEW);
	});
	root.on("change", ".bs-custloc", function () {
		const loc = $(this).data("loc");
		this.checked ? CUSTOFF.delete(loc) : CUSTOFF.add(loc);
		paint();
	});
	root.on("change", ".bs-due", function () {
		CUSTDUE = this.value;
		root.find(".bs-duein").toggle(CUSTDUE === "within");
		paint();
	});
	root.on("input", ".bs-duein", () => paint());
	root.on("change", ".bs-podate-cb", function () {
		PRINT_ODATE = this.checked;
	});

	root.on("click", ".bs-views button", function () {
		VIEW = $(this).data("v");
		OPEN.clear();
		FILT = {};
		SORT = { key: "overdue", dir: -1 };
		paint();
	});
	root.on("click", "tr.bs-grp:not(.flat)", function () {
		const g = $(this).data("g");
		OPEN.has(g) ? OPEN.delete(g) : OPEN.add(g);
		paint();
	});

	// KPI drill-through: a location/user line opens the real view on it
	root.on("click", "tr.bs-kj", function () {
		VIEW = $(this).data("view");
		OPEN = new Set([$(this).data("key")]);
		paint();
	});

	// ---- KPI view: the analyst read on the WIP map — where production
	// stalls, who carries the load, and how hot the CUST deliveries are.
	function paintKPI() {
		const tot = blankAgg();
		let wdTot = 0, over180pcs = 0, over90pcs = 0;
		RAW.forEach((r) => {
			addTo(tot, r);
			wdTot += (r.qty || 0) * (r.days || 0);
			if ((r.days || 0) > 90) over90pcs += r.qty || 0;
			if ((r.days || 0) > 180) over180pcs += r.qty || 0;
		});
		const by = (key) => {
			const m = {};
			RAW.forEach((r) => {
				const k = key(r);
				const x = (m[k] = m[k] || Object.assign({ wd: 0 }, blankAgg()));
				addTo(x, r);
				x.wd += (r.qty || 0) * (r.days || 0);
			});
			return m;
		};
		const locs = by((r) => r.loc), users = by((r) => r.user || "(NO USER)"), pgroups = by(groupOf);
		const lk = sortedKeys(locs), uk = sortedKeys(users), gk = sortedKeys(pgroups);
		const wavg = (x) => (x.pcs ? x.wd / x.pcs : 0);
		const pctP = (v) => (tot.pcs ? ((v / tot.pcs) * 100).toFixed(1) : "0.0");
		const daysArr = RAW.map((r) => r.days || 0).sort((a, b) => a - b);
		const median = daysArr[Math.floor(daysArr.length / 2)] || 0;
		const oldestRow = RAW.reduce((a, r) => ((r.days || 0) > (a.days || 0) ? r : a), RAW[0]);
		// CUST delivery risk — the whole lane, no location ticks here
		const cust = RAW.filter((r) => r.cust);
		const cpast = cust.filter((r) => (r.overdue || 0) > 0);
		const cdue7 = cust.filter((r) => (r.overdue || 0) <= 0 && (r.overdue || 0) >= -7);
		const worstOver = cpast.reduce((m, r) => Math.max(m, r.overdue || 0), 0);
		const tile = (k, v, sub) => `<div class="bs-tile"><div class="k">${k}</div><div class="v">${v}</div>${sub ? `<div class="ks">${sub}</div>` : ""}</div>`;
		const BUCKETS = ["0–30 d", "31–90 d", "91–180 d", "180+ d"];
		const BCOL = ["#2e7d32", "#1f618d", "#b45309", "#b02a2a"];
		const bmax = Math.max(...tot.b, 1);
		const locTable = (keys, title, hint) => `
			<div class="bs-klist"><div class="bs-kh">${title} <span class="bs-khs">· ${hint}</span></div>
			<table class="bs-t"><thead><tr><th class="l">${__("Location")}</th><th>${__("Bags")}</th><th>${__("Pcs")}</th><th>${__("% pcs")}</th><th>${__("avg d")}</th><th>${__("oldest")}</th></tr></thead><tbody>
			${keys.slice(0, 10).map((l) => {
				const x = locs[l];
				return `<tr class="bs-kj" data-view="loc" data-key="${esc(l)}"><td class="l">${esc(l)}</td>
					<td>${x.bags}</td><td><b>${x.pcs}</b></td><td>${pctP(x.pcs)}</td>
					<td><b>${Math.round(wavg(x))}</b></td><td class="${x.oldest > 180 ? "bs-old" : ""}">${x.oldest}</td></tr>`;
			}).join("")}</tbody></table></div>`;
		// --- little SVG charts (self-contained, theme-safe) -------------------
		const donut = (segs, center) => {
			const total = segs.reduce((n, x) => n + x.value, 0) || 1;
			const R = 52, C = 2 * Math.PI * R;
			let off = 0;
			const rings = segs.map((x) => {
				const len = (x.value / total) * C;
				const el = `<circle r="${R}" cx="70" cy="70" fill="none" stroke="${x.color}" stroke-width="22"
					stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"></circle>`;
				off += len; return el;
			}).join("");
			return `<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;">
				<svg width="140" height="140" viewBox="0 0 140 140">${rings}
					<text x="70" y="66" text-anchor="middle" font-size="20" font-weight="800" fill="var(--text-color)">${center}</text>
					<text x="70" y="84" text-anchor="middle" font-size="9" fill="var(--text-muted)">${__("pieces")}</text></svg>
				<div style="font-size:12px;">${segs.map((x) => `<div style="display:flex;align-items:center;gap:7px;margin-bottom:4px;">
					<span style="width:11px;height:11px;border-radius:3px;background:${x.color};display:inline-block;"></span>
					${x.label} <b style="margin-left:auto;padding-left:10px;">${x.value}</b>
					<span style="color:var(--text-muted);">${total ? Math.round(x.value / total * 100) : 0}%</span></div>`).join("")}</div>
			</div>`;
		};
		const hbars = (items, color) => {
			const mx = Math.max(...items.map((i) => i.v), 1);
			return items.map((i) => `<div class="bs-hb"><span class="lb" title="${esc(i.k)}">${esc(i.k)}</span>
				<span class="track"><span class="fill" style="width:${(i.v / mx) * 100}%;background:${color};"></span></span>
				<span class="vv">${i.v}${i.s ? " · " + i.s + "d" : ""}</span></div>`).join("");
		};
		const stageBars = lk.slice(0, 8).map((l) => ({ k: l, v: locs[l].pcs, s: Math.round(wavg(locs[l])) }));
		root.find(".bs-body").html(`
			<div class="bs-ksec"><div class="bs-kh">${__("WIP on the floor")}</div><div class="bs-ktiles">
				${tile(__("Bags"), tot.bags)}
				${tile(__("Pieces"), tot.pcs)}
				${tile(__("Gross"), g3(tot.gw) + " g")}
				${tile(__("Net gold"), g3(tot.nt) + " g")}
				${tile("DMD", g3(tot.dmd) + " ct")}
				${tile("PS", g3(tot.ps) + " ct")}
				${tile("CS", g3(tot.cs) + " ct")}
				${tile(__("Locations"), lk.length, __("{0} user(s)", [uk.length]))}
			</div></div>
			<div class="bs-ksec"><div class="bs-kh">${__("Order aging — how long WIP has been open")}</div><div class="bs-ktiles">
				${tile(__("Avg days"), Math.round(tot.pcs ? wdTot / tot.pcs : 0), __("piece-weighted"))}
				${tile(__("Median days"), median, __("per bag"))}
				${tile(__("Pcs past 90 d"), over90pcs, pctP(over90pcs) + __("% of pieces"))}
				${tile(__("Pcs past 180 d"), over180pcs, pctP(over180pcs) + __("% of pieces"))}
				${tile(__("Oldest order"), (oldestRow.days || 0) + " " + __("d"), esc(oldestRow.bag) + " · " + esc(oldestRow.loc))}
			</div>
			<div class="bs-kbars">${BUCKETS.map((b, i) => `
				<div class="bs-kbrow"><span class="lbl">${b}</span>
					<span class="tr"><span class="bar" style="width:${(tot.b[i] / bmax) * 100}%;background:${BCOL[i]};"></span></span>
					<span class="val">${tot.b[i]} ${__("pcs")} · ${pctP(tot.b[i])}%</span></div>`).join("")}
			</div></div>
			<div class="bs-ksec"><div class="bs-kh">${__("CUST deliveries — the promised lane")}</div><div class="bs-ktiles">
				${tile(__("CUST bags"), cust.length, cust.reduce((n, r) => n + (r.qty || 0), 0) + " " + __("pcs"))}
				${tile(__("Past due"), cpast.length, __("bags already late"))}
				${tile(__("Worst overdue"), worstOver + " " + __("d"))}
				${tile(__("Due in 7 d"), cdue7.length, __("bags — this week's fires"))}
			</div></div>
			<div class="bs-charts">
				<div class="bs-chart"><div class="ct">${__("Aging mix — pieces by order age")}</div>
					${donut([
						{ label: "0–30 d", value: tot.b[0], color: BCOL[0] },
						{ label: "31–90 d", value: tot.b[1], color: BCOL[1] },
						{ label: "91–180 d", value: tot.b[2], color: BCOL[2] },
						{ label: "180+ d", value: tot.b[3], color: BCOL[3] },
					], tot.pcs)}
				</div>
				<div class="bs-chart"><div class="ct">${__("Where the work sits — top stages by pieces")} <span style="font-weight:400;color:var(--text-muted);">· ${__("avg age on the right")}</span></div>
					${stageBars.length ? hbars(stageBars, "#1f618d") : `<div class="bs-none">${__("no data")}</div>`}
				</div>
				<div class="bs-chart"><div class="ct">${__("CUST delivery clock")}</div>
					${cust.length ? hbars([
						{ k: __("Past due"), v: cpast.length },
						{ k: __("Due in 7 d"), v: cdue7.length },
						{ k: __("Later / open"), v: cust.length - cpast.length - cdue7.length },
					], "#b45309") : `<div class="bs-none">${__("no CUST bags")}</div>`}
				</div>
			</div>
			<div class="bs-kcols">
				${locTable(lk.slice().sort((a, b) => wavg(locs[b]) - wavg(locs[a])), __("Bottlenecks — stalest stages"), __("piece-weighted avg days, click to open"))}
				${locTable(lk, __("Heaviest stages"), __("most pieces sitting, click to open"))}
				<div class="bs-klist"><div class="bs-kh">${__("Holders — who carries the load")} <span class="bs-khs">· ${__("click to open")}</span></div>
				<table class="bs-t"><thead><tr><th class="l">${__("User")}</th><th>${__("Bags")}</th><th>${__("Pcs")}</th><th>${__("% pcs")}</th><th>${__("avg d")}</th><th>${__("oldest")}</th></tr></thead><tbody>
				${uk.slice(0, 10).map((u) => {
					const x = users[u];
					return `<tr class="bs-kj" data-view="user" data-key="${esc(u)}"><td class="l">${esc(u)}</td>
						<td>${x.bags}</td><td><b>${x.pcs}</b></td><td>${pctP(x.pcs)}</td>
						<td>${Math.round(wavg(x))}</td><td class="${x.oldest > 180 ? "bs-old" : ""}">${x.oldest}</td></tr>`;
				}).join("")}</tbody></table></div>
			</div>
			<div class="bs-kcols" style="margin-top:16px;">
				<div class="bs-klist"><div class="bs-kh">${__("Party groups — whose orders are on the floor")}</div>
				<table class="bs-t"><thead><tr><th class="l">${__("Group")}</th><th>${__("Bags")}</th><th>${__("Pcs")}</th><th>${__("% pcs")}</th><th>${__("avg d")}</th><th>${__("oldest")}</th></tr></thead><tbody>
				${gk.slice(0, 10).map((g) => {
					const x = pgroups[g];
					return `<tr><td class="l">${esc(g)}</td><td>${x.bags}</td><td><b>${x.pcs}</b></td>
						<td>${pctP(x.pcs)}</td><td>${Math.round(wavg(x))}</td>
						<td class="${x.oldest > 180 ? "bs-old" : ""}">${x.oldest}</td></tr>`;
				}).join("")}</tbody></table></div>
				<div class="bs-klist"><div class="bs-kh">${__("Hunt list — the 10 oldest bags on the floor")}</div>
				<table class="bs-t"><thead><tr><th class="l">${__("Bag")}</th><th class="l">${__("Item")}</th><th class="l">${__("Location")}</th><th class="l">${__("User")}</th><th>${__("Qty")}</th><th>${__("Days")}</th></tr></thead><tbody>
				${RAW.slice().sort((a, b) => (b.days || 0) - (a.days || 0)).slice(0, 10).map((r) => `
					<tr><td class="l">${esc(r.bag)}</td><td class="l">${esc(r.item)}</td><td class="l">${esc(r.loc)}</td>
					<td class="l">${esc(r.user)}</td><td>${r.qty || 0}</td>
					<td class="${(r.days || 0) > 180 ? "bs-old" : ""}"><b>${r.days || 0}</b></td></tr>`).join("")}
				</tbody></table></div>
			</div>`);
	}

	// ------------------------------------------------------------- printing
	function printDoc(title, sub, headHtml, bodyHtml, portrait) {
		const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
			@page{size:A4 ${portrait ? "portrait" : "landscape"};margin:10mm;}
			body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;}
			h1{font-size:17px;margin:0 0 2px;}
			.sub{font-size:11px;color:#555;margin-bottom:10px;}
			table{width:100%;border-collapse:collapse;font-size:${portrait ? "9px" : "10.5px"};}
			th,td{border:1px solid #999;padding:${portrait ? "2px 4px" : "3px 6px"};text-align:right;white-space:nowrap;}
			th.l,td.l{text-align:left;}
			th{background:#eee;text-transform:uppercase;font-size:9px;letter-spacing:.04em;}
			tr.grp td{background:#f2f2f2;font-weight:bold;}
			tr.kid td.l:first-child{padding-left:22px;color:#444;}
			tr.tot td{font-weight:bold;border-top:2px solid #333;}
			td.old{color:#a15c00;font-weight:bold;}
			tr{page-break-inside:avoid;}
		</style></head><body>
			<h1>${title}</h1><div class="sub">${sub}</div>
			<table><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>
		</body></html>`;
		document.getElementById("bs-print-frame")?.remove();
		const fr = document.createElement("iframe");
		fr.id = "bs-print-frame";
		fr.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
		document.body.appendChild(fr);
		fr.srcdoc = html;
		fr.onload = () => setTimeout(() => { fr.contentWindow.focus(); fr.contentWindow.print(); }, 150);
	}

	const pcells = (x) => `<td>${x.bags}</td><td>${x.pcs}</td><td>${g3(x.gw)}</td><td><b>${g3(x.nt)}</b></td>
		<td>${g3(x.dmd)}</td><td>${g3(x.ps)}</td><td>${g3(x.cs)}</td>
		<td>${x.b[0]}</td><td>${x.b[1]}</td><td>${x.b[2]}</td><td>${x.b[3]}</td>
		<td class="${x.oldest > 180 ? "old" : ""}">${x.oldest}</td>`;
	const PHEAD = `<th>${__("Bags")}</th><th>${__("Pcs")}</th><th>${__("GW g")}</th><th>${__("NT g")}</th>
		<th>${__("DMD ct")}</th><th>${__("PS ct")}</th><th>${__("CS ct")}</th>
		<th>${__("Pcs 0–30 d")}</th><th>${__("Pcs 31–90 d")}</th><th>${__("Pcs 91–180 d")}</th><th>${__("Pcs 180+ d")}</th><th>${__("Oldest")}</th>`;

	root.on("click", ".bs-print", () => {
		if (!RAW.length) return;
		const tot = blankAgg();
		RAW.forEach((r) => addTo(tot, r));
		const sub = `${esc((FILE && FILE.name) || "")} · ${__("generated")} ${frappe.datetime.now_datetime()}
			· ${tot.bags} ${__("bags")} · ${tot.pcs} ${__("pieces")} · NT ${g3(tot.nt)} g · DMD ${g3(tot.dmd)} ct`;
		if (isFlat(VIEW)) {
			// PRINT MIRRORS THE SCREEN: same flat rows, same filters, same sort order
			const rows = flatFiltered(VIEW);
			if (!rows.length) return frappe.show_alert({ message: __("Nothing matches the filters on screen."), indicator: "orange" }, 4);
			const w = PRINT_ODATE;
			const ctot = blankAgg(); rows.forEach((r) => addTo(ctot, r));
			// print the visible columns in the visible order (Location included, since it's a flat list)
			const PCOLS = FCOLS.filter((c) => w || c.k !== "odate");
			const HEAD = PCOLS.map((c) => `<th class="${c.num ? "" : "l"}">${c.h}</th>`).join("");
			const prow = (r) => PCOLS.map((c) => {
				const v = c.g(r);
				const hot = (c.k === "overdue" && (r.overdue || 0) > 0) || (c.k === "days" && (r.days || 0) > 180);
				return `<td class="${c.num ? "" : "l"} ${hot ? "old" : ""}">${c.k === "dmd" ? g3(v) : esc(v == null ? "" : v)}</td>`;
			}).join("");
			const body = rows.map((r) => `<tr class="kid">${prow(r)}</tr>`).join("")
				+ `<tr class="tot">${PCOLS.map((c, i) => {
					if (i === 0) return `<td class="l">${__("TOTAL")} (${ctot.bags} ${__("bags")})</td>`;
					if (c.k === "qty") return `<td>${ctot.pcs}</td>`;
					if (c.k === "dmd") return `<td>${g3(ctot.dmd)}</td>`;
					if (c.k === "overdue" || c.k === "days") return `<td>${ctot.oldest}</td>`;
					return "<td></td>";
				}).join("")}</tr>`;
			const sortCol = FCOLS.find((c) => c.k === SORT.key);
			return printDoc(__("BAG STATUS — {0} PRINT", [VIEW.toUpperCase()]), sub
				+ (dueLabel() ? ` · <b>${dueLabel()}</b>` : "")
				+ (sortCol ? ` · ${__("sorted by")} ${sortCol.h} ${SORT.dir < 0 ? "↓" : "↑"}` : "")
				+ (Object.values(FILT).some((v) => (v || "").trim()) ? ` · ${__("filtered")}` : "")
				+ (CUSTOFF.size ? ` · ${__("{0} location(s) ticked out", [CUSTOFF.size])}` : ""), HEAD, body, true);
		}
		const R = rollup();
		const body = sortedKeys(R).map((name) => {
			const G = R[name];
			return `<tr class="grp"><td class="l">${esc(name)}</td>${pcells(G)}</tr>`
				+ sortedKeys(G.items).map((k) => `<tr class="kid"><td class="l">${esc(k)}</td>${pcells(G.items[k])}</tr>`).join("");
		}).join("") + `<tr class="tot"><td class="l">${__("TOTAL")}</td>${pcells(tot)}</tr>`;
		const names = { loc: __("LOCATION PRINT"), user: __("USER PRINT"), party: __("PARTY PRINT") };
		printDoc(__("BAG STATUS — {0}", [names[VIEW]]), sub,
			`<th class="l">${VIEWS[VIEW].l2}</th>${PHEAD}`, body);
	});
};
