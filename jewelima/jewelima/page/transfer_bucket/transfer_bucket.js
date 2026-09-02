// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Transfer Bucket (Delivery) — re-file finished pieces. Scan them, they stack in
// the table showing which bucket each is in now; pick the bucket they are going
// to and Transfer moves the lot.
//
// A bucket is where a thing is KEPT, not a stock location: re-filing a piece
// changes nothing about its stock, its holder or its weights. That is why this
// is its own small page and not part of Transfer Holder, which moves a
// reservation and is a different question entirely.
// Route: /app/transfer-bucket
frappe.pages["transfer-bucket"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Transfer Bucket"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const root = $(page.main);
	const S = { rows: [], to: "", buckets: [] };

	root.append(`
		<style>
		#page-transfer-bucket .container{max-width:100%;}
		.tb-top{display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin-bottom:12px;}
		.tb-top .control-label{font-size:11px;color:var(--text-muted);}
		.tb-scan{min-width:280px;}
		.tb-to select{border:1px solid var(--border-color);border-radius:8px;height:33px;padding:2px 11px;
			font-size:13px;background:var(--fg-color);color:var(--text-color);min-width:220px;}
		.tb-go{background:#1f618d;border:none;color:#fff;font-weight:800;letter-spacing:.4px;
			padding:9px 24px;border-radius:8px;font-size:13.5px;cursor:pointer;}
		.tb-go:disabled{opacity:.4;cursor:default;}
		.tb-reset{background:none;border:1px solid var(--border-color);border-radius:8px;
			padding:8px 16px;font-size:12.5px;cursor:pointer;color:var(--text-color);}
		.tb-msg{margin:8px 0;font-size:12.5px;min-height:18px;}
		.tb-msg.ok{color:#1d7a33;} .tb-msg.err{color:#b02a2a;} .tb-msg.warn{color:#8a6d00;}
		table.tb-t{width:100%;border-collapse:collapse;font-size:12.5px;background:var(--fg-color);
			border:1px solid var(--border-color);border-radius:10px;overflow:hidden;}
		table.tb-t th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em;
			color:var(--text-muted);padding:7px 10px;border-bottom:1px solid var(--border-color);
			background:var(--control-bg);}
		table.tb-t td{padding:6px 10px;border-bottom:1px solid var(--border-color);}
		table.tb-t tr:last-child td{border-bottom:none;}
		.tb-was{color:var(--text-muted);}
		.tb-same{color:#8a6d00;}
		.tb-x{color:#b02a2a;cursor:pointer;font-weight:800;}
		.tb-none{padding:34px;text-align:center;color:var(--text-muted);}
		.tb-tiles{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;}
		.tb-tile{border:1px solid var(--border-color);border-radius:11px;background:var(--fg-color);
			padding:8px 15px;min-width:110px;}
		.tb-tile .k{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);}
		.tb-tile .v{font-size:18px;font-weight:800;font-variant-numeric:tabular-nums;}
		</style>
		<div class="tb-top">
			<div class="tb-scan"></div>
			<div class="tb-to"><div class="control-label">${__("Move them to")}</div>
				<select><option value="">${__("pick a bucket…")}</option></select></div>
			<button class="tb-go" disabled>${__("TRANSFER")}</button>
			<button class="tb-reset">${__("Reset")}</button>
		</div>
		<div class="tb-msg"></div>
		<div class="tb-body"></div>
		<div class="tb-tiles"></div>
	`);

	const scan = frappe.ui.form.make_control({
		df: { fieldtype: "Data", label: __("Scan finished piece"), fieldname: "scan",
			description: __("only a piece in stock sits in a bucket") },
		parent: root.find(".tb-scan").get(0), render_input: true,
	});
	scan.refresh();
	const focusScan = () => setTimeout(() => scan.$input.focus(), 30);
	const msg = (k, h) => root.find(".tb-msg").removeClass("ok err warn").addClass(k).html(h);

	function loadBuckets() {
		frappe.call({ method: API + ".get_finished_buckets", freeze: false }).then((r) => {
			S.buckets = r.message || [];
			root.find(".tb-to select").html(`<option value="">${__("pick a bucket…")}</option>`
				+ S.buckets.map((b) => `<option value="${esc(b.name)}">${esc(b.name)}`
					+ (b.pieces ? ` (${b.pieces})` : "") + `</option>`).join(""));
			paintTiles();
		});
	}

	function paintTiles() {
		root.find(".tb-tiles").html(S.buckets.map((b) =>
			`<div class="tb-tile"><div class="k">${esc(b.name)}</div>
				<div class="v">${b.pieces || 0}</div></div>`).join(""));
	}

	function paint() {
		const b = root.find(".tb-body");
		if (!S.rows.length) {
			b.html(`<div class="tb-none">${__("Scan the pieces you are re-filing.")}</div>`);
		} else {
			b.html(`<table class="tb-t"><thead><tr>
				<th style="width:40px;">#</th><th>${__("Piece")}</th><th>${__("Design")}</th><th>${__("HUID")}</th>
				<th>${__("In bucket now")}</th><th style="width:34px;"></th></tr></thead><tbody>`
				+ S.rows.map((r, i) => {
					const same = S.to && r.bucket === S.to;
					return `<tr data-n="${esc(r.name)}">
						<td>${i + 1}</td><td><b>${esc(r.name)}</b></td>
						<td>${esc(r.design || "")}</td><td>${esc(r.huid || "")}</td>
						<td class="${r.bucket ? (same ? "tb-same" : "") : "tb-was"}">${
							esc(r.bucket || __("not filed"))}${same ? " · " + __("already there") : ""}</td>
						<td><span class="tb-x" title="${__("remove")}">&times;</span></td></tr>`;
				}).join("") + `</tbody></table>`);
		}
		const movable = S.rows.filter((r) => S.to && r.bucket !== S.to).length;
		root.find(".tb-go").prop("disabled", !movable)
			.text(movable ? __("TRANSFER {0}", [movable]) : __("TRANSFER"));
	}

	function addScan(code) {
		code = (code || "").trim();
		if (!code) return;
		if (S.rows.some((r) => r.name.toUpperCase() === code.toUpperCase())) {
			msg("warn", __("<b>{0}</b> already scanned.", [esc(code)]));
			return;
		}
		frappe.call({ method: API + ".get_bucket_piece", args: { barcode: code } }).then((r) => {
			const v = r.message || {};
			if (!v.found) return msg("err", esc(v.error || __("No such piece.")));
			if (!v.can_move) return msg("err", esc(v.error));
			S.rows.push(v);
			paint();
			msg("ok", __("Added <b>{0}</b> · {1} in the batch.", [esc(v.name), S.rows.length]));
		});
	}

	scan.$input.on("keydown", (e) => {
		if (e.which !== 13 && e.key !== "Enter") return;
		e.preventDefault();
		const code = scan.$input.val();
		scan.set_value("");
		addScan(code);
		focusScan();
	});
	root.on("change", ".tb-to select", function () { S.to = this.value || ""; paint(); });
	root.on("click", ".tb-x", function () {
		const n = $(this).closest("tr").data("n");
		S.rows = S.rows.filter((r) => r.name !== n);
		paint();
	});
	root.on("click", ".tb-reset", () => { S.rows = []; msg("", ""); paint(); focusScan(); });

	root.on("click", ".tb-go", () => {
		const names = S.rows.filter((r) => r.bucket !== S.to).map((r) => r.name);
		if (!names.length || !S.to) return;
		frappe.dom.freeze(__("Moving…"));
		frappe.call({ method: API + ".transfer_bucket",
			args: { bags: JSON.stringify(names), to_bucket: S.to } })
			.then((r) => {
				frappe.dom.unfreeze();
				const m = r.message || {};
				if ((m.errors || []).length) {
					frappe.msgprint({ title: __("Some not moved"), indicator: "orange",
						message: m.errors.map((e) => `${esc(e.name)}: ${esc(e.error)}`).join("<br>") });
				}
				msg("ok", __("<b>{0}</b> piece(s) moved into <b>{1}</b>.", [m.count || 0, esc(S.to)]));
				S.rows = [];
				paint();
				loadBuckets();      // the counts have changed
				focusScan();
			}).catch(() => frappe.dom.unfreeze());
	});

	loadBuckets();
	paint();
	focusScan();
	frappe.pages["transfer-bucket"].on_page_show = function () { loadBuckets(); focusScan(); };
};
