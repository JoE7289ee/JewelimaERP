# Copyright (c) 2026, efeone and contributors
#
# Web Push for the phone app.
#
# iOS never lets a web app run in the background, so a notification cannot come
# from the app — it comes from HERE, through Apple's push service, and the
# service worker at /jw-sw.js is woken for a moment to show it. That is the whole
# shape of it: our server pushes, the phone displays.
#
# The keys are a VAPID pair, minted once and kept in site_config. They identify
# US to Apple; they are not a secret shared with the phone, which only ever sees
# the public half.
#
# Nothing here assumes iOS. The same code reaches Android and desktop Chrome.

import json

import frappe
from frappe.utils import now_datetime

PUBLIC_KEY_FIELD = "jw_vapid_public_key"
PRIVATE_KEY_FIELD = "jw_vapid_private_key"
SUBJECT_FIELD = "jw_vapid_subject"
DEFAULT_SUBJECT = "mailto:admin@jdserveraccess.in"


def _conf(key):
	return frappe.conf.get(key) or ""


def keys_present():
	return bool(_conf(PUBLIC_KEY_FIELD) and _conf(PRIVATE_KEY_FIELD))


def ensure_keys():
	"""Mint the VAPID pair once and write it into site_config.

	Rotating these silently would orphan every subscription on every phone — so
	they are minted only when absent, and never replaced by accident."""
	if keys_present():
		return _conf(PUBLIC_KEY_FIELD)
	import base64

	from cryptography.hazmat.primitives import serialization
	from py_vapid import Vapid01

	def b64(raw):
		return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

	v = Vapid01()
	v.generate_keys()
	# the phone wants the public key as raw uncompressed P-256 bytes, and
	# pywebpush wants the private key as the raw 32-byte scalar — both base64url
	pub = b64(v.public_key.public_bytes(
		serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint))
	priv = b64(v.private_key.private_numbers().private_value.to_bytes(32, "big"))
	from frappe.installer import update_site_config

	update_site_config(PUBLIC_KEY_FIELD, pub, validate=False)
	update_site_config(PRIVATE_KEY_FIELD, priv, validate=False)
	if not _conf(SUBJECT_FIELD):
		update_site_config(SUBJECT_FIELD, DEFAULT_SUBJECT, validate=False)
	frappe.logger().info("jw push: VAPID keys minted")
	return pub


# ---------------------------------------------------------------------------
# what the phone calls
# ---------------------------------------------------------------------------
@frappe.whitelist()
def get_public_key():
	"""The half of the pair the phone needs to subscribe."""
	frappe.only_for(["JW Phone", "System Manager"])
	return {"key": _conf(PUBLIC_KEY_FIELD) or ""}


@frappe.whitelist()
def subscribe(subscription, device=None):
	"""Remember this phone. Called once, after the person says yes to iOS."""
	frappe.only_for(["JW Phone", "System Manager"])
	sub = frappe.parse_json(subscription) if isinstance(subscription, str) else subscription
	endpoint = (sub or {}).get("endpoint")
	keys = (sub or {}).get("keys") or {}
	if not (endpoint and keys.get("p256dh") and keys.get("auth")):
		frappe.throw(frappe._("That subscription is incomplete."))

	# the endpoint IS the identity of a device: the same phone re-subscribing
	# hands back the same one, so this updates rather than piling up rows
	name = frappe.db.get_value("JW Push Subscription", {"endpoint": endpoint}, "name")
	doc = frappe.get_doc("JW Push Subscription", name) if name else frappe.new_doc("JW Push Subscription")
	doc.update({
		"user": frappe.session.user,
		"device": (device or "")[:140],
		"endpoint": endpoint,
		"p256dh": keys["p256dh"],
		"auth": keys["auth"],
		"enabled": 1,
		"fail_count": 0,
		"last_error": "",
	})
	doc.flags.ignore_permissions = True
	doc.save(ignore_permissions=True)
	return {"ok": True, "name": doc.name}


@frappe.whitelist()
def unsubscribe(endpoint):
	"""The person turned notifications off on this phone."""
	frappe.only_for(["JW Phone", "System Manager"])
	name = frappe.db.get_value("JW Push Subscription", {"endpoint": endpoint}, "name")
	if name:
		frappe.delete_doc("JW Push Subscription", name, ignore_permissions=True, force=1)
	return {"ok": True}


@frappe.whitelist()
def status():
	"""Whether this user has any phone registered, for the app's own switch."""
	frappe.only_for(["JW Phone", "System Manager"])
	return {
		"ready": keys_present(),
		"devices": frappe.db.count("JW Push Subscription",
			{"user": frappe.session.user, "enabled": 1}),
	}


