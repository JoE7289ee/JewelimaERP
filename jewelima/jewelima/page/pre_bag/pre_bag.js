// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Pre-Bag — bag stones for orders BEFORE they reach the Stone Issue queue.
// TWO steps:
//   1) Set & Print — pick a bucket, then SET cards for pre-issue (scan or click).
//      Setting creates the Pre Bag record + queues the card's label. Print 24/A4.
//   2) Pre-bag (scan) — scan a set card, enter each stone's pcs + WEIGHT (like the
//      Stone Issue grid) and save. Records the plan; moves NO stock.
// Route: /app/pre-bag

frappe.pages["pre-bag"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Pre-Bag", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const cint = (v) => parseInt(v) || 0;
	const S = { bucket: null, rows: [], print: new Map() }; // set & print
	const B = { card: null }; // bag-by-scan

	$(page.main).append(`
		<style>
		#page-pre-bag .container{max-width:100%;}
		.pb-tabs{display:flex;gap:6px;border-bottom:2px solid var(--border-color);margin-bottom:14px;}
		.pb-tab{border:none;background:none;padding:8px 16px;font-size:14px;font-weight:600;color:var(--text-muted);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px;}
		.pb-tab.on{color:var(--text-color);border-bottom-color:#1f618d;}
		.pb-lbl{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin:2px 0 8px;}
		.pb-chips{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:14px;}
		.pb-chip{border:1px solid var(--border-color);background:var(--fg-color);border-radius:20px;padding:6px 15px;font-size:13px;font-weight:700;cursor:pointer;color:var(--text-color);display:flex;align-items:center;gap:8px;}
		.pb-chip.on{background:#1f618d;border-color:#1f618d;color:#fff;}
		.pb-chip .pb-n{background:var(--control-bg);color:var(--text-muted);border-radius:10px;font-size:11px;padding:0 7px;font-weight:800;}
		.pb-chip.on .pb-n{background:rgba(255,255,255,.25);color:#fff;}
		.pb-scanrow{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px;}
		.pb-scan{border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);color:var(--text-color);height:36px;border-radius:7px;padding:2px 12px;font-size:14px;min-width:300px;}
		.pb-printbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px;}
		.pb-count{margin-left:auto;color:var(--text-muted);font-size:12px;}
		.pb-box{border:1px solid var(--border-color);border-radius:11px;overflow:auto;}
		table.pb-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;background:var(--fg-color);}
		table.pb-tbl th{position:sticky;top:0;z-index:1;background:var(--control-bg,var(--fg-color));border-bottom:2px solid var(--gray-400,#aeb6bf);padding:7px 9px;text-align:left;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);}
		table.pb-tbl td{border-bottom:1px solid var(--border-color);padding:6px 9px;vertical-align:middle;}
		table.pb-tbl tr.on td{background:var(--bg-light-gray,#eef3ee);}
		.pb-thumb{width:44px;height:44px;object-fit:cover;border:1px solid var(--border-color);border-radius:7px;background:#fff;}
		.pb-thumb.none{display:flex;align-items:center;justify-content:center;color:#c3c3c3;font-size:9px;}
		.pb-oid{font-family:var(--font-family-monospace,monospace);font-weight:800;font-size:14px;}
		.pb-need{font-size:12px;color:var(--text-color);}
		.pb-st{display:inline-block;border-radius:9px;padding:1px 8px;font-size:10.5px;font-weight:800;}
		.pb-st.none{background:var(--control-bg);color:var(--text-muted);}
		.pb-st.set{background:#e3e7f5;color:#333d8f;}
		.pb-st.partial{background:#fdf3d0;color:#8a6d00;}
		.pb-st.full{background:#dcefe0;color:#1d7a33;}
		.pb-num{width:74px;border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);color:var(--text-color);height:30px;border-radius:5px;padding:2px 8px;font-size:13px;text-align:right;}
		.pb-none{padding:34px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:10px;}
		.pb-head{display:flex;gap:26px;flex-wrap:wrap;background:var(--control-bg);border:1px solid var(--border-color);border-radius:8px;padding:10px 16px;margin-bottom:12px;}
		.pb-head .k{font-size:10.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;}
		.pb-head .v{font-size:14.5px;font-weight:700;}
		.pb-callout{border:2px solid #e67e22;background:rgba(230,126,34,.08);color:#b35a00;border-radius:8px;padding:11px 15px;margin-bottom:12px;font-weight:600;}
		.pb-foot{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:14px;}
		</style>
		<div class="pb-tabs">
			<button class="pb-tab on" data-t="set">${__("Set & Print")}</button>
			<button class="pb-tab" data-t="bag">${__("Pre-bag (scan)")}</button>
		</div>
		<div class="pb-panel pb-set"></div>
		<div class="pb-panel pb-bag" style="display:none;"></div>
	`);
	const root = $(page.main);
	root.find(".pb-tab").on("click", function () {
		root.find(".pb-tab").removeClass("on");
		this.classList.add("on");
		const t = this.getAttribute("data-t");
		root.find(".pb-set").toggle(t === "set");
		root.find(".pb-bag").toggle(t === "bag");
		if (t === "bag") setTimeout(() => root.find(".pb-bagscan").focus(), 100);
	});

	// ---------- Step 1: Set & Print --------------------------------------------
	function loadSet() {
		frappe.call({ method: API + ".get_prebag_buckets" }).then((r) => {
			const bks = r.message || [];
			const el = root.find(".pb-set")[0];
			if (!bks.length) {
				el.innerHTML = `<div class="pb-none">${__("No orders are waiting to be pre-bagged.")}</div>`;
				return;
			}
			el.innerHTML = `
				<div class="pb-lbl">${__("1 — pick a stone bucket, then set cards for pre-issue")}</div>
				<div class="pb-chips" id="pb-buckets"></div>
				<div class="pb-scanrow">
					<input class="pb-scan pb-setscan" placeholder="${__("Scan a card to set it for pre-issue")}">
					<span style="font-size:12px;color:var(--text-muted);">${__("…or click Set on a row")}</span>
				</div>
				<div class="pb-printbar">
					<b class="pb-printn" style="font-size:13px;"></b>
					<button class="btn btn-primary btn-sm pb-print">${__("Print labels")}</button>
					<button class="btn btn-default btn-sm pb-printclear">${__("Clear print list")}</button>
					<span class="pb-count"></span>
				</div>
				<div class="pb-box"><table class="pb-tbl">
					<thead><tr><th style="width:56px"></th><th>${__("Order ID")}</th><th>${__("Design")}</th>
						<th>${__("Needs")}</th><th>${__("State")}</th><th style="width:130px"></th></tr></thead>
					<tbody class="pb-bd"><tr><td colspan="6" class="pb-none">${__("Pick a bucket.")}</td></tr></tbody>
				</table></div>`;
			el.querySelector("#pb-buckets").innerHTML = bks.map((b) =>
				`<button class="pb-chip ${b.bucket === S.bucket ? "on" : ""}" data-b="${esc(b.bucket)}">${esc(b.bucket)}<span class="pb-n">${b.count}</span></button>`).join("");
			el.querySelectorAll(".pb-chip").forEach((c) => c.addEventListener("click", () => { S.bucket = c.getAttribute("data-b"); loadSet(); loadCandidates(); }));
			$(el).find(".pb-print").on("click", printLabels);
			$(el).find(".pb-printclear").on("click", () => { S.print.clear(); paintPrintN(); });
			const $scan = $(el).find(".pb-setscan");
			$scan.on("keydown", (e) => {
				if (e.which === 13 || e.key === "Enter") {
					e.preventDefault();
					const code = ($scan.val() || "").trim();
					$scan.val("");
					if (code) setCard(code, true);
				}
			});
			paintPrintN();
			if (S.bucket) loadCandidates();
		});
	}

	function loadCandidates() {
		if (!S.bucket) return;
		frappe.call({ method: API + ".get_prebag_candidates", args: { bucket: S.bucket } }).then((r) => {
			S.rows = r.message || [];
			paintCandidates();
		});
	}

	function needNote(row) {
		return row.items.map((it) => `${it.plan_pcs} pc · ${flt(it.plan_ct).toFixed(3)} ct ${esc(it.stone_type || "")}`).join(" &middot; ");
	}
	function stateChip(r) {
		const m = { none: __("Not set"), set: __("Set"), partial: __("Partial ({0}/{1})", [r.prebagged_pcs, r.need_pcs]), full: __("Bagged ({0} pc)", [r.prebagged_pcs]) };
		return `<span class="pb-st ${r.state}">${m[r.state] || r.state}</span>`;
	}

	function paintCandidates() {
		const bd = root.find(".pb-set .pb-bd")[0];
		if (!bd) return;
		bd.innerHTML = S.rows.length ? S.rows.map((r) => `<tr class="${r.is_set ? "on" : ""}" data-nm="${esc(r.order_bag)}">
			<td>${r.image ? `<img class="pb-thumb" src="${esc(r.image)}">` : `<div class="pb-thumb none">${__("no img")}</div>`}</td>
			<td><span class="pb-oid">${esc(r.order_bag)}</span></td>
			<td>${esc(r.design || "")}</td>
			<td class="pb-need">${needNote(r)}</td>
			<td>${stateChip(r)}</td>
			<td>${r.is_set
				? `<button class="btn btn-xs btn-default pb-unset" data-nm="${esc(r.order_bag)}">${__("Set ✓ — undo")}</button>`
				: `<button class="btn btn-xs btn-primary pb-set-btn" data-nm="${esc(r.order_bag)}">${__("Set for pre-issue")}</button>`}</td>
		</tr>`).join("") : `<tr><td colspan="6" class="pb-none">${__("No cards need {0} that aren't already queued.", [esc(S.bucket)])}</td></tr>`;
		bd.querySelectorAll(".pb-set-btn").forEach((el) => el.addEventListener("click", () => setCard(el.dataset.nm, true)));
		bd.querySelectorAll(".pb-unset").forEach((el) => el.addEventListener("click", () => unsetCard(el.dataset.nm)));
		root.find(".pb-set .pb-count").text(__("{0} cards", [S.rows.length]));
	}

	function setCard(code, addToPrint) {
		frappe.call({ method: API + ".set_prebag", args: { order_bag: code, bucket: S.bucket } })
			.then((r) => {
				if (!(r.message && r.message.set)) return;
				const row = S.rows.find((x) => x.order_bag === code);
				if (addToPrint) S.print.set(code, { order_bag: code, image: row ? row.image : "", bucket: S.bucket, items: row ? row.items : [] });
				frappe.show_alert({ message: __("{0} set for pre-issue.", [esc(code)]), indicator: "green" }, 3);
				paintPrintN();
				loadCandidates();
			});
	}
	function unsetCard(code) {
		frappe.call({ method: API + ".unset_prebag", args: { order_bag: code, bucket: S.bucket } }).then(() => {
			S.print.delete(code);
			paintPrintN();
			loadCandidates();
		});
	}
	function paintPrintN() {
		root.find(".pb-printn").text(__("{0} in print list", [S.print.size]));
	}

	function printLabels() {
		const cards = [...S.print.values()];
		if (!cards.length) return frappe.msgprint(__("Set (or scan) some cards first — they queue here for printing."));
		const cells = cards.map((r) => `
			<div class="lab">
				${r.image ? `<img src="${esc(r.image)}">` : `<div class="noimg">—</div>`}
				<div class="oid">${esc(r.order_bag)}</div>
				<div class="stn">${esc(r.bucket)}: ${(r.items || []).map((it) => `${it.plan_pcs}pc ${flt(it.plan_ct).toFixed(2)}ct`).join(" · ")}</div>
			</div>`).join("");
		const w = window.open("", "_blank", "width=900,height=1100");
		w.document.write(`<html><head><title>${__("Pre-Bag labels")}</title><style>
			@page{size:A4;margin:8mm;}
			body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;margin:0;}
			.sheet{display:grid;grid-template-columns:repeat(4,1fr);grid-auto-rows:44mm;gap:2mm;}
			.lab{border:1px solid #bbb;border-radius:4px;padding:3px;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;overflow:hidden;text-align:center;}
			.lab img{width:26mm;height:24mm;object-fit:contain;background:#fff;}
			.lab .noimg{width:26mm;height:24mm;display:flex;align-items:center;justify-content:center;color:#ccc;}
			.lab .oid{font-family:monospace;font-weight:800;font-size:12px;margin-top:2px;letter-spacing:.3px;}
			.lab .stn{font-size:8.5px;color:#333;line-height:1.15;margin-top:1px;}
		</style></head><body><div class="sheet">${cells}</div></body></html>`);
		w.document.close();
		w.focus();
		setTimeout(() => w.print(), 500);
	}

	// ---------- Step 2: Pre-bag (scan) -----------------------------------------
	function buildBagPanel() {
		root.find(".pb-bag")[0].innerHTML = `
			<div class="pb-lbl">${__("2 — scan a set card and enter what you physically bagged (pcs + weight)")}</div>
			<div class="pb-scanrow">
				<input class="pb-scan pb-bagscan" placeholder="${__("Scan a card that's set for pre-issue")}">
				<button class="btn btn-default btn-sm pb-bagclear">${__("Clear")}</button>
			</div>
			<div class="pb-bagbody"></div>`;
		const $scan = root.find(".pb-bagscan");
		$scan.on("keydown", (e) => {
			if (e.which === 13 || e.key === "Enter") {
				e.preventDefault();
				const code = ($scan.val() || "").trim();
				$scan.val("");
				if (code) loadBag(code);
			}
		});
		root.find(".pb-bagclear").on("click", () => { B.card = null; root.find(".pb-bagbody").empty(); $scan.focus(); });
	}

	function loadBag(code) {
		frappe.call({ method: API + ".get_prebag_scan", args: { order_bag: code } }).then((r) => {
			const m = r.message || {};
			const body = root.find(".pb-bagbody")[0];
			if (m.error) {
				B.card = null;
				body.innerHTML = `<div class="pb-callout">${esc(m.message)}${m.error === "not_set" ? ` <a class="pb-quickset" data-nm="${esc(m.card)}" style="cursor:pointer;text-decoration:underline;">${__("Go to Set & Print")}</a>` : ""}</div>`;
				$(body).find(".pb-quickset").on("click", () => root.find('.pb-tab[data-t="set"]').click());
				return;
			}
			B.card = m;
			paintBag();
		});
	}

	function paintBag() {
		const m = B.card;
		const bagVal = (m.lines.find((l) => l.bag) || {}).bag || "";
		root.find(".pb-bagbody")[0].innerHTML = `
			<div class="pb-head">
				<div><div class="k">${__("Card")}</div><div class="v">${esc(m.order_bag)}</div></div>
				<div><div class="k">${__("Design")}</div><div class="v">${esc(m.design || "—")}</div></div>
				<div><div class="k">${__("Location")}</div><div class="v">${esc(m.location || "—")}</div></div>
				<div><div class="k">${__("Status")}</div><div class="v">${esc(m.status)}</div></div>
			</div>
			<div class="pb-box"><table class="pb-tbl">
				<thead><tr><th>${__("Stone")}</th><th>${__("Needed (pcs / ct)")}</th><th>${__("Bagged (pcs / ct)")}</th>
					<th>${__("Available (ct)")}</th><th style="width:90px">${__("Bag Pcs")}</th><th style="width:100px">${__("Bag Ct")}</th></tr></thead>
				<tbody>${m.lines.map((l, i) => `<tr data-i="${i}" data-item="${esc(l.item)}">
					<td><b>${esc(l.item)}</b> <span style="color:var(--text-muted);">(${esc(l.stone_type || l.bucket)})</span></td>
					<td>${l.needed_pcs} / ${flt(l.needed_ct).toFixed(3)}</td>
					<td>${l.prebagged_pcs} / ${flt(l.prebagged_ct).toFixed(3)}</td>
					<td class="${l.available_ct <= 0 ? "" : ""}">${flt(l.available_ct).toFixed(3)}</td>
					<td><input type="number" min="0" step="1" class="pb-num pb-bpcs" value="${l.prebagged_pcs || ""}"></td>
					<td><input type="number" min="0" step="0.001" class="pb-num pb-bct" value="${l.prebagged_ct || ""}"></td>
				</tr>`).join("")}</tbody>
			</table></div>
			<div class="pb-foot">
				<label style="font-size:12.5px;color:var(--text-muted);display:flex;align-items:center;gap:8px;margin:0;">${__("Bag / storage")}
					<input class="pb-scan pb-bagbag" style="min-width:160px;height:32px;" placeholder="${__("e.g. A1")}" value="${esc(bagVal)}"></label>
				<button class="btn btn-primary pb-bagsave">${__("Pre-bag")}</button>
			</div>`;
		root.find(".pb-bagsave").on("click", saveBag);
		root.find(".pb-bagbody tr:first .pb-bpcs").focus();
	}

	function saveBag() {
		if (!B.card) return;
		const bag = (root.find(".pb-bagbag").val() || "").trim();
		if (!bag) return frappe.msgprint(__("Enter the Bag / storage where this is kept."));
		const lines = [];
		root.find(".pb-bagbody tbody tr").each(function () {
			lines.push({ item: $(this).data("item"), pcs: cint($(this).find(".pb-bpcs").val()), ct: flt($(this).find(".pb-bct").val()) });
		});
		frappe.call({ method: API + ".save_prebag", args: { order_bag: B.card.order_bag, lines: JSON.stringify(lines), bag } })
			.then((r) => {
				frappe.show_alert({ message: __("{0} pre-bagged into bag {1} — {2}.", [esc(B.card.order_bag), esc(bag), (r.message || {}).status || ""]), indicator: "green" }, 4);
				loadBag(B.card.order_bag); // refresh numbers
			});
	}

	page.add_inner_button(__("Refresh"), () => { loadSet(); if (B.card) loadBag(B.card.order_bag); });
	buildBagPanel();
	loadSet();
};
