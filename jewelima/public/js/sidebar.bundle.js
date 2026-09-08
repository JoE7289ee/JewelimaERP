// Jewelima desk sidebar behaviour.
//
// The sidebar is long — Ordering, Delivery, Party, Stock, Costing, Records —
// and each menu opens into a dozen pages. Left alone, two or three open menus
// push everything else below the fold and the desk scrolls to find what it
// already had. Two rules fix that:
//
//   1. a menu that opens is scrolled into view, so you see what you opened.
//   2. one menu at a time, EXCEPT the one you are working in. On Place Order,
//      Ordering stays open while you look through Delivery; open Party and
//      Delivery closes, because it was only being looked at. Walk into a Party
//      page and Party becomes the one you are in, so Ordering closes too.
//
// Only top-level menus take part. A sub-group inside a menu is that menu's own
// business and is left alone.
frappe.provide("jewelima.sidebar");

(function () {
	const PAD = 10;   // breathing room when a menu is scrolled into view

	function sidebar() {
		const sb = frappe.app && frappe.app.sidebar;
		if (!sb || !Array.isArray(sb.items)) return null;
		if (sb.editor && sb.editor.edit_mode) return null;   // never fight the editor
		return sb;
	}

	// A section is a top-level item that owns a nested list it can hide.
	function sections(sb) {
		return sb.items.filter((it) => it && typeof it.open === "function"
			&& typeof it.close === "function" && it.wrapper && it.wrapper.length
			&& it.$nested_items && it.$nested_items.length);
	}
	const isOpen = (s) => !s.$nested_items.hasClass("hidden");

	// the menu holding the page you are on — the one that is never closed for you
	function current(sb) {
		const a = sb.wrapper && sb.wrapper.find(".active-sidebar").get(0);
		if (!a) return null;
		return sections(sb).find((s) => s.wrapper.get(0).contains(a)) || null;
	}

	function shut(s) {
		s.close();
		// remembered the same way a menu you close by hand is, so a reload does
		// not bring back a menu the desk has already tidied away
		if (typeof s.save_section_break_state === "function") s.save_section_break_state();
	}

	function keepOnly(sb, opened) {
		const cur = current(sb);
		sections(sb).forEach((s) => {
			if (s === opened || s === cur) return;
			if (isOpen(s)) shut(s);
		});
	}

	function scrollParent(el) {
		let p = el.parentElement;
		while (p && p !== document.body) {
			const o = getComputedStyle(p).overflowY;
			if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight) return p;
			p = p.parentElement;
		}
		return null;
	}

	// show the menu, header first: a menu taller than the sidebar is scrolled to
	// its title rather than to its last item, which is the half you can read
	function reveal(s) {
		const el = s.wrapper.get(0);
		const box = scrollParent(el);
		if (!el || !box) return;
		const e = el.getBoundingClientRect(), b = box.getBoundingClientRect();
		if (e.top < b.top + PAD) {
			box.scrollTop -= (b.top + PAD - e.top);
		} else if (e.bottom > b.bottom - PAD) {
			box.scrollTop += Math.min(e.bottom - b.bottom + PAD, e.top - b.top - PAD);
		}
	}

	// exposed so the rules can be read (and tested) on their own, away from the
	// clicking and the scrolling
	jewelima.sidebar = { sidebar, sections, isOpen, current, keepOnly, reveal };

	// A click lands on Frappe's own handler first, which is what actually opens
	// or closes the menu; we only act on what it left behind.
	$(document).on("click", ".standard-sidebar-item", function () {
		const sb = sidebar();
		if (!sb) return;
		const el = this;
		setTimeout(() => {
			const s = sections(sb).find((x) => x.wrapper.get(0).contains(el));
			if (!s || !isOpen(s)) return;   // a menu being closed asks nothing of us
			keepOnly(sb, s);
			reveal(s);
		}, 0);
	});

	// Walking into a page makes its menu the one you are in, and everything that
	// was only being looked at closes behind you. Frappe opens the parent menu of
	// the active page here, so this runs straight after it.
	function patch() {
		if (!frappe.ui || !frappe.ui.Sidebar || frappe.ui.Sidebar.prototype.__jw_menus) return false;
		const proto = frappe.ui.Sidebar.prototype;
		const orig = proto.set_active_workspace_item;
		proto.set_active_workspace_item = function () {
			const r = orig.apply(this, arguments);
			try {
				const sb = sidebar();
				if (sb) {
					const cur = current(sb);
					keepOnly(sb, cur);
					if (cur) reveal(cur);
				}
			} catch (e) {
				// the sidebar is not worth breaking a page over
				console.warn("jewelima sidebar:", e);
			}
			return r;
		};
		proto.__jw_menus = true;
		return true;
	}
	if (!patch()) {
		// the desk bundle may not have defined the class yet
		const t = setInterval(() => patch() && clearInterval(t), 200);
		setTimeout(() => clearInterval(t), 10000);
	}
})();
