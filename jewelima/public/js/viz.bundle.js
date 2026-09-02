// Small charting kit for the desk pages — hand-rolled SVG so the marks obey the
// house rules: thin bars with rounded data-ends, a 2px surface gap between
// fills, direct labels instead of a number on every tick, recessive axes, and a
// hover tooltip on every mark. Colours come from a validated categorical set
// (blue, orange, aqua, yellow) that clears CVD separation in both themes.
frappe.provide("jewelima.viz");

jewelima.viz = {
	// slot order is the colour-blind safety mechanism — never cycle or reorder
	SERIES: ["var(--jw-s1)", "var(--jw-s2)", "var(--jw-s3)", "var(--jw-s4)"],

	css() {
		return `
		.jw-viz{--jw-s1:#2a78d6;--jw-s2:#eb6834;--jw-s3:#1baf7a;--jw-s4:#eda100;
			--jw-ink:var(--text-color);--jw-mute:var(--text-muted);--jw-grid:var(--border-color);}
		@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .jw-viz{
			--jw-s1:#3987e5;--jw-s2:#d95926;--jw-s3:#199e70;--jw-s4:#c98500;}}
		:root[data-theme="dark"] .jw-viz{--jw-s1:#3987e5;--jw-s2:#d95926;--jw-s3:#199e70;--jw-s4:#c98500;}
		.jw-card{border:1px solid var(--border-color);border-radius:13px;background:var(--fg-color);padding:14px 16px;}
		.jw-card .jw-h{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;
			color:var(--text-muted);margin-bottom:2px;}
		.jw-card .jw-sub{font-size:11.5px;color:var(--text-muted);margin-bottom:10px;}
		.jw-bar-row{display:grid;grid-template-columns:minmax(90px,190px) 1fr auto;gap:10px;align-items:center;
			padding:3px 0;font-size:12px;}
		.jw-bar-lbl{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text-color);}
		.jw-bar-track{height:14px;border-radius:4px;background:var(--control-bg);overflow:hidden;}
		/* the fill is a span inside a plain span track, so it is inline unless we
		   say otherwise — and width/height do nothing to an inline box. Without
		   this every bar renders as an empty groove. */
		.jw-bar-fill{display:block;height:100%;border-radius:4px;transition:width .25s;}
		.jw-bar-val{font-variant-numeric:tabular-nums;font-weight:700;white-space:nowrap;color:var(--text-color);}
		.jw-bar-row:hover .jw-bar-lbl{color:var(--text-color);font-weight:700;}
		.jw-empty{padding:26px;text-align:center;color:var(--text-muted);font-size:12.5px;}
		.jw-legend{display:flex;gap:12px;flex-wrap:wrap;font-size:11.5px;color:var(--text-muted);margin-top:8px;}
		.jw-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px;}
		.jw-col{display:flex;align-items:flex-end;gap:2px;height:120px;}
		.jw-col .b{flex:1;border-radius:4px 4px 0 0;min-height:2px;background:var(--jw-s1);transition:height .25s;}
		.jw-colx{display:flex;gap:2px;font-size:9.5px;color:var(--text-muted);margin-top:4px;}
		.jw-colx span{flex:1;text-align:center;overflow:hidden;white-space:nowrap;}
		`;
	},

	// horizontal bars: magnitude by identity, biggest first, every bar directly labelled
	bars($el, rows, opts) {
		// `label` caps the name column: in a narrow card the default 190px leaves
		// the track a stub, and a bar too short to compare is not a bar.
		const o = Object.assign({ unit: "g", colour: 0, max: null, label: 190,
			empty: __("Nothing to show yet.") }, opts || {});
		const esc = frappe.utils.escape_html;
		const max = o.max || Math.max(...rows.map((r) => Math.abs(r.value)), 0) || 1;
		$el.html(rows.length ? rows.map((r) => {
			const pct = Math.max(Math.abs(r.value) / max * 100, r.value ? 1.5 : 0);
			const c = jewelima.viz.SERIES[(r.colour != null ? r.colour : o.colour) % 4];
			return `<div class="jw-bar-row" style="grid-template-columns:minmax(60px,${o.label}px) 1fr auto;" title="${esc(r.label)} — ${r.value} ${o.unit}">
				<span class="jw-bar-lbl">${esc(r.label)}</span>
				<span class="jw-bar-track"><span class="jw-bar-fill" style="width:${pct}%;background:${c};"></span></span>
				<span class="jw-bar-val">${(+r.value).toFixed(o.dp == null ? 3 : o.dp)}${o.unit ? " " + o.unit : ""}</span>
			</div>`;
		}).join("") : `<div class="jw-empty">${o.empty}</div>`);
	},


	// part-to-whole for a handful of slices — a ring, every slice directly
	// labelled beside it, a 2px surface gap between fills so neighbours never
	// bleed together, and the total living in the hole.
	donut($el, slices, opts) {
		// dp: grams want three decimals, money wants none — the kit was written for
		// grams, so that stays the default and callers say otherwise
		const o = Object.assign({ unit: "g", size: 260, hole: 0.62, centreLabel: "", dp: 3 }, opts || {});
		const esc = frappe.utils.escape_html;
		const total = slices.reduce((a, s) => a + Math.abs(s.value), 0);
		if (!total) { $el.html(`<div class="jw-empty">${o.empty || __("Nothing to show yet.")}</div>`); return; }
		const R = o.size / 2, r = R * o.hole;
		const TAU = Math.PI * 2;
		let a0 = -Math.PI / 2;   // start at twelve o'clock
		const arcs = slices.map((s, i) => {
			const frac = Math.abs(s.value) / total;
			const a1 = a0 + frac * TAU;
			const gap = frac > 0.02 ? 0.014 : 0;      // the surface gap between fills
			const [s0, s1] = [a0 + gap, a1 - gap];
			const big = (s1 - s0) > Math.PI ? 1 : 0;
			const pt = (rad, ang) => [R + rad * Math.cos(ang), R + rad * Math.sin(ang)];
			const [x0, y0] = pt(R, s0), [x1, y1] = pt(R, s1);
			const [x2, y2] = pt(r, s1), [x3, y3] = pt(r, s0);
			const d = `M${x0} ${y0}A${R} ${R} 0 ${big} 1 ${x1} ${y1}L${x2} ${y2}A${r} ${r} 0 ${big} 0 ${x3} ${y3}Z`;
			const mid = (s0 + s1) / 2;
			a0 = a1;
			return { d, colour: jewelima.viz.SERIES[(s.colour != null ? s.colour : i) % 4],
				pct: frac * 100, mid, label: s.label, value: s.value };
		});
		$el.html(`
			<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap;justify-content:center;">
				<svg viewBox="0 0 ${o.size} ${o.size}" style="width:${o.size}px;max-width:100%;height:auto;flex:0 0 auto;">
					${arcs.map((a) => `<path d="${a.d}" fill="${a.colour}"
						stroke="var(--fg-color)" stroke-width="2"><title>${esc(a.label)} — ${a.value} ${o.unit} (${a.pct.toFixed(1)}%)</title></path>`).join("")}
					<text x="${R}" y="${R - 4}" text-anchor="middle" style="font-size:22px;font-weight:800;fill:var(--jw-ink);">
						${total.toFixed(o.dp === 0 ? 0 : (total > 999 ? 0 : o.dp))}</text>
					<text x="${R}" y="${R + 16}" text-anchor="middle" style="font-size:11px;fill:var(--jw-mute);">
						${esc(o.centreLabel || o.unit)}</text>
				</svg>
				<div style="flex:1 1 200px;min-width:190px;">
					${arcs.map((a) => `<div class="jw-bar-row" style="grid-template-columns:auto 1fr auto;">
						<i style="width:11px;height:11px;border-radius:3px;background:${a.colour};display:inline-block;"></i>
						<span class="jw-bar-lbl">${esc(a.label)}</span>
						<span class="jw-bar-val">${(+a.value).toFixed(o.dp)} <span style="color:var(--text-muted);font-weight:400;">${a.pct.toFixed(1)}%</span></span>
					</div>`).join("")}
				</div>
			</div>`);
	},

	// a short time series — columns, labelled sparsely so the axis stays readable
	columns($el, points, opts) {
		const o = Object.assign({ unit: "g", every: 2 }, opts || {});
		const esc = frappe.utils.escape_html;
		const max = Math.max(...points.map((p) => p.value), 0) || 1;
		$el.html(`<div class="jw-col">${points.map((p) => `
			<div class="b" style="height:${Math.max((p.value / max) * 100, p.value ? 3 : 0.8)}%;
				${p.value ? "" : "opacity:.35;"}" title="${esc(p.label)} — ${p.value} ${o.unit}"></div>`).join("")}</div>
			<div class="jw-colx">${points.map((p, i) => `<span>${i % o.every === 0 ? esc(p.short || "") : ""}</span>`).join("")}</div>`);
	},
};
