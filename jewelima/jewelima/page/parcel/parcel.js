// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Delivery > Parcel — the packing counter.
//
// Two desks PREPARE packets (Certification and Hallmarking) and one counter
// SENDS them. This is that counter's screen: every prepared batch from both
// desks in one queue, oldest first, and a scan box.
//
// Scan the note's batch code — or any piece inside the packet, when the note has
// gone missing — and the batch comes up ready to send. SEND is the same move the
// prep desks make: the stock leaves Finished Goods for At Certification / At
// Hallmarking and the batch turns Sent. Nothing here prepares or edits a batch;
// the counter hands packets over, and that is all it can do.
// Route: /app/parcel
frappe.pages["parcel"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Parcel"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const root = $(page.main);
	const S = { rows: [], picked: null, centers: [] };

	root.append(`
		<style>
		#page-parcel .container{max-width:100%;}
		.pl-scan{display:flex;gap:10px;align-items:center;margin-bottom:14px;flex-wrap:wrap;}
		.pl-scan input{flex:0 0 320px;border:2px solid var(--primary);border-radius:9px;
			padding:9px 13px;font-size:14px;font-weight:600;background:var(--fg-color);color:var(--text-color);}
		.pl-msg{font-size:12.5px;padding:6px 12px;border-radius:8px;display:none;}
		.pl-msg.on{display:inline-block;}
		.pl-msg.err{background:#fbeaea;color:#b00020;border:1px solid #e6b3b3;}
		.pl-msg.ok{background:#eaf6ec;color:#1d7a33;border:1px solid #bfe3c6;}

		.pl-sec{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;
			color:var(--text-muted);margin:6px 0 9px;}
		.pl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:12px;}
		.pl-card{border:1px solid var(--border-color);border-left:3px solid #1B4332;border-radius:12px;
			background:var(--fg-color);padding:13px 16px;}
		.pl-card.on{border-color:#1B4332;box-shadow:0 0 0 3px rgba(27,67,50,.15);}
		.pl-card.hall{border-left-color:#8a6508;}
		.pl-nm{font-size:15px;font-weight:800;letter-spacing:.02em;}
		.pl-tag{font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;
			border-radius:20px;padding:1px 8px;margin-left:6px;background:rgba(27,67,50,.12);color:#1B4332;}
		.pl-tag.hall{background:rgba(224,168,0,.18);color:#8a6508;}
		[data-theme="dark"] .pl-tag{color:#8fd0aa;} [data-theme="dark"] .pl-tag.hall{color:#e8c66b;}
		.pl-meta{font-size:12px;color:var(--text-muted);margin-top:3px;}
		.pl-nums{display:flex;gap:14px;margin:9px 0 10px;font-size:12.5px;}
		.pl-nums b{font-size:15px;font-variant-numeric:tabular-nums;}
		.pl-sub{font-size:12px;margin-bottom:9px;}
		.pl-sub .miss{color:#8a5a00;}
		.pl-act{display:flex;gap:8px;flex-wrap:wrap;}
		.pl-empty{padding:34px;text-align:center;color:var(--text-muted);font-size:13px;
			border:1px dashed var(--border-color);border-radius:12px;}
		</style>
		<div class="pl-scan">
			<input class="pl-box" placeholder="${__("Scan the note, or any piece in the packet")}" autocomplete="off">
			<span class="pl-msg"></span>
		</div>
		<div class="pl-sec pl-count"></div>
		<div class="pl-list"></div>`);

	const $box = root.find(".pl-box");
	const $msg = root.find(".pl-msg");
	const focus = () => setTimeout(() => $box.trigger("focus").select(), 30);
	function say(text, kind) {
		$msg.removeClass("ok err on");
		if (text) $msg.addClass("on " + (kind || "err")).html(text);
	}

	function card(r) {
		const hall = r.kind === "hallmarking";
		return `<div class="pl-card ${hall ? "hall" : ""} ${S.picked === r.name ? "on" : ""}"
				data-name="${esc(r.name)}" data-kind="${esc(r.kind)}">
			<div class="pl-nm">${esc(r.name)}
				<span class="pl-tag ${hall ? "hall" : ""}">${hall ? __("Hallmarking") : __("Certification")}</span></div>
			<div class="pl-meta">${esc(r.where)}${r.center ? " · " + esc((r.center || "").split("-").slice(1).join("-") || r.center) : ""}${
				r.quality ? " · " + esc(r.quality) : ""}</div>
			<div class="pl-meta">${__("prepped by")} <b>${esc(r.owner_label || "")}</b>${
				r.prepared_on ? " · " + esc(frappe.datetime.str_to_user(r.prepared_on)) : ""}</div>
			<div class="pl-nums">
				<span><b>${r.pieces}</b> ${__("piece(s)")}</span>
				<span><b>${flt(r.gross).toFixed(3)}</b> g</span>
				${r.dmd_ct ? `<span><b>${flt(r.dmd_ct).toFixed(3)}</b> ct</span>` : ""}
			</div>
			<div class="pl-sub">${r.submission_no
				? `${__("Submission no")} <b>${esc(r.submission_no)}</b>`
				: `<span class="miss">${__("no submission number")}</span>`}</div>
			<div class="pl-act">
				<button class="btn btn-primary btn-sm pl-send" style="background:#1B4332;border-color:#1B4332;">${__("SEND OUT")}</button>
				<button class="btn btn-default btn-sm pl-note">${__("Print note")}</button>
			</div>
		</div>`;
	}

	function paint() {
		const rows = S.rows || [];
		root.find(".pl-count").text(rows.length
			? __("{0} packet(s) waiting to go out", [rows.length]) : "");
		root.find(".pl-list").html(rows.length
			? `<div class="pl-grid">${rows.map(card).join("")}</div>`
			: `<div class="pl-empty">${__("Nothing is waiting. A batch shows up here the moment a desk prepares it.")}</div>`);
	}

	function load() {
		return frappe.call({ method: API + ".get_parcel_queue", freeze: false }).then((r) => {
			const m = r.message || {};
			S.rows = m.rows || [];
			S.centers = m.hall_centers || [];
			paint();
		});
	}

	// ---- scanning: the note's code, or a piece inside the packet ---------------
	$box.on("keydown", function (e) {
		if (e.key !== "Enter") return;
		const code = (this.value || "").trim();
		this.value = "";
		if (!code) return;
		frappe.call({ method: API + ".parcel_scan", args: { code }, freeze: false }).then((r) => {
			const m = r.message || {};
			if (m.error) { say(esc(m.error), "err"); return focus(); }
			S.picked = m.batch;
			say(m.via_piece
				? __("{0} is in <b>{1}</b> — send it below.", [esc(m.via_piece), esc(m.batch)])
				: __("<b>{0}</b> — send it below.", [esc(m.batch)]), "ok");
			paint();
			const el = root.find(`.pl-card[data-name="${m.batch}"]`).get(0);
			if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
			focus();
		});
	});

	// ---- sending: the same move the prep desks make ---------------------------
	root.on("click", ".pl-send", function () {
		const $c = $(this).closest(".pl-card");
		const nm = $c.data("name");
		const kind = $c.data("kind");
		const row = (S.rows || []).find((x) => x.name === nm) || {};
		const warn = row.submission_no ? ""
			: "<br><br>" + __("This packet has no submission number on it.");
		if (kind === "certification") {
			frappe.confirm(__("Send <b>{0}</b>? {1} piece(s) move to At Certification and the batch locks.{2}",
				[esc(nm), row.pieces, warn]), () => {
				frappe.call({ method: API + ".send_cert_prep", args: { name: nm } }).then(() => {
					frappe.show_alert({ message: __("{0} sent.", [nm]), indicator: "green" }, 5);
					S.picked = null; load(); focus();
				});
			});
			return;
		}
		// hallmarking settles its centre at the moment it leaves
		const d = new frappe.ui.Dialog({
			title: __("Send {0}", [nm]),
			fields: [
				{ fieldname: "center", fieldtype: "Select", label: __("Hallmarking centre"), reqd: 1,
					options: (S.centers || []).join("\n"), default: row.center || (S.centers || [])[0] },
				...(row.submission_no ? [] : [{ fieldname: "note", fieldtype: "HTML",
					options: `<div style="color:#8a5a00;font-size:12px;">${
						__("This packet has no submission number on it.")}</div>` }]),
			],
			primary_action_label: __("Send out"),
			primary_action(v) {
				d.hide();
				frappe.call({ method: API + ".send_hall_prep", args: { name: nm, center: v.center } }).then(() => {
					frappe.show_alert({ message: __("{0} sent.", [nm]), indicator: "green" }, 5);
					S.picked = null; load(); focus();
				});
			},
		});
		d.show();
	});

	root.on("click", ".pl-note", function () {
		const $c = $(this).closest(".pl-card");
		const nm = $c.data("name");
		const method = $c.data("kind") === "certification" ? ".get_cert_batch_slip" : ".get_hall_batch_slip";
		frappe.call({ method: API + method, args: { name: nm } }).then((r) => {
			const m = r.message || {};
			if (!m.html) return;
			// printed in place through a hidden iframe, as the desks do
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

	root.on("click", ".pl-card", function (e) {
		if ($(e.target).closest("button").length) return;
		S.picked = $(this).data("name");
		paint();
	});

	page.add_inner_button(__("Refresh"), load);
	page.add_inner_button(__("Send Certifications"), () => frappe.set_route("send-certifications"));
	page.add_inner_button(__("Send Hallmarking"), () => frappe.set_route("send-hallmarking"));
	frappe.pages["parcel"].on_page_show = () => { load(); focus(); };
	load();
	focus();
};
