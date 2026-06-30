// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Transfer Order Bag — barcode-scanner batch flow.
// 1st scan locks the batch location (the scanned bag's current location).
// Each further scan: same location -> added to the table; different -> error
// popup telling where that bag actually is. Pick a destination + "Transfer All"
// to move the whole batch. "Reset" clears the table + location to start over.
// Route: /app/transfer-order-bag

const TOB_LOCATIONS =
	"\nORDERING\nCAD\nCAM\nWAX INJECTING\nTREE MAKING\nCASTING\nGRINDING\nFILING\nSETTING\nPRE POLISH\nWAX SETTING\nFINAL POLISH\nWAX CLEANING\nBAG EXTRACTION";

frappe.pages["transfer-order-bag"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Transfer Order Bag", single_column: true });
	const state = { rows: [], location: null, history: [] };

	$(page.main).append(`
		<style>
		.tob-head{display:grid;grid-template-columns:2fr 1fr 1.4fr;gap:6px 12px;margin:4px 0 10px;align-items:end;}
		.tob-head .control-label{font-size:11px;color:var(--text-muted);}
		.tob-head .help-box{display:none !important;}
		.tob-loc{font-size:13px;}
		.tob-loc .lbl{color:var(--text-muted);font-size:11px;}
		.tob-loc .val{font-weight:700;font-size:18px;}
		.tob-box{border:1px solid var(--border-color);border-radius:8px;overflow:auto;max-height:calc(100vh - 260px);}
		table.tob-grid{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;background:var(--fg-color);}
		table.tob-grid th{position:sticky;top:0;background:var(--control-bg,var(--fg-color));border-bottom:2px solid var(--gray-400,#aeb6bf);padding:6px 8px;text-align:left;font-weight:700;}
		table.tob-grid td{border-bottom:1px solid var(--border-color);padding:5px 8px;}
		table.tob-grid td.num,table.tob-grid th.num{text-align:right;}
		table.tob-grid tfoot td{border-top:2px solid var(--gray-400,#aeb6bf);}
		.tob-foot{margin-top:6px;color:var(--text-muted);font-size:12px;}
		.tob-msg{display:none;margin:0 0 8px;padding:7px 11px;border-radius:6px;font-size:13px;}
		.tob-msg.err{display:block;background:#fbeaea;color:#b00020;border:1px solid #e6b3b3;}
		.tob-msg.warn{display:block;background:#fdf3e3;color:#9a6700;border:1px solid #f0d9a8;}
		.tob-msg.ok{display:block;background:#eaf6ec;color:#1d7a33;border:1px solid #bfe3c6;}
		</style>
		<div class="tob-head">
			<div class="tob-scan"></div>
			<div class="tob-loc"><div class="lbl">Batch location</div><div class="val tob-locval">—</div></div>
			<div class="tob-to"></div>
		</div>
		<div class="tob-msg"></div>
		<div class="tob-box">
			<table class="tob-grid">
				<thead><tr><th style="width:40px">#</th><th>Order Bag</th><th>Design</th><th>Qty</th><th>Due</th><th class="num">Gross (g)</th><th class="num">Nett (g)</th><th style="width:34px"></th></tr></thead>
				<tbody class="tob-body"></tbody>
				<tfoot class="tob-foot-row"></tfoot>
			</table>
		</div>
		<div class="tob-foot"><span class="tob-count">0</span> bag(s) collected.</div>
	`);

	const mk = (sel, df) => {
		const c = frappe.ui.form.make_control({ df, parent: $(page.main).find(sel).get(0), render_input: true });
		c.refresh();
		return c;
	};
	state.scan = mk(".tob-scan", { fieldtype: "Data", label: "Scan Order Bag", fieldname: "scan", description: "Scan a bag barcode (or type + Enter)." });
	state.to = mk(".tob-to", { fieldtype: "Select", label: "Transfer all to", fieldname: "to_location", options: TOB_LOCATIONS });

	const $body = $(page.main).find(".tob-body");
	const $msg = $(page.main).find(".tob-msg");
	const focusScan = () => setTimeout(() => state.scan.$input.focus(), 30);
	const flt = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));
	function setMsg(html, kind) {
		$msg.removeClass("err warn ok").html(html || "");
		if (html) $msg.addClass(kind || "err");
	}
	function logHistory(code, result, kind) {
		state.history.push({ time: frappe.datetime.now_datetime(), code: code, result: result, kind: kind || "ok" });
	}

	function updateLoc() {
		$(page.main).find(".tob-locval").text(state.location || "—");
	}
	function setAllowedDestinations(fromLoc) {
		frappe.call({ method: "jewelima.jewelima.api.allowed_to_locations", args: { from_location: fromLoc } }).then((r) => {
			const allowed = r.message || [];
			state.to.df.options = ["", ...allowed].join("\n");
			state.to.refresh();
			if (!allowed.length) setMsg(__("You have no transfer rights from <b>{0}</b>.", [frappe.utils.escape_html(fromLoc)]), "err");
		});
	}
	function renderRows() {
		$body.empty();
		state.rows.forEach((r, i) => {
			const $tr = $(`<tr>
				<td>${i + 1}</td>
				<td><b>${frappe.utils.escape_html(r.name)}</b></td>
				<td>${frappe.utils.escape_html(r.design || "")}</td>
				<td>${r.qty || ""}</td>
				<td>${r.due_date ? frappe.datetime.str_to_user(r.due_date) : ""}</td>
				<td class="num">${flt(r.gross) ? flt(r.gross).toFixed(3) : ""}</td>
				<td class="num">${flt(r.nett) ? flt(r.nett).toFixed(3) : ""}</td>
				<td><button class="btn btn-xs btn-default tob-rm" data-name="${frappe.utils.escape_html(r.name)}" title="Remove">&times;</button></td>
			</tr>`);
			$body.append($tr);
		});
		const qT = state.rows.reduce((s, r) => s + flt(r.qty), 0);
		const gT = state.rows.reduce((s, r) => s + flt(r.gross), 0);
		const nT = state.rows.reduce((s, r) => s + flt(r.nett), 0);
		$(page.main).find(".tob-foot-row").html(
			state.rows.length
				? `<tr style="font-weight:700;background:var(--control-bg);"><td colspan="3" style="text-align:right">Totals</td><td>${qT}</td><td></td><td class="num">${gT.toFixed(3)}</td><td class="num">${nT.toFixed(3)}</td><td></td></tr>`
				: ""
		);
		$(page.main).find(".tob-count").text(state.rows.length);
	}
	$body.on("click", ".tob-rm", function () {
		const nm = $(this).data("name");
		state.rows = state.rows.filter((r) => r.name !== nm);
		if (!state.rows.length) state.location = null;
		updateLoc();
		renderRows();
		focusScan();
	});

	function processScan(code) {
		code = (code || "").trim();
		if (!code) return;
		const safe = frappe.utils.escape_html(code);
		if (state.rows.find((x) => x.name === code)) {
			setMsg(__("<b>{0}</b> already scanned.", [safe]), "warn");
			logHistory(code, "Already scanned", "warn");
			return;
		}
		frappe.call({ method: "jewelima.jewelima.api.get_bag_transfer_info", args: { order_bag: code } }).then((r) => {
			const v = r.message || {};
			if (!v.location) {
				setMsg(__("No Order Bag <b>{0}</b>.", [safe]), "err");
				logHistory(code, "Not found", "err");
				return;
			}
			if (!state.location) {
				state.location = v.location; // first scan locks the location
				updateLoc();
				setAllowedDestinations(state.location); // limit destinations to what this user may do
			} else if (v.location !== state.location) {
				setMsg(__("<b>{0}</b> is at <b>{1}</b> — this batch is collecting from <b>{2}</b>.", [safe, frappe.utils.escape_html(v.location), frappe.utils.escape_html(state.location)]), "err");
				logHistory(code, __("At {0}, not {1}", [v.location, state.location]), "err");
				return;
			}
			state.rows.push({ name: code, design: v.design, qty: v.qty, due_date: v.due_date, gross: v.gross, nett: v.nett });
			renderRows();
			setMsg(__("Added <b>{0}</b>  ·  {1} in batch.", [safe, state.rows.length]), "ok");
			logHistory(code, __("Added ({0})", [v.location]), "ok");
		});
	}

	state.scan.$input.on("keydown", (e) => {
		if (e.which === 13 || e.key === "Enter") {
			e.preventDefault();
			const code = state.scan.$input.val();
			state.scan.set_value("");
			processScan(code);
			focusScan();
		}
	});

	function clearBatch() {
		state.rows = [];
		state.location = null;
		state.to.set_value("");
		state.to.df.options = TOB_LOCATIONS; // restore full list until next batch locks a from
		state.to.refresh();
		state.scan.set_value("");
		setMsg("");
		updateLoc();
		renderRows();
		focusScan();
	}
	function resetPage() {
		clearBatch();
		state.history = []; // Reset also wipes the scan history
	}
	function showHistory() {
		const h = state.history;
		const body = h
			.slice()
			.reverse()
			.map((e, idx) => {
				const color = e.kind === "err" ? "#b00020" : e.kind === "warn" ? "#9a6700" : "#1d7a33";
				return `<tr><td>${h.length - idx}</td><td>${e.time ? frappe.datetime.str_to_user(e.time) : ""}</td>
					<td><b>${frappe.utils.escape_html(e.code)}</b></td>
					<td style="color:${color}">${frappe.utils.escape_html(e.result)}</td></tr>`;
			})
			.join("");
		const d = new frappe.ui.Dialog({ title: __("Scan history ({0})", [h.length]), size: "large", fields: [{ fieldtype: "HTML", fieldname: "h" }] });
		d.fields_dict.h.$wrapper.html(
			h.length
				? `<table class="table table-bordered" style="font-size:12px;"><thead><tr><th style="width:40px">#</th><th>Time</th><th>Order Bag</th><th>Result</th></tr></thead><tbody>${body}</tbody></table>`
				: '<div class="text-muted" style="padding:12px;">No scans yet this session.</div>'
		);
		d.show();
	}

	function transferAll() {
		const to = state.to.get_value();
		if (!state.rows.length) return frappe.msgprint(__("Scan at least one bag first."));
		if (!to) return frappe.msgprint(__("Pick the destination location ('Transfer all to')."));
		if (to === state.location) return frappe.msgprint(__("Destination is the same as the current location."));
		frappe.dom.freeze(__("Transferring…"));
		frappe.call({
			method: "jewelima.jewelima.api.transfer_order_bags",
			args: { names: JSON.stringify(state.rows.map((r) => r.name)), to_location: to },
		}).then((r) => {
			frappe.dom.unfreeze();
			const res = r.message || {};
			frappe.show_alert({ message: __("Transferred {0} bag(s): {1} → {2}", [res.count, state.location, to]), indicator: "green" }, 6);
			if (res.errors && res.errors.length) {
				frappe.msgprint({ title: __("Some not transferred"), message: res.errors.map((e) => `${e.name}: ${e.error}`).join("<br>"), indicator: "orange" });
			}
			logHistory("—", __("Transferred {0} → {1}", [res.count, to]), "ok");
			clearBatch(); // keep history; only Reset wipes it
		}).catch(() => frappe.dom.unfreeze());
	}

	page.set_primary_action(__("Transfer All"), transferAll, "arrow-right");
	page.add_inner_button(__("History"), showHistory);
	page.add_inner_button(__("Reset"), resetPage);
	focusScan();
};
