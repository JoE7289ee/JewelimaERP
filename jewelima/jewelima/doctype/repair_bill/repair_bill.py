# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
#
# Repair Bill — the batch weighed out and priced.
#
# The pieces are the ones taken in, so the bill carries their weight IN from the
# repair order and the weight OUT taken at the counter now. The difference is
# metal added: a piece that has been soldered comes back heavier, and that gold
# belongs on the bill.
#
# Work is priced per TYPE, not per piece: five solderings on a batch is one line
# at a rate, because that is how the rate is agreed. The same goes for stones,
# which are priced per carat by quality and sieve.
#
# The party is still owed a line per piece, so those agreed rates are shared back
# out over the pieces they came from: a piece's work share, its metal at the
# board rate stamped here, and the stones set into it. Splitting it this way
# means the pieces always add up to the bill, which pricing each piece
# separately would not guarantee.

import frappe
from frappe.model.document import Document
from frappe.utils import cint, flt


# The board rate is quoted WITH GST, so the tax comes off before any karat is
# worked out. Written as its own figure because it is the kind of number that
# changes by government notice, not by anything we do.
GOLD_GST_PERCENT = 3.0

# Purity by karat, as the trade quotes it. These are the fineness percentages
# (22/24 = 91.6, 18/24 = 75, 14/24 = 58.3, 9/24 = 37.5) but they are written out
# rather than computed, because the rounded figures are what a bill is checked
# against by hand.
KARAT_PURITY = {"22": 91.6, "18": 75.0, "14": 58.3, "9": 37.5}


def rate_for_karat(board_rate, karat):
	"""The per-gram rate for a piece's own gold, from the board rate.

	Two steps, in this order:
	  1. take the GST OUT of the board rate — it is quoted with 3% already in it,
	     so the rate before tax is board / 1.03, not board less 3%. Taking 3% off
	     undershoots: 10,000 less 3% is 9,700, but 9,700 plus 3% is only 9,991,
	     so it was never the rate the board was quoting;
	  2. take that karat's purity of what is left.

	A piece with no karat recorded is billed at the board rate untouched, which
	is deliberately wrong-looking: an unpriced karat should stand out on the bill
	rather than quietly bill at some assumed purity.
	"""
	k = str(karat or "").strip()
	if not k:
		return flt(board_rate)
	net = flt(board_rate) / (1.0 + GOLD_GST_PERCENT / 100.0)
	purity = KARAT_PURITY.get(k)
	if purity is None:
		return net * flt(k) / 24.0      # a karat we have no figure for, by fineness
	return net * purity / 100.0


class RepairBill(Document):
	def validate(self):
		if not self.billed_at:
			self.billed_at = frappe.utils.now_datetime()
		if not self.billed_by:
			self.billed_by = frappe.session.user

		w_in = w_out = added = 0.0
		for r in self.items:
			if flt(r.weight_out) < 0:
				frappe.throw(frappe._("{0}: weight out cannot be negative.").format(r.repair or r.idx))
			# only a piece that has actually been weighed out has a difference
			r.metal_added = round(flt(r.weight_out) - flt(r.weight_in), 3) if flt(r.weight_out) else 0.0
			w_in += flt(r.weight_in)
			w_out += flt(r.weight_out)
			added += flt(r.metal_added)
		self.total_weight_in = round(w_in, 3)
		self.total_weight_out = round(w_out, 3)
		self.total_metal_added = round(added, 3)

		total = 0.0
		for c in self.charges:
			c.amount = round(cint(c.pieces) * flt(c.rate), 2)
			total += flt(c.amount)
		self.total_charges = round(total, 2)

		stones = 0.0
		for st in self.stones:
			st.amount = round(flt(st.ct) * flt(st.rate), 2)
			stones += flt(st.amount)

		self._share_out(stones)

	def _share_out(self, stone_total):
		"""Give every piece its own line: work, metal, stones.

		Work is agreed per type for the whole batch, so a piece carries the rate
		of each type of work on it. Metal is its own gold at the board rate.
		Stones are what was actually set into that piece."""
		rate_of = {c.work_type: flt(c.rate) for c in self.charges}
		st_by_piece, st_pcs, st_ct = {}, {}, {}
		for st in self.stones:
			st_by_piece[st.repair] = st_by_piece.get(st.repair, 0.0) + flt(st.amount)
			st_pcs[st.repair] = st_pcs.get(st.repair, 0) + cint(st.pcs)
			st_ct[st.repair] = st_ct.get(st.repair, 0.0) + flt(st.ct)

		work_t = metal_t = manual_t = 0.0
		for r in self.items:
			works = [w.strip() for w in (r.work_types or "").split(",") if w.strip()]
			r.work_amount = round(sum(rate_of.get(w, 0.0) for w in works), 2)
			# metal added is gold the workshop put in; metal returned is a credit,
			# and the sign carries through so the piece never overstates the bill
			r.gold_rate_used = round(rate_for_karat(flt(self.gold_rate), r.karat), 2)
			r.metal_amount = round(flt(r.metal_added) * flt(r.gold_rate_used), 2)
			r.stone_pcs = cint(st_pcs.get(r.repair, 0))
			r.stone_ct = round(flt(st_ct.get(r.repair, 0.0)), 3)
			r.stone_amount = round(flt(st_by_piece.get(r.repair, 0.0)), 2)
			# a hand adjustment on the piece: positive adds, negative takes off.
			# It is its own column so the bill still shows what the work, metal and
			# stones came to before anyone leaned on the number.
			r.amount = round(flt(r.work_amount) + flt(r.metal_amount)
				+ flt(r.stone_amount) + flt(r.manual_amount), 2)
			work_t += flt(r.work_amount)
			metal_t += flt(r.metal_amount)
			manual_t += flt(r.manual_amount)

		self.total_work_amount = round(self.total_charges, 2)
		self.total_metal_amount = round(metal_t, 2)
		self.total_stone_amount = round(stone_total, 2)
		self.total_manual_amount = round(manual_t, 2)
		# what the job came to, before tax
		sub = (flt(self.total_work_amount) + flt(self.total_metal_amount)
			+ flt(self.total_stone_amount) + flt(self.total_manual_amount))
		self.gst_amount = round(sub * flt(self.gst_percent) / 100.0, 2)
		self.grand_total = round(sub + flt(self.gst_amount), 2)
