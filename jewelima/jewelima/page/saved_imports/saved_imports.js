// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Saved Imports — the OLD FORMAT sessions on their own page: one card per
// saved lot (status, pieces, party, last touched) with exactly two actions —
// Resume (jumps to OLD FORMAT with the session loaded) and Delete.
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
		.si-del{background:#8a2f2f;}
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
						· ${x.piece_count || 0} ${__("pcs")} · ${esc(x.party || "—")} · ${frappe.datetime.comment_when(x.modified)}</div>
					<button class="si-resume" data-name="${esc(x.name)}">${__("Resume →")}</button>
					<button class="si-del" data-name="${esc(x.name)}" data-title="${esc(x.title)}">${__("Delete")}</button>
				</div>`).join("")}</div>`
				: `<div class="si-none">${__("Nothing saved yet — Save a lot on the OLD FORMAT page and it shows up here.")}</div>`);
		});
	}

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
