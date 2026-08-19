// Shop — the browsing face of ordering. Approved cards only: filter by type, tags,
// gold and diamond weight, open one, pick or create a variant, and set it aside in
// the Basket. The Basket page turns it into an order; nothing about the ORDER (party,
// due date, split, photos) belongs here.
frappe.pages["shop"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Shop"), single_column: true });
	const API = "jewelima.jewelima.design_bank_api";
	const CORE = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const flt = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));

	const S = { rows: [], start: 0, limit: 48, total: 0, busy: false,
		q: "", type: "", tags: [], match: "any", gw: [null, null], dw: [null, null] };

	$(page.main).html(`
		<style>
		.sp-head{position:sticky;top:0;z-index:5;background:var(--fg-color);padding:2px 0 12px;border-bottom:1px solid var(--border-color);margin-bottom:16px;}
		.sp-r1{display:flex;gap:10px;align-items:center;flex-wrap:wrap;}
		.sp-search{position:relative;flex:1 1 300px;max-width:420px;}
		.sp-search input{width:100%;border:1px solid var(--border-color);border-radius:999px;height:38px;padding:2px 16px 2px 38px;background:var(--fg-color);color:var(--text-color);font-size:13.5px;}
		.sp-search .ic{position:absolute;left:14px;top:9px;color:var(--text-muted);font-size:14px;}
		.sp-sel{border:1px solid var(--border-color);border-radius:999px;height:38px;padding:2px 14px;background:var(--fg-color);color:var(--text-color);font-size:13px;}
		.sp-chipbtn{border:1px solid var(--border-color);border-radius:999px;height:38px;padding:0 16px;background:var(--fg-color);color:var(--text-color);font-size:13px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:7px;}
		.sp-chipbtn.on{border-color:#1f618d;color:#1f618d;background:#eef5fa;}
		.sp-basket{margin-left:auto;display:flex;align-items:center;gap:10px;}
		.sp-bk{border:none;border-radius:999px;height:38px;padding:0 20px;background:#1f618d;color:#fff;font-weight:800;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:9px;}
		.sp-bk .n{background:rgba(255,255,255,.25);border-radius:999px;padding:1px 9px;font-size:12px;}
		.sp-r2{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px;}
		.sp-range{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border-color);border-radius:999px;padding:4px 12px;font-size:12px;color:var(--text-muted);}
		.sp-range input{width:64px;border:none;border-bottom:1px solid var(--border-color);background:transparent;color:var(--text-color);font-size:12.5px;text-align:center;padding:1px 2px;}
		.sp-range input:focus{outline:none;border-bottom-color:#1f618d;}
		.sp-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;}
		.sp-tag{border:1px solid var(--border-color);border-radius:999px;padding:3px 12px;font-size:12px;cursor:pointer;background:var(--fg-color);}
		.sp-tag.on{background:#1f618d;border-color:#1f618d;color:#fff;font-weight:700;}
		.sp-clear{font-size:12px;color:#b02a2a;cursor:pointer;font-weight:600;}
		.sp-count{font-size:12.5px;color:var(--text-muted);}
		.sp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(196px,1fr));gap:18px;}
		.sp-card{border:1px solid var(--border-color);border-radius:16px;overflow:hidden;cursor:pointer;background:var(--card-bg,var(--fg-color));transition:box-shadow .15s,transform .15s,border-color .15s;position:relative;}
		.sp-card:hover{box-shadow:0 10px 26px rgba(0,0,0,.14);transform:translateY(-3px);border-color:#cfd8e0;}
		.sp-ph{width:100%;aspect-ratio:1/1;object-fit:contain;background:#fff;display:block;}
		.sp-nophoto{width:100%;aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:11px;background:linear-gradient(135deg,#fafafa,#f0f0f0);}
		.sp-meta{padding:10px 12px 12px;}
		.sp-no{font-weight:800;font-size:13px;font-family:var(--font-family-monospace,monospace);}
		.sp-w{font-size:11.5px;color:var(--text-muted);margin-top:3px;}
		.sp-badge{position:absolute;top:9px;right:9px;background:rgba(31,97,141,.94);color:#fff;font-size:10.5px;font-weight:800;border-radius:999px;padding:2px 9px;}
		.sp-more{text-align:center;margin:22px 0;}
		.sp-empty{grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--text-muted);}
		.sp-dt{display:flex;gap:22px;flex-wrap:wrap;}
		.sp-dt .ph{flex:0 0 300px;}
		.sp-dt .ph img{width:300px;border-radius:14px;border:1px solid var(--border-color);background:#fff;}
		.sp-dt .side{flex:1 1 300px;min-width:280px;}
		.sp-kv{display:flex;gap:18px;font-size:12.5px;color:var(--text-muted);margin-top:10px;}
		.sp-kv b{color:var(--text-color);font-size:14px;}
		.sp-vrow{display:flex;align-items:center;gap:10px;border:1px solid var(--border-color);border-radius:12px;padding:10px 12px;margin-bottom:9px;transition:border-color .12s;}
		.sp-vrow:hover{border-color:#1f618d;}
		.sp-vrow .nm{font-family:var(--font-family-monospace,monospace);font-weight:800;font-size:13.5px;}
		.sp-stepper{display:flex;align-items:center;gap:5px;margin-left:auto;}
		.sp-stepper button{width:28px;height:28px;border-radius:8px;border:1px solid var(--border-color);background:var(--fg-color);color:var(--text-color);font-weight:800;cursor:pointer;line-height:1;}
		.sp-stepper input{width:52px;height:28px;text-align:center;border:1px solid var(--border-color);border-radius:8px;background:var(--fg-color);color:var(--text-color);font-weight:700;}
		.sp-addbtn{border:none;border-radius:9px;height:30px;padding:0 15px;background:#1f618d;color:#fff;font-weight:700;font-size:12px;cursor:pointer;}
		.sp-newv{border:1px dashed var(--border-color);border-radius:12px;padding:10px 12px;width:100%;background:transparent;color:#1f618d;font-weight:700;font-size:12.5px;cursor:pointer;}
		.sp-newv:hover{border-color:#1f618d;background:#f5f9fc;}
		.sp-mt{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:8px;}
		.sp-mt th{text-align:left;font-size:10px;text-transform:uppercase;color:var(--text-muted);padding:3px 6px;border-bottom:1px solid var(--border-color);}
		.sp-mt td{padding:4px 6px;border-bottom:1px solid var(--border-color);}
		</style>
		<div class="sp-head">
			<div class="sp-r1">
				<div class="sp-search"><span class="ic">🔍</span>
					<input type="text" class="sp-q" placeholder="${__("Search a design number…")}"></div>
				<select class="sp-sel sp-type"><option value="">${__("All types")}</option></select>
				<button class="sp-chipbtn sp-tagbtn">${__("Tags")} <span class="sp-tn"></span></button>
				<div class="sp-basket">
					<span class="sp-count"></span>
					<button class="sp-bk">${__("Basket")} <span class="n sp-n">0</span></button>
				</div>
			</div>
			<div class="sp-r2">
				<span class="sp-range">${__("Gold")}
					<input type="number" step="0.001" class="sp-gwmin" placeholder="${__("min")}"> –
					<input type="number" step="0.001" class="sp-gwmax" placeholder="${__("max")}"> g</span>
				<span class="sp-range">${__("DMD")}
					<input type="number" step="0.01" class="sp-dwmin" placeholder="${__("min")}"> –
					<input type="number" step="0.01" class="sp-dwmax" placeholder="${__("max")}"> ct</span>
				<span class="sp-clear">${__("Clear filters")}</span>
			</div>
			<div class="sp-tags" style="display:none;"></div>
		</div>
		<div class="sp-grid"></div>
		<div class="sp-more"></div>`);

	const $grid = $(page.main).find(".sp-grid");
	const $more = $(page.main).find(".sp-more");
	const paintBasket = () => $(page.main).find(".sp-n").text(jwBasket.count());
	$(document).on("jw-basket-changed", paintBasket);

	// ---------- create a variant, without leaving the shop ----------
	function newVariant(card, done) {
		frappe.call({ method: CORE + ".get_variant_naming" }).then((r) => {
			const N = r.message || { karats: [], tokens: [], colors: [] };
			let cur = null, seq = 0;
			const judge = () => {
				const v = vd.get_values(true) || {};
				if (!v.karat) return;
				const q = ++seq;
				frappe.call({ method: CORE + ".resolve_design_variant", freeze: false,
					args: { design_bank: card.name, karat: v.karat, quality: v.quality || "", color: v.color || "" },
				}).then((rr) => {
					if (q !== seq) return;
					cur = rr.message || null;
					if (!cur) return;
					const seed = cur.seed || [];
					vd.get_field("prev").$wrapper.html(`
						<div style="font-family:var(--font-family-monospace,monospace);font-weight:800;font-size:17px;">${esc(cur.name || "")}</div>
						${cur.exists ? `<div style="color:#7a5b00;font-size:12px;margin-top:3px;">${__("this one already exists")}</div>` : ""}
						<table class="sp-mt"><thead><tr>
							<th>${__("Material")}</th><th>${__("Qty")}</th><th>${__("Weight")}</th>
						</tr></thead><tbody>
						${seed.map((m) => `<tr><td>${esc(m.item)}</td>
							<td>${m.stone_type ? (m.qty || 0) : ""}</td>
							<td>${flt(m.weight).toFixed(3)}</td></tr>`).join("")}
						</tbody></table>
						<div style="font-size:11px;color:var(--text-muted);margin-top:6px;">
							${__("the system sets these — materials can be adjusted in the Basket")}</div>`);
				});
			};
			const vd = new frappe.ui.Dialog({
				title: __("New variant — {0}", [card.design_no]), size: "large",
				fields: [
					{ fieldname: "karat", fieldtype: "Select", label: __("Karat"), reqd: 1,
						options: (N.karats || []).join("\n"), default: "18K", onchange: () => judge() },
					{ fieldname: "cb", fieldtype: "Column Break" },
					{ fieldname: "quality", fieldtype: "Select", label: __("Stones"),
						options: [""].concat(N.tokens || []).join("\n"), onchange: () => judge() },
					{ fieldname: "cb2", fieldtype: "Column Break" },
					{ fieldname: "color", fieldtype: "Select", label: __("Gold colour"),
						options: (N.colors || []).join("\n"), default: "YG", onchange: () => judge() },
					{ fieldname: "sb", fieldtype: "Section Break" },
					{ fieldname: "prev", fieldtype: "HTML" },
				],
				primary_action_label: __("Create the variant"),
				primary_action() {
					if (!cur || !cur.name) return frappe.msgprint(__("Pick the karat first."));
					if (cur.exists) return frappe.msgprint(__("{0} already exists — it is in the list.", [cur.name]));
					const v = vd.get_values(true) || {};
					// the system's own seed IS the variant — send it back untouched
					const seed = (cur.seed || []).map((m) => ({
						item: m.item, qty: m.stone_type ? (flt(m.qty) || 0) : 0, weight: flt(m.weight) || 0 }));
					if (!seed.length) return frappe.msgprint(__("This combination has nothing to build from."));
					frappe.call({ method: CORE + ".create_design", args: {
						design_name: cur.name, design_type: cur.design_type, image: cur.image,
						design_bank: cur.design_bank, materials: JSON.stringify(seed),
						karat: v.karat, quality: v.quality || "", color: v.color || "",
					} }).then((rr) => {
						const res = rr.message || {};
						if (!res.name) return;
						vd.hide();
						frappe.show_alert({ message: __("{0} created.", [res.name]), indicator: "green" }, 5);
						if (done) done(res.name);
					});
				},
			});
			vd.show();
			setTimeout(judge, 350);   // the defaults land when the dialog renders
		});
	}

	// ---------- one design ----------
	function openDesign(card) {
		const d = new frappe.ui.Dialog({ title: card.design_no, size: "extra-large",
			fields: [{ fieldname: "html", fieldtype: "HTML" }] });
		const $w = () => d.get_field("html").$wrapper;
		$w().html(`<div style="padding:24px;text-align:center;color:var(--text-muted);">${__("Loading…")}</div>`);
		d.show();

		const load = () => frappe.db.get_list("Design", {
			filters: { design_bank: card.name, status: "Active" },
			fields: ["name"], order_by: "creation asc", limit: 0,
		}).then((vs) => {
			const list = (vs || []).map((v) => v.name);
			$w().html(`
				<div class="sp-dt">
					<div class="ph">
						${card.image ? `<img src="${esc(card.image)}">`
							: `<div class="sp-nophoto" style="width:300px;border-radius:14px;">${__("no photo")}</div>`}
						<div class="sp-kv">
							<span>${__("Gold")} <b>${flt(card.gross_weight).toFixed(3)}</b> g</span>
							<span>${__("DMD")} <b>${flt(card.diamond_weight).toFixed(2)}</b> ct</span>
						</div>
					</div>
					<div class="side">
						<div style="font-size:11px;text-transform:uppercase;color:var(--text-muted);font-weight:800;margin-bottom:8px;">
							${__("Choose a variant")}</div>
						<div class="sp-vs"></div>
						<button class="sp-newv">+ ${__("Create a new variant")}</button>
					</div>
				</div>`);
			const $vs = $w().find(".sp-vs");
			$vs.html(list.length ? list.map((n) => `
				<div class="sp-vrow" data-v="${esc(n)}">
					<div class="nm">${esc(n)}</div>
					<div class="sp-stepper">
						<button class="dec">−</button>
						<input type="number" min="1" class="qty" value="1">
						<button class="inc">+</button>
					</div>
					<button class="sp-addbtn">${__("Add")}</button>
				</div>`).join("")
				: `<div style="color:var(--text-muted);font-size:12.5px;margin-bottom:10px;">
					${__("No variant on this card yet — create one to order it.")}</div>`);

			$vs.on("click", ".inc", function () { const $i = $(this).siblings(".qty"); $i.val((parseInt($i.val(), 10) || 1) + 1); });
			$vs.on("click", ".dec", function () { const $i = $(this).siblings(".qty"); $i.val(Math.max(1, (parseInt($i.val(), 10) || 1) - 1)); });
			$vs.on("click", ".sp-addbtn", function () {
				const $r = $(this).closest(".sp-vrow");
				jwBasket.add({ bank: card.name, bank_no: card.design_no, image: card.image,
					variant: $r.data("v"), qty: parseInt($r.find(".qty").val(), 10) || 1 });
				frappe.show_alert({ message: __("{0} in the basket.", [$r.data("v")]), indicator: "green" }, 3);
			});
			$w().find(".sp-newv").on("click", () => newVariant(card, () => load()));
		});
		load();
	}

	// ---------- grid ----------
	function paint(rows, append) {
		const html = rows.map((r) => `
			<div class="sp-card" data-name="${esc(r.name)}">
				${r.image ? `<img class="sp-ph" src="${esc(r.image)}" loading="lazy">`
					: `<div class="sp-nophoto">${__("no photo")}</div>`}
				${flt(r.diamond_weight) ? `<span class="sp-badge">${flt(r.diamond_weight).toFixed(2)} ct</span>` : ""}
				<div class="sp-meta">
					<div class="sp-no">${esc(r.design_no)}</div>
					<div class="sp-w">${__("Gold")} ${flt(r.gross_weight).toFixed(3)} g</div>
				</div>
			</div>`).join("");
		if (append) $grid.append(html);
		else $grid.html(html || `<div class="sp-empty">
			<div style="font-size:34px;">🔎</div>${__("Nothing matches those filters.")}</div>`);
		$(page.main).find(".sp-count").text(__("{0} design(s)", [S.total]));
		$more.html(S.rows.length < S.total
			? `<button class="btn btn-default btn-sm sp-load">${__("Show more")} (${S.rows.length}/${S.total})</button>` : "");
	}

	function load(reset) {
		if (S.busy) return;
		S.busy = true;
		if (reset) { S.start = 0; S.rows = []; }
		frappe.call({ method: API + ".get_designs", freeze: false, args: {
			search: S.q || null, start: S.start, limit: S.limit, design_type: S.type || null,
			tags: JSON.stringify(S.tags), match: S.match, mode: "info",
			gw_min: S.gw[0], gw_max: S.gw[1], dw_min: S.dw[0], dw_max: S.dw[1],
		} }).then((r) => {
			S.busy = false;
			const res = r.message || { rows: [], total: 0 };
			S.total = res.total || 0;
			S.rows = S.rows.concat(res.rows || []);
			S.start += S.limit;
			paint(res.rows || [], !reset);
		}).catch(() => { S.busy = false; });
	}

	// ---------- filters ----------
	const num = (v) => (v === "" || v === null || isNaN(parseFloat(v)) ? null : parseFloat(v));
	const reload = frappe.utils.debounce(() => load(true), 350);
	$(page.main).find(".sp-q").on("input", function () { S.q = this.value.trim(); reload(); });
	$(page.main).find(".sp-type").on("change", function () { S.type = this.value; load(true); });
	$(page.main).find(".sp-gwmin").on("input", function () { S.gw[0] = num(this.value); reload(); });
	$(page.main).find(".sp-gwmax").on("input", function () { S.gw[1] = num(this.value); reload(); });
	$(page.main).find(".sp-dwmin").on("input", function () { S.dw[0] = num(this.value); reload(); });
	$(page.main).find(".sp-dwmax").on("input", function () { S.dw[1] = num(this.value); reload(); });
	$(page.main).find(".sp-clear").on("click", () => {
		S.q = ""; S.type = ""; S.tags = []; S.gw = [null, null]; S.dw = [null, null];
		$(page.main).find(".sp-q,.sp-gwmin,.sp-gwmax,.sp-dwmin,.sp-dwmax").val("");
		$(page.main).find(".sp-type").val("");
		$(page.main).find(".sp-tag").removeClass("on");
		$(page.main).find(".sp-tn").text("");
		$(page.main).find(".sp-tagbtn").removeClass("on");
		load(true);
	});
	$(page.main).find(".sp-tagbtn").on("click", function () {
		$(page.main).find(".sp-tags").toggle();
	});
	$(page.main).on("click", ".sp-tag", function () {
		$(this).toggleClass("on");
		S.tags = $(page.main).find(".sp-tag.on").map(function () { return $(this).data("t"); }).get();
		$(page.main).find(".sp-tn").text(S.tags.length ? `· ${S.tags.length}` : "");
		$(page.main).find(".sp-tagbtn").toggleClass("on", S.tags.length > 0);
		load(true);
	});

	$(page.main).on("click", ".sp-card", function () {
		const card = S.rows.find((r) => r.name === this.dataset.name);
		if (card) openDesign(card);
	});
	$(page.main).on("click", ".sp-load", () => load(false));
	$(page.main).on("click", ".sp-bk", () => frappe.set_route("basket"));

	// the same tags the Design Gallery uses
	frappe.call({ method: API + ".get_tags", args: { with_counts: 1 }, freeze: false }).then((r) => {
		const raw = r.message || [];
		const tags = Array.isArray(raw) ? raw.map((t) => (typeof t === "string" ? { tag: t } : t))
			: Object.keys(raw).map((k) => ({ tag: k, count: raw[k] }));
		$(page.main).find(".sp-tags").html(tags.map((t) =>
			`<span class="sp-tag" data-t="${esc(t.tag || t.name)}">${esc(t.tag || t.name)}${t.count ? ` <span style="opacity:.6;">${t.count}</span>` : ""}</span>`).join("")
			|| `<span style="font-size:12px;color:var(--text-muted);">${__("no tags yet")}</span>`);
	});
	frappe.db.get_list("Design Type", { fields: ["name"], order_by: "name", limit: 0 }).then((rows) => {
		$(page.main).find(".sp-type").append((rows || []).map((x) =>
			`<option value="${esc(x.name)}">${esc(x.name)}</option>`).join(""));
	});

	frappe.pages["shop"].on_page_show = function () { jwBasket.load().then(paintBasket); };

	page.add_inner_button(__("Basket"), () => frappe.set_route("basket"));
	jwBasket.load().then(paintBasket);
	load(true);
};
