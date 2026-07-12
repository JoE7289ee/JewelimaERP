// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Transfer Holder (Delivery) — move a piece's reservation to another party.
// Scan cards -> they stack in the left table (current holder, in stock since,
// weights); pick the new holder on top; Transfer moves them all, one Holder
// Transfer record per piece. Bottom strip totals gross / pure / stone buckets.
// Route: /app/transfer-holder

frappe.pages["transfer-holder"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Transfer Holder", single_column: true });
	const API = "jewelima.jewelima.api";
	const S = { rows: [] };
	const esc = frappe.utils.escape_html;
	const fmt = (v) => flt(v).toFixed(3);
	const BUCKETS = [["dmd", "DMD"], ["ps", "PS"], ["cs", "CS"], ["cvd", "CVD"], ["pdmd", "PDMD"], ["poth", "POTH"]];

	$(page.main).append(`
		<style>
		.th-top{display:flex;align-items:flex-end;gap:12px;margin:2px 0 10px;flex-wrap:wrap;}
		.th-top .frappe-control{margin:0;}
		.th-top .control-label{font-size:11px;margin:0 0 1px;color:var(--text-muted);}
		.th-top .help-box,.th-top .description{display:none !important;}
		.th-scan{width:230px;}
		.th-holder{width:260px;}
		.th-reason{width:260px;}
		.th-wrap{display:grid;grid-template-columns:3fr 1fr;gap:14px;align-items:start;}
		.th-pane{border:1px solid var(--border-color);border-radius:8px;background:var(--fg-color);display:flex;flex-direction:column;min-height:0;}
		.th-body{max-height:calc(100vh - 300px);overflow:auto;}
		table.th-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:12.5px;}
		table.th-tbl th{position:sticky;top:0;z-index:1;background:var(--control-bg,var(--fg-color));border-bottom:1px solid var(--gray-400,#aeb6bf);padding:4px 8px;text-align:left;white-space:nowrap;font-weight:700;}
		table.th-tbl td{border-bottom:1px solid var(--border-color);padding:4px 8px;white-space:nowrap;font-variant-numeric:tabular-nums;}
		table.th-tbl td.r,table.th-tbl th.r{text-align:right;}
		.th-bar{font-weight:700;}
		.th-sub{color:var(--text-muted);font-size:11px;}
		.th-days{display:inline-block;border-radius:8px;background:var(--control-bg);padding:0 7px;font-size:10.5px;font-weight:700;color:var(--text-muted);margin-left:6px;}
		.th-x{border:none;background:none;color:var(--text-muted);cursor:pointer;font-size:14px;}
		.th-x:hover{color:#b02a2a;}
		.th-totals{border-top:2px solid var(--gray-400,#aeb6bf);padding:8px 12px;display:flex;gap:18px;flex-wrap:wrap;font-size:12px;background:var(--control-bg,var(--fg-color));border-radius:0 0 8px 8px;}
		.th-totals b{font-variant-numeric:tabular-nums;}
		.th-tot-main{font-size:13px;}
		.th-empty{padding:22px;text-align:center;color:var(--text-muted);}
		.th-feed{padding:8px 10px;max-height:calc(100vh - 240px);overflow:auto;}
		.th-feed .t{font-weight:800;font-size:12.5px;margin:2px 0 8px;}
		.th-ft{border-bottom:1px solid var(--border-color);padding:5px 0;font-size:11.5px;}
		.th-ft .who{font-weight:700;}
		.th-msg{display:none;margin:0 0 8px;padding:6px 11px;border-radius:7px;font-size:12.5px;}
		.th-msg.err{display:block;background:#fbeaea;color:#b00020;border:1px solid #e6b3b3;}
		</style>
		<div class="th-top">
			<div class="th-scan"></div>
			<div class="th-holder"></div>
			<div class="th-reason"></div>
			<span style="margin-left:auto;"></span>
			<button class="btn btn-primary th-go">${__("Transfer")}</button>
		</div>
		<div class="th-msg"></div>
		<div class="th-wrap">
			<div class="th-pane">
				<div class="th-body"><table class="th-tbl">
					<thead><tr><th>${__("Card")}</th><th>${__("Design")}</th><th>${__("Held By (now)")}</th>
					<th>${__("In Stock Since")}</th><th class="r">${__("Gross g")}</th><th class="r">${__("Pure g")}</th><th style="width:34px"></th></tr></thead>
					<tbody class="th-rows"></tbody></table></div>
				<div class="th-totals"></div>
			</div>
			<div class="th-pane"><div class="th-feed"><div class="t">${__("Recent holder moves")}</div><div class="th-feeditems"></div></div></div>
		</div>
	`);
	const root = $(page.main)[0];
	const $msg = $(root).find(".th-msg");

	const mk = (sel, df) => {
		const c = frappe.ui.form.make_control({ df, parent: $(root).find(sel).get(0), render_input: true });
		c.refresh();
		return c;
	};
	const scan = mk(".th-scan", { fieldtype: "Data", label: __("Scan card"), fieldname: "scan", placeholder: __("Scan barcode…") });
	const holder = mk(".th-holder", { fieldtype: "Link", label: __("New Holder"), fieldname: "holder", options: "Customer",
		description: "" });
	const reason = mk(".th-reason", { fieldtype: "Data", label: __("Reason"), fieldname: "reason", placeholder: __("e.g. sale delayed — moving to …") });
	const focusScan = () => setTimeout(() => scan.$input.focus(), 30);

	function setMsg(t) {
		$msg.removeClass("err").html("");
		if (t) $msg.addClass("err").html(esc(t));
	}

	function daysSince(dt) {
		if (!dt) return "";
		const d = frappe.datetime.get_day_diff(frappe.datetime.get_today(), dt.split(" ")[0]);
		return `<span class="th-days">${d} ${__("d")}</span>`;
	}

	function paint() {
		const $b = $(root).find(".th-rows");
		$b.html(S.rows.length ? S.rows.map((r) => `
			<tr>
				<td><span class="th-bar">${esc(r.order_bag)}</span></td>
				<td>${esc(r.design)}<div class="th-sub">${esc(r.design_type)}</div></td>
				<td>${esc(r.held_by || "—")}</td>
				<td>${r.in_stock_on ? frappe.datetime.str_to_user(r.in_stock_on) : "—"}${daysSince(r.in_stock_on)}</td>
				<td class="r">${fmt(r.gross)}</td>
				<td class="r">${fmt(r.pure)}</td>
				<td><button class="th-x" data-bag="${esc(r.order_bag)}">✕</button></td>
			</tr>`).join("")
			: `<tr><td colspan="7" class="th-empty">${__("Scan pieces to move their reservation.")}</td></tr>`);
		const tot = { gross: 0, pure: 0 };
		BUCKETS.forEach(([k]) => (tot[k] = 0));
		S.rows.forEach((r) => {
			tot.gross += r.gross;
			tot.pure += r.pure;
			BUCKETS.forEach(([k]) => (tot[k] += flt((r.buckets || {})[k])));
		});
		$(root).find(".th-totals").html(`
			<span class="th-tot-main">${S.rows.length} ${__("piece(s)")}</span>
			<span class="th-tot-main">${__("Gross")} <b>${fmt(tot.gross)} g</b></span>
			<span class="th-tot-main">${__("Pure")} <b>${fmt(tot.pure)} g</b></span>
			${BUCKETS.map(([k, lb]) => tot[k] > 0.0005 ? `<span>${lb} <b>${fmt(tot[k])} ct</b></span>` : "").join("")}`);
	}

	function loadFeed() {
		frappe.call({ method: API + ".get_recent_holder_transfers" }).then((r) => {
			const rows = r.message || [];
			$(root).find(".th-feeditems").html(rows.length ? rows.map((t) => `
				<div class="th-ft"><span class="th-bar">${esc(t.order_bag)}</span>
					<span class="who">${esc(t.from_holder || "—")} → ${esc(t.to_holder)}</span>
					<div class="th-sub">${frappe.datetime.str_to_user(t.transfer_time)}${t.reason ? " · " + esc(t.reason) : ""}</div></div>`).join("")
				: `<div class="th-sub">${__("No holder moves yet.")}</div>`);
		});
	}

	scan.$input.on("keydown", (e) => {
		if (e.key !== "Enter") return;
		const code = (scan.get_value() || "").trim();
		scan.set_value("");
		if (!code) return;
		if (S.rows.some((r) => r.order_bag === code)) {
			setMsg(__("{0} is already on the list.", [code]));
			focusScan();
			return;
		}
		frappe.call({ method: API + ".get_holder_piece", args: { barcode: code } })
			.then((r) => {
				setMsg("");
				S.rows.push(r.message);
				paint();
				focusScan();
			})
			.catch(() => focusScan());
	});
	$(root).on("click", ".th-x", function () {
		S.rows = S.rows.filter((r) => r.order_bag !== this.getAttribute("data-bag"));
		paint();
		focusScan();
	});

	$(root).find(".th-go").on("click", () => {
		const to = holder.get_value();
		if (!S.rows.length) {
			setMsg(__("Scan at least one piece."));
			return;
		}
		if (!to) {
			setMsg(__("Pick the new holder (JD Stock = release to our shelf)."));
			return;
		}
		frappe.confirm(__("Move {0} piece(s) to {1}?", [S.rows.length, esc(to)]), () => {
			frappe.dom.freeze(__("Transferring..."));
			frappe.call({
				method: API + ".transfer_holder",
				args: { bags: S.rows.map((r) => r.order_bag), to_customer: to, reason: reason.get_value() },
			}).then((r) => {
				frappe.dom.unfreeze();
				frappe.show_alert({ message: __("{0} piece(s) now held by {1}.", [(r.message || {}).count, esc(to)]), indicator: "green" }, 6);
				S.rows = [];
				paint();
				loadFeed();
				focusScan();
			}).catch(() => frappe.dom.unfreeze());
		});
	});

	page.add_inner_button(__("Refresh"), loadFeed);
	paint();
	loadFeed();
	focusScan();
};
