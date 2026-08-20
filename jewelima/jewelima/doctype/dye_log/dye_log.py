# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class DyeLog(Document):
	"""One row per change to the dye register — who moved / added / scrapped
	what, when. Written by the APIs; never edited by hand."""
	pass
