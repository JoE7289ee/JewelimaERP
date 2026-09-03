// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Confirm HUID (Delivery > Hallmarking) — the piece came back stamped, so this
// is where the code is written down. Every piece on a COLLECTED batch shows as
// a chip; scan the card, type the six-character HUID, Enter. The code goes onto
// the PIECE, which is the record the bill, the tag and the sale all read.
//
// This is the one real difference from confirming a lab certificate: a trip to
// the hallmarking centre exists FOR the code, so confirming without one is
// refused rather than quietly recorded. A piece can come back stamped TWICE —
// two parts, two codes — and both go on the bag, because the bill counts each.
// PENDING is accepted for a code that is still to come; the billing already
// understands it, so one missing slip does not hold up a batch. Each scan is one lightweight race-safe
// call, so several people can work a batch at once and a card someone else just
// took answers "already confirmed by X".
// Route: /app/confirm-huid

frappe.pages["confirm-huid"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Confirm HUID", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const root = $(page.main);
	const S = { batches: [], hist: [], mode: "accept" };

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
			<div class="ch-f ch-card"><label>${__("Scan card")}</label>
				<input type="text" placeholder="${__("card no.")}"></div>
			<div class="ch-f ch-huid"><label>${__("HUID")}</label>
				<input type="text" class="ch-h1" maxlength="7" placeholder="${__("6 chars")}"></div>
			<div class="ch-f ch-huid ch-huid2"><label>${__("2nd HUID")}</label>
				<input type="text" class="ch-h2" maxlength="7" placeholder="${__("if stamped twice")}"></div>
			<button class="ch-mode">${__("CONFIRMING")}</button>
			<span style="font-size:12px;color:var(--text-muted);">${
				__("card, HUID, Enter · PENDING if the code is still to come")}</span>
		</div>
		<div class="ch-msg"></div>
		<div class="ch-cols">
			<div><div class="ch-sec">${__("Collected — waiting on their codes")}</div><div class="ch-body"></div></div>
			<div><div class="ch-sec">${__("Scan history")}</div><div class="ch-hist"></div></div>
		</div>
	`);

	const $card = root.find(".ch-card input");
	const $huid = root.find(".ch-h1");
	const $huid2 = root.find(".ch-h2");
	const msg = (k, h) => root.find(".ch-msg").removeClass("ok err").addClass(k).html(h);
	const focusCard = () => setTimeout(() => $card.focus(), 30);

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

	function submit() {
		const code = ($card.val() || "").trim();
		const both = [($huid.val() || "").trim(), ($huid2.val() || "").trim()]
			.filter(Boolean).join(", ").toUpperCase();
		if (!code) return focusCard();
		frappe.call({ method: API + ".huid_scan", freeze: false,
			args: { barcode: code, huid: both, mode: S.mode } })
			.then((r) => {
				const m = r.message || {};
				if (m.rejected_scan) {
					S.hist.unshift({ code, kind: "no", tag: __("NO"), why: m.rejected_scan });
					msg("err", esc(m.rejected_scan));
				} else if (m.mode === "reject") {
					S.hist.unshift({ code, kind: "rej", tag: __("REJECTED"), why: m.batch });
					msg("ok", __("<b>{0}</b> sent to the reject queue.", [esc(code)]));
				} else {
					S.hist.unshift({ code, kind: "ok", tag: __("HUID"), why: m.huid });
					msg("ok", __("<b>{0}</b> → HUID <b>{1}</b>{2}",
						[esc(code), esc(m.huid), m.batch_done ? " · " + __("batch {0} complete", [m.batch]) : ""]));
					$huid.val(""); $huid2.val("");
				}
				$card.val("");
				paintHist();
				focusCard();
				return load();
			});
	}

	// card then HUID: Enter in the card box hops to the HUID, Enter there submits —
	// so a scanner that fires its own Enter lands the operator on the code
	$card.on("keydown", (e) => {
		if (e.which !== 13 && e.key !== "Enter") return;
		e.preventDefault();
		if (S.mode === "reject") return submit();
		$huid.focus();
	});
	// Enter on the first code submits when nothing is typed in the second, so the
	// common one-code piece is still card, code, Enter
	$huid.on("keydown", (e) => {
		if (e.which !== 13 && e.key !== "Enter") return;
		e.preventDefault();
		if (($huid2.val() || "").trim()) return $huid2.focus();
		submit();
	});
	$huid2.on("keydown", (e) => {
		if (e.which !== 13 && e.key !== "Enter") return;
		e.preventDefault();
		submit();
	});
	root.on("click", ".ch-mode", function () {
		S.mode = S.mode === "accept" ? "reject" : "accept";
		$(this).toggleClass("reject", S.mode === "reject")
			.text(S.mode === "reject" ? __("REJECTING") : __("CONFIRMING"));
		root.find(".ch-huid").toggle(S.mode === "accept");
		if (S.mode === "reject") { $huid.val(""); $huid2.val(""); }
		focusCard();
	});

	page.set_primary_action(__("Refresh"), load, "refresh");
	frappe.pages["confirm-huid"].on_page_show = () => { load(); focusCard(); };
	load();
	paintHist();
	focusCard();
};
