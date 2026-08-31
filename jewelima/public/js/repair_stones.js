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

	const draw = (list) => list.map((st) => `<tr>
		<td><input class="sd-q" value="${esc(st.stone || "")}" placeholder="EF"></td>
		<td><input class="sd-s" list="sd-sieves" value="${esc(st.sieve || "")}" placeholder="OOO-OO"></td>
		<td><input class="sd-p" type="number" min="0" step="1" value="${cint(st.pcs) || ""}" placeholder="0"></td>
		<td><input class="sd-c" type="number" min="0" step="0.001" value="${
			flt(st.ct) ? flt(st.ct).toFixed(3) : ""}" placeholder="0.000"></td>
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
			d.fields_dict.html.$wrapper.find(".sd-t tbody tr").each(function () {
				const q = ($(this).find(".sd-q").val() || "").trim();
				if (!q) return;                       // the empty row waiting at the bottom
				out.push({ stone: q, sieve: ($(this).find(".sd-s").val() || "").trim(),
					pcs: cint($(this).find(".sd-p").val()), ct: flt($(this).find(".sd-c").val()) });
			});
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
		.sd-t input{width:100%;box-sizing:border-box;border:1px solid var(--border-color);
			border-radius:6px;padding:5px 8px;font-size:12.5px;background:var(--fg-color);color:var(--text-color);}
		.sd-t a.sd-x{color:#b02a2a;cursor:pointer;font-size:16px;}
		</style>
		<table class="sd-t"><thead><tr><th style="width:22%;">${__("Stone")}</th>
			<th style="width:28%;">${__("Sieve")}</th><th style="width:18%;">${__("Pcs")}</th>
			<th style="width:24%;">${__("Cts")}</th><th style="width:8%;"></th></tr></thead>
			<tbody>${draw(list.length ? list : [{}])}</tbody></table>
		<button class="btn btn-default btn-xs sd-more" style="margin-top:9px;">${__("Add row")}</button>
		<div style="margin-top:7px;font-size:11px;color:var(--text-muted);">${
			__("Enter starts the next row. Carats come from the sieve chart until you type your own.")}</div>
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
	$t.on("change input", ".sd-s, .sd-p", function () {
		const $tr = $(this).closest("tr");
		const $c = $tr.find(".sd-c");
		if (flt($c.val()) && $c[0].dataset.auto !== "1") return;      // typed by hand
		const want = ($tr.find(".sd-s").val() || "").trim().toUpperCase();
		const hit = (sieves || []).find((x) => (x.sieve || "").toUpperCase() === want);
		const pcs = cint($tr.find(".sd-p").val());
		if (hit && pcs) {
			$c.val((pcs * flt(hit.avg_cts)).toFixed(3));
			$c[0].dataset.auto = "1";
		}
	});

	// typing in the last row opens the next one
	$t.on("input", "tbody tr:last-child input", function () {
		if ($t.find("tbody tr").length < 40) addRow();
	});
	// Enter means "next row" here, not "save and close"
	$t.on("keydown", "input", function (e) {
		if (e.key !== "Enter") return;
		e.preventDefault(); e.stopPropagation();
		const $next = $(this).closest("tr").next("tr");
		if ($next.length) $next.find(".sd-q").focus();
		else { addRow(); $t.find("tbody tr:last-child .sd-q").focus(); }
	});
	// a box you tab into offers its contents for replacing, not appending
	$t.on("focus", "input", function () { this.select(); });

	d.show();
	return d;
};
