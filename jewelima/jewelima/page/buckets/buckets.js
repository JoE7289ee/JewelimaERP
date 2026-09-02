// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Buckets (Delivery) — the boxes, trays and drawers finished pieces are filed in.
//
// It sits under Delivery rather than in Setup > Masters because the list is used
// at the counter, not configured once: a piece cannot be made without a bucket,
// so whoever is making them needs the list within reach of the work.
//
// A bucket holding pieces is never deleted, only retired: retired keeps its
// history and its contents readable, and drops it off the pickers on Make
// Products and Transfer Bucket so nothing new lands in it.
// Route: /app/buckets
frappe.pages["buckets"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Buckets"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const cint = (v) => parseInt(v, 10) || 0;
	const root = $(page.main);
	const S = { data: null, open: null };

	root.append(`
		<style>
		#page-buckets .container{max-width:100%;}
		.bk-tiles{display:flex;gap:11px;flex-wrap:wrap;margin-bottom:14px;}
		.bk-tile{border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);
			padding:10px 17px;min-width:120px;border-left:3px solid var(--border-color);}
		.bk-tile .k{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);}
		.bk-tile .v{font-size:21px;font-weight:800;font-variant-numeric:tabular-nums;}
		.bk-tile.blue{border-left-color:#1f618d;background:rgba(31,97,141,.06);}
		.bk-tile.blue .v{color:#1f618d;}
		.bk-tile.amber{border-left-color:#8a6d00;background:rgba(224,168,0,.09);}
		.bk-tile.amber .v{color:#8a6d00;}
		.bk-tile.green{border-left-color:#1d7a33;background:rgba(29,122,51,.07);}
		.bk-tile.green .v{color:#1d7a33;}
		[data-theme="dark"] .bk-tile.blue .v{color:#8fc1e8;}
		[data-theme="dark"] .bk-tile.amber .v{color:#e8c66b;}
		[data-theme="dark"] .bk-tile.green .v{color:#7fc98f;}

		.bk-cols{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;}
		.bk-card{flex:1 1 430px;min-width:340px;border:1px solid var(--border-color);border-radius:12px;
			background:var(--fg-color);overflow:hidden;border-left:3px solid #1f618d;}
		.bk-card > .h{padding:9px 14px;border-bottom:1px solid var(--border-color);
			background:rgba(31,97,141,.09);color:#1f618d;font-size:11px;font-weight:800;
			letter-spacing:.05em;text-transform:uppercase;
			display:flex;justify-content:space-between;align-items:center;gap:8px;}
		[data-theme="dark"] .bk-card > .h{color:#8fc1e8;}
		table.bk-tbl{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.bk-tbl th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em;
			color:var(--text-muted);padding:6px 12px;border-bottom:1px solid var(--border-color);}
		table.bk-tbl td{padding:6px 12px;border-bottom:1px solid var(--border-color);}
		table.bk-tbl tr:last-child td{border-bottom:none;}
		table.bk-tbl tbody tr:nth-child(even) td{background:rgba(128,128,128,.055);}
		table.bk-tbl tbody tr.pick{cursor:pointer;}
		table.bk-tbl tbody tr.pick:hover td{background:rgba(31,97,141,.10);}
		table.bk-tbl tbody tr.on td{background:rgba(31,97,141,.14);}
		table.bk-tbl td.num{text-align:right;font-variant-numeric:tabular-nums;}
		tr.retired td{opacity:.55;}
		.bk-nm{font-weight:800;letter-spacing:.02em;}
		.bk-act{cursor:pointer;font-size:11px;font-weight:700;color:#1f618d;}
		[data-theme="dark"] .bk-act{color:#8fc1e8;}
		.bk-tag{font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;
			border:1px solid var(--border-color);border-radius:9px;padding:0 6px;color:var(--text-muted);}
		.bk-addrow{display:flex;gap:8px;padding:10px 12px;border-top:1px solid var(--border-color);
			background:var(--control-bg);}
		.bk-addrow input{flex:1;border:1px solid var(--border-color);border-radius:7px;padding:6px 11px;
			background:var(--fg-color);color:var(--text-color);text-transform:uppercase;font-size:12.5px;}
		.bk-none{padding:26px;text-align:center;color:var(--text-muted);font-size:12.5px;}
		</style>
		<div class="bk-tiles"></div>
		<div class="bk-cols">
			<div class="bk-card bk-list">
				<div class="h"><span>${__("Buckets")}</span></div>
				<div class="bk-listbody"></div>
				<div class="bk-addrow">
					<input class="bk-name" placeholder="${__("new bucket name")}">
					<button class="btn btn-sm btn-default bk-add">${__("Add")}</button>
				</div>
			</div>
			<div class="bk-card bk-in"><div class="h"><span class="bk-in-t">${__("In this bucket")}</span></div>
				<div class="bk-inbody"><div class="bk-none">${__("Pick a bucket.")}</div></div>
			</div>
		</div>
	`);

	function paint() {
		const d = S.data || { buckets: [], filed: 0, unfiled: 0, active: 0 };
		root.find(".bk-tiles").html(`
			<div class="bk-tile blue"><div class="k">${__("Buckets")}</div><div class="v">${d.active}</div></div>
			<div class="bk-tile green"><div class="k">${__("Pieces filed")}</div><div class="v">${d.filed}</div></div>
			<div class="bk-tile ${d.unfiled ? "amber" : "green"}"><div class="k">${__("Not filed")}</div>
				<div class="v">${d.unfiled}</div></div>`);

		const rows = (d.buckets || []).map((b) => `
			<tr class="pick ${b.active ? "" : "retired"} ${S.open === b.name ? "on" : ""}" data-n="${esc(b.name)}">
				<td><span class="bk-nm">${esc(b.name)}</span>
					${b.active ? "" : ` <span class="bk-tag">${__("retired")}</span>`}</td>
				<td class="num">${cint(b.pieces)}</td>
				<td class="num"><span class="bk-act bk-toggle" data-n="${esc(b.name)}" data-a="${b.active ? 0 : 1}">${
					b.active ? __("retire") : __("use again")}</span></td>
			</tr>`).join("");
		root.find(".bk-listbody").html((d.buckets || []).length
			? `<table class="bk-tbl"><thead><tr><th>${__("Bucket")}</th>
				<th class="num">${__("Pieces")}</th><th class="num"></th></tr></thead><tbody>${rows}
				${d.unfiled ? `<tr class="pick ${S.open === "__none__" ? "on" : ""}" data-n="__none__">
					<td><i>${__("not filed")}</i></td><td class="num">${d.unfiled}</td><td></td></tr>` : ""}
				</tbody></table>`
			: `<div class="bk-none">${__("No buckets yet — add the first one below.")}</div>`);
	}

	function load() {
		frappe.call({ method: API + ".get_bucket_overview", freeze: false }).then((r) => {
			S.data = r.message || {};
			paint();
			if (S.open) openBucket(S.open);
		});
	}

	function openBucket(name) {
		S.open = name;
		// Only move the highlight. Re-rendering the whole list here would replace
		// the row that was just clicked while its event is still bubbling, and the
		// delegated handlers then re-match against a DOM that no longer exists —
		// which fired the retire action on a plain row selection.
		root.find(".bk-listbody tbody tr").removeClass("on");
		root.find(`.bk-listbody tbody tr[data-n="${name}"]`).addClass("on");
		root.find(".bk-in-t").text(name === "__none__" ? __("Not filed") : name);
		frappe.call({ method: API + ".get_bucket_pieces", args: { bucket: name }, freeze: false })
			.then((r) => {
				const rows = r.message || [];
				root.find(".bk-inbody").html(rows.length
					? `<table class="bk-tbl"><thead><tr><th>${__("Piece")}</th><th>${__("Design")}</th>
						<th>${__("HUID")}</th><th>${__("Held by")}</th></tr></thead><tbody>`
						+ rows.map((p) => `<tr><td><b>${esc(p.name)}</b></td>
							<td>${esc(p.design || "")}</td><td>${esc(p.huid || "")}</td>
							<td>${esc(p.held_by || "")}</td></tr>`).join("") + `</tbody></table>`
					: `<div class="bk-none">${__("Nothing in here.")}</div>`);
			});
	}

	root.on("click", "tr.pick", function (e) {
		if ($(e.target).closest(".bk-toggle").length) return;   // the retire link is not a pick
		openBucket($(this).data("n"));
	});
	root.on("click", ".bk-toggle", function (e) {
		e.stopPropagation();
		// read the row, not just the element: it survives a re-render
		const name = this.dataset.n || $(this).closest("tr").data("n");
		if (!name || name === "__none__") return;
		frappe.call({ method: API + ".set_finished_bucket",
			args: { name: name, active: cint(this.dataset.a) } }).then(load);
	});
	function addBucket() {
		const v = (root.find(".bk-name").val() || "").trim().toUpperCase();
		if (!v) return;
		frappe.call({ method: API + ".add_finished_bucket", args: { bucket_name: v } })
			.then(() => { root.find(".bk-name").val(""); load(); })
			.catch(() => {});
	}
	root.on("click", ".bk-add", addBucket);
	root.on("keydown", ".bk-name", (e) => { if (e.key === "Enter") { e.preventDefault(); addBucket(); } });

	page.set_primary_action(__("Refresh"), load, "refresh");
	load();
	frappe.pages["buckets"].on_page_show = load;
};
