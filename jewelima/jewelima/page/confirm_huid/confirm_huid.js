// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Confirm HUID (Delivery > Hallmarking) — the piece came back stamped, so this
// is where the code is written down. The code goes onto the PIECE, which is the
// record the bill, the tag and the sale all read.
//
// ONE scan box, because a scanner has one trigger. The page works out what it
// was handed: a six-character code is a HUID, anything else is a card. Scan a
// card and it becomes the one being worked on; scan a code and it is HELD
// against that card; scan a second code and it is held too, because a piece
// stamped in two parts carries two. Scan the next card and the held codes are
// written to the one before it.
//
// Nothing is written until a card is finished — that is what "held" means — so
// the box always shows what is about to be saved, and leaving with something
// held asks first.
// Route: /app/confirm-huid

frappe.pages["confirm-huid"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Confirm HUID", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const root = $(page.main);
	// HELD = the card being worked on and the codes scanned for it, not yet written
	const S = { batches: [], hist: [], mode: "accept", held: null };

	root.append(`
		<style>
		#page-confirm-huid .container{max-width:100%;}
		.ch-bar{display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px;
			border:1px solid var(--border-color);border-radius:13px;padding:13px 16px;background:var(--fg-color);}
		.ch-f label{display:block;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;
			color:var(--text-muted);margin-bottom:3px;}
		.ch-f input{border:1px solid var(--border-color);border-radius:8px;height:34px;padding:2px 10px;
			font-size:14px;font-weight:600;background:var(--control-bg);color:var(--text-color);}
		.ch-card input{width:210px;border:2px solid var(--primary);}
		.ch-huid input{width:150px;text-transform:uppercase;letter-spacing:.12em;}
		.ch-mode{background:#1d7a33;border:none;color:#fff;font-weight:800;padding:9px 20px;
			border-radius:9px;font-size:13px;cursor:pointer;letter-spacing:.4px;}
		.ch-mode.reject{background:#b02a2a;}
		/* what is about to be written — always on screen, never a surprise */
		.ch-held{margin:10px 0 4px;min-height:44px;}
		.ch-hold{display:inline-flex;align-items:center;gap:12px;border:2px solid #1f618d;
			border-radius:11px;padding:8px 15px;background:rgba(31,97,141,.07);}
		.ch-hold .bag{font-size:16px;font-weight:800;}
		.ch-hold .codes{display:flex;gap:7px;}
		.ch-hold .cd{background:#1d7a33;color:#fff;border-radius:7px;padding:2px 9px;
			font-size:12px;font-weight:800;letter-spacing:.1em;}
		.ch-hold .cd.pend{background:#8a6d00;}
		.ch-hold .waiting{font-size:12px;color:var(--text-muted);}
		.ch-msg{margin:8px 0;font-size:13px;min-height:20px;font-weight:600;}
		.ch-msg.ok{color:#1d7a33;} .ch-msg.err{color:#b02a2a;}
		.ch-cols{display:grid;grid-template-columns:1fr 320px;gap:16px;align-items:start;}
		.ch-batch{border:1px solid var(--border-color);border-radius:11px;background:var(--fg-color);
			padding:12px 15px;margin-bottom:14px;}
		.ch-bh{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:9px;}
		.ch-bh .nm{font-size:15px;font-weight:800;}
		.ch-bh .meta{font-size:11.5px;color:var(--text-muted);}
		.ch-chips{display:flex;flex-wrap:wrap;gap:7px;}
		.ch-chip{border:1px solid var(--border-color);border-radius:8px;padding:4px 9px;font-size:11.5px;
			background:var(--control-bg);line-height:1.3;}
		.ch-chip.confirmed{background:rgba(29,122,51,.13);border-color:#1d7a33;}
		.ch-chip.rejected{background:rgba(176,42,42,.13);border-color:#b02a2a;}
		.ch-chip .code{display:block;font-size:10px;font-weight:800;letter-spacing:.1em;color:#1d7a33;}
		.ch-sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;
			color:var(--text-muted);margin:0 0 8px;}
		.ch-hist{border:1px solid var(--border-color);border-radius:10px;background:var(--fg-color);
			max-height:560px;overflow:auto;}
		.ch-hist table{width:100%;border-collapse:collapse;font-size:12px;}
		.ch-hist td{padding:5px 9px;border-bottom:1px solid var(--border-color);vertical-align:top;}
		.hb{display:inline-block;border-radius:9px;padding:0 7px;font-size:10px;font-weight:800;color:#fff;}
		.hb.ok{background:#1d7a33;} .hb.no{background:#b02a2a;} .hb.rej{background:#8a6d00;}
		.ch-empty{padding:26px;text-align:center;color:var(--text-muted);font-size:13px;}
		</style>
		<div class="ch-bar">
			<div class="ch-f ch-card"><label>${__("Scan")}</label>
				<input type="text" placeholder="${__("card, then its code(s)")}"></div>
			<button class="ch-mode">${__("CONFIRMING")}</button>
			<button class="btn btn-sm ch-save" style="display:none;">${__("Save")}</button>
			<span style="font-size:12px;color:var(--text-muted);">${
				__("one box — a 6-character scan is a code, anything else is a card. PENDING if the code is still to come.")}</span>
		</div>
		<div class="ch-held"></div>
		<div class="ch-msg"></div>
		<div class="ch-cols">
			<div><div class="ch-sec">${__("Collected — waiting on their codes")}</div><div class="ch-body"></div></div>
			<div><div class="ch-sec">${__("Scan history")}</div><div class="ch-hist"></div></div>
		</div>
	`);

	const $scan = root.find(".ch-card input");
	const msg = (k, h) => root.find(".ch-msg").removeClass("ok err").addClass(k).html(h);
	const focusScan = () => setTimeout(() => $scan.focus(), 30);

	// a six-character alphanumeric scan is a HUID; PENDING says "stamped, code to
	// follow". A card number carries dots (E7529.1.1), so the two cannot collide.
	const looksLikeCode = (v) => /^[A-Z0-9]{6}$/.test(v) || v === "PENDING";
	const inPool = (bag) => {
		for (const b of S.batches) {
			const p = b.pieces.find((x) => x.order_bag.toUpperCase() === bag);
			if (p) return { batch: b, piece: p };
		}
		return null;
	};

	function paintHist() {
		root.find(".ch-hist").html(S.hist.length
			? `<table>${S.hist.map((h) => `<tr>
				<td style="white-space:nowrap;">${esc(h.code)}</td>
				<td><span class="hb ${h.kind}">${esc(h.tag)}</span></td>
				<td>${esc(h.why || "")}</td></tr>`).join("")}</table>`
			: `<div class="ch-empty">${__("Every scan lands here.")}</div>`);
	}

	function paint() {
		root.find(".ch-body").html(S.batches.length ? S.batches.map((b) => `
			<div class="ch-batch">
				<div class="ch-bh">
					<span class="nm">${esc(b.name)}</span>
					<span class="meta">${esc(b.center || "")} · ${__("collected")} ${esc(b.collected_on || "")}
						· ${b.pieces.filter((p) => p.state === "pending").length} ${__("left")}</span>
				</div>
				<div class="ch-chips">${b.pieces.map((p) => `
					<span class="ch-chip ${p.state}" title="${esc(p.design || "")}${p.by ? " · " + esc(p.by) : ""}">
						${esc(p.order_bag)}${p.huid ? p.huid.split(",").map((h) =>
							`<span class="code">${esc(h.trim())}</span>`).join("") : ""}</span>`).join("")}</div>
			</div>`).join("") : `<div class="ch-empty">${__("Nothing collected and waiting. Collect a batch on Hallmark Out first.")}</div>`);
		const pend = S.batches.reduce((a, b) => a + b.pieces.filter((p) => p.state === "pending").length, 0);
		page.set_indicator(`${pend} ${__("to confirm")}`, pend ? "orange" : "green");
	}

	function load() {
		return frappe.call({ method: API + ".get_huid_pool", freeze: false }).then((r) => {
			S.batches = (r.message || {}).batches || [];
			paint();
		});
	}

	function paintHeld() {
		const h = S.held;
		root.find(".ch-save").toggle(!!(h && h.codes.length));
		if (!h) { root.find(".ch-held").html(""); return; }
		root.find(".ch-held").html(`<div class="ch-hold">
			<span class="bag">${esc(h.bag)}</span>
			${h.codes.length
				? `<span class="codes">${h.codes.map((c) => `<span class="cd ${c === "PENDING" ? "pend" : ""}">${esc(c)}</span>`).join("")}</span>`
				: `<span class="waiting">${__("scan its code…")}</span>`}
			${h.codes.length ? `<span class="waiting">${__("scan the next card to save")}</span>` : ""}
		</div>`);
	}

	// write the held card away. Called when the next card is scanned, on Enter,
	// on Save, and before leaving the page — a code that was scanned is never
	// silently dropped.
	function commit() {
		const h = S.held;
		if (!h || !h.codes.length) { S.held = null; paintHeld(); return Promise.resolve(); }
		S.held = null;
		paintHeld();
		return frappe.call({ method: API + ".huid_scan", freeze: false,
			args: { barcode: h.bag, huid: h.codes.join(", "), mode: "accept" } })
			.then((r) => {
				const m = r.message || {};
				if (m.rejected_scan) {
					S.hist.unshift({ code: h.bag, kind: "no", tag: __("NO"), why: m.rejected_scan });
					msg("err", esc(m.rejected_scan));
				} else {
					S.hist.unshift({ code: h.bag, kind: "ok", tag: __("HUID"), why: m.huid });
					msg("ok", __("<b>{0}</b> → <b>{1}</b>{2}", [esc(h.bag), esc(m.huid),
						m.batch_done ? " · " + __("batch {0} complete", [m.batch]) : ""]));
				}
				paintHist();
				return load();
			});
	}

	function onScan(raw) {
		const v = (raw || "").trim().toUpperCase();
		if (!v) return focusScan();

		// REJECT mode: a card is all it takes, no codes involved
		if (S.mode === "reject") {
			return frappe.call({ method: API + ".huid_scan", freeze: false,
				args: { barcode: v, huid: "", mode: "reject" } }).then((r) => {
				const m = r.message || {};
				if (m.rejected_scan) {
					S.hist.unshift({ code: v, kind: "no", tag: __("NO"), why: m.rejected_scan });
					msg("err", esc(m.rejected_scan));
				} else {
					S.hist.unshift({ code: v, kind: "rej", tag: __("REJECTED"), why: m.batch });
					msg("ok", __("<b>{0}</b> sent to the reject queue.", [esc(v)]));
				}
				paintHist();
				return load();
			}).then(focusScan);
		}

		if (looksLikeCode(v)) {
			if (!S.held) {
				msg("err", __("Scan the card first — {0} has nothing to go on.", [esc(v)]));
				S.hist.unshift({ code: v, kind: "no", tag: __("NO"), why: __("no card scanned yet") });
				paintHist();
				return focusScan();
			}
			if (S.held.codes.includes(v)) {
				msg("err", __("{0} is already held for {1}.", [esc(v), esc(S.held.bag)]));
				return focusScan();
			}
			if (S.held.codes.length >= 2) {
				msg("err", __("{0} already holds two codes — scan the next card to save it.", [esc(S.held.bag)]));
				return focusScan();
			}
			S.held.codes.push(v);
			paintHeld();
			msg("ok", __("<b>{0}</b> held for <b>{1}</b>.", [esc(v), esc(S.held.bag)]));
			return focusScan();
		}

		// a CARD: finish the one before it, then take this one up
		const hit = inPool(v);
		if (!hit) {
			S.hist.unshift({ code: v, kind: "no", tag: __("NO"), why: __("not on any collected batch") });
			msg("err", __("<b>{0}</b> is not on any collected batch.", [esc(v)]));
			paintHist();
			return focusScan();
		}
		if (hit.piece.state !== "pending") {
			S.hist.unshift({ code: v, kind: "no", tag: __("NO"),
				why: hit.piece.state === "confirmed" ? __("already confirmed") : __("already rejected") });
			msg("err", __("<b>{0}</b> is already {1}.", [esc(v), hit.piece.state]));
			paintHist();
			return focusScan();
		}
		return Promise.resolve(commit()).then(() => {
			S.held = { bag: hit.piece.order_bag, codes: [] };
			paintHeld();
			msg("ok", __("<b>{0}</b> — scan its code(s).", [esc(hit.piece.order_bag)]));
			focusScan();
		});
	}

	$scan.on("keydown", (e) => {
		if (e.which !== 13 && e.key !== "Enter") return;
		e.preventDefault();
		const v = $scan.val();
		$scan.val("");
		// Enter on an empty box saves what is held — the last card of a run
		if (!(v || "").trim()) { commit().then(focusScan); return; }
		onScan(v);
	});
	root.on("click", ".ch-save", () => commit().then(focusScan));
	root.on("click", ".ch-mode", function () {
		commit();
		S.mode = S.mode === "accept" ? "reject" : "accept";
		$(this).toggleClass("reject", S.mode === "reject")
			.text(S.mode === "reject" ? __("REJECTING") : __("CONFIRMING"));
		focusScan();
	});
	// codes scanned but not yet written must not vanish with the page
	$(window).on("beforeunload.confirmhuid", () => (S.held && S.held.codes.length)
		? __("{0} has codes that are not saved yet.", [S.held.bag]) : undefined);
	$(wrapper).on("remove", () => $(window).off(".confirmhuid"));

	page.set_primary_action(__("Refresh"), load, "refresh");
	frappe.pages["confirm-huid"].on_page_show = () => { load(); focusScan(); };
	load();
	paintHist();
	focusScan();
};
