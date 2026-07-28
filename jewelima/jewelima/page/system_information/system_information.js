// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Setup > Information — READ-ONLY reference of the system's numbering laws.
// Today: the Design Bank series codes (RING -> JR-1, JR-2, ... / SAMSA
// provider pieces JR-S-1) with live minted counts and the next number each
// series would take. More reference blocks land here over time.
// Route: /app/system-information

frappe.pages["system-information"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Information", single_column: true });
	const esc = frappe.utils.escape_html;

	$(page.main).append(`
		<style>
		.syi-sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin:0 0 6px;}
		.syi-note{font-size:12px;color:var(--text-muted);margin:0 0 10px;max-width:760px;}
		table.syi-t{width:100%;max-width:860px;border-collapse:collapse;font-size:13px;background:var(--fg-color);}
		table.syi-t th{background:var(--control-bg);font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);padding:6px 12px;border:1px solid var(--border-color);text-align:left;}
		table.syi-t td{border:1px solid var(--border-color);padding:6px 12px;}
		table.syi-t td.c{font-family:var(--font-family-monospace, monospace);font-weight:700;}
		.syi-next{border-radius:9px;padding:1px 9px;font-size:11px;font-weight:800;background:#eaf6ec;color:#1d7a33;border:1px solid #bfe3c6;}
		</style>
		<div class="syi-sec">${__("Design Bank — series codes (auto count)")}</div>
		<div class="syi-note">${__("Every new in-house design takes the next number of its type's series (RING → JR-1, JR-2 …). Provider pieces slot a provider letter into the code (SAMSA ring → JR-S-1). Numbers NEVER reuse — retired codes stay burned. This table is live and read-only; codes are set on the Design Type master.")}</div>
		<div class="syi-body">${__("Loading…")}</div>
	`);
	const root = $(page.main);

	frappe.call({ method: "jewelima.jewelima.api.get_system_information" }).then((r) => {
		const m = r.message || {};
		root.find(".syi-body").html(`
			<table class="syi-t"><thead><tr>
				<th>${__("Design Type")}</th><th>${__("Series")}</th><th>${__("Minted")}</th>
				<th>${__("Last code")}</th><th>${__("Next code")}</th>
			</tr></thead><tbody>
			${(m.bank_codes || []).map((x) => `<tr>
				<td>${esc(x.design_type)}${x.provider ? ` <span style="color:var(--text-muted);font-size:11px;">(${esc(x.provider)})</span>` : ""}</td>
				<td class="c">${esc(x.prefix)}-…</td>
				<td>${x.minted}</td>
				<td class="c">${esc(x.last || "—")}</td>
				<td><span class="syi-next">${esc(x.next)}</span></td>
			</tr>`).join("")}</tbody></table>
			${(m.providers || []).length ? `<div class="syi-note" style="margin-top:10px;">${__("Provider letters")}: ${m.providers.map((p) => `<b>${esc(p.provider)}</b> → ${esc(p.code)}`).join(" · ")}</div>` : ""}`);
	});
};
