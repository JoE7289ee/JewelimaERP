// Dye Find — type a design, see every drawer holding its dyes. Built for the
// person standing at the cabinets: big search, instant answer.
frappe.pages["dye-find"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Dye Find"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;

	$(page.main).append(`
		<style>
		.df-wrap{max-width:900px;margin:0 auto;}
		.df-q{width:100%;border:2px solid var(--border-color);border-radius:14px;height:52px;font-size:19px;
			padding:2px 22px;background:var(--fg-color);color:var(--text-color);}
		.df-q:focus{outline:none;border-color:#1f618d;}
		.df-hint{text-align:center;color:var(--text-muted);font-size:12px;margin:8px 0 18px;}
		.df-g{border:1px solid var(--border-color);border-radius:14px;background:var(--fg-color);padding:14px 16px;margin-bottom:12px;}
		.df-nm{font-weight:800;font-size:16px;font-family:var(--font-family-monospace,monospace);}
		.df-nm a{color:inherit;}
		.df-unm{color:#b02a2a;font-size:11px;font-weight:700;margin-left:8px;}
		.df-row{display:flex;gap:12px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border-color);font-size:13px;}
		.df-row:last-child{border-bottom:none;}
		.df-drawer{font-size:17px;font-weight:800;min-width:110px;}
		.df-st{border-radius:10px;padding:1px 9px;font-size:10.5px;font-weight:800;}
		.df-st.h{background:#f0f8f1;color:#1d7a33;}
		.df-st.d{background:#fdf0f0;color:#b02a2a;}
		.df-none{text-align:center;padding:44px;color:var(--text-muted);}
		</style>
		<div class="df-wrap">
			<input type="text" class="df-q" placeholder="${__("Design number — A 13405, AA4001, B 7…")}" autofocus>
			<div class="df-hint">${__("spaces and slashes don't matter — 187 drawers answer as you type")}</div>
			<div class="df-out"></div>
		</div>`);
	const root = $(page.main);

	function paint(groups) {
		root.find(".df-out").html((groups || []).length ? groups.map((gp) => {
			const byDrawer = {};
			gp.dyes.forEach((d) => (byDrawer[d.drawer] = byDrawer[d.drawer] || []).push(d));
			const totalDyes = gp.dyes.reduce((a, d) => a + (d.count || 1), 0);
			return `<div class="df-g">
				<div class="df-nm">${gp.design_bank
					? `<a href="/app/design-bank/${encodeURIComponent(gp.design_bank)}">${esc(gp.design_no)}</a>`
					: `${esc(gp.design_no)}<span class="df-unm">${__("no card in the bank")}</span>`}
					<span style="font-weight:400;color:var(--text-muted);font-size:12px;"> · ${totalDyes} ${__("dye(s)")}</span></div>
				${Object.keys(byDrawer).map((dr) => `
					<div class="df-row">
						<span class="df-drawer">${__("Drawer")} ${esc(dr)}</span>
						<span>${byDrawer[dr].reduce((a, d) => a + (d.count || 1), 0)} ${__("dye(s)")}</span>
						${byDrawer[dr].map((d) => `<span class="df-st ${d.status === "Healthy" ? "h" : "d"}"
							title="${esc(d.dye)}">${esc(d.status)}${d.note ? " · " + esc(d.note) : ""}</span>`).join("")}
					</div>`).join("")}
			</div>`;
		}).join("") : `<div class="df-none">${__("Nothing found for that.")}</div>`);
	}

	root.find(".df-q").on("input", frappe.utils.debounce(function () {
		const q = (this.value || "").trim();
		if (q.length < 2) return root.find(".df-out").empty();
		frappe.call({ method: API + ".dye_find", args: { q }, freeze: false })
			.then((r) => paint((r.message || {}).groups || []));
	}, 250));
};
