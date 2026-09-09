// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Saved Imports — the OLD FORMAT sessions on their own page: one card per
// saved lot (status, pieces, party, last touched) with three actions —
// Resume (jumps to OLD FORMAT with the session loaded), Rename and Delete.
//
// MERGE is one button at the top, not one per card. A merge is a thing done TO
// a handful of lots, not a thing done BY one of them; the per-card button asked
// you to nominate a first lot before the dialog would even open, which is a
// choice the merge does not actually need.
// Route: /app/saved-imports

frappe.pages["saved-imports"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Saved Imports", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;

	$(page.main).append(`
		<style>
		#page-saved-imports .container{max-width:100%;}
		.si-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:12px;}
		.si-card{border:1px solid var(--border-color);border-radius:10px;background:var(--fg-color);padding:12px 14px;}
		.si-card .t{font-weight:800;font-size:13.5px;margin-bottom:3px;}
		.si-card .m{font-size:11.5px;color:var(--text-muted);margin-bottom:10px;}
		.si-badge{display:inline-block;border-radius:10px;padding:1px 9px;font-size:10.5px;font-weight:700;}
		.si-badge.prog{background:#fff3d6;color:#8a6d00;}
		.si-badge.done{background:#e2f4e5;color:#1d7a33;}
		.si-card button{border:none;border-radius:6px;padding:5px 16px;font-size:11.5px;font-weight:700;color:#fff;cursor:pointer;margin-right:6px;}
		.si-resume{background:#1f618d;}
		.si-ren{background:#5b3a8a;}
		.si-del{background:#8a2f2f;}
		.mg-lock{opacity:.4;}
		.si-q{display:inline-block;border:1px solid var(--border-color);border-radius:9px;
			padding:0 7px;font-size:10px;font-weight:800;letter-spacing:.04em;}
		.mg-none{padding:14px;color:var(--text-muted);font-size:12.5px;}
		.mg-sum{border:1px solid var(--border-color);border-radius:9px;padding:9px 12px;
			background:var(--control-bg);font-size:12.5px;margin-top:10px;}
		.mg-sum b{font-size:14px;}
		.si-none{padding:34px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:10px;}
		</style>
		<div class="si-body"><div class="si-none">${__("Loading…")}</div></div>
	`);
	const root = $(page.main);

	function load() {
		frappe.call({ method: API + ".list_old_format_sessions" }).then((r) => {
			const list = r.message || [];
			root.find(".si-body").html(list.length ? `<div class="si-grid">
				${list.map((x) => `<div class="si-card">
					<div class="t">${esc(x.title)}</div>
					<div class="m"><span class="si-badge ${x.status === "Exported" ? "done" : "prog"}">${esc(x.status)}</span>
						${x.quality_token ? ` <span class="si-q">${esc(x.quality_token)}</span>` : ""}
						· ${x.piece_count || 0} ${__("pcs")} · ${esc(x.party || "—")} · ${frappe.datetime.comment_when(x.modified)}</div>
					<button class="si-resume" data-name="${esc(x.name)}">${__("Resume →")}</button>
					<button class="si-ren" data-name="${esc(x.name)}" data-title="${esc(x.title)}">${__("Rename")}</button>
					<button class="si-del" data-name="${esc(x.name)}" data-title="${esc(x.title)}">${__("Delete")}</button>
				</div>`).join("")}</div>`
				: `<div class="si-none">${__("Nothing saved yet — Save a lot on the OLD FORMAT page and it shows up here.")}</div>`);
		});
	}

	// Merge lots into a NEW one, from the button at the top. Every saved lot is
	// offered; the FIRST one ticked settles the quality and the rest lock to it,
	// because a lot is priced at ONE quality and a mixed one could never be
	// priced right. Saying so by greying the others beats refusing after the pick.
	//
	// Each lot going in is asked what NAME its pieces should carry — Mysore,
	// Rajaji, Udupi. That is the per-piece shop the OLD FORMAT desk sorts and
	// prices by, and it is typed rather than picked off a list of parties: a
	// branch name is not the party the lot is billed to, and offering last
	// month's party names here only invites the wrong one. No source is touched.
	function openMerge() {
		frappe.call({ method: API + ".list_old_format_mergeable" }).then((r) => {
			const m = r.message || {};
			const all = m.candidates || [];
			if (all.length < 2) {
				return frappe.msgprint({ title: __("Nothing to merge"), indicator: "orange",
					message: __("A merge needs two saved lots. There {0}.",
						[all.length ? __("is only one") : __("are none")]) });
			}
			const byName = {};
			all.forEach((c) => { byName[c.name] = c; });
			const opts = all.map((c) => ({
				value: c.name,
				label: `${esc(c.title)} — ${c.piece_count || 0} pcs · ${esc(c.quality)}${
					c.party ? " · " + esc(c.party) : ""}`,
				checked: 0,
			}));
			const SHOPS = {};          // what has been typed, kept across re-renders

			const d = new frappe.ui.Dialog({
				title: __("Merge lots"),
				size: "large",
				fields: [
					{ fieldtype: "HTML", fieldname: "head" },
					{ fieldtype: "MultiCheck", fieldname: "lots", label: __("Lots to merge"),
						options: opts, columns: 1 },
					{ fieldtype: "HTML", fieldname: "shops", label: __("Name on the pieces") },
					{ fieldtype: "Data", fieldname: "title", label: __("Title"),
						description: __("Leave blank to name it after every lot going in.") },
					{ fieldtype: "HTML", fieldname: "sum" },
				],
				primary_action_label: __("Create merged lot"),
				primary_action(v) {
					const lots = d.get_value("lots") || [];
					// MultiCheck has no reqd of its own, so the check is here
					if (lots.length < 2) {
						return frappe.msgprint(__("Tick at least two lots to merge."));
					}
					// MultiCheck's own Select All ignores a disabled box, so the
					// quality is checked here too rather than trusting the greying
					const qs = [...new Set(lots.map((n) => (byName[n] || {}).quality))];
					if (qs.length > 1) {
						return frappe.msgprint(__("These lots are {0} — a lot is priced at ONE quality.",
							[qs.join(" and ")]));
					}
					d.hide();
					frappe.dom.freeze(__("Merging…"));
					frappe.call({ method: API + ".merge_old_format_sessions",
						args: { names: JSON.stringify(lots),
							shops: JSON.stringify(SHOPS), title: v.title || "" } })
						.then((rr) => {
							frappe.dom.unfreeze();
							const n = rr.message || {};
							const named = (n.sources || []).filter((x) => x.shop);
							frappe.show_alert({ indicator: "green", message:
								__("{0} — {1} piece(s) from {2} lots{3}. Every original is untouched.",
									[n.title, n.pieces, (n.from || []).length,
										named.length ? " · " + named.map((x) => x.shop).join(", ") : ""]) }, 8);
							load();
						}).catch(() => frappe.dom.unfreeze());
				},
			});

			d.fields_dict.head.$wrapper.html(`<div style="font-size:12.5px;color:var(--text-muted);">${
				__("Tick the lots going in. The first one picked settles the quality — a lot is priced at one quality, so the rest lock to it.")}</div>`);

			// the first tick settles the quality; everything else greys out
			const lockQuality = () => {
				const picked = d.get_value("lots") || [];
				const q = picked.length ? (byName[picked[0]] || {}).quality : null;
				d.fields_dict.lots.$wrapper.find("input[type=checkbox]").each(function () {
					const c = byName[$(this).data("unit")] || {};
					const off = !!q && c.quality !== q;
					$(this).prop("disabled", off);
					$(this).closest(".unit-checkbox, .checkbox, label").toggleClass("mg-lock", off);
				});
			};

			// one line per lot going in: which lot, and the name its pieces carry
			const paintShops = () => {
				const lots = d.get_value("lots") || [];
				d.fields_dict.shops.$wrapper.html(!lots.length ? "" : `
					<div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">${
						__("What each lot's pieces are called in the merged lot. Leave one blank to leave those pieces as they are.")}</div>
					<table class="mg-shops" style="width:100%;font-size:12.5px;">${lots.map((n, i) => `
						<tr>
							<td style="padding:2px 8px 2px 0;color:var(--text-muted);width:22px;">${i + 1}</td>
							<td style="padding:2px 8px 2px 0;">${esc((byName[n] || {}).title || n)}
								<span style="color:var(--text-muted);">· ${(byName[n] || {}).piece_count || 0} pcs</span></td>
							<td style="padding:2px 0;width:150px;"><input class="form-control input-xs mg-shop"
								data-lot="${esc(n)}" style="text-transform:uppercase;"
								placeholder="${__("name")}" value="${esc(SHOPS[n] || "")}"></td>
						</tr>`).join("")}</table>`);
			};
			d.fields_dict.shops.$wrapper.on("input", ".mg-shop", function () {
				SHOPS[$(this).data("lot")] = (this.value || "").trim().toUpperCase();
			});

			const paintSum = () => {
				const lots = d.get_value("lots") || [];
				const sums = lots.map((n) => (byName[n] || {}).piece_count || 0);
				const tot = sums.reduce((a, b) => a + b, 0);
				d.fields_dict.sum.$wrapper.html(lots.length >= 2
					? `<div class="mg-sum">${__("New lot")}: <b>${tot}</b> ${__("piece(s)")} — ${
						sums.join(" + ")}<br><span style="color:var(--text-muted);">${
						lots.map((n) => esc((byName[n] || {}).title || n)).join(" + ")}</span></div>`
					: `<div class="mg-sum" style="color:var(--text-muted);">${
						__("Tick at least two lots.")}</div>`);
			};
			d.fields_dict.lots.$wrapper.on("change", "input[type=checkbox]", () => {
				lockQuality();
				paintShops();
				paintSum();
			});
			d.show();
			paintSum();
		});
	}
	page.set_primary_action(__("Merge lots…"), openMerge);

	// A lot imported from a file is named after the file, which is rarely what
	// the floor calls it — and a merged lot is named after everything that went
	// into it, which is long. Renaming touches the title and nothing else.
	root.on("click", ".si-ren", function () {
		const name = $(this).data("name");
		const title = $(this).data("title");
		frappe.prompt(
			[{ fieldname: "title", fieldtype: "Data", label: __("Name"), reqd: 1, default: title }],
			(v) => {
				const t = (v.title || "").trim();
				if (!t || t === title) return;
				frappe.call({ method: API + ".rename_old_format_session",
					args: { name, title: t } }).then((r) => {
					frappe.show_alert({ indicator: "green",
						message: __("Renamed to {0}.", [(r.message || {}).title || t]) }, 5);
					load();
				});
			},
			__("Rename {0}", [title]), __("Rename"));
	});

	root.on("click", ".si-resume", function () {
		frappe.route_options = { session: $(this).data("name") };
		frappe.set_route("old-format");
	});

	root.on("click", ".si-del", function () {
		const name = $(this).data("name");
		const title = $(this).data("title");
		frappe.confirm(__("Delete the saved import <b>{0}</b> ({1})? This cannot be undone.", [esc(title), esc(name)]), () => {
			frappe.call({ method: API + ".delete_old_format_session", args: { name } }).then(() => {
				frappe.show_alert({ message: __("{0} deleted.", [name]), indicator: "green" }, 3);
				load();
			});
		});
	});

	load();
};
