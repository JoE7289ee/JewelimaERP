// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Delivery > Parcel — the packing counter.
//
// Two desks PREPARE packets (Certification and Hallmarking) and this counter
// SENDS them. It does not lay out everything that is ready: the counter works
// from the packets in its hands, so it scans them. Each scan puts that batch in
// the send table — a note's batch code, or any piece inside the packet when the
// note has gone missing — and SEND sends the lot, each through the same call its
// own desk makes.
//
// Underneath: everything that is OUT right now. A packet stays there from the
// moment it is sent until somebody collects it back on Certification Out or
// Hallmarking Out, and then it leaves this table on its own. The head carries
// the history of everything collected.
// Route: /app/parcel
frappe.pages["parcel"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Parcel"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const root = $(page.main);
	const S = { send: [], out: [], centers: [], view: "counter", days: 90 };

	root.append(`
		<style>
		#page-parcel .container{max-width:100%;}
		.pl-scan{display:flex;gap:10px;align-items:center;margin-bottom:14px;flex-wrap:wrap;}
		.pl-scan input{flex:0 0 340px;border:2px solid #1B4332;border-radius:9px;
			padding:10px 14px;font-size:14px;font-weight:600;background:var(--fg-color);color:var(--text-color);}
		.pl-msg{font-size:12.5px;padding:6px 12px;border-radius:8px;display:none;}
		.pl-msg.on{display:inline-block;}
		.pl-msg.err{background:#fbeaea;color:#b00020;border:1px solid #e6b3b3;}
		.pl-msg.ok{background:#eaf6ec;color:#1d7a33;border:1px solid #bfe3c6;}
		.pl-sec{display:flex;align-items:center;gap:10px;font-size:11px;font-weight:800;text-transform:uppercase;
			letter-spacing:.06em;color:var(--text-muted);margin:18px 0 8px;}
		.pl-sec .n{font-size:11px;font-weight:700;border-radius:10px;padding:1px 8px;background:var(--control-bg);}
		.pl-card{border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);overflow:hidden;}
		.pl-card.send{border-left:3px solid #1B4332;}
		.pl-card.out{border-left:3px solid #8a6508;}
		table.pl-t{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.pl-t th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em;
			color:var(--text-muted);padding:7px 11px;border-bottom:1px solid var(--border-color);
			background:var(--control-bg);white-space:nowrap;}
		table.pl-t td{padding:7px 11px;border-bottom:1px solid var(--border-color);white-space:nowrap;}
		table.pl-t tr:last-child td{border-bottom:0;}
		table.pl-t .num{text-align:right;font-variant-numeric:tabular-nums;}
		table.pl-t th.num{text-align:right;}
		.pl-nm{font-weight:800;letter-spacing:.02em;}
		.pl-tag{font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;
			border-radius:20px;padding:1px 8px;background:rgba(27,67,50,.12);color:#1B4332;}
		.pl-tag.hall{background:rgba(224,168,0,.18);color:#8a6508;}
		[data-theme="dark"] .pl-tag{color:#8fd0aa;} [data-theme="dark"] .pl-tag.hall{color:#e8c66b;}
		.pl-miss{color:#8a5a00;font-size:11px;}
		.pl-x{cursor:pointer;color:var(--text-muted);font-weight:800;font-size:14px;}
		.pl-x:hover{color:#b00020;}
		.pl-days{font-weight:800;}
		.pl-days.late{color:#b0413e;}
		.pl-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;
			border-top:1px solid var(--border-color);background:var(--control-bg);}
		.pl-foot .t{font-size:12px;color:var(--text-muted);}
		.pl-empty{padding:26px;text-align:center;color:var(--text-muted);font-size:12.5px;}
		</style>
		<div class="pl-scan">
			<input class="pl-box" placeholder="${__("Scan the note, or any piece in the packet")}" autocomplete="off">
			<span class="pl-msg"></span>
		</div>
		<div class="pl-view"></div>`);

	const $box = root.find(".pl-box");
	const $msg = root.find(".pl-msg");
	const focus = () => setTimeout(() => $box.trigger("focus").select(), 30);
	function say(text, kind) {
		$msg.removeClass("ok err on");
		if (text) $msg.addClass("on " + (kind || "err")).html(text);
	}

	const tag = (r) => `<span class="pl-tag ${r.kind === "hallmarking" ? "hall" : ""}">${
		r.kind === "hallmarking" ? __("Hallmarking") : __("Certification")}</span>`;
	const centre = (r) => esc((r.center || "").split("-").slice(1).join("-") || r.center || "—");
	const sub = (r) => r.submission_no ? esc(r.submission_no) : `<span class="pl-miss">${__("none")}</span>`;

	// ---- the counter: scan, send, and what is out ------------------------------
	function paintCounter() {
		const send = S.send;
		const sendTbl = send.length ? `
			<table class="pl-t"><thead><tr>
				<th>${__("Batch")}</th><th>${__("For")}</th><th>${__("Centre")}</th>
				<th>${__("Submission")}</th><th class="num">${__("Pieces")}</th>
				<th class="num">${__("Gross g")}</th><th class="num">${__("DMD ct")}</th><th></th>
			</tr></thead><tbody>${send.map((r) => `<tr data-name="${esc(r.name)}">
				<td class="pl-nm">${esc(r.name)}</td><td>${tag(r)} ${esc(r.where && r.kind === "certification" ? r.where : "")}</td>
				<td>${centre(r)}</td><td>${sub(r)}</td>
				<td class="num">${r.pieces}</td><td class="num">${flt(r.gross).toFixed(3)}</td>
				<td class="num">${flt(r.dmd_ct).toFixed(3)}</td>
				<td style="text-align:right;"><button class="btn btn-xs btn-default pl-note">${__("Note")}</button>
					<span class="pl-x" title="${__("take it off")}" style="margin-left:8px;">&times;</span></td>
			</tr>`).join("")}</tbody></table>
			<div class="pl-foot">
				<span class="t">${__("{0} packet(s), {1} piece(s)", [send.length,
					send.reduce((a, r) => a + r.pieces, 0)])}</span>
				<span>
					<button class="btn btn-sm btn-default pl-clear">${__("Clear")}</button>
					<button class="btn btn-sm btn-primary pl-send" style="background:#1B4332;border-color:#1B4332;">${
						__("SEND {0}", [send.length])}</button>
				</span>
			</div>`
			: `<div class="pl-empty">${__("Scan a packet to start. Each one you scan lands here, ready to send.")}</div>`;

		const out = S.out;
		const outTbl = out.length ? `
			<table class="pl-t"><thead><tr>
				<th>${__("Batch")}</th><th>${__("For")}</th><th>${__("Centre")}</th><th>${__("Submission")}</th>
				<th>${__("Sent")}</th><th class="num">${__("Days out")}</th>
				<th class="num">${__("Pieces")}</th><th class="num">${__("Gross g")}</th><th class="num">${__("DMD ct")}</th>
			</tr></thead><tbody>${out.map((r) => `<tr>
				<td class="pl-nm">${esc(r.name)}</td><td>${tag(r)}</td><td>${centre(r)}</td><td>${sub(r)}</td>
				<td>${r.sent_on ? esc(frappe.datetime.str_to_user(r.sent_on)) : "—"}</td>
				<td class="num"><span class="pl-days ${(r.days_out || 0) > 7 ? "late" : ""}">${r.days_out ?? "—"}</span></td>
				<td class="num">${r.pieces}</td><td class="num">${flt(r.gross).toFixed(3)}</td>
				<td class="num">${flt(r.dmd_ct).toFixed(3)}</td>
			</tr>`).join("")}</tbody></table>`
			: `<div class="pl-empty">${__("Nothing is out right now.")}</div>`;

		root.find(".pl-view").html(`
			<div class="pl-sec">${__("Ready to send")}<span class="n">${send.length}</span></div>
			<div class="pl-card send">${sendTbl}</div>
			<div class="pl-sec">${__("Out now")}<span class="n">${out.length}</span>
				<span style="text-transform:none;letter-spacing:0;font-weight:500;">${
					__("— clears when it is collected back")}</span></div>
			<div class="pl-card out">${outTbl}</div>`);
	}

	function loadOut() {
		return frappe.call({ method: API + ".get_parcel_out", freeze: false }).then((r) => {
			const m = r.message || {};
			S.out = m.rows || [];
			S.centers = m.hall_centers || [];
			if (S.view === "counter") paintCounter();
		});
	}

	// ---- history: everything collected back ------------------------------------
	function loadHistory() {
		root.find(".pl-view").html(`<div class="pl-empty">${__("Reading the history…")}</div>`);
		return frappe.call({ method: API + ".get_parcel_history", freeze: false, args: { days: S.days } })
			.then((r) => {
				const rows = (r.message || {}).rows || [];
				root.find(".pl-view").html(`
					<div class="pl-sec">${__("Collected back")}<span class="n">${rows.length}</span>
						<select class="pl-days-pick" style="margin-left:auto;text-transform:none;letter-spacing:0;
							border:1px solid var(--border-color);border-radius:7px;padding:3px 8px;font-size:12px;
							background:var(--fg-color);color:var(--text-color);">${[30, 90, 180, 365].map((n) =>
							`<option value="${n}" ${n === S.days ? "selected" : ""}>${__("Last {0} days", [n])}</option>`).join("")}</select>
					</div>
					<div class="pl-card">${rows.length ? `
						<table class="pl-t"><thead><tr>
							<th>${__("Batch")}</th><th>${__("For")}</th><th>${__("Centre")}</th><th>${__("Submission")}</th>
							<th>${__("Sent")}</th><th>${__("Collected")}</th><th class="num">${__("Days away")}</th>
							<th>${__("Now")}</th><th class="num">${__("Pieces")}</th><th class="num">${__("Gross g")}</th>
						</tr></thead><tbody>${rows.map((x) => `<tr>
							<td class="pl-nm">${esc(x.name)}</td><td>${tag(x)}</td><td>${centre(x)}</td><td>${sub(x)}</td>
							<td>${x.sent_on ? esc(frappe.datetime.str_to_user(x.sent_on)) : "—"}</td>
							<td>${x.collected_on ? esc(frappe.datetime.str_to_user(x.collected_on)) : "—"}</td>
							<td class="num">${x.days_out ?? "—"}</td><td>${esc(x.status)}</td>
							<td class="num">${x.pieces}</td><td class="num">${flt(x.gross).toFixed(3)}</td>
						</tr>`).join("")}</tbody></table>`
						: `<div class="pl-empty">${__("Nothing collected back in this window.")}</div>`}</div>`);
			});
	}

	function showView(v) {
		S.view = v;
		page.set_secondary_action(v === "counter" ? __("Collected history") : __("Back to the counter"),
			() => showView(S.view === "counter" ? "history" : "counter"),
			v === "counter" ? "history" : "arrow-left");
		root.find(".pl-scan").toggle(v === "counter");
		if (v === "counter") { paintCounter(); loadOut(); focus(); } else { loadHistory(); }
	}

	// ---- scanning: each packet in hand joins the send table ---------------------
	$box.on("keydown", function (e) {
		if (e.key !== "Enter") return;
		const code = (this.value || "").trim();
		this.value = "";
		if (!code) return;
		frappe.call({ method: API + ".parcel_scan", args: { code }, freeze: false }).then((r) => {
			const m = r.message || {};
			if (m.error) { say(esc(m.error), "err"); return focus(); }
			if (S.send.some((x) => x.name === m.batch)) {
				say(__("<b>{0}</b> is already in the table.", [esc(m.batch)]), "err");
				return focus();
			}
			S.send.push(m.row);
			say(m.via_piece
				? __("{0} is in <b>{1}</b> — added.", [esc(m.via_piece), esc(m.batch)])
				: __("<b>{0}</b> added.", [esc(m.batch)]), "ok");
			paintCounter();
			focus();
		});
	});

	root.on("click", ".pl-x", function () {
		const nm = $(this).closest("tr").data("name");
		S.send = S.send.filter((x) => x.name !== nm);
		paintCounter();
		focus();
	});
	// the packet's note, printed in place — as the prep desks do
	root.on("click", ".pl-note", function () {
		const nm = $(this).closest("tr").data("name");
		const row = S.send.find((x) => x.name === nm) || {};
		const method = row.kind === "certification" ? ".get_cert_batch_slip" : ".get_hall_batch_slip";
		frappe.call({ method: API + method, args: { name: nm } }).then((r) => {
			const m = r.message || {};
			if (!m.html) return;
			document.getElementById("jw-parcel-note")?.remove();
			const fr = document.createElement("iframe");
			fr.id = "jw-parcel-note";
			fr.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
			document.body.appendChild(fr);
			const doc = fr.contentDocument;
			doc.open(); doc.write(m.html); doc.close();
			// the QR is a data-URI; printing before it decodes prints a hole
			setTimeout(() => { fr.contentWindow.focus(); fr.contentWindow.print(); }, 350);
		});
	});
	root.on("click", ".pl-clear", () => { S.send = []; say(""); paintCounter(); focus(); });
	root.on("change", ".pl-days-pick", function () { S.days = parseInt(this.value, 10) || 90; loadHistory(); });

	root.on("click", ".pl-send", () => {
		if (!S.send.length) return;
		const names = S.send.map((x) => x.name);
		const needCentre = S.send.some((x) => x.kind === "hallmarking" && !x.center);
		const go = (center) => frappe.call({ method: API + ".parcel_send",
			args: { batches: JSON.stringify(names), center: center || null } }).then((r) => {
			const m = r.message || {};
			const failed = m.failed || [];
			frappe.show_alert({ message: __("{0} packet(s) sent.", [(m.sent || []).length]),
				indicator: failed.length ? "orange" : "green" }, 6);
			if (failed.length) {
				frappe.msgprint({ title: __("Not sent"), indicator: "orange",
					message: failed.map((f) => `<b>${esc(f.name)}</b> — ${esc(f.error)}`).join("<br>") });
			}
			// what went stays out of the table; what failed stays in it to try again
			const ok = new Set(m.sent || []);
			S.send = S.send.filter((x) => !ok.has(x.name));
			say("");
			loadOut();
			focus();
		});
		if (!needCentre) {
			frappe.confirm(__("Send {0} packet(s)? Their pieces move out and the batches lock.", [names.length]),
				() => go(null));
			return;
		}
		// a hallmarking batch with no centre of its own takes one here
		const d = new frappe.ui.Dialog({
			title: __("Send {0} packet(s)", [names.length]),
			fields: [{ fieldname: "center", fieldtype: "Select", label: __("Hallmarking centre"), reqd: 1,
				options: (S.centers || []).join("\n"), default: (S.centers || [])[0],
				description: __("for the hallmarking batches that do not have one yet") }],
			primary_action_label: __("Send"),
			primary_action(v) { d.hide(); go(v.center); },
		});
		d.show();
	});

	page.set_primary_action(__("Refresh"), () => (S.view === "counter" ? loadOut() : loadHistory()), "refresh");
	frappe.pages["parcel"].on_page_show = () => { if (S.view === "counter") { loadOut(); focus(); } };
	showView("counter");
};
