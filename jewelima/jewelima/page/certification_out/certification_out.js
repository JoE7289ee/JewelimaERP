// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Certification Out (Delivery) — the batches OUT at the labs, batch-level only:
// batch · days out · piece count split by design type · weights. COLLECT brings
// the WHOLE batch back (stock At Certification -> Finished Goods, bags In
// Stock) and parks it as Collected — NOT confirmed; HUID / certificate
// confirmation gets its own page. Route: /app/certification-out

frappe.pages["certification-out"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Certification Out", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;

	$(page.main).append(`
		<style>
		.co-top{font-size:13px;color:var(--text-muted);margin-bottom:14px;}
		.co-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:16px;}
		.co-card{border:1px solid var(--border-color);border-radius:9px;background:var(--fg-color);padding:14px 18px;}
		.co-card.hall{border-left:5px solid #b8860b;background:rgba(184,134,11,.10);}
		.co-card.lab{border-left:5px solid #1f618d;background:rgba(31,97,141,.10);}
		.co-head{display:flex;justify-content:space-between;align-items:baseline;}
		.co-nm{font-size:18px;font-weight:800;}
		.co-days{font-size:13px;font-weight:700;}
		.co-days.warn{color:#b35a00;}
		.co-days.late{color:#b02a2a;}
		.co-meta{font-size:12px;color:var(--text-muted);margin:3px 0 10px;}
		.co-types{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;}
		.co-type{background:var(--control-bg);border:1px solid var(--border-color);border-radius:12px;padding:2px 12px;font-size:12.5px;}
		.co-type b{margin-right:4px;}
		.co-nums{font-size:12.5px;color:var(--text-muted);margin-bottom:12px;}
		.co-collect{background:#2e7d32;border-color:#2e7d32;color:#fff;}
		.co-empty{color:var(--text-muted);padding:24px;}
		</style>
		<div class="co-top"></div>
		<div class="co-grid"></div>
	`);
	const root = $(page.main);

	function load() {
		frappe.call({ method: API + ".get_certifications_out" }).then((r) => {
			const m = r.message || { batches: [], total_pieces: 0 };
			root.find(".co-top").text(m.batches.length
				? __("{0} batch(es) out · {1} piece(s) at the labs", [m.batches.length, m.total_pieces])
				: "");
			root.find(".co-grid").html(m.batches.map((b) => `
				<div class="co-card ${b.cert_type === "HALL" || b.cert_type === "HALLMARKING" ? "hall" : "lab"}" data-name="${esc(b.name)}">
					<div class="co-head"><span class="co-nm">${esc(b.name)}</span>
						<span class="co-days ${b.days_out > 10 ? "late" : b.days_out > 5 ? "warn" : ""}">${__("{0} day(s) out", [b.days_out])}</span></div>
					<div class="co-meta">${esc(b.cert_type)}${b.center ? " · " + esc(b.center.split("-").slice(1).join("-")) : ""}
						${b.quality ? " · " + esc(b.quality) : ""} · ${__("sent")} ${esc(b.sent_on)}</div>
					<div class="co-types">${b.by_type.map((t) =>
						`<span class="co-type"><b>${t.count}</b>${esc(t.design_type)}</span>`).join("")}</div>
					<div class="co-nums">${__("{0} piece(s) · {1} g gross · {2} ct diamond", [b.pieces, b.gross, b.dmd_ct])}</div>
					<button class="btn btn-sm co-collect">${__("COLLECT — {0} piece(s) back to stock", [b.pieces])}</button>
				</div>`).join("") || `<div class="co-empty">${__("Nothing out at certification.")}</div>`);
		});
	}

	root.on("click", ".co-collect", function () {
		const nm = $(this).closest(".co-card").data("name");
		frappe.confirm(__("Collect <b>{0}</b>? Count the packet first — every piece returns to Finished Goods and the batch waits as COLLECTED (confirmation later).", [esc(nm)]), () => {
			frappe.dom.freeze(__("Collecting..."));
			frappe.call({ method: API + ".collect_certification", args: { name: nm } })
				.then((r) => {
					frappe.dom.unfreeze();
					frappe.show_alert({ message: __("{0} collected — {1} piece(s) back in stock.", [nm, (r.message || {}).pieces]), indicator: "green" }, 5);
					load();
				}).catch(() => frappe.dom.unfreeze());
		});
	});

	load();
};
