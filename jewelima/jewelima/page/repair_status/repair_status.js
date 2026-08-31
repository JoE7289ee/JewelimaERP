// Repair Status (REPAIR > Repair Status) — every batch as a card, the same card
// the intake screen shows when a batch is taken in: what came in, from whom, and
// what each piece is. A billed batch turns blue and carries its charge.
//
// Print gives the cards on paper, which is what gets handed across with the work.
// Route: /app/repair-status
frappe.pages["repair-status"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Repair Status"), single_column: true });
	const API = "jewelima.jewelima.repair_api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const S = { rows: [], parties: [], party: "", state: "all", q: "" };

	$(page.main).append(`
		<style>
		#page-repair-status .container{max-width:100%;}
		.rs-wrap{max-width:1180px;}
		.rs-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px;}
		.rs-pill{border:1px solid var(--border-color);background:var(--fg-color);color:var(--text-muted);
			border-radius:999px;padding:5px 13px;font-size:11.5px;cursor:pointer;font-weight:600;}
		.rs-pill.on{background:#1f618d;border-color:#1f618d;color:#fff;}
		.rs-sel,.rs-q{border:1px solid var(--border-color);border-radius:8px;height:31px;padding:2px 11px;
			font-size:12.5px;background:var(--fg-color);color:var(--text-color);}
		.rs-q{width:200px;}
		.rs-tiles{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;}
		.rs-tile{border:1px solid var(--border-color);border-radius:11px;background:var(--fg-color);
			padding:9px 16px;min-width:106px;}
		.rs-tile .k{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);}
		.rs-tile .v{font-size:19px;font-weight:800;font-variant-numeric:tabular-nums;}

		/* the card from the intake screen, kept: green while it is with us,
		   blue once it has been billed and gone back */
		.rs-card{border:1px solid #bfe3c6;background:#eaf6ec;color:#1d7a33;border-radius:11px;
			padding:12px 15px;margin-bottom:12px;}
		.rs-card.billed{border-color:#b9d0e6;background:#e9f0f7;color:#1f618d;}
		.rs-card .top{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;}
		.rs-card b.id{font-size:15px;}
		.rs-card .meta{font-size:12px;}
		.rs-card .tag{margin-left:auto;font-size:10.5px;font-weight:800;text-transform:uppercase;
			letter-spacing:.05em;padding:2px 9px;border-radius:999px;background:rgba(255,255,255,.65);}
		.rs-card table{width:100%;margin-top:8px;font-size:12px;color:var(--text-color);}
		.rs-card th{text-align:left;font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;
			padding:3px 6px;color:#4f7a58;border-bottom:1px solid #cfe6d4;}
		.rs-card.billed th{color:#4a6b8a;border-bottom-color:#cddcea;}
		.rs-card td{padding:3px 6px;border-bottom:1px solid #cfe6d4;}
		.rs-card.billed td{border-bottom-color:#cddcea;}
		.rs-card .note{margin-top:6px;font-size:11.5px;font-style:italic;}
		.rs-none{padding:44px;text-align:center;color:var(--text-muted);}
		@media print {
			.rs-bar, .rs-tiles, .page-head, .navbar, .page-actions { display:none !important; }
			.rs-card { break-inside:avoid; page-break-inside:avoid; }
		}
		</style>
		<div class="rs-wrap">
			<div class="rs-bar">
				<span class="rs-pill on" data-s="all">${__("All")}</span>
				<span class="rs-pill" data-s="open">${__("With us")}</span>
				<span class="rs-pill" data-s="billed">${__("Billed")}</span>
				<select class="rs-sel rs-party"></select>
				<input class="rs-q" placeholder="${__("Filter repair, design or work")}">
			</div>
			<div class="rs-tiles"></div>
			<div class="rs-body"></div>
		</div>`);
	const root = $(page.main);

	function visible() {
		const q = S.q.trim().toLowerCase();
		return S.rows.filter((r) => !q
			|| r.name.toLowerCase().includes(q)
			|| (r.party || "").toLowerCase().includes(q)
			|| (r.items || []).some((i) =>
				(i.design_type || "").toLowerCase().includes(q)
				|| (i.repair || "").toLowerCase().includes(q)
				|| (i.repair_type || "").toLowerCase().includes(q)
				|| (i.work_types || []).join(" ").toLowerCase().includes(q)));
	}

	function paint() {
		const rows = visible();
		const t = { batches: rows.length,
			pieces: rows.reduce((a, r) => a + r.total_qty, 0),
			weight: rows.reduce((a, r) => a + flt(r.total_weight), 0),
			open: rows.filter((r) => !r.bill).length };
		root.find(".rs-tiles").html(`
			<div class="rs-tile"><div class="k">${__("Batches")}</div><div class="v">${t.batches}</div></div>
			<div class="rs-tile"><div class="k">${__("Pieces")}</div><div class="v">${t.pieces}</div></div>
			<div class="rs-tile"><div class="k">${__("Weight in")}</div><div class="v">${t.weight.toFixed(3)}<span style="font-size:11px;"> g</span></div></div>
			<div class="rs-tile"><div class="k">${__("Still with us")}</div><div class="v">${t.open}</div></div>`);

		root.find(".rs-body").html(rows.length ? rows.map((r) => `
			<div class="rs-card ${r.bill ? "billed" : ""}">
				<div class="top">
					<b class="id">${esc(r.name)}</b>
					<span class="meta">${__("taken in from")} <b>${esc(r.party)}</b>
						· ${esc(r.received_at)} · ${r.total_rows} ${__("line(s)")}
						· ${r.total_qty} ${__("piece(s)")}${r.total_weight
							? " · " + flt(r.total_weight).toFixed(3) + " g" : ""}</span>
					<span class="tag">${r.bill
						? __("billed {0}", [esc(r.billed_at)])
						: __("with us")}</span>
				</div>
				<table><thead><tr>
					<th>${__("Repair")}</th><th>${__("Design Type")}</th><th>${__("Qty")}</th>
					<th>${__("Weight")}</th><th>${__("Type of Work")}</th><th>${__("Type")}</th>
					<th>${__("Narration")}</th>
				</tr></thead><tbody>${(r.items || []).map((i) => `
					<tr><td><b>${esc(i.repair)}</b></td><td>${esc(i.design_type)}</td>
					<td>${i.qty}</td>
					<td>${i.weight ? flt(i.weight).toFixed(3) + " g" : "—"}</td>
					<td>${esc((i.work_types || []).join(", ") || "—")}</td>
					<td>${esc(i.repair_type || "—")}</td>
					<td>${esc(i.narration || "")}</td></tr>`).join("")}</tbody></table>
				${r.narration ? `<div class="note">${esc(r.narration)}</div>` : ""}
				${r.bill ? `<div class="note">${__("Bill {0} · {1} g metal added · {2} charged",
					[esc(r.bill), flt(r.metal_added).toFixed(3),
					 format_currency(r.charges)])}</div>` : ""}
			</div>`).join("") : `<div class="rs-none">${__("Nothing matches.")}</div>`);
	}

	function load() {
		frappe.call({ method: API + ".get_repair_status", freeze: false,
			args: { party: S.party || null, state: S.state } }).then((r) => {
			const m = r.message || {};
			S.rows = m.rows || [];
			if (!S.parties.length) {
				S.parties = m.parties || [];
				root.find(".rs-party").html(`<option value="">${__("Every party")}</option>`
					+ S.parties.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join(""));
			}
			paint();
		});
	}

	root.on("click", ".rs-pill", function () {
		root.find(".rs-pill").removeClass("on"); this.classList.add("on");
		S.state = this.dataset.s; load();
	});
	root.on("change", ".rs-party", function () { S.party = this.value; load(); });
	root.on("input", ".rs-q", function () { S.q = this.value; paint(); });

	page.set_primary_action(__("Print"), () => window.print(), "printer");
	page.add_inner_button(__("New Repair Order"), () => frappe.set_route("new-repair-order"));
	page.add_inner_button(__("Billing"), () => frappe.set_route("repair-billing"));
	frappe.pages["repair-status"].on_page_show = load;
};
