// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Delivery > Finished Goods > My Bucket — a keeper's own shelf.
//
// Each bucket has a keeper, set on Delivery Masters. This page is that keeper's
// view of it and nothing else: the pieces on their shelf, filtered any way they
// like, and the history of what came onto it — made here, or moved in from
// another bucket — and what left. It is for READING: moving stock between
// buckets stays on Transfer Bucket.
//
// A manager sees a bucket picker and may look at any shelf; a keeper sees their
// own, whatever they ask for, because the server decides which bucket answers.
// Route: /app/my-bucket
frappe.pages["my-bucket"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("My Bucket"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const g3 = (v) => flt(v).toFixed(3);
	const root = $(page.main);
	const S = { cf: {}, bucket: null, is_admin: false, tab: "shelf",
		f: { q: "", design_type: "", karat: "", status: "", stone: "" },
		data: null, days: 30 };

	root.append(`
		<style>
		#page-my-bucket .container{max-width:100%;}
		.mb2-hd{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:14px;}
		.mb2-name{font-size:24px;font-weight:800;letter-spacing:.04em;}
		.mb2-pick{border:1px solid var(--border-color);border-radius:8px;padding:5px 10px;font-size:12.5px;
			background:var(--fg-color);color:var(--text-color);}
		.mb2-kpis{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;}
		.mb2-kpi{border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);
			padding:9px 16px;min-width:118px;border-left:3px solid #1B4332;}
		.mb2-kpi .k{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);font-weight:700;}
		.mb2-kpi .v{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums;}
		.mb2-kpi .v small{font-size:11px;font-weight:600;color:var(--text-muted);}
		.mb2-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;}
		.mb2-bar input,.mb2-bar select{border:1px solid var(--border-color);border-radius:8px;padding:6px 10px;
			font-size:12.5px;background:var(--fg-color);color:var(--text-color);}
		.mb2-bar input.q{width:230px;}
		.mb2-bar .sp{flex:1;}
		.mb2-count{font-size:12px;color:var(--text-muted);}
		.mb2-card{border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);overflow:hidden;}
		.mb2-wrap{overflow-x:auto;max-height:620px;overflow-y:auto;}
		table.mb2-tbl tr.mb2-cf th{top:31px;padding:4px 6px;}
		.mb2-cf input{width:100%;min-width:50px;border:1px solid var(--border-color);border-radius:6px;
			padding:3px 6px;font-size:12px;font-weight:400;text-transform:none;letter-spacing:0;
			background:var(--control-bg);color:var(--text-color);}
		table.mb2-tbl{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.mb2-tbl th{position:sticky;top:0;background:var(--fg-color);z-index:1;text-align:left;
			font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);
			padding:7px 10px;border-bottom:1px solid var(--border-color);white-space:nowrap;}
		table.mb2-tbl td{padding:6px 10px;border-bottom:1px solid var(--border-color);white-space:nowrap;}
		table.mb2-tbl tbody tr:nth-child(even) td{background:rgba(128,128,128,.045);}
		table.mb2-tbl .num{text-align:right;font-variant-numeric:tabular-nums;}
		table.mb2-tbl .card{font-weight:800;letter-spacing:.02em;}
		.mb2-chip{display:inline-block;font-size:10px;font-weight:800;border-radius:9px;padding:1px 7px;
			margin-right:3px;background:rgba(31,97,141,.12);color:#1f618d;}
		[data-theme="dark"] .mb2-chip{color:#8fc1e8;}
		.mb2-st{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.03em;
			border-radius:9px;padding:1px 7px;border:1px solid var(--border-color);color:var(--text-muted);}
		.mb2-st.in{color:#1d7a33;border-color:rgba(29,122,51,.4);}
		.mb2-empty{padding:40px;text-align:center;color:var(--text-muted);font-size:13px;}
		.mb2-in{color:#1d7a33;font-weight:800;} .mb2-out{color:#b0413e;font-weight:800;}
		.mb2-made{color:#1f618d;font-weight:800;}
		.mb2-cols{display:grid;grid-template-columns:minmax(260px,1fr) 2fr;gap:14px;align-items:start;}
		@media (max-width:900px){ .mb2-cols{grid-template-columns:1fr;} }
		.mb2-sub{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;
			color:var(--text-muted);padding:9px 12px;border-bottom:1px solid var(--border-color);}
		</style>
		<div class="mb2-hd">
			<div class="mb2-name">—</div>
			<select class="mb2-pick" hidden></select>
		</div>
		<div class="mb2-kpis"></div>
		<div class="mb2-body"></div>`);

	// ---- the shelf -------------------------------------------------------------
	function kpis(t) {
		return `
			<div class="mb2-kpi"><div class="k">${__("Pieces")}</div><div class="v">${t.shown}${
				t.shown !== t.all ? ` <small>${__("of")} ${t.all}</small>` : ""}</div></div>
			<div class="mb2-kpi"><div class="k">${__("In finished")}</div><div class="v">${t.home || 0}${
				t.prepped ? ` <small>${t.prepped} ${__("prepped for sale")}</small>` : ""}</div></div>
			<div class="mb2-kpi"><div class="k">${__("Out · Certification")}</div><div class="v">${t.cert || 0}</div></div>
			<div class="mb2-kpi"><div class="k">${__("Out · Hallmarking")}</div><div class="v">${t.hall || 0}</div></div>
			<div class="mb2-kpi"><div class="k">${__("Gross")}</div><div class="v">${g3(t.gross)} <small>g</small></div></div>
			<div class="mb2-kpi"><div class="k">${__("Pure")}</div><div class="v">${g3(t.pure)} <small>g</small></div></div>
			<div class="mb2-kpi"><div class="k">${__("Stones")}</div><div class="v">${g3(t.ct)} <small>ct</small></div></div>`;
	}

	function select(name, label, opts, val) {
		return `<select data-f="${name}"><option value="">${label}</option>${
			opts.map((o) => `<option ${o === val ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
	}

	function paintShelf() {
		const d = S.data;
		const fc = d.facets || {};
		const rows = d.pieces || [];
		root.find(".mb2-body").html(`
			<div class="mb2-bar">
				<input class="q" placeholder="${__("card, design or HUID…")}" value="${esc(S.f.q)}">
				${select("design_type", __("Any type"), fc.design_type || [], S.f.design_type)}
				${select("karat", __("Any karat"), fc.karat || [], S.f.karat)}
				${select("status", __("Any status"), fc.status || [], S.f.status)}
				<select data-f="stone"><option value="">${__("Any stones")}</option>
					<option value="none" ${S.f.stone === "none" ? "selected" : ""}>${__("No stones")}</option>
					${(fc.stone || []).map((o) => `<option ${o === S.f.stone ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>
			</div>
			<div class="mb2-card"><div class="mb2-wrap">${rows.length ? `
				<table class="mb2-tbl"><thead><tr>
					<th>${__("Card")}</th><th>${__("Design")}</th><th>${__("Type")}</th><th>${__("Karat")}</th>
					<th class="num">${__("Gross")}</th><th class="num">${__("Pure")}</th>
					<th>${__("Stones")}</th><th>${__("Status")}</th><th>${__("HUID")}</th><th>${__("Since")}</th>
				</tr><tr class="mb2-cf">${Array.from({ length: 10 }, (_, i) =>
					`<th><input data-col="${i}" value="${esc(S.cf[i] || "")}" placeholder="${__("filter")}"></th>`).join("")}
				</tr></thead><tbody>${rows.map((p) => `
					<tr data-card="${esc(p.name)}">
						<td class="card">${esc(p.name)}</td>
						<td>${esc(p.design)}</td><td>${esc(p.design_type)}</td><td>${esc(p.karat)}</td>
						<td class="num">${g3(p.gross)}</td><td class="num">${g3(p.pure)}</td>
						<td>${p.stones.map((s) => `<span class="mb2-chip">${s.label} ${s.no ? s.no + "/" : ""}${g3(s.ct)}</span>`).join("") || "—"}</td>
						<td><span class="mb2-st ${p.status === "In Stock" ? "in" : ""}">${esc(p.status)}</span></td>
						<td>${esc(p.huid || "—")}</td><td>${esc(p.since)}</td>
					</tr>`).join("")}</tbody></table>`
				: `<div class="mb2-empty">${d.totals && d.totals.all
					? __("Nothing on this shelf matches those filters.")
					: __("This shelf is empty.")}</div>`}</div></div>`);
		applyColFilters();
	}

	// per-column filters, typed under each heading: every word must appear in
	// that column's cell; filtering is on the rows already on screen
	function applyColFilters() {
		const $rows = root.find(".mb2-tbl tbody tr");
		$rows.each(function () {
			const cells = this.children;
			const ok = Object.keys(S.cf).every((i) => {
				const want = (S.cf[i] || "").trim().toLowerCase();
				if (!want) return true;
				const txt = (cells[i] ? cells[i].textContent : "").toLowerCase();
				return want.split(/\s+/).every((w) => txt.includes(w));
			});
			this.style.display = ok ? "" : "none";
		});
	}
	root.on("input", ".mb2-cf input", function () {
		S.cf[$(this).data("col")] = this.value;
		applyColFilters();
	});

	function loadShelf() {
		return frappe.call({ method: API + ".get_my_bucket", freeze: false,
			args: Object.assign({ bucket: S.bucket }, S.f) }).then((r) => {
			const d = r.message || {};
			S.data = d;
			S.bucket = d.bucket;
			S.is_admin = d.is_admin;
			paintHead();
			if (!d.bucket) {
				root.find(".mb2-kpis").empty();
				root.find(".mb2-body").html(`<div class="mb2-empty">${d.is_admin
					? __("Pick a bucket to look at its shelf.")
					: __("You do not keep a bucket yet. A manager assigns one on Delivery Masters.")}</div>`);
				return;
			}
			root.find(".mb2-kpis").html(kpis(d.totals || {}));
			if (S.tab === "shelf") paintShelf();
		});
	}

	function paintHead() {
		root.find(".mb2-name").text(S.bucket || __("No bucket"));
		const pick = root.find(".mb2-pick");
		if (S.is_admin && (S.data.buckets || []).length) {
			pick.prop("hidden", false).html(`<option value="">${__("switch bucket…")}</option>${
				S.data.buckets.map((b) => `<option ${b === S.bucket ? "selected" : ""}>${esc(b)}</option>`).join("")}`);
		} else {
			pick.prop("hidden", true);
		}
	}

	// ---- history ---------------------------------------------------------------
	function loadHistory() {
		root.find(".mb2-body").html(`<div class="mb2-empty">${__("Reading the history…")}</div>`);
		return frappe.call({ method: API + ".get_my_bucket_history", freeze: false,
			args: { bucket: S.bucket, days: S.days } }).then((r) => {
			const h = r.message || {};
			const t = h.totals || {};
			root.find(".mb2-body").html(`
				<div class="mb2-bar">
					<select class="mb2-days">${[7, 30, 90, 180, 365].map((n) =>
						`<option value="${n}" ${n === S.days ? "selected" : ""}>${__("Last {0} days", [n])}</option>`).join("")}</select>
					<span class="mb2-count">${__("since {0}", [esc(h.since || "")])}</span>
				</div>
				<div class="mb2-kpis">
					<div class="mb2-kpi"><div class="k">${__("Made here")}</div><div class="v mb2-made">${t.made || 0}</div></div>
					<div class="mb2-kpi"><div class="k">${__("Moved in")}</div><div class="v mb2-in">${t.in || 0}</div></div>
					<div class="mb2-kpi"><div class="k">${__("Moved out")}</div><div class="v mb2-out">${t.out || 0}</div></div>
				</div>
				<div class="mb2-cols">
					<div class="mb2-card"><div class="mb2-sub">${__("By day")}</div><div class="mb2-wrap">
						${(h.days || []).length ? `<table class="mb2-tbl"><thead><tr><th>${__("Day")}</th>
							<th class="num">${__("Made")}</th><th class="num">${__("In")}</th><th class="num">${__("Out")}</th></tr></thead>
							<tbody>${h.days.map((d) => `<tr><td>${esc(d.date)}</td>
								<td class="num mb2-made">${d.made || ""}</td><td class="num mb2-in">${d.in || ""}</td>
								<td class="num mb2-out">${d.out || ""}</td></tr>`).join("")}</tbody></table>`
							: `<div class="mb2-empty">${__("Nothing moved in this window.")}</div>`}</div></div>
					<div class="mb2-card"><div class="mb2-sub">${__("Every movement")}</div><div class="mb2-wrap">
						${(h.events || []).length ? `<table class="mb2-tbl"><thead><tr><th>${__("When")}</th>
							<th>${__("Card")}</th><th>${__("What")}</th><th>${__("From / to")}</th><th>${__("By")}</th></tr></thead>
							<tbody>${h.events.map((e) => `<tr><td>${esc(e.when)}</td><td class="card">${esc(e.card)}</td>
								<td>${e.how === "made" ? `<span class="mb2-made">${__("made")}</span>`
									: (e.kind === "in" ? `<span class="mb2-in">${__("moved in")}</span>`
									: `<span class="mb2-out">${__("moved out")}</span>`)}</td>
								<td>${esc(e.other || "")}</td><td>${esc(e.by || "")}</td></tr>`).join("")}</tbody></table>`
							: `<div class="mb2-empty">${__("Nothing moved in this window.")}</div>`}</div></div>
				</div>`);
		});
	}

	// ---- events ----------------------------------------------------------------
	let qTimer = null;
	root.on("input", ".mb2-bar input.q", function () {
		S.f.q = this.value;
		clearTimeout(qTimer);
		qTimer = setTimeout(() => loadShelf().then(() => root.find(".mb2-bar input.q").trigger("focus")
			.each(function () { this.setSelectionRange(this.value.length, this.value.length); })), 250);
	});
	root.on("change", ".mb2-bar select[data-f]", function () {
		S.f[$(this).data("f")] = this.value;
		loadShelf();
	});
	root.on("change", ".mb2-pick", function () {
		if (!this.value) return;
		S.bucket = this.value;
		S.tab === "shelf" ? loadShelf() : loadShelf().then(loadHistory);
	});
	// The history is a second look at the same shelf, so it sits in the page head
	// beside Refresh rather than as a tab strip across the page. One button,
	// which says where it will take you.
	function showView(tab) {
		S.tab = tab;
		page.set_secondary_action(tab === "shelf" ? __("Came in / went out") : __("Back to the shelf"),
			() => showView(S.tab === "shelf" ? "history" : "shelf"),
			tab === "shelf" ? "history" : "list");
		if (!S.bucket) return;
		tab === "shelf" ? paintShelf() : loadHistory();
	}
	root.on("change", ".mb2-days", function () { S.days = parseInt(this.value, 10) || 30; loadHistory(); });

	page.set_primary_action(__("Refresh"), () => (S.tab === "shelf" ? loadShelf() : loadShelf().then(loadHistory)), "refresh");
	frappe.pages["my-bucket"].on_page_show = () => loadShelf();
	showView("shelf");
	loadShelf();
};
