# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
#
# A hallmarking centre. Its own master rather than a Certification Center row,
# so the hallmarking module does not reach back into certification for the one
# thing it needs most.

from frappe.model.document import Document


class HallmarkingCenter(Document):
	pass
