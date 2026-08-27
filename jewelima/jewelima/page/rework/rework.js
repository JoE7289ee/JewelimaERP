// Rework (Delivery) — a finished piece goes back to the floor. Scan it, pick the
// workstation, send it. The weight it was frozen with leaves Finished Goods and
// returns to the In Bags pool, the card holds its materials again and queues at
// that bench as work. Its design, HUID and certificates travel with it.
// Route: /app/rework
frappe.pages["rework"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Rework"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const S = { piece: null, sent: [] };
	const BENCHES = ["ORDERING", "CAD", "CAM", "WAXING", "TREE MAKING", "CASTING", "GRINDING",
		"FILING", "SETTING", "PRE POLISH", "WAX SETTING", "FINAL POLISH", "WAX CLEANING", "BAG EXTRACTION"];

	$(page.main).append(`
		<style>
		#page-rework .container{max-width:100%;}
		.rw-top{display:grid;grid-template-columns:1.4fr 1fr;gap:12px;align-items:end;margin-bottom:12px;}
		.rw-top .control-label{font-size:11px;color:var(--text-muted);}
		.rw-top .help-box{display:none !important;}
		.rw-msg{display:none;margin-bottom:12px;padding:9px 13px;border-radius:8px;font-size:13px;}
		.rw-msg.ok{display:block;background:#eaf6ec;color:#1d7a33;border:1px solid #bfe3c6;}
		.rw-msg.err{display:block;background:#fbeaea;color:#b00020;border:1px solid #e6b3b3;}
		.rw-msg.warn{display:block;background:#fdf3e3;color:#9a6700;border:1px solid #f0d9a8;}
		.rw-cols{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;}
		.rw-card{border:1px solid var(--border-color);border-radius:13px;background:var(--fg-color);padding:15px 17px;flex:1 1 420px;min-width:360px;}
		.rw-card .h{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px;}
		.rw-no{font-size:19px;font-weight:800;font-family:var(--font-family-monospace,monospace);}
		.rw-kv{display:grid;grid-template-columns:auto 1fr;gap:3px 12px;font-size:12.5px;margin-top:8px;}
		.rw-kv .k{color:var(--text-muted);}
		.rw-mat{margin-top:12px;border-top:1px dashed var(--border-color);padding-top:9px;}
		.rw-mat .row{display:flex;justify-content:space-between;font-size:12px;padding:2px 0;}
		.rw-flow{margin-top:12px;padding:10px 13px;border-radius:9px;background:#eef5fa;border:1px solid #1f618d33;font-size:12.5px;color:#1f618d;}
		.rw-go{border:none;color:#fff;font-weight:800;padding:12px;border-radius:9px;cursor:pointer;
			background:#b8860b;margin-top:14px;width:100%;font-size:14px;}
		.rw-go:disabled{background:var(--control-bg);color:var(--text-muted);cursor:not-allowed;}
		.rw-sent{border:1px solid var(--border-color);border-radius:13px;background:var(--fg-color);flex:0 0 320px;overflow:hidden;}
		.rw-sent .h{padding:12px 15px 6px;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);}
		.rw-sent .row{display:flex;justify-content:space-between;gap:8px;padding:7px 15px;border-top:1px solid var(--border-color);font-size:12.5px;}
		.rw-sent .row b{font-family:var(--font-family-monospace,monospace);}
		.rw-none{padding:26px;text-align:center;color:var(--text-muted);font-size:12.5px;}
		</style>
		<div class="rw-top">
			<div class="rw-scan"></div>
			<div class="rw-to"></div>
		</div>
		<div class="rw-msg"></div>
		<div class="rw-cols">
			<div class="rw-card rw-piece"><div class="rw-none">${__("Scan a finished product to send it back to the floor.")}</div></div>
			<div class="rw-sent"><div class="h">${__("Sent back this session")}</div><div class="rw-list">
				<div class="rw-none">${__("nothing yet")}</div></div></div>
		</div>`);
	const root = $(page.main);
	const mk = (sel, df) => {
		const c = frappe.ui.form.make_control({ df, parent: root.find(sel).get(0), render_input: true });
		c.refresh();
		return c;
	};
	const fScan = mk(".rw-scan", { fieldtype: "Data", label: __("Scan finished product"),
		fieldname: "scan", description: __("only a finished piece In Stock can go back") });
	const fTo = mk(".rw-to", { fieldtype: "Select", label: __("Send it to"), fieldname: "to",
		options: BENCHES.join("\n") });
	fTo.set_value("SETTING");   // the usual reason a piece comes back
	const focusScan = () => setTimeout(() => fScan.$input.focus(), 30);

	function msg(kind, html) { root.find(".rw-msg").removeClass("ok err warn").addClass(kind).html(html); }

	function paint() {
		const p = S.piece;
		if (!p) {
			root.find(".rw-piece").html(`<div class="rw-none">${__("Scan a finished product to send it back to the floor.")}</div>`);
			return;
		}
		root.find(".rw-piece").html(`
			<div class="h">${__("The piece")}</div>
			<div class="rw-no">${esc(p.order_bag)}</div>
			<div class="rw-kv">
				<span class="k">${__("Design")}</span><span>${esc(p.design)} ${p.design_type ? "· " + esc(p.design_type) : ""}</span>
				<span class="k">${__("Held by")}</span><span>${esc(p.held_by || "—")}</span>
				${p.huid ? `<span class="k">${__("HUID")}</span><span>${esc(p.huid)}</span>` : ""}
				${p.certifications ? `<span class="k">${__("Certificates")}</span><span>${esc(p.certifications)}</span>` : ""}
				<span class="k">${__("Gross")}</span><span>${(p.gross || 0).toFixed(3)} g</span>
				<span class="k">${__("In stock since")}</span><span>${esc(p.in_stock_on || "—")}</span>
			</div>
			<div class="rw-mat"><div class="h" style="margin:0 0 5px;">${__("What comes back")}</div>
				${(p.materials || []).map((m) => `<div class="row"><span>${esc(m.item)}</span><b>${m.qty.toFixed(3)}</b></div>`).join("")}
				<div class="row" style="border-top:1px solid var(--border-color);margin-top:4px;padding-top:5px;">
					<span>${__("gold {0} g · stones {1}", [(p.gold || 0).toFixed(3), (p.stones || 0).toFixed(3)])}</span></div>
			</div>
			${p.can_rework ? `<div class="rw-flow">${__("Its weight leaves <b>Finished Goods</b>, returns to <b>In Bags</b>, and the card queues at <b>{0}</b> as work again.", [esc(fTo.get_value() || "—")])}</div>
				<button class="rw-go">${__("Send back to {0}", [esc(fTo.get_value() || "—")])}</button>`
			: `<div class="rw-flow" style="background:#fbeaea;border-color:#e6b3b3;color:#b00020;">${esc(p.error || "")}</div>`}`);
	}

	function lookup(code) {
		frappe.call({ method: API + ".get_rework_piece", args: { barcode: code } }).then((r) => {
			const p = r.message || {};
			if (!p.found) { S.piece = null; paint(); msg("err", esc(p.error || __("Not found."))); focusScan(); return; }
			S.piece = p;
			paint();
			if (!p.can_rework) msg("err", esc(p.error));
			else if (p.open_sale_prep) msg("warn", __("Careful — {0} is on an open sale preparation ({1}). Sending it back will pull it out of that sale.", [esc(p.order_bag), esc(p.open_sale_prep)]));
			else msg("ok", __("<b>{0}</b> is ready to go back.", [esc(p.order_bag)]));
		});
	}

	fScan.$input.on("keydown", (e) => {
		if (e.which !== 13 && e.key !== "Enter") return;
		e.preventDefault();
		const code = (fScan.$input.val() || "").trim();
		fScan.set_value("");
		if (code) lookup(code);
	});
	fTo.$input.on("change", paint);

	root.on("click", ".rw-go", function () {
		const p = S.piece;
		const to = fTo.get_value();
		if (!p || !to) return;
		frappe.confirm(__("Send <b>{0}</b> back to <b>{1}</b>?<br><br>{2} g of gold and {3} of stones leave Finished Goods and the piece stops being stock.",
			[esc(p.order_bag), esc(to), (p.gold || 0).toFixed(3), (p.stones || 0).toFixed(3)]), () => {
			frappe.dom.freeze(__("Sending back…"));
			frappe.call({ method: API + ".rework_piece",
				args: { order_bag: p.order_bag, to_location: to, remarks: null } })
				.then((r) => {
					frappe.dom.unfreeze();
					const m = r.message || {};
					S.sent.unshift({ bag: m.order_bag, to: m.to, gold: m.gold });
					S.piece = null;
					paint();
					root.find(".rw-list").html(S.sent.map((x) => `
						<div class="row"><b>${esc(x.bag)}</b><span>→ ${esc(x.to)} · ${(x.gold || 0).toFixed(3)} g</span></div>`).join(""));
					msg("ok", __("<b>{0}</b> is back on the floor at <b>{1}</b>.", [esc(m.order_bag), esc(m.to)]));
					frappe.show_alert({ message: __("{0} → {1}", [esc(m.order_bag), esc(m.to)]), indicator: "green" }, 5);
					focusScan();
				})
				.catch(() => frappe.dom.unfreeze());
		});
	});

	frappe.pages["rework"].on_page_show = focusScan;
	focusScan();
};
