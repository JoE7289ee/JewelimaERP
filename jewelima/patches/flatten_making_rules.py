# Price Chart redesign 2026-07-14: making moves from per-design-type rules to
# ONE flat per-gram rate with a minimum-grams floor ("1 gram is the cost").
# Carry each chart's best per-gram rule into the new fields; the old
# price_chart_making_rule rows stay in the DB but are no longer referenced.

import frappe
from frappe.utils import flt


def execute():
	if not frappe.db.exists("DocType", "Price Chart"):
		return
	if not frappe.db.has_column("Price Chart", "making_rate"):
		return
	for nm in frappe.get_all("Price Chart", pluck="name"):
		if flt(frappe.db.get_value("Price Chart", nm, "making_rate")):
			continue
		rules = frappe.db.sql("""
			SELECT design_type, charge_category, basis, rate, min_per_piece
			FROM `tabPrice Chart Making Rule`
			WHERE parent = %s AND basis = 'Per Gram' ORDER BY idx""", nm, as_dict=True)
		# prefer the chart's default (blank/blank) rule, else the first per-gram one
		rule = next((r for r in rules if not r.design_type and not r.charge_category), None) \
			or (rules[0] if rules else None)
		if not rule or not flt(rule.rate):
			continue
		# old "minimum per piece" in rupees -> minimum grams under the new model
		min_g = flt(rule.min_per_piece) / flt(rule.rate) if flt(rule.min_per_piece) else 1
		frappe.db.set_value("Price Chart", nm, {
			"making_rate": flt(rule.rate), "making_min_grams": round(min_g, 3) or 1,
		}, update_modified=False)
	frappe.db.commit()
