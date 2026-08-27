// Finished Goods (Delivery) — everything standing in the Finished Goods
// warehouse, one line per piece: what it is, what it weighs, who holds it, and
// its HUID and certificates. The Finished Stock report counts pieces by type;
// this is the list you read when someone asks what we have.
// Route: /app/finished-goods
frappe.pages["finished-goods"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Finished Goods"), single_column: true });
	const esc = frappe.utils.escape_html;
	const V = jewelima.viz;
	const S = { data: null, q: "", holder: "", type: "" };

	$(page.main).append(`
		<style>
		#page-finished-goods .container{max-width:100%;}
		${V.css()}
		.fg-tiles{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px;}
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
			<div class="fg-tiles"></div>
			<div class="fg-top">
				<select class="fg-holder"><option value="">${__("Every holder")}</option></select>
				<select class="fg-type"><option value="">${__("Every type")}</option></select>
				<input type="text" class="fg-q" placeholder="${__("search card / design / HUID…")}">
				<span class="fg-wh"></span>
			</div>
			<div class="fg-cols">
				<div class="fg-main"><div class="fg-box"><table class="fg-t"><thead><tr>
					<th>${__("Piece")}</th><th>${__("Design")}</th><th>${__("Held by")}</th>
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

	function visible() {
		const q = S.q.trim().toLowerCase();
		return (S.data.rows || []).filter((r) =>
			(!S.holder || r.held_by === S.holder) &&
			(!S.type || r.design_type === S.type) &&
			(!q || (r.order_bag + " " + r.design + " " + r.huid + " " + r.certifications).toLowerCase().includes(q)));
	}

	function paint() {
		const rows = visible();
		const t = S.data.totals || {};
		const sum = (k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
		const showing = rows.length !== (S.data.rows || []).length;
		root.find(".fg-tiles").html(`
			<div class="fg-tile"><div class="k">${__("Pieces")}</div><div class="v">${rows.length}${
				showing ? `<span style="font-size:12px;color:var(--text-muted);"> / ${t.pieces}</span>` : ""}</div></div>
			<div class="fg-tile"><div class="k">${__("Gross")}</div><div class="v">${f3(sum("gross"))}<span style="font-size:12px;"> g</span></div></div>
			<div class="fg-tile"><div class="k">${__("Gold")}</div><div class="v">${f3(sum("gold"))}<span style="font-size:12px;"> g</span></div></div>
			<div class="fg-tile pure"><div class="k">${__("Pure gold")}</div><div class="v">${f3(sum("pure"))}<span style="font-size:12px;"> g</span></div></div>
			<div class="fg-tile"><div class="k">${__("Diamond")}</div><div class="v">${f3(sum("dmd_ct"))}<span style="font-size:12px;"> ct</span></div></div>`);

		root.find(".fg-body").html(rows.map((r) => `
			<tr>
				<td><span class="fg-code" data-n="${esc(r.order_bag)}">${esc(r.order_bag)}</span>
					<div class="fg-sub">${r.huid ? `<span class="fg-tag">HUID</span>${esc(r.huid)}` : ""}${
						r.certifications ? ` <span class="fg-tag">CERT</span>${esc(r.certifications)}` : ""}</div></td>
				<td>${esc(r.design)}<div class="fg-sub">${esc(r.design_type || "")}${r.karat ? " · " + esc(r.karat) : ""}${r.size ? " · " + esc(r.size) : ""}</div></td>
				<td>${esc(r.held_by || "—")}</td>
				<td class="num">${f3(r.gross)}</td>
				<td class="num">${f3(r.gold)}</td>
				<td class="num">${f3(r.pure)}</td>
				<td class="num">${r.dmd_ct ? f3(r.dmd_ct) + (r.dmd_no ? ` / ${r.dmd_no}` : "") : "—"}</td>
				<td>${esc(r.since || "—")}</td>
			</tr>`).join("") || `<tr><td colspan="8" class="fg-none">${
				(S.data.rows || []).length ? __("Nothing matches.") : __("Nothing in Finished Goods right now.")}</td></tr>`);

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

	function load() {
		frappe.call({ method: "jewelima.jewelima.api.get_finished_goods", freeze: false }).then((r) => {
			S.data = r.message || { rows: [], totals: {} };
			root.find(".fg-wh").text(S.data.warehouse ? __("held in {0}", [S.data.warehouse.replace(" - JD", "")]) : "");
			root.find(".fg-holder").html(`<option value="">${__("Every holder")}</option>`
				+ (S.data.holders || []).map((h) => `<option ${h === S.holder ? "selected" : ""}>${esc(h)}</option>`).join(""));
			root.find(".fg-type").html(`<option value="">${__("Every type")}</option>`
				+ (S.data.types || []).map((t) => `<option ${t === S.type ? "selected" : ""}>${esc(t)}</option>`).join(""));
			paint();
		});
	}
	root.find(".fg-holder").on("change", function () { S.holder = this.value; paint(); });
	root.find(".fg-type").on("change", function () { S.type = this.value; paint(); });
	root.find(".fg-q").on("input", frappe.utils.debounce(function () { S.q = this.value || ""; paint(); }, 200));
	root.on("click", ".fg-code", function () {
		frappe.route_options = { card: $(this).data("n") };
		frappe.set_route("card-info");
	});
	page.add_inner_button(__("Finished Stock report"), () => frappe.set_route("finished-stock"));
	page.add_inner_button(__("Refresh"), load);
	frappe.pages["finished-goods"].on_page_show = load;
	load();
};
