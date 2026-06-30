# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt

from frappe.model.document import Document
from frappe.utils import today


class JobOrder(Document):
	def validate(self):
		if not self.order_date:
			self.order_date = today()
