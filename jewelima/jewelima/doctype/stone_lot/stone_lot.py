# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
#
# A LOT is a parcel of stones a provider sends on approval. It is NOT a
# purchase: nothing is ours until somebody sieves it and says what we are
# keeping. The rest goes back, which is why the lot carries three weights —
# what the provider CLAIMED, what it ACTUALLY weighed here, and what we
# SELECTED. Whatever is left over is the rejection, and it is never ours.

import re

import frappe
from frappe.model.document import Document
from frappe.model.naming import getseries
from frappe.utils import flt


class StoneLot(Document):
	def autoname(self):
		# One running number across every provider, with the provider's name in
		# it: LOT-SALONI-00041 is the forty-first lot the house has taken in, and
		# you can see whose it is without opening it.
		self.supplier_code = _code(self.supplier)
		self.name = "LOT-{0}-{1}".format(self.supplier_code, getseries("LOT-", 5))

	def validate(self):
		self.supplier_code = self.supplier_code or _code(self.supplier)
		# Drop empty rows rather than storing a sieve with nothing against it,
		# and never let the same sieve be entered twice.
		seen, rows = set(), []
		for r in self.items or []:
			# a row is worth keeping once it carries EITHER weight: a sieve that
			# weighed 4 ct and none of it kept is a real line — it is the whole
			# rejection — and dropping it would hide what went back
			if not r.sieve or (flt(r.actual_cts) <= 0 and flt(r.selected_cts) <= 0):
				continue
			if r.sieve in seen:
				frappe.throw(frappe._("{0} is entered twice.").format(r.sieve))
			seen.add(r.sieve)
			# the rejection is per sieve now, and still derived: what that sieve
			# weighed less what we kept of it. Never typed, on any row.
			if flt(r.selected_cts) > flt(r.actual_cts) + 0.0005:
				frappe.throw(frappe._("{0}: kept {1} ct of a sieve that weighed {2} ct.")
					.format(r.sieve, flt(r.selected_cts), flt(r.actual_cts)))
			r.rejected_cts = round(max(flt(r.actual_cts) - flt(r.selected_cts), 0), 3)
			rows.append(r)
		self.set("items", rows)

		self.selected_cts = round(sum(flt(r.selected_cts) for r in self.items or []), 3)
		# The lot's ACTUAL is the parcel on our scale, weighed whole before any
		# sieving — it is what the provider's claim is measured against, so it is
		# still typed at the top and not inferred from the sieves. Only when it
		# has not been taken does the sieve total stand in for it.
		sieved = round(sum(flt(r.actual_cts) for r in self.items or []), 3)
		if not flt(self.actual_cts) and sieved:
			self.actual_cts = sieved
		# the parcel is a CEILING. The desk stops this at the keystroke, but a page
		# left open since before a lot was re-booked would post past it, and a lot
		# holding more stone than came in is not something to discover later.
		if flt(self.claimed_cts) > 0 and sieved > flt(self.claimed_cts) + 0.0005:
			frappe.throw(frappe._("The sieves add up to {0} ct — more than the {1} ct that came in.")
				.format(sieved, flt(self.claimed_cts)))
		self.rejected_cts = round(max(flt(self.actual_cts) - self.selected_cts, 0), 3)
		# Selecting more than came in is a typo, and it is worth stopping at the
		# save rather than leaving a lot whose rejection reads zero for the
		# wrong reason.
		if flt(self.actual_cts) > 0 and self.selected_cts > flt(self.actual_cts) + 0.0005:
			frappe.throw(frappe._("Selected {0} ct is more than the {1} ct that came in.")
				.format(self.selected_cts, flt(self.actual_cts)))


def _code(supplier):
	"""The provider's name reduced to one word of letters — SALONI, KRIYA."""
	first = (supplier or "").strip().split(" ")[0]
	code = re.sub(r"[^A-Za-z0-9]", "", first).upper()
	return code[:12] or "LOT"
