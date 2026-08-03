// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Party Gold — upload the old software's PARTY SELECTION report and see how
// much gold is outstanding PARTY-WISE with aging (0-30 / 31-90 / 91-180 /
// 180+ days on the file's own holding period). Raw party spellings group
// through the Party Group Map lookup (assign unmapped ones right here —
// the mapping persists, the report data doesn't).
// Route: /app/party-gold

frappe.pages["party-gold"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Party Gold", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const g3 = (v) => (v || 0).toLocaleString("en-IN", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
	let FILE = null;  // {b64, name}
	let RAW = [];     // slim per-piece rows {party, nt, gs, purity, days}
	let MAP = {};     // party -> group (Party Group Map)
	let OPEN = new Set(); // expanded group names
	const PICK = new Set(); // unmapped party chips picked for assignment

	$(page.main).append(`
		<style>
		#page-party-gold .container{max-width:100%;}
		.pg-bar{display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin-bottom:10px;}
		.pg-file{border:2px dashed var(--border-color);border-radius:9px;padding:9px 16px;cursor:pointer;font-size:12.5px;color:var(--text-muted);}
		.pg-file.has{border-color:#2e7d32;color:#1d7a33;font-weight:700;}
		.pg-btn{border:none;color:#fff;font-weight:800;padding:9px 20px;border-radius:8px;cursor:pointer;}
		.pg-dl{background:#2e7d32;display:none;}
		.pg-tiles{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:10px;}
		.pg-tile{border:1px solid var(--border-color);border-radius:9px;padding:7px 16px;background:var(--control-bg);}
		.pg-tile .k{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;}
		.pg-tile .v{font-size:16px;font-weight:800;}
		.pg-map{display:none;background:var(--control-bg);border:1px solid var(--border-color);border-radius:10px;padding:8px 14px;margin-bottom:10px;}
		.pg-map .lbl{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);font-weight:700;margin-right:8px;}
		.pg-chip{display:inline-block;border:1px solid var(--border-color);border-radius:14px;padding:2px 10px;margin:2px 4px 2px 0;
			font-size:11.5px;cursor:pointer;background:var(--fg-color);}
		.pg-chip.on{background:#1f618d;border-color:#1f618d;color:#fff;font-weight:700;}
		.pg-map input{border:1px solid var(--border-color);border-radius:6px;padding:3px 8px;font-size:12px;
			text-transform:uppercase;width:130px;background:var(--fg-color);color:var(--text-color);}
		.pg-map .bapply{border:none;border-radius:6px;padding:4px 12px;font-size:11.5px;font-weight:700;color:#fff;background:#1f618d;cursor:pointer;}
		table.pg-t{width:100%;border-collapse:collapse;font-size:12px;background:var(--fg-color);}
		table.pg-t th{background:var(--control-bg);font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);padding:5px 8px;border:1px solid var(--border-color);text-align:right;white-space:nowrap;}
		table.pg-t th:first-child{text-align:left;}
		table.pg-t td{border:1px solid var(--border-color);padding:4px 8px;font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right;}
		table.pg-t td:first-child{text-align:left;}
		tr.pg-grp td{background:var(--control-bg);font-weight:800;cursor:pointer;}
		tr.pg-party td:first-child{padding-left:26px;color:var(--text-muted);}
		td.pg-old{color:#a15c00;font-weight:700;}
		.pg-none{padding:34px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:10px;}
		</style>
		<div class="pg-bar">
			<label class="pg-file">${__("📄 Pick the PARTY SELECTION .xlsx")}</label>
			<input type="file" class="pg-input" accept=".xlsx" style="display:none;">
			<button class="pg-btn pg-dl">${__("Report ⤓")}</button>
		</div>
		<div class="pg-tiles"></div>
		<div class="pg-map"></div>
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
				PICK.clear();
				root.find(".pg-dl").show();
				paint();
			});
		};
		rd.readAsDataURL(file);
	});

	const bucketOf = (d) => (d <= 30 ? 0 : d <= 90 ? 1 : d <= 180 ? 2 : 3);

	// group -> {parties: {party -> agg}, agg} where agg = pcs/gw/nt/pure/b0..b3/oldest
	function aggregate() {
		const groups = {};
		RAW.forEach((r) => {
			const party = r.party || __("(NO PARTY)");
			// unmapped spellings pool under OTHER until someone assigns them
			const gname = MAP[party] || "OTHER";
			const pure = (r.nt || 0) * (r.purity || 0);
			const b = bucketOf(r.days || 0);
			const G = (groups[gname] = groups[gname] || { parties: {}, pcs: 0, gw: 0, nt: 0, pure: 0, b: [0, 0, 0, 0], oldest: 0 });
			const P = (G.parties[party] = G.parties[party] || { pcs: 0, gw: 0, nt: 0, pure: 0, b: [0, 0, 0, 0], oldest: 0 });
			[G, P].forEach((x) => {
				x.pcs += 1;
				x.gw += r.gs || 0;
				x.nt += r.nt || 0;
				x.pure += pure;
				x.b[b] += pure;
				x.oldest = Math.max(x.oldest, r.days || 0);
			});
		});
		return groups;
	}

	function paint() {
		if (!RAW.length) return;
		const groups = aggregate();
		const gnames = Object.keys(groups).sort((a, b) => groups[b].pure - groups[a].pure);
		const tot = { pcs: 0, gw: 0, nt: 0, pure: 0, oldest: 0 };
		gnames.forEach((g) => {
			tot.pcs += groups[g].pcs; tot.gw += groups[g].gw; tot.nt += groups[g].nt;
			tot.pure += groups[g].pure; tot.oldest = Math.max(tot.oldest, groups[g].oldest);
		});
		const unmapped = [...new Set(RAW.map((r) => r.party).filter((p) => p && !MAP[p]))].sort();
		root.find(".pg-tiles").html(`
			<div class="pg-tile"><div class="k">${__("Pieces")}</div><div class="v">${tot.pcs}</div></div>
			<div class="pg-tile"><div class="k">${__("Gross")}</div><div class="v">${g3(tot.gw)} g</div></div>
			<div class="pg-tile"><div class="k">${__("Net gold")}</div><div class="v">${g3(tot.nt)} g</div></div>
			<div class="pg-tile"><div class="k">${__("Pure gold")}</div><div class="v">${g3(tot.pure)} g</div></div>
			<div class="pg-tile"><div class="k">${__("Groups")}</div><div class="v">${gnames.length}</div></div>
			<div class="pg-tile"><div class="k">${__("Oldest")}</div><div class="v">${tot.oldest} ${__("days")}</div></div>`);
		root.find(".pg-map").toggle(!!unmapped.length).html(unmapped.length ? `
			<span class="lbl">${__("Unmapped parties — tap to pick, name the group, Assign")}</span><br>
			${unmapped.map((p) => `<span class="pg-chip ${PICK.has(p) ? "on" : ""}" data-p="${esc(p)}">${esc(p)}</span>`).join("")}
			<div style="margin-top:6px;">
				<input class="pg-gname" placeholder="${__("GROUP NAME")}">
				<button class="bapply pg-assign">${__("Assign")}</button>
			</div>` : "");
		root.find(".pg-body").html(`
			<table class="pg-t"><thead><tr>
				<th>${__("Group / Party")}</th><th>${__("Pcs")}</th><th>${__("GW g")}</th><th>${__("NT g")}</th><th>${__("Pure g")}</th>
				<th>0–30 d</th><th>31–90 d</th><th>91–180 d</th><th>180+ d</th><th>${__("Oldest")}</th>
			</tr></thead><tbody>
			${gnames.map((gname) => {
				const G = groups[gname];
				const pnames = Object.keys(G.parties).sort((a, b) => G.parties[b].pure - G.parties[a].pure);
				const solo = pnames.length === 1 && pnames[0] === gname;
				return `<tr class="pg-grp" data-g="${esc(gname)}">
					<td>${OPEN.has(gname) || solo ? "" : "▸ "}${esc(gname)}${solo ? "" : ` <span style="font-weight:400;color:var(--text-muted);">(${pnames.length})</span>`}</td>
					<td>${G.pcs}</td><td>${g3(G.gw)}</td><td>${g3(G.nt)}</td><td><b>${g3(G.pure)}</b></td>
					<td>${g3(G.b[0])}</td><td>${g3(G.b[1])}</td><td>${g3(G.b[2])}</td><td>${g3(G.b[3])}</td>
					<td class="${G.oldest > 180 ? "pg-old" : ""}">${G.oldest}</td>
				</tr>` + (OPEN.has(gname) && !solo ? pnames.map((p) => {
					const P = G.parties[p];
					return `<tr class="pg-party">
					<td>${esc(p)}</td>
					<td>${P.pcs}</td><td>${g3(P.gw)}</td><td>${g3(P.nt)}</td><td>${g3(P.pure)}</td>
					<td>${g3(P.b[0])}</td><td>${g3(P.b[1])}</td><td>${g3(P.b[2])}</td><td>${g3(P.b[3])}</td>
					<td class="${P.oldest > 180 ? "pg-old" : ""}">${P.oldest}</td>
				</tr>`; }).join("") : "");
			}).join("")}</tbody></table>`);
	}

	root.on("click", "tr.pg-grp", function () {
		const g = $(this).data("g");
		OPEN.has(g) ? OPEN.delete(g) : OPEN.add(g);
		paint();
	});
	root.on("click", ".pg-chip", function () {
		const p = $(this).data("p");
		PICK.has(p) ? PICK.delete(p) : PICK.add(p);
		$(this).toggleClass("on", PICK.has(p));
	});
	root.on("click", ".pg-assign", () => {
		const gname = (root.find(".pg-gname").val() || "").trim().toUpperCase();
		if (!gname) return frappe.show_alert({ message: __("Type the group name first."), indicator: "orange" }, 3);
		if (!PICK.size) return frappe.show_alert({ message: __("Tap some parties first."), indicator: "orange" }, 3);
		frappe.call({ method: API + ".set_party_group", args: { parties: JSON.stringify([...PICK]), group: gname } }).then(() => {
			[...PICK].forEach((p) => { MAP[p] = gname; });
			PICK.clear();
			paint();
			frappe.show_alert({ message: __("Grouped under {0} — saved for every future report.", [gname]), indicator: "green" }, 4);
		});
	});

	root.on("click", ".pg-dl", () => {
		if (!RAW.length) return;
		const groups = aggregate();
		const gnames = Object.keys(groups).sort((a, b) => groups[b].pure - groups[a].pure);
		const rows = [];
		gnames.forEach((gname) => {
			const G = groups[gname];
			Object.keys(G.parties).sort((a, b) => G.parties[b].pure - G.parties[a].pure).forEach((p) => {
				const P = G.parties[p];
				rows.push({ group: gname, party: p, pcs: P.pcs, gw: P.gw, nt: P.nt, pure: P.pure,
					b0: P.b[0], b1: P.b[1], b2: P.b[2], b3: P.b[3], oldest: P.oldest });
			});
		});
		open_url_post("/api/method/jewelima.jewelima.api.export_party_gold_xlsx", {
			rows: JSON.stringify(rows),
			filename: "PARTY GOLD " + frappe.datetime.get_today(),
		});
	});
};
