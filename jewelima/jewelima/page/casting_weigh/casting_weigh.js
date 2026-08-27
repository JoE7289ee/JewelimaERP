// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Casting Weight Add — scan a card off the cast tree to start. The card must be
// AT CASTING (anywhere else → the error says where it is) and on a tree; its
// tree loads with every card: unweighed on the LEFT, selected on the RIGHT.
// Type each card's GROSS from the weighing machine — gold booked = gross −
// issued stones (ct × 0.2), pulled from the CASTING warehouse card by card.
// Cards stay at CASTING; when the last card holds gold the tree marks itself
// Cast. Route: /app/casting-weigh

frappe.pages["casting-weigh"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Casting Weight Add", single_column: true });
	const API = "jewelima.jewelima.api";
	const S = { tree: null, cards: [], selected: {} }; // selected: bag -> gross

	$(page.main).append(`
		<style>
		.cw-top{display:flex;align-items:center;gap:12px;margin:2px 0 12px;flex-wrap:wrap;}
		.cw-scan{width:280px;border:2px solid var(--primary);background:var(--fg-color);padding:4px 12px;height:34px;border-radius:6px;box-sizing:border-box;color:var(--text-color);font-size:14px;font-weight:600;}
		.cw-chip{background:var(--control-bg);border:1px solid var(--border-color);border-radius:6px;padding:3px 12px;font-size:12.5px;white-space:nowrap;}
		.cw-chip b{font-variant-numeric:tabular-nums;}
		.cw-chip.warn{background:#fdecea;color:#b00020;border-color:#b00020;}
		.cw-wrap{display:flex;gap:14px;align-items:flex-start;}
		.cw-col{flex:1 1 50%;min-width:0;border:1px solid var(--border-color);border-radius:8px;background:var(--fg-color);overflow:hidden;}
		.cw-colhead{padding:8px 12px;border-bottom:1px solid var(--border-color);font-weight:700;}
		.cw-list{max-height:calc(100vh - 300px);overflow:auto;}
		.cw-card{display:flex;align-items:center;gap:10px;padding:7px 12px;border-bottom:1px solid var(--border-color);font-size:13px;}
		.cw-card:last-child{border-bottom:none;}
		.cw-card .nm{font-weight:700;}
		.cw-card .meta{color:var(--text-muted);font-size:11.5px;}
		.cw-card.off{opacity:.55;}
		.cw-card .btn{margin-left:auto;}
		.cw-held{background:#e6f4ea;color:#2e7d32;border-radius:4px;padding:1px 7px;font-size:11px;font-weight:700;}
		.cw-stone{background:#e8f2fd;color:#1c5da8;border-radius:4px;padding:1px 7px;font-size:11px;font-weight:700;}
		.cw-name{flex:1 1 auto;min-width:0;}
		.cw-plan{background:var(--control-bg);border-radius:4px;padding:1px 7px;font-size:11px;font-weight:700;color:var(--text-muted);}
		.cw-planslot{flex:0 0 96px;text-align:right;}
		.cw-stoneslot{flex:0 0 92px;text-align:right;}
		.cw-gross{flex:0 0 110px;width:110px;text-align:right;border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);padding:2px 8px;height:30px;border-radius:4px;box-sizing:border-box;font-size:13.5px;font-weight:600;}
		.cw-gold{min-width:90px;text-align:right;font-variant-numeric:tabular-nums;font-weight:700;}
		.cw-gold.bad{color:#b00020;}
		.cw-empty{padding:16px;text-align:center;color:var(--text-muted);font-size:13px;}
		.cw-hint{margin:10px 2px 0;color:var(--text-muted);font-size:12px;}
		</style>
		<div class="cw-top">
			<input class="cw-scan" type="text" placeholder="${__("Scan card…")}" autofocus>
			<span class="cw-chips"></span>
		</div>
		<div class="cw-wrap" style="display:none">
			<div class="cw-col"><div class="cw-colhead">${__("Cards on the tree")}</div><div class="cw-list cw-pool"></div></div>
			<div class="cw-col"><div class="cw-colhead">${__("Weighing now")}</div><div class="cw-list cw-sel"></div></div>
		</div>
		<div class="cw-hint">${__("Gross = the weighing-machine reading. Gold booked = gross − the card's issued stones (ct×0.2), taken from the Casting warehouse. Cards stay at CASTING; the tree closes itself when every card holds gold.")}</div>
	`);

	const root = $(page.main)[0];
	const esc = frappe.utils.escape_html;
	const $scan = root.querySelector(".cw-scan");
	const fmt = (v) => flt(v).toFixed(3);

	function chips() {
		if (!S.tree) { root.querySelector(".cw-chips").innerHTML = ""; return; }
		const totalGold = Object.entries(S.selected).reduce((s, [bag, gross]) => {
			const c = S.cards.find((x) => x.order_bag === bag);
			return s + Math.max(0, flt(gross) - (c ? c.stone_g : 0));
		}, 0);
		const over = totalGold > S.karat_stock + 0.0005;
		root.querySelector(".cw-chips").innerHTML = `
			<span class="cw-chip">${__("Tree")} <b>${esc(S.tree)}</b></span>
			<span class="cw-chip">${esc(S.karat)}</span>
			<span class="cw-chip ${over ? "warn" : ""}">${__("Casting stock")} <b>${fmt(S.karat_stock)} g</b></span>
			<span class="cw-chip ${over ? "warn" : ""}">${__("Gold to book")} <b>${fmt(totalGold)} g</b></span>
			<span class="cw-chip">${__("Weighed")} <b>${S.cards.filter((c) => c.gold_held > 0).length}/${S.cards.length}</b></span>`;
	}

	function render() {
		root.querySelector(".cw-wrap").style.display = S.tree ? "" : "none";
		if (!S.tree) { chips(); return; }
		const pool = root.querySelector(".cw-pool");
		const unsel = S.cards.filter((c) => !(c.order_bag in S.selected));
		pool.innerHTML = unsel.length
			? unsel.map((c) => {
				// a card is cast once: once it holds gold there is nothing left to weigh
				const done = c.gold_held > 0;
				return `
				<div class="cw-card ${c.weighable && !done ? "" : "off"}">
					<div><div class="nm">${esc(c.order_bag)}</div>
						<div class="meta">${esc(c.design)}${done ? " · " + __("cast") : c.weighable ? "" : " · " + __("at {0}", [esc(c.location)])}</div></div>
					${c.plan_gold ? `<span class="cw-plan">${__("BOM")} ${fmt(c.plan_gold)} g</span>` : ""}
					${c.stone_g ? `<span class="cw-stone">${__("stones")} ${fmt(c.stone_g)} g</span>` : ""}
					${c.gold_held ? `<span class="cw-held">${__("holds")} ${fmt(c.gold_held)} g</span>` : ""}
					${c.weighable && !done ? `<button class="btn btn-xs btn-default cw-add" data-bag="${esc(c.order_bag)}">${__("Add")}</button>` : ""}
				</div>`; }).join("")
			: `<div class="cw-empty">${__("All cards selected.")}</div>`;
		pool.querySelectorAll(".cw-add").forEach((el) =>
			el.addEventListener("click", function () { select(this.getAttribute("data-bag")); }));

		const sel = root.querySelector(".cw-sel");
		const rows = Object.keys(S.selected);
		sel.innerHTML = rows.length
			? rows.map((bag) => {
				const c = S.cards.find((x) => x.order_bag === bag) || {};
				const gross = S.selected[bag];
				const gold = flt(gross) - flt(c.stone_g);
				return `<div class="cw-card">
					<div class="cw-name"><div class="nm">${esc(bag)}</div><div class="meta">${esc(c.design || "")}</div></div>
					<span class="cw-planslot">${c.plan_gold ? `<span class="cw-plan">${__("BOM")} ${fmt(c.plan_gold)} g</span>` : ""}</span>
					<span class="cw-stoneslot">${c.stone_g ? `<span class="cw-stone">− ${fmt(c.stone_g)} g</span>` : ""}</span>
					<input type="number" min="0" step="0.001" class="cw-gross" data-bag="${esc(bag)}"
						placeholder="${__("gross g")}" value="${gross || ""}">
					<span class="cw-gold ${gross && gold <= 0 ? "bad" : ""}" data-gold="${esc(bag)}">${gross ? "→ " + fmt(gold) + " g" : ""}</span>
					<button class="btn btn-xs btn-default cw-rm" data-bag="${esc(bag)}">×</button>
				</div>`;
			}).join("")
			: `<div class="cw-empty">${__("Scan a card or Add from the left.")}</div>`;
		sel.querySelectorAll(".cw-gross").forEach((el) => {
			// weight typed, Enter pressed -> hand control back to the scanner
			el.addEventListener("keydown", (e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					$scan.focus();
				}
			});
			el.addEventListener("input", function () {
				S.selected[this.getAttribute("data-bag")] = this.value;
				const bag = this.getAttribute("data-bag");
				const c = S.cards.find((x) => x.order_bag === bag) || {};
				const gold = flt(this.value) - flt(c.stone_g);
				const $g = sel.querySelector(`[data-gold="${CSS.escape(bag)}"]`);
				$g.textContent = this.value ? "→ " + fmt(gold) + " g" : "";
				$g.classList.toggle("bad", !!this.value && gold <= 0);
				chips();
			});
		});
		sel.querySelectorAll(".cw-rm").forEach((el) =>
			el.addEventListener("click", function () {
				delete S.selected[this.getAttribute("data-bag")];
				render();
			}));
		chips();
	}

	function select(bag, focus) {
		if (!(bag in S.selected)) S.selected[bag] = "";
		render();
		if (focus) {
			const inp = root.querySelector(`.cw-gross[data-bag="${CSS.escape(bag)}"]`);
			if (inp) inp.focus();
		}
	}

	function loadTree(args, focusBag) {
		frappe.call({ method: API + ".get_tree_for_weighing", args }).then((r) => {
			const d = r.message || {};
			S.tree = d.tree;
			S.karat = d.karat;
			S.karat_stock = flt(d.karat_stock);
			S.cards = d.cards || [];
			S.selected = {};
			if (d.cast) frappe.show_alert({ message: __("{0} is already marked Cast — top-ups only.", [d.tree]), indicator: "orange" }, 5);
			render();
			if (focusBag) select(focusBag, true);
		});
	}

	function onScan() {
		const code = ($scan.value || "").trim();
		$scan.value = "";
		if (!code) return;
		if (S.tree) {
			const mine = S.cards.find((c) => c.order_bag === code);
			if (mine) {
				if (!mine.weighable) {
					frappe.msgprint(__("{0} is at {1}, not CASTING.", [code, mine.location]));
					return;
				}
				if (mine.gold_held > 0) {
					frappe.msgprint(__("{0} is already cast — it holds {1} g. A card is only cast once.",
						[code, fmt(mine.gold_held)]));
					return;
				}
				select(code, true);
				return;
			}
			if (Object.values(S.selected).some((v) => flt(v) > 0)) {
				frappe.msgprint(__("{0} is on a different tree — book (or clear) the current weights first.", [code]));
				return;
			}
		}
		loadTree({ card: code }, code);
	}
	$scan.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); onScan(); } });

	page.set_primary_action(__("Book Weights"), () => {
		if (!S.tree) return frappe.msgprint(__("Scan a card first."));
		const entries = Object.entries(S.selected)
			.filter(([, g]) => flt(g) > 0)
			.map(([order_bag, gross]) => ({ order_bag, gross: flt(gross) }));
		if (!entries.length) return frappe.msgprint(__("Enter at least one gross weight."));
		frappe.dom.freeze(__("Booking cast weights…"));
		frappe.call({ method: API + ".cast_weigh", args: { tree: S.tree, entries: JSON.stringify(entries) } })
			.then((r) => {
				frappe.dom.unfreeze();
				const res = r.message || {};
				frappe.show_alert({
					message: __("Booked {0} g of {1} onto {2} card(s) — {3} g left in Casting.",
						[res.total_gold, S.karat, (res.booked || []).length, res.remaining_stock]),
					indicator: "green",
				}, 8);
				if (res.tree_cast) {
					frappe.msgprint({ title: __("Tree cast"), indicator: "green",
						message: __("{0} is fully weighed — marked Cast and off the queue.", [S.tree]) });
				}
				loadTree({ tree: S.tree });
				$scan.focus();
			})
			.catch(() => frappe.dom.unfreeze());
	}, "add");

	// straight from the queue's Weigh button
	const _ro = frappe.route_options || {};
	if (_ro.cast_tree) {
		frappe.route_options = null;
		loadTree({ tree: _ro.cast_tree });
	}
	setTimeout(() => $scan.focus(), 300);
};
