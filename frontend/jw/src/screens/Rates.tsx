import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { TopBar } from "@/components/TopBar";
import { LiveDot } from "@/components/LiveDot";
import { call } from "@/lib/api";
import { rupee, whole } from "@/lib/format";

type Line = {
	key: string; name: string; of: string; prefix: string; label: string;
	rate: number | null; as_of: string; error: string;
	by_karat: Record<string, number>;
};

const KARATS = ["24K", "22K", "18K", "14K"];
const TICK_MS = 5000;   // the dealer feeds are held four seconds server-side

/**
 * RATES — the three watched lines, read down a phone.
 *
 * It ticks every five seconds while the screen is open and stops the moment it
 * is not. Each line carries a green or red move against the previous answer;
 * the karat figures are ARITHMETIC — the line's fineness backed out to fine
 * gold — and the screen says so rather than passing them off as quotes.
 */
export function Rates({ onBack }: { onBack: () => void }) {
	const [lines, setLines] = useState<Line[] | null>(null);
	const [failed, setFailed] = useState(false);
	const [busy, setBusy] = useState(false);
	const [beat, setBeat] = useState(0);
	const last = useRef<Record<string, number>>({});
	const [moves, setMoves] = useState<Record<string, number>>({});

	const load = useCallback(async () => {
		setBusy(true);
		try {
			const d = await call<{ hero: Line[] }>("jewelima.jewelima.api.get_jw_board");
			const next: Record<string, number> = {};
			for (const h of d.hero ?? []) {
				const id = h.key + h.prefix;
				const was = last.current[id];
				next[id] = was == null || h.rate == null || was === h.rate ? 0 : h.rate - was;
				if (h.rate != null) last.current[id] = h.rate;
			}
			setMoves(next);
			setLines(d.hero ?? []);
			setFailed(false);
			setBeat((b) => b + 1);
		} catch {
			setFailed(true);
		} finally {
			setBusy(false);
		}
	}, []);

	useEffect(() => {
		load();
		const t = setInterval(load, TICK_MS);
		return () => clearInterval(t);          // leaving the screen stops the tick
	}, [load]);

	return (
		<>
			<TopBar title="Rates" onBack={onBack} onRefresh={load} busy={busy} />
			{lines == null ? (
				<p className="py-10 text-center text-[13px] text-ivory/70">
					{failed ? "The board could not be read just now." : "Reading the board…"}
				</p>
			) : (
				<>
					<LiveDot beat={beat} />
					<div className="flex flex-col gap-3">
						{lines.map((h, i) => (
							<motion.div
								key={h.key + h.prefix}
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ delay: i * 0.05, duration: 0.3 }}
							>
								<RateCard h={h} move={moves[h.key + h.prefix] ?? 0} />
							</motion.div>
						))}
					</div>
					<p className="mt-2.5 text-[10.5px] text-dim/70">
						The karat figures are worked out from each line's own fineness — not quoted.
					</p>
				</>
			)}
		</>
	);
}

function RateCard({ h, move }: { h: Line; move: number }) {
	if (h.rate == null) {
		return (
			<Card>
				<div className="text-[11px] font-extrabold uppercase tracking-[.07em] text-dim">{h.name}</div>
				<div className="mt-1 text-[12px] text-dim/80">{h.error || "Not on the board just now."}</div>
			</Card>
		);
	}
	return (
		<Card>
			<div className="text-[11px] font-extrabold uppercase tracking-[.07em] text-dim">{h.name}</div>
			<div className="mt-0.5 flex items-baseline gap-2">
				{/* the figure rolls in when it changes, so a move is SEEN, not just printed */}
				<AnimatePresence mode="popLayout" initial={false}>
					<motion.span
						key={h.rate}
						className="tabular text-[28px] font-extrabold leading-tight tracking-tight text-champagne"
						initial={{ y: move > 0 ? 14 : -14, opacity: 0 }}
						animate={{ y: 0, opacity: 1 }}
						exit={{ y: move > 0 ? -14 : 14, opacity: 0 }}
						transition={{ duration: 0.28 }}
					>
						₹{rupee(h.rate)}
					</motion.span>
				</AnimatePresence>
				<span className="text-[12px] font-bold text-ivory/75">/ g</span>
				{move !== 0 && (
					<motion.span
						key={`${h.rate}m`}
						initial={{ opacity: 0, scale: 0.8 }}
						animate={{ opacity: 1, scale: 1 }}
						className={`inline-flex items-center gap-1 text-[12.5px] font-extrabold ${move > 0 ? "text-up" : "text-down"}`}
					>
						{move > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
						{whole(Math.abs(move))}
					</motion.span>
				)}
			</div>
			<div className="text-[11.5px] text-dim/90">
				{h.label} · {h.of}{h.as_of ? ` · ${h.as_of}` : ""}
			</div>
			<div className="mt-3 grid grid-cols-4 gap-2">
				{KARATS.map((k) => (
					<div key={k} className="rounded-[10px] bg-ivory/[0.12] px-0.5 py-1.5 text-center">
						<div className="text-[10px] font-extrabold tracking-[.06em] text-ivory/90">{k}</div>
						<div className="tabular mt-0.5 text-[13.5px] font-extrabold text-white">{whole(h.by_karat?.[k])}</div>
					</div>
				))}
			</div>
		</Card>
	);
}
