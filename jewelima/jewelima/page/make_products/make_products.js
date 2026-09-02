// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Make Products — transfer-page style: SCAN cards and they line up in a queue
// (a card that isn't qty 1, or has no actual weight, is refused with the reason),
// then ONE button converts the whole queue: materials consumed, actuals frozen,
// stock moves In Bags -> Finished Goods carrying the card dimension, card becomes
// a product (In Stock). Below: the Bag Extraction pool — every card waiting
// there, filterable by party / job order / design type / salesman, click to
// queue the ready ones. Route: /app/make-products

frappe.pages["make-products"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Make Products", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const Q = new Map();   // name -> queued card
	let POOL = { rows: [], parties: [], job_orders: [], salesmen: [], design_types: [] };
	const F = { party: "", job_order: "", design_type: "", salesman: "", purity: "" };
	const SEL = new Set();          // pool rows ticked for the queue

	$(page.main).append(`
		<style>
		#page-make-products .container{max-width:100%;}
		.mp-wrap{display:flex;flex-direction:column;gap:12px;}
		.mp-scanrow{display:flex;gap:12px;align-items:end;}
		.mp-scanrow .frappe-control{margin:0;flex:0 0 280px;}
		.mp-scanrow .control-label{font-size:11px;color:var(--text-muted);}
		.mp-tbl{width:100%;border-collapse:separate;border-spacing:0;background:var(--fg-color);
			border:1px solid var(--border-color);border-radius:9px;overflow:hidden;font-size:13px;}
		.mp-tbl th{background:var(--control-bg);border-bottom:1px solid var(--border-color);padding:7px 12px;text-align:left;font-weight:700;white-space:nowrap;}
		.mp-tbl td{border-bottom:1px solid var(--border-color);padding:6px 12px;}
		.mp-tbl tbody tr:last-child td{border-bottom:0;}
		.mp-tbl td.num,.mp-tbl th.num{text-align:right;font-variant-numeric:tabular-nums;}
		.mp-x{color:#b02a2a;cursor:pointer;font-weight:800;padding:0 6px;}
		.mp-empty{padding:26px;text-align:center;color:var(--text-muted);}
		.mp-strip{position:sticky;bottom:0;display:flex;align-items:center;gap:12px;border:2px solid var(--border-color);
			border-radius:10px;background:var(--fg-color);padding:9px 14px;flex-wrap:wrap;z-index:5;}
		.mp-b{border:1px solid var(--border-color);border-radius:8px;padding:4px 16px;text-align:center;background:var(--control-bg);min-width:96px;}
		.mp-b .k{font-size:10px;font-weight:700;letter-spacing:.06em;color:var(--text-muted);}
		.mp-b .v{font-size:15px;font-weight:800;font-variant-numeric:tabular-nums;}
		.mp-go{margin-left:auto;background:#2e7d32;border:none;color:#fff;font-weight:800;letter-spacing:.5px;
			padding:11px 34px;border-radius:8px;font-size:15px;cursor:pointer;}
		.mp-go:hover{background:#256628;}
		.mp-go:disabled{opacity:.4;cursor:default;}
		.mp-pool{border:1px solid var(--border-color);border-radius:10px;background:var(--fg-color);padding:12px 16px;}
		.mp-pool h4{margin:0 0 8px;font-size:14px;}
		.mp-pills{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px;}
		.mp-pills .lbl{font-size:10.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;}
		.mp-pill{border:1px solid var(--border-color);border-radius:12px;padding:2px 12px;font-size:12px;font-weight:600;cursor:pointer;background:var(--control-bg);user-select:none;}
		.mp-pill.on{background:var(--primary);border-color:var(--primary);color:#fff;}
		.mp-ready{color:#2e7d32;font-weight:700;}
		.mp-block{color:#b02a2a;font-size:11.5px;}
		.mp-add{background:#1461d2;border:none;color:#fff;font-weight:700;padding:3px 14px;border-radius:6px;font-size:11.5px;cursor:pointer;}
		.mp-add:disabled{opacity:.35;cursor:default;}
		.mp-inq{color:var(--text-muted);font-size:11.5px;font-weight:700;}
		</style>
		<div class="mp-wrap">
			<div class="mp-scanrow">
				<div class="mp-scan"></div>
				<button class="btn btn-default mp-clear">${__("Clear queue")}</button>
			</div>
			<div class="mp-queue"></div>
			<div class="mp-strip">
				<div class="mp-b"><div class="k">${__("PIECES")}</div><div class="v mp-n">0</div></div>
				<div class="mp-b"><div class="k">${__("GROSS g")}</div><div class="v mp-gross">0.000</div></div>
				<div class="mp-b"><div class="k">${__("NETT g")}</div><div class="v mp-nett">0.000</div></div>
				<div class="mp-b"><div class="k">${__("DMD ct")}</div><div class="v mp-dmd">0.000</div></div>
				<select class="mp-bucket" style="border:1px solid var(--border-color);border-radius:7px;padding:5px 9px;font-size:12.5px;background:var(--fg-color);color:var(--text-color);margin-right:8px;"><option value="">${__("pick a bucket…")}</option></select>
				<button class="mp-go" disabled>${__("MAKE PRODUCTS")}</button>
			</div>
			<div class="mp-pool">
				<h4>${__("At Bag Extraction")} <span class="mp-poolcount" style="color:var(--text-muted);font-weight:400;"></span></h4>
				<div class="mp-pills mp-f-party"></div>
				<div class="mp-pills mp-f-rest"></div>
				<div class="mp-poolbody"></div>
			</div>
		</div>
	`);
	const root = $(page.main);

	// MAKE needs both a queue and somewhere to put the results
	const paintGo = () => root.find(".mp-go").prop("disabled", !Q.size || !BUCKET);

	// A finished piece has to be put somewhere, so the bucket is picked before
	// anything is made — the list is maintained in Delivery Masters, and only
	// buckets still in use are offered.
	let BUCKET = "";
	frappe.call({ method: API + ".get_finished_buckets", freeze: false }).then((r) => {
		const buckets = r.message || [];
		root.find(".mp-bucket").append(buckets.map((b) =>
			`<option value="${frappe.utils.escape_html(b.name)}">${frappe.utils.escape_html(b.name)}`
			+ (b.pieces ? ` (${b.pieces})` : "") + `</option>`).join(""));
		if (!buckets.length) {
			root.find(".mp-bucket").prop("disabled", true)
				.html(`<option>${__("no buckets set up yet")}</option>`);
		}
	});
	root.on("change", ".mp-bucket", function () { BUCKET = this.value || ""; paintGo(); });

	const scan = frappe.ui.form.make_control({
		df: { fieldtype: "Data", label: __("Scan Card"), fieldname: "scan", placeholder: __("E0123.4 …") },
		parent: root.find(".mp-scan").get(0), render_input: true,
	});
	scan.refresh();
	scan.$input.on("keydown", (e) => {
		if (e.key !== "Enter") return;
		e.preventDefault();
		const v = (scan.get_value() || "").trim();
		if (v) addCard(v);
	});
	setTimeout(() => scan.$input.focus(), 300);

	function addCard(name) {
		if (Q.has(name)) {
			frappe.show_alert({ message: __("{0} is already in the queue.", [esc(name)]), indicator: "orange" }, 3);
			scan.set_value("");
			return;
		}
		frappe.call({ method: API + ".get_make_product_card", args: { order_bag: name } })
			.then((r) => {
				Q.set(r.message.name, r.message);
				scan.set_value("");
				paint();
			})
			.catch(() => scan.$input.select());
	}

	function paint() {
		const rows = [...Q.values()];
		root.find(".mp-queue").html(rows.length ? `<table class="mp-tbl"><thead><tr>
			<th>${__("Card")}</th><th>${__("Design")}</th><th>${__("Party")}</th><th>${__("From")}</th>
			<th class="num">${__("Gross g")}</th><th class="num">${__("Nett g")}</th><th class="num">${__("DMD ct")}</th><th></th>
			</tr></thead><tbody>` +
			rows.map((c) => `<tr>
				<td><b>${esc(c.name)}</b></td><td>${esc(c.design || "—")}</td><td>${esc(c.customer || "—")}</td>
				<td>${esc(c.location || "—")}</td>
				<td class="num">${c.gross.toFixed(3)}</td><td class="num">${c.nett.toFixed(3)}</td>
				<td class="num">${c.dmd_ct.toFixed(3)}</td>
				<td><span class="mp-x" data-n="${esc(c.name)}">✕</span></td>
			</tr>`).join("") + "</tbody></table>"
			: `<div class="mp-empty">${__("Scan cards — they line up here.")}</div>`);
		root.find(".mp-n").text(rows.length);
		root.find(".mp-gross").text(rows.reduce((a, c) => a + c.gross, 0).toFixed(3));
		root.find(".mp-nett").text(rows.reduce((a, c) => a + c.nett, 0).toFixed(3));
		root.find(".mp-dmd").text(rows.reduce((a, c) => a + c.dmd_ct, 0).toFixed(3));
		paintGo();
		paintPool();   // refresh the "in queue" markers
	}

	root.on("click", ".mp-x", function () {
		Q.delete($(this).attr("data-n"));
		paint();
	});
	root.find(".mp-clear").on("click", () => { Q.clear(); paint(); });

	root.find(".mp-go").on("click", () => {
		const names = [...Q.keys()];
		frappe.confirm(
			__("Make <b>{0}</b> piece(s) into products, filed in <b>{1}</b>?<br>Materials are consumed, actual weights frozen, and stock moves In Bags → Finished Goods on each card. This cannot be undone.",
				[names.length, frappe.utils.escape_html(BUCKET || "—")]),
			() => {
				frappe.dom.freeze(__("Converting..."));
				frappe.call({ method: API + ".make_products",
					args: { bags: JSON.stringify(names), bucket: BUCKET } })
					.then((r) => {
						frappe.dom.unfreeze();
						const m = r.message || {};
						const errs = (m.errors || []).map((e) => `<div style="color:#b02a2a;">${esc(e.name)}: ${esc(e.error)}</div>`).join("");
						frappe.msgprint({
							title: __("Products made"), indicator: errs ? "orange" : "green",
							message: __("<b>{0}</b> piece(s) are now products (In Stock).", [(m.done || []).length]) + (errs ? "<hr>" + errs : ""),
						});
						(m.done || []).forEach((n) => Q.delete(n));   // failures stay queued, visible
						loadPool();
						paint();
					}).catch(() => frappe.dom.unfreeze());
			});
	});

	// ---- the Bag Extraction pool -------------------------------------------
	// the pool arrives a window at a time — the profile read behind each card is
	// per-card, so an unwindowed page paid for every card on the bench
	const POOL_PAGE = 400;

	function loadPool(more) {
		const $body = root.find(".mp-poolbody");
		jewelima.busy($body, true, more ? __("Loading more cards…") : __("Loading the pool…"));
		frappe.call({ method: API + ".get_extraction_cards", freeze: false, args: {
			party: F.party || null, job_order: F.job_order || null,
			design_type: F.design_type || null, salesman: F.salesman || null,
			purity: F.purity || null,
			limit: POOL_PAGE, offset: more ? ((POOL.rows || []).length) : 0,
		} }).then((r) => {
			const m = r.message;
			if (!m) return;
			if (more) m.rows = (POOL.rows || []).concat(m.rows || []);
			POOL = m;
			paintPills();
			paintPool();
		}).always(() => jewelima.busy($body, false));
	}

	const pillRow = (lbl, list, cur, key) => (list.length
		? `<span class="lbl">${lbl}</span>
		   <span class="mp-pill ${cur ? "" : "on"}" data-k="${key}" data-v="">${__("All")}</span>` +
		  list.map((x) => `<span class="mp-pill ${cur === x ? "on" : ""}" data-k="${key}" data-v="${esc(x)}">${esc(x)}</span>`).join("")
		: "");

	function paintPills() {
		root.find(".mp-f-party").html(pillRow(__("Party"), POOL.parties, F.party, "party"));
		root.find(".mp-f-rest").html(
			pillRow(__("Purity"), (POOL.purities || []).map(String), F.purity, "purity") +
			pillRow(__("Job Order"), POOL.job_orders, F.job_order, "job_order") +
			(POOL.design_types.length ? `<span class="lbl" style="margin-left:12px;"></span>` : "") +
			pillRow(__("Design Type"), POOL.design_types, F.design_type, "design_type") +
			(POOL.salesmen.length ? `<span class="lbl" style="margin-left:12px;"></span>` : "") +
			pillRow(__("Salesman"), POOL.salesmen, F.salesman, "salesman"));
	}

	function paintPool() {
		const rows = POOL.rows || [];
		const total = POOL.total != null ? POOL.total : rows.length;
		root.find(".mp-poolcount").text(rows.length
			? (total > rows.length
				? __("— {0} of {1} card(s), {2} ready here", [rows.length, total, rows.filter((r) => r.ready).length])
				: __("— {0} card(s), {1} ready", [rows.length, rows.filter((r) => r.ready).length]))
			: "");
		root.find(".mp-poolbody").html(rows.length ? `<table class="mp-tbl"><thead><tr>
			<th style="width:32px;"><input type="checkbox" class="mp-selall" title="${
				__("Select every ready card on screen")}"></th>
			<th>${__("Card")}</th><th>${__("Design")}</th><th>${__("Party")}</th><th>${__("Job Order")}</th>
			<th>${__("Due")}</th><th class="num">${__("Purity")}</th>
			<th class="num">${__("Gross g")}</th><th class="num">${__("Nett g")}</th>
			<th>${__("Status")}</th><th></th></tr></thead><tbody>` +
			rows.map((c) => {
				const inq = Q.has(c.name);
				const pickable = c.ready && !inq;
				return `<tr>
				<td>${pickable
					? `<input type="checkbox" class="mp-sel" data-n="${esc(c.name)}" ${
						SEL.has(c.name) ? "checked" : ""}>`
					: ""}</td>
				<td><b>${esc(c.name)}</b></td>
				<td>${esc(c.design || "—")} <span style="color:var(--text-muted);font-size:11px;">${esc(c.design_type || "")}</span></td>
				<td>${esc(c.customer || "—")}</td><td>${esc(c.job_order || "—")}</td>
				<td>${c.due_date ? frappe.datetime.str_to_user(c.due_date) : "—"}</td>
				<td class="num">${c.purity ? flt(c.purity).toFixed(1) : "—"}</td>
				<td class="num">${c.gross.toFixed(3)}</td><td class="num">${c.nett.toFixed(3)}</td>
				<td>${c.ready ? `<span class="mp-ready">${__("READY")}</span>` : `<span class="mp-block">${esc(c.blocker)}</span>`}</td>
				<td>${inq ? `<span class="mp-inq">${__("in queue")}</span>`
					: `<button class="mp-add" data-n="${esc(c.name)}" ${c.ready ? "" : "disabled"}>${__("Queue")}</button>`}</td>
			</tr>`; }).join("") + "</tbody></table>" +
			(rows.some((r) => r.ready && !Q.has(r.name))
				? `<div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
					<button class="btn btn-sm btn-primary mp-addsel" ${SEL.size ? "" : "disabled"}>${
						SEL.size ? __("Add {0} selected to queue", [SEL.size]) : __("Add selected to queue")}</button>
					<button class="btn btn-sm btn-default mp-addall">${__("Queue all ready on screen")}</button>
					${SEL.size ? `<span class="text-muted" style="font-size:12px;">${
						__("{0} ticked", [SEL.size])} · <a class="mp-selnone" href="#">${__("clear")}</a></span>` : ""}
				</div>` : "")
			+ `<div class="mp-more"></div>`
			: `<div class="mp-empty">${__("No cards at Bag Extraction match.")}</div>`);
		// "Queue all ready" only ever reaches the loaded window, so say what is behind it
		jewelima.moreBar(root.find(".mp-more"), rows.length, total,
			() => loadPool(true), __("Load {0} more", [POOL_PAGE]));
	}

	root.on("click", ".mp-pill", function () {
		F[$(this).attr("data-k")] = $(this).attr("data-v");
		loadPool();
	});
	root.on("click", ".mp-add", function () { addCard($(this).attr("data-n")); });
	root.on("click", ".mp-addall", () => {
		// "on screen" is literal — a filtered, windowed pool is what is loaded, and
		// queueing ten thousand cards nobody has looked at is not a kindness
		(POOL.rows || []).filter((r) => r.ready && !Q.has(r.name)).forEach((r) => addCard(r.name));
	});

	// ---- ticking cards for the queue ---------------------------------------
	root.on("change", ".mp-sel", function () {
		const n = $(this).attr("data-n");
		if (this.checked) SEL.add(n); else SEL.delete(n);
		paintPool();
	});
	root.on("change", ".mp-selall", function () {
		const on = this.checked;
		(POOL.rows || []).forEach((r) => {
			if (!r.ready || Q.has(r.name)) return;      // only what can actually be queued
			if (on) SEL.add(r.name); else SEL.delete(r.name);
		});
		paintPool();
	});
	root.on("click", ".mp-selnone", function (e) { e.preventDefault(); SEL.clear(); paintPool(); });
	root.on("click", ".mp-addsel", () => {
		const picked = [...SEL].filter((n) => !Q.has(n));
		if (!picked.length) return;
		picked.forEach(addCard);
		SEL.clear();
		paintPool();
		frappe.show_alert({ message: __("{0} card(s) added to the queue.", [picked.length]),
			indicator: "green" }, 5);
	});

	page.add_inner_button(__("Finished Stock"), () => frappe.set_route("finished-stock"));
	page.set_primary_action(__("Refresh"), () => loadPool(), "refresh");
	loadPool();
	paint();
};
