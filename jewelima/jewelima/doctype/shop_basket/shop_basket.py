# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class ShopBasket(Document):
	"""One basket per user — what the Shop set aside, before it becomes an order.
	Server-side so it follows the person from the desk PC to a tablet."""
	pass
