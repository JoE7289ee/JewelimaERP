// Repair Billing (REPAIR > Billing) — the batch weighed out and priced.
//
// The same pieces that came in, each with the weight it arrived at and the
// weight it leaves at. The difference is metal added: a soldered piece comes
// back heavier and that gold belongs on the bill, so it is totalled as its own
// figure rather than buried in the weights.
//
// Work is priced by TYPE on the right, not piece by piece — five solderings is
// one line at a rate, because that is how the rate is agreed.
// Route: /app/repair-billing
frappe.pages["repair-billing"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Repair Billing"), single_column: true });
	const API = "jewelima.jewelima.repair_api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const cint = (v) => parseInt(v, 10) || 0;
	const g3 = (v) => flt(v).toFixed(3);
	const S = { list: [], bill: null };

	$(page.main).append(`
		<style>
		#page-repair-billing .container{max-width:100%;}
		.rb-wrap{max-width:100%;}
		.rb-pick{display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin-bottom:12px;}
		.rb-sel{min-width:340px;border:1px solid var(--border-color);border-radius:8px;height:33px;
			padding:2px 11px;font-size:13px;background:var(--fg-color);color:var(--text-color);}
		.rb-tiles{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;}
		.rb-tile{border:1px solid var(--border-color);border-radius:11px;background:var(--fg-color);
			padding:9px 16px;min-width:120px;}
		.rb-tile .k{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);}
		.rb-tile .v{font-size:19px;font-weight:800;font-variant-numeric:tabular-nums;}
		.rb-tile.add .v{color:#1d7a33;} .rb-tile.less .v{color:#b02a2a;}
		.rb-tile.money .v{color:#1f618d;}

		.rb-cols{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;}
		.rb-main{flex:1 1 640px;min-width:520px;}
		.rb-side{flex:0 0 330px;}
		.rb-card{border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);
			overflow:hidden;margin-bottom:12px;}
		.rb-h{padding:10px 14px;border-bottom:1px solid var(--border-color);background:var(--control-bg);
			font-size:11.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--text-muted);}
		table.rb-t{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.rb-t th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em;
			color:var(--text-muted);padding:7px 10px;font-weight:700;border-bottom:1px solid var(--border-color);}
		table.rb-t td{padding:5px 10px;border-bottom:1px solid var(--border-color);}
		table.rb-t tr:last-child td{border-bottom:none;}
		table.rb-t td.num{text-align:right;font-variant-numeric:tabular-nums;}
		table.rb-t input{width:100%;box-sizing:border-box;border:1px solid var(--border-color);
			border-radius:7px;padding:5px 9px;font-size:12.5px;text-align:right;
			background:var(--fg-color);color:var(--text-color);font-variant-numeric:tabular-nums;}
		.rb-added{font-weight:700;} .rb-added.up{color:#1d7a33;} .rb-added.down{color:#b02a2a;}
		.rb-work{font-size:11px;color:var(--text-muted);}
		.rb-none{padding:40px;text-align:center;color:var(--text-muted);}
		.rb-foot{padding:9px 14px;border-top:1px solid var(--border-color);display:flex;
			justify-content:space-between;font-size:13px;font-weight:800;}
		.rb-note{width:100%;box-sizing:border-box;border:1px solid var(--border-color);border-radius:8px;
			padding:8px 11px;font-size:13px;background:var(--fg-color);color:var(--text-color);}
		</style>
		<div class="rb-wrap">
			<div class="rb-pick">
				<select class="rb-sel"></select>
				<label style="font-size:12px;color:var(--text-muted);">
					<input type="checkbox" class="rb-showall"> ${__("include billed")}</label>
				<span class="rb-who" style="font-size:12px;color:var(--text-muted);"></span>
			</div>
			<div class="rb-tiles"></div>
			<div class="rb-body"></div>
		</div>`);
	const root = $(page.main);

	function loadList() {
		const all = root.find(".rb-showall").is(":checked") ? 0 : 1;
		return frappe.call({ method: API + ".list_billable_repairs", freeze: false,
			args: { unbilled_only: all } }).then((r) => {
			S.list = r.message || [];
			root.find(".rb-sel").html(`<option value="">${__("Pick a repair to bill…")}</option>`
				+ S.list.map((o) => `<option value="${esc(o.name)}">${esc(o.name)} — ${esc(o.party)}`
					+ ` · ${o.total_qty} ${__("pc")} · ${g3(o.total_weight)} g`
					+ `${o.billed ? " · " + __("billed") : ""}</option>`).join(""));
		});
	}

	function open(name) {
		if (!name) { S.bill = null; paint(); return; }
		frappe.call({ method: API + ".get_repair_for_billing", args: { repair_order: name } })
			.then((r) => { S.bill = r.message || null; paint(); });
	}

	function totals() {
		const b = S.bill || { items: [], charges: [] };
		const win = b.items.reduce((a, i) => a + flt(i.weight_in), 0);
		const wout = b.items.reduce((a, i) => a + flt(i.weight_out), 0);
		// only a piece actually weighed out has a difference to speak of
		const added = b.items.reduce((a, i) =>
			a + (flt(i.weight_out) ? flt(i.weight_out) - flt(i.weight_in) : 0), 0);
		const money = b.charges.reduce((a, c) => a + cint(c.pieces) * flt(c.rate), 0);
		return { win, wout, added, money };
	}

	function paintTotals() {
		const t = totals();
		root.find(".rb-tiles").html(!S.bill ? "" : `
			<div class="rb-tile"><div class="k">${__("Weight in")}</div><div class="v">${g3(t.win)}<span style="font-size:11px;"> g</span></div></div>
			<div class="rb-tile"><div class="k">${__("Weight out")}</div><div class="v">${g3(t.wout)}<span style="font-size:11px;"> g</span></div></div>
			<div class="rb-tile ${t.added >= 0 ? "add" : "less"}"><div class="k">${__("Metal added")}</div>
				<div class="v">${t.added >= 0 ? "+" : ""}${g3(t.added)}<span style="font-size:11px;"> g</span></div></div>
			<div class="rb-tile money"><div class="k">${__("Charges")}</div>
				<div class="v">${format_currency(t.money)}</div></div>`);
		root.find(".rb-charged").text(format_currency(t.money));
	}

	function paint() {
		paintTotals();
		if (!S.bill) {
			root.find(".rb-body").html(`<div class="rb-card"><div class="rb-none">${
				__("Pick a repair above to weigh it out and price it.")}</div></div>`);
			page.clear_primary_action();
			return;
		}
		const b = S.bill;
		root.find(".rb-who").html(__("<b>{0}</b> · taken in {1}", [esc(b.party), esc(b.received_at)])
			+ (b.bill ? " · " + __("already billed as {0}", [esc(b.bill)]) : ""));

		root.find(".rb-body").html(`
			<div class="rb-cols">
				<div class="rb-main">
					<div class="rb-card">
						<div class="rb-h">${__("The pieces — weigh each one out")}</div>
						<table class="rb-t"><thead><tr>
							<th>${__("Repair")}</th><th>${__("Design Type")}</th>
							<th class="num">${__("Qty")}</th>
							<th class="num">${__("In (g)")}</th>
							<th class="num" style="width:110px;">${__("Out (g)")}</th>
							<th class="num">${__("Added (g)")}</th>
						</tr></thead><tbody>${b.items.map((i, k) => `
							<tr data-i="${k}">
								<td><b>${esc(i.repair)}</b>
									<div class="rb-work">${esc((i.work_types || []).join(", ") || "—")}${
										i.repair_type ? " · " + esc(i.repair_type) : ""}</div></td>
								<td>${esc(i.design_type)}</td>
								<td class="num">${i.qty}</td>
								<td class="num">${g3(i.weight_in)}</td>
								<td class="num"><input class="rb-out" type="number" min="0" step="0.001"
									value="${i.weight_out || ""}"></td>
								<td class="num rb-cell"></td>
							</tr>`).join("")}</tbody></table>
					</div>
					<div class="rb-card">
						<div class="rb-h">${__("Note")}</div>
						<div style="padding:10px 14px;">
							<input class="rb-note" value="${esc(b.narration || "")}"
								placeholder="${__("anything to say on this bill")}"></div>
					</div>
				</div>
				<div class="rb-side">
					<div class="rb-card">
						<div class="rb-h">${__("Work on this batch")}</div>
						${b.charges.length ? `<table class="rb-t"><thead><tr>
							<th>${__("Type of Work")}</th><th class="num">${__("Pcs")}</th>
							<th class="num" style="width:92px;">${__("Rate")}</th>
							<th class="num">${__("Amount")}</th>
						</tr></thead><tbody>${b.charges.map((c, k) => `
							<tr data-c="${k}">
								<td>${esc(c.work_type)}</td>
								<td class="num">${c.pieces}</td>
								<td class="num"><input class="rb-rate" type="number" min="0" step="0.01"
									value="${c.rate || ""}"></td>
								<td class="num rb-amt"></td>
							</tr>`).join("")}</tbody></table>
						<div class="rb-foot"><span>${__("Total")}</span><span class="rb-charged"></span></div>`
						: `<div class="rb-none">${__("No types of work were set on this batch.")}</div>`}
					</div>
				</div>
			</div>`);
		paintRowNumbers();
		page.set_primary_action(b.bill ? __("Update bill") : __("Bill it"), save, "check");
	}

	// the derived numbers, redrawn as the weights and rates are typed
	function paintRowNumbers() {
		const b = S.bill;
		b.items.forEach((i, k) => {
			const has = flt(i.weight_out) > 0;
			const d = has ? flt(i.weight_out) - flt(i.weight_in) : 0;
			root.find(`tr[data-i="${k}"] .rb-cell`)
				.attr("class", "num rb-cell rb-added " + (has ? (d >= 0 ? "up" : "down") : ""))
				.text(has ? (d >= 0 ? "+" : "") + g3(d) : "—");
		});
		b.charges.forEach((c, k) => {
			root.find(`tr[data-c="${k}"] .rb-amt`).text(format_currency(cint(c.pieces) * flt(c.rate)));
		});
		paintTotals();
	}

	root.on("change", ".rb-sel", function () { open(this.value); });
	root.on("change", ".rb-showall", () => loadList().then(() => { S.bill = null; paint(); }));
	root.on("input", ".rb-out", function () {
		S.bill.items[cint($(this).closest("tr").data("i"))].weight_out = this.value;
		paintRowNumbers();
	});
	root.on("input", ".rb-rate", function () {
		S.bill.charges[cint($(this).closest("tr").data("c"))].rate = this.value;
		paintRowNumbers();
	});
	root.on("input", ".rb-note", function () { S.bill.narration = this.value; });

	function save() {
		const b = S.bill;
		if (!b) return;
		frappe.dom.freeze(__("Saving the bill…"));
		frappe.call({ method: API + ".save_repair_bill", args: { payload: {
			repair_order: b.repair_order,
			narration: b.narration || "",
			items: b.items.map((i) => ({ repair: i.repair, weight_out: flt(i.weight_out) })),
			charges: b.charges.map((c) => ({ work_type: c.work_type, pieces: c.pieces, rate: flt(c.rate) })),
		} } }).then((r) => {
			const m = r.message || {};
			frappe.msgprint({ title: __("Billed"), indicator: "green",
				message: __("<b>{0}</b> — {1} g metal added, {2} charged.",
					[esc(m.name), g3(m.total_metal_added), format_currency(m.total_charges)]) });
			loadList().then(() => open(b.repair_order));
		}).always(() => frappe.dom.unfreeze());
	}

	page.add_inner_button(__("Status"), () => frappe.set_route("repair-status"));
	page.add_inner_button(__("New Repair Order"), () => frappe.set_route("new-repair-order"));
	frappe.pages["repair-billing"].on_page_show = () => loadList().then(paint);
};
