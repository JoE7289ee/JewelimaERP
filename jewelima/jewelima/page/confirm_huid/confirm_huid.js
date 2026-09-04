// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Confirm HUID (Delivery > Hallmarking) — the pieces came back stamped, so this
// is where the codes are written down. The code goes onto the PIECE, which is
// the record the bill, the tag and the sale all read.
//
// A batch comes back as a tray, not as a queue: the operator works down it
// filling codes and sends the lot. So the page is a BATCH SHEET — tiles across
// the top say how far each batch has got, opening one lays its pieces out as
// rows, and every code typed is held locally until SAVE. One call writes them.
//
// Scanning a card jumps to its row, marks it green and puts the cursor in that
// row's HUID box. Enter walks to the next row, so a scanner alone can drive the
// whole sheet: card, code, card, code.
//
// DOUBLE STUD is a mode, not a guess: a pair of studs is stamped twice and comes
// back with two codes, but only when the centre did both. Turning it on gives
// STUD rows a second box; nothing else changes.
// Route: /app/confirm-huid

frappe.pages["confirm-huid"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Confirm HUID", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const root = $(page.main);
	// Rejection is OFF for now — the floor says a piece never comes back rejected.
	// The path is intact end to end (edit.reject -> huid_confirm_batch mode
	// "reject" -> the reject queue); flip this to true to put the column back.
	const ALLOW_REJECT = false;
	// edits: bag -> {codes:[], reject:bool} — held here, never on the server until SAVE
	const S = { batches: [], open: null, edits: {}, dbl: false, hist: [], hot: null };

	root.append(`
		<style>
		#page-confirm-huid .container{max-width:100%;}
		.ch-bar{display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px;
			border:1px solid var(--border-color);border-radius:13px;padding:13px 16px;background:var(--fg-color);}
		.ch-f label{display:block;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;
			color:var(--text-muted);margin-bottom:3px;}
		.ch-f input{border:1px solid var(--border-color);border-radius:8px;height:34px;padding:2px 10px;
			font-size:14px;font-weight:600;background:var(--control-bg);color:var(--text-color);}
		.ch-card input{width:230px;border:2px solid var(--primary);}
		.ch-btn{background:none;border:1px solid var(--border-color);border-radius:8px;padding:8px 15px;
			font-size:12.5px;cursor:pointer;color:var(--text-color);}
		.ch-btn.on{background:#7a4fb5;border-color:#7a4fb5;color:#fff;font-weight:800;}
		.ch-save{background:#1d7a33;border:none;color:#fff;font-weight:800;letter-spacing:.4px;
			padding:9px 22px;border-radius:9px;font-size:13.5px;cursor:pointer;}
		.ch-save:disabled{opacity:.35;cursor:default;}
		.ch-actions{display:flex;gap:9px;align-items:center;margin-left:auto;}
		.ch-msg{margin:6px 0 10px;font-size:13px;min-height:20px;font-weight:600;}
		.ch-msg.ok{color:#1d7a33;} .ch-msg.err{color:#b02a2a;} .ch-msg.warn{color:#8a6d00;}

		/* the tray: one tile per collected batch, with how far it has got */
		.ch-tiles{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;}
		.ch-tile{border:1px solid var(--border-color);border-radius:12px;padding:10px 14px;
			background:var(--fg-color);cursor:pointer;min-width:210px;}
		.ch-tile:hover{border-color:var(--primary);}
		.ch-tile.on{border:2px solid #1f618d;background:rgba(31,97,141,.07);}
		.ch-tile .nm{font-size:15px;font-weight:800;}
		.ch-tile .meta{font-size:11px;color:var(--text-muted);margin-bottom:6px;}
		.ch-kpi{display:flex;gap:13px;}
		.ch-kpi div{font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;}
		.ch-kpi b{display:block;font-size:18px;font-weight:800;color:var(--text-color);
			font-variant-numeric:tabular-nums;}
		.ch-kpi .done b{color:#1d7a33;} .ch-kpi .left b{color:#b45309;}

		table.ch-t{width:100%;border-collapse:collapse;font-size:12.5px;background:var(--fg-color);
			border:1px solid var(--border-color);border-radius:11px;overflow:hidden;}
		table.ch-t th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em;
			color:var(--text-muted);padding:7px 10px;background:var(--control-bg);
			border-bottom:1px solid var(--border-color);}
		table.ch-t td{padding:5px 10px;border-bottom:1px solid var(--border-color);}
		table.ch-t tr.hot td{background:rgba(29,122,51,.16);}
		table.ch-t tr.edited td{background:rgba(31,97,141,.09);}
		table.ch-t tr.done td{color:var(--text-muted);}
		.ch-h{border:1px solid var(--border-color);border-radius:7px;height:28px;width:130px;
			padding:2px 8px;font-size:12.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
			background:var(--control-bg);color:var(--text-color);}
		.ch-h.filled{border-color:#1d7a33;}
		.ch-h[disabled]{opacity:.35;}
		.ch-was{font-size:11px;font-weight:800;letter-spacing:.1em;color:#1d7a33;}
		.ch-rej{color:#b02a2a;cursor:pointer;font-weight:800;}
		.ch-stud{font-size:9.5px;font-weight:800;background:#7a4fb5;color:#fff;
			border-radius:7px;padding:0 6px;margin-left:5px;}
		.ch-sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;
			color:var(--text-muted);margin:0 0 8px;}
		.hb{display:inline-block;border-radius:9px;padding:0 7px;font-size:10px;font-weight:800;color:#fff;}
		.hb.ok{background:#1d7a33;} .hb.no{background:#b02a2a;} .hb.rej{background:#8a6d00;}
		table.ch-histt{width:100%;border-collapse:collapse;font-size:12px;}
		table.ch-histt td{padding:5px 9px;border-bottom:1px solid var(--border-color);vertical-align:top;}
		.ch-empty{padding:26px;text-align:center;color:var(--text-muted);font-size:13px;}
		</style>
		<div class="ch-bar">
			<div class="ch-f ch-card"><label>${__("Scan card")}</label>
				<input type="text" placeholder="${__("scan a card to jump to its row")}"></div>
			<button class="ch-btn ch-dbl">${__("DOUBLE STUD")}</button>
			<span class="ch-actions">
				<button class="ch-save" disabled>${__("SAVE")}</button>
			</span>
		</div>
		<div class="ch-msg"></div>
		<div class="ch-tiles"></div>
		<div class="ch-rows"></div>
	`);

	const $scan = root.find(".ch-card input");
	const msg = (k, h) => root.find(".ch-msg").removeClass("ok err warn").addClass(k).html(h);
	const focusScan = () => setTimeout(() => $scan.focus(), 30);
	const isStud = (p) => /STUD/i.test(p.design_type || "");
	const edit = (bag) => S.edits[bag] || (S.edits[bag] = { codes: [], reject: false });
	const dirty = () => Object.values(S.edits).filter((e) => e.reject || e.codes.some((c) => c)).length;
	const batchOf = (bag) => S.batches.find((b) => b.pieces.some((p) => p.order_bag.toUpperCase() === bag));

	let $hist = null;
	function paintHist() {
		if (!$hist) return;
		$hist.html(S.hist.length
			? `<table class="ch-histt">${S.hist.map((h, i) => `<tr>
				<td style="width:36px;color:var(--text-muted);">${S.hist.length - i}</td>
				<td style="white-space:nowrap;">${esc(h.code)}</td>
				<td><span class="hb ${h.kind}">${esc(h.tag)}</span></td>
				<td>${esc(h.why || "")}</td></tr>`).join("")}</table>`
			: `<div class="ch-empty">${__("Every save lands here, good or refused.")}</div>`);
	}
	function showHistory() {
		const d = new frappe.ui.Dialog({ title: __("Scan history ({0})", [S.hist.length]),
			size: "large", fields: [{ fieldtype: "HTML", fieldname: "h" }] });
		$hist = d.fields_dict.h.$wrapper;
		paintHist();
		d.onhide = () => ($hist = null);
		d.show();
	}
	const $histBtn = page.add_inner_button(__("History"), showHistory);

	function paintTiles() {
		root.find(".ch-tiles").html(S.batches.length ? S.batches.map((b) => {
			// a tile counts what is SAVED plus what is typed but not sent yet, so
			// the number moves as the operator works rather than only at save time
			const staged = b.pieces.filter((p) => p.state === "pending"
				&& (S.edits[p.order_bag] || {}).codes?.some((c) => c)).length;
			return `<div class="ch-tile ${b.name === S.open ? "on" : ""}" data-name="${esc(b.name)}">
				<div class="nm">${esc(b.name)}</div>
				<div class="meta">${esc(b.center || "")} · ${__("collected")} ${esc(b.collected_on || "")}</div>
				<div class="ch-kpi">
					<div>${__("Collected")}<b>${b.total}</b></div>
					<div class="done">${__("HUID in")}<b>${b.with_huid}${staged ? ` +${staged}` : ""}</b></div>
					<div class="left">${__("Left")}<b>${b.left - staged}</b></div>
				</div></div>`;
		}).join("") : `<div class="ch-empty">${__("Nothing collected and waiting. Collect a batch on Hallmark Out first.")}</div>`);
	}

	function paintRows() {
		const b = S.batches.find((x) => x.name === S.open);
		if (!b) { root.find(".ch-rows").html(""); return; }
		root.find(".ch-rows").html(`
			<div class="ch-sec">${__("{0} — {1} piece(s)", [b.name, b.total])}</div>
			<table class="ch-t"><thead><tr>
				<th style="width:44px;">#</th><th>${__("Card")}</th><th>${__("Design")}</th>
				<th>${__("Type")}</th><th style="width:150px;">${__("HUID")}</th>
				<th style="width:150px;">${S.dbl ? __("HUID 2") : ""}</th>
				<th style="width:120px;">${__("State")}</th>${
					ALLOW_REJECT ? `<th style="width:40px;"></th>` : ""}
			</tr></thead><tbody>${b.pieces.map((p, i) => {
				const e = S.edits[p.order_bag] || { codes: [], reject: false };
				const done = p.state !== "pending";
				const two = S.dbl && isStud(p);
				return `<tr data-bag="${esc(p.order_bag)}"
					class="${S.hot === p.order_bag ? "hot" : ""} ${done ? "done" : ""} ${
						!done && (e.reject || e.codes.some((c) => c)) ? "edited" : ""}">
					<td>${i + 1}</td>
					<td><b>${esc(p.order_bag)}</b></td>
					<td>${esc(p.design || "")}</td>
					<td>${esc(p.design_type || "")}${isStud(p) ? `<span class="ch-stud">${__("STUD")}</span>` : ""}</td>
					<td>${done
						? `<span class="ch-was">${esc(p.huid || "")}</span>`
						: `<input class="ch-h ${e.codes[0] ? "filled" : ""}" data-i="0"
							value="${esc(e.codes[0] || "")}" placeholder="${__("code")}">`}</td>
					<td>${done ? "" : (two
						? `<input class="ch-h ${e.codes[1] ? "filled" : ""}" data-i="1"
							value="${esc(e.codes[1] || "")}" placeholder="${__("2nd code")}">`
						: "")}</td>
					<td>${done
						? `<span class="hb ${p.state === "confirmed" ? "ok" : "rej"}">${
							p.state === "confirmed" ? __("CONFIRMED") : __("REJECTED")}</span>`
						: (e.reject ? `<span class="hb no">${__("TO REJECT")}</span>` : "")}</td>
					${ALLOW_REJECT
						? `<td>${done ? "" : `<span class="ch-rej" title="${__("mark rejected")}">&times;</span>`}</td>`
						: ""}
				</tr>`;
			}).join("")}</tbody></table>`);
	}

	function paint() {
		paintTiles();
		paintRows();
		const n = dirty();
		root.find(".ch-save").prop("disabled", !n)
			.text(n ? __("SAVE {0} CHANGE(S)", [n]) : __("SAVE"));
		if ($histBtn) $histBtn.text(S.hist.length ? __("History ({0})", [S.hist.length]) : __("History"));
		const pend = S.batches.reduce((a, b) => a + b.left, 0);
		page.set_indicator(n ? __("{0} unsaved", [n]) : `${pend} ${__("to confirm")}`,
			n ? "blue" : (pend ? "orange" : "green"));
	}

	function load() {
		return frappe.call({ method: API + ".get_huid_pool", freeze: false }).then((r) => {
			S.batches = (r.message || {}).batches || [];
			if (!S.batches.some((b) => b.name === S.open)) S.open = (S.batches[0] || {}).name || null;
			paint();
		});
	}

	// put the cursor where the next code goes — that is the whole point of the
	// card scan, so it happens on every jump rather than only the first
	function focusRow(bag, which) {
		S.hot = bag;
		paint();
		const $tr = root.find(`tr[data-bag="${bag}"]`);
		if (!$tr.length) return;
		$tr[0].scrollIntoView({ block: "center", behavior: "smooth" });
		const $in = $tr.find(`.ch-h[data-i="${which || 0}"]`);
		if ($in.length) setTimeout(() => $in.trigger("focus").trigger("select"), 20);
	}

	root.on("click", ".ch-tile", function () {
		S.open = $(this).data("name");
		S.hot = null;
		paint();
		focusScan();
	});

	root.on("input", ".ch-h", function () {
		const bag = $(this).closest("tr").data("bag");
		const i = +this.dataset.i;
		const e = edit(bag);
		e.codes[i] = (this.value || "").trim().toUpperCase();
		$(this).toggleClass("filled", !!e.codes[i]);
		// repaint the tiles only — repainting the table would eat the keystroke
		paintTiles();
		const n = dirty();
		root.find(".ch-save").prop("disabled", !n)
			.text(n ? __("SAVE {0} CHANGE(S)", [n]) : __("SAVE"));
	});

	// Enter walks the sheet: second box of a stud, else the next unfinished row
	root.on("keydown", ".ch-h", function (ev) {
		if (ev.which !== 13 && ev.key !== "Enter") return;
		ev.preventDefault();
		const $tr = $(this).closest("tr");
		const $second = $tr.find('.ch-h[data-i="1"]');
		if (this.dataset.i === "0" && $second.length && !$second.val()) return $second.trigger("focus");
		const $next = $tr.nextAll("tr").find('.ch-h[data-i="0"]').first();
		if ($next.length) {
			S.hot = $next.closest("tr").data("bag");
			paintRows();
			focusRow(S.hot, 0);
		} else {
			focusScan();
		}
	});

	root.on("click", ".ch-rej", function () {
		if (!ALLOW_REJECT) return;
		const bag = $(this).closest("tr").data("bag");
		const e = edit(bag);
		e.reject = !e.reject;
		if (e.reject) e.codes = [];
		paint();
	});

	root.on("click", ".ch-dbl", function () {
		S.dbl = !S.dbl;
		$(this).toggleClass("on", S.dbl);
		// a second code typed under the mode must not be saved once it is off
		if (!S.dbl) Object.values(S.edits).forEach((e) => (e.codes.length = 1));
		paint();
		msg("ok", S.dbl ? __("Double stud on — STUD rows take two codes.")
			: __("Double stud off — one code per row."));
	});

	function save() {
		const changes = [];
		for (const [bag, e] of Object.entries(S.edits)) {
			if (e.reject) changes.push({ order_bag: bag, huid: "", mode: "reject" });
			else if (e.codes.some((c) => c))
				changes.push({ order_bag: bag, huid: e.codes.filter(Boolean).join(", "), mode: "accept" });
		}
		if (!changes.length) return;
		frappe.dom.freeze(__("Saving {0}…", [changes.length]));
		return frappe.call({ method: API + ".huid_confirm_batch", freeze: false,
			args: { changes: JSON.stringify(changes) } })
			.then((r) => {
				frappe.dom.unfreeze();
				const m = r.message || {};
				for (const x of m.results || []) {
					if (x.rejected_scan) {
						S.hist.unshift({ code: x.order_bag, kind: "no", tag: __("NO"), why: x.rejected_scan });
					} else {
						S.hist.unshift({ code: x.order_bag, kind: x.mode === "reject" ? "rej" : "ok",
							tag: x.mode === "reject" ? __("REJECTED") : __("HUID"), why: x.huid || "" });
						delete S.edits[x.order_bag];   // only what actually landed is cleared
					}
				}
				msg(m.failed ? "warn" : "ok", m.failed
					? __("{0} saved, {1} refused — see History.", [m.saved, m.failed])
					: __("{0} saved.", [m.saved]));
				paintHist();
				return load();
			}).catch(() => frappe.dom.unfreeze());
	}
	root.on("click", ".ch-save", () => save().then(focusScan));

	// the scan box takes CARDS: it finds the piece, opens its batch and drops the
	// cursor in its HUID box. A code scanned here would be a code with nowhere to
	// go, so it is refused by name rather than guessed at.
	$scan.on("keydown", (e) => {
		if (e.which !== 13 && e.key !== "Enter") return;
		e.preventDefault();
		const v = ($scan.val() || "").trim().toUpperCase();
		$scan.val("");
		if (!v) return;
		const b = batchOf(v);
		if (!b) {
			S.hist.unshift({ code: v, kind: "no", tag: __("NO"), why: __("not on any collected batch") });
			msg("err", __("<b>{0}</b> is not on any collected batch.", [esc(v)]));
			paintHist(); paint();
			return;
		}
		const p = b.pieces.find((x) => x.order_bag.toUpperCase() === v);
		if (p.state !== "pending") {
			msg("err", __("<b>{0}</b> is already {1}.", [esc(p.order_bag), p.state]));
			return;
		}
		S.open = b.name;
		msg("ok", __("<b>{0}</b> — type or scan its code.", [esc(p.order_bag)]));
		focusRow(p.order_bag, 0);
	});

	// codes typed but not sent must not vanish with the page
	$(window).on("beforeunload.confirmhuid", () => dirty()
		? __("{0} change(s) are not saved yet.", [dirty()]) : undefined);
	$(wrapper).on("remove", () => $(window).off(".confirmhuid"));

	page.set_primary_action(__("Refresh"), () => {
		if (dirty()) return frappe.msgprint(__("Save or discard the {0} typed change(s) first.", [dirty()]));
		load();
	}, "refresh");
	frappe.pages["confirm-huid"].on_page_show = focusScan;
	load();
	focusScan();
};
