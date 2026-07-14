// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Usage (Reports, System Manager only) — the capacity dashboard: database size
// + fattest tables, core document counts, bags-per-day trend, users/sessions,
// and server disk. For deeper plumbing use frappe's own System Health Report
// (/app/system-health-report). Route: /app/usage

frappe.pages["usage"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Usage", single_column: true });
	const esc = frappe.utils.escape_html;

	$(page.main).append(`
		<style>
		#page-usage .container{max-width:100%;} /* whole page, even on wide monitors */
		.us-wrap{width:100%;}
		.us-tiles{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:18px;}
		.us-tile{border:1px solid var(--border-color);border-radius:10px;padding:12px 20px;background:var(--control-bg);min-width:150px;}
		.us-tile .k{font-size:10.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;}
		.us-tile .v{font-size:22px;font-weight:800;}
		.us-tile .s{font-size:11px;color:var(--text-muted);}
		.us-cols{display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap;}
		.us-panel{flex:1;min-width:300px;border:1px solid var(--border-color);border-radius:8px;background:var(--fg-color);overflow:hidden;}
		.us-panel .p-head{background:var(--control-bg);padding:8px 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);}
		.us-panel table{width:100%;border-collapse:collapse;font-size:12.5px;}
		.us-panel td{padding:4px 14px;border-top:1px solid var(--border-color);}
		.us-panel td.r{text-align:right;white-space:nowrap;}
		.us-trend{display:flex;gap:4px;align-items:flex-end;height:90px;padding:10px 14px;}
		.us-trend .bar{flex:1;background:var(--primary);border-radius:3px 3px 0 0;min-height:2px;position:relative;}
		.us-trend .bar span{position:absolute;top:-16px;left:50%;transform:translateX(-50%);font-size:10px;color:var(--text-muted);}
		.us-trend .bar i{position:absolute;bottom:-16px;left:50%;transform:translateX(-50%);font-size:9px;color:var(--text-muted);font-style:normal;white-space:nowrap;}
		.us-note{color:var(--text-muted);font-size:12px;margin-top:14px;}
		</style>
		<div class="us-wrap">
			<div class="us-tiles"></div>
			<div class="us-cols">
				<div class="us-panel"><div class="p-head">${__("Documents")}</div><div class="us-docs"></div></div>
				<div class="us-panel"><div class="p-head">${__("Heaviest Tables")}</div><div class="us-tables"></div></div>
				<div class="us-panel"><div class="p-head">${__("Users — last seen")}</div><div class="us-users"></div></div>
			</div>
			<div class="us-panel" style="margin-top:18px;"><div class="p-head">${__("Order Bags created — last 14 days")}</div><div class="us-trend"></div></div>
			<div class="us-panel" style="margin-top:18px;">
				<div class="p-head">${__("Data Retention — prune BY CHOICE")}</div>
				<div style="padding:12px 14px;font-size:12.5px;">
					<div style="color:var(--text-muted);margin-bottom:10px;">${__("Monitoring rows of CLOSED bags (Sold / Cancelled) older than the window can be deleted once their days are sealed in Day Records. Stock Ledger Entries are never touched. Preview first — nothing is deleted without typing PRUNE.")}</div>
					${__("Older than")} <input type="number" class="us-pr-months" value="3" min="1" style="width:54px;border:1px solid var(--border-color);border-radius:4px;padding:2px 6px;text-align:right;"> ${__("months")}
					<button class="btn btn-xs btn-default us-pr-preview" style="margin-left:10px;">${__("Preview")}</button>
					<div class="us-pr-out" style="margin-top:10px;"></div>
				</div>
			</div>
			<div class="us-note">${__("Deeper plumbing (workers, queues, failing jobs): open frappe's own")} <a href="/app/system-health-report">${__("System Health Report")}</a>. ${__("Full table breakdown:")} <a href="/app/query-report/Database Storage Usage By Tables">${__("Database Storage Usage")}</a>.</div>
		</div>
	`);
	const root = $(page.main);

	function load() {
		frappe.call({ method: "jewelima.jewelima.api.get_usage_report" }).then((r) => {
			const m = r.message || {};
			const tile = (k, v, s) => `<div class="us-tile"><div class="k">${k}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ""}</div>`;
			root.find(".us-tiles").html([
				tile(__("Database"), (m.db.total_mb >= 1024 ? (m.db.total_mb / 1024).toFixed(1) + " GB" : m.db.total_mb + " MB")),
				tile(__("Server Disk"), m.disk.free_gb + " GB " + __("free"), __("of {0} GB", [m.disk.total_gb])),
				tile(__("Bags on the floor"), m.docs["Order Bags on the floor"]),
				tile(__("Bags all-time"), m.docs["Order Bags (total)"]),
				tile(__("System users"), m.users.enabled),
			].join(""));
			root.find(".us-docs").html(`<table><tbody>${Object.entries(m.docs).map(([k, v]) =>
				`<tr><td>${esc(k)}</td><td class="r"><b>${Number(v).toLocaleString()}</b></td></tr>`).join("")}</tbody></table>`);
			root.find(".us-tables").html(`<table><tbody>${(m.db.tables || []).map((t) =>
				`<tr><td>${esc(t.table_name)}</td><td class="r">${Number(t.table_rows).toLocaleString()} ${__("rows")}</td><td class="r"><b>${t.mb} MB</b></td></tr>`).join("")}</tbody></table>`);
			root.find(".us-users").html(`<table><tbody>${(m.users.sessions || []).map((s) =>
				`<tr><td>${esc(s.user)}</td><td class="r">${frappe.datetime.str_to_user(s.last_seen)}</td></tr>`).join("")
				|| `<tr><td class="text-muted">${__("No live sessions.")}</td></tr>`}</tbody></table>`);
			const trend = m.trend || [];
			const max = Math.max(1, ...trend.map((t) => t.n));
			root.find(".us-trend").html(trend.length ? trend.map((t) => `
				<div class="bar" style="height:${Math.max(3, (t.n / max) * 100)}%"><span>${t.n}</span><i>${t.date.slice(5)}</i></div>`).join("")
				: `<div class="text-muted" style="padding:10px;">${__("No bags created in the last 14 days.")}</div>`);
		});
	}
	// prune: preview (dry-run) -> typed PRUNE -> execute
	root.on("click", ".us-pr-preview", () => {
		const months = cint(root.find(".us-pr-months").val()) || 3;
		frappe.call({ method: "jewelima.jewelima.api.get_prune_preview", args: { months } }).then((r) => {
			const m = r.message || {};
			const rows = Object.entries(m.kinds || {}).map(([k, v]) =>
				`<tr><td>${esc(k.replace("bench:", ""))}</td><td class="r"><b>${Number(v).toLocaleString()}</b></td></tr>`).join("");
			root.find(".us-pr-out").html(`
				<table style="font-size:12px;"><tbody>${rows || `<tr><td class="text-muted">${__("Nothing qualifies.")}</td></tr>`}</tbody></table>
				<div style="margin-top:8px;">${__("Total: {0} row(s) before {1}.", [`<b>${Number(m.total || 0).toLocaleString()}</b>`, m.cutoff])}
				${m.unsealed_days ? `<span style="color:var(--red-600,#c0392b);font-weight:700;"> ${__("{0} day(s) NOT sealed in Day Records yet — backfill first!", [m.unsealed_days])}</span>` : ""}</div>
				${m.total ? `<button class="btn btn-xs btn-danger us-pr-go" style="margin-top:8px;">${__("Delete these rows…")}</button>` : ""}`);
		});
	});
	root.on("click", ".us-pr-go", () => {
		const months = cint(root.find(".us-pr-months").val()) || 3;
		frappe.prompt(
			{ fieldname: "confirm_text", fieldtype: "Data", label: __("Type PRUNE to confirm"), reqd: 1 },
			(v) => {
				frappe.dom.freeze(__("Pruning..."));
				frappe.call({ method: "jewelima.jewelima.api.prune_execute", args: { months, confirm_text: v.confirm_text } })
					.then((r) => {
						frappe.dom.unfreeze();
						const del = (r.message || {}).deleted || {};
						frappe.msgprint({ title: __("Pruned"), indicator: "green",
							message: Object.entries(del).map(([k, n]) => `${esc(k)}: ${n}`).join("<br>") || __("Nothing deleted.") });
						root.find(".us-pr-out").empty();
						load();
					})
					.catch(() => frappe.dom.unfreeze());
			},
			__("This permanently deletes old monitoring rows"), __("Delete"));
	});

	page.add_inner_button(__("Refresh"), load);
	load();
};
