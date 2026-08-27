// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Job Work — bench Issue / Receipt, barcode-scanner batch flow.
//
// ISSUE tab:  scan cards (1st scan locks the bench location; only same-location
//   cards accepted), select many, then "Issue with Employee" (enter who) or
//   "Issue (no employee)" (just starts the clock). Cards already issued are
//   rejected inline.
// RECEIPT tab: scan issued cards (location + employee locked for the batch),
//   type the gross weight coming in per card — loss = weight out - weight in is
//   shown live but not committed. "Receipt" confirms "<employee> -> <loss> g"
//   then books the loss (In Bags -> '<bench> -LOSS' stock) and updates tracking.
// Route: /app/job-work

frappe.pages["job-work"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Job Work", single_column: true });
	const state = { mode: "issue", rows: [], location: null, history: [], batchEmp: null };
	// gold moves per card on both sides of this page — small requests, so a
	// timeout can never strand a long batch half-done
	const JW_CHUNK = 20;
	const chunk = (arr, n) => {
		const out = [];
		for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
		return out;
	};
	const ALLOWED = ["GRINDING", "FILING", "SETTING", "PRE POLISH", "FINAL POLISH"];

	$(page.main).append(`
		<style>
		.jw-tabs{display:flex;gap:6px;margin:2px 0 12px;}
		.jw-tab{border:1px solid var(--border-color);background:var(--fg-color);padding:6px 18px;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px;color:var(--text-muted);}
		.jw-tab.active{background:var(--btn-primary,#171717);color:#fff;border-color:var(--btn-primary,#171717);}
		.jw-head{display:grid;grid-template-columns:1.6fr 1fr 1.4fr;gap:6px 12px;margin:4px 0 10px;align-items:end;}
		.jw-head .control-label{font-size:11px;color:var(--text-muted);}
		.jw-head .help-box{display:none !important;}
		.jw-loc .lbl{color:var(--text-muted);font-size:11px;display:block;}
		.jw-loc .val{font-weight:700;font-size:18px;}
		.jw-box{border:1px solid var(--border-color);border-radius:11px;overflow:auto;max-height:calc(100vh - 320px);}
		table.jw-grid{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;background:var(--fg-color);}
		table.jw-grid th{position:sticky;top:0;background:var(--control-bg,var(--fg-color));border-bottom:2px solid var(--gray-400,#aeb6bf);padding:6px 8px;text-align:left;font-weight:700;}
		table.jw-grid td{border-bottom:1px solid var(--border-color);padding:5px 8px;}
		table.jw-grid td.num,table.jw-grid th.num{text-align:right;}
		table.jw-grid td.num input.jw-win{display:inline-block;width:90px;text-align:right;-moz-appearance:textfield;}
		.jw-win::-webkit-inner-spin-button,.jw-win::-webkit-outer-spin-button{-webkit-appearance:none;margin:0;}
		.jw-loss-pos{color:#b00020;font-weight:600;}
		.jw-foot{margin-top:6px;color:var(--text-muted);font-size:12px;display:flex;justify-content:space-between;}
		.jw-foot b{color:var(--text-color);}
		.jw-msg{display:none;margin:0 0 8px;padding:7px 11px;border-radius:6px;font-size:13px;}
		.jw-msg.err{display:block;background:#fbeaea;color:#b00020;border:1px solid #e6b3b3;}
		.jw-msg.warn{display:block;background:#fdf3e3;color:#9a6700;border:1px solid #f0d9a8;}
		.jw-msg.ok{display:block;background:#eaf6ec;color:#1d7a33;border:1px solid #bfe3c6;}
		.jw-actions{margin-top:12px;display:flex;gap:8px;}
		</style>
		<div class="jw-tabs">
			<div class="jw-tab" data-mode="issue">Issue</div>
			<div class="jw-tab" data-mode="receipt">Receipt</div>
		</div>
		<div class="jw-head">
			<div class="jw-scan"></div>
			<div class="jw-loc"><span class="lbl">Batch location</span><span class="val jw-locval">—</span></div>
			<div class="jw-emp"></div>
			<div class="jw-work" style="display:none;"></div>
			<div class="jw-state" style="display:none;"></div>
		</div>
		<div class="jw-tpx" style="display:none;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 8px;border:1px dashed var(--border-color);border-radius:8px;padding:6px 12px;">
			<label style="margin:0;font-size:12.5px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px;">
				<input type="checkbox" class="jw-tpx-on" style="width:15px;height:15px;"> ${__("Transfer right after")}</label>
			<select class="jw-tpx-to" style="display:none;border:1px solid var(--border-color);border-radius:6px;height:28px;font-size:12px;background:var(--fg-color);color:var(--text-color);">
				<option value="">${__("— destination —")}</option></select>
		</div>
		<div class="jw-msg"></div>
		<div class="jw-box"><table class="jw-grid"><thead class="jw-thead"></thead><tbody class="jw-body"></tbody></table></div>
		<div class="jw-foot"><span><span class="jw-count">0</span> card(s) collected.</span><span class="jw-total"></span></div>
		<div class="jw-actions"></div>
	`);

	const mk = (sel, df) => {
		const c = frappe.ui.form.make_control({ df, parent: $(page.main).find(sel).get(0), render_input: true });
		c.refresh();
		return c;
	};
	state.scan = mk(".jw-scan", { fieldtype: "Data", label: "Scan Order Bag", fieldname: "scan", description: "Scan a bag barcode (or type + Enter)." });
	state.emp = mk(".jw-emp", { fieldtype: "Link", label: "Employee", fieldname: "employee", options: "Employee" });
	// manual picks are limited to the bench roster — but once a scanned card seeds
	// the batch employee the roster query must NOT apply: the Link control silently
	// DROPS a set value its query can't find (an employee issued a card while off
	// the roster then never showed up — the old "employee not showing" bug)
	state.emp.get_query = () => state.batchEmp
		? { filters: {} }
		: { query: "jewelima.jewelima.api.bench_employee_query", filters: { bench: state.location || "" } };

	// per-bench Work Type (issue) + Collection State (receipt) — configured on
	// Setup > Work Types & States; pickers only show when the bench has options
	state.work = mk(".jw-work", { fieldtype: "Select", label: "Type of Work", fieldname: "work_type", options: "" });
	state.cstate = mk(".jw-state", { fieldtype: "Select", label: "State of Collection", fieldname: "collection_state", options: "" });
	state.workOpts = { work_types: [], collection_states: [] };
	function loadWorkOptions() {
		if (!state.location) { state.workOpts = { work_types: [], collection_states: [] }; toggleWorkPickers(); return; }
		frappe.call({ method: "jewelima.jewelima.api.get_bench_work_options", args: { location: state.location } }).then((r) => {
			state.workOpts = r.message || { work_types: [], collection_states: [] };
			state.work.df.options = state.workOpts.work_types.join("\n"); state.work.refresh();
			if (state.workOpts.default_work_type) state.work.set_value(state.workOpts.default_work_type);
			state.cstate.df.options = [""].concat(state.workOpts.collection_states).join("\n"); state.cstate.refresh();
			toggleWorkPickers();
		});
	}
	function toggleWorkPickers() {
		$(page.main).find(".jw-work").toggle(state.mode === "issue" && state.workOpts.work_types.length > 0);
		$(page.main).find(".jw-state").toggle(state.mode === "receipt" && state.workOpts.collection_states.length > 0);
	}

	const $body = $(page.main).find(".jw-body");
	const $thead = $(page.main).find(".jw-thead");
	const $msg = $(page.main).find(".jw-msg");
	// ---- Transfer Plus: onward transfer right after RECEIPT ONLY -------------
	// (never on issue — cards leave through the receipt, not into it; the strip
	// exists solely on the Receipt tab and resets when the tab changes)
	const TPX = { allowed: ["Jewelima Transfer Plus", "Stock Manager", "System Manager", "JW Manager", "JW Data Admin"]
		.some((r) => frappe.user.has_role(r)) };
	$(page.main).find(".jw-tpx-on").on("change", function () {
		const $to = $(page.main).find(".jw-tpx-to");
		$to.toggle(this.checked);
		if (!this.checked || !state.location) return;
		frappe.call({ method: "jewelima.jewelima.api.allowed_to_locations",
			args: { from_location: state.location }, freeze: false }).then((r) => {
			$to.html(`<option value="">${__("— destination —")}</option>`
				+ (r.message || []).map((l) => `<option>${frappe.utils.escape_html(l)}</option>`).join(""));
		});
	});
	function tpxDest() {
		if (!TPX.allowed || !$(page.main).find(".jw-tpx-on").is(":checked")) return null;
		const to = $(page.main).find(".jw-tpx-to").val();
		if (!to) { frappe.msgprint(__("Pick the onward destination (or untick 'Transfer right after').")); return "MISSING"; }
		return to;
	}

	const $actions = $(page.main).find(".jw-actions");
	const focusScan = () => setTimeout(() => state.scan.$input.focus(), 30);
	const empVal = () => state.emp.get_value();
	const empDisp = () => (state.emp.$input && state.emp.$input.val()) || empVal(); // the NAME shown in the field, never the code
	// once a card brings its own employee, lock the field so it can't be changed mid-issue
	function lockEmp(on) {
		if (state.emp.$input) state.emp.$input.prop("disabled", !!on).toggleClass("jw-emp-locked", !!on);
	}

	function setMsg(html, kind) {
		$msg.removeClass("err warn ok").html(html || "");
		if (html) $msg.addClass(kind || "err");
	}
	function logHistory(code, result, kind) {
		state.history.push({ time: frappe.datetime.now_datetime(), code, result, kind: kind || "ok", mode: state.mode });
	}
	function updateLoc() {
		$(page.main).find(".jw-locval").text(state.location || "—");
		loadWorkOptions();
	}

	// ---- rendering -------------------------------------------------------
	function renderHead() {
		if (state.mode === "issue") {
			$thead.html(`<tr><th style="width:40px">#</th><th>Order Bag</th><th>Design</th><th>Qty</th><th>Status</th><th class="num">Gold (g)</th><th style="width:34px"></th></tr>`);
		} else {
			$thead.html(`<tr><th style="width:40px">#</th><th>Order Bag</th><th class="num">Weight Out (g)</th><th class="num">Weight In (g)</th><th class="num">Loss (g)</th><th style="width:34px"></th></tr>`);
		}
	}
	const MAX_GAIN = 0.1;   // must match MAX_RECEIPT_GAIN_G in setup.py
	function rowLoss(r) {
		const win = parseFloat(r.weight_in);
		if (isNaN(win)) return null;
		return Math.max(flt(r.weight_out) - win, 0);
	}
	// a card can come back HEAVIER (polish build-up, scale drift); that gold is
	// pulled from the Production warehouse on receipt
	function rowGain(r) {
		const win = parseFloat(r.weight_in);
		if (isNaN(win)) return null;
		return Math.max(win - flt(r.weight_out), 0);
	}
	function flt(v) {
		const n = parseFloat(v);
		return isNaN(n) ? 0 : n;
	}
	function renderRows() {
		$body.empty();
		state.rows.forEach((r, i) => {
			const rm = `<td><button class="btn btn-xs btn-default jw-rm" data-name="${frappe.utils.escape_html(r.name)}" title="Remove">&times;</button></td>`;
			if (state.mode === "issue") {
				$body.append(`<tr>
					<td>${i + 1}</td>
					<td><b>${frappe.utils.escape_html(r.name)}</b></td>
					<td>${frappe.utils.escape_html(r.design || "")}</td>
					<td>${r.qty || ""}</td>
					<td>${frappe.utils.escape_html(r.status || "In Queue")}</td>
					<td class="num">${flt(r.gold).toFixed(3)}</td>
					${rm}</tr>`);
			} else {
				const loss = rowLoss(r);
				$body.append(`<tr>
					<td>${i + 1}</td>
					<td><b>${frappe.utils.escape_html(r.name)}</b></td>
					<td class="num">${flt(r.weight_out).toFixed(3)}</td>
					<td class="num"><input type="number" step="0.001" class="form-control input-xs jw-win" data-name="${frappe.utils.escape_html(r.name)}" value="${r.weight_in != null ? r.weight_in : ""}"></td>
					<td class="num jw-losscell">${loss == null ? "—" : `<span class="${loss > 0 ? "jw-loss-pos" : ""}">${loss.toFixed(3)}</span>`}</td>
					${rm}</tr>`);
			}
		});
		$(page.main).find(".jw-count").text(state.rows.length);
		updateTotal();
	}
	function updateTotal() {
		if (state.mode !== "receipt") return $(page.main).find(".jw-total").text("");
		let t = 0,
			ready = true;
		state.rows.forEach((r) => {
			const l = rowLoss(r);
			if (l == null) ready = false;
			else t += l;
		});
		$(page.main).find(".jw-total").html(`Total loss: <b class="${t > 0 ? "jw-loss-pos" : ""}">${t.toFixed(3)} g</b>${ready ? "" : " <span style='color:#9a6700'>(fill all weight-in)</span>"}`);
	}

	$body.on("click", ".jw-rm", function () {
		const nm = $(this).data("name");
		state.rows = state.rows.filter((r) => r.name !== nm);
		if (!state.rows.length) {
			state.location = null;
			state.batchEmp = null; // empty batch — the next scan decides afresh
			state.batchEmpName = null;
			state.emp.set_value("");
			lockEmp(false);
		}
		updateLoc();
		renderRows();
		focusScan();
	});
	$body.on("input", ".jw-win", function () {
		const nm = $(this).data("name");
		const row = state.rows.find((r) => r.name === nm);
		if (!row) return;
		row.weight_in = this.value;
		const loss = rowLoss(row);
		$(this).closest("tr").find(".jw-losscell").html(loss == null ? "—" : `<span class="${loss > 0 ? "jw-loss-pos" : ""}">${loss.toFixed(3)}</span>`);
		updateTotal();
	});
	// Enter in a weight-in box hands control back to the scanner for the next card
	$body.on("keydown", ".jw-win", function (e) {
		if (e.which === 13 || e.key === "Enter") {
			e.preventDefault();
			focusScan();
		}
	});

	// ---- scanning --------------------------------------------------------
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
				setMsg(__("<b>{0}</b> is at <b>{1}</b> — Job Work (Issue/Receipt) is only for {2}.", [safe, frappe.utils.escape_html(v.location), ALLOWED.join(", ")]), "err");
				logHistory(code, __("At {0} (not allowed)", [v.location]), "err");
				return;
			}
			if (!v.doctype) {
				setMsg(__("<b>{0}</b> is at <b>{1}</b> — no bench there.", [safe, frappe.utils.escape_html(v.location)]), "err");
				return;
			}
			const status = (v.record && v.record.status) || "In Queue";
			if (state.mode === "issue" && status === "Issued") {
				setMsg(__("<b>{0}</b> is already issued.", [safe]), "err");
				logHistory(code, "Already issued", "err");
				return;
			}
			if (state.mode === "receipt" && status !== "Issued") {
				setMsg(__("<b>{0}</b> is <b>{1}</b> — only issued cards can be received.", [safe, frappe.utils.escape_html(status)]), "err");
				logHistory(code, "Not issued (" + status + ")", "err");
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
			const row = { name: code, design: v.design, qty: v.qty, status, gold: v.gold,
				employee: (v.record && v.record.employee) || "",
				employee_name: (v.record && (v.record.employee_name || v.record.employee)) || "" };
			if (state.mode === "receipt") {
				row.weight_out = (v.record && v.record.weight_out) || v.gold || 0;
				row.weight_in = null;
				// STRICT batches: the first scan decides. A card issued to someone
				// locks the whole batch to that person — nothing of anyone else's,
				// nothing unassigned. A first card with NO employee locks the batch
				// to unassigned cards only.
				if (state.batchEmp == null) {
					state.batchEmp = row.employee; // "" = a no-employee batch
					state.batchEmpName = row.employee_name || row.employee;
					// lock only AFTER the set lands — disabling the input mid-set
					// makes the Link control drop the value (the old "employee not
					// showing up" bug)
					if (row.employee) Promise.resolve(state.emp.set_value(row.employee)).then(() => lockEmp(true));
					else { state.emp.set_value(""); lockEmp(false); } // receiver names who did the work
				} else if (row.employee !== state.batchEmp) {
					const who = frappe.utils.escape_html(row.employee_name || row.employee);
					const batchWho = frappe.utils.escape_html(state.batchEmpName || state.batchEmp);
					setMsg(state.batchEmp
						? (row.employee
							? __("<b>{0}</b> is issued to <b>{1}</b> — this batch is receiving from <b>{2}</b>.", [safe, who, batchWho])
							: __("<b>{0}</b> has no employee on it — this batch is locked to <b>{1}</b>.", [safe, batchWho]))
						: __("<b>{0}</b> is issued to <b>{1}</b> — this batch is receiving unassigned cards only.", [safe, who]), "err");
					logHistory(code, __("Wrong employee ({0})", [row.employee_name || row.employee || __("none")]), "err");
					return;
				}
			}
			state.rows.push(row);
			renderRows();
			setMsg(__("Added <b>{0}</b>{1}  ·  {2} in batch.", [safe, row.employee ? " · " + frappe.utils.escape_html(row.employee_name || row.employee) : "", state.rows.length]), "ok");
			logHistory(code, __("Added ({0})", [v.location]), "ok");
			if (state.mode === "receipt") {
				// hand control to this card's weight-in box so you can type the weight straight away
				setTimeout(() => {
					const el = $body.find(".jw-win").filter(function () { return $(this).data("name") === code; }).get(0);
					if (el) { el.focus(); el.select(); }
				}, 50);
			}
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

	// ---- actions ---------------------------------------------------------
	function doIssue(withEmployee) {
		if (!state.rows.length) return frappe.msgprint(__("Scan at least one card first."));
		if (withEmployee && !empVal()) return frappe.msgprint(__("Select the employee (or use 'Issue (no employee)')."));
		// Issue in CHUNKS. Each card is a stock snapshot plus an employee-balance
		// bump, so a long batch is a lot of work in one request — and a gateway
		// timeout mid-way would leave the bench half-issued with nothing said.
		// Twenty keeps each request short, and a failure names exactly what did
		// not go out.
		const names = state.rows.map((r) => r.name);
		const parts = chunk(names, JW_CHUNK);
		const tot = { count: 0, errors: [] };
		const runIssue = (i) => {
			if (i >= parts.length) return Promise.resolve();
			frappe.dom.freeze(parts.length > 1
				? __("Issuing {0} of {1} — {2} card(s)…", [i + 1, parts.length, parts[i].length])
				: __("Issuing…"));
			return frappe.call({
				method: "jewelima.jewelima.api.issue_bench_cards",
				args: { names: JSON.stringify(parts[i]), location: state.location,
					employee: withEmployee ? empVal() : null, work_type: state.work.get_value() || null },
			}).then((r) => {
				const res = r.message || {};
				tot.count += cint(res.count);
				tot.errors = tot.errors.concat(res.errors || []);
				return runIssue(i + 1);
			}).catch(() => {
				parts.slice(i).forEach((c) => c.forEach((nm) =>
					tot.errors.push({ name: nm, error: __("not sent — the batch stopped here") })));
			});
		};
		runIssue(0).then(() => {
			frappe.dom.unfreeze();
			frappe.show_alert({ message: __("Issued {0} card(s) at {1}{2}", [tot.count, state.location, withEmployee ? " → " + empDisp() : ""]), indicator: "green" }, 6);
			showErrors(tot.errors);
			logHistory("—", __("Issued {0}{1}", [tot.count, withEmployee ? " (" + empDisp() + ")" : ""]), "ok");
			clearBatch();
		}).catch(() => frappe.dom.unfreeze());
	}
	function doReceipt() {
		if (!state.rows.length) return frappe.msgprint(__("Scan at least one issued card first."));
		if (!empVal()) return frappe.msgprint(__("Select the employee who did the work."));
		if (state.rows.some((r) => rowLoss(r) == null)) return frappe.msgprint(__("Enter the weight-in for every card."));
		let total = 0, gain = 0;
		state.rows.forEach((r) => { total += rowLoss(r); gain += rowGain(r); });
		const over = state.rows.filter((r) => rowGain(r) > MAX_GAIN + 1e-9);
		if (over.length) {
			return frappe.msgprint(__("{0} came back more than {1} g heavier than issued. Re-weigh it — or use Weight Add if the metal really was added.",
				[over.map((r) => r.name).join(", "), MAX_GAIN.toFixed(3)]));
		}
		frappe.confirm(
			__("<b>{0}</b> will be credited with <b>{1} g</b> loss across <b>{2}</b> card(s) at <b>{3}</b>.{4}<br><br>Confirm receipt?",
				[frappe.utils.escape_html(empDisp()), total.toFixed(3), state.rows.length, state.location,
				 gain > 0 ? __("<br><b>{0} g</b> extra weight will be pulled from <b>Production</b>.", [gain.toFixed(3)]) : ""]),
			() => {
				const tpxTo = tpxDest();
				if (tpxTo === "MISSING") return;
				// A receipt is the heaviest thing this page does per card: loss booked
				// to the bag ledger, gold moved out of In Bags into the bench's -LOSS
				// warehouse, the employee's held weight released, and (with the strip
				// ticked) an onward transfer too. Twenty at a time keeps every request
				// short; a chunk that dies is named instead of vanishing.
				const withTransfer = tpxTo && tpxTo !== "MISSING";
				const allLines = state.rows.map((r) => ({ order_bag: r.name, weight_in: r.weight_in }));
				const parts = chunk(allLines, JW_CHUNK);
				const tot = { count: 0, loss: 0, transferred: 0, errors: [], transfer_errors: [] };
				const runReceipt = (i) => {
					if (i >= parts.length) return Promise.resolve();
					frappe.dom.freeze(parts.length > 1
						? __("Receipting {0} of {1} — {2} card(s)…", [i + 1, parts.length, parts[i].length])
						: __("Receipting…"));
					return frappe.call({
						method: withTransfer ? "jewelima.jewelima.api.receipt_and_transfer" : "jewelima.jewelima.api.receipt_bench_cards",
						args: Object.assign({ lines: JSON.stringify(parts[i]), location: state.location,
							employee: empVal(), collection_state: state.cstate.get_value() || null },
							withTransfer ? { to_location: tpxTo } : {}),
					}).then((r) => {
						const res = r.message || {};
						tot.count += cint(res.count);
						tot.loss += flt(res.total_loss);
						tot.transferred += cint(res.transferred);
						tot.errors = tot.errors.concat(res.errors || []);
						tot.transfer_errors = tot.transfer_errors.concat(res.transfer_errors || []);
						return runReceipt(i + 1);
					}).catch(() => {
						parts.slice(i).forEach((c) => c.forEach((ln) =>
							tot.errors.push({ name: ln.order_bag, error: __("not sent — the batch stopped here") })));
					});
				};
				runReceipt(0).then(() => {
					frappe.dom.unfreeze();
					frappe.show_alert({ message: withTransfer
						? __("Received {0} · loss {1} g → moved {2} to {3}", [tot.count, tot.loss.toFixed(3), tot.transferred, tpxTo])
						: __("Received {0} card(s) · loss {1} g → {2}", [tot.count, tot.loss.toFixed(3), empDisp()]), indicator: "green" }, 7);
					if (tot.transfer_errors.length) {
						frappe.msgprint({ title: __("Received but not moved"), indicator: "orange",
							message: tot.transfer_errors.map((e) => `${e.name}: ${e.error}`).join("<br>") });
					}
					showErrors(tot.errors);
					logHistory("—", __("Received {0} · loss {1}g ({2})", [tot.count, tot.loss.toFixed(3), empDisp()]), "ok");
					clearBatch();
				}).catch(() => frappe.dom.unfreeze());
			}
		);
	}
	function showErrors(errors) {
		if (errors && errors.length) {
			frappe.msgprint({ title: __("Some skipped"), message: errors.map((e) => `${e.name}: ${e.error}`).join("<br>"), indicator: "orange" });
		}
	}
	function renderActions() {
		$actions.empty();
		if (state.mode === "issue") {
			$(`<button class="btn btn-primary btn-sm">${__("Issue with Employee")}</button>`).appendTo($actions).on("click", () => doIssue(true));
			$(`<button class="btn btn-default btn-sm">${__("Issue (no employee)")}</button>`).appendTo($actions).on("click", () => doIssue(false));
		} else {
			$(`<button class="btn btn-primary btn-sm">${__("Receipt")}</button>`).appendTo($actions).on("click", doReceipt);
		}
	}

	// ---- batch / mode ----------------------------------------------------
	function clearBatch() {
		state.rows = [];
		state.location = null;
		state.batchEmp = null;
		state.batchEmpName = null;
		state.scan.set_value("");
		setMsg("");
		lockEmp(false);          // fresh batch — employee re-pulls from its cards
		state.emp.set_value("");
		updateLoc();
		renderRows();
		focusScan();
	}
	function setMode(mode) {
		state.mode = mode;
		$(page.main).find(".jw-tab").removeClass("active").filter(`[data-mode="${mode}"]`).addClass("active");
		$(page.main).find(".jw-tpx").css("display", TPX.allowed && mode === "receipt" ? "flex" : "none");
		$(page.main).find(".jw-tpx-on").prop("checked", false);
		$(page.main).find(".jw-tpx-to").hide().val("");
		state.emp.df.reqd = mode === "receipt" ? 1 : 0;
		state.emp.df.label = mode === "receipt" ? __("Employee (did the work)") : __("Employee (optional)");
		state.emp.refresh();
		if ($cardsBtn) $cardsBtn.toggle(mode === "issue");
		toggleWorkPickers();
		renderHead();
		renderActions();
		clearBatch();
	}
	$(page.main).find(".jw-tab").on("click", function () {
		setMode($(this).data("mode"));
	});

	function showHistory() {
		const h = state.history;
		const body = h
			.slice()
			.reverse()
			.map((e, idx) => {
				const color = e.kind === "err" ? "#b00020" : e.kind === "warn" ? "#9a6700" : "#1d7a33";
				return `<tr><td>${h.length - idx}</td><td>${e.time ? frappe.datetime.str_to_user(e.time) : ""}</td>
					<td>${frappe.utils.escape_html(e.mode || "")}</td>
					<td><b>${frappe.utils.escape_html(e.code)}</b></td>
					<td style="color:${color}">${frappe.utils.escape_html(e.result)}</td></tr>`;
			})
			.join("");
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
		const S = { location: state.location || "", status: state.mode === "receipt" ? "Issued" : "In Queue", rows: [], sel: new Set(), jo: "" };
		// dynamic per mode: Issue shows only to-be-issued (In Queue); Receipt only Issued
		const STATUSES = state.mode === "receipt" ? ["Issued"] : ["In Queue"];
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
			// single-employee selection: the employee of the first ticked card locks the batch
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
			// select all VISIBLE cards of a single employee (the active one, else the first)
			const vis = visible().filter((r) => !state.rows.find((x) => x.name === r.name));
			let emp = null;
			for (const r of S.rows) if (S.sel.has(r.name)) { emp = r.employee || ""; break; }
			if (emp === null && vis.length) emp = vis[0].employee || "";
			vis.forEach((r) => { if ((r.employee || "") === emp) S.sel.add(r.name); });
			paint();
		});
		$b.find(".tc-none").on("click", () => { S.sel.clear(); paint(); });
		dlg.show();
		if (S.location) loadLoc(); else paint();
	}

	// the Cards picker is ISSUE-only: a receipt batch is built by scanning the
	// physical cards coming back, never by browsing a list
	const $cardsBtn = page.add_inner_button(__("Cards"), showCards);
	page.add_inner_button(__("History"), showHistory);
	page.add_inner_button(__("Reset"), () => {
		clearBatch();
		state.history = [];
	});
	setMode("issue");
};
