# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
#
# One re-filing of a finished piece from one bucket to another.
#
# A bucket is where a thing is KEPT, not a stock location, so a re-file changes
# nothing about the piece's stock, its holder or its weights — which is why this
# went unrecorded for so long. But "who moved this and when" is still a question
# the delivery desk gets asked, and a comment on the piece could not answer it
# across a shelf.

import frappe
from frappe.model.document import Document


class BucketTransfer(Document):
	pass
