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
			if not r.sieve or flt(r.selected_cts) <= 0:
				continue
			if r.sieve in seen:
				frappe.throw(frappe._("{0} is entered twice.").format(r.sieve))
			seen.add(r.sieve)
			rows.append(r)
		self.set("items", rows)

		self.selected_cts = round(sum(flt(r.selected_cts) for r in self.items or []), 3)
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
