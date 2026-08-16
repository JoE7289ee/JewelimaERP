// Look-Up Party — type a legacy old name, see the new party name(s) it maps to,
// or "not created" when there's no match yet.
// Route: /app/look-up-party
frappe.pages["look-up-party"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Look-Up Party"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;

	$(page.main).append(`
		<style>
		.lp-wrap{max-width:560px;}
		.lp-row{display:flex;gap:8px;align-items:end;margin-bottom:16px;}
		.lp-row .frappe-control{margin:0;flex:1;}
		.lp-out{border:1px solid var(--border-color);border-radius:10px;background:var(--fg-color);padding:22px 24px;min-height:80px;display:none;}
		.lp-old{font-size:12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;}
		.lp-new{font-size:22px;font-weight:800;letter-spacing:.02em;margin-top:4px;}
		.lp-new a{color:#1f618d;}
		.lp-multi{margin-top:6px;}
		.lp-multi .lp-new{font-size:18px;margin:2px 0;}
		.lp-none{font-size:16px;font-weight:700;color:#b02a2a;}
		.lp-pending{font-size:16px;font-weight:700;color:#b4690e;}
		</style>
		<div class="lp-wrap">
			<div class="lp-row"><div class="lp-in"></div>
				<button class="btn btn-primary lp-go">${__("Look up")}</button></div>
			<div class="lp-out"></div>
		</div>
	`);
	const root = $(page.main);
	const inp = frappe.ui.form.make_control({
		df: { fieldtype: "Data", label: __("Old name"), fieldname: "old", placeholder: __("e.g. AKKARA K.CHIRA") },
		parent: root.find(".lp-in").get(0), render_input: true });
	inp.refresh();

	function show(html) { root.find(".lp-out").html(html).show(); }

	function lookup() {
		const q = (inp.get_value() || "").trim();
		if (!q) { root.find(".lp-out").hide(); return; }
		frappe.call({ method: API + ".lookup_old_name", args: { old_name: q } }).then((r) => {
			const d = r.message || {};
			if (!d.found) {
				show(`<div class="lp-old">${esc(q)}</div><div class="lp-none">${__("Not created")}</div>
					<div style="color:var(--text-muted);font-size:12.5px;margin-top:4px;">${__("No party recorded under this old name.")}</div>`);
				return;
			}
			if (!d.parties.length) {
				show(`<div class="lp-old">${esc(d.old_name)}</div><div class="lp-pending">${__("Not created yet")}</div>
					<div style="color:var(--text-muted);font-size:12.5px;margin-top:4px;">${__("Old name is on record but has no new party assigned.")}</div>`);
				return;
			}
			const link = (nm) => `<a href="/app/parties?party=${encodeURIComponent(nm)}">${esc(nm)}</a>`;
			if (d.parties.length === 1) {
				show(`<div class="lp-old">${esc(d.old_name)} →</div><div class="lp-new">${link(d.parties[0])}</div>`);
			} else {
				show(`<div class="lp-old">${esc(d.old_name)} → ${d.parties.length} ${__("parties")}</div>
					<div class="lp-multi">${d.parties.map((p) => `<div class="lp-new">${link(p)}</div>`).join("")}</div>`);
			}
		});
	}
	root.find(".lp-go").on("click", lookup);
	inp.$input.on("keydown", (e) => { if (e.key === "Enter") lookup(); });
};
