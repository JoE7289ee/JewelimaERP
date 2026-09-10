// Rework (Delivery) — finished pieces go back to the floor. Scan them onto the
// table, choose where they go, send the lot in one press. Each piece's frozen
// weight leaves Finished Goods and returns to the In Bags pool, its card holds
// its materials again and waits in that queue. Design, HUID and certificates
// travel with it.
//
// It used to take one piece at a time, with the destination fixed at REWORK.
// Both were wrong for the counter: pieces come back by the handful, and the
// person holding one often knows exactly which bench it needs. So the scan
// builds a TABLE, and the destination is a choice that DEFAULTS to REWORK —
// the queue is still the honest answer when nobody knows yet.
// Route: /app/rework
frappe.pages["rework"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Rework"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	// the table, keyed by piece so a double scan cannot book one twice
	const S = { rows: [], sent: [], dest: "REWORK", locations: ["REWORK"] };

	$(page.main).append(`
		<style>
		#page-rework .container{max-width:100%;}
		.rw-top{display:flex;gap:14px;align-items:end;flex-wrap:wrap;margin-bottom:12px;}
		.rw-scan{min-width:280px;} .rw-dest{min-width:200px;}
		.rw-top .control-label{font-size:11px;color:var(--text-muted);}
		.rw-top .help-box{display:none !important;}
		.rw-msg{display:none;margin-bottom:12px;padding:9px 13px;border-radius:8px;font-size:13px;}
		.rw-msg.ok{display:block;background:#eaf6ec;color:#1d7a33;border:1px solid #bfe3c6;}
		.rw-msg.err{display:block;background:#fbeaea;color:#b00020;border:1px solid #e6b3b3;}
		.rw-msg.warn{display:block;background:#fdf3e3;color:#9a6700;border:1px solid #f0d9a8;}

		.rw-box{border:1px solid var(--border-color);border-radius:11px;overflow:auto;max-height:52vh;}
		table.rw-t{width:100%;border-collapse:separate;border-spacing:0;font-size:12.5px;background:var(--fg-color);}
		table.rw-t th{position:sticky;top:0;z-index:1;background:var(--control-bg,var(--fg-color));
			border-bottom:2px solid var(--gray-400,#aeb6bf);padding:7px 9px;text-align:left;font-weight:700;}
		table.rw-t td{border-bottom:1px solid var(--border-color);padding:5px 9px;vertical-align:top;}
		table.rw-t td.num,table.rw-t th.num{text-align:right;font-variant-numeric:tabular-nums;}
		table.rw-t td.bag{font-family:var(--font-family-monospace,monospace);font-weight:700;}
		table.rw-t tr.bad td{background:rgba(176,0,32,.06);}
		.rw-why{font-size:11px;color:#b00020;}
		.rw-warn{font-size:11px;color:#9a6700;}
		.rw-x{border:none;background:none;color:var(--text-muted);cursor:pointer;font-size:15px;line-height:1;padding:0 4px;}
		.rw-x:hover{color:#b00020;}
		.rw-none{padding:26px;text-align:center;color:var(--text-muted);font-size:12.5px;}

		.rw-kpis{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;}
		.rw-kpi{border:1px solid var(--border-color);border-radius:11px;padding:9px 15px;background:var(--fg-color);}
		.rw-kpi .k{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);font-weight:600;}
		.rw-kpi .v{font-size:19px;font-weight:800;line-height:1.25;font-variant-numeric:tabular-nums;}
		.rw-kpi .sub{font-size:11px;color:var(--text-muted);}
		.rw-kpi.gold .v{color:#8C6A00;}
		[data-theme="dark"] .rw-kpi.gold .v{color:#d9ad3c;}
		.rw-brk{flex:1 1 340px;}
		table.rw-bt{width:100%;border-collapse:collapse;font-size:11.5px;margin-top:4px;}
		table.rw-bt td{padding:1px 0;}
		table.rw-bt td.num{text-align:right;font-variant-numeric:tabular-nums;font-weight:700;}
		table.rw-bt td.t{color:var(--text-muted);padding-right:10px;}

		.rw-flow{margin-top:12px;padding:10px 13px;border-radius:9px;background:#eef5fa;
			border:1px solid #1f618d33;font-size:12.5px;color:#1f618d;}
		.rw-go{border:none;color:#fff;font-weight:800;padding:12px;border-radius:9px;cursor:pointer;
			background:#b8860b;margin-top:12px;width:100%;font-size:14px;}
		.rw-go:disabled{background:var(--control-bg);color:var(--text-muted);cursor:not-allowed;}
		</style>
		<div class="rw-top">
			<div class="rw-scan"></div>
			<div class="rw-dest"></div>
		</div>
		<div class="rw-msg"></div>
		<div class="rw-box"><table class="rw-t"><thead></thead><tbody></tbody></table></div>
		<div class="rw-kpis"></div>
		<div class="rw-foot"></div>`);

	const root = $(page.main);
	const mk = (sel, df) => {
		const c = frappe.ui.form.make_control({ df, parent: root.find(sel).get(0), render_input: true });
		c.refresh();
		return c;
	};
	const fScan = mk(".rw-scan", { fieldtype: "Data", label: __("Scan finished product"),
		fieldname: "scan", description: __("the E is optional — only a finished piece In Stock can go back") });
	const fDest = mk(".rw-dest", { fieldtype: "Select", label: __("Send to"), fieldname: "dest",
		options: ["REWORK"], default: "REWORK",
		change: () => { S.dest = fDest.get_value() || "REWORK"; paintFoot(); } });
	const focusScan = () => setTimeout(() => fScan.$input.focus(), 30);
	const msg = (kind, html) => root.find(".rw-msg").removeClass("ok err warn").addClass(kind).html(html);

	// only the pieces that can actually go — the rest sit on the table so the
	// counter can see WHY, and are never counted or sent
	const good = () => S.rows.filter((p) => p.can_rework);

	function paint() {
		const rows = S.rows;
		root.find(".rw-t thead").html(rows.length ? `<tr>
			<th>${__("Piece")}</th><th>${__("Design")}</th><th>${__("Held by")}</th>
			<th class="num">${__("Gross")}</th><th class="num">${__("Gold")}</th>
			<th class="num">${__("Stones")}</th><th>${__("HUID")}</th><th></th></tr>` : "");
		root.find(".rw-t tbody").html(rows.length ? rows.map((p, i) => `
			<tr class="${p.can_rework ? "" : "bad"}">
				<td class="bag">${esc(p.order_bag)}
					${!p.can_rework ? `<div class="rw-why">${esc(p.error || "")}</div>` : ""}
					${p.open_sale_prep ? `<div class="rw-warn">${__("on sale prep {0}", [esc(p.open_sale_prep)])}</div>` : ""}</td>
				<td>${esc(p.design || "")}${p.design_type ? `<div style="color:var(--text-muted);">${esc(p.design_type)}</div>` : ""}</td>
				<td>${esc(p.held_by || "—")}</td>
				<td class="num">${flt(p.gross).toFixed(3)}</td>
				<td class="num">${flt(p.gold).toFixed(3)}</td>
				<td class="num">${flt(p.stones).toFixed(3)}</td>
				<td>${esc(p.huid || "—")}</td>
				<td><button class="rw-x" data-i="${i}" title="${__("take off the table")}">×</button></td>
			</tr>`).join("")
			: `<tr><td class="rw-none">${__("Scan finished products onto the table, then send them back together.")}</td></tr>`);
		paintKpis();
		paintFoot();
	}

	// Below the table: what is on it, in the numbers the counter is answerable
	// for — total gross, the gold inside it, and the stones BY BRACKET, because
	// "2.4 ct of stones" is not something anyone can check a packet against.
	function paintKpis() {
		const g = good();
		if (!g.length) return root.find(".rw-kpis").empty();
		const gross = g.reduce((a, p) => a + flt(p.gross), 0);
		const gold = g.reduce((a, p) => a + flt(p.gold), 0);
		const brk = {};
		g.forEach((p) => (p.materials || []).forEach((m) => {
			if (!m.stone_type) return;
			brk[m.item] = flt(brk[m.item]) + flt(m.qty);
		}));
		const items = Object.keys(brk).sort();
		const stones = items.reduce((a, k) => a + brk[k], 0);
		root.find(".rw-kpis").html(`
			<div class="rw-kpi"><div class="k">${__("Pieces")}</div><div class="v">${g.length}</div>
				<div class="sub">${S.rows.length > g.length
					? __("{0} cannot go", [S.rows.length - g.length]) : __("all can go")}</div></div>
			<div class="rw-kpi"><div class="k">${__("Total gross")}</div><div class="v">${gross.toFixed(3)} g</div>
				<div class="sub">${__("leaves Finished Goods")}</div></div>
			<div class="rw-kpi gold"><div class="k">${__("Gold")}</div><div class="v">${gold.toFixed(3)} g</div>
				<div class="sub">${__("back to In Bags")}</div></div>
			<div class="rw-kpi rw-brk"><div class="k">${__("Stones by bracket")}</div>
				<div class="v">${stones.toFixed(3)} ct</div>
				${items.length ? `<table class="rw-bt">${items.map((k) => `
					<tr><td class="t">${esc(k)}</td><td class="num">${brk[k].toFixed(3)} ct</td></tr>`).join("")}</table>`
					: `<div class="sub">${__("no stones on these pieces")}</div>`}</div>`);
	}

	function paintFoot() {
		const g = good();
		root.find(".rw-foot").html(!S.rows.length ? "" : `
			<div class="rw-flow">${__("Their weight leaves <b>Finished Goods</b>, returns to <b>In Bags</b>, and the cards wait at <b>{0}</b>.", [esc(S.dest)])}</div>
			<button class="rw-go" ${g.length ? "" : "disabled"}>${
				g.length ? __("Send {0} piece(s) back to {1}", [g.length, esc(S.dest)])
					: __("Nothing on the table can go back")}</button>`);
	}

	function sentLabel() {
		page.set_secondary_action(
			__("Sent back this session ({0})", [S.sent.length]), showSent, "list");
	}

	function showSent() {
		if (!S.sent.length) {
			return frappe.msgprint({ title: __("Sent back this session"), indicator: "blue",
				message: __("Nothing has gone back yet from this page.") });
		}
		const gold = S.sent.reduce((a, x) => a + flt(x.gold), 0);
		frappe.msgprint({
			title: __("Sent back this session ({0})", [S.sent.length]),
			indicator: "green",
			message: `<table class="table table-bordered" style="font-size:12.5px;margin:0;">
				<thead><tr><th>${__("Piece")}</th><th>${__("To")}</th>
					<th style="text-align:right;">${__("Gold")}</th>
					<th style="text-align:right;">${__("Stones")}</th></tr></thead>
				<tbody>${S.sent.map((x) => `<tr>
					<td><b>${esc(x.bag)}</b></td><td>${esc(x.to)}</td>
					<td style="text-align:right;">${flt(x.gold).toFixed(3)} g</td>
					<td style="text-align:right;">${flt(x.stones).toFixed(3)} ct</td></tr>`).join("")}</tbody>
				<tfoot><tr><th colspan="2">${__("Total")}</th>
					<th style="text-align:right;">${gold.toFixed(3)} g</th><th></th></tr></tfoot></table>`,
		});
	}

	function lookup(code) {
		frappe.call({ method: API + ".get_rework_piece", args: { barcode: code }, freeze: false })
			.then((r) => {
				const p = r.message || {};
				if (!p.found) { msg("err", esc(p.error || __("Not found."))); focusScan(); return; }
				if (S.rows.some((x) => x.order_bag === p.order_bag)) {
					msg("warn", __("<b>{0}</b> is already on the table.", [esc(p.order_bag)]));
					focusScan();
					return;
				}
				S.rows.unshift(p);
				paint();
				if (!p.can_rework) msg("err", esc(p.error));
				else if (p.open_sale_prep) msg("warn", __("Careful — {0} is on an open sale preparation ({1}). Sending it back will pull it out of that sale.", [esc(p.order_bag), esc(p.open_sale_prep)]));
				else msg("ok", __("<b>{0}</b> is on the table — {1} piece(s) ready.", [esc(p.order_bag), good().length]));
				focusScan();
			});
	}

	fScan.$input.on("keydown", (e) => {
		if (e.which !== 13 && e.key !== "Enter") return;
		e.preventDefault();
		const code = (fScan.$input.val() || "").trim();
		fScan.set_value("");
		if (code) lookup(code);
	});

	root.on("click", ".rw-x", function () {
		S.rows.splice(cint($(this).data("i")), 1);
		paint();
		focusScan();
	});

	root.on("click", ".rw-go", function () {
		const g = good();
		if (!g.length) return;
		const gold = g.reduce((a, p) => a + flt(p.gold), 0);
		const stones = g.reduce((a, p) => a + flt(p.stones), 0);
		frappe.confirm(__("Send <b>{0}</b> piece(s) back to <b>{1}</b>?<br><br>{2} g of gold and {3} ct of stones leave Finished Goods, and these pieces stop being stock.",
			[g.length, esc(S.dest), gold.toFixed(3), stones.toFixed(3)]), () => {
			frappe.dom.freeze(__("Sending back…"));
			frappe.call({ method: API + ".rework_pieces",
				args: { order_bags: JSON.stringify(g.map((p) => p.order_bag)),
					to_location: S.dest, remarks: null } })
				.then((r) => {
					frappe.dom.unfreeze();
					const m = r.message || {};
					const okNames = new Set((m.sent || []).map((x) => x.order_bag));
					(m.sent || []).forEach((x) => S.sent.unshift({
						bag: x.order_bag, to: x.to, gold: x.gold, stones: x.stones }));
					// what went is off the table; what could not stays, with its reason
					const failed = {};
					(m.failed || []).forEach((f) => { failed[f.order_bag] = f.error; });
					S.rows = S.rows.filter((p) => !okNames.has(p.order_bag)).map((p) => (
						failed[p.order_bag] ? { ...p, can_rework: 0, error: failed[p.order_bag] } : p));
					paint();
					sentLabel();
					if ((m.failed || []).length) {
						msg("warn", __("{0} sent to {1}. <b>{2} could not go</b> and are still on the table: {3}",
							[(m.sent || []).length, esc(S.dest), m.failed.length,
								m.failed.map((f) => esc(f.order_bag)).join(", ")]));
					} else {
						msg("ok", __("<b>{0}</b> piece(s) are back on the floor at <b>{1}</b> — {2} g of gold returned.",
							[(m.sent || []).length, esc(S.dest), flt(m.gold).toFixed(3)]));
					}
					frappe.show_alert({ indicator: (m.failed || []).length ? "orange" : "green",
						message: __("{0} → {1}", [(m.sent || []).length, esc(S.dest)]) }, 5);
					focusScan();
				})
				.catch(() => frappe.dom.unfreeze());
		});
	});

	frappe.call({ method: API + ".get_rework_destinations", freeze: false }).then((r) => {
		const d = r.message || {};
		S.locations = d.locations && d.locations.length ? d.locations : ["REWORK"];
		S.dest = d.default || S.locations[0];
		fDest.df.options = S.locations;
		fDest.refresh();
		fDest.set_value(S.dest);
		paintFoot();
	});

	sentLabel();
	paint();
	frappe.pages["rework"].on_page_show = focusScan;
	focusScan();
};
