// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Make Tree — cards at TREE MAKING queue up as tall COLOUR PANELS, one per casting
// karat. The colour follows the gold (pink/yellow/white) and the SHADE follows the
// karat: 22K deepest, 18K medium, 14K lightest. Cards are white chips (☑ + Order No +
// gram); tick the ones going onto the tree and hit MAKE TREE AND SEND TO CASTING QUEUE —
// it asks WHO is making the tree (bench-roster only), creates the Wax Tree
// (T-<karat>-###), stamps everything and transfers the lot to CASTING.
// Route: /app/make-tree ("tree-making" collides with the Tree Making doctype list)

frappe.pages["make-tree"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Make Tree", single_column: true });
	let queues = [];

	// colour letter -> hue; karat number -> depth (22K darkest … 14K lightest)
	const PALETTE = {
		P: { label: "PINK GOLD", fg: "#5b2d8e", 22: ["#e2bce9", "#c99ad6"], 18: ["#ecd4f0", "#d9b6e3"], 14: ["#f5e7f8", "#e6cfee"] },
		Y: { label: "YELLOW GOLD", fg: "#7a660f", 22: ["#f0dd6a", "#dcc43a"], 18: ["#f7ec9e", "#e3d76e"], 14: ["#fbf5c8", "#ece0a0"] },
		W: { label: "WHITE GOLD", fg: "#3f4a57", 22: ["#d3dae3", "#b7c2cf"], 18: ["#e4e8ee", "#c9d1db"], 14: ["#eff2f6", "#dbe1e8"] },
	};
	const toneOf = (karat) => {
		const m = /^(\d+)K([PWY])G$/.exec(karat || "");
		if (!m) return { bg: "#ececec", bd: "#d5d5d5", fg: "#555555", label: "NO KARAT GOLD" };
		const pal = PALETTE[m[2]];
		const [bg, bd] = pal[+m[1]] || pal[18];
		return { bg, bd, fg: pal.fg, label: pal.label };
	};

	$(page.main).append(`
		<style>
		.tm-top{display:flex;align-items:center;gap:14px;margin:2px 0 18px;}
		.tm-mark{display:flex;align-items:center;gap:12px;}
		.tm-mark svg{width:38px;height:38px;}
		.tm-headline{font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:700;letter-spacing:4px;color:#3d3425;}
		.tm-sub{color:var(--text-muted);font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;margin-top:1px;}
		.tm-spacer{margin-left:auto;}
		.tm-make{background:#a3132e;border:none;color:#fff;font-weight:800;letter-spacing:1.2px;padding:10px 22px;border-radius:7px;font-size:12.5px;cursor:pointer;box-shadow:0 2px 6px rgba(163,19,46,.35);}
		.tm-make:hover{background:#820f25;}
		.tm-board{display:flex;gap:22px;align-items:flex-start;flex-wrap:wrap;}
		.tm-col{width:330px;flex:0 0 330px;}
		.tm-title{font-size:20px;font-weight:800;letter-spacing:.5px;text-align:center;margin:0 0 8px;}
		.tm-title small{display:block;font-size:11px;font-weight:600;opacity:.65;letter-spacing:.12em;}
		.tm-panel{border-radius:14px;min-height:420px;padding:12px;border:2px solid;display:flex;flex-direction:column;gap:8px;}
		.tm-chip{display:flex;align-items:center;gap:10px;background:#fff;border:2px solid transparent;border-radius:9px;padding:9px 12px;cursor:pointer;user-select:none;box-shadow:0 1px 2px rgba(0,0,0,.06);}
		.tm-chip .cb{width:16px;height:16px;pointer-events:none;}
		.tm-chip .code{font-weight:800;letter-spacing:.4px;font-size:13.5px;}
		.tm-chip .gram{margin-left:auto;font-variant-numeric:tabular-nums;font-size:12.5px;color:#6b7785;}
		.tm-chip.on{border-color:currentColor;}
		.tm-chip:hover{box-shadow:0 2px 6px rgba(0,0,0,.12);}
		.tm-cnt{margin-top:auto;padding-top:8px;text-align:center;font-size:12px;font-weight:700;opacity:.8;}
		.tm-none{border:1px dashed var(--border-color);border-radius:14px;padding:40px;text-align:center;color:var(--text-muted);width:100%;}
		</style>
		<div class="tm-top">
			<div class="tm-mark">
				<svg viewBox="0 0 24 24" fill="none" stroke="#8a6d1a" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
					<path d="M12 22v-6"/><path d="M12 16c-4 0-7-2.4-7-6 0-2.5 1.6-4.6 3.9-5.5C9.3 2.9 10.5 2 12 2s2.7.9 3.1 2.5C17.4 5.4 19 7.5 19 10c0 3.6-3 6-7 6z"/>
					<path d="M9 9l3 3 3-3"/>
				</svg>
				<div><div class="tm-headline">MAKE TREE</div><div class="tm-sub">one purity per tree · cards → tree → casting</div></div>
			</div>
			<span class="tm-spacer"></span>
			<button class="tm-make">MAKE TREE AND SEND TO CASTING QUEUE</button>
		</div>
		<div class="tm-board tm-out"></div>
	`);

	const esc = frappe.utils.escape_html;
	const $out = $(page.main).find(".tm-out");
	const flt0 = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));
	const selected = new Set(); // order bag names (MAKE TREE enforces one panel)

	function render() {
		$out.empty();
		selected.clear();
		if (!queues.length) {
			$out.html('<div class="tm-none">No cards waiting at TREE MAKING.<br>Transfer cards here and they stack up as one colour panel per karat.</div>');
			return;
		}
		queues.forEach((q) => {
			const t = toneOf(q.karat === "OTHER" ? null : q.karat);
			const title = q.karat === "OTHER" ? "OTHER" : q.karat;
			const $col = $(`
				<div class="tm-col">
					<div class="tm-title" style="color:${t.fg};">${esc(title)}<small>${t.label}</small></div>
					<div class="tm-panel" style="background:${t.bg};border-color:${t.bd};color:${t.fg};">
						${q.cards.map((c, ci) => `
							<div class="tm-chip" data-ci="${ci}" title="${esc(c.design || "")} · qty ${c.qty || 1}${c.size ? " · " + esc(c.size) : ""}">
								<input type="checkbox" class="cb">
								<span class="code">${esc(c.name)}</span>
								<span class="gram">${flt0(c.nett_weight) ? flt0(c.nett_weight).toFixed(3) + " g" : ""}</span>
							</div>`).join("")}
						<div class="tm-cnt"></div>
					</div>
				</div>`);
			$out.append($col);
			const refresh = () => {
				const on = $col.find(".tm-chip.on").length;
				const grams = $col.find(".tm-chip.on").map((i, el) => flt0(q.cards[+el.getAttribute("data-ci")].nett_weight)).get()
					.reduce((a, b) => a + b, 0);
				$col.find(".tm-cnt").text(on ? `${on} of ${q.cards.length} selected · ${grams.toFixed(3)} g` : `${q.cards.length} card(s)`);
			};
			$col.on("click", ".tm-chip", function () {
				const nm = q.cards[+this.getAttribute("data-ci")].name;
				const on = !this.classList.contains("on");
				this.classList.toggle("on", on);
				this.querySelector(".cb").checked = on;
				on ? selected.add(nm) : selected.delete(nm);
				refresh();
			});
			refresh();
		});
	}

	$(page.main).find(".tm-make").on("click", () => {
		if (!selected.size) return frappe.msgprint(__("Tick the cards going onto the tree."));
		// all selections must live in ONE panel — one purity per tree
		const karats = new Set();
		let karat = null;
		let grams = 0;
		queues.forEach((q) => q.cards.forEach((c) => {
			if (selected.has(c.name)) { karats.add(q.karat); karat = q.karat; grams += flt0(c.nett_weight); }
		}));
		if (karats.size > 1) return frappe.msgprint(__("One purity per tree — your selection spans {0}. Untick the rest.", [[...karats].join(" + ")]));
		const names = [...selected];

		// who is making the tree — the TREE MAKING bench roster ONLY (Setup → Bench)
		const d = new frappe.ui.Dialog({
			title: __("Make Tree — {0}", [esc(karat)]),
			fields: [
				{ fieldname: "summary", fieldtype: "HTML" },
				{
					fieldname: "employee", fieldtype: "Link", label: __("Tree maker"), options: "Employee", reqd: 1,
					description: __("Only employees allotted to the TREE MAKING bench (Setup → Bench)."),
					get_query: () => ({ query: "jewelima.jewelima.api.bench_employee_query", filters: { bench: "TREE MAKING", strict: 1 } }),
				},
			],
			primary_action_label: __("Make Tree → Casting"),
			primary_action(v) {
				d.hide();
				frappe.dom.freeze(__("Making tree…"));
				frappe.call({
					method: "jewelima.jewelima.api.make_tree",
					args: { karat, names: JSON.stringify(names), employee: v.employee },
				}).then((r) => {
					frappe.dom.unfreeze();
					const res = r.message || {};
					frappe.show_alert({ message: __("Tree <b>{0}</b> made — {1} card(s) → CASTING.", [res.tree, res.count]), indicator: "green" }, 7);
					if (res.errors && res.errors.length) {
						frappe.msgprint({ title: __("Some not transferred"), message: res.errors.map((e) => `${e.name}: ${e.error}`).join("<br>"), indicator: "orange" });
					}
					load();
				}).catch(() => frappe.dom.unfreeze());
			},
		});
		d.fields_dict.summary.$wrapper.html(
			`<div style="border:1px solid var(--border-color);border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:13px;">
				<b>${names.length}</b> card(s) · <b>${esc(karat)}</b> · ${grams.toFixed(3)} g → one tree → CASTING</div>`
		);
		d.show();
	});

	function load() {
		frappe.call({ method: "jewelima.jewelima.api.get_tree_queues" }).then((r) => {
			queues = r.message || [];
			render();
		});
	}

	page.add_inner_button(__("Refresh"), load);
	load();
};
