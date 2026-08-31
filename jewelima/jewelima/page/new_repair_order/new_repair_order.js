// New Repair Order (REPAIR > New Repair Order) — taking work in over the counter.
//
// One batch is one party arriving once: who sent it, when, and who took it. The
// rows below are the pieces. The batch is numbered REP-00001 and each row gets
// its own number under it (REP-00001-3), so a single piece can be talked about
// without the batch.
//
// Party and Type of Work are open lists: type one that does not exist and it is
// added. The counter is not the place to stop and set up a master first.
// Route: /app/new-repair-order
frappe.pages["new-repair-order"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("New Repair Order"), single_column: true });
	const API = "jewelima.jewelima.repair_api";
	const esc = frappe.utils.escape_html;
	const cint = (v) => parseInt(v, 10) || 0;
	const S = { opts: { parties: [], work_types: [], types: [], design_types: [], sieves: [] },
		rows: [], saved: null };

	$(page.main).append(`
		<style>
		#page-new-repair-order .container{max-width:100%;}
		.nr-wrap{max-width:100%;}
		.nr-card{border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);
			padding:14px 16px;margin-bottom:14px;}
		.nr-card .h{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;
			color:var(--text-muted);margin-bottom:10px;}
		.nr-head{display:flex;gap:14px;flex-wrap:wrap;}
		.nr-f{flex:1 1 220px;min-width:190px;}
		.nr-f label{display:block;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;
			color:var(--text-muted);margin-bottom:3px;}
		.nr-f input,.nr-f select,.nr-f textarea{width:100%;box-sizing:border-box;border:1px solid var(--border-color);
			border-radius:8px;padding:8px 11px;font-size:13px;background:var(--fg-color);color:var(--text-color);}
		.nr-f .who{padding:8px 11px;font-size:13px;color:var(--text-muted);}
		.nr-hint{font-size:11px;color:var(--text-muted);margin-top:3px;}

		table.nr-t{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.nr-t th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;
			color:var(--text-muted);padding:7px 8px;font-weight:700;border-bottom:1px solid var(--border-color);}
		table.nr-t td{padding:5px 8px;border-bottom:1px solid var(--border-color);vertical-align:middle;}
		table.nr-t td input,table.nr-t td select{width:100%;box-sizing:border-box;border:1px solid var(--border-color);
			border-radius:7px;padding:6px 9px;font-size:12.5px;background:var(--fg-color);color:var(--text-color);}
		table.nr-t td.num input{text-align:right;font-variant-numeric:tabular-nums;}
		.nr-del{border:none;background:none;color:#b02a2a;font-size:16px;cursor:pointer;line-height:1;}
		.nr-works{display:flex;flex-wrap:wrap;gap:4px;align-items:center;}
		.nr-works input{flex:1 1 90px;min-width:80px;}
		td.nr-st{font-size:11px;line-height:1.45;cursor:pointer;}
		.nr-addst{color:var(--text-muted);font-style:italic;border-bottom:1px dashed var(--border-color);}
		table.nr-t td select.nr-kt{width:100%;box-sizing:border-box;border:1px solid var(--border-color);
			border-radius:7px;padding:5px 6px;font-size:12.5px;background:var(--fg-color);color:var(--text-color);}
		.nr-chip{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:700;
			padding:2px 4px 2px 9px;border-radius:999px;background:#e9f0f7;color:#1f618d;
			border:1px solid #b9d0e6;white-space:nowrap;}
		.nr-chip b{cursor:pointer;font-size:13px;line-height:1;opacity:.65;}
		.nr-chip b:hover{opacity:1;}
		.nr-add{margin-top:9px;}
		.nr-tot{display:flex;gap:18px;margin-top:10px;font-size:12.5px;color:var(--text-muted);}
		.nr-tot b{color:var(--text-color);font-variant-numeric:tabular-nums;}
		.nr-none{padding:20px;text-align:center;color:var(--text-muted);font-size:12.5px;}
		.nr-done{border:1px solid #bfe3c6;background:#eaf6ec;color:#1d7a33;border-radius:11px;
			padding:12px 15px;margin-bottom:14px;}
		.nr-done b{font-size:15px;}
		.nr-done table{width:100%;margin-top:8px;font-size:12px;color:var(--text-color);}
		.nr-done td{padding:3px 6px;border-bottom:1px solid #cfe6d4;}
		.nr-done th{padding:3px 6px;text-align:left;font-size:10px;text-transform:uppercase;
			letter-spacing:.04em;color:#4f7a58;border-bottom:1px solid #cfe6d4;}
		.nr-done .wat{font-size:11px;color:#4f7a58;white-space:nowrap;}
		</style>
		<div class="nr-wrap">
			<div class="nr-doneslot"></div>
			<div class="nr-card">
				<div class="h">${__("Where it came from")}</div>
				<div class="nr-head">
					<div class="nr-f"><label>${__("Party")}</label>
						<input class="nr-party" list="nr-parties" placeholder="${__("pick, or type a new one")}">
						<datalist id="nr-parties"></datalist>
						<div class="nr-hint">${__("a name that is not on the list is added to Repair Parties")}</div></div>
					<div class="nr-f"><label>${__("Received")}</label>
						<input type="datetime-local" class="nr-when"></div>
					<div class="nr-f"><label>${__("Received by")}</label>
						<div class="who nr-who"></div></div>
				</div>
			</div>
			<div class="nr-card">
				<div class="h">${__("The pieces")}</div>
				<table class="nr-t"><thead><tr>
					<th style="width:18%;">${__("Design Type")}</th>
					<th style="width:6%;">${__("Qty")}</th>
					<th style="width:9%;">${__("Weight g")}</th>
					<th style="width:7%;">${__("Karat")}</th>
					<th style="width:19%;">${__("Type of Work")}</th>
					<th style="width:12%;">${__("Type")}</th>
					<th style="width:14%;">${__("Stones")}</th>
					<th>${__("Narration")}</th>
					<th style="width:34px;"></th>
				</tr></thead><tbody class="nr-body"></tbody></table>
				<button class="btn btn-xs btn-default nr-add">+ ${__("another piece")}</button>
				<div class="nr-tot"></div>
			</div>
			<div class="nr-card">
				<div class="h">${__("Anything else")}</div>
				<div class="nr-f"><textarea class="nr-note" rows="2"
					placeholder="${__("a note about the whole batch")}"></textarea></div>
			</div>
		</div>
		<datalist id="nr-works"></datalist>
		<datalist id="nr-types"></datalist>
		<datalist id="nr-dtypes"></datalist>`);
	const root = $(page.main);

	const blank = () => ({ design_type: "", repair_type: "", qty: 1, weight: "",
		karat: "", work_types: [], stones: [], narration: "" });

	function paintRows() {
		const o = S.opts;
		root.find(".nr-body").html(S.rows.length ? S.rows.map((r, i) => `
			<tr data-i="${i}">
				<td><input class="nr-dt" list="nr-dtypes" value="${esc(r.design_type)}"
					placeholder="${__("design type")}"></td>
				<td class="num"><input class="nr-qty" type="number" min="1" step="1" value="${cint(r.qty) || 1}"></td>
				<td class="num"><input class="nr-wt" type="number" min="0" step="0.001"
					value="${r.weight === "" || r.weight === undefined ? "" : r.weight}"></td>
				<td><select class="nr-kt">${["", "22", "18", "14", "9"].map((k) =>
					`<option value="${k}" ${(r.karat || "") === k ? "selected" : ""}>${k || "—"}</option>`).join("")}</select></td>
				<td><div class="nr-works">
					${(r.work_types || []).map((w) =>
						`<span class="nr-chip">${esc(w)}<b data-w="${esc(w)}">&times;</b></span>`).join("")}
					<input class="nr-work" list="nr-works"
						placeholder="${(r.work_types || []).length ? __("add another") : __("optional")}">
				</div></td>
				<td><input class="nr-type" list="nr-types" value="${esc(r.repair_type)}"
					placeholder="${__("pick or type")}"></td>
				<td class="nr-st">${(r.stones || []).length
					? (r.stones || []).map((st) => `${esc(st.stone)} ${esc(st.sieve || "")} ${
						cint(st.pcs)}/${(parseFloat(st.ct) || 0).toFixed(3)}`).join("<br>")
					: `<span class="nr-addst">${__("add stone")}</span>`}</td>
				<td><input class="nr-nar" value="${esc(r.narration)}" placeholder="${__("optional")}"></td>
				<td><button class="nr-del" title="${__("remove")}">&times;</button></td>
			</tr>`).join("") : `<tr><td colspan="9" class="nr-none">${
				__("Nothing on the list yet — add a piece.")}</td></tr>`);
		paintTotals();
		page.set_primary_action(__("Take it in"), save, "add");
	}

	// an empty row is scaffolding, not a piece — it is the design type that makes
	// a line real, so nothing is counted until one is picked
	function paintTotals() {
		const real = S.rows.filter((r) => (r.design_type || "").trim());
		const grams = real.reduce((a, r) => a + (parseFloat(r.weight) || 0), 0);
		root.find(".nr-tot").html(real.length
			? `<span>${__("Lines")} <b>${real.length}</b></span>`
			  + `<span>${__("Pieces")} <b>${real.reduce((a, r) => a + cint(r.qty), 0)}</b></span>`
			  + (grams ? `<span>${__("Weight")} <b>${grams.toFixed(3)} g</b></span>` : "")
			: "");
	}

	function fillLists() {
		const o = S.opts;
		root.find("#nr-parties").html(o.parties.map((p) => `<option value="${esc(p)}">`).join(""));
		root.find("#nr-works").html(o.work_types.map((w) => `<option value="${esc(w)}">`).join(""));
		root.find("#nr-types").html((o.types || []).map((t) => `<option value="${esc(t)}">`).join(""));
		root.find("#nr-dtypes").html(o.design_types.map((d) => `<option value="${esc(d)}">`).join(""));
		root.find(".nr-who").text(o.received_by_name || o.received_by || "");
	}

	function load() {
		frappe.call({ method: API + ".get_repair_intake_options", freeze: false }).then((r) => {
			S.opts = r.message || S.opts;
			fillLists();
			if (!root.find(".nr-when").val()) {
				// the counter's clock, not the server's midnight
				const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
				root.find(".nr-when").val(d.toISOString().slice(0, 16));
			}
			if (!S.rows.length) S.rows = [blank()];
			paintRows();
		});
	}

	// keep what is typed as it is typed — a repaint must never lose a half-filled row
	function addWork(i, val) {
		const r = S.rows[i];
		const name = (val || "").trim();
		if (!r || !name) return;
		r.work_types = r.work_types || [];
		// same name twice on one piece says nothing extra
		if (!r.work_types.some((w) => w.toLowerCase() === name.toLowerCase())) r.work_types.push(name);
		paintRows();
		// carry on where they were: the next type for the same piece
		root.find(`tr[data-i="${i}"] .nr-work`).trigger("focus");
	}
	root.on("keydown", ".nr-work", function (e) {
		if (e.key !== "Enter" && e.key !== ",") return;
		e.preventDefault();
		addWork(cint($(this).closest("tr").data("i")), this.value);
		this.value = "";
	});
	// picking from the list fires change, not Enter
	root.on("change", ".nr-work", function () {
		if (!this.value) return;
		addWork(cint($(this).closest("tr").data("i")), this.value);
		this.value = "";
	});
	root.on("blur", ".nr-work", function () {
		if (!this.value.trim()) return;
		addWork(cint($(this).closest("tr").data("i")), this.value);
		this.value = "";
	});
	root.on("click", ".nr-chip b", function () {
		const i = cint($(this).closest("tr").data("i"));
		const w = this.getAttribute("data-w");
		S.rows[i].work_types = (S.rows[i].work_types || []).filter((x) => x !== w);
		paintRows();
	});

	root.on("change", ".nr-kt", function () {
		S.rows[cint($(this).closest("tr").data("i"))].karat = this.value || "";
	});

	root.on("input change", ".nr-dt, .nr-type, .nr-qty, .nr-wt, .nr-nar", function () {
		const i = cint($(this).closest("tr").data("i"));
		const r = S.rows[i];
		if (!r) return;
		if ($(this).hasClass("nr-dt")) r.design_type = this.value;
		else if ($(this).hasClass("nr-type")) r.repair_type = this.value;
		else if ($(this).hasClass("nr-qty")) r.qty = cint(this.value);
		else if ($(this).hasClass("nr-wt")) r.weight = this.value;
		else r.narration = this.value;
		if ($(this).hasClass("nr-qty") || $(this).hasClass("nr-dt")
			|| $(this).hasClass("nr-wt")) paintTotals();
	});
	root.on("click", ".nr-add", () => { S.rows.push(blank()); paintRows(); });
	root.on("click", ".nr-del", function () {
		S.rows.splice(cint($(this).closest("tr").data("i")), 1);
		if (!S.rows.length) S.rows = [blank()];
		paintRows();
	});

	// Stones a piece comes in with, recorded at the counter. Same editor as the
	// billing screen — nothing is issued from stock, the sieve chart is only used
	// so the sizes read the same everywhere.
	root.on("click", "td.nr-st", function () {
		const i = cint($(this).closest("tr").data("i"));
		jewelima.repairStoneDialog(S.rows[i].stones || [], S.opts.sieves || [], (out) => {
			S.rows[i].stones = out;
			paintRows();
		});
	});

	function save() {
		const party = (root.find(".nr-party").val() || "").trim();
		if (!party) return frappe.msgprint(__("Say which party this came from."));
		const rows = S.rows.filter((r) => (r.design_type || "").trim());
		if (!rows.length) return frappe.msgprint(__("Every piece needs a design type."));
		// a line with work or a note but no design type is half-written, not a piece
		const short = S.rows.filter((r) => !(r.design_type || "").trim() &&
			((r.work_types || []).length || (r.repair_type || "").trim() || (r.narration || "").trim()));
		if (short.length) return frappe.msgprint(
			__("{0} line(s) have no design type — it cannot be left blank.", [short.length]));

		const when = root.find(".nr-when").val();
		frappe.dom.freeze(__("Taking it in…"));
		frappe.call({ method: API + ".create_repair_order", args: { payload: {
			party, received_at: when ? when.replace("T", " ") + ":00" : null,
			narration: root.find(".nr-note").val() || "",
			items: rows,
		} } }).then((r) => {
			const m = r.message || {};
			S.saved = m;
			showDone(m);
			S.rows = [blank()];
			root.find(".nr-party").val("");
			root.find(".nr-note").val("");
			paintRows();
			load();          // a newly typed party or work type joins the lists
		}).always(() => frappe.dom.unfreeze());
	}

	function showDone(m) {
		root.find(".nr-doneslot").html(`
			<div class="nr-done">
				<b>${esc(m.name)}</b> — ${__("taken in from")} <b>${esc(m.party)}</b>
				· ${m.total_rows} ${__("line(s)")} · ${m.total_qty} ${__("piece(s)")}
				<table><thead><tr>
					<th>${__("Repair")}</th><th>${__("Design Type")}</th><th>${__("Qty")}</th>
					<th>${__("Weight")}</th><th>${__("Type of Work")}</th><th>${__("Type")}</th>
					<th>${__("Weighed")}</th></tr></thead><tbody>${(m.items || []).map((r) => `
					<tr><td><b>${esc(r.repair)}</b></td><td>${esc(r.design_type)}</td>
					<td>${r.qty}</td>
					<td>${r.weight ? r.weight.toFixed(3) + " g" : "—"}</td>
					<td>${esc((r.work_types || []).join(", ") || "—")}</td>
					<td>${esc(r.repair_type || "—")}</td>
					<td class="wat">${esc(r.weighed_at || "")}</td>
					<td>${esc(r.narration || "")}</td></tr>`).join("")}</tbody></table>
			</div>`);
	}

	page.add_inner_button(__("Masters"), () => frappe.set_route("repair-masters"));
	frappe.pages["new-repair-order"].on_page_show = load;
};
