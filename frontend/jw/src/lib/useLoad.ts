import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Read something off the server, and read it again on demand. `busy` covers
 * the re-read as well as the first load, so the refresh button can spin; the
 * last good answer stays on screen while a re-read is in flight.
 */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
	const [data, setData] = useState<T | null>(null);
	const [error, setError] = useState(false);
	const [busy, setBusy] = useState(false);
	const live = useRef(true);

	const reload = useCallback(async () => {
		setBusy(true);
		try {
			const d = await fn();
			if (live.current) { setData(d); setError(false); }
		} catch {
			if (live.current) setError(true);
		} finally {
			if (live.current) setBusy(false);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, deps);

	useEffect(() => {
		live.current = true;
		reload();
		return () => { live.current = false; };
	}, [reload]);

	return { data, error, busy, reload };
}
