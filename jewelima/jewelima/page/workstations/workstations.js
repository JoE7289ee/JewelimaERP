// Workstations — ONE page for every workstation, the way Bench Info is one page
// for every bench. Lands on a tile per workstation with its headline numbers, and
// clicking one opens that workstation in place (the same jewelima.buildWorkstation
// the individual ws-* pages use, so the detail view is identical).
//
// Access: each workstation has its own role, "Jewelima Bench <BENCH>", and that
// role opens ONLY its own page. So the tiles are filtered to what the user may
// actually open — nobody is shown a tile that would then refuse to open.
// Stock Manager / System Manager / JW Manager see the whole floor.
frappe.pages["workstations"].on_page_load = function (wrapper) {
	const esc = frappe.utils.escape_html;
	const $w = $(wrapper);

	// bench -> its ws page, mirroring JEWELIMA_WS_PAGES in setup.py
	const WS = {
		"CAD": "ws-cad-ws", "CAM": "ws-cam", "WAXING": "ws-waxing",
		"WAX SETTING": "ws-wax-setting", "WAX CLEANING": "ws-wax-cleaning",
		"GRINDING": "ws-grinding", "FILING": "ws-filing", "SETTING": "ws-setting",
		"PRE POLISH": "ws-pre-polish", "FINAL POLISH": "ws-final-polish",
		"BAG EXTRACTION": "ws-bag-extraction",
	};
	const roles = frappe.user_roles || [];
	const seesAll = ["System Manager", "Stock Manager", "JW Manager"].some((r) => roles.includes(r));
	const mine = (bench) => seesAll || roles.includes("Jewelima Bench " + bench);

	function showTiles() {
		$w.empty();
		const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Workstations"), single_column: true });
		const root = $(page.main);
		root.append(`
			<style>
			.wt-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(215px,1fr));gap:14px;}
			.wt-tile{border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);padding:14px 16px;
				cursor:pointer;transition:box-shadow .12s,transform .12s;}
			.wt-tile:hover{box-shadow:0 6px 18px rgba(0,0,0,.12);transform:translateY(-2px);}
			.wt-tile.empty{opacity:.55;}
			.wt-nm{font-weight:800;font-size:13.5px;letter-spacing:.03em;margin-bottom:8px;}
			.wt-big{font-size:26px;font-weight:800;line-height:1;}
			.wt-big .u{font-size:11px;font-weight:600;color:var(--text-muted);margin-left:4px;}
			.wt-sub{display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;font-size:11.5px;color:var(--text-muted);}
			.wt-sub b{color:var(--text-color);font-weight:800;}
			.wt-wt{display:flex;gap:12px;flex-wrap:wrap;margin-top:4px;font-size:11.5px;color:var(--text-muted);}
			.wt-wt b{color:var(--text-color);font-weight:800;}
			.wt-st{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px;}
			.wt-b{background:var(--control-bg);border:1px solid var(--border-color);border-radius:9px;
				padding:1px 8px;font-size:10.5px;color:var(--text-muted);}
			.wt-b b{color:var(--text-color);font-weight:800;}
			.wt-od{color:#b02a2a;font-weight:800;}
			.wt-aw{color:#7a5b00;font-weight:800;}
			.wt-oos{color:#b02a2a;font-weight:800;}
			.wt-head{display:flex;align-items:center;gap:10px;margin-bottom:6px;}
			.wt-hint{font-size:12.5px;color:var(--text-muted);margin:0 0 14px;}
			.wt-tot{margin-left:auto;font-size:12.5px;font-weight:700;}
			.wt-none{padding:50px 20px;text-align:center;color:var(--text-muted);}
			</style>
			<div class="wt-head"><span class="wt-hint">${__("Click a workstation to open it.")}</span>
				<span class="wt-tot"></span></div>
			<div class="wt-grid"></div>`);
		page.add_inner_button(__("Refresh"), load);

		function load() {
			const $g = root.find(".wt-grid");
			$g.html(`<div class="wt-none">${__("Loading…")}</div>`);
			frappe.call({ method: "jewelima.jewelima.api.get_bench_overview", freeze: false }).then((r) => {
				const all = (r.message || {}).benches || [];
				const byLoc = {};
				all.forEach((x) => { byLoc[(x.bench || "").toUpperCase()] = x; });

				const benches = Object.keys(WS).filter(mine);
				if (!benches.length) {
					root.find(".wt-tot").text("");
					return $g.html(`<div class="wt-none">
						${__("No workstation is assigned to you yet — ask a manager for the bench role you work on.")}</div>`);
				}
				const n3 = (v) => (parseFloat(v) || 0).toFixed(3);
				let cards = 0;
				$g.html(benches.map((b) => {
					const d = byLoc[b] || {};
					cards += (d.cards || 0);
					const st = d.stones || {};
					const buckets = Object.keys(st).filter((k) => parseFloat(st[k]) > 0)
						.map((k) => [k, st[k]]);
					return `<div class="wt-tile ${d.cards ? "" : "empty"}" data-b="${esc(b)}">
						<div class="wt-nm">${esc(b)}</div>
						<div class="wt-big">${d.cards || 0}<span class="u">${__("cards")}</span></div>
						<div class="wt-sub">
							<span><b>${d.qty || 0}</b> ${__("pcs")}</span>
							${d.overdue ? `<span class="wt-od">${d.overdue} ${__("overdue")}</span>` : ""}
							${d.awaiting_stone ? `<span class="wt-aw">${d.awaiting_stone} ${__("awaiting stone")}</span>` : ""}
							${d.stone_oos ? `<span class="wt-oos">${d.stone_oos} ${__("stone out of stock")}</span>` : ""}
						</div>
						<div class="wt-wt">
							<span>${__("Nett")} <b>${n3(d.nett_g)}</b> g</span>
							<span>${__("Gross")} <b>${n3(d.gross_g)}</b> g</span>
						</div>
						${buckets.length ? `<div class="wt-st">${buckets.map((x) =>
							`<span class="wt-b">${esc(x[0])} <b>${(parseFloat(x[1]) || 0).toFixed(2)}</b> ct</span>`).join("")}</div>` : ""}
					</div>`;
				}).join(""));
				root.find(".wt-tot").text(__("{0} card(s) across your workstations", [cards]));
			}).catch(() => $g.html(`<div class="wt-none">${__("Could not load the floor.")}</div>`));
		}

		root.on("click", ".wt-tile", function () { openOne(this.dataset.b); });
		load();
	}

	function openOne(bench) {
		if (!mine(bench)) return frappe.msgprint(__("You do not have access to {0}.", [bench]));
		$w.empty();
		jewelima.buildWorkstation(wrapper, bench, { onBack: showTiles });
	}

	// coming back to the page should show today's numbers, not a stale board
	frappe.pages["workstations"].on_page_show = function () { showTiles(); };
	showTiles();
};
