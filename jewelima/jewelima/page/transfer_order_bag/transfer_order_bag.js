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
		.tob-wrap{display:flex;flex-direction:column;height:calc(100vh - 110px);}
		.tob-wrap > .tob-head,.tob-wrap > .tob-msg{flex:0 0 auto;}
		.tob-wrap > .tob-mid{flex:1 1 auto;overflow:auto;min-height:0;}
		.tob-box{border:1px solid var(--border-color);border-radius:8px;overflow:auto;}
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
	const TP = { allowed: frappe.user.has_role("Jewelima Transfer Plus")
		|| frappe.user.has_role("Stock Manager") || frappe.user.has_role("System Manager"), emp: null };
	if (TP.allowed) {
		$(page.main).find(".tob-plus").css("display", "flex");
		TP.emp = frappe.ui.form.make_control({
			df: { fieldtype: "Link", label: __("Employee (optional)"), fieldname: "tp_emp", options: "Employee" },
			parent: $(page.main).find(".tp-emp").get(0), render_input: true,
		});
		TP.emp.refresh();
		$(page.main).find(".tp-on").on("change", function () {
			$(page.main).find(".tp-opts").css("display", this.checked ? "inline-flex" : "none");
			if (this.checked) loadTargetOptions();
		});
		state.to.$input.on("change", loadTargetOptions);
	}
	function loadTargetOptions() {
		const to = state.to.get_value();
		const $wt = $(page.main).find(".tp-wt");
		$wt.html(`<option value="">${__("— no work type —")}</option>`);
		if (!to || !$(page.main).find(".tp-on").is(":checked")) return;
		frappe.call({ method: "jewelima.jewelima.api.get_bench_work_options", args: { location: to }, freeze: false })
			.then((r) => {
				const wts = (r.message || {}).work_types || [];
				$wt.append(wts.map((w) => `<option>${frappe.utils.escape_html(w)}</option>`).join(""));
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
		frappe.call({ method: "jewelima.jewelima.api.allowed_to_locations", args: { from_location: fromLoc } }).then((r) => {
			const allowed = r.message || [];
			state.to.df.options = ["", ...allowed].join("\n");
			state.to.refresh();
			if (!allowed.length) setMsg(__("You have no transfer rights from <b>{0}</b>.", [frappe.utils.escape_html(fromLoc)]), "err");
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
			if (!state.location) {
				state.location = v.location; // first scan locks the location
				updateLoc();
				setAllowedDestinations(state.location); // limit destinations to what this user may do
			} else if (v.location !== state.location) {
				setMsg(__("<b>{0}</b> is at <b>{1}</b> — this batch is collecting from <b>{2}</b>.", [safe, frappe.utils.escape_html(v.location), frappe.utils.escape_html(state.location)]), "err");
				logHistory(code, __("At {0}, not {1}", [v.location, state.location]), "err");
				return;
			}
			state.rows.push({ name: code, ...v });
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
		const plus = TP.allowed && $(page.main).find(".tp-on").is(":checked");
		frappe.dom.freeze(plus ? __("Transferring + issuing…") : __("Transferring…"));
		frappe.call({
			method: plus ? "jewelima.jewelima.api.transfer_and_issue" : "jewelima.jewelima.api.transfer_order_bags",
			args: plus ? {
				names: JSON.stringify(state.rows.map((r) => r.name)), to_location: to,
				employee: TP.emp.get_value() || null,
				work_type: $(page.main).find(".tp-wt").val() || null,
			} : { names: JSON.stringify(state.rows.map((r) => r.name)), to_location: to },
		}).then((r) => {
			frappe.dom.unfreeze();
			const res = r.message || {};
			frappe.show_alert({ message: plus
				? __("Transferred {0} bag(s) → {1}, issued {2}.", [res.count, to, res.issued || 0])
				: __("Transferred {0} bag(s): {1} → {2}", [res.count, state.location, to]), indicator: "green" }, 6);
			if (plus && (res.issue_errors || []).length) {
				frappe.msgprint({ title: __("Transferred but not issued"), indicator: "orange",
					message: res.issue_errors.map((e) => `${e.name}: ${e.error}`).join("<br>") });
			}
			if (res.errors && res.errors.length) {
				frappe.msgprint({ title: __("Some not transferred"), message: res.errors.map((e) => `${e.name}: ${e.error}`).join("<br>"), indicator: "orange" });
			}
			logHistory("—", __("Transferred {0} → {1}", [res.count, to]), "ok");
			clearBatch(); // keep history; only Reset wipes it
		}).catch(() => frappe.dom.unfreeze());
	}

	// ---- Cards picker: browse a location's cards and add them to the batch without scanning
	function showCards() {
		const S = { location: state.location || "", status: "All", rows: [], sel: new Set() };
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
		$b.html(`
			<style>
			.tc-top{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px;}
			.tc-top select{border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);color:var(--text-color);height:30px;border-radius:5px;padding:2px 8px;font-size:13px;}
			.tc-pill{border:1px solid var(--border-color);background:var(--fg-color);border-radius:14px;padding:3px 14px;font-size:12.5px;cursor:pointer;color:var(--text-muted);}
			.tc-pill.on{background:var(--btn-primary,#171717);border-color:var(--btn-primary,#171717);color:#fff;font-weight:600;}
			.tc-count{margin-left:auto;color:var(--text-muted);font-size:12px;}
			.tc-box{border:1px solid var(--border-color);border-radius:8px;overflow:auto;height:calc(100vh - 320px);min-height:300px;}
			table.tc-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;background:var(--fg-color);}
			table.tc-tbl th{position:sticky;top:0;z-index:1;background:var(--control-bg,var(--fg-color));border-bottom:2px solid var(--gray-400,#aeb6bf);padding:6px 8px;text-align:left;font-weight:700;}
			table.tc-tbl td{border-bottom:1px solid var(--border-color);padding:5px 8px;}
			table.tc-tbl tr.on td{background:var(--bg-light-gray,#eef3ee);}
			table.tc-tbl input{width:15px;height:15px;cursor:pointer;}
			.tc-empty{padding:18px;text-align:center;color:var(--text-muted);}
			</style>
			<div class="tc-top">
				<select class="tc-loc"><option value="">— location —</option>${TOB_LOCATIONS.trim().split("\n").map((l) => `<option ${l === S.location ? "selected" : ""}>${l}</option>`).join("")}</select>
				<span class="tc-pill on" data-s="All">All</span>
				<span class="tc-pill" data-s="In Queue">In Queue</span>
				<span class="tc-pill" data-s="Completed">Completed</span>
				<button class="btn btn-xs btn-default tc-all">Select all</button>
				<button class="btn btn-xs btn-default tc-none">Clear</button>
				<span class="tc-count"></span>
			</div>
			<div class="tc-box"><table class="tc-tbl">
				<thead><tr><th style="width:34px"></th><th>Order Bag</th><th>Design</th><th>Qty</th><th>Due</th><th>Status</th></tr></thead>
				<tbody class="tc-body"><tr><td colspan="6" class="tc-empty">Pick a location.</td></tr></tbody>
			</table></div>`);

		const esc = frappe.utils.escape_html;
		const visible = () => S.rows.filter((r) => S.status === "All" || r.status === S.status);
		function paint() {
			const rows = visible();
			const body = $b.find(".tc-body")[0];
			body.innerHTML = rows.length
				? rows.map((r) => `<tr class="${S.sel.has(r.name) ? "on" : ""}">
					<td><input type="checkbox" data-nm="${esc(r.name)}" ${S.sel.has(r.name) ? "checked" : ""} ${state.rows.find((x) => x.name === r.name) ? "disabled title='Already in the batch'" : ""}></td>
					<td><b>${esc(r.name)}</b></td><td>${esc(r.design || "")}</td><td>${r.qty || ""}</td>
					<td>${r.due_date ? frappe.datetime.str_to_user(r.due_date) : ""}</td><td>${esc(r.status || "")}</td></tr>`).join("")
				: `<tr><td colspan="6" class="tc-empty">${S.location ? "No cards here." : "Pick a location."}</td></tr>`;
			$b.find(".tc-count").text(`${S.sel.size} selected · ${rows.length} shown · ${S.rows.length} at location`);
			$b.find(".tc-body input").on("change", function () {
				this.checked ? S.sel.add(this.dataset.nm) : S.sel.delete(this.dataset.nm);
				paint();
			});
			dlg.get_primary_btn().text(S.sel.size ? __("Add {0} to batch", [S.sel.size]) : __("Add to batch"));
		}
		function loadLoc() {
			if (!S.location) { S.rows = []; paint(); return; }
			frappe.call({ method: "jewelima.jewelima.api.get_cards_at_location", args: { location: S.location } })
				.then((r) => { S.rows = r.message || []; paint(); });
		}
		$b.find(".tc-loc").on("change", function () {
			S.location = this.value;
			S.sel.clear(); // one location -> one transfer: changing location deselects everything
			loadLoc();
		});
		$b.find(".tc-pill").on("click", function () {
			$b.find(".tc-pill").removeClass("on");
			this.classList.add("on");
			S.status = this.dataset.s;
			paint();
		});
		$b.find(".tc-all").on("click", () => { visible().forEach((r) => { if (!state.rows.find((x) => x.name === r.name)) S.sel.add(r.name); }); paint(); });
		$b.find(".tc-none").on("click", () => { S.sel.clear(); paint(); });

		dlg.show();
		if (S.location) loadLoc(); else paint();
	}

	renderRows(); // paint the (empty) header + strip
	page.set_primary_action(__("Transfer All"), transferAll, "arrow-right");
	page.add_inner_button(__("Cards"), showCards);
	page.add_inner_button(__("History"), showHistory);
	page.add_inner_button(__("Reset"), resetPage);
	focusScan();
};
