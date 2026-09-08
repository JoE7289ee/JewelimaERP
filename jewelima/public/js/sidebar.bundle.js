// Jewelima desk sidebar behaviour.
//
// The sidebar carries ~40 menus and each opens into a dozen pages, so two or
// three open menus push everything else below the fold. Two rules:
//
//   1. a menu that opens is scrolled into view, title first.
//   2. one MENU at a time, EXCEPT the menu holding the page you are on.
//
//      Closing that one as well was tried, and it made the sidebar feel broken.
//      It is usually the menu ABOVE the one you are reaching for, so closing it
//      takes a screenful out of the list and everything below jumps up —
//      measured at 261px. The menu you clicked DOES open; it just leaves from
//      under your finger, and the second click lands on a different menu. The
//      anchor below gives back what scroll it can, but near the top of the list
//      there is nothing to give back, so the exemption stays.
//
//   3. SUB-MENUS ARE NOT MENUS. Delivery holds Certification, Hallmarking,
//      Sales and three more; Stock holds Loss, Records, Stock Reports and two
//      more. Open as many of a menu's sub-menus together as you like — opening
//      one closes nothing at all.
//
//      Frappe gives them away only by item.indent: every section, menu and
//      sub-menu alike, is a sibling in sidebar.items and sits at the same depth
//      in the DOM. Treating them all as menus is what made opening a sub-menu
//      shut the whole sidebar, its own parent included.
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
	// the ONLY thing separating a menu from a sub-menu
	const isMenu = (s) => !(s.item && s.item.indent);

	// the menu a sub-menu belongs to: the nearest menu above it in the list,
	// which is exactly how the sidebar reads on screen
	function menuOf(sb, s) {
		if (!s) return null;
		const all = sections(sb);
		for (let i = all.indexOf(s); i >= 0; i--) {
			if (isMenu(all[i])) return all[i];
		}
		return null;
	}

	// the section holding the page you are on — may be a sub-menu
	function current(sb) {
		const a = sb.wrapper && sb.wrapper.find(".active-sidebar").get(0);
		if (!a) return null;
		return sections(sb).find((s) => s.wrapper.get(0).contains(a)) || null;
	}
	// ...and the MENU that section lives under — the one never closed for you
	const currentMenu = (sb) => menuOf(sb, current(sb));

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

	// Closes other MENUS only. A menu's sub-menus are left exactly as they are:
	// they go out of sight with their parent and come back as you left them.
	function keepOnly(sb, opened) {
		const cur = currentMenu(sb);
		const closed = [];
		sections(sb).forEach((s) => {
			if (!isMenu(s) || s === opened || s === cur || !isOpen(s)) return;
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

	// Close the others WITHOUT moving the menu you just clicked.
	//
	// This is the whole difference between the rule feeling helpful and feeling
	// broken. Closing a menu that sits ABOVE the one you clicked takes its rows
	// out of the list, and everything below jumps up — measured at 261px on a
	// real sidebar. The menu does open; it just leaves from under your finger,
	// and a second click lands on a different menu entirely. It reads as "it
	// won't open". So: note where the header is, do the closing, and put the
	// scroll back so the header has not moved a pixel.
	function keepOnlyInPlace(sb, s) {
		const el = headerOf(s);
		const box = el && scrollParent(el);
		const before = el ? el.getBoundingClientRect().top : 0;
		const n = keepOnly(sb, s);
		if (n && box && el) {
			const after = el.getBoundingClientRect().top;
			if (after !== before) box.scrollTop += after - before;
		}
		// Scrolling can only give back what there is above it: near the top of
		// the list there may not be enough, and the header still rises. Nothing
		// can hold it there — the rows it was sitting on are gone — so make sure
		// at least that it did not rise out of sight. This runs even when
		// nothing was closed, because the menu you clicked may simply have been
		// sitting at the bottom edge.
		//
		// The HEADER only. reveal() would scroll a tall open menu until its last
		// item showed, which drags the header up and undoes the anchor — the very
		// thing this function exists to prevent.
		revealHeader(s);
	}

	function revealHeader(s) {
		const el = headerOf(s);
		const box = el && scrollParent(el);
		if (!box) return;
		const e = el.getBoundingClientRect(), b = box.getBoundingClientRect();
		if (!e.height) return;
		if (e.top < b.top + PAD) box.scrollTop -= b.top + PAD - e.top;
		else if (e.bottom > b.bottom - PAD) box.scrollTop += e.bottom - b.bottom + PAD;
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

	jewelima.sidebar = { sidebar, sections, isOpen, isMenu, menuOf, current, currentMenu,
		keepOnly, keepOnlyInPlace, reveal, revealHeader, headerOf };

	// Frappe's own click handler opens or closes the menu; we only tidy up after
	// it, and ONLY for a click on a menu's own header. A click on a page inside a
	// menu is a navigation and belongs to the route handler below.
	$(document).on("click", ".standard-sidebar-item", function () {
		const sb = sidebar();
		if (!sb) return;
		const el = this;
		requestAnimationFrame(() => {
			const s = sections(sb).find((x) => headerOf(x) === el);
			if (!s || !isOpen(s)) return;   // a link, or a section being closed
			// A SUB-MENU closes nothing — several of a menu's sub-menus are meant
			// to be open together. It only gets brought into view.
			if (isMenu(s)) keepOnlyInPlace(sb, s);
			else revealHeader(s);
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
					const menu = menuOf(sb, cur);
					// Frappe opens the SECTION holding the page, which for a page
					// inside a sub-menu is the sub-menu — and a sub-menu of a shut
					// menu is not drawn at all. Open the menu over it, or landing
					// on the page shows you nothing about where you are.
					if (menu && !isOpen(menu)) menu.open();
					if (menu) keepOnly(sb, menu);
					if (cur) reveal(cur);
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
