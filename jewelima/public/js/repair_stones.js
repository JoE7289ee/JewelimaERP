// The stone editor, shared by the intake counter and the billing screen.
//
// Repair stones are NOT taken from stock: a repair uses the party's own packet
// or the bench tray, so this records what went in rather than moving anything.
// The sieve chart is used only so the sizes written here read the same as they
// do everywhere else in the app.
//
// It behaves like a grid, not a form. Typing in the last row opens the next one
// and Enter moves down — a packet of four sizes is entered straight down without
// reaching for a button. That matters because Enter is a dialog's save key: on
// the first cut it closed the box after a single stone, which read as "only one
// stone is allowed".
window.jewelima = window.jewelima || {};

jewelima.repairStoneDialog = function (stones, sieves, onSave) {
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const cint = (v) => parseInt(v, 10) || 0;

	const BUCKETS = ["DMD", "CZ", "CVD"];
	// Half the sieve average either way. A repair is weighed on a bench scale, not
	// the stone desk's, so the carats are allowed to wander — but a slipped decimal
	// or the wrong sieve lands far outside this and is worth stopping.
	const TOL = 0.5;
	const avgFor = (bucket, sieve) => {
		const hit = (sieves || []).find((x) => (x.sieve || "").toUpperCase() === (sieve || "").trim().toUpperCase());
		return hit ? flt(hit[bucket] !== undefined ? hit[bucket] : hit.avg_cts) : 0;
	};

	// Sieve and bucket are picked, not typed. They were free-text boxes showing
	// "OOO-OO" as a placeholder, which reads as a value already filled in — so
	// entering a count did nothing, because the box was in fact empty.
	const draw = (list) => list.map((st) => `<tr>
		<td><select class="sd-b"><option value="">—</option>${BUCKETS.map((b) =>
			`<option value="${b}" ${(st.bucket || "") === b ? "selected" : ""}>${b}</option>`).join("")}</select></td>
		<td><select class="sd-s"><option value="">—</option>${(sieves || []).map((x) =>
			`<option value="${esc(x.sieve)}" ${(st.sieve || "") === x.sieve ? "selected" : ""}>${
				esc(x.sieve)}</option>`).join("")}</select></td>
		<td><input class="sd-p" type="number" min="0" step="1" value="${cint(st.pcs) || ""}" placeholder="0"></td>
		<td><input class="sd-c" type="number" min="0" step="0.001" value="${
			flt(st.ct) ? flt(st.ct).toFixed(3) : ""}" placeholder="0.000"></td>
		<td><input class="sd-q" value="${esc(st.stone || "")}" placeholder="${__("optional")}"></td>
		<td><a class="sd-x" title="${__("Remove")}">&times;</a></td></tr>`).join("");

	const list = JSON.parse(JSON.stringify(stones || []));
	const d = new frappe.ui.Dialog({
		title: __("Stones"), size: "large",
		fields: [{ fieldname: "html", fieldtype: "HTML" }],
		primary_action_label: __("Save"),
		primary_action: () => {
			const out = [];
			// read from the DIALOG: Frappe renders it outside the page, so looking
			// in the page finds nothing and saves an empty list
			let bad = null;
			d.fields_dict.html.$wrapper.find(".sd-t tbody tr").each(function () {
				const b = ($(this).find(".sd-b").val() || "").trim();
				if (!b) return;                       // the empty row waiting at the bottom
				const sieve = ($(this).find(".sd-s").val() || "").trim();
				const pcs = cint($(this).find(".sd-p").val());
				const ct = flt($(this).find(".sd-c").val());
				const avg = avgFor(b, sieve);
				if (avg > 0 && pcs > 0 && ct > 0) {
					const want = avg * pcs;
					if (ct < want * (1 - TOL) || ct > want * (1 + TOL)) {
						bad = bad || __("{0} {1}: {2} pc(s) should weigh about {3} ct. {4} is too far off.",
							[b, sieve, pcs, want.toFixed(3), ct.toFixed(3)]);
					}
				}
				out.push({ bucket: b, stone: ($(this).find(".sd-q").val() || "").trim(),
					sieve: sieve, pcs: pcs, ct: ct });
			});
			if (bad) return frappe.msgprint({ title: __("Check the weigh"), message: bad, indicator: "orange" });
			d.hide();
			onSave(out);
		},
	});

	d.fields_dict.html.$wrapper.html(`
		<datalist id="sd-sieves">${(sieves || []).map((x) => `<option value="${esc(x.sieve)}">`).join("")}</datalist>
		<style>
		.sd-t{width:100%;border-collapse:collapse;font-size:12.5px;}
		.sd-t th{text-align:left;font-size:10px;text-transform:uppercase;color:var(--text-muted);
			padding:6px 7px;border-bottom:1px solid var(--border-color);}
		.sd-t td{padding:4px 7px;border-bottom:1px solid var(--border-color);}
		.sd-t input,.sd-t select{width:100%;box-sizing:border-box;border:1px solid var(--border-color);
			border-radius:6px;padding:5px 8px;font-size:12.5px;background:var(--fg-color);color:var(--text-color);}
		.sd-t input.sd-off{border-color:#d9534f;background:rgba(217,83,79,.08);}
		.sd-hint{font-size:10.5px;color:var(--text-muted);white-space:nowrap;}
		.sd-hint.off{color:#b02a2a;font-weight:700;}
		.sd-t a.sd-x{color:#b02a2a;cursor:pointer;font-size:16px;}
		</style>
		<table class="sd-t"><thead><tr><th style="width:14%;">${__("Bucket")}</th>
			<th style="width:24%;">${__("Sieve")}</th><th style="width:14%;">${__("Pcs")}</th>
			<th style="width:22%;">${__("Cts")}</th><th style="width:18%;">${__("Quality")}</th>
			<th style="width:8%;"></th></tr></thead>
			<tbody>${draw(list.length ? list : [{}])}</tbody></table>
		<button class="btn btn-default btn-xs sd-more" style="margin-top:9px;">${__("Add row")}</button>
		<div style="margin-top:7px;font-size:11px;color:var(--text-muted);">${
			__("Enter starts the next row. Carats come from the sieve chart until you type your own, and must stay within half the chart weight either way.")}</div>
	`);

	const $t = d.fields_dict.html.$wrapper;
	const addRow = () => { $t.find("tbody").append(draw([{}])); };

	$t.on("click", ".sd-more", addRow);
	$t.on("click", ".sd-x", function () {
		const $tb = $t.find("tbody");
		$(this).closest("tr").remove();
		if (!$tb.find("tr").length) addRow();
	});

	// A count with no carats is the common case — the chart knows the weight.
	// What the chart filled in is marked as such, so correcting the count updates
	// it while a carat somebody typed is never touched.
	$t.on("input", ".sd-c", function () { this.dataset.auto = ""; });
	const markRow = ($tr) => {
		const avg = avgFor($tr.find(".sd-b").val(), $tr.find(".sd-s").val());
		const pcs = cint($tr.find(".sd-p").val());
		const ct = flt($tr.find(".sd-c").val());
		const $c = $tr.find(".sd-c");
		$tr.find(".sd-hint").remove();
		if (!(avg > 0 && pcs > 0)) { $c.removeClass("sd-off"); return; }
		const want = avg * pcs, lo = want * (1 - TOL), hi = want * (1 + TOL);
		const off = ct > 0 && (ct < lo || ct > hi);
		$c.toggleClass("sd-off", off);
		$c.after(`<div class="sd-hint ${off ? "off" : ""}">${
			off ? __("expected {0} ({1}–{2})", [want.toFixed(3), lo.toFixed(3), hi.toFixed(3)])
			    : __("avg {0}", [want.toFixed(3)])}</div>`);
	};

	$t.on("change input", ".sd-b, .sd-s, .sd-p", function () {
		const $tr = $(this).closest("tr");
		const $c = $tr.find(".sd-c");
		// the chart's own figure follows the row; a carat typed by hand does not
		if (!(flt($c.val()) && $c[0].dataset.auto !== "1")) {
			const avg = avgFor($tr.find(".sd-b").val(), $tr.find(".sd-s").val());
			const pcs = cint($tr.find(".sd-p").val());
			if (avg > 0 && pcs > 0) { $c.val((pcs * avg).toFixed(3)); $c[0].dataset.auto = "1"; }
		}
		markRow($tr);
	});
	$t.on("input change", ".sd-c", function () { markRow($(this).closest("tr")); });

	// typing in the last row opens the next one
	$t.on("input change", "tbody tr:last-child input, tbody tr:last-child select", function () {
		if ($t.find("tbody tr").length < 40) addRow();
	});
	// Enter means "next row" here, not "save and close"
	$t.on("keydown", "input", function (e) {
		if (e.key !== "Enter") return;
		e.preventDefault(); e.stopPropagation();
		const $next = $(this).closest("tr").next("tr");
		if ($next.length) $next.find(".sd-b").focus();
		else { addRow(); $t.find("tbody tr:last-child .sd-b").focus(); }
	});
	// a box you tab into offers its contents for replacing, not appending
	$t.on("focus", "input", function () { this.select(); });

	d.show();
	return d;
};
