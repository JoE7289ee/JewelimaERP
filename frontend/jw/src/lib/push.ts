// Notifications. iOS gives a web app push only once it is ON THE HOME SCREEN
// and only from a real tap. The app never runs in the background: the notice
// comes from our server through Apple, and /jw-sw.js is woken to show it.
import { call } from "./api";

export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window;
export const standalone = () =>
	window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;

const b64ToBytes = (s: string) => {
	const raw = atob((s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
	return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const register = () => navigator.serviceWorker.register("/jw-sw.js", { scope: "/jw" });

/** Is this phone subscribed? If the browser holds a subscription the server
 *  never heard of, tell the server — a bell that lights and never rings is
 *  worse than one that admits it is off. */
export async function pushState(): Promise<boolean> {
	if (!pushSupported()) return false;
	try {
		const sub = await (await register()).pushManager.getSubscription();
		if (sub) call("jewelima.jewelima.push.subscribe", { subscription: JSON.stringify(sub), device: navigator.platform || "phone" }, true).catch(() => {});
		return !!sub;
	} catch { return false; }
}

/** The bell: on if off, off if on. Returns the new state, or a reason it could not. */
export async function togglePush(): Promise<{ on: boolean; say: string }> {
	if (!standalone()) return { on: false, say: "Notifications need the app on your home screen. In Safari: Share, then Add to Home Screen — open it from there and tap the bell again." };
	const reg = await register();
	const existing = await reg.pushManager.getSubscription();
	if (existing) {
		await call("jewelima.jewelima.push.unsubscribe", { endpoint: existing.endpoint }, true);
		await existing.unsubscribe();
		return { on: false, say: "Notifications off on this phone." };
	}
	if ((await Notification.requestPermission()) !== "granted")
		return { on: false, say: "Notifications were not allowed. Turn them on in Settings › Notifications › Jewelima." };
	const k = await call<{ key: string }>("jewelima.jewelima.push.get_public_key");
	if (!k.key) return { on: false, say: "Notifications are not set up on the server yet." };
	const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(k.key) });
	await call("jewelima.jewelima.push.subscribe", { subscription: JSON.stringify(sub), device: navigator.platform || "phone" }, true);
	return { on: true, say: "Notifications on. You will hear about stock coming in." };
}
