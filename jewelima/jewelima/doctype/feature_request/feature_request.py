# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class FeatureRequest(Document):
	"""A feature/improvement/bug request from any desk user. Anyone can raise
	and track; only the admin (System Manager) moves it off Open."""

	pass
