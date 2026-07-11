// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Certification desk (Delivery) — LEFT: finished pieces In Stock, pick + send to
// IGI / HALLMARKING (creates a Certification batch, moves stock Finished Goods →
// At Certification). RIGHT: open batches — receive pieces back one by one with
// their HUID / certificate numbers (stamps the Order Bag, moves stock home).
// Route: /app/certify

frappe.pages["certify"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Certification", single_column: true });
	const API = "jewelima.jewelima.api";
	const S = { pieces: [], batches: [], sel: new Set(), term: "" };
	const esc = frappe.utils.escape_html;
	const fmt = (v) => flt(v).toFixed(3);

	$(page.main).append(`
		<style>
		.ct-wrap{display:grid;grid-template-columns:minmax(0,7fr) minmax(0,5fr);gap:14px;height:calc(100vh - 100px);}
		.ct-pane{display:flex;flex-direction:column;min-height:0;border:1px solid var(--border-color);border-radius:8px;background:var(--fg-color);}
		.ct-pane-h{padding:8px 12px;border-bottom:1px solid var(--border-color);display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
		.ct-pane-h .t{font-weight:800;font-size:13px;margin-right:auto;}
		.ct-body{flex:1 1 auto;overflow:auto;}
		.ct-search{width:200px;border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);padding:3px 9px;height:28px;border-radius:5px;box-sizing:border-box;color:var(--text-color);font-size:12.5px;}
		.ct-ctl select,.ct-ctl input{border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);height:28px;border-radius:5px;padding:2px 8px;font-size:12.5px;color:var(--text-color);box-sizing:border-box;}
		table.ct-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:12.5px;}
		table.ct-tbl th{position:sticky;top:0;z-index:1;background:var(--control-bg,var(--fg-color));border-bottom:1px solid var(--gray-400,#aeb6bf);padding:4px 8px;text-align:left;white-space:nowrap;font-weight:700;}
		table.ct-tbl td{border-bottom:1px solid var(--border-color);padding:4px 8px;white-space:nowrap;font-variant-numeric:tabular-nums;}
		table.ct-tbl td.r,table.ct-tbl th.r{text-align:right;}
		table.ct-tbl tr{cursor:pointer;}
		table.ct-tbl tr.on td{background:#eaf6ec;}
		.ct-bar{font-weight:700;}
		.ct-sub{color:var(--text-muted);font-size:11px;}
		.ct-foot{padding:6px 12px;border-top:1px solid var(--border-color);color:var(--text-muted);font-size:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
		.ct-foot .ct-lab{width:150px;}
		.ct-foot .ct-remarks{flex:1 1 120px;min-width:90px;}
		.ct-foot .ct-send{white-space:nowrap;}
		.ct-batch{border:1px solid var(--border-color);border-radius:8px;margin:10px;overflow:hidden;}
		.ct-batch-h{display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--control-bg,var(--fg-color));border-bottom:1px solid var(--border-color);flex-wrap:wrap;}
		.ct-batch-h .nm{font-weight:800;}
		.ct-type{border-radius:9px;padding:1px 9px;font-size:10.5px;font-weight:800;}
		.ct-type.igi{background:#e7f0fb;color:#1c5da8;}
		.ct-type.hm{background:#fdf3e3;color:#9a6700;}
		.ct-prog{margin-left:auto;font-size:11.5px;color:var(--text-muted);font-weight:700;}
		.ct-rows{width:100%;border-collapse:collapse;font-size:12px;}
		.ct-rows td{border-bottom:1px solid var(--border-color);padding:3px 8px;white-space:nowrap;}
		.ct-rows tr:last-child td{border-bottom:none;}
		.ct-rows tr.done td{color:var(--text-muted);background:var(--control-bg,var(--fg-color));}
		.ct-rows input[type=text]{width:100px;border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);border-radius:4px;height:24px;padding:1px 6px;font-size:11.5px;color:var(--text-color);box-sizing:border-box;}
		.ct-batch-f{padding:6px 10px;border-top:1px solid var(--border-color);display:flex;align-items:center;gap:8px;}
		.ct-empty{padding:20px;text-align:center;color:var(--text-muted);}
		.ct-chip{display:inline-block;border-radius:8px;padding:0 7px;font-size:10px;font-weight:700;}
		.ct-chip.ok{background:#eaf6ec;color:#1d7a33;}
		</style>
		<div class="ct-wrap">
			<div class="ct-pane">
				<div class="ct-pane-h">
					<span class="t">${__("In Stock — pick pieces to send")}</span>
					<input class="ct-search" type="text" placeholder="${__("Search…")}">
				</div>
				<div class="ct-body"><table class="ct-tbl">
					<thead><tr><th style="width:26px"><input type="checkbox" class="ct-all"></th>
					<th>${__("Card")}</th><th>${__("Design")}</th><th>${__("Holder")}</th>
					<th class="r">${__("Gross g")}</th><th class="r">${__("DMD ct")}</th><th>${__("HUID")}</th></tr></thead>
					<tbody class="ct-pieces"></tbody></table></div>
				<div class="ct-foot ct-ctl">
					<span style="white-space:nowrap;"><b class="ct-selcount">0</b> ${__("selected")}</span>
					<select class="ct-type-sel"><option>HALLMARKING</option><option>IGI</option></select>
					<input class="ct-lab" type="text" placeholder="${__("Lab / Centre")}">
					<input class="ct-remarks" type="text" placeholder="${__("Remarks")}">
					<button class="btn btn-primary btn-sm ct-send">${__("Send")}</button>
				</div>
			</div>
			<div class="ct-pane">
				<div class="ct-pane-h"><span class="t">${__("Batches out / recent")}</span></div>
				<div class="ct-body ct-batches"></div>
			</div>
		</div>
	`);
	const root = $(page.main)[0];

	function paintPieces() {
		const term = S.term.toLowerCase().trim();
		const rows = S.pieces.filter((p) => !term ||
			[p.order_bag, p.design, p.design_type, p.held_by].join(" ").toLowerCase().includes(term));
		$(root).find(".ct-pieces").html(rows.length ? rows.map((p) => `
			<tr data-bag="${esc(p.order_bag)}" class="${S.sel.has(p.order_bag) ? "on" : ""}">
				<td><input type="checkbox" ${S.sel.has(p.order_bag) ? "checked" : ""}></td>
				<td><span class="ct-bar">${esc(p.order_bag)}</span></td>
				<td>${esc(p.design)}<div class="ct-sub">${esc(p.design_type)}</div></td>
				<td>${esc(p.held_by)}</td>
				<td class="r">${fmt(p.gross)}</td>
				<td class="r">${p.dmd_ct ? fmt(p.dmd_ct) : "·"}</td>
				<td>${p.huid ? `<span class="ct-chip ok">${esc(p.huid)}</span>` : "·"}</td>
			</tr>`).join("")
			: `<tr><td colspan="7" class="ct-empty">${__("No finished pieces In Stock.")}</td></tr>`);
		$(root).find(".ct-selcount").text(S.sel.size);
	}

	function paintBatches() {
		const $b = $(root).find(".ct-batches");
		if (!S.batches.length) {
			$b.html(`<div class="ct-empty">${__("Nothing out at certification.")}</div>`);
			return;
		}
		$b.html(S.batches.map((b) => {
			const pend = b.items.filter((r) => !r.received);
			return `<div class="ct-batch" data-name="${esc(b.name)}">
				<div class="ct-batch-h">
					<span class="nm">${esc(b.name)}</span>
					<span class="ct-type ${b.certification_type === "IGI" ? "igi" : "hm"}">${esc(b.certification_type)}</span>
					${b.lab ? `<span class="ct-sub">${esc(b.lab)}</span>` : ""}
					<span class="ct-sub">${esc(b.sent_on)}</span>
					<span class="ct-prog">${b.back}/${b.total} ${__("back")}</span>
				</div>
				<table class="ct-rows"><tbody>
					${b.items.map((r) => r.received ? `
						<tr class="done"><td>✓</td><td>${esc(r.order_bag)}</td><td>${esc(r.design_type)}</td>
						<td>${fmt(r.gross)} g</td><td>${r.huid ? "HUID " + esc(r.huid) : ""}${r.huid && r.certificate_no ? " · " : ""}${r.certificate_no ? esc(r.certificate_no) : ""}</td></tr>` : `
						<tr data-row="${esc(r.row)}"><td><input type="checkbox" class="ct-rc" checked></td>
						<td><span class="ct-bar">${esc(r.order_bag)}</span></td><td>${esc(r.design_type)}</td>
						<td>${fmt(r.gross)} g</td>
						<td><input type="text" class="ct-huid" placeholder="HUID" maxlength="12">
						    <input type="text" class="ct-cert" placeholder="${__("Cert No")}"></td></tr>`).join("")}
				</tbody></table>
				${pend.length ? `<div class="ct-batch-f">
					<span class="ct-sub">${__("Tick the pieces that came back, fill their numbers")}</span>
					<button class="btn btn-primary btn-xs ct-receive" style="margin-left:auto;">${__("Receive")}</button>
				</div>` : ""}
			</div>`;
		}).join(""));
	}

	function loadAll() {
		frappe.call({ method: API + ".get_certifiable_pieces" }).then((r) => {
			S.pieces = r.message || [];
			S.sel = new Set([...S.sel].filter((b) => S.pieces.some((p) => p.order_bag === b)));
			paintPieces();
		});
		frappe.call({ method: API + ".get_certification_batches" }).then((r) => {
			S.batches = r.message || [];
			paintBatches();
		});
	}

	// left pane behaviour
	$(root).on("click", ".ct-pieces tr[data-bag]", function (e) {
		const bag = this.getAttribute("data-bag");
		if (e.target.tagName !== "INPUT") {
			/* row click toggles too */
		}
		if (S.sel.has(bag)) S.sel.delete(bag);
		else S.sel.add(bag);
		paintPieces();
	});
	$(root).on("click", ".ct-all", function (e) {
		e.stopPropagation();
		const term = S.term.toLowerCase().trim();
		const vis = S.pieces.filter((p) => !term ||
			[p.order_bag, p.design, p.design_type, p.held_by].join(" ").toLowerCase().includes(term));
		if (this.checked) vis.forEach((p) => S.sel.add(p.order_bag));
		else vis.forEach((p) => S.sel.delete(p.order_bag));
		paintPieces();
	});
	$(root).find(".ct-search").on("input", frappe.utils.debounce(function () {
		S.term = this.value || "";
		paintPieces();
	}, 200));

	$(root).find(".ct-send").on("click", () => {
		if (!S.sel.size) {
			frappe.msgprint(__("Pick at least one piece."));
			return;
		}
		const ctype = $(root).find(".ct-type-sel").val();
		frappe.confirm(__("Send {0} piece(s) to {1}?", [S.sel.size, esc(ctype)]), () => {
			frappe.dom.freeze(__("Sending..."));
			frappe.call({
				method: API + ".send_certification",
				args: { payload: { certification_type: ctype, lab: $(root).find(".ct-lab").val(),
					remarks: $(root).find(".ct-remarks").val(), bags: [...S.sel] } },
			}).then((r) => {
				frappe.dom.unfreeze();
				const m = r.message || {};
				frappe.show_alert({ message: __("{0} sent — {1} piece(s) to {2}.", [m.name, m.count, esc(ctype)]), indicator: "green" }, 6);
				S.sel.clear();
				loadAll();
			}).catch(() => frappe.dom.unfreeze());
		});
	});

	// right pane: receive
	$(root).on("click", ".ct-receive", function () {
		const $batch = $(this).closest(".ct-batch");
		const name = $batch.attr("data-name");
		const rows = [];
		$batch.find("tr[data-row]").each(function () {
			if ($(this).find(".ct-rc").prop("checked")) {
				rows.push({
					row: this.getAttribute("data-row"),
					huid: $(this).find(".ct-huid").val(),
					certificate_no: $(this).find(".ct-cert").val(),
				});
			}
		});
		if (!rows.length) {
			frappe.msgprint(__("Tick at least one piece to receive."));
			return;
		}
		frappe.dom.freeze(__("Receiving..."));
		frappe.call({ method: API + ".receive_certification", args: { name, rows } })
			.then((r) => {
				frappe.dom.unfreeze();
				const m = r.message || {};
				frappe.show_alert({ message: __("{0}: {1} piece(s) received back ({2}).", [name, m.received, m.status]), indicator: "green" }, 6);
				loadAll();
			}).catch(() => frappe.dom.unfreeze());
	});

	page.add_inner_button(__("Refresh"), loadAll);
	loadAll();
};
