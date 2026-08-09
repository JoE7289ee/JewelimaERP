// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Issue History (Stones) — how many stones went out, of WHAT, and by WHOM.
// TODAY / THIS WEEK / THIS MONTH are BUTTONS — one period drives the whole
// view: the summary tile, per-bucket sections listing every ITEM issued
// (sieve by sieve, not just totals), the day-by-day bars, and the issuers
// ranked by that period. Week = the Mon–Sat business week (Monday -> today).
// Click an issuer for their own page. Read-only. Route: /app/stone-history

frappe.pages["stone-history"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Issue History", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const c3 = (v) => (v || 0).toLocaleString("en-IN", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
	let DATA = null;
	let PERIOD = "today"; // "today" | "week" | "month"
	let ISSUER = null;

	const BCOL = { DMD: "#1f618d", PS: "#7d3c98", CS: "#b4436c", CZ: "#0e7a63",
		CVD: "#b45309", SW: "#2874a6", PDMD: "#6b7280", POTH: "#8a6d00" };
	const PLABEL = { today: __("TODAY"), week: __("THIS WEEK"), month: __("THIS MONTH") };

	$(page.main).append(`
		<style>
		#page-stone-history .container{max-width:100%;}
		.sh-periods{display:inline-flex;border:1px solid var(--border-color);border-radius:9px;overflow:hidden;margin-bottom:6px;}
		.sh-periods button{border:none;padding:10px 26px;font-size:12.5px;font-weight:800;letter-spacing:.03em;background:var(--control-bg);color:var(--text-color);cursor:pointer;}
		.sh-periods button.on{background:#1f618d;color:#fff;}
		.sh-range{font-size:11.5px;color:var(--text-muted);margin:0 0 12px 2px;}
		.sh-sum{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;}
		.sh-tile{border:1px solid var(--border-color);border-radius:10px;padding:8px 18px;background:var(--control-bg);}
		.sh-tile .k{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;}
		.sh-tile .v{font-size:19px;font-weight:800;}
		.sh-h{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);margin:0 0 8px;}
		.sh-hs{font-weight:400;text-transform:none;letter-spacing:0;}
		.sh-bk{display:inline-block;border-radius:9px;padding:1px 9px;font-size:11px;font-weight:800;color:#fff;}
		.sh-bsec{border:1px solid var(--border-color);border-radius:10px;background:var(--fg-color);padding:10px 14px;min-width:300px;flex:1;max-width:430px;}
		.sh-bsec .bh{display:flex;align-items:baseline;gap:10px;margin-bottom:7px;}
		.sh-bsec .bt{font-size:13px;font-weight:800;margin-left:auto;font-variant-numeric:tabular-nums;}
		.sh-bwrap{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:18px;}
		table.sh-t{width:100%;border-collapse:collapse;font-size:12px;background:var(--fg-color);}
		table.sh-t th{background:var(--control-bg);font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);padding:4px 8px;border:1px solid var(--border-color);text-align:right;white-space:nowrap;}
		table.sh-t th.l{text-align:left;}
		table.sh-t td{border:1px solid var(--border-color);padding:3px 8px;font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right;}
		table.sh-t td.l{text-align:left;}
		tr.sh-iss{cursor:pointer;}
		tr.sh-iss:hover td{background:var(--control-bg);}
		.sh-cols{display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;margin-bottom:18px;}
		.sh-col{flex:1;min-width:360px;}
		.sh-brow{display:flex;align-items:center;gap:10px;margin-bottom:3px;font-size:11.5px;}
		.sh-brow .lbl{width:82px;color:var(--text-muted);text-align:right;flex:none;}
		.sh-brow .tr{flex:1;background:var(--control-bg);border-radius:4px;height:12px;overflow:hidden;}
		.sh-brow .bar{display:block;height:100%;background:#1f618d;border-radius:4px;}
		.sh-brow .val{width:170px;flex:none;font-variant-numeric:tabular-nums;}
		.sh-none{padding:26px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:10px;}
		.sh-back{border:none;color:#fff;font-weight:800;padding:8px 18px;border-radius:8px;cursor:pointer;background:#6b7280;margin-bottom:12px;}
		.sh-cards{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:18px;}
		.sh-card{border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);padding:12px 18px;min-width:240px;}
		.sh-card .p{font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);}
		.sh-card .v{font-size:22px;font-weight:800;margin:2px 0 1px;}
		.sh-card .s{font-size:11.5px;color:var(--text-muted);}
		</style>
		<div class="sh-body"><div class="sh-none">${__("loading…")}</div></div>
	`);
	const root = $(page.main);

	function load() {
		frappe.call({ method: API + ".get_stone_issue_history" }).then((r) => {
			DATA = r.message;
			paint();
		});
	}

	// the selected period's date window (for the bars + the range line)
	function range() {
		const B = DATA.bounds;
		if (PERIOD === "today") return [B.today, B.today];
		if (PERIOD === "week") return [B.monday, B.today];
		return [B.first, B.today];
	}

	function bars(daily) {
		if (!daily.length) return `<div class="sh-none">${__("nothing in this period")}</div>`;
		const max = Math.max(...daily.map((d) => d.ct), 0.001);
		return daily.map((d) => `
			<div class="sh-brow"><span class="lbl">${esc(d.date.slice(5))}</span>
				<span class="tr"><span class="bar" style="width:${(d.ct / max) * 100}%;"></span></span>
				<span class="val">${c3(d.ct)} ct · ${d.pcs} ${__("pc")}</span></div>`).join("");
	}

	function paint() {
		if (ISSUER) return paintIssuer();
		const D = DATA;
		const P = D.periods[PERIOD];
		const [frm, to] = range();
		const daily = D.daily.filter((d) => d.date >= frm && d.date <= to);
		// per-bucket ITEM sections — how much of WHAT went out
		const bsecs = D.order.filter((b) => (P.items[b] || []).length).map((b) => `
			<div class="sh-bsec">
				<div class="bh"><span class="sh-bk" style="background:${BCOL[b]};">${b}</span>
					<span class="bt">${c3(P.buckets[b].ct)} ct · ${P.buckets[b].pcs} ${__("pc")}</span></div>
				<table class="sh-t"><thead><tr>
					<th class="l">${__("Item")}</th><th>${__("Pcs")}</th><th>${__("Ct")}</th>
				</tr></thead><tbody>
				${P.items[b].map((i) => `<tr>
					<td class="l"><b>${esc(i.item)}</b></td><td>${i.pcs}</td><td>${c3(i.ct)}</td>
				</tr>`).join("")}</tbody></table>
			</div>`).join("");
		root.find(".sh-body").html(`
			<div class="sh-periods">
				${["today", "week", "month"].map((k) => `<button data-p="${k}" class="${k === PERIOD ? "on" : ""}">${PLABEL[k]}</button>`).join("")}
			</div>
			<div class="sh-range">${esc(frm)}${frm !== to ? " → " + esc(to) : ""} ${PERIOD === "week" ? "· " + __("business week, Monday onward") : ""}</div>
			<div class="sh-sum">
				<div class="sh-tile"><div class="k">${__("Carats")}</div><div class="v">${c3(P.ct)}</div></div>
				<div class="sh-tile"><div class="k">${__("Pieces")}</div><div class="v">${P.pcs}</div></div>
				<div class="sh-tile"><div class="k">${__("Card touches")}</div><div class="v">${P.cards}</div></div>
				<div class="sh-tile"><div class="k">${__("Buckets active")}</div><div class="v">${D.order.filter((b) => P.buckets[b].ct || P.buckets[b].pcs).length}</div></div>
			</div>
			<div class="sh-h">${__("What got issued")} <span class="sh-hs">· ${__("every item, bucket by bucket")}</span></div>
			${bsecs ? `<div class="sh-bwrap">${bsecs}</div>` : `<div class="sh-none" style="margin-bottom:18px;">${__("Nothing issued in this period.")}</div>`}
			<div class="sh-cols">
				<div class="sh-col">
					<div class="sh-h">${__("Day by day")} <span class="sh-hs">· ${__("carats")}</span></div>
					${bars(daily)}
				</div>
				<div class="sh-col">
					<div class="sh-h">${__("Issuers")} <span class="sh-hs">· ${PLABEL[PERIOD].toLowerCase()} · ${__("click one for their page")}</span></div>
					${(() => {
						const rows = D.issuers.filter((x) => x[PERIOD].ct || x[PERIOD].pcs)
							.sort((a, b2) => b2[PERIOD].ct - a[PERIOD].ct);
						return rows.length ? `<table class="sh-t"><thead><tr>
							<th class="l">${__("Issuer")}</th><th>${__("Ct")}</th><th>${__("Pcs")}</th><th>${__("share")}</th>
						</tr></thead><tbody>
						${rows.map((x) => `<tr class="sh-iss" data-e="${esc(D.issuer_ids[x.who] || "")}">
							<td class="l"><b>${esc(x.who)}</b></td>
							<td>${c3(x[PERIOD].ct)}</td><td>${x[PERIOD].pcs}</td>
							<td>${P.ct ? ((x[PERIOD].ct / P.ct) * 100).toFixed(1) + "%" : ""}</td>
						</tr>`).join("")}</tbody></table>`
						: `<div class="sh-none">${__("nobody issued in this period")}</div>`;
					})()}
				</div>
			</div>`);
	}

	function paintIssuer() {
		frappe.call({ method: API + ".get_stone_issuer_history", args: { employee: ISSUER } }).then((r) => {
			const D = r.message;
			const bchips = D.order.filter((b) => D.buckets[b].ct || D.buckets[b].pcs)
				.map((b) => `<span class="sh-bk" style="background:${BCOL[b]};margin:0 4px 4px 0;">${b} ${c3(D.buckets[b].ct)} ct · ${D.buckets[b].pcs}</span>`)
				.join("");
			root.find(".sh-body").html(`
				<button class="sh-back">${__("← All issuers")}</button>
				<div class="sh-cards">
					<div class="sh-card"><div class="p">${esc(D.who)} — ${__("today")}</div>
						<div class="v">${c3(D.periods.today.ct)} ct</div><div class="s">${D.periods.today.pcs} ${__("pieces")}</div></div>
					<div class="sh-card"><div class="p">${__("this week")}</div>
						<div class="v">${c3(D.periods.week.ct)} ct</div><div class="s">${D.periods.week.pcs} ${__("pieces")}</div></div>
					<div class="sh-card"><div class="p">${__("this month")}</div>
						<div class="v">${c3(D.periods.month.ct)} ct</div><div class="s">${D.periods.month.pcs} ${__("pieces")}</div>
						<div style="margin-top:5px;">${bchips}</div></div>
				</div>
				<div class="sh-cols">
					<div class="sh-col">
						<div class="sh-h">${__("Their month, day by day")}</div>
						${bars(D.daily)}
					</div>
					<div class="sh-col">
						<div class="sh-h">${__("Line by line")} <span class="sh-hs">· ${__("this month, newest first")}</span></div>
						${D.lines.length ? `<table class="sh-t"><thead><tr>
							<th class="l">${__("When")}</th><th class="l">${__("Item")}</th><th class="l">${__("Bucket")}</th>
							<th>${__("Pcs")}</th><th>${__("Ct")}</th><th class="l">${__("Card")}</th>
						</tr></thead><tbody>
						${D.lines.map((l) => `<tr>
							<td class="l">${esc((l.when || "").slice(0, 16))}</td><td class="l"><b>${esc(l.item)}</b></td>
							<td class="l"><span class="sh-bk" style="background:${BCOL[l.bucket] || "#6b7280"};">${esc(l.bucket)}</span></td>
							<td>${l.pcs}</td><td>${c3(l.ct)}</td><td class="l">${esc(l.card || "")}</td>
						</tr>`).join("")}</tbody></table>`
						: `<div class="sh-none">${__("nothing this month")}</div>`}
					</div>
				</div>`);
		});
	}

	root.on("click", ".sh-periods button", function () {
		PERIOD = $(this).data("p");
		paint();
	});
	root.on("click", "tr.sh-iss", function () {
		ISSUER = $(this).data("e");
		if (ISSUER) paint();
	});
	root.on("click", ".sh-back", () => {
		ISSUER = null;
		paint();
	});

	load();
};