# ---------------------------------------------------------------------------
# sending
# ---------------------------------------------------------------------------
def _recipients(roles=None, users=None):
	f = {"enabled": 1}
	if users:
		f["user"] = ["in", list(users)]
	rows = frappe.get_all("JW Push Subscription", filters=f,
		fields=["name", "user", "endpoint", "p256dh", "auth"], limit_page_length=0)
	if not roles:
		return rows
	allowed = {r.parent for r in frappe.get_all("Has Role",
		filters={"parenttype": "User", "role": ["in", list(roles)]}, fields=["parent"])}
	return [r for r in rows if r.user in allowed]


def send(title, body, url="/jw", tag=None, roles=None, users=None):
	"""Push one notice to every phone that should see it.

	Failures are per-phone and never raise: a notification is not worth breaking
	the thing that triggered it. A subscription Apple has declared gone (404 or
	410) is deleted on the spot — that is the only way these rows get cleaned up.
	"""
	if not keys_present():
		frappe.logger().warning("jw push: no VAPID keys — nothing sent")
		return {"sent": 0, "failed": 0, "reason": "no keys"}
	try:
		from pywebpush import WebPushException, webpush
	except ImportError:
		frappe.logger().warning("jw push: pywebpush is not installed — nothing sent")
		return {"sent": 0, "failed": 0, "reason": "no library"}

	payload = json.dumps({"title": title, "body": body, "url": url, "tag": tag or "jewelima"})
	claims = {"sub": _conf(SUBJECT_FIELD) or DEFAULT_SUBJECT}
	sent = failed = 0
	for r in _recipients(roles=roles, users=users):
		try:
			webpush(
				subscription_info={"endpoint": r.endpoint,
					"keys": {"p256dh": r.p256dh, "auth": r.auth}},
				data=payload,
				vapid_private_key=_conf(PRIVATE_KEY_FIELD),
				vapid_claims=dict(claims),
				ttl=86400,
			)
			sent += 1
			frappe.db.set_value("JW Push Subscription", r.name,
				{"last_sent": now_datetime(), "fail_count": 0, "last_error": ""},
				update_modified=False)
		except WebPushException as e:
			failed += 1
			code = getattr(getattr(e, "response", None), "status_code", 0)
			if code in (404, 410):
				# Apple says this phone is gone: uninstalled, or notifications
				# revoked. Keeping the row would mean failing forever.
				frappe.delete_doc("JW Push Subscription", r.name, ignore_permissions=True, force=1)
				continue
			frappe.db.set_value("JW Push Subscription", r.name, {
				"last_error": str(e)[:500],
				"fail_count": (frappe.db.get_value("JW Push Subscription", r.name, "fail_count") or 0) + 1,
			}, update_modified=False)
		except Exception as e:
			failed += 1
			frappe.logger().warning("jw push: {0}".format(e))
	frappe.db.commit()
	return {"sent": sent, "failed": failed}


def send_async(**kwargs):
	"""Push from a background worker: a notification must never hold up a save."""
	frappe.enqueue("jewelima.jewelima.push.send", queue="short", **kwargs)


# ---------------------------------------------------------------------------
# the one notice we send today
# ---------------------------------------------------------------------------
NOTIFY_ROLES = ("JW Manager", "System Manager", "Jewelima Purchase", "JW Stock Admin")


def on_purchase_recorded(doc, method=None):
	"""A purchase was written: say what came in, to the people who own stock.

	Read off the record itself rather than the page that made it, so a purchase
	posted any other way still announces itself."""
	try:
		gold = stones = 0.0
		for it in doc.get("items") or []:
			if frappe.db.get_value("Item", it.item, "stone_type"):
				stones += frappe.utils.flt(it.weight)
			else:
				purity = frappe.utils.flt(it.purity) or frappe.utils.flt(
					frappe.db.get_value("Item", it.item, "purity_percentage"))
				gold += frappe.utils.flt(it.weight) * purity / 100.0
		bits = []
		if gold:
			bits.append("{0} pure g".format(round(gold, 3)))
		if stones:
			bits.append("{0} ct".format(round(stones, 3)))
		what = " · ".join(bits) or "{0} line(s)".format(len(doc.get("items") or []))
		send_async(
			title="Stock in — {0}".format(doc.supplier or "purchase"),
			body="{0} · {1}".format(what, doc.name),
			# the notice is about a purchase, so it opens the Purchases screen
			url="/jw?open=buy",
			tag="purchase",
			roles=NOTIFY_ROLES,
		)
	except Exception:
		# a notification is never worth failing a purchase over
		frappe.log_error(frappe.get_traceback(), "jw push: purchase notice")
