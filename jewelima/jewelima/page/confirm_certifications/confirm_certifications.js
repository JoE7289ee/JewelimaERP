// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Confirm Certifications (Delivery > Certification) — the arcade: every piece
// on a COLLECTED batch shows as a chip; scan to CONFIRM (default, green) or
// flip the mode button and scan to REJECT (red -> the reject queue, workflows
// later). Each scan is one lightweight race-safe server call — several people
// can scan at once; the pool re-syncs every few seconds and a card someone
// else just took answers "already confirmed by X" in the history.
// Route: /app/confirm-certifications

frappe.pages["confirm-certifications"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Confirm Certifications", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	let MODE = "accept";
	let POOL = { batches: [], pending: 0 };
	const hist = [];

	$(page.main).append(`
		<style>
		.cc-top{display:flex;gap:14px;align-items:end;margin-bottom:14px;flex-wrap:wrap;}
		.cc-top .frappe-control{margin:0;flex:0 0 260px;}
		.cc-mode{font-size:15px;font-weight:800;padding:9px 26px;border-radius:8px;border:2px solid;cursor:pointer;}
		.cc-mode.accept{background:#2e7d32;border-color:#2e7d32;color:#fff;}
		.cc-mode.reject{background:#b02a2a;border-color:#b02a2a;color:#fff;}
		.cc-pend{font-size:13px;color:var(--text-muted);align-self:center;}
		.cc-cols{display:flex;gap:20px;align-items:flex-start;}
		.cc-main{flex:1;min-width:0;}
		.cc-side{flex:0 0 340px;}
		.cc-batch{border:1px solid var(--border-color);border-radius:9px;background:var(--fg-color);margin-bottom:14px;overflow:hidden;}
		.cc-batch .h{background:var(--control-bg);padding:8px 14px;display:flex;justify-content:space-between;font-size:12.5px;}
		.cc-batch .h b{font-size:14px;}
		.cc-chips{display:flex;gap:8px;flex-wrap:wrap;padding:12px 14px;}
		.cc-chip{border:2px solid var(--border-color);border-radius:8px;padding:6px 12px;font-size:12.5px;font-weight:700;}
		.cc-chip .t{display:block;font-size:10px;font-weight:400;color:var(--text-muted);}
		.cc-chip.confirmed{border-color:#2e7d32;background:rgba(46,125,50,.12);}
		.cc-chip.rejected{border-color:#b02a2a;background:rgba(176,42,42,.12);text-decoration:line-through;}
		.cc-chip.flash{animation:ccflash .5s;}
		@keyframes ccflash{0%{transform:scale(1.15);}100%{transform:scale(1);}}
		.cc-empty{color:var(--text-muted);padding:24px;}
		.cc-panel{border:1px solid var(--border-color);border-radius:8px;background:var(--fg-color);overflow:hidden;}
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
			<span class="cc-pend"></span>
		</div>
		<div class="cc-cols">
			<div class="cc-main"></div>
			<div class="cc-side"><div class="cc-panel" style="display:none;">
				<div class="h"><span>${__("Scan History")}</span><span class="cc-hist-t"></span></div>
				<div class="b cc-hist-b"></div>
			</div></div>
		</div>
	`);
	const root = $(page.main);
	const scan = frappe.ui.form.make_control({
		df: { fieldtype: "Data", label: __("Scan Product"), fieldname: "scan" },
		parent: root.find(".cc-scan").get(0), render_input: true });
	scan.refresh();
	setTimeout(() => scan.$input.focus(), 200);

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
				<div class="cc-chips">${b.pieces.map((p) => `
					<span class="cc-chip ${p.state}" data-bag="${esc(p.order_bag)}">${esc(p.order_bag)}
						<span class="t">${esc(p.design_type)}${p.by ? " · " + esc(p.by.split("@")[0]) : ""}</span></span>`).join("")}</div>
			</div>`).join("") || `<div class="cc-empty">${__("Nothing waiting — collect a batch on Certification Out first.")}</div>`);
	}
	function load() {
		frappe.call({ method: API + ".get_confirm_pool", freeze: false }).then((r) => { POOL = r.message || POOL; paint(); });
	}

	function logScan(code, kind, note) {
		hist.unshift({ code, kind, note: note || "", t: frappe.datetime.now_time().slice(0, 5) });
		if (hist.length > 60) hist.pop();
		root.find(".cc-hist-t").text(__("{0} scan(s)", [hist.length]));
		root.find(".cc-hist-b").html(`<table><tbody>${hist.map((h) => `
			<tr class="cc-hrow"><td>${esc(h.code)}</td>
			<td><span class="cc-hb ${h.kind}">${h.kind === "ok" ? __("CONFIRMED") : h.kind === "rj" ? __("REJECTED") : __("ERROR")}</span>
			${h.note ? `<span class="cc-why">${esc(h.note)}</span>` : ""}</td>
			<td class="text-muted">${h.t}</td></tr>`).join("")}</tbody></table>`);
		root.find(".cc-panel").show();
	}

	scan.$input.on("keydown", (e) => {
		if (e.key !== "Enter") return;
		const v = (scan.$input.val() || "").trim();
		if (!v) return;
		scan.set_value("");
		frappe.call({ method: API + ".confirm_cert_scan", args: { barcode: v, mode: MODE }, freeze: false })
			.then((r) => {
				const m = r.message || {};
				if (m.rejected_scan) { logScan(v, "er", m.rejected_scan); scan.$input.focus(); return; }
				logScan(v, MODE === "accept" ? "ok" : "rj", "");
				// instant local flip + flash, full re-sync right after
				const chip = root.find(`.cc-chip[data-bag="${v}"]`);
				chip.removeClass("pending").addClass((MODE === "accept" ? "confirmed" : "rejected") + " flash");
				if (m.batch_done) frappe.show_alert({ message: __("{0} fully processed.", [m.batch]), indicator: "green" }, 4);
				load();
				scan.$input.focus();
			});
	});

	load();
	// live-ish for multiple scanners: re-sync the pool every 7s while the page shows
	const timer = setInterval(() => { if ($(wrapper).is(":visible")) load(); }, 7000);
	$(wrapper).on("remove", () => clearInterval(timer));
};
