// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Scrub (Stock) — the metal the benches hand back as filings.
//
// Scrub is not loss. Loss is written off to a '<bench> -LOSS' warehouse; scrub
// is still our gold, sitting in the Scrub warehouse waiting to be refined. Every
// gram a bench scrubs is a gram that stops being a write-off, which is why this
// page reads by BENCH and by PERSON — those are the two questions worth asking
// of it.
//
// The BALANCE is the warehouse's own stock and is the truth about how much is
// there. The breakdowns come from the bag ledger, which is what records who
// handed each gram over. Once weight has been transferred out to refining the
// two legitimately differ, so both are shown rather than one explaining
// the other.
// Route: /app/scrub

frappe.pages["scrub"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Scrub"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const root = $(page.main);
	let D = null, T = null;                 // board, and what may be moved where
	const M = { item: "", qty: "", target: "" };

	const g = (v) => flt(v).toFixed(3) + " g";

	root.append(`
		<style>
		#page-scrub .container{max-width:100%;}
		.sc-kpis{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px;}
		.sc-kpi{flex:1 1 170px;border:1px solid var(--border-color);border-radius:12px;
			padding:11px 15px;background:var(--fg-color);}
		.sc-kpi .k{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);}
		.sc-kpi .v{font-size:24px;font-weight:800;line-height:1.2;font-variant-numeric:tabular-nums;}
		.sc-kpi.hold{border-left:3px solid #8C6A00;} .sc-kpi.hold .v{color:#8C6A00;}
		[data-theme="dark"] .sc-kpi.hold .v{color:#B98D10;}
		.sc-sec{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;
			color:var(--text-muted);margin:22px 0 4px;padding-bottom:5px;
			border-bottom:1px solid var(--border-color);}
		.sc-note{font-size:12.5px;color:var(--text-muted);margin:0 0 11px;}
		.sc-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:16px;}
		.sc-tw{overflow-x:auto;}
		table.sc-t{width:100%;border-collapse:collapse;font-size:12.5px;background:var(--fg-color);
			border:1px solid var(--border-color);border-radius:11px;overflow:hidden;
			font-variant-numeric:tabular-nums;}
		table.sc-t th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em;
			color:var(--text-muted);padding:7px 11px;background:var(--control-bg);
			border-bottom:1px solid var(--border-color);white-space:nowrap;}
		table.sc-t td{padding:6px 11px;border-bottom:1px solid var(--border-color);}
		table.sc-t td.num,table.sc-t th.num{text-align:right;}
		.wt{font-weight:700;color:#8C6A00;}
		[data-theme="dark"] .wt{color:#B98D10;}
		/* sending it on lives HERE, on the page that shows what there is to send —
		   loss has its own screens and is deliberately not reachable from this one */
		.sc-form{border:1px solid var(--border-color);border-left:3px solid #8C6A00;
			border-radius:13px;padding:13px 16px;background:var(--fg-color);
			display:flex;gap:13px;flex-wrap:wrap;align-items:flex-end;margin-bottom:6px;}
		.sc-f label{display:block;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;
			color:var(--text-muted);margin-bottom:3px;}
		.sc-f select,.sc-f input{border:1px solid var(--border-color);border-radius:8px;height:34px;
			padding:2px 10px;font-size:13.5px;background:var(--control-bg);color:var(--text-color);
			min-width:180px;}
		.sc-f input[type=number]{text-align:right;min-width:120px;}
		.sc-go{background:#8C6A00;border:1px solid #8C6A00;color:#fff;font-weight:800;
			border-radius:9px;padding:9px 20px;font-size:13.5px;cursor:pointer;}
		.sc-go:disabled{background:var(--control-bg);border-color:var(--border-color);
			color:var(--text-muted);cursor:default;font-weight:600;}
		.sc-empty{padding:26px;text-align:center;color:var(--text-muted);font-size:13px;
			border:1px dashed var(--border-color);border-radius:12px;}
		</style>
		<div class="sc-kpis"></div>
		<div class="sc-move"></div>
		<div class="sc-body"></div>
	`);

	function tbl(head, rows) {
		return rows.length
			? `<div class="sc-tw"><table class="sc-t"><thead><tr>${head}</tr></thead>
				<tbody>${rows.join("")}</tbody></table></div>` : "";
	}

	function paint() {
		if (!D) return;
		root.find(".sc-kpis").html(`
			<div class="sc-kpi hold"><div class="k">${__("In the Scrub warehouse")}</div>
				<div class="v">${flt(D.total_held).toFixed(3)}<span style="font-size:13px;font-weight:400;color:var(--text-muted);"> g</span></div></div>
			<div class="sc-kpi"><div class="k">${__("Collected all time")}</div>
				<div class="v">${flt(D.collected).toFixed(3)}<span style="font-size:13px;font-weight:400;color:var(--text-muted);"> g</span></div></div>
			<div class="sc-kpi"><div class="k">${__("Benches scrubbing")}</div>
				<div class="v">${(D.by_bench || []).length}</div></div>
			<div class="sc-kpi"><div class="k">${__("People")}</div>
				<div class="v">${(D.by_employee || []).length}</div></div>`);

		if (!(D.recent || []).length && !flt(D.total_held)) {
			root.find(".sc-body").html(`<div class="sc-empty">${
				__("No scrub collected yet. Turn on the Scrub column when receipting on Job Work.")}</div>`);
			return;
		}

		const bench = tbl(
			`<th>${__("Bench")}</th><th class="num">${__("Scrub")}</th>
			 <th class="num">${__("Handovers")}</th><th>${__("Last")}</th>`,
			(D.by_bench || []).map((r) => `<tr><td><b>${esc(r.key)}</b></td>
				<td class="num wt">${g(r.qty)}</td><td class="num">${r.n}</td>
				<td>${esc((r.last_on || "").slice(0, 10))}</td></tr>`));

		const emp = tbl(
			`<th>${__("Who handed it in")}</th><th class="num">${__("Scrub")}</th>
			 <th class="num">${__("Handovers")}</th><th>${__("Last")}</th>`,
			(D.by_employee || []).map((r) => `<tr><td><b>${esc(r.label)}</b></td>
				<td class="num wt">${g(r.qty)}</td><td class="num">${r.n}</td>
				<td>${esc((r.last_on || "").slice(0, 10))}</td></tr>`));

		const held = tbl(`<th>${__("Item")}</th><th class="num">${__("Held")}</th>`,
			(D.held || []).map((r) => `<tr><td>${esc(r.item)}</td>
				<td class="num wt">${g(r.qty)}</td></tr>`));

		const recent = tbl(
			`<th>${__("When")}</th><th>${__("Card")}</th><th>${__("Item")}</th>
			 <th class="num">${__("Scrub")}</th><th>${__("Bench")}</th><th>${__("By")}</th>`,
			(D.recent || []).map((r) => `<tr>
				<td>${esc((r.datetime || "").slice(0, 16))}</td>
				<td><b>${esc(r.order_bag)}</b></td><td>${esc(r.item)}</td>
				<td class="num wt">${g(r.qty)}</td><td>${esc(r.bench || "")}</td>
				<td>${esc(r.employee_label || "")}</td></tr>`));

		root.find(".sc-body").html(`
			<div class="sc-sec">${__("Where it came from")}</div>
			<p class="sc-note">${__("counted off the bag ledger — every gram carries the bench and the person who handed it over")}</p>
			<div class="sc-cols">${bench}${emp}</div>
			${held ? `<div class="sc-sec">${__("Sitting in {0}", [esc(D.warehouse || "")])}</div>
				<p class="sc-note">${__("the warehouse's own stock — this is what is actually there to refine")}</p>
				${held}` : ""}
			${recent ? `<div class="sc-sec">${__("Recent handovers")}</div>${recent}` : ""}`);
	}

	function paintMove() {
		if (!T) return;
		if (!T.items.some((i) => i.item === M.item)) M.item = (T.items[0] || {}).item || "";
		const have = flt((T.items.find((i) => i.item === M.item) || {}).qty);
		if (!T.items.length) {
			root.find(".sc-move").html("");
			return;
		}
		root.find(".sc-move").html(`
			<div class="sc-sec" style="margin-top:0;">${__("Send it on")}</div>
			<p class="sc-note">${__("scrub leaves from here — the loss buckets have their own screens and are not reachable from this page")}</p>
			<div class="sc-form">
				<div class="sc-f"><label>${__("Item")}</label>
					<select class="sc-item">${T.items.map((i) =>
						`<option value="${esc(i.item)}" ${i.item === M.item ? "selected" : ""}>${
							esc(i.item)} — ${flt(i.qty).toFixed(3)} g</option>`).join("")}</select></div>
				<div class="sc-f"><label>${__("Weight (g)")}</label>
					<input type="number" class="sc-qty" step="0.001" min="0" max="${have}"
						value="${M.qty}" placeholder="${have.toFixed(3)}"></div>
				<div class="sc-f"><label>${__("To")}</label>
					<select class="sc-target"><option value="">${__("— pick —")}</option>
						${(T.targets || []).map((t) =>
							`<option value="${esc(t.warehouse)}" ${t.warehouse === M.target ? "selected" : ""}>${
								esc(t.label)}</option>`).join("")}</select></div>
				<div class="sc-f" style="flex:1;min-width:190px;"><label>${__("Note")}</label>
					<input type="text" class="sc-remark" style="width:100%;"
						placeholder="${__("sent to refining, tray no…")}"></div>
				<button class="sc-go" ${!M.target || flt(M.qty) <= 0 ? "disabled" : ""}>${
					__("SEND {0} g", [flt(M.qty).toFixed(3)])}</button>
			</div>`);
	}

	root.on("change", ".sc-item", function () { M.item = this.value; M.qty = ""; paintMove(); });
	root.on("input", ".sc-qty", function () {
		M.qty = this.value;
		root.find(".sc-go").prop("disabled", !M.target || flt(M.qty) <= 0)
			.text(__("SEND {0} g", [flt(M.qty).toFixed(3)]));
	});
	root.on("change", ".sc-target", function () {
		M.target = this.value;
		root.find(".sc-go").prop("disabled", !M.target || flt(M.qty) <= 0);
	});
	root.on("click", ".sc-go", function () {
		const note = root.find(".sc-remark").val() || "";
		// recovered gold leaving the building is worth one question first
		frappe.confirm(
			__("Send <b>{0} g</b> of {1} to <b>{2}</b>?",
				[flt(M.qty).toFixed(3), esc(M.item), esc(M.target)]),
			() => {
				frappe.dom.freeze(__("Sending…"));
				frappe.call({ method: API + ".transfer_scrub", args: {
					target: M.target, item: M.item, qty: flt(M.qty), remarks: note } })
					.then((r) => {
						frappe.dom.unfreeze();
						const m = r.message || {};
						M.qty = "";
						frappe.show_alert({ indicator: "green", message:
							__("{0} g sent to {1} — {2}", [flt(m.qty).toFixed(3), m.target, m.stock_entry]) }, 6);
						load();
					}).catch(() => frappe.dom.unfreeze());
			});
	});

	function load() {
		return Promise.all([
			frappe.call({ method: API + ".get_scrub_board", freeze: false }),
			frappe.call({ method: API + ".get_scrub_transfer_context", freeze: false }),
		]).then(([a, b]) => {
			D = a.message; T = b.message;
			paint(); paintMove();
		});
	}

	page.set_secondary_action(__("Scrub history"), () => frappe.set_route("scrub-history"));
	page.set_primary_action(__("Refresh"), load, "refresh");
	frappe.pages["scrub"].on_page_show = load;
	load();
};
