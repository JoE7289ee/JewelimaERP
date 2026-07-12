# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
#
# One row per reservation move: who held the piece, who holds it now, when, by
# whom, why. Written ONLY by api.transfer_holder (the Transfer Holder page) —
# the full paper trail behind Order Bag.held_by.

from frappe.model.document import Document


class HolderTransfer(Document):
	pass
