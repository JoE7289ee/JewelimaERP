// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Board Rate (Costing) — the three lines the floor watches, live.
//
// Shiv Sahai's GLD CHN PURE and GLD TSR 995, and Surabi's COSWAN. Everything
// else on this page is context for those three: the other feeds are kept, but
// underneath, because they are what you check the three against, not what you
// board from.
//
// The page SETS NOTHING. A board rate is a decision made each morning, not a
// market fact, and a feed that quietly became the billing number would have the
// firm charging a figure nobody chose.
// Route: /app/board-rate

frappe.pages["board-rate"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Board Rate"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const root = $(page.main);
	// prev holds the last value seen against a key, so a tick reads as a
	// DIRECTION rather than just a new figure — a board is watched for movement
	const S = { data: null, live: true, prev: {}, dir: {}, timer: null, at: "", detail: false };
	const POLL_MS = 5000;

	const inr = (v, dp) => (v == null ? "—" : "₹" + flt(v).toLocaleString("en-IN",
		{ minimumFractionDigits: dp == null ? 2 : dp, maximumFractionDigits: dp == null ? 2 : dp }));
	const num = (v) => (v == null ? "—" : flt(v).toLocaleString("en-IN", { maximumFractionDigits: 3 }));

	function moved(key, v) {
		if (v == null) return "";
		const was = S.prev[key];
		if (was != null && was !== v) S.dir[key] = v > was ? "up" : "down";
		S.prev[key] = v;
		return S.dir[key] || "";
	}
	const arrow = (d) => (d === "up" ? ` <span class="arw">▲</span>`
		: d === "down" ? ` <span class="arw">▼</span>` : "");

	root.append(`
		<style>
		#page-board-rate .container{max-width:100%;}
		.br-top{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px;}
		.br-kar{display:flex;border:1px solid var(--border-color);border-radius:9px;overflow:hidden;}
		.br-kar button{background:none;border:0;border-right:1px solid var(--border-color);
			padding:7px 15px;font-size:12.5px;cursor:pointer;color:var(--text-color);}
		.br-kar button:last-child{border-right:0;}
		.br-kar button.on{background:#1f618d;color:#fff;font-weight:700;}
		.br-btn{border:1px solid var(--border-color);border-radius:9px;background:none;
			padding:7px 14px;font-size:12.5px;cursor:pointer;color:var(--text-color);
			display:flex;align-items:center;gap:7px;}
		.br-btn.on{border-color:#1d7a33;color:#1d7a33;font-weight:700;}
		[data-theme="dark"] .br-btn.on{color:#6fbf7f;}
		.dot{width:8px;height:8px;border-radius:50%;background:var(--text-muted);display:inline-block;}
		.br-btn.on .dot{background:#1d7a33;animation:brpulse 1.6s ease-in-out infinite;}
		[data-theme="dark"] .br-btn.on .dot{background:#6fbf7f;}
		@keyframes brpulse{0%,100%{opacity:1;}50%{opacity:.25;}}
		.br-stamp{margin-left:auto;font-size:11.5px;color:var(--text-muted);text-align:right;}

		/* the three watched lines */
		.hero{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:6px;}
		.h1c{flex:1 1 300px;border:1px solid var(--border-color);border-radius:15px;
			padding:17px 19px;background:var(--fg-color);position:relative;overflow:hidden;}
		.h1c.err{border-color:#b02a2a;}
		.h1c .who{font-size:10.5px;text-transform:uppercase;letter-spacing:.07em;
			color:var(--text-muted);}
		.h1c .nm{font-size:16px;font-weight:800;margin-top:1px;}
		.h1c .rate{font-size:40px;font-weight:800;line-height:1.12;margin:8px 0 0;
			font-variant-numeric:tabular-nums;letter-spacing:-.5px;}
		.h1c .per{font-size:12.5px;font-weight:400;color:var(--text-muted);}
		.h1c .drv{margin-top:12px;padding-top:11px;border-top:1px solid var(--border-color);
			display:grid;grid-template-columns:repeat(4,1fr);gap:8px;}
		.h1c .drv div{font-size:10px;text-transform:uppercase;letter-spacing:.05em;
			color:var(--text-muted);}
		.h1c .drv b{display:block;font-size:16px;color:var(--text-color);font-weight:700;
			font-variant-numeric:tabular-nums;letter-spacing:-.2px;margin-top:1px;}
		.h1c .hl{margin-top:9px;font-size:11px;color:var(--text-muted);
			font-variant-numeric:tabular-nums;}
		.h1c .bad{color:#b02a2a;font-size:12.5px;margin-top:8px;}
		[data-theme="dark"] .h1c .bad{color:#f0a0a0;}
		.up{color:#1d7a33;} .down{color:#b02a2a;}
		[data-theme="dark"] .up{color:#6fbf7f;} [data-theme="dark"] .down{color:#f0a0a0;}
		.arw{font-size:.55em;vertical-align:middle;}

		.br-sec{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;
			color:var(--text-muted);margin:24px 0 9px;padding-bottom:5px;
			border-bottom:1px solid var(--border-color);}
		.br-tw{overflow-x:auto;}
		table.br-t{width:100%;border-collapse:collapse;font-size:12.5px;background:var(--fg-color);
			border:1px solid var(--border-color);border-radius:11px;overflow:hidden;
			font-variant-numeric:tabular-nums;}
		table.br-t th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em;
			color:var(--text-muted);padding:8px 11px;background:var(--control-bg);
			border-bottom:1px solid var(--border-color);white-space:nowrap;}
		table.br-t td{padding:7px 11px;border-bottom:1px solid var(--border-color);}
		table.br-t td.num,table.br-t th.num{text-align:right;}
		table.br-t tr.pick td{background:rgba(31,97,141,.07);font-weight:700;}
		.k{font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);
			border:1px solid var(--border-color);border-radius:6px;padding:0 5px;margin-right:6px;}
		.br-why{border:1px solid var(--border-color);border-left:3px solid #b45309;
			border-radius:10px;padding:12px 15px;background:var(--fg-color);
			font-size:12.5px;line-height:1.65;color:var(--text-muted);margin-top:18px;}
		.br-why b{color:var(--text-color);}
		.ctx{font-size:12.5px;color:var(--text-muted);margin:-3px 0 10px;}
		</style>
		<div class="br-top">
			<button class="br-btn br-live on"><span class="dot"></span><span class="lbl"></span></button>
			<button class="br-btn br-more"></button>
			<span class="br-stamp"></span>
		</div>
		<div class="hero"></div>
		<div class="br-body"></div>
	`);

	const KARATS = ["24K", "22K", "18K", "14K"];

	function paintHero() {
		const d = S.data;
		root.find(".hero").html((d.hero || []).map((h) => {
			const dir = moved("hero:" + h.prefix, h.rate);
			if (h.error && h.rate == null) {
				return `<div class="h1c err"><div class="who">${esc(h.of)}</div>
					<div class="nm">${esc(h.name)}</div>
					<div class="bad">${esc(h.error)}</div></div>`;
			}
			return `<div class="h1c">
				<div class="who">${esc(h.of)}</div>
				<div class="nm">${esc(h.label)}</div>
				<div class="rate ${dir}">${inr(h.rate, 2)}${arrow(dir)}
					<span class="per">${__("per gram")}</span></div>
				<div class="drv">${KARATS.map((k) => `<div>${k}<b>${
					inr((h.by_karat || {})[k], 0)}</b></div>`).join("")}</div>
				<div class="hl">${__("karats derived, assuming this line is {0} fine", [h.fineness])}</div>
				${h.high || h.low ? `<div class="hl">${__("high")} ${num(h.high)} · ${__("low")} ${num(h.low)}</div>` : ""}
			</div>`;
		}).join(""));
	}

	function paint() {
		const d = S.data;
		if (!d) return;
		root.find(".br-live").toggleClass("on", S.live)
			.find(".lbl").text(S.live ? __("Live") : __("Paused"));
		root.find(".br-more").toggleClass("on", S.detail)
			.text(S.detail ? __("Hide the other feeds") : __("Show the other feeds"));
		root.find(".br-stamp").html(S.live
			? __("refreshing every {0}s · last at {1}",
				[POLL_MS / 1000, esc((S.at || d.fetched_on || "").slice(11, 19))])
			: __("paused — press Live to follow the board again"));

		paintHero();

		if (!S.detail) {
			root.find(".br-body").html(`<div class="br-why">
				<b>${__("These three are what the floor watches.")}</b>
				${__("The karat figures under each are DERIVED — the line's own fineness backed out to fine gold and taken to that karat. They are arithmetic, not a rate anybody quoted.")}
				<br><br>
				${__("Nothing here sets a board rate. That stays a decision made each morning — a feed that quietly became the billing number would have us charging a figure nobody chose.")}
			</div>`);
			return;
		}

		const live = (d.rows || []).filter((r) => !r.error);
		const watched = new Set((d.hero || []).map((h) => h.prefix.toUpperCase()));
		const boards = live.filter((r) => (r.extra || []).length).map((r) => `
			<div class="br-sec">${esc(r.name)} — ${__("the whole board")}</div>
			<div class="br-tw"><table class="br-t"><thead><tr>
				<th>${__("Line")}</th><th class="num">${__("Bid")}</th><th class="num">${__("Ask")}</th>
				<th class="num">${__("High")}</th><th class="num">${__("Low")}</th>
			</tr></thead><tbody>${r.extra.map((e) => {
				const on = [...watched].some((w) => (e.label || "").toUpperCase().startsWith(w));
				return `<tr class="${on ? "pick" : ""}">
					<td>${e.kind ? `<span class="k">${esc(e.kind)}</span>` : ""}${esc(e.label)}</td>
					${["bid", "ask", "high", "low"].map((k) => {
						const dd = k === "high" || k === "low" ? ""
							: moved(r.key + ":" + e.label + ":" + k, e[k]);
						return `<td class="num ${dd}">${num(e[k])}${arrow(dd)}</td>`;
					}).join("")}</tr>`;
			}).join("")}</tbody></table></div>`).join("");

		root.find(".br-body").html(`
			<div class="br-sec">${__("Every feed, for checking against")}</div>
			<p class="ctx">${__("what each source makes a gram worth, at every purity")}</p>
			<div class="br-tw"><table class="br-t"><thead><tr>
				<th>${__("Source")}</th><th>${__("What it is")}</th>
				${KARATS.map((k) => `<th class="num">${k}</th>`).join("")}
				<th class="num">${__("Read in")}</th>
			</tr></thead><tbody>${(d.rows || []).map((r) => `<tr>
				<td><b>${esc(r.name)}</b>${r.live ? "" : ` <span class="k">${__("daily")}</span>`}</td>
				<td>${esc(r.kind)}${r.detail ? `<div class="k" style="border:0;padding:0;">${esc(r.detail)}</div>` : ""}</td>
				${r.error ? `<td colspan="4" class="down">${esc(r.error)}</td>`
					: KARATS.map((k) => `<td class="num">${inr((r.by_karat || {})[k], 2)}</td>`).join("")}
				<td class="num">${r.ms}ms</td></tr>`).join("")}</tbody></table></div>
			${boards}
			${d.ours ? `<div class="br-sec">${__("What we last billed at")}</div>
				<div class="br-tw"><table class="br-t"><tbody><tr>
					<td>${esc(d.ours.doc)} · ${esc(d.ours.on)}</td>
					<td class="num"><b>${inr(d.ours.rate)}</b> /g</td>
				</tr></tbody></table></div>` : ""}
			<div class="br-why">
				<b>${__("For the eye, not for billing.")}</b>
				${__("Nothing on this page sets a board rate. The highlighted rows are the three lines shown above.")}
				<br><br>
				${__("These are undocumented endpoints belonging to two bullion firms — the same ones their own websites call. Reads are held server-side and a paused or hidden page asks for nothing, but if one of these becomes the feed we rely on, we should ask them.")}
			</div>`);
	}

	function load(refresh) {
		return frappe.call({ method: API + ".get_board_rate_feeds",
			args: { refresh: refresh ? 1 : 0 }, freeze: !!refresh,
			freeze_message: __("Reading the feeds…") })
			.then((r) => { S.data = r.message; S.at = (S.data || {}).fetched_on || ""; paint(); });
	}

	function tick() {
		// a page nobody is looking at asks nothing of anybody's server
		if (!S.live || !S.data || document.hidden || !$(wrapper).is(":visible")) return;
		frappe.call({ method: API + ".get_board_rate_live", freeze: false })
			.then((r) => {
				const m = r.message || {};
				(m.rows || []).forEach((n) => {
					const row = (S.data.rows || []).find((x) => x.key === n.key);
					if (row) Object.assign(row, n);
				});
				if (m.hero) S.data.hero = m.hero;
				S.at = m.at || "";
				paint();
			})
			.catch(() => {});      // a dropped tick is not worth a message; the next one comes
	}

	root.on("click", ".br-live", () => { S.live = !S.live; paint(); if (S.live) tick(); });
	root.on("click", ".br-more", () => { S.detail = !S.detail; paint(); });
	page.set_primary_action(__("Read again"), () => load(true), "refresh");
	load(false).then(() => { S.timer = setInterval(tick, POLL_MS); });
	// the interval belongs to this page, not to the desk it was opened from
	$(wrapper).on("remove", () => clearInterval(S.timer));
};
