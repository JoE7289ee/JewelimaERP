# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class BucketAccess(Document):
	"""One person, one bucket. The row is NAMED by the user, so a second bucket
	for the same person cannot exist — reassigning somebody replaces their row
	rather than adding one, and "which bucket is this person's" always has a
	single answer. Change is tracked, so who moved whom is on the record."""

	pass
