// Add Findings (Stock > Findings) — put a new finding on the register. Pick the
// group it belongs to and the karat follows from it; purity is the karat's, because
// a finding IS gold until the moment it is issued.
// Route: /app/add-findings
frappe.pages["add-findings"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Add Findings"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const S = { groups: [] };

	$(page.main).append(`
		<style>
		#page-add-findings .container{max-width:100%;}
		.af-wrap{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;}
		.af-card{border:1px solid var(--border-color);border-radius:12px;background:var(--fg-color);padding:16px 18px;flex:0 0 400px;}
		.af-card .h{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px;}
		.af-card label{display:block;font-size:10.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin:10px 0 3px;}
		.af-card input,.af-card select{width:100%;box-sizing:border-box;border:1px solid var(--border-color);
			border-radius:8px;padding:8px 10px;font-size:13px;background:var(--fg-color);color:var(--text-color);}
		.af-go{border:none;color:#fff;font-weight:800;padding:11px;border-radius:9px;cursor:pointer;
			background:#2e7d32;margin-top:16px;width:100%;font-size:14px;}
		.af-hint{margin-top:10px;padding:9px 12px;border-radius:9px;background:#eef5fa;border:1px solid #1f618d33;
			font-size:12.5px;color:#1f618d;}
		.af-msg{display:none;margin-top:10px;padding:8px 12px;border-radius:8px;font-size:13px;}
		.af-msg.ok{display:block;background:#eaf6ec;color:#1d7a33;border:1px solid #bfe3c6;}
		.af-msg.err{display:block;background:#fbeaea;color:#b00020;border:1px solid #e6b3b3;}
		.af-list{flex:1 1 420px;min-width:380px;border:1px solid var(--border-color);border-radius:12px;
			background:var(--fg-color);overflow:auto;max-height:calc(100vh - 200px);}
		table.af-t{width:100%;border-collapse:collapse;font-size:12.5px;}
		table.af-t th{position:sticky;top:0;background:var(--control-bg);font-size:10px;text-transform:uppercase;
			color:var(--text-muted);padding:7px 10px;text-align:left;border-bottom:2px solid var(--border-color);}
		table.af-t td{padding:6px 10px;border-bottom:1px solid var(--border-color);}
		</style>
		<div class="af-wrap">
			<div class="af-card">
				<div class="h">${__("New finding")}</div>
				<label>${__("Code")}</label><input type="text" class="af-code" placeholder="${__("e.g. PIPE-18KYG")}">
				<label>${__("Name")}</label><input type="text" class="af-name" placeholder="${__("e.g. Pipe 18K Yellow")}">
				<label>${__("Group")}</label><select class="af-grp"></select>
				<div class="af-hint"></div>
				<button class="af-go">${__("Add finding")}</button>
				<div class="af-msg"></div>
			</div>
			<div class="af-list"><table class="af-t"><thead><tr>
				<th>${__("Code")}</th><th>${__("Name")}</th><th>${__("Group")}</th>
			</tr></thead><tbody class="af-body"></tbody></table></div>
		</div>`);
	const root = $(page.main);

	function hint() {
		const g = root.find(".af-grp").val() || "";
		const m = /^(\d{2})/.exec(g);
		root.find(".af-hint").html(g
			? (/Common/.test(g)
				? __("A <b>{0}K</b> finding with no colour — whoever issues it picks the gold it becomes.", [m ? m[1] : "?"])
				: __("A <b>{0}K</b> finding. Issuing it turns the weight into <b>{1}</b>.", [m ? m[1] : "?",
					esc((/^(\d{2})\s*K([YWP])G/.exec(g) || []).slice(1, 3).join("K") + "G")]))
			: __("Pick the group it belongs to."));
	}

	function load() {
		frappe.call({ method: API + ".get_findings_setup" }).then((r) => {
			S.groups = (r.message || {}).groups || [];
			root.find(".af-grp").html(S.groups.map((g) => `<option>${esc(g.group)}</option>`).join(""));
			hint();
		});
		frappe.call({ method: API + ".get_findings_stock", freeze: false }).then((r) => {
			const rows = (r.message || {}).rows || [];
			root.find(".af-body").html(rows.slice().sort((a, b) => a.item.localeCompare(b.item)).map((x) => `
				<tr><td><b>${esc(x.item)}</b></td><td>${esc(x.name)}</td><td>${esc(x.group)}</td></tr>`).join(""));
		});
	}
	root.on("change", ".af-grp", hint);
	root.on("click", ".af-go", function () {
		const code = (root.find(".af-code").val() || "").trim();
		if (!code) return root.find(".af-msg").removeClass("ok").addClass("err").text(__("Give it a code."));
		$(this).prop("disabled", true);
		frappe.call({ method: API + ".add_finding", args: {
			item_code: code, item_name: root.find(".af-name").val() || code,
			item_group: root.find(".af-grp").val(),
		} }).then((r) => {
			const m = r.message || {};
			root.find(".af-msg").removeClass("err").addClass("ok")
				.html(__("<b>{0}</b> added to {1}.", [esc(m.item), esc(m.group)]));
			root.find(".af-code, .af-name").val("");
			load();
		}).always(() => root.find(".af-go").prop("disabled", false));
	});
	page.add_inner_button(__("Stock"), () => frappe.set_route("findings-stock"));
	frappe.pages["add-findings"].on_page_show = load;
	load();
};
