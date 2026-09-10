// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Stone Lots (Stones > Stone Lots) — the receiving desk.
//
// A provider sends a parcel on approval. Nothing in it is ours yet, so this
// page books only what the receiving desk can honestly know: who sent it, when
// it came, what they SAY it is, and what they SAY it weighs. The sieve table
// and the real weight belong to the selection desk, later, at the sieve table
// — asking for them here would only get a guess.
//
// The list below is the point of the page as much as the form: an open lot is
// somebody's parcel sitting in the house, and the count of them is the number
// worth watching.
// Route: /app/stone-lots

frappe.pages["stone-lots"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Stone Lots"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const root = $(page.main);
	let CTX = null, DATA = { rows: [] }, FILTER = "";

	const ct = (v) => flt(v).toFixed(3);

	root.append(`
		<style>
		#page-stone-lots .container{max-width:100%;}
		.sl-kpis{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;}
		.sl-kpi{flex:1 1 165px;border:1px solid var(--border-color);border-radius:12px;
			padding:11px 15px;background:var(--fg-color);}
		.sl-kpi .k{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);}
		.sl-kpi .v{font-size:24px;font-weight:800;line-height:1.2;font-variant-numeric:tabular-nums;}
		.sl-kpi.open{border-left:3px solid #8C6A00;} .sl-kpi.open .v{color:#8C6A00;}
		.sl-kpi.rej{border-left:3px solid #b02a2a;} .sl-kpi.rej .v{color:#b02a2a;}
		[data-theme="dark"] .sl-kpi.open .v{color:#B98D10;}
		[data-theme="dark"] .sl-kpi.rej .v{color:#e08a8a;}

		.sl-new{border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);
			padding:14px 16px;margin-bottom:18px;}
		.sl-new .hd{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;
			color:var(--text-muted);margin-bottom:10px;}
		.sl-grid{display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr auto;gap:10px;align-items:end;}
		.sl-grid .control-label{font-size:11px;color:var(--text-muted);}
		.sl-grid .help-box{display:none !important;}
		@media (max-width:900px){.sl-grid{grid-template-columns:1fr 1fr;}}
		.sl-book{background:#1d7a33;border:1px solid #1d7a33;color:#fff;font-weight:700;
			border-radius:8px;padding:8px 20px;font-size:12.5px;cursor:pointer;height:32px;}
		.sl-book[disabled]{opacity:.45;cursor:not-allowed;}

		.sl-sec{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;
			color:var(--text-muted);margin:0 0 8px;}
		.sl-filters{display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;}
		.sl-f{border:1px solid var(--border-color);background:var(--fg-color);border-radius:8px;
			padding:4px 13px;font-size:12px;cursor:pointer;color:var(--text-color);}
		.sl-f.on{background:var(--btn-primary,#171717);color:#fff;border-color:var(--btn-primary,#171717);font-weight:700;}

		.sl-box{border:1px solid var(--border-color);border-radius:11px;overflow:auto;}
		table.sl-grid-t{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;background:var(--fg-color);}
		table.sl-grid-t th{position:sticky;top:0;background:var(--control-bg,var(--fg-color));
			border-bottom:2px solid var(--gray-400,#aeb6bf);padding:7px 9px;text-align:left;font-weight:700;}
		table.sl-grid-t td{border-bottom:1px solid var(--border-color);padding:6px 9px;}
		table.sl-grid-t td.num,table.sl-grid-t th.num{text-align:right;font-variant-numeric:tabular-nums;}
		table.sl-grid-t tr.clickable{cursor:pointer;}
		table.sl-grid-t tr.clickable:hover td{background:var(--control-bg);}
		.sl-tag{font-size:10px;font-weight:800;letter-spacing:.05em;border-radius:9px;padding:2px 9px;
			text-transform:uppercase;}
		.sl-tag.open{background:rgba(184,134,11,.18);color:#8a6508;}
		.sl-tag.closed{background:rgba(29,122,51,.16);color:#1d7a33;}
		.sl-tag.cancelled{background:rgba(127,140,141,.16);color:var(--text-muted);}
		[data-theme="dark"] .sl-tag.open{color:#e8b84a;}
		[data-theme="dark"] .sl-tag.closed{color:#7fc98f;}
		.sl-short{color:#b02a2a;font-weight:700;}
		.sl-empty{padding:26px;text-align:center;color:var(--text-muted);font-size:13px;}
		</style>
		<div class="sl-kpis"></div>
		<div class="sl-new">
			<div class="hd">${__("Book a parcel in")}</div>
			<div class="sl-grid">
				<div class="f-sup"></div>
				<div class="f-qual"></div>
				<div class="f-date"></div>
				<div class="f-claim"></div>
				<button class="sl-book" disabled>${__("CREATE LOT")}</button>
			</div>
		</div>
		<div class="sl-sec">${__("Lots")}</div>
		<div class="sl-filters">
			<button class="sl-f on" data-s="">${__("All")}</button>
			<button class="sl-f" data-s="Open">${__("Open")}</button>
			<button class="sl-f" data-s="Closed">${__("Closed")}</button>
		</div>
		<div class="sl-box"><table class="sl-grid-t"><thead></thead><tbody></tbody></table></div>
	`);

	const mk = (sel, df) => {
		const c = frappe.ui.form.make_control({ df, parent: root.find(sel).get(0), render_input: true });
		c.refresh();
		return c;
	};
	const F = {};
	F.sup = mk(".f-sup", { fieldtype: "Link", label: __("Provider"), fieldname: "supplier", options: "Supplier" });
	F.qual = mk(".f-qual", { fieldtype: "Select", label: __("Quality told"), fieldname: "quality", options: [] });
	F.date = mk(".f-date", { fieldtype: "Date", label: __("Received on"), fieldname: "received_on" });
	F.claim = mk(".f-claim", { fieldtype: "Float", label: __("Claimed (ct)"), fieldname: "claimed_cts", precision: 3 });

	// the button is the guard: a lot without a provider is not a lot
	function armBook() {
		root.find(".sl-book").prop("disabled", !(F.sup.get_value() || "").trim());
	}
	root.on("input change", ".sl-grid input, .sl-grid select", armBook);
	root.on("click", ".sl-f", function () {
		FILTER = $(this).data("s") || "";
		root.find(".sl-f").removeClass("on");
		$(this).addClass("on");
		load();
	});

	root.on("click", ".sl-book", function () {
		const supplier = (F.sup.get_value() || "").trim();
		if (!supplier) return;
		frappe.dom.freeze(__("Booking…"));
		frappe.call({ method: API + ".create_stone_lot", args: {
			supplier,
			received_on: F.date.get_value() || CTX.today,
			quality: F.qual.get_value() || "",
			claimed_cts: flt(F.claim.get_value()),
		} }).then((r) => {
			frappe.dom.unfreeze();
			const m = r.message || {};
			frappe.show_alert({ indicator: "green", message:
				__("{0} booked — {1} ct claimed{2}.", [m.name, ct(m.claimed),
					m.quality ? " · " + m.quality : ""]) }, 7);
			F.claim.set_value(0);
			load();
		}).catch(() => frappe.dom.unfreeze());
	});

	function paint() {
		const d = DATA;
		root.find(".sl-kpis").html(`
			<div class="sl-kpi open"><div class="k">${__("Open lots")}</div><div class="v">${d.open || 0}</div></div>
			<div class="sl-kpi"><div class="k">${__("Claimed, still open")}</div><div class="v">${ct(d.open_claimed)}</div></div>
			<div class="sl-kpi"><div class="k">${__("Selected")}</div><div class="v">${ct(d.selected)}</div></div>
			<div class="sl-kpi rej"><div class="k">${__("Rejected")}</div><div class="v">${ct(d.rejected)}</div></div>`);

		root.find(".sl-grid-t thead").html(`<tr>
			<th>${__("Lot")}</th><th>${__("Provider")}</th><th>${__("Received")}</th>
			<th>${__("Quality")}</th>
			<th class="num">${__("Claimed")}</th><th class="num">${__("Actual")}</th>
			<th class="num">${__("Selected")}</th><th class="num">${__("Rejected")}</th>
			<th>${__("Status")}</th></tr>`);

		const rows = d.rows || [];
		root.find(".sl-grid-t tbody").html(rows.length ? rows.map((r) => {
			const st = (r.status || "Open").toLowerCase();
			// a parcel that weighed less than claimed is the one to ask about
			const short = r.short > 0.0005
				? ` <span class="sl-short" title="${__("lighter than claimed")}">−${ct(r.short)}</span>` : "";
			return `<tr class="clickable" data-name="${esc(r.name)}">
				<td><b>${esc(r.name)}</b></td>
				<td>${esc(r.supplier)}</td>
				<td>${esc(r.received_on)}</td>
				<td>${esc(r.quality || "—")}</td>
				<td class="num">${ct(r.claimed)}</td>
				<td class="num">${r.actual ? ct(r.actual) + short : "—"}</td>
				<td class="num">${r.selected ? ct(r.selected) : "—"}</td>
				<td class="num">${r.rejected ? ct(r.rejected) : "—"}</td>
				<td><span class="sl-tag ${st}">${esc(r.status)}</span></td>
			</tr>`;
		}).join("") : `<tr><td colspan="9" class="sl-empty">${
			__("No lots here yet. Book a parcel in above.")}</td></tr>`);
	}

	// clicking a lot goes where the work is — the sieve table
	root.on("click", ".sl-grid-t tr.clickable", function () {
		frappe.set_route("lot-selection", $(this).data("name"));
	});

	function load() {
		return frappe.call({ method: API + ".get_stone_lots", freeze: false,
			args: { status: FILTER } })
			.then((r) => { DATA = r.message || DATA; paint(); });
	}

	frappe.call({ method: API + ".get_stone_lot_context" }).then((r) => {
		CTX = r.message || {};
		F.qual.df.options = [""].concat(CTX.qualities || []);
		F.qual.refresh();
		F.date.set_value(CTX.today);
		armBook();
		load();
	});

	page.set_primary_action(__("Selection desk"), () => frappe.set_route("lot-selection"), "gem");
	this.page = page;
};
