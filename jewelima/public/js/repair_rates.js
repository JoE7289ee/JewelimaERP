// The one place the repair desk's gold arithmetic lives on the screen side.
//
// It is a copy of rate_for_karat() in repair_bill.py, which is where the stored
// figure comes from. Two screens show money before anything is saved — Billing
// and Quick Check — and if either did its own sum it would eventually disagree
// with the bill the customer is handed. So they both call this.
window.jewelima = window.jewelima || {};

// The board rate is quoted WITH GST in it, so the tax comes OUT before any
// karat is taken: board / 1.03, not board less 3%. Taking 3% off undershoots —
// 10,000 less 3% is 9,700, and 9,700 plus 3% is only 9,991.
jewelima.REPAIR_GOLD_GST = 3;

// Fineness as the trade quotes it, written out rather than computed because the
// rounded figures are what a bill is checked against by hand.
jewelima.REPAIR_KARAT_PURITY = { 22: 91.6, 18: 75, 14: 58.3, 9: 37.5 };

// A piece with no karat is priced at the board rate untouched — deliberately
// wrong-looking, so an unpriced karat stands out rather than quietly billing at
// some assumed purity.
jewelima.repairRateForKarat = function (board, karat) {
	const b = parseFloat(board) || 0;
	const k = String(karat || "").trim();
	if (!k) return b;
	const net = b / (1 + jewelima.REPAIR_GOLD_GST / 100);
	const purity = jewelima.REPAIR_KARAT_PURITY[k];
	return net * (purity !== undefined ? purity : (parseFloat(k) || 0) * 100 / 24) / 100;
};
