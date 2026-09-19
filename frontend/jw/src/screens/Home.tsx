import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
	Bell, BellRing, CalendarDays, Coins, Factory, Gem, Inbox, LineChart, PackageCheck, ReceiptText, RotateCw,
	ScanLine, ScanSearch, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/api";
import { pushState, pushSupported, togglePush } from "@/lib/push";
import { cn } from "@/lib/utils";

/** the screen keys are the ones a notification's ?open= already uses */
export type Screen = "card" | "rates" | "gold" | "chart" | "stone" | "floor" | "fg" | "day" | "buy";

// the tint is the colour that screen already uses, so the grid is a legend for
// the app rather than nine decorations
const TILES: { key: Screen; label: string; icon: LucideIcon; tint: string }[] = [
	{ key: "card", label: "Card Info", icon: ScanSearch, tint: "#E6C778" },
	{ key: "rates", label: "Rates", icon: LineChart, tint: "#F2C57C" },
	{ key: "gold", label: "Gold Stock", icon: Coins, tint: "#D4AF37" },
	{ key: "chart", label: "Price Chart", icon: ReceiptText, tint: "#C9A9E8" },
	{ key: "stone", label: "Stone Stock", icon: Gem, tint: "#8FD3F4" },
	{ key: "floor", label: "Floor", icon: Factory, tint: "#7BD8A4" },
	{ key: "fg", label: "Finished Goods", icon: PackageCheck, tint: "#9FB3D9" },
	{ key: "day", label: "Today", icon: CalendarDays, tint: "#E58FA8" },
	{ key: "buy", label: "Purchases", icon: Inbox, tint: "#C2C7B0" },
];

export function Home({ onOpen }: { onOpen: (s: Screen, arg?: { code?: string; camera?: boolean }) => void }) {
	const [stamp, setStamp] = useState(false);
	const [bell, setBell] = useState<boolean | null>(null);
	const [typed, setTyped] = useState("");
	const [toast, setToast] = useState(new URLSearchParams(location.search).has("r") ? "Refreshed" : "");

	useEffect(() => { if (pushSupported()) pushState().then(setBell); }, []);
	useEffect(() => { if (toast) { const t = setTimeout(() => setToast(""), 2200); return () => clearTimeout(t); } }, [toast]);

	return (
		<div className="flex flex-1 flex-col gap-4">
			<div className="flex items-center gap-3">
				<img src="/assets/jewelima/images/brand/logo-square.svg" alt="" className="h-10 w-10 rounded-[10px]" />
				<div className="min-w-0">
					<div className="text-[17px] font-extrabold leading-tight tracking-[.04em]">JEWELIMA</div>
					<div className="truncate text-[12px] text-ivory/85">{window.JW?.fullName ?? ""}</div>
				</div>
				<div className="ml-auto flex gap-2">
					{bell !== null && (
						<Button variant="icon" size="icon" aria-label="Notifications"
							className={cn(bell && "border-champagne/60 bg-champagne/12 text-champagne")}
							onClick={async () => {
								try { const r = await togglePush(); setBell(r.on); setToast(r.say); }
								catch { setToast("This phone would not turn notifications on."); }
							}}>
							{bell ? <BellRing size={14} /> : <Bell size={14} />}
						</Button>
					)}
					<Button variant="icon" size="icon" aria-label="Reload the app"
						onClick={async () => {
							// pull the page through the network first: a home-screen window holds on to
							// the page it launched with, and a plain reload can be answered from that
							const url = `/jw?r=${Date.now()}`;
							try { await fetch(url, { cache: "reload", credentials: "same-origin" }); } catch { /* go anyway */ }
							location.replace(url);
						}}>
						<RotateCw size={14} />
					</Button>
					<Button onClick={signOut}>Sign out</Button>
				</div>
			</div>

			<form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) onOpen("card", { code: typed }); setTyped(""); }}>
				{/* Enter is answered on the key itself as well as by the form: a
				    barcode scanner types the code and then presses Enter, and that
				    press must never depend on how the browser handles a form */}
				<input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Scan or type a card…"
					onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (typed.trim()) onOpen("card", { code: typed }); setTyped(""); } }}
					enterKeyHint="go" autoCapitalize="characters" autoComplete="off"
					className="h-12 min-w-0 flex-1 rounded-xl border border-ivory/18 bg-ivory/[0.07] px-4 text-[16px] font-semibold text-ivory outline-none placeholder:text-ivory/40 focus:border-champagne" />
				<button type="button" onClick={() => onOpen("card", { camera: true })} aria-label="Scan with the camera"
					className="flex h-12 w-12 items-center justify-center rounded-xl border border-ivory/22 bg-ivory/[0.07] text-champagne active:scale-95">
					<ScanLine size={20} />
				</button>
			</form>

			<div className="grid grid-cols-3 gap-2.5">
				{TILES.map((t, i) => (
					<motion.button key={t.key} onClick={() => onOpen(t.key)}
						initial={{ opacity: 0, y: 10, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
						transition={{ delay: i * 0.035, duration: 0.34, ease: [0.2, 0.8, 0.3, 1] }}
						whileTap={{ scale: 0.94 }}
						className="relative flex aspect-square flex-col items-center justify-center gap-2.5 overflow-hidden rounded-[20px] border border-ivory/12 px-1.5 shadow-[inset_0_1px_0_rgba(250,247,239,.06),0_2px_10px_rgba(0,0,0,.18)]"
						style={{ background: "radial-gradient(75% 55% at 50% 12%, rgba(250,247,239,.12), rgba(250,247,239,0) 70%),linear-gradient(180deg, rgba(250,247,239,.085), rgba(250,247,239,.035))" }}>
						<span className="absolute inset-x-[26%] top-0 h-0.5 rounded-b" style={{ background: t.tint, opacity: 0.75 }} />
						<span className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl"
							style={{ background: `${t.tint}22`, boxShadow: `inset 0 0 0 1px ${t.tint}40`, color: t.tint }}>
							<t.icon size={24} strokeWidth={2} />
						</span>
						<span className="text-center text-[10.5px] font-extrabold uppercase leading-tight tracking-[.07em] text-ivory/92">{t.label}</span>
					</motion.button>
				))}
			</div>

			<button className="mt-auto pt-2 text-center font-[family-name:var(--font-script)] text-[19px] italic text-champagne/80"
				onClick={() => { setStamp(true); setTimeout(() => setStamp(false), 2500); }}>
				{stamp ? `build ${window.JW?.build ?? ""}` : "Crafting For You"}
			</button>

			{toast && (
				<motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
					className="fixed inset-x-6 bottom-[calc(26px+env(safe-area-inset-bottom))] z-[80] rounded-2xl bg-ivory px-4 py-2.5 text-center text-[13px] font-bold text-emerald-deep shadow-lg">
					{toast}
				</motion.div>
			)}
		</div>
	);
}
