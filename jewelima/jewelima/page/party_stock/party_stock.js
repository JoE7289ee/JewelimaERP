// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Stock by Party (Delivery) — whose pieces are these, and how many.
//
// A party's name IS its classification: GROUP-ZONE-DISTRICT-STATE, optionally a
// SPECIAL, and it may still answer to an OLD NAME from before the codes existed.
// Each of those is how somebody actually asks — "how much is out with the TJ
// group", "what is sitting in Thrissur", "what does the old WHOLESALE account
// hold" — so each of them is a filter here, and they combine.
//
// The groups run across the top because that is the question asked most; the
// table below is every party the filters leave standing.
// Route: /app/party-stock

frappe.pages["party-stock"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Stock by Party"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const f3 = (n) => flt(n).toFixed(3);
	const root = $(page.main);
	const S = { data: null, f: { group: "", zone: "", district: "", state: "", special: "",
		old_name: "", party: "", search: "", status: "In Stock" } };

	root.append(`
		<style>
		#page-party-stock .container{max-width:100%;}
		.ps-groups{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:13px;}
		.ps-g{border:1px solid var(--border-color);border-radius:11px;padding:8px 15px;background:var(--fg-color);
			cursor:pointer;min-width:104px;transition:border-color .12s;}
		.ps-g:hover{border-color:#1f618d;}
		.ps-g.on{border-color:#1f618d;box-shadow:inset 0 0 0 1px #1f618d;background:rgba(31,97,141,.07);}
		.ps-g .n{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);}
		.ps-g .p{font-size:19px;font-weight:800;line-height:1.15;}
		.ps-g .s{font-size:10.5px;color:var(--text-muted);}
		.ps-tiles{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px;}
		.ps-tile{border:1px solid var(--border-color);border-radius:12px;padding:10px 20px;
			background:var(--fg-color);min-width:118px;}
		.ps-tile .k{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;}
		.ps-tile .v{font-size:22px;font-weight:800;}
		.ps-tile.pure .v{color:#1f618d;}
		.ps-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px;}
		.ps-bar select,.ps-q{border:1px solid var(--border-color);border-radius:8px;height:31px;
			padding:2px 10px;background:var(--fg-color);color:var(--text-color);font-size:12.5px;max-width:190px;}
		.ps-q{width:200px;}
		.ps-clear{border:none;background:none;color:#1f618d;cursor:pointer;font-size:12px;text-decoration:underline;}
		.ps-box{border:1px solid var(--border-color);border-radius:12px;overflow:auto;background:var(--fg-color);
			max-height:calc(100vh - 340px);}
		table.ps-t{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.ps-t th{position:sticky;top:0;background:var(--control-bg);font-size:10px;text-transform:uppercase;
			color:var(--text-muted);padding:7px 10px;text-align:left;border-bottom:2px solid var(--border-color);white-space:nowrap;}
		table.ps-t td{padding:6px 10px;border-bottom:1px solid var(--border-color);}
		table.ps-t td.num{text-align:right;font-variant-numeric:tabular-nums;}
		table.ps-t tr:hover td{background:var(--control-bg);}
		.ps-party{font-weight:700;color:#1f618d;cursor:pointer;}
		.ps-sub{font-size:10.5px;color:var(--text-muted);}
		.ps-none{padding:34px;text-align:center;color:var(--text-muted);}
		</style>
		<div class="ps-bar">
			<select class="ps-f" data-f="status">
				<option value="In Stock">${__("In stock")}</option>
				<option value="At Certification">${__("At certification")}</option>
				<option value="At Hallmarking">${__("At hallmarking")}</option>
				<option value="Sold">${__("Sold")}</option>
			</select>
			<select class="ps-f" data-f="group"><option value="">${__("— group —")}</option></select>
			<select class="ps-f" data-f="zone"><option value="">${__("— zone —")}</option></select>
			<select class="ps-f" data-f="district"><option value="">${__("— district —")}</option></select>
			<select class="ps-f" data-f="state"><option value="">${__("— state —")}</option></select>
			<select class="ps-f" data-f="special"><option value="">${__("— special —")}</option></select>
			<select class="ps-f" data-f="old_name"><option value="">${__("— old name —")}</option></select>
			<input type="text" class="ps-q" placeholder="${__("search party…")}">
			<button class="ps-clear" style="display:none;">${__("clear filters")}</button>
		</div>
		<div class="ps-groups"></div>
		<div class="ps-tiles"></div>
		<div class="ps-box"><table class="ps-t"><thead><tr>
			<th>${__("Party")}</th><th>${__("Group")}</th><th>${__("Zone")}</th>
			<th>${__("District")}</th><th>${__("State")}</th>
			<th class="num">${__("Pieces")}</th><th class="num">${__("Gross g")}</th>
			<th class="num">${__("Diamond ct")}</th>
		</tr></thead><tbody class="ps-body"></tbody></table></div>
	`);

	const anyFilter = () => Object.entries(S.f).some(([k, v]) => v && k !== "status");
	// the masters read "TCR - Thrissur"; the code alone is what the name is built from
	const short = (v) => String(v || "").split(" - ")[0];

	function paint() {
		const d = S.data || { rows: [], groups: [], totals: {} };
		const t = d.totals || {};
		root.find(".ps-groups").html((d.groups || []).map((g) => `
			<div class="ps-g ${S.f.group === g.group ? "on" : ""}" data-g="${esc(g.group)}">
				<div class="n">${esc(g.group)}</div>
				<div class="p">${g.pieces}</div>
				<div class="s">${g.parties} ${__("part(ies)")} · ${f3(g.gross)} g</div>
			</div>`).join("") || `<span class="ps-sub">${__("nothing to group")}</span>`);

		root.find(".ps-tiles").html(`
			<div class="ps-tile"><div class="k">${__("Pieces")}</div><div class="v">${t.pieces || 0}</div></div>
			<div class="ps-tile"><div class="k">${__("Parties")}</div><div class="v">${t.parties || 0}</div></div>
			<div class="ps-tile"><div class="k">${__("Gross")}</div><div class="v">${f3(t.gross)}<span style="font-size:12px;"> g</span></div></div>
			<div class="ps-tile pure"><div class="k">${__("Pure gold")}</div><div class="v">${f3(t.pure)}<span style="font-size:12px;"> g</span></div></div>
			<div class="ps-tile"><div class="k">${__("Diamond")}</div><div class="v">${f3(t.dmd_ct)}<span style="font-size:12px;"> ct</span></div></div>`);

		root.find(".ps-body").html((d.rows || []).map((r) => `
			<tr>
				<td><span class="ps-party" data-p="${esc(r.party)}">${esc(r.party)}</span>
					${r.special ? `<div class="ps-sub">${esc(r.special)}</div>` : ""}</td>
				<td>${esc(r.group || "—")}</td>
				<td>${esc(short(r.zone) || "—")}<div class="ps-sub">${esc((r.zone || "").split(" - ")[1] || "")}</div></td>
				<td>${esc(short(r.district) || "—")}<div class="ps-sub">${esc((r.district || "").split(" - ")[1] || "")}</div></td>
				<td>${esc(short(r.state) || "—")}</td>
				<td class="num">${r.pieces}</td>
				<td class="num">${f3(r.gross)}</td>
				<td class="num">${r.dmd_ct ? f3(r.dmd_ct) : "—"}</td>
			</tr>`).join("") || `<tr><td colspan="8" class="ps-none">${
				anyFilter() ? __("No party matches these filters.")
					: __("Nobody is holding {0} pieces.", [String(S.f.status).toLowerCase()])}</td></tr>`);
		root.find(".ps-clear").toggle(anyFilter());
	}

	function fill(f, blank, list) {
		root.find(`.ps-f[data-f="${f}"]`).html(`<option value="">${blank}</option>`
			+ (list || []).map((v) => `<option ${v === S.f[f] ? "selected" : ""}>${esc(v)}</option>`).join(""));
	}

	function load() {
		jewelima.busyCall(root.find(".ps-box"), __("Counting…"),
			{ method: API + ".get_party_stock", freeze: false, args: Object.assign({}, S.f) })
			.then((r) => {
				S.data = r.message || {};
				const o = S.data.options || {};
				fill("group", __("— group —"), o.group);
				fill("zone", __("— zone —"), o.zone);
				fill("district", __("— district —"), o.district);
				fill("state", __("— state —"), o.state);
				fill("special", __("— special —"), o.special);
				fill("old_name", __("— old name —"), o.old_names);
				root.find(`.ps-f[data-f="status"]`).val(S.f.status);
				paint();
			});
	}

	root.on("change", ".ps-f", function () { S.f[this.dataset.f] = this.value; load(); });
	root.find(".ps-q").on("input", frappe.utils.debounce(function () {
		S.f.search = this.value || ""; load();
	}, 350));
	root.on("click", ".ps-g", function () {
		const g = $(this).data("g") || "";
		S.f.group = (S.f.group === g) ? "" : g;   // clicking the live one clears it
		load();
	});
	root.on("click", ".ps-clear", function () {
		Object.keys(S.f).forEach((k) => { if (k !== "status") S.f[k] = ""; });
		root.find(".ps-q").val("");
		load();
	});
	// a party name is a link to the party itself
	root.on("click", ".ps-party", function () {
		frappe.route_options = { party: $(this).data("p") };
		frappe.set_route("parties");
	});

	page.set_primary_action(__("Refresh"), load, "refresh");
	frappe.pages["party-stock"].on_page_show = load;
	load();
};
