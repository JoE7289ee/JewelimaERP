// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Stones — Info: the stone-issue waiting room at a glance. Top: how many
// cards await stones + how much material per bucket is still to issue.
// Below, two tables over the SAME cards: left in factory priority order
// (manual list first), right by AGE of the request (oldest first). Issue
// on any row jumps to the Stone Issue station with the card pre-scanned.
// Route: /app/stone-info

frappe.pages["stone-info"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Stones — Info", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	let D = null;

	$(page.main).append(`
		<style>
		.si2-kpis{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;}
		.si2-tile{border:1px solid var(--border-color);border-radius:9px;padding:9px 18px;background:var(--control-bg);min-width:110px;}
		.si2-tile .k{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;}
		.si2-tile .v{font-size:20px;font-weight:800;}
		.si2-tile.main{border-width:2px;background:var(--fg-color);}
		.si2-tile.main .v{color:#1f618d;}
		.si2-cols{display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap;}
		.si2-col{flex:1;min-width:460px;}
		.si2-sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin:0 0 6px;}
		table.si2-t{width:100%;border-collapse:collapse;font-size:12.5px;background:var(--fg-color);}
		table.si2-t th{background:var(--control-bg);font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);padding:5px 9px;border:1px solid var(--border-color);text-align:left;}
		table.si2-t td{border:1px solid var(--border-color);padding:4px 9px;}
		.si2-pr{display:inline-block;min-width:24px;text-align:center;border-radius:9px;padding:1px 6px;font-size:11px;font-weight:800;background:var(--control-bg);}
		.si2-pr.man{background:#d63031;color:#fff;}
		.si2-age{border-radius:9px;padding:1px 8px;font-size:11px;font-weight:800;color:#fff;background:#7f8c8d;}
		.si2-age.old{background:#e0a800;color:#3a2c00;}
		.si2-age.vold{background:#b02a2a;}
		.si2-pend{font-size:11px;color:var(--text-muted);white-space:nowrap;}
		.si2-none{padding:30px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:9px;}
		.si2-go{background:#1f618d;border-color:#1f618d;color:#fff;font-weight:700;}
		</style>
		<div class="si2-kpis"></div>
		<div class="si2-cols">
			<div class="si2-col"><div class="si2-sec">${__("Priority order — issue these first")}</div><div class="si2-left"></div></div>
			<div class="si2-col"><div class="si2-sec">${__("Aging — waiting the longest")}</div><div class="si2-right"></div></div>
		</div>
	`);
	const root = $(page.main);

	const pend = (p) => Object.entries(p || {}).map(([k, v]) => `${k} ${v.pcs}/${v.ct.toFixed(3)}ct`).join(" · ");
	const ageChip = (d) => {
		const cls = d >= 7 ? "vold" : d >= 3 ? "old" : "";
		return `<span class="si2-age ${cls}">${d}d</span>`;
	};

	function table(rows, mode) {
		if (!rows.length) return `<div class="si2-none">${__("No cards awaiting stones.")}</div>`;
		return `<table class="si2-t"><thead><tr>
			<th style="width:40px">${mode === "prio" ? "P#" : __("Age")}</th>
			<th>${__("Card")}</th><th>${__("Design")}</th><th>${__("At")}</th><th>${__("Party")}</th>
			<th>${__("Due")}</th><th>${__("Pending stones")}</th><th style="width:66px"></th>
		</tr></thead><tbody>
		${rows.map((r) => `<tr>
			<td>${mode === "prio"
				? `<span class="si2-pr ${r.prio_manual ? "man" : ""}">${r.prio_rank}</span>`
				: ageChip(r.age_days)}</td>
			<td><b>${esc(r.name)}</b></td>
			<td>${esc(r.design || "")}</td>
			<td>${esc(r.location || "")}</td>
			<td>${esc(r.party || "")}</td>
			<td>${r.due ? frappe.datetime.str_to_user(r.due) : ""}</td>
			<td class="si2-pend">${pend(r.pending) || "—"}</td>
			<td><button class="btn btn-xs si2-go" data-name="${esc(r.name)}">${__("Issue")}</button></td>
		</tr>`).join("")}</tbody></table>`;
	}

	function paint() {
		root.find(".si2-kpis").html(
			`<div class="si2-tile main"><div class="k">${__("Cards awaiting stones")}</div><div class="v">${D.count}</div></div>`
			+ Object.entries(D.buckets || {}).map(([k, v]) => `
				<div class="si2-tile"><div class="k">${esc(k)} ${__("to issue")}</div>
				<div class="v">${v.pcs} / ${v.ct.toFixed(3)} ct</div></div>`).join(""));
		root.find(".si2-left").html(table(D.priority || [], "prio"));
		root.find(".si2-right").html(table(D.aging || [], "age"));
	}

	function load() {
		frappe.call({ method: API + ".get_stone_info" }).then((r) => {
			D = r.message;
			if (D) paint();
		});
	}

	// Issue -> the Stone Issue station with the card already scanned
	root.on("click", ".si2-go", function () {
		frappe.route_options = { card: $(this).data("name") };
		frappe.set_route("stone-issue");
	});

	page.add_inner_button(__("Stone Request"), () => frappe.set_route("stone-request"));
	page.add_inner_button(__("Stone Issue"), () => frappe.set_route("stone-issue"));
	load();
	const t = setInterval(() => { if ($(wrapper).is(":visible")) load(); }, 30000);
	$(wrapper).on("remove", () => clearInterval(t));
};
