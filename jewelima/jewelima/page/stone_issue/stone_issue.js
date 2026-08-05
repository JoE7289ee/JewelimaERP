// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Stone Issue (Manufacturing > Issue) — the stone-issuing control station.
// LEFT: scan a card, its BOM stone lines (metals never show), edit a line
// (sieve swap / piece count — plan carats follow the per-piece average), add a
// brand-new stone (blank plan fills from the actual on issue), enter pcs + ct
// and Issue (Bag Material Ledger row + stock Stone Issue -> In Bags + a
// Material Issue record). RIGHT: what the picked issuer handed out today, and
// the Stone Issue warehouse stock. Route: /app/stone-issue

frappe.pages["stone-issue"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Stone Issue", single_column: true });
	const API = "jewelima.jewelima.api";
	const S = { card: null };
	const esc = frappe.utils.escape_html;

	$(page.main).append(`
		<style>
		.si-cols{display:flex;gap:20px;align-items:flex-start;}
		.si-main{flex:1;min-width:0;}
		.si-side{flex:0 0 340px;display:flex;flex-direction:column;gap:16px;}
		.si-scan{display:flex;gap:10px;align-items:end;margin-bottom:14px;}
		.si-scan .frappe-control{margin:0;flex:0 0 260px;}
		.si-scan .control-label{font-size:11px;color:var(--text-muted);}
		.si-head{display:none;gap:26px;flex-wrap:wrap;background:var(--control-bg);border:1px solid var(--border-color);border-radius:8px;padding:10px 16px;margin-bottom:12px;}
		.si-head .k{font-size:10.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;}
		.si-head .v{font-size:14.5px;font-weight:700;}
		table.si-grid{width:100%;border-collapse:collapse;font-size:13px;background:var(--fg-color);display:none;}
		table.si-grid th{background:var(--control-bg);font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);padding:6px 10px;border:1px solid var(--border-color);text-align:right;}
		table.si-grid th:first-child{text-align:left;}
		table.si-grid td{border:1px solid var(--border-color);padding:5px 10px;text-align:right;}
		table.si-grid td:first-child{text-align:left;font-weight:600;}
		table.si-grid td.mut{color:var(--text-muted);}
		table.si-grid td.low{color:var(--red-600,#c0392b);font-weight:700;}
		table.si-grid input{width:76px;border:1px solid var(--border-color);border-radius:4px;padding:2px 6px;text-align:right;background:var(--control-bg);}
		.si-foot{display:none;margin-top:14px;gap:12px;align-items:center;}
		.si-note{color:var(--text-muted);font-size:12px;margin-top:12px;}
		.si-panel{border:1px solid var(--border-color);border-radius:8px;background:var(--fg-color);overflow:hidden;}
		.si-panel .p-head{background:var(--control-bg);padding:8px 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);display:flex;justify-content:space-between;}
		.si-panel .p-body{max-height:340px;overflow-y:auto;}
		.si-panel table{width:100%;border-collapse:collapse;font-size:12px;}
		.si-panel td{padding:4px 12px;border-top:1px solid var(--border-color);}
		.si-panel td.r{text-align:right;white-space:nowrap;}
		.si-panel .p-empty{padding:14px;text-align:center;color:var(--text-muted);font-size:12px;}
		.si-panel .p-total{font-weight:700;background:var(--control-bg);}
		.si-wrap2{display:flex;flex-direction:column;height:calc(100vh - 110px);}
		.si-wrap2 > .si-cols{flex:1 1 auto;overflow:auto;min-height:0;}
		.si-strip{flex:0 0 auto;display:none;align-items:center;gap:14px;border-top:2px solid var(--border-color);background:var(--fg-color);padding:10px 16px;z-index:1;}
		.si-strip .b{border:1px solid var(--border-color);border-radius:8px;padding:5px 14px;text-align:center;background:var(--control-bg);min-width:96px;}
		.si-strip .b .bk{font-size:10.5px;font-weight:700;letter-spacing:.06em;color:var(--text-muted);}
		.si-strip .b .bv{font-size:14px;font-weight:700;}
		.si-strip .b.zero .bv{color:var(--text-muted);font-weight:400;}
		.si-strip .b.tot{background:var(--fg-color);border-width:2px;}
		.si-strip .si-go{margin-left:auto;font-size:15px;font-weight:700;padding:10px 34px;background:#2e7d32;border-color:#2e7d32;color:#fff;}
		.si-strip .si-go:hover{background:#256628;border-color:#256628;}
		table.si-grid tr.si-locked{opacity:.5;}
		table.si-grid tr.si-locked input{background:var(--disabled-control-bg,#eee);cursor:not-allowed;}
		.si-callout{display:none;border:2px solid;border-radius:8px;padding:12px 16px;margin-bottom:12px;font-size:14px;font-weight:600;}
		.si-callout.warn{border-color:#e67e22;background:rgba(230,126,34,.08);color:#b35a00;}
		.si-callout.bad{border-color:#c0392b;background:rgba(192,57,43,.08);color:#a02618;}
		.si-hist td{padding:4px 12px;border-top:1px solid var(--border-color);font-size:12px;}
		.si-hist .hb{display:inline-block;border-radius:10px;padding:1px 8px;font-size:10.5px;font-weight:700;letter-spacing:.03em;color:#fff;}
		.si-hist .hb.ok{background:#2e7d32;}.si-hist .hb.sold{background:#c0392b;}
		.si-hist .hb.product{background:#8e44ad;}.si-hist .hb.cancelled{background:#7f8c8d;}
		.si-hist .hb.not_found{background:#b35a00;}.si-hist .hb.no_access{background:#b35a00;}
		.si-hist .hb.no_stones{background:#7f8c8d;}.si-hist .hb.status{background:#7f8c8d;}
		.si-hist .hb.issued{background:#1f618d;}
		</style>
		<div class="si-wrap2">
		<div class="si-cols">
			<div class="si-main">
				<div class="si-scan"><div class="si-scan-box"></div><div class="si-by-box"></div><button class="btn btn-default si-clear">${__("Clear")}</button></div>
				<div class="si-callout"></div>
				<div class="si-head">
					<div><div class="k">${__("Card")}</div><div class="v si-bag"></div></div>
					<div><div class="k">${__("Design")}</div><div class="v si-design"></div></div>
					<div><div class="k">${__("Type")}</div><div class="v si-type"></div></div>
					<div><div class="k">${__("Location")}</div><div class="v si-loc"></div></div>
					<div><div class="k">${__("From Warehouse")}</div><div class="v si-wh"></div></div>
				</div>
				<table class="si-grid">
					<thead><tr>
						<th>${__("Stone")}</th><th>${__("Plan (pcs / ct)")}</th><th>${__("Issued (pcs / ct)")}</th>
						<th>${__("Available (ct)")}</th><th>${__("Issue Pcs")}</th><th>${__("Issue Ct")}</th>
					</tr></thead><tbody></tbody>
				</table>
				<div class="si-foot">
					<span class="si-sum text-muted"></span>
				</div>
				<div class="si-note">${__("Scan a card to start. Only the card's BOM STONES show here — gold is issued at Casting. Enter the pieces and carats you are handing out and Issue — this moves the carats from the Stone Issue warehouse into the In Bags pool and writes the card's ledger. (Changing the BOM — swapping a sieve or adding a stone — is done upstream, not here.)")}</div>
			</div>
			<div class="si-side">
				<div class="si-panel si-hist-panel" style="display:none;">
					<div class="p-head"><span>${__("Scan History")}</span><span class="si-hist-t"></span></div>
					<div class="p-body si-hist-b"></div>
				</div>
				<div class="si-panel si-today-panel" style="display:none;">
					<div class="p-head"><span>${__("Issued Today")}</span><span class="si-today-t"></span></div>
					<div class="p-body si-today-b"></div>
				</div>
				<div class="si-panel">
					<div class="p-head"><span>${__("Stone Issue Stock")}</span><span class="si-stock-t"></span></div>
					<div class="p-body si-stock-b"></div>
				</div>
			</div>
		</div>
		<div class="si-strip">
			<div class="si-buckets" style="display:flex;gap:10px;"></div>
			<div class="b tot"><div class="bk">${__("TOTAL")}</div><div class="bv si-strip-tot">0 / 0.000</div></div>
			<button class="btn btn-primary si-go">${__("Issue Stones")}</button>
		</div>
		</div>
	`);
	const root = $(page.main);

	const scan = frappe.ui.form.make_control({
		df: { fieldtype: "Data", label: __("Scan Card"), fieldname: "scan", placeholder: __("scan / type card no. + Enter") },
		parent: root.find(".si-scan-box").get(0), render_input: true,
	});
	scan.refresh();
	scan.$input.on("keydown", (e) => { if (e.key === "Enter") loadCard((scan.$input.val() || "").trim()); });

	// who physically hands the stones over — lands on the ledger + Material Issue record
	const issuedBy = frappe.ui.form.make_control({
		df: { fieldtype: "Link", label: __("Issued By"), fieldname: "issued_by", options: "Employee", reqd: 1,
			get_query: () => ({ filters: { status: "Active" } }) },
		parent: root.find(".si-by-box").get(0), render_input: true,
	});
	issuedBy.refresh();

	// who may pick the issuer, and which buckets the issuer can hand out
	let ctx = { can_choose_issuer: true };
	let allowedBuckets = null;   // null = no restriction (admin, no issuer picked yet)
	const bucketOK = (b) => !allowedBuckets || allowedBuckets.has(b);
	function applyBucketLocks() {
		if (!S.card) return;
		// the picked issuer may be blocked from EVERY stone on the loaded card
		if (allowedBuckets && !S.card.lines.some((l) => allowedBuckets.has(l.bucket || "POTH"))) {
			const bags = S.card.order_bag;
			hideCard();
			callout("bad", esc(__("This issuer has no access to issue the stones on {0}.", [bags])));
			logScan(bags, "no_access");
			return;
		}
		root.find("table.si-grid tbody tr").each(function () {
			const i = cint(this.getAttribute("data-i"));
			const b = S.card.lines[i].bucket || "POTH";
			const ok = bucketOK(b);
			const $r = $(this);
			$r.toggleClass("si-locked", !ok);
			$r.find(".si-pcs,.si-ct").prop("disabled", !ok);
			if (!ok) { $r.find(".si-pcs,.si-ct").val(""); $r.attr("title", __("Not allowed to issue {0} stones", [b])); }
			else { $r.removeAttr("title"); }
		});
		sum();
	}
	function loadContext() {
		frappe.call({ method: API + ".get_stone_issue_context" }).then((r) => {
			ctx = r.message || {};
			if (ctx.can_choose_issuer) { allowedBuckets = null; return; }
			// locked user — issue only as themselves, only their buckets
			allowedBuckets = new Set(ctx.allowed_buckets || []);
			if (ctx.self_employee) {
				issuedBy.set_value(ctx.self_employee);
				refreshToday();
			} else {
				frappe.msgprint({ title: __("No Employee linked"), indicator: "orange",
					message: __("Your login isn't linked to an Employee, so you can't issue stones. Ask an admin to link you.") });
			}
			issuedBy.$input.prop("disabled", true).attr("title", __("Locked to you."));
			issuedBy.$wrapper.find(".link-btn, .btn-open").hide();
			applyBucketLocks();
		});
	}

	// RIGHT PANEL 1 — the picked issuer's day, line by line
	function refreshToday() {
		const emp = issuedBy.get_value();
		if (!emp) { root.find(".si-today-panel").hide(); return; }
		frappe.call({ method: API + ".get_stone_issuer_today", args: { employee: emp } }).then((r) => {
			const t = r.message || {};
			root.find(".si-today-t").text(__("{0} pcs · {1} ct", [t.pcs || 0, (t.ct || 0).toFixed(3)]));
			// grouped by stone bucket: a bold family line, its issues beneath
			const groups = {};
			(t.lines || []).forEach((l) => { (groups[l.bucket || "POTH"] = groups[l.bucket || "POTH"] || []).push(l); });
			const order = ["DMD", "PS", "CS", "CZ", "CVD", "SW", "PDMD", "POTH"].filter((b) => groups[b]);
			const rows = order.map((b) => {
				const ls = groups[b];
				const pcs = ls.reduce((a, l) => a + l.pcs, 0);
				const ct = ls.reduce((a, l) => a + l.ct, 0);
				return `<tr style="background:var(--control-bg);font-weight:700;">
					<td>${b}</td><td class="r">${pcs} / ${ct.toFixed(3)}</td><td></td><td></td></tr>`
					+ ls.map((l) => `
					<tr><td style="padding-left:14px;">${esc(l.item)}</td><td class="r">${l.pcs} / ${l.ct.toFixed(3)}</td>
					<td class="r">${esc(l.order_bag)}</td>
					<td class="r text-muted">${frappe.datetime.str_to_user(l.time).split(" ").slice(1).join(" ")}</td></tr>`).join("");
			}).join("");
			root.find(".si-today-b").html(rows
				? `<table><tbody>${rows}</tbody></table>`
				: `<div class="p-empty">${__("Nothing issued today yet.")}</div>`);
			root.find(".si-today-panel").show();
		});
	}
	issuedBy.$input.on("change awesomplete-selectcomplete", () => setTimeout(() => {
		refreshToday();
		if (!ctx.can_choose_issuer) return;   // locked users can't change it anyway
		const e = issuedBy.get_value();
		if (!e) { allowedBuckets = null; applyBucketLocks(); return; }
		frappe.call({ method: API + ".get_employee_buckets", args: { employee: e } }).then((r) => {
			allowedBuckets = new Set((r.message || {}).allowed_buckets || []);
			applyBucketLocks();
		});
	}, 100));

	// RIGHT PANEL 2 — ONLY the scanned card's stones (not the whole warehouse)
	let STOCK = { items: [], total_ct: 0 };
	function paintStock() {
		if (!S.card) {
			root.find(".si-stock-t").text("");
			root.find(".si-stock-b").html(`<div class="p-empty">${__("Scan a card — the stock of ITS stones shows here.")}</div>`);
			return;
		}
		const wanted = new Set(S.card.lines.map((l) => l.item));
		const items = (STOCK.items || []).filter((l) => wanted.has(l.item));
		const have = new Set(items.map((l) => l.item));
		// the card's stones with NO stock at all still show, at zero, in red
		const rows = items.map((l) => `
			<tr><td>${esc(l.item)}</td><td class="r">${l.ct.toFixed(3)} ct</td></tr>`)
			.concat([...wanted].filter((i) => !have.has(i)).map((i) => `
			<tr><td>${esc(i)}</td><td class="r low">0.000 ct</td></tr>`)).join("");
		root.find(".si-stock-t").text(__("{0} ct", [items.reduce((a, l) => a + l.ct, 0).toFixed(3)]));
		root.find(".si-stock-b").html(`<table><tbody>${rows}</tbody></table>`);
	}
	function refreshStock() {
		frappe.call({ method: API + ".get_stone_issue_stock" }).then((r) => {
			STOCK = r.message || { items: [], total_ct: 0 };
			paintStock();
		});
	}

	function clearAll() {
		S.card = null;
		scan.set_value("");
		paintStock();
		root.find(".si-head, table.si-grid, .si-foot, .si-strip, .si-callout").hide();
		scan.$input.focus();
	}
	root.find(".si-clear").on("click", clearAll);

	// every scan lands here — what happened, newest first (this session)
	const HIST_LABEL = { ok: __("LOADED"), issued: __("ISSUED"), sold: __("SOLD"), product: __("PRODUCT"),
		cancelled: __("CANCELLED"), status: __("OFF FLOOR"), not_found: __("NOT FOUND"),
		no_stones: __("NO STONES"), no_access: __("NO ACCESS") };
	const hist = [];
	function logScan(card, code, note) {
		hist.unshift({ card, code, note: note || "", t: frappe.datetime.now_time().slice(0, 5) });
		if (hist.length > 40) hist.pop();
		root.find(".si-hist-t").text(__("{0} scan(s)", [hist.length]));
		root.find(".si-hist-b").html(`<table class="si-hist"><tbody>${hist.map((h) => `
			<tr><td>${esc(h.card)}</td>
			<td><span class="hb ${h.code}">${HIST_LABEL[h.code] || h.code}</span></td>
			<td class="r text-muted" title="${esc(h.note)}">${h.t}</td></tr>`).join("")}</tbody></table>`);
		root.find(".si-hist-panel").show();
	}

	function callout(kind, msg) {
		root.find(".si-callout").removeClass("warn bad").addClass(kind).html(msg).show();
	}
	function hideCard() {
		S.card = null;
		root.find(".si-head, table.si-grid, .si-foot, .si-strip").hide();
	}

	function loadCard(nm) {
		if (!nm) return;
		root.find(".si-callout").hide();
		frappe.call({ method: API + ".get_stone_issue_card", args: { barcode: nm } }).then((r) => {
			const m = r.message;
			if (!m) return;
			if (m.error) {
				// sold / product / cancelled / not found / no stones — big callout, not a load
				hideCard();
				callout(m.error === "not_found" || m.error === "no_stones" ? "warn" : "bad", esc(m.message));
				logScan(m.card || nm, m.error, m.message);
				scan.set_value(""); scan.$input.focus();
				return;
			}
			// the issuer may be blocked from EVERY stone on this card
			if (allowedBuckets && !m.lines.some((l) => allowedBuckets.has(l.bucket || "POTH"))) {
				hideCard();
				callout("bad", esc(__("You have no access to issue the stones on {0} ({1}).",
					[m.order_bag, m.lines.map((l) => l.bucket).filter((v, i, a) => a.indexOf(v) === i).join(", ")])));
				logScan(m.order_bag, "no_access");
				scan.set_value(""); scan.$input.focus();
				return;
			}
			S.card = m;
			paint();
			paintStock();
			// mixed card, partial access (e.g. CS + DMD, issuer allowed CS only) —
			// the blocked lines grey out; say so, and log the load
			const blocked = allowedBuckets ? m.lines.filter((l) => !allowedBuckets.has(l.bucket || "POTH")) : [];
			if (blocked.length) {
				const bl = blocked.map((l) => l.bucket).filter((v, i, a) => a.indexOf(v) === i).join(", ");
				callout("warn", esc(__("You can only issue part of this card — {0} line(s) are locked for you.", [bl])));
			}
			logScan(m.order_bag, "ok", blocked.length ? __("partial — {0} locked", [blocked.length]) : "");
		});
	}

	function paint() {
		const c = S.card;
		root.find(".si-bag").text(c.order_bag);
		root.find(".si-design").text(c.design || "—");
		root.find(".si-type").text(c.design_type || "—");
		root.find(".si-loc").text(c.location || "—");
		root.find(".si-wh").text(c.warehouse);
		root.find("table.si-grid tbody").html(c.lines.map((l, i) => `
			<tr data-i="${i}">
				<td>${esc(l.item)} <span class="text-muted">(${esc(l.stone_type)})</span></td>
				<td class="mut">${l.plan_pcs} / ${l.plan_ct.toFixed(3)}</td>
				<td class="mut">${l.issued_pcs} / ${l.issued_ct.toFixed(3)}</td>
				<td class="${l.available_ct <= 0 ? "low" : ""}">${l.available_ct.toFixed(3)}</td>
				<td><input type="number" class="si-pcs" min="0" step="1" placeholder="0"></td>
				<td><input type="number" class="si-ct" min="0" step="0.001" placeholder="0.000"></td>
			</tr>`).join(""));
		root.find(".si-head").css("display", "flex");
		root.find("table.si-grid").show();
		root.find(".si-foot").css("display", "flex");
		root.find(".si-strip").css("display", "flex");
		sum();
		applyBucketLocks();
		root.find("table.si-grid tbody tr:not(.si-locked):first .si-pcs").focus();
	}

	function readLines() {
		const out = [];
		root.find("table.si-grid tbody tr").each(function () {
			const i = cint(this.getAttribute("data-i"));
			const pcs = cint($(this).find(".si-pcs").val());
			const ct = flt($(this).find(".si-ct").val());
			if (pcs || ct) out.push({ item: S.card.lines[i].item, pcs, ct });
		});
		return out;
	}

	const BUCKET_ORDER = ["DMD", "PS", "CS", "CVD", "PDMD", "POTH"];
	function sum() {
		const ls = readLines();
		const pcs = ls.reduce((a, l) => a + l.pcs, 0), ct = ls.reduce((a, l) => a + l.ct, 0);
		root.find(".si-sum").text(ls.length ? __("{0} line(s) — {1} pcs, {2} ct", [ls.length, pcs, ct.toFixed(3)]) : "");
		// bottom strip: what's being issued right now, bucket by bucket
		if (!S.card) return;
		const agg = {};
		root.find("table.si-grid tbody tr").each(function () {
			const i = cint(this.getAttribute("data-i"));
			const b = S.card.lines[i].bucket || "POTH";
			const e = agg[b] || (agg[b] = { pcs: 0, ct: 0 });
			e.pcs += cint($(this).find(".si-pcs").val());
			e.ct += flt($(this).find(".si-ct").val());
		});
		const present = BUCKET_ORDER.filter((b) => b in agg);
		root.find(".si-buckets").html(present.map((b) => `
			<div class="b ${agg[b].pcs || agg[b].ct ? "" : "zero"}">
				<div class="bk">${b}</div><div class="bv">${agg[b].pcs} / ${agg[b].ct.toFixed(3)}</div>
			</div>`).join(""));
		root.find(".si-strip-tot").text(`${pcs} / ${ct.toFixed(3)}`);
	}
	root.on("input", ".si-pcs,.si-ct", sum);

	// Enter walks the grid: Pcs -> Ct -> next row's Pcs -> … -> Issue button
	root.on("keydown", ".si-pcs,.si-ct", function (e) {
		if (e.key !== "Enter") return;
		e.preventDefault();
		const inputs = root.find("table.si-grid tbody input").toArray();
		const next = inputs[inputs.indexOf(this) + 1];
		next ? $(next).focus().select() : root.find(".si-go").focus();
	});


	root.find(".si-go").on("click", () => {
		const lines = readLines();
		if (!lines.length) return frappe.msgprint(__("Enter a Qty + Carat weight on at least one stone line."));
		const bad = lines.find((l) => !(l.pcs > 0) || !(l.ct > 0));
		if (bad) return frappe.msgprint(__("{0}: enter both a Qty (pcs) and a Carat weight.", [bad.item]));
		const by = issuedBy.get_value();
		if (!by) return frappe.msgprint(__("Pick who is issuing these stones."));
		const ct = lines.reduce((a, l) => a + l.ct, 0);
		frappe.confirm(__("Issue <b>{0} ct</b> across {1} line(s) into <b>{2}</b>?", [ct.toFixed(3), lines.length, S.card.order_bag]), () => {
			frappe.dom.freeze(__("Issuing..."));
			frappe.call({ method: API + ".stone_issue_apply", args: { order_bag: S.card.order_bag, lines, issued_by: by } })
				.then((r) => {
					frappe.dom.unfreeze();
					frappe.show_alert({ message: __("Stones issued into {0}.", [S.card.order_bag]), indicator: "green" }, 5);
					logScan(S.card.order_bag, "issued", __("{0} ct across {1} line(s)", [ct.toFixed(3), lines.length]));
					S.card = r.message; // refreshed issued/available numbers
					paint();
					refreshToday();
					refreshStock();
				})
				.catch(() => frappe.dom.unfreeze());
		});
	});

	clearAll();
	refreshStock();
	loadContext();

	page.add_inner_button(__("Out of Stock"), () => {
		if (!S.card || !S.card.order_bag) {
			frappe.show_alert({ message: __("Scan a card first."), indicator: "orange" }, 3);
			return;
		}
		const nm = S.card.order_bag;
		frappe.prompt([{ fieldname: "n", fieldtype: "Small Text", label: __("What exactly is missing?") }],
			(v) => frappe.call({ method: API + ".mark_stone_oos", args: { order_bag: nm, note: v.n || "" } })
				.then(() => frappe.show_alert({ message: __("{0} marked OUT OF STOCK.", [nm]), indicator: "red" }, 4)),
			__("Mark {0} OUT OF STOCK", [nm]), __("Mark"));
	});

	// arriving from the Stones info page with the card already picked
	if (frappe.route_options && frappe.route_options.card) {
		const pre = frappe.route_options.card;
		frappe.route_options = null;
		setTimeout(() => loadCard(pre), 400);
	}

};
