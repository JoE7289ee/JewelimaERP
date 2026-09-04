// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Hallmark desk (Delivery > Hallmarking) — PREPARE a batch: pick the centre,
// then scan products into a LOCAL draft (nothing is saved until PREP). Every
// rejected scan lands in the history with WHY, so a piece that will not go is
// explained on the spot rather than at send time.
//
// There is no format to lock and no colour or clarity to pick — that is what
// makes hallmarking its own desk rather than a certification. The one rule
// worth enforcing early is that a piece already carrying a HUID has been
// hallmarked and does not go again.
// Route: /app/hallmark

frappe.pages["hallmark"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Hallmark", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const root = $(page.main);
	// the draft lives here until PREP — S.rows is the batch-to-be
	const S = { center: "", rows: [], hist: [] };

	root.append(`
		<style>
		#page-hallmark .container{max-width:100%;}
		.hm-bar{display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px;
			border:1px solid var(--border-color);border-radius:13px;padding:13px 16px;background:var(--fg-color);}
		.hm-f label{display:block;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;
			color:var(--text-muted);margin-bottom:3px;}
		.hm-f select,.hm-f input{border:1px solid var(--border-color);border-radius:8px;height:32px;
			padding:2px 10px;font-size:13px;background:var(--control-bg);color:var(--text-color);}
		.hm-scan input{width:230px;border:2px solid var(--primary);font-weight:600;}
		.hm-go{background:#1f618d;border:none;color:#fff;font-weight:800;letter-spacing:.4px;
			padding:9px 26px;border-radius:9px;font-size:13.5px;cursor:pointer;}
		.hm-go:disabled{opacity:.4;cursor:default;}
		.hm-btn{background:none;border:1px solid var(--border-color);border-radius:8px;padding:8px 15px;
			font-size:12.5px;cursor:pointer;color:var(--text-color);}
		.hm-actions{display:flex;gap:9px;align-items:center;margin-left:auto;}
		.hm-msg{margin:8px 0;font-size:12.5px;min-height:18px;}
		.hm-msg.ok{color:#1d7a33;} .hm-msg.err{color:#b02a2a;} .hm-msg.warn{color:#8a6d00;}
		.hm-cols{display:grid;grid-template-columns:1fr 340px;gap:16px;align-items:start;}
		table.hm-t{width:100%;border-collapse:collapse;font-size:12.5px;background:var(--fg-color);
			border:1px solid var(--border-color);border-radius:10px;overflow:hidden;}
		table.hm-t th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em;
			color:var(--text-muted);padding:7px 10px;border-bottom:1px solid var(--border-color);
			background:var(--control-bg);}
		table.hm-t td{padding:6px 10px;border-bottom:1px solid var(--border-color);}
		table.hm-t tbody tr:nth-child(even) td{background:rgba(128,128,128,.055);}
		table.hm-t td.num{text-align:right;font-variant-numeric:tabular-nums;}
		.hm-x{color:#b02a2a;cursor:pointer;font-weight:800;}
		.hm-none{padding:26px;text-align:center;color:var(--text-muted);font-size:13px;}
		.hm-tot{display:flex;gap:18px;margin-top:10px;font-size:13px;}
		.hm-tot b{font-size:16px;}
		.hm-sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;
			color:var(--text-muted);margin:0 0 8px;}
		.hm-hist{border:1px solid var(--border-color);border-radius:10px;background:var(--fg-color);
			max-height:520px;overflow:auto;}
		.hm-hist table{width:100%;border-collapse:collapse;font-size:12px;}
		.hm-hist td{padding:5px 9px;border-bottom:1px solid var(--border-color);vertical-align:top;}
		.hb{display:inline-block;border-radius:9px;padding:0 7px;font-size:10px;font-weight:800;color:#fff;}
		.hb.ok{background:#1d7a33;} .hb.no{background:#b02a2a;} .hb.by{background:#4a5a6a;}
		</style>
		<div class="hm-bar">
			<div class="hm-f"><label>${__("Centre")}</label><select class="hm-center"></select></div>
			<div class="hm-f hm-scan"><label>${__("Scan piece")}</label>
				<input type="text" placeholder="${__("scan / type card no. + Enter")}"></div>
			<button class="hm-btn hm-pick">${__("Add by filter…")}</button>
			<span class="hm-actions">
				<button class="hm-go" disabled>${__("PREP")}</button>
				<button class="hm-btn hm-clear">${__("Clear")}</button>
			</span>
		</div>
		<div class="hm-msg"></div>
		<div class="hm-cols">
			<div>
				<div class="hm-sec">${__("On this batch")}</div>
				<div class="hm-body"></div>
				<div class="hm-tot"></div>
			</div>
			<div>
				<div class="hm-sec">${__("Scan history")}</div>
				<div class="hm-hist"></div>
			</div>
		</div>
	`);

	const $scan = root.find(".hm-scan input");
	const focusScan = () => setTimeout(() => $scan.focus(), 30);
	const msg = (k, h) => root.find(".hm-msg").removeClass("ok err warn").addClass(k).html(h);

	function paintHist() {
		root.find(".hm-hist").html(S.hist.length
			? `<table>${S.hist.map((h) => `<tr>
				<td style="white-space:nowrap;">${esc(h.code)}</td>
				<td style="white-space:nowrap;"><span class="hb ${h.ok ? "ok" : "no"}">${h.ok ? __("ADDED") : __("NO")}</span>${
					h.by ? ` <span class="hb by">${__("BY FILTER")}</span>` : ""}</td>
				<td>${esc(h.why || "")}</td></tr>`).join("")}</table>`
			: `<div class="hm-none">${__("Every scan lands here, good or refused.")}</div>`);
	}

	function paint() {
		const b = root.find(".hm-body");
		if (!S.rows.length) {
			b.html(`<div class="hm-none">${__("Scan the pieces, or add them by filter.")}</div>`);
			root.find(".hm-tot").html("");
		} else {
			b.html(`<table class="hm-t"><thead><tr>
				<th style="width:40px;">#</th><th>${__("Card")}</th><th>${__("Design")}</th>
				<th>${__("Type")}</th><th class="num">${__("Gross g")}</th>
				<th class="num">${__("DMD ct")}</th><th style="width:34px;"></th></tr></thead><tbody>`
				+ S.rows.map((r, i) => `<tr data-n="${esc(r.order_bag)}">
					<td>${i + 1}</td><td><b>${esc(r.order_bag)}</b></td>
					<td>${esc(r.design_no || r.design || "")}</td><td>${esc(r.design_type || "")}</td>
					<td class="num">${flt(r.gross).toFixed(3)}</td>
					<td class="num">${flt(r.dmd_ct).toFixed(3)}</td>
					<td><span class="hm-x" title="${__("remove")}">&times;</span></td></tr>`).join("")
				+ `</tbody></table>`);
			const g = S.rows.reduce((a, r) => a + flt(r.gross), 0);
			const d = S.rows.reduce((a, r) => a + flt(r.dmd_ct), 0);
			root.find(".hm-tot").html(`<span><b>${S.rows.length}</b> ${__("piece(s)")}</span>`
				+ `<span><b>${g.toFixed(3)}</b> g ${__("gross")}</span>`
				+ `<span><b>${d.toFixed(3)}</b> ct ${__("diamond")}</span>`);
		}
		root.find(".hm-go").prop("disabled", !(S.rows.length && S.center))
			.attr("title", S.rows.length && !S.center ? __("Pick the centre to prep this batch.") : "")
			.text(S.rows.length ? __("PREP {0} PIECE(S)", [S.rows.length]) : __("PREP"));
		page.set_indicator(`${S.rows.length} ${__("piece(s)")}`, S.rows.length ? "blue" : "gray");
	}

	// the draft is validated server-side per scan, so a piece that cannot go says
	// why HERE — not at send time when the packet is already made up
	function add(code) {
		code = (code || "").trim();
		if (!code) return;
		return frappe.call({ method: API + ".hall_draft_scan", freeze: false,
			args: { barcode: code, existing: JSON.stringify(S.rows.map((r) => r.order_bag)) } })
			.then((r) => {
				const m = r.message || {};
				if (m.rejected) {
					S.hist.unshift({ code, ok: 0, why: m.rejected });
					msg("err", esc(m.rejected));
				} else {
					S.rows.push(m);
					S.hist.unshift({ code: m.order_bag, ok: 1, why: `${m.design || ""} ${flt(m.gross).toFixed(3)} g` });
					msg("ok", __("Added <b>{0}</b> · {1} on the batch.", [esc(m.order_bag), S.rows.length]));
				}
				paintHist();
				paint();
			});
	}

	// The picker hands over a whole tick-list. One call validates the lot — a
	// scan at a time meant 60 round trips for a slice anyone would pull in.
	function addMany(codes) {
		if (!codes.length) return Promise.resolve();
		return frappe.call({ method: API + ".hall_draft_scan_many", freeze: false,
			args: { barcodes: JSON.stringify(codes),
				existing: JSON.stringify(S.rows.map((r) => r.order_bag)) } })
			.then((r) => {
				let ok = 0, no = 0;
				for (const x of (r.message || {}).results || []) {
					if (x.rejected) {
						no++;
						S.hist.unshift({ code: x.code, ok: 0, by: 1, why: x.rejected });
					} else {
						ok++;
						S.rows.push(x.row);
						S.hist.unshift({ code: x.row.order_bag, ok: 1, by: 1,
							why: `${x.row.design || ""} ${flt(x.row.gross).toFixed(3)} g` });
					}
				}
				paintHist();
				paint();
				return { ok, no };
			});
	}

	function loadCenters() {
		frappe.call({ method: API + ".get_hall_prep_context" }).then((r) => {
			const cs = ((r.message || {}).centers || []);
			root.find(".hm-center").html(`<option value="">${__("— pick —")}</option>`
				+ cs.map((c) => `<option value="${esc(c.name)}">${esc(c.center_name)}</option>`).join(""));
			if (cs.length === 1) { S.center = cs[0].name; root.find(".hm-center").val(S.center); }
			paint();
		});
	}

	root.on("change", ".hm-center", function () { S.center = this.value; paint(); focusScan(); });
	$scan.on("keydown", (e) => {
		if (e.which !== 13 && e.key !== "Enter") return;
		e.preventDefault();
		const v = $scan.val();
		$scan.val("");
		add(v);
		focusScan();
	});
	root.on("click", ".hm-x", function () {
		S.rows = S.rows.filter((r) => r.order_bag !== $(this).closest("tr").data("n"));
		paint();
	});
	root.on("click", ".hm-clear", () => { S.rows = []; msg("", ""); paint(); focusScan(); });

	// Scanning is right for a few pieces; hallmarking is nearly every piece, so the
	// desk can also pull a whole slice in — "every RING in the JEWELIMA bucket".
	// Everything picked still goes through the same per-piece validation as a scan.
	root.on("click", ".hm-pick", function () { showPicker(); });

	// The same picker the transfer desk has: filter, tick, shift-click a range,
	// page through the rest. Scanning is right for a handful; hallmarking is
	// nearly every piece, so the desk has to be able to say "every RING in FEMI"
	// and take eighty of them.
	function showPicker() {
		const P = { bucket: "", design_type: "", karat: "", held_by: "", q: "",
			rows: [], sel: new Set(), total: 0, loaded: 0, hasMore: false, selOnly: false };
		const PAGE = 60;
		const dlg = new frappe.ui.Dialog({
			title: __("Pieces to hallmark"), size: "extra-large",
			primary_action_label: __("Add to batch"),
			primary_action() {
				if (!P.sel.size) return frappe.msgprint(__("Tick at least one piece."));
				const picked = [...P.sel];
				dlg.hide();
				// through the SAME guard a scan uses, so a piece that cannot go is
				// refused here too and says why in the history
				frappe.dom.freeze(__("Adding {0}…", [picked.length]));
				addMany(picked)
					.then((c) => {
						frappe.dom.unfreeze();
						msg(c && c.no ? "warn" : "ok", c && c.no
							? __("{0} added by filter, {1} refused · {2} on the batch.",
								[c.ok, c.no, S.rows.length])
							: __("{0} added by filter · {1} on the batch.", [(c || {}).ok || 0, S.rows.length]));
						focusScan();
					}).catch(() => frappe.dom.unfreeze());
			},
		});
		const $b = dlg.$wrapper.find(".modal-body");
		$b.html(`
			<style>
			.hp-top{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px;}
			.hp-top select,.hp-q{border:1px solid var(--border-color);border-radius:7px;height:30px;
				padding:2px 9px;font-size:12.5px;background:var(--control-bg);color:var(--text-color);}
			.hp-q{width:200px;}
			.hp-pill{border:1px solid var(--border-color);border-radius:11px;padding:2px 11px;
				font-size:11.5px;cursor:pointer;user-select:none;}
			.hp-pill.on{background:#1f618d;border-color:#1f618d;color:#fff;font-weight:700;}
			.hp-count{margin-left:auto;font-size:12px;color:var(--text-muted);}
			.hp-short{display:none;align-items:center;gap:10px;margin-bottom:9px;padding:7px 11px;
				border:1px solid #b02a2a;border-left:4px solid #b02a2a;border-radius:7px;
				background:rgba(176,42,42,.09);color:#b02a2a;font-size:12.5px;font-weight:700;}
			[data-theme="dark"] .hp-short{color:#f0a0a0;background:rgba(176,42,42,.20);}
			.hp-short .btn{font-weight:700;}
			.hp-box{max-height:52vh;overflow:auto;border:1px solid var(--border-color);border-radius:9px;}
			table.hp-t{width:100%;border-collapse:collapse;font-size:12.5px;}
			table.hp-t th{position:sticky;top:0;background:var(--control-bg);font-size:10px;
				text-transform:uppercase;color:var(--text-muted);padding:6px 9px;text-align:left;
				border-bottom:2px solid var(--border-color);}
			table.hp-t td{padding:5px 9px;border-bottom:1px solid var(--border-color);}
			table.hp-t tr.on td{background:rgba(31,97,141,.10);}
			table.hp-t td.num{text-align:right;font-variant-numeric:tabular-nums;}
			.hp-empty{padding:26px;text-align:center;color:var(--text-muted);}
			</style>
			<div class="hp-top">
				<select class="hp-f" data-f="bucket"><option value="">${__("— bucket —")}</option></select>
				<select class="hp-f" data-f="design_type"><option value="">${__("— type —")}</option></select>
				<select class="hp-f" data-f="karat"><option value="">${__("— karat —")}</option></select>
				<select class="hp-f" data-f="held_by"><option value="">${__("— held by —")}</option></select>
				<input type="text" class="hp-q" placeholder="${__("Search card / design / holder")}">
				<span class="hp-pill hp-selonly">${__("Selected only")}</span>
				<button class="btn btn-xs btn-default hp-reset">${__("Reset")}</button>
				<button class="btn btn-xs btn-default hp-clear" style="display:none;">${__("Clear selection")}</button>
				<span class="hp-count"></span>
			</div>
			<div class="hp-short">
				<span class="hp-short-t"></span>
				<button class="btn btn-xs btn-danger hp-all">${__("Load all")}</button>
			</div>
			<div class="hp-box"><table class="hp-t">
				<thead><tr><th style="width:34px;"><input type="checkbox" class="hp-head-cb"
						title="${__("Select / clear all shown")}"></th>
					<th>${__("Piece")}</th><th>${__("Design")}</th><th>${__("Type")}</th>
					<th>${__("Bucket")}</th><th>${__("Held by")}</th>
					<th class="num">${__("Gross g")}</th></tr></thead>
				<tbody class="hp-body"></tbody></table></div>`);

		const onBatch = (n) => S.rows.some((r) => r.order_bag === n);
		const visible = () => (P.selOnly ? P.rows.filter((r) => P.sel.has(r.name)) : P.rows);

		function paint() {
			const rows = visible();
			const more = (!P.selOnly && P.hasMore)
				? `<tr><td colspan="7" style="text-align:center;padding:9px;">
					<button class="btn btn-xs btn-default hp-more">${__("Load {0} more", [PAGE])}</button>
					<span style="margin-left:9px;font-size:11.5px;color:var(--text-muted);">${
						__("{0} of {1}", [P.rows.length, P.total])}</span></td></tr>` : "";
			$b.find(".hp-body").html(rows.length
				? rows.map((r) => `<tr class="${P.sel.has(r.name) ? "on" : ""}">
					<td><input type="checkbox" data-nm="${esc(r.name)}" ${P.sel.has(r.name) ? "checked" : ""}
						${onBatch(r.name) ? "disabled title='" + __("Already on the batch") + "'" : ""}></td>
					<td><b>${esc(r.name)}</b></td><td>${esc(r.design || "")}</td>
					<td>${esc(r.design_type || "")}</td><td>${esc(r.bucket || "")}</td>
					<td>${esc(r.held_by || "")}</td>
					<td class="num">${flt(r.gross).toFixed(3)}</td></tr>`).join("") + more
				: `<tr><td colspan="7" class="hp-empty">${P.selOnly
					? __("Nothing ticked yet.")
					: __("Nothing matches — or everything that does is already spoken for.")}</td></tr>`);
			$b.find(".hp-count").text(__("{0} ticked · {1} shown · {2} available",
				[P.sel.size, rows.length, P.total]));
			jewelima.shiftSelect($b, ".hp-body input");
			$b.find(".hp-body input").on("change", function () {
				this.checked ? P.sel.add(this.dataset.nm) : P.sel.delete(this.dataset.nm);
				paint();
			});
			const pick = rows.filter((r) => !onBatch(r.name));
			const hit = pick.filter((r) => P.sel.has(r.name)).length;
			const h = $b.find(".hp-head-cb")[0];
			if (h) { h.checked = pick.length > 0 && hit === pick.length; h.indeterminate = hit > 0 && hit < pick.length; }
			dlg.get_primary_btn().text(P.sel.size ? __("Add {0} to batch", [P.sel.size]) : __("Add to batch"));
			$b.find(".hp-clear").toggle(P.sel.size > 0)
				.text(__("Clear selection ({0})", [P.sel.size]));
			const short = !P.selOnly && P.hasMore;
			$b.find(".hp-short").css("display", short ? "flex" : "none");
			if (short) {
				$b.find(".hp-short-t").text(__("Showing {0} of {1} — {2} more match this filter.",
					[P.rows.length, P.total, P.total - P.rows.length]));
				$b.find(".hp-short .hp-all").text(__("Load all {0}", [P.total]));
			}
		}

		function load(more, all) {
			jewelima.busy($b.find("table.hp-t"), true, all ? __("Loading all…") : __("Looking…"));
			frappe.call({ method: API + ".get_hallmarkable", freeze: false,
				args: { bucket: P.bucket, design_type: P.design_type, karat: P.karat,
					held_by: P.held_by, search: P.q,
					limit: all ? Math.max(P.total, PAGE) : PAGE,
					offset: all || !more ? 0 : P.rows.length } })
				.then((r) => {
					const m = r.message || {};
					P.rows = more && !all ? P.rows.concat(m.rows || []) : (m.rows || []);
					P.total = m.total || 0;
					P.hasMore = !!m.has_more;
					paint();
				}).always(() => jewelima.busy($b.find("table.hp-t"), false));
		}

		$b.on("change", ".hp-f", function () { P[this.dataset.f] = this.value; load(); });
		$b.on("input", ".hp-q", frappe.utils.debounce(function () { P.q = this.value || ""; load(); }, 300));
		$b.on("click", ".hp-more", () => load(true));
		$b.on("click", ".hp-all", () => load(true, true));
		$b.on("click", ".hp-clear", function () {
			P.sel.clear();
			// "Selected only" with nothing selected reads as an empty picker, so
			// clearing the ticks drops that view too
			P.selOnly = false;
			$b.find(".hp-selonly").removeClass("on");
			paint();
		});
		$b.on("click", ".hp-selonly", function () {
			P.selOnly = !P.selOnly; $(this).toggleClass("on", P.selOnly); paint();
		});
		$b.on("click", ".hp-reset", function () {
			P.bucket = P.design_type = P.karat = P.held_by = P.q = "";
			P.selOnly = false;
			$b.find(".hp-f").val(""); $b.find(".hp-q").val("");
			$b.find(".hp-selonly").removeClass("on");
			load();
		});
		$b.on("change", ".hp-head-cb", function () {
			const on = this.checked;
			visible().filter((r) => !onBatch(r.name))
				.forEach((r) => (on ? P.sel.add(r.name) : P.sel.delete(r.name)));
			paint();
		});

		frappe.call({ method: API + ".get_hallmark_filter_options" }).then((r) => {
			const o = r.message || {};
			const fill = (f, blank, list) => $b.find(`.hp-f[data-f="${f}"]`).html(
				`<option value="">${blank}</option>`
				+ (list || []).map((v) => `<option>${esc(v)}</option>`).join(""));
			fill("bucket", __("— bucket —"), o.buckets);
			fill("design_type", __("— type —"), o.design_types);
			fill("karat", __("— karat —"), o.karats);
			fill("held_by", __("— held by —"), o.holders);
			load();
		});
		dlg.show();
	}

	root.on("click", ".hm-go", function () {
		if (!S.rows.length || !S.center) return;
		frappe.dom.freeze(__("Prepping…"));
		frappe.call({ method: API + ".hall_prep_create",
			args: { center: S.center, bags: JSON.stringify(S.rows.map((r) => r.order_bag)) } })
			.then((r) => {
				frappe.dom.unfreeze();
				const m = r.message || {};
				frappe.show_alert({ message: __("{0} prepped — {1} piece(s). Send it from Send Hallmarking.",
					[m.name, m.count]), indicator: "green" }, 7);
				msg("ok", __("Batch <b>{0}</b> is ready to send.", [esc(m.name)]));
				S.rows = []; paint(); focusScan();
			}).catch(() => frappe.dom.unfreeze());
	});

	loadCenters();
	paint();
	paintHist();
	focusScan();
	frappe.pages["hallmark"].on_page_show = focusScan;
};
