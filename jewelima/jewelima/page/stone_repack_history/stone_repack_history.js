// Stone Repack History (Stock > Records) — every repack ever asked for and what
// became of it: what was split, into which sieves, who asked, who decided, and
// the Repack entry it wrote. Read-only record; the asking and the approving
// both live on Repack Stock.
// Route: /app/stone-repack-history
frappe.pages["stone-repack-history"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Stone Repack History"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const ct = (v) => (parseFloat(v) || 0).toFixed(3);
	const S = { period: "month", status: "", q: "", data: null };

	$(page.main).append(`
		<style>
		#page-stone-repack-history .container{max-width:100%;}
		.rh-wrap{max-width:1240px;}
		.rh-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px;}
		.rh-pill,.rh-kind{border:1px solid var(--border-color);background:var(--fg-color);color:var(--text-muted);
			border-radius:999px;padding:5px 14px;font-size:12px;cursor:pointer;font-weight:600;}
		.rh-pill.on,.rh-kind.on{background:#1f618d;border-color:#1f618d;color:#fff;}
		.rh-q{width:250px;border:1px solid var(--border-color);border-radius:8px;height:31px;padding:2px 12px;
			background:var(--fg-color);color:var(--text-color);font-size:12.5px;}
		.rh-tiles{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px;}
		.rh-tile{border:1px solid var(--border-color);border-radius:11px;background:var(--fg-color);
			padding:11px 16px;min-width:130px;}
		.rh-tile .k{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);}
		.rh-tile .v{font-size:21px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.25;}
		.rh-tile.ok .v{color:#1d7a33;} .rh-tile.wait .v{color:#8a6508;} .rh-tile.no .v{color:#b02a2a;}
		table.rh-t{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.rh-t th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;
			color:var(--text-muted);border-bottom:1px solid var(--border-color);padding:8px;font-weight:700;}
		table.rh-t td{padding:8px;border-bottom:1px solid var(--border-color);vertical-align:top;}
		table.rh-t td.num{text-align:right;font-variant-numeric:tabular-nums;font-weight:700;}
		table.rh-t th.num{text-align:right;}
		table.rh-t tr:hover td{background:var(--control-bg);}
		.rh-sub{color:var(--text-muted);font-size:11.5px;}
		.rh-st{font-weight:800;font-size:10.5px;padding:2px 9px;border-radius:9px;white-space:nowrap;}
		.rh-st.Pending{background:rgba(184,134,11,.18);color:#8a6508;}
		.rh-st.Approved{background:rgba(29,122,51,.16);color:#1d7a33;}
		.rh-st.Rejected{background:rgba(176,42,42,.14);color:#b02a2a;}
		[data-theme="dark"] .rh-st.Pending{color:#e8b84a;}
		[data-theme="dark"] .rh-st.Approved{color:#7fc98f;}
		[data-theme="dark"] .rh-st.Rejected{color:#e08a8a;}
		.rh-se{font-size:11px;font-weight:700;color:#7a4fb5;cursor:pointer;}
		.rh-se:hover{text-decoration:underline;}
		[data-theme="dark"] .rh-se{color:#bfa3e8;}
		.rh-tg{line-height:1.6;}
		.rh-none{padding:36px;text-align:center;color:var(--text-muted);}
		</style>
		<div class="rh-wrap">
			<div class="rh-bar">
				<span class="rh-pill" data-p="today">${__("Today")}</span>
				<span class="rh-pill" data-p="week">${__("7 days")}</span>
				<span class="rh-pill on" data-p="month">${__("30 days")}</span>
				<span class="rh-pill" data-p="year">${__("12 months")}</span>
				<span class="rh-pill" data-p="all">${__("All")}</span>
				<span style="width:12px;"></span>
				<span class="rh-kind on" data-k="">${__("All")}</span>
				<span class="rh-kind" data-k="Approved">${__("Approved")}</span>
				<span class="rh-kind" data-k="Pending">${__("Pending")}</span>
				<span class="rh-kind" data-k="Rejected">${__("Rejected")}</span>
				<input class="rh-q" placeholder="${__("Filter item, sieve or person")}">
				<span class="rh-sub rh-when"></span>
			</div>
			<div class="rh-tiles"></div>
			<div class="rh-list"></div>
		</div>`);
	const root = $(page.main);

	function paint() {
		const d = S.data || { rows: [], totals: {} };
		const t = d.totals || {};
		root.find(".rh-when").text(d.label || "");
		root.find(".rh-tiles").html(`
			<div class="rh-tile ok"><div class="k">${__("Repacked")}</div>
				<div class="v">${ct(t.moved)}<span style="font-size:11px;"> ct</span></div>
				<div class="rh-sub">${__("approved and moved")}</div></div>
			<div class="rh-tile"><div class="k">${__("Requests")}</div><div class="v">${t.requests || 0}</div></div>
			<div class="rh-tile ok"><div class="k">${__("Approved")}</div><div class="v">${t.approved || 0}</div></div>
			<div class="rh-tile wait"><div class="k">${__("Pending")}</div><div class="v">${t.pending || 0}</div></div>
			<div class="rh-tile no"><div class="k">${__("Rejected")}</div><div class="v">${t.rejected || 0}</div></div>
			<div class="rh-tile"><div class="k">${__("Sieves out")}</div><div class="v">${t.lines || 0}</div></div>`);

		const q = S.q.trim().toLowerCase();
		const hit = (r) => !q
			|| (r.source_item + " " + r.source_name).toLowerCase().includes(q)
			|| (r.by + " " + r.decided_by).toLowerCase().includes(q)
			|| (r.targets || []).some((x) => x.item.toLowerCase().includes(q));
		const rows = (d.rows || []).filter(hit);

		root.find(".rh-list").html(rows.length ? `
			<table class="rh-t"><thead><tr>
				<th>${__("When")}</th><th>${__("Request")}</th><th>${__("Source")}</th>
				<th class="num">${__("Weight")}</th><th>${__("Split into")}</th>
				<th>${__("Asked by")}</th><th>${__("Outcome")}</th>
			</tr></thead><tbody>${rows.map((r) => `
				<tr>
					<td>${esc(r.when)}</td>
					<td><b>${esc(r.name)}</b>${r.remarks ? `<div class="rh-sub">${esc(r.remarks)}</div>` : ""}</td>
					<td>${esc(r.source_name)}<div class="rh-sub">${esc(r.warehouse)}</div></td>
					<td class="num">${ct(r.qty)} ct</td>
					<td class="rh-tg">${(r.targets || []).map((x) =>
						`${esc(x.item)} — <b>${ct(x.qty)}</b> ct${x.pcs ? ` · ${x.pcs} pc` : ""}`).join("<br>")
						|| "<span class='rh-sub'>—</span>"}</td>
					<td>${esc(r.by)}</td>
					<td><span class="rh-st ${esc(r.status)}">${esc(r.status)}</span>
						${r.decided_by ? `<div class="rh-sub">${esc(r.decided_by)} · ${esc(r.decided_on)}</div>` : ""}
						${r.stock_entry ? `<div class="rh-se" data-se="${esc(r.stock_entry)}">${esc(r.stock_entry)}</div>` : ""}
						${r.reject_reason ? `<div class="rh-sub" style="color:#b02a2a;">${esc(r.reject_reason)}</div>` : ""}</td>
				</tr>`).join("")}</tbody></table>`
			: `<div class="rh-none">${__("No repacks in this window.")}</div>`);
	}

	function load() {
		frappe.call({ method: API + ".get_repack_history", freeze: false,
			args: { period: S.period, status: S.status || null } })
			.then((r) => { S.data = r.message || null; paint(); });
	}
	root.on("click", ".rh-pill", function () {
		root.find(".rh-pill").removeClass("on"); this.classList.add("on");
		S.period = this.dataset.p; load();
	});
	root.on("click", ".rh-kind", function () {
		root.find(".rh-kind").removeClass("on"); this.classList.add("on");
		S.status = this.dataset.k; load();
	});
	root.on("input", ".rh-q", function () { S.q = this.value; paint(); });
	// the entry it actually wrote — the ledger is the last word on a repack
	root.on("click", ".rh-se", function () {
		frappe.set_route("Form", "Stock Entry", $(this).data("se"));
	});

	page.add_inner_button(__("Repack Stock"), () => frappe.set_route("repack-stock"));
	page.set_primary_action(__("Refresh"), () => load(), "refresh");
	frappe.pages["stone-repack-history"].on_page_show = load;
	load();
};
