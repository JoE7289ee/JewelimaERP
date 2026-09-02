# Copyright (c) 2026, efeone and contributors
#
# A finished piece's location is its BUCKET (2026-09-02).
#
# make_products set stock_status, held_by and bucket but never touched location,
# so every piece ever made still reads the bench it was made at — E0017.2.1 on
# PROD was is_finished=1 and still said BAG EXTRACTION. Pieces away at a lab read
# CERTIFICATION.
#
# Only finished pieces are touched. A card still in production keeps its bench.

import frappe

CERT = "CERTIFICATION"


def execute():
    frappe.reload_doctype("Order Bag")
    from jewelima.setup import sync_location_options
    sync_location_options()          # the Select must accept the values first

    at_lab = frappe.db.sql("""
        UPDATE `tabOrder Bag` SET location = %s
        WHERE is_finished = 1 AND stock_status = 'At Certification'
          AND IFNULL(location, '') != %s""", (CERT, CERT))

    # every other finished piece goes to the bucket it is filed in
    moved = frappe.db.sql("""
        UPDATE `tabOrder Bag` SET location = bucket
        WHERE is_finished = 1
          AND stock_status != 'At Certification'
          AND IFNULL(bucket, '') != ''
          AND IFNULL(location, '') != IFNULL(bucket, '')""")

    stranded = frappe.db.sql("""
        SELECT COUNT(*) FROM `tabOrder Bag`
        WHERE is_finished = 1 AND IFNULL(bucket, '') = ''
          AND stock_status != 'At Certification'""")[0][0]
    frappe.db.commit()
    print("finished_location_is_bucket: to bucket %s | to CERTIFICATION %s | "
          "finished with no bucket (left alone) %s" % (moved, at_lab, stranded))
