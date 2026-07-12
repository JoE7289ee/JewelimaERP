# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
#
# The sale record — our lightweight replacement for the costing Excel + invoice
# handoff. Created ONLY by api.create_product_sale (the Sell page): it writes
# the stock off Finished Goods, flips the bags to Sold (kept for returns) and
# keeps every piece's price breakdown here for accounts.

from frappe.model.document import Document


class ProductSale(Document):
	pass
