// Stone Return — the mirror of Stone Issue. Scan a card, see the stones it is
// actually holding, and send some (or all) back to the Stone Issue warehouse.
// Records WHO returned them; the side panel shows everything that person has
// brought back today, and Card Info lists each return in the card's history.
frappe.pages["stone-return"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Stone Return"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));
	const S = { card: null, lines: [] };

	$(page.main).append(`
		<style>
		.sr-wrap{display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap;}
		.sr-main{flex:1 1 auto;min-width:480px;}
		.sr-side{flex:0 0 360px;}
		.sr-top{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap;margin-bottom:12px;}
		.sr-top .frappe-control{margin-bottom:0!important;}
		.sr-card{border:1px solid var(--border-color);border-radius:12px;padding:14px;background:var(--fg-color);}
		.sr-hd{display:flex;gap:14px;align-items:center;margin-bottom:10px;}
		.sr-hd img{height:84px;border-radius:8px;border:1px solid var(--border-color);background:#fff;}
		.sr-hd .nm{font-weight:800;font-size:15px;font-family:var(--font-family-monospace,monospace);}
		.sr-hd .sub{font-size:12px;color:var(--text-muted);}
		.sr-tbl{width:100%;border-collapse:collapse;font-size:13px;}
		.sr-tbl th{text-align:left;font-size:10px;text-transform:uppercase;color:var(--text-muted);
			border-bottom:1px solid var(--border-color);padding:4px 6px;}
		.sr-tbl td{padding:5px 6px;border-bottom:1px solid var(--border-color);}
		.sr-tbl input{width:110px;border:1px solid var(--border-color);border-radius:6px;height:28px;
			padding:2px 8px;background:var(--fg-color);color:var(--text-color);}
		.sr-tbl .all{font-size:11px;color:#1f618d;cursor:pointer;font-weight:700;}
		.sr-foot{display:flex;align-items:center;gap:14px;margin-top:12px;}
		.sr-sum{font-size:12.5px;color:var(--text-muted);}
		.sr-sum b{color:var(--text-color);}
		.sr-go{margin-left:auto;font-weight:800;}
		.sr-empty{padding:36px;text-align:center;color:var(--text-muted);}
		.sr-panel{border:1px solid var(--border-color);border-radius:12px;padding:12px 14px;background:var(--fg-color);}
		.sr-panel h4{margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;}
		.sr-kpi{display:flex;gap:16px;margin-bottom:8px;}
		.sr-kpi div{font-size:11px;color:var(--text-muted);}
		.sr-kpi b{display:block;font-size:19px;color:var(--text-color);}
		.sr-hist{max-height:46vh;overflow:auto;font-size:12px;}
		.sr-hist .r{display:flex;gap:8px;padding:4px 0;border-bottom:1px solid var(--border-color);}
		.sr-hist .r .t{margin-left:auto;color:var(--text-muted);}
		</style>
		<div class="sr-wrap">
			<div class="sr-main">
				<div class="sr-top">
					<div class="sr-scan" style="min-width:260px;"></div>
					<div class="sr-emp" style="min-width:240px;"></div>
				</div>
				<div class="sr-body"><div class="sr-empty">${__("Scan a card to see what it is holding.")}</div></div>
			</div>
			<div class="sr-side">
				<div class="sr-panel" style="display:none;">
					<h4>${__("Returned today")}</h4>
					<div class="sr-kpi">
						<div>${__("Pieces")}<b class="k-pcs">0</b></div>
						<div>${__("Carats")}<b class="k-ct">0.000</b></div>
						<div>${__("Cards")}<b class="k-cards">0</b></div>
					</div>
					<div class="sr-hist"></div>
				</div>
			</div>
		</div>`);

	const root = $(page.main);
	const mk = (sel, df) => {
		const c = frappe.ui.form.make_control({ df, parent: root.find(sel).get(0), render_input: true });
		c.refresh();
		return c;
	};
	const emp = mk(".sr-emp", { fieldtype: "Link", label: __("Returned by"), fieldname: "employee",
		options: "Employee", get_query: () => ({ filters: { status: "Active" } }) });
	const scan = mk(".sr-scan", { fieldtype: "Data", label: __("Scan Order Bag"), fieldname: "scan",
		placeholder: __("scan a barcode or type + Enter") });

	// ---- the day panel ------------------------------------------------------
	function loadDay() {
		const e = emp.get_value();
		const $p = root.find(".sr-panel");
		if (!e) return $p.hide();
		frappe.call({ method: API + ".get_stone_returner_today", args: { employee: e }, freeze: false })
			.then((r) => {
				const m = r.message || { pcs: 0, ct: 0, cards: 0, lines: [] };
				$p.show();
				$p.find(".k-pcs").text(m.pcs);
				$p.find(".k-ct").text(flt(m.ct).toFixed(3));
				$p.find(".k-cards").text(m.cards);
				$p.find(".sr-hist").html((m.lines || []).map((l) => `
					<div class="r"><b>${esc(l.item)}</b>
						<span>${l.pcs} pcs · ${flt(l.ct).toFixed(3)} ct</span>
						<span>${esc(l.order_bag)}</span>
						<span class="t">${esc((l.time || "").slice(11, 16))}</span></div>`).join("")
					|| `<div style="color:var(--text-muted);padding:6px 0;">${__("Nothing yet today.")}</div>`);
			});
	}
	if (emp.$input) emp.$input.on("change awesomplete-selectcomplete", () => setTimeout(loadDay, 200));

	// ---- the card -----------------------------------------------------------
	function paintCard() {
		const $b = root.find(".sr-body");
		if (!S.card) return $b.html(`<div class="sr-empty">${__("Scan a card to see what it is holding.")}</div>`);
		if (!S.lines.length) {
			return $b.html(`<div class="sr-card">
				<div class="sr-hd">
					${S.card.image ? `<img src="${esc(S.card.image)}">` : ""}
					<div><div class="nm">${esc(S.card.name)}</div>
					<div class="sub">${esc(S.card.design || "")} · ${esc(S.card.location || "")}</div></div>
				</div>
				<div class="sr-empty">${__("This bag holds no stones.")}</div></div>`);
		}
		$b.html(`<div class="sr-card">
			<div class="sr-hd">
				${S.card.image ? `<img src="${esc(S.card.image)}">` : ""}
				<div><div class="nm">${esc(S.card.name)}</div>
				<div class="sub">${esc(S.card.design || "")} · ${esc(S.card.location || "")} · ${esc(S.card.customer || "")}</div></div>
			</div>
			<table class="sr-tbl"><thead><tr>
				<th>${__("Stone")}</th><th>${__("In the bag")}</th>
				<th>${__("Return pcs")}</th><th>${__("Return ct")}</th><th></th>
			</tr></thead><tbody>
			${S.lines.map((l, i) => `<tr data-i="${i}">
				<td><b>${esc(l.item)}</b> <span style="color:var(--text-muted);font-size:11px;">${esc(l.stone_type)}</span></td>
				<td>${l.held_pcs ? l.held_pcs + " pcs · " : ""}${flt(l.held_ct).toFixed(3)} ct</td>
				<td><input type="number" class="r-pcs" min="0" max="${l.held_pcs || ""}" value=""></td>
				<td><input type="number" class="r-ct" min="0" step="0.001" value=""></td>
				<td><span class="all">${__("all")}</span></td>
			</tr>`).join("")}
			</tbody></table>
			<div class="sr-foot">
				<span class="sr-sum"></span>
				<button class="btn btn-primary btn-sm sr-go">${__("Return to Stone Issue")}</button>
			</div>
		</div>`);
		sum();
	}

	function collect() {
		return root.find(".sr-tbl tbody tr").map(function () {
			const l = S.lines[parseInt(this.dataset.i, 10)];
			return { item: l.item, pcs: parseInt($(this).find(".r-pcs").val(), 10) || 0,
				ct: flt($(this).find(".r-ct").val()) };
		}).get().filter((x) => x.pcs || x.ct);
	}
	function sum() {
		const ls = collect();
		root.find(".sr-sum").html(ls.length
			? __("Returning <b>{0}</b> pcs · <b>{1}</b> ct across {2} line(s)",
				[ls.reduce((a, x) => a + x.pcs, 0), ls.reduce((a, x) => a + x.ct, 0).toFixed(3), ls.length])
			: __("Enter what is coming back."));
	}
	root.on("input", ".r-pcs,.r-ct", sum);
	root.on("click", ".sr-tbl .all", function () {
		const $r = $(this).closest("tr");
		const l = S.lines[parseInt($r.get(0).dataset.i, 10)];
		$r.find(".r-pcs").val(l.held_pcs || "");
		$r.find(".r-ct").val(flt(l.held_ct).toFixed(3));
		sum();
	});

	function loadCard(code) {
		frappe.call({ method: API + ".get_stone_return_card", args: { barcode: code } })
			.then((r) => {
				const m = r.message || {};
				S.card = m.bag || null;
				S.lines = m.lines || [];
				paintCard();
			});
	}
	if (scan.$input) scan.$input.on("keydown", (e) => {
		if (e.key !== "Enter") return;
		const code = (scan.get_value() || "").trim();
		if (code) loadCard(code);
		scan.set_value("");
	});

	root.on("click", ".sr-go", function () {
		const by = emp.get_value();
		if (!by) return frappe.msgprint(__("Pick who is returning these stones."));
		const ls = collect();
		if (!ls.length) return frappe.msgprint(__("Enter a Qty + Carat on at least one line."));
		const bad = ls.find((x) => !x.pcs || !x.ct);
		if (bad) return frappe.msgprint(__("{0}: enter both a Qty (pcs) and a Carat weight.", [bad.item]));
		frappe.confirm(
			__("Return <b>{0} pcs · {1} ct</b> from <b>{2}</b> to Stone Issue?",
				[ls.reduce((a, x) => a + x.pcs, 0), ls.reduce((a, x) => a + x.ct, 0).toFixed(3), S.card.name]),
			() => {
				frappe.dom.freeze(__("Returning…"));
				frappe.call({ method: API + ".stone_return_apply",
					args: { order_bag: S.card.name, lines: JSON.stringify(ls), returned_by: by } })
					.then(() => {
						frappe.dom.unfreeze();
						frappe.show_alert({ message: __("Back in Stone Issue — {0} updated.", [S.card.name]), indicator: "green" }, 5);
						loadCard(S.card.name);   // repaint with what is left
						loadDay();
					}).catch(() => frappe.dom.unfreeze());
			});
	});

	// stale numbers on revisit are worse than none
	frappe.pages["stone-return"].on_page_show = function () { loadDay(); };
};
