// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// The two shapes the Costing pages draw, and the palette they draw them in.
//
// A price chart is an ENTITY, so its colour is identity, not magnitude: the hue
// order below is fixed and never cycled — a seventh chart folds into "Other"
// rather than borrowing chart one's colour, because a filter that repaints the
// survivors makes two screenshots impossible to compare. Both step sets were
// checked against the light and dark surfaces for lightness, chroma, colour-vision
// separation and contrast before being written down; changing a hex here means
// checking them again.
window.jewelima = window.jewelima || {};

jewelima.COST_HUES_LIGHT = ["#1665A8", "#C25E00", "#6A3FBF", "#12A08F", "#9A7500", "#A62B62"];
jewelima.COST_HUES_DARK = ["#3E92D8", "#CC6E15", "#8C64DD", "#0FA68F", "#A67E0C", "#C74C82"];

jewelima.costHues = function () {
	const root = document.documentElement;
	const stamped = root.getAttribute("data-theme");
	const dark = stamped === "dark"
		|| (!stamped && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
	return dark ? jewelima.COST_HUES_DARK : jewelima.COST_HUES_LIGHT;
};

// the ink and rule colours come from the desk's own tokens, so chart text sits in
// the same greys as the page in either theme
jewelima.costInk = () => ({
	text: "var(--text-color)", muted: "var(--text-muted)",
	rule: "var(--border-color)", surface: "var(--fg-color)",
});

jewelima._costTip = function ($host) {
	let $t = $host.find(".jc-tip");
	if (!$t.length) $t = $('<div class="jc-tip" hidden></div>').appendTo($host);
	return $t;
};

// ---------------------------------------------------------------------------
// Dot plot — a few values compared across a few categories (touch by karat,
// making by karat). Bars from zero would be four fat blocks saying little; a dot
// on a rule reads the spread between charts at a glance, which is the question.
// ---------------------------------------------------------------------------
jewelima.costDotPlot = function (host, o) {
	const $h = $(host).empty().css("position", "relative");
	const hues = jewelima.costHues();
	const rows = o.rows || [];                       // [{label, values:[{series, value}]}]
	const series = o.series || [];                   // series names, in fixed order
	const fmt = o.fmt || ((v) => String(v));
	const all = rows.flatMap((r) => r.values.map((v) => v.value)).filter((v) => v != null);
	if (!all.length) {
		$h.html(`<div class="jc-empty">${o.empty || __("Nothing to compare yet.")}</div>`);
		return;
	}
	// the scale starts at zero when the values do not, so a 2% difference cannot
	// be drawn as if it were the whole story
	const lo = 0, hi = Math.max(...all) * 1.08 || 1;
	const W = 100, padL = 13, padR = 6;              // percent-space, so it reflows
	const x = (v) => padL + ((v - lo) / (hi - lo)) * (W - padL - padR);
	const ROW = 17, TOP = 5, BOT = 13;
	const H = TOP + rows.length * ROW + BOT;

	const ticks = 4;
	const gridline = (i) => {
		const v = lo + ((hi - lo) * i) / ticks;
		return `<line x1="${x(v)}" y1="${TOP}" x2="${x(v)}" y2="${TOP + rows.length * ROW}"
			stroke="var(--border-color)" stroke-width="0.15" />
			<text x="${x(v)}" y="${H - 4}" font-size="3.4" text-anchor="middle"
				fill="var(--text-muted)">${fmt(v)}</text>`;
	};

	const marks = rows.map((r, ri) => {
		const cy = TOP + ri * ROW + ROW / 2;
		const pts = r.values.filter((v) => v.value != null);
		return `<line x1="${padL}" y1="${cy}" x2="${W - padR}" y2="${cy}"
				stroke="var(--border-color)" stroke-width="0.2" />
			<text x="${padL - 2}" y="${cy + 1.3}" font-size="3.8" text-anchor="end"
				font-weight="700" fill="var(--text-color)">${frappe.utils.escape_html(r.label)}</text>`
			+ pts.map((v) => {
				const i = series.indexOf(v.series);
				// a 2px surface ring keeps two charts on the same value readable as two
				return `<circle class="jc-dot" cx="${x(v.value)}" cy="${cy}" r="2.6"
					fill="${hues[i % hues.length]}" stroke="var(--fg-color)" stroke-width="0.6"
					data-s="${frappe.utils.escape_html(v.series)}"
					data-l="${frappe.utils.escape_html(r.label)}"
					data-v="${fmt(v.value)}"><title>${frappe.utils.escape_html(v.series)} · ${
						frappe.utils.escape_html(r.label)} · ${fmt(v.value)}</title></circle>`;
			}).join("")
			// with a handful of series the value is worth reading off the dot itself
			+ (pts.length && pts.length <= 4
				? pts.map((v) => `<text x="${x(v.value)}" y="${cy - 3.6}" font-size="3.2"
					text-anchor="middle" fill="var(--text-muted)">${fmt(v.value)}</text>`).join("")
				: "");
	}).join("");

	$h.append(`<svg viewBox="0 0 ${W} ${H}" class="jc-svg" role="img"
		aria-label="${frappe.utils.escape_html(o.title || "")}">
		${Array.from({ length: ticks + 1 }, (_, i) => gridline(i)).join("")}
		${marks}
	</svg>`);
	jewelima.costLegend($h, series, hues);
	jewelima._costHover($h);
};

// ---------------------------------------------------------------------------
// Step chart — a diamond bracket holds its rate from where it starts until the
// next one begins, so the line steps; drawing it sloped would claim rates the
// chart never quotes.
// ---------------------------------------------------------------------------
jewelima.costStepChart = function (host, o) {
	const $h = $(host).empty().css("position", "relative");
	const hues = jewelima.costHues();
	const series = o.series || [];                   // [{name, points:[{from_ct,to_ct,rate,sieve}]}]
	const pts = series.flatMap((s) => s.points || []);
	if (!pts.length) {
		$h.html(`<div class="jc-empty">${o.empty || __("No brackets on these charts.")}</div>`);
		return;
	}
	const xs = pts.flatMap((p) => [p.from_ct, p.to_ct || p.from_ct]).filter((v) => v > 0);
	const xlo = 0, xhi = Math.max(...xs) * 1.05 || 1;
	const ylo = 0, yhi = Math.max(...pts.map((p) => p.rate)) * 1.1 || 1;
	const W = 100, H = 52, padL = 12, padR = 3, padT = 4, padB = 9;
	const X = (v) => padL + ((v - xlo) / (xhi - xlo)) * (W - padL - padR);
	const Y = (v) => H - padB - ((v - ylo) / (yhi - ylo)) * (H - padT - padB);
	const inr = (v) => "₹" + Math.round(v).toLocaleString("en-IN");

	let grid = "";
	for (let i = 0; i <= 4; i++) {
		const v = ylo + ((yhi - ylo) * i) / 4;
		grid += `<line x1="${padL}" y1="${Y(v)}" x2="${W - padR}" y2="${Y(v)}"
			stroke="var(--border-color)" stroke-width="0.15" />
			<text x="${padL - 1.5}" y="${Y(v) + 1.3}" font-size="3.4" text-anchor="end"
				fill="var(--text-muted)">${inr(v)}</text>`;
	}
	for (let i = 0; i <= 4; i++) {
		const v = xlo + ((xhi - xlo) * i) / 4;
		grid += `<text x="${X(v)}" y="${H - 3}" font-size="3.4" text-anchor="middle"
			fill="var(--text-muted)">${v.toFixed(2)}</text>`;
	}

	const lines = series.map((s, si) => {
		const hue = hues[si % hues.length];
		const p = (s.points || []).slice().sort((a, b) => a.from_ct - b.from_ct);
		let d = "";
		p.forEach((pt, i) => {
			const x0 = X(pt.from_ct), x1 = X(pt.to_ct || (i + 1 < p.length ? p[i + 1].from_ct : xhi));
			d += `${i === 0 ? "M" : "L"}${x0},${Y(pt.rate)} L${x1},${Y(pt.rate)} `;
			if (i + 1 < p.length) d += `L${x1},${Y(p[i + 1].rate)} `;
		});
		const dots = p.map((pt) => `<circle class="jc-dot" cx="${X(pt.from_ct)}" cy="${Y(pt.rate)}" r="1.5"
			fill="${hue}" stroke="var(--fg-color)" stroke-width="0.5"
			data-s="${frappe.utils.escape_html(s.name)}"
			data-l="${pt.sieve ? frappe.utils.escape_html(pt.sieve) + " · " : ""}${pt.from_ct}–${pt.to_ct || "▸"} ct"
			data-v="${inr(pt.rate)}/ct"></circle>`).join("");
		return `<path d="${d}" fill="none" stroke="${hue}" stroke-width="0.7"
			stroke-linejoin="round" stroke-linecap="round" />${dots}`;
	}).join("");

	$h.append(`<svg viewBox="0 0 ${W} ${H}" class="jc-svg" role="img"
		aria-label="${frappe.utils.escape_html(o.title || "")}">
		${grid}${lines}
		<text x="${padL}" y="${H - 0.2}" font-size="3.2" fill="var(--text-muted)">${
			__("per-stone ct")}</text>
	</svg>`);
	jewelima.costLegend($h, series.map((s) => s.name), hues);
	jewelima._costHover($h);
};

jewelima.costLegend = function ($h, names, hues) {
	if (!names || names.length < 2) return;          // one series is named by the title
	$h.append(`<div class="jc-legend">${names.map((n, i) =>
		`<span><i style="background:${hues[i % hues.length]}"></i>${
			frappe.utils.escape_html(n)}</span>`).join("")}</div>`);
};

jewelima._costHover = function ($h) {
	const $t = jewelima._costTip($h);
	$h.on("mouseenter", ".jc-dot", function (e) {
		const d = this.dataset;
		$t.html(`<b>${frappe.utils.escape_html(d.s)}</b><br>${
			frappe.utils.escape_html(d.l)}<br><span class="v">${frappe.utils.escape_html(d.v)}</span>`)
			.prop("hidden", false);
		const r = $h[0].getBoundingClientRect(), b = this.getBoundingClientRect();
		$t.css({ left: Math.min(b.left - r.left + 10, r.width - 150) + "px",
			top: Math.max(b.top - r.top - 8, 0) + "px" });
	}).on("mouseleave", ".jc-dot", () => $t.prop("hidden", true));
};

jewelima.COST_CHART_CSS = `
.jc-svg{width:100%;height:auto;display:block;overflow:visible;}
.jc-dot{cursor:pointer;transition:r .12s;}
.jc-dot:hover{r:3.2;}
.jc-legend{display:flex;flex-wrap:wrap;gap:12px;margin-top:9px;font-size:12px;color:var(--text-muted);}
.jc-legend span{display:flex;align-items:center;gap:6px;}
.jc-legend i{width:10px;height:10px;border-radius:3px;display:inline-block;}
.jc-tip{position:absolute;z-index:5;background:var(--fg-color);border:1px solid var(--border-color);
	border-radius:8px;padding:6px 10px;font-size:12px;line-height:1.45;pointer-events:none;
	box-shadow:0 3px 10px rgba(0,0,0,.14);white-space:nowrap;}
.jc-tip .v{font-weight:800;font-variant-numeric:tabular-nums;}
.jc-empty{padding:26px;text-align:center;color:var(--text-muted);font-size:13px;}
`;
