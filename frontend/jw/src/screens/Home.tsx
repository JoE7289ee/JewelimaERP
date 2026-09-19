import { useState } from "react";
import { motion } from "motion/react";
import {
	CalendarDays, Coins, Factory, Gem, Inbox, LineChart, PackageCheck, ReceiptText, ScanSearch, RotateCw,
	type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/api";

export type Screen = "rates";

type Tile = {
	label: string; icon: LucideIcon; tint: string;
	/** built in React */ screen?: Screen;
	/** not yet: the current app's screen of the same name */ legacy?: string;
};

// the tint is the colour that screen already uses, so the grid is a legend for
// the app rather than nine decorations
const TILES: Tile[] = [
	{ label: "Card Info", icon: ScanSearch, tint: "#E6C778", legacy: "card" },
	{ label: "Rates", icon: LineChart, tint: "#F2C57C", screen: "rates" },
	{ label: "Gold Stock", icon: Coins, tint: "#D4AF37", legacy: "gold" },
	{ label: "Price Chart", icon: ReceiptText, tint: "#C9A9E8", legacy: "chart" },
	{ label: "Stone Stock", icon: Gem, tint: "#8FD3F4", legacy: "stone" },
	{ label: "Floor", icon: Factory, tint: "#7BD8A4", legacy: "floor" },
	{ label: "Finished Goods", icon: PackageCheck, tint: "#9FB3D9", legacy: "fg" },
	{ label: "Today", icon: CalendarDays, tint: "#E58FA8", legacy: "day" },
	{ label: "Purchases", icon: Inbox, tint: "#C2C7B0", legacy: "buy" },
];

export function Home({ onOpen }: { onOpen: (s: Screen) => void }) {
	const [stamp, setStamp] = useState(false);
	const who = window.JW?.fullName ?? "";

	const open = (t: Tile) => {
		if (t.screen) return onOpen(t.screen);
		// the eight not yet rebuilt hand over to the current app, on the same screen
		window.location.href = `/jw?open=${t.legacy}`;
	};

	return (
		<div className="flex flex-1 flex-col gap-4">
			<div className="flex items-center gap-3">
				<img src="/assets/jewelima/images/brand/logo-square.svg" alt="" className="h-10 w-10 rounded-[10px]" />
				<div>
					<div className="text-[17px] font-extrabold leading-tight tracking-[.04em]">JEWELIMA</div>
					<div className="text-[12px] text-ivory/85">{who}</div>
				</div>
				<div className="ml-auto flex gap-2">
					<Button variant="icon" size="icon" aria-label="Reload the app"
						onClick={() => window.location.replace(`/jwr?r=${Date.now()}`)}>
						<RotateCw size={14} />
					</Button>
					<Button onClick={signOut}>Sign out</Button>
				</div>
			</div>

			<div className="grid grid-cols-3 gap-2.5">
				{TILES.map((t, i) => (
					<motion.button
						key={t.label}
						onClick={() => open(t)}
						initial={{ opacity: 0, y: 10, scale: 0.96 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						transition={{ delay: i * 0.035, duration: 0.34, ease: [0.2, 0.8, 0.3, 1] }}
						whileTap={{ scale: 0.94 }}
						className="relative flex aspect-square flex-col items-center justify-center gap-2.5 overflow-hidden rounded-[20px] border border-ivory/12 px-1.5 shadow-[inset_0_1px_0_rgba(250,247,239,.06),0_2px_10px_rgba(0,0,0,.18)]"
						style={{
							background:
								"radial-gradient(75% 55% at 50% 12%, rgba(250,247,239,.12), rgba(250,247,239,0) 70%)," +
								"linear-gradient(180deg, rgba(250,247,239,.085), rgba(250,247,239,.035))",
						}}
					>
						{/* a thread of the screen's own colour along the top edge */}
						<span className="absolute inset-x-[26%] top-0 h-0.5 rounded-b" style={{ background: t.tint, opacity: 0.75 }} />
						<span
							className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl"
							style={{ background: `${t.tint}22`, boxShadow: `inset 0 0 0 1px ${t.tint}40`, color: t.tint }}
						>
							<t.icon size={24} strokeWidth={2} />
						</span>
						<span className="text-center text-[10.5px] font-extrabold uppercase leading-tight tracking-[.07em] text-ivory/92">
							{t.label}
						</span>
					</motion.button>
				))}
			</div>

			<button
				className="mt-auto pt-2 text-center font-[family-name:var(--font-script)] text-[19px] italic text-champagne/80"
				onClick={() => { setStamp(true); setTimeout(() => setStamp(false), 2500); }}
			>
				{stamp ? `build ${window.JW?.build ?? ""}` : "Crafting For You"}
			</button>
		</div>
	);
}
