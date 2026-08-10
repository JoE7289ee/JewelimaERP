// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Migration Goals — a gamified push board: live counts vs targets with progress
// rings that count up, a leading contributor per goal, and an overall
// leaderboard. Meant to make everyone want to fill the bars. Route: /app/migration-goals

frappe.pages["migration-goals"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Migration Goals", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;

	const COLORS = {
		approved_designs: "#2e9e4f", variants: "#2b7cd3", rejected_designs: "#e0872a",
		price_chart: "#8b5cf6", customer_photos: "#12a594",
	};
	const EMOJI = {
		approved_designs: "✅", variants: "💎", rejected_designs: "🗂️",
		price_chart: "🏷️", customer_photos: "📸",
	};

	$(page.main).append(`
		<style>
		#page-migration-goals .container{max-width:100%;}
		.mg-hero{border-radius:16px;padding:22px 26px;margin-bottom:22px;color:#fff;
			background:linear-gradient(120deg,#1f2a5a,#3b2f7a 55%,#7a2f6a);box-shadow:0 8px 30px rgba(40,30,90,.25);}
		.mg-hero h1{font-size:26px;font-weight:800;margin:0 0 4px;}
		.mg-hero .sub{font-size:13px;opacity:.85;}
		.mg-hero .big{display:flex;align-items:baseline;gap:14px;margin-top:12px;flex-wrap:wrap;}
		.mg-hero .pct{font-size:52px;font-weight:900;line-height:1;}
		.mg-hero .pill{background:rgba(255,255,255,.18);border-radius:20px;padding:5px 14px;font-size:13px;font-weight:700;}
		.mg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;margin-bottom:24px;}
		.mg-card{border:1px solid var(--border-color);border-radius:14px;background:var(--fg-color);padding:18px 16px 16px;text-align:center;position:relative;overflow:hidden;transition:transform .12s,box-shadow .12s;}
		.mg-card:hover{transform:translateY(-2px);box-shadow:0 8px 22px rgba(0,0,0,.10);}
		.mg-card.done{border-color:#2e9e4f;}
		.mg-done-badge{position:absolute;top:10px;right:10px;background:#2e9e4f;color:#fff;font-size:10px;font-weight:800;padding:2px 9px;border-radius:20px;letter-spacing:.05em;}
		.mg-ring{position:relative;width:132px;height:132px;margin:0 auto 8px;}
		.mg-ring svg{transform:rotate(-90deg);}
		.mg-ring .mid{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;}
		.mg-ring .mid .cur{font-size:30px;font-weight:900;line-height:1;}
		.mg-ring .mid .of{font-size:11.5px;color:var(--text-muted);margin-top:2px;}
		.mg-emoji{font-size:16px;}
		.mg-label{font-size:14px;font-weight:800;margin:2px 0 2px;}
		.mg-remain{font-size:11.5px;color:var(--text-muted);margin-bottom:8px;}
		.mg-leader{font-size:11.5px;background:var(--control-bg);border-radius:20px;padding:3px 10px;display:inline-block;}
		.mg-leader b{font-weight:800;}
		.mg-sec{font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);margin:6px 0 12px;}
		.mg-board{border:1px solid var(--border-color);border-radius:14px;background:var(--fg-color);padding:8px 6px;}
		.mg-row{display:flex;align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid var(--border-color);}
		.mg-row:last-child{border-bottom:none;}
		.mg-rank{font-size:20px;width:34px;text-align:center;}
		.mg-name{font-weight:700;flex:1;}
		.mg-total{font-weight:800;font-size:16px;}
		.mg-empty{padding:26px;text-align:center;color:var(--text-muted);}
		</style>
		<div class="mg-hero">
			<h1>🚀 ${__("Migration Goals")}</h1>
			<div class="sub">${__("Fill every ring. Every approved design, variant, cleanup and photo gets us there.")}</div>
			<div class="big"><div class="pct">0%</div>
				<div class="pill mg-goalsdone">—</div>
				<div class="pill mg-updated" style="margin-left:auto;"></div></div>
		</div>
		<div class="mg-grid"></div>
		<div class="mg-sec">🏆 ${__("Leading contributors")}</div>
		<div class="mg-board"></div>
	`);
	const root = $(page.main);

	function ring(color, pct) {
		const r = 56, c = 2 * Math.PI * r, off = c * (1 - Math.min(1, pct));
		return `<svg width="132" height="132" viewBox="0 0 132 132">
			<circle cx="66" cy="66" r="${r}" fill="none" stroke="var(--control-bg)" stroke-width="13"></circle>
			<circle cx="66" cy="66" r="${r}" fill="none" stroke="${color}" stroke-width="13" stroke-linecap="round"
				stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${c.toFixed(1)}"
				style="transition:stroke-dashoffset 1.1s cubic-bezier(.2,.8,.2,1);" data-off="${off.toFixed(1)}"></circle>
		</svg>`;
	}
	function countUp($el, to) {
		const dur = 1100, t0 = performance.now();
		function step(t) {
			const p = Math.min(1, (t - t0) / dur);
			const e = 1 - Math.pow(1 - p, 3);
			$el.text(Math.round(to * e).toLocaleString());
			if (p < 1) requestAnimationFrame(step);
		}
		requestAnimationFrame(step);
	}

	function load() {
		frappe.call({ method: API + ".get_migration_goals" }).then((r) => {
			const m = r.message || { goals: [], leaderboard: [] };
			const goals = m.goals || [];
			const doneCount = goals.filter((g) => g.current >= g.target).length;
			const avg = goals.length ? goals.reduce((s, g) => s + Math.min(1, g.current / (g.target || 1)), 0) / goals.length : 0;

			root.find(".mg-hero .pct").text(Math.round(avg * 100) + "%");
			root.find(".mg-goalsdone").text(__("{0} / {1} goals complete", [doneCount, goals.length]));
			root.find(".mg-updated").text(__("updated {0}", [frappe.datetime.now_time()]));

			root.find(".mg-grid").html(goals.map((g) => {
				const col = COLORS[g.key] || "#2b7cd3";
				const pct = Math.min(1, g.current / (g.target || 1));
				const done = g.current >= g.target;
				const remain = Math.max(0, g.target - g.current);
				const leader = g.leader
					? `<div class="mg-leader">🏆 <b>${esc(g.leader.name)}</b> · ${g.leader.count.toLocaleString()}</div>`
					: `<div class="mg-leader" style="opacity:.6;">${__("no contributor yet")}</div>`;
				return `
				<div class="mg-card ${done ? "done" : ""}" data-key="${esc(g.key)}">
					${done ? `<div class="mg-done-badge">${__("DONE")} ✓</div>` : ""}
					<div class="mg-ring">${ring(col, pct)}
						<div class="mid"><div class="cur" data-to="${g.current}" style="color:${col};">0</div>
							<div class="of">/ ${g.target.toLocaleString()}</div></div>
					</div>
					<div class="mg-emoji">${EMOJI[g.key] || "🎯"}</div>
					<div class="mg-label">${esc(g.label)}</div>
					<div class="mg-remain">${done ? __("target reached! 🎉") : __("{0} to go · {1}%", [remain.toLocaleString(), Math.round(pct * 100)])}</div>
					${leader}
				</div>`;
			}).join(""));

			// animate rings + counters after paint
			requestAnimationFrame(() => {
				root.find(".mg-ring circle[data-off]").each(function () { this.style.strokeDashoffset = this.getAttribute("data-off"); });
				root.find(".mg-ring .cur").each(function () { countUp($(this), parseInt(this.getAttribute("data-to"), 10) || 0); });
			});

			const board = m.leaderboard || [];
			const medal = ["🥇", "🥈", "🥉"];
			root.find(".mg-board").html(board.length ? board.map((b, i) => `
				<div class="mg-row">
					<div class="mg-rank">${medal[i] || "#" + (i + 1)}</div>
					<div class="mg-name">${esc(b.name)}</div>
					<div class="mg-total" style="color:${i === 0 ? "#d4a017" : "var(--text-color)"};">${b.total.toLocaleString()}</div>
				</div>`).join("")
				: `<div class="mg-empty">${__("No contributions tracked yet — be the first on the board.")}</div>`);
		});
	}

	page.set_primary_action(__("Refresh"), load, "refresh-cw");
	load();
	// keep it live for the wall screen
	const timer = setInterval(() => { if (frappe.get_route()[0] === "migration-goals") load(); }, 45000);
	$(wrapper).on("remove", () => clearInterval(timer));
};
