// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Hallmark Out (Delivery > Hallmarking) — the batches away at the centres,
// batch level only: batch · days out · pieces split by design type · weights.
// COLLECT brings the WHOLE batch back (stock At Certification -> Finished
// Goods, pieces In Stock) and parks it as Collected — NOT confirmed. The HUIDs
// are stamped piece by piece on Confirm HUID.
// Route: /app/hallmark-out

frappe.pages["hallmark-out"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Hallmark Out", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;

	$(page.main).append(`
		<style>
		.ho-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:16px;}
		.ho-card{border:1px solid var(--border-color);border-left:5px solid #b35a00;border-radius:11px;
			background:var(--fg-color);padding:14px 18px;}
		.ho-card .nm{font-size:17px;font-weight:800;}
		.ho-card .meta{font-size:12px;color:var(--text-muted);margin:4px 0 10px;}
		.ho-days{font-size:10.5px;font-weight:800;border-radius:10px;padding:1px 8px;background:#b35a00;color:#fff;}
		.ho-days.old{background:#b02a2a;}
		.ho-nums{display:flex;gap:16px;font-size:13px;margin-bottom:10px;}
		.ho-nums b{font-size:16px;}
		.ho-types{font-size:12px;color:var(--text-muted);margin-bottom:12px;}
		.ho-sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;
			color:var(--text-muted);margin:0 0 10px;}
		.ho-empty{color:var(--text-muted);padding:22px;text-align:center;}
		</style>
		<div class="ho-sec ho-head"></div>
		<div class="ho-grid ho-body"></div>
	`);
	const root = $(page.main);

	function load() {
		frappe.call({ method: API + ".get_hallmarking_out" }).then((r) => {
			const m = r.message || { batches: [], total_pieces: 0 };
			root.find(".ho-head").text(m.batches.length
				? __("{0} batch(es) out · {1} piece(s)", [m.batches.length, m.total_pieces])
				: "");
			root.find(".ho-body").html(m.batches.map((b) => `
				<div class="ho-card" data-name="${esc(b.name)}">
					<div class="nm">${esc(b.name)}
						<span class="ho-days ${b.days_out > 7 ? "old" : ""}">${b.days_out} ${__("day(s)")}</span></div>
					<div class="meta">${esc(b.center || "")} · ${__("sent")} ${esc(b.sent_on || "")}</div>
					<div class="ho-nums">
						<span><b>${b.pieces}</b> ${__("piece(s)")}</span>
						<span><b>${flt(b.gross).toFixed(3)}</b> g</span>
					</div>
					<div class="ho-types">${b.by_type.map((t) => `${esc(t.design_type)} ${t.count}`).join(" · ")}</div>
					<button class="btn btn-primary btn-sm ho-collect">${__("COLLECT the batch")}</button>
				</div>`).join("") || `<div class="ho-empty">${__("Nothing is out at a hallmarking centre.")}</div>`);
			page.set_indicator(`${m.total_pieces} ${__("out")}`, m.total_pieces ? "orange" : "gray");
		});
	}

	root.on("click", ".ho-collect", function () {
		const nm = $(this).closest(".ho-card").data("name");
		frappe.confirm(__("Collect the whole of <b>{0}</b>? Stock comes back and the pieces go In Stock — the HUIDs are stamped on Confirm HUID.", [esc(nm)]), () => {
			frappe.dom.freeze(__("Collecting…"));
			frappe.call({ method: API + ".collect_hallmarking", args: { name: nm } })
				.then((r) => {
					frappe.dom.unfreeze();
					frappe.show_alert({ message: __("{0} collected — {1} piece(s) back. Stamp the HUIDs next.",
						[nm, (r.message || {}).pieces]), indicator: "green" }, 6);
					load();
				}).catch(() => frappe.dom.unfreeze());
		});
	});

	page.set_primary_action(__("Refresh"), load, "refresh");
	frappe.pages["hallmark-out"].on_page_show = load;
	load();
};
