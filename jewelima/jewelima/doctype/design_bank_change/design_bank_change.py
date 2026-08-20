# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class DesignBankChange(Document):
	"""One row per edited field on an approved card — changed from what to what,
	when, by whom, and which variants were rebuilt because of it."""
	pass
