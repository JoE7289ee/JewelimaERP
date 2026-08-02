# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class OldFormatImport(Document):
	"""A saved OLD FORMAT working session — the parsed + enriched rows live in
	`data` as JSON so the team can import today and price/export another day."""

	pass
