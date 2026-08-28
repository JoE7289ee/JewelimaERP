// Location Stock (Stock > Stock Reports) — what is actually sitting in the
// working warehouses: Gold Issue, Casting, Production. Each gets its own card
// with what it holds by kind and by item; the table underneath carries the same
// numbers so nothing rests on colour alone.
// Route: /app/location-stock
frappe.pages["location-stock"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Location Stock"), single_column: true });
	const esc = frappe.utils.escape_html;
	const V = jewelima.viz;
	const KIND_SLOT = { Gold: 0, Findings: 1, Stone: 2, Alloy: 3 };
	const S = { data: null, picked: null, q: "" };

	$(page.main).append(`
		<style>
		#page-location-stock .container{max-width:100%;}
		${V.css()}
		.ls-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:14px;margin-bottom:16px;}
		.ls-card{border:1px solid var(--border-color);border-radius:13px;background:var(--fg-color);
			padding:14px 16px;cursor:pointer;transition:border-color .12s,box-shadow .12s;}
		.ls-card:hover{border-color:#1f618d;box-shadow:0 1px 6px rgba(31,97,141,.14);}
		.ls-card.on{border-color:#1f618d;box-shadow:0 0 0 1px #1f618d inset;}
		.ls-card .wh{font-size:15px;font-weight:800;}
		.ls-card .sub{font-size:11px;color:var(--text-muted);margin-bottom:10px;}
		.ls-nums{display:flex;gap:16px;margin-bottom:10px;}
		.ls-nums .n .k{font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);}
		.ls-nums .n .v{font-size:19px;font-weight:800;}
		.ls-nums .n.pure .v{color:#1f618d;}
		.ls-empty{padding:18px 0;color:var(--text-muted);font-size:12.5px;}
		.ls-top{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px;}
		.ls-q{width:220px;border:1px solid var(--border-color);border-radius:8px;height:31px;padding:2px 12px;
			background:var(--fg-color);color:var(--text-color);font-size:12.5px;}
		.ls-scope{font-size:12.5px;font-weight:700;}
		.ls-clear{font-size:11.5px;color:#1f618d;cursor:pointer;}
		.ls-box{border:1px solid var(--border-color);border-radius:13px;overflow:auto;background:var(--fg-color);max-height:calc(100vh - 380px);}
		table.ls-t{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.ls-t th{position:sticky;top:0;background:var(--control-bg);font-size:10px;text-transform:uppercase;
			color:var(--text-muted);padding:7px 10px;text-align:left;border-bottom:2px solid var(--border-color);}
		table.ls-t td{padding:6px 10px;border-bottom:1px solid var(--border-color);}
		table.ls-t td.num{text-align:right;font-variant-numeric:tabular-nums;}
		.ls-kind{border-radius:9px;padding:1px 9px;font-size:10px;font-weight:800;white-space:nowrap;}
		.ls-kind.Gold{background:#eef5fa;color:#1f618d;}
		.ls-kind.Findings{background:#fdeee7;color:#a8431a;}
		.ls-kind.Stone{background:#e8f7f1;color:#127753;}
		.ls-kind.Alloy{background:#fdf3e3;color:#8a6d00;}
		.ls-none{padding:34px;text-align:center;color:var(--text-muted);}
		</style>
		<div class="jw-viz">
			<div class="ls-cards"></div>
			<div class="ls-top">
				<span class="ls-scope"></span>
				<span class="ls-clear" style="display:none;">${__("show every location")}</span>
				<input type="text" class="ls-q" placeholder="${__("search an item…")}" style="margin-left:auto;">
			</div>
			<div class="ls-box"><table class="ls-t"><thead><tr>
				<th>${__("Item")}</th><th>${__("Location")}</th><th>${__("Kind")}</th>
				<th class="num">${__("Qty")}</th><th>${__("UOM")}</th><th class="num">${__("Pure (g)")}</th>
			</tr></thead><tbody class="ls-body"></tbody></table></div>
		</div>`);
	const root = $(page.main);

	function paintCards() {
		const locs = (S.data || {}).locations || [];
		root.find(".ls-cards").html(locs.map((L) => {
			const t = L.totals || {};
			return `<div class="ls-card ${S.picked === L.label ? "on" : ""}" data-l="${esc(L.label)}">
				<div class="wh">${esc(L.label)}</div>
				<div class="sub">${t.items ? __("{0} item(s) on hand", [t.items]) : __("empty")}</div>
				<div class="ls-nums">
					<div class="n"><div class="k">${__("Metal")}</div><div class="v">${(t.gold || 0).toFixed(3)}<span style="font-size:11px;"> g</span></div></div>
					<div class="n pure"><div class="k">${__("Pure gold")}</div><div class="v">${(t.pure || 0).toFixed(3)}<span style="font-size:11px;"> g</span></div></div>
					${t.stones ? `<div class="n"><div class="k">${__("Stones")}</div><div class="v">${t.stones.toFixed(3)}<span style="font-size:11px;"> ct</span></div></div>` : ""}
				</div>
				<div class="ls-kinds"></div>
			</div>`;
		}).join(""));
		// the kind split inside each card — one bar per kind, directly labelled
		locs.forEach((L) => {
			const $k = root.find(`.ls-card[data-l="${L.label}"] .ls-kinds`);
			if (!(L.kinds || []).length) { $k.html(`<div class="ls-empty">${__("nothing here right now")}</div>`); return; }
			V.bars($k, L.kinds.map((k) => ({
				label: k.kind, value: k.qty, colour: KIND_SLOT[k.kind] != null ? KIND_SLOT[k.kind] : 0,
			})), { label: 110, unit: "", dp: 3 });
		});
	}

	function paintTable() {
		const locs = (S.data || {}).locations || [];
		const q = S.q.trim().toLowerCase();
		let rows = [];
		locs.forEach((L) => {
			if (S.picked && L.label !== S.picked) return;
			(L.rows || []).forEach((r) => rows.push(Object.assign({ loc: L.label }, r)));
		});
		if (q) rows = rows.filter((r) => (r.item + " " + r.name + " " + r.group).toLowerCase().includes(q));
		rows.sort((a, b) => b.qty - a.qty);
		root.find(".ls-scope").text(S.picked ? __("{0} — {1} item(s)", [S.picked, rows.length])
			: __("All locations — {0} item(s)", [rows.length]));
		root.find(".ls-clear").toggle(!!S.picked);
		root.find(".ls-body").html(rows.map((r) => `
			<tr>
				<td><b>${esc(r.item)}</b>${r.name && r.name !== r.item ? ` <span style="color:var(--text-muted);">${esc(r.name)}</span>` : ""}</td>
				<td>${esc(r.loc)}</td>
				<td><span class="ls-kind ${esc(r.kind)}">${esc(r.kind)}</span></td>
				<td class="num">${r.qty.toFixed(3)}</td>
				<td>${esc(r.uom)}</td>
				<td class="num">${r.pure ? r.pure.toFixed(3) : "—"}</td>
			</tr>`).join("") || `<tr><td colspan="6" class="ls-none">${__("Nothing in stock here.")}</td></tr>`);
	}

	function load() {
		frappe.call({ method: "jewelima.jewelima.api.get_location_stock", freeze: false })
			.then((r) => { S.data = r.message || { locations: [] }; paintCards(); paintTable(); });
	}
	root.on("click", ".ls-card", function () {
		const l = $(this).data("l");
		S.picked = S.picked === l ? null : l;
		paintCards();
		paintTable();
	});
	root.on("click", ".ls-clear", () => { S.picked = null; paintCards(); paintTable(); });
	root.find(".ls-q").on("input", frappe.utils.debounce(function () { S.q = this.value || ""; paintTable(); }, 200));
	page.add_inner_button(__("Refresh"), load);
	frappe.pages["location-stock"].on_page_show = load;
	load();
};
