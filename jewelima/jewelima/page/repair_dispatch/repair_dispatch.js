// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Repair > Dispatch — the goods physically going back.
//
// A batch is billed a handful at a time, and collected the same way, so this is
// a list of PIECES rather than of bills: a party can take half of one bill and
// all of another in the same trip. Only BILLED pieces appear — the bill is what
// says the work is finished and priced, and nothing leaves before that.
//
// Pick a party, tick the pieces, say who is carrying them and how, and Dispatch.
// Route: /app/repair-dispatch

frappe.pages["repair-dispatch"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper, title: __("DISPATCH"), single_column: true,
	});
	const API = "jewelima.jewelima.repair_api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => parseFloat(v) || 0;
	const cint = (v) => parseInt(v, 10) || 0;
	const g3 = (v) => flt(v).toFixed(3);

	const S = { rows: [], parties: [], party: "", sel: new Set(), recent: [] };
	const root = $(page.main);

	root.append(`
		<style>
		#page-repair-dispatch .container{max-width:100%;}
		.dp-bar{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px;}
		.dp-f{display:flex;flex-direction:column;gap:3px;}
		.dp-f label{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);}
		.dp-f select,.dp-f input{border:1px solid var(--border-color);border-radius:7px;height:32px;
			padding:2px 9px;font-size:13px;background:var(--control-bg);color:var(--text-color);}
		.dp-count{margin-left:auto;font-size:12.5px;color:var(--text-muted);}
		.dp-go{background:#1d7a33;border-color:#1d7a33;color:#fff;font-weight:700;height:32px;}
		table.dp-t{width:100%;border-collapse:collapse;font-size:13px;background:var(--fg-color);
			border:1px solid var(--border-color);border-radius:10px;overflow:hidden;}
		table.dp-t th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em;
			color:var(--text-muted);padding:7px 10px;background:var(--control-bg);
			border-bottom:1px solid var(--border-color);}
		table.dp-t td{padding:6px 10px;border-bottom:1px solid var(--border-color);}
		table.dp-t td.num,table.dp-t th.num{text-align:right;white-space:nowrap;}
		table.dp-t tr.on td{background:var(--bg-light-gray,#eef3ee);}
		.dp-none{padding:26px;text-align:center;color:var(--text-muted);font-size:13px;}
		.dp-sec{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;
			color:var(--text-muted);margin:20px 0 8px;}
		.dp-recent td{font-size:12.5px;}
		.dp-mode{display:inline-block;border-radius:10px;padding:1px 9px;font-size:10.5px;
			font-weight:800;letter-spacing:.04em;color:#fff;}
		.dp-mode.hand{background:#1f618d;} .dp-mode.parcel{background:#b35a00;}
		</style>
		<div class="dp-bar">
			<div class="dp-f"><label>${__("Party")}</label><select class="dp-party"></select></div>
			<div class="dp-f"><label>${__("Mode")}</label>
				<select class="dp-modesel">
					<option value="In Hand" selected>${__("In Hand")}</option>
					<option value="Parcel">${__("Parcel")}</option>
				</select></div>
			<div class="dp-f"><label>${__("Given to")}</label>
				<input class="dp-given" placeholder="${__("who is taking it")}" style="width:200px;"></div>
			<button class="btn btn-sm dp-go" disabled>${__("Dispatch")}</button>
			<span class="dp-count"></span>
		</div>
		<div class="dp-body"></div>
		<div class="dp-sec">${__("Recent handovers")}</div>
		<div class="dp-recentbody"></div>
	`);

	function visible() {
		return S.rows.filter((r) => !S.party || r.party === S.party);
	}

	function paint() {
		const rows = visible();
		const picked = rows.filter((r) => S.sel.has(r.repair));
		root.find(".dp-count").text(rows.length
			? __("{0} piece(s) waiting to go back · {1} ticked", [rows.length, picked.length])
			: "");
		root.find(".dp-go").prop("disabled", !picked.length)
			.text(picked.length ? __("Dispatch {0} piece(s)", [picked.length]) : __("Dispatch"));

		root.find(".dp-body").html(rows.length ? `
			<table class="dp-t"><thead><tr>
				<th style="width:32px;"><input type="checkbox" class="dp-all"
					${rows.length && rows.every((r) => S.sel.has(r.repair)) ? "checked" : ""}></th>
				<th>${__("Piece")}</th><th>${__("Party")}</th><th>${__("Design")}</th>
				<th class="num">${__("Qty")}</th><th class="num">${__("Weight out")}</th>
				<th>${__("Bill")}</th><th>${__("Billed")}</th><th>${__("Came in")}</th>
			</tr></thead><tbody>
			${rows.map((r) => `<tr class="${S.sel.has(r.repair) ? "on" : ""}">
				<td><input type="checkbox" class="dp-sel" data-n="${esc(r.repair)}"
					${S.sel.has(r.repair) ? "checked" : ""}></td>
				<td><b>${esc(r.repair)}</b></td>
				<td>${esc(r.party || "")}</td>
				<td>${esc(r.design_type || "")}</td>
				<td class="num">${cint(r.qty)}</td>
				<td class="num">${g3(r.weight_out)}</td>
				<td>${esc(r.bill || "")}</td>
				<td>${esc(r.billed_at || "")}</td>
				<td>${esc(r.received_at || "")}${r.received_from
					? ` · <span style="color:var(--text-muted);">${esc(r.received_from)}</span>` : ""}</td>
			</tr>`).join("")}</tbody></table>`
			: `<div class="dp-none">${S.party
				? __("Nothing billed and waiting for {0}.", [S.party])
				: __("Nothing is billed and waiting to go back.")}</div>`);

		root.find(".dp-recentbody").html(S.recent.length ? `
			<table class="dp-t dp-recent"><thead><tr>
				<th>${__("Note")}</th><th>${__("Party")}</th><th>${__("Mode")}</th>
				<th>${__("Given to")}</th><th class="num">${__("Pieces")}</th>
				<th class="num">${__("Weight")}</th><th>${__("When")}</th>
			</tr></thead><tbody>
			${S.recent.map((r) => `<tr>
				<td><b>${esc(r.name)}</b></td><td>${esc(r.party || "")}</td>
				<td><span class="dp-mode ${r.dispatch_mode === "Parcel" ? "parcel" : "hand"}">${
					esc(r.dispatch_mode || "")}</span></td>
				<td>${esc(r.given_to || "—")}</td>
				<td class="num">${cint(r.total_pieces)}</td>
				<td class="num">${g3(r.total_weight)}</td>
				<td>${esc(r.dispatched_at || "")}</td>
			</tr>`).join("")}</tbody></table>`
			: `<div class="dp-none">${__("Nothing has gone back yet.")}</div>`);
	}

	function load() {
		const $b = root.find(".dp-body");
		jewelima.busy($b, true, __("Loading what is ready to go…"));
		frappe.call({ method: API + ".list_dispatchable", freeze: false })
			.then((r) => {
				const m = r.message || {};
				S.rows = m.rows || [];
				S.parties = m.parties || [];
				// a party that no longer has anything waiting must not stay selected,
				// or the board looks empty for a reason nobody can see
				if (S.party && !S.parties.includes(S.party)) S.party = "";
				S.sel.clear();
				root.find(".dp-party").html(`<option value="">${__("— every party —")}</option>`
					+ S.parties.map((p) => `<option ${p === S.party ? "selected" : ""}>${esc(p)}</option>`).join(""));
				paint();
			})
			.always(() => jewelima.busy($b, false));
		frappe.call({ method: API + ".list_repair_dispatches", freeze: false })
			.then((r) => { S.recent = r.message || []; paint(); });
	}

	root.on("change", ".dp-party", function () { S.party = this.value; S.sel.clear(); paint(); });
	root.on("change", ".dp-sel", function () {
		const n = $(this).data("n");
		if (this.checked) S.sel.add(n); else S.sel.delete(n);
		paint();
	});
	root.on("change", ".dp-all", function () {
		const on = this.checked;
		visible().forEach((r) => { if (on) S.sel.add(r.repair); else S.sel.delete(r.repair); });
		paint();
	});

	root.on("click", ".dp-go", function () {
		const picked = visible().filter((r) => S.sel.has(r.repair));
		if (!picked.length) return;
		// one note, one party — the server refuses a mixed batch, so say so here
		// rather than letting the operator find out after filling the form
		const parties = [...new Set(picked.map((r) => r.party))];
		if (parties.length > 1) {
			frappe.msgprint(__("Those pieces belong to {0} different parties. One handover goes to one party — pick a party above first.",
				[parties.length]));
			return;
		}
		const given = (root.find(".dp-given").val() || "").trim();
		if (!given) {
			frappe.msgprint(__("Say who is taking it — a handover belongs to a person."));
			root.find(".dp-given").trigger("focus");
			return;
		}
		frappe.confirm(
			__("Send {0} piece(s) back to <b>{1}</b>, {2}, with <b>{3}</b>?",
				[picked.length, esc(parties[0]),
				 root.find(".dp-modesel").val() === "Parcel" ? __("by parcel") : __("in hand"),
				 esc(given)]),
			() => {
				frappe.call({
					method: API + ".create_repair_dispatch", freeze: true,
					freeze_message: __("Dispatching…"),
					args: { payload: JSON.stringify({
						party: parties[0],
						pieces: picked.map((r) => r.repair),
						dispatch_mode: root.find(".dp-modesel").val() || "In Hand",
						given_to: given,
					}) },
				}).then((r) => {
					const m = r.message || {};
					frappe.show_alert({ message: __("{0} — {1} piece(s) went back to {2}.",
						[m.name, m.total_pieces, m.party]), indicator: "green" }, 7);
					root.find(".dp-given").val("");
					load();
				});
			});
	});

	page.set_primary_action(__("Refresh"), load, "refresh");
	frappe.pages["repair-dispatch"].on_page_show = load;
	load();
};
