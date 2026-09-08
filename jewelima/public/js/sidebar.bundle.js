// Jewelima desk sidebar behaviour.
//
// One rule, now: a menu that opens is brought into view. Open as many as you
// like — the desk asked for the closing and then found it in the way, twice:
// closing a menu ABOVE the one you just clicked takes a screenful out of the
// list, everything below jumps up (measured at 261px), and the menu you opened
// leaves from under your finger. Menus stay where you put them.
//
// What is left is small on purpose: the sidebar is Frappe's, and every line
// here is a bet on class names we do not own. Anything that stops applying
// after an upgrade should fail QUIETLY.
frappe.provide("jewelima.sidebar");

(function () {
	const PAD = 10;   // breathing room when a menu is brought into view

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

	// the menu holding the page you are on
	function current(sb) {
		const a = sb.wrapper && sb.wrapper.find(".active-sidebar").get(0);
		if (!a) return null;
		return sections(sb).find((s) => s.wrapper.get(0).contains(a)) || null;
	}

	// the sidebar's own scroll box — .body-sidebar-top today, but found rather
	// than named, because it is Frappe's markup and not ours
	function scrollParent(el) {
		let p = el.parentElement;
		while (p && p !== document.body) {
			const o = getComputedStyle(p).overflowY;
			if (o === "auto" || o === "scroll") return p;
			p = p.parentElement;
		}
		return null;
	}

	// Bring the HEADER into view, and only if it is out of it. Never the whole
	// menu: scrolling a tall open menu until its last item shows drags the title
	// off the top, which is the half you actually read.
	function revealHeader(s) {
		const el = headerOf(s);
		const box = el && scrollParent(el);
		if (!box) return;
		const e = el.getBoundingClientRect(), b = box.getBoundingClientRect();
		if (!e.height) return;   // built but not painted — a hidden rect is all zeros
		if (e.top < b.top + PAD) box.scrollTop -= b.top + PAD - e.top;
		else if (e.bottom > b.bottom - PAD) box.scrollTop += e.bottom - b.bottom + PAD;
	}

	jewelima.sidebar = { sidebar, sections, isOpen, current, revealHeader, headerOf };

	// Frappe's own click handler opens or closes the menu; we only bring it into
	// view afterwards, and ONLY for a click on a menu's own header. Every row in
	// the sidebar is a .standard-sidebar-item, so a handler that fires on all of
	// them also fires on the page you are navigating to — the click that should
	// be doing nothing else at all.
	$(document).on("click", ".standard-sidebar-item", function () {
		const sb = sidebar();
		if (!sb) return;
		const el = this;
		requestAnimationFrame(() => {
			const s = sections(sb).find((x) => headerOf(x) === el);
			if (!s || !isOpen(s)) return;   // a link, or a menu being closed
			revealHeader(s);
		});
	});

	// Walking into a page: Frappe opens that page's menu here, so bring it into
	// view straight after. Nothing is closed.
	function patch() {
		if (!frappe.ui || !frappe.ui.Sidebar || frappe.ui.Sidebar.prototype.__jw_menus) return false;
		const proto = frappe.ui.Sidebar.prototype;
		const orig = proto.set_active_workspace_item;
		proto.set_active_workspace_item = function () {
			const r = orig.apply(this, arguments);
			try {
				const sb = sidebar();
				const cur = sb && current(sb);
				if (cur && isOpen(cur)) revealHeader(cur);
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
