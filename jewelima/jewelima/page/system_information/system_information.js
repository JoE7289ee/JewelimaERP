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
		<div class="syi-note">${__("Each type numbers its own series (RING → JR-1, JR-2 …); provider pieces add a letter (SAMSA → JR-S-1). Numbers never reuse.")}</div>
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

			${(m.provider_pieces || []).length ? `
			<div class="syi-sec" style="margin-top:22px;">${__("Provider pieces in the bank")}</div>
			<table class="syi-t"><thead><tr>
				<th>${__("Code")}</th><th>${__("Provider")}</th><th>${__("Design Type")}</th>
				<th>${__("GW (g)")}</th><th>${__("DW (ct)")}</th><th>${__("Status")}</th><th>${__("Added")}</th>
			</tr></thead><tbody>
			${m.provider_pieces.map((x) => `<tr>
				<td class="c">${esc(x.design_no || x.name)}</td>
				<td>${esc(x.provider)}</td>
				<td>${esc(x.design_type || "")}</td>
				<td>${x.gross_weight ? x.gross_weight.toFixed(3) : "—"}</td>
				<td>${x.diamond_weight ? x.diamond_weight.toFixed(3) : "—"}</td>
				<td>${esc(x.status || "")}</td>
				<td>${frappe.datetime.str_to_user(x.creation.split(" ")[0])}</td>
			</tr>`).join("")}</tbody></table>` : ""}

			${(m.providers || []).length ? `
			<div class="syi-sec" style="margin-top:22px;">${__("Providers")}</div>
			<table class="syi-t" style="max-width:420px;"><thead><tr>
				<th>${__("Provider")}</th><th>${__("Letter")}</th><th>${__("Pieces now")}</th>
			</tr></thead><tbody>
			${m.providers.map((p) => `<tr>
				<td><b>${esc(p.provider)}</b></td>
				<td class="c">${esc(p.code)}</td>
				<td>${p.pieces}</td>
			</tr>`).join("")}</tbody></table>` : ""}`);
	});
};
