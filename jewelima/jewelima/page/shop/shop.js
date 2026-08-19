// Shop — the browse-and-basket face of ordering. Approved cards only: search,
// open one, pick (or create) a variant, drop it in the basket, then hand the whole
// basket to Place Order, which fills a line per item.
//
// Nothing is written here except a variant the user asks for — the order itself is
// still placed on Place Order, so every rule there still applies.
frappe.pages["shop"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Shop"), single_column: true });
	const API = "jewelima.jewelima.design_bank_api";
	const CORE = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));

	const S = { rows: [], start: 0, limit: 48, total: 0, search: "", type: "", cart: [], busy: false };

	$(page.main).html(`
		<style>
		.sh-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px;}
		.sh-bar input,.sh-bar select{border:1px solid var(--border-color);border-radius:8px;height:32px;padding:2px 10px;background:var(--fg-color);color:var(--text-color);font-size:13px;}
		.sh-bar input{min-width:260px;}
		.sh-basket{margin-left:auto;display:flex;align-items:center;gap:8px;}
		.sh-basket .btn{font-weight:700;}
		.sh-pill{background:#1f618d;color:#fff;border-radius:999px;padding:1px 9px;font-size:11px;font-weight:800;}
		.sh-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:14px;}
		.sh-card{border:1px solid var(--border-color);border-radius:10px;overflow:hidden;cursor:pointer;background:var(--card-bg,var(--fg-color));transition:box-shadow .12s,transform .12s;}
		.sh-card:hover{box-shadow:0 4px 14px rgba(0,0,0,.13);transform:translateY(-2px);}
		.sh-img{width:100%;aspect-ratio:1/1;object-fit:contain;background:#fff;display:block;}
		.sh-noimg{width:100%;aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:11px;background:#fafafa;}
		.sh-meta{padding:7px 9px;}
		.sh-no{font-weight:800;font-size:12.5px;font-family:var(--font-family-monospace,monospace);}
		.sh-sub{font-size:11px;color:var(--text-muted);margin-top:2px;}
		.sh-more{text-align:center;margin:16px 0;}
		.sh-empty{color:var(--text-muted);padding:26px;text-align:center;}
		.sh-v{display:flex;align-items:center;gap:10px;border:1px solid var(--border-color);border-radius:8px;padding:7px 10px;margin-bottom:7px;}
		.sh-v b{font-family:var(--font-family-monospace,monospace);font-size:13px;}
		.sh-v .sh-vsub{font-size:11px;color:var(--text-muted);}
		.sh-v .sh-qty{width:64px;border:1px solid var(--border-color);border-radius:6px;height:28px;padding:2px 8px;background:var(--fg-color);color:var(--text-color);}
		.sh-v .btn{margin-left:auto;}
		.sh-ct{width:100%;border-collapse:collapse;font-size:12.5px;}
		.sh-ct th{text-align:left;font-size:10px;text-transform:uppercase;color:var(--text-muted);border-bottom:1px solid var(--border-color);padding:4px 6px;}
		.sh-ct td{padding:5px 6px;border-bottom:1px solid var(--border-color);}
		.sh-ct input{width:70px;border:1px solid var(--border-color);border-radius:6px;height:26px;padding:2px 7px;background:var(--fg-color);color:var(--text-color);}
		.sh-x{color:#b02a2a;cursor:pointer;font-weight:800;}
		</style>
		<div class="sh-bar">
			<input type="text" class="sh-q" placeholder="${__("Search a design number…")}">
			<select class="sh-type"><option value="">${__("All types")}</option></select>
			<span class="sh-count" style="font-size:12px;color:var(--text-muted);"></span>
			<div class="sh-basket">
				<button class="btn btn-sm btn-default sh-open">${__("Basket")} <span class="sh-pill sh-n">0</span></button>
			</div>
		</div>
		<div class="sh-grid"></div>
		<div class="sh-more"></div>`);

	const $grid = $(page.main).find(".sh-grid");
	const $more = $(page.main).find(".sh-more");

	// ---------- basket ----------
	const cartQty = () => S.cart.reduce((a, l) => a + (parseInt(l.qty, 10) || 0), 0);
	function paintBasket() {
		$(page.main).find(".sh-n").text(cartQty());
	}
	function addToCart(bank, bank_no, variant, qty, image) {
		qty = parseInt(qty, 10) || 1;
		const hit = S.cart.find((l) => l.variant === variant);
		if (hit) hit.qty = (parseInt(hit.qty, 10) || 0) + qty;
		else S.cart.push({ bank, bank_no, variant, qty, image });
		paintBasket();
		frappe.show_alert({ message: __("{0} × {1} in the basket.", [esc(variant), qty]), indicator: "green" }, 3);
	}

	function openBasket() {
		if (!S.cart.length) return frappe.msgprint(__("The basket is empty — open a design and add a variant."));
		const d = new frappe.ui.Dialog({
			title: __("Basket"), size: "large",
			fields: [{ fieldname: "html", fieldtype: "HTML" }],
			primary_action_label: __("Create Place Order"),
			primary_action() {
				d.hide();
				// hand the basket over; Place Order fills a line per item and every
				// rule there (party, type, due date) still applies
				frappe.route_options = { shop_cart: S.cart.map((l) => ({ bank: l.bank, variant: l.variant, qty: l.qty })) };
				S.cart = [];
				paintBasket();
				frappe.set_route("place-order");
			},
		});
		const paint = () => {
			d.get_field("html").$wrapper.html(`
				<table class="sh-ct"><thead><tr>
					<th>${__("Design")}</th><th>${__("Variant")}</th><th>${__("Qty")}</th><th></th>
				</tr></thead><tbody>
				${S.cart.map((l, i) => `<tr>
					<td>${esc(l.bank_no || "")}</td>
					<td style="font-family:var(--font-family-monospace,monospace);">${esc(l.variant)}</td>
					<td><input type="number" min="1" class="sh-cq" data-i="${i}" value="${l.qty}"></td>
					<td class="sh-x" data-i="${i}" title="${__("remove")}">&times;</td>
				</tr>`).join("")}
				</tbody></table>
				<div style="margin-top:8px;font-size:12px;color:var(--text-muted);">
					${__("{0} line(s) · {1} piece(s)", [S.cart.length, cartQty()])}</div>`);
			d.get_field("html").$wrapper.find(".sh-cq").on("change input", function () {
				const i = parseInt(this.dataset.i, 10);
				S.cart[i].qty = Math.max(1, parseInt(this.value, 10) || 1);
				paintBasket();
			});
			d.get_field("html").$wrapper.find(".sh-x").on("click", function () {
				S.cart.splice(parseInt(this.dataset.i, 10), 1);
				paintBasket();
				if (!S.cart.length) return d.hide();
				paint();
			});
		};
		paint();
		d.show();
	}
	$(page.main).on("click", ".sh-open", openBasket);

	// ---------- one design ----------
	function openDesign(card) {
		const d = new frappe.ui.Dialog({ title: card.design_no, size: "large",
			fields: [{ fieldname: "html", fieldtype: "HTML" }] });
		const $w = () => d.get_field("html").$wrapper;
		$w().html(`<div style="text-align:center;color:var(--text-muted);padding:18px;">${__("Loading…")}</div>`);
		d.show();

		const load = () => frappe.db.get_list("Design", {
			filters: { design_bank: card.name, status: "Active" },
			fields: ["name"], order_by: "creation asc", limit: 0,
		}).then((vs) => {
			const list = (vs || []).map((v) => v.name);
			$w().html(`
				<div style="display:flex;gap:16px;flex-wrap:wrap;">
					<div style="flex:0 0 240px;">
						${card.image
							? `<img src="${card.image}" style="width:240px;border:1px solid var(--border-color);border-radius:10px;background:#fff;">`
							: `<div class="sh-noimg" style="width:240px;border-radius:10px;">${__("no photo")}</div>`}
						<div class="sh-sub" style="margin-top:6px;">
							${__("Gross")} <b>${flt(card.gross_weight).toFixed(3)}</b> g ·
							${__("DW")} <b>${flt(card.diamond_weight).toFixed(2)}</b> ct</div>
					</div>
					<div style="flex:1 1 320px;min-width:280px;">
						<div style="font-size:11px;text-transform:uppercase;color:var(--text-muted);font-weight:700;margin-bottom:6px;">
							${__("Variants")}</div>
						<div class="sh-vs"></div>
						<button class="btn btn-sm btn-default sh-newv" style="margin-top:6px;">+ ${__("Create a variant")}</button>
					</div>
				</div>`);
			const $vs = $w().find(".sh-vs");
			if (!list.length) {
				$vs.html(`<div class="sh-sub">${__("No variant on this card yet — create one to order it.")}</div>`);
			} else {
				$vs.html(list.map((n) => `
					<div class="sh-v" data-v="${esc(n)}">
						<div><b>${esc(n)}</b></div>
						<input type="number" class="sh-qty" min="1" value="1">
						<button class="btn btn-xs btn-primary sh-add">${__("Add")}</button>
					</div>`).join(""));
			}
			$vs.find(".sh-add").on("click", function () {
				const $row = $(this).closest(".sh-v");
				addToCart(card.name, card.design_no, $row.data("v"), $row.find(".sh-qty").val(), card.image);
			});
			$w().find(".sh-newv").on("click", () => { d.hide(); newVariant(card); });
		});
		load();
	}

	// ---------- create a variant ----------
	// Place Order already owns this dialog (seeded gold/stones locked, extra stones
	// allowed). Send the user there rather than keeping a second copy of those rules.
	function newVariant(card) {
		frappe.route_options = { open_variant_for: card.name };
		frappe.set_route("place-order");
	}

	// ---------- the grid ----------
	function paint(rows, append) {
		const html = rows.map((r) => `
			<div class="sh-card" data-name="${esc(r.name)}">
				${r.image ? `<img class="sh-img" src="${r.image}" loading="lazy">`
					: `<div class="sh-noimg">${__("no photo")}</div>`}
				<div class="sh-meta">
					<div class="sh-no">${esc(r.design_no)}</div>
					<div class="sh-sub">${flt(r.gross_weight).toFixed(3)} g · ${flt(r.diamond_weight).toFixed(2)} ct</div>
				</div>
			</div>`).join("");
		if (append) $grid.append(html); else $grid.html(html || `<div class="sh-empty">${__("Nothing matches that search.")}</div>`);
		$(page.main).find(".sh-count").text(__("{0} design(s)", [S.total]));
		$more.html(S.rows.length < S.total
			? `<button class="btn btn-default btn-sm sh-load">${__("Show more")} (${S.rows.length}/${S.total})</button>` : "");
	}

	function load(reset) {
		if (S.busy) return;
		S.busy = true;
		if (reset) { S.start = 0; S.rows = []; }
		frappe.call({ method: API + ".get_designs", freeze: false, args: {
			search: S.search || null, start: S.start, limit: S.limit, design_type: S.type || null, mode: "info",
		} }).then((r) => {
			S.busy = false;
			const res = r.message || { rows: [], total: 0 };
			S.total = res.total || 0;
			S.rows = S.rows.concat(res.rows || []);
			S.start += S.limit;
			paint(res.rows || [], !reset);
		}).catch(() => { S.busy = false; });
	}

	$(page.main).on("click", ".sh-card", function () {
		const card = S.rows.find((r) => r.name === this.dataset.name);
		if (card) openDesign(card);
	});
	$(page.main).on("click", ".sh-load", () => load(false));
	$(page.main).find(".sh-q").on("input", frappe.utils.debounce(function () {
		S.search = this.value.trim();
		load(true);
	}, 400));
	$(page.main).find(".sh-type").on("change", function () { S.type = this.value; load(true); });

	frappe.db.get_list("Design Type", { fields: ["name"], order_by: "name", limit: 0 }).then((rows) => {
		$(page.main).find(".sh-type").append((rows || []).map((x) =>
			`<option value="${esc(x.name)}">${esc(x.name)}</option>`).join(""));
	});

	page.add_inner_button(__("Place Order"), () => frappe.set_route("place-order"));
	paintBasket();
	load(true);
};
