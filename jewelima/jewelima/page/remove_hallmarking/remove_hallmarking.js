// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Remove Hallmarking (Delivery > Hallmarking) — the stamp did not come out, or
// the wrong code was written down, so the piece has to go again.
//
// A piece carrying a HUID is refused everywhere: the hallmark desk will not
// prep it and the picker does not offer it. That is right — a piece is
// hallmarked once — but it leaves no way back when the stamp is unreadable.
// This is that way back, and it is deliberately narrow: managers only, one
// piece at a time, a reason required, and the batch it went on is never
// rewritten. The removal is written onto the piece, so the trip and the
// undoing both stay readable afterwards.
// Route: /app/remove-hallmarking

frappe.pages["remove-hallmarking"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Remove Hallmarking", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const root = $(page.main);
	const S = { piece: null, done: [] };

	root.append(`
		<style>
		#page-remove-hallmarking .container{max-width:1000px;}
		.rh-bar{display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px;
			border:1px solid var(--border-color);border-radius:13px;padding:13px 16px;background:var(--fg-color);}
		.rh-f label{display:block;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;
			color:var(--text-muted);margin-bottom:3px;}
		.rh-f input{border:2px solid var(--primary);border-radius:8px;height:34px;width:240px;
			padding:2px 10px;font-size:14px;font-weight:600;background:var(--control-bg);color:var(--text-color);}
		.rh-msg{margin:8px 0;font-size:13px;min-height:20px;font-weight:600;}
		.rh-msg.ok{color:#1d7a33;} .rh-msg.err{color:#b02a2a;}
		.rh-card{border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);
			padding:15px 18px;margin-bottom:14px;}
		.rh-nm{font-size:20px;font-weight:800;}
		.rh-huid{display:inline-block;background:#1d7a33;color:#fff;border-radius:8px;
			padding:2px 11px;font-size:15px;font-weight:800;letter-spacing:.12em;margin-left:10px;}
		.rh-meta{font-size:12.5px;color:var(--text-muted);margin-top:5px;}
		.rh-warn{border:1px solid #b02a2a;border-left:4px solid #b02a2a;border-radius:8px;
			background:rgba(176,42,42,.08);color:#b02a2a;font-size:12.5px;font-weight:700;
			padding:8px 12px;margin:12px 0;}
		[data-theme="dark"] .rh-warn{color:#f0a0a0;background:rgba(176,42,42,.20);}
		table.rh-t{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:10px;}
		table.rh-t th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em;
			color:var(--text-muted);padding:6px 9px;border-bottom:1px solid var(--border-color);}
		table.rh-t td{padding:5px 9px;border-bottom:1px solid var(--border-color);}
		.rh-go{background:#b02a2a;border:none;color:#fff;font-weight:800;letter-spacing:.4px;
			padding:9px 22px;border-radius:9px;font-size:13.5px;cursor:pointer;margin-top:12px;}
		.rh-sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;
			color:var(--text-muted);margin:0 0 8px;}
		.rh-empty{padding:26px;text-align:center;color:var(--text-muted);font-size:13px;}
		</style>
		<div class="rh-bar">
			<div class="rh-f"><label>${__("Scan piece")}</label>
				<input type="text" placeholder="${__("scan / type card no. + Enter")}"></div>
		</div>
		<div class="rh-msg"></div>
		<div class="rh-body"></div>
		<div class="rh-sec">${__("Removed this session")}</div>
		<div class="rh-done"></div>
	`);

	const $scan = root.find(".rh-f input");
	const focusScan = () => setTimeout(() => $scan.focus(), 30);
	const msg = (k, h) => root.find(".rh-msg").removeClass("ok err").addClass(k).html(h);

	function paint() {
		const p = S.piece;
		root.find(".rh-body").html(!p ? "" : `
			<div class="rh-card">
				<div><span class="rh-nm">${esc(p.order_bag)}</span>
					<span class="rh-huid">${esc(p.huid)}</span></div>
				<div class="rh-meta">${esc(p.design_no || p.design || "")}
					· ${flt(p.gross).toFixed(3)} g · ${esc(p.stock_status || "")}
					${p.bucket ? " · " + esc(p.bucket) : ""}${p.held_by ? " · " + esc(p.held_by) : ""}</div>
				<div class="rh-warn">${__("The HUID comes off the piece and HALLMARKING leaves its trail, so it can be prepped and sent again. The batch it went on is not touched — its record keeps the code that was written down.")}</div>
				${(p.batches || []).length ? `<table class="rh-t"><thead><tr>
					<th>${__("Batch")}</th><th>${__("Centre")}</th><th>${__("Status")}</th>
					<th>${__("Collected")}</th><th>${__("Code recorded")}</th><th>${__("By")}</th>
				</tr></thead><tbody>${p.batches.map((b) => `<tr>
					<td><b>${esc(b.name)}</b></td><td>${esc(b.center)}</td><td>${esc(b.status)}</td>
					<td>${esc(b.collected_on)}</td><td>${esc(b.huid)}</td><td>${esc(b.by)}</td>
				</tr>`).join("")}</tbody></table>` : ""}
				<button class="rh-go">${__("REMOVE HALLMARKING")}</button>
			</div>`);
		root.find(".rh-done").html(S.done.length
			? `<table class="rh-t"><thead><tr><th>${__("Piece")}</th><th>${__("HUID removed")}</th>
				<th>${__("Reason")}</th></tr></thead><tbody>${S.done.map((d) => `<tr>
				<td><b>${esc(d.order_bag)}</b></td><td>${esc(d.was)}</td><td>${esc(d.why)}</td>
			</tr>`).join("")}</tbody></table>`
			: `<div class="rh-empty">${__("Nothing removed yet.")}</div>`);
	}
	const flt = (v) => parseFloat(v) || 0;

	function look(code) {
		return frappe.call({ method: API + ".get_hallmark_removal", freeze: false,
			args: { barcode: code } }).then((r) => {
			const m = r.message || {};
			if (m.rejected) {
				S.piece = null; paint();
				return msg("err", esc(m.rejected));
			}
			S.piece = m;
			msg("", "");
			paint();
		});
	}

	$scan.on("keydown", (e) => {
		if (e.which !== 13 && e.key !== "Enter") return;
		e.preventDefault();
		const v = ($scan.val() || "").trim().toUpperCase();
		$scan.val("");
		if (v) look(v).then(focusScan);
	});

	// a reason is not paperwork here: a piece losing its HUID is the one change
	// on this page, and next month nobody will remember why
	root.on("click", ".rh-go", function () {
		const p = S.piece;
		if (!p) return;
		const d = new frappe.ui.Dialog({
			title: __("Remove {0} from {1}", [p.huid, p.order_bag]),
			fields: [{ fieldtype: "Small Text", fieldname: "reason", reqd: 1,
				label: __("Why is it coming off?"),
				description: __("e.g. the stamp is unreadable, or the wrong code was written down") }],
			primary_action_label: __("Remove it"),
			primary_action(v) {
				if (!(v.reason || "").trim()) return frappe.msgprint(__("Say why."));
				d.hide();
				frappe.dom.freeze(__("Removing…"));
				frappe.call({ method: API + ".remove_hallmark", freeze: false,
					args: { barcode: p.order_bag, reason: v.reason } })
					.then((r) => {
						frappe.dom.unfreeze();
						const m = r.message || {};
						S.done.unshift({ order_bag: m.order_bag, was: m.was, why: v.reason.trim() });
						S.piece = null;
						paint();
						msg("ok", __("<b>{0}</b> — HUID {1} removed. It can be prepped again.",
							[esc(m.order_bag), esc(m.was)]));
						focusScan();
					}).catch(() => frappe.dom.unfreeze());
			},
		});
		d.show();
	});

	paint();
	focusScan();
	frappe.pages["remove-hallmarking"].on_page_show = focusScan;
};
