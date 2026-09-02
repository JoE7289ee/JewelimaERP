// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Repair KPI — what the repair desk is carrying and what it earned.
//
// Two clocks run on this page and they are not the same: pieces are TAKEN IN on
// one date and BILLED on another. Intake counts by when it arrived, money by
// when it was billed, and the two are labelled apart so a month is never read
// as having earned what it received.
//
// "Still with us" ignores the period on purpose — a piece from March that is
// still on the bench is outstanding today, whichever window is on screen.
// Route: /app/repair-kpi
frappe.pages["repair-kpi"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Repair KPI"), single_column: true });
	const API = "jewelima.jewelima.repair_api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const cint = (v) => parseInt(v, 10) || 0;
	const g3 = (v) => flt(v).toFixed(3);
	const m = (v) => format_currency(flt(v));
	const root = $(page.main);
	let PERIOD = "month";

	root.append(`
		<style>
		${jewelima.viz.css()}
		#page-repair-kpi .container{max-width:100%;}
		.kp-charts{display:grid;gap:13px;margin-bottom:6px;
			grid-template-columns:repeat(auto-fit,minmax(290px,1fr));}
		.kp-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px;}
		.kp-pill{border:1px solid var(--border-color);background:var(--fg-color);color:var(--text-muted);
			border-radius:999px;padding:5px 15px;font-size:11.5px;cursor:pointer;font-weight:600;}
		.kp-pill.on{background:#1f618d;border-color:#1f618d;color:#fff;}
		.kp-when{margin-left:auto;font-size:11.5px;color:var(--text-muted);}

		.kp-sec{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;
			color:var(--text-muted);margin:16px 0 8px;}
		.kp-tiles{display:flex;gap:11px;flex-wrap:wrap;}
		.kp-t{border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);
			padding:10px 17px;min-width:126px;border-left:3px solid var(--border-color);}
		.kp-t .k{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);}
		.kp-t .v{font-size:21px;font-weight:800;font-variant-numeric:tabular-nums;}
		.kp-t .s{font-size:10.5px;color:var(--text-muted);}
		/* the same three colours the rest of the repair screens use */
		.kp-t.blue{border-left-color:#1f618d;background:rgba(31,97,141,.06);}
		.kp-t.blue .v{color:#1f618d;}
		.kp-t.amber{border-left-color:#8a6d00;background:rgba(224,168,0,.09);}
		.kp-t.amber .v{color:#8a6d00;}
		.kp-t.green{border-left-color:#1d7a33;background:rgba(29,122,51,.07);}
		.kp-t.green .v{color:#1d7a33;}
		.kp-t.red{border-left-color:#b02a2a;background:rgba(176,42,42,.07);}
		.kp-t.red .v{color:#b02a2a;}
		[data-theme="dark"] .kp-t.blue .v{color:#8fc1e8;}
		[data-theme="dark"] .kp-t.amber .v{color:#e8c66b;}
		[data-theme="dark"] .kp-t.green .v{color:#7fc98f;}
		[data-theme="dark"] .kp-t.red .v{color:#e08585;}

		.kp-cols{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;}
		.kp-card{flex:1 1 430px;min-width:340px;border:1px solid var(--border-color);border-radius:12px;
			background:var(--fg-color);overflow:hidden;border-left:3px solid var(--border-color);}
		.kp-card.blue{border-left-color:#1f618d;}
		.kp-card.blue > .h{background:rgba(31,97,141,.09);color:#1f618d;}
		.kp-card.amber{border-left-color:#8a6d00;}
		.kp-card.amber > .h{background:rgba(224,168,0,.13);color:#8a6d00;}
		.kp-card.red{border-left-color:#b02a2a;}
		.kp-card.red > .h{background:rgba(176,42,42,.09);color:#b02a2a;}
		[data-theme="dark"] .kp-card.blue > .h{color:#8fc1e8;}
		[data-theme="dark"] .kp-card.amber > .h{color:#e8c66b;}
		[data-theme="dark"] .kp-card.red > .h{color:#e08585;}
		.kp-card .h{padding:9px 14px;border-bottom:1px solid var(--border-color);
			background:var(--control-bg);font-size:11px;font-weight:800;letter-spacing:.05em;
			text-transform:uppercase;color:var(--text-muted);}
		table.kp-tbl{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.kp-tbl th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em;
			color:var(--text-muted);padding:6px 11px;border-bottom:1px solid var(--border-color);}
		table.kp-tbl td{padding:5px 11px;border-bottom:1px solid var(--border-color);}
		table.kp-tbl tr:last-child td{border-bottom:none;}
		table.kp-tbl tbody tr:nth-child(even) td{background:rgba(128,128,128,.055);}
		table.kp-tbl td.num,table.kp-tbl th.num{text-align:right;font-variant-numeric:tabular-nums;}
		.kp-old{font-weight:800;}
		.kp-old.warn{color:#8a6d00;} .kp-old.bad{color:#b02a2a;}
		[data-theme="dark"] .kp-old.warn{color:#e8c66b;} [data-theme="dark"] .kp-old.bad{color:#e08585;}
		.kp-none{padding:22px;text-align:center;color:var(--text-muted);font-size:12.5px;}
		</style>
		<div class="kp-bar">
			<span class="kp-pill" data-p="today">${__("Today")}</span>
			<span class="kp-pill" data-p="week">${__("This week")}</span>
			<span class="kp-pill on" data-p="month">${__("This month")}</span>
			<span class="kp-pill" data-p="all">${__("All time")}</span>
			<span class="kp-when"></span>
		</div>
		<div class="kp-body"></div>
	`);

	function paint(d) {
		const t = d.taken, o = d.open, b = d.billed;
		const oldest = (d.ageing || [])[0];
		root.find(".kp-when").text(d.from ? `${d.from} → ${d.to}` : __("everything"));
		root.find(".kp-body").html(`
			<div class="kp-sec">${__("Taken in")}</div>
			<div class="kp-tiles">
				<div class="kp-t blue"><div class="k">${__("Batches")}</div><div class="v">${t.batches}</div></div>
				<div class="kp-t blue"><div class="k">${__("Pieces")}</div><div class="v">${t.pieces}</div></div>
				<div class="kp-t blue"><div class="k">${__("Weight in")}</div><div class="v">${g3(t.weight)}</div>
					<div class="s">g</div></div>
			</div>

			<div class="kp-sec">${__("Still with us")}</div>
			<div class="kp-tiles">
				<div class="kp-t amber"><div class="k">${__("Batches")}</div><div class="v">${o.batches}</div></div>
				<div class="kp-t amber"><div class="k">${__("Pieces")}</div><div class="v">${o.pieces}</div></div>
				<div class="kp-t amber"><div class="k">${__("Weight held")}</div><div class="v">${g3(o.weight)}</div>
					<div class="s">g</div></div>
				<div class="kp-t ${o.no_weigh_out ? "red" : "green"}"><div class="k">${__("No weight out")}</div>
					<div class="v">${o.no_weigh_out}</div><div class="s">${__("cannot bill")}</div></div>
				<div class="kp-t ${o.no_work ? "red" : "green"}"><div class="k">${__("No work set")}</div>
					<div class="v">${o.no_work}</div></div>
				<div class="kp-t ${!oldest ? "green" : (oldest.days > 30 ? "red" : oldest.days > 14 ? "amber" : "green")}">
					<div class="k">${__("Oldest")}</div>
					<div class="v">${oldest ? oldest.days : 0}</div><div class="s">${__("days")}</div></div>
			</div>

			<div class="kp-sec">${__("Billed")}</div>
			<div class="kp-tiles">
				<div class="kp-t green"><div class="k">${__("Bills")}</div><div class="v">${b.bills}</div></div>
				<div class="kp-t green"><div class="k">${__("Pieces")}</div><div class="v">${b.pieces}</div></div>
				<div class="kp-t green"><div class="k">${__("Total")}</div><div class="v">${m(b.total)}</div></div>
				<div class="kp-t"><div class="k">${__("Work")}</div><div class="v">${m(b.work)}</div></div>
				<div class="kp-t"><div class="k">${__("Metal")}</div><div class="v">${m(b.metal)}</div>
					<div class="s">${g3(b.metal_g)} g</div></div>
				<div class="kp-t"><div class="k">${__("Stones")}</div><div class="v">${m(b.stones)}</div></div>
				${b.manual ? `<div class="kp-t"><div class="k">${__("Manual")}</div><div class="v">${m(b.manual)}</div></div>` : ""}
				${b.gst ? `<div class="kp-t"><div class="k">${__("GST")}</div><div class="v">${m(b.gst)}</div></div>` : ""}
			</div>

			<div class="kp-sec">${__("The shape of it")}</div>
			<div class="kp-charts jw-viz">
				<div class="jw-card">
					<div class="jw-h">${__("What the money is")}</div>
					<div class="jw-sub">${__("every billed rupee in this window, split by what it paid for")}</div>
					<div class="kp-c-mix"></div>
				</div>
				<div class="jw-card">
					<div class="jw-h">${__("Who is holding the most")}</div>
					<div class="jw-sub">${__("pieces still with us, by party")}</div>
					<div class="kp-c-party"></div>
				</div>
				<div class="jw-card">
					<div class="jw-h">${__("What the floor is doing")}</div>
					<div class="jw-sub">${__("pieces taken in, by type of work")}</div>
					<div class="kp-c-work"></div>
				</div>
			</div>

			<div class="kp-sec">${__("Where it is")}</div>
			<div class="kp-cols">
				<div class="kp-card red">
					<div class="h">${__("Longest with us")}</div>
					${(d.ageing || []).length ? `<table class="kp-tbl">
						<thead><tr><th>${__("Repair")}</th><th>${__("Party")}</th>
							<th class="num">${__("Pcs")}</th><th class="num">${__("Weight")}</th>
							<th class="num">${__("Days")}</th></tr></thead>
						<tbody>${d.ageing.map((r) => `<tr>
							<td><b>${esc(r.repair)}</b></td><td>${esc(r.party || "")}</td>
							<td class="num">${r.pieces}</td><td class="num">${g3(r.weight)}</td>
							<td class="num kp-old ${r.days > 30 ? "bad" : r.days > 14 ? "warn" : ""}">${r.days}</td>
						</tr>`).join("")}</tbody></table>`
						: `<div class="kp-none">${__("Nothing outstanding.")}</div>`}
				</div>
				<div class="kp-card blue">
					<div class="h">${__("By party")}</div>
					${(d.parties || []).length ? `<table class="kp-tbl">
						<thead><tr><th>${__("Party")}</th><th class="num">${__("With us")}</th>
							<th class="num">${__("Weight")}</th><th class="num">${__("Billed")}</th></tr></thead>
						<tbody>${d.parties.map((r) => `<tr>
							<td>${esc(r.party || "")}</td>
							<td class="num">${r.open_pieces}</td>
							<td class="num">${g3(r.open_weight)}</td>
							<td class="num">${m(r.billed)}</td></tr>`).join("")}</tbody></table>`
						: `<div class="kp-none">${__("Nothing yet.")}</div>`}
				</div>
				<div class="kp-card amber">
					<div class="h">${__("Work taken in")}</div>
					${(d.work || []).length ? `<table class="kp-tbl">
						<thead><tr><th>${__("Type of work")}</th><th class="num">${__("Pieces")}</th></tr></thead>
						<tbody>${d.work.map((r) => `<tr><td>${esc(r.work)}</td>
							<td class="num">${r.pieces}</td></tr>`).join("")}</tbody></table>`
						: `<div class="kp-none">${__("No work recorded in this window.")}</div>`}
				</div>
			</div>
		`);
		drawCharts(d);
	}

	// The three charts answer three different questions, so they take three forms:
	// a ring for part-to-whole (the money), bars for magnitude-by-identity (who
	// holds what, and what is being done). The tables below are the table view —
	// nothing here is the only way to read a number.
	function drawCharts(d) {
		const b = d.billed || {};
		const mix = [
			{ label: __("Repair charges"), value: flt(b.work) },
			{ label: __("Metal"), value: flt(b.metal) },
			{ label: __("Stones"), value: flt(b.stones) },
			{ label: __("Manual"), value: flt(b.manual) },
		].filter((s) => s.value > 0);
		// The ring holds what the work COST — GST is not a thing the money bought,
		// and adding it as a fifth slice would cycle the palette, which the four
		// hues are chosen not to do. So the centre says what it is actually the
		// total of: with GST on the bill it is the pre-tax figure, and calling it
		// "billed" would have it disagree with the Billed tile two rows above.
		jewelima.viz.donut(root.find(".kp-c-mix"), mix, {
			unit: "", dp: 0, size: 210,
			centreLabel: flt(b.gst) ? __("before GST") : __("billed"),
			empty: __("Nothing billed in this window."),
		});

		// top 8, biggest first — a bar per party past that is a thicket, and the
		// table underneath still carries every one of them
		const parties = (d.parties || []).filter((p) => p.open_pieces > 0).slice(0, 8)
			.map((p) => ({ label: p.party || "—", value: p.open_pieces }));
		jewelima.viz.bars(root.find(".kp-c-party"), parties, {
			unit: __("pcs"), dp: 0, colour: 1, label: 150,
			empty: __("Nothing is with us right now."),
		});

		const work = (d.work || []).slice(0, 8).map((w) => ({ label: w.work, value: w.pieces }));
		jewelima.viz.bars(root.find(".kp-c-work"), work, {
			unit: __("pcs"), dp: 0, colour: 2, label: 150,
			empty: __("No work recorded in this window."),
		});
	}

	function load() {
		frappe.call({ method: API + ".get_repair_kpis", args: { period: PERIOD }, freeze: false })
			.then((r) => paint(r.message || {}));
	}
	root.on("click", ".kp-pill", function () {
		root.find(".kp-pill").removeClass("on"); this.classList.add("on");
		PERIOD = this.dataset.p; load();
	});
	page.set_primary_action(__("Refresh"), load, "refresh");
	frappe.pages["repair-kpi"].on_page_show = load;
};
