// Card Gold (Stock > Card Gold) — put gold onto a card, or take it back off.
// The card's materials live in the In Bags pool, so adding is Casting or
// Production -> In Bags and reducing is the exact reverse. A sold, cancelled
// or finished card is a closed book and is refused at the scan.
// Route: /app/card-gold
frappe.pages["card-gold"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Card Gold"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const g = (v) => flt(v).toFixed(3) + " g";
	const S = { card: null, side: "add", wh: null, item: null };

	$(page.main).append(`
		<style>
		#page-card-gold .container{max-width:100%;}
		.cg-wrap{max-width:1120px;}
		.cg-scan{display:flex;gap:10px;align-items:center;margin-bottom:14px;}
		.cg-scan input{flex:0 0 300px;border:1px solid var(--border-color);border-radius:9px;
			padding:9px 13px;font-size:14px;background:var(--fg-color);color:var(--text-color);}
		.cg-scan input:focus{outline:none;border-color:#1f618d;box-shadow:0 0 0 3px #1f618d22;}
		.cg-msg{font-size:12.5px;padding:6px 12px;border-radius:8px;display:none;}
		.cg-msg.on{display:inline-block;}
		.cg-msg.err{background:#fbeaea;color:#b00020;border:1px solid #e6b3b3;}
		.cg-msg.ok{background:#eaf6ec;color:#1d7a33;border:1px solid #bfe3c6;}

		.cg-cols{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;}
		.cg-left{flex:1 1 460px;min-width:380px;}
		.cg-right{flex:0 0 400px;}
		.cg-card{border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);
			padding:15px 17px;margin-bottom:14px;}
		.cg-card .h{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;
			color:var(--text-muted);margin-bottom:9px;}

		.cg-id{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:4px;}
		.cg-id b{font-size:19px;letter-spacing:.02em;}
		.cg-id .d{color:var(--text-muted);font-size:13px;}
		.cg-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;}
		.cg-chip{font-size:11px;padding:2px 9px;border-radius:999px;background:var(--control-bg);
			color:var(--text-muted);border:1px solid var(--border-color);}
		.cg-chip.ok{background:#eaf6ec;color:#1d7a33;border-color:#bfe3c6;}

		.cg-holds{display:flex;gap:18px;flex-wrap:wrap;margin-top:12px;}
		.cg-hold{min-width:120px;}
		.cg-hold .k{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);}
		.cg-hold .v{font-size:21px;font-weight:800;font-variant-numeric:tabular-nums;}

		.cg-seg{display:inline-flex;border:1px solid var(--border-color);border-radius:9px;overflow:hidden;}
		.cg-seg button{border:none;background:var(--fg-color);color:var(--text-muted);padding:8px 20px;
			font-size:13px;font-weight:700;cursor:pointer;}
		.cg-seg button.on{color:#fff;}
		.cg-seg button.on[data-s="add"]{background:#1d7a33;}
		.cg-seg button.on[data-s="reduce"]{background:#b02a2a;}

		.cg-form label{display:block;font-size:10.5px;color:var(--text-muted);text-transform:uppercase;
			letter-spacing:.05em;margin:12px 0 4px;}
		.cg-form select,.cg-form input{width:100%;box-sizing:border-box;border:1px solid var(--border-color);
			border-radius:8px;padding:9px 11px;font-size:13px;background:var(--fg-color);color:var(--text-color);}
		.cg-form input.w{font-size:17px;font-weight:700;font-variant-numeric:tabular-nums;}
		.cg-avail{font-size:11.5px;color:var(--text-muted);margin-top:4px;}
		.cg-go{border:none;color:#fff;font-weight:800;padding:12px;border-radius:9px;cursor:pointer;
			margin-top:16px;width:100%;font-size:14.5px;}
		.cg-go.add{background:#1d7a33;} .cg-go.reduce{background:#b02a2a;}
		.cg-go:disabled{background:var(--control-bg);color:var(--text-muted);cursor:not-allowed;}
		.cg-flow{margin-top:11px;padding:9px 12px;border-radius:9px;background:var(--control-bg);
			font-size:12.5px;color:var(--text-muted);}

		table.cg-t{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.cg-t th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;
			color:var(--text-muted);border-bottom:1px solid var(--border-color);padding:7px 8px;font-weight:700;}
		table.cg-t td{padding:7px 8px;border-bottom:1px solid var(--border-color);}
		table.cg-t td.num{text-align:right;font-variant-numeric:tabular-nums;font-weight:700;}
		.cg-add{color:#1d7a33;} .cg-red{color:#b02a2a;}
		.cg-none{padding:26px;text-align:center;color:var(--text-muted);font-size:12.5px;}
		.cg-empty{padding:44px;text-align:center;color:var(--text-muted);}
		</style>
		<div class="cg-wrap">
			<div class="cg-scan">
				<input class="cg-in" placeholder="${__("Scan or type a card")}" autocomplete="off">
				<span class="cg-msg"></span>
			</div>
			<div class="cg-body"></div>
		</div>`);
	const root = $(page.main);
	const $in = root.find(".cg-in");
	const $msg = root.find(".cg-msg");

	function say(text, kind) {
		$msg.removeClass("ok err on");
		if (text) $msg.addClass("on " + (kind || "err")).html(text);
	}
	const focus = () => setTimeout(() => $in.trigger("focus").select(), 30);

	function paint() {
		const C = S.card;
		if (!C) {
			root.find(".cg-body").html(`<div class="cg-card cg-empty">${
				__("Scan a card to add gold to it or take gold off it.")}</div>`);
			return;
		}
		const b = C.bag;
		root.find(".cg-body").html(`
			<div class="cg-cols">
				<div class="cg-left">
					<div class="cg-card">
						<div class="cg-id"><b>${esc(b.name)}</b>
							<span class="d">${esc(b.design || "—")}</span></div>
						<div class="cg-chips">
							<span class="cg-chip ok">${__("In bags")}</span>
							<span class="cg-chip">${esc(b.location || "—")}</span>
							<span class="cg-chip">${__("qty")} ${b.qty || 1}</span>
						</div>
						<div class="cg-holds">
							<div class="cg-hold"><div class="k">${__("Gold on this card")}</div>
								<div class="v">${g(C.gold)}</div></div>
							${(C.held || []).map((h) => `<div class="cg-hold">
								<div class="k">${esc(h.item_name)}</div>
								<div class="v" style="font-size:16px;">${g(h.qty)}</div></div>`).join("")}
						</div>
					</div>
					<div class="cg-card">
						<div class="h">${__("This card's add / reduce trail")}</div>
						<div class="cg-hist"></div>
					</div>
				</div>
				<div class="cg-right"><div class="cg-card cg-form">
					<div class="cg-seg">
						<button data-s="add" class="${S.side === "add" ? "on" : ""}">${__("Add gold")}</button>
						<button data-s="reduce" class="${S.side === "reduce" ? "on" : ""}">${__("Reduce gold")}</button>
					</div>
					<label>${S.side === "add" ? __("Take it from") : __("Send it to")}</label>
					<select class="cg-wh">${(C.warehouses || []).map((w) =>
						`<option value="${esc(w)}"${S.wh === w ? " selected" : ""}>${esc(w)}</option>`).join("")}</select>
					<label>${__("Which gold")}</label>
					<select class="cg-item"></select>
					<div class="cg-avail"></div>
					<label>${__("Weight (g)")}</label>
					<input type="number" step="0.001" min="0" class="w cg-w">
					<label>${__("Remarks")}</label>
					<input type="text" class="cg-r">
					<div class="cg-flow"></div>
					<button class="cg-go ${S.side}">${S.side === "add" ? __("Add to card") : __("Take off card")}</button>
				</div></div>
			</div>`);
		fillItems();
		paintHistory();
	}

	// what can move depends on the side: adding draws on the warehouse, reducing
	// can only give back what the card is actually holding
	function fillItems() {
		const C = S.card;
		if (!C) return;
		const wh = root.find(".cg-wh").val() || (C.warehouses || [])[0];
		S.wh = wh;
		const src = S.side === "add" ? (C.stock || {})[wh] || [] : (C.held || []);
		const $it = root.find(".cg-item");
		$it.html(src.length
			? src.map((r) => `<option value="${esc(r.item)}" data-qty="${r.qty}">${
				esc(r.item_name || r.item)} — ${r.qty.toFixed(3)} g</option>`).join("")
			: `<option value="">${S.side === "add"
				? __("no gold in {0}", [wh]) : __("this card holds no gold")}</option>`);
		if (S.item && src.some((r) => r.item === S.item)) $it.val(S.item);
		S.item = $it.val() || null;
		root.find(".cg-go").prop("disabled", !S.item);
		showAvail();
	}
	function showAvail() {
		const $o = root.find(".cg-item option:selected");
		const qty = flt($o.data("qty"));
		root.find(".cg-avail").text(S.item
			? (S.side === "add" ? __("{0} available in {1}", [qty.toFixed(3) + " g", S.wh])
				: __("{0} on this card", [qty.toFixed(3) + " g"]))
			: "");
		root.find(".cg-w").attr("max", qty || null);
		flow();
	}
	function flow() {
		if (!S.card || !S.item) { root.find(".cg-flow").html(""); return; }
		const w = flt(root.find(".cg-w").val());
		const amt = w ? `<b>${w.toFixed(3)} g</b>` : __("gold");
		root.find(".cg-flow").html(S.side === "add"
			? __("{0} leaves <b>{1}</b> and lands on <b>{2}</b> in the bags.", [amt, esc(S.wh), esc(S.card.bag.name)])
			: __("{0} comes off <b>{1}</b> and goes back to <b>{2}</b>.", [amt, esc(S.card.bag.name), esc(S.wh)]));
	}
	function paintHistory() {
		const h = (S.card && S.card.history) || [];
		root.find(".cg-hist").html(h.length ? `
			<table class="cg-t"><thead><tr>
				<th>${__("When")}</th><th>${__("What")}</th><th class="num">${__("Weight")}</th>
				<th>${__("Gold")}</th><th>${__("By")}</th></tr></thead>
			<tbody>${h.map((r) => `<tr>
				<td>${esc(r.when)}</td>
				<td class="${r.kind === "Added" ? "cg-add" : "cg-red"}"><b>${esc(r.kind)}</b></td>
				<td class="num ${r.kind === "Added" ? "cg-add" : "cg-red"}">${
					r.kind === "Added" ? "+" : "−"}${r.qty.toFixed(3)}</td>
				<td>${esc(r.item_name || r.item)}</td>
				<td>${esc(r.who || "")}${r.note ? ` <span style="color:var(--text-muted);">· ${esc(r.note)}</span>` : ""}</td>
			</tr>`).join("")}</tbody></table>`
			: `<div class="cg-none">${__("Nothing has been added to or taken off this card.")}</div>`);
	}

	function load(code) {
		if (!code) return;
		frappe.call({ method: API + ".get_card_gold", args: { order_bag: code }, freeze: false })
			.then((r) => {
				const m = r.message || {};
				if (m.error) { S.card = null; say(esc(m.error), "err"); paint(); return focus(); }
				say("");
				S.card = m; S.wh = (m.warehouses || [])[0]; S.item = null;
				paint(); focus();
			});
	}

	$in.on("keydown", function (e) {
		if (e.key !== "Enter") return;
		const code = (this.value || "").trim();
		this.value = "";
		load(code);
	});
	root.on("click", ".cg-seg button", function () {
		S.side = this.dataset.s; S.item = null;
		paint();
	});
	root.on("change", ".cg-wh", fillItems);
	root.on("change", ".cg-item", function () { S.item = this.value || null; showAvail(); });
	root.on("input", ".cg-w", flow);
	root.on("click", ".cg-go", function () {
		if (!S.card || !S.item) return;
		const w = flt(root.find(".cg-w").val());
		if (!w) return say(__("Enter the weight."), "err");
		const $btn = $(this).prop("disabled", true);
		frappe.call({ method: API + ".adjust_card_gold", args: {
			order_bag: S.card.bag.name, direction: S.side, item: S.item,
			weight: w, warehouse: S.wh, remarks: root.find(".cg-r").val() || null,
		} }).then((r) => {
			const m = r.message || {};
			frappe.show_alert({ indicator: S.side === "add" ? "green" : "orange",
				message: S.side === "add"
					? __("{0} g added — {1} now holds {2} g", [m.weight, m.order_bag, m.gold])
					: __("{0} g taken off — {1} now holds {2} g", [m.weight, m.order_bag, m.gold]) }, 6);
			load(S.card.bag.name);
		}).always(() => $btn.prop("disabled", false));
	});

	page.add_inner_button(__("History"), () => frappe.set_route("card-gold-history"));
	page.add_inner_button(__("Card Info"), () => {
		if (S.card) frappe.set_route("card-info", { card: S.card.bag.name });
		else frappe.set_route("card-info");
	});
	paint();
	focus();
};
