# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt, cint


class RepairBill(Document):
	"""A repair bill for one party. All money math lives HERE (server-side,
	single source of truth) — the desk page only previews the same rules:
	  base = TM / (1 + gst%)      18K = base x factor_75%   22K = base x factor_92%
	  repair = solderings x rate + polish(qty x mc) + other + stn_fix_units x rate
	  line   = repair + add75 x 18K + add92 x 22K + (stone qty x ct) x dia_rate
	  service line -> 0 (work recorded, nothing charged)."""

	def validate(self):
		st = frappe.get_single("Repair Settings")
		base = flt(self.tm_rate) / (1 + flt(st.gst_percent) / 100) if flt(self.tm_rate) else 0
		self.rate_18k = base * flt(st.factor_75) / 100
		self.rate_22k = base * flt(st.factor_92) / 100
		tot = {"pcs": 0, "rep": 0.0, "dmd": 0.0, "w75": 0.0, "w75a": 0.0, "w92": 0.0, "w92a": 0.0, "grand": 0.0}
		for it in self.items:
			it.solder_amt = cint(it.solder_count) * flt(st.soldering_rate)
			it.polish_amt = cint(it.qty) * flt(it.polish_rate) if it.polish else 0
			it.stn_fix_amt = flt(it.stn_fix_units) * flt(st.stone_fix_rate)
			it.repair_charges = it.solder_amt + it.polish_amt + flt(it.other_amt) + it.stn_fix_amt
			it.add_wt_75_amt = flt(it.add_wt_75) * self.rate_18k
			it.add_wt_92_amt = flt(it.add_wt_92) * self.rate_22k
			it.dmd_tot_ct = cint(it.dmd_qty) * flt(it.dmd_wt)
			it.dmd_amt = it.dmd_tot_ct * flt(self.dia_rate)
			it.total_amt = 0 if it.service else (
				it.repair_charges + it.add_wt_75_amt + it.add_wt_92_amt + it.dmd_amt)
			tot["pcs"] += cint(it.qty)
			if not it.service:
				tot["rep"] += it.repair_charges
				tot["dmd"] += it.dmd_amt
				tot["w75"] += flt(it.add_wt_75)
				tot["w75a"] += it.add_wt_75_amt
				tot["w92"] += flt(it.add_wt_92)
				tot["w92a"] += it.add_wt_92_amt
			tot["grand"] += it.total_amt
		self.tot_pieces = tot["pcs"]
		self.tot_repair = tot["rep"]
		self.tot_diamond = tot["dmd"]
		self.tot_wt75, self.tot_wt75_amt = tot["w75"], tot["w75a"]
		self.tot_wt92, self.tot_wt92_amt = tot["w92"], tot["w92a"]
		self.grand_total = tot["grand"]
