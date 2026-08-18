// Bench Info — ONE page for every bench. Lands on a tile per location (cards, qty,
// gold, overdue, oldest) and clicking a tile opens that bench's board in place —
// the same jewelima.buildBenchBoard the individual Bench pages use, so the detail
// view (filters, columns, export) is identical. Route: /app/bench-info
frappe.pages["bench-info"].on_page_load = function (wrapper) {
	const esc = frappe.utils.escape_html;
	const $w = $(wrapper);

	function showTiles() {
		$w.empty();
		const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Bench Info"), single_column: true });
		const root = $(page.main);
		root.append(`
			<style>
			.bi-hint{font-size:12.5px;color:var(--text-muted);margin:0 0 14px;}
			.bi-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px;}
			.bi-tile{border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);padding:14px 16px;
				cursor:pointer;transition:box-shadow .12s,transform .12s;}
			.bi-tile:hover{box-shadow:0 6px 18px rgba(0,0,0,.12);transform:translateY(-2px);}
			.bi-tile.empty{opacity:.55;}
			.bi-tile.unknown{border-color:#b02a2a;}
			.bi-nm{font-weight:800;font-size:13.5px;letter-spacing:.03em;margin-bottom:8px;}
			.bi-big{font-size:26px;font-weight:800;line-height:1;}
			.bi-big .u{font-size:11px;font-weight:600;color:var(--text-muted);margin-left:4px;}
			.bi-sub{display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;font-size:11.5px;color:var(--text-muted);}
			.bi-sub b{color:var(--text-color);font-weight:800;}
			.bi-od{color:#b02a2a;font-weight:800;}
			.bi-tot{margin-left:auto;font-size:12.5px;font-weight:700;}
			.bi-head{display:flex;align-items:center;gap:10px;margin-bottom:6px;}
			</style>
			<div class="bi-head"><span class="bi-hint">${__("Every location on the floor — click one to open its board.")}</span>
				<span class="bi-tot"></span></div>
			<div class="bi-grid"></div>`);
		page.add_inner_button(__("Refresh"), load);

		function load() {
			frappe.call({ method: "jewelima.jewelima.api.get_bench_overview" }).then((r) => {
				const d = r.message || {};
				const rows = d.benches || [];
				root.find(".bi-tot").text(__("{0} card(s) on the floor", [d.total_cards || 0]));
				root.find(".bi-grid").html(rows.map((b) => `
					<div class="bi-tile ${b.cards ? "" : "empty"} ${b.known ? "" : "unknown"}" data-b="${esc(b.bench)}"
						${b.known ? "" : `title="${__("cards are sitting at a location that is not a known bench")}"`}>
						<div class="bi-nm">${esc(b.bench)}</div>
						<div class="bi-big">${b.cards}<span class="u">${__("cards")}</span></div>
						<div class="bi-sub">
							<span><b>${b.qty || 0}</b> ${__("pcs")}</span>
							<span><b>${(b.gold_g || 0).toFixed(3)}</b> g</span>
							${b.overdue ? `<span class="bi-od">${b.overdue} ${__("overdue")}</span>` : ""}
							${b.oldest_days ? `<span>${__("oldest")} <b>${b.oldest_days}</b>d</span>` : ""}
						</div>
					</div>`).join(""));
			});
		}
		root.on("click", ".bi-tile", function () { showBoard($(this).data("b")); });
		load();
	}

	function showBoard(bench) {
		$w.empty();
		// the very same board the per-bench pages render, plus a way back
		jewelima.buildBenchBoard(wrapper, bench, { onBack: showTiles });
	}

	showTiles();
};
