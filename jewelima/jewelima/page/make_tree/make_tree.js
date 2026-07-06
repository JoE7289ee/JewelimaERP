// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Make Tree — cards at TREE MAKING queue up as tall COLOUR PANELS, one per casting
// karat (shade deepens with karat: 22K > 18K > 14K). Cards are white chips (☑ + Order
// No + gram). ONE TREE AT A TIME: selection is locked to a single karat panel — picking
// a card from another panel asks for confirmation and clears the current selection.
// Scan a barcode to select a card (a card that isn't in the queue reports where it
// actually is); every scan is logged in the History dialog. MAKE TREE AND SEND TO
// CASTING QUEUE asks who's making the tree (TREE MAKING bench roster only), creates the
// Wax Tree (T-<karat>-###), stamps everything and transfers the lot to CASTING.
// Route: /app/make-tree ("tree-making" collides with the Tree Making doctype list)

frappe.pages["make-tree"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Make Tree", single_column: true });
	let queues = [];
	const state = { selected: new Set(), karat: null, history: [] };

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
		.tm-top{display:flex;align-items:center;gap:14px;margin:2px 0 18px;flex-wrap:wrap;}
		.tm-mark{display:flex;align-items:center;gap:12px;}
		.tm-mark svg{width:38px;height:38px;}
		.tm-headline{font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:700;letter-spacing:4px;color:#3d3425;}
		.tm-sub{color:var(--text-muted);font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;margin-top:1px;}
		.tm-scan{width:250px;margin-left:14px;}
		.tm-scan .frappe-control{margin:0;}
		.tm-scan .control-label,.tm-scan .help-box{display:none !important;}
		.tm-scan input{height:36px;border-radius:7px;}
		.tm-spacer{margin-left:auto;}
		.tm-make{background:#a3132e;border:none;color:#fff;font-weight:800;letter-spacing:1.2px;padding:10px 22px;border-radius:7px;font-size:12.5px;cursor:pointer;box-shadow:0 2px 6px rgba(163,19,46,.35);}
		.tm-make:hover{background:#820f25;}
		.tm-msg{display:none;margin:-6px 0 12px;padding:7px 12px;border-radius:7px;font-size:13px;}
		.tm-msg.err{display:block;background:#fbeaea;color:#b00020;border:1px solid #e6b3b3;}
		.tm-msg.warn{display:block;background:#fdf3e3;color:#9a6700;border:1px solid #f0d9a8;}
		.tm-msg.ok{display:block;background:#eaf6ec;color:#1d7a33;border:1px solid #bfe3c6;}
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
		@keyframes tmflash { 0%{transform:scale(1.04);box-shadow:0 0 0 4px currentColor;} 100%{transform:scale(1);} }
		.tm-chip.flash{animation:tmflash .7s ease-out;}
		.tm-cnt{margin-top:auto;padding-top:8px;text-align:center;font-size:12px;font-weight:700;opacity:.8;}
		.tm-none{border:1px dashed var(--border-color);border-radius:14px;padding:40px;text-align:center;color:var(--text-muted);width:100%;}
		</style>
		<div class="tm-top">
			<div class="tm-mark">
				<svg viewBox="0 0 24 24" fill="none" stroke="#8a6d1a" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
					<path d="M12 22v-6"/><path d="M12 16c-4 0-7-2.4-7-6 0-2.5 1.6-4.6 3.9-5.5C9.3 2.9 10.5 2 12 2s2.7.9 3.1 2.5C17.4 5.4 19 7.5 19 10c0 3.6-3 6-7 6z"/>
					<path d="M9 9l3 3 3-3"/>
				</svg>
				<div><div class="tm-headline">MAKE TREE</div><div class="tm-sub">one tree at a time · one purity per tree</div></div>
			</div>
			<div class="tm-scan"></div>
			<span class="tm-spacer"></span>
			<button class="tm-make">MAKE TREE AND SEND TO CASTING QUEUE</button>
		</div>
		<div class="tm-msg"></div>
		<div class="tm-board tm-out"></div>
	`);

	const esc = frappe.utils.escape_html;
	const $out = $(page.main).find(".tm-out");
	const $msg = $(page.main).find(".tm-msg");
	const flt0 = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));

	const scan = frappe.ui.form.make_control({
		df: { fieldtype: "Data", fieldname: "scan", placeholder: "Scan card barcode…" },
		parent: $(page.main).find(".tm-scan").get(0), render_input: true,
	});
	scan.refresh();
	const focusScan = () => setTimeout(() => scan.$input.focus(), 30);

	function setMsg(html, kind) {
		$msg.removeClass("err warn ok").html(html || "");
		if (html) $msg.addClass(kind || "err");
	}
	function logHistory(code, result, kind) {
		state.history.push({ time: frappe.datetime.now_datetime(), code, result, kind: kind || "ok" });
	}

	function chipOf(name) {
		return $out.find(`.tm-chip[data-name="${(window.CSS && CSS.escape) ? CSS.escape(name) : name}"]`);
	}
	function refreshCounts() {
		$out.find(".tm-col").each(function () {
			const $col = $(this);
			const total = $col.find(".tm-chip").length;
			const on = $col.find(".tm-chip.on").length;
			const grams = $col.find(".tm-chip.on .gram").map((i, el) => flt0(el.textContent)).get().reduce((a, b) => a + b, 0);
			$col.find(".tm-cnt").text(on ? `${on} of ${total} selected · ${grams.toFixed(3)} g` : `${total} card(s)`);
		});
	}
	function markChip(name, on) {
		const $c = chipOf(name);
		$c.toggleClass("on", on);
		$c.find(".cb").prop("checked", on);
	}
	function clearSelection() {
		state.selected.forEach((nm) => markChip(nm, false));
		state.selected.clear();
		state.karat = null;
		refreshCounts();
	}
	// ONE TREE AT A TIME: adding a card from another karat asks first, then starts fresh.
	function select(name, karat, fromScan) {
		const add = () => {
			state.selected.add(name);
			state.karat = karat;
			markChip(name, true);
			refreshCounts();
			if (fromScan) {
				const $c = chipOf(name);
				$c.closest(".tm-col").prependTo($out); // scanned karat's table jumps to the front
				$c.addClass("flash");
				setTimeout(() => $c.removeClass("flash"), 800);
				$c.get(0) && $c.get(0).scrollIntoView({ block: "center", behavior: "smooth" });
				setMsg(__("Selected <b>{0}</b> ({1}) · {2} on this tree.", [esc(name), esc(karat), state.selected.size]), "ok");
				logHistory(name, __("Selected ({0})", [karat]), "ok");
			}
		};
		if (state.karat && state.karat !== karat && state.selected.size) {
			frappe.confirm(
				__("You're building a <b>{0}</b> tree ({1} card(s) selected).<br>Switch to <b>{2}</b>? The current selection will be cleared — the karat is changing.",
					[esc(state.karat), state.selected.size, esc(karat)]),
				() => { clearSelection(); add(); },
				() => { if (fromScan) { setMsg(__("Kept the {0} tree — <b>{1}</b> not selected.", [esc(state.karat), esc(name)]), "warn"); logHistory(name, __("Karat switch declined"), "warn"); } focusScan(); }
			);
			return;
		}
		add();
	}
	function deselect(name) {
		state.selected.delete(name);
		markChip(name, false);
		if (!state.selected.size) state.karat = null;
		refreshCounts();
	}

	function render() {
		$out.empty();
		state.selected.clear();
		state.karat = null;
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
						${q.cards.map((c) => `
							<div class="tm-chip" data-name="${esc(c.name)}" data-karat="${esc(q.karat)}" title="${esc(c.design || "")} · qty ${c.qty || 1}${c.size ? " · " + esc(c.size) : ""}">
								<input type="checkbox" class="cb">
								<span class="code">${esc(c.name)}</span>
								<span class="gram">${flt0(c.nett_weight) ? flt0(c.nett_weight).toFixed(3) + " g" : ""}</span>
							</div>`).join("")}
						<div class="tm-cnt"></div>
					</div>
				</div>`);
			$out.append($col);
		});
		$out.find(".tm-chip").on("click", function () {
			const name = this.getAttribute("data-name");
			const karat = this.getAttribute("data-karat");
			this.classList.contains("on") ? deselect(name) : select(name, karat, false);
		});
		refreshCounts();
	}

	// ---- scan: select the card if it's in a queue; otherwise say where it really is ----
	function processScan(code) {
		code = (code || "").trim();
		if (!code) return;
		const safe = esc(code);
		let hit = null;
		queues.forEach((q) => q.cards.forEach((c) => { if (c.name === code) hit = { karat: q.karat }; }));
		if (hit) {
			if (state.selected.has(code)) {
				setMsg(__("<b>{0}</b> is already on this tree.", [safe]), "warn");
				logHistory(code, "Already selected", "warn");
				return;
			}
			select(code, hit.karat, true);
			return;
		}
		// not in the queue — find out where it actually is
		frappe.call({ method: "frappe.client.get_value", args: { doctype: "Order Bag", filters: code, fieldname: ["location", "tree"] } }).then((r) => {
			const v = (r.message || {});
			if (!v.location) {
				setMsg(__("No Order Bag <b>{0}</b>.", [safe]), "err");
				logHistory(code, "Not found", "err");
			} else if (v.tree) {
				setMsg(__("<b>{0}</b> is already on tree <b>{1}</b> (at {2}).", [safe, esc(v.tree), esc(v.location)]), "err");
				logHistory(code, __("On {0} · at {1}", [v.tree, v.location]), "err");
			} else {
				setMsg(__("<b>{0}</b> is at <b>{1}</b> — not in the TREE MAKING queue.", [safe, esc(v.location)]), "err");
				logHistory(code, __("At {0}", [v.location]), "err");
			}
		});
	}
	scan.$input.on("keydown", (e) => {
		if (e.which === 13 || e.key === "Enter") {
			e.preventDefault();
			const code = scan.$input.val();
			scan.set_value("");
			processScan(code);
			focusScan();
		}
	});

	function showHistory() {
		const h = state.history;
		const body = h.slice().reverse().map((e, idx) => {
			const color = e.kind === "err" ? "#b00020" : e.kind === "warn" ? "#9a6700" : "#1d7a33";
			return `<tr><td>${h.length - idx}</td><td>${e.time ? frappe.datetime.str_to_user(e.time) : ""}</td>
				<td><b>${esc(e.code)}</b></td><td style="color:${color}">${esc(e.result)}</td></tr>`;
		}).join("");
		const d = new frappe.ui.Dialog({ title: __("Scan history ({0})", [h.length]), size: "large", fields: [{ fieldtype: "HTML", fieldname: "h" }] });
		d.fields_dict.h.$wrapper.html(
			h.length
				? `<table class="table table-bordered" style="font-size:12px;"><thead><tr><th style="width:40px">#</th><th>Time</th><th>Order Bag</th><th>Result</th></tr></thead><tbody>${body}</tbody></table>`
				: '<div class="text-muted" style="padding:12px;">No scans yet this session.</div>'
		);
		d.show();
	}

	$(page.main).find(".tm-make").on("click", () => {
		if (!state.selected.size) return frappe.msgprint(__("Tick or scan the cards going onto the tree."));
		const karat = state.karat;
		const names = [...state.selected];
		const grams = names.reduce((s, nm) => s + flt0(chipOf(nm).find(".gram").text()), 0);

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
				{ fieldname: "wax_weight", fieldtype: "Float", label: __("Weight in Wax (g)"), precision: "3",
					description: __("The mounted tree's wax weight — weigh the tree and enter it here.") },
			],
			primary_action_label: __("Make Tree → Casting"),
			primary_action(v) {
				d.hide();
				frappe.dom.freeze(__("Making tree…"));
				frappe.call({
					method: "jewelima.jewelima.api.make_tree",
					args: { karat, names: JSON.stringify(names), employee: v.employee, wax_weight: v.wax_weight || 0 },
				}).then((r) => {
					frappe.dom.unfreeze();
					const res = r.message || {};
					frappe.show_alert({ message: __("Tree <b>{0}</b> made — {1} card(s) → CASTING.", [res.tree, res.count]), indicator: "green" }, 7);
					if (res.errors && res.errors.length) {
						frappe.msgprint({ title: __("Some not transferred"), message: res.errors.map((e) => `${e.name}: ${e.error}`).join("<br>"), indicator: "orange" });
					}
					logHistory("—", __("Tree {0} → CASTING ({1} cards)", [res.tree, res.count]), "ok");
					setMsg("");
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
			focusScan();
		});
	}

	page.add_inner_button(__("History"), showHistory);
	page.add_inner_button(__("Refresh"), load);
	load();
};
