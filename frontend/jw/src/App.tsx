import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Home, type Screen } from "@/screens/Home";
import { Rates } from "@/screens/Rates";

/**
 * The shell: the tile grid, and one screen slid over it at a time. Opening a
 * screen pushes a history entry, so the phone's own back gesture closes it
 * instead of leaving the app.
 */
export default function App() {
	const [screen, setScreen] = useState<Screen | null>(
		() => (new URLSearchParams(window.location.search).get("open") as Screen) || null,
	);

	useEffect(() => {
		const onPop = () => setScreen(null);
		window.addEventListener("popstate", onPop);
		return () => window.removeEventListener("popstate", onPop);
	}, []);

	const open = (s: Screen) => {
		window.history.pushState({ s }, "", window.location.pathname);
		setScreen(s);
	};
	const back = () => (window.history.state?.s ? window.history.back() : setScreen(null));

	return (
		<div className="jw-ground relative min-h-full overflow-hidden">
			<div className="flex min-h-dvh flex-col px-4 pt-[max(16px,env(safe-area-inset-top))] pb-[calc(18px+env(safe-area-inset-bottom))]">
				<Home onOpen={open} />
			</div>
			<AnimatePresence>
				{screen && (
					<motion.div
						key={screen}
						className="jw-panel no-scrollbar fixed inset-0 z-50 overflow-y-auto px-4 pt-[max(20px,calc(env(safe-area-inset-top)+8px))] pb-[calc(18px+env(safe-area-inset-bottom))]"
						initial={{ x: "100%" }}
						animate={{ x: 0 }}
						exit={{ x: "100%" }}
						transition={{ type: "spring", stiffness: 380, damping: 38 }}
					>
						{screen === "rates" && <Rates onBack={back} />}
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
