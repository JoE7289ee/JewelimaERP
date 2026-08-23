// Ctrl+Space — the Jewelima quick menu. A tiny palette of the everyday pages:
// press Ctrl+Space anywhere on the desk, then hit the item's number (or arrows +
// Enter, or click). Edit QUICK_ITEMS to change what's on it.
// (Ctrl+Space is unbound in every major browser on every platform.)

const QUICK_ITEMS = [
	{ label: __("Transfer Order Bag"), route: "transfer-order-bag" },
	{ label: __("Assign / Collect"), route: "assign-collect" },
	{ label: __("Job Work"), route: "job-work" },
	{ label: __("Place Order"), route: "place-order" },
	{ label: __("Card Info"), route: "card-info" },
	{ label: __("Sell"), route: "sell" },
	{ label: __("Transfer Holder"), route: "transfer-holder" },
];

// SLOT numbers are stable per layout: the server resolves the session user's
// menu (their own layout -> a role layout -> the house default) with each
// item's fixed slot number; pages the user can't open are already dropped.
// QUICK_ITEMS above remains only as the offline fallback.
let items = null; // resolved list, each with its fixed .n
function loadItems() {
	if (items) return Promise.resolve(items);
	return frappe
		.call({ method: "jewelima.jewelima.api.get_quick_menu" })
		.then((r) => (items = r.message || []))
		.catch(() => (items = QUICK_ITEMS.map((it, i) => ({ ...it, n: i + 1 }))));
}
// the setup page pokes this after a save so the next Ctrl+Space is fresh
window.jwQuickReload = () => { items = null; };

let $menu = null;
let selected = 0;

function closeMenu() {
	if ($menu) { $menu.remove(); $menu = null; }
	$(document).off("keydown.jqm mousedown.jqm");
}

function go(i) {
	const item = (items || [])[i];
	closeMenu();
	if (item) frappe.set_route(item.route);
}

function paint() {
	$menu.find(".jqm-item").each((i, el) => $(el).toggleClass("sel", i === selected));
}

function openMenu() {
	loadItems().then(renderMenu);
}

function renderMenu() {
	closeMenu();
	if (!items.length) return;
	selected = 0;
	$menu = $(`
		<div class="jqm-wrap">
			<style>
			.jqm-wrap{position:fixed;inset:0;z-index:1050;background:rgba(0,0,0,.25);display:flex;align-items:flex-start;justify-content:center;padding-top:14vh;}
			.jqm-box{background:var(--fg-color,#fff);border:1px solid var(--border-color);border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,.25);width:320px;overflow:hidden;}
			.jqm-head{padding:8px 14px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted);border-bottom:1px solid var(--border-color);}
			.jqm-item{display:flex;align-items:center;gap:11px;padding:8px 14px;cursor:pointer;font-size:13.5px;color:var(--text-color);}
			.jqm-item .jqm-n{width:20px;height:20px;border-radius:5px;background:var(--control-bg);border:1px solid var(--border-color);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--text-muted);flex:none;}
			.jqm-item:hover,.jqm-item.sel{background:var(--control-bg);}
			.jqm-item.sel .jqm-n{background:var(--primary);border-color:var(--primary);color:#fff;}
			.jqm-foot{padding:6px 14px;font-size:11px;color:var(--text-muted);border-top:1px solid var(--border-color);}
			</style>
			<div class="jqm-box">
				<div class="jqm-head">${__("Quick Menu")}</div>
				${items.map((it, i) => `
					<div class="jqm-item" data-i="${i}"><span class="jqm-n">${it.n}</span>${frappe.utils.escape_html(it.label)}</div>`).join("")}
				<div class="jqm-foot">${__("number / ↑↓ + Enter / click — Esc closes")}</div>
			</div>
		</div>
	`).appendTo("body");
	paint();

	$menu.on("click", ".jqm-item", function () { go(cint(this.getAttribute("data-i"))); });
	$menu.on("click", (e) => { if (e.target === $menu.get(0)) closeMenu(); });

	$(document).on("keydown.jqm", (e) => {
		if (e.key === "Escape") { closeMenu(); }
		else if (e.key === "ArrowDown") { selected = (selected + 1) % items.length; paint(); }
		else if (e.key === "ArrowUp") { selected = (selected + items.length - 1) % items.length; paint(); }
		else if (e.key === "Enter") { go(selected); }
		else if (/^[1-9]$/.test(e.key)) { const i = items.findIndex((it) => it.n === cint(e.key)); if (i >= 0) go(i); }
		else return;
		e.preventDefault();
		e.stopPropagation();
	});
}

$(document).on("keydown", (e) => {
	// literal Ctrl (never Cmd) + Space
	if (!e.ctrlKey || e.metaKey || e.altKey || e.code !== "Space") return;
	e.preventDefault();
	$menu ? closeMenu() : openMenu();
});
