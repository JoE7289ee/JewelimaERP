# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class OrderBagBOMChange(Document):
	"""One row per material change on a card's BOM. Written by _log_bom_diff();
	never edited by hand — the desk form is read-only."""
	pass
