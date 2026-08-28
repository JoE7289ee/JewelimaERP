// Recover Findings (Stock > Findings) — the way back. Gold standing in a
// location becomes findings again on the shelf: 20 g of 18KPG sitting in
// Production turns into Bombay screws back in Gold Issue, which is the only
// place a finding exists as itself.
// Route: /app/recover-findings
frappe.pages["recover-findings"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Recover Findings"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const S = { locations: [], picked: null, shelf: "" };

	$(page.main).append(`
		<style>
		#page-recover-findings .container{max-width:100%;}
		.rf-cols{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;}
		.rf-left{flex:1 1 460px;min-width:400px;}
		.rf-right{flex:0 0 380px;}
		.rf-card{border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);padding:14px 16px;margin-bottom:14px;}
		.rf-card .h{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);}
		.rf-card .sub{font-size:11.5px;color:var(--text-muted);margin-bottom:10px;}
		.rf-loc{font-size:14px;font-weight:800;margin-bottom:8px;}
		.rf-row{display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center;
			padding:7px 9px;border:1px solid var(--border-color);border-radius:9px;margin-bottom:6px;cursor:pointer;}
		.rf-row:hover{border-color:#1f618d;background:var(--control-bg);}
		.rf-row.on{border-color:#1f618d;box-shadow:0 0 0 1px #1f618d inset;}
		/* tint each line with the gold it holds — the karat code carries the
		   colour (18KYG / 18KPG / 18KWG). Kept faint so the selected-row outline
		   still reads on top of it, and set in rgba so it survives dark mode. */
		.rf-row.c-y{background:rgba(214,163,26,.10);border-color:rgba(214,163,26,.45);}
		.rf-row.c-p{background:rgba(214,116,116,.10);border-color:rgba(214,116,116,.45);}
		.rf-row.c-w{background:rgba(150,160,170,.12);border-color:rgba(150,160,170,.5);}
		.rf-row.c-y .rf-dot{background:#d6a31a;}
		.rf-row.c-p .rf-dot{background:#d67474;}
		.rf-row.c-w .rf-dot{background:#96a0aa;}
		.rf-dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;
			vertical-align:middle;background:var(--text-muted);}
		.rf-gold{font-weight:800;}
		.rf-qty{font-variant-numeric:tabular-nums;font-weight:700;}
		.rf-can{font-size:10.5px;color:var(--text-muted);}
		.rf-form label{display:block;font-size:10.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin:10px 0 3px;}
		.rf-form input,.rf-form select{width:100%;box-sizing:border-box;border:1px solid var(--border-color);
			border-radius:8px;padding:8px 10px;font-size:13px;background:var(--fg-color);color:var(--text-color);}
		.rf-go{border:none;color:#fff;font-weight:800;padding:11px;border-radius:9px;cursor:pointer;
			background:#1f618d;margin-top:14px;width:100%;font-size:14px;}
		.rf-go:disabled{background:var(--control-bg);color:var(--text-muted);cursor:not-allowed;}
		.rf-flow{margin-top:10px;padding:9px 12px;border-radius:9px;background:#eef5fa;border:1px solid #1f618d33;
			font-size:12.5px;color:#1f618d;}
		.rf-msg{display:none;margin-top:10px;padding:8px 12px;border-radius:8px;font-size:13px;}
		.rf-msg.ok{display:block;background:#eaf6ec;color:#1d7a33;border:1px solid #bfe3c6;}
		.rf-msg.err{display:block;background:#fbeaea;color:#b00020;border:1px solid #e6b3b3;}
		.rf-none{padding:34px;text-align:center;color:var(--text-muted);}
		</style>
		<div class="rf-cols">
			<div class="rf-left">
				<div class="rf-card"><div class="h">${__("Gold standing out there")}</div>
					<div class="sub">${__("karat gold in a location that could come back as findings — pick a line")}</div>
					<div class="rf-list"></div>
				</div>
			</div>
			<div class="rf-right"><div class="rf-card rf-form">
				<div class="h">${__("Take it back")}</div>
				<div class="sub rf-picked">${__("nothing picked yet")}</div>
				<label>${__("Recover as")}</label><select class="rf-item"></select>
				<label>${__("Weight (g)")}</label><input type="number" step="0.001" min="0" class="rf-w">
				<label>${__("Remarks")}</label><input type="text" class="rf-r">
				<div class="rf-flow"></div>
				<button class="rf-go" disabled>${__("Recover")}</button>
				<div class="rf-msg"></div>
			</div></div>
		</div>`);
	const root = $(page.main);

	// 18KYG -> yellow, 18KPG -> pink, 18KWG -> white. Anything else stays neutral.
	function goldClass(gold) {
		const m = /^\d{2}K([YPW])G$/.exec(String(gold || "").toUpperCase());
		return m ? "c-" + m[1].toLowerCase() : "";
	}

	function paint() {
		root.find(".rf-list").html(S.locations.length ? S.locations.map((L) => `
			<div class="rf-loc">${esc(L.label)}</div>
			${L.rows.map((r) => `
				<div class="rf-row ${goldClass(r.gold)}" data-wh="${esc(L.warehouse)}" data-gold="${esc(r.gold)}">
					<div><span class="rf-dot"></span><span class="rf-gold">${esc(r.gold)}</span>
						<div class="rf-can">${__("can come back as")} ${r.can_become.map((c) => esc(c.item)).slice(0, 4).join(", ")}${r.can_become.length > 4 ? "…" : ""}</div></div>
					<span class="rf-qty">${r.qty.toFixed(3)} g</span>
					<span style="color:var(--text-muted);font-size:11px;">${__("standing")}</span>
				</div>`).join("")}`).join("")
			: `<div class="rf-none">${__("No karat gold is standing in any location right now.")}</div>`);
	}

	function pick(wh, gold) {
		const L = S.locations.find((x) => x.warehouse === wh);
		const row = L && L.rows.find((r) => r.gold === gold);
		if (!row) return;
		S.picked = { wh, gold, qty: row.qty, options: row.can_become, label: L.label };
		root.find(".rf-row").removeClass("on")
			.filter(`[data-wh="${wh}"][data-gold="${gold}"]`).addClass("on");
		root.find(".rf-picked").html(__("<b>{0} g</b> of <b>{1}</b> in {2}", [row.qty.toFixed(3), esc(gold), esc(L.label)]));
		root.find(".rf-item").html(row.can_become.map((c) =>
			`<option value="${esc(c.item)}" data-colour="${esc(c.colour || "")}">${esc(c.item)} — ${esc(c.name)}</option>`).join(""));
		root.find(".rf-w").val(row.qty.toFixed(3)).attr("max", row.qty);
		root.find(".rf-go").prop("disabled", false);
		flow();
	}
	function flow() {
		if (!S.picked) return;
		const it = root.find(".rf-item").val();
		root.find(".rf-flow").html(__("<b>{0}</b> leaves {1} and comes back as <b>{2}</b> on the Gold Issue shelf.",
			[esc(S.picked.gold), esc(S.picked.label), esc(it || "—")]));
	}

	function load() {
		frappe.call({ method: API + ".get_recoverable_gold", freeze: false }).then((r) => {
			const m = r.message || {};
			S.locations = m.locations || [];
			S.shelf = m.shelf || "";
			S.picked = null;
			root.find(".rf-go").prop("disabled", true);
			root.find(".rf-picked").text(__("nothing picked yet"));
			root.find(".rf-item").html("");
			root.find(".rf-flow").html("");
			paint();
		});
	}
	root.on("click", ".rf-row", function () { pick($(this).data("wh"), $(this).data("gold")); });
	root.on("change", ".rf-item", flow);
	root.on("click", ".rf-go", function () {
		if (!S.picked) return;
		const w = parseFloat(root.find(".rf-w").val());
		const $msg = root.find(".rf-msg").removeClass("ok err");
		if (!w || w <= 0) return $msg.addClass("err").text(__("Enter the weight coming back."));
		if (w > S.picked.qty + 0.0005)
			return $msg.addClass("err").html(__("Only {0} g is standing there.", [S.picked.qty.toFixed(3)]));
		const $opt = root.find(".rf-item option:selected");
		$(this).prop("disabled", true);
		frappe.call({ method: API + ".recover_finding", args: {
			item: root.find(".rf-item").val(), weight: w, from_location: S.picked.wh,
			colour: $opt.data("colour") || null, remarks: root.find(".rf-r").val() || null,
		} }).then((r) => {
			const m = r.message || {};
			$msg.addClass("ok").html(__("{0} g back as <b>{1}</b> on the shelf.", [m.weight, esc(m.finding)]));
			frappe.show_alert({ message: __("{0} → {1}", [esc(m.gold_item), esc(m.finding)]), indicator: "green" }, 4);
			root.find(".rf-w, .rf-r").val("");
			load();
		}).always(() => root.find(".rf-go").prop("disabled", false));
	});
	page.add_inner_button(__("Issue"), () => frappe.set_route("issue-findings"));
	page.add_inner_button(__("Stock"), () => frappe.set_route("findings-stock"));
	page.add_inner_button(__("History"), () => frappe.set_route("findings-history"));
	frappe.pages["recover-findings"].on_page_show = load;
	load();
};
