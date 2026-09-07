// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Card Info (Info) — the read-only card view.
//
// Card Lookup answers everything about a card, which is what the floor needs when
// something has gone wrong: where it travelled, who worked on it, what was
// issued, the material change trail. Most people looking a card up are not
// investigating — they want to know where it is, whose it is, and what it
// weighs right now. That is this page, and nothing else.
//
// Deliberately absent: Where it travelled, Who worked on it, issue details, the
// material history and the costing. They are not hidden — they are on Card Lookup,
// which the managers hold.
// Route: /app/card-info

frappe.pages["card-info"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Card Info"), single_column: true });
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const g = (v) => flt(v).toFixed(3);
	const root = $(page.main);

	root.append(`
		<style>
		#page-card-info .container{max-width:100%;}
		.cl-bar{display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:16px;
			border:1px solid var(--border-color);border-radius:13px;padding:13px 16px;background:var(--fg-color);}
		.cl-bar label{display:block;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;
			color:var(--text-muted);margin-bottom:3px;}
		.cl-bar input{border:2px solid var(--primary);border-radius:8px;height:36px;width:260px;
			padding:2px 12px;font-size:15px;font-weight:600;background:var(--control-bg);color:var(--text-color);}
		.cl-msg{margin:6px 0 12px;font-size:13px;font-weight:600;min-height:18px;color:#b02a2a;}

		/* the answer to "where is it" is the biggest thing on the page */
		.cl-head{display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap;
			border:1px solid var(--border-color);border-radius:13px;padding:16px 18px;
			background:var(--fg-color);margin-bottom:14px;}
		.cl-id{flex:1 1 240px;min-width:0;}
		.cl-code{font-size:23px;font-weight:800;line-height:1.15;word-break:break-all;}
		.cl-design{font-size:13px;color:var(--text-muted);margin-top:2px;}
		.cl-badge{display:inline-block;margin-top:8px;border-radius:9px;padding:2px 10px;
			font-size:10.5px;font-weight:800;letter-spacing:.04em;}
		.cl-badge.pre{background:rgba(128,128,128,.16);color:var(--text-muted);}
		.cl-badge.wip{background:rgba(31,97,141,.14);color:#1f618d;}
		.cl-badge.prod{background:rgba(29,122,51,.15);color:#1d7a33;}
		[data-theme="dark"] .cl-badge.wip{color:#7FB3DA;}
		[data-theme="dark"] .cl-badge.prod{color:#6fbf7f;}
		.cl-where{text-align:right;min-width:170px;}
		.cl-where .k{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);}
		.cl-where .v{font-size:26px;font-weight:800;line-height:1.2;color:#1f618d;}
		[data-theme="dark"] .cl-where .v{color:#7FB3DA;}
		.cl-where .s{font-size:11.5px;color:var(--text-muted);}
		.cl-photo img{max-height:84px;border-radius:9px;border:1px solid var(--border-color);cursor:zoom-in;}

		.cl-sec{border:1px solid var(--border-color);border-left:3px solid var(--border-color);
			border-radius:11px;background:var(--fg-color);padding:12px 15px;margin-bottom:12px;}
		.cl-sec h4{margin:0 0 8px;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;
			color:var(--text-muted);font-weight:700;}
		.cl-sec.gold{border-left-color:#b7791f;} .cl-sec.gold h4{color:#b7791f;}
		.cl-sec.blue{border-left-color:#1f618d;} .cl-sec.blue h4{color:#1f618d;}
		[data-theme="dark"] .cl-sec.gold h4{color:#d2a43f;}
		[data-theme="dark"] .cl-sec.blue h4{color:#7FB3DA;}
		/* label above value, so a long party name never collides with the next pair */
		.cl-kvs{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:11px 16px;}
		.cl-kv .k{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.05em;
			color:var(--text-muted);}
		.cl-kv .v{font-size:14px;font-weight:600;word-break:break-word;}
		.cl-kv a{color:#1f618d;cursor:pointer;font-weight:700;}
		[data-theme="dark"] .cl-kv a{color:#7FB3DA;}
		.cl-line{font-size:13.5px;line-height:1.9;}
		.cl-line b{font-variant-numeric:tabular-nums;}
		.cl-empty{color:var(--text-muted);font-size:13px;}
		.cl-lightbox{position:fixed;inset:0;background:rgba(0,0,0,.8);display:flex;
			align-items:center;justify-content:center;z-index:1000;cursor:zoom-out;}
		.cl-lightbox img{max-width:92vw;max-height:92vh;}
		</style>
		<div class="cl-bar">
			<div><label>${__("Scan or type a card")}</label>
				<input type="text" class="cl-scan" placeholder="${__("E7559.1.1")}"></div>
		</div>
		<div class="cl-msg"></div>
		<div class="cl-out"></div>
	`);

	const $scan = root.find(".cl-scan");
	const $out = root.find(".cl-out");
	const focusScan = () => setTimeout(() => $scan.trigger("focus"), 30);
	const msg = (h) => root.find(".cl-msg").html(h || "");

	const kv = (k, v) => (v == null || v === ""
		? "" : `<div class="cl-kv"><span class="k">${k}</span><span class="v">${esc("" + v)}</span></div>`);
	const dt = (v) => (v ? frappe.datetime.str_to_user(v) : "");

	// the same weight line Card Info prints, so a weight read here and a weight
	// read there are the same number in the same order
	function weights(b) {
		const p = [];
		if (flt(b.act_gross_weight)) p.push(`${__("Gross")} <b>${g(b.act_gross_weight)}</b> g`);
		if (flt(b.act_nett_weight)) p.push(`${__("Nett")} <b>${g(b.act_nett_weight)}</b> g`);
		if (flt(b.act_pure_weight)) p.push(`${__("Pure")} <b>${g(b.act_pure_weight)}</b> g`);
		if (flt(b.act_purity)) p.push(`<b>${flt(b.act_purity).toFixed(1)}%</b>`);
		[["DMD", "dmd"], ["PS", "ps"], ["CS", "cs"], ["CZ", "cz"],
		 ["CVD", "cvd"], ["SW", "sw"], ["PDMD", "pdmd"], ["POTH", "poth"]].forEach(([lb, k]) => {
			const no = b["act_" + k + "_no"], w = b["act_" + k + "_weight"];
			if (no || flt(w)) p.push(`${lb} <b>${no || 0}</b>/<b>${g(w)}</b> ct`);
		});
		return p.join(" &middot; ");
	}

	function render(d) {
		const b = d.bag || {};
		const act = weights(b);
		const contents = (((d.contents || {}).items) || [])
			.map((m) => `${esc(m.item)} <b>${m.pcs ? m.pcs + " / " : ""}${m.qty} ${esc(m.uom || "")}</b>`)
			.join(" &middot; ");
		const ex = d.extras || {};

		const chips = [];
		if (b.huid) chips.push(`${__("HUID")} <b>${esc(b.huid)}</b>`);
		if (b.certifications) chips.push(`${__("Certs")} <b>${esc(b.certifications)}</b>`);
		if ((ex.charge_categories || []).length)
			chips.push(`${__("Tags")} <b>${ex.charge_categories.map(esc).join(", ")}</b>`);

		const state = b.is_finished
			? ["prod", __("PRODUCT — {0}", [b.stock_status || __("In Stock")])]
			: flt(b.act_gross_weight) ? ["wip", __("IN PRODUCTION")] : ["pre", __("IN PREPRODUCTION")];

		$out.html(`
			<div class="cl-head">
				<div class="cl-id">
					<div class="cl-code">${esc(b.name)}</div>
					<div class="cl-design">${esc(b.design || "")}${
						b.design_type ? " &middot; " + esc(b.design_type) : ""}</div>
					<span class="cl-badge ${state[0]}">${state[1]}</span>
				</div>
				${b.image ? `<div class="cl-photo"><img class="cl-img" src="${encodeURI(b.image)}"
					onerror="this.style.display='none'"></div>` : ""}
				<div class="cl-where">
					<div class="k">${__("Where it is now")}</div>
					<div class="v">${esc(b.location || "—")}</div>
					${b.stock_status ? `<div class="s">${esc(b.stock_status)}</div>` : ""}
				</div>
			</div>

			<div class="cl-sec"><h4>${__("Order")}</h4><div class="cl-kvs">
				${kv(__("Party"), b.customer || b.held_by)}
				${kv(__("Salesman"), b.salesman)}
				${kv(__("Type"), b.order_type)}
				${kv(__("Qty"), b.qty)}
				${kv(__("Size"), b.size)}
				${kv(__("Ordered"), dt(b.order_date))}
				${kv(__("Due"), dt(b.due_date))}
				${kv(__("Party Date"), dt(b.customer_date))}
				${b.job_order ? `<div class="cl-kv"><span class="k">${__("Job Order")}</span>
					<span class="v"><a class="cl-jo" data-jo="${esc(b.job_order)}">${esc(b.job_order)}</a></span></div>` : ""}
				${kv(__("Tree"), b.tree)}
				${kv(__("Held By"), b.held_by)}
			</div></div>

			<div class="cl-sec gold"><h4>${__("Actual weight now")}</h4>
				<div class="cl-line">${act || `<span class="cl-empty">${
					__("No actual weight recorded yet.")}</span>`}</div></div>

			<div class="cl-sec gold"><h4>${__("Contents")}</h4>
				<div class="cl-line">${contents || `<span class="cl-empty">${b.is_finished
					// a finished piece holds nothing: its gold and stones were converted
					// INTO the product, and the weights above are what it is made of.
					// "Empty" beside a 4.5 g gross reads as a fault, so say why.
					? __("Made into the product — the weights above are what it holds.")
					: __("Nothing issued into this card yet.")}</span>`}</div></div>

			${chips.length ? `<div class="cl-sec blue"><h4>${__("Identity")}</h4>
				<div class="cl-line">${chips.join(" &middot; ")}</div></div>` : ""}

			${b.narration ? `<div class="cl-sec"><h4>${__("Remark")}</h4>
				<div class="cl-line">${esc(b.narration)}</div></div>` : ""}
		`);
	}

	function load(code) {
		code = (code || "").trim().toUpperCase();
		if (!code) return;
		// a bare number is an E-card: 114.1.1 and 0114.1.1 both mean E0114.1.1
		if (/^\d/.test(code)) {
			const p = code.split(".");
			if (p[0] && /^\d+$/.test(p[0])) code = "E" + p[0].padStart(4, "0") + (p.length > 1 ? "." + p.slice(1).join(".") : "");
		}
		msg("");
		return jewelima.busyCall($out, __("Loading the card…"), {
			method: "jewelima.jewelima.api.get_card_passport", args: { order_bag: code },
		}).then((r) => {
			const d = r.message;
			if (!d || !d.bag) {
				$out.empty();
				msg(__("No card <b>{0}</b>.", [esc(code)]));
				return;
			}
			render(d);
		}).always(focusScan);
	}

	$scan.on("keydown", (e) => {
		if (e.which !== 13 && e.key !== "Enter") return;
		e.preventDefault();
		const v = $scan.val();
		$scan.val("");
		load(v);
	});
	$out.on("click", ".cl-jo", function () {
		frappe.route_options = { job_order: $(this).data("jo") };
		frappe.set_route("job-order-status");
	});
	$out.on("click", ".cl-img", function () {
		const lb = $(`<div class="cl-lightbox"><img src="${this.getAttribute("src")}"></div>`);
		lb.on("click", () => lb.remove());
		$(document.body).append(lb);
	});

	// arriving from another page with a card already in hand
	if (frappe.route_options && frappe.route_options.order_bag) {
		const c = frappe.route_options.order_bag;
		frappe.route_options = null;
		load(c);
	}
	focusScan();
	frappe.pages["card-info"].on_page_show = focusScan;
};
