// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Order Bag Photos — a gallery of all PNG/JPG attached to an Order Bag
// (native attachments + the Attachments tab). Click to enlarge, download, upload.
// Route: /app/order-bag-photos/<order-bag>

frappe.pages["order-bag-photos"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Order Bag Photos", single_column: true });
	const state = {};

	$(page.main).append(`
		<style>
		.obp-head{max-width:360px;margin:4px 0 12px;}
		.obp-head .help-box{display:none !important;}
		.obp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;}
		.obp-cell{position:relative;border:1px solid var(--border-color);border-radius:8px;overflow:hidden;background:var(--control-bg);}
		.obp-cell img{width:100%;height:150px;object-fit:cover;display:block;cursor:zoom-in;}
		.obp-cap{font-size:11px;padding:4px 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
		.obp-dl{position:absolute;top:6px;right:6px;background:rgba(0,0,0,.55);color:#fff;border-radius:6px;padding:2px 7px;font-size:13px;text-decoration:none;}
		.obp-dl:hover{background:rgba(0,0,0,.8);color:#fff;}
		.obp-empty{padding:24px;color:var(--text-muted);}
		.obp-lb{position:fixed;inset:0;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;z-index:1050;}
		.obp-lb img{max-width:92vw;max-height:86vh;object-fit:contain;}
		.obp-lb .obp-lb-dl{position:absolute;top:18px;right:24px;background:#fff;color:#000;border-radius:6px;padding:6px 12px;text-decoration:none;font-weight:600;}
		.obp-lb .obp-lb-x{position:absolute;top:18px;left:24px;color:#fff;font-size:26px;cursor:pointer;line-height:1;}
		</style>
		<div class="obp-head"><div class="obp-bag"></div></div>
		<div class="obp-grid"></div>
		<div class="obp-empty" style="display:none;">No photos for this bag yet — use <b>Upload Photos</b>.</div>
	`);

	const mk = (sel, df) => {
		const c = frappe.ui.form.make_control({ df, parent: $(page.main).find(sel).get(0), render_input: true });
		c.refresh();
		return c;
	};
	state.bag = mk(".obp-bag", { fieldtype: "Link", label: "Order Bag", fieldname: "order_bag", options: "Order Bag" });
	state.bag.$input.on("change awesomplete-selectcomplete", () => setTimeout(load, 80));

	// arriving from the Workstation with a card pre-picked — auto-fetch its photos.
	// exposed so on_page_show re-runs it on every visit (on_page_load fires once)
	function prefillFromRoute() {
		if (frappe.route_options && frappe.route_options.order_bag) {
			const bag = frappe.route_options.order_bag;
			frappe.route_options = null;
			Promise.resolve(state.bag.set_value(bag)).then(() => load());
		}
	}
	frappe.pages["order-bag-photos"]._prefill = prefillFromRoute;

	const $grid = $(page.main).find(".obp-grid");
	const $empty = $(page.main).find(".obp-empty");

	function load() {
		const bag = state.bag.get_value();
		$grid.empty();
		$empty.hide();
		if (!bag) return;
		frappe.call({ method: "jewelima.jewelima.api.get_order_bag_images", args: { order_bag: bag } }).then((r) => {
			const imgs = r.message || [];
			if (!imgs.length) {
				$empty.show();
				return;
			}
			imgs.forEach((im) => {
				const url = frappe.utils.escape_html(im.file_url);
				const name = frappe.utils.escape_html(im.file_name || "");
				const del = im.can_delete
					? `<span class="obp-del" title="Delete (yours)" style="position:absolute;top:4px;left:4px;background:#b02a2a;color:#fff;border-radius:50%;width:22px;height:22px;line-height:22px;text-align:center;font-weight:800;cursor:pointer;">×</span>`
					: "";
				const $cell = $(`
					<div class="obp-cell" style="position:relative;">
						<img src="${url}" loading="lazy" title="${name}">
						<a class="obp-dl" href="${url}" download title="Download">⬇</a>
						${del}
						<div class="obp-cap">${name}</div>
					</div>`);
				$cell.find("img").on("click", () => lightbox(im.file_url));
				$cell.find(".obp-del").on("click", (e) => {
					e.stopPropagation();
					frappe.confirm(__("Delete this photo? (only images you added)"), () => {
						frappe.call({ method: "jewelima.jewelima.api.delete_order_bag_image",
							args: { order_bag: bag, file_url: im.file_url } }).then(() => {
							frappe.show_alert({ message: __("Deleted"), indicator: "red" }, 2);
							load();
						});
					});
				});
				$grid.append($cell);
			});
		});
	}

	function lightbox(url) {
		const $lb = $(`
			<div class="obp-lb">
				<span class="obp-lb-x" title="Close">&times;</span>
				<img src="${frappe.utils.escape_html(url)}">
				<a class="obp-lb-dl" href="${frappe.utils.escape_html(url)}" download>Download</a>
			</div>`);
		$lb.on("click", (e) => { if (e.target === $lb[0] || $(e.target).hasClass("obp-lb-x")) $lb.remove(); });
		$("body").append($lb);
	}

	prefillFromRoute();

	function upload() {
		const bag = state.bag.get_value();
		if (!bag) return frappe.msgprint(__("Pick an Order Bag first."));
		new frappe.ui.FileUploader({
			doctype: "Order Bag",
			docname: bag,
			allow_multiple: true,
			restrictions: { allowed_file_types: ["image/*"] },
			on_success: () => load(),
		});
	}

	page.set_primary_action(__("Upload Photos"), upload, "upload");
	page.add_inner_button(__("Refresh"), load);

	// prefill from the route (/app/order-bag-photos/<bag>). Run deferred (so the
	// route + control are ready on a hard browser refresh) and on every route
	// change back to this page.
	const fromRoute = () => {
		const r = frappe.get_route() || [];
		if (r[0] !== "order-bag-photos") return;
		const bag = r[1];
		if (bag && bag !== state.bag.get_value()) {
			state.bag.set_value(bag);
			load();
		}
	};
	setTimeout(fromRoute, 250);
	frappe.router.on("change", fromRoute);
};