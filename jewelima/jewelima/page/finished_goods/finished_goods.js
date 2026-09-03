// Finished Goods (Delivery) — everything standing in the Finished Goods
// warehouse, one line per piece: what it is, what it weighs, who holds it, and
// its HUID and certificates. The Finished Stock report counts pieces by type;
// this is the list you read when someone asks what we have.
// Route: /app/finished-goods
frappe.pages["finished-goods"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Finished Goods"), single_column: true });
	const esc = frappe.utils.escape_html;
	const V = jewelima.viz;
	// every filter lives here and goes to the SERVER — the page shows at most
	// `limit` rows, so filtering in the browser would only ever filter the page
	const S = { data: null, f: { bucket: "", held_by: "", design_type: "", karat: "",
		has_huid: "", certified: "", search: "" }, limit: 300 };

	$(page.main).append(`
		<style>
		#page-finished-goods .container{max-width:100%;}
		${V.css()}
		.fg-tiles{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px;}
		/* the buckets across the top: the whole stock, one chip each */
		.fg-buckets{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:13px;}
		.fg-bk{border:1px solid var(--border-color);border-radius:11px;padding:8px 15px;
			background:var(--fg-color);cursor:pointer;min-width:104px;transition:border-color .12s;}
		.fg-bk:hover{border-color:#1f618d;}
		.fg-bk.on{border-color:#1f618d;box-shadow:inset 0 0 0 1px #1f618d;background:rgba(31,97,141,.07);}
		.fg-bk .n{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);}
		.fg-bk .p{font-size:19px;font-weight:800;line-height:1.15;}
		.fg-bk .g{font-size:10.5px;color:var(--text-muted);}
		.fg-bk.empty .p,.fg-bk.empty .n{opacity:.5;}
		.fg-cap{font-size:12px;color:#8a6d00;font-weight:600;margin-left:auto;}
		.fg-clear{border:none;background:none;color:#1f618d;cursor:pointer;font-size:12px;
			text-decoration:underline;padding:0 4px;}
		.fg-tile{border:1px solid var(--border-color);border-radius:12px;padding:10px 20px;background:var(--fg-color);min-width:120px;}
		.fg-tile .k{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;}
		.fg-tile .v{font-size:22px;font-weight:800;}
		.fg-tile.pure .v{color:#1f618d;}
		.fg-top{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px;}
		.fg-top select,.fg-q{border:1px solid var(--border-color);border-radius:8px;height:31px;padding:2px 11px;
			background:var(--fg-color);color:var(--text-color);font-size:12.5px;}
		.fg-q{width:230px;}
		.fg-wh{margin-left:auto;font-size:12px;color:var(--text-muted);}
		.fg-cols{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;}
		.fg-main{flex:1 1 640px;min-width:520px;}
		.fg-side{flex:0 0 300px;}
		.fg-box{border:1px solid var(--border-color);border-radius:12px;overflow:auto;background:var(--fg-color);max-height:calc(100vh - 300px);}
		table.fg-t{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.fg-t th{position:sticky;top:0;background:var(--control-bg);font-size:10px;text-transform:uppercase;
			color:var(--text-muted);padding:7px 10px;text-align:left;border-bottom:2px solid var(--border-color);white-space:nowrap;}
		table.fg-t td{padding:6px 10px;border-bottom:1px solid var(--border-color);vertical-align:top;}
		table.fg-t td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}
		table.fg-t tr:hover td{background:var(--control-bg);}
		.fg-code{font-weight:700;font-family:var(--font-family-monospace,monospace);color:#1f618d;cursor:pointer;}
		.fg-sub{font-size:10.5px;color:var(--text-muted);}
		.fg-tag{display:inline-block;border-radius:8px;padding:0 7px;font-size:9.5px;font-weight:800;
			background:var(--control-bg);color:var(--text-muted);margin-right:4px;}
		.fg-none{padding:36px;text-align:center;color:var(--text-muted);}
		</style>
		<div class="jw-viz">
			<div class="fg-buckets"></div>
			<div class="fg-tiles"></div>
			<div class="fg-top">
				<select class="fg-f" data-f="held_by"><option value="">${__("Every holder")}</option></select>
				<select class="fg-f" data-f="design_type"><option value="">${__("Every type")}</option></select>
				<select class="fg-f" data-f="karat"><option value="">${__("Every karat")}</option></select>
				<select class="fg-f" data-f="has_huid">
					<option value="">${__("HUID: any")}</option>
					<option value="1">${__("has a HUID")}</option>
					<option value="0">${__("no HUID")}</option></select>
				<select class="fg-f" data-f="certified">
					<option value="">${__("Cert: any")}</option>
					<option value="1">${__("certified")}</option>
					<option value="0">${__("not certified")}</option></select>
				<input type="text" class="fg-q" placeholder="${__("search card / design / HUID…")}">
				<button class="fg-clear" style="display:none;">${__("clear filters")}</button>
				<span class="fg-cap"></span>
				<span class="fg-wh"></span>
			</div>
			<div class="fg-cols">
				<div class="fg-main"><div class="fg-box"><table class="fg-t"><thead><tr>
					<th>${__("Piece")}</th><th>${__("Design")}</th><th>${__("Bucket")}</th><th>${__("Held by")}</th>
					<th class="num">${__("Gross")}</th><th class="num">${__("Gold")}</th>
					<th class="num">${__("Pure")}</th><th class="num">${__("Diamond")}</th><th>${__("Since")}</th>
				</tr></thead><tbody class="fg-body"></tbody></table></div></div>
				<div class="fg-side">
					<div class="jw-card"><div class="jw-h">${__("By holder")}</div>
						<div class="jw-sub">${__("pieces standing in Finished Goods")}</div>
						<div class="fg-byholder"></div></div>
					<div class="jw-card" style="margin-top:14px;"><div class="jw-h">${__("What it adds up to")}</div>
						<div class="jw-sub">${__("the materials those pieces are made of")}</div>
						<div class="fg-mats"></div></div>
				</div>
			</div>
		</div>`);
	const root = $(page.main);
	const f3 = (n) => (n || 0).toFixed(3);

	const anyFilter = () => Object.values(S.f).some(Boolean);

	function paint() {
		const rows = S.data.rows || [];
		const t = S.data.totals || {};
		const grand = S.data.grand || {};
		const filtered = anyFilter();

		// the buckets, across the top, over the WHOLE stock — so the chips do not
		// move around as you filter by them
		// every bucket in use, PLUS every active one that is empty — an empty FEMI
		// tile says FEMI exists and holds nothing, which is a different and more
		// useful answer than no tile at all
		const held = S.data.buckets || [];
		const seen = new Set(held.map((b) => b.bucket));
		const bks = held.concat((S.data.all_buckets || [])
			.filter((n) => !seen.has(n)).map((n) => ({ bucket: n, pieces: 0, gross: 0 })));
		root.find(".fg-buckets").html([{ bucket: "", pieces: grand.pieces, gross: grand.gross }]
			.concat(bks).map((b) => `
			<div class="fg-bk ${S.f.bucket === b.bucket ? "on" : ""}${b.pieces ? "" : " empty"}" data-b="${esc(b.bucket)}">
				<div class="n">${b.bucket ? esc(b.bucket) : __("All stock")}</div>
				<div class="p">${b.pieces}</div>
				<div class="g">${f3(b.gross)} g</div>
			</div>`).join(""));

		// the KPIs describe everything that matches, not the page — and say so
		// against the full stock whenever a filter is on
		const side = (v) => `<span style="font-size:12px;color:var(--text-muted);"> / ${v}</span>`;
		root.find(".fg-tiles").html(`
			<div class="fg-tile"><div class="k">${__("Pieces")}</div><div class="v">${t.pieces || 0}${
				filtered ? side(grand.pieces || 0) : ""}</div></div>
			<div class="fg-tile"><div class="k">${__("Gross")}</div><div class="v">${f3(t.gross)}<span style="font-size:12px;"> g</span></div></div>
			<div class="fg-tile"><div class="k">${__("Gold")}</div><div class="v">${f3(t.gold)}<span style="font-size:12px;"> g</span></div></div>
			<div class="fg-tile pure"><div class="k">${__("Pure gold")}</div><div class="v">${f3(t.pure)}<span style="font-size:12px;"> g</span></div></div>
			<div class="fg-tile"><div class="k">${__("Diamond")}</div><div class="v">${f3(t.dmd_ct)}<span style="font-size:12px;"> ct</span></div></div>`);

		root.find(".fg-cap").text(S.data.truncated
			? __("showing the first {0} of {1} — narrow it down to see the rest", [S.data.shown, t.pieces])
			: "");
		root.find(".fg-clear").toggle(filtered);

		root.find(".fg-body").html(rows.map((r) => `
			<tr>
				<td><span class="fg-code" data-n="${esc(r.order_bag)}">${esc(r.order_bag)}</span>
					<div class="fg-sub">${r.huid ? `<span class="fg-tag">HUID</span>${esc(r.huid)}` : ""}${
						r.certifications ? ` <span class="fg-tag">CERT</span>${esc(r.certifications)}` : ""}</div></td>
				<td>${esc(r.design)}<div class="fg-sub">${esc(r.design_type || "")}${r.karat ? " · " + esc(r.karat) : ""}${r.size ? " · " + esc(r.size) : ""}</div></td>
				<td>${esc(r.bucket || "—")}</td>
				<td>${esc(r.held_by || "—")}</td>
				<td class="num">${f3(r.gross)}</td>
				<td class="num">${f3(r.gold)}</td>
				<td class="num">${f3(r.pure)}</td>
				<td class="num">${r.dmd_ct ? f3(r.dmd_ct) + (r.dmd_no ? ` / ${r.dmd_no}` : "") : "—"}</td>
				<td>${esc(r.since || "—")}</td>
			</tr>`).join("") || `<tr><td colspan="9" class="fg-none">${
				anyFilter() ? __("Nothing matches these filters.") : __("Nothing in Finished Goods right now.")}</td></tr>`);

		const byHolder = {};
		rows.forEach((r) => {
			const h = r.held_by || __("unassigned");
			byHolder[h] = (byHolder[h] || 0) + 1;
		});
		V.bars(root.find(".fg-byholder"),
			Object.entries(byHolder).sort((a, b) => b[1] - a[1]).map(([h, n]) => ({ label: h, value: n })),
			{ unit: "", dp: 0, colour: 0, empty: __("nothing here") });

		V.bars(root.find(".fg-mats"),
			(S.data.materials || []).slice(0, 10).map((m) => ({
				label: m.item, value: m.qty, colour: m.stone ? 2 : 0 })),
			{ unit: "", dp: 3, empty: __("nothing here") });
	}

	function fillSelect(f, blank, list) {
		const $s = root.find(`.fg-f[data-f="${f}"]`);
		if (!list) return;
		$s.html(`<option value="">${blank}</option>`
			+ list.map((v) => `<option ${v === S.f[f] ? "selected" : ""}>${esc(v)}</option>`).join(""));
	}

	function load() {
		jewelima.busyCall(root.find(".fg-main"), __("Loading finished goods…"),
			{ method: "jewelima.jewelima.api.get_finished_goods", freeze: false,
			  args: Object.assign({ limit: S.limit }, S.f) }).then((r) => {
			S.data = r.message || { rows: [], totals: {}, buckets: [], grand: {} };
			root.find(".fg-wh").text(S.data.warehouse ? __("held in {0}", [S.data.warehouse.replace(" - JD", "")]) : "");
			fillSelect("held_by", __("Every holder"), S.data.holders);
			fillSelect("design_type", __("Every type"), S.data.types);
			fillSelect("karat", __("Every karat"), S.data.karats);
			paint();
		});
	}
	// every filter is a server round trip, so the numbers describe the whole stock
	root.on("change", ".fg-f", function () { S.f[this.dataset.f] = this.value; load(); });
	root.find(".fg-q").on("input", frappe.utils.debounce(function () {
		S.f.search = this.value || ""; load();
	}, 350));
	root.on("click", ".fg-bk", function () {
		const b = $(this).data("b") || "";
		S.f.bucket = (S.f.bucket === b) ? "" : b;   // clicking the live one clears it
		load();
	});
	root.on("click", ".fg-clear", function () {
		Object.keys(S.f).forEach((k) => { S.f[k] = ""; });
		root.find(".fg-q").val("");
		root.find(".fg-f").val("");
		load();
	});
	root.on("click", ".fg-code", function () {
		frappe.route_options = { card: $(this).data("n") };
		frappe.set_route("card-info");
	});
	page.add_inner_button(__("Finished Stock report"), () => frappe.set_route("finished-stock"));
	page.add_inner_button(__("Refresh"), load);
	frappe.pages["finished-goods"].on_page_show = load;
	load();
};
