// The Shop basket — one small store shared by the Shop and the Basket page.
// Lives in localStorage so it survives the walk between the two pages, and is
// keyed per user so two logins on one machine never see each other's basket.
window.jwBasket = (function () {
	const KEY = () => "jw_basket::" + (frappe.session.user || "guest");

	function read() {
		try { return JSON.parse(localStorage.getItem(KEY()) || "[]"); } catch (e) { return []; }
	}
	function write(lines) {
		localStorage.setItem(KEY(), JSON.stringify(lines || []));
		$(document).trigger("jw-basket-changed");
	}
	return {
		all: read,
		count: () => read().reduce((a, l) => a + (parseInt(l.qty, 10) || 0), 0),
		lines: () => read().length,
		add(line) {
			const rows = read();
			// same variant twice just adds up — nobody wants two lines of the same thing
			const hit = rows.find((l) => l.variant === line.variant && !l.remark && !l.materials);
			if (hit) hit.qty = (parseInt(hit.qty, 10) || 0) + (parseInt(line.qty, 10) || 1);
			else rows.push(Object.assign({ qty: 1, remark: "", materials: null }, line));
			write(rows);
		},
		update(i, patch) {
			const rows = read();
			if (!rows[i]) return;
			Object.assign(rows[i], patch);
			write(rows);
		},
		remove(i) { const rows = read(); rows.splice(i, 1); write(rows); },
		clear() { write([]); },
	};
})();
