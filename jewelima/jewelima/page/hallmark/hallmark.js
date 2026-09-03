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
		.hb.ok{background:#1d7a33;} .hb.no{background:#b02a2a;}
		</style>
		<div class="hm-bar">
			<div class="hm-f"><label>${__("Centre")}</label><select class="hm-center"></select></div>
			<div class="hm-f hm-scan"><label>${__("Scan piece")}</label>
				<input type="text" placeholder="${__("scan / type card no. + Enter")}"></div>
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
				<td><span class="hb ${h.ok ? "ok" : "no"}">${h.ok ? __("ADDED") : __("NO")}</span></td>
				<td>${esc(h.why || "")}</td></tr>`).join("")}</table>`
			: `<div class="hm-none">${__("Every scan lands here, good or refused.")}</div>`);
	}

	function paint() {
		const b = root.find(".hm-body");
		if (!S.rows.length) {
			b.html(`<div class="hm-none">${__("Pick the centre, then scan the pieces.")}</div>`);
			root.find(".hm-tot").html("");
		} else {
			b.html(`<table class="hm-t"><thead><tr>
				<th style="width:40px;">#</th><th>${__("Card")}</th><th>${__("Design")}</th>
				<th>${__("Type")}</th><th class="num">${__("Gross g")}</th>
				<th class="num">${__("DMD ct")}</th><th style="width:34px;"></th></tr></thead><tbody>`
				+ S.rows.map((r, i) => `<tr data-n="${esc(r.order_bag)}">
					<td>${i + 1}</td><td><b>${esc(r.order_bag)}</b></td>
					<td>${esc(r.design || "")}</td><td>${esc(r.design_type || "")}</td>
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
			.text(S.rows.length ? __("PREP {0} PIECE(S)", [S.rows.length]) : __("PREP"));
		page.set_indicator(`${S.rows.length} ${__("piece(s)")}`, S.rows.length ? "blue" : "gray");
	}

	// the draft is validated server-side per scan, so a piece that cannot go says
	// why HERE — not at send time when the packet is already made up
	function add(code) {
		code = (code || "").trim();
		if (!code) return;
		if (!S.center) { msg("warn", __("Pick the centre first.")); return focusScan(); }
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
				S.rows = [];
				msg("ok", __("Batch <b>{0}</b> is ready to send.", [esc(m.name)]));
				paint();
				focusScan();
			}).catch(() => frappe.dom.unfreeze());
	});

	loadCenters();
	paint();
	paintHist();
	focusScan();
	frappe.pages["hallmark"].on_page_show = focusScan;
};
