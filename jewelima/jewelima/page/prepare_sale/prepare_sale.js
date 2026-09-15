// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Prepare to Sell — the parcels, then the parcel.
//
// It opens on TILES: every parcel still being built, and every one that has
// sold and not been cleared. Opening a tile opens that parcel on the bench. A
// sold parcel stays on the tiles as the desk's proof it went, until someone
// clears it; cleared parcels live in Delivery Records > Sales History.
//
// On the bench a parcel is scanned, papered and saved. Every buyer wants the
// paper differently — JOS takes three sheets at three moments — so the FORMAT
// decides what comes out. Pieces stay in the order they were scanned, which is
// the order the parcel is physically in and every sheet numbers them by; only
// JOS gets a Sort into its agreed order.
//
// Pricing is not done here: a row is priced by the same call the Sell board
// uses, and selling is still Sell's job. Send to Sell saves the parcel and opens
// it there, so the sale marks this parcel Sold.
// Routes: /app/prepare-sale (tiles) · /app/prepare-sale/new · /app/prepare-sale/SPREP-00001
frappe.pages["prepare-sale"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Prepare to Sell"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const cint = (v) => parseInt(v, 10) || 0;
	const g3 = (v) => flt(v).toFixed(3);
	const money = (v) => "₹" + flt(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });
	const root = $(page.main);

	const S = { ctx: null, fmt: "JOS", rows: [], sorted: false, prep: null, title: "", dirty: false, view: "list", locked: false, out: [] };

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
		.h-qual .lbl{font-size:11px;color:var(--text-muted);margin:0 0 1px;}
		.h-qual .val{min-height:26px;display:flex;gap:5px;flex-wrap:wrap;align-items:center;font-size:12px;}
		.h-qual .q{border:1px solid var(--border-color);background:var(--control-bg);border-radius:7px;
			padding:1px 8px;font-weight:700;}
		.h-qual .q .n{font-weight:400;color:var(--text-muted);margin-left:3px;}
		.h-qual .hint{font-size:10.5px;color:#8a5a00;width:100%;}
		[data-theme="dark"] .h-qual .hint{color:#e8a24a;}
		.ps-scan{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px;}
		.ps-scan input.box{border:1px solid var(--primary);border-radius:9px;height:38px;width:270px;
			padding:2px 12px;font-size:15px;font-weight:700;background:var(--fg-color);color:var(--text-color);}
		.ps-msg{font-size:12.5px;color:var(--text-muted);}
		.ps-msg.bad{color:#b02a2a;font-weight:700;}
		.ps-state{font-size:11px;font-weight:800;letter-spacing:.03em;border-radius:999px;padding:3px 11px;white-space:nowrap;}
		.ps-state[data-rename]{cursor:pointer;}
		.ps-state .id{font-weight:600;opacity:.7;margin-left:4px;}
		.pp-id{font-family:var(--font-family-monospace,monospace);font-size:10.5px;font-weight:600;color:var(--text-muted);}
		.ps-state.saved{background:#eaf6ec;color:#1d7a33;border:1px solid #bfe3c6;}
		.ps-state.dirty{background:#fdf3e3;color:#8a5a00;border:1px solid #e6c98f;}
		.ps-state.locked{background:#e9f0f7;color:#1f618d;border:1px solid #b9d0e6;}
		[data-theme="dark"] .ps-state.locked{background:rgba(31,97,141,.2);color:#8fc1e8;border-color:rgba(31,97,141,.5);}
		.ps-out{border:1px solid #e6b3b3;background:#fdf1f1;color:#8a2a2a;border-radius:10px;padding:10px 14px;
			font-size:12.5px;margin-bottom:12px;line-height:1.6;}
		[data-theme="dark"] .ps-out{background:rgba(176,42,42,.14);border-color:rgba(176,42,42,.5);color:#e8a0a0;}
		table.ps-t tr.gone td{background:rgba(176,42,42,.06);}
		.ps-gone{font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#b02a2a;margin-left:6px;}
		.pp-tag.locked{background:rgba(31,97,141,.16);color:#1f618d;}
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
		.ps-doc.off{border-color:#e6b3b3;background:#fbeaea;cursor:not-allowed;}
		.ps-doc.off:hover{box-shadow:none;border-color:#e6b3b3;}
		.ps-doc.off .l{color:#b00020;}
		[data-theme="dark"] .ps-doc.off{background:rgba(176,0,32,.14);border-color:rgba(176,0,32,.5);}
		[data-theme="dark"] .ps-doc.off .l{color:#f08a9a;}
		.ps-doc .n{font-size:11.5px;color:var(--text-muted);margin-top:2px;}
		.ps-card{border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);
			padding:13px 16px;margin-bottom:14px;}
		.ps-card h3{font-size:12px;margin:0 0 9px;font-weight:800;text-transform:uppercase;
			letter-spacing:.06em;color:var(--text-muted);}
		.ps-top{display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap;}
		.ps-top h2{font-size:15px;font-weight:800;margin:0;}
		.ps-sec{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;
			color:var(--text-muted);margin:16px 0 9px;}
		.pp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:12px;}
		.pp-card{position:relative;border:1px solid var(--border-color);border-left:5px solid #e0a800;
			border-radius:10px;background:var(--fg-color);padding:12px 14px;cursor:pointer;transition:box-shadow .12s;}
		.pp-card:hover{box-shadow:0 3px 12px rgba(0,0,0,.12);}
		.pp-card.sold{border-left-color:#1d7a33;}
		.pp-card.new{border:2px dashed var(--border-color);border-left-width:2px;display:flex;align-items:center;
			justify-content:center;min-height:118px;color:var(--text-muted);font-weight:800;font-size:14px;}
		.pp-card.new:hover{border-color:var(--primary);color:var(--primary);}
		.pp-card.unsaved{border-left-color:#b45309;background:rgba(180,83,9,.05);}
		.pp-name{font-weight:800;font-size:12.5px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding-right:22px;}
		.pp-tag{font-size:9.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;border-radius:20px;padding:1px 8px;}
		.pp-tag.draft{background:rgba(224,168,0,.18);color:#8a6508;}
		.pp-tag.sold{background:rgba(29,122,51,.16);color:#1d7a33;}
		.pp-tag.fmt{background:var(--control-bg);color:var(--text-muted);}
		.pp-tag.gone{background:rgba(176,42,42,.13);color:#b02a2a;}
		[data-theme="dark"] .pp-tag.draft{color:#e8b84a;}
		[data-theme="dark"] .pp-tag.sold{color:#7fc98f;}
		.pp-cust{font-size:14px;font-weight:700;margin:3px 0 5px;}
		.pp-meta{font-size:11.5px;color:var(--text-muted);line-height:1.6;}
		.pp-foot{display:flex;justify-content:space-between;align-items:center;margin-top:6px;}
		.pp-total{font-size:17px;font-weight:800;color:#1d7a33;}
		.pp-x{position:absolute;top:7px;right:9px;border:none;background:none;color:var(--text-muted);
			cursor:pointer;font-size:15px;line-height:1;padding:2px 5px;border-radius:6px;}
		.pp-x:hover{color:#b02a2a;background:var(--control-bg);}
		</style>
		<div class="ps-list">
			<div class="ps-lists"></div>
		</div>
		<div class="ps-work" hidden>
		<div class="ps-head">
			<div class="h-cust"></div><div class="h-fmt"></div><div class="h-chart"></div>
			<div class="h-rate"></div><div class="h-qual"></div>
		</div>
		<div class="ps-scan">
			<input class="box ps-box" placeholder="${__("Scan a bag no")}" autocomplete="off">
			<button class="btn btn-sm btn-default ps-pick">${__("Add by filter…")}</button>
			<button class="btn btn-sm btn-default ps-sort" style="display:none;">${__("Sort (JOS order)")}</button>
			<span class="ps-state" style="display:none;"></span>
			<span class="ps-msg"></span>
		</div>
		<div class="ps-out" hidden></div>
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
		</div>`);

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
		const outOf = {};
		(S.out || []).forEach((o) => { outOf[o.order_bag] = o.stock_status; });
		root.find(".ps-body").html(S.rows.length ? S.rows.map((r, i) => `
			<tr data-i="${i}" class="${outOf[r.order_bag] ? "gone" : ""}">
				<td class="n0">${i + 1}</td>
				<td><b>${esc(r.order_bag)}</b>${outOf[r.order_bag]
					? `<span class="ps-gone">${esc(outOf[r.order_bag])}</span>` : ""}</td>
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
					<td>${S.locked ? "" : `<button class="ps-x" title="${__("Take it off")}">✕</button>`}</td>
			</tr>`).join("")
			: `<tr><td colspan="13" class="ps-empty">${__("Scan the pieces going in this parcel. They stay in the order you scan them.")}</td></tr>`);
	}

	function paintDocs() {
		const spec = fmtSpec();
		root.find(".ps-sort").toggle(!!spec.sortable);
		// a bill is priced off the chart: without one its button is red and dead
		const noChart = !(S.chartCtl && S.chartCtl.get_value());
		root.find(".ps-docs").html((spec.docs || []).map((d) => {
			const off = d.key === "ratecut" && noChart;
			return `
			<div class="ps-doc${off ? " off" : ""}" data-d="${esc(d.key)}">
				<div class="l">${esc(d.label)}</div>
				<div class="n">${off ? __("Pick a price chart to download") : esc(d.note || "")}</div>
			</div>`; }).join("") || `<div class="ps-empty">${__("This format produces nothing yet.")}</div>`);
	}

	// The desk draws this page's header itself, so page.set_indicator never shows —
	// the saved state sits in the scan row instead, beside what is being built.
	function paintState() {
		const $st = root.find(".ps-state");
		root.find(".ps-box, .ps-pick").toggle(!S.locked);
		root.find(".ps-sort").toggle(!S.locked && !!fmtSpec().sortable);
		const out = S.out || [];
		root.find(".ps-out").prop("hidden", !out.length).html(out.length
			? __("{0} of the pieces in this parcel are no longer in stock: {1}", [out.length,
				out.map((o) => `<b>${esc(o.order_bag)}</b> ${esc(o.stock_status)}`).join(" · ")])
			: "");
		// the parcel's name leads; the SPREP number rides along. A saved parcel's
		// badge renames it on a click.
		const label = S.prep
			? `${esc(S.title || S.prep)}${S.title ? `<span class="id">${esc(S.prep)}</span>` : ""}` : "";
		$st.removeAttr("data-rename").attr("title", "");
		if (S.locked) {
			$st.show().attr("class", "ps-state locked").html(`${label} · ${__("locked")}`);
		} else if (S.dirty && S.rows.length) {
			$st.show().attr("class", "ps-state dirty").html(S.prep ? `${label} · ${__("changed, not saved")}` : __("Not saved"));
		} else if (S.prep) {
			$st.show().attr("class", "ps-state saved").html(`${label} · ${__("saved")}`);
		} else {
			$st.hide();
		}
		if (S.prep) $st.attr("data-rename", "1").attr("title", __("Rename this parcel"));
	}

	// The diamond quality is read off the pieces. Usually one; when a parcel mixes
	// them every one is shown, with how many pieces carry it. The Delivery Bill
	// picks its diamond columns by a single quality, so it takes the one most
	// pieces carry — and says so.
	function qualities() {
		const count = {};
		S.rows.forEach((r) => (r.dmd_quality || "").split(",").map((x) => x.trim()).filter(Boolean)
			.forEach((q) => { count[q] = (count[q] || 0) + 1; }));
		return Object.keys(count).sort((a, b) => count[b] - count[a] || a.localeCompare(b))
			.map((q) => ({ q, n: count[q] }));
	}
	const mainQuality = () => (qualities()[0] || {}).q || "";

	function paintQuality() {
		const qs = qualities();
		root.find(".h-qual").html(`<div class="lbl">${__("Diamond quality")}</div>
			<div class="val">${qs.length ? qs.map((x) => `<span class="q">${esc(x.q)}${qs.length > 1
				? `<span class="n">${x.n}</span>` : ""}</span>`).join("")
				: `<span style="color:var(--text-muted);">${S.rows.length ? __("no diamonds") : "—"}</span>`}
				${qs.length > 1 ? `<span class="hint">${__("Mixed — the sheets use {0}", [esc(qs[0].q)])}</span>` : ""}</div>`);
	}

	function paint() { paintTiles(); paintRows(); paintDocs(); paintState(); paintQuality(); }

	// ---- scanning ------------------------------------------------------------
	function scan(code) {
		const nm = (code || "").trim();
		if (!nm || S.locked) return;
		if (S.rows.some((r) => r.order_bag === nm)) {
			say(__("{0} is already in the parcel.", [nm]), true);
			return;
		}
		frappe.call({
			method: API + ".scan_sale_prep_piece", freeze: false,
			args: { barcode: nm, price_chart: S.chartCtl.get_value() || null,
				gold_rate: flt(S.rateCtl.get_value()), prep: S.prep || null },
		}).then((r) => {
			const row = r.message;
			if (!row) return;
			if (row.stock_status !== "In Stock") {
				say(__("{0} is {1}, not In Stock.", [nm, row.stock_status || "?"]), true);
				return;
			}
			if ((row.prepped || []).length) {
				say(__("{0} is already in parcel {1} — a piece can only be in one parcel.", [nm, row.prepped.join(", ")]), true);
				return;
			}
			say(__("{0} added.", [nm]));
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

	// ---- Add by filter ------------------------------------------------------------
	// Scanning is right for a handful; a parcel is often a slice — "every RING
	// held by JOS" — so this is the certification desk's picker. Pieces already on
	// another open parcel are never offered, and every ticked piece still goes
	// through the same checks a scan does.
	function showPicker() {
		if (S.locked) return;
		const P = { bucket: "", design_type: "", karat: "", held_by: "", q: "",
			rows: [], sel: new Set(), total: 0, hasMore: false, selOnly: false };
		const PAGE = 60;
		const onList = (n) => S.rows.some((r) => r.order_bag === n);

		const dlg = new frappe.ui.Dialog({
			title: __("Add pieces by filter"), size: "extra-large",
			primary_action_label: __("Add to parcel"),
			primary_action() {
				if (!P.sel.size) { frappe.msgprint(__("Tick at least one piece.")); return; }
				const picked = [...P.sel];
				dlg.hide();
				frappe.dom.freeze(__("Adding {0}…", [picked.length]));
				frappe.call({ method: API + ".scan_sale_prep_many", freeze: false, args: {
					barcodes: JSON.stringify(picked), price_chart: S.chartCtl.get_value() || null,
					gold_rate: flt(S.rateCtl.get_value()), prep: S.prep || null,
					existing: JSON.stringify(S.rows.map((r) => r.order_bag)),
				} }).then((r) => {
					const res = (r.message || {}).results || [];
					const refused = [];
					res.forEach((x) => { if (x.row) S.rows.push(x.row); else refused.push(`${x.code} ${x.rejected}`); });
					const ok = res.length - refused.length;
					if (ok) { S.sorted = false; S.dirty = true; }
					paint();
					say(refused.length ? __("{0} added, {1} refused: {2}", [ok, refused.length, refused.join("; ")])
						: __("{0} added by filter.", [ok]), refused.length > 0);
				}).always(() => frappe.dom.unfreeze());
			},
		});
		const $b = $(dlg.body);
		$b.html(`
			<style>
			.cp-top{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px;}
			.cp-top select,.cp-q{border:1px solid var(--border-color);border-radius:7px;height:30px;
				padding:2px 9px;font-size:12.5px;background:var(--control-bg);color:var(--text-color);}
			.cp-q{width:200px;}
			.cp-pill{border:1px solid var(--border-color);border-radius:11px;padding:2px 11px;
				font-size:12.5px;cursor:pointer;color:var(--text-muted);}
			.cp-pill.on{background:#1f618d;border-color:#1f618d;color:#fff;font-weight:700;}
			.cp-count{margin-left:auto;font-size:12px;color:var(--text-muted);}
			.cp-short{display:none;align-items:center;gap:10px;margin-bottom:9px;padding:7px 11px;
				border:1px solid #b02a2a;border-left:4px solid #b02a2a;border-radius:7px;
				background:rgba(176,42,42,.09);color:#b02a2a;font-size:12.5px;font-weight:700;}
			[data-theme="dark"] .cp-short{color:#f0a0a0;background:rgba(176,42,42,.20);}
			.cp-box{border:1px solid var(--border-color);border-radius:10px;overflow:auto;max-height:52vh;}
			table.cp-t{width:100%;border-collapse:collapse;font-size:12.5px;}
			table.cp-t th{position:sticky;top:0;z-index:1;background:var(--control-bg);text-align:left;font-size:10px;
				text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);padding:7px 9px;
				border-bottom:1px solid var(--border-color);}
			table.cp-t td{padding:5px 9px;border-bottom:1px solid var(--border-color);}
			table.cp-t td.num,table.cp-t th.num{text-align:right;font-variant-numeric:tabular-nums;}
			table.cp-t tr.on td{background:rgba(31,97,141,.09);}
			table.cp-t tr.have td{opacity:.5;}
			.cp-qual{font-size:10.5px;font-weight:700;border-radius:7px;padding:0 6px;
				background:var(--control-bg);border:1px solid var(--border-color);}
			.cp-empty{padding:26px;text-align:center;color:var(--text-muted);}
			</style>
			<div class="cp-top">
				<select class="cp-f" data-f="bucket"><option value="">${__("— bucket —")}</option></select>
				<select class="cp-f" data-f="design_type"><option value="">${__("— type —")}</option></select>
				<select class="cp-f" data-f="karat"><option value="">${__("— karat —")}</option></select>
				<select class="cp-f" data-f="held_by"><option value="">${__("— held by —")}</option></select>
				<input type="text" class="cp-q" placeholder="${__("Search card / design / holder")}">
				<span class="cp-pill cp-selonly">${__("Selected only")}</span>
				<button class="btn btn-xs btn-default cp-reset">${__("Reset")}</button>
				<button class="btn btn-xs btn-default cp-clear" style="display:none;">${__("Clear selection")}</button>
				<span class="cp-count"></span>
			</div>
			<div class="cp-short"><span class="cp-short-t"></span>
				<button class="btn btn-xs btn-danger cp-all">${__("Load all")}</button></div>
			<div class="cp-box"><table class="cp-t">
				<thead><tr><th style="width:32px;"><input type="checkbox" class="cp-head-cb"
						title="${__("Select / clear all shown")}"></th>
					<th>${__("Piece")}</th><th>${__("Design")}</th><th>${__("Type")}</th><th>${__("Quality")}</th>
					<th>${__("Bucket")}</th><th>${__("Held by")}</th>
					<th class="num">${__("Gross g")}</th><th class="num">${__("Nett g")}</th><th class="num">${__("DMD ct")}</th></tr></thead>
				<tbody class="cp-body"></tbody></table></div>`);

		const visible = () => (P.selOnly ? P.rows.filter((r) => P.sel.has(r.name)) : P.rows);

		function paintP() {
			const rows = visible();
			$b.find(".cp-body").html(rows.length ? rows.map((r) => {
				const have = onList(r.name);
				return `<tr class="${P.sel.has(r.name) ? "on" : ""} ${have ? "have" : ""}">
					<td><input type="checkbox" data-nm="${esc(r.name)}" ${P.sel.has(r.name) ? "checked" : ""}
						${have ? `disabled title="${__("Already in this parcel")}"` : ""}></td>
					<td><b>${esc(r.name)}</b></td><td>${esc(r.design || "")}</td>
					<td>${esc(r.design_type || "")}</td>
					<td>${r.quality ? `<span class="cp-qual">${esc(r.quality)}</span>` : "—"}</td>
					<td>${esc(r.bucket || "")}</td><td>${esc(r.held_by || "")}</td>
					<td class="num">${flt(r.gross).toFixed(3)}</td>
					<td class="num">${flt(r.nett).toFixed(3)}</td>
					<td class="num">${flt(r.dmd_ct).toFixed(3)}</td></tr>`;
			}).join("") : `<tr><td colspan="10" class="cp-empty">${P.selOnly
				? __("Nothing ticked yet.") : __("Nothing matches — or everything that does is already in a parcel.")}</td></tr>`);

			const short = !P.selOnly && P.hasMore;
			$b.find(".cp-short").css("display", short ? "flex" : "none");
			if (short) {
				$b.find(".cp-short-t").text(__("Showing {0} of {1} — {2} more match this filter.",
					[P.rows.length, P.total, P.total - P.rows.length]));
				$b.find(".cp-all").text(__("Load all {0}", [P.total]));
			}
			$b.find(".cp-count").text(__("{0} ticked · {1} shown · {2} available", [P.sel.size, rows.length, P.total]));
			$b.find(".cp-clear").toggle(P.sel.size > 0).text(__("Clear selection ({0})", [P.sel.size]));
			if (jewelima.shiftSelect) jewelima.shiftSelect($b, ".cp-body input");
			$b.find(".cp-body input").on("change", function () {
				this.checked ? P.sel.add(this.dataset.nm) : P.sel.delete(this.dataset.nm);
				P.selOnly ? load() : paintP();
			});
			const pick = rows.filter((r) => !onList(r.name));
			const hit = pick.filter((r) => P.sel.has(r.name)).length;
			const h = $b.find(".cp-head-cb")[0];
			if (h) { h.checked = pick.length > 0 && hit === pick.length; h.indeterminate = hit > 0 && hit < pick.length; }
			dlg.get_primary_btn().text(P.sel.size ? __("Add {0} to parcel", [P.sel.size]) : __("Add to parcel"));
		}

		function load(more, all) {
			if (jewelima.busy) jewelima.busy($b.find("table.cp-t"), true, all ? __("Loading all…") : __("Looking…"));
			const args = P.selOnly
				? { names: JSON.stringify([...P.sel]), limit: Math.max(P.sel.size, PAGE) }
				: { bucket: P.bucket, design_type: P.design_type, karat: P.karat, held_by: P.held_by, search: P.q,
					limit: all ? Math.max(P.total, PAGE) : PAGE, offset: all || !more ? 0 : P.rows.length };
			args.prep = S.prep || null;
			frappe.call({ method: API + ".get_sellable", freeze: false, args }).then((r) => {
				const m = r.message || {};
				P.rows = more && !all ? P.rows.concat(m.rows || []) : (m.rows || []);
				P.total = m.total || 0;
				P.hasMore = !!m.has_more;
				paintP();
			}).always(() => { if (jewelima.busy) jewelima.busy($b.find("table.cp-t"), false); });
		}

		$b.on("change", ".cp-f", function () { P[this.dataset.f] = this.value; load(); });
		$b.on("input", ".cp-q", frappe.utils.debounce(function () { P.q = this.value || ""; load(); }, 300));
		$b.on("click", ".cp-all", () => load(true, true));
		$b.on("click", ".cp-selonly", function () {
			P.selOnly = !P.selOnly;
			$(this).toggleClass("on", P.selOnly);
			P.bucket = P.design_type = P.karat = P.held_by = P.q = "";
			$b.find(".cp-f").val(""); $b.find(".cp-q").val("");
			load();
		});
		$b.on("click", ".cp-clear", function () {
			P.sel.clear();
			const was = P.selOnly;
			P.selOnly = false;
			$b.find(".cp-selonly").removeClass("on");
			was ? load() : paintP();
		});
		$b.on("click", ".cp-reset", function () {
			P.bucket = P.design_type = P.karat = P.held_by = P.q = "";
			P.selOnly = false;
			$b.find(".cp-f").val(""); $b.find(".cp-q").val("");
			$b.find(".cp-selonly").removeClass("on");
			load();
		});
		$b.on("change", ".cp-head-cb", function () {
			const on = this.checked;
			visible().filter((r) => !onList(r.name)).forEach((r) => (on ? P.sel.add(r.name) : P.sel.delete(r.name)));
			P.selOnly ? load() : paintP();
		});

		frappe.call({ method: API + ".get_cert_filter_options" }).then((r) => {
			const o = r.message || {};
			const fill = (f, blank, list) => $b.find(`.cp-f[data-f="${f}"]`).html(
				`<option value="">${blank}</option>` + (list || []).map((v) => `<option>${esc(v)}</option>`).join(""));
			fill("bucket", __("— bucket —"), o.buckets);
			fill("design_type", __("— type —"), o.design_types);
			fill("karat", __("— karat —"), o.karats);
			fill("held_by", __("— held by —"), o.holders);
			load();
		});
		dlg.show();
	}
	root.on("click", ".ps-pick", showPicker);

	/** Re-read every piece at the chart and rate now set. The parcel keeps its
	 * order — only the money changes. */
	function reprice() {
		if (!S.rows.length) return Promise.resolve();
		const chart = S.chartCtl.get_value() || null;
		const rate = flt(S.rateCtl.get_value());
		say(__("Re-pricing {0} piece(s)…", [S.rows.length]));
		return Promise.all(S.rows.map((r) => frappe.call({
			method: API + ".scan_sale_prep_piece", freeze: false,
			args: { barcode: r.order_bag, price_chart: chart, gold_rate: rate, prep: S.prep || null },
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
		if ($(this).hasClass("off")) return;
		const payload = {
			customer: S.custCtl.get_value() || "", price_chart: S.chartCtl.get_value() || "",
			gold_rate: flt(S.rateCtl.get_value()), quality: mainQuality(),
			rows: S.rows.map((r, i) => Object.assign({}, r, { sl: i + 1 })),
		};
		open_url_post("/api/method/" + API + ".export_sale_prep_doc",
			{ payload: JSON.stringify(payload), fmt: S.fmt, doc: $(this).data("d") });
	});

	// ---- the tiles ------------------------------------------------------------
	function tileHtml(p) {
		const sold = p.status === "Sold";
		const kind = p.source === "prepare"
			? `<span class="pp-tag fmt">${esc(p.fmt || "DEFAULT")}</span>`
			: `<span class="pp-tag fmt">${__("Sell board")}</span>`;
		return `<div class="pp-card ${sold ? "sold" : ""}" data-name="${esc(p.name)}"
			data-src="${esc(p.source)}" data-status="${esc(p.status)}" data-sale="${esc(p.sale || "")}">
			${sold || p.locked ? "" : `<button class="pp-x" title="${__("Throw this prep away")}">✕</button>`}
			<div class="pp-name">${esc(p.title || p.name)}${p.title ? ` <span class="pp-id">${esc(p.name)}</span>` : ""}
				<span class="pp-tag ${sold ? "sold" : "draft"}">${esc(sold ? __("Sold") : p.status)}</span>
				${kind}
				${p.locked ? `<span class="pp-tag locked">${__("Locked")}</span>` : ""}
				${p.gone ? `<span class="pp-tag gone">${__("{0} not in stock", [p.gone])}</span>` : ""}</div>
			<div class="pp-cust">${esc(p.customer || __("No buyer yet"))}</div>
			<div class="pp-meta">${p.pieces} ${__("piece(s)")} · ${esc(p.chart_name || p.price_chart || __("no chart"))}<br>
				${sold ? __("Sold on {0}, {1}", [esc(p.sale || ""), esc(p.sold_on || "")])
					: esc(frappe.datetime.prettyDate(p.modified))} · ${esc(p.owner_name || p.owner)}</div>
			<div class="pp-foot"><div class="pp-total">${money(p.grand_total)}</div>
				${sold ? `<button class="btn btn-xs btn-default pp-clear">${__("Clear")}</button>` : ""}</div>
		</div>`;
	}

	function loadList() {
		return frappe.call({ method: API + ".get_prepared_boards", freeze: false }).then((r) => {
			const rows = (r.message || {}).rows || [];
			const open = rows.filter((p) => p.status !== "Sold");
			const sold = rows.filter((p) => p.status === "Sold");
			// a parcel left on the bench unsaved is shown first, so leaving the bench
			// never quietly loses what was scanned
			const unsaved = (S.dirty && S.rows.length) ? `
				<div class="pp-card unsaved pp-bench">
					<div class="pp-name">${esc(S.title || S.prep || __("New parcel"))} <span class="pp-tag gone">${__("not saved")}</span></div>
					<div class="pp-cust">${esc(S.custCtl.get_value() || __("No buyer yet"))}</div>
					<div class="pp-meta">${__("{0} piece(s) still on the bench", [S.rows.length])}</div>
				</div>` : "";
			root.find(".ps-lists").html(`
				<div class="ps-sec">${__("Being prepared")} · ${open.length}</div>
				<div class="pp-grid">${unsaved}<div class="pp-card new">+ ${__("New parcel")}</div>${open.map(tileHtml).join("")}</div>
				${sold.length ? `<div class="ps-sec">${__("Sold — clear when done")} · ${sold.length}</div>
					<div class="pp-grid">${sold.map(tileHtml).join("")}</div>` : ""}`);
		});
	}

	/** Leaving an unsaved parcel behind needs a yes. */
	function leaveBench(then) {
		if (S.dirty && S.rows.length) {
			frappe.confirm(__("The parcel on the bench is not saved. Leave it?"), then);
		} else {
			then();
		}
	}

	root.on("click", ".pp-card.new", () => leaveBench(() => {
		resetBench();
		S.keepBench = true;
		frappe.set_route("prepare-sale", "new");
	}));
	root.on("click", ".pp-bench", () => {
		S.keepBench = true;
		frappe.set_route("prepare-sale", S.prep || "new");
	});
	root.on("click", ".pp-card[data-name]", function () {
		const $c = $(this);
		const nm = $c.data("name");
		if ($c.data("status") === "Sold") {
			// the money side of a sold parcel is its sale
			frappe.route_options = { sale: $c.data("sale") };
			return frappe.set_route("sales-history");
		}
		if ($c.data("src") !== "prepare") {
			frappe.route_options = { prep: nm };
			return frappe.set_route("sell");
		}
		if (nm === S.prep) {
			S.keepBench = true;
			return frappe.set_route("prepare-sale", nm);
		}
		leaveBench(() => frappe.set_route("prepare-sale", nm));
	});
	root.on("click", ".pp-x", function (e) {
		e.stopPropagation();          // the card itself opens the parcel
		const nm = $(this).closest(".pp-card").data("name");
		frappe.confirm(__("Throw away {0}? The pieces on it go back to being unspoken for.", [nm]), () => {
			frappe.call({ method: API + ".discard_sale_prep", args: { name: nm } }).then(() => {
				if (S.prep === nm) resetBench();
				frappe.show_alert({ message: __("{0} thrown away.", [nm]), indicator: "green" }, 4);
				loadList();
			});
		});
	});
	root.on("click", ".pp-clear", function (e) {
		e.stopPropagation();
		const nm = $(this).closest(".pp-card").data("name");
		frappe.confirm(__("Clear {0} off the board? It stays in Sales History.", [nm]), () => {
			frappe.call({ method: API + ".clear_sold_prep", args: { name: nm } }).then(() => {
				frappe.show_alert({ message: __("{0} moved to Sales History.", [nm]), indicator: "green" }, 5);
				loadList();
			});
		});
	});

	// ---- the bench ----------------------------------------------------------------
	/** Set the header without each control re-pricing the parcel. A Link validates
	 * over the network, so the flag comes down when the controls say they are
	 * done — never on a timer, which the tunnel would outrun. */
	function setHeader(h) {
		S.loading = true;
		S.fmt = h.fmt || firstFmt();
		return Promise.all([
			S.custCtl.set_value(h.customer || ""),
			S.chartCtl.set_value(h.price_chart || ""),
			S.rateCtl.set_value(h.gold_rate || ""),

			S.fmtCtl.set_value(S.fmt),
		]).then(() => { S.loading = false; });
	}
	function lockHeader(on) {
		[S.custCtl, S.chartCtl, S.rateCtl, S.fmtCtl].forEach((c) => {
			c.df.read_only = on ? 1 : 0;
			c.refresh();
		});
	}
	const firstFmt = () => ((((S.ctx || {}).formats || [])[0]) || {}).key || "DEFAULT";

	function resetBench() {
		S.rows = []; S.sorted = false; S.prep = null; S.title = ""; S.dirty = false; S.locked = false; S.out = [];
		lockHeader(false);
		say("");
		return setHeader({}).then(() => paint());
	}

	/** Ask what to call the parcel. Offers the buyer, the format and today, which the
	 * desk can take as it is or overwrite; left empty, the SPREP number stands in.
	 * Resolves with the name, or null when the dialog is closed without saving. */
	function askName(current, action) {
		const fmtLabel = (fmtSpec() || {}).label || S.fmt || "";
		const offer = current || [S.custCtl.get_value(), fmtLabel,
			frappe.datetime.str_to_user(frappe.datetime.get_today())].filter(Boolean).join(" · ");
		return new Promise((resolve) => {
			let done = false;
			const d = new frappe.ui.Dialog({
				title: current ? __("Rename parcel") : __("Save parcel as"),
				fields: [{ fieldname: "title", fieldtype: "Data", label: __("Parcel name"), default: offer }],
				primary_action_label: action || __("Save"),
				primary_action(v) {
					done = true;
					d.hide();
					resolve((v.title || "").trim());
				},
			});
			d.onhide = () => { if (!done) resolve(null); };
			d.show();
			const $in = d.get_field("title").$input;
			$in.on("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); d.get_primary_btn().trigger("click"); } });
			setTimeout(() => $in.trigger("focus").trigger("select"), 0);
		});
	}

	/** Save, asking for a name the first time. Resolves with the saved parcel, or
	 * null when the desk backs out of the name. */
	function saveParcel(opts) {
		opts = opts || {};
		if (!S.prep && !opts.named) {
			return askName("", opts.action).then((t) => {
				if (t === null) return null;
				S.title = t;
				return saveParcel(Object.assign({}, opts, { named: true }));
			});
		}
		return frappe.call({
			method: API + ".save_parcel",
			args: { payload: JSON.stringify({
				name: S.prep, title: S.title || "", fmt: S.fmt, sorted: S.sorted ? 1 : 0,
				customer: S.custCtl.get_value() || "", price_chart: S.chartCtl.get_value() || "",
				gold_rate: flt(S.rateCtl.get_value()), quality: qualities().map((x) => x.q).join(", "),
				rows: S.rows,
			}) },
		}).then((r) => {
			const m = r.message || {};
			S.prep = m.name;
			S.title = m.title || "";
			S.dirty = false;
			paint();
			frappe.show_alert({ message: __("Saved as {0} — {1} piece(s).", [m.title || m.name, m.pieces]), indicator: "green" }, 4);
			if (opts.route !== false && (frappe.get_route() || [])[1] !== m.name) {
				S.keepBench = true;
				frappe.set_route("prepare-sale", m.name);
			}
			return m;
		});
	}

	function openParcel(nm) {
		return frappe.call({ method: API + ".get_parcel", args: { name: nm } }).then((r) => {
			const m = r.message || {};
			S.prep = m.name;
			S.title = m.title || "";
			S.rows = m.rows || [];
			S.sorted = !!m.sorted;
			S.dirty = false;
			S.locked = !!m.locked;
			S.out = m.out_of_stock || [];
			lockHeader(false);
			return setHeader(m).then(() => {
				lockHeader(S.locked);
				say(S.locked ? __("Locked by {0} — open to read and paper, not to change.", [m.locked_by || "?"])
					: __("Opened {0}.", [m.name]));
				showBench();
			});
		}).catch(() => {
			// sold, thrown away, or parked from Sell — back to the tiles, which say which
			resetBench();
			frappe.set_route("prepare-sale");
		});
	}

	// ---- the two views -------------------------------------------------------------
	function showList() {
		S.view = "list";
		root.find(".ps-work").prop("hidden", true);
		root.find(".ps-list").prop("hidden", false);
		page.clear_primary_action();
		page.clear_inner_toolbar();
		page.set_primary_action(__("New parcel"), () => { root.find(".pp-card.new").trigger("click"); }, "add");
		page.add_inner_button(__("Sell"), () => frappe.set_route("sell"));
		page.add_inner_button(__("Sales History"), () => frappe.set_route("sales-history"));
		loadList();
	}

	function showBench() {
		S.view = "bench";
		root.find(".ps-list").prop("hidden", true);
		root.find(".ps-work").prop("hidden", false);
		page.clear_primary_action();
		page.clear_inner_toolbar();
		if (!S.locked) page.set_primary_action(__("Save"), () => { saveParcel(); }, "save");
		page.add_inner_button(__("All parcels"), () => {
			// an unsaved parcel is kept and shown as a tile — nothing is lost by looking
			frappe.set_route("prepare-sale");
		});
		page.add_inner_button(__("Send to Sell"), () => {
			if (!S.rows.length) { frappe.msgprint(__("Scan some pieces first.")); return; }
			const go = (nm) => { frappe.route_options = { prep: nm }; frappe.set_route("sell"); };
			// a locked parcel is already saved; anything else is saved first, so Sell
			// opens THIS parcel and the sale marks it Sold
			if (S.locked) return go(S.prep);
			saveParcel({ route: false, action: __("Save and send") }).then((m) => { if (m) go(m.name); });
		});
		if (S.prep && !S.locked) {
			page.add_inner_button(__("Lock"), () => {
				if (S.dirty) { frappe.msgprint(__("Save the parcel before locking it.")); return; }
				frappe.confirm(__("Lock {0}? Anyone can still open it, download its sheets and sell it, but no piece can be added or taken off and it cannot be thrown away. This cannot be undone.", [S.prep]), () => {
					frappe.call({ method: API + ".lock_parcel", args: { name: S.prep } }).then(() => {
						frappe.show_alert({ message: __("{0} locked.", [S.prep]), indicator: "blue" }, 4);
						openParcel(S.prep);
					});
				});
			});
		}
		paint();
		setTimeout(() => root.find(".ps-box").focus(), 150);
	}

	root.on("click", ".ps-state[data-rename]", () => {
		if (!S.prep) return;
		askName(S.title || S.prep, __("Rename")).then((t) => {
			if (t === null || t === (S.title || "")) return;
			frappe.call({ method: API + ".rename_parcel", args: { name: S.prep, title: t } }).then((r) => {
				S.title = (r.message || {}).title || "";
				paintState();
			});
		});
	});

	function route() {
		const arg = (frappe.get_route() || [])[1];
		const keep = S.keepBench;
		S.keepBench = false;
		if (!arg) return showList();
		if (arg === "new") {
			if (keep) return showBench();
			return resetBench().then(showBench);
		}
		// the parcel already on the bench, with unsaved work — show it as it is
		if (arg === S.prep && (keep || S.dirty)) return showBench();
		return openParcel(arg);
	}

	// ---- header --------------------------------------------------------------
	S.custCtl = mk(".h-cust", { fieldtype: "Link", label: __("Buyer"), fieldname: "customer", options: "Customer",
		onchange: () => { if (!S.loading && S.rows.length) { S.dirty = true; paint(); } } });
	S.fmtCtl = mk(".h-fmt", { fieldtype: "Select", label: __("Format"), fieldname: "fmt", options: [],
		onchange: () => { S.fmt = S.fmtCtl.get_value() || "DEFAULT"; if (!S.loading && S.rows.length) S.dirty = true; paint(); } });
	S.chartCtl = mk(".h-chart", { fieldtype: "Link", label: __("Price chart"), fieldname: "price_chart",
		options: "Price Chart", onchange: () => { paintDocs(); if (S.loading) return; S.dirty = S.rows.length > 0; reprice(); } });
	S.rateCtl = mk(".h-rate", { fieldtype: "Currency", label: __("Gold rate / g"), fieldname: "gold_rate",
		onchange: () => { if (S.loading) return; S.dirty = S.rows.length > 0; reprice(); } });

	frappe.pages["prepare-sale"].on_page_show = () => { if (S.ctx) route(); };

	frappe.call({ method: API + ".get_sale_prep_formats" }).then((r) => {
		S.ctx = r.message || { formats: [] };
		const opts = (S.ctx.formats || []).map((f) => ({ label: f.label, value: f.key }));
		S.fmtCtl.df.options = opts;
		S.fmtCtl.refresh();
		S.fmt = firstFmt();
		S.loading = true;
		Promise.resolve(S.fmtCtl.set_value(S.fmt)).then(() => { S.loading = false; route(); });
	});
};
