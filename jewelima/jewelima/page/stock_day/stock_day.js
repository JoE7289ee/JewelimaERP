// Stock Day (Stock > Records > Stock Day) — everything that moved in one day.
//
// Read from the ledger every time, never from a stored copy, so the day always
// agrees with the books and any date back to the first entry works. A finished
// day can be SEALED: the figures are kept as they read then, and because the
// day is still recomputed the page shows sealed against now. A difference means
// someone changed the day after it was signed off.
// Route: /app/stock-day
frappe.pages["stock-day"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Stock Day"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const g3 = (v) => flt(v).toFixed(3);
	const S = { day: frappe.datetime.add_days(frappe.datetime.get_today(), -0), data: null };

	$(page.main).append(`
		<style>
		#page-stock-day .container{max-width:100%;}
		.sd-bar{display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin-bottom:12px;}
		.sd-date{border:1px solid var(--border-color);border-radius:8px;height:31px;padding:2px 11px;
			background:var(--fg-color);color:var(--text-color);font-size:13px;font-weight:700;}
		.sd-nav{border:1px solid var(--border-color);background:var(--fg-color);color:var(--text-muted);
			border-radius:8px;width:31px;height:31px;cursor:pointer;font-weight:800;}
		.sd-nav:hover{color:var(--text-color);}
		.sd-when{font-size:13px;font-weight:800;}
		.sd-seal{font-size:11px;padding:3px 11px;border-radius:999px;font-weight:700;}
		.sd-seal.yes{background:#eaf6ec;color:#1d7a33;border:1px solid #bfe3c6;}
		.sd-seal.no{background:var(--control-bg);color:var(--text-muted);border:1px solid var(--border-color);}
		.sd-seal.drift{background:#fdf3e3;color:#8a5a00;border:1px solid #e6c98f;}

		.sd-tiles{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;}
		.sd-tile{border:1px solid var(--border-color);border-radius:11px;background:var(--fg-color);
			padding:10px 16px;min-width:130px;}
		.sd-tile .k{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);}
		.sd-tile .v{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums;}
		.sd-tile .s{font-size:10.5px;color:var(--text-muted);}
		.sd-tile.up .v{color:#1d7a33;} .sd-tile.down .v{color:#b02a2a;}

		.sd-drift{margin-bottom:14px;padding:10px 14px;border-radius:10px;font-size:12.5px;
			background:#fdf3e3;border:1px solid #e6c98f;color:#8a5a00;}
		.sd-sec{border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);
			margin-bottom:12px;overflow:hidden;}
		.sd-h{display:flex;align-items:baseline;gap:10px;padding:10px 14px;border-bottom:1px solid var(--border-color);
			background:var(--control-bg);}
		.sd-h .t{font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;}
		.sd-h .n{font-size:11.5px;color:var(--text-muted);}
		.sd-h .tot{margin-left:auto;font-weight:800;font-variant-numeric:tabular-nums;}
		table.sd-t{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.sd-t th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em;
			color:var(--text-muted);padding:6px 14px;font-weight:700;border-bottom:1px solid var(--border-color);}
		table.sd-t td{padding:6px 14px;border-bottom:1px solid var(--border-color);vertical-align:top;}
		table.sd-t tr:last-child td{border-bottom:none;}
		table.sd-t td.num{text-align:right;font-variant-numeric:tabular-nums;font-weight:700;}
		.sd-sub{font-size:11px;color:var(--text-muted);}
		.sd-quiet{padding:14px;color:var(--text-muted);font-size:12px;}
		.sd-none{padding:44px;text-align:center;color:var(--text-muted);}
		</style>
		<div class="sd-bar">
			<button class="sd-nav sd-prev" title="${__("Previous day")}">&lsaquo;</button>
			<input type="date" class="sd-date">
			<button class="sd-nav sd-next" title="${__("Next day")}">&rsaquo;</button>
			<button class="btn btn-xs btn-default sd-today">${__("Today")}</button>
			<span class="sd-when"></span>
			<span class="sd-sealbadge"></span>
			<span style="flex:1;"></span>
			<button class="btn btn-xs btn-default sd-seals">${__("Sealed days")}</button>
			<button class="btn btn-sm btn-primary sd-do-seal">${__("Seal this day")}</button>
		</div>
		<div class="sd-driftbox"></div>
		<div class="sd-tiles"></div>
		<div class="sd-body"></div>`);
	const root = $(page.main);

	// each section prints the columns that suit it — a melt and a sale have
	// nothing in common but the day they happened on
	const COLS = {
		purchase: [["ref", __("Record")], ["party", __("Supplier")], ["where", __("Into")],
			["grams", __("Grams"), 1], ["carats", __("Carats"), 1], ["pure", __("Pure g"), 1], ["who", __("By")]],
		melt: [["ref", __("Entry")], ["detail", __("Into the pot")], ["out_item", __("Came out")],
			["got", __("Got"), 1], ["loss", __("Loss"), 1], ["where", __("Where")], ["who", __("By")]],
		transfer: [["ref", __("Entry")], ["from", __("From")], ["to", __("To")],
			["grams", __("Grams"), 1], ["detail", __("What")], ["who", __("By")]],
		findings: [["ref", __("Record")], ["direction", __("Way")], ["item", __("Finding")],
			["pcs", __("Pcs"), 1], ["grams", __("Grams"), 1], ["where", __("Where")], ["who", __("By")]],
		card: [["ref", __("Card")], ["direction", __("Way")], ["item", __("Gold")],
			["grams", __("Grams"), 1], ["note", __("Note")], ["who", __("By")]],
		bench: [["ref", __("Card")], ["bench", __("Bench")], ["who", __("Who")],
			["out", __("Out"), 1], ["back", __("Back"), 1], ["grams", __("Loss"), 1]],
		loss: [["ref", __("Entry")], ["kind", __("What")], ["grams", __("Grams"), 1],
			["pure", __("Pure g"), 1], ["detail", __("Detail")], ["who", __("By")]],
		sold: [["ref", __("Sale")], ["party", __("Customer")], ["pieces", __("Pieces"), 1],
			["grams", __("Grams out"), 1], ["carats", __("Carats"), 1], ["detail", __("Cards")]],
		convert: [["what", __("What")], ["pieces", __("Pieces"), 1], ["grams", __("Grams"), 1]],
	};

	function paint() {
		const d = S.data;
		root.find(".sd-date").val(S.day);
		if (!d) { root.find(".sd-body").html(""); return; }
		root.find(".sd-when").text(frappe.datetime.str_to_user(d.day));

		const sealed = d.sealed;
		const drift = (d.drift || []);
		root.find(".sd-sealbadge").html(sealed
			? `<span class="sd-seal ${drift.length ? "drift" : "yes"}">${drift.length
				? __("sealed — but the day has changed since")
				: __("sealed {0} by {1}", [esc(sealed.on), esc(sealed.by)])}</span>`
			: `<span class="sd-seal no">${__("not sealed")}</span>`);
		root.find(".sd-do-seal").prop("disabled", !!sealed || d.day >= frappe.datetime.get_today())
			.text(sealed ? __("Sealed") : __("Seal this day"));

		root.find(".sd-driftbox").html(drift.length ? `
			<div class="sd-drift"><b>${__("This day changed after it was sealed.")}</b>
				${drift.map((x) => __("{0}: sealed {1}, now {2} ({3})",
					[esc(x.what), x.sealed, x.now, (x.delta > 0 ? "+" : "") + x.delta])).join(" &middot; ")}
				<div style="margin-top:4px;">${__("The sealed figures are kept as they were — this is the difference, not a correction.")}</div>
			</div>` : "");

		const net = d.net_pure;
		root.find(".sd-tiles").html(`
			<div class="sd-tile"><div class="k">${__("Opening pure")}</div><div class="v">${g3(d.opening_pure)}<span style="font-size:11px;"> g</span></div>
				<div class="s">${__("start of day")}</div></div>
			<div class="sd-tile ${net > 0.0005 ? "up" : (net < -0.0005 ? "down" : "")}">
				<div class="k">${__("Net movement")}</div>
				<div class="v">${net > 0 ? "+" : ""}${g3(net)}<span style="font-size:11px;"> g</span></div>
				<div class="s">${__("pure gold")}</div></div>
			<div class="sd-tile"><div class="k">${__("Closing pure")}</div><div class="v">${g3(d.closing_pure)}<span style="font-size:11px;"> g</span></div>
				<div class="s">${__("end of day")}</div></div>
			<div class="sd-tile"><div class="k">${__("Movements")}</div><div class="v">${d.movements}</div>
				<div class="s">${(d.sections || []).filter((s) => s.rows.length).length} ${__("kind(s)")}</div></div>`);

		const busy = (d.sections || []).filter((s) => s.rows.length);
		root.find(".sd-body").html(busy.length ? busy.map((sec) => {
			const cols = COLS[sec.key] || [];
			return `<div class="sd-sec">
				<div class="sd-h"><span class="t">${esc(sec.title)}</span>
					<span class="n">${sec.rows.length}</span>
					<span class="tot">${sec.total ? g3(sec.total) + " g" : ""}</span></div>
				<table class="sd-t"><thead><tr>${cols.map(([, lbl, num]) =>
					`<th${num ? ' class="num" style="text-align:right;"' : ""}>${esc(lbl)}</th>`).join("")}</tr></thead>
				<tbody>${sec.rows.map((r) => `<tr>${cols.map(([k, , num]) => {
					let v = r[k];
					if (v === undefined || v === null || v === "") v = "—";
					else if (num) v = (typeof v === "number" && String(v).includes(".")) ? g3(v) : v;
					return `<td${num ? ' class="num"' : ""}>${esc(String(v))}</td>`;
				}).join("")}</tr>`).join("")}</tbody></table>
			</div>`;
		}).join("") : `<div class="sd-sec"><div class="sd-none">${
			__("Nothing moved on this day.")}</div></div>`);
	}

	function load() {
		frappe.call({ method: API + ".get_stock_day", args: { day: S.day }, freeze: false })
			.then((r) => { S.data = r.message || null; paint(); });
	}

	root.on("change", ".sd-date", function () { S.day = this.value; load(); });
	root.on("click", ".sd-prev", () => { S.day = frappe.datetime.add_days(S.day, -1); load(); });
	root.on("click", ".sd-next", () => { S.day = frappe.datetime.add_days(S.day, 1); load(); });
	root.on("click", ".sd-today", () => { S.day = frappe.datetime.get_today(); load(); });
	root.on("click", ".sd-do-seal", function () {
		frappe.confirm(__("Seal {0}? The figures are kept as they read now, and a sealed day is never rewritten.",
			[frappe.datetime.str_to_user(S.day)]), () => {
			frappe.call({ method: API + ".seal_stock_day", args: { day: S.day } }).then(() => {
				frappe.show_alert({ message: __("Day sealed"), indicator: "green" }, 4);
				load();
			});
		});
	});
	root.on("click", ".sd-seals", function () {
		frappe.call({ method: API + ".get_stock_day_seals" }).then((r) => {
			const rows = r.message || [];
			const dlg = new frappe.ui.Dialog({ title: __("Sealed days"), size: "large" });
			$(dlg.body).html(rows.length ? `
				<table class="sd-t"><thead><tr>
					<th>${__("Day")}</th><th class="num" style="text-align:right;">${__("Closing pure")}</th>
					<th class="num" style="text-align:right;">${__("Moves")}</th>
					<th>${__("Sealed")}</th><th>${__("Still matches")}</th>
				</tr></thead><tbody>${rows.map((x) => `
					<tr class="sd-open" data-d="${esc(x.day)}" style="cursor:pointer;">
						<td><b>${esc(frappe.datetime.str_to_user(x.day))}</b></td>
						<td class="num">${g3(x.closing_pure)} g</td>
						<td class="num">${x.movements}</td>
						<td class="sd-sub">${esc(x.sealed_on)} · ${esc(x.sealed_by)}</td>
						<td>${x.drift && x.drift.length
							? `<span style="color:#8a5a00;font-weight:700;">${__("changed since")}</span>`
							: `<span style="color:#1d7a33;font-weight:700;">${__("yes")}</span>`}</td>
					</tr>`).join("")}</tbody></table>`
				: `<div class="sd-none">${__("No day has been sealed yet.")}</div>`);
			$(dlg.body).on("click", ".sd-open", function () {
				dlg.hide(); S.day = $(this).data("d"); load();
			});
			dlg.show();
		});
	});

	frappe.pages["stock-day"].on_page_show = load;
	load();
};
