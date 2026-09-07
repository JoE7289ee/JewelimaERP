// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Remove Certification (Delivery > Certification) — the certificate never
// arrived, it was wrong, or it belonged to another piece, so the tag has to
// come off and the piece has to go again.
//
// A tagged piece is treated as certified everywhere downstream. That is right —
// a piece is certified once — but it leaves no way back when the certificate
// turns out to be wrong. This is that way back, and it is deliberately narrow:
// one piece at a time, one tag at a time, a reason required, and the batch it
// travelled on is never rewritten. The removal is written onto the piece, so
// the trip and the undoing both stay readable afterwards.
//
// HALLMARKING sits on the same trail and is NOT removable here: taking it off
// has to clear the HUID with it, which is Remove Hallmarking's job.
// Route: /app/remove-certification

frappe.pages["remove-certification"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Remove Certification", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const root = $(page.main);
	const S = { piece: null, done: [] };

	root.append(`
		<style>
		#page-remove-certification .container{max-width:1000px;}
		.rc-bar{display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px;
			border:1px solid var(--border-color);border-radius:13px;padding:13px 16px;background:var(--fg-color);}
		.rc-f label{display:block;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;
			color:var(--text-muted);margin-bottom:3px;}
		.rc-f input{border:2px solid var(--primary);border-radius:8px;height:34px;width:240px;
			padding:2px 10px;font-size:14px;font-weight:600;background:var(--control-bg);color:var(--text-color);}
		.rc-msg{margin:8px 0;font-size:13px;min-height:20px;font-weight:600;}
		.rc-msg.ok{color:#1d7a33;} .rc-msg.err{color:#b02a2a;}
		.rc-card{border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);
			padding:15px 18px;margin-bottom:14px;}
		.rc-nm{font-size:20px;font-weight:800;}
		.rc-meta{font-size:12.5px;color:var(--text-muted);margin-top:5px;}
		.rc-tags{display:flex;gap:9px;flex-wrap:wrap;margin:13px 0 4px;}
		.rc-tag{border:2px solid #1f618d;border-radius:9px;padding:7px 15px;background:rgba(31,97,141,.08);
			font-size:14px;font-weight:800;letter-spacing:.06em;cursor:pointer;}
		.rc-tag:hover{background:rgba(176,42,42,.10);border-color:#b02a2a;color:#b02a2a;}
		.rc-tag .x{font-size:11px;font-weight:700;margin-left:8px;color:var(--text-muted);}
		.rc-tag:hover .x{color:#b02a2a;}
		.rc-tag.locked{border-color:var(--border-color);background:var(--control-bg);
			color:var(--text-muted);cursor:not-allowed;}
		.rc-tag.locked:hover{border-color:var(--border-color);color:var(--text-muted);
			background:var(--control-bg);}
		.rc-warn{border:1px solid #b02a2a;border-left:4px solid #b02a2a;border-radius:8px;
			background:rgba(176,42,42,.08);color:#b02a2a;font-size:12.5px;font-weight:700;
			padding:8px 12px;margin:12px 0;}
		[data-theme="dark"] .rc-warn{color:#f0a0a0;background:rgba(176,42,42,.20);}
		table.rc-t{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:10px;}
		table.rc-t th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em;
			color:var(--text-muted);padding:6px 9px;border-bottom:1px solid var(--border-color);}
		table.rc-t td{padding:5px 9px;border-bottom:1px solid var(--border-color);}
		.rc-sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;
			color:var(--text-muted);margin:0 0 8px;}
		.rc-empty{padding:26px;text-align:center;color:var(--text-muted);font-size:13px;}
		</style>
		<div class="rc-bar">
			<div class="rc-f"><label>${__("Scan piece")}</label>
				<input type="text" placeholder="${__("scan / type card no. + Enter — E optional")}"></div>
		</div>
		<div class="rc-msg"></div>
		<div class="rc-body"></div>
		<div class="rc-sec">${__("Removed this session")}</div>
		<div class="rc-done"></div>
	`);

	const $scan = root.find(".rc-f input");
	const focusScan = () => setTimeout(() => $scan.focus(), 30);
	const msg = (k, h) => root.find(".rc-msg").removeClass("ok err").addClass(k).html(h);

	function paint() {
		const p = S.piece;
		root.find(".rc-body").html(!p ? "" : `
			<div class="rc-card">
				<div><span class="rc-nm">${esc(p.order_bag)}</span></div>
				<div class="rc-meta">${esc(p.design_no || p.design || "")}
					· ${flt(p.gross).toFixed(3)} g · ${flt(p.dmd_ct).toFixed(3)} ct
					· ${esc(p.stock_status || "")}${p.bucket ? " · " + esc(p.bucket) : ""}${
					p.held_by ? " · " + esc(p.held_by) : ""}</div>
				<div class="rc-sec" style="margin:14px 0 0;">${__("Tagged")}</div>
				<div class="rc-tags">${(p.tags || []).map((t) => {
					const locked = t.toUpperCase() === "HALLMARKING";
					return `<span class="rc-tag ${locked ? "locked" : ""}" data-tag="${esc(t)}"
						title="${locked ? __("hallmarking comes off on Remove Hallmarking") : __("click to take this off")}">${
						esc(t)}<span class="x">${locked ? __("locked") : "✕"}</span></span>`;
				}).join("")}</div>
				<div class="rc-warn">${__("Only the tag leaves the piece, and it can be certified again. The batch it travelled on is not touched — its record keeps who confirmed it and when.")}</div>
				${(p.batches || []).length ? `<table class="rc-t"><thead><tr>
					<th>${__("Batch")}</th><th>${__("Lab")}</th><th>${__("Centre")}</th>
					<th>${__("Status")}</th><th>${__("Collected")}</th>
					<th>${__("Outcome")}</th><th>${__("By")}</th>
				</tr></thead><tbody>${p.batches.map((b) => `<tr>
					<td><b>${esc(b.name)}</b></td><td>${esc(b.cert_type)}</td>
					<td>${esc((b.center || "").split("-").slice(1).join("-"))}</td>
					<td>${esc(b.status)}</td><td>${esc(b.collected_on)}</td>
					<td>${esc(b.outcome)}</td><td>${esc(b.by)}</td>
				</tr>`).join("")}</tbody></table>` : ""}
			</div>`);
		root.find(".rc-done").html(S.done.length
			? `<table class="rc-t"><thead><tr><th>${__("Piece")}</th><th>${__("Tag removed")}</th>
				<th>${__("Still tagged")}</th><th>${__("Reason")}</th></tr></thead><tbody>${
				S.done.map((d) => `<tr>
				<td><b>${esc(d.order_bag)}</b></td><td>${esc(d.was)}</td>
				<td>${esc(d.left || "—")}</td><td>${esc(d.why)}</td>
			</tr>`).join("")}</tbody></table>`
			: `<div class="rc-empty">${__("Nothing removed yet.")}</div>`);
	}

	function look(code) {
		return frappe.call({ method: API + ".get_certification_removal", freeze: false,
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

	// a reason is not paperwork here: a piece losing a certification is the one
	// change on this page, and next month nobody will remember why
	root.on("click", ".rc-tag", function () {
		const p = S.piece;
		const tag = $(this).data("tag");
		if (!p || $(this).hasClass("locked")) {
			return $(this).hasClass("locked")
				? msg("err", __("Hallmarking comes off on Remove Hallmarking — it has to take the HUID with it."))
				: null;
		}
		const d = new frappe.ui.Dialog({
			title: __("Remove {0} from {1}", [tag, p.order_bag]),
			fields: [{ fieldtype: "Small Text", fieldname: "reason", reqd: 1,
				label: __("Why is it coming off?"),
				description: __("e.g. the certificate never arrived, it was wrong, or it belonged to another piece") }],
			primary_action_label: __("Remove it"),
			primary_action(v) {
				if (!(v.reason || "").trim()) return frappe.msgprint(__("Say why."));
				d.hide();
				frappe.dom.freeze(__("Removing…"));
				frappe.call({ method: API + ".remove_certification", freeze: false,
					args: { barcode: p.order_bag, tag, reason: v.reason } })
					.then((r) => {
						frappe.dom.unfreeze();
						const m = r.message || {};
						S.done.unshift({ order_bag: m.order_bag, was: m.was, left: m.left,
							why: v.reason.trim() });
						S.piece = null;
						paint();
						msg("ok", __("<b>{0}</b> — {1} removed. It can be certified again.",
							[esc(m.order_bag), esc(m.was)]));
						focusScan();
					}).catch(() => frappe.dom.unfreeze());
			},
		});
		d.show();
	});

	paint();
	focusScan();
	frappe.pages["remove-certification"].on_page_show = focusScan;
};
