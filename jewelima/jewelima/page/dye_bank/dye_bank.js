// Dye Bank — every pressing dye we own: where it sits, what it presses, and
// whether it is fit to use. Status flips right here; ticked rows flip together.
frappe.pages["dye-bank"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Dye Bank"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const S = { start: 0, limit: 100, total: 0, q: "", status: "", drawer: "", unmatched: 0, sel: new Set() };

	$(page.main).append(`
		<style>
		#page-dye-bank .container{max-width:100%;}
		.dy-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px;}
		.dy-tools input,.dy-tools select{border:1px solid var(--border-color);border-radius:8px;height:32px;
			padding:2px 10px;background:var(--fg-color);color:var(--text-color);font-size:13px;}
		.dy-q{min-width:240px;}
		.dy-count{margin-left:auto;color:var(--text-muted);font-size:12px;}
		.dy-box{border:1px solid var(--border-color);border-radius:12px;overflow:auto;background:var(--fg-color);max-height:calc(100vh - 240px);}
		table.dy-t{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.dy-t th{position:sticky;top:0;background:var(--control-bg);font-size:10px;text-transform:uppercase;
			color:var(--text-muted);padding:6px 10px;text-align:left;border-bottom:2px solid var(--border-color);white-space:nowrap;}
		table.dy-t td{padding:5px 10px;border-bottom:1px solid var(--border-color);white-space:nowrap;}
		.dy-st{border-radius:10px;padding:1px 9px;font-size:10.5px;font-weight:800;cursor:pointer;display:inline-block;}
		.dy-st.h{background:#f0f8f1;color:#1d7a33;border:1px solid #1d7a3344;}
		.dy-st.d{background:#fdf0f0;color:#b02a2a;border:1px solid #b02a2a44;}
		.dy-unm{color:#b02a2a;font-size:10px;font-weight:700;}
		.dy-acts{display:flex;gap:8px;align-items:center;margin-top:10px;}
		.dy-more{text-align:center;margin:12px 0;}
		</style>
		<div class="dy-tools">
			<input type="text" class="dy-q" placeholder="${__("search a design number…")}">
			<select class="dy-status"><option value="">${__("Any status")}</option>
				<option>Healthy</option><option>Damaged</option></select>
			<select class="dy-drawer"><option value="">${__("Any drawer")}</option></select>
			<label style="display:inline-flex;gap:6px;align-items:center;font-size:12px;">
				<input type="checkbox" class="dy-unmatched" style="width:14px;height:14px;">${__("unmatched only")}</label>
			<span class="dy-count"></span>
		</div>
		<div class="dy-box"><table class="dy-t"><thead><tr>
			<th style="width:26px;"><input type="checkbox" class="dy-all" style="width:14px;height:14px;"></th>
			<th>${__("Dye")}</th><th>${__("Drawer")}</th><th>${__("SL")}</th><th>${__("Design(s)")}</th>
			<th>${__("Variant")}</th><th>${__("Status")}</th>
		</tr></thead><tbody class="dy-body"></tbody></table></div>
		<div class="dy-acts" style="display:none;">
			<span class="dy-seln" style="font-size:12px;font-weight:700;"></span>
			<button class="btn btn-xs btn-default dy-mk-h" style="color:#1d7a33;">${__("Mark Healthy")}</button>
			<button class="btn btn-xs btn-default dy-mk-d" style="color:#b02a2a;">${__("Mark Damaged")}</button>
		</div>
		<div class="dy-more"></div>`);
	const root = $(page.main);

	function paintRows(rows, append) {
		const html = rows.map((r) => {
			const banks = (r.banks || "").split("|");
			const designs = (r.design_nos || "").split(" | ").map((d, i) =>
				banks[i] ? `<a href="/app/design-bank/${encodeURIComponent(banks[i])}"><b>${esc(d)}</b></a>`
					: `${esc(d)} <span class="dy-unm">${__("no card")}</span>`).join(" · ");
			return `<tr data-n="${esc(r.name)}">
				<td><input type="checkbox" class="dy-cb" ${S.sel.has(r.name) ? "checked" : ""} style="width:14px;height:14px;"></td>
				<td>${esc(r.name)}</td>
				<td><b>${esc(r.drawer || "—")}</b></td>
				<td>${r.sl_no || ""}</td>
				<td>${designs}</td>
				<td>${esc(r.variant_note || "")}</td>
				<td><span class="dy-st ${r.status === "Healthy" ? "h" : "d"}" title="${__("click to flip")}">${esc(r.status)}</span></td>
			</tr>`;
		}).join("");
		if (append) root.find(".dy-body").append(html);
		else root.find(".dy-body").html(html || `<tr><td colspan="7" style="padding:30px;text-align:center;color:var(--text-muted);">${__("Nothing matches.")}</td></tr>`);
		root.find(".dy-count").text(__("{0} dye(s)", [S.total]));
		root.find(".dy-more").html((S.start < S.total)
			? `<button class="btn btn-sm btn-default dy-load">${__("Show more")} (${Math.min(S.start, S.total)}/${S.total})</button>` : "");
		paintSel();
	}
	function paintSel() {
		root.find(".dy-acts").toggle(S.sel.size > 0);
		root.find(".dy-seln").text(__("{0} ticked", [S.sel.size]));
	}
	function load(reset) {
		if (reset) { S.start = 0; S.sel.clear(); }
		frappe.call({ method: API + ".get_dye_bank", freeze: false, args: {
			start: S.start, limit: S.limit, q: S.q || null, status: S.status || null,
			drawer: S.drawer || null, unmatched: S.unmatched ? 1 : 0,
		} }).then((r) => {
			const m = r.message || { rows: [], total: 0 };
			S.total = m.total;
			paintRows(m.rows || [], !reset);
			S.start += S.limit;
		});
	}

	root.find(".dy-q").on("input", frappe.utils.debounce(function () { S.q = this.value; load(true); }, 300));
	root.find(".dy-status").on("change", function () { S.status = this.value; load(true); });
	root.find(".dy-drawer").on("change", function () { S.drawer = this.value; load(true); });
	root.find(".dy-unmatched").on("change", function () { S.unmatched = this.checked; load(true); });
	root.on("click", ".dy-load", () => load(false));
	root.on("change", ".dy-cb", function () {
		const n = $(this).closest("tr").data("n");
		this.checked ? S.sel.add(n) : S.sel.delete(n);
		paintSel();
	});
	root.on("change", ".dy-all", function () {
		const on = this.checked;
		root.find(".dy-cb").each(function () {
			this.checked = on;
			const n = $(this).closest("tr").data("n");
			on ? S.sel.add(n) : S.sel.delete(n);
		});
		paintSel();
	});
	function setStatus(names, status) {
		frappe.call({ method: API + ".set_dye_status", args: { names: JSON.stringify(names), status } })
			.then(() => { frappe.show_alert({ message: __("{0} → {1}", [names.length, status]), indicator: "green" }, 3); load(true); });
	}
	root.on("click", ".dy-st", function () {
		const n = $(this).closest("tr").data("n");
		setStatus([n], $(this).hasClass("h") ? "Damaged" : "Healthy");
	});
	root.on("click", ".dy-mk-h", () => setStatus([...S.sel], "Healthy"));
	root.on("click", ".dy-mk-d", () => setStatus([...S.sel], "Damaged"));

	frappe.db.get_list("Dye Drawer", { fields: ["name"], limit: 0 }).then((rows) => {
		const ds = (rows || []).map((x) => x.name).sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0));
		root.find(".dy-drawer").append(ds.map((d) => `<option>${esc(d)}</option>`).join(""));
	});
	frappe.pages["dye-bank"].on_page_show = () => load(true);
	load(true);
};
