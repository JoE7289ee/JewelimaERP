# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class JWPushSubscription(Document):
	"""One phone, one subscription. A person with the app on two devices has two
	rows; a phone that is re-installed gets a new endpoint and therefore a new
	row, and the dead one is pruned the first time Apple rejects it."""

	pass
