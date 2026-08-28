// Loss History — everything that ever LEFT the loss buckets: refining
// recoveries (dust -> standard gold) and management write-offs (permanent
// loss, with the reason it was booked). Read-only record.
frappe.pages["loss-history"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Loss History"), single_column: true });
	const esc = frappe.utils.escape_html;
	const S = { kind: "", rows: [], period: "all", q: "", sort: "when", desc: true };

	$(page.main).append(`
		<style>
		#page-loss-history .container{max-width:100%;}
		.lh-tiles{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;align-items:center;}
		.lh-tile{border:1px solid var(--border-color);border-radius:10px;padding:7px 16px;background:var(--fg-color);cursor:pointer;}
		.lh-tile.on{border-color:#1f618d;box-shadow:0 0 0 1px #1f618d inset;}
		.lh-tile .k{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;}
		.lh-tile .v{font-size:17px;font-weight:800;}
		.lh-tile.rec .v{color:#1d7a33;} .lh-tile.off .v{color:#b02a2a;}
		.lh-box{border:1px solid var(--border-color);border-radius:12px;overflow:auto;background:var(--fg-color);max-height:calc(100vh - 220px);}
		table.lh-t{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.lh-t th{position:sticky;top:0;background:var(--control-bg);font-size:10px;text-transform:uppercase;
			color:var(--text-muted);padding:6px 10px;text-align:left;border-bottom:2px solid var(--border-color);white-space:nowrap;}
		table.lh-t td{padding:6px 10px;border-bottom:1px solid var(--border-color);vertical-align:top;}
		.lh-k{border-radius:9px;padding:1px 9px;font-size:10px;font-weight:800;white-space:nowrap;}
		.lh-k.Recovered{background:#dcefe0;color:#1d7a33;}
		.lh-k.WrittenOff{background:#f5dddd;color:#b02a2a;}
		.lh-lines{font-size:11px;color:var(--text-muted);}
		.lh-reason{font-size:11.5px;color:#b02a2a;font-style:italic;}
		.lh-none{padding:40px;text-align:center;color:var(--text-muted);}
		.lh-bar{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-bottom:10px;}
		.lh-pill{border:1px solid var(--border-color);background:var(--fg-color);color:var(--text-muted);
			border-radius:999px;padding:4px 13px;font-size:11.5px;cursor:pointer;font-weight:600;}
		.lh-pill.on{background:#1f618d;border-color:#1f618d;color:#fff;}
		.lh-q{width:230px;border:1px solid var(--border-color);border-radius:8px;height:29px;padding:2px 11px;
			background:var(--fg-color);color:var(--text-color);font-size:12.5px;}
		.lh-when{font-size:11.5px;color:var(--text-muted);}
		table.lh-t th.s{cursor:pointer;user-select:none;}
		table.lh-t th.s:hover{color:var(--text-color);}
		table.lh-t th .ar{opacity:.45;font-size:9px;margin-left:3px;}
		table.lh-t th.sorted .ar{opacity:1;}
		td.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;}
		</style>
		<div class="lh-bar">
			<span class="lh-pill" data-p="today">${__("Today")}</span>
			<span class="lh-pill" data-p="week">${__("7 days")}</span>
			<span class="lh-pill" data-p="month">${__("30 days")}</span>
			<span class="lh-pill" data-p="year">${__("12 months")}</span>
			<span class="lh-pill on" data-p="all">${__("All")}</span>
			<input class="lh-q" placeholder="${__("Filter item, reason or person")}">
			<span class="lh-when"></span>
		</div>
		<div class="lh-tiles">
			<div class="lh-tile ${""}" data-k=""><div class="k">${__("All entries")}</div><div class="v lh-c-all">0</div></div>
			<div class="lh-tile rec" data-k="Recovered"><div class="k">${__("Recovered (pure g)")}</div><div class="v lh-c-rec">0</div></div>
			<div class="lh-tile off" data-k="Written Off"><div class="k">${__("Written off (pure g)")}</div><div class="v lh-c-off">0</div></div>
		</div>
		<div class="lh-box"><table class="lh-t"><thead><tr>
			<th class="s" data-k="when">${__("Date")}<span class="ar">&#9660;</span></th>
			<th class="s" data-k="kind">${__("What")}<span class="ar">&#9660;</span></th>
			<th class="num s" data-k="pure">${__("Pure g")}<span class="ar">&#9660;</span></th>
			<th class="s" data-k="got">${__("Result")}<span class="ar">&#9660;</span></th>
			<th>${__("Dust consumed")}</th>
			<th class="s" data-k="who">${__("By")}<span class="ar">&#9660;</span></th>
			<th>${__("Entry")}</th>
		</tr></thead><tbody class="lh-body"></tbody></table></div>`);
	const root = $(page.main);

	function paint() {
		const q = (S.q || "").trim().toLowerCase();
		let rows = S.rows.filter((r) => (!S.kind || r.kind === S.kind) && (!q
			|| (r.who || "").toLowerCase().includes(q)
			|| (r.reason || "").toLowerCase().includes(q)
			|| (r.got_item || "").toLowerCase().includes(q)
			|| (r.name || "").toLowerCase().includes(q)
			|| (r.consumed || []).some((c) => (c.item || "").toLowerCase().includes(q))));
		rows = sortRows(rows);
		root.find(".lh-tile").removeClass("on").filter(`[data-k="${S.kind}"]`).addClass("on");
		root.find("th.s").removeClass("sorted").filter(`[data-k="${S.sort}"]`).addClass("sorted")
			.find(".ar").html(S.desc ? "&#9660;" : "&#9650;");
		root.find(".lh-body").html(rows.map((r) => `<tr>
			<td>${frappe.datetime.str_to_user(r.when)}</td>
			<td><span class="lh-k ${r.kind.replace(/\s+/g, "")}">${esc(r.kind)}</span>
				${r.reason ? `<div class="lh-reason">${esc(r.reason)}</div>` : ""}</td>
			<td class="num"><b>${r.pure.toFixed(3)}</b></td>
			<td>${r.kind === "Recovered"
				? `<b>${r.got.toFixed(3)} g</b> ${esc(r.got_item)}`
				: `<span style="color:#b02a2a;font-weight:700;">${__("permanent loss")}</span>`}</td>
			<td class="lh-lines">${r.consumed.map((c) => `${c.qty.toFixed(3)} g ${esc(c.item)} · ${esc((c.warehouse || "").replace(" - JD", ""))}`).join("<br>")}</td>
			<td>${esc(r.who)}</td>
			<td style="font-size:11px;color:var(--text-muted);">${esc(r.name)}</td>
		</tr>`).join("") || `<tr><td colspan="7" class="lh-none">${S.q || S.kind || S.period !== "all"
			? __("Nothing matches — try a wider window or clear the filter.")
			: __("Nothing here yet — recoveries and write-offs will appear as they happen.")}</td></tr>`);
	}
	// one comparator: text is compared as text, numbers as numbers, and the
	// arrow in the header is the only thing that says which way
	function sortRows(rows) {
		const k = S.sort;
		const val = (r) => (k === "got" ? (r.kind === "Recovered" ? r.got : -1) : r[k]);
		return rows.slice().sort((a, b) => {
			const x = val(a), y = val(b);
			const c = (typeof x === "number" && typeof y === "number")
				? x - y : String(x || "").localeCompare(String(y || ""));
			return S.desc ? -c : c;
		});
	}

	function load() {
		frappe.call({ method: "jewelima.jewelima.api.get_loss_history", freeze: false,
			args: { period: S.period } }).then((r) => {
			const m = r.message || { rows: [] };
			S.rows = m.rows || [];
			root.find(".lh-when").text(m.label || "");
			root.find(".lh-c-all").text(S.rows.length);
			root.find(".lh-c-rec").text((m.recovered_pure || 0).toFixed(3));
			root.find(".lh-c-off").text((m.writtenoff_pure || 0).toFixed(3));
			paint();
		});
	}
	root.on("click", ".lh-tile", function () { S.kind = $(this).data("k"); paint(); });
	root.on("click", ".lh-pill", function () {
		root.find(".lh-pill").removeClass("on"); this.classList.add("on");
		S.period = this.dataset.p; load();
	});
	root.on("input", ".lh-q", function () { S.q = this.value; paint(); });
	root.on("click", "th.s", function () {
		const k = this.dataset.k;
		S.desc = S.sort === k ? !S.desc : true;
		S.sort = k;
		paint();
	});
	frappe.pages["loss-history"].on_page_show = load;
	load();
};
