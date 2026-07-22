// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Send Certifications (Delivery) — the second step: every PREPARED batch with
// its summary; SEND moves the stock (Finished Goods -> At Certification), flips
// the bags and locks the batch. Receiving stays on Certification Out.
// Route: /app/send-certifications

frappe.pages["send-certifications"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Send Certifications", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;

	$(page.main).append(`
		<style>
		.sc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px;}
		.sc-card{border:1px solid var(--border-color);border-radius:8px;background:var(--fg-color);padding:14px 18px;}
		.sc-card .nm{font-size:17px;font-weight:800;}
		.sc-card .meta{font-size:12px;color:var(--text-muted);margin:4px 0 10px;}
		.sc-lock{font-size:10.5px;font-weight:700;border-radius:10px;padding:1px 8px;background:#1f618d;color:#fff;}
		.sc-nums{display:flex;gap:16px;font-size:13px;margin-bottom:12px;}
		.sc-nums b{font-size:16px;}
		.sc-actions{display:flex;gap:8px;}
		.sc-sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin:22px 0 10px;}
		table.sc-r{width:100%;border-collapse:collapse;font-size:12.5px;background:var(--fg-color);}
		table.sc-r td,table.sc-r th{border:1px solid var(--border-color);padding:5px 10px;text-align:left;}
		table.sc-r th{background:var(--control-bg);font-size:10px;text-transform:uppercase;color:var(--text-muted);}
		.sc-empty{color:var(--text-muted);padding:18px;}
		</style>
		<div class="sc-sec">${__("Prepared — ready to go out")}</div>
		<div class="sc-grid sc-prep"></div>
		<div class="sc-sec">${__("Recent (sent / cancelled)")}</div>
		<div class="sc-recent"></div>
	`);
	const root = $(page.main);

	function load() {
		frappe.call({ method: API + ".get_cert_preps" }).then((r) => {
			const m = r.message || { prepared: [], recent: [] };
			root.find(".sc-prep").html(m.prepared.map((p) => `
				<div class="sc-card" data-name="${esc(p.name)}">
					<div class="nm">${esc(p.name)}</div>
					<div class="meta">${esc(p.cert_type)}${p.center ? " · " + esc((p.center || "").split("-").slice(1).join("-")) : ""}
						${p.quality ? ` <span class="sc-lock">${esc(p.quality)}</span>` : ""} · ${esc(p.prepared_on || "")}</div>
					<div class="sc-nums"><span><b>${p.pieces}</b> ${__("piece(s)")}</span></div>
					<div class="sc-actions">
						<button class="btn btn-primary btn-sm sc-send" style="background:#2e7d32;border-color:#2e7d32;">${__("SEND — move stock")}</button>
						<button class="btn btn-default btn-sm sc-open">${__("Open / edit")}</button>
						<button class="btn btn-default btn-sm sc-mail">${__("Email Excel")}</button>
					</div>
				</div>`).join("") || `<div class="sc-empty">${__("Nothing prepared — build a batch on the Certification desk.")}</div>`);
			root.find(".sc-recent").html(m.recent.length ? `<table class="sc-r"><thead><tr>
				<th>${__("Batch")}</th><th>${__("Certification")}</th><th>${__("Status")}</th><th>${__("Pieces")}</th><th>${__("Sent")}</th></tr></thead>
				<tbody>${m.recent.map((p) => `<tr><td><b>${esc(p.name)}</b></td><td>${esc(p.cert_type)}</td>
				<td>${esc(p.status)}</td><td>${p.pieces}</td><td>${esc(p.sent_on || "")}</td></tr>`).join("")}</tbody></table>`
				: `<div class="sc-empty">${__("Nothing yet.")}</div>`);
		});
	}
	root.on("click", ".sc-open", function () {
		frappe.route_options = { prep: $(this).closest(".sc-card").data("name") };
		frappe.set_route("certify");
	});
	root.on("click", ".sc-mail", function () {
		const nm = $(this).closest(".sc-card").data("name");
		frappe.call({ method: API + ".get_cert_mail_defaults", args: { name: nm } }).then((r) => {
			const m = r.message || {};
			const dlg = new frappe.ui.Dialog({
				title: __("Email {0} to {1}", [nm, m.center_name || __("the center")]),
				fields: [
					{ fieldname: "recipient", fieldtype: "Data", label: __("To"), reqd: 1, default: m.recipient,
						description: m.recipient ? "" : __("No email on the center yet — set it on Delivery Masters; typing one here works for now.") },
					{ fieldname: "subject", fieldtype: "Data", label: __("Subject"), reqd: 1, default: m.subject },
					{ fieldname: "body", fieldtype: "Small Text", label: __("Message"), default: m.body },
				],
				primary_action_label: __("Send"),
				primary_action(v) {
					dlg.hide();
					frappe.dom.freeze(__("Sending..."));
					frappe.call({ method: API + ".email_cert_excel", args: { name: nm, ...v } })
						.then((rr) => {
							frappe.dom.unfreeze();
							frappe.show_alert({ message: __("Sent to {0} ({1}).", [(rr.message || {}).sent_to, (rr.message || {}).attachment]), indicator: "green" }, 5);
						}).catch(() => frappe.dom.unfreeze());
				},
			});
			dlg.show();
		});
	});
	root.on("click", ".sc-send", function () {
		const nm = $(this).closest(".sc-card").data("name");
		frappe.confirm(__("Send <b>{0}</b>? Stock moves to At Certification and the batch locks.", [esc(nm)]), () => {
			frappe.dom.freeze(__("Sending..."));
			frappe.call({ method: API + ".send_cert_prep", args: { name: nm } })
				.then((r) => {
					frappe.dom.unfreeze();
					frappe.show_alert({ message: __("{0} sent — {1} piece(s) out.", [nm, (r.message || {}).count]), indicator: "green" }, 5);
					load();
				}).catch(() => frappe.dom.unfreeze());
		});
	});
	load();
};
