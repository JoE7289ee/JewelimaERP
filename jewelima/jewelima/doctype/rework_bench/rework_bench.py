# Copyright (c) 2026, efeone and contributors
# For license information, please see license.txt
#
# Rework Bench — a holding queue, not a worked bench.
#
# Named "Rework Bench" rather than "Rework" on purpose: a DocType called Rework
# takes over /app/rework, which is the Delivery page that SENDS pieces here, and
# that page then cannot be opened at all.
#
# Cards land here when something has to be done again. Nobody is issued the
# work and no type of work is recorded: it is a place a card waits until it is
# sent back into the line. That is why REWORK is in BENCH_DOCTYPE but in
# neither ISSUE_RECEIPT_LOCATIONS nor ASSIGN_COLLECT_LOCATIONS — the same shape
# as CAM.

from frappe.model.document import Document


class ReworkBench(Document):
	pass
