// Stone Adjustment History (Stock > Records) — every count taken of the loose
// stone room and what it came to: what was short, what was over, who counted,
// who signed, and the Stock Reconciliation it wrote. Read-only record.
// Route: /app/stone-adjustment-history
frappe.pages["stone-adjustment-history"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Stone Adjustment History"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const ct = (v) => (parseFloat(v) || 0).toFixed(3);
	const S = { period: "month", status: "", q: "", data: null };

	$(page.main).append(`
		<style>
		#page-stone-adjustment-history .container{max-width:100%;}
		.ah-wrap{max-width:1240px;}
		.ah-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px;}
		.ah-pill,.ah-kind{border:1px solid var(--border-color);background:var(--fg-color);color:var(--text-muted);
			border-radius:999px;padding:5px 14px;font-size:12px;cursor:pointer;font-weight:600;}
		.ah-pill.on,.ah-kind.on{background:#1f618d;border-color:#1f618d;color:#fff;}
		.ah-q{width:250px;border:1px solid var(--border-color);border-radius:8px;height:31px;padding:2px 12px;
			background:var(--fg-color);color:var(--text-color);font-size:12.5px;}
		.ah-tiles{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px;}
		.ah-tile{border:1px solid var(--border-color);border-radius:11px;background:var(--fg-color);
			padding:11px 16px;min-width:130px;}
		.ah-tile .k{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);}
		.ah-tile .v{font-size:21px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.25;}
		.ah-tile .s{font-size:10.5px;color:var(--text-muted);}
		.ah-tile.short .v{color:#b02a2a;} .ah-tile.over .v{color:#1d7a33;} .ah-tile.wait .v{color:#8a6508;}
		[data-theme="dark"] .ah-tile.short .v{color:#e08a8a;}
		[data-theme="dark"] .ah-tile.over .v{color:#7fc98f;}
		table.ah-t{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.ah-t th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;
			color:var(--text-muted);border-bottom:1px solid var(--border-color);padding:8px;font-weight:700;}
		table.ah-t td{padding:8px;border-bottom:1px solid var(--border-color);vertical-align:top;}
		table.ah-t td.num{text-align:right;font-variant-numeric:tabular-nums;font-weight:700;}
		table.ah-t th.num{text-align:right;}
		table.ah-t tr:hover td{background:var(--control-bg);}
		.ah-sub{color:var(--text-muted);font-size:11.5px;}
		.ah-neg{color:#b02a2a;} .ah-pos{color:#1d7a33;}
		[data-theme="dark"] .ah-neg{color:#e08a8a;} [data-theme="dark"] .ah-pos{color:#7fc98f;}
		.ah-st{font-weight:800;font-size:10.5px;padding:2px 9px;border-radius:9px;white-space:nowrap;}
		.ah-st.Pending{background:rgba(184,134,11,.18);color:#8a6508;}
		.ah-st.Approved{background:rgba(29,122,51,.16);color:#1d7a33;}
		.ah-st.Rejected{background:rgba(176,42,42,.14);color:#b02a2a;}
		[data-theme="dark"] .ah-st.Pending{color:#e8b84a;}
		[data-theme="dark"] .ah-st.Approved{color:#7fc98f;}
		[data-theme="dark"] .ah-st.Rejected{color:#e08a8a;}
		.ah-sr{font-size:11px;font-weight:700;color:#7a4fb5;cursor:pointer;}
		.ah-sr:hover{text-decoration:underline;}
		[data-theme="dark"] .ah-sr{color:#bfa3e8;}
		.ah-none{padding:36px;text-align:center;color:var(--text-muted);}
		</style>
		<div class="ah-wrap">
			<div class="ah-bar">
				<span class="ah-pill" data-p="today">${__("Today")}</span>
				<span class="ah-pill" data-p="week">${__("7 days")}</span>
				<span class="ah-pill on" data-p="month">${__("30 days")}</span>
				<span class="ah-pill" data-p="year">${__("12 months")}</span>
				<span class="ah-pill" data-p="all">${__("All")}</span>
				<span style="width:12px;"></span>
				<span class="ah-kind on" data-k="">${__("All")}</span>
				<span class="ah-kind" data-k="Approved">${__("Written off")}</span>
				<span class="ah-kind" data-k="Pending">${__("Pending")}</span>
				<span class="ah-kind" data-k="Rejected">${__("Rejected")}</span>
				<input class="ah-q" placeholder="${__("Filter stone or person")}">
				<span class="ah-sub ah-when"></span>
			</div>
			<div class="ah-tiles"></div>
			<div class="ah-list"></div>
		</div>`);
	const root = $(page.main);

	function paint() {
		const d = S.data || { rows: [], totals: {} };
		const t = d.totals || {};
		root.find(".ah-when").text(d.label || "");
		root.find(".ah-tiles").html(`
			<div class="ah-tile short"><div class="k">${__("Written off")}</div>
				<div class="v">${ct(t.short)}<span style="font-size:11px;"> ct</span></div>
				<div class="s">${__("short on the tray")}</div></div>
			<div class="ah-tile over"><div class="k">${__("Found")}</div>
				<div class="v">${ct(t.over)}<span style="font-size:11px;"> ct</span></div>
				<div class="s">${__("more than booked")}</div></div>
			<div class="ah-tile"><div class="k">${__("Net")}</div>
				<div class="v">${t.net > 0 ? "+" : ""}${ct(t.net)}<span style="font-size:11px;"> ct</span></div>
				<div class="s">${__("approved counts only")}</div></div>
			<div class="ah-tile"><div class="k">${__("Counts")}</div><div class="v">${t.counts || 0}</div></div>
			<div class="ah-tile wait"><div class="k">${__("Pending")}</div><div class="v">${t.pending || 0}</div></div>
			<div class="ah-tile"><div class="k">${__("Lines")}</div><div class="v">${t.lines || 0}</div>
				<div class="s">${__("stones corrected")}</div></div>`);

		const q = S.q.trim().toLowerCase();
		const rows = (d.rows || []).filter((r) => !q
			|| (r.by + " " + r.decided_by + " " + r.reason).toLowerCase().includes(q)
			|| (r.items || []).some((i) => i.item.toLowerCase().includes(q)));

		root.find(".ah-list").html(rows.length ? `
			<table class="ah-t"><thead><tr>
				<th>${__("When")}</th><th>${__("Count")}</th><th>${__("What moved")}</th>
				<th class="num">${__("Short")}</th><th class="num">${__("Over")}</th>
				<th>${__("Counted by")}</th><th>${__("Outcome")}</th>
			</tr></thead><tbody>${rows.map((r) => `
				<tr>
					<td>${esc(r.when)}</td>
					<td><b>${esc(r.name)}</b>${r.reason ? `<div class="ah-sub">${esc(r.reason)}</div>` : ""}
						<div class="ah-sub">${esc(r.warehouse)}</div></td>
					<td>${(r.items || []).map((i) => `${esc(i.item)} ${ct(i.system_qty)} → <b>${ct(i.counted_qty)}</b>
						<span class="${i.difference < 0 ? "ah-neg" : "ah-pos"}">(${i.difference > 0 ? "+" : ""}${ct(i.difference)})</span>${
							i.note ? `<span class="ah-sub"> · ${esc(i.note)}</span>` : ""}`).join("<br>")
						|| "<span class='ah-sub'>—</span>"}</td>
					<td class="num ah-neg">${r.short ? ct(r.short) : "—"}</td>
					<td class="num ah-pos">${r.over ? ct(r.over) : "—"}</td>
					<td>${esc(r.by)}</td>
					<td><span class="ah-st ${esc(r.status)}">${esc(r.status)}</span>
						${r.decided_by ? `<div class="ah-sub">${esc(r.decided_by)} · ${esc(r.decided_on)}</div>` : ""}
						${r.reconciliation ? `<div class="ah-sr" data-sr="${esc(r.reconciliation)}">${esc(r.reconciliation)}</div>` : ""}
						${r.reject_reason ? `<div class="ah-sub" style="color:#b02a2a;">${esc(r.reject_reason)}</div>` : ""}</td>
				</tr>`).join("")}</tbody></table>`
			: `<div class="ah-none">${__("No counts in this window.")}</div>`);
	}

	function load() {
		frappe.call({ method: API + ".get_stone_adjust_history", freeze: false,
			args: { period: S.period, status: S.status || null } })
			.then((r) => { S.data = r.message || null; paint(); });
	}
	root.on("click", ".ah-pill", function () {
		root.find(".ah-pill").removeClass("on"); this.classList.add("on");
		S.period = this.dataset.p; load();
	});
	root.on("click", ".ah-kind", function () {
		root.find(".ah-kind").removeClass("on"); this.classList.add("on");
		S.status = this.dataset.k; load();
	});
	root.on("input", ".ah-q", function () { S.q = this.value; paint(); });
	// the entry it actually wrote — the ledger is the last word
	root.on("click", ".ah-sr", function () {
		frappe.set_route("Form", "Stock Reconciliation", $(this).data("sr"));
	});

	page.add_inner_button(__("Stone Adjustment"), () => frappe.set_route("stone-adjustment"));
	page.set_primary_action(__("Refresh"), () => load(), "refresh");
	frappe.pages["stone-adjustment-history"].on_page_show = load;
	load();
};
