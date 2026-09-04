// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Send Hallmarking (Delivery > Hallmarking) — the second step: every PREPARED
// batch with its summary; SEND moves the stock (Finished Goods -> At
// Certification) and flips the pieces. Collecting is Hallmark Out.
// Route: /app/send-hallmarking

frappe.pages["send-hallmarking"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Send Hallmarking", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;

	$(page.main).append(`
		<style>
		.sh-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px;}
		.sh-card{border:1px solid var(--border-color);border-radius:11px;background:var(--fg-color);padding:14px 18px;}
		.sh-card{cursor:pointer;transition:border-color .12s;}
		.sh-card:hover{border-color:#1f618d;}
		.sh-card .nm{font-size:17px;font-weight:800;}
		.sh-bk{display:inline-block;border-radius:9px;padding:0 8px;font-size:10.5px;font-weight:700;
			background:var(--control-bg);color:var(--text-muted);margin-right:4px;}
		.sh-nums b{font-size:16px;}
		.sh-nums .pure{color:#1f618d;}
		/* the edit dialog: what is going, what is coming, before anything is saved */
		.he-row{display:flex;align-items:center;gap:9px;padding:5px 8px;border-bottom:1px solid var(--border-color);font-size:12.5px;}
		.he-row.add{background:rgba(29,122,51,.10);}
		.he-row.rm{background:rgba(176,42,42,.10);text-decoration:line-through;opacity:.75;}
		.he-tag{font-size:9.5px;font-weight:800;border-radius:8px;padding:0 7px;color:#fff;}
		.he-tag.add{background:#1d7a33;} .he-tag.rm{background:#b02a2a;}
		.he-x{margin-left:auto;cursor:pointer;color:#b02a2a;font-weight:800;}
		.he-x.undo{color:#1d7a33;}
		.he-sum{font-size:12.5px;font-weight:700;margin:9px 0;}
		/* which way a scan will go, said plainly and coloured to match the rows */
		.sh-nocenter{color:#8a6d00;font-weight:700;}
		.he-bar{display:flex;gap:8px;align-items:center;margin-bottom:10px;padding:7px 9px;
			border-radius:9px;border:1px solid var(--border-color);}
		.he-bar.removing{border-color:#b02a2a;background:rgba(176,42,42,.07);}
		.he-mode{border:none;border-radius:8px;padding:6px 16px;font-weight:800;font-size:12px;
			letter-spacing:.5px;color:#fff;background:#1d7a33;cursor:pointer;}
		.he-mode.removing{background:#b02a2a;}
		.he-bar.removing .he-scan{border-color:#b02a2a;}
		.sh-card .meta{font-size:12px;color:var(--text-muted);margin:4px 0 10px;}
		.sh-nums{display:flex;gap:16px;font-size:13px;margin-bottom:12px;}
		.sh-nums b{font-size:16px;}
		.sh-actions{display:flex;gap:8px;flex-wrap:wrap;}
		.sh-sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;
			color:var(--text-muted);margin:22px 0 10px;}
		table.sh-r{width:100%;border-collapse:collapse;font-size:12.5px;background:var(--fg-color);}
		table.sh-r td,table.sh-r th{border:1px solid var(--border-color);padding:5px 10px;text-align:left;}
		table.sh-r th{background:var(--control-bg);font-size:10px;text-transform:uppercase;color:var(--text-muted);}
		.sh-empty{color:var(--text-muted);padding:18px;}
		</style>
		<div class="sh-sec">${__("Prepared — ready to go out")}</div>
		<div class="sh-grid sh-prep"></div>
		<div class="sh-sec">${__("Recent (sent / cancelled)")}</div>
		<div class="sh-recent"></div>
	`);
	const root = $(page.main);

	function load() {
		frappe.call({ method: API + ".get_hall_preps" }).then((r) => {
			const m = r.message || { prepared: [], recent: [] };
			root.find(".sh-prep").html(m.prepared.map((p) => `
				<div class="sh-card" data-name="${esc(p.name)}" data-center="${esc(p.center || "")}">
					<div class="nm">${esc(p.name)}</div>
					<div class="meta">${p.center ? esc(p.center)
						: `<span class="sh-nocenter">${__("centre not set")}</span>`} · ${esc(p.prepared_on || "")}</div>
					<div class="sh-nums">
						<span><b>${p.pieces}</b> ${__("piece(s)")}</span>
						<span class="pure"><b>${flt(p.pure).toFixed(3)}</b> g ${__("pure")}</span>
						${(p.by_stone || []).length
							? (p.by_stone || []).map((x) => `<span><b>${flt(x.ct).toFixed(3)}</b> ct ${esc(x.stone_type)}</span>`).join("")
							: `<span><b>${flt(p.stones).toFixed(3)}</b> ct ${__("stones")}</span>`}
					</div>
					<div class="meta">${(p.buckets || []).length
						? (p.buckets || []).map((b) => `<span class="sh-bk">${esc(b)}</span>`).join("")
						: ""} ${__("gross")} ${flt(p.gross).toFixed(3)} g</div>
					<div class="sh-actions">
						<button class="btn btn-primary btn-sm sh-send" style="background:#2e7d32;border-color:#2e7d32;">${__("SEND — move stock")}</button>
						<button class="btn btn-default btn-sm sh-xls">${__("Excel ⤓")}</button>
						<button class="btn btn-sm sh-cancel" style="background:#b02a2a;border-color:#b02a2a;color:#fff;">${__("Cancel")}</button>
					</div>
				</div>`).join("") || `<div class="sh-empty">${__("Nothing prepared — build a batch on the Hallmark desk.")}</div>`);
			root.find(".sh-recent").html(m.recent.length ? `<table class="sh-r"><thead><tr>
				<th>${__("Batch")}</th><th>${__("Centre")}</th><th>${__("Status")}</th>
				<th>${__("Pieces")}</th><th>${__("Sent")}</th></tr></thead>
				<tbody>${m.recent.map((p) => `<tr><td><b>${esc(p.name)}</b></td><td>${esc(p.center || "")}</td>
				<td>${esc(p.status)}</td><td>${p.pieces}</td><td>${esc(p.sent_on || "")}</td></tr>`).join("")}</tbody></table>`
				: `<div class="sh-empty">${__("Nothing yet.")}</div>`);
		});
	}

	// one click — the record stays, marked Cancelled, and its pieces are free again
	root.on("click", ".sh-cancel", function () {
		const nm = $(this).closest(".sh-card").data("name");
		frappe.call({ method: API + ".hall_prep_cancel", args: { name: nm } }).then(() => {
			frappe.show_alert({ message: __("{0} cancelled — its pieces are free again.", [nm]), indicator: "orange" }, 4);
			load();
		});
	});
	// the sheet that travels with the packet — its HUID column is blank, so it
	// comes back as the slip Confirm HUID is typed from
	root.on("click", ".sh-xls", function () {
		const nm = $(this).closest(".sh-card").data("name");
		open_url_post("/api/method/jewelima.jewelima.api.export_hallmarking_xlsx", { name: nm });
	});
	// A packet is made up before anyone decides where it goes, so the centre is
	// asked for HERE — the moment the gold actually leaves the building.
	root.on("click", ".sh-send", function () {
		const $c = $(this).closest(".sh-card");
		const nm = $c.data("name");
		const cur = $c.data("center") || "";
		const d = new frappe.ui.Dialog({
			title: __("Send {0}", [nm]),
			fields: [
				{ fieldtype: "Link", fieldname: "center", label: __("Hallmarking centre"),
					options: "Hallmarking Center", reqd: 1, default: cur,
					get_query: () => ({ filters: { disabled: 0 } }) },
				{ fieldtype: "HTML", fieldname: "note" },
			],
			primary_action_label: __("SEND — move stock"),
			primary_action(v) {
				if (!v.center) return frappe.msgprint(__("Pick the centre this batch is going to."));
				d.hide();
				frappe.dom.freeze(__("Sending…"));
				frappe.call({ method: API + ".send_hall_prep", args: { name: nm, center: v.center } })
					.then((r) => {
						frappe.dom.unfreeze();
						frappe.show_alert({ message: __("{0} sent to {1} — {2} piece(s) out.",
							[nm, v.center, (r.message || {}).count]), indicator: "green" }, 5);
						load();
					}).catch(() => frappe.dom.unfreeze());
			},
		});
		d.fields_dict.note.$wrapper.html(
			`<div style="font-size:12.5px;color:var(--text-muted);">${
				__("Stock moves out to At Hallmarking and the batch locks.")}</div>`);
		d.show();
		if (cur) d.set_value("center", cur);
	});

	// Click the card to see what is actually on the batch, and change it. Nothing
	// is written until Save, and until then the list says plainly which lines are
	// going and which are coming — a batch is a packet of gold, so "what am I
	// about to change" should never be a guess.
	root.on("click", ".sh-card", function (e) {
		if ($(e.target).closest("button").length) return;   // the card's own buttons win
		openEditor($(this).data("name"));
	});

	function openEditor(name) {
		frappe.call({ method: API + ".get_hall_prep", args: { name } }).then((r) => {
			const m = r.message || {};
			// original = what is saved; keep = what will be saved; extra = new lines
			const orig = (m.items || []).map((i) => i.order_bag);
			const E = { keep: new Set(orig), extra: [], mode: "add" };
			const meta = {};
			(m.items || []).forEach((i) => { meta[i.order_bag] = i; });

			const dlg = new frappe.ui.Dialog({
				title: m.center
					? __("{0} — {1} at {2}", [m.name, __("{0} piece(s)", [m.pieces]), m.center])
					: __("{0} — {1}", [m.name, __("{0} piece(s)", [m.pieces])]),
				size: "large",
				primary_action_label: __("Save"),
				primary_action() {
					const bags = orig.filter((b) => E.keep.has(b)).concat(E.extra);
					if (!bags.length) {
						return frappe.msgprint(__("A batch cannot be emptied — use Cancel on the card instead."));
					}
					frappe.dom.freeze(__("Saving…"));
					frappe.call({ method: API + ".hall_prep_set_items",
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
				$b.find(".he-list").html(rows.map((x) => {
					const i = meta[x.bag] || {};
					return `<div class="he-row ${x.state}" data-b="${esc(x.bag)}">
						${x.state ? `<span class="he-tag ${x.state}">${x.state === "add" ? __("ADDING") : __("REMOVING")}</span>` : ""}
						<b>${esc(x.bag)}</b>
						<span style="color:var(--text-muted);">${esc(i.design_no || i.design || "")}${i.design_type ? " · " + esc(i.design_type) : ""}</span>
						<span style="color:var(--text-muted);">${i.gross ? flt(i.gross).toFixed(3) + " g" : ""}</span>
						<span class="he-x ${x.state === "rm" ? "undo" : ""}">${x.state === "rm" ? "↺" : "✕"}</span>
					</div>`;
				}).join(""));
				$b.find(".he-sum").html(added || removed
					? __("Saving will leave <b>{0}</b> piece(s)", [total])
						+ (added ? " · <span style='color:#1d7a33;'>+" + added + " " + __("added") + "</span>" : "")
						+ (removed ? " · <span style='color:#b02a2a;'>−" + removed + " " + __("removed") + "</span>" : "")
					: __("<b>{0}</b> piece(s) — nothing changed yet", [total]));
				dlg.get_primary_btn().prop("disabled", !(added || removed));
			}

			$b.html(`
				<div class="he-bar">
					<input type="text" class="he-scan form-control" style="max-width:240px;">
					<button class="he-mode">${__("ADDING")}</button>
					<span style="font-size:12px;color:var(--text-muted);">${
						__("✕ takes a line off · ↺ puts it back")}</span>
				</div>
				<div class="he-sum"></div>
				<div class="he-list" style="max-height:46vh;overflow:auto;border:1px solid var(--border-color);border-radius:9px;"></div>`);

			$b.on("click", ".he-x", function () {
				const b = $(this).closest(".he-row").data("b");
				if (E.extra.includes(b)) E.extra = E.extra.filter((x) => x !== b);
				else if (E.keep.has(b)) E.keep.delete(b);
				else E.keep.add(b);
				paintEd();
			});
			function setMode(m) {
				E.mode = m;
				const rm = m === "remove";
				$b.find(".he-bar").toggleClass("removing", rm);
				$b.find(".he-mode").toggleClass("removing", rm).text(rm ? __("REMOVING") : __("ADDING"));
				$b.find(".he-scan").attr("placeholder", rm
					? __("scan a card to take it OFF + Enter")
					: __("scan a card to add + Enter"));
				$b.find(".he-scan").focus();
			}
			$b.on("click", ".he-mode", () => setMode(E.mode === "add" ? "remove" : "add"));

			$b.on("keydown", ".he-scan", function (e) {
				if (e.key !== "Enter") return;
				e.preventDefault();
				const code = ($(this).val() || "").trim();
				$(this).val("");
				if (!code) return;

				// REMOVING: a scan takes a line off, and only ever a line that is there
				if (E.mode === "remove") {
					if (E.extra.includes(code)) {
						E.extra = E.extra.filter((x) => x !== code);   // one just added: forget it
					} else if (orig.includes(code)) {
						E.keep.delete(code);
					} else {
						return frappe.show_alert({ message: __("{0} is not on this batch.", [code]), indicator: "orange" }, 4);
					}
					paintEd();
					return;
				}

				if (orig.includes(code)) {
					E.keep.add(code);   // scanning one back is the same as undoing it
					paintEd();
					return;
				}
				if (E.extra.includes(code)) {
					return frappe.show_alert({ message: __("{0} is already being added.", [code]), indicator: "orange" }, 3);
				}
				// the same guard a scan on the desk faces, so a piece that cannot go
				// is refused here rather than at Save
				frappe.call({ method: API + ".hall_draft_scan", freeze: false,
					args: { barcode: code, existing: JSON.stringify(orig.concat(E.extra)) } })
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
			setTimeout(() => $b.find(".he-scan").focus(), 200);
		});
	}

	page.set_primary_action(__("Refresh"), load, "refresh");
	frappe.pages["send-hallmarking"].on_page_show = load;
	load();
};
