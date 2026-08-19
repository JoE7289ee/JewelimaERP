// The Shop basket — one store shared by the Shop and the Basket page.
//
// The basket lives ON THE SERVER (Shop Basket, one row per user), so a basket
// started at the desk is still there on a tablet. localStorage is kept only as a
// cache: the pages read it synchronously to paint straight away, and load() then
// refreshes it from the server. Every change is written back, coalesced so a run
// of quantity taps is one request.
window.jwBasket = (function () {
	const API = "jewelima.jewelima.api";
	const KEY = () => "jw_basket::" + (frappe.session.user || "guest");
	let saving = null, dirty = false;

	function cache() {
		try { return JSON.parse(localStorage.getItem(KEY()) || "[]"); } catch (e) { return []; }
	}
	function setCache(lines) {
		localStorage.setItem(KEY(), JSON.stringify(lines || []));
		$(document).trigger("jw-basket-changed");
	}

	function push() {
		// coalesce: while a save is in flight, remember that another is needed
		if (saving) { dirty = true; return saving; }
		saving = frappe.call({ method: API + ".save_shop_basket", freeze: false,
			args: { lines: JSON.stringify(cache()) } })
			.catch(() => {
				frappe.show_alert({ message: __("Could not save the basket — it is kept on this device for now."),
					indicator: "orange" }, 6);
			})
			.always(() => {
				saving = null;
				if (dirty) { dirty = false; push(); }
			});
		return saving;
	}

	function write(lines) { setCache(lines); push(); }

	return {
		/** pull the server's copy into the cache — call on page show */
		load() {
			return frappe.call({ method: API + ".get_shop_basket", freeze: false })
				.then((r) => { setCache((r.message || {}).lines || []); return cache(); })
				.catch(() => cache());          // offline: carry on with what we have
		},
		all: cache,
		count: () => cache().reduce((a, l) => a + (parseInt(l.qty, 10) || 0), 0),
		lines: () => cache().length,
		add(line) {
			const rows = cache();
			// the same variant twice just adds up — unless the line was tailored
			const hit = rows.find((l) => l.variant === line.variant && !l.remark && !l.materials);
			if (hit) hit.qty = (parseInt(hit.qty, 10) || 0) + (parseInt(line.qty, 10) || 1);
			else rows.push(Object.assign({ qty: 1, remark: "", materials: null }, line));
			write(rows);
		},
		update(i, patch) {
			const rows = cache();
			if (!rows[i]) return;
			Object.assign(rows[i], patch);
			write(rows);
		},
		remove(i) { const rows = cache(); rows.splice(i, 1); write(rows); },
		clear() { write([]); },
	};
})();
