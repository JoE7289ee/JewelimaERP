// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Party Gold — upload the old software's PARTY SELECTION report and see how
// much gold is outstanding with aging (0-30 / 31-90 / 91-180 / 180+ days on
// the file's own holding period; the buckets carry NT grams). Two views:
//   PARTIES      — group -> raw parties (via the Party Group Map lookup;
//                  a spelling seen for the FIRST time is auto-saved into the
//                  OTHER group — redistribute it on Party Groups) · "General print"
//   DESIGN TYPES — design type -> which groups hold it · "DesignType print"
// Click a party line for its printable statement (pieces, oldest first).
// The mapping persists; the report data doesn't.
// Route: /app/party-gold

frappe.pages["party-gold"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Party Gold", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const g3 = (v) => (v || 0).toLocaleString("en-IN", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
	let FILE = null;  // {b64, name}
	let RAW = [];     // per-piece rows {party, nt, gs, purity, days, dmd, ps, cs, design, barcode, dtype}
	let MAP = {};     // party -> group (Party Group Map)
	let VIEW = "party"; // "party" | "dtype"
	let GDAYS = 0;      // report-wide: only pieces held >= N days count
	let OPEN = new Set(); // expanded level-1 names (per view)
	let STMT = null;      // party whose statement view is open
	const SOFF = new Set(); // statement: design types ticked out
	let SDAYS = 0;        // statement: days filter value
	let SDMODE = "gte";   // "gte" (held >= N) or "eq" (held exactly N) — one at a time
	const SX = new Set(); // statement: individual pieces unticked (by index)

	$(page.main).append(`
		<style>
		#page-party-gold .container{max-width:100%;}
		.pg-bar{display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin-bottom:10px;}
		.pg-file{border:2px dashed var(--border-color);border-radius:9px;padding:9px 16px;cursor:pointer;font-size:12.5px;color:var(--text-muted);}
		.pg-file.has{border-color:#2e7d32;color:#1d7a33;font-weight:700;}
		.pg-btn{border:none;color:#fff;font-weight:800;padding:9px 20px;border-radius:8px;cursor:pointer;}
		.pg-dl{background:#2e7d32;display:none;}
		.pg-print{background:#5b3a8e;display:none;}
		.pg-view{background:#1f618d;display:none;}
		.pg-tiles{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px;}
		.pg-gtiles{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;}
		.pg-tile{border:1px solid var(--border-color);border-radius:9px;padding:7px 16px;background:var(--control-bg);}
		.pg-tile .k{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;}
		.pg-tile .v{font-size:16px;font-weight:800;}
		.pg-tile.g{padding:5px 12px;}
		.pg-tile.g .v{font-size:13px;}
		.pg-tile.g .s{font-size:10px;color:var(--text-muted);}
		table.pg-t{width:100%;border-collapse:collapse;font-size:12px;background:var(--fg-color);}
		table.pg-t th{background:var(--control-bg);font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);padding:5px 8px;border:1px solid var(--border-color);text-align:right;white-space:nowrap;}
		table.pg-t th:first-child{text-align:left;}
		table.pg-t td{border:1px solid var(--border-color);padding:4px 8px;font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right;}
		table.pg-t td:first-child{text-align:left;}
		tr.pg-grp td{background:var(--control-bg);font-weight:800;cursor:pointer;}
		tr.pg-party td:first-child{padding-left:26px;color:var(--text-muted);}
		tr.pg-party.stmt{cursor:pointer;}
		td.pg-old{color:#a15c00;font-weight:700;}
		.pg-none{padding:34px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:10px;}
		</style>
		<div class="pg-bar">
			<label class="pg-file">${__("📄 Pick the PARTY SELECTION .xlsx")}</label>
			<input type="file" class="pg-input" accept=".xlsx" style="display:none;">
			<button class="pg-btn pg-view"></button>
			<span class="pg-gdays-w" style="display:none;align-items:center;gap:6px;font-size:11.5px;color:var(--text-muted);">
				${__("held ≥")}
				<input type="number" min="0" class="pg-gdays" placeholder="${__("all")}"
					style="width:64px;border:1px solid var(--border-color);border-radius:8px;padding:7px 8px;font-size:12px;background:var(--fg-color);color:var(--text-color);">
				${__("days")}</span>
			<button class="pg-btn pg-print">${__("Print 🖨")}</button>
			<button class="pg-btn pg-dl">${__("Report ⤓")}</button>
		</div>
		<div class="pg-tiles"></div>
		<div class="pg-gtiles"></div>
		<div class="pg-body"><div class="pg-none">${__("Upload the old software's PARTY SELECTION report — parties group by the lookup, gold and aging come out per group.")}</div></div>
	`);
	const root = $(page.main);

	root.find(".pg-file").on("click", () => root.find(".pg-input").get(0).click());
	root.find(".pg-input").on("change", function () {
		const file = this.files[0];
		if (!file) return;
		const rd = new FileReader();
		rd.onload = () => {
			FILE = { b64: rd.result, name: file.name };
			root.find(".pg-file").addClass("has").text("📄 " + file.name);
			Promise.all([
				frappe.call({ method: API + ".parse_party_selection_excel", args: { filedata: FILE.b64 } }),
				frappe.call({ method: API + ".get_party_group_map" }),
			]).then(([r1, r2]) => {
				RAW = (r1.message || {}).rows || [];
				MAP = r2.message || {};
				OPEN.clear();
				STMT = null;
				root.find(".pg-dl, .pg-print, .pg-view").show();
				root.find(".pg-gdays-w").css("display", "inline-flex");
				// a spelling this scan brings in for the first time is saved
				// straight into OTHER — sort it out on Party Groups later
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
	// unmapped spellings pool under OTHER until someone assigns them
	const groupOf = (r) => MAP[partyOf(r)] || "OTHER";

	function blankAgg() {
		return { pcs: 0, gw: 0, nt: 0, dmd: 0, ps: 0, cs: 0, b: [0, 0, 0, 0], oldest: 0 };
	}

	function addTo(x, r) {
		x.pcs += 1;
		x.gw += r.gs || 0;
		x.nt += r.nt || 0;
		x.dmd += r.dmd || 0;
		x.ps += r.ps || 0;
		x.cs += r.cs || 0;
		x.b[bucketOf(r.days || 0)] += r.nt || 0;
		x.oldest = Math.max(x.oldest, r.days || 0);
	}

	// the whole report narrows to pieces held >= GDAYS (blank = all)
	const gRows = () => (GDAYS ? RAW.filter((r) => (r.days || 0) >= GDAYS) : RAW);

	// two-level rollup: key1 -> {items: {key2 -> agg}, ...agg}
	function aggBy(k1, k2) {
		const out = {};
		gRows().forEach((r) => {
			const a = k1(r), b = k2(r);
			const L1 = (out[a] = out[a] || Object.assign({ items: {} }, blankAgg()));
			const L2 = (L1.items[b] = L1.items[b] || blankAgg());
			addTo(L1, r);
			addTo(L2, r);
		});
		return out;
	}

	const rollup = () => (VIEW === "party" ? aggBy(groupOf, partyOf) : aggBy((r) => r.dtype, groupOf));

	function sortedKeys(obj) {
		return Object.keys(obj).sort((a, b) => obj[b].nt - obj[a].nt);
	}

	function cellsHtml(x) {
		return `<td>${x.pcs}</td><td>${g3(x.gw)}</td><td><b>${g3(x.nt)}</b></td><td>${g3(x.dmd)}</td>
			<td>${g3(x.b[0])}</td><td>${g3(x.b[1])}</td><td>${g3(x.b[2])}</td><td>${g3(x.b[3])}</td>
			<td class="${x.oldest > 180 ? "pg-old" : ""}">${x.oldest}</td>`;
	}

	function paint() {
		if (!RAW.length) return;
		root.find(".pg-view, .pg-dl").toggle(!STMT);
		root.find(".pg-gdays-w").css("display", STMT ? "none" : "inline-flex");
		if (STMT) return paintStatement();
		const R = rollup();
		const l1 = sortedKeys(R);
		const tot = blankAgg();
		gRows().forEach((r) => addTo(tot, r));
		const groups = aggBy(groupOf, partyOf);
		const gnames = sortedKeys(groups);
		root.find(".pg-view").text(VIEW === "party" ? __("View: Design Types ⇄") : __("View: Parties ⇄"));
		root.find(".pg-tiles").html(`
			<div class="pg-tile"><div class="k">${__("Pieces")}</div><div class="v">${tot.pcs}</div></div>
			<div class="pg-tile"><div class="k">${__("Net gold")}</div><div class="v">${g3(tot.nt)} g</div></div>
			<div class="pg-tile"><div class="k">${__("DMD")}</div><div class="v">${g3(tot.dmd)} ct</div></div>
			<div class="pg-tile"><div class="k">${__("Oldest")}</div><div class="v">${tot.oldest} ${__("days")}</div></div>`);
		root.find(".pg-gtiles").html(gnames.map((g) => `
			<div class="pg-tile g"><div class="k">${esc(g)}</div><div class="v">${g3(groups[g].nt)} g</div>
				<div class="s">${groups[g].pcs} ${__("pc")} · GW ${g3(groups[g].gw)} g</div></div>`).join(""));
		const l2label = VIEW === "party" ? __("Group / Party") : __("Design type / Group");
		root.find(".pg-body").html(`
			<table class="pg-t"><thead><tr>
				<th>${l2label}</th><th>${__("Pcs")}</th><th>${__("GW g")}</th><th>${__("NT g")}</th><th>${__("DMD ct")}</th>
				<th title="${__("NT grams per holding-age band")}">0–30 d</th><th>31–90 d</th><th>91–180 d</th><th>180+ d</th><th>${__("Oldest")}</th>
			</tr></thead><tbody>
			${l1.map((name) => {
				const G = R[name];
				const kids = sortedKeys(G.items);
				const solo = VIEW === "party" && kids.length === 1 && kids[0] === name;
				return `<tr class="pg-grp" data-g="${esc(name)}">
					<td>${OPEN.has(name) || solo ? "" : "▸ "}${esc(name)}${solo ? "" : ` <span style="font-weight:400;color:var(--text-muted);">(${kids.length})</span>`}</td>
					${cellsHtml(G)}
				</tr>` + (OPEN.has(name) && !solo ? kids.map((k) => `<tr class="pg-party ${VIEW === "party" ? "stmt" : ""}" data-p="${esc(k)}"
					${VIEW === "party" ? `title="${__("click for the party statement print")}"` : ""}>
					<td>${esc(k)}</td>${cellsHtml(G.items[k])}
				</tr>`).join("") : "");
			}).join("")}</tbody></table>`);
	}

	root.on("input", ".pg-gdays", function () {
		GDAYS = cint(this.value) || 0;
		if (!STMT) paint();
	});

	root.on("click", ".pg-view", () => {
		STMT = null;
		VIEW = VIEW === "party" ? "dtype" : "party";
		OPEN.clear();
		paint();
	});

	function openStatement(party) {
		STMT = party;
		SOFF.clear();
		SX.clear();
		SDAYS = 0;
		SDMODE = "gte";
		paint();
	}
	root.on("click", "tr.pg-grp", function () {
		const g = $(this).data("g");
		if (VIEW === "party") {
			const groups = aggBy(groupOf, partyOf);
			const kids = Object.keys((groups[g] || { items: {} }).items);
			if (kids.length === 1 && kids[0] === g) return openStatement(g);
		}
		OPEN.has(g) ? OPEN.delete(g) : OPEN.add(g);
		paint();
	});
	root.on("click", "tr.pg-party.stmt", function () {
		openStatement($(this).data("p"));
	});
	root.on("click", ".pg-back-stmt", () => {
		STMT = null;
		paint();
	});
	root.on("change", ".pg-sdt", function () {
		const t = $(this).data("t");
		this.checked ? SOFF.delete(t) : SOFF.add(t);
		paint();
	});
	root.on("input", ".pg-sdays", function () {
		SDAYS = cint(this.value) || 0;
		renderStmtTable();
	});
	root.on("change", ".pg-sdmode", function () {
		SDMODE = this.value;
		renderStmtTable();
	});
	root.on("change", ".pg-srow", function () {
		const i = cint($(this).data("i"));
		this.checked ? SX.delete(i) : SX.add(i);
		refreshStmtTotals();
	});


	// ------------------------------------------------------------- printing
	function printDoc(title, sub, headHtml, bodyHtml, portrait) {
		const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
			@page{size:A4 ${portrait ? "portrait" : "landscape"};margin:10mm;}
			body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;}
			h1{font-size:17px;margin:0 0 2px;}
			.sub{font-size:11px;color:#555;margin-bottom:10px;}
			table{width:100%;border-collapse:collapse;font-size:${portrait ? "9.5px" : "10.5px"};}
			th,td{border:1px solid #999;padding:${portrait ? "2px 4px" : "3px 6px"};text-align:right;white-space:nowrap;}
			th:first-child,td:first-child{text-align:left;}
			td.l{text-align:left;}
			th{background:#eee;text-transform:uppercase;font-size:9px;letter-spacing:.04em;}
			tr.grp td{background:#f2f2f2;font-weight:bold;}
			tr.pty td:first-child{padding-left:22px;color:#444;}
			tr.tot td{font-weight:bold;border-top:2px solid #333;}
			td.old{color:#a15c00;font-weight:bold;}
			tr{page-break-inside:avoid;}
		</style></head><body>
			<h1>${title}</h1><div class="sub">${sub}</div>
			<table><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>
		</body></html>`;
		document.getElementById("pg-print-frame")?.remove();
		const fr = document.createElement("iframe");
		fr.id = "pg-print-frame";
		fr.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
		document.body.appendChild(fr);
		fr.srcdoc = html;
		fr.onload = () => setTimeout(() => { fr.contentWindow.focus(); fr.contentWindow.print(); }, 150);
	}

	const pcells = (x) => `<td>${x.pcs}</td><td>${g3(x.gw)}</td><td><b>${g3(x.nt)}</b></td>
		<td>${g3(x.dmd)}</td><td>${g3(x.ps)}</td><td>${g3(x.cs)}</td>
		<td>${g3(x.b[0])}</td><td>${g3(x.b[1])}</td><td>${g3(x.b[2])}</td><td>${g3(x.b[3])}</td>
		<td class="${x.oldest > 180 ? "old" : ""}">${x.oldest}</td>`;
	const PHEAD = `<th>${__("Pcs")}</th><th>${__("GW g")}</th><th>${__("NT g")}</th>
		<th>${__("DMD ct")}</th><th>${__("PS ct")}</th><th>${__("CS ct")}</th>
		<th>NT 0–30 d</th><th>NT 31–90 d</th><th>NT 91–180 d</th><th>NT 180+ d</th><th>${__("Oldest")}</th>`;

	// General print (parties) / DesignType print — every level opened;
	// in the statement view the same button prints the filtered statement
	root.on("click", ".pg-print", () => {
		if (!RAW.length) return;
		if (STMT) return printStatement();
		const R = rollup();
		const l1 = sortedKeys(R);
		const tot = blankAgg();
		gRows().forEach((r) => addTo(tot, r));
		const body = l1.map((name) => {
			const G = R[name];
			const kids = sortedKeys(G.items);
			const solo = VIEW === "party" && kids.length === 1 && kids[0] === name;
			return `<tr class="grp"><td>${esc(name)}</td>${pcells(G)}</tr>`
				+ (solo ? "" : kids.map((k) => `<tr class="pty"><td>${esc(k)}</td>${pcells(G.items[k])}</tr>`).join(""));
		}).join("") + `<tr class="tot"><td>${__("TOTAL")}</td>${pcells(tot)}</tr>`;
		printDoc(
			VIEW === "party" ? __("PARTY GOLD — GENERAL PRINT") : __("PARTY GOLD — DESIGNTYPE PRINT"),
			`${esc((FILE && FILE.name) || "")} · ${__("generated")} ${frappe.datetime.now_datetime()}
				· ${tot.pcs} ${__("pieces")} · NT ${g3(tot.nt)} g · DMD ${g3(tot.dmd)} ct`
				+ (GDAYS ? ` · <b>${__("held ≥ {0} d", [GDAYS])}</b>` : ""),
			`<th>${VIEW === "party" ? __("Group / Party") : __("Design type / Group")}</th>${PHEAD}`,
			body);
	});

	// ---- party statement: an on-screen view first, print follows it ---------
	// all of the party's pieces, oldest first, indexed for the tick-outs
	function stmtAll() {
		return RAW.filter((r) => partyOf(r) === STMT).sort((a, b) => (b.days || 0) - (a.days || 0));
	}

	// after dtype ticks + the days filter in its picked mode; index kept for SX
	function stmtFiltered() {
		return stmtAll().map((r, i) => ({ r, i })).filter((x) => {
			if (SOFF.has(x.r.dtype)) return false;
			if (!SDAYS) return true;
			const d = x.r.days || 0;
			return SDMODE === "eq" ? d === SDAYS : d >= SDAYS;
		});
	}

	function stmtIncluded() {
		return stmtFiltered().filter((x) => !SX.has(x.i));
	}

	function refreshStmtTotals() {
		const tot = blankAgg();
		stmtIncluded().forEach((x) => addTo(tot, x.r));
		root.find(".pg-stot").html(`${__("in print")}: <b>${tot.pcs}</b> ${__("pc")} · GW <b>${g3(tot.gw)}</b> g
			· NT <b>${g3(tot.nt)}</b> g · DMD <b>${g3(tot.dmd)}</b> ct · ${__("oldest")} <b>${tot.oldest}</b> d`);
		// the KPI tiles follow the statement while it is open (Back restores)
		root.find(".pg-tiles").html(`
			<div class="pg-tile"><div class="k">${__("Pieces")}</div><div class="v">${tot.pcs}</div></div>
			<div class="pg-tile"><div class="k">${__("Gross")}</div><div class="v">${g3(tot.gw)} g</div></div>
			<div class="pg-tile"><div class="k">${__("Net gold")}</div><div class="v">${g3(tot.nt)} g</div></div>
			<div class="pg-tile"><div class="k">${__("DMD")}</div><div class="v">${g3(tot.dmd)} ct</div></div>
			<div class="pg-tile"><div class="k">${__("Oldest")}</div><div class="v">${tot.oldest} ${__("days")}</div></div>`);
		root.find(".pg-gtiles").empty();
	}

	function paintStatement() {
		const all = stmtAll();
		const dts = {};
		all.forEach((r) => { dts[r.dtype] = (dts[r.dtype] || 0) + 1; });
		const chips = Object.keys(dts).sort((a, b) => dts[b] - dts[a]).map((t) => `
			<label style="display:inline-flex;align-items:center;gap:5px;border:1px solid var(--border-color);border-radius:14px;
				padding:2px 10px;margin:2px 6px 2px 0;font-size:11.5px;cursor:pointer;background:${SOFF.has(t) ? "var(--control-bg)" : "var(--fg-color)"};
				${SOFF.has(t) ? "opacity:.55;" : ""}">
				<input type="checkbox" class="pg-sdt" data-t="${esc(t)}" ${SOFF.has(t) ? "" : "checked"}
					style="width:13px;height:13px;accent-color:#1f618d;">${esc(t)} <span style="color:var(--text-muted);">(${dts[t]})</span></label>`).join("");
		const list = stmtFiltered();
		root.find(".pg-body").html(`
			<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:8px;">
				<button class="pg-btn pg-back-stmt" style="background:#6b7280;padding:6px 16px;">${__("← Back")}</button>
				<span style="font-weight:800;font-size:14px;">${esc(STMT)}</span>
				<span style="color:var(--text-muted);font-size:11.5px;">${__("group")} ${esc(MAP[STMT] || "OTHER")}</span>
				<span style="font-size:11.5px;color:var(--text-muted);">${__("held")}</span>
				<select class="pg-sdmode" style="border:1px solid var(--border-color);border-radius:6px;padding:3px 4px;font-size:12px;font-weight:700;background:var(--fg-color);color:var(--text-color);">
					<option value="gte" ${SDMODE === "gte" ? "selected" : ""}>≥</option>
					<option value="eq" ${SDMODE === "eq" ? "selected" : ""}>=</option>
				</select>
				<input type="number" min="0" class="pg-sdays" value="${SDAYS || ""}" placeholder="${__("all")}"
					style="width:64px;border:1px solid var(--border-color);border-radius:6px;padding:3px 8px;font-size:12px;background:var(--fg-color);color:var(--text-color);">
				<span style="font-size:11.5px;color:var(--text-muted);">${__("days")}</span>
				<span class="pg-stot" style="margin-left:auto;font-size:11.5px;color:var(--text-muted);"></span>
			</div>
			<div style="margin-bottom:8px;">${chips}</div>
			<div class="pg-sbody"></div>`);
		renderStmtTable();
	}

	function renderStmtTable() {
		const list = stmtFiltered();
		root.find(".pg-sbody").html(list.length ? `<table class="pg-t"><thead><tr>
				<th style="text-align:left;" title="${__("untick a line to leave it out of the print")}">✓</th>
				<th>#</th><th style="text-align:left;">${__("Barcode")}</th><th style="text-align:left;">${__("Design")}</th><th style="text-align:left;">${__("Type")}</th>
				<th>${__("GW g")}</th><th>${__("NT g")}</th><th>${__("DMD ct")}</th><th>${__("PS ct")}</th><th>${__("CS ct")}</th><th>${__("Days")}</th>
			</tr></thead><tbody>
			${list.map((x, n) => `<tr>
				<td style="text-align:left;"><input type="checkbox" class="pg-srow" data-i="${x.i}" ${SX.has(x.i) ? "" : "checked"}
					style="width:13px;height:13px;accent-color:#1f618d;"></td>
				<td>${n + 1}</td><td style="text-align:left;">${esc(x.r.barcode)}</td><td style="text-align:left;">${esc(x.r.design)}</td><td style="text-align:left;">${esc(x.r.dtype)}</td>
				<td>${g3(x.r.gs)}</td><td>${g3(x.r.nt)}</td><td>${g3(x.r.dmd)}</td><td>${g3(x.r.ps)}</td><td>${g3(x.r.cs)}</td>
				<td class="${(x.r.days || 0) > 180 ? "pg-old" : ""}">${x.r.days || 0}</td>
			</tr>`).join("")}</tbody></table>`
			: `<div class="pg-none">${__("Nothing matches the filters.")}</div>`);
		refreshStmtTotals();
	}

	function printStatement() {
		const pieces = stmtIncluded().map((x) => x.r);
		if (!pieces.length) return frappe.show_alert({ message: __("Everything is unticked — nothing to print."), indicator: "orange" }, 4);
		const party = STMT;
		const tot = blankAgg();
		pieces.forEach((r) => addTo(tot, r));
		const body = pieces.map((r, i) => `<tr>
			<td>${i + 1}</td><td class="l">${esc(r.barcode)}</td><td class="l">${esc(r.design)}</td><td class="l">${esc(r.dtype)}</td>
			<td>${g3(r.gs)}</td><td>${g3(r.nt)}</td><td>${g3(r.dmd)}</td><td>${g3(r.ps)}</td><td>${g3(r.cs)}</td>
			<td class="${(r.days || 0) > 180 ? "old" : ""}">${r.days || 0}</td>
		</tr>`).join("") + `<tr class="tot"><td></td><td class="l">${__("TOTAL")}</td><td></td><td>${tot.pcs} ${__("pcs")}</td>
			<td>${g3(tot.gw)}</td><td>${g3(tot.nt)}</td><td>${g3(tot.dmd)}</td><td>${g3(tot.ps)}</td><td>${g3(tot.cs)}</td><td></td></tr>`;
		printDoc(
			__("PARTY STATEMENT — {0}", [esc(party)]),
			`${__("group")} <b>${esc(MAP[party] || "OTHER")}</b> · ${esc((FILE && FILE.name) || "")}
				· ${__("generated")} ${frappe.datetime.now_datetime()}
				· ${tot.pcs} ${__("pieces")} · NT ${g3(tot.nt)} g · DMD ${g3(tot.dmd)} ct · ${__("oldest")} ${tot.oldest} ${__("days")}`
				+ (SOFF.size ? ` · ${__("{0} type(s) ticked out", [SOFF.size])}` : "")
				+ (SDAYS ? ` · ${__("held {0} {1} d", [SDMODE === "eq" ? "=" : "≥", SDAYS])}` : "")
				+ (SX.size ? ` · ${__("{0} line(s) unticked", [SX.size])}` : ""),
			`<th>#</th><th>${__("Barcode")}</th><th>${__("Design")}</th><th>${__("Type")}</th>
				<th>${__("GW g")}</th><th>${__("NT g")}</th><th>${__("DMD ct")}</th><th>${__("PS ct")}</th><th>${__("CS ct")}</th><th>${__("Days")}</th>`,
			body, true);
	}

	// excel report follows the parties view
	root.on("click", ".pg-dl", () => {
		if (!RAW.length) return;
		const groups = aggBy(groupOf, partyOf);
		const rows = [];
		sortedKeys(groups).forEach((gname) => {
			const G = groups[gname];
			sortedKeys(G.items).forEach((p) => {
				const P = G.items[p];
				rows.push({ group: gname, party: p, pcs: P.pcs, gw: P.gw, nt: P.nt, dmd: P.dmd,
					b0: P.b[0], b1: P.b[1], b2: P.b[2], b3: P.b[3], oldest: P.oldest });
			});
		});
		open_url_post("/api/method/jewelima.jewelima.api.export_party_gold_xlsx", {
			rows: JSON.stringify(rows),
			filename: "PARTY GOLD " + frappe.datetime.get_today(),
		});
	});
};
