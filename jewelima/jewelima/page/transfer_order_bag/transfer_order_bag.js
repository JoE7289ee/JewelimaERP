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
	"\nORDERING\nCAD\nCAM\nWAXING\nTREE MAKING\nCASTING\nGRINDING\nFILING\nSETTING\nPRE POLISH\nWAX SETTING\nFINAL POLISH\nBAG EXTRACTION\nREWORK";

frappe.pages["transfer-order-bag"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Transfer Order Bag", single_column: true });
	const state = { rows: [], location: null, history: [] };
	let $batchBtn = null;   // the Batch button, created with the others further down

	$(page.main).append(`
		<style>
		.tob-head{display:grid;grid-template-columns:2fr 1fr 1.4fr;gap:6px 12px;margin:4px 0 10px;align-items:end;}
		.tob-head .control-label{font-size:11px;color:var(--text-muted);}
		.tob-head .help-box{display:none !important;}
		.tob-loc{font-size:13px;}
		.tob-loc .lbl{color:var(--text-muted);font-size:11px;}
		.tob-loc .val{font-weight:700;font-size:18px;}
		.tob-wrap{display:flex;flex-direction:column;height:calc(100vh - 110px);}
		.tob-wrap > .tob-head,.tob-wrap > .tob-msg{flex:0 0 auto;}
		.tob-wrap > .tob-mid{flex:1 1 auto;overflow:auto;min-height:0;}
		.tob-box{border:1px solid var(--border-color);border-radius:11px;overflow:auto;}
		.tob-strip{flex:0 0 auto;display:flex;align-items:center;gap:12px;border-top:2px solid var(--border-color);background:var(--fg-color);padding:9px 14px;z-index:1;flex-wrap:wrap;}
		.tob-strip .b{border:1px solid var(--border-color);border-radius:8px;padding:4px 14px;text-align:center;background:var(--control-bg);min-width:92px;}
		.tob-strip .b .bk{font-size:10px;font-weight:700;letter-spacing:.06em;color:var(--text-muted);}
		.tob-strip .b .bv{font-size:14px;font-weight:700;}
		.tob-strip .b.tot{background:var(--fg-color);border-width:2px;}
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
		<div class="tob-wrap">
		<div class="tob-head">
			<div class="tob-scan"></div>
			<div class="tob-loc"><div class="lbl">Batch location</div><div class="val tob-locval">—</div></div>
			<div class="tob-to"></div>
		</div>
		<div class="tob-plus" style="display:none;align-items:center;gap:12px;flex-wrap:wrap;margin:0 0 8px;border:1px dashed var(--border-color);border-radius:8px;padding:7px 12px;">
			<label style="margin:0;font-size:12.5px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px;">
				<input type="checkbox" class="tp-on" style="width:15px;height:15px;"> ${__("Issue right after transfer")}</label>
			<span class="tp-opts" style="display:none;align-items:center;gap:8px;flex-wrap:wrap;">
				<span class="tp-emp" style="min-width:200px;display:inline-block;"></span>
				<select class="tp-wt" style="border:1px solid var(--border-color);border-radius:6px;height:28px;font-size:12px;background:var(--fg-color);color:var(--text-color);">
					<option value="">${__("— no work type —")}</option></select>
			</span>
		</div>
		<div class="tob-msg"></div>
		<div class="tob-mid">
		<div class="tob-box">
			<table class="tob-grid">
				<thead class="tob-head-row"></thead>
				<tbody class="tob-body"></tbody>
				<tfoot class="tob-foot-row"></tfoot>
			</table>
		</div>
		<div class="tob-foot"><span class="tob-count">0</span> bag(s) collected.</div>
		</div>
		<div class="tob-strip">
			<div class="b tot"><div class="bk">${__("BAGS")}</div><div class="bv tob-s-bags">0</div></div>
			<div class="b tot"><div class="bk">${__("PIECES")}</div><div class="bv tob-s-pcs">0</div></div>
			<div class="b"><div class="bk">${__("GROSS g")}</div><div class="bv tob-s-gross">0.000</div></div>
			<div class="b"><div class="bk">${__("NETT g")}</div><div class="bv tob-s-nett">0.000</div></div>
			<div class="tob-s-buckets" style="display:flex;gap:10px;flex-wrap:wrap;"></div>
		</div>
		</div>
	`);

	const mk = (sel, df) => {
		const c = frappe.ui.form.make_control({ df, parent: $(page.main).find(sel).get(0), render_input: true });
		c.refresh();
		return c;
	};
	state.scan = mk(".tob-scan", { fieldtype: "Data", label: "Scan Order Bag", fieldname: "scan", description: "Scan a bag barcode (or type + Enter)." });
	state.to = mk(".tob-to", { fieldtype: "Select", label: "Transfer all to", fieldname: "to_location", options: TOB_LOCATIONS });

	// ---- Transfer Plus: transfer AND put straight to work at the target ------
	const TP = { allowed: ["Jewelima Transfer Plus", "Stock Manager", "System Manager", "JW Manager", "JW Data Admin"]
		.some((r) => frappe.user.has_role(r)), emp: null };
	if (TP.allowed) {
		TP.emp = frappe.ui.form.make_control({
			df: { fieldtype: "Link", label: __("Employee (optional)"), fieldname: "tp_emp", options: "Employee",
				// only who is allotted to the DESTINATION bench; empty roster -> nobody
				get_query: () => ({ query: "jewelima.jewelima.api.bench_employee_query",
					filters: { bench: state.to.get_value(), strict: 1 } }) },
			parent: $(page.main).find(".tp-emp").get(0), render_input: true,
		});
		TP.emp.refresh();
		$(page.main).find(".tp-on").on("change", function () {
			$(page.main).find(".tp-opts").css("display", this.checked ? "inline-flex" : "none");
			if (this.checked) loadTargetOptions();
		});
		// delegated: state.to.refresh() (allowed-destinations rebuild) replaces the
		// <select>, which silently dropped a directly-bound handler — the strip then
		// stuck to the OLD destination's state
		$(page.main).on("change", ".tob-to select", loadTargetOptions);
	}
	// only destinations with an issue/assign flow get the strip — the rest
	// (ORDERING, CAM, TREE MAKING, CASTING, BAG EXTRACTION) just transfer
	const TOB_ISSUABLE = ["GRINDING", "FILING", "SETTING", "PRE POLISH", "FINAL POLISH",
		"CAD", "WAXING", "WAX SETTING"];
	function loadTargetOptions() {
		// the "issue right after" strip only exists once an ISSUABLE destination is picked
		const to = state.to.get_value();
		if (TP.allowed) $(page.main).find(".tob-plus").css("display", to && TOB_ISSUABLE.includes(to) ? "flex" : "none");
		if (TP.emp) TP.emp.set_value(""); // roster is per-bench — a change of destination voids the pick
		const $wt = $(page.main).find(".tp-wt");
		$wt.html("");
		if (!to || !$(page.main).find(".tp-on").is(":checked")) return;
		frappe.call({ method: "jewelima.jewelima.api.get_bench_work_options", args: { location: to }, freeze: false })
			.then((r) => {
				const m = r.message || {};
				const wts = m.work_types || [];
				// a bench with work types MUST issue under one — no blank option; the
				// bench's default comes preselected. No work types configured -> stays blank.
				$wt.html(wts.length
					? wts.map((w) => `<option ${w === m.default_work_type ? "selected" : ""}>${frappe.utils.escape_html(w)}</option>`).join("")
					: `<option value="">${__("— no work types here —")}</option>`);
			});
	}

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
		return frappe.call({ method: "jewelima.jewelima.api.allowed_to_locations", args: { from_location: fromLoc } })
			.then((r) => {
				const allowed = r.message || [];
				state.to.df.options = ["", ...allowed].join("\n");
				state.to.refresh();
				loadTargetOptions(); // refresh may reset the pick — keep the issue strip honest
				return allowed;
			});
	}
	// stone columns appear only when the batch actually carries that bucket
	const TOB_BUCKETS = ["dmd", "ps", "cs", "cz", "cvd", "sw", "pdmd", "poth"];
	function renderRows() {
		const sum = (k) => state.rows.reduce((s, r) => s + flt(r[k]), 0);
		const active = TOB_BUCKETS.filter((b) => state.rows.some((r) => flt(r[b + "_weight"]) || flt(r[b + "_no"])));
		const esc = frappe.utils.escape_html;

		$(page.main).find(".tob-head-row").html(`<tr>
			<th style="width:40px">#</th><th>${__("Order Bag")}</th><th>${__("Design")}</th><th>${__("Qty")}</th><th>${__("Due")}</th>
			<th class="num">${__("Gross (g)")}</th><th class="num">${__("Nett (g)")}</th>
			${active.map((b) => `<th class="num">${b.toUpperCase()} (${__("no / ct")})</th>`).join("")}
			<th style="width:34px"></th></tr>`);

		$body.empty();
		state.rows.forEach((r, i) => {
			$body.append($(`<tr>
				<td>${i + 1}</td>
				<td><b>${esc(r.name)}</b>${r.split_of ? `<div style="font-size:10px;color:#9a6b1f;font-weight:700;">SPLIT · ${esc(r.split_of)} #${r.piece_no || "?"}</div>` : ""}</td>
				<td>${esc(r.design || "")}</td>
				<td>${r.qty || ""}</td>
				<td>${r.due_date ? frappe.datetime.str_to_user(r.due_date) : ""}</td>
				<td class="num">${flt(r.gross) ? flt(r.gross).toFixed(3) : ""}</td>
				<td class="num">${flt(r.nett) ? flt(r.nett).toFixed(3) : ""}</td>
				${active.map((b) => {
					const no = flt(r[b + "_no"]), wt = flt(r[b + "_weight"]);
					return `<td class="num">${no || wt ? `${no || 0} / ${wt.toFixed(3)}` : ""}</td>`;
				}).join("")}
				<td><button class="btn btn-xs btn-default tob-rm" data-name="${esc(r.name)}" title="Remove">&times;</button></td>
			</tr>`));
		});

		const qT = sum("qty"), gT = sum("gross"), nT = sum("nett");
		$(page.main).find(".tob-foot-row").empty(); // totals live in the pinned strip only
		$(page.main).find(".tob-count").text(state.rows.length);
		if ($batchBtn) $batchBtn.text(state.rows.length ? __("Batch ({0})", [state.rows.length]) : __("Batch"));

		// pinned strip: bags + pieces + weights + the LIVE buckets only
		$(page.main).find(".tob-s-bags").text(state.rows.length);
		$(page.main).find(".tob-s-pcs").text(qT);
		$(page.main).find(".tob-s-gross").text(gT.toFixed(3));
		$(page.main).find(".tob-s-nett").text(nT.toFixed(3));
		$(page.main).find(".tob-s-buckets").html(active.map((b) => `
			<div class="b"><div class="bk">${b.toUpperCase()}</div>
			<div class="bv">${sum(b + "_no")} / ${sum(b + "_weight").toFixed(3)} ct</div></div>`).join(""));
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
			if (v.issued) {
				// name who is holding it, so the card can actually be chased down
				setMsg(v.blocked_reason
					? __("<b>{0}</b> is {1}.", [safe, frappe.utils.escape_html(v.blocked_reason)])
					: __("<b>{0}</b> is currently ISSUED (out with a worker) — collect it first.", [safe]), "err");
				logHistory(code, v.blocked_reason || __("Issued — can't transfer"), "err");
				return;
			}
			if (state.location && v.location !== state.location) {
				setMsg(__("<b>{0}</b> is at <b>{1}</b> — this batch is collecting from <b>{2}</b>.", [safe, frappe.utils.escape_html(v.location), frappe.utils.escape_html(state.location)]), "err");
				logHistory(code, __("At {0}, not {1}", [v.location, state.location]), "err");
				return;
			}
			// The FIRST scan decides where this batch is collecting from, so the
			// right to move anything out of there is settled before the bag is
			// taken. Adding it first and refusing afterwards left the operator
			// with a bag in the batch, the page locked to a location they cannot
			// use, and nothing to do but Reset.
			const ready = state.location
				? Promise.resolve(true)
				: setAllowedDestinations(v.location).then((allowed) => {
					if (!allowed.length) {
						setMsg(__("You have no transfer rights from <b>{0}</b> — <b>{1}</b> not added.",
							[frappe.utils.escape_html(v.location), safe]), "err");
						logHistory(code, __("No rights from {0}", [v.location]), "err");
						state.to.df.options = "";      // leave nothing half-set behind
						state.to.refresh();
						return false;
					}
					state.location = v.location;       // only now does the batch have a home
					updateLoc();
					return true;
				});

			ready.then((go) => {
				if (!go) return;
				state.rows.push({ name: code, ...v });
				renderRows();
				setMsg(__("Added <b>{0}</b>  ·  {1} in batch.", [safe, state.rows.length]), "ok");
				logHistory(code, __("Added ({0})", [v.location]), "ok");
			});
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
		$(page.main).find(".tp-on").prop("checked", false);
		$(page.main).find(".tp-opts").css("display", "none");
		loadTargetOptions(); // no destination -> the issue strip hides again
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
		const plus = TP.allowed && TOB_ISSUABLE.includes(to) && $(page.main).find(".tp-on").is(":checked");
		// a destination with work types configured never issues without one picked
		const $wt = $(page.main).find(".tp-wt");
		if (plus && $wt.find("option").length && !$wt.val())
			return frappe.msgprint(__("Pick the work type for {0} — no issue goes out without one.", [to]));
		// and never without somebody to answer for it. Asked here rather than at the
		// server so the batch is not part-way through when it comes up.
		if (plus && !TP.emp.get_value())
			return frappe.msgprint(__("Pick who takes the work at {0}.", [to]));
		// Scan as many as you like — but send them in CHUNKS. The whole batch used to
		// go in one request: a big enough batch hit the gateway timeout and left the
		// floor half-transferred with no warning. Each chunk is its own request, so a
		// failure is contained and reported.
		const CHUNK = 30;
		const all = state.rows.map((r) => r.name);
		const chunks = [];
		for (let i = 0; i < all.length; i += CHUNK) chunks.push(all.slice(i, i + CHUNK));
		const from = state.location;
		const totals = { count: 0, issued: 0, errors: [], issue_errors: [] };

		const runChunk = (idx) => {
			if (idx >= chunks.length) return Promise.resolve();
			const part = chunks[idx];
			frappe.dom.freeze(chunks.length > 1
				? __("{0} {1} of {2} — {3} bag(s)…", [plus ? __("Transferring + issuing") : __("Transferring"),
					idx + 1, chunks.length, part.length])
				: (plus ? __("Transferring + issuing…") : __("Transferring…")));
			return frappe.call({
				method: plus ? "jewelima.jewelima.api.transfer_and_issue" : "jewelima.jewelima.api.transfer_order_bags",
				args: plus ? {
					names: JSON.stringify(part), to_location: to,
					employee: TP.emp.get_value() || null,
					work_type: $(page.main).find(".tp-wt").val() || null,
				} : { names: JSON.stringify(part), to_location: to },
			}).then((r) => {
				const res = r.message || {};
				totals.count += cint(res.count);
				totals.issued += cint(res.issued);
				totals.errors = totals.errors.concat(res.errors || []);
				totals.issue_errors = totals.issue_errors.concat(res.issue_errors || []);
				return runChunk(idx + 1);
			}).catch((e) => {
				// this chunk died (timeout, server error): stop, and say exactly where
				part.forEach((nm) => totals.errors.push({ name: nm, error: __("not sent — the batch stopped here") }));
				chunks.slice(idx + 1).forEach((c) => c.forEach((nm) =>
					totals.errors.push({ name: nm, error: __("not sent — the batch stopped earlier") })));
			});
		};

		runChunk(0).then(() => {
			frappe.dom.unfreeze();
			frappe.show_alert({ message: plus
				? __("Transferred {0} bag(s) → {1}, issued {2}.", [totals.count, to, totals.issued])
				: __("Transferred {0} bag(s): {1} → {2}", [totals.count, from, to]), indicator: "green" }, 6);
			if (totals.issue_errors.length) {
				frappe.msgprint({ title: __("Transferred but not issued"), indicator: "orange",
					message: totals.issue_errors.map((e) => `${e.name}: ${e.error}`).join("<br>") });
			}
			if (totals.errors.length) {
				frappe.msgprint({ title: __("Some not transferred"),
					message: totals.errors.map((e) => `${e.name}: ${e.error}`).join("<br>"), indicator: "orange" });
			}
			logHistory("—", __("Transferred {0} → {1}", [totals.count, to]), "ok");
			clearBatch(); // keep history; only Reset wipes it
		}).catch(() => frappe.dom.unfreeze());
	}

	// ---- Batch check-off: the batch on screen, scanned card by card ----------
	// The physical check before a transfer leaves: scan each card in the tray and
	// it drops off the list. Whatever is still listed at the end is what you are
	// missing. Scanning removes instantly (no confirm) — the tray moves faster
	// than a dialog does.
	function showBatch() {
		if (!state.rows.length) return frappe.msgprint(__("Nothing in the batch yet — scan a card first."));
		const esc = frappe.utils.escape_html;
		const removed = [];
		const dlg = new frappe.ui.Dialog({ title: __("Batch — scan to remove"), size: "large" });
		const $b = $(dlg.body);
		$b.html(`
			<style>
			.bt-scan{width:100%;border:2px solid var(--border-color);border-radius:10px;height:42px;
				font-size:16px;padding:2px 16px;background:var(--fg-color);color:var(--text-color);}
			.bt-msg{display:none;margin:8px 0 0;padding:6px 11px;border-radius:6px;font-size:13px;}
			.bt-msg.ok{display:block;background:#eaf6ec;color:#1d7a33;border:1px solid #bfe3c6;}
			.bt-msg.err{display:block;background:#fbeaea;color:#b00020;border:1px solid #e6b3b3;}
			.bt-head{display:flex;align-items:center;gap:14px;margin:12px 0 6px;font-size:13px;}
			.bt-head b{font-size:16px;}
			.bt-box{border:1px solid var(--border-color);border-radius:10px;overflow:auto;max-height:46vh;}
			table.bt-t{width:100%;border-collapse:collapse;font-size:12.5px;}
			table.bt-t th{position:sticky;top:0;background:var(--control-bg);font-size:10px;text-transform:uppercase;
				color:var(--text-muted);padding:6px 10px;text-align:left;border-bottom:2px solid var(--border-color);}
			table.bt-t td{padding:5px 10px;border-bottom:1px solid var(--border-color);}
			table.bt-t td.num{text-align:right;font-variant-numeric:tabular-nums;}
			.bt-rm{cursor:pointer;color:#b02a2a;font-weight:800;}
			.bt-done{margin-top:10px;font-size:12px;color:var(--text-muted);}
			.bt-done .c{display:inline-block;border:1px solid #bfe3c6;background:#eaf6ec;color:#1d7a33;
				border-radius:9px;padding:1px 9px;margin:0 5px 5px 0;font-weight:700;
				font-family:var(--font-family-monospace,monospace);}
			.bt-empty{padding:26px;text-align:center;color:#1d7a33;font-weight:700;}
			</style>
			<input type="text" class="bt-scan" placeholder="${__("scan a card to take it out of the batch…")}">
			<div class="bt-msg"></div>
			<div class="bt-head"><span><b class="bt-left">0</b> ${__("still in the batch")}</span>
				<span class="bt-outn" style="color:var(--text-muted);"></span></div>
			<div class="bt-box"><table class="bt-t"><thead><tr>
				<th>#</th><th>${__("Order Bag")}</th><th>${__("Design")}</th><th>${__("Qty")}</th>
				<th class="num">${__("Gross (g)")}</th><th style="width:34px;"></th>
			</tr></thead><tbody class="bt-body"></tbody></table></div>
			<div class="bt-done"></div>`);

		const flt2 = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));
		function paint() {
			$b.find(".bt-left").text(state.rows.length);
			$b.find(".bt-outn").text(removed.length ? __("{0} taken out", [removed.length]) : "");
			$b.find(".bt-body").html(state.rows.map((r, i) => `
				<tr><td>${i + 1}</td>
					<td><b>${esc(r.name)}</b></td>
					<td>${esc(r.design || "")}</td>
					<td>${r.qty || ""}</td>
					<td class="num">${flt2(r.gross) ? flt2(r.gross).toFixed(3) : ""}</td>
					<td><span class="bt-rm" data-n="${esc(r.name)}" title="${__("take out")}">&times;</span></td>
				</tr>`).join("") || `<tr><td colspan="6" class="bt-empty">${__("Every card scanned — the batch is empty.")}</td></tr>`);
			$b.find(".bt-done").html(removed.length
				? `${__("Taken out:")} ${removed.map((n) => `<span class="c">${esc(n)}</span>`).join("")}` : "");
		}
		function take(code, viaScan) {
			const hit = state.rows.find((r) => r.name === code)
				|| state.rows.find((r) => r.name.toUpperCase() === String(code).toUpperCase())
				// the scanner may drop the leading E on a bag code
				|| state.rows.find((r) => r.name.toUpperCase() === "E" + String(code).toUpperCase());
			const $m = $b.find(".bt-msg").removeClass("ok err");
            if (!hit) {
				$m.addClass("err").html(__("<b>{0}</b> is not in this batch.", [esc(code)]));
				return;
			}
			state.rows = state.rows.filter((r) => r !== hit);
			removed.push(hit.name);
			if (!state.rows.length) state.location = null;
			updateLoc();
			renderRows();          // the page behind the dialog keeps up
			paint();
			if (viaScan) $m.addClass("ok").html(__("<b>{0}</b> taken out — {1} left.", [esc(hit.name), state.rows.length]));
		}
		$b.find(".bt-scan").on("keydown", function (e) {
			if (e.which !== 13 && e.key !== "Enter") return;
			e.preventDefault();
			const code = (this.value || "").trim();
			this.value = "";
			if (code) take(code, true);
		});
		$b.on("click", ".bt-rm", function () { take($(this).data("n"), false); });
		dlg.set_secondary_action_label(__("Done"));
		dlg.set_secondary_action(() => dlg.hide());
		dlg.$wrapper.on("hidden.bs.modal", () => focusScan());   // back to the main scanner
		dlg.show();
		paint();
		setTimeout(() => $b.find(".bt-scan").focus(), 300);
	}

	// ---- Cards picker: browse a location's cards and add them to the batch without scanning
	function showCards() {
		// once a batch is collecting from a location, the picker is LOCKED to it —
		// every other location is filtered out (one location per transfer).
		const batchLock = (state.rows.length && state.location) ? state.location : null;
		const S = { location: batchLock || state.location || "", status: "All", rows: [], sel: new Set(), jo: "", q: "", selOnly: false };
		const dlg = new frappe.ui.Dialog({
			title: __("Cards by location"),
			size: "extra-large",
			primary_action_label: __("Add to batch"),
			primary_action() {
				if (!S.sel.size) return frappe.msgprint(__("Tick at least one card."));
				if (state.rows.length && state.location && S.location !== state.location)
					return frappe.msgprint(__("The batch is collecting from <b>{0}</b> — these cards are at <b>{1}</b>. Transfer or Reset the current batch first.", [state.location, S.location]));
				dlg.hide();
				S.sel.forEach((nm) => { if (!state.rows.find((r) => r.name === nm)) processScan(nm); });
			},
		});
		const $b = $(dlg.body);
		const esc = frappe.utils.escape_html;
		$b.html(`
			<style>
			.tc-top{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px;}
			.tc-top select,.tc-top input[type=text]{border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);color:var(--text-color);height:30px;border-radius:5px;padding:2px 10px;font-size:13px;}
			.tc-top input[type=text]{min-width:190px;}
			.tc-pill{border:1px solid var(--border-color);background:var(--fg-color);border-radius:14px;padding:3px 14px;font-size:12.5px;cursor:pointer;color:var(--text-muted);}
			.tc-pill.on{background:var(--btn-primary,#171717);border-color:var(--btn-primary,#171717);color:#fff;font-weight:600;}
			.tc-count{margin-left:auto;color:var(--text-muted);font-size:12px;}
			.tc-box{border:1px solid var(--border-color);border-radius:11px;overflow:auto;height:calc(100vh - 320px);min-height:300px;}
			table.tc-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;background:var(--fg-color);}
			table.tc-tbl th{position:sticky;top:0;z-index:1;background:var(--control-bg,var(--fg-color));border-bottom:2px solid var(--gray-400,#aeb6bf);padding:6px 8px;text-align:left;font-weight:700;}
			table.tc-tbl td{border-bottom:1px solid var(--border-color);padding:5px 8px;}
			table.tc-tbl tr.on td{background:var(--bg-light-gray,#eef3ee);}
			table.tc-tbl input{width:15px;height:15px;cursor:pointer;}
			.tc-empty{padding:18px;text-align:center;color:var(--text-muted);}
			</style>
			<div class="tc-top">
				<select class="tc-loc" ${batchLock ? "disabled title='Batch is active — locked to this location'" : ""}>${batchLock
					? `<option>${esc(batchLock)}</option>`
					: `<option value="">— location —</option>${TOB_LOCATIONS.trim().split("\n").map((l) => `<option ${l === S.location ? "selected" : ""}>${l}</option>`).join("")}`}</select>
				<input type="text" class="tc-q" placeholder="${__("Search bag / design / JO")}">
				<select class="tc-jo"><option value="">${__("— job order —")}</option></select>
				<span class="tc-pill on" data-s="All">All</span>
				<span class="tc-pill" data-s="In Queue">In Queue</span>
				<span class="tc-pill" data-s="Completed">Completed</span>
				<button class="btn btn-xs btn-default tc-none">${__("Reset")}</button>
				<span class="tc-count"></span>
			</div>
			<div class="tc-box"><table class="tc-tbl">
				<thead><tr><th style="width:34px"><input type="checkbox" class="tc-head-cb" title="${__("Select / clear all shown")}"></th>
					<th>${__("Order Bag")}</th><th>${__("Design")}</th><th>${__("Job Order")}</th><th>${__("Qty")}</th><th>${__("Due")}</th><th>${__("Status")}</th><th>${__("Who")}</th></tr></thead>
				<tbody class="tc-body"><tr><td colspan="8" class="tc-empty">${__("Pick a location.")}</td></tr></tbody>
			</table></div>`);

		const visible = () => {
			if (S.selOnly) return S.rows.filter((r) => S.sel.has(r.name));
			const q = (S.q || "").trim().toLowerCase();
			return S.rows.filter((r) =>
				(S.status === "All" || r.status === S.status) &&
				(!S.jo || r.job_order === S.jo) &&
				(!q || (r.name + " " + (r.design || "") + " " + (r.job_order || "")).toLowerCase().indexOf(q) !== -1));
		};
		function fillJO() {
			const jos = [...new Set(S.rows.map((r) => r.job_order).filter(Boolean))].sort();
			$b.find(".tc-jo").html(`<option value="">${__("— job order —")}</option>` +
				jos.map((j) => `<option ${j === S.jo ? "selected" : ""}>${esc(j)}</option>`).join(""));
		}
		function paint() {
			const rows = visible();
			const body = $b.find(".tc-body")[0];
			const moreRow = () => {
				if (!S.hasMore) return "";
				const cols = $b.find("table.tc-tbl thead th").length || 7;
				return `<tr class="tc-morerow"><td colspan="${cols}" style="text-align:center;padding:9px;">`
				+ `<button class="btn btn-xs btn-default tc-more">${__("Load 60 more")}</button>`
				+ `<span class="text-muted" style="margin-left:9px;font-size:11.5px;">`
				+ __("{0} of {1} at this bench", [S.rows.length, S.total]) + `</span></td></tr>`;
				};
			body.innerHTML = rows.length
				? rows.map((r) => `<tr class="${S.sel.has(r.name) ? "on" : ""}">
					<td><input type="checkbox" data-nm="${esc(r.name)}" ${S.sel.has(r.name) ? "checked" : ""} ${state.rows.find((x) => x.name === r.name) ? "disabled title='Already in the batch'" : ""}></td>
					<td><b>${esc(r.name)}</b></td><td>${esc(r.design || "")}</td><td>${esc(r.job_order || "")}</td><td>${r.qty || ""}</td>
					<td>${r.due_date ? frappe.datetime.str_to_user(r.due_date) : ""}</td><td>${esc(r.status || "")}</td><td>${esc(r.employee_name || "")}</td></tr>`).join("") + moreRow()
				: `<tr><td colspan="8" class="tc-empty">${S.location ? (S.selOnly ? __("Nothing selected yet.") : __("No cards here.")) : __("Pick a location.")}</td></tr>`;
			$b.find(".tc-count").text(`${S.sel.size} selected · ${rows.length} shown · ${S.total || S.rows.length} at location`);
			// click one, shift-click another: everything between follows
			jewelima.shiftSelect($b, ".tc-body input");
			$b.find(".tc-body input").on("change", function () {
				this.checked ? S.sel.add(this.dataset.nm) : S.sel.delete(this.dataset.nm);
				paint();
			});
			// header checkbox reflects the selectable (not-yet-in-batch) rows currently shown
			const selectable = rows.filter((r) => !state.rows.find((x) => x.name === r.name));
			const selHit = selectable.filter((r) => S.sel.has(r.name)).length;
			const hcb = $b.find(".tc-head-cb")[0];
			if (hcb) { hcb.checked = selectable.length > 0 && selHit === selectable.length; hcb.indeterminate = selHit > 0 && selHit < selectable.length; }
			dlg.get_primary_btn().text(S.sel.size ? __("Add {0} to batch", [S.sel.size]) : __("Add to batch"));
		}
		const CARD_PAGE = 60;
		function loadLoc(more) {
			if (!S.location) { S.rows = []; S.loaded = 0; S.total = 0; fillJO(); paint(); return; }
			jewelima.busy($b.find("table.tc-tbl"), true, __("Loading cards…"));
			frappe.call({ method: "jewelima.jewelima.api.get_cards_at_location", freeze: false,
				args: { location: S.location, limit: CARD_PAGE, offset: more ? S.loaded : 0 } })
				// a busy bench holds thousands of cards; the picker takes them a
				// window at a time and says how many are behind the one on screen
				.then((r) => {
					const m = r.message || {};
					const batch = (r.message.rows || []).filter((x) => !x.locked);
					S.rows = more ? S.rows.concat(batch) : batch;
					S.loaded = m.shown != null ? m.shown : S.rows.length;
					S.total = m.total != null ? m.total : S.rows.length;
					S.hasMore = !!m.has_more;
					fillJO(); paint();
				})
				.always(() => jewelima.busy($b.find("table.tc-tbl"), false));
		}
		// the button is inside the table body, which paint() rewrites — so bind it
		// on the dialog once by delegation rather than after every repaint
		$b.on("click", ".tc-more", function () {
			$(this).prop("disabled", true).text(__("Loading…"));
			loadLoc(true);
		});
		$b.find(".tc-loc").on("change", function () {
			S.location = this.value;
			S.sel.clear(); // one location -> one transfer: changing location deselects everything
			S.jo = ""; S.q = ""; S.selOnly = false;
			$b.find(".tc-q").val(""); dlg.set_secondary_action_label(__("Show selected"));
			loadLoc();
		});
		$b.find(".tc-jo").on("change", function () { S.jo = this.value; paint(); });
		$b.find(".tc-q").on("input", function () { S.q = this.value; paint(); });
		$b.find(".tc-pill").on("click", function () {
			$b.find(".tc-pill").removeClass("on");
			this.classList.add("on");
			S.status = this.dataset.s;
			paint();
		});
		// header checkbox: add/remove every shown selectable card — selections accumulate
		// across filter changes, so you can filter → tick-all → filter again → tick-all.
		$b.find(".tc-head-cb").on("change", function () {
			const vis = visible().filter((r) => !state.rows.find((x) => x.name === r.name));
			vis.forEach((r) => (this.checked ? S.sel.add(r.name) : S.sel.delete(r.name)));
			paint();
		});
		$b.find(".tc-none").on("click", () => { S.sel.clear(); S.selOnly = false; dlg.set_secondary_action_label(__("Show selected")); paint(); });

		// "Show selected" (left of Add to batch): flip the list to only what's ticked
		dlg.set_secondary_action_label(__("Show selected"));
		dlg.set_secondary_action(() => {
			S.selOnly = !S.selOnly;
			dlg.set_secondary_action_label(S.selOnly ? __("Show all") : __("Show selected"));
			paint();
		});

		dlg.show();
		if (S.location) loadLoc(); else paint();
	}

	renderRows(); // paint the (empty) header + strip
	page.set_primary_action(__("Transfer All"), transferAll, "arrow-right");
	$batchBtn = page.add_inner_button(__("Batch"), showBatch);
	page.add_inner_button(__("Cards"), showCards);
	page.add_inner_button(__("History"), showHistory);
	page.add_inner_button(__("Reset"), resetPage);
	focusScan();
};
