// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Job Order Status — find a job order (or scan any of its cards) and see where every
// piece is right now: current location, whether it's assigned/issued (and to whom), and
// when it entered that location. Pretty + printable. Route: /app/job-order-status

frappe.pages["job-order-status"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Job Order Status", single_column: true });
	const state = { data: null, branding: {} };
	const esc = frappe.utils.escape_html;
	const flt = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));

	const CSS = `
	.jo-wrap{max-width:900px;}
	.jo-head{display:flex;justify-content:space-between;align-items:flex-start;border:1px solid #e2e6ea;border-radius:9px;padding:10px 14px;background:#fff;margin-bottom:8px;}
	.jo-code{font-size:20px;font-weight:800;letter-spacing:.4px;}
	.jo-sub{color:#6b7785;font-size:12px;margin-top:2px;}
	.jo-tot{text-align:right;font-size:11px;color:#8a96a3;white-space:nowrap;}
	.jo-tot b{font-size:22px;color:#222;display:block;}
	.jo-chips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px;}
	.jo-chip{background:#eef2f7;border-radius:12px;padding:3px 10px;font-size:12px;color:#3b4757;}
	.jo-chip b{color:#111;}
	table.jo-tbl{width:100%;border-collapse:collapse;font-size:12.5px;}
	table.jo-tbl th,table.jo-tbl td{border-bottom:1px solid #eef1f4;padding:5px 8px;text-align:left;vertical-align:top;}
	table.jo-tbl th{color:#8a96a3;font-size:11px;text-transform:uppercase;letter-spacing:.04em;}
	table.jo-tbl td.num,table.jo-tbl th.num{text-align:right;font-variant-numeric:tabular-nums;}
	.jo-badge{display:inline-block;padding:2px 8px;border-radius:11px;font-size:11px;font-weight:700;white-space:nowrap;}
	.jo-badge.queue{background:#eef2f7;color:#5a6b7b;}
	.jo-badge.wip{background:#fff3e0;color:#b4690e;}
	.jo-badge.recd{background:#eaf6ec;color:#1d7a33;}
	.jo-badge.done{background:#e8f0fe;color:#1c56b3;}
	.jo-badge.prod{background:#eaf6ec;color:#1d7a33;}
	.jo-when{color:#8a96a3;font-size:11px;}
	.jo-empty{color:#8a96a3;}`;

	$(page.main).append(`<style>${CSS}</style>
		<div class="jo-wrap">
			<div class="jo-bar" style="max-width:440px;margin:2px 0 12px;"></div>
			<div class="jo-out"></div>
		</div>`);

	const scan = frappe.ui.form.make_control({
		df: { fieldtype: "Data", label: "Job Order / Card", fieldname: "scan", description: "Enter a Job Order (E####) or scan any of its cards." },
		parent: $(page.main).find(".jo-bar").get(0), render_input: true,
	});
	scan.refresh();
	frappe.call({ method: "jewelima.jewelima.api.get_print_branding" }).then((r) => (state.branding = r.message || {}));
	const $out = $(page.main).find(".jo-out");
	const focusScan = () => setTimeout(() => scan.$input.focus(), 30);

	function statusBadge(b) {
		if (b.is_finished) return `<span class="jo-badge prod">PRODUCT${b.stock_status ? " — " + esc(b.stock_status) : ""}</span>`;
		const s = b.status || "";
		const cls = s === "Receipted" ? "recd" : s === "Issued" || s === "Ongoing" ? "wip" : s === "Completed" ? "done" : "queue";
		const who = (s === "Issued" || s === "Ongoing") && b.employee_name ? ` &rarr; ${esc(b.employee_name)}` : "";
		return s ? `<span class="jo-badge ${cls}">${esc(s)}${who}</span>` : `<span class="jo-badge queue">In ${esc(b.location)}</span>`;
	}

	function buildHTML(d) {
		const h = d.header || {};
		const dt = (v) => (v ? frappe.datetime.str_to_user(v) : "");
		const chips = Object.entries(d.by_location || {})
			.sort((a, b) => b[1] - a[1])
			.map(([loc, n]) => `<span class="jo-chip"><b>${esc(loc)}</b> &times;${n}</span>`)
			.join("");
		const rows =
			(d.bags || [])
				.map((b, i) => {
					const when = b.entered
						? `${frappe.datetime.str_to_user(b.entered)}<div class="jo-when">${frappe.datetime.comment_when(b.entered)}</div>`
						: "—";
					return `<tr>
						<td>${i + 1}</td>
						<td><b>${esc(b.name)}</b></td>
						<td>${esc(b.design || "")}</td>
						<td>${esc(b.location)}</td>
						<td>${statusBadge(b)}</td>
						<td>${when}</td>
						<td class="num">${b.gross ? flt(b.gross).toFixed(3) : ""}</td>
					</tr>`;
				})
				.join("") || '<tr><td colspan="7" class="jo-empty">No cards on this job order.</td></tr>';
		return `
		<div class="jo-head">
			<div>
				<div class="jo-code">${esc(d.job_order)}</div>
				<div class="jo-sub">${[h.customer, h.salesman, h.order_type].filter(Boolean).map(esc).join(" &middot; ")}</div>
				<div class="jo-sub">${h.order_date ? "Ordered " + dt(h.order_date) : ""}${h.due_date ? " &middot; Due " + dt(h.due_date) : ""}</div>
			</div>
			<div class="jo-tot">Pieces<b>${d.total}</b></div>
		</div>
		<div class="jo-chips">${chips}</div>
		<table class="jo-tbl"><thead><tr>
			<th>#</th><th>Card</th><th>Design</th><th>Location</th><th>Status / Who</th><th>Entered</th><th class="num">GW (g)</th>
		</tr></thead><tbody>${rows}</tbody></table>`;
	}

	function load(code) {
		code = (code || "").trim();
		if (!code) return;
		frappe.call({ method: "jewelima.jewelima.api.get_job_order_status", args: { job_order: code } }).then((r) => {
			const d = r.message || {};
			if (d.error) {
				$out.html(`<div class="jo-empty">${esc(d.error)}</div>`);
				state.data = null;
				return focusScan();
			}
			state.data = d;
			$out.html(buildHTML(d));
			focusScan();
		});
	}

	function printIt() {
		if (!state.data) return frappe.msgprint(__("Find a job order first."));
		const title = "Job Order " + state.data.job_order;
		if (window.jewelima && jewelima.print_window) {
			jewelima.print_window(state.branding || {}, title, buildHTML(state.data), CSS);
			return;
		}
		const w = window.open("", "_blank", "width=900,height=1000");
		w.document.write(`<html><head><title>${esc(title)}</title><style>${CSS} body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;padding:14px;color:#222;}</style></head><body>${buildHTML(state.data)}</body></html>`);
		w.document.close();
		w.focus();
		setTimeout(() => w.print(), 350);
	}

	scan.$input.on("keydown", (e) => {
		if (e.which === 13 || e.key === "Enter") {
			e.preventDefault();
			load(scan.$input.val());
		}
	});
	page.set_primary_action(__("Print"), printIt, "printer");
	focusScan();
};
