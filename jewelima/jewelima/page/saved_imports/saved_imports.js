// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Saved Imports — the OLD FORMAT sessions on their own page: one card per
// saved lot (status, pieces, party, last touched) with three actions —
// Resume (jumps to OLD FORMAT with the session loaded), Merge, and Delete.
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
		.si-merge{background:#5b3a8a;}
		.si-del{background:#8a2f2f;}
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
					<button class="si-merge" data-name="${esc(x.name)}" data-title="${esc(x.title)}">${__("Merge…")}</button>
					<button class="si-del" data-name="${esc(x.name)}" data-title="${esc(x.title)}">${__("Delete")}</button>
				</div>`).join("")}</div>`
				: `<div class="si-none">${__("Nothing saved yet — Save a lot on the OLD FORMAT page and it shows up here.")}</div>`);
		});
	}

	// Merge lots into a NEW one. The dialog offers only lots of the SAME quality
	// — a lot is priced at one quality, so a mixed one could never be priced
	// right, and showing only the valid partners says that better than refusing
	// after the pick does. Tick as many as you like: three branches' lots going
	// into one is the normal case, and merging them in pairs would leave a
	// throwaway lot behind on the way.
	//
	// Each lot going in is asked what NAME its pieces should carry — Mysore,
	// Rajaji, Udupi. That is the per-piece shop the OLD FORMAT desk sorts and
	// prices by, and it is typed rather than picked off a list of parties: a
	// branch name is not the party the lot is billed to, and offering last
	// month's party names here only invites the wrong one. No source is touched.
	root.on("click", ".si-merge", function () {
		const name = $(this).data("name");
		frappe.call({ method: API + ".list_old_format_mergeable", args: { name } }).then((r) => {
			const m = r.message || {};
			if (!(m.candidates || []).length) {
				return frappe.msgprint({ title: __("Nothing to merge with"), indicator: "orange",
					message: __("No other saved lot is {0}. A lot is priced at one quality, so only {0} lots can join this one.", [m.quality]) });
			}
			const byName = { [name]: { name, title: m.title, piece_count: m.pieces } };
			(m.candidates || []).forEach((c) => { byName[c.name] = c; });
			const opts = m.candidates.map((c) => ({
				value: c.name,
				label: `${esc(c.title)} — ${c.piece_count || 0} pcs${c.party ? " · " + esc(c.party) : ""}`,
				checked: 0,
			}));
			// what has been typed so far, kept across re-renders — reticking a lot
			// must not throw away the name already put against it
			const SHOPS = {};
			const going = () => [name].concat(d.get_value("others") || []);

			const d = new frappe.ui.Dialog({
				title: __("Merge {0}", [m.title]),
				fields: [
					{ fieldtype: "HTML", fieldname: "head" },
					{ fieldtype: "MultiCheck", fieldname: "others", label: __("Merge with"),
						options: opts, columns: 1 },
					{ fieldtype: "HTML", fieldname: "shops", label: __("Name on the pieces") },
					{ fieldtype: "Data", fieldname: "title", label: __("Title"),
						description: __("Leave blank to name it after every lot going in.") },
					{ fieldtype: "HTML", fieldname: "sum" },
				],
				primary_action_label: __("Create merged lot"),
				primary_action(v) {
					const others = d.get_value("others") || [];
					// MultiCheck has no reqd of its own, so the check is here
					if (!others.length) {
						return frappe.msgprint(__("Tick at least one lot to merge with {0}.", [m.title]));
					}
					d.hide();
					frappe.dom.freeze(__("Merging…"));
					frappe.call({ method: API + ".merge_old_format_sessions",
						args: { names: JSON.stringify(going()),
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
				__("{0} — {1} piece(s), quality <b>{2}</b>. Only {2} lots are offered below.",
					[esc(m.title), m.pieces, esc(m.quality)])}</div>`);

			// one line per lot going in: which lot, and the name its pieces carry
			const paintShops = () => {
				const lots = going();
				d.fields_dict.shops.$wrapper.html(`
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
				const picked = d.get_value("others") || [];
				const parts = [m.title].concat(picked.map((p) => (byName[p] || {}).title || p));
				const sums = [m.pieces].concat(picked.map((p) => (byName[p] || {}).piece_count || 0));
				const tot = sums.reduce((a, b) => a + b, 0);
				d.fields_dict.sum.$wrapper.html(picked.length
					? `<div class="mg-sum">${__("New lot")}: <b>${tot}</b> ${__("piece(s)")} — ${
						sums.join(" + ")}<br><span style="color:var(--text-muted);">${
						parts.map(esc).join(" + ")}</span></div>`
					: `<div class="mg-sum" style="color:var(--text-muted);">${
						__("Tick the lots to merge into {0}.", [esc(m.title)])}</div>`);
			};
			d.fields_dict.others.$wrapper.on("change", "input[type=checkbox]", () => {
				paintShops();
				paintSum();
			});
			d.show();
			paintShops();
			paintSum();
		});
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
