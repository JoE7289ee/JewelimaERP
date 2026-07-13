// Ctrl+Q — the Jewelima quick menu. A tiny palette of the everyday pages:
// press Ctrl+Q anywhere on the desk, then hit the item's number (or arrows +
// Enter, or click). Edit QUICK_ITEMS to change what's on it.
// (Deliberately Ctrl even on Mac — Cmd+Q quits the browser.)

const QUICK_ITEMS = [
	{ label: __("Transfer Order Bag"), route: "transfer-order-bag" },
	{ label: __("Place Order"), route: "place-order" },
	{ label: __("Card Info"), route: "card-info" },
	{ label: __("Sell"), route: "sell" },
	{ label: __("Transfer Holder"), route: "transfer-holder" },
	{ label: __("Item Stock"), route: "item-stock" },
];

let $menu = null;
let selected = 0;

function closeMenu() {
	if ($menu) { $menu.remove(); $menu = null; }
	$(document).off("keydown.jqm mousedown.jqm");
}

function go(i) {
	const item = QUICK_ITEMS[i];
	closeMenu();
	if (item) frappe.set_route(item.route);
}

function paint() {
	$menu.find(".jqm-item").each((i, el) => $(el).toggleClass("sel", i === selected));
}

function openMenu() {
	closeMenu();
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
				${QUICK_ITEMS.map((it, i) => `
					<div class="jqm-item" data-i="${i}"><span class="jqm-n">${i + 1}</span>${frappe.utils.escape_html(it.label)}</div>`).join("")}
				<div class="jqm-foot">${__("number / ↑↓ + Enter / click — Esc closes")}</div>
			</div>
		</div>
	`).appendTo("body");
	paint();

	$menu.on("click", ".jqm-item", function () { go(cint(this.getAttribute("data-i"))); });
	$menu.on("click", (e) => { if (e.target === $menu.get(0)) closeMenu(); });

	$(document).on("keydown.jqm", (e) => {
		if (e.key === "Escape") { closeMenu(); }
		else if (e.key === "ArrowDown") { selected = (selected + 1) % QUICK_ITEMS.length; paint(); }
		else if (e.key === "ArrowUp") { selected = (selected + QUICK_ITEMS.length - 1) % QUICK_ITEMS.length; paint(); }
		else if (e.key === "Enter") { go(selected); }
		else if (/^[1-9]$/.test(e.key) && cint(e.key) <= QUICK_ITEMS.length) { go(cint(e.key) - 1); }
		else return;
		e.preventDefault();
		e.stopPropagation();
	});
}

$(document).on("keydown", (e) => {
	// literal Ctrl (never Cmd) + Q, and not while typing in a field with the menu closed
	if (!e.ctrlKey || e.metaKey || e.altKey || (e.key || "").toLowerCase() !== "q") return;
	e.preventDefault();
	$menu ? closeMenu() : openMenu();
});
