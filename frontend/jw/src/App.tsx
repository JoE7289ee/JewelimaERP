import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Home, type Screen } from "@/screens/Home";
import { CardInfo } from "@/screens/CardInfo";
import { Rates } from "@/screens/Rates";
import { GoldStock } from "@/screens/GoldStock";
import { PriceChart } from "@/screens/PriceChart";
import { StoneStock } from "@/screens/StoneStock";
import { Floor } from "@/screens/Floor";
import { FinishedGoods } from "@/screens/FinishedGoods";
import { Today } from "@/screens/Today";
import { Purchases } from "@/screens/Purchases";

const SCREENS: Screen[] = ["card", "rates", "gold", "chart", "stone", "floor", "fg", "day", "buy"];
type Open = { s: Screen; code?: string; camera?: boolean } | null;

/**
 * The shell: the tile grid, and one screen slid over it at a time. Opening a
 * screen pushes a history entry, so the phone's own back gesture closes it
 * instead of leaving the app. A notification says which screen it is about —
 * /jw?open=buy — and the app opens there.
 */
export default function App() {
	const [open, setOpen] = useState<Open>(() => {
		const q = new URLSearchParams(location.search).get("open") as Screen | null;
		return q && SCREENS.includes(q) ? { s: q } : null;
	});

	// Closed by the PHONE's back gesture, a screen has already been animated away
	// by the phone itself, under the finger. Playing our own slide-out after that
	// showed it twice — it came back and left again. So a close that arrives as
	// popstate is instant; only our own ← button slides.
	const [instant, setInstant] = useState(false);
	const viaButton = useRef(false);

	useEffect(() => {
		const onPop = () => {
			setInstant(!viaButton.current);
			viaButton.current = false;
			setOpen(null);
		};
		window.addEventListener("popstate", onPop);
		return () => window.removeEventListener("popstate", onPop);
	}, []);

	const go = (s: Screen, arg?: { code?: string; camera?: boolean }) => {
		history.pushState({ s }, "", location.pathname);
		setOpen({ s, ...arg });
	};
	const back = () => {
		// our own button: keep the slide. It goes through history too, so the
		// entry the screen pushed is consumed and the phone's back still leaves
		viaButton.current = true;
		setInstant(false);
		if (history.state?.s) history.back(); else setOpen(null);
	};

	return (
		<div className="jw-ground relative min-h-full overflow-hidden">
			<div className="flex min-h-dvh flex-col px-4 pt-[max(16px,env(safe-area-inset-top))] pb-[calc(18px+env(safe-area-inset-bottom))]">
				<Home onOpen={go} />
			</div>
			{/* `custom` reaches the screen that is LEAVING, so it knows how it was closed */}
			<AnimatePresence custom={instant}>
				{open && (
					<motion.div key={open.s}
						className="jw-panel no-scrollbar fixed inset-0 z-50 overflow-y-auto px-4 pt-[max(20px,calc(env(safe-area-inset-top)+8px))] pb-[calc(24px+env(safe-area-inset-bottom))]"
						custom={instant}
						variants={{
							enter: { x: "100%" },
							shown: { x: 0 },
							gone: (fast: boolean) => (fast ? { opacity: 0, transition: { duration: 0 } } : { x: "100%" }),
						}}
						initial="enter" animate="shown" exit="gone"
						transition={{ type: "spring", stiffness: 380, damping: 38 }}>
						{open.s === "card" && <CardInfo onBack={back} initial={open.code} startCamera={open.camera} />}
						{open.s === "rates" && <Rates onBack={back} />}
						{open.s === "gold" && <GoldStock onBack={back} />}
						{open.s === "chart" && <PriceChart onBack={back} />}
						{open.s === "stone" && <StoneStock onBack={back} />}
						{open.s === "floor" && <Floor onBack={back} />}
						{open.s === "fg" && <FinishedGoods onBack={back} />}
						{open.s === "day" && <Today onBack={back} />}
						{open.s === "buy" && <Purchases onBack={back} />}
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
