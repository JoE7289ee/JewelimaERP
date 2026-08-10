// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Repair Desk — the billing sheet, alive. One bill per party at a time:
// pick the party, type TM once (18K/22K derive and FREEZE on the bill —
// no more =NOW() bills), pull the party's open intake receipts onto lines
// or type lines directly, watch every amount compute as you type. The
// server recomputes on save — what's stored is authoritative.
// Print matches the old worksheet bill. Route: /app/repair-desk

frappe.pages["repair-desk"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Repair Desk", single_column: true });
	const API = "jewelima.jewelima.repair_api";
	const esc = frappe.utils.escape_html;
	const m2 = (v) => (v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
	let BOOT = null;
	let CUR = null;    // bill name (null = unsaved new)
	let STATUS = "In Progress";
	let LINES = [];

	$(page.main).append(`
		<style>
		#page-repair-desk .container{max-width:100%;}
		.rd-bar{display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin-bottom:8px;}
		.rd-bar label{display:block;font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px;}
		.rd-bar input{border:1px solid var(--border-color);border-radius:8px;padding:7px 10px;font-size:12.5px;background:var(--fg-color);color:var(--text-color);}
		.rd-btn{border:none;color:#fff;font-weight:800;padding:9px 18px;border-radius:8px;cursor:pointer;}
		.rd-rates{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px;font-size:11.5px;color:var(--text-muted);}
		.rd-rates b{color:var(--text-color);}
		.rd-wrap{overflow-x:auto;border:1px solid var(--border-color);border-radius:8px;}
		table.rd-t{border-collapse:collapse;font-size:11.5px;background:var(--fg-color);min-width:1500px;width:100%;}
		table.rd-t th{background:var(--control-bg);font-size:9.5px;text-transform:uppercase;letter-spacing:.03em;color:var(--text-muted);padding:4px 6px;border:1px solid var(--border-color);white-space:nowrap;}
		table.rd-t td{border:1px solid var(--border-color);padding:2px 4px;white-space:nowrap;}
		table.rd-t td input,table.rd-t td select{border:none;background:transparent;color:var(--text-color);font-size:11.5px;padding:2px;outline:none;width:100%;}
		table.rd-t td.n{text-align:right;font-variant-numeric:tabular-nums;}
		table.rd-t td.calc{text-align:right;font-variant-numeric:tabular-nums;background:var(--control-bg);font-weight:700;}
		table.rd-t td input[type=checkbox]{width:14px;height:14px;accent-color:#1f618d;}
		tr.rd-svc td{opacity:.55;}
		.rd-x{color:#b02a2a;font-weight:800;cursor:pointer;padding:0 5px;}
		.rd-tot{display:flex;gap:12px;flex-wrap:wrap;margin:10px 0;}
		.rd-tile{border:1px solid var(--border-color);border-radius:11px;padding:7px 14px;background:var(--control-bg);transition:transform .12s,box-shadow .12s;}
		.rd-tile:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(0,0,0,.09);}
		.rd-tile .k{font-size:9.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;}
		.rd-tile .v{font-size:15px;font-weight:800;}
		.rd-tile.g .v{color:#1d7a33;}
		.rd-status{font-size:11px;font-weight:800;border-radius:10px;padding:2px 10px;}
		.rd-status.ip{background:#fdf3d0;color:#8a6d00;}
		.rd-status.bl{background:#e3e7f5;color:#333d8f;}
		.rd-status.dv{background:#dcefe0;color:#1d7a33;}
		.rd-recs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;}
		.rd-rec{border:1.5px dashed #2e7d32;border-radius:9px;padding:5px 12px;font-size:11.5px;cursor:pointer;background:var(--fg-color);}
		.rd-rec:hover{background:var(--control-bg);}
		.rd-rec b{color:#1d7a33;}
		.rd-rec .s{color:var(--text-muted);}
		</style>
		<div class="rd-bar">
			<span><label>${__("Party")}</label><input list="rd-parties" class="rd-party" style="width:200px;"><datalist id="rd-parties"></datalist></span>
			<span><label>${__("Bill date")}</label><input type="date" class="rd-date"></span>
			<span><label>${__("TM (24K /g)")}</label><input type="number" min="0" class="rd-tm" style="width:110px;"></span>
			<span><label>${__("Dia rate /ct")}</label><input type="number" min="0" class="rd-dia" style="width:110px;"></span>
			<button class="rd-btn rd-pull" style="background:#1f618d;">${__("Pull receipts")}</button>
			<button class="rd-btn rd-save" style="background:#2e7d32;">${__("Save")}</button>
			<button class="rd-btn rd-bill" style="background:#5b3a8e;display:none;">${__("Mark Billed")}</button>
			<button class="rd-btn rd-print" style="background:#374151;display:none;">${__("Print 🖨")}</button>
			<button class="rd-btn rd-new" style="background:#6b7280;">${__("+ New bill")}</button>
			<span class="rd-open" style="margin-left:auto;"></span>
		</div>
		<div class="rd-rates"></div>
		<div class="rd-recs"></div>
		<div class="rd-wrap"><div style="padding:26px;text-align:center;color:var(--text-muted);">${__("Pick a party and start — or open an In Progress bill on the right.")}</div></div>
		<div class="rd-tot"></div>
	`);
	const root = $(page.main);
	root.find(".rd-date").val(frappe.datetime.get_today());

	// ---- the same math the server runs (preview only — server recomputes) ----
	const S = () => (BOOT && BOOT.settings) || {};
	const base = () => flt(root.find(".rd-tm").val()) / (1 + flt(S().gst_percent) / 100);
	const r18 = () => base() * flt(S().factor_75) / 100;
	const r22 = () => base() * flt(S().factor_92) / 100;

	function calc(l) {
		l.solder_amt = cint(l.solder_count) * flt(S().soldering_rate);
		l.polish_amt = l.polish ? cint(l.qty || 1) * flt(l.polish_rate) : 0;
		l.stn_fix_amt = flt(l.stn_fix_units) * flt(S().stone_fix_rate);
		l.repair_charges = l.solder_amt + l.polish_amt + flt(l.other_amt) + l.stn_fix_amt;
		l.add_wt_75_amt = flt(l.add_wt_75) * r18();
		l.add_wt_92_amt = flt(l.add_wt_92) * r22();
		l.dmd_tot_ct = cint(l.dmd_qty) * flt(l.dmd_wt);
		l.dmd_amt = l.dmd_tot_ct * flt(root.find(".rd-dia").val());
		l.total_amt = l.service ? 0
			: l.repair_charges + l.add_wt_75_amt + l.add_wt_92_amt + l.dmd_amt;
		return l;
	}

	function boot(then) {
		frappe.call({ method: API + ".get_repair_boot" }).then((r) => {
			BOOT = r.message || {};
			root.find("#rd-parties").html((BOOT.parties || [])
				.filter((p) => p.active).map((p) => `<option value="${esc(p.name)}">`).join(""));
			paint();
			paintOpen();
			if (then) then();
		});
	}

	function paintOpen() {
		frappe.call({ method: API + ".list_repair_bills", args: { status: "In Progress" } }).then((r) => {
			const rows = r.message || [];
			root.find(".rd-open").html(rows.length
				? __("open:") + " " + rows.map((b) =>
					`<a href="#" class="rd-openb" data-n="${esc(b.name)}" style="margin-left:8px;font-weight:700;">${esc(b.name)} · ${esc(b.party)}</a>`).join("")
				: "");
		});
		paintWaiting();
	}

	// every intake lot still waiting, right on the desk — click one and it
	// becomes the bill (party set, dia rate filled, pieces on lines)
	function paintWaiting() {
		frappe.call({ method: API + ".list_repair_receipts", args: { status: "Received" } }).then((r) => {
			const rows = (r.message || []).filter((x) => !LINES.some((l) => l.receipt === x.name));
			root.find(".rd-recs").html(rows.length
				? `<span style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;align-self:center;">${__("waiting")}:</span> `
					+ rows.map((x) => `<span class="rd-rec" data-n="${esc(x.name)}" data-p="${esc(x.party)}"
						title="${__("click to add onto the bill")}">➕ <b>${esc(x.party)}</b>
						<span class="s">· ${esc(x.name)} · ${x.piece_count} ${__("pc")} · ${esc(x.jd_ref || x.receipt_date || "")}</span></span>`).join("")
				: "");
		});
	}

	root.on("click", ".rd-rec", function () {
		const name = this.getAttribute("data-n");
		const party = this.getAttribute("data-p");
		const cur = (root.find(".rd-party").val() || "").trim().toUpperCase();
		if (cur && cur !== party) {
			return frappe.show_alert({ message: __("This bill is for {0} — save it first, then + New bill for {1}.", [cur, party]), indicator: "orange" }, 5);
		}
		if (!cur) {
			root.find(".rd-party").val(party);
			const p = (BOOT.parties || []).find((x) => x.name === party);
			if (p && !flt(root.find(".rd-dia").val())) root.find(".rd-dia").val(p.dia_rate || "");
		}
		frappe.call({ method: API + ".get_repair_receipt", args: { name } }).then((res) => {
			const m = res.message;
			m.items.forEach((it) => {
				const l = blankLine();
				l.item_type = it.item_type || "";
				l.narration = it.narration || "";
				l.qty = it.qty || 1;
				l.jd_ref = m.jd_ref || "";
				l.receipt = m.name;
				l.remarks = it.remarks || "";
				const t = (BOOT.item_types || []).find((x) => x.name === l.item_type);
				if (t) l.polish_rate = flt(t.polish_rate);
				LINES.push(l);
			});
			LINES = LINES.filter((l) => l.receipt || l.item_type || l.narration || l.total_amt);
			if (!LINES.length) LINES = [blankLine()];
			paint();
			paintWaiting();
			frappe.show_alert({ message: __("{0} on the bill — {1} line(s). Fill the work, then Save.", [m.name, m.items.length]), indicator: "green" }, 4);
		});
	});

	const typeOpts = (sel) => `<option value=""></option>` + ((BOOT && BOOT.item_types) || [])
		.map((t) => `<option data-mc="${t.polish_rate}" ${t.name === sel ? "selected" : ""}>${esc(t.name)}</option>`).join("");

	function blankLine() {
		return { item_type: "", narration: "", qty: 1, jd_ref: "", receipt: null, solder_count: 0,
			polish: 0, polish_rate: 200, other_desc: "", other_amt: 0, stn_fix_units: 0,
			add_wt_75: 0, add_wt_92: 0, dmd_qty: 0, dmd_wt: 0, service: 0, remarks: "" };
	}

	const NUM = (l, i, k, step) => `<td class="n"><input type="number" min="0" step="${step || 1}" class="rd-f" data-i="${i}" data-k="${k}" value="${l[k] || ""}"></td>`;

	function paint() {
		if (!BOOT) return; // first paint comes from boot() — never before
		LINES.forEach(calc);
		const locked = STATUS === "Delivered";
		root.find(".rd-rates").html(
			`18K: <b>${m2(r18())}</b> /g &nbsp;·&nbsp; 22K: <b>${m2(r22())}</b> /g
			&nbsp;·&nbsp; ${__("soldering")} <b>${m2(S().soldering_rate)}</b>/joint
			&nbsp;·&nbsp; ${__("stn fix")} <b>${m2(S().stone_fix_rate)}</b>/unit
			${CUR ? `&nbsp;·&nbsp; <b>${esc(CUR)}</b> <span class="rd-status ${STATUS === "In Progress" ? "ip" : STATUS === "Billed" ? "bl" : "dv"}">${esc(STATUS)}</span>` : ""}`);
		root.find(".rd-bill").toggle(!!CUR && STATUS === "In Progress");
		root.find(".rd-print").toggle(!!CUR);
		root.find(".rd-wrap").html(`
			<table class="rd-t"><thead><tr>
				<th>#</th><th style="min-width:130px;">${__("Item")}</th><th style="min-width:110px;">${__("Narration")}</th><th>${__("Qty")}</th>
				<th>${__("Sold-ers")}</th><th>${__("Solder ₹")}</th><th>${__("Pol?")}</th><th>${__("Pol MC")}</th><th>${__("Pol ₹")}</th>
				<th style="min-width:90px;">${__("Other work")}</th><th>${__("Other ₹")}</th><th>${__("StnFix u")}</th><th>${__("StnFix ₹")}</th>
				<th>${__("Repair ₹")}</th><th>${__("Add75 g")}</th><th>${__("Add75 ₹")}</th><th>${__("Add92 g")}</th><th>${__("Add92 ₹")}</th>
				<th>${__("Stn qty")}</th><th>${__("ct/stn")}</th><th>${__("Tot ct")}</th><th>${__("Stone ₹")}</th>
				<th>${__("Free")}</th><th style="min-width:80px;">${__("JD REF#")}</th><th style="min-width:90px;">${__("Remarks")}</th>
				<th>${__("TOTAL ₹")}</th><th></th>
			</tr></thead><tbody>
			${LINES.map((l, i) => `<tr class="${l.service ? "rd-svc" : ""}">
				<td>${i + 1}</td>
				<td><select class="rd-f rd-type" data-i="${i}" data-k="item_type" ${locked ? "disabled" : ""}>${typeOpts(l.item_type)}</select></td>
				<td><input class="rd-f" data-i="${i}" data-k="narration" value="${esc(l.narration || "")}"></td>
				${NUM(l, i, "qty")}${NUM(l, i, "solder_count")}
				<td class="calc">${m2(l.solder_amt)}</td>
				<td style="text-align:center;"><input type="checkbox" class="rd-f" data-i="${i}" data-k="polish" ${l.polish ? "checked" : ""}></td>
				${NUM(l, i, "polish_rate")}
				<td class="calc">${m2(l.polish_amt)}</td>
				<td><input class="rd-f" data-i="${i}" data-k="other_desc" value="${esc(l.other_desc || "")}"></td>
				${NUM(l, i, "other_amt")}${NUM(l, i, "stn_fix_units", "0.5")}
				<td class="calc">${m2(l.stn_fix_amt)}</td>
				<td class="calc">${m2(l.repair_charges)}</td>
				${NUM(l, i, "add_wt_75", "0.001")}
				<td class="calc">${m2(l.add_wt_75_amt)}</td>
				${NUM(l, i, "add_wt_92", "0.001")}
				<td class="calc">${m2(l.add_wt_92_amt)}</td>
				${NUM(l, i, "dmd_qty")}${NUM(l, i, "dmd_wt", "0.001")}
				<td class="calc">${(l.dmd_tot_ct || 0).toFixed(3)}</td>
				<td class="calc">${m2(l.dmd_amt)}</td>
				<td style="text-align:center;"><input type="checkbox" class="rd-f" data-i="${i}" data-k="service" ${l.service ? "checked" : ""}></td>
				<td><input class="rd-f" data-i="${i}" data-k="jd_ref" value="${esc(l.jd_ref || "")}"></td>
				<td><input class="rd-f" data-i="${i}" data-k="remarks" value="${esc(l.remarks || "")}"></td>
				<td class="calc" style="font-size:12.5px;">${m2(l.total_amt)}</td>
				<td>${locked ? "" : `<span class="rd-x" data-i="${i}">×</span>`}</td>
			</tr>`).join("")}
			${locked ? "" : `<tr><td colspan="27" style="text-align:left;"><button class="rd-add" style="border:none;background:none;color:#1f618d;font-weight:700;cursor:pointer;">${__("+ line")}</button></td></tr>`}
			</tbody></table>`);
		paintTotals();
	}

	function paintTotals() {
		const t = { pcs: 0, rep: 0, dmd: 0, w75: 0, w75a: 0, w92: 0, w92a: 0, g: 0 };
		LINES.forEach((l) => {
			t.pcs += cint(l.qty);
			if (!l.service) {
				t.rep += l.repair_charges || 0;
				t.dmd += l.dmd_amt || 0;
				t.w75 += flt(l.add_wt_75);
				t.w75a += l.add_wt_75_amt || 0;
				t.w92 += flt(l.add_wt_92);
				t.w92a += l.add_wt_92_amt || 0;
			}
			t.g += l.total_amt || 0;
		});
		root.find(".rd-tot").html(`
			<div class="rd-tile"><div class="k">${__("Pieces")}</div><div class="v">${t.pcs}</div></div>
			<div class="rd-tile"><div class="k">${__("Repair charges")}</div><div class="v">${m2(t.rep)}</div></div>
			<div class="rd-tile"><div class="k">${__("Stone charges")}</div><div class="v">${m2(t.dmd)}</div></div>
			<div class="rd-tile"><div class="k">${__("Add 75")}</div><div class="v">${t.w75.toFixed(3)} g · ${m2(t.w75a)}</div></div>
			<div class="rd-tile"><div class="k">${__("Add 92")}</div><div class="v">${t.w92.toFixed(3)} g · ${m2(t.w92a)}</div></div>
			<div class="rd-tile g"><div class="k">${__("GRAND TOTAL")}</div><div class="v">${m2(t.g)}</div></div>`);
		return t;
	}

	// field edits: recompute the row + totals without a full repaint (focus!)
	root.on("change input", ".rd-f", function () {
		const i = cint(this.getAttribute("data-i"));
		const k = this.getAttribute("data-k");
		const l = LINES[i];
		if (this.type === "checkbox") l[k] = this.checked ? 1 : 0;
		else if (this.type === "number") {
			// no negative work: a minus sign silently clamps to zero
			l[k] = Math.max(0, flt(this.value));
			if (flt(this.value) < 0) this.value = 0;
		}
		else l[k] = this.value;
		if (k === "item_type") {
			const t = (BOOT.item_types || []).find((x) => x.name === l.item_type);
			if (t) {
				l.polish_rate = flt(t.polish_rate);
				$(this).closest("tr").find('[data-k="polish_rate"]').val(l.polish_rate);
			}
		}
		calc(l);
		const $tr = $(this).closest("tr");
		$tr.toggleClass("rd-svc", !!l.service);
		const cells = $tr.find("td.calc");
		cells.eq(0).text(m2(l.solder_amt));
		cells.eq(1).text(m2(l.polish_amt));
		cells.eq(2).text(m2(l.stn_fix_amt));
		cells.eq(3).text(m2(l.repair_charges));
		cells.eq(4).text(m2(l.add_wt_75_amt));
		cells.eq(5).text(m2(l.add_wt_92_amt));
		cells.eq(6).text((l.dmd_tot_ct || 0).toFixed(3));
		cells.eq(7).text(m2(l.dmd_amt));
		cells.eq(8).text(m2(l.total_amt));
		paintTotals();
	});
	root.on("input", ".rd-tm, .rd-dia", () => paint());
	root.on("input", ".rd-party", function () {
		const p = (BOOT.parties || []).find((x) => x.name === this.value.trim().toUpperCase());
		if (p && !flt(root.find(".rd-dia").val())) root.find(".rd-dia").val(p.dia_rate || "");
	});
	root.on("click", ".rd-add", () => { LINES.push(blankLine()); paint(); });
	root.on("click", ".rd-x", function () {
		LINES.splice(cint(this.getAttribute("data-i")), 1);
		paint();
	});

	// ---- pull open receipts of this party onto lines --------------------------
	root.on("click", ".rd-pull", () => {
		const party = (root.find(".rd-party").val() || "").trim().toUpperCase();
		if (!party) return frappe.show_alert({ message: __("Pick the party first."), indicator: "orange" }, 3);
		frappe.call({ method: API + ".list_repair_receipts", args: { status: "Received", party } }).then((r) => {
			const recs = (r.message || []).filter((x) => !LINES.some((l) => l.receipt === x.name));
			if (!recs.length) return frappe.show_alert({ message: __("No open receipts for {0}.", [party]), indicator: "blue" }, 4);
			const d = new frappe.ui.Dialog({
				title: __("Open receipts — {0}", [party]),
				fields: [{ fieldtype: "HTML", fieldname: "b" }],
				primary_action_label: __("Add ticked to bill"),
				primary_action() {
					const picked = [];
					d.$wrapper.find(".rd-rc:checked").each(function () { picked.push(this.value); });
					if (!picked.length) return;
					Promise.all(picked.map((n) => frappe.call({ method: API + ".get_repair_receipt", args: { name: n } })))
						.then((rs) => {
							rs.forEach((res) => {
								const m = res.message;
								m.items.forEach((it) => {
									const l = blankLine();
									l.item_type = it.item_type || "";
									l.narration = it.narration || "";
									l.qty = it.qty || 1;
									l.jd_ref = m.jd_ref || "";
									l.receipt = m.name;
									l.remarks = it.remarks || "";
									const t = (BOOT.item_types || []).find((x) => x.name === l.item_type);
									if (t) l.polish_rate = flt(t.polish_rate);
									LINES.push(l);
								});
							});
							LINES = LINES.filter((l) => l.receipt || l.item_type || l.narration || l.total_amt);
							d.hide();
							paint();
						});
				},
			});
			d.get_field("b").$wrapper.html(recs.map((x) => `
				<label style="display:flex;gap:8px;align-items:center;padding:5px 2px;font-size:12.5px;cursor:pointer;">
					<input type="checkbox" class="rd-rc" value="${esc(x.name)}" checked style="width:15px;height:15px;accent-color:#1f618d;">
					<b>${esc(x.name)}</b> · ${esc(x.receipt_date || "")} · ${__("JD REF#")} ${esc(x.jd_ref || "—")} · ${x.piece_count} ${__("pc")}</label>`).join(""));
			d.show();
		});
	});

	// ---- save / status / new ---------------------------------------------------
	function payload() {
		return {
			name: CUR, party: (root.find(".rd-party").val() || "").trim().toUpperCase(),
			bill_date: root.find(".rd-date").val(), tm_rate: flt(root.find(".rd-tm").val()),
			dia_rate: flt(root.find(".rd-dia").val()), status: STATUS === "Delivered" ? undefined : STATUS,
			items: LINES.filter((l) => l.item_type || l.narration || l.receipt),
		};
	}

	function save(then) {
		const p = payload();
		if (!p.party) return frappe.show_alert({ message: __("Pick the party first."), indicator: "orange" }, 3);
		if (!p.items.length) return frappe.show_alert({ message: __("Nothing on the bill yet."), indicator: "orange" }, 3);
		frappe.call({ method: API + ".save_repair_bill", args: { payload: JSON.stringify(p) } }).then((r) => {
			loadBill(r.message);
			frappe.show_alert({ message: __("{0} saved.", [r.message.name]), indicator: "green" }, 3);
			paintOpen();
			if (then) then();
		});
	}
	root.on("click", ".rd-save", () => save());
	root.on("click", ".rd-bill", () => save(() =>
		frappe.call({ method: API + ".set_repair_bill_status", args: { name: CUR, status: "Billed" } }).then(() => {
			STATUS = "Billed";
			paint();
			paintOpen();
			frappe.show_alert({ message: __("{0} marked BILLED.", [CUR]), indicator: "green" }, 4);
		})));

	function clearAll() {
		CUR = null;
		STATUS = "In Progress";
		LINES = [blankLine()];
		root.find(".rd-party, .rd-tm, .rd-dia").val("");
		root.find(".rd-date").val(frappe.datetime.get_today());
		paint();
	}
	root.on("click", ".rd-new", clearAll);

	function loadBill(m) {
		CUR = m.name;
		STATUS = m.status;
		root.find(".rd-party").val(m.party);
		root.find(".rd-date").val(m.bill_date);
		root.find(".rd-tm").val(m.tm_rate || "");
		root.find(".rd-dia").val(m.dia_rate || "");
		LINES = (m.items || []).map((i) => Object.assign(blankLine(), i));
		if (!LINES.length) LINES = [blankLine()];
		paint();
	}
	root.on("click", ".rd-openb", function (e) {
		e.preventDefault();
		frappe.call({ method: API + ".get_repair_bill", args: { name: this.getAttribute("data-n") } })
			.then((r) => loadBill(r.message));
	});

	// ---- print: the worksheet bill, on paper ------------------------------------
	root.on("click", ".rd-print", () => {
		const t = paintTotals();
		const party = (root.find(".rd-party").val() || "").toUpperCase();
		const rows = LINES.filter((l) => l.item_type || l.narration).map((l, i) => `<tr>
			<td>${i + 1}</td><td class="l">${esc(l.narration || l.item_type)}</td><td>${l.qty || 1}</td>
			<td>${l.solder_count || ""}</td><td>${m2(l.solder_amt)}</td>
			<td>${l.polish ? "Y" : "N"}</td><td>${m2(l.polish_amt)}</td>
			<td class="l">${esc(l.other_desc || "")}</td><td>${m2(l.other_amt)}</td>
			<td>${l.stn_fix_units || ""}</td><td>${m2(l.repair_charges)}</td>
			<td>${l.add_wt_75 ? l.add_wt_75.toFixed(3) : ""}</td><td>${m2(l.add_wt_75_amt)}</td>
			<td>${l.add_wt_92 ? l.add_wt_92.toFixed(3) : ""}</td><td>${m2(l.add_wt_92_amt)}</td>
			<td>${l.dmd_qty || ""}</td><td>${l.dmd_wt ? l.dmd_wt.toFixed(3) : ""}</td>
			<td>${l.dmd_tot_ct ? l.dmd_tot_ct.toFixed(3) : ""}</td><td>${m2(l.dmd_amt)}</td>
			<td class="l">${esc(l.jd_ref || "")}</td><td class="l">${esc((l.service ? "SERVICE " : "") + (l.remarks || ""))}</td>
			<td><b>${m2(l.total_amt)}</b></td></tr>`).join("");
		const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(CUR)}</title><style>
			@page{size:A4 landscape;margin:9mm;}
			body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;}
			h1{font-size:16px;margin:0 0 2px;}
			.sub{font-size:10.5px;color:#444;margin-bottom:8px;}
			table{width:100%;border-collapse:collapse;font-size:9px;}
			th,td{border:1px solid #999;padding:2px 4px;text-align:right;white-space:nowrap;}
			th{background:#eee;font-size:8px;text-transform:uppercase;}
			td.l,th.l{text-align:left;}
			tr{page-break-inside:avoid;}
			.ft{margin-top:8px;font-size:11px;width:auto;margin-left:auto;}
			.ft td{border:1px solid #999;padding:3px 10px;}
			.ft tr:last-child td{font-weight:bold;background:#eee;}
		</style></head><body>
			<h1>${__("REPAIR BILL")} ${esc(CUR)} — ${esc(party)}</h1>
			<div class="sub">${esc(root.find(".rd-date").val())} · TM ${m2(flt(root.find(".rd-tm").val()))}
				· 18K ${m2(r18())}/g · 22K ${m2(r22())}/g · DIA ${m2(flt(root.find(".rd-dia").val()))}/ct · ${esc(STATUS)}</div>
			<table><thead><tr>
				<th>SL#</th><th class="l">${__("Narration")}</th><th>${__("Qty")}</th><th>${__("Solders")}</th><th>${__("Solder ₹")}</th>
				<th>${__("Pol")}</th><th>${__("Pol ₹")}</th><th class="l">${__("Other")}</th><th>${__("Other ₹")}</th><th>${__("StnFix")}</th>
				<th>${__("Repair ₹")}</th><th>${__("Add75 g")}</th><th>${__("Add75 ₹")}</th><th>${__("Add92 g")}</th><th>${__("Add92 ₹")}</th>
				<th>${__("Stn qty")}</th><th>${__("ct/stn")}</th><th>${__("Tot ct")}</th><th>${__("Stone ₹")}</th>
				<th class="l">${__("JD REF#")}</th><th class="l">${__("Remarks")}</th><th>${__("TOTAL ₹")}</th>
			</tr></thead><tbody>${rows}</tbody></table>
			<table class="ft">
				<tr><td class="l">${__("TOT REPAIR CHARGES")}</td><td>${m2(t.rep)}</td></tr>
				<tr><td class="l">${__("TOT STONE CHARGES")}</td><td>${m2(t.dmd)}</td></tr>
				<tr><td class="l">${__("ADD WEIGHT-75")} (${t.w75.toFixed(3)} g)</td><td>${m2(t.w75a)}</td></tr>
				<tr><td class="l">${__("ADD WEIGHT-92")} (${t.w92.toFixed(3)} g)</td><td>${m2(t.w92a)}</td></tr>
				<tr><td class="l">${__("GRAND TOTAL")}</td><td>${m2(t.g)}</td></tr>
			</table>
		</body></html>`;
		document.getElementById("rd-print-frame")?.remove();
		const fr = document.createElement("iframe");
		fr.id = "rd-print-frame";
		fr.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
		document.body.appendChild(fr);
		fr.srcdoc = html;
		fr.onload = () => setTimeout(() => { fr.contentWindow.focus(); fr.contentWindow.print(); }, 150);
	});

	// arriving from Repair Bills with a bill to open
	const opts = frappe.route_options || {};
	clearAll();
	boot(() => {
		if (opts.bill) {
			frappe.route_options = null;
			frappe.call({ method: API + ".get_repair_bill", args: { name: opts.bill } })
				.then((r) => loadBill(r.message));
		}
	});
};
