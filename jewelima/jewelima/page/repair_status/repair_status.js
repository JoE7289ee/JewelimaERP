// Repair Status (REPAIR > Repair Status) — every batch as a card, the same card
// the intake screen shows when a batch is taken in: what came in, from whom, and
// what each piece is. A billed batch turns blue and carries its charge.
//
// Print gives the cards on paper, which is what gets handed across with the work.
// Route: /app/repair-status
frappe.pages["repair-status"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Repair Status"), single_column: true });
	const API = "jewelima.jewelima.repair_api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const cint = (v) => parseInt(v, 10) || 0;
	// opens on what is still here: the batches with us are the ones anyone came
	// to this page to look at
	const S = { rows: [], parties: [], party: "", state: "open", q: "" };

	$(page.main).append(`
		<style>
		.re-add-wrap{margin-top:9px;display:flex;gap:9px;align-items:center;}
		table.re-tbl tbody tr.re-fresh td{background:rgba(31,97,141,.09);}
		.re-fresh a.rf-x{color:#b02a2a;cursor:pointer;font-size:17px;}
		table.re-tbl td input,table.re-tbl td select{width:100%;box-sizing:border-box;
			border:1px solid var(--border-color);border-radius:7px;padding:5px 8px;font-size:12.5px;
			background:var(--fg-color);color:var(--text-color);}
		table.re-tbl td.n input{text-align:right;font-variant-numeric:tabular-nums;}
		.re-st{font-size:11px;line-height:1.4;cursor:pointer;min-height:26px;padding-top:3px;}
		.re-st.locked{cursor:default;opacity:.6;}
		.re-addst{color:var(--text-muted);font-style:italic;border-bottom:1px dashed var(--border-color);}
		.re-row select.re-kt{width:100%;box-sizing:border-box;border:1px solid var(--border-color);
			border-radius:7px;padding:5px 7px;font-size:12.5px;background:var(--fg-color);color:var(--text-color);}
		#page-repair-status .container{max-width:100%;}
		.rs-wrap{max-width:100%;}
		.rs-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px;}
		.rs-pill{border:1px solid var(--border-color);background:var(--fg-color);color:var(--text-muted);
			border-radius:999px;padding:5px 13px;font-size:11.5px;cursor:pointer;font-weight:600;}
		.rs-pill.on{background:#1f618d;border-color:#1f618d;color:#fff;}
		.rs-sel,.rs-q{border:1px solid var(--border-color);border-radius:8px;height:31px;padding:2px 11px;
			font-size:12.5px;background:var(--fg-color);color:var(--text-color);}
		.rs-q{width:200px;}
		.rs-tiles{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;}
		.rs-tile{border:1px solid var(--border-color);border-radius:11px;background:var(--fg-color);
			padding:9px 16px;min-width:106px;}
		.rs-tile .k{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);}
		.rs-tile .v{font-size:19px;font-weight:800;font-variant-numeric:tabular-nums;}
		/* the two that say what is outstanding carry the colour */
		.rs-tile:nth-child(4){border-color:rgba(29,122,51,.40);background:rgba(29,122,51,.07);}
		.rs-tile:nth-child(4) .v{color:#1d7a33;}
		.rs-tile:nth-child(3) .v{color:#8a6d00;}
		[data-theme="dark"] .rs-tile:nth-child(4) .v{color:#7fc98f;}
		[data-theme="dark"] .rs-tile:nth-child(3) .v{color:#e8c66b;}

		/* The card from the intake screen, kept: green while it is with us, blue
		   once it has been billed and gone back.
		   The tint is rgba over whatever the theme paints, NOT a fixed pale fill.
		   It used to be #eaf6ec with the table text left on var(--text-color) —
		   which is near-white on the dark theme, so every row of every batch was
		   white on pale green and could not be read at all. */
		.rs-card{border:1px solid rgba(29,122,51,.35);border-left:3px solid #1d7a33;
			background:rgba(29,122,51,.07);color:#1d7a33;border-radius:11px;
			padding:12px 15px;margin-bottom:12px;}
		.rs-card.billed{border-color:rgba(31,97,141,.35);border-left-color:#1f618d;
			background:rgba(31,97,141,.07);color:#1f618d;}
		[data-theme="dark"] .rs-card{color:#7fc98f;border-left-color:#3f9d57;}
		[data-theme="dark"] .rs-card.billed{color:#8fc1e8;border-left-color:#5b9bd5;}
		.rs-card .top{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;}
		.rs-card b.id{font-size:15px;}
		.rs-card .meta{font-size:12px;}
		.rs-card .tag{margin-left:auto;font-size:10.5px;font-weight:800;text-transform:uppercase;
			letter-spacing:.05em;padding:2px 9px;border-radius:999px;
			background:rgba(128,128,128,.16);border:1px solid currentColor;}
		.rs-card table{width:100%;margin-top:8px;font-size:12px;color:var(--text-color);}
		.rs-card th{text-align:left;font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;
			padding:4px 6px;color:inherit;opacity:.75;border-bottom:1px solid rgba(29,122,51,.28);}
		.rs-card.billed th{border-bottom-color:rgba(31,97,141,.28);}
		.rs-card td{padding:4px 6px;border-bottom:1px solid rgba(128,128,128,.20);}
		/* banded, so a long batch does not lose your line reading across */
		.rs-card tbody tr:nth-child(even) td{background:rgba(128,128,128,.06);}
		.rs-card tbody tr:hover td{background:rgba(29,122,51,.10);}
		.rs-card.billed tbody tr:hover td{background:rgba(31,97,141,.10);}
		.rs-card .note{margin-top:6px;font-size:11.5px;font-style:italic;}
		/* only a batch still with us can be edited — once billed the two records
		   have to keep agreeing, so the button is not drawn */
		/* Edit and Print are the same kind of thing and now look it — the Print
		   button carried no styling at all and rendered as a raw browser button
		   in the middle of a coloured card. */
		.rs-edit,.rs-print{border:1px solid currentColor;background:transparent;color:inherit;
			border-radius:7px;font-size:11px;font-weight:800;padding:2px 11px;cursor:pointer;
			line-height:1.6;}
		.rs-edit:hover,.rs-print:hover{background:rgba(128,128,128,.18);}
		.rs-open{border:none;background:none;color:inherit;font-size:11.5px;font-weight:800;
			text-decoration:underline;cursor:pointer;padding:0 0 0 6px;font-style:normal;}
		table.re-tbl{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.re-tbl th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em;
			color:var(--text-muted);padding:6px 7px;border-bottom:1.5px solid var(--border-color);
			background:var(--control-bg);white-space:nowrap;}
		table.re-tbl th.n,table.re-tbl td.n{text-align:right;}
		table.re-tbl td{padding:5px 7px;border-bottom:1px solid var(--border-color);vertical-align:top;}
		table.re-tbl td:first-child{white-space:nowrap;}
		table.re-tbl td select.re-kt,table.re-tbl td select.rf-kt{min-width:62px;}
		table.re-tbl tbody tr:nth-child(even) td{background:rgba(128,128,128,.055);}
		table.re-tbl tbody tr.done td{opacity:.55;}
		.re-lock{font-size:10px;color:var(--text-muted);font-weight:400;}
		.re-row .lab{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);}
		.re-row input{width:100%;box-sizing:border-box;border:1px solid var(--border-color);
			border-radius:7px;padding:6px 9px;font-size:12.5px;background:var(--fg-color);color:var(--text-color);}
		.re-row .ro{font-size:12.5px;padding:6px 0;}
		.re-row .ro b{font-size:13px;}
		.re-works{display:flex;flex-wrap:wrap;gap:4px;align-items:center;}
		.re-works input{flex:1 1 90px;min-width:80px;}
		.re-chip{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:700;
			padding:2px 4px 2px 9px;border-radius:999px;background:#e9f0f7;color:#1f618d;
			border:1px solid #b9d0e6;white-space:nowrap;}
		.re-chip b{cursor:pointer;font-size:13px;line-height:1;opacity:.65;}
		.re-chip b:hover{opacity:1;}
		.rs-none{padding:44px;text-align:center;color:var(--text-muted);}
		@media print {
			.rs-bar, .rs-tiles, .page-head, .navbar, .page-actions,
			.rs-edit, .rs-open { display:none !important; }
			.rs-card { break-inside:avoid; page-break-inside:avoid; }
		}
		</style>
		<div class="rs-wrap">
			<div class="rs-bar">
				<span class="rs-pill" data-s="all">${__("All")}</span>
				<span class="rs-pill on" data-s="open">${__("With us")}</span>
				<span class="rs-pill" data-s="billed">${__("Billed")}</span>
				<select class="rs-sel rs-party"></select>
				<input class="rs-q" placeholder="${__("Filter repair, design or work")}">
			</div>
			<div class="rs-tiles"></div>
			<div class="rs-body"></div>
		</div>`);
	const root = $(page.main);

	function visible() {
		const q = S.q.trim().toLowerCase();
		return S.rows.filter((r) => !q
			|| r.name.toLowerCase().includes(q)
			|| (r.party || "").toLowerCase().includes(q)
			|| (r.items || []).some((i) =>
				(i.design_type || "").toLowerCase().includes(q)
				|| (i.repair || "").toLowerCase().includes(q)
				|| (i.repair_type || "").toLowerCase().includes(q)
				|| (i.work_types || []).join(" ").toLowerCase().includes(q)));
	}

	function paint() {
		const rows = visible();
		const t = { batches: rows.length,
			pieces: rows.reduce((a, r) => a + r.total_qty, 0),
			weight: rows.reduce((a, r) => a + flt(r.total_weight), 0),
			open: rows.filter((r) => !r.bill).length };
		root.find(".rs-tiles").html(`
			<div class="rs-tile"><div class="k">${__("Batches")}</div><div class="v">${t.batches}</div></div>
			<div class="rs-tile"><div class="k">${__("Pieces")}</div><div class="v">${t.pieces}</div></div>
			<div class="rs-tile"><div class="k">${__("Weight in")}</div><div class="v">${t.weight.toFixed(3)}<span style="font-size:11px;"> g</span></div></div>
			<div class="rs-tile"><div class="k">${__("Still with us")}</div><div class="v">${t.open}</div></div>`);

		root.find(".rs-body").html(rows.length ? rows.map((r) => `
			<div class="rs-card ${r.bill ? "billed" : ""}">
				<div class="top">
					<b class="id">${esc(r.name)}</b>
					<span class="meta">${__("taken in from")} <b>${esc(r.party)}</b>
						· ${esc(r.received_at)} · ${r.total_rows} ${__("line(s)")}
						· ${r.total_qty} ${__("piece(s)")}${r.total_weight
							? " · " + flt(r.total_weight).toFixed(3) + " g" : ""}</span>
					<span class="tag">${r.bill
						? __("billed {0}", [esc(r.billed_at)])
						: __("with us")}</span>
					${r.bill ? "" : `<button class="rs-edit" data-n="${esc(r.name)}">${__("Edit")}</button>`}
					<button class="rs-print" data-n="${esc(r.name)}">${__("Print")}</button>
				</div>
				<table><thead><tr>
					<th>${__("Repair")}</th><th>${__("Design Type")}</th><th>${__("Qty")}</th>
					<th>${__("Weight")}</th><th>${__("Type of Work")}</th><th>${__("Type")}</th>
					<th>${__("Narration")}</th>
				</tr></thead><tbody>${(r.items || []).map((i) => `
					<tr><td><b>${esc(i.repair)}</b></td><td>${esc(i.design_type)}</td>
					<td>${i.qty}</td>
					<td>${i.weight ? flt(i.weight).toFixed(3) + " g" : "—"}</td>
					<td>${esc((i.work_types || []).join(", ") || "—")}</td>
					<td>${esc(i.repair_type || "—")}</td>
					<td>${esc(i.narration || "")}</td></tr>`).join("")}</tbody></table>
				${r.narration ? `<div class="note">${esc(r.narration)}</div>` : ""}
				${r.bill ? `<div class="note">${__("Bill {0} · {1} g metal added · {2} charged",
					[esc(r.bill), flt(r.metal_added).toFixed(3), format_currency(r.charges)])}
					<button class="rs-open" data-n="${esc(r.name)}">${__("open bill")}</button></div>`
					: `<div class="note"><button class="rs-open" data-n="${esc(r.name)}">${
						__("bill this")}</button></div>`}
			</div>`).join("") : `<div class="rs-none">${__("Nothing matches.")}</div>`);
	}

	function load() {
		frappe.call({ method: API + ".get_repair_status", freeze: false,
			args: { party: S.party || null, state: S.state } }).then((r) => {
			const m = r.message || {};
			S.rows = m.rows || [];
			S.sieves = m.sieves || S.sieves || [];
			S.designTypes = m.design_types || S.designTypes || [];
			if (!WORKS.length) {
				frappe.call({ method: API + ".get_repair_work_types", freeze: false })
					.then((w) => (WORKS = (w.message || []).map((x) => x.work_name)));
			}
			if (!S.parties.length) {
				S.parties = m.parties || [];
				root.find(".rs-party").html(`<option value="">${__("Every party")}</option>`
					+ S.parties.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join(""));
			}
			paint();
		});
	}

	root.on("click", ".rs-pill", function () {
		root.find(".rs-pill").removeClass("on"); this.classList.add("on");
		S.state = this.dataset.s; load();
	});
	root.on("change", ".rs-party", function () { S.party = this.value; load(); });
	root.on("input", ".rs-q", function () { S.q = this.value; paint(); });

	// ---- filling in what the counter did not have time for ------------------
	let WORKS = [];
	root.on("click", ".rs-print", function () {
		const name = this.getAttribute("data-n");
		frappe.call({ method: API + ".get_repair_order", args: { name } })
			.then((r) => jewelima.printRepairOrder(r.message));
	});

	root.on("click", ".rs-edit", function () {
		const name = this.getAttribute("data-n");
		const r = S.rows.find((x) => x.name === name);
		if (!r) return;
		// a working copy — nothing on screen changes unless it is saved
		const rows = (r.items || []).map((i) => ({
			repair: i.repair, design_type: i.design_type, qty: i.qty,
			weight: i.weight || "", work_types: (i.work_types || []).slice(),
			narration: i.narration || "",
			// the weigh-out and what it is made of, so the whole piece can be
			// finished here rather than only at the billing counter
			weight_out: i.weight_out || "", karat: i.karat || "",
			stones: JSON.parse(JSON.stringify(i.stones || [])),
			bill: i.bill || "",
		}));

		const dlg = new frappe.ui.Dialog({
			title: __("{0} — {1}", [name, r.party]), size: "extra-large",
			primary_action_label: __("Save"),
			primary_action() {
				const real = fresh.filter((f) => (f.design_type || "").trim());
				const half = fresh.filter((f) => !(f.design_type || "").trim() &&
					(String(f.weight || "").trim() || (f.work_types || "").trim()));
				if (half.length) return frappe.msgprint(
					__("{0} new line(s) have no design type.", [half.length]));

				// new pieces join the batch first, so they are numbered before the
				// edits below re-read it
				const addFirst = real.length
					? frappe.call({ method: API + ".add_repair_pieces",
						args: { name, items: JSON.stringify(real) } })
					: Promise.resolve();

				addFirst.then(() => frappe.call({ method: API + ".update_repair_order", args: {
					name, items: JSON.stringify(rows),
				} })).then(() => frappe.call({ method: API + ".save_repair_weights", args: {
					repair_order: name,
					rows: JSON.stringify(rows.filter((x) => !x.bill).map((x) => ({
						repair: x.repair, weight_out: parseFloat(x.weight_out) || 0,
						karat: x.karat || "" }))),
				} })).then(() => {
					const withStones = rows.filter((x) => !x.bill);
					return withStones.reduce((chain, x) => chain.then(() =>
						frappe.call({ method: API + ".set_piece_stones", args: {
							repair_order: name, repair: x.repair,
							stones: JSON.stringify(x.stones || []) } })), Promise.resolve());
				}).then(() => {
					dlg.hide();
					frappe.show_alert({ message: __("{0} updated", [name]), indicator: "green" }, 4);
					load();
				});
			},
		});

		const paintDlg = () => {
			// One header row instead of a label on every cell. The grid grew from
			// five columns to eight as weigh-out, purity and stones were added, and
			// a dialog that repeats "WEIGHT IN G" once per piece is unreadable by
			// the third row.
			const head = `<tr><th>${__("Repair")}</th><th>${__("Design")}</th>
				<th class="n">${__("Qty")}</th><th class="n">${__("In g")}</th>
				<th class="n">${__("Out g")}</th><th>${__("Purity")}</th>
				<th>${__("Stones")}</th><th>${__("Type of Work")}</th>
				<th>${__("Narration")}</th><th style="width:26px;"></th></tr>`;
			const body = rows.map((x, k) => `
				<tr class="re-row ${x.bill ? "done" : ""}" data-k="${k}">
					<td><b>${esc(x.repair)}</b>${x.bill
						? `<div class="re-lock">${esc(x.bill)}</div>` : ""}</td>
					<td>${esc(x.design_type)}</td>
					<td class="n">${x.qty}</td>
					<td class="n"><input class="re-wt" type="number" min="0" step="0.001"
						value="${x.weight}" ${x.bill ? "disabled" : ""}></td>
					<td class="n"><input class="re-wo" type="number" min="0" step="0.001"
						value="${x.weight_out}" ${x.bill ? "disabled" : ""}></td>
					<td><select class="re-kt" ${x.bill ? "disabled" : ""}>${
						["", "22", "18", "14", "9"].map((k2) =>
							`<option value="${k2}" ${(x.karat || "") === k2 ? "selected" : ""}>${k2 || "—"}</option>`
						).join("")}</select></td>
					<td><div class="re-st ${x.bill ? "locked" : ""}">${x.stones.length
						? x.stones.map((st) => `${esc(st.bucket || st.stone || "")} ${esc(st.sieve || "")} ${
							cint(st.pcs)}/${(parseFloat(st.ct) || 0).toFixed(3)}`).join("<br>")
						: `<span class="re-addst">${x.bill ? __("none") : __("add stone")}</span>`}</div></td>
					<td><div class="re-works">
						${x.work_types.map((w) =>
							`<span class="re-chip">${esc(w)}<b data-w="${esc(w)}">&times;</b></span>`).join("")}
						<input class="re-work" list="re-works-list"
							placeholder="${x.work_types.length ? __("add another") : __("add")}">
					</div></td>
					<td><input class="re-nar" value="${esc(x.narration)}"
						placeholder="${__("optional")}" ${x.bill ? "disabled" : ""}></td>
					<td></td>
				</tr>`).join("");
			$(dlg.body).find(".re-list").html(
				`<table class="re-tbl"><thead>${head}</thead><tbody>${body}</tbody></table>`);
		};

		$(dlg.body).html(`
			<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">
				${__("Taken in {0}", [esc(r.received_at)])}
			</div>
			<div class="re-list"></div>
			<div class="re-add-wrap">
				<button class="btn btn-default btn-xs re-add">+ ${__("another piece")}</button>
				<span class="re-add-hint"></span>
			</div>
			<datalist id="re-works-list">${WORKS.map((w) => `<option value="${esc(w)}">`).join("")}</datalist>
			<datalist id="re-dt-list">${(S.designTypes || []).map((w) => `<option value="${esc(w)}">`).join("")}</datalist>`);
		paintDlg();

		$(dlg.body).on("input", ".re-wt", function () {
			rows[cint($(this).closest(".re-row").data("k"))].weight = this.value;
		});
		// Pieces added here are CREATED when the dialog is saved, so they are kept
		// in their own list — mixing them into `rows` would send a row with no
		// repair number through the edit path, which only knows how to update.
		const fresh = [];
		const paintFresh = () => {
			// the new pieces are rows of the SAME table as the existing ones, so the
			// columns line up and the header applies to both
			$(dlg.body).find("tr.re-fresh").remove();
			const html = fresh.map((f, k) => `
				<tr class="re-row re-fresh" data-f="${k}">
					<td><i>${__("new")}</i></td>
					<td><input class="rf-dt" list="re-dt-list" value="${esc(f.design_type)}"
						placeholder="${__("design type")}"></td>
					<td class="n"><input class="rf-qty" type="number" min="1" step="1" value="${f.qty}"></td>
					<td class="n"><input class="rf-wt" type="number" min="0" step="0.001" value="${f.weight}"></td>
					<td class="n">—</td>
					<td><select class="rf-kt">${["22","18","14","9"].map((k2) =>
						`<option value="${k2}" ${f.karat === k2 ? "selected" : ""}>${k2}</option>`).join("")}</select></td>
					<td>—</td>
					<td><input class="rf-work" list="re-works-list" value="${esc(f.work_types)}"
						placeholder="${__("comma separated")}"></td>
					<td><input class="rf-nar" value="${esc(f.narration)}"
						placeholder="${__("optional")}"></td>
					<td class="n"><a class="rf-x" title="${__("Remove")}">&times;</a></td>
				</tr>`).join("");
			$(dlg.body).find("table.re-tbl tbody").append(html);
		};
		$(dlg.body).on("click", ".re-add", () => {
			fresh.push({ design_type: "", qty: 1, weight: "", karat: "18", work_types: "", narration: "" });
			paintFresh();
		});
		$(dlg.body).on("click", ".rf-x", function () {
			fresh.splice(cint($(this).closest(".re-fresh").data("f")), 1); paintFresh();
		});
		$(dlg.body).on("input change", ".rf-dt, .rf-qty, .rf-wt, .rf-kt, .rf-work, .rf-nar", function () {
			const f = fresh[cint($(this).closest(".re-fresh").data("f"))];
			if (!f) return;
			const $r = $(this).closest(".re-fresh");
			f.design_type = $r.find(".rf-dt").val();
			f.qty = $r.find(".rf-qty").val();
			f.weight = $r.find(".rf-wt").val();
			f.karat = $r.find(".rf-kt").val();
			f.work_types = $r.find(".rf-work").val();
			f.narration = $r.find(".rf-nar").val();
		});

		$(dlg.body).on("input", ".re-wo", function () {
			rows[cint($(this).closest(".re-row").data("k"))].weight_out = this.value;
		});
		$(dlg.body).on("change", ".re-kt", function () {
			rows[cint($(this).closest(".re-row").data("k"))].karat = this.value || "";
		});
		$(dlg.body).on("click", ".re-st", function () {
			const k = cint($(this).closest(".re-row").data("k"));
			if (rows[k].bill) return;                 // settled — its stones are the bill's
			jewelima.repairStoneDialog(rows[k].stones, S.sieves || [], (out) => {
				rows[k].stones = out; paintDlg();
			});
		});
		$(dlg.body).on("input", ".re-nar", function () {
			rows[cint($(this).closest(".re-row").data("k"))].narration = this.value;
		});
		const addWork = (k, val) => {
			const v = (val || "").trim();
			if (!v) return;
			const w = rows[k].work_types;
			if (!w.some((x) => x.toLowerCase() === v.toLowerCase())) w.push(v);
			paintDlg();
			$(dlg.body).find(`.re-row[data-k="${k}"] .re-work`).trigger("focus");
		};
		$(dlg.body).on("keydown", ".re-work", function (e) {
			if (e.key !== "Enter" && e.key !== ",") return;
			e.preventDefault();
			addWork(cint($(this).closest(".re-row").data("k")), this.value);
			this.value = "";
		});
		$(dlg.body).on("change blur", ".re-work", function () {
			if (!this.value.trim()) return;
			addWork(cint($(this).closest(".re-row").data("k")), this.value);
			this.value = "";
		});
		$(dlg.body).on("click", ".re-chip b", function () {
			const k = cint($(this).closest(".re-row").data("k"));
			const w = this.getAttribute("data-w");
			rows[k].work_types = rows[k].work_types.filter((x) => x !== w);
			paintDlg();
		});
		dlg.show();
	});

	root.on("click", ".rs-open", function () {
		frappe.set_route("repair-billing", this.getAttribute("data-n"));
	});

	page.set_primary_action(__("Print"), () => window.print(), "printer");
	page.add_inner_button(__("New Repair Order"), () => frappe.set_route("new-repair-order"));
	page.add_inner_button(__("Billing"), () => frappe.set_route("repair-billing"));
	frappe.pages["repair-status"].on_page_show = load;
};
