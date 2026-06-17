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
	const state = { rows: [], location: null };

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
		.tob-foot{margin-top:6px;color:var(--text-muted);font-size:12px;}
		</style>
		<div class="tob-head">
			<div class="tob-scan"></div>
			<div class="tob-loc"><div class="lbl">Batch location</div><div class="val tob-locval">—</div></div>
			<div class="tob-to"></div>
		</div>
		<div class="tob-box">
			<table class="tob-grid">
				<thead><tr><th style="width:40px">#</th><th>Order Bag</th><th>Design</th><th>Qty</th><th>Due</th><th style="width:34px"></th></tr></thead>
				<tbody class="tob-body"></tbody>
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
	const focusScan = () => setTimeout(() => state.scan.$input.focus(), 30);

	function updateLoc() {
		$(page.main).find(".tob-locval").text(state.location || "—");
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
				<td><button class="btn btn-xs btn-default tob-rm" data-name="${frappe.utils.escape_html(r.name)}" title="Remove">&times;</button></td>
			</tr>`);
			$body.append($tr);
		});
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
		if (state.rows.find((x) => x.name === code)) {
			frappe.show_alert({ message: __("{0} already scanned", [code]), indicator: "orange" }, 4);
			return;
		}
		frappe.db.get_value("Order Bag", code, ["location", "design", "qty", "due_date"]).then((r) => {
			const v = r.message || {};
			if (!v.location) {
				frappe.msgprint({ title: __("Not found"), message: __("No Order Bag <b>{0}</b>.", [code]), indicator: "red" });
				return;
			}
			if (!state.location) {
				state.location = v.location; // first scan locks the location
				updateLoc();
			} else if (v.location !== state.location) {
				frappe.msgprint({
					title: __("Different location"),
					message: __("<b>{0}</b> is at <b>{1}</b> — this batch is collecting from <b>{2}</b>.", [code, v.location, state.location]),
					indicator: "red",
				});
				return;
			}
			state.rows.push({ name: code, design: v.design, qty: v.qty, due_date: v.due_date });
			renderRows();
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

	function resetPage() {
		state.rows = [];
		state.location = null;
		state.to.set_value("");
		state.scan.set_value("");
		updateLoc();
		renderRows();
		focusScan();
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
			resetPage();
		}).catch(() => frappe.dom.unfreeze());
	}

	page.set_primary_action(__("Transfer All"), transferAll, "arrow-right");
	page.set_secondary_action(__("Reset"), resetPage, "refresh");
	focusScan();
};
