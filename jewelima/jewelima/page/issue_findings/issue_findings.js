// Issue Findings (Stock > Findings) — a finding leaves the shelf and becomes
// gold in the same movement: onto a CARD (the card's own materials carry it
// from then on) or into a LOCATION. Findings only exist as findings in Gold
// Issue; the moment they are issued they are karat gold.
// Route: /app/issue-findings
frappe.pages["issue-findings"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Issue Findings"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const S = { stock: [], picked: null, target: "Card" };

	$(page.main).append(`
		<style>
		#page-issue-findings .container{max-width:100%;}
		.if-cols{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;}
		.if-left{flex:0 0 420px;}
		.if-right{flex:1 1 480px;min-width:420px;}
		.if-card{border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);padding:14px 16px;}
		.if-card .h{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px;}
		.if-card label{display:block;font-size:10.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin:10px 0 3px;}
		.if-card input,.if-card select{width:100%;box-sizing:border-box;border:1px solid var(--border-color);
			border-radius:8px;padding:7px 10px;font-size:13px;background:var(--fg-color);color:var(--text-color);}
		.if-tabs{display:flex;gap:6px;margin-bottom:4px;}
		.if-tab{flex:1;text-align:center;border:1px solid var(--border-color);border-radius:8px;padding:7px;
			font-size:12.5px;font-weight:700;cursor:pointer;color:var(--text-muted);background:var(--fg-color);}
		.if-tab.on{background:var(--btn-primary,#171717);border-color:var(--btn-primary,#171717);color:#fff;}
		.if-go{border:none;color:#fff;font-weight:800;padding:11px;border-radius:9px;cursor:pointer;
			background:#2e7d32;margin-top:14px;width:100%;font-size:14px;}
		.if-go:disabled{background:var(--control-bg);color:var(--text-muted);cursor:not-allowed;}
		.if-becomes{margin-top:10px;padding:9px 12px;border-radius:9px;background:#eef5fa;border:1px solid #1f618d33;
			font-size:12.5px;color:#1f618d;}
		.if-becomes b{font-size:14px;}
		.if-shelf{border:1px solid var(--border-color);border-radius:12px;overflow:auto;background:var(--fg-color);max-height:calc(100vh - 250px);}
		table.if-t{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.if-t th{position:sticky;top:0;background:var(--control-bg);font-size:10px;text-transform:uppercase;
			color:var(--text-muted);padding:6px 10px;text-align:left;border-bottom:2px solid var(--border-color);}
		table.if-t td{padding:6px 10px;border-bottom:1px solid var(--border-color);cursor:pointer;}
		table.if-t tr:hover td{background:var(--control-bg);}
		table.if-t tr.on td{background:#eef5fa;}
		table.if-t td.num{text-align:right;font-variant-numeric:tabular-nums;}
		.if-empty{color:var(--text-muted);}
		.if-grp{font-size:10px;color:var(--text-muted);}
		.if-msg{display:none;margin-top:10px;padding:8px 12px;border-radius:8px;font-size:13px;}
		.if-msg.ok{display:block;background:#eaf6ec;color:#1d7a33;border:1px solid #bfe3c6;}
		.if-msg.err{display:block;background:#fbeaea;color:#b00020;border:1px solid #e6b3b3;}
		</style>
		<div class="if-cols">
			<div class="if-left"><div class="if-card">
				<div class="h">${__("Issue a finding")}</div>
				<div class="if-tabs">
					<div class="if-tab on" data-t="Card">${__("To a card")}</div>
					<div class="if-tab" data-t="Location">${__("To a location")}</div>
				</div>
				<label>${__("Finding")}</label><div class="if-item"></div>
				<div class="if-colour-wrap" style="display:none;">
					<label>${__("Becomes which gold")}</label>
					<select class="if-colour">
						<option value="Y">${__("Yellow")}</option>
						<option value="P">${__("Pink")}</option>
						<option value="W">${__("White")}</option>
					</select>
				</div>
				<label>${__("Weight (g)")}</label><input type="number" step="0.001" min="0" class="if-w">
				<label>${__("Pieces (optional)")}</label><input type="number" step="1" min="0" class="if-p">
				<div class="if-to-card">
					<label>${__("Card")}</label><div class="if-bag"></div>
				</div>
				<div class="if-to-loc" style="display:none;">
					<label>${__("Location")}</label><div class="if-loc"></div>
				</div>
				<label>${__("Remarks")}</label><input type="text" class="if-r">
				<div class="if-becomes" style="display:none;"></div>
				<button class="if-go">${__("Issue")}</button>
				<div class="if-msg"></div>
			</div></div>
			<div class="if-right">
				<div class="if-card" style="padding:0;overflow:hidden;">
					<div style="padding:12px 16px 8px;"><span class="h" style="margin:0;">${__("On the shelf")}</span>
						<span class="if-grp if-wh" style="margin-left:6px;"></span></div>
					<div class="if-shelf"><table class="if-t"><thead><tr>
						<th>${__("Finding")}</th><th class="num">${__("Weight (g)")}</th><th class="num">${__("Pure (g)")}</th>
					</tr></thead><tbody class="if-body"></tbody></table></div>
				</div>
			</div>
		</div>`);
	const root = $(page.main);

	const mk = (sel, df) => {
		const c = frappe.ui.form.make_control({ df, parent: root.find(sel).get(0), render_input: true });
		c.refresh();
		return c;
	};
	const fItem = mk(".if-item", { fieldtype: "Link", fieldname: "item", options: "Item",
		placeholder: __("pick a finding"), only_select: 1,
		get_query: () => ({ filters: { item_group: ["like", "%Findings"] } }) });
	const fBag = mk(".if-bag", { fieldtype: "Link", fieldname: "bag", options: "Order Bag",
		placeholder: __("scan or pick the card") });
	const fLoc = mk(".if-loc", { fieldtype: "Link", fieldname: "loc", options: "Warehouse",
		placeholder: __("where the gold lands"), get_query: () => ({ filters: { is_group: 0 } }) });

	function becomes() {
		const it = fItem.get_value();
		const row = S.stock.find((r) => r.item === it);
		const common = row && /Common Findings$/.test(row.group);
		root.find(".if-colour-wrap").toggle(!!common);
		if (!it) { root.find(".if-becomes").hide(); return; }
		const m = /^(\d{2})\s*K([YWP])G Findings$/.exec((row && row.group) || "");
		const gold = m ? `${m[1]}K${m[2]}G`
			: common ? `${(row.group.match(/^(\d{2})/) || [])[1]}K${root.find(".if-colour").val()}G` : "";
		root.find(".if-becomes").toggle(!!gold).html(gold
			? __("Issuing turns this into <b>{0}</b> — the finding stops existing.", [esc(gold)]) : "");
	}

	function paintShelf() {
		root.find(".if-wh").text(S.warehouse ? __("in {0}", [S.warehouse.replace(" - JD", "")]) : "");
		root.find(".if-body").html(S.stock.map((r) => `
			<tr class="${S.picked === r.item ? "on" : ""}" data-i="${esc(r.item)}">
				<td><b>${esc(r.item)}</b><div class="if-grp">${esc(r.name)} · ${esc(r.group)}</div></td>
				<td class="num ${r.weight ? "" : "if-empty"}">${r.weight ? r.weight.toFixed(3) : "—"}</td>
				<td class="num ${r.weight ? "" : "if-empty"}">${r.weight ? r.pure.toFixed(3) : "—"}</td>
			</tr>`).join(""));
	}

	function load() {
		frappe.call({ method: API + ".get_findings_stock", freeze: false }).then((r) => {
			const m = r.message || {};
			S.stock = m.rows || [];
			S.warehouse = m.warehouse || "";
			paintShelf();
		});
	}

	root.on("click", ".if-t tbody tr", function () {
		S.picked = $(this).data("i");
		fItem.set_value(S.picked);
		paintShelf();
		setTimeout(becomes, 150);
		root.find(".if-w").focus();
	});
	root.on("click", ".if-tab", function () {
		root.find(".if-tab").removeClass("on");
		this.classList.add("on");
		S.target = this.dataset.t;
		root.find(".if-to-card").toggle(S.target === "Card");
		root.find(".if-to-loc").toggle(S.target === "Location");
	});
	fItem.$input.on("change awesomplete-selectcomplete", () => setTimeout(becomes, 120));
	root.on("change", ".if-colour", becomes);

	function setMsg(kind, html) { root.find(".if-msg").removeClass("ok err").addClass(kind).html(html); }

	root.on("click", ".if-go", function () {
		const item = fItem.get_value();
		const w = parseFloat(root.find(".if-w").val());
		if (!item) return setMsg("err", __("Pick the finding."));
		if (!w || w <= 0) return setMsg("err", __("Enter the weight going out."));
		const args = { item, weight: w, target_type: S.target,
			pcs: parseInt(root.find(".if-p").val(), 10) || 0,
			remarks: root.find(".if-r").val() || null };
		if (S.target === "Card") {
			if (!fBag.get_value()) return setMsg("err", __("Scan the card it goes onto."));
			args.order_bag = fBag.get_value();
		} else {
			if (!fLoc.get_value()) return setMsg("err", __("Pick where the gold lands."));
			args.location = fLoc.get_value();
		}
		if (root.find(".if-colour-wrap").is(":visible")) args.colour = root.find(".if-colour").val();
		$(this).prop("disabled", true);
		frappe.call({ method: API + ".issue_finding", args })
			.then((r) => {
				const m = r.message || {};
				setMsg("ok", __("{0} g issued — now <b>{1}</b> on {2}.", [m.weight, esc(m.gold_item), esc(m.to)]));
				frappe.show_alert({ message: __("{0} → {1}", [esc(item), esc(m.gold_item)]), indicator: "green" }, 4);
				root.find(".if-w, .if-p, .if-r").val("");
				fBag.set_value("");
				load();
			})
			.always(() => root.find(".if-go").prop("disabled", false));
	});

	page.add_inner_button(__("History"), () => frappe.set_route("findings-history"));
	page.add_inner_button(__("Stock"), () => frappe.set_route("findings-stock"));
	frappe.pages["issue-findings"].on_page_show = load;
	load();
};
