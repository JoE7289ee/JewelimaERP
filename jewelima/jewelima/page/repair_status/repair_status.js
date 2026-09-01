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
	const S = { rows: [], parties: [], party: "", state: "all", q: "" };

	$(page.main).append(`
		<style>
		.re-add-wrap{margin-top:9px;display:flex;gap:9px;align-items:center;}
		.re-fresh{background:var(--control-bg);border-radius:8px;}
		.re-fresh a.rf-x{color:#b02a2a;cursor:pointer;font-size:17px;}
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

		/* the card from the intake screen, kept: green while it is with us,
		   blue once it has been billed and gone back */
		.rs-card{border:1px solid #bfe3c6;background:#eaf6ec;color:#1d7a33;border-radius:11px;
			padding:12px 15px;margin-bottom:12px;}
		.rs-card.billed{border-color:#b9d0e6;background:#e9f0f7;color:#1f618d;}
		.rs-card .top{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;}
		.rs-card b.id{font-size:15px;}
		.rs-card .meta{font-size:12px;}
		.rs-card .tag{margin-left:auto;font-size:10.5px;font-weight:800;text-transform:uppercase;
			letter-spacing:.05em;padding:2px 9px;border-radius:999px;background:rgba(255,255,255,.65);}
		.rs-card table{width:100%;margin-top:8px;font-size:12px;color:var(--text-color);}
		.rs-card th{text-align:left;font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;
			padding:3px 6px;color:#4f7a58;border-bottom:1px solid #cfe6d4;}
		.rs-card.billed th{color:#4a6b8a;border-bottom-color:#cddcea;}
		.rs-card td{padding:3px 6px;border-bottom:1px solid #cfe6d4;}
		.rs-card.billed td{border-bottom-color:#cddcea;}
		.rs-card .note{margin-top:6px;font-size:11.5px;font-style:italic;}
		/* only a batch still with us can be edited — once billed the two records
		   have to keep agreeing, so the button is not drawn */
		.rs-edit{border:1px solid currentColor;background:rgba(255,255,255,.55);color:inherit;
			border-radius:7px;font-size:11px;font-weight:800;padding:2px 11px;cursor:pointer;}
		.rs-edit:hover{background:#fff;}
		.rs-open{border:none;background:none;color:inherit;font-size:11.5px;font-weight:800;
			text-decoration:underline;cursor:pointer;padding:0 0 0 6px;font-style:normal;}
		.re-row{display:grid;grid-template-columns:120px 1fr 60px 110px 1.4fr;gap:8px;
			align-items:start;padding:8px 0;border-bottom:1px solid var(--border-color);}
		.re-row:last-child{border-bottom:none;}
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
				<span class="rs-pill on" data-s="all">${__("All")}</span>
				<span class="rs-pill" data-s="open">${__("With us")}</span>
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
			$(dlg.body).find(".re-list").html(rows.map((x, k) => `
				<div class="re-row" data-k="${k}">
					<div><div class="lab">${__("Repair")}</div>
						<div class="ro"><b>${esc(x.repair)}</b></div></div>
					<div><div class="lab">${__("Design Type")}</div>
						<div class="ro">${esc(x.design_type)}</div></div>
					<div><div class="lab">${__("Qty")}</div>
						<div class="ro">${x.qty}</div></div>
					<div><div class="lab">${__("Weight In g")}</div>
						<input class="re-wt" type="number" min="0" step="0.001" value="${x.weight}"
							${x.bill ? "disabled" : ""}></div>
					<div><div class="lab">${__("Weight Out g")}</div>
						<input class="re-wo" type="number" min="0" step="0.001" value="${x.weight_out}"
							${x.bill ? "disabled" : ""}></div>
					<div><div class="lab">${__("Karat")}</div>
						<select class="re-kt" ${x.bill ? "disabled" : ""}>${
							["", "22", "18", "14", "9"].map((k) =>
								`<option value="${k}" ${(x.karat || "") === k ? "selected" : ""}>${k || "—"}</option>`
							).join("")}</select></div>
					<div><div class="lab">${__("Stones")}</div>
						<div class="re-st ${x.bill ? "locked" : ""}">${x.stones.length
							? x.stones.map((st) => `${esc(st.bucket || st.stone || "")} ${esc(st.sieve || "")} ${
								cint(st.pcs)}/${(parseFloat(st.ct) || 0).toFixed(3)}`).join("<br>")
							: `<span class="re-addst">${x.bill ? __("none") : __("add stone")}</span>`}</div></div>
					<div><div class="lab">${__("Type of Work")}</div>
						<div class="re-works">
							${x.work_types.map((w) =>
								`<span class="re-chip">${esc(w)}<b data-w="${esc(w)}">&times;</b></span>`).join("")}
							<input class="re-work" list="re-works-list"
								placeholder="${x.work_types.length ? __("add another") : __("add")}">
						</div>
						<input class="re-nar" style="margin-top:6px;" value="${esc(x.narration)}"
							placeholder="${__("narration")}"></div>
				</div>`).join(""));
		};

		$(dlg.body).html(`
			<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">
				${__("Taken in {0}. Design type and quantity are what was received and stay as they are.",
					[esc(r.received_at)])}
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
			$(dlg.body).find(".re-fresh").remove();
            const html = fresh.map((f, k) => `
				<div class="re-row re-fresh" data-f="${k}">
					<div><div class="lab">${__("Repair")}</div><div class="ro"><i>${__("new")}</i></div></div>
					<div><div class="lab">${__("Design Type")}</div>
						<input class="rf-dt" list="re-dt-list" value="${esc(f.design_type)}"
							placeholder="${__("design type")}"></div>
					<div><div class="lab">${__("Qty")}</div>
						<input class="rf-qty" type="number" min="1" step="1" value="${f.qty}"></div>
					<div><div class="lab">${__("Weight In g")}</div>
						<input class="rf-wt" type="number" min="0" step="0.001" value="${f.weight}"></div>
					<div><div class="lab">${__("Karat")}</div>
						<select class="rf-kt">${["22","18","14","9"].map((k) =>
							`<option value="${k}" ${f.karat === k ? "selected" : ""}>${k}</option>`).join("")}</select></div>
					<div><div class="lab">${__("Type of Work")}</div>
						<input class="rf-work" list="re-works-list" value="${esc(f.work_types)}"
							placeholder="${__("comma separated")}">
						<input class="rf-nar" style="margin-top:6px;" value="${esc(f.narration)}"
							placeholder="${__("narration")}"></div>
					<div><a class="rf-x" title="${__("Remove")}">&times;</a></div>
				</div>`).join("");
			$(dlg.body).find(".re-add-wrap").before(html);
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
