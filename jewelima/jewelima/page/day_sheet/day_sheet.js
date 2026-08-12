// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Day Sheet (Reports) — pick a date, see that day's sealed 4-page sheet right
// on screen, print it or grab the PDF. The HTML comes from the 'Day Sheet'
// print format server-side, so page / print / PDF are always the SAME sheet.
// Days are sealed nightly at 23:45; managers can (re)build any date here.
// Route: /app/day-sheet

frappe.pages["day-sheet"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Day Sheet", single_column: true });
	const API = "jewelima.jewelima.api";
	const S = { date: "", html: "" };

	$(page.main).append(`
		<style>
		#page-day-sheet .container{max-width:100%;}
		.dsp-bar{display:flex;gap:10px;align-items:end;margin-bottom:14px;}
		.dsp-bar .frappe-control{margin:0;flex:0 0 220px;}
		.dsp-bar .control-label{font-size:11px;color:var(--text-muted);}
		.dsp-view{border:1px solid var(--border-color);border-radius:10px;background:#fff;color:#1a1a1a;
			padding:26px 34px;max-width:960px;box-shadow:0 2px 14px rgba(0,0,0,.06);}
		.dsp-view .brk{border-bottom:2px dashed #c9d1d9;margin:22px 0;position:relative;}
		.dsp-view .brk:after{content:"page break";position:absolute;right:0;top:-8px;font-size:9px;color:#9aa6b2;background:#fff;padding:0 6px;}
		.dsp-empty{padding:50px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:10px;max-width:960px;}
		</style>
		<div class="dsp-bar">
			<div class="dsp-date"></div>
			<button class="btn btn-primary dsp-print" style="display:none;">${__("Print")}</button>
			<button class="btn btn-default dsp-pdf" style="display:none;">${__("PDF")}</button>
			<button class="btn btn-default dsp-rebuild" style="display:none;">${__("Rebuild this day")}</button>
		</div>
		<div class="dsp-body"></div>
	`);
	const root = $(page.main);

	const dateCtl = frappe.ui.form.make_control({
		df: { fieldtype: "Date", label: __("Date"), fieldname: "date", reqd: 1,
			description: __("Days seal automatically at 23:45.") },
		parent: root.find(".dsp-date").get(0), render_input: true,
	});
	dateCtl.refresh();
	dateCtl.$input.on("change", () => fetch());

	function fetch() {
		const d = dateCtl.get_value();
		if (!d) return;
		S.date = d;
		frappe.call({ method: API + ".get_day_sheet_html", args: { date: d } }).then((r) => {
			const m = r.message || {};
			if (!m.exists) {
				S.html = "";
				root.find(".dsp-body").html(`<div class="dsp-empty">${__("No Day Record for {0} yet — the nightly job seals days at 23:45.", [frappe.datetime.str_to_user(d)])}</div>`);
				root.find(".dsp-print,.dsp-pdf").hide();
				const canBuild = (frappe.user.has_role("System Manager") || frappe.user.has_role("JW Manager")) || frappe.user.has_role("Stock Manager");
				root.find(".dsp-rebuild").toggle(canBuild).text(__("Build this day now"));
				return;
			}
			S.html = m.html;
			root.find(".dsp-body").html(`<div class="dsp-view">${m.html}</div>`);
			root.find(".dsp-print,.dsp-pdf").show();
			root.find(".dsp-rebuild").toggle((frappe.user.has_role("System Manager") || frappe.user.has_role("JW Manager")) || frappe.user.has_role("Stock Manager")).text(__("Rebuild this day"));
		});
	}

	// print the EXACT same HTML in a clean window (page breaks land on the 4 sides)
	root.find(".dsp-print").on("click", () => {
		if (!S.html) return;
		const w = window.open("", "_blank", "width=860,height=980");
		w.document.write(`<html><head><title>Day Sheet ${frappe.utils.escape_html(S.date)}</title>
			<style>body{padding:10px 14px;}@media print{.brk{page-break-after:always;border:0;}}</style>
			</head><body>${S.html}</body></html>`);
		w.document.close();
		w.focus();
		setTimeout(() => w.print(), 350);
	});

	root.find(".dsp-pdf").on("click", () => {
		if (!S.date) return;
		window.open(`/api/method/frappe.utils.print_format.download_pdf?doctype=${encodeURIComponent("Day Record")}&name=${encodeURIComponent(S.date)}&format=${encodeURIComponent("Day Sheet")}&no_letterhead=1`, "_blank");
	});

	root.find(".dsp-rebuild").on("click", () => {
		if (!S.date) return;
		frappe.confirm(__("(Re)build the Day Record for <b>{0}</b> from the live tables?", [frappe.datetime.str_to_user(S.date)]), () => {
			frappe.dom.freeze(__("Building..."));
			frappe.call({ method: "jewelima.jewelima.doctype.day_record.day_record.rebuild_day_record", args: { date: S.date } })
				.then(() => { frappe.dom.unfreeze(); fetch(); })
				.catch(() => frappe.dom.unfreeze());
		});
	});

	// land on yesterday — the latest fully sealed day
	dateCtl.set_value(frappe.datetime.add_days(frappe.datetime.get_today(), -1));
	setTimeout(fetch, 400);
};
