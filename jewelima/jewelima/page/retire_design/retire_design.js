// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Retire Design — permanently remove a Design Bank catalog entry.
//   Pick a design (by Design No), see its image + info, then delete it — BUT only if it
//   has never been used to create a manufacturing Design (Design.design_bank). If it has,
//   deletion is blocked and the using Design(s) are shown.
// Route: /app/retire-design

frappe.pages["retire-design"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Retire Design", single_column: true });
	const API = "jewelima.jewelima.design_bank_api";
	let current = null;

	$(page.main).append(`
		<style>
		.rd-wrap{max-width:760px;margin:4px auto 40px;}
		.rd-pick{margin-bottom:16px;}
		.rd-card{border:1px solid var(--border-color);border-radius:10px;background:var(--fg-color);overflow:hidden;}
		.rd-top{display:flex;gap:18px;padding:18px 20px;}
		.rd-img{width:190px;height:190px;flex:0 0 190px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-light-gray,#f5f6f8);display:flex;align-items:center;justify-content:center;overflow:hidden;}
		.rd-img img{width:100%;height:100%;object-fit:cover;}
		.rd-img .ph{color:var(--text-muted);font-size:12px;}
		.rd-info{flex:1;min-width:0;}
		.rd-dno{font-size:22px;font-weight:700;margin-bottom:10px;word-break:break-word;}
		.rd-meta{display:flex;gap:26px;margin-bottom:12px;}
		.rd-meta .k{font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;}
		.rd-meta .v{font-size:16px;font-weight:600;}
		.rd-note{font-size:13px;color:var(--text-color);margin-bottom:12px;}
		.rd-note .k{font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;display:block;}
		.rd-tags{display:flex;flex-wrap:wrap;gap:6px;}
		.rd-tag{background:var(--bg-light-gray,#f1f3f5);border:1px solid var(--border-color);border-radius:14px;padding:2px 10px;font-size:12px;}
		.rd-banner{padding:12px 20px;font-size:13px;border-top:1px solid var(--border-color);}
		.rd-banner.block{background:#fbeaea;color:#b00020;}
		.rd-banner.ok{background:#eaf6ec;color:#1d7a33;}
		.rd-banner a{color:inherit;text-decoration:underline;font-weight:600;}
		.rd-actions{padding:0 20px 18px;display:flex;}
		.btn-danger.rd-del{background:#b00020;border-color:#b00020;color:#fff;}
		</style>
		<div class="rd-wrap">
			<div class="rd-pick"></div>
			<div class="rd-card" style="display:none;">
				<div class="rd-top">
					<div class="rd-img"></div>
					<div class="rd-info">
						<div class="rd-dno"></div>
						<div class="rd-meta"></div>
						<div class="rd-note"></div>
						<div class="rd-tags"></div>
					</div>
				</div>
				<div class="rd-banner"></div>
				<div class="rd-actions"></div>
			</div>
		</div>
	`);

	const esc = frappe.utils.escape_html;
	const $card = $(page.main).find(".rd-card");
	const pick = frappe.ui.form.make_control({
		df: {
			fieldtype: "Link",
			options: "Design Bank",
			label: "Design",
			fieldname: "design",
			description: "Search by Design No.",
			onchange: () => load(pick.get_value()),
		},
		parent: $(page.main).find(".rd-pick").get(0),
		render_input: true,
	});
	pick.refresh();

	function load(name) {
		if (!name) {
			current = null;
			$card.hide();
			return;
		}
		frappe.call(API + ".get_design_bank_detail", { name }).then((r) => render(r.message));
	}

	function render(d) {
		current = d;
		$(page.main).find(".rd-img").html(d.image ? `<img src="${esc(d.image)}">` : `<span class="ph">no image</span>`);
		$(page.main).find(".rd-dno").text(d.design_no || d.name);
		$(page.main).find(".rd-meta").html(`
			<div><div class="k">GW (g)</div><div class="v">${d.gross_weight || "—"}</div></div>
			<div><div class="k">DW (ct)</div><div class="v">${d.diamond_weight || "—"}</div></div>`);
		$(page.main).find(".rd-note").html(d.note ? `<span class="k">Note</span>${esc(d.note)}` : "");
		$(page.main).find(".rd-tags").html((d.tags || []).map((t) => `<span class="rd-tag">${esc(t)}</span>`).join(""));

		const $banner = $(page.main).find(".rd-banner").removeClass("block ok");
		const $actions = $(page.main).find(".rd-actions").empty();
		if (d.used_by && d.used_by.length) {
			const links = d.used_by.map((n) => `<a href="/app/design/${encodeURIComponent(n)}">${esc(n)}</a>`).join(", ");
			$banner.addClass("block").html(`🔒 Cannot delete — used to create Design: ${links}.`);
		} else {
			$banner.addClass("ok").html("✓ Not used in manufacturing — safe to remove from the Design Bank.");
			$(`<button class="btn btn-sm btn-danger rd-del">Delete from Design Bank</button>`)
				.appendTo($actions)
				.on("click", doDelete);
		}
		$card.show();
	}

	function doDelete() {
		if (!current) return;
		const dno = current.design_no || current.name;
		frappe.confirm(
			__("Permanently remove <b>{0}</b> from the Design Bank? This cannot be undone.", [esc(dno)]),
			() => {
				frappe.dom.freeze(__("Deleting…"));
				frappe.call(API + ".delete_design_bank", { name: current.name })
					.then((r) => {
						frappe.dom.unfreeze();
						frappe.show_alert({ message: __("Removed {0} from the Design Bank.", [esc((r.message || {}).design_no || dno)]), indicator: "green" }, 6);
						pick.set_value("");
						current = null;
						$card.hide();
					})
					.catch(() => frappe.dom.unfreeze());
			}
		);
	}

	page.add_inner_button(__("Open Gallery"), () => frappe.set_route("design-gallery"));
};
