// The phone app's service worker.
//
// It exists for ONE job: to be awake when the app is not. iOS never lets a web
// app run in the background, so a notification cannot come from the app — it
// comes from our server, through Apple's push service, and this worker is what
// iOS wakes for a moment to show it.
//
// It must be served from the site ROOT (/jw-sw.js) or its scope could not cover
// /jw. Frappe serves files in www/ at the root, which is why it lives there.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
	let d = {};
	try { d = event.data ? event.data.json() : {}; } catch (e) { d = { body: event.data && event.data.text() }; }
	const title = d.title || "Jewelima";
	event.waitUntil(self.registration.showNotification(title, {
		body: d.body || "",
		icon: "/assets/jewelima/images/brand/favicon-180.png",
		badge: "/assets/jewelima/images/brand/favicon-32.png",
		tag: d.tag || "jewelima",          // a second notice of the same thing replaces the first
		renotify: !!d.renotify,
		data: { url: d.url || "/jw" },
	}));
});

// tapping the notification opens the app on the screen it is about, and reuses
// the window that is already open rather than stacking another
self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const url = (event.notification.data && event.notification.data.url) || "/jw";
	event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
		for (const c of list) {
			if (c.url.indexOf("/jw") > -1 && "focus" in c) { c.navigate(url); return c.focus(); }
		}
		return self.clients.openWindow(url);
	}));
});
