// Selection Records — the created selections as tiles (not an ERP list). Each
// tile previews the selection and opens its 'Selection Sheet' PDF. Filter by
// party and date. Route: /app/selection-records
frappe.pages["selection-records"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Selection Records"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const g = (v, d = 3) => (v || 0).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });

	$(page.main).append(`
		<style>
		.sr-bar{display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin-bottom:14px;}
		.sr-bar .frappe-control{margin:0;}
		.sr-count{margin-left:auto;font-size:12.5px;color:var(--text-muted);font-weight:600;align-self:center;}
		.sr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px;}
		.sr-card{border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);overflow:hidden;
			cursor:pointer;transition:box-shadow .12s,transform .12s;display:flex;flex-direction:column;}
		.sr-card:hover{box-shadow:0 6px 20px rgba(0,0,0,.12);transform:translateY(-2px);}
		.sr-thumb{width:100%;aspect-ratio:4/3;object-fit:cover;background:#0d1116;display:block;}
		.sr-noimg{width:100%;aspect-ratio:4/3;display:flex;align-items:center;justify-content:center;background:var(--control-bg);color:var(--text-muted);font-size:34px;}
		.sr-b{padding:9px 12px 11px;display:flex;flex-direction:column;gap:3px;}
		.sr-top{display:flex;align-items:baseline;gap:6px;}
		.sr-party{font-weight:800;font-size:13.5px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
		.sr-id{font-family:var(--font-family-monospace,monospace);font-size:10.5px;color:var(--text-muted);}
		.sr-meta{font-size:11px;color:var(--text-muted);}
		.sr-nums{display:flex;gap:10px;margin-top:4px;font-size:11.5px;}
		.sr-nums b{font-weight:800;}
		.sr-pdf{margin-top:6px;font-size:11px;font-weight:700;color:var(--primary);display:flex;align-items:center;gap:4px;}
		.sr-none{padding:44px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:12px;}
		</style>
		<div class="sr-bar">
			<div class="sr-party"></div><div class="sr-fd"></div><div class="sr-td"></div>
			<button class="btn btn-sm btn-default sr-clear">${__("Clear")}</button>
			<span class="sr-count"></span>
		</div>
		<div class="sr-body"></div>
	`);
	const root = $(page.main);
	const mk = (sel, df) => { const c = frappe.ui.form.make_control({ df, parent: root.find(sel).get(0), render_input: true }); c.refresh(); return c; };
	const fP = mk(".sr-bar .sr-party", { fieldtype: "Link", label: __("Party"), fieldname: "p", options: "Customer" });
	const fFd = mk(".sr-fd", { fieldtype: "Date", label: __("From"), fieldname: "fd" });
	const fTd = mk(".sr-td", { fieldtype: "Date", label: __("To"), fieldname: "td" });
	[fP, fFd, fTd].forEach((f) => f.$input.on("change", () => setTimeout(load, 80)));
	root.find(".sr-clear").on("click", () => { fP.set_value(""); fFd.set_value(""); fTd.set_value(""); load(); });

	function openPdf(name) {
		window.open("/api/method/frappe.utils.print_format.download_pdf?doctype=Selection&name=" +
			encodeURIComponent(name) + "&format=" + encodeURIComponent("Selection Sheet") + "&no_letterhead=1", "_blank");
	}

	function paint(rows) {
		root.find(".sr-count").text(__("{0} selection(s)", [rows.length]));
		root.find(".sr-body").html(rows.length ? `<div class="sr-grid">${rows.map((r) => `
			<div class="sr-card" data-name="${esc(r.name)}">
				${r.preview ? `<img class="sr-thumb" src="${encodeURI(r.preview)}" onerror="this.style.display='none'">`
					: `<div class="sr-noimg">📄</div>`}
				<div class="sr-b">
					<div class="sr-top"><span class="sr-party">${esc(r.party || "—")}</span><span class="sr-id">${esc(r.name)}</span></div>
					<div class="sr-meta">${esc(r.selection_date || "")}${r.batch ? " · " + esc(r.batch) : ""}</div>
					<div class="sr-nums"><span><b>${r.total_photos || 0}</b> ${__("pcs")}</span>
						${["18k", "14k", "9k"].filter((k) => r["total_gold_" + k])
							.map((k) => `<span><b>${g(r["total_gold_" + k])}</b> g ${k.toUpperCase()}</span>`).join("")}
						<span><b>${g(r.total_cts, 2)}</b> ct</span></div>
					<div class="sr-pdf">📄 ${__("Open PDF")}</div>
				</div>
			</div>`).join("")}</div>`
			: `<div class="sr-none">${__("No selections yet — create one from Selection.")}</div>`);
	}

	function load() {
		frappe.call({ method: API + ".get_selection_records", args: {
			party: fP.get_value() || null, from_date: fFd.get_value() || null, to_date: fTd.get_value() || null,
		} }).then((r) => paint((r.message || {}).rows || []));
	}
	root.on("click", ".sr-card", function () { openPdf($(this).data("name")); });

	page.add_inner_button(__("New Selection"), () => frappe.set_route("select-photos"));
	page.add_inner_button(__("Refresh"), load);
	load();
};
