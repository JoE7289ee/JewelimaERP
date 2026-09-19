// One way to the server: the desk's own whitelisted methods, over the session
// cookie the phone already holds. No second API, no second copy of any rule.
//
// Reads go by GET. Writes go by POST with the session's CSRF token, because
// frappe runs a GET in a read-only transaction — a subscribe sent as a GET once
// wrote nothing and returned success.

declare global {
	interface Window {
		frappe?: { csrf_token?: string };
		JW?: { user: string; fullName: string; build: string; mock?: boolean };
	}
}

import { MOCK } from "./mock";

export class NoSession extends Error {}

export async function call<T = unknown>(
	method: string,
	args: Record<string, unknown> = {},
	write = false,
): Promise<T> {
	if (window.JW?.mock && method in MOCK) {
		await new Promise((r) => setTimeout(r, 250));
		return MOCK[method](args) as T;
	}
	const body = new URLSearchParams(
		Object.entries(args).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]),
	).toString();
	const res = await fetch(
		write ? `/api/method/${method}` : `/api/method/${method}?${body}`,
		write
			? {
					method: "POST",
					credentials: "same-origin",
					headers: {
						Accept: "application/json",
						"Content-Type": "application/x-www-form-urlencoded",
						"X-Frappe-CSRF-Token": window.frappe?.csrf_token ?? "",
					},
					body,
				}
			: { credentials: "same-origin", headers: { Accept: "application/json" } },
	);
	if (res.status === 403) {
		window.location.replace("/jw-login");
		throw new NoSession();
	}
	if (!res.ok) throw new Error(String(res.status));
	const json = await res.json();
	return (json?.message ?? {}) as T;
}

export async function signOut() {
	try {
		await call("logout", {}, true);
	} finally {
		window.location.replace("/jw-login");
	}
}
