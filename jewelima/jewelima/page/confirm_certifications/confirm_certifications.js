// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Confirm Certifications (Delivery > Certification) — the arcade: every piece
// on a COLLECTED batch shows as a chip; scan to CONFIRM (default, green) or
// flip the mode button and scan to REJECT (red -> the reject queue).
//
// Scanning writes NOTHING. A scan stages the piece on this page, the counter
// says how many are staged, and one SAVE sends the lot. That is what makes a
// mistake fixable: a wrong scan is unstaged with a click instead of being a
// row already written that somebody has to go and undo.
//
// The pool still re-syncs every few seconds because several people scan the
// same tray, and staged marks survive that re-sync. A piece another scanner
// took first is refused BY NAME on save, and the rest still land.
// Route: /app/confirm-certifications

frappe.pages["confirm-certifications"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Confirm Certifications", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	let MODE = "accept";
	let POOL = { batches: [], pending: 0 };
	const hist = [];
	// bag -> "accept" | "reject", staged on this page and not yet written
	const staged = new Map();

	$(page.main).append(`
		<style>
		.cc-top{display:flex;gap:14px;align-items:end;margin-bottom:14px;flex-wrap:wrap;}
		.cc-top .frappe-control{margin:0;flex:0 0 260px;}
		.cc-mode{font-size:15px;font-weight:800;padding:9px 26px;border-radius:8px;border:2px solid;cursor:pointer;}
		.cc-mode.accept{background:#2e7d32;border-color:#2e7d32;color:#fff;}
		.cc-mode.reject{background:#b02a2a;border-color:#b02a2a;color:#fff;}
		.cc-pend{font-size:13px;color:var(--text-muted);align-self:center;}
		.cc-histbtn{border:1px solid var(--border-color);border-radius:8px;background:none;
			padding:9px 15px;font-size:12.5px;cursor:pointer;color:var(--text-color);}
		.cc-histbtn b{font-variant-numeric:tabular-nums;}
		/* the counter and the save sit together — what is staged, and the one
		   button that writes it */
		.cc-bar{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:16px;
			border:1px solid var(--border-color);border-radius:12px;padding:11px 15px;
			background:var(--fg-color);}
		.cc-bar.dirty{border-color:#b35a00;background:rgba(179,90,0,.05);}
		.cc-kpis{display:flex;gap:22px;flex-wrap:wrap;}
		.cc-kpi .k{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);}
		.cc-kpi .v{font-size:23px;font-weight:800;line-height:1.2;font-variant-numeric:tabular-nums;}
		.cc-kpi.ok .v{color:#2e7d32;} .cc-kpi.rj .v{color:#b02a2a;}
		[data-theme="dark"] .cc-kpi.ok .v{color:#6fbf7f;}
		[data-theme="dark"] .cc-kpi.rj .v{color:#f0a0a0;}
		.cc-save-wrap{margin-left:auto;display:flex;gap:9px;align-items:center;}
		.cc-save{background:#2e7d32;border:1px solid #2e7d32;color:#fff;font-weight:800;
			border-radius:9px;padding:11px 26px;font-size:14px;cursor:pointer;letter-spacing:.03em;}
		.cc-save:disabled{background:var(--control-bg);border-color:var(--border-color);
			color:var(--text-muted);cursor:default;font-weight:600;}
		.cc-reset{background:none;border:1px solid var(--border-color);border-radius:9px;
			padding:10px 16px;font-size:12.5px;cursor:pointer;color:var(--text-color);}
		.cc-reset:disabled{opacity:.45;cursor:default;}
		.cc-main{min-width:0;}
		.cc-batch{border:1px solid var(--border-color);border-radius:9px;background:var(--fg-color);margin-bottom:14px;overflow:hidden;}
		.cc-batch .h{background:var(--control-bg);padding:8px 14px;display:flex;justify-content:space-between;font-size:12.5px;}
		.cc-batch .h b{font-size:14px;}
		.cc-chips{display:flex;gap:8px;flex-wrap:wrap;padding:12px 14px;}
		.cc-chip{border:2px solid var(--border-color);border-radius:8px;padding:6px 12px;font-size:12.5px;font-weight:700;}
		.cc-chip .t{display:block;font-size:10px;font-weight:400;color:var(--text-muted);}
		.cc-chip.confirmed{border-color:#2e7d32;background:rgba(46,125,50,.12);}
		.cc-chip.rejected{border-color:#b02a2a;background:rgba(176,42,42,.12);text-decoration:line-through;}
		/* STAGED — scanned here, not yet written. Dashed, so it never reads as done */
		.cc-chip.stg{border-style:dashed;border-width:2px;cursor:pointer;}
		.cc-chip.stg-accept{border-color:#2e7d32;background:rgba(46,125,50,.07);}
		.cc-chip.stg-reject{border-color:#b02a2a;background:rgba(176,42,42,.07);}
		.cc-chip.stg .t::after{content:" · ${__("staged — click to undo")}";}
		.cc-chip.flash{animation:ccflash .5s;}
		@keyframes ccflash{0%{transform:scale(1.15);}100%{transform:scale(1);}}
		.cc-empty{color:var(--text-muted);padding:24px;}
		.cc-panel{border:1px solid var(--border-color);border-radius:11px;background:var(--fg-color);overflow:hidden;}
		.cc-panel .h{background:var(--control-bg);padding:8px 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);display:flex;justify-content:space-between;}
		.cc-panel .b{max-height:480px;overflow:auto;}
		.cc-panel td{padding:4px 12px;border-top:1px solid var(--border-color);font-size:12px;}
		.cc-hb{display:inline-block;border-radius:10px;padding:1px 8px;font-size:10.5px;font-weight:700;color:#fff;}
		.cc-hb.ok{background:#2e7d32;}.cc-hb.rj{background:#b02a2a;}.cc-hb.er{background:#b35a00;}
		.cc-why{display:none;margin-left:8px;font-size:11.5px;color:#b35a00;}
		.cc-hrow:hover .cc-why{display:inline;}
		</style>
		<div class="cc-top">
			<div class="cc-scan"></div>
			<button class="cc-mode accept">${__("MODE: CONFIRM — tap to switch")}</button>
			<button class="cc-histbtn">${__("Scan history")} <b class="cc-hist-n">0</b></button>
			<span class="cc-pend"></span>
		</div>
		<div class="cc-panel cc-hist" style="display:none;margin-bottom:14px;">
			<div class="h"><span>${__("Scan history")}</span><span class="cc-hist-t"></span></div>
			<div class="b cc-hist-b"></div>
		</div>
		<div class="cc-bar">
			<div class="cc-kpis"></div>
			<div class="cc-save-wrap">
				<button class="cc-reset">${__("Reset unsaved")}</button>
				<button class="cc-save">${__("SAVE")}</button>
			</div>
		</div>
		<div class="cc-main"></div>
	`);
	const root = $(page.main);
	const scan = frappe.ui.form.make_control({
		df: { fieldtype: "Data", label: __("Scan Product"), fieldname: "scan" },
		parent: root.find(".cc-scan").get(0), render_input: true });
	scan.refresh();
	setTimeout(() => scan.$input.focus(), 200);

	// the history is worth having and not worth a column — it opens when asked
	root.on("click", ".cc-histbtn", () => {
		root.find(".cc-hist").toggle();
		scan.$input.focus();
	});

	root.find(".cc-mode").on("click", function () {
		MODE = MODE === "accept" ? "reject" : "accept";
		$(this).toggleClass("accept", MODE === "accept").toggleClass("reject", MODE === "reject")
			.text(MODE === "accept" ? __("MODE: CONFIRM — tap to switch") : __("MODE: REJECT — tap to switch"));
		scan.$input.focus();
	});

	function paint() {
		root.find(".cc-pend").text(POOL.pending ? __("{0} piece(s) waiting", [POOL.pending]) : "");
		root.find(".cc-main").html(POOL.batches.map((b) => `
			<div class="cc-batch">
				<div class="h"><span><b>${esc(b.name)}</b> · ${esc(b.cert_type)}${b.quality ? " · " + esc(b.quality) : ""}</span>
					<span>${__("collected")} ${esc(b.collected_on)}</span></div>
				<div class="cc-chips">${b.pieces.map((p) => {
					// a staged mark is drawn OVER whatever the server last said, so a
					// re-sync mid-tray never wipes what somebody just scanned
					const st = staged.get(p.order_bag);
					const cls = st ? `stg stg-${st}` : p.state;
					return `<span class="cc-chip ${cls}" data-bag="${esc(p.order_bag)}">${esc(p.order_bag)}
						<span class="t">${esc(p.design_type)}${p.by ? " · " + esc(p.by.split("@")[0]) : ""}</span></span>`;
				}).join("")}</div>
			</div>`).join("") || `<div class="cc-empty">${__("Nothing waiting — collect a batch on Certification Out first.")}</div>`);
		paintBar();
	}

	// what is staged, and the one button that writes it
	function paintBar() {
		let ok = 0, rj = 0;
		staged.forEach((m) => (m === "accept" ? ok++ : rj++));
		const n = ok + rj;
		root.find(".cc-bar").toggleClass("dirty", n > 0);
		root.find(".cc-kpis").html(`
			<div class="cc-kpi"><div class="k">${__("Waiting")}</div>
				<div class="v">${Math.max(0, (POOL.pending || 0) - n)}</div></div>
			<div class="cc-kpi ok"><div class="k">${__("Scanned to confirm")}</div><div class="v">${ok}</div></div>
			<div class="cc-kpi rj"><div class="k">${__("Scanned to reject")}</div><div class="v">${rj}</div></div>
			<div class="cc-kpi"><div class="k">${__("Unsaved")}</div><div class="v">${n}</div></div>`);
		root.find(".cc-save").prop("disabled", !n)
			.text(n ? __("SAVE {0} SCAN(S)", [n]) : __("NOTHING TO SAVE"));
		root.find(".cc-reset").prop("disabled", !n);
	}
	function load() {
		frappe.call({ method: API + ".get_confirm_pool", freeze: false }).then((r) => { POOL = r.message || POOL; paint(); });
	}

	function logScan(code, kind, note) {
		hist.unshift({ code, kind, note: note || "", t: frappe.datetime.now_time().slice(0, 5) });
		if (hist.length > 60) hist.pop();
		root.find(".cc-hist-t").text(__("{0} scan(s)", [hist.length]));
		root.find(".cc-hist-n").text(hist.length);
		root.find(".cc-hist-b").html(`<table><tbody>${hist.map((h) => `
			<tr class="cc-hrow"><td>${esc(h.code)}</td>
			<td><span class="cc-hb ${h.kind}">${h.kind === "ok" ? __("CONFIRMED") : h.kind === "rj" ? __("REJECTED") : __("ERROR")}</span>
			${h.note ? `<span class="cc-why">${esc(h.note)}</span>` : ""}</td>
			<td class="text-muted">${h.t}</td></tr>`).join("")}</tbody></table>`);
	}

	// every piece the pool knows about, so a scan is judged HERE and not by a
	// round trip — the order series prefix is optional, as everywhere else
	function findPiece(code) {
		const v = (code || "").trim().toUpperCase();
		const alt = /^\d/.test(v) ? "E" + v : v;
		for (const b of POOL.batches || []) {
			for (const p of b.pieces || []) {
				const nm = (p.order_bag || "").toUpperCase();
				if (nm === v || nm === alt) return p;
			}
		}
		return null;
	}

	scan.$input.on("keydown", (e) => {
		if (e.key !== "Enter") return;
		const v = (scan.$input.val() || "").trim();
		if (!v) return;
		scan.set_value("");
		scan.$input.focus();
		const p = findPiece(v);
		if (!p) return logScan(v, "er", __("Not on any collected batch"));
		if (staged.has(p.order_bag)) {
			return logScan(p.order_bag, "er", __("Already scanned — it is waiting to be saved"));
		}
		if (p.state === "confirmed" || p.state === "rejected") {
			return logScan(p.order_bag, "er", p.by
				? __("Already {0} by {1}", [p.state, p.by.split("@")[0]])
				: __("Already {0}", [p.state]));
		}
		staged.set(p.order_bag, MODE);
		logScan(p.order_bag, MODE === "accept" ? "ok" : "rj", __("staged"));
		paint();
		root.find(`.cc-chip[data-bag="${p.order_bag}"]`).addClass("flash");
	});

	// a wrong scan is a click to undo, which is the whole point of staging
	root.on("click", ".cc-chip.stg", function () {
		const nm = $(this).data("bag");
		staged.delete(nm);
		logScan(nm, "er", __("unstaged"));
		paint();
		scan.$input.focus();
	});

	root.on("click", ".cc-reset", () => {
		if (!staged.size) return;
		const n = staged.size;
		frappe.confirm(__("Drop {0} unsaved scan(s)?", [n]), () => {
			staged.clear();
			paint();
			frappe.show_alert({ message: __("{0} unsaved scan(s) dropped.", [n]), indicator: "orange" }, 4);
			scan.$input.focus();
		});
	});

	root.on("click", ".cc-save", function () {
		if (!staged.size) return;
		const changes = [...staged.entries()].map(([bag, mode]) => ({ bag, mode }));
		$(this).prop("disabled", true);
		frappe.call({ method: API + ".confirm_cert_batch",
			args: { changes: JSON.stringify(changes) },
			freeze: true, freeze_message: __("Saving {0} scan(s)…", [changes.length]) })
			.then((r) => {
				const m = r.message || {};
				staged.clear();
				// a piece another scanner took first is named, not swallowed
				(m.refused || []).forEach((x) => logScan(x.bag, "er", x.rejected_scan));
				if ((m.refused || []).length) {
					frappe.msgprint({ title: __("{0} of {1} could not be saved", [m.refused.length, changes.length]),
						indicator: "orange",
						message: m.refused.map((x) => `<b>${esc(x.bag)}</b> — ${esc(x.rejected_scan)}`).join("<br>") });
				}
				frappe.show_alert({ indicator: "green",
					message: __("{0} saved.", [m.saved || 0]) }, 5);
				(m.batches_done || []).forEach((b) =>
					frappe.show_alert({ message: __("{0} fully processed.", [b]), indicator: "green" }, 6));
				load();
				scan.$input.focus();
			})
			.catch(() => paintBar());
	});

	// leaving with work on the page unsaved should cost a question
	$(window).on("beforeunload.cc", (ev) => {
		if (staged.size) { ev.preventDefault(); return (ev.returnValue = ""); }
	});
	$(wrapper).on("remove", () => $(window).off("beforeunload.cc"));

	load();
	// live-ish for multiple scanners: re-sync the pool every 7s while the page shows
	// paint() draws staged marks over the pool, so a re-sync is safe mid-tray
	const timer = setInterval(() => { if ($(wrapper).is(":visible")) load(); }, 7000);
	$(wrapper).on("remove", () => clearInterval(timer));
};
