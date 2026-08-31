// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Request Feature — anyone on the desk can raise a feature / improvement /
// bug and track its status; only the administrator moves it off Open.
// Route: /app/request-feature

frappe.pages["request-feature"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Request Feature", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	let DATA = null;
	let FST = "Open"; // status filter — the page opens on what still needs doing
	let FCAT = "";    // category filter
	let MINE = false; // only my requests

	$(page.main).append(`
		<style>
		#page-request-feature .container{max-width:100%;}
		.rf-top{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;margin-bottom:16px;}
		.rf-form{border:1px solid var(--border-color);border-radius:11px;background:var(--fg-color);padding:14px 16px;flex:0 0 360px;}
		.rf-form .h{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px;}
		.rf-form label{display:block;font-size:10.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin:8px 0 3px;}
		.rf-form input,.rf-form select,.rf-form textarea{width:100%;box-sizing:border-box;border:1px solid var(--border-color);border-radius:7px;padding:7px 9px;font-size:12.5px;background:var(--fg-color);color:var(--text-color);}
		.rf-form textarea{min-height:120px;resize:vertical;}
		.rf-btn{border:none;color:#fff;font-weight:800;padding:9px 18px;border-radius:8px;cursor:pointer;background:#2e7d32;margin-top:12px;width:100%;}
		.rf-side{flex:1;min-width:420px;}
		.rf-tiles{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;}
		.rf-cats{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;align-items:center;}
		.rf-cats .lbl{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-right:2px;}
		.rf-cat-f{border:1px solid var(--border-color);border-radius:12px;padding:2px 11px;font-size:12px;cursor:pointer;background:var(--fg-color);}
		.rf-cat-f.on{background:#1f618d;border-color:#1f618d;color:#fff;font-weight:700;}
		.rf-tile{border:1px solid var(--border-color);border-radius:9px;padding:6px 14px;background:var(--control-bg);cursor:pointer;}
		.rf-tile.on{border-color:#1f618d;box-shadow:0 0 0 1px #1f618d inset;}
		.rf-tile .k{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;}
		.rf-tile .v{font-size:17px;font-weight:800;}
		.rf-controls{display:flex;gap:10px;align-items:center;margin-bottom:8px;font-size:12px;}
		.rf-card{border:1px solid var(--border-color);border-radius:10px;background:var(--fg-color);padding:11px 14px;margin-bottom:9px;}
		.rf-card .rh{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;}
		.rf-card .rt{font-size:14px;font-weight:800;}
		.rf-card .desc{font-size:12.5px;color:var(--text-color);margin:6px 0;white-space:pre-wrap;}
		.rf-card .meta{font-size:11px;color:var(--text-muted);}
		.rf-badge{border-radius:9px;padding:1px 10px;font-size:10.5px;font-weight:800;}
		.rf-badge.Open{background:#fdf3d0;color:#8a6d00;}
		.rf-badge.InProgress{background:#e3e7f5;color:#333d8f;}
		.rf-badge.InTest{background:#d9f0ef;color:#0f6e66;}
		.rf-badge.OnHold{background:#e6e6e6;color:#555;}
		.rf-badge.Closed{background:#dcefe0;color:#1d7a33;}
		.rf-badge.Declined{background:#f5dddd;color:#b02a2a;}
		.rf-cat{border:1px solid var(--border-color);border-radius:9px;padding:1px 9px;font-size:10.5px;font-weight:700;color:var(--text-muted);}
		.rf-admin{margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;border-top:1px dashed var(--border-color);padding-top:8px;}
		.rf-admin button{border:none;border-radius:6px;padding:4px 11px;font-size:11px;font-weight:700;color:#fff;cursor:pointer;}
		.rf-note{border:1px solid var(--border-color);border-radius:6px;padding:4px 8px;font-size:11.5px;background:var(--control-bg);color:var(--text-color);margin-top:6px;}
		.rf-own{margin-top:7px;}
		.rf-own button{border:1px solid var(--border-color);background:var(--fg-color);
			color:var(--text-color);border-radius:7px;padding:3px 11px;font-size:11.5px;
			font-weight:700;cursor:pointer;}
		.rf-own button:hover{background:var(--control-bg);}
		.rf-none{padding:30px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:10px;}
		</style>
		<div class="rf-top">
			<div class="rf-form">
				<div class="h">${__("Raise a request")}</div>
				<label>${__("Your request")}</label><textarea class="rf-desc" placeholder="${__("Describe what you want — write as much as you like.")}"></textarea>
				<label>${__("Category")}</label>
				<select class="rf-cat-in"><option>Feature</option><option>Improvement</option><option>Bug</option><option>Claude</option><option>Other</option></select>
				<button class="rf-btn rf-submit">${__("Submit request")}</button>
			</div>
			<div class="rf-side">
				<div class="rf-tiles"></div>
				<div class="rf-cats"></div>
				<div class="rf-controls">
					<label style="cursor:pointer;"><input type="checkbox" class="rf-mine"> ${__("only mine")}</label>
					<span style="margin-left:auto;color:var(--text-muted);" class="rf-hint"></span>
				</div>
				<div class="rf-list"><div class="rf-none">${__("loading…")}</div></div>
			</div>
		</div>
	`);
	const root = $(page.main);

	function load() {
		frappe.call({ method: API + ".list_feature_requests", args: { status: FST || undefined, category: FCAT || undefined, mine: MINE ? 1 : 0 } })
			.then((r) => { DATA = r.message || { rows: [], counts: {} }; paint(); });
	}

	function paint() {
		const c = DATA.counts || {};
		// the working states first, All last: the page is for what is still live,
		// and All is where you go to look something up rather than where you start
		const tiles = [["Open", "Open"], ["In Progress", "In Progress"], ["In Test", "In Test"],
			["On Hold", "On Hold"], ["Closed", "Closed"], ["Declined", "Declined"], ["", __("All")]];
		root.find(".rf-tiles").html(tiles.map(([k, lbl]) => {
			const v = k === "" ? Object.values(c).reduce((a, b) => a + (b || 0), 0) : (c[k] || 0);
			return `<div class="rf-tile ${FST === k ? "on" : ""}" data-s="${esc(k)}"><div class="k">${lbl}</div><div class="v">${v}</div></div>`;
		}).join(""));
		const cc = DATA.cat_counts || {};
		const cats = ["", "Feature", "Improvement", "Bug", "Claude", "JOE TODO", "Other"];
		root.find(".rf-cats").html(`<span class="lbl">${__("Category")}</span>` + cats.map((k) => {
			const n = k === "" ? Object.values(cc).reduce((a, b) => a + (b || 0), 0) : (cc[k] || 0);
			return `<span class="rf-cat-f ${FCAT === k ? "on" : ""}" data-c="${esc(k)}">${k || __("All")} (${n})</span>`;
		}).join(""));
		root.find(".rf-hint").text(DATA.is_admin ? __("You're admin — you can change any status.") : __("Only the admin can change status."));
		const badge = (st) => `<span class="rf-badge ${(st || "").replace(/\s+/g, "")}">${esc(st)}</span>`;
		root.find(".rf-list").html((DATA.rows || []).length ? DATA.rows.map((r) => `
			<div class="rf-card" data-n="${esc(r.name)}">
				<div class="rh">
					<span class="rt">${esc(r.title)}</span>
					${badge(r.status)}<span class="rf-cat">${esc(r.category || "")}</span>
					<span class="meta" style="margin-left:auto;">${esc(r.name)}</span>
				</div>
				${r.description && r.description.trim() !== (r.title || "").trim() ? `<div class="desc">${esc(r.description)}</div>` : ""}
				<div class="meta">${__("by")} <b>${esc(r.requested_by_name || r.requested_by)}</b>${r.requested_by === DATA.me ? " · " + __("you") : ""}
					· ${esc((r.requested_on || "").slice(0, 16))}
					${r.closed_by ? " · " + __("closed by {0}", [esc((r.closed_by || "").split("@")[0])]) + " " + esc((r.closed_on || "").slice(0, 16)) : ""}</div>
				${r.admin_note ? `<div class="rf-note">📌 ${esc(r.admin_note)}</div>` : ""}
				${r.status === "Open" && (DATA.is_admin || r.requested_by === DATA.me)
					? `<div class="rf-own"><button class="rf-edit" data-n="${esc(r.name)}">${__("Edit")}</button></div>`
					: ""}
				${DATA.is_admin ? `<div class="rf-admin">
					${["Open", "In Progress", "In Test", "On Hold", "Closed", "Declined"].filter((s) => s !== r.status).map((s) =>
						`<button class="rf-set" data-n="${esc(r.name)}" data-s="${s}" style="background:${s === "Closed" ? "#1d7a33" : s === "Declined" ? "#b02a2a" : s === "In Progress" ? "#333d8f" : s === "In Test" ? "#0f6e66" : s === "On Hold" ? "#777" : "#8a6d00"};">${__("→ {0}", [s])}</button>`).join("")}
				</div>` : ""}
			</div>`).join("")
			: `<div class="rf-none">${FST || FCAT || MINE
				? __("Nothing matches.")
				: __("No requests yet — raise the first one.")}</div>`);
	}

	// A request can be reworded while it is still Open: the person who raised it
	// fixes their own, the admin fixes anyone's. Once it moves on somebody has
	// acted on what it said, so the text stops being editable — the server
	// enforces that, this just hides the button.
	root.on("click", ".rf-edit", function () {
		const name = this.getAttribute("data-n");
		const r = (DATA.rows || []).find((x) => x.name === name);
		if (!r) return;
		const d = new frappe.ui.Dialog({
			title: __("Edit {0}", [name]), size: "large",
			fields: [
				{ fieldname: "description", fieldtype: "Small Text", label: __("Request"),
					reqd: 1, default: r.description || r.title || "" },
				{ fieldname: "category", fieldtype: "Select", label: __("Category"),
					options: ["Feature", "Improvement", "Bug", "Claude", "JOE TODO", "Other"].join("\n"),
					default: r.category || "Feature" },
			],
			primary_action_label: __("Save"),
			primary_action(v) {
				frappe.call({ method: API + ".edit_feature_request",
					args: { name, description: v.description, category: v.category } })
					.then(() => {
						d.hide();
						frappe.show_alert({ message: __("{0} updated", [name]), indicator: "green" }, 4);
						load();
					});
			},
		});
		d.show();
	});

	let rfBusy = false; // guard: a double Enter / double click must not file twice
	root.on("click", ".rf-submit", () => {
		if (rfBusy) return;
		const text = (root.find(".rf-desc").val() || "").trim();
		if (!text) return frappe.show_alert({ message: __("Write your request."), indicator: "orange" }, 3);
		rfBusy = true;
		root.find(".rf-submit").prop("disabled", true);
		frappe.dom.freeze(__("Submitting…"));
		frappe.call({ method: API + ".submit_feature_request", args: {
			description: text, category: root.find(".rf-cat-in").val(),
		} }).then((r) => {
			frappe.dom.unfreeze();
			rfBusy = false;
			root.find(".rf-submit").prop("disabled", false);
			frappe.show_alert({ message: __("Request {0} raised — status Open.", [r.message.name]), indicator: "green" }, 5);
			root.find(".rf-desc").val("");
			load();
		}).catch(() => {
			frappe.dom.unfreeze();
			rfBusy = false;
			root.find(".rf-submit").prop("disabled", false);
		});
	});
	root.on("click", ".rf-cat-f", function () {
		FCAT = $(this).data("c") || "";
		load();
	});
	root.on("click", ".rf-tile", function () {
		FST = $(this).data("s");
		load();
	});
	root.on("change", ".rf-mine", function () {
		MINE = this.checked;
		load();
	});
	root.on("click", ".rf-set", function () {
		const name = this.getAttribute("data-n");
		const status = this.getAttribute("data-s");
		// one click = direct transaction, no note prompt (house style)
		frappe.call({ method: API + ".set_feature_request_status", args: { name, status, admin_note: "" } }).then(() => {
			frappe.show_alert({ message: __("{0} → {1}", [name, status]), indicator: "green" }, 4);
			load();
		});
	});

	load();
};
