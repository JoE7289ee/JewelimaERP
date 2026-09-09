// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Lot Selection (Stones > Stone Lots) — the sieve table.
//
// The parcel is on the scale. First the ACTUAL weight, because that is the
// number everything else is measured against: the provider's claim is only a
// claim until we weigh it. Then the selection, sieve by sieve, as the sorting
// goes. The REJECTION is never typed — it is what is left of the actual once
// the selection is off it, and it updates as you type, so the desk can see the
// parcel closing out line by line.
//
// Nothing here is stock. A rejected stone was never ours; it goes back to the
// provider with the parcel.
// Route: /app/lot-selection

frappe.pages["lot-selection"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Lot Selection"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const root = $(page.main);
	let CTX = null, LOT = null;
	const SEL = {};                 // sieve -> carats typed, the page's own state

	const ct = (v) => flt(v).toFixed(3);

	root.append(`
		<style>
		#page-lot-selection .container{max-width:100%;}
		.ls-top{display:flex;gap:14px;align-items:end;margin-bottom:14px;flex-wrap:wrap;}
		.ls-top .control-label{font-size:11px;color:var(--text-muted);}
		.ls-top .help-box{display:none !important;}
		.ls-pick{min-width:260px;}

		.ls-head{border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);
			padding:13px 16px;margin-bottom:14px;display:flex;gap:22px;flex-wrap:wrap;align-items:center;}
		.ls-head .nm{font-size:17px;font-weight:800;}
		.ls-head .meta{font-size:12px;color:var(--text-muted);}
		.ls-tag{font-size:10px;font-weight:800;letter-spacing:.05em;border-radius:9px;padding:2px 9px;text-transform:uppercase;}
		.ls-tag.open{background:rgba(184,134,11,.18);color:#8a6508;}
		.ls-tag.selected{background:rgba(29,122,51,.16);color:#1d7a33;}
		.ls-tag.returned{background:rgba(31,97,141,.16);color:#1f618d;}
		.ls-tag.cancelled{background:rgba(127,140,141,.16);color:var(--text-muted);}
		[data-theme="dark"] .ls-tag.open{color:#e8b84a;}
		[data-theme="dark"] .ls-tag.selected{color:#7fc98f;}

		.ls-kpis{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;}
		.ls-kpi{flex:1 1 160px;border:1px solid var(--border-color);border-radius:12px;
			padding:11px 15px;background:var(--fg-color);}
		.ls-kpi .k{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);}
		.ls-kpi .v{font-size:24px;font-weight:800;line-height:1.2;font-variant-numeric:tabular-nums;}
		.ls-kpi.sel{border-left:3px solid #1d7a33;} .ls-kpi.sel .v{color:#1d7a33;}
		.ls-kpi.rej{border-left:3px solid #b02a2a;} .ls-kpi.rej .v{color:#b02a2a;}
		.ls-kpi .sub{font-size:11px;color:var(--text-muted);margin-top:2px;}
		[data-theme="dark"] .ls-kpi.sel .v{color:#7fc98f;}
		[data-theme="dark"] .ls-kpi.rej .v{color:#e08a8a;}
		.ls-over .v{color:#b02a2a !important;}

		.ls-box{border:1px solid var(--border-color);border-radius:11px;overflow:auto;
			max-height:calc(100vh - 430px);}
		table.ls-t{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;background:var(--fg-color);}
		table.ls-t th{position:sticky;top:0;background:var(--control-bg,var(--fg-color));
			border-bottom:2px solid var(--gray-400,#aeb6bf);padding:7px 9px;text-align:left;font-weight:700;}
		table.ls-t td{border-bottom:1px solid var(--border-color);padding:4px 9px;}
		table.ls-t td.num,table.ls-t th.num{text-align:right;font-variant-numeric:tabular-nums;}
		table.ls-t tr.has td{background:rgba(29,122,51,.06);}
		table.ls-t input.ls-in{display:inline-block;width:110px;text-align:right;-moz-appearance:textfield;}
		.ls-in::-webkit-inner-spin-button,.ls-in::-webkit-outer-spin-button{-webkit-appearance:none;margin:0;}
		.ls-mm{color:var(--text-muted);font-size:12px;}

		.ls-actions{margin-top:14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
		.ls-save{background:#1d7a33;border:1px solid #1d7a33;color:#fff;font-weight:700;
			border-radius:8px;padding:9px 22px;font-size:13px;cursor:pointer;}
		.ls-save[disabled]{opacity:.45;cursor:not-allowed;}
		.ls-note{font-size:12px;color:var(--text-muted);}
		.ls-empty{padding:34px;text-align:center;color:var(--text-muted);font-size:13px;}
		</style>
		<div class="ls-top">
			<div class="ls-pick"></div>
			<div class="ls-actual"></div>
			<div class="ls-ret"></div>
		</div>
		<div class="ls-body"></div>
	`);

	const mk = (sel, df) => {
		const c = frappe.ui.form.make_control({ df, parent: root.find(sel).get(0), render_input: true });
		c.refresh();
		return c;
	};
	const F = {};
	F.pick = mk(".ls-pick", { fieldtype: "Link", label: __("Lot"), fieldname: "lot", options: "Stone Lot",
		get_query: () => ({ filters: { status: ["!=", "Cancelled"] } }),
		change: () => {
			const v = F.pick.get_value();
			if (v && (!LOT || LOT.name !== v)) open(v);
		} });
	F.actual = mk(".ls-actual", { fieldtype: "Float", label: __("Actual weight (ct)"),
		fieldname: "actual_cts", precision: 3,
		change: () => paintTotals() });
	F.ret = mk(".ls-ret", { fieldtype: "Date", label: __("Rejection returned on"), fieldname: "returned_on" });

	const selTotal = () => Object.keys(SEL).reduce((a, k) => a + flt(SEL[k]), 0);

	function paintTotals() {
		const actual = flt(F.actual.get_value());
		const sel = selTotal();
		const rej = Math.max(actual - sel, 0);
		const over = sel > actual + 0.0005;
		const claimed = LOT ? flt(LOT.claimed) : 0;
		const short = claimed && actual ? claimed - actual : 0;

		root.find(".ls-kpis").html(`
			<div class="ls-kpi"><div class="k">${__("Claimed")}</div><div class="v">${ct(claimed)}</div>
				<div class="sub">${__("what the provider said")}</div></div>
			<div class="ls-kpi"><div class="k">${__("Actual")}</div><div class="v">${ct(actual)}</div>
				<div class="sub">${short > 0.0005
					? `<span style="color:#b02a2a;">${__("{0} ct lighter", [ct(short)])}</span>`
					: (actual ? __("on our scale") : __("not weighed yet"))}</div></div>
			<div class="ls-kpi sel"><div class="k">${__("Selected")}</div><div class="v">${ct(sel)}</div>
				<div class="sub">${__("{0} sieve(s)", [Object.keys(SEL).filter((k) => flt(SEL[k]) > 0).length])}</div></div>
			<div class="ls-kpi rej ${over ? "ls-over" : ""}"><div class="k">${__("Rejection")}</div>
				<div class="v">${over ? __("over") : ct(rej)}</div>
				<div class="sub">${over
					? `<span style="color:#b02a2a;">${__("selected more than came in")}</span>`
					: __("goes back to the provider")}</div></div>`);

		root.find(".ls-save").prop("disabled", !LOT || over);
	}

	function paint() {
		if (!LOT) {
			root.find(".ls-body").html(`<div class="ls-empty">${
				__("Pick a lot above — or book one in on Stone Lots.")}</div>`);
			return;
		}
		const st = (LOT.status || "Open").toLowerCase();
		root.find(".ls-body").html(`
			<div class="ls-head">
				<span class="nm">${esc(LOT.name)}</span>
				<span class="ls-tag ${st}">${esc(LOT.status)}</span>
				<span class="meta">${esc(LOT.supplier)} · ${__("received")} ${esc(LOT.received_on)}${
					LOT.quality ? " · " + esc(LOT.quality) : ""}${
					LOT.owner_label ? " · " + __("booked by") + " " + esc(LOT.owner_label) : ""}</span>
			</div>
			<div class="ls-kpis"></div>
			<div class="ls-box"><table class="ls-t">
				<thead><tr><th>${__("Sieve")}</th><th>${__("MM")}</th>
					<th class="num">${__("Selected (ct)")}</th></tr></thead>
				<tbody>${(CTX.sieves || []).map((s) => `
					<tr data-sv="${esc(s.sieve_size)}">
						<td><b>${esc(s.sieve_size)}</b></td>
						<td class="ls-mm">${s.mm_size ? flt(s.mm_size).toFixed(2) : ""}</td>
						<td class="num"><input type="number" step="0.001" min="0"
							class="form-control input-xs ls-in" data-sv="${esc(s.sieve_size)}"
							value="${SEL[s.sieve_size] != null ? SEL[s.sieve_size] : ""}"></td>
					</tr>`).join("")}</tbody>
			</table></div>
			<div class="ls-actions">
				<button class="ls-save">${__("SAVE SELECTION")}</button>
				<span class="ls-note">${
					__("The rejection is worked out for you — it is the actual weight less what you keep.")}</span>
			</div>`);
		root.find(".ls-t tr").each(function () {
			$(this).toggleClass("has", flt(SEL[$(this).data("sv")]) > 0);
		});
		paintTotals();
	}

	root.on("input", ".ls-in", function () {
		const sv = $(this).data("sv");
		const v = flt(this.value);
		if (v > 0) SEL[sv] = v;
		else delete SEL[sv];
		$(this).closest("tr").toggleClass("has", v > 0);
		paintTotals();
	});

	root.on("click", ".ls-save", function () {
		if (!LOT) return;
		const rows = Object.keys(SEL).map((sieve) => ({ sieve, selected: flt(SEL[sieve]) }))
			.filter((r) => r.selected > 0);
		frappe.dom.freeze(__("Saving…"));
		frappe.call({ method: API + ".save_stone_lot_selection", args: {
			name: LOT.name,
			actual_cts: flt(F.actual.get_value()),
			rows: JSON.stringify(rows),
			returned_on: F.ret.get_value() || "",
		} }).then((r) => {
			frappe.dom.unfreeze();
			LOT = r.message || LOT;
			frappe.show_alert({ indicator: "green", message:
				__("{0} saved — {1} ct selected, {2} ct back to {3}.",
					[LOT.name, ct(LOT.selected), ct(LOT.rejected), LOT.supplier]) }, 7);
			paint();
		}).catch(() => frappe.dom.unfreeze());
	});

	function open(name) {
		frappe.call({ method: API + ".get_stone_lot", args: { name }, freeze: false }).then((r) => {
			LOT = r.message || null;
			Object.keys(SEL).forEach((k) => delete SEL[k]);
			(LOT && LOT.items || []).forEach((i) => { SEL[i.sieve] = i.selected; });
			F.actual.set_value(LOT ? LOT.actual : 0);
			F.ret.set_value(LOT && LOT.returned_on ? LOT.returned_on : "");
			if (LOT && F.pick.get_value() !== LOT.name) F.pick.set_value(LOT.name);
			paint();
		});
	}

	frappe.call({ method: API + ".get_stone_lot_context" }).then((r) => {
		CTX = r.message || {};
		paint();
		// /app/lot-selection/LOT-SALONI-00001 opens straight onto that lot
		const route = frappe.get_route();
		if (route && route.length > 1 && route[1]) open(route[1]);
	});

	page.set_secondary_action(__("Stone Lots"), () => frappe.set_route("stone-lots"), "list");
	this.page = page;
};
