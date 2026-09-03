// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Send Hallmarking (Delivery > Hallmarking) — the second step: every PREPARED
// batch with its summary; SEND moves the stock (Finished Goods -> At
// Certification) and flips the pieces. Collecting is Hallmark Out.
// Route: /app/send-hallmarking

frappe.pages["send-hallmarking"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Send Hallmarking", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;

	$(page.main).append(`
		<style>
		.sh-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px;}
		.sh-card{border:1px solid var(--border-color);border-radius:11px;background:var(--fg-color);padding:14px 18px;}
		.sh-card .nm{font-size:17px;font-weight:800;}
		.sh-card .meta{font-size:12px;color:var(--text-muted);margin:4px 0 10px;}
		.sh-nums{display:flex;gap:16px;font-size:13px;margin-bottom:12px;}
		.sh-nums b{font-size:16px;}
		.sh-actions{display:flex;gap:8px;flex-wrap:wrap;}
		.sh-sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;
			color:var(--text-muted);margin:22px 0 10px;}
		table.sh-r{width:100%;border-collapse:collapse;font-size:12.5px;background:var(--fg-color);}
		table.sh-r td,table.sh-r th{border:1px solid var(--border-color);padding:5px 10px;text-align:left;}
		table.sh-r th{background:var(--control-bg);font-size:10px;text-transform:uppercase;color:var(--text-muted);}
		.sh-empty{color:var(--text-muted);padding:18px;}
		</style>
		<div class="sh-sec">${__("Prepared — ready to go out")}</div>
		<div class="sh-grid sh-prep"></div>
		<div class="sh-sec">${__("Recent (sent / cancelled)")}</div>
		<div class="sh-recent"></div>
	`);
	const root = $(page.main);

	function load() {
		frappe.call({ method: API + ".get_hall_preps" }).then((r) => {
			const m = r.message || { prepared: [], recent: [] };
			root.find(".sh-prep").html(m.prepared.map((p) => `
				<div class="sh-card" data-name="${esc(p.name)}">
					<div class="nm">${esc(p.name)}</div>
					<div class="meta">${esc(p.center || "")} · ${esc(p.prepared_on || "")}</div>
					<div class="sh-nums">
						<span><b>${p.pieces}</b> ${__("piece(s)")}</span>
						<span><b>${flt(p.gross).toFixed(3)}</b> g</span>
					</div>
					<div class="sh-actions">
						<button class="btn btn-primary btn-sm sh-send" style="background:#2e7d32;border-color:#2e7d32;">${__("SEND — move stock")}</button>
						<button class="btn btn-default btn-sm sh-xls">${__("Excel ⤓")}</button>
						<button class="btn btn-sm sh-cancel" style="background:#b02a2a;border-color:#b02a2a;color:#fff;">${__("Cancel")}</button>
					</div>
				</div>`).join("") || `<div class="sh-empty">${__("Nothing prepared — build a batch on the Hallmark desk.")}</div>`);
			root.find(".sh-recent").html(m.recent.length ? `<table class="sh-r"><thead><tr>
				<th>${__("Batch")}</th><th>${__("Centre")}</th><th>${__("Status")}</th>
				<th>${__("Pieces")}</th><th>${__("Sent")}</th></tr></thead>
				<tbody>${m.recent.map((p) => `<tr><td><b>${esc(p.name)}</b></td><td>${esc(p.center || "")}</td>
				<td>${esc(p.status)}</td><td>${p.pieces}</td><td>${esc(p.sent_on || "")}</td></tr>`).join("")}</tbody></table>`
				: `<div class="sh-empty">${__("Nothing yet.")}</div>`);
		});
	}

	// one click — the record stays, marked Cancelled, and its pieces are free again
	root.on("click", ".sh-cancel", function () {
		const nm = $(this).closest(".sh-card").data("name");
		frappe.call({ method: API + ".hall_prep_cancel", args: { name: nm } }).then(() => {
			frappe.show_alert({ message: __("{0} cancelled — its pieces are free again.", [nm]), indicator: "orange" }, 4);
			load();
		});
	});
	// the sheet that travels with the packet — its HUID column is blank, so it
	// comes back as the slip Confirm HUID is typed from
	root.on("click", ".sh-xls", function () {
		const nm = $(this).closest(".sh-card").data("name");
		open_url_post("/api/method/jewelima.jewelima.api.export_hallmarking_xlsx", { name: nm });
	});
	root.on("click", ".sh-send", function () {
		const nm = $(this).closest(".sh-card").data("name");
		frappe.confirm(__("Send <b>{0}</b>? Stock moves out and the batch locks.", [esc(nm)]), () => {
			frappe.dom.freeze(__("Sending…"));
			frappe.call({ method: API + ".send_hall_prep", args: { name: nm } })
				.then((r) => {
					frappe.dom.unfreeze();
					frappe.show_alert({ message: __("{0} sent — {1} piece(s) out.", [nm, (r.message || {}).count]), indicator: "green" }, 5);
					load();
				}).catch(() => frappe.dom.unfreeze());
		});
	});

	page.set_primary_action(__("Refresh"), load, "refresh");
	frappe.pages["send-hallmarking"].on_page_show = load;
	load();
};
