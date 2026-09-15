// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Prepare to Sell — the parcel, before it is a bill.
//
// A parcel is scanned together, travels together and is papered together, and
// every buyer wants that paper differently: JOS takes three sheets at three
// moments — the order, the rate cut, the delivery — and the next buyer will
// want something else. So this is where the parcel is gathered and papered, and
// the FORMAT decides what comes out of it.
//
// THE ORDER MATTERS. Pieces stay in the order they were scanned, because that
// is the order the parcel is physically in and the order the sheets are
// numbered by. Only JOS asks for the agreed physical order instead — the item
// ladder, then colour, then weight — so only JOS gets the Sort button.
//
// Pricing is not done here. A row is priced by the same call the Sell board
// uses, so a parcel and a bill can never disagree; selling it is still Sell's
// job, and the parked boards are still listed below.
// Route: /app/prepare-sale
frappe.pages["prepare-sale"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Prepare to Sell"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const cint = (v) => parseInt(v, 10) || 0;
	const g3 = (v) => flt(v).toFixed(3);
	const money = (v) => "₹" + flt(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });
	const root = $(page.main);

const S = { ctx: null, fmt: "JOS", rows: [], parked: [], sorted: false, prep: null, dirty: false };

	// The agreed physical order, the same ladder the OLD FORMAT sheet numbers by:
	// the item ladder, then colour, then the below-1g band, then weight. It is a
	// JOS request, so it is a button and never the default — a parcel is in scan
	// order until somebody asks for it not to be.
	const ITEM_RANK = { NOSEPIN: 0, PENDANT: 1, STUD: 2, RING: 3, BRACELET: 4,
		"CHAIN BRACELET": 4, BANGLE: 5, "PIPE BANGLE": 5, "CHAIN NECKLACE": 6, NECKLACE: 7 };
	const COLOR_RANK = { YELLOW: 0, ROSE: 1, WHITE: 2 };
	const rankOf = (m, k) => ((k || "").toUpperCase() in m ? m[(k || "").toUpperCase()] : 50);

	root.append(`
		<style>
		#page-prepare-sale .container{max-width:100%;}
		.ps-head{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:2px 12px;margin:2px 0 10px;}
		.ps-head .frappe-control{margin:0;}
		.ps-head .control-label{font-size:11px;margin:0 0 1px;color:var(--text-muted);}
		.ps-head .help-box,.ps-head .description{display:none !important;}
		.ps-scan{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px;}
		.ps-scan input.box{border:1px solid var(--primary);border-radius:9px;height:38px;width:270px;
			padding:2px 12px;font-size:15px;font-weight:700;background:var(--fg-color);color:var(--text-color);}
		.ps-msg{font-size:12.5px;color:var(--text-muted);}
		.ps-msg.bad{color:#b02a2a;font-weight:700;}
		.ps-state{font-size:11px;font-weight:800;letter-spacing:.03em;border-radius:999px;padding:3px 11px;white-space:nowrap;}
		.ps-state.saved{background:#eaf6ec;color:#1d7a33;border:1px solid #bfe3c6;}
		.ps-state.dirty{background:#fdf3e3;color:#8a5a00;border:1px solid #e6c98f;}
		[data-theme="dark"] .ps-state.saved{background:rgba(29,122,51,.18);color:#7fd49a;border-color:rgba(29,122,51,.5);}
		[data-theme="dark"] .ps-state.dirty{background:rgba(180,83,9,.16);color:#e8a24a;border-color:rgba(180,83,9,.5);}
		.ps-tiles{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;}
		.ps-tile{border:1px solid var(--border-color);border-radius:11px;background:var(--fg-color);
			padding:9px 15px;min-width:104px;}
		.ps-tile .k{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);}
		.ps-tile .v{font-size:19px;font-weight:800;font-variant-numeric:tabular-nums;}
		.ps-tile.money .v{color:#1f618d;}
		[data-theme="dark"] .ps-tile.money .v{color:#8fc1e8;}
		.ps-gridbox{overflow:auto;border:1px solid var(--border-color);border-radius:9px;margin-bottom:12px;}
		table.ps-t{width:100%;min-width:1080px;border-collapse:separate;border-spacing:0;font-size:12px;
			background:var(--fg-color);font-variant-numeric:tabular-nums;}
		table.ps-t th{position:sticky;top:0;z-index:2;background:var(--control-bg);text-align:left;
			font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);
			border-bottom:1px solid var(--gray-400,#aeb6bf);padding:6px 7px;font-weight:700;white-space:nowrap;}
		table.ps-t th.num{text-align:right;}
		table.ps-t td{padding:5px 7px;border-bottom:1px solid var(--border-color);white-space:nowrap;}
		table.ps-t td.num{text-align:right;}
		table.ps-t td.n0{color:var(--text-muted);text-align:center;width:30px;background:var(--control-bg);font-weight:700;}
		table.ps-t tr:hover td{background:var(--control-bg);}
		.ps-x{border:none;background:none;color:var(--text-muted);cursor:pointer;font-size:14px;padding:0 5px;}
		.ps-x:hover{color:#b02a2a;}

		.ps-empty{padding:34px;text-align:center;color:var(--text-muted);font-size:13px;}
		.ps-docs{display:flex;gap:10px;flex-wrap:wrap;}
		.ps-doc{border:1px solid var(--border-color);border-radius:11px;background:var(--fg-color);
			padding:11px 15px;min-width:190px;cursor:pointer;transition:box-shadow .12s;}
		.ps-doc:hover{box-shadow:0 3px 12px rgba(0,0,0,.12);border-color:var(--primary);}
		.ps-doc .l{font-weight:800;font-size:13px;}
		.ps-doc .n{font-size:11.5px;color:var(--text-muted);margin-top:2px;}
		.ps-card{border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);
			padding:13px 16px;margin-bottom:14px;}
		.ps-card h3{font-size:12px;margin:0 0 9px;font-weight:800;text-transform:uppercase;
			letter-spacing:.06em;color:var(--text-muted);}
		.pp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:12px;}
		.pp-card{border:1px solid var(--border-color);border-left:5px solid #e0a800;border-radius:9px;
			background:var(--fg-color);padding:12px 14px;cursor:pointer;}
		.pp-card:hover{box-shadow:0 3px 12px rgba(0,0,0,.12);}
		.pp-name{font-weight:800;font-size:12.5px;}
		.pp-cust{font-size:14px;font-weight:700;margin:2px 0 5px;}
		.pp-meta{font-size:11.5px;color:var(--text-muted);line-height:1.6;}
		.pp-total{font-size:17px;font-weight:800;color:#1d7a33;margin-top:5px;}
		.pp-card{position:relative;}
		.pp-x{position:absolute;top:7px;right:9px;border:none;background:none;color:var(--text-muted);
			cursor:pointer;font-size:15px;line-height:1;padding:2px 5px;border-radius:6px;}
		.pp-x:hover{color:#b02a2a;background:var(--control-bg);}
		</style>
		<div class="ps-head">
			<div class="h-cust"></div><div class="h-fmt"></div><div class="h-chart"></div>
			<div class="h-rate"></div><div class="h-qual"></div>
		</div>
		<div class="ps-scan">
			<input class="box ps-box" placeholder="${__("Scan a bag no")}" autocomplete="off">
			<button class="btn btn-sm btn-default ps-sort" style="display:none;">${__("Sort (JOS order)")}</button>
			<span class="ps-state" style="display:none;"></span>
			<span class="ps-msg"></span>
		</div>
		<div class="ps-tiles"></div>
		<div class="ps-gridbox"><table class="ps-t">
			<thead><tr>
				<th class="n0">#</th><th>${__("Bag")}</th><th>${__("Item")}</th><th>${__("Design")}</th>
				<th>${__("Size")}</th><th>${__("Colour")}</th>
				<th class="num">${__("Gross")}</th><th class="num">${__("Net")}</th>
				<th class="num">${__("Dia")}</th><th class="num">${__("Stones")}</th>
					<th>${__("HUID")}</th><th class="num">${__("Value")}</th><th style="width:34px;"></th>
			</tr></thead><tbody class="ps-body"></tbody>
		</table></div>
		<div class="ps-card ps-docwrap"><h3>${__("Papers")}</h3><div class="ps-docs"></div></div>
		<div class="ps-card"><h3>${__("Parked bills")}</h3><div class="pp-grid"></div></div>`);

	const mk = (sel, df) => {
		const c = frappe.ui.form.make_control({ df, parent: root.find(sel).get(0), render_input: true });
		c.refresh();
		return c;
	};

	// ---- the parcel ----------------------------------------------------------
	function fmtSpec() {
		return ((S.ctx || {}).formats || []).find((f) => f.key === S.fmt) || { docs: [], sortable: 0 };
	}

	function say(msg, bad) {
		root.find(".ps-msg").toggleClass("bad", !!bad).text(msg || "");
	}

	function paintTiles() {
		const n = S.rows.length;
		const t = (k, v, cls) => `<div class="ps-tile ${cls || ""}"><div class="k">${k}</div><div class="v">${v}</div></div>`;
		const sum = (f) => S.rows.reduce((a, r) => a + flt(r[f]), 0);
		root.find(".ps-tiles").html(
			t(__("Pieces"), n) +
			t(__("Gross"), g3(sum("gs")) + " g") +
			t(__("Net"), g3(sum("nt")) + " g") +
			t(__("Diamond"), g3(sum("dmd_ct")) + " ct") +
			(sum("total") ? t(__("Value"), money(sum("total")), "money") : ""));
	}

	function paintRows() {
		root.find(".ps-body").html(S.rows.length ? S.rows.map((r, i) => `
			<tr data-i="${i}">
				<td class="n0">${i + 1}</td>
				<td><b>${esc(r.order_bag)}</b></td>
				<td>${esc(r.item || "")}</td>
				<td>${esc(r.design || "")}</td>
				<td>${esc(r.size || "")}</td>
				<td>${esc(r.colour || "")}</td>
				<td class="num">${g3(r.gs)}</td>
				<td class="num">${g3(r.nt)}</td>
				<td class="num">${r.dmd_pcs ? `${r.dmd_pcs} / ${g3(r.dmd_ct)}` : "—"}</td>
				<td class="num">${(r.ps_ct || r.stn_ct) ? g3(flt(r.ps_ct) + flt(r.stn_ct)) : "—"}</td>
				<td>${esc(r.huid || "")}</td>
				<td class="num">${r.total ? money(r.total) : "—"}</td>
					<td><button class="ps-x" title="${__("Take it off")}">✕</button></td>
			</tr>`).join("")
			: `<tr><td colspan="13" class="ps-empty">${__("Scan the pieces going in this parcel. They stay in the order you scan them.")}</td></tr>`);
	}

	function paintDocs() {
		const spec = fmtSpec();
		root.find(".ps-sort").toggle(!!spec.sortable);
		root.find(".ps-docs").html((spec.docs || []).map((d) => `
			<div class="ps-doc" data-d="${esc(d.key)}">
				<div class="l">${esc(d.label)}</div>
				<div class="n">${esc(d.note || "")}</div>
			</div>`).join("") || `<div class="ps-empty">${__("This format produces nothing yet.")}</div>`);
	}

	// The desk draws this page's header itself, so page.set_indicator never shows —
	// the saved state sits in the scan row instead, beside what is being built.
	function paintState() {
		const $st = root.find(".ps-state");
		if (S.dirty && S.rows.length) {
			$st.show().attr("class", "ps-state dirty").text(S.prep ? __("{0} · changed, not saved", [S.prep]) : __("Not saved"));
		} else if (S.prep) {
			$st.show().attr("class", "ps-state saved").text(__("{0} · saved", [S.prep]));
		} else {
			$st.hide();
		}
	}

	function paint() { paintTiles(); paintRows(); paintDocs(); paintState(); }

	// ---- scanning ------------------------------------------------------------
	function scan(code) {
		const nm = (code || "").trim();
		if (!nm) return;
		if (S.rows.some((r) => r.order_bag === nm)) {
			say(__("{0} is already in the parcel.", [nm]), true);
			return;
		}
		frappe.call({
			method: API + ".scan_sale_prep_piece", freeze: false,
			args: { barcode: nm, price_chart: S.chartCtl.get_value() || null,
				gold_rate: flt(S.rateCtl.get_value()) },
		}).then((r) => {
			const row = r.message;
			if (!row) return;
			if (row.stock_status !== "In Stock") {
				say(__("{0} is {1}, not In Stock.", [nm, row.stock_status || "?"]), true);
				return;
			}
			if ((row.prepped || []).length) {
				say(__("{0} is already on prepared bill {1} — scanned anyway.", [nm, row.prepped[0]]));
			} else {
				say(__("{0} added.", [nm]));
			}
				S.rows.push(row);
				S.sorted = false;
				S.dirty = true;
				paint();
		}).catch(() => say(__("{0} could not be read.", [nm]), true));
	}

	root.on("keydown", ".ps-box", function (e) {
		if (e.which !== 13) return;
		const v = this.value;
		this.value = "";
		scan(v);
	});
	root.on("click", ".ps-x", function () {
		S.rows.splice(cint($(this).closest("tr").data("i")), 1);
		S.dirty = true;
		paint();
	});


	root.on("click", ".ps-sort", () => {
		if (!S.rows.length) return;
		S.rows.sort((a, b) =>
			(rankOf(ITEM_RANK, a.item) - rankOf(ITEM_RANK, b.item))
			|| (a.item || "").localeCompare(b.item || "")
			|| (rankOf(COLOR_RANK, a.colour) - rankOf(COLOR_RANK, b.colour))
			|| (a.colour || "").localeCompare(b.colour || "")
			|| ((flt(a.nt) < 1 ? 0 : 1) - (flt(b.nt) < 1 ? 0 : 1))
			|| (flt(a.gs) - flt(b.gs)));
		S.sorted = true;
		S.dirty = true;
		paint();
		frappe.show_alert({ message: __("Item ladder → colour → below 1 g → weight."), indicator: "green" }, 5);
	});

	/** Re-read every piece at the chart and rate now set. The parcel keeps its
	 * order — only the money changes. */
	function reprice() {
		if (!S.rows.length) return Promise.resolve();
		const chart = S.chartCtl.get_value() || null;
		const rate = flt(S.rateCtl.get_value());
		say(__("Re-pricing {0} piece(s)…", [S.rows.length]));
		return Promise.all(S.rows.map((r) => frappe.call({
			method: API + ".scan_sale_prep_piece", freeze: false,
			args: { barcode: r.order_bag, price_chart: chart, gold_rate: rate },
		}).then((x) => x.message).catch(() => r)))
			.then((fresh) => {
				S.rows = fresh.filter(Boolean);
				say(chart && rate ? __("Priced at {0} on {1}.", [rate, chart])
					: __("No chart or no rate — the pieces carry no value yet."));
				paint();
			});
	}

	// ---- the papers ----------------------------------------------------------
	root.on("click", ".ps-doc", function () {
		if (!S.rows.length) return frappe.msgprint(__("Scan some pieces first."));
		const payload = {
			customer: S.custCtl.get_value() || "", price_chart: S.chartCtl.get_value() || "",
			gold_rate: flt(S.rateCtl.get_value()), quality: S.qualCtl.get_value() || "",
			rows: S.rows.map((r, i) => Object.assign({}, r, { sl: i + 1 })),
		};
		open_url_post("/api/method/" + API + ".export_sale_prep_doc",
			{ payload: JSON.stringify(payload), fmt: S.fmt, doc: $(this).data("d") });
	});

	// ---- the parked bills, as before -----------------------------------------
	function loadParked() {
		frappe.call({ method: API + ".get_prepared_boards", freeze: false }).then((r) => {
			const rows = (r.message || {}).rows || [];
				root.find(".pp-grid").html(rows.length ? rows.map((p) => `
				<div class="pp-card" data-name="${esc(p.name)}" data-src="${esc(p.source || "sell")}">
					<button class="pp-x" title="${__("Throw this prep away")}">✕</button>
					<div class="pp-name">${esc(p.name)} · ${esc(p.status)}${p.source === "prepare"
						? ` · <span style="color:var(--primary);">${__("parcel")}</span>` : ""}</div>
					<div class="pp-cust">${esc(p.customer || "—")}</div>
					<div class="pp-meta">${p.pieces} ${__("piece(s)")} · ${esc(p.price_chart || __("no chart"))}<br>
						${frappe.datetime.prettyDate(p.modified)} · ${esc(p.owner)}</div>
					<div class="pp-total">${money(p.grand_total)}</div>
				</div>`).join("")
				: `<div class="ps-empty">${__("Nothing parked.")}</div>`);
		});
	}
	root.on("click", ".pp-card", function () {
		const nm = $(this).data("name");
		if ($(this).data("src") === "prepare") return openParcel(nm);
		frappe.route_options = { prep: nm };
		frappe.set_route("sell");
	});
	root.on("click", ".pp-x", function (e) {
		e.stopPropagation();          // the card itself opens the board
		const nm = $(this).closest(".pp-card").data("name");
		frappe.confirm(__("Throw away {0}? The pieces on it go back to being unspoken for.", [nm]), () => {
			frappe.call({ method: API + ".discard_sale_prep", args: { name: nm } })
				.then(() => {
					frappe.show_alert({ message: __("{0} thrown away.", [nm]), indicator: "green" }, 4);
					loadParked();
				});
		});
	});

	// ---- saving -----------------------------------------------------------------
	function saveParcel() {
		if (!S.rows.length) { frappe.msgprint(__("Scan some pieces first.")); return; }
		if (!S.chartCtl.get_value()) {
			frappe.msgprint(__("Pick the price chart before saving — a prep is kept priced."));
			return;
		}
		frappe.call({
			method: API + ".save_parcel",
			args: { payload: JSON.stringify({
				name: S.prep, fmt: S.fmt, sorted: S.sorted ? 1 : 0,
				customer: S.custCtl.get_value() || "", price_chart: S.chartCtl.get_value() || "",
				gold_rate: flt(S.rateCtl.get_value()), quality: S.qualCtl.get_value() || "",
				rows: S.rows,
			}) },
		}).then((r) => {
			const m = r.message || {};
			S.prep = m.name;
			S.dirty = false;
			paint();
			loadParked();
			frappe.show_alert({ message: __("Saved as {0} — {1} piece(s).", [m.name, m.pieces]), indicator: "green" }, 4);
		});
	}

	function openParcel(nm) {
		const go = () => frappe.call({ method: API + ".get_parcel", args: { name: nm } }).then((r) => {
			const m = r.message || {};
			S.prep = m.name;
			S.rows = m.rows || [];
			S.sorted = !!m.sorted;
			// Set the header without each control re-pricing the whole parcel. A Link
			// validates over the network, so the flag comes down when the controls say
			// they are done — not on a timer, which the tunnel would outrun.
			S.loading = true;
			S.fmt = m.fmt || "DEFAULT";
			Promise.all([
				S.custCtl.set_value(m.customer || ""),
				S.chartCtl.set_value(m.price_chart || ""),
				S.rateCtl.set_value(m.gold_rate || ""),
				S.qualCtl.set_value(m.quality || ""),
				S.fmtCtl.set_value(S.fmt),
			]).then(() => { S.loading = false; S.dirty = false; paint(); });
			say(__("Opened {0}.", [m.name]));
			window.scrollTo({ top: 0, behavior: "smooth" });
		});
		if (S.dirty && S.rows.length) {
			frappe.confirm(__("The parcel on screen is not saved. Open {0} anyway?", [nm]), go);
		} else {
			go();
		}
	}

	// ---- header --------------------------------------------------------------
	S.custCtl = mk(".h-cust", { fieldtype: "Link", label: __("Buyer"), fieldname: "customer", options: "Customer" });
	S.fmtCtl = mk(".h-fmt", { fieldtype: "Select", label: __("Format"), fieldname: "fmt", options: [],
		onchange: () => { S.fmt = S.fmtCtl.get_value() || "DEFAULT"; if (!S.loading && S.rows.length) S.dirty = true; paint(); } });
	S.chartCtl = mk(".h-chart", { fieldtype: "Link", label: __("Price chart"), fieldname: "price_chart",
		options: "Price Chart", onchange: () => { if (S.loading) return; S.dirty = S.rows.length > 0; reprice(); } });
	S.rateCtl = mk(".h-rate", { fieldtype: "Currency", label: __("Gold rate / g"), fieldname: "gold_rate",
		onchange: () => { if (S.loading) return; S.dirty = S.rows.length > 0; reprice(); } });
	S.qualCtl = mk(".h-qual", { fieldtype: "Data", label: __("Diamond quality"), fieldname: "quality" });

	page.set_primary_action(__("Save"), () => { saveParcel(); }, "save");
	page.add_inner_button(__("Send to Sell"), () => {
		if (!S.rows.length) return frappe.msgprint(__("Scan some pieces first."));
		frappe.route_options = {
			prep_rows: S.rows.map((r) => r.order_bag),
			customer: S.custCtl.get_value() || "",
			price_chart: S.chartCtl.get_value() || "",
			gold_rate: flt(S.rateCtl.get_value()),
		};
		frappe.set_route("sell");
	});
	page.add_inner_button(__("New parcel"), () => {
		const reset = () => { S.rows = []; S.sorted = false; S.prep = null; S.dirty = false; say(""); paint(); };
		if (S.dirty && S.rows.length) frappe.confirm(__("The parcel on screen is not saved. Start a new one anyway?"), reset);
		else reset();
	});
	page.add_inner_button(__("Sell"), () => frappe.set_route("sell"));

	frappe.call({ method: API + ".get_sale_prep_formats" }).then((r) => {
		S.ctx = r.message || { formats: [] };
		const opts = (S.ctx.formats || []).map((f) => ({ label: f.label, value: f.key }));
		S.fmtCtl.df.options = opts;
		S.fmtCtl.refresh();
		S.fmt = (opts[0] || {}).value || "DEFAULT";
		S.fmtCtl.set_value(S.fmt);
		paint();
		setTimeout(() => root.find(".ps-box").focus(), 200);
	});
	loadParked();
};
