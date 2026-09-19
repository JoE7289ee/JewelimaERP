import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";

declare global { interface Window { ZXing?: any } }

// The scanner library is 300 KB, and most visits never open the camera — so it
// is fetched the first time the camera is asked for, not with the app.
let zxing: Promise<any> | null = null;
function loadZXing() {
	if (window.ZXing) return Promise.resolve(window.ZXing);
	zxing ??= new Promise((ok, fail) => {
		const s = document.createElement("script");
		s.src = "/assets/jewelima/js/zxing.min.js";
		s.onload = () => (window.ZXing ? ok(window.ZXing) : fail(new Error("no scanner")));
		s.onerror = () => { zxing = null; fail(new Error("no scanner")); };
		document.head.appendChild(s);
	});
	return zxing;
}

/**
 * The phone's camera, reading the QR we print on stock and the Code128 on a
 * job card. ZXing opens the stream itself — attaching one by hand first does
 * not work, because its first act is a reset() that drops it. The stream stops
 * the moment this closes: a camera left running is a hot phone.
 */
export function Camera({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
	const video = useRef<HTMLVideoElement>(null);
	const [say, setSay] = useState("Starting the camera…");

	useEffect(() => {
		let reader: any = null, done = false;
		(async () => {
			if (!navigator.mediaDevices?.getUserMedia) {
				setSay(window.isSecureContext === false
					? "The camera only works over https. Open the app at erp.jdserveraccess.in."
					: "This phone will not give the page a camera. Type the number instead.");
				return;
			}
			try {
				const Z = await loadZXing();
				if (done) return;
				reader = new Z.BrowserMultiFormatReader();
				await reader.decodeFromConstraints(
					{ video: { facingMode: { ideal: "environment" } }, audio: false },
					video.current,
					(result: any) => {
						const text = (result?.getText?.() || "").trim();
						if (!text || done) return;
						done = true;
						navigator.vibrate?.(40);
						onCode(text);
					},
				);
				setSay("Hold the code inside the frame");
			} catch (e: any) {
				setSay(e?.name === "NotAllowedError" || e?.name === "SecurityError"
					? "Camera access was refused. Allow it in Settings › Safari, then try again."
					: "The camera would not start. Type the number instead.");
			}
		})();
		return () => { done = true; try { reader?.reset(); } catch { /* already stopped */ } };
	}, [onCode]);

	return (
		<motion.div className="fixed inset-0 z-[70] flex flex-col bg-black" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
			<video ref={video} playsInline muted className="h-full w-full flex-1 object-cover" />
			<div className="pointer-events-none absolute top-[42%] left-1/2 aspect-[1.35] w-[74vw] max-w-[330px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 border-champagne shadow-[0_0_0_100vmax_rgba(0,0,0,.45)]" />
			<div className="absolute inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom))] px-6 text-center text-[13px] text-white/85">{say}</div>
			<div className="absolute inset-x-0 bottom-[calc(26px+env(safe-area-inset-bottom))] flex justify-center">
				<Button variant="gold" size="md" className="px-8" onClick={onClose}>Close</Button>
			</div>
		</motion.div>
	);
}
