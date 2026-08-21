// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Ordering Workstation — standalone desk for the ORDERING room (deliberately
// NOT the bench engine). TOP: the day's placement report — orders placed,
// pieces, and BY WHOM (date picker). BOTTOM: every card still sitting in
// ORDERING — the un-dispatched backlog — filterable and sortable.
// Route: /app/ws-ordering

frappe.pages["ws-ordering"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Ordering Workstation", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	let D = null;
	let sortKey = "creation", sortDir = 1;
	const picked = new Set(); // print selection — survives filter/sort repaints

	$(page.main).append(`
		<style>
		#page-ws-ordering .container{max-width:100%;}
		.od-top{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px;}
		.od-top input[type=date]{border:1px solid var(--border-color);border-radius:7px;padding:4px 10px;background:var(--fg-color);color:var(--text-color);}
		.od-kpis{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px;}
		.od-tile{border:1px solid var(--border-color);border-radius:9px;padding:8px 18px;background:var(--control-bg);}
		.od-tile .k{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;}
		.od-tile .v{font-size:20px;font-weight:800;}
		.od-tile.main{border-width:2px;background:var(--fg-color);}
		.od-tile.main .v{color:#1f618d;}
		.od-by{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;}
		.od-who{border:1px solid var(--border-color);border-radius:999px;padding:3px 12px;font-size:12px;background:var(--fg-color);}
		.od-who b{color:#1f618d;}
		.od-sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin:14px 0 6px;}
		.od-filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;}
		.od-filters input,.od-filters select{border:1px solid var(--border-color);border-radius:7px;padding:4px 10px;font-size:12.5px;background:var(--fg-color);color:var(--text-color);}
		table.od-t{width:100%;border-collapse:collapse;font-size:12.5px;background:var(--fg-color);}
		table.od-t th{background:var(--control-bg);font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);padding:6px 10px;border:1px solid var(--border-color);text-align:left;cursor:pointer;user-select:none;white-space:nowrap;}
		table.od-t th .dir{color:#1f618d;}
		table.od-t td{border:1px solid var(--border-color);padding:5px 10px;}
		table.od-t td.num{text-align:right;font-variant-numeric:tabular-nums;}
		.od-card{font-family:var(--font-family-monospace,monospace);font-weight:800;color:#1f618d;cursor:pointer;}
		.od-age{border-radius:9px;padding:1px 8px;font-size:11px;font-weight:800;color:#fff;background:#7f8c8d;}
		.od-age.old{background:#e0a800;color:#3a2c00;}
		.od-age.vold{background:#b02a2a;}
		.od-none{padding:34px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:10px;}
		.od-imgpop{position:fixed;z-index:2000;background:#fff;border:1px solid var(--border-color);border-radius:10px;box-shadow:0 10px 34px rgba(0,0,0,.28);padding:6px;display:none;pointer-events:none;}
		.od-imgpop img{max-height:260px;max-width:260px;display:block;border-radius:6px;}
		td.od-design{cursor:zoom-in;}
		.od-photos.od-hasph{background:#2e7d32;border-color:#2e7d32;color:#fff;font-weight:700;}
		.od-ph-thumbs{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;}
		.od-ph-thumbs img{height:74px;border-radius:7px;border:1px solid var(--border-color);}
		.od-mv{margin-left:auto;display:flex;gap:8px;}
		.od-box{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--border-color);border-radius:999px;
			padding:3px 13px;cursor:pointer;font-size:12px;background:var(--fg-color);transition:border-color .12s;}
		.od-box:hover{border-color:#1f618d;}
		.od-box .lbl{color:var(--text-muted);text-transform:uppercase;font-size:10px;font-weight:800;letter-spacing:.04em;}
		.od-box .n{font-size:15px;font-weight:800;}
		.od-in .n{color:#1d7a33;} .od-out .n{color:#1f618d;}
		.od-mvtbl{width:100%;border-collapse:collapse;font-size:12.5px;}
		.od-mvtbl th{text-align:left;font-size:10px;text-transform:uppercase;color:var(--text-muted);
			border-bottom:1px solid var(--border-color);padding:4px 6px;}
		.od-mvtbl td{padding:4px 6px;border-bottom:1px solid var(--border-color);}
		</style>
		<div class="od-top">
			<span style="font-size:12px;color:var(--text-muted);">${__("Placed on")}</span>
			<input type="date" class="od-date" value="${frappe.datetime.get_today()}">
			<button class="btn btn-sm od-xl" style="background:#1f618d;border-color:#1f618d;color:#fff;font-weight:700;">${__("Daily Report ⤓")}</button>
			<button class="btn btn-sm od-tr" style="background:#2e7d32;border-color:#2e7d32;color:#fff;font-weight:700;">${__("Transfer →")}</button>
			<button class="btn btn-sm od-pr" style="font-weight:700;">${__("Print 0 ⎙")}</button>
			<button class="btn btn-sm btn-default od-clear" style="display:none;">✕ ${__("Clear selection")}</button>
			<span class="od-mv">
				<span class="od-box od-in" title="${__("what came into ordering")}">
					<span class="lbl">${__("In")}</span><b class="n">0</b></span>
				<span class="od-box od-out" title="${__("what left ordering")}">
					<span class="lbl">${__("Out")}</span><b class="n">0</b></span>
			</span>
		</div>
		<div class="od-kpis"></div>
		<div class="od-by"></div>
		<div class="od-sec">${__("Still in Ordering")} <span class="od-count" style="font-weight:400;text-transform:none;"></span></div>
		<div class="od-filters">
			<input type="text" class="od-q" placeholder="${__("filter card / design / party…")}" style="min-width:240px;">
			<select class="od-type"><option value="">${__("All types")}</option></select>
			<select class="od-kind"><option value="">${__("All lines")}</option>
				<option value="design">${__("Design lines")}</option><option value="cad">${__("CAD lines")}</option></select>
		</div>
		<div class="od-body"></div>
	`);
	const root = $(page.main);

	const COLS = [
		["name", "Card"], ["design", "Design"], ["qty", "Qty"], ["size", "Size"],
		["party", "Party"], ["salesman", "Salesman"], ["placed_by", "Placed By"], ["order_type", "Type"],
		["order_date", "Ordered"], ["due", "Due"], ["waiting_days", "Waiting"],
		["photos", "Photos"],
	];

	function ageChip(d) {
		const cls = d >= 7 ? "vold" : d >= 3 ? "old" : "";
		return `<span class="od-age ${cls}">${d}d</span>`;
	}

	function filtered() {
		const q = (root.find(".od-q").val() || "").toUpperCase();
		const ty = root.find(".od-type").val();
		const kind = root.find(".od-kind").val();
		let rows = (D.rows || []).filter((r) =>
			(!q || [r.name, r.design, r.party, r.salesman, r.placed_by].some((v) => (v || "").toUpperCase().includes(q)))
			&& (!ty || r.order_type === ty)
			&& (!kind || (kind === "cad" ? r.is_cad : !r.is_cad)));
		rows = rows.slice().sort((a, b) => {
			let x = a[sortKey], y = b[sortKey];
			if (typeof x === "string") { x = (x || "").toUpperCase(); y = (y || "").toUpperCase(); }
			return (x > y ? 1 : x < y ? -1 : 0) * sortDir;
		});
		return rows;
	}

	function paintTable() {
		const rows = filtered();
		root.find(".od-count").text(`— ${rows.length} / ${(D.rows || []).length} ${__("card(s)")}`);
		root.find(".od-body").html(rows.length ? `
			<table class="od-t"><thead><tr>
				<th style="width:30px;cursor:default;"><input type="checkbox" class="od-all"
					${rows.length && rows.every((r) => picked.has(r.name)) ? "checked" : ""}></th>
				${COLS.map(([k, l]) => `<th data-k="${k}">${__(l)}${sortKey === k ? ` <span class="dir">${sortDir > 0 ? "▲" : "▼"}</span>` : ""}</th>`).join("")}
			</tr></thead><tbody>
			${rows.map((r) => `<tr>
				<td><input type="checkbox" class="od-cb" data-name="${esc(r.name)}" ${picked.has(r.name) ? "checked" : ""}></td>
				<td><a class="jw-card-link od-card" data-card="${esc(r.name)}">${esc(r.name)}</a></td>
				<td class="od-design" data-name="${esc(r.name)}">${r.is_cad ? `<span style="color:#9a6b1f;font-weight:700;">CAD</span> ${esc(r.design || "")}` : esc(r.design || "")}</td>
				<td class="num">${r.qty || ""}</td><td>${esc(r.size || "")}</td>
				<td>${esc(r.party || "")}${r.party_group
					? `<div style="font-size:10.5px;color:var(--text-muted);">${esc(r.party_group)}</div>` : ""}</td>
				<td>${esc(r.salesman || "")}</td>
				<td>${esc(r.placed_by || "")}</td>
				<td>${esc(r.order_type || "")}</td>
				<td>${r.order_date ? frappe.datetime.str_to_user(r.order_date) : ""}</td>
				<td>${r.due ? frappe.datetime.str_to_user(r.due) : ""}</td>
				<td>${ageChip(r.waiting_days)}</td>
				<td><button class="btn btn-xs ${r.photos ? "od-hasph" : "btn-default"} od-photos" data-name="${esc(r.name)}">📷${r.photos ? " " + r.photos : ""}</button></td>
			</tr>`).join("")}</tbody></table>`
			: `<div class="od-none">${__("Nothing sits in Ordering — everything has been dispatched.")}</div>`);
	}

	function paintTop() {
		const K = D.kpis || {};
		root.find(".od-kpis").html(`
			<div class="od-tile main"><div class="k">${__("Orders placed")}</div><div class="v">${K.orders || 0}</div></div>
			<div class="od-tile"><div class="k">${__("Pieces")}</div><div class="v">${K.bags || 0}</div></div>
			<div class="od-tile"><div class="k">${__("Still in Ordering")}</div><div class="v">${K.in_ordering || 0}</div></div>`);
		root.find(".od-by").html((D.by || []).map((b) =>
			`<span class="od-who"><b>${esc(b.who)}</b> — ${b.orders} ${__("order(s)")} · ${b.bags} ${__("pc")}</span>`).join("")
			|| `<span style="font-size:12px;color:var(--text-muted);">${__("No orders placed on this day.")}</span>`);
		// type filter options from the data
		const types = [...new Set((D.rows || []).map((r) => r.order_type).filter(Boolean))].sort();
		const cur = root.find(".od-type").val();
		root.find(".od-type").html(`<option value="">${__("All types")}</option>` +
			types.map((t) => `<option ${t === cur ? "selected" : ""}>${esc(t)}</option>`).join(""));
	}

	function load() {
		frappe.call({ method: API + ".get_ordering_workstation",
			args: { date: root.find(".od-date").val() }, freeze: false })
			.then((r) => {
				D = r.message;
				if (!D) return;
				paintTop();
				paintTable();
			});
	}

	// scan-and-transfer: ORDERING is ALWAYS the source, and only the two first
	// stations are reachable from here — anything else goes through the global
	// Transfer page (rules, holders, issue combos live there)
	root.find(".od-tr").on("click", () => {
		const sel = new Map([...picked].map((n) => [n, 1])); // seed from the table selection
		const qtyOf = (n) => flt(((D.rows || []).find((r) => r.name === n) || {}).qty) || 0;
		const dlg = new frappe.ui.Dialog({
			title: __("Transfer from ORDERING"),
			fields: [
				{ fieldname: "to", fieldtype: "Select", label: __("To"), reqd: 1,
					options: "CAD\nWAXING", default: "CAD" },
				{ fieldname: "scan", fieldtype: "Data", label: __("Scan card"),
					description: __("Enter adds the card — it must be sitting in ORDERING") },
				{ fieldname: "list", fieldtype: "HTML" },
			],
			primary_action_label: __("Transfer"),
			primary_action(v) {
				const names = [...sel.keys()];
				if (!names.length) return frappe.show_alert({ message: __("Select or scan at least one card."), indicator: "orange" }, 3);
				// send in chunks: one huge request can hit the gateway timeout and leave
				// the desk half-transferred (same guard as the Transfer page)
				const CHUNK = 30;
				const parts = [];
				for (let i = 0; i < names.length; i += CHUNK) parts.push(names.slice(i, i + CHUNK));
				const tot = { count: 0, errors: [] };
				const run = (i) => {
					if (i >= parts.length) return Promise.resolve();
					frappe.dom.freeze(parts.length > 1
						? __("Transferring {0} of {1}…", [i + 1, parts.length]) : __("Transferring…"));
					return frappe.call({ method: API + ".transfer_order_bags",
						args: { names: JSON.stringify(parts[i]), to_location: v.to, remarks: "Ordering desk" } })
						.then((r) => {
							const m = r.message || {};
							tot.count += (m.count || 0);
							tot.errors = tot.errors.concat(m.errors || []);
							return run(i + 1);
						}).catch(() => {
							parts.slice(i).forEach((c) => c.forEach((nm) =>
								tot.errors.push({ name: nm, error: __("not sent — the batch stopped here") })));
						});
				};
				run(0).then(() => {
					frappe.dom.unfreeze();
					dlg.hide();
					if (tot.errors.length) {
						frappe.msgprint(tot.errors.map((e) => `<b>${esc(e.name)}</b>: ${esc(e.error)}`).join("<br>"));
					}
					frappe.show_alert({ message: __("{0} card(s) → {1}", [tot.count, v.to]),
						indicator: tot.errors.length ? "orange" : "green" }, 5);
					names.forEach((n) => picked.delete(n)); // clear the table selection too
					paintPrintBtn();
					load();
				}).catch(() => frappe.dom.unfreeze());
			},
		});
		const paintList = () => {
			const names = [...sel.keys()];
			const totalQty = names.reduce((a, n) => a + qtyOf(n), 0);
			const chips = names.map((n) =>
				`<span class="od-tr-chip" data-name="${esc(n)}" style="display:inline-block;margin:3px 6px 0 0;padding:3px 10px;border:1px solid var(--border-color);border-radius:9px;font-family:var(--font-family-monospace,monospace);font-weight:700;">
					${esc(n)}${qtyOf(n) ? ` <span style="color:var(--text-muted);font-weight:400;">×${qtyOf(n)}</span>` : ""} <span data-rm="${esc(n)}" style="cursor:pointer;color:#b02a2a;font-weight:800;">&times;</span></span>`).join("")
				|| `<span style="color:var(--text-muted);font-size:12px;">${__("nothing selected — tick cards on the list or scan here")}</span>`;
			dlg.get_field("list").$wrapper.html(`
				<div style="display:flex;align-items:center;gap:14px;margin-bottom:8px;font-size:13px;">
					<span><b>${names.length}</b> ${__("card(s)")}</span>
					<span>${__("total qty")} <b>${totalQty}</b></span>
					<button class="btn btn-xs btn-default od-tr-reset" style="margin-left:auto;">${__("Reset")}</button>
				</div>
				<div class="od-tr-chips">${chips}</div>`);
			dlg.get_primary_btn().text(__("Transfer {0} card(s)", [names.length]));
		};
		// hover a chip -> the card's print image (same popup the table hover uses);
		// scanned cards not on today's list get their image fetched once
		const chipImg = {};
		dlg.get_field("list").$wrapper.on("mouseenter", ".od-tr-chip", function () {
			const el = this, n = $(this).data("name");
			const showAt = (src) => {
				if (!src || !el.isConnected || !$(el).is(":hover")) return;
				const rc = el.getBoundingClientRect();
				$imgpop.find("img").attr("src", encodeURI(src));
				$imgpop.css({ left: rc.right + 10 + "px", top: Math.max(10, rc.top - 80) + "px", "z-index": 1060 }).show();
			};
			const row = ((D && D.rows) || []).find((x) => x.name === n);
			if (row && row.image) return showAt(row.image);
			if (n in chipImg) return showAt(chipImg[n]);
			frappe.db.get_value("Order Bag", n, "image").then((r) => {
				chipImg[n] = (r.message || {}).image || "";
				showAt(chipImg[n]);
			});
		});
		dlg.get_field("list").$wrapper.on("mouseleave", ".od-tr-chip", () => $imgpop.hide());
		dlg.$wrapper.on("hidden.bs.modal", () => $imgpop.hide());
		dlg.get_field("list").$wrapper.on("click", "[data-rm]", function () {
			sel.delete($(this).data("rm"));
			paintList();
		});
		dlg.get_field("list").$wrapper.on("click", ".od-tr-reset", function () {
			sel.clear();
			paintList();
		});
		dlg.get_field("scan").$input.on("keydown", function (e) {
			if (e.key !== "Enter") return;
			e.preventDefault();
			const code = (this.value || "").trim().toUpperCase();
			this.value = "";
			if (!code || sel.has(code)) return;
			frappe.db.get_value("Order Bag", code, ["location", "is_finished"]).then((r) => {
				const b = (r.message || {});
				if (!b.location) return frappe.show_alert({ message: __("No card {0}.", [code]), indicator: "red" }, 3);
				if (b.is_finished) return frappe.show_alert({ message: __("{0} is a product — not from here.", [code]), indicator: "red" }, 4);
				if (b.location !== "ORDERING")
					return frappe.show_alert({ message: __("{0} is at {1} — use the Transfer page for anything not in ORDERING.", [code, b.location]), indicator: "orange" }, 5);
				sel.set(code, 1);
				paintList();
			});
		});
		dlg.show();
		paintList();
		setTimeout(() => dlg.get_field("scan").$input.focus(), 300);
	});

	// per-row photos: pick images -> they attach to the bag (same store the
	// order page's Photos button and Card Info read)
	root.on("click", ".od-photos", function () {
		const nm = $(this).data("name");
		const shots = [];
		const dlg = new frappe.ui.Dialog({
			title: __("Photos — {0}", [nm]),
			fields: [{ fieldname: "body", fieldtype: "HTML" }],
			primary_action_label: __("Attach 0"),
			primary_action() {
				if (!shots.length) return;
				frappe.call({ method: API + ".attach_order_bag_photos",
					args: { order_bag: nm, photos: JSON.stringify(shots) } })
					.then(() => {
						dlg.hide();
						frappe.show_alert({ message: __("{0} photo(s) attached to {1}.", [shots.length, nm]), indicator: "green" }, 4);
						load();
					});
			},
		});
		dlg.get_field("body").$wrapper.html(`
			<div class="od-ph-have" style="margin-bottom:10px;"></div>
			<input type="file" class="od-ph-file" accept="image/*" multiple
				style="display:block;width:100%;border:2px dashed var(--border-color);border-radius:9px;padding:18px;">
			<div class="od-ph-thumbs"></div>`);
		// what the bag already carries (design photo first, then attachments)
		frappe.call({ method: API + ".get_order_bag_images", args: { order_bag: nm }, freeze: false })
			.then((r) => {
				const imgs = r.message || [];
				dlg.get_field("body").$wrapper.find(".od-ph-have").html(imgs.length ? `
					<div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:5px;">
						${__("Already on the bag")} — ${imgs.length}</div>
					<div class="od-ph-thumbs" style="margin-top:0;">
						${imgs.map((f) => `<a href="${encodeURI(f.file_url)}" target="_blank" title="${esc(f.file_name || "")}">
							<img src="${encodeURI(f.file_url)}"></a>`).join("")}</div>`
					: `<div style="font-size:12px;color:var(--text-muted);">${__("No photos on the bag yet.")}</div>`);
			});
		dlg.get_field("body").$wrapper.on("change", ".od-ph-file", function () {
			[...this.files].forEach((file) => {
				const rd = new FileReader();
				rd.onload = () => {
					shots.push(rd.result);
					dlg.get_field("body").$wrapper.find(".od-ph-thumbs").append(`<img src="${rd.result}">`);
					dlg.get_primary_btn().text(__("Attach {0}", [shots.length]));
				};
				rd.readAsDataURL(file);
			});
			this.value = "";
		});
		dlg.show();
	});

	// hover a design -> the product image that will print on its job card
	const $imgpop = $('<div class="od-imgpop"><img></div>').appendTo(document.body);
	root.on("mouseenter", "td.od-design", function () {
		const r = ((D && D.rows) || []).find((x) => x.name === $(this).data("name"));
		if (!r || !r.image) return;
		const rc = this.getBoundingClientRect();
		$imgpop.find("img").attr("src", encodeURI(r.image));
		$imgpop.css({ left: rc.right + 10 + "px", top: Math.max(10, rc.top - 80) + "px" }).show();
	});
	root.on("mouseleave", "td.od-design", () => $imgpop.hide());
	$(wrapper).on("remove", () => $imgpop.remove());

	root.find(".od-date").on("change", load);
	// the house DAILY REPORT excel for the picked date — karat sections + CO/BULK
	root.find(".od-xl").on("click", () =>
		open_url_post("/api/method/jewelima.jewelima.api.export_daily_orders_xlsx",
			{ date: root.find(".od-date").val() }));
	root.on("input change", ".od-q, .od-type, .od-kind", paintTable);
	root.on("click", ".od-t th", function () {
		const k = $(this).data("k");
		if (!k) return; // the checkbox column doesn't sort
		if (sortKey === k) sortDir = -sortDir;
		else { sortKey = k; sortDir = 1; }
		paintTable();
	});

	// ---- job-card printing: filter, tick, Print — same cards, same code as
	// the Print Order Bags page (that one stays the anywhere/reprint desk)
	const paintPrintBtn = () => {
		root.find(".od-pr").text(__("Print {0} ⎙", [picked.size]));
		root.find(".od-clear").toggle(picked.size > 0);
	};
	root.find(".od-clear").on("click", () => {
		picked.clear();
		paintTable();
		paintPrintBtn();
	});
	root.on("change", ".od-cb", function () {
		const nm = $(this).data("name");
		this.checked ? picked.add(nm) : picked.delete(nm);
		paintPrintBtn();
	});
	root.on("change", ".od-all", function () {
		const on = this.checked;
		filtered().forEach((r) => (on ? picked.add(r.name) : picked.delete(r.name)));
		paintTable();
		paintPrintBtn();
	});
	root.find(".od-pr").on("click", () => {
		const names = [...picked];
		if (!names.length) return frappe.show_alert({ message: __("Tick the cards to print."), indicator: "orange" }, 3);
		frappe.call({ method: API + ".get_order_bag_cards", args: { names: JSON.stringify(names) } })
			.then((r) => {
				jewelima.printJobCards(r.message || []);
				picked.clear();
				paintTable();
				paintPrintBtn();
			});
	});

	// ---- transfers in / out of ORDERING -------------------------------------
	// the counts follow the date the desk is showing, so a box and the history
	// behind it always agree
	function loadMoves() {
		const d = $(page.main).find(".od-date").val() || frappe.datetime.get_today();
		frappe.call({ method: "jewelima.jewelima.api.get_location_transfers", freeze: false,
			args: { location: "ORDERING", from_date: d, to_date: d } }).then((r) => {
			const m = r.message || {};
			$(page.main).find(".od-in .n").text(m.in_count || 0);
			$(page.main).find(".od-out .n").text(m.out_count || 0);
		});
	}

	function showMoves(dir) {
		const today = $(page.main).find(".od-date").val() || frappe.datetime.get_today();
		const S = { from: today, to: today, q: "" };
		const dlg = new frappe.ui.Dialog({
			title: __("Transfers {0} ordering", [dir === "in" ? __("into") : __("out of")]),
			size: "large", fields: [{ fieldname: "html", fieldtype: "HTML" }],
		});
		const paint = (m) => {
			const rows = (dir === "in" ? m.in : m.out) || [];
			dlg.get_field("html").$wrapper.find(".od-mvbody").html(rows.length ? `
				<table class="od-mvtbl"><thead><tr>
					<th>${__("Card")}</th><th>${dir === "in" ? __("From") : __("To")}</th>
					<th>${__("When")}</th><th>${__("By")}</th>
				</tr></thead><tbody>
				${rows.map((x) => `<tr>
					<td><b>${esc(x.order_bag)}</b></td><td>${esc(x.other || "—")}</td>
					<td>${esc((x.transfer_time || "").slice(0, 16))}</td>
					<td>${esc(x.transferred_by || "")}</td></tr>`).join("")}
				</tbody></table>
				<div style="font-size:11px;color:var(--text-muted);margin-top:8px;">${__("{0} move(s)", [rows.length])}</div>`
				: `<div style="padding:26px;text-align:center;color:var(--text-muted);">${__("Nothing in this window.")}</div>`);
		};
		const load2 = () => frappe.call({ method: "jewelima.jewelima.api.get_location_transfers", freeze: false,
			args: { location: "ORDERING", from_date: S.from, to_date: S.to, q: S.q } })
			.then((r) => paint(r.message || {}));
		dlg.get_field("html").$wrapper.html(`
			<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">
				<input type="date" class="mv-from" value="${S.from}">
				<span style="color:var(--text-muted);">→</span>
				<input type="date" class="mv-to" value="${S.to}">
				<input type="text" class="mv-q" placeholder="${__("card / location / who…")}" style="min-width:200px;">
			</div>
			<div class="od-mvbody"></div>`);
		const $x = dlg.get_field("html").$wrapper;
		$x.find(".mv-from,.mv-to,.mv-q").css({ border: "1px solid var(--border-color)", "border-radius": "7px",
			height: "30px", padding: "2px 9px", background: "var(--fg-color)", color: "var(--text-color)" });
		$x.on("change", ".mv-from", function () { S.from = this.value; load2(); });
		$x.on("change", ".mv-to", function () { S.to = this.value; load2(); });
		$x.on("input", ".mv-q", frappe.utils.debounce(function () { S.q = this.value; load2(); }, 350));
		dlg.show();
		load2();
	}
	$(page.main).on("click", ".od-in", () => showMoves("in"));
	$(page.main).on("click", ".od-out", () => showMoves("out"));
	$(page.main).on("change", ".od-date", loadMoves);

	load();
	loadMoves();
	const t = setInterval(() => { if ($(wrapper).is(":visible")) load(); }, 60000);
	$(wrapper).on("remove", () => clearInterval(t));
};
