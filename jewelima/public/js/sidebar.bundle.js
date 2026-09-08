// Jewelima desk sidebar behaviour.
//
// The sidebar carries ~40 menus and each opens into a dozen pages, so two or
// three open menus push everything else below the fold. Two rules:
//
//   1. a menu that opens is scrolled into view, title first.
//   2. one menu at a time, EXCEPT the menu holding the page you are on. On
//      Place Order, Ordering stays open while you look through Delivery; open
//      Party and Delivery closes. Walk into a Party page and Party becomes the
//      menu you are in, so Ordering closes behind you.
//
// Two things this must be careful about, both learned the hard way:
//
//   - only a menu's OWN header counts as opening a menu. Every row in the
//     sidebar is a .standard-sidebar-item, so a handler that fires on all of
//     them runs the whole close-the-others sweep every time somebody clicks a
//     page inside a menu — which is exactly the click that should be fast.
//   - the closing is one write, not forty. Frappe's save_section_break_state
//     stringifies the whole map per section AND writes from a copy each item
//     took when it was built, so calling it in a loop is both slow and lossy:
//     the last writer wins and the others' state is thrown away.
frappe.provide("jewelima.sidebar");

(function () {
	const PAD = 10;                       // breathing room when a menu is revealed
	const KEY = "section-breaks-state";   // Frappe's own store, shared with it

	function sidebar() {
		const sb = frappe.app && frappe.app.sidebar;
		if (!sb || !Array.isArray(sb.items)) return null;
		if (sb.editor && sb.editor.edit_mode) return null;   // never fight the editor
		return sb;
	}

	// A menu is a top-level item that owns a nested list it can hide.
	function sections(sb) {
		return sb.items.filter((it) => it && typeof it.close === "function"
			&& it.wrapper && it.wrapper.length
			&& it.$nested_items && it.$nested_items.length);
	}
	const isOpen = (s) => !s.$nested_items.hasClass("hidden");
	const headerOf = (s) => s.wrapper.find(".standard-sidebar-item").get(0);

	// the menu holding the page you are on — the one that is never closed for you
	function current(sb) {
		const a = sb.wrapper && sb.wrapper.find(".active-sidebar").get(0);
		if (!a) return null;
		return sections(sb).find((s) => s.wrapper.get(0).contains(a)) || null;
	}

	// One read, one write, merged into whatever is stored now — so a menu the
	// desk closed for you is remembered exactly like one you closed by hand,
	// and no section's state is trampled by another's stale copy.
	function remember(sb, closed) {
		if (!closed.length) return;
		let all = {};
		try {
			all = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
		} catch (e) {
			all = {};
		}
		const ws = (sb.wrapper.find(".body-sidebar").attr("data-title") || "").toLowerCase()
			|| sb.sidebar_title;
		all[ws] = all[ws] || {};
		closed.forEach((s) => {
			const title = s.wrapper.attr("title");
			if (title) all[ws][title] = true;
		});
		try {
			localStorage.setItem(KEY, JSON.stringify(all));
		} catch (e) {
			return;
		}
		// hand every item the merged map, so its own next write starts from the
		// truth rather than from the snapshot it was born with
		sections(sb).forEach((s) => { s.section_breaks_state = all; });
	}

	function keepOnly(sb, opened) {
		const cur = current(sb);
		const closed = [];
		sections(sb).forEach((s) => {
			if (s === opened || s === cur || !isOpen(s)) return;
			try {
				s.close();
				closed.push(s);
			} catch (e) {
				// a menu that will not close is not worth a broken sidebar
			}
		});
		remember(sb, closed);
		return closed.length;
	}

	// the sidebar's own scroll box — .body-sidebar-top today, but found rather
	// than named, because it is Frappe's markup and not ours. Scrollability is
	// deliberately NOT part of the test: a box that cannot scroll ignores the
	// write, and a box that has just had four menus closed inside it may not
	// look scrollable for another frame.
	function scrollParent(el) {
		let p = el.parentElement;
		while (p && p !== document.body) {
			const o = getComputedStyle(p).overflowY;
			if (o === "auto" || o === "scroll") return p;
			p = p.parentElement;
		}
		return null;
	}

	// show the menu, header first: a menu taller than the sidebar is scrolled to
	// its title rather than its last item, which is the half you can read
	function reveal(s) {
		const el = s && s.wrapper && s.wrapper.get(0);
		const box = el && scrollParent(el);
		if (!box) return;
		const e = el.getBoundingClientRect(), b = box.getBoundingClientRect();
		if (!e.height) return;   // not on screen at all — a hidden rect is all zeros
		let d = 0;
		if (e.top < b.top + PAD) d = e.top - b.top - PAD;
		else if (e.bottom > b.bottom - PAD) d = Math.min(e.bottom - b.bottom + PAD, e.top - b.top - PAD);
		if (Math.abs(d) > 1) box.scrollTop += d;
	}

	jewelima.sidebar = { sidebar, sections, isOpen, current, keepOnly, reveal, headerOf };

	// Frappe's own click handler opens or closes the menu; we only tidy up after
	// it, and ONLY for a click on a menu's own header. A click on a page inside a
	// menu is a navigation and belongs to the route handler below.
	$(document).on("click", ".standard-sidebar-item", function () {
		const sb = sidebar();
		if (!sb) return;
		const el = this;
		requestAnimationFrame(() => {
			const s = sections(sb).find((x) => headerOf(x) === el);
			if (!s || !isOpen(s)) return;   // a link, or a menu being closed
			keepOnly(sb, s);
			reveal(s);
		});
	});

	// Walking into a page makes its menu the one you are in, and whatever was
	// only being looked at closes behind you. Frappe opens the active page's
	// menu here, so this runs straight after it.
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
					if (cur) {
						keepOnly(sb, cur);
						reveal(cur);
					}
				}
			} catch (e) {
				console.warn("jewelima sidebar:", e);   // never worth a broken page
			}
			return r;
		};
		proto.__jw_menus = true;
		return true;
	}
	if (!patch()) {
		const t = setInterval(() => patch() && clearInterval(t), 200);
		setTimeout(() => clearInterval(t), 10000);
	}
})();
