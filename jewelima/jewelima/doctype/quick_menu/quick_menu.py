# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class QuickMenu(Document):
	"""One Ctrl+Space shortcut layout — for a USER (their personal slots) or a
	ROLE (the default for everyone holding it without a personal layout).
	`routes` is a JSON array of 9 slots (route or null); slot index = the key
	the user presses. Managed on the Quick Menu Setup page."""

	pass
