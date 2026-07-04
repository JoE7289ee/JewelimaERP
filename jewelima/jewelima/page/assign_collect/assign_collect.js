// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Assign / Collect — lightweight bench flow for transfer benches (CAD, Wax Injecting,
// Wax Cleaning). Same scan-batch UX as Job Work but TIMES ONLY — no weight, no loss.
//
// ASSIGN tab:  scan cards (1st scan locks the bench; only same-bench cards accepted),
//   then "Assign with Employee" or "Assign (no employee)" — stamps the assign time.
// COLLECT tab: scan assigned cards and "Collect" — stamps the collect time.
// Route: /app/assign-collect
//
// Only CAD / WAX INJECTING / WAX CLEANING are accepted (see api.assign_bench_cards).

frappe.pages["assign-collect"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Assign / Collect", single_column: true });
	const ALLOWED = ["CAD", "WAX INJECTING", "WAX CLEANING"];
	const state = { mode: "assign", rows: [], location: null, history: [] };

	$(page.main).append(`
		<style>
		.ac-tabs{display:flex;gap:6px;margin:2px 0 12px;}
		.ac-tab{border:1px solid var(--border-color);background:var(--fg-color);padding:6px 18px;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px;color:var(--text-muted);}
		.ac-tab.active{background:var(--btn-primary,#171717);color:#fff;border-color:var(--btn-primary,#171717);}
		.ac-head{display:grid;grid-template-columns:1.6fr 1fr 1.4fr;gap:6px 12px;margin:4px 0 10px;align-items:end;}
		.ac-head .control-label{font-size:11px;color:var(--text-muted);}
		.ac-head .help-box{display:none !important;}
		.ac-loc .lbl{color:var(--text-muted);font-size:11px;display:block;}
		.ac-loc .val{font-weight:700;font-size:18px;}
		.ac-box{border:1px solid var(--border-color);border-radius:8px;overflow:auto;max-height:calc(100vh - 320px);}
		table.ac-grid{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;background:var(--fg-color);}
		table.ac-grid th{position:sticky;top:0;background:var(--control-bg,var(--fg-color));border-bottom:2px solid var(--gray-400,#aeb6bf);padding:6px 8px;text-align:left;font-weight:700;}
		table.ac-grid td{border-bottom:1px solid var(--border-color);padding:5px 8px;}
		.ac-foot{margin-top:6px;color:var(--text-muted);font-size:12px;}
		.ac-foot b{color:var(--text-color);}
		.ac-msg{display:none;margin:0 0 8px;padding:7px 11px;border-radius:6px;font-size:13px;}
		.ac-msg.err{display:block;background:#fbeaea;color:#b00020;border:1px solid #e6b3b3;}
		.ac-msg.warn{display:block;background:#fdf3e3;color:#9a6700;border:1px solid #f0d9a8;}
		.ac-msg.ok{display:block;background:#eaf6ec;color:#1d7a33;border:1px solid #bfe3c6;}
		.ac-actions{margin-top:12px;display:flex;gap:8px;}
		</style>
		<div class="ac-tabs">
			<div class="ac-tab" data-mode="assign">Assign</div>
			<div class="ac-tab" data-mode="collect">Collect</div>
		</div>
		<div class="ac-head">
			<div class="ac-scan"></div>
			<div class="ac-loc"><span class="lbl">Batch bench</span><span class="val ac-locval">—</span></div>
			<div class="ac-emp"></div>
		</div>
		<div class="ac-msg"></div>
		<div class="ac-box"><table class="ac-grid"><thead class="ac-thead"></thead><tbody class="ac-body"></tbody></table></div>
		<div class="ac-foot"><span class="ac-count">0</span> card(s) in batch.</div>
		<div class="ac-actions"></div>
	`);

	const mk = (sel, df) => {
		const c = frappe.ui.form.make_control({ df, parent: $(page.main).find(sel).get(0), render_input: true });
		c.refresh();
		return c;
	};
	state.scan = mk(".ac-scan", { fieldtype: "Data", label: "Scan Order Bag", fieldname: "scan", description: "Scan a bag barcode (or type + Enter)." });
	state.emp = mk(".ac-emp", { fieldtype: "Link", label: "Employee (optional)", fieldname: "employee", options: "Employee" });
	state.emp.get_query = () => ({ query: "jewelima.jewelima.api.bench_employee_query", filters: { bench: state.location || "" } });

	const $body = $(page.main).find(".ac-body");
	const $thead = $(page.main).find(".ac-thead");
	const $msg = $(page.main).find(".ac-msg");
	const $actions = $(page.main).find(".ac-actions");
	const focusScan = () => setTimeout(() => state.scan.$input.focus(), 30);
	const empVal = () => state.emp.get_value();

	function setMsg(html, kind) {
		$msg.removeClass("err warn ok").html(html || "");
		if (html) $msg.addClass(kind || "err");
	}
	function logHistory(code, result, kind) {
		state.history.push({ time: frappe.datetime.now_datetime(), code, result, kind: kind || "ok", mode: state.mode });
	}
	function updateLoc() {
		$(page.main).find(".ac-locval").text(state.location || "—");
	}

	function renderHead() {
		$thead.html(`<tr><th style="width:40px">#</th><th>Order Bag</th><th>Design</th><th>Qty</th><th>Status</th><th style="width:34px"></th></tr>`);
	}
	function renderRows() {
		$body.empty();
		state.rows.forEach((r, i) => {
			$body.append(`<tr>
				<td>${i + 1}</td>
				<td><b>${frappe.utils.escape_html(r.name)}</b></td>
				<td>${frappe.utils.escape_html(r.design || "")}</td>
				<td>${r.qty || ""}</td>
				<td>${frappe.utils.escape_html(r.status || "In Queue")}</td>
				<td><button class="btn btn-xs btn-default ac-rm" data-name="${frappe.utils.escape_html(r.name)}" title="Remove">&times;</button></td>
			</tr>`);
		});
		$(page.main).find(".ac-count").text(state.rows.length);
	}

	$body.on("click", ".ac-rm", function () {
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
			return;
		}
		frappe.call({ method: "jewelima.jewelima.api.get_bench_card", args: { order_bag: code } }).then((r) => {
			const v = r.message || {};
			if (!v.location) {
				setMsg(__("No Order Bag <b>{0}</b>.", [safe]), "err");
				logHistory(code, "Not found", "err");
				return;
			}
			if (ALLOWED.indexOf(v.location) === -1) {
				setMsg(__("<b>{0}</b> is at <b>{1}</b> — Assign/Collect is only for {2}.", [safe, frappe.utils.escape_html(v.location), ALLOWED.join(", ")]), "err");
				logHistory(code, __("At {0} (not allowed)", [v.location]), "err");
				return;
			}
			const status = (v.record && v.record.status) || "In Queue";
			if (state.mode === "assign" && status === "Issued") {
				setMsg(__("<b>{0}</b> is already assigned.", [safe]), "err");
				logHistory(code, "Already assigned", "err");
				return;
			}
			if (state.mode === "collect" && status !== "Issued") {
				setMsg(__("<b>{0}</b> is <b>{1}</b> — only assigned cards can be collected.", [safe, frappe.utils.escape_html(status)]), "err");
				logHistory(code, "Not assigned (" + status + ")", "err");
				return;
			}
			// CAD gate: can't collect a bag still awaiting its design — finalize it right here
			if (state.mode === "collect" && v.is_cad) {
				setMsg(__("<b>{0}</b> is a CAD job — its design isn't finalized yet.", [safe]), "err");
				logHistory(code, "CAD design pending", "err");
				frappe.confirm(
					__("<b>{0}</b> is a CAD job ({1}) — create the real design now?", [safe, frappe.utils.escape_html(v.cad_design_type || "")]),
					() => jewelima.finalize_cad(code, () => { setMsg(__("Design attached — scan <b>{0}</b> again to collect.", [safe]), "ok"); focusScan(); })
				);
				return;
			}
			if (!state.location) {
				state.location = v.location; // first scan locks the bench
				updateLoc();
			} else if (v.location !== state.location) {
				setMsg(__("<b>{0}</b> is at <b>{1}</b> — this batch is at <b>{2}</b>.", [safe, frappe.utils.escape_html(v.location), frappe.utils.escape_html(state.location)]), "err");
				logHistory(code, __("At {0}, not {1}", [v.location, state.location]), "err");
				return;
			}
			state.rows.push({ name: code, design: v.design || (v.is_cad ? "CAD: " + (v.cad_design_type || "?") : ""), qty: v.qty, status });
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

	function doAssign(withEmployee) {
		if (!state.rows.length) return frappe.msgprint(__("Scan at least one card first."));
		if (withEmployee && !empVal()) return frappe.msgprint(__("Select the employee (or use 'Assign (no employee)')."));
		frappe.dom.freeze(__("Assigning…"));
		frappe.call({
			method: "jewelima.jewelima.api.assign_bench_cards",
			args: { names: JSON.stringify(state.rows.map((r) => r.name)), location: state.location, employee: withEmployee ? empVal() : null },
		}).then((r) => {
			frappe.dom.unfreeze();
			const res = r.message || {};
			frappe.show_alert({ message: __("Assigned {0} card(s) at {1}{2}", [res.count, state.location, withEmployee ? " → " + empVal() : ""]), indicator: "green" }, 6);
			showErrors(res.errors);
			logHistory("—", __("Assigned {0}{1}", [res.count, withEmployee ? " (" + empVal() + ")" : ""]), "ok");
			clearBatch();
		}).catch(() => frappe.dom.unfreeze());
	}
	function doCollect() {
		if (!state.rows.length) return frappe.msgprint(__("Scan at least one assigned card first."));
		frappe.dom.freeze(__("Collecting…"));
		frappe.call({
			method: "jewelima.jewelima.api.collect_bench_cards",
			args: { names: JSON.stringify(state.rows.map((r) => r.name)), location: state.location },
		}).then((r) => {
			frappe.dom.unfreeze();
			const res = r.message || {};
			frappe.show_alert({ message: __("Collected {0} card(s) at {1}", [res.count, state.location]), indicator: "green" }, 6);
			showErrors(res.errors);
			logHistory("—", __("Collected {0}", [res.count]), "ok");
			clearBatch();
		}).catch(() => frappe.dom.unfreeze());
	}
	function showErrors(errors) {
		if (errors && errors.length) {
			frappe.msgprint({ title: __("Some skipped"), message: errors.map((e) => `${e.name}: ${e.error}`).join("<br>"), indicator: "orange" });
		}
	}
	function renderActions() {
		$actions.empty();
		if (state.mode === "assign") {
			$(`<button class="btn btn-primary btn-sm">${__("Assign with Employee")}</button>`).appendTo($actions).on("click", () => doAssign(true));
			$(`<button class="btn btn-default btn-sm">${__("Assign (no employee)")}</button>`).appendTo($actions).on("click", () => doAssign(false));
		} else {
			$(`<button class="btn btn-primary btn-sm">${__("Collect")}</button>`).appendTo($actions).on("click", doCollect);
		}
	}

	function clearBatch() {
		state.rows = [];
		state.location = null;
		state.scan.set_value("");
		setMsg("");
		updateLoc();
		renderRows();
		focusScan();
	}
	function setMode(mode) {
		state.mode = mode;
		$(page.main).find(".ac-tab").removeClass("active").filter(`[data-mode="${mode}"]`).addClass("active");
		$(page.main).find(".ac-emp").toggle(mode === "assign"); // employee only relevant when assigning
		renderHead();
		renderActions();
		clearBatch();
	}
	$(page.main).find(".ac-tab").on("click", function () {
		setMode($(this).data("mode"));
	});

	function showHistory() {
		const h = state.history;
		const body = h.slice().reverse().map((e, idx) => {
			const color = e.kind === "err" ? "#b00020" : e.kind === "warn" ? "#9a6700" : "#1d7a33";
			return `<tr><td>${h.length - idx}</td><td>${e.time ? frappe.datetime.str_to_user(e.time) : ""}</td>
				<td>${frappe.utils.escape_html(e.mode || "")}</td>
				<td><b>${frappe.utils.escape_html(e.code)}</b></td>
				<td style="color:${color}">${frappe.utils.escape_html(e.result)}</td></tr>`;
		}).join("");
		const d = new frappe.ui.Dialog({ title: __("Scan history ({0})", [h.length]), size: "large", fields: [{ fieldtype: "HTML", fieldname: "h" }] });
		d.fields_dict.h.$wrapper.html(
			h.length
				? `<table class="table table-bordered" style="font-size:12px;"><thead><tr><th style="width:40px">#</th><th>Time</th><th>Mode</th><th>Order Bag</th><th>Result</th></tr></thead><tbody>${body}</tbody></table>`
				: '<div class="text-muted" style="padding:12px;">No scans yet this session.</div>'
		);
		d.show();
	}

	page.add_inner_button(__("History"), showHistory);
	page.add_inner_button(__("Reset"), () => { clearBatch(); state.history = []; });
	setMode("assign");
};
