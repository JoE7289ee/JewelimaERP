# One-off design-bank reprocessing (run via bench execute):
#  1) approved_without_sieve_to_review — Approved cards with no sieve'd stone go back to Pending
#  2) reprocess_review_notes — for every Pending card, lift valid "<lo>-<hi>=<pcs>" tokens out of
#     the note into stone rows (sieve + pcs). Only ranges that ARE in the sieve chart are taken;
#     anything doubtful (e.g. 5-5, 5-2, unknown) stays in the note (skipped for manual review).

import re

import frappe

_SIEVE_RE = re.compile(r"(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*=\s*(\d+)")


def _valid_sieves():
	return set(x for x in frappe.get_all("Diamond Sieve", pluck="sieve_size") if x)


@frappe.whitelist()
def approved_without_sieve_to_review():
	"""Op #1 — every APPROVED design with no stone carrying a sieve -> Pending (review)."""
	names = frappe.db.sql(
		"""SELECT d.name FROM `tabDesign Bank` d
		WHERE d.status='Approved'
		  AND NOT EXISTS (SELECT 1 FROM `tabDesign Bank Stone` s
		                  WHERE s.parent=d.name AND IFNULL(s.sieve,'')<>'')""",
		pluck=True,
	)
	for nm in names:
		frappe.db.set_value("Design Bank", nm, "status", "Pending", update_modified=False)
	frappe.db.commit()
	print("Op1 — approved (no sieve) moved to review: {0}".format(len(names)))
	return {"moved": len(names)}


def _parse_note(note, sieves):
	"""Return (taken:[(sieve,pcs)], cleaned_note). Only chart-valid ranges are taken."""
	taken = []

	def repl(m):
		sieve = "{0}-{1}".format(m.group(1), m.group(2))
		if sieve in sieves:
			taken.append((sieve, int(m.group(3))))
			return ""
		return m.group(0)  # doubtful -> keep in note

	cleaned = _SIEVE_RE.sub(repl, note or "")
	cleaned = re.sub(r"\s{2,}", " ", cleaned).strip(" ,;\t")
	return taken, cleaned


@frappe.whitelist()
def reprocess_review_notes(limit=None):
	"""Op #2 — parse notes of Pending designs into stone rows (sieve+pcs)."""
	sieves = _valid_sieves()
	rows = frappe.db.sql(
		"SELECT name, note FROM `tabDesign Bank` WHERE status='Pending' AND IFNULL(note,'')<>''",
		as_dict=True,
	)
	if limit:
		rows = rows[: int(limit)]
	changed = stones_added = 0
	errors = []
	for i, r in enumerate(rows):
		taken, cleaned = _parse_note(r.note or "", sieves)
		if not taken:
			continue
		try:
			doc = frappe.get_doc("Design Bank", r.name)
			have = {(s.sieve or "") for s in doc.stones}
			added = 0
			for sieve, pcs in taken:
				if sieve in have:
					continue  # don't duplicate an existing sieve row
				doc.append("stones", {"stone": "", "sieve": sieve, "pcs": pcs, "ct": 0})
				have.add(sieve)
				added += 1
			doc.note = cleaned
			doc.save(ignore_permissions=True)
			changed += 1
			stones_added += added
		except Exception as e:
			errors.append({"name": r.name, "error": str(e)[:120]})
		if (i + 1) % 500 == 0:
			frappe.db.commit()
			print("  ... {0}/{1} scanned, {2} changed, {3} errors".format(i + 1, len(rows), changed, len(errors)))
	frappe.db.commit()
	print("Op2 — notes reprocessed on {0} designs; {1} stone rows added; {2} skipped-on-error".format(
		changed, stones_added, len(errors)))
	if errors:
		print("  first errors:", errors[:5])
	return {"designs_changed": changed, "stones_added": stones_added, "errors": errors[:50], "error_count": len(errors)}
