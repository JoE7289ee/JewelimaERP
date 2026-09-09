// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Send Certifications (Delivery) — the second step: every PREPARED batch with
// its summary; SEND moves the stock (Finished Goods -> At Certification), flips
// the bags and locks the batch. Receiving stays on Certification Out.
// Route: /app/send-certifications

frappe.pages["send-certifications"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Send Certifications", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;

	$(page.main).append(`
		<style>
		.sc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px;}
		.sc-card{border:1px solid var(--border-color);border-radius:11px;background:var(--fg-color);padding:14px 18px;}
		.sc-card .nm{font-size:17px;font-weight:800;}
		.sc-card .meta{font-size:12px;color:var(--text-muted);margin:4px 0 10px;}
		.sc-lock{font-size:10.5px;font-weight:700;border-radius:10px;padding:1px 8px;background:#1f618d;color:#fff;}
		/* someone else's batch is still fully readable — it just does not look like yours */
		.sc-card.theirs{background:var(--control-bg);}
		.sc-not{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;
			border-radius:9px;padding:1px 7px;background:rgba(180,83,9,.16);color:#b45309;}
		[data-theme="dark"] .sc-not{color:#e8a24a;}
		.sc-nums{display:flex;gap:16px;font-size:13px;margin-bottom:12px;}
		.sc-nums b{font-size:16px;}
		/* Five buttons do not fit a 340px card on one line. Flex shrinks its items
		 * by default, so without this the labels wrapped INSIDE the buttons and the
		 * row still overflowed — Cancel hung off the card's edge. Let the row wrap
		 * and hold each label on one line, and the buttons drop to a second row
		 * intact instead. */
		.sc-actions{display:flex;gap:8px;flex-wrap:wrap;}
		.sc-actions .btn{white-space:nowrap;flex:0 0 auto;}
		.sc-sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin:22px 0 10px;}
		table.sc-r{width:100%;border-collapse:collapse;font-size:12.5px;background:var(--fg-color);}
		table.sc-r td,table.sc-r th{border:1px solid var(--border-color);padding:5px 10px;text-align:left;}
		table.sc-r th{background:var(--control-bg);font-size:10px;text-transform:uppercase;color:var(--text-muted);}
		.sc-empty{color:var(--text-muted);padding:18px;}
		.sc-card{cursor:pointer;}
		.ce-bar{display:flex;gap:8px;align-items:center;margin-bottom:10px;padding:7px 9px;
			border-radius:9px;border:1px solid var(--border-color);}
		.ce-bar.removing{border-color:#b02a2a;background:rgba(176,42,42,.07);}
		.ce-mode{border:none;border-radius:8px;padding:6px 16px;font-weight:800;font-size:12px;
			letter-spacing:.5px;color:#fff;background:#1d7a33;cursor:pointer;}
		.ce-mode.removing{background:#b02a2a;}
		.ce-bar.removing .ce-scan{border-color:#b02a2a;}
		.ce-sum{font-size:12.5px;margin-bottom:8px;}
		.ce-row{display:flex;align-items:center;gap:9px;padding:5px 8px;
			border-bottom:1px solid var(--border-color);font-size:12.5px;}
		.ce-row.add{background:rgba(29,122,51,.10);}
		.ce-row.rm{background:rgba(176,42,42,.10);text-decoration:line-through;opacity:.75;}
		.ce-tag{font-size:9.5px;font-weight:800;letter-spacing:.05em;border-radius:8px;
			padding:1px 6px;color:#fff;}
		.ce-tag.add{background:#1d7a33;} .ce-tag.rm{background:#b02a2a;}
		.ce-x{margin-left:auto;cursor:pointer;font-weight:800;color:#b02a2a;padding:0 6px;}
		.ce-x.undo{color:#1d7a33;}
		</style>
		<div class="sc-sec">${__("Prepared — ready to go out")}</div>
		<div class="sc-grid sc-prep"></div>
		<div class="sc-sec">${__("Recent (sent / cancelled)")}</div>
		<div class="sc-recent"></div>
	`);
	const root = $(page.main);

	function load() {
		frappe.call({ method: API + ".get_cert_preps" }).then((r) => {
			const m = r.message || { prepared: [], recent: [] };
			root.find(".sc-prep").html(m.prepared.map((p) => `
				<div class="sc-card ${p.can_manage ? "" : "theirs"}" data-name="${esc(p.name)}"
						data-mine="${p.can_manage ? 1 : 0}">
					<div class="nm">${esc(p.name)}</div>
					<div class="meta">${esc(p.cert_type)}${p.center ? " · " + esc((p.center || "").split("-").slice(1).join("-")) : ""}
						${p.quality ? ` <span class="sc-lock">${esc(p.quality)}</span>` : ""} · ${esc(p.prepared_on || "")}</div>
					<div class="meta">${__("prepped by")} <b>${esc(p.owner_label || "")}</b>${
						p.can_manage ? "" : ` <span class="sc-not">${__("not yours")}</span>`}</div>
					<div class="sc-nums"><span><b>${p.pieces}</b> ${__("piece(s)")}</span></div>
					<div class="sc-actions">
						${p.can_manage
							? `<button class="btn btn-primary btn-sm sc-send" style="background:#2e7d32;border-color:#2e7d32;">${__("SEND — move stock")}</button>`
							: `<button class="btn btn-default btn-sm sc-ask">${__("ASK A MANAGER TO SEND")}</button>`}
						<button class="btn btn-default btn-sm sc-xls">${__("Excel ⤓")}</button>
						<button class="btn btn-default btn-sm sc-mail">${__("Email Excel")}</button>
						<button class="btn btn-default btn-sm sc-slip">${__("Print slip")}</button>
						${p.can_manage
							? `<button class="btn btn-sm sc-cancel" style="background:#b02a2a;border-color:#b02a2a;color:#fff;">${__("Cancel")}</button>`
							: ""}
					</div>
				</div>`).join("") || `<div class="sc-empty">${__("Nothing prepared — build a batch on the Certification desk.")}</div>`);
			root.find(".sc-recent").html(m.recent.length ? `<table class="sc-r"><thead><tr>
				<th>${__("Batch")}</th><th>${__("Certification")}</th><th>${__("Status")}</th><th>${__("Pieces")}</th><th>${__("Sent")}</th></tr></thead>
				<tbody>${m.recent.map((p) => `<tr><td><b>${esc(p.name)}</b></td><td>${esc(p.cert_type)}</td>
				<td>${esc(p.status)}</td><td>${p.pieces}</td><td>${esc(p.sent_on || "")}</td></tr>`).join("")}</tbody></table>`
				: `<div class="sc-empty">${__("Nothing yet.")}</div>`);
		});
	}
	// a batch you did not prep is still yours to look at — but sending it is an
	// ask, not a click, and the ask goes to a named person
	root.on("click", ".sc-ask", function () {
		const nm = $(this).closest(".sc-card").data("name");
		frappe.call({ method: API + ".get_hall_managers" }).then((r) => {
			const men = ((r.message || {}).managers) || [];
			if (!men.length) {
				return frappe.msgprint(__("Nobody holds JW Manager — ask an administrator to send {0}.", [nm]));
			}
			const d = new frappe.ui.Dialog({
				title: __("Ask someone to send {0}", [nm]),
				fields: [
					{ fieldtype: "Select", fieldname: "to", reqd: 1, label: __("Manager"),
						options: men.map((m) => ({ label: m.label, value: m.user })) },
					{ fieldtype: "Small Text", fieldname: "note", label: __("Anything to add") },
				],
				primary_action_label: __("Send the request"),
				primary_action(v) {
					d.hide();
					frappe.call({ method: API + ".request_cert_send",
						args: { name: nm, to_user: v.to, note: v.note || "" } })
						.then((rr) => frappe.show_alert({ indicator: "green", message:
							__("Asked {0} to send {1}.", [(rr.message || {}).to, nm]) }, 6));
				},
			});
			d.show();
		});
	});

	// the same sheet the lab is emailed, in your hands instead — for a pen drive,
	// a reprint, or a lab that wants it handed over with the packet
	root.on("click", ".sc-xls", function () {
		const nm = $(this).closest(".sc-card").data("name");
		open_url_post("/api/method/jewelima.jewelima.api.export_certification_xlsx", { name: nm });
	});
	root.on("click", ".sc-mail", function () {
		const nm = $(this).closest(".sc-card").data("name");
		frappe.call({ method: API + ".get_cert_mail_defaults", args: { name: nm } }).then((r) => {
			const m = r.message || {};
			const dlg = new frappe.ui.Dialog({
				title: __("Email {0} to {1}", [nm, m.center_name || __("the center")]),
				fields: [
					{ fieldname: "recipient", fieldtype: "Data", label: __("To"), reqd: 1, default: m.recipient,
						description: m.recipient ? "" : __("No email on the center yet — set it on Delivery Masters; typing one here works for now.") },
					{ fieldname: "cc", fieldtype: "Data", label: __("CC (optional)"),
						description: __("comma-separated emails") },
					{ fieldname: "subject", fieldtype: "Data", label: __("Subject"), reqd: 1, default: m.subject },
					{ fieldname: "body", fieldtype: "Small Text", label: __("Message"), default: m.body },
				],
				primary_action_label: __("Send"),
				primary_action(v) {
					const bad = (v.cc || "").split(/[,;\s]+/).filter(Boolean)
						.concat([v.recipient]).find((a) => !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(a));
					if (bad) return frappe.show_alert({ message: __("{0} is not a valid email.", [bad]), indicator: "orange" }, 4);
					dlg.hide();
					frappe.dom.freeze(__("Sending..."));
					frappe.call({ method: API + ".email_cert_excel", args: { name: nm, ...v } })
						.then((rr) => {
							frappe.dom.unfreeze();
							frappe.show_alert({ message: __("Sent to {0} ({1}).", [(rr.message || {}).sent_to, (rr.message || {}).attachment]), indicator: "green" }, 5);
						}).catch(() => frappe.dom.unfreeze());
				},
			});
			dlg.show();
		});
	});
	// the slip that goes in the packet: A6 landscape, the batch QR and what is
	// supposed to be inside it, summed by design type
	root.on("click", ".sc-slip", function () {
		const nm = $(this).closest(".sc-card").data("name");
		frappe.call({ method: API + ".get_cert_batch_slip", args: { name: nm } }).then((r) => {
			const m = r.message || {};
			if (!m.html) return;
			// straight to the printer through a hidden iframe, the way the barcode
			// labels go — a downloaded PDF means somebody has to find it in
			// Downloads and open it before any paper comes out. The A6 landscape
			// page size rides in the markup's own @page rule.
			document.getElementById("jw-slip-frame")?.remove();
			const fr = document.createElement("iframe");
			fr.id = "jw-slip-frame";
			fr.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
			document.body.appendChild(fr);
			const doc = fr.contentDocument;
			doc.open();
			doc.write(m.html);
			doc.close();
			// the QR is an SVG data-URI; printing before it has decoded prints a
			// slip with a hole where the code should be
			setTimeout(() => { fr.contentWindow.focus(); fr.contentWindow.print(); }, 350);
			frappe.show_alert({ indicator: "green",
				message: __("{0} slip sent to the printer.", [nm]) }, 4);
		});
	});

	// one click — no confirm dialog; the record stays, marked Cancelled
	root.on("click", ".sc-cancel", function () {
		const nm = $(this).closest(".sc-card").data("name");
		frappe.call({ method: API + ".cert_prep_cancel", args: { name: nm } }).then(() => {
			frappe.show_alert({ message: __("{0} cancelled — its pieces are free again.", [nm]), indicator: "orange" }, 4);
			load();
		});
	});
	root.on("click", ".sc-send", function () {
		const nm = $(this).closest(".sc-card").data("name");
		frappe.confirm(__("Send <b>{0}</b>? Stock moves to At Certification and the batch locks.", [esc(nm)]), () => {
			frappe.dom.freeze(__("Sending..."));
			frappe.call({ method: API + ".send_cert_prep", args: { name: nm } })
				.then((r) => {
					frappe.dom.unfreeze();
					frappe.show_alert({ message: __("{0} sent — {1} piece(s) out.", [nm, (r.message || {}).count]), indicator: "green" }, 5);
					load();
				}).catch(() => frappe.dom.unfreeze());
		});
	});
	// Click the card to see what is actually on the batch, and change it. Nothing
	// is written until Save, and until then the list says plainly which lines are
	// going and which are coming — a batch is a packet of gold, so "what am I
	// about to change" should never be a guess.
	root.on("click", ".sc-card", function (e) {
		if ($(e.target).closest("button").length) return;   // the card's own buttons win
		openEditor($(this).data("name"));
	});

	function openEditor(name) {
		frappe.call({ method: API + ".get_cert_prep", args: { name } }).then((r) => {
			const m = r.message || {};
			// original = what is saved; keep = what will be saved; extra = new lines
			const orig = (m.rows || []).map((i) => i.order_bag);
			const E = { keep: new Set(orig), extra: [], mode: "add" };
			const meta = {};
			(m.rows || []).forEach((i) => { meta[i.order_bag] = i; });

			const mine = m.can_manage !== false;
			const dlg = new frappe.ui.Dialog({
				title: __("{0} — {1} · {2}{3}", [m.name, __("{0} piece(s)", [m.count]),
					m.cert_type || "", m.quality ? " · " + m.quality : ""]),
				size: "large",
				primary_action_label: mine ? __("Save") : __("Close"),
				primary_action() {
					if (!mine) return dlg.hide();
					const bags = orig.filter((b) => E.keep.has(b)).concat(E.extra);
					if (!bags.length) {
						return frappe.msgprint(__("A batch cannot be emptied — use Cancel on the card instead."));
					}
					frappe.dom.freeze(__("Saving…"));
					frappe.call({ method: API + ".cert_prep_set_items",
						args: { name, bags: JSON.stringify(bags) } })
						.then((rr) => {
							frappe.dom.unfreeze();
							const v = rr.message || {};
							dlg.hide();
							frappe.show_alert({ message: __("{0} saved — {1} piece(s){2}{3}.",
								[name, v.count,
								 (v.added || []).length ? " · +" + v.added.length : "",
								 (v.removed || []).length ? " · −" + v.removed.length : ""]),
								indicator: "green" }, 6);
							load();
						}).catch(() => frappe.dom.unfreeze());
				},
			});
			const $b = dlg.$wrapper.find(".modal-body");

			function paintEd() {
				const rows = orig.map((b) => ({ bag: b, state: E.keep.has(b) ? "" : "rm" }))
					.concat(E.extra.map((b) => ({ bag: b, state: "add" })));
				const added = E.extra.length;
				const removed = orig.filter((b) => !E.keep.has(b)).length;
				const total = orig.length - removed + added;
				$b.find(".ce-list").html(rows.map((x) => {
					const i = meta[x.bag] || {};
					return `<div class="ce-row ${x.state}" data-b="${esc(x.bag)}">
						${x.state ? `<span class="ce-tag ${x.state}">${x.state === "add" ? __("ADDING") : __("REMOVING")}</span>` : ""}
						<b>${esc(x.bag)}</b>
						<span style="color:var(--text-muted);">${esc(i.design || "")}${i.design_type ? " · " + esc(i.design_type) : ""}</span>
						<span style="color:var(--text-muted);">${i.gross ? flt(i.gross).toFixed(3) + " g" : ""}</span>
						<span style="color:var(--text-muted);">${i.dmd_ct ? flt(i.dmd_ct).toFixed(3) + " ct" : ""}</span>
						<span class="ce-x ${x.state === "rm" ? "undo" : ""}">${x.state === "rm" ? "↺" : "✕"}</span>
					</div>`;
				}).join(""));
				$b.find(".ce-sum").html(added || removed
					? __("Saving will leave <b>{0}</b> piece(s)", [total])
						+ (added ? " · <span style='color:#1d7a33;'>+" + added + " " + __("added") + "</span>" : "")
						+ (removed ? " · <span style='color:#b02a2a;'>−" + removed + " " + __("removed") + "</span>" : "")
					: __("<b>{0}</b> piece(s) — nothing changed yet", [total]));
				dlg.get_primary_btn().prop("disabled", !(added || removed));
			}

			$b.html(`
				${mine ? `<div class="ce-bar">
					<input type="text" class="ce-scan form-control" style="max-width:240px;">
					<button class="ce-mode">${__("ADDING")}</button>
					<span style="font-size:12px;color:var(--text-muted);">${
						__("✕ takes a line off · ↺ puts it back")}</span>
				</div>` : `<div class="ce-bar" style="border-color:#4a5a6a;">
					<span style="font-size:12.5px;font-weight:700;">${
						__("Prepped by {0} — you can look, but only they or a manager can change it.",
							[m.owner_label || ""])}</span>
				</div>`}
				<div class="ce-sum"></div>
				<div class="ce-list" style="max-height:46vh;overflow:auto;border:1px solid var(--border-color);border-radius:9px;"></div>`);

			$b.on("click", ".ce-x", function () {
				if (!mine) return;
				const b = $(this).closest(".ce-row").data("b");
				if (E.extra.includes(b)) E.extra = E.extra.filter((x) => x !== b);
				else if (E.keep.has(b)) E.keep.delete(b);
				else E.keep.add(b);
				paintEd();
			});
			function setMode(mo) {
				E.mode = mo;
				const rm = mo === "remove";
				$b.find(".ce-bar").toggleClass("removing", rm);
				$b.find(".ce-mode").toggleClass("removing", rm).text(rm ? __("REMOVING") : __("ADDING"));
				$b.find(".ce-scan").attr("placeholder", rm
					? __("scan a card to take it OFF + Enter")
					: __("scan a card to add + Enter")).focus();
			}
			$b.on("click", ".ce-mode", () => setMode(E.mode === "add" ? "remove" : "add"));

			$b.on("keydown", ".ce-scan", function (e) {
				if (e.key !== "Enter") return;
				e.preventDefault();
				const code = ($(this).val() || "").trim();
				$(this).val("");
				if (!code) return;
				// the E prefix is optional here as everywhere else, so a typed number
				// still matches a line that is already on the batch
				const up = code.toUpperCase();
				const hit = (b) => b.toUpperCase() === up || b.toUpperCase() === "E" + up;
				const on = orig.find(hit);
				const ex = E.extra.find(hit);

				// REMOVING: a scan takes a line off, and only ever a line that is there
				if (E.mode === "remove") {
					if (ex) E.extra = E.extra.filter((x) => x !== ex);   // one just added: forget it
					else if (on) E.keep.delete(on);
					else return frappe.show_alert({ message: __("{0} is not on this batch.", [code]), indicator: "orange" }, 4);
					paintEd();
					return;
				}

				if (on) {
					E.keep.add(on);   // scanning one back is the same as undoing it
					paintEd();
					return;
				}
				if (ex) {
					return frappe.show_alert({ message: __("{0} is already being added.", [code]), indicator: "orange" }, 3);
				}
				// the same guard a scan on the desk faces — including the lab's quality
				// lock — so a piece that cannot go is refused here rather than at Save
				frappe.call({ method: API + ".cert_draft_scan", freeze: false,
					args: { cert_type: m.cert_type, quality: m.quality || "", barcode: code,
						existing: JSON.stringify(orig.concat(E.extra)) } })
					.then((rr) => {
						const v = rr.message || {};
						if (v.rejected) {
							return frappe.show_alert({ message: esc(v.rejected), indicator: "red" }, 6);
						}
						meta[v.order_bag] = v;
						E.extra.push(v.order_bag);
						paintEd();
					});
			});
			paintEd();
			setMode("add");
			dlg.show();
			setTimeout(() => $b.find(".ce-scan").focus(), 200);
		});
	}

	load();
};
