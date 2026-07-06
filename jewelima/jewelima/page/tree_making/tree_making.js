// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Tree Making — cards at TREE MAKING queue up as tall COLOR PANELS, one per casting
// karat (pink gold = lavender, yellow gold = yellow, white gold = silver). Cards are
// white chips (☑ + Order No + gram) on the panel; tick the ones going onto the tree
// and hit the single MAKE TREE button (top right) — one purity per tree, the system
// numbers it T-<karat>-###, stamps everything and transfers the lot to CASTING.
// Route: /app/tree-making

frappe.pages["tree-making"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Tree Making", single_column: true });
	let queues = [];

	// karat color letter -> panel palette (fill, border, accent text)
	const TONES = {
		P: { bg: "#ecd4f0", bd: "#d9b6e3", fg: "#5b2d8e", label: "PINK GOLD" },
		Y: { bg: "#f7ef9e", bd: "#e3d76e", fg: "#7a660f", label: "YELLOW GOLD" },
		W: { bg: "#e4e8ee", bd: "#c9d1db", fg: "#3f4a57", label: "WHITE GOLD" },
		X: { bg: "#ececec", bd: "#d5d5d5", fg: "#555555", label: "NO KARAT GOLD" },
	};
	const toneOf = (karat) => {
		const m = /^(\d+)K([PWY])G$/.exec(karat || "");
		return m ? TONES[m[2]] : TONES.X;
	};

	$(page.main).append(`
		<style>
		.tm-top{display:flex;align-items:center;gap:12px;margin:2px 0 16px;}
		.tm-headline{font-size:15px;font-weight:700;letter-spacing:.4px;color:var(--text-color);}
		.tm-sub{color:var(--text-muted);font-size:12px;}
		.tm-spacer{margin-left:auto;}
		.tm-emp{width:220px;}
		.tm-emp .frappe-control{margin:0;}
		.tm-emp .control-label,.tm-emp .help-box{display:none !important;}
		.tm-emp input{height:34px;}
		.tm-make{background:#b00020;border:none;color:#fff;font-weight:800;letter-spacing:2px;padding:8px 26px;border-radius:6px;font-size:14px;cursor:pointer;}
		.tm-make:hover{background:#8f001a;}
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
			<div><div class="tm-headline">MAKE TREE</div><div class="tm-sub">one purity per tree · ticked cards → one tree → CASTING</div></div>
			<span class="tm-spacer"></span>
			<div class="tm-emp"></div>
			<button class="tm-make">MAKE TREE</button>
		</div>
		<div class="tm-board tm-out"></div>
	`);

	const esc = frappe.utils.escape_html;
	const $out = $(page.main).find(".tm-out");
	const flt0 = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));
	const selected = new Set(); // order bag names (across panels; MAKE TREE enforces one panel)

	// global tree-maker picker (roster-filtered to the TREE MAKING bench)
	const emp = frappe.ui.form.make_control({
		df: {
			fieldtype: "Link", options: "Employee", fieldname: "employee", placeholder: "Tree maker…",
			get_query: () => ({ query: "jewelima.jewelima.api.bench_employee_query", filters: { bench: "TREE MAKING" } }),
		},
		parent: $(page.main).find(".tm-emp").get(0), render_input: true,
	});
	emp.refresh();

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
							<div class="tm-chip" data-karat="${esc(q.karat)}" data-ci="${ci}" title="${esc(c.design || "")} · qty ${c.qty || 1}${c.size ? " · " + esc(c.size) : ""}">
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
		queues.forEach((q) => q.cards.forEach((c) => { if (selected.has(c.name)) { karats.add(q.karat); karat = q.karat; } }));
		if (karats.size > 1) return frappe.msgprint(__("One purity per tree — your selection spans {0}. Untick the rest.", [[...karats].join(" + ")]));
		const names = [...selected];
		frappe.confirm(
			__("Mount <b>{0}</b> card(s) on one <b>{1}</b> tree and send them to CASTING?", [names.length, esc(karat)]),
			() => {
				frappe.dom.freeze(__("Making tree…"));
				frappe.call({
					method: "jewelima.jewelima.api.make_tree",
					args: { karat, names: JSON.stringify(names), employee: emp.get_value() || null },
				}).then((r) => {
					frappe.dom.unfreeze();
					const res = r.message || {};
					frappe.show_alert({ message: __("Tree <b>{0}</b> made — {1} card(s) → CASTING.", [res.tree, res.count]), indicator: "green" }, 7);
					if (res.errors && res.errors.length) {
						frappe.msgprint({ title: __("Some not transferred"), message: res.errors.map((e) => `${e.name}: ${e.error}`).join("<br>"), indicator: "orange" });
					}
					load();
				}).catch(() => frappe.dom.unfreeze());
			}
		);
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
