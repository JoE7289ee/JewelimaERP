# Certification types 2026-07-14: the stone labs are IGL / DHSC / SGL / IDT / GIG
# (a piece goes to ONE of them); IGI was a placeholder — existing batches move to IGL.
import frappe


def execute():
	if frappe.db.exists("DocType", "Certification"):
		frappe.db.sql("UPDATE `tabCertification` SET certification_type='IGL' WHERE certification_type='IGI'")
		frappe.db.commit()
