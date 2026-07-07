# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

# The six buckets (DMD/PS/CS/CVD/PDMD/POTH) are STRUCTURAL: bucket maps in
# design.py/api.py/place_order.js and the 24 plan/actual Order Bag columns are
# keyed to these exact names. They ship from jewelima.setup.create_default_stone_types
# and may only be extended there — never from the UI.


class StoneType(Document):
	def before_insert(self):
		self._code_only()

	def before_rename(self, old, new, merge=False):
		self._code_only()

	def on_trash(self):
		self._code_only()

	def _code_only(self):
		if frappe.flags.allow_stone_type_edit:
			return
		frappe.throw(
			_("Stone Types are fixed — the buckets ship in code and every stone column is keyed to them. "
			  "Extend jewelima.setup.create_default_stone_types instead.")
		)
