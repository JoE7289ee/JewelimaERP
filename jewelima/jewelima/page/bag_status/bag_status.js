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
//   CUST     — customer-marked bags (Salesman = CUST): each location as a
//              title with its pieces beneath, most past DUE first; tick a
//              location out to drop it from the CUST print
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
	let CUSTDUE = "all"; // due filter: all | past | d7 | d30

	const VIEWS = {
		loc: { label: __("Location"), l2: __("Location / Design type") },
		user: { label: __("User"), l2: __("User / Location") },
		party: { label: __("Party"), l2: __("Party group / Location") },
		cust: { label: __("CUST"), l2: "" },
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
				<option value="d7">${__("Due within 7 d (incl. past)")}</option>
				<option value="d30">${__("Due within 30 d (incl. past)")}</option>
			</select>
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
		const tot = blankAgg();
		RAW.forEach((r) => addTo(tot, r));
		const custN = RAW.filter((r) => r.cust).length;
		root.find(".bs-views button").each(function () {
			$(this).toggleClass("on", $(this).data("v") === VIEW);
		});
		root.find(".bs-due").toggle(VIEW === "cust");
		root.find(".bs-tiles").html(`
			<div class="bs-tile"><div class="k">${__("Bags")}</div><div class="v">${tot.bags}</div></div>
			<div class="bs-tile"><div class="k">${__("Pieces")}</div><div class="v">${tot.pcs}</div></div>
			<div class="bs-tile"><div class="k">${__("Gross")}</div><div class="v">${g3(tot.gw)} g</div></div>
			<div class="bs-tile"><div class="k">${__("Net gold")}</div><div class="v">${g3(tot.nt)} g</div></div>
			<div class="bs-tile"><div class="k">${__("DMD")}</div><div class="v">${g3(tot.dmd)} ct</div></div>
			<div class="bs-tile"><div class="k">${__("CUST bags")}</div><div class="v">${custN}</div></div>
			<div class="bs-tile"><div class="k">${__("Oldest order")}</div><div class="v">${tot.oldest} ${__("days")}</div></div>`);
		if (VIEW === "cust") return paintCust();
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

	// CUST bags: each location a title, its pieces beneath, MOST-OVERDUE first
	// (sorted on the due date; positive Overdue = past due)
	const DUE_PRED = { all: () => true, past: (r) => (r.overdue || 0) > 0,
		d7: (r) => (r.overdue || 0) >= -7, d30: (r) => (r.overdue || 0) >= -30 };
	const DUE_LABEL = { all: "", past: __("already past due"), d7: __("due within 7 d"), d30: __("due within 30 d") };

	function custSections() {
		const bags = RAW.filter((r) => r.cust && DUE_PRED[CUSTDUE](r));
		const locs = {};
		bags.forEach((r) => { (locs[r.loc] = locs[r.loc] || []).push(r); });
		return Object.keys(locs)
			.sort((a, b) => locs[b].length - locs[a].length)
			.map((loc) => {
				const list = locs[loc].sort((a, b) => (b.overdue || 0) - (a.overdue || 0));
				const t = blankAgg();
				t.maxover = 0;
				list.forEach((r) => { addTo(t, r); t.maxover = Math.max(t.maxover, r.overdue || 0); });
				return { loc, list, t };
			});
	}

	const CUST_HEAD = (l) => `<th class="${l || ""}">${__("Bag")}</th><th class="${l || ""}">${__("Item")}</th><th class="${l || ""}">${__("Type")}</th>
		<th class="${l || ""}" title="${__("the order-lane marker from the file: CUST, CO-HP (WED)…")}">${__("Mark")}</th>
		<th class="${l || ""}">${__("Purity")}</th><th class="${l || ""}">${__("User")}</th>
		<th>${__("Qty")}</th><th>${__("DMD ct")}</th>
		<th class="${l || ""}">${__("Party")}</th><th class="${l || ""}">${__("Due date")}</th><th title="${__("days past the due date — negative means not due yet")}">${__("Overdue d")}</th>`;

	function custRow(r, old) {
		return `<td class="l">${esc(r.bag)}</td><td class="l">${esc(r.item)}</td><td class="l">${esc(r.dtype)}</td>
			<td class="l">${esc(r.mark)}</td>
			<td class="l">${esc(r.purity)}</td><td class="l">${esc(r.user)}</td>
			<td>${r.qty}</td><td>${g3(r.dmd)}</td>
			<td class="l">${esc(r.party)}</td><td class="l">${esc(r.ddate)}</td>
			<td class="${(r.overdue || 0) > 0 ? old : ""}">${r.overdue || 0}</td>`;
	}

	function custTitleRow(s, extra) {
		return `<td class="l" colspan="6">${extra || ""}${esc(s.loc)}
				<span style="font-weight:400;color:var(--text-muted);">(${s.t.bags} ${__("bags")})</span></td>
			<td>${s.t.pcs}</td><td>${g3(s.t.dmd)}</td><td></td><td></td>
			<td class="${s.t.maxover > 0 ? "bs-old" : ""}">${s.t.maxover}</td>`;
	}

	function paintCust() {
		const secs = custSections();
		root.find(".bs-body").html(secs.length ? `
			<table class="bs-t"><thead><tr>${CUST_HEAD("l")}</tr></thead><tbody>
			${secs.map((s) => `<tr class="bs-grp flat">${custTitleRow(s,
				`<input type="checkbox" class="bs-custloc" data-loc="${esc(s.loc)}" ${CUSTOFF.has(s.loc) ? "" : "checked"}
					title="${__("untick to leave this location out of the CUST print")}" style="margin-right:7px;"> `)}</tr>
			${s.list.map((r) => `<tr class="bs-kid">${custRow(r, "bs-old")}</tr>`).join("")}`).join("")}
			</tbody></table>`
			: `<div class="bs-none">${CUSTDUE === "all" ? __("No CUST-marked bags in this report.") : __("No CUST bags match the due filter.")}</div>`);
	}

	root.on("change", ".bs-custloc", function () {
		const loc = $(this).data("loc");
		this.checked ? CUSTOFF.delete(loc) : CUSTOFF.add(loc);
	});
	root.on("change", ".bs-due", function () {
		CUSTDUE = this.value;
		paint();
	});

	root.on("click", ".bs-views button", function () {
		VIEW = $(this).data("v");
		OPEN.clear();
		paint();
	});
	root.on("click", "tr.bs-grp:not(.flat)", function () {
		const g = $(this).data("g");
		OPEN.has(g) ? OPEN.delete(g) : OPEN.add(g);
		paint();
	});

	// ------------------------------------------------------------- printing
	function printDoc(title, sub, headHtml, bodyHtml) {
		const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
			@page{size:A4 landscape;margin:10mm;}
			body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;}
			h1{font-size:17px;margin:0 0 2px;}
			.sub{font-size:11px;color:#555;margin-bottom:10px;}
			table{width:100%;border-collapse:collapse;font-size:10.5px;}
			th,td{border:1px solid #999;padding:3px 6px;text-align:right;white-space:nowrap;}
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
		if (VIEW === "cust") {
			const secs = custSections().filter((s) => !CUSTOFF.has(s.loc));
			if (!secs.length) return frappe.show_alert({ message: __("Every location is ticked out — nothing to print."), indicator: "orange" }, 4);
			const ctot = blankAgg();
			secs.forEach((s) => s.list.forEach((r) => addTo(ctot, r)));
			const body = secs.map((s) => `<tr class="grp">${custTitleRow(s)}</tr>
				${s.list.map((r) => `<tr class="kid">${custRow(r, "old")}</tr>`).join("")}`).join("")
				+ `<tr class="tot"><td class="l" colspan="6">${__("TOTAL CUST")} (${ctot.bags} ${__("bags")})</td>
				<td>${ctot.pcs}</td><td>${g3(ctot.dmd)}</td><td></td><td></td><td></td></tr>`;
			return printDoc(__("BAG STATUS — CUST PRINT"), sub
				+ (CUSTDUE !== "all" ? ` · <b>${DUE_LABEL[CUSTDUE]}</b>` : ""), CUST_HEAD("l"), body);
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
