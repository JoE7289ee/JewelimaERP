// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Out of House (Delivery) — everything away from the building, both reasons in
// one place.
//
// Hallmarking got its own warehouse and its own report when it left
// certification, which is right: they are different trips to different places.
// But the delivery desk's question is usually neither on its own — it is "what
// is out, and how long has it been out". So this is the pair side by side, with
// every open batch underneath in ONE list ordered by how long it has been gone,
// because the oldest is the one somebody has to chase.
//
// Read-only. Collecting a packet back happens on Certification Out or Hallmark
// Out, and this links through to them.
// Route: /app/out-of-house

frappe.pages["out-of-house"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Out of House"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const f3 = (n) => flt(n).toFixed(3);
	const root = $(page.main);
	const S = { data: null, kind: "" };

	root.append(`
		<style>
		#page-out-of-house .container{max-width:100%;}
		.oh-pools{display:flex;gap:13px;flex-wrap:wrap;margin-bottom:14px;}
		.oh-pool{border:1px solid var(--border-color);border-left:4px solid var(--border-color);
			border-radius:12px;background:var(--fg-color);padding:12px 18px;min-width:230px;cursor:pointer;
			transition:border-color .12s;}
		.oh-pool:hover{border-color:#1f618d;}
		.oh-pool.on{box-shadow:inset 0 0 0 1px currentColor;}
		.oh-pool.certification{border-left-color:#1f618d;} .oh-pool.certification.on{color:#1f618d;}
		.oh-pool.hallmarking{border-left-color:#b35a00;} .oh-pool.hallmarking.on{color:#b35a00;}
		.oh-pool .k{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);}
		.oh-pool .v{font-size:26px;font-weight:800;line-height:1.15;color:var(--text-color);}
		.oh-pool .s{font-size:11.5px;color:var(--text-muted);}
		.oh-tiles{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px;}
		.oh-tile{border:1px solid var(--border-color);border-radius:12px;padding:10px 20px;
			background:var(--fg-color);min-width:112px;}
		.oh-tile .k{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;}
		.oh-tile .v{font-size:22px;font-weight:800;}
		.oh-tile.pure .v{color:#1f618d;}
		.oh-tile.old .v{color:#b02a2a;}
		.oh-tile.stone{border-left:3px solid #7a4fb5;}
		.oh-tile.stone .v{color:#7a4fb5;}
		[data-theme="dark"] .oh-tile.stone .v{color:#bfa3e8;}
		.oh-sec{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;
			color:var(--text-muted);margin:2px 0 8px;}
		.oh-box{border:1px solid var(--border-color);border-radius:12px;overflow:auto;background:var(--fg-color);}
		table.oh-t{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.oh-t th{position:sticky;top:0;background:var(--control-bg);font-size:10px;text-transform:uppercase;
			color:var(--text-muted);padding:7px 10px;text-align:left;border-bottom:2px solid var(--border-color);}
		table.oh-t td{padding:7px 10px;border-bottom:1px solid var(--border-color);}
		table.oh-t td.num{text-align:right;font-variant-numeric:tabular-nums;}
		table.oh-t tr:hover td{background:var(--control-bg);}
		.oh-kind{display:inline-block;border-radius:9px;padding:1px 9px;font-size:10px;font-weight:800;color:#fff;}
		.oh-kind.certification{background:#1f618d;} .oh-kind.hallmarking{background:#b35a00;}
		.oh-days{font-weight:800;} .oh-days.old{color:#b02a2a;}
		.oh-go{color:#1f618d;cursor:pointer;font-weight:700;}
		.oh-none{padding:36px;text-align:center;color:var(--text-muted);}
		.oh-clear{border:none;background:none;color:#1f618d;cursor:pointer;font-size:12px;
			text-decoration:underline;margin-left:6px;}
		</style>
		<div class="oh-pools"></div>
		<div class="oh-tiles"></div>
		<div class="oh-stonesec"></div>
		<div class="oh-stones oh-tiles"></div>
		<div class="oh-box"><table class="oh-t"><thead><tr>
			<th>${__("Batch")}</th><th>${__("For")}</th><th>${__("Where")}</th>
			<th>${__("Sent")}</th><th class="num">${__("Days out")}</th>
			<th class="num">${__("Pieces")}</th><th class="num">${__("Gross g")}</th><th></th>
		</tr></thead><tbody class="oh-body"></tbody></table></div>
	`);

	function paint() {
		const d = S.data || { pools: [], batches: [], totals: {} };
		const t = d.totals || {};
		root.find(".oh-pools").html((d.pools || []).map((p) => `
			<div class="oh-pool ${p.kind} ${S.kind === p.kind ? "on" : ""}" data-k="${esc(p.kind)}">
				<div class="k">${esc(p.label)}</div>
				<div class="v">${p.pieces}</div>
				<div class="s">${p.batches} ${__("batch(es)")} · ${f3(p.gross)} g · ${f3(p.pure)} g ${__("pure")}</div>
			</div>`).join(""));

		const rows = (d.batches || []).filter((b) => !S.kind || b.kind === S.kind);
		root.find(".oh-tiles").html(`
			<div class="oh-tile"><div class="k">${__("Pieces out")}</div><div class="v">${t.pieces || 0}</div></div>
			<div class="oh-tile"><div class="k">${__("Batches")}</div><div class="v">${t.batches || 0}</div></div>
			<div class="oh-tile"><div class="k">${__("Gross")}</div><div class="v">${f3(t.gross)}<span style="font-size:12px;"> g</span></div></div>
			<div class="oh-tile pure"><div class="k">${__("Pure gold")}</div><div class="v">${f3(t.pure)}<span style="font-size:12px;"> g</span></div></div>
			<div class="oh-tile ${t.oldest > 14 ? "old" : ""}"><div class="k">${__("Longest out")}</div>
				<div class="v">${t.oldest || 0}<span style="font-size:12px;"> ${__("day(s)")}</span></div></div>
			${S.kind ? `<button class="oh-clear">${__("show both")}</button>` : ""}`);

		// stones out of the building, per bucket. Filtered to a pool when one is
		// picked, so the tiles always describe the same set as the list below.
		const stones = S.kind
			? ((d.pools || []).find((p) => p.kind === S.kind) || {}).by_stone || []
			: (d.by_stone || []);
		root.find(".oh-stonesec").html(stones.length
			? `<div class="oh-sec">${S.kind
				? __("Stones out — {0}", [((d.pools || []).find((p) => p.kind === S.kind) || {}).label || ""])
				: __("Stones out of the building")}</div>` : "");
		root.find(".oh-stones").html(stones.map((x) => `
			<div class="oh-tile stone"><div class="k">${esc(x.stone_type)}</div>
				<div class="v">${f3(x.ct)}<span style="font-size:12px;"> ct</span></div></div>`).join(""));

		root.find(".oh-body").html(rows.map((b) => `
			<tr>
				<td><b>${esc(b.name)}</b></td>
				<td><span class="oh-kind ${b.kind}">${esc(b.what)}</span>
					${b.note ? ` <span style="color:var(--text-muted);">${esc(b.note)}</span>` : ""}</td>
				<td>${esc(b.where || "—")}</td>
				<td>${esc(b.sent_on || "")}</td>
				<td class="num"><span class="oh-days ${b.days_out > 14 ? "old" : ""}">${b.days_out}</span></td>
				<td class="num">${b.pieces}</td>
				<td class="num">${f3(b.gross)}</td>
				<td><span class="oh-go" data-k="${esc(b.kind)}">${__("collect →")}</span></td>
			</tr>`).join("") || `<tr><td colspan="8" class="oh-none">${
				__("Nothing is out of the building.")}</td></tr>`);
	}

	function load() {
		jewelima.busyCall(root.find(".oh-box"), __("Looking…"),
			{ method: API + ".get_out_summary", freeze: false }).then((r) => {
			S.data = r.message || {};
			paint();
		});
	}

	root.on("click", ".oh-pool", function () {
		const k = $(this).data("k") || "";
		S.kind = (S.kind === k) ? "" : k;
		paint();
	});
	root.on("click", ".oh-clear", function () { S.kind = ""; paint(); });
	// collecting belongs to the desk that sent it out
	root.on("click", ".oh-go", function () {
		frappe.set_route($(this).data("k") === "hallmarking" ? "hallmark-out" : "certification-out");
	});

	page.set_primary_action(__("Refresh"), load, "refresh");
	frappe.pages["out-of-house"].on_page_show = load;
	load();
};
