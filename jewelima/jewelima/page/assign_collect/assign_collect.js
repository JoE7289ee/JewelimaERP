// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Assign / Collect — lightweight bench flow for transfer benches (CAD, Waxing,
// Wax Cleaning). Same scan-batch UX as Job Work but TIMES ONLY — no weight, no loss.
//
// ASSIGN tab:  scan cards (1st scan locks the bench; only same-bench cards accepted),
//   then "Assign" to the chosen employee — stamps the assign time.
// COLLECT tab: scan assigned cards and "Collect" — stamps the collect time.
// Route: /app/assign-collect
//
// Only CAD / WAXING / WAX CLEANING are accepted (see api.assign_bench_cards).

frappe.pages["assign-collect"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Assign / Collect", single_column: true });
	const ALLOWED = ["CAD", "WAXING", "WAX SETTING", "WAX CLEANING"];
	const state = { mode: "assign", rows: [], location: null, history: [] };
	// same chunking as Job Work: long batches go out in small requests so a
	// timeout can never leave the bench half-done
	const AC_CHUNK = 20;
	const chunk = (arr, n) => {
		const out = [];
		for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
		return out;
	};

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
		.ac-box{border:1px solid var(--border-color);border-radius:11px;overflow:auto;max-height:calc(100vh - 320px);}
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
			<div class="ac-work" style="display:none;"></div>
			<div class="ac-state" style="display:none;"></div>
		</div>
		<div class="ac-tpx" style="display:none;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 8px;border:1px dashed var(--border-color);border-radius:8px;padding:6px 12px;">
			<label style="margin:0;font-size:12.5px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px;">
				<input type="checkbox" class="ac-tpx-on" style="width:15px;height:15px;"> ${__("Transfer right after")}</label>
			<select class="ac-tpx-to" style="display:none;border:1px solid var(--border-color);border-radius:6px;height:28px;font-size:12px;background:var(--fg-color);color:var(--text-color);">
				<option value="">${__("— destination —")}</option></select>
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

	// per-bench Work Type (assign) + Collection State (collect) — configured on
	// Setup > Work Types & States; the pickers only show when the bench has options
	state.work = mk(".ac-work", { fieldtype: "Select", label: "Type of Work", fieldname: "work_type", options: "" });
	state.state = mk(".ac-state", { fieldtype: "Select", label: "State of Collection", fieldname: "collection_state", options: "" });
	state.workOpts = { work_types: [], collection_states: [] };
	function loadWorkOptions() {
		if (!state.location) { state.workOpts = { work_types: [], collection_states: [] }; toggleWorkPickers(); return; }
		frappe.call({ method: "jewelima.jewelima.api.get_bench_work_options", args: { location: state.location } }).then((r) => {
			state.workOpts = r.message || { work_types: [], collection_states: [] };
			state.work.df.options = state.workOpts.work_types.join("\n"); state.work.refresh();
			if (state.workOpts.default_work_type) state.work.set_value(state.workOpts.default_work_type);
			// opens on the successful state, same as Job Work
			state.state.df.options = [""].concat(state.workOpts.collection_states).join("\n");
			state.state.refresh();
			if (state.workOpts.default_collection_state) state.state.set_value(state.workOpts.default_collection_state);
			toggleWorkPickers();
		});
	}
	function toggleWorkPickers() {
		$(page.main).find(".ac-work").toggle(state.mode === "assign" && state.workOpts.work_types.length > 0);
		$(page.main).find(".ac-state").toggle(state.mode === "collect" && state.workOpts.collection_states.length > 0);
	}

	const $body = $(page.main).find(".ac-body");
	const $thead = $(page.main).find(".ac-thead");
	const $msg = $(page.main).find(".ac-msg");
	// ---- Transfer Plus: onward transfer right after collect ------------------
	const TPX = { allowed: ["Jewelima Transfer Plus", "Stock Manager", "System Manager", "JW Manager", "JW Data Admin"]
		.some((r) => frappe.user.has_role(r)) };
	// the onward transfer only fires at COLLECT — the strip never shows on Assign
	$(page.main).find(".ac-tpx-on").on("change", function () {
		const $to = $(page.main).find(".ac-tpx-to");
		$to.toggle(this.checked);
		if (!this.checked || !state.location) return;
		frappe.call({ method: "jewelima.jewelima.api.allowed_to_locations",
			args: { from_location: state.location }, freeze: false }).then((r) => {
			$to.html(`<option value="">${__("— destination —")}</option>`
				+ (r.message || []).map((l) => `<option>${frappe.utils.escape_html(l)}</option>`).join(""));
		});
	});
	function tpxDest() {
		if (!TPX.allowed || !$(page.main).find(".ac-tpx-on").is(":checked")) return null;
		const to = $(page.main).find(".ac-tpx-to").val();
		if (!to) { frappe.msgprint(__("Pick the onward destination (or untick 'Transfer right after').")); return "MISSING"; }
		return to;
	}

	const $actions = $(page.main).find(".ac-actions");
	const focusScan = () => setTimeout(() => state.scan.$input.focus(), 30);
	const empVal = () => state.emp.get_value();
	// the displayed name (Employee links show the name, not the HR code) — used in
	// alerts / history so the code is never shown to the user.
	const empName = () => (state.emp.$input && state.emp.$input.val()) || empVal();

	function setMsg(html, kind) {
		$msg.removeClass("err warn ok").html(html || "");
		if (html) $msg.addClass(kind || "err");
	}
	function logHistory(code, result, kind) {
		state.history.push({ time: frappe.datetime.now_datetime(), code, result, kind: kind || "ok", mode: state.mode });
	}
	function updateLoc() {
		$(page.main).find(".ac-locval").text(state.location || "—");
		loadWorkOptions();
		renderActions();   // CAD hides the no-employee assign
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
		if (!empVal()) return frappe.msgprint(__("Select who is taking the work."));
		const parts = chunk(state.rows.map((r) => r.name), AC_CHUNK);
		const tot = { count: 0, errors: [] };
		const run = (i) => {
			if (i >= parts.length) return Promise.resolve();
			frappe.dom.freeze(parts.length > 1
				? __("Assigning {0} of {1} — {2} card(s)…", [i + 1, parts.length, parts[i].length])
				: __("Assigning…"));
			return frappe.call({
				method: "jewelima.jewelima.api.assign_bench_cards",
				args: { names: JSON.stringify(parts[i]), location: state.location,
					employee: withEmployee ? empVal() : null, work_type: state.work.get_value() || null },
			}).then((r) => {
				const res = r.message || {};
				tot.count += cint(res.count);
				tot.errors = tot.errors.concat(res.errors || []);
				return run(i + 1);
			}).catch(() => {
				parts.slice(i).forEach((c) => c.forEach((nm) =>
					tot.errors.push({ name: nm, error: __("not sent — the batch stopped here") })));
			});
		};
		run(0).then(() => {
			frappe.dom.unfreeze();
			frappe.show_alert({ message: __("Assigned {0} card(s) at {1}{2}", [tot.count, state.location, withEmployee ? " → " + empName() : ""]), indicator: "green" }, 6);
			showErrors(tot.errors);
			logHistory("—", __("Assigned {0}{1}", [tot.count, withEmployee ? " (" + empName() + ")" : ""]), "ok");
			clearBatch();
		}).catch(() => frappe.dom.unfreeze());
	}
	function doCollect() {
		if (!state.rows.length) return frappe.msgprint(__("Scan at least one assigned card first."));
		const tpxTo = tpxDest();
		if (tpxTo === "MISSING") return;
		const withTransfer = tpxTo && tpxTo !== "MISSING";
		const parts = chunk(state.rows.map((r) => r.name), AC_CHUNK);
		const tot = { count: 0, transferred: 0, errors: [], transfer_errors: [] };
		const run = (i) => {
			if (i >= parts.length) return Promise.resolve();
			frappe.dom.freeze(parts.length > 1
				? __("Collecting {0} of {1} — {2} card(s)…", [i + 1, parts.length, parts[i].length])
				: __("Collecting…"));
			return frappe.call({
				method: withTransfer ? "jewelima.jewelima.api.collect_and_transfer" : "jewelima.jewelima.api.collect_bench_cards",
				args: Object.assign({ names: JSON.stringify(parts[i]), location: state.location,
					collection_state: state.state.get_value() || null },
					withTransfer ? { to_location: tpxTo } : {}),
			}).then((r) => {
				const res = r.message || {};
				tot.count += cint(res.count);
				tot.transferred += cint(res.transferred);
				tot.errors = tot.errors.concat(res.errors || []);
				tot.transfer_errors = tot.transfer_errors.concat(res.transfer_errors || []);
				return run(i + 1);
			}).catch(() => {
				parts.slice(i).forEach((c) => c.forEach((nm) =>
					tot.errors.push({ name: nm, error: __("not sent — the batch stopped here") })));
			});
		};
		run(0).then(() => {
			frappe.dom.unfreeze();
			frappe.show_alert({ message: withTransfer
				? __("Collected {0} at {1} → moved {2} to {3}", [tot.count, state.location, tot.transferred, tpxTo])
				: __("Collected {0} card(s) at {1}", [tot.count, state.location]), indicator: "green" }, 6);
			if (tot.transfer_errors.length) {
				frappe.msgprint({ title: __("Collected but not moved"), indicator: "orange",
					message: tot.transfer_errors.map((e) => `${e.name}: ${e.error}`).join("<br>") });
			}
			showErrors(tot.errors);
			logHistory("—", __("Collected {0}", [tot.count]), "ok");
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
			// every assignment is owned by someone: the card has to be collectable
			// back off a named person, and the anonymous assign made that impossible
			$(`<button class="btn btn-primary btn-sm">${__("Assign")}</button>`).appendTo($actions).on("click", () => doAssign(true));
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
		$(page.main).find(".ac-tpx").css("display", TPX.allowed && mode === "collect" ? "flex" : "none");
		$(page.main).find(".ac-tpx-on").prop("checked", false);
		$(page.main).find(".ac-tpx-to").hide().val("");
		$(page.main).find(".ac-emp").toggle(mode === "assign"); // employee only relevant when assigning
		toggleWorkPickers();
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


	// ---- Cards picker (same as the Transfer page): browse a bench's cards and
	// add them to the batch without scanning. Every pick still goes through
	// processScan, so all the mode/location guards apply unchanged.
	function showCards() {
		const S = { location: state.location || "", status: state.mode === "collect" ? "Issued" : "In Queue", rows: [], sel: new Set(), jo: "" };
		// dynamic per mode: Assign shows only to-be-assigned (In Queue); Collect only Issued
		const STATUSES = state.mode === "collect" ? ["Issued"] : ["In Queue"];
		const dlg = new frappe.ui.Dialog({
			title: __("Cards by bench"),
			size: "extra-large",
			primary_action_label: __("Add to batch"),
			primary_action() {
				if (!S.sel.size) return frappe.msgprint(__("Tick at least one card."));
				if (state.rows.length && state.location && S.location !== state.location)
					return frappe.msgprint(__("The batch is at <b>{0}</b> — these cards are at <b>{1}</b>. Finish or Reset the current batch first.", [state.location, S.location]));
				dlg.hide();
				S.sel.forEach((nm) => { if (!state.rows.find((r) => r.name === nm)) processScan(nm); });
			},
		});
		const $b = $(dlg.body);
		$b.html(`
			<style>
			.tc-top{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px;}
			.tc-top select{border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);color:var(--text-color);height:30px;border-radius:5px;padding:2px 8px;font-size:13px;}
			.tc-pill{border:1px solid var(--border-color);background:var(--fg-color);border-radius:14px;padding:3px 14px;font-size:12.5px;cursor:pointer;color:var(--text-muted);}
			.tc-pill.on{background:var(--btn-primary,#171717);border-color:var(--btn-primary,#171717);color:#fff;font-weight:600;}
			.tc-count{margin-left:auto;color:var(--text-muted);font-size:12px;}
			.tc-box{border:1px solid var(--border-color);border-radius:11px;overflow:auto;height:calc(100vh - 320px);min-height:300px;}
			table.tc-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;background:var(--fg-color);}
			table.tc-tbl th{position:sticky;top:0;z-index:1;background:var(--control-bg,var(--fg-color));border-bottom:2px solid var(--gray-400,#aeb6bf);padding:6px 8px;text-align:left;font-weight:700;}
			table.tc-tbl td{border-bottom:1px solid var(--border-color);padding:5px 8px;}
			table.tc-tbl tr.on td{background:var(--bg-light-gray,#eef3ee);}
			table.tc-tbl tr.tc-dim td{opacity:.45;}
			table.tc-tbl input{width:15px;height:15px;cursor:pointer;}
			.tc-empty{padding:18px;text-align:center;color:var(--text-muted);}
			</style>
			<div class="tc-top">
				<select class="tc-loc"><option value="">${__("— bench —")}</option>${ALLOWED.map((l) => `<option ${l === S.location ? "selected" : ""}>${l}</option>`).join("")}</select>
				<select class="tc-jo"><option value="">${__("— job order —")}</option></select>
				${STATUSES.map((p) => `<span class="tc-pill ${p === S.status ? "on" : ""}" data-s="${p}">${p}</span>`).join("")}
				<button class="btn btn-xs btn-default tc-all">${__("Select all")}</button>
				<button class="btn btn-xs btn-default tc-none">${__("Clear")}</button>
				<span class="tc-count"></span>
			</div>
			<div class="tc-box"><table class="tc-tbl">
				<thead><tr><th style="width:34px"></th><th>${__("Order Bag")}</th><th>${__("Design")}</th><th>${__("Qty")}</th><th>${__("Due")}</th><th>${__("Status")}</th><th>${__("Employee")}</th></tr></thead>
				<tbody class="tc-body"><tr><td colspan="7" class="tc-empty">${__("Pick a bench.")}</td></tr></tbody>
			</table></div>`);
		const escC = frappe.utils.escape_html;
		const visible = () => S.rows.filter((r) => (S.status === "All" || r.status === S.status) && (!S.jo || r.job_order === S.jo));
		function fillJO() {
			const jos = [...new Set(S.rows.map((r) => r.job_order).filter(Boolean))].sort();
			$b.find(".tc-jo").html(`<option value="">${__("— job order —")}</option>` +
				jos.map((j) => `<option ${j === S.jo ? "selected" : ""}>${escC(j)}</option>`).join(""));
		}
		function paint() {
			const rows = visible();
			// single-employee selection: one worker's cards per batch (the first ticked locks it)
			let activeEmp = null;
			for (const r of S.rows) if (S.sel.has(r.name)) { activeEmp = r.employee || ""; break; }
			const body = $b.find(".tc-body")[0];
			body.innerHTML = rows.length
				? rows.map((r) => {
					const inBatch = state.rows.find((x) => x.name === r.name);
					const mism = activeEmp !== null && (r.employee || "") !== activeEmp;
					const dis = inBatch ? "disabled title='Already in the batch'"
						: (mism && !S.sel.has(r.name)) ? "disabled title='Different employee — clear the selection first'" : "";
					return `<tr class="${S.sel.has(r.name) ? "on" : ""}${mism ? " tc-dim" : ""}">
						<td><input type="checkbox" data-nm="${escC(r.name)}" ${S.sel.has(r.name) ? "checked" : ""} ${dis}></td>
						<td><b>${escC(r.name)}</b></td><td>${escC(r.design || "")}</td><td>${r.qty || ""}</td>
						<td>${r.due_date ? frappe.datetime.str_to_user(r.due_date) : ""}</td><td>${escC(r.status || "")}</td>
						<td>${escC(r.employee_name || "—")}</td></tr>`;
				}).join("")
				: `<tr><td colspan="7" class="tc-empty">${S.location ? __("No cards match.") : __("Pick a bench.")}</td></tr>`;
			$b.find(".tc-count").text(`${S.sel.size} selected · ${rows.length} shown · ${S.rows.length} at bench`);
			// click one, shift-click another: everything between follows
			jewelima.shiftSelect($b, ".tc-body input");
			$b.find(".tc-body input").on("change", function () {
				this.checked ? S.sel.add(this.dataset.nm) : S.sel.delete(this.dataset.nm);
				paint();
			});
			dlg.get_primary_btn().text(S.sel.size ? __("Add {0} to batch", [S.sel.size]) : __("Add to batch"));
		}
		function loadLoc() {
			if (!S.location) { S.rows = []; fillJO(); paint(); return; }
			frappe.call({ method: "jewelima.jewelima.api.get_cards_at_location", args: { location: S.location } })
				.then((r) => { S.rows = r.message || []; fillJO(); paint(); });
		}
		$b.find(".tc-loc").on("change", function () {
			S.location = this.value;
			S.sel.clear();
			S.jo = "";
			loadLoc();
		});
		$b.find(".tc-jo").on("change", function () { S.jo = this.value; paint(); });
		$b.find(".tc-pill").on("click", function () {
			$b.find(".tc-pill").removeClass("on");
			this.classList.add("on");
			S.status = this.dataset.s;
			paint();
		});
		$b.find(".tc-all").on("click", () => {
			// Select all means ALL of what is showing — it used to quietly keep only
			// one employee's cards, which read as the button half-working
			visible()
				.filter((r) => !state.rows.find((x) => x.name === r.name))
				.forEach((r) => S.sel.add(r.name));
			paint();
		});
		$b.find(".tc-none").on("click", () => { S.sel.clear(); paint(); });
		dlg.show();
		if (S.location) loadLoc(); else paint();
	}

	page.add_inner_button(__("Cards"), showCards);
	page.add_inner_button(__("History"), showHistory);
	// the scanned batch belongs to the operator and is left alone — but the
	// bench's work types and collection states are refreshed, so one added
	// while they were on another page is there when they come back
	frappe.pages["assign-collect"].on_page_show = loadWorkOptions;
	page.add_inner_button(__("Reset"), () => { clearBatch(); state.history = []; });
	setMode("assign");
};
