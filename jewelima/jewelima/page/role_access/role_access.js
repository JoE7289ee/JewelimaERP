// Role Access — every Jewelima-made role and what it can actually do: which desk
// pages it opens, its doctype rights, and who holds it. Painted straight from the
// live permission tables, so what this page says is what the system enforces.
frappe.pages["role-access"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Role Access"), single_column: true });
	const esc = frappe.utils.escape_html;
	const S = { roles: [], q: "" };

	$(page.main).append(`
		<style>
		#page-role-access .container{max-width:100%;}
		.ra-hint{font-size:12.5px;color:var(--text-muted);margin:2px 0 12px;}
		.ra-top{display:flex;gap:10px;align-items:center;margin-bottom:12px;}
		.ra-q{width:280px;border:1px solid var(--border-color);border-radius:8px;height:32px;
			padding:2px 12px;background:var(--fg-color);color:var(--text-color);font-size:13px;}
		.ra-count{color:var(--text-muted);font-size:12px;}
		.ra-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px;}
		.ra-card{border:1px solid var(--border-color);border-radius:14px;background:var(--fg-color);padding:14px 16px;}
		.ra-nm{font-weight:800;font-size:14px;margin-bottom:2px;}
		.ra-users{font-size:11.5px;color:var(--text-muted);margin-bottom:10px;}
		.ra-users b{color:var(--text-color);}
		.ra-sec{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;
			color:var(--text-muted);margin:9px 0 4px;}
		.ra-chips{display:flex;gap:5px;flex-wrap:wrap;}
		.ra-chip{border:1px solid var(--border-color);border-radius:10px;padding:1px 9px;
			font-size:11px;background:var(--control-bg);}
		.ra-chip.pg{border-color:#1f618d33;background:#eef5fa;color:#1f618d;font-weight:600;}
		.ra-chip.full{border-color:#1d7a3333;background:#f0f8f1;color:#1d7a33;}
		.ra-chip.write{border-color:#7a5b0033;background:#fff8e6;color:#7a5b00;}
		.ra-none{font-size:11.5px;color:var(--text-muted);}
		.ra-empty{grid-column:1/-1;padding:40px;text-align:center;color:var(--text-muted);}
		</style>
		<div class="ra-hint">${__("Read from the live permission tables — what a role shows here is what it can actually do. Writes on most pages go through the page's own APIs; doctype rights below are what the role holds directly.")}</div>
		<div class="ra-top">
			<input type="text" class="ra-q" placeholder="${__("filter role / page / doctype / person…")}">
			<span class="ra-count"></span>
		</div>
		<div class="ra-grid"></div>`);

	const root = $(page.main);

	function chips(list, cls) {
		return list.length
			? `<div class="ra-chips">${list.map((x) => `<span class="ra-chip ${cls}">${esc(x)}</span>`).join("")}</div>`
			: `<span class="ra-none">${__("none")}</span>`;
	}

	function paint() {
		const q = S.q.trim().toLowerCase();
		const rows = S.roles.filter((r) => !q ||
			[r.role, ...r.pages, ...r.full, ...r.write, ...r.read, ...r.users]
				.join(" ").toLowerCase().includes(q));
		root.find(".ra-count").text(__("{0} role(s)", [rows.length]));
		root.find(".ra-grid").html(rows.map((r) => `
			<div class="ra-card">
				<div class="ra-nm">${esc(r.role)}</div>
				<div class="ra-users">${r.users.length
					? __("Held by <b>{0}</b>: {1}", [r.users.length, esc(r.users.join(", "))])
					: __("Nobody holds this role yet")}</div>
				<div class="ra-sec">${__("Opens ({0} pages)", [r.pages.length])}</div>
				${chips(r.pages, "pg")}
				${r.full.length ? `<div class="ra-sec">${__("Full control")}</div>${chips(r.full, "full")}` : ""}
				${r.write.length ? `<div class="ra-sec">${__("Can write")}</div>${chips(r.write, "write")}` : ""}
				<div class="ra-sec">${__("Read only ({0})", [r.read.length])}</div>
				${chips(r.read, "")}
			</div>`).join("") || `<div class="ra-empty">${__("Nothing matches.")}</div>`);
	}

	root.find(".ra-q").on("input", frappe.utils.debounce(function () { S.q = this.value || ""; paint(); }, 200));

	function load() {
		frappe.call({ method: "jewelima.jewelima.api.get_role_access_overview" }).then((r) => {
			S.roles = (r.message || {}).roles || [];
			paint();
		});
	}
	page.add_inner_button(__("Refresh"), load);
	frappe.pages["role-access"].on_page_show = load;
	load();
};
