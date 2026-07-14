// jewelima.buildFilterBar(container, {fields, getData, onChange}) — a generic,
// reusable filter engine. Inline builder [Field ▾][Op ▾][Value][+ Add]; each
// added filter becomes a removable chip; multiple chips AND together. Operators
// + the value control adapt to the field TYPE:
//   select  -> is / is not     (value = a dropdown of values present in the data)
//   text    -> contains
//   date    -> on / before / after / between
//   number  -> = / > / <
// fields: [{key, label, type}].  getData(): current row array (for select options).
// Returns { apply(rows), count() }.

frappe.provide("jewelima");

jewelima.buildFilterBar = function (container, opts) {
	const $c = $(container);
	const S = { filters: [] };
	const esc = frappe.utils.escape_html;
	const OPS = {
		select: [["is", "is"], ["isnot", "is not"]],
		text: [["contains", "contains"]],
		date: [["on", "on"], ["before", "before"], ["after", "after"], ["between", "between"]],
		number: [["eq", "="], ["gt", ">"], ["lt", "<"]],
	};

	$c.addClass("fb").html(`
		<style>
		.fb{margin:2px 0 12px;}
		.fb-build{display:flex;gap:6px;align-items:center;flex-wrap:wrap;}
		.fb-build select,.fb-build input{border:1px solid var(--border-color);background:var(--control-bg);color:var(--text-color);height:28px;border-radius:5px;padding:2px 8px;font-size:12.5px;}
		.fb-build .fb-field{font-weight:600;}
		.fb-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;}
		.fb-chip{background:var(--control-bg);border:1px solid var(--border-color);border-radius:12px;padding:2px 6px 2px 11px;font-size:12px;display:inline-flex;align-items:center;gap:7px;}
		.fb-chip .x{cursor:pointer;color:var(--text-muted);font-weight:700;padding:0 4px;border-radius:8px;}
		.fb-chip .x:hover{background:var(--red-100,#fdecea);color:var(--red-600,#c0392b);}
		.fb-clear{cursor:pointer;font-size:11.5px;color:var(--text-muted);text-decoration:underline;align-self:center;}
		</style>
		<div class="fb-build">
			<select class="fb-field"></select>
			<select class="fb-op"></select>
			<span class="fb-val"></span>
			<button class="btn btn-xs btn-default fb-add">${__("Add filter")}</button>
		</div>
		<div class="fb-chips"></div>
	`);

	const curField = () => opts.fields.find((f) => f.key === $c.find(".fb-field").val()) || opts.fields[0];

	$c.find(".fb-field").html(opts.fields.map((f) => `<option value="${esc(f.key)}">${esc(f.label)}</option>`).join(""));

	function fillOps() {
		const t = curField().type;
		$c.find(".fb-op").html(OPS[t].map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join(""));
	}
	function buildVal() {
		const f = curField(), op = $c.find(".fb-op").val();
		if (f.type === "select") {
			const vals = [...new Set((opts.getData() || []).map((r) => r[f.key]).filter((x) => x !== "" && x != null))].sort();
			$c.find(".fb-val").html(`<select class="fb-v">${vals.map((v) => `<option>${esc(v)}</option>`).join("") || `<option value="">—</option>`}</select>`);
		} else if (f.type === "date") {
			$c.find(".fb-val").html(`<input type="date" class="fb-v">` + (op === "between" ? ` <span style="color:var(--text-muted);">–</span> <input type="date" class="fb-v2">` : ""));
		} else if (f.type === "number") {
			$c.find(".fb-val").html(`<input type="number" step="0.001" class="fb-v" placeholder="0">`);
		} else {
			$c.find(".fb-val").html(`<input type="text" class="fb-v" placeholder="${__("text…")}">`);
		}
	}
	fillOps();
	buildVal();

	$c.on("change", ".fb-field", () => { fillOps(); buildVal(); });
	$c.on("change", ".fb-op", buildVal);

	$c.on("click", ".fb-add", () => {
		const f = curField(), op = $c.find(".fb-op").val();
		const v = ($c.find(".fb-v").val() || "").trim(), v2 = ($c.find(".fb-v2").val() || "").trim();
		if (v === "") return;
		S.filters.push({ key: f.key, label: f.label, type: f.type, op, v, v2 });
		renderChips();
		opts.onChange && opts.onChange();
	});
	$c.on("click", ".fb-chip .x", function () {
		S.filters.splice($(this).closest(".fb-chip").index(), 1);
		renderChips();
		opts.onChange && opts.onChange();
	});
	$c.on("click", ".fb-clear", () => { S.filters = []; renderChips(); opts.onChange && opts.onChange(); });

	const opLabel = (t, op) => (OPS[t].find((o) => o[0] === op) || ["", op])[1];
	function renderChips() {
		const chips = S.filters.map((f) =>
			`<span class="fb-chip">${esc(f.label)} ${esc(opLabel(f.type, f.op))} <b>${esc(f.v)}${f.v2 ? " – " + esc(f.v2) : ""}</b><span class="x" title="${__("remove")}">×</span></span>`).join("");
		$c.find(".fb-chips").html(chips + (S.filters.length > 1 ? ` <span class="fb-clear">${__("clear all")}</span>` : ""));
	}

	function match(f, r) {
		const val = r[f.key] == null ? "" : String(r[f.key]);
		if (f.type === "select") return f.op === "is" ? val === f.v : val !== f.v;
		if (f.type === "text") return val.toLowerCase().includes(String(f.v).toLowerCase());
		if (f.type === "date") {
			if (!val) return false;
			if (f.op === "on") return val === f.v;
			if (f.op === "before") return val < f.v;
			if (f.op === "after") return val > f.v;
			return val >= f.v && (!f.v2 || val <= f.v2); // between
		}
		if (f.type === "number") {
			const x = parseFloat(val) || 0, y = parseFloat(f.v) || 0;
			return f.op === "eq" ? x === y : f.op === "gt" ? x > y : x < y;
		}
		return true;
	}

	return {
		apply: (rows) => (rows || []).filter((r) => S.filters.every((f) => match(f, r))),
		count: () => S.filters.length,
	};
};
