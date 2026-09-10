// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Remove Hallmarking (Delivery > Hallmarking) — the stamp did not come out, or
// the wrong code was written down, so the pieces have to go again.
//
// A piece carrying a HUID is refused everywhere: the hallmark desk will not
// prep it and the picker does not offer it. That is right — a piece is
// hallmarked once — but it leaves no way back when the stamp is unreadable.
// This is that way back, and it stays narrow: managers only, a reason required,
// and the batch a piece went on is never rewritten. The removal is written onto
// each piece, so the trip and the undoing both stay readable afterwards.
//
// It took one piece at a time. A bad run comes back as a TRAY, not as a piece,
// so scanning now builds a table and one press clears the lot under one reason.
// Route: /app/remove-hallmarking

frappe.pages["remove-hallmarking"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Remove Hallmarking", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const root = $(page.main);
	const S = { rows: [] };

	root.append(`
		<style>
		#page-remove-hallmarking .container{max-width:100%;}
		.rh-bar{display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px;
			border:1px solid var(--border-color);border-radius:13px;padding:13px 16px;background:var(--fg-color);}
		.rh-f label{display:block;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;
			color:var(--text-muted);margin-bottom:3px;}
		.rh-f input{border:2px solid var(--primary);border-radius:8px;height:34px;width:240px;
			padding:2px 10px;font-size:14px;font-weight:600;background:var(--control-bg);color:var(--text-color);}
		.rh-msg{margin:8px 0;font-size:13px;min-height:20px;font-weight:600;}
		.rh-msg.ok{color:#1d7a33;} .rh-msg.err{color:#b02a2a;} .rh-msg.warn{color:#8a6d00;}

		.rh-box{border:1px solid var(--border-color);border-radius:11px;overflow:auto;max-height:48vh;}
		table.rh-t{width:100%;border-collapse:separate;border-spacing:0;font-size:12.5px;background:var(--fg-color);}
		table.rh-t th{position:sticky;top:0;z-index:1;background:var(--control-bg,var(--fg-color));
			border-bottom:2px solid var(--gray-400,#aeb6bf);padding:7px 9px;text-align:left;font-weight:700;}
		table.rh-t td{padding:5px 9px;border-bottom:1px solid var(--border-color);vertical-align:top;}
		table.rh-t td.num,table.rh-t th.num{text-align:right;font-variant-numeric:tabular-nums;}
		table.rh-t td.bag{font-family:var(--font-family-monospace,monospace);font-weight:700;}
		.rh-huid{display:inline-block;background:#1d7a33;color:#fff;border-radius:7px;
			padding:1px 9px;font-size:12px;font-weight:800;letter-spacing:.1em;}
		.rh-x{border:none;background:none;color:var(--text-muted);cursor:pointer;font-size:15px;line-height:1;padding:0 4px;}
		.rh-x:hover{color:#b02a2a;}
		.rh-sub{font-size:11px;color:var(--text-muted);}

		.rh-kpis{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;}
		.rh-kpi{border:1px solid var(--border-color);border-radius:11px;padding:9px 15px;background:var(--fg-color);}
		.rh-kpi .k{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);font-weight:600;}
		.rh-kpi .v{font-size:20px;font-weight:800;line-height:1.25;font-variant-numeric:tabular-nums;}
		.rh-kpi .sub{font-size:11px;color:var(--text-muted);}
		.rh-kpi.warn{border-left:3px solid #b02a2a;} .rh-kpi.warn .v{color:#b02a2a;}
		[data-theme="dark"] .rh-kpi.warn .v{color:#e08a8a;}
		.rh-kpi.wide{flex:1 1 300px;}
		table.rh-bt{width:100%;border-collapse:collapse;font-size:11.5px;margin-top:4px;}
		table.rh-bt td{padding:1px 0;}
		table.rh-bt td.t{color:var(--text-muted);padding-right:10px;}
		table.rh-bt td.n{text-align:right;font-variant-numeric:tabular-nums;font-weight:700;}

		.rh-warn{border:1px solid #b02a2a;border-left:4px solid #b02a2a;border-radius:8px;
			background:rgba(176,42,42,.08);color:#b02a2a;font-size:12.5px;font-weight:700;
			padding:8px 12px;margin:12px 0;}
		[data-theme="dark"] .rh-warn{color:#f0a0a0;background:rgba(176,42,42,.20);}
		.rh-go{background:#b02a2a;border:none;color:#fff;font-weight:800;letter-spacing:.4px;
			padding:11px 22px;border-radius:9px;font-size:13.5px;cursor:pointer;width:100%;}
		.rh-go:disabled{background:var(--control-bg);color:var(--text-muted);cursor:not-allowed;}
		.rh-empty{padding:26px;text-align:center;color:var(--text-muted);font-size:13px;}
		</style>
		<div class="rh-bar">
			<div class="rh-f"><label>${__("Scan piece")}</label>
				<input type="text" placeholder="${__("scan / type card no. + Enter — the E is optional")}"></div>
		</div>
		<div class="rh-msg"></div>
		<div class="rh-box"><table class="rh-t"><thead></thead><tbody></tbody></table></div>
		<div class="rh-kpis"></div>
		<div class="rh-foot"></div>
	`);

	const $scan = root.find(".rh-f input");
	const focusScan = () => setTimeout(() => $scan.focus(), 30);
	const msg = (k, h) => root.find(".rh-msg").removeClass("ok err warn").addClass(k).html(h);

	function paint() {
		const rows = S.rows;
		root.find(".rh-t thead").html(rows.length ? `<tr>
			<th>${__("Piece")}</th><th>${__("HUID")}</th><th>${__("Design")}</th>
			<th class="num">${__("Gross")}</th><th>${__("Batch")}</th>
			<th>${__("Centre")}</th><th>${__("Where")}</th><th></th></tr>` : "");
		root.find(".rh-t tbody").html(rows.length ? rows.map((p, i) => {
			const t = (p.batches || [])[0] || {};
			return `<tr>
				<td class="bag">${esc(p.order_bag)}</td>
				<td><span class="rh-huid">${esc(p.huid)}</span>${
					t.huid && t.huid !== p.huid ? `<div class="rh-sub">${__("recorded")} ${esc(t.huid)}</div>` : ""}</td>
				<td>${esc(p.design_no || p.design || "")}</td>
				<td class="num">${flt(p.gross).toFixed(3)}</td>
				<td>${esc(t.name || "—")}${t.collected_on ? `<div class="rh-sub">${esc(t.collected_on)}</div>` : ""}</td>
				<td>${esc(t.center || "—")}</td>
				<td>${esc(p.bucket || p.held_by || p.stock_status || "—")}</td>
				<td><button class="rh-x" data-i="${i}" title="${__("take off the table")}">&times;</button></td>
			</tr>`;
		}).join("")
			: `<tr><td class="rh-empty">${__("Scan the pieces whose hallmarking has to come off.")}</td></tr>`);
		paintKpis();
		paintFoot();
	}

	// What a manager needs to see before signing this off. Not just how many —
	// WHERE they came from. Twelve removals off one centre is a centre having a
	// bad week; twelve off twelve centres is something else entirely, and the
	// count alone cannot tell the two apart.
	function paintKpis() {
		const rows = S.rows;
		if (!rows.length) return root.find(".rh-kpis").empty();
		const gross = rows.reduce((a, p) => a + flt(p.gross), 0);
		const byC = {}, byB = {};
		let mismatched = 0;
		rows.forEach((p) => {
			const t = (p.batches || [])[0] || {};
			const c = t.center || __("unknown");
			const b = t.name || __("no batch");
			byC[c] = (byC[c] || 0) + 1;
			byB[b] = (byB[b] || 0) + 1;
			if (t.huid && t.huid !== p.huid) mismatched++;
		});
		const centres = Object.keys(byC).sort((a, b) => byC[b] - byC[a]);
		const batches = Object.keys(byB).sort((a, b) => byB[b] - byB[a]);
		root.find(".rh-kpis").html(`
			<div class="rh-kpi warn"><div class="k">${__("Losing their HUID")}</div>
				<div class="v">${rows.length}</div>
				<div class="sub">${__("piece(s) on the table")}</div></div>
			<div class="rh-kpi"><div class="k">${__("Total gross")}</div>
				<div class="v">${gross.toFixed(3)} g</div>
				<div class="sub">${__("going back to hallmarking")}</div></div>
			<div class="rh-kpi wide"><div class="k">${__("Centres")}</div>
				<div class="v">${centres.length}</div>
				<table class="rh-bt">${centres.map((c) => `<tr><td class="t">${esc(c)}</td>
					<td class="n">${byC[c]}</td></tr>`).join("")}</table></div>
			<div class="rh-kpi wide"><div class="k">${__("Batches")}</div>
				<div class="v">${batches.length}</div>
				<table class="rh-bt">${batches.map((b) => `<tr><td class="t">${esc(b)}</td>
					<td class="n">${byB[b]}</td></tr>`).join("")}</table></div>
			${mismatched ? `<div class="rh-kpi warn"><div class="k">${__("Code mismatch")}</div>
				<div class="v">${mismatched}</div>
				<div class="sub">${__("piece carries a different code from the batch")}</div></div>` : ""}`);
	}

	function paintFoot() {
		root.find(".rh-foot").html(!S.rows.length ? "" : `
			<div class="rh-warn">${__("The HUID comes off every piece here and HALLMARKING leaves its trail, so they can be prepped and sent again. The batches they went on are not touched — their records keep the codes that were written down.")}</div>
			<button class="rh-go">${__("REMOVE HALLMARKING FROM {0} PIECE(S)", [S.rows.length])}</button>`);
	}

	function look(code) {
		return frappe.call({ method: API + ".get_hallmark_removal", freeze: false,
			args: { barcode: code } }).then((r) => {
			const m = r.message || {};
			if (m.rejected) return msg("err", esc(m.rejected));
			if (S.rows.some((x) => x.order_bag === m.order_bag)) {
				return msg("warn", __("<b>{0}</b> is already on the table.", [esc(m.order_bag)]));
			}
			S.rows.unshift(m);
			paint();
			msg("ok", __("<b>{0}</b> added — {1} piece(s) on the table.",
				[esc(m.order_bag), S.rows.length]));
		});
	}

	$scan.on("keydown", (e) => {
		if (e.which !== 13 && e.key !== "Enter") return;
		e.preventDefault();
		const v = ($scan.val() || "").trim().toUpperCase();
		$scan.val("");
		if (v) look(v).then(focusScan);
	});

	root.on("click", ".rh-x", function () {
		S.rows.splice(cint($(this).data("i")), 1);
		paint();
		focusScan();
	});

	// a reason is not paperwork here: pieces losing their HUID is the one change
	// on this page, and next month nobody will remember why. One reason for the
	// tray — a bad run is one event — and every piece keeps its own copy of it.
	root.on("click", ".rh-go", function () {
		if (!S.rows.length) return;
		const names = S.rows.map((p) => p.order_bag);
		const d = new frappe.ui.Dialog({
			title: __("Remove hallmarking from {0} piece(s)", [names.length]),
			fields: [
				{ fieldtype: "HTML", fieldname: "list" },
				{ fieldtype: "Small Text", fieldname: "reason", reqd: 1,
					label: __("Why is it coming off?"),
					description: __("the same reason is written onto every piece here — remove them separately if the reasons differ") },
			],
			primary_action_label: __("Remove them"),
			primary_action(v) {
				if (!(v.reason || "").trim()) return frappe.msgprint(__("Say why."));
				d.hide();
				frappe.dom.freeze(__("Removing…"));
				frappe.call({ method: API + ".remove_hallmarks", freeze: false,
					args: { barcodes: JSON.stringify(names), reason: v.reason } })
					.then((r) => {
						frappe.dom.unfreeze();
						const m = r.message || {};
						const gone = new Set((m.removed || []).map((x) => x.order_bag));
						S.rows = S.rows.filter((p) => !gone.has(p.order_bag));
						paint();
						if ((m.failed || []).length) {
							msg("warn", __("{0} removed. <b>{1} could not come off</b> and are still on the table: {2}",
								[(m.removed || []).length, m.failed.length,
									m.failed.map((f) => esc(f.order_bag) + " — " + esc(f.error)).join("; ")]));
						} else {
							msg("ok", __("<b>{0}</b> piece(s) lost their HUID. They can be prepped again.",
								[(m.removed || []).length]));
						}
						frappe.show_alert({ indicator: (m.failed || []).length ? "orange" : "green",
							message: __("{0} removed", [(m.removed || []).length]) }, 5);
						focusScan();
					}).catch(() => frappe.dom.unfreeze());
			},
		});
		d.fields_dict.list.$wrapper.html(`<div style="font-size:12.5px;line-height:1.9;max-height:150px;overflow:auto;">`
			+ S.rows.map((p) => `<b>${esc(p.order_bag)}</b> <span style="color:var(--text-muted);">${esc(p.huid)}</span>`).join(" &nbsp;·&nbsp; ")
			+ `</div>`);
		d.show();
	});

	paint();
	focusScan();
	frappe.pages["remove-hallmarking"].on_page_show = focusScan;
};
