// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Repair Intake — repair pieces are logged the moment they land, so nothing
// sits in the shop unbilled and forgotten. One receipt = one packet/lot from
// a party (JD REF# on the packet). Billing pulls open receipts onto a bill
// on the Repair Desk. Route: /app/repair-intake

frappe.pages["repair-intake"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Repair Intake", single_column: true });
	const API = "jewelima.jewelima.repair_api";
	const esc = frappe.utils.escape_html;
	let BOOT = null;   // {parties, item_types, ...}
	let CUR = null;    // receipt name being edited (null = new)
	let LINES = [];    // [{item_type, qty, narration, remarks}]
	let SHOWALL = false;

	$(page.main).append(`
		<style>
		#page-repair-intake .container{max-width:100%;}
		.ri-bar{display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin-bottom:10px;}
		.ri-bar label{display:block;font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px;}
		.ri-bar input,.ri-bar select{border:1px solid var(--border-color);border-radius:8px;padding:7px 10px;font-size:12.5px;background:var(--fg-color);color:var(--text-color);}
		.ri-btn{border:none;color:#fff;font-weight:800;padding:9px 20px;border-radius:8px;cursor:pointer;}
		table.ri-t{width:100%;border-collapse:collapse;font-size:12px;background:var(--fg-color);}
		table.ri-t th{background:var(--control-bg);font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);padding:5px 8px;border:1px solid var(--border-color);text-align:left;}
		table.ri-t td{border:1px solid var(--border-color);padding:3px 6px;}
		table.ri-t td input,table.ri-t td select{width:100%;border:none;background:transparent;color:var(--text-color);font-size:12px;padding:3px 2px;outline:none;}
		.ri-x{color:#b02a2a;font-weight:800;cursor:pointer;padding:0 6px;}
		.ri-h{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);margin:16px 0 7px;}
		tr.ri-r{cursor:pointer;}
		tr.ri-r:hover td{background:var(--control-bg);}
		.ri-chip{display:inline-block;border-radius:10px;padding:1px 9px;font-size:10.5px;font-weight:700;}
		.ri-chip.rec{background:#dcefe0;color:#1d7a33;}
		.ri-chip.bil{background:#e3e7f5;color:#333d8f;}
		</style>
		<div class="ri-bar">
			<span><label>${__("Party")}</label><input list="ri-parties" class="ri-party" style="width:220px;" placeholder="${__("party…")}"><datalist id="ri-parties"></datalist></span>
			<span><label>${__("Received on")}</label><input type="date" class="ri-date"></span>
			<span><label>${__("JD REF#")}</label><input class="ri-ref" style="width:110px;" placeholder="66/7"></span>
			<span><label>${__("Remarks")}</label><input class="ri-rem" style="width:220px;"></span>
			<button class="ri-btn ri-save" style="background:#2e7d32;">${__("Save Receipt")}</button>
			<button class="ri-btn ri-new" style="background:#6b7280;display:none;">${__("+ New")}</button>
		</div>
		<div class="ri-lines"></div>
		<div class="ri-h">${__("Receipts")} <label style="font-weight:400;text-transform:none;letter-spacing:0;cursor:pointer;margin-left:10px;">
			<input type="checkbox" class="ri-all"> ${__("show billed too")}</label></div>
		<div class="ri-list"></div>
	`);
	const root = $(page.main);
	root.find(".ri-date").val(frappe.datetime.get_today());

	function boot() {
		frappe.call({ method: API + ".get_repair_boot" }).then((r) => {
			BOOT = r.message || {};
			root.find("#ri-parties").html((BOOT.parties || [])
				.filter((p) => p.active).map((p) => `<option value="${esc(p.name)}">`).join(""));
			if (!LINES.length) addLine();
			paintLines();
			loadList();
		});
	}

	const typeOpts = (sel) => `<option value=""></option>` + (BOOT.item_types || [])
		.map((t) => `<option ${t.name === sel ? "selected" : ""}>${esc(t.name)}</option>`).join("");

	function addLine() {
		LINES.push({ item_type: "", qty: 1, narration: "", remarks: "" });
	}

	function paintLines() {
		root.find(".ri-lines").html(`
			<table class="ri-t"><thead><tr>
				<th style="width:32px;">#</th><th style="width:220px;">${__("Item type")}</th><th style="width:70px;">${__("Qty")}</th>
				<th>${__("Narration")}</th><th>${__("Remarks")}</th><th style="width:34px;"></th>
			</tr></thead><tbody>
			${LINES.map((l, i) => `<tr>
				<td>${i + 1}</td>
				<td><select class="ri-f" data-i="${i}" data-k="item_type">${typeOpts(l.item_type)}</select></td>
				<td><input type="number" min="1" class="ri-f" data-i="${i}" data-k="qty" value="${l.qty || 1}"></td>
				<td><input class="ri-f" data-i="${i}" data-k="narration" value="${esc(l.narration || "")}"></td>
				<td><input class="ri-f" data-i="${i}" data-k="remarks" value="${esc(l.remarks || "")}"></td>
				<td><span class="ri-x" data-i="${i}">×</span></td>
			</tr>`).join("")}
			<tr><td colspan="6" style="text-align:left;"><button class="ri-add" style="border:none;background:none;color:#1f618d;font-weight:700;cursor:pointer;">${__("+ line")}</button></td></tr>
			</tbody></table>`);
	}

	root.on("change input", ".ri-f", function () {
		const l = LINES[cint(this.getAttribute("data-i"))];
		const k = this.getAttribute("data-k");
		l[k] = k === "qty" ? cint(this.value) : this.value;
	});
	root.on("click", ".ri-add", () => { addLine(); paintLines(); });
	root.on("click", ".ri-x", function () {
		LINES.splice(cint(this.getAttribute("data-i")), 1);
		if (!LINES.length) addLine();
		paintLines();
	});

	function clearForm() {
		CUR = null;
		LINES = [];
		addLine();
		root.find(".ri-party, .ri-ref, .ri-rem").val("");
		root.find(".ri-date").val(frappe.datetime.get_today());
		root.find(".ri-new").hide();
		root.find(".ri-save").text(__("Save Receipt"));
		paintLines();
	}

	root.on("click", ".ri-new", clearForm);

	root.on("click", ".ri-save", () => {
		const party = (root.find(".ri-party").val() || "").trim().toUpperCase();
		if (!party) return frappe.show_alert({ message: __("Pick the party first."), indicator: "orange" }, 3);
		const known = (BOOT.parties || []).some((p) => p.name === party);
		const doSave = () => frappe.call({ method: API + ".save_repair_receipt", args: { payload: JSON.stringify({
			name: CUR, party, receipt_date: root.find(".ri-date").val(),
			jd_ref: root.find(".ri-ref").val(), remarks: root.find(".ri-rem").val(),
			items: LINES,
		}) } }).then((r) => {
			frappe.show_alert({ message: __("{0} saved — {1} piece(s).", [r.message.name, r.message.pieces]), indicator: "green" }, 4);
			clearForm();
			boot();
		});
		if (!known) {
			frappe.confirm(__("{0} is a NEW party — create it? (Set its diamond rate on Repair Setup.)", [party]),
				() => frappe.call({ method: API + ".save_repair_party",
					args: { payload: JSON.stringify({ party_name: party }) } }).then(doSave));
		} else doSave();
	});

	function loadList() {
		frappe.call({ method: API + ".list_repair_receipts",
			args: SHOWALL ? {} : { status: "Received" } }).then((r) => {
			const rows = r.message || [];
			root.find(".ri-list").html(rows.length ? `
				<table class="ri-t"><thead><tr>
					<th>${__("Receipt")}</th><th>${__("Party")}</th><th>${__("Received")}</th><th>${__("JD REF#")}</th>
					<th>${__("Pieces")}</th><th>${__("Status")}</th><th>${__("Billed in")}</th><th></th>
				</tr></thead><tbody>
				${rows.map((x) => `<tr class="ri-r" data-n="${esc(x.name)}" data-s="${esc(x.status)}">
					<td><b>${esc(x.name)}</b></td><td>${esc(x.party)}</td><td>${esc(x.receipt_date || "")}</td>
					<td>${esc(x.jd_ref || "")}</td><td>${x.piece_count || 0}</td>
					<td><span class="ri-chip ${x.status === "Received" ? "rec" : "bil"}">${esc(x.status)}</span></td>
					<td>${esc(x.billed_in || "")}</td>
					<td>${x.status === "Received" ? `<span class="ri-x ri-del" data-n="${esc(x.name)}">×</span>` : ""}</td>
				</tr>`).join("")}</tbody></table>`
				: `<div style="padding:20px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:10px;">${__("Nothing waiting — every receipt is billed.")}</div>`);
		});
	}

	root.on("change", ".ri-all", function () {
		SHOWALL = this.checked;
		loadList();
	});
	root.on("click", ".ri-del", function (e) {
		e.stopPropagation();
		const n = this.getAttribute("data-n");
		frappe.confirm(__("Delete {0}?", [n]), () =>
			frappe.call({ method: API + ".delete_repair_receipt", args: { name: n } }).then(loadList));
	});
	root.on("click", "tr.ri-r", function () {
		if ($(this).data("s") !== "Received") return;
		const n = $(this).data("n");
		frappe.call({ method: API + ".get_repair_receipt", args: { name: n } }).then((r) => {
			const m = r.message;
			CUR = m.name;
			LINES = m.items.length ? m.items : [{ item_type: "", qty: 1, narration: "", remarks: "" }];
			root.find(".ri-party").val(m.party);
			root.find(".ri-date").val(m.receipt_date);
			root.find(".ri-ref").val(m.jd_ref || "");
			root.find(".ri-rem").val(m.remarks || "");
			root.find(".ri-new").show();
			root.find(".ri-save").text(__("Update {0}", [m.name]));
			paintLines();
			window.scrollTo(0, 0);
		});
	});

	boot();
};
