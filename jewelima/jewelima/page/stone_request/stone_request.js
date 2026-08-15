// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Stone Request — the GLOBAL marker (works like Transfer Order Bag): scan any
// production card anywhere, build the list, MARK — every marked card becomes
// pullable at the Stone Issue station and its bench record gets the system
// In-Queue reason "Awaiting Stone". The reason clears itself when stones are
// actually issued into the card. Route: /app/stone-request

frappe.pages["stone-request"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Stone Request", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	let rows = [];

	$(page.main).append(`
		<style>
		.sq-top{display:flex;align-items:flex-end;gap:14px;margin-bottom:14px;flex-wrap:wrap;}
		.sq-scan{width:260px;}
		.sq-note{font-size:12px;color:var(--text-muted);max-width:620px;}
		table.sq-t{width:100%;border-collapse:collapse;font-size:12.5px;background:var(--fg-color);}
		table.sq-t th{background:var(--control-bg);font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);padding:5px 10px;border:1px solid var(--border-color);text-align:left;}
		table.sq-t td{border:1px solid var(--border-color);padding:5px 10px;}
		.sq-x{border:none;background:none;color:var(--text-muted);cursor:pointer;font-size:14px;}
		.sq-x:hover{color:#b02a2a;}
		.sq-empty{padding:30px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:9px;}
		.sq-go{background:#1f618d;border-color:#1f618d;color:#fff;font-weight:700;margin-top:12px;}
		.sq-now{background:#1c7d3a;border-color:#1c7d3a;color:#fff;font-weight:700;margin-top:12px;margin-left:10px;}
		</style>
		<div class="sq-top">
			<div class="sq-scan"></div>
			<div class="sq-note">${__("Scan cards from ANYWHERE in production. MARK sends them to the Stone Issue pool — the station can only pull marked cards — and stamps 'Awaiting Stone' as their In-Queue reason (cleared automatically once stones are issued).")}</div>
		</div>
		<div class="sq-body"></div>
		<button class="btn sq-go" style="display:none;"></button>
		<button class="btn sq-now" style="display:none;"></button>
	`);
	const root = $(page.main);
	const scan = frappe.ui.form.make_control({
		df: { fieldtype: "Data", label: __("Scan card"), fieldname: "scan", placeholder: __("Scan barcode…") },
		parent: root.find(".sq-scan").get(0), render_input: true,
	});
	scan.refresh();
	const focusScan = () => setTimeout(() => scan.$input.focus(), 50);

	function paint() {
		root.find(".sq-body").html(rows.length ? `
			<table class="sq-t"><thead><tr><th style="width:36px">#</th><th>${__("Card")}</th>
				<th>${__("Design")}</th><th>${__("At")}</th><th>${__("Qty")}</th><th style="width:30px"></th></tr></thead><tbody>
			${rows.map((r, i) => `<tr>
				<td>${i + 1}</td><td><b>${esc(r.name)}</b></td>
				<td>${esc(r.design || "")}</td><td>${esc(r.location || "")}</td><td>${r.qty || ""}</td>
				<td><button class="sq-x" data-name="${esc(r.name)}">✕</button></td>
			</tr>`).join("")}</tbody></table>`
			: `<div class="sq-empty">${__("Scan the first card.")}</div>`);
		root.find(".sq-go").toggle(!!rows.length).text(__("MARK {0} card(s) for Stone Issue", [rows.length]));
		// Immediate issue is a single-card shortcut — mark it, then jump to the station.
		root.find(".sq-now").toggle(rows.length === 1).text(__("Issue stones now →"));
	}

	scan.$input.on("keydown", (e) => {
		if (e.key !== "Enter") return;
		const code = (scan.get_value() || "").trim();
		scan.set_value("");
		if (!code) return;
		if (rows.some((r) => r.name === code)) {
			frappe.show_alert({ message: __("{0} already on the list.", [code]), indicator: "orange" }, 3);
			focusScan();
			return;
		}
		frappe.db.get_value("Order Bag", code, ["name", "design", "location", "qty", "stock_status", "is_finished", "stone_issue"])
			.then((r) => {
				const v = (r.message || {});
				if (!v.name) {
					frappe.show_alert({ message: __("{0} not found.", [code]), indicator: "red" }, 4);
				} else if (v.is_finished || v.stock_status !== "In Production") {
					frappe.show_alert({ message: __("{0} is {1} — only production cards take stones.", [code, v.stock_status || "?"]), indicator: "red" }, 4);
				} else if (parseInt(v.stone_issue)) {
					frappe.show_alert({ message: __("{0} is already marked for stone issue.", [code]), indicator: "orange" }, 4);
				} else {
					rows.push(v);
					paint();
				}
				focusScan();
			});
	});

	root.on("click", ".sq-x", function () {
		rows = rows.filter((r) => r.name !== $(this).data("name"));
		paint();
		focusScan();
	});

	root.find(".sq-go").on("click", () => {
		frappe.call({ method: API + ".mark_stone_issue", args: { bags: JSON.stringify(rows.map((r) => r.name)) } })
			.then((r) => {
				const m = r.message || {};
				frappe.show_alert({ message: __("{0} card(s) marked — Awaiting Stone.", [(m.marked || []).length]), indicator: "green" }, 5);
				if ((m.errors || []).length) {
					frappe.msgprint({ title: __("Some not marked"), indicator: "orange",
						message: m.errors.map((e) => `${esc(e.name)}: ${esc(e.error)}`).join("<br>") });
				}
				rows = [];
				paint();
				focusScan();
			});
	});

	root.find(".sq-now").on("click", () => {
		if (rows.length !== 1) return; // single-card shortcut only
		const nm = rows[0].name;
		frappe.call({ method: API + ".mark_stone_issue", args: { bags: JSON.stringify([nm]) } })
			.then((r) => {
				const m = r.message || {};
				if ((m.errors || []).length) {
					frappe.msgprint({ title: __("Can't issue"), indicator: "red",
						message: m.errors.map((e) => `${esc(e.name)}: ${esc(e.error)}`).join("<br>") });
					return;
				}
				// hand straight over to the Stone Issue station with this card loaded
				frappe.route_options = { card: nm };
				frappe.set_route("stone-issue");
			});
	});

	paint();
	focusScan();
};
