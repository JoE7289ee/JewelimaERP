// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Design Info — the Design's full passport, read only: the bank card's photo /
// info-card / customer / raw images, identity, the frozen BOM, derived totals,
// every sibling variant with its own facts (click to switch), and the design's
// production footprint (bags by lifecycle). Card numbers jump to Card Info.
// Route: /app/design-info  (route_options: {design})

frappe.pages["design-info"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Design Info", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;

	$(page.main).append(`
		<style>
		.di-top{max-width:360px;margin-bottom:14px;}
		.di-cols{display:flex;gap:22px;align-items:flex-start;flex-wrap:wrap;}
		.di-img{flex:0 0 320px;}
		.di-img img{width:100%;border:1px solid var(--border-color);border-radius:10px;background:#fff;}
		.di-img .none{height:320px;display:flex;align-items:center;justify-content:center;color:#bbb;border:1px dashed var(--border-color);border-radius:10px;}
		.di-main{flex:1;min-width:420px;}
		.di-name{font-size:22px;font-weight:800;font-family:var(--font-family-monospace,monospace);display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
		.di-st{border-radius:9px;padding:2px 10px;font-size:11px;font-weight:800;color:#fff;background:#2e7d32;}
		.di-st.retired{background:#b02a2a;}
		.di-sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin:16px 0 6px;}
		.di-facts{display:flex;gap:12px;flex-wrap:wrap;}
		.di-tile{border:1px solid var(--border-color);border-radius:9px;padding:7px 16px;background:var(--control-bg);}
		.di-tile .k{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;}
		.di-tile .v{font-size:16px;font-weight:800;}
		table.di-t{width:100%;max-width:760px;border-collapse:collapse;font-size:12.5px;background:var(--fg-color);}
		table.di-t th{background:var(--control-bg);font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);padding:5px 10px;border:1px solid var(--border-color);text-align:left;}
		table.di-t td{border:1px solid var(--border-color);padding:5px 10px;}
		.di-chip{font-family:var(--font-family-monospace,monospace);font-weight:700;font-size:12px;border:1px solid var(--border-color);border-radius:6px;padding:2px 9px;cursor:pointer;background:var(--control-bg);display:inline-block;}
		.di-chip.me{background:#1f618d;border-color:#1f618d;color:#fff;cursor:default;}
		.di-chip.retired{opacity:.5;text-decoration:line-through;}
		.di-none{padding:34px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:10px;max-width:760px;}
		.di-gal{display:flex;gap:8px;flex-wrap:wrap;}
		.di-shot{flex:0 0 152px;}
		.di-shot img{width:152px;height:152px;object-fit:cover;border:1px solid var(--border-color);border-radius:9px;background:#fff;cursor:zoom-in;}
		.di-shot .cap{font-size:10px;color:var(--text-muted);text-align:center;margin-top:3px;text-transform:uppercase;letter-spacing:.05em;}
		.di-bstat{display:inline-block;border-radius:9px;padding:1px 9px;font-size:11px;font-weight:800;margin:0 6px 6px 0;}
		.di-bstat.ip{background:#fdf3d0;color:#8a6d00;}
		.di-bstat.is{background:#dcefe0;color:#1d7a33;}
		.di-bstat.so{background:#e3e7f5;color:#333d8f;}
		.di-bstat.cn{background:#f5dddd;color:#b02a2a;}
		.di-lightbox{position:fixed;inset:0;background:rgba(0,0,0,.82);display:flex;align-items:center;justify-content:center;z-index:9999;cursor:zoom-out;}
		.di-lightbox img{max-width:92vw;max-height:92vh;border-radius:8px;background:#fff;}
		table.di-t tr.di-sib{transition:background .1s;}
		table.di-t tr.di-sib:hover td{background:var(--control-bg);}
		.di-shot img{transition:transform .12s;}
		.di-shot img:hover{transform:scale(1.03);}
		</style>
		<div class="di-top"><div class="di-scan" style="margin-bottom:8px;"></div></div>
		<div class="di-body"><div class="di-none">${__("Scan a card or pick a design.")}</div></div>
	`);
	const root = $(page.main);
	// scan a card -> jump straight to its linked design
	const fScan = frappe.ui.form.make_control({
		df: { fieldtype: "Data", label: __("Scan a card"), fieldname: "scan",
			description: __("Scan / type an Order Bag — its design opens below.") },
		parent: root.find(".di-scan").get(0), render_input: true });
	fScan.refresh();
	const fPick = frappe.ui.form.make_control({
		df: { fieldtype: "Link", label: __("Design"), fieldname: "design", options: "Design", only_select: 1 },
		parent: root.find(".di-top").get(0), render_input: true });
	fPick.refresh();

	function openFromCard(code) {
		code = (code || "").trim();
		if (!code) return;
		frappe.db.get_value("Order Bag", code, "design").then((r) => {
			const design = r && r.message && r.message.design;
			if (!design) {
				frappe.show_alert({ message: __("No card <b>{0}</b>, or it has no design yet.", [frappe.utils.escape_html(code)]), indicator: "orange" }, 5);
				return;
			}
			fPick.set_value(design);
			load(design);
		});
	}
	fScan.$input.on("keydown", (e) => {
		if (e.which === 13 || e.key === "Enter") {
			e.preventDefault();
			const code = fScan.get_value();
			fScan.set_value("");
			openFromCard(code);
		}
	});

	function paint(D) {
		const SCLASS = { "In Production": "ip", "In Stock": "is", "Sold": "so", "Cancelled": "cn", "At Certification": "is" };
		const bagChips = (D.bags || []).map((b) =>
			`<a class="jw-card-link di-chip" data-card="${esc(b.name)}">${esc(b.name)}${b.location ? `<span style="font-family:var(--font-family);font-weight:600;color:var(--text-muted);"> · ${esc(b.location)}</span>` : ""}</a>`).join(" ");
		const sibRows = (D.siblings || []).map((s) => `<tr class="${s.name === D.name ? "" : "di-sib"}" ${s.name === D.name ? "" : `data-design="${esc(s.name)}" style="cursor:pointer;"`}>
				<td><b style="font-family:var(--font-family-monospace,monospace);">${esc(s.name)}</b>${s.name === D.name ? ` <span style="color:#1f618d;font-weight:700;">${__("(this)")}</span>` : ""}</td>
				<td>${esc(s.design_type || "")}</td>
				<td><span class="di-bstat ${s.status === "Retired" ? "cn" : "is"}">${esc((s.status || "").toUpperCase())}</span></td>
				<td>${s.metal_g} g</td><td>${s.stone_ct ? s.stone_ct + " ct" : ""}</td><td>${s.bags || 0}</td>
			</tr>`).join("");
		const counts = Object.entries(D.counts || {}).map(([k, v]) =>
			`<div class="di-tile"><div class="k">${esc(k.replace("_no", "").toUpperCase())}</div><div class="v">${v}</div></div>`).join("");
		const statusChips = Object.entries(D.by_status || {}).map(([k, v]) =>
			`<span class="di-bstat ${SCLASS[k] || "ip"}">${esc(k)}: ${v}</span>`).join("");
		// gallery: bank card images first (photo/info/customer/raw); fall back to the design's own image
		const imgs = (D.bank && D.bank.images && D.bank.images.length) ? D.bank.images
			: (D.image ? [{ label: __("Design"), src: D.image }] : []);
		const gallery = imgs.length
			? `<div class="di-gal">${imgs.map((im) => `<div class="di-shot"><img src="${esc(im.src)}" data-full="${esc(im.src)}"><div class="cap">${esc(im.label)}</div></div>`).join("")}</div>`
			: `<div class="di-img"><div class="none">${__("no photo")}</div></div>`;
		const bk = D.bank;
		root.find(".di-body").html(`
			<div class="di-name">${esc(D.name)}
				<span class="di-st ${D.status === "Retired" ? "retired" : ""}">${esc((D.status || "").toUpperCase())}</span>
				${D.variant_count > 1 ? `<span style="font-size:12px;font-weight:600;color:var(--text-muted);">${__("1 of {0} variants", [D.variant_count])}</span>` : ""}</div>
			<div style="font-size:13px;color:var(--text-muted);margin:4px 0 14px;">
				${esc(D.design_type)}${D.design_style ? " · " + esc(D.design_style) : ""}
				${bk ? " · " + __("bank card") + " <b>" + esc(bk.design_no) + "</b>" : ""}</div>

			${gallery}

			<div class="di-sec">${__("Totals")}</div>
			<div class="di-facts">
				<div class="di-tile"><div class="k">${__("Metal")}</div><div class="v">${D.metal_g} g</div></div>
				<div class="di-tile"><div class="k">${__("Purity")}</div><div class="v">${D.purity_pct}%</div></div>
				${D.stone_ct ? `<div class="di-tile"><div class="k">${__("Stones")}</div><div class="v">${D.stone_ct} ct</div></div>` : ""}
				${counts}
			</div>

			${bk ? `<div class="di-sec">${__("Bank card")}</div>
			<div class="di-facts" style="margin-bottom:6px;">
				<div class="di-tile"><div class="k">${__("Card no")}</div><div class="v" style="font-size:14px;">${esc(bk.design_no)}</div></div>
				<div class="di-tile"><div class="k">${__("Status")}</div><div class="v" style="font-size:14px;">${esc(bk.status || "")}</div></div>
				${bk.gross_weight ? `<div class="di-tile"><div class="k">${__("Card gross")}</div><div class="v" style="font-size:14px;">${bk.gross_weight} g</div></div>` : ""}
				${bk.diamond_weight ? `<div class="di-tile"><div class="k">${__("Card DMD")}</div><div class="v" style="font-size:14px;">${bk.diamond_weight} ct</div></div>` : ""}
				${bk.provider ? `<div class="di-tile"><div class="k">${__("Provider")}</div><div class="v" style="font-size:13px;">${esc(bk.provider)}${bk.provider_piece_code ? " · " + esc(bk.provider_piece_code) : ""}</div></div>` : ""}
			</div>
			${bk.note ? `<div style="font-size:12.5px;color:var(--text-muted);max-width:760px;">${esc(bk.note)}</div>` : ""}
			${(bk.stones || []).length ? `<table class="di-t" style="max-width:520px;margin-top:8px;"><thead><tr>
				<th>${__("Card stone")}</th><th>${__("Sieve")}</th><th>${__("Pcs")}</th><th>${__("Ct")}</th></tr></thead><tbody>
				${bk.stones.map((st) => `<tr><td><b>${esc(st.stone || "")}</b></td><td>${esc(st.sieve || "")}</td><td>${st.pcs || ""}</td><td>${st.ct || ""}</td></tr>`).join("")}
			</tbody></table>` : ""}` : ""}

			<div class="di-sec">${__("Bill of Materials — frozen at creation")}</div>
			<table class="di-t"><thead><tr>
				<th>${__("Material")}</th><th>${__("Purity %")}</th><th>${__("UOM")}</th>
				<th>${__("Qty")}</th><th>${__("Weight")}</th><th>${__("Pure (g)")}</th>
			</tr></thead><tbody>
			${(D.materials || []).map((m) => `<tr>
				<td><b>${esc(m.item)}</b></td>
				<td>${m.purity || ""}</td><td>${esc(m.uom)}</td>
				<td>${m.stone_type ? m.qty : ""}</td><td>${m.weight}</td>
				<td>${m.stone_type ? "" : m.pure}</td>
			</tr>`).join("")}</tbody></table>

			${sibRows ? `<div class="di-sec">${__("Variants of this card")} <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--text-muted);">· ${__("click a row to open it")}</span></div>
			<table class="di-t"><thead><tr>
				<th>${__("Variant")}</th><th>${__("Type")}</th><th>${__("Status")}</th><th>${__("Metal")}</th><th>${__("Stones")}</th><th>${__("Bags")}</th>
			</tr></thead><tbody>${sibRows}</tbody></table>` : ""}

			<div class="di-sec">${__("In manufacturing")}</div>
			${statusChips ? `<div style="margin-bottom:8px;">${statusChips}</div>` : ""}
			<div style="font-size:13px;">
				${D.bags_total ? __("{0} bag(s) run this design", [D.bags_total]) + (bagChips ? " — " + bagChips : "") : __("No bags yet.")}
			</div>`);
	}

	function load(name) {
		if (!name) return;
		frappe.call({ method: API + ".get_design_info", args: { design: name } }).then((r) => {
			if (r.message) paint(r.message);
		});
	}
	fPick.$input.on("change awesomplete-selectcomplete", () => setTimeout(() => {
		const v = fPick.get_value();
		if (v) load(v);
	}, 100));
	root.on("click", ".di-sib", function () {
		const nm = $(this).data("design");
		fPick.set_value(nm);
		load(nm);
	});
	// click any card image -> full-screen lightbox
	root.on("click", ".di-shot img", function () {
		const full = this.getAttribute("data-full");
		const lb = $(`<div class="di-lightbox"><img src="${esc(full)}"></div>`);
		lb.on("click", () => lb.remove());
		$(document.body).append(lb);
	});

	if (frappe.route_options && (frappe.route_options.design || frappe.route_options.order_bag)) {
		const pre = frappe.route_options.design;
		const card = frappe.route_options.order_bag;
		frappe.route_options = null;
		if (pre) { fPick.set_value(pre); load(pre); }
		else if (card) { openFromCard(card); }
	} else {
		setTimeout(() => fScan.$input.focus(), 250);
	}
};
