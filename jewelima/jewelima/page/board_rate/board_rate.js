// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Board Rate (Costing) — every free gold-rate feed, side by side, so the team
// can decide which one sits closest to the rate they actually board.
//
// This page SETS NOTHING. A board rate is a decision made each morning, not a
// market fact, and a feed that quietly became the billing number would have the
// firm charging a figure nobody chose. It reads.
//
// The two kinds of number are kept apart on purpose, because they are routinely
// confused: the Indian trade rate has duty and GST inside it, the world spot
// price does not, and they are more than a thousand rupees a gram apart.
// Route: /app/board-rate

frappe.pages["board-rate"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Board Rate"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const root = $(page.main);
	const S = { data: null, karat: "24K" };

	const inr = (v) => (v == null ? "—" : "₹" + flt(v).toLocaleString("en-IN",
		{ minimumFractionDigits: 2, maximumFractionDigits: 2 }));

	root.append(`
		<style>
		#page-board-rate .container{max-width:100%;}
		.br-top{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px;}
		.br-kar{display:flex;gap:0;border:1px solid var(--border-color);border-radius:9px;overflow:hidden;}
		.br-kar button{background:none;border:0;border-right:1px solid var(--border-color);
			padding:7px 15px;font-size:12.5px;cursor:pointer;color:var(--text-color);}
		.br-kar button:last-child{border-right:0;}
		.br-kar button.on{background:#1f618d;color:#fff;font-weight:700;}
		.br-stamp{margin-left:auto;font-size:11.5px;color:var(--text-muted);}
		.br-cards{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:6px;}
		.br-card{flex:1 1 290px;border:1px solid var(--border-color);border-radius:13px;
			padding:14px 16px;background:var(--fg-color);}
		.br-card.err{border-color:#b02a2a;}
		.br-card .nm{font-weight:800;font-size:14px;display:flex;align-items:center;gap:8px;}
		.br-card .big{font-size:30px;font-weight:800;line-height:1.2;margin:6px 0 2px;
			font-variant-numeric:tabular-nums;}
		.br-card .sub{font-size:11.5px;color:var(--text-muted);}
		.br-card .note{font-size:11.5px;color:var(--text-muted);margin-top:9px;line-height:1.5;}
		.br-card .src{font-size:10.5px;color:var(--text-muted);margin-top:7px;
			padding-top:7px;border-top:1px solid var(--border-color);word-break:break-all;}
		.br-card .bad{color:#b02a2a;font-size:12px;margin:6px 0;}
		[data-theme="dark"] .br-card .bad{color:#f0a0a0;}
		.tag{display:inline-block;border-radius:9px;padding:1px 8px;font-size:10px;font-weight:800;
			letter-spacing:.04em;text-transform:uppercase;}
		.tag.ind{background:rgba(31,97,141,.16);color:#1f618d;}
		.tag.wld{background:rgba(122,79,181,.16);color:#7a4fb5;}
		.tag.un{background:rgba(180,83,9,.16);color:#b45309;}
		[data-theme="dark"] .tag.ind{color:#7fb2dd;} [data-theme="dark"] .tag.wld{color:#bfa3e8;}
		[data-theme="dark"] .tag.un{color:#e8a24a;}
		.br-sec{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;
			color:var(--text-muted);margin:22px 0 9px;padding-bottom:5px;
			border-bottom:1px solid var(--border-color);}
		.br-tw{overflow-x:auto;}
		table.br-t{width:100%;border-collapse:collapse;font-size:13px;background:var(--fg-color);
			border:1px solid var(--border-color);border-radius:11px;overflow:hidden;
			font-variant-numeric:tabular-nums;}
		table.br-t th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em;
			color:var(--text-muted);padding:8px 11px;background:var(--control-bg);
			border-bottom:1px solid var(--border-color);white-space:nowrap;}
		table.br-t td{padding:8px 11px;border-bottom:1px solid var(--border-color);}
		table.br-t td.num,table.br-t th.num{text-align:right;}
		.br-gap{font-size:11px;color:var(--text-muted);}
		.br-why{border:1px solid var(--border-color);border-left:3px solid #b45309;
			border-radius:10px;padding:11px 14px;background:var(--fg-color);
			font-size:12.5px;line-height:1.65;color:var(--text-muted);margin-top:14px;}
		.br-why b{color:var(--text-color);}
		</style>
		<div class="br-top">
			<div class="br-kar"></div>
			<span class="br-stamp"></span>
		</div>
		<div class="br-cards"></div>
		<div class="br-body"></div>
	`);

	function paint() {
		const d = S.data;
		if (!d) return;
		root.find(".br-kar").html(d.karats.map((k) =>
			`<button class="${k === S.karat ? "on" : ""}" data-k="${k}">${k}</button>`).join(""));
		root.find(".br-stamp").html(d.cached
			? __("read a moment ago — feeds are held for ten minutes")
			: __("read just now"));

		root.find(".br-cards").html(d.rows.map((r) => {
			const v = (r.by_karat || {})[S.karat];
			return `<div class="br-card ${r.error ? "err" : ""}">
				<div class="nm">${esc(r.name)}
					<span class="tag ${r.kind === "Indian trade rate" ? "ind" : "wld"}">${esc(r.kind)}</span>
					${r.official ? "" : `<span class="tag un">${__("unofficial")}</span>`}</div>
				${r.error
					? `<div class="bad">${__("could not read it")} — ${esc(r.error)}</div>`
					: `<div class="big">${inr(v)}<span style="font-size:13px;font-weight:400;color:var(--text-muted);"> /g ${esc(S.karat)}</span></div>
						<div class="sub">${__("as of")} ${esc((r.as_of || "").replace("T", " ").slice(0, 19)) || "—"}
							· ${r.ms}ms${r.detail ? " · " + esc(r.detail) : ""}</div>`}
				<div class="note">${esc(r.note)}</div>
				<div class="src">${esc(r.source)}<br>${esc(r.url)}</div>
			</div>`;
		}).join(""));

		// every karat at once, so a purity we do not sell today is still visible
		const live = d.rows.filter((r) => !r.error);
		const ind = live.find((r) => r.kind === "Indian trade rate");
		const wld = live.find((r) => r.kind !== "Indian trade rate");
		const rows = d.karats.map((k) => {
			const a = ind && ind.by_karat[k], b = wld && wld.by_karat[k];
			const gap = a && b ? a - b : null;
			return `<tr><td><b>${k}</b></td>
				${live.map((r) => `<td class="num">${inr(r.by_karat[k])}</td>`).join("")}
				<td class="num">${gap == null ? "—" : inr(gap)
					+ `<div class="br-gap">${(100 * gap / b).toFixed(1)}% ${__("over spot")}</div>`}</td></tr>`;
		}).join("");

		root.find(".br-body").html(`
			<div class="br-sec">${__("Every purity")}</div>
			${live.length ? `<div class="br-tw"><table class="br-t"><thead><tr>
				<th>${__("Karat")}</th>${live.map((r) => `<th class="num">${esc(r.name)}</th>`).join("")}
				<th class="num">${__("Indian over world")}</th>
			</tr></thead><tbody>${rows}</tbody></table></div>`
				: `<div class="br-why">${__("No feed could be read just now.")}</div>`}
			${d.ours ? `<div class="br-sec">${__("What we last billed at")}</div>
				<div class="br-tw"><table class="br-t"><tbody><tr>
					<td>${esc(d.ours.doc)} · ${esc(d.ours.on)}</td>
					<td class="num"><b>${inr(d.ours.rate)}</b> /g</td>
				</tr></tbody></table></div>` : ""}
			<div class="br-why">
				<b>${__("These are for the eye, not for billing.")}</b>
				${__("Nothing on this page sets a board rate — that stays a decision made each morning, and a feed that quietly became the billing number would have us charging a figure nobody chose.")}
				<br><br>
				${__("The two kinds of number are not the same and are routinely confused. The Indian trade rate has import duty and GST inside it; the world spot price does not, which is why it sits well below. Pick whichever the team reads as closest to the board, and tell me — I can pin the page to it, or add a keyed feed (GoldAPI.io, MetalpriceAPI, Metals-API, Metals.Dev) once someone buys a key.")}
			</div>`);
	}

	function load(refresh) {
		return frappe.call({ method: API + ".get_board_rate_feeds",
			args: { refresh: refresh ? 1 : 0 }, freeze: !!refresh,
			freeze_message: __("Reading the feeds…") })
			.then((r) => { S.data = r.message; paint(); });
	}

	root.on("click", ".br-kar button", function () { S.karat = $(this).data("k"); paint(); });
	page.set_primary_action(__("Read again"), () => load(true), "refresh");
	load(false);
};
