// Dye Info — one dye entry in full: which drawer, how many dyes, health, and the
// design(s) it presses — with the card's images and variants where the bank knows
// it. Arrived at by clicking a row in Dye Manage or Dye Bank; opened bare it asks
// what to look up.
frappe.pages["dye-info"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Dye Info"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));

	$(page.main).append(`
		<style>
		.dif-wrap{max-width:1000px;}
		.dif-q{width:100%;max-width:480px;border:2px solid var(--border-color);border-radius:12px;height:44px;
			font-size:16px;padding:2px 18px;background:var(--fg-color);color:var(--text-color);}
		.dif-hero{display:flex;gap:14px;flex-wrap:wrap;margin:14px 0;}
		.dif-tile{border:1px solid var(--border-color);border-radius:14px;background:var(--fg-color);
			padding:12px 18px;min-width:130px;}
		.dif-tile .k{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);font-weight:700;}
		.dif-tile .v{font-size:24px;font-weight:800;margin-top:2px;}
		.dif-tile.h .v{color:#1d7a33;} .dif-tile.d .v{color:#b02a2a;}
		.dif-card{border:1px solid var(--border-color);border-radius:14px;background:var(--fg-color);
			padding:16px;margin-bottom:14px;display:flex;gap:18px;flex-wrap:wrap;}
		.dif-imgs{display:flex;gap:10px;}
		.dif-imgs img{height:190px;border-radius:10px;border:1px solid var(--border-color);background:#fff;object-fit:contain;}
		.dif-body{flex:1 1 300px;min-width:260px;}
		.dif-no{font-weight:800;font-size:17px;font-family:var(--font-family-monospace,monospace);}
		.dif-no a{color:inherit;}
		.dif-unm{color:#b02a2a;font-size:11.5px;font-weight:700;}
		.dif-kv{font-size:12.5px;color:var(--text-muted);margin-top:6px;}
		.dif-kv b{color:var(--text-color);}
		.dif-sec{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin:12px 0 5px;}
		.dif-v{display:inline-block;border:1px solid var(--border-color);border-radius:10px;padding:2px 10px;
			font-size:11.5px;font-weight:700;margin:0 5px 5px 0;font-family:var(--font-family-monospace,monospace);}
		.dif-none{padding:40px;text-align:center;color:var(--text-muted);}
		</style>
		<div class="dif-wrap">
			<input type="text" class="dif-q" placeholder="${__("Dye code (DYE-00042) or design number…")}">
			<div class="dif-out"></div>
		</div>`);
	const root = $(page.main);

	function paint(m) {
		root.find(".dif-out").html(`
			<div class="dif-hero">
				<div class="dif-tile"><div class="k">${__("Drawer")}</div><div class="v">${esc(m.drawer || "—")}</div></div>
				<div class="dif-tile"><div class="k">${__("Dyes")}</div><div class="v">${m.dye_count}</div></div>
				<div class="dif-tile ${m.status === "Healthy" ? "h" : "d"}">
					<div class="k">${__("Health")}</div><div class="v">${esc(m.status)}</div></div>
				${m.variant_note ? `<div class="dif-tile"><div class="k">${__("Variant")}</div>
					<div class="v" style="font-size:16px;">${esc(m.variant_note)}</div></div>` : ""}
				<div class="dif-tile"><div class="k">${__("Entry")}</div>
					<div class="v" style="font-size:15px;">${esc(m.name)}</div></div>
			</div>
			${(m.designs || []).map((d) => `
				<div class="dif-card">
					${d.design_bank ? `<div class="dif-imgs">
						${d.image ? `<img src="${esc(d.image)}" title="${__("info card")}">` : ""}
						${d.photo ? `<img src="${esc(d.photo)}" title="${__("product photo")}">` : ""}
					</div>` : ""}
					<div class="dif-body">
						<div class="dif-no">${d.design_bank
							? `<a href="/app/design-bank/${encodeURIComponent(d.design_bank)}">${esc(d.card_no || d.design_no)}</a>`
							: `${esc(d.design_no)} <span class="dif-unm">${__("no card in the bank")}</span>`}</div>
						${d.design_bank ? `<div class="dif-kv">
							${__("Gross")} <b>${flt(d.gross_weight).toFixed(3)}</b> g ·
							${__("DW")} <b>${flt(d.diamond_weight).toFixed(2)}</b> ct ·
							${esc(d.card_status || "")}</div>
						<div class="dif-sec">${__("Variants ({0})", [(d.variants || []).length])}</div>
						${(d.variants || []).length
							? d.variants.map((v) => `<span class="dif-v">${esc(v)}</span>`).join("")
							: `<span style="font-size:12px;color:var(--text-muted);">${__("none yet")}</span>`}` : ""}
					</div>
				</div>`).join("")}`);
	}

	function open(name) {
		frappe.call({ method: API + ".get_dye_detail", args: { name } })
			.then((r) => paint(r.message || {}))
			.catch(() => root.find(".dif-out").html(`<div class="dif-none">${__("Could not load {0}.", [esc(name)])}</div>`));
	}

	// bare open: a dye code loads straight; a design searches the register
	root.find(".dif-q").on("keydown", function (e) {
		if (e.key !== "Enter") return;
		const q = (this.value || "").trim();
		if (!q) return;
		if (/^DYE-\d+$/i.test(q)) return open(q.toUpperCase());
		frappe.call({ method: API + ".get_dye_bank", args: { start: 0, limit: 1, q } }).then((r) => {
			const rows = (r.message || {}).rows || [];
			if (rows.length) open(rows[0].name);
			else root.find(".dif-out").html(`<div class="dif-none">${__("No dye entry found for that.")}</div>`);
		});
	});

	frappe.pages["dye-info"].on_page_show = function () {
		const pre = frappe.route_options && frappe.route_options.dye;
		if (pre) {
			frappe.route_options = null;
			root.find(".dif-q").val(pre);
			open(pre);
		}
	};
};
