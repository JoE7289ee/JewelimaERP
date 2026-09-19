import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { bucketColour } from "@/lib/buckets";
import { g3 } from "@/lib/format";

/** A small uppercase heading between blocks of a screen. */
export function Section({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<div className={cn("mb-2 mt-5 text-[11px] font-extrabold uppercase tracking-[.07em] text-dim", className)}>
			{children}
		</div>
	);
}

/** Loading, failure and empty, said the same way on every screen. */
export function Note({ children, tone = "soft" }: { children: ReactNode; tone?: "soft" | "bad" }) {
	return (
		<p className={cn("py-10 text-center text-[13px]", tone === "bad" ? "text-down" : "text-ivory/75")}>{children}</p>
	);
}

/** The small figure tiles across the top of a screen. */
export function Kpis({ items }: { items: { k: string; v: ReactNode; tone?: string }[] }) {
	return (
		<div className={cn("grid gap-2", items.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
			{items.map((it) => (
				<div key={it.k} className="rounded-xl bg-ivory/[0.08] px-1.5 py-2.5 text-center">
					<div className="text-[9.5px] font-extrabold uppercase tracking-[.06em] text-dim">{it.k}</div>
					<div className="tabular mt-0.5 text-[18px] font-extrabold" style={{ color: it.tone ?? "#fff" }}>{it.v}</div>
				</div>
			))}
		</div>
	);
}

/** A bordered list of label / small / figure rows. */
export function Rows({ rows }: { rows: { l: ReactNode; s?: ReactNode; v: ReactNode; key?: string }[] }) {
	return (
		<div className="rounded-[13px] border border-ivory/12 px-3">
			{rows.map((r, i) => (
				<div key={r.key ?? i} className="flex items-baseline gap-2.5 border-b border-ivory/[0.08] py-2.5 last:border-b-0">
					<span className="min-w-0 flex-1 text-[13px] font-semibold">{r.l}</span>
					{r.s != null && <span className="tabular text-[11px] text-dim/85">{r.s}</span>}
					<span className="tabular text-[14.5px] font-extrabold text-white">{r.v}</span>
				</div>
			))}
		</div>
	);
}

/** Stone buckets as coloured chips: DMD 0.110, CZ 0.426. */
export function Chips({ stones, className }: { stones: { code: string; label: string; carat: number }[]; className?: string }) {
	if (!stones?.length) return null;
	return (
		<div className={cn("flex flex-wrap gap-1", className)}>
			{stones.map((s) => (
				<span key={s.code} className="rounded-full px-2 py-px text-[10px] font-extrabold text-[#12271D]"
					style={{ background: bucketColour(s.code) }}>
					{s.label} {g3(s.carat)}
				</span>
			))}
		</div>
	);
}

/** A share bar, gold by default. */
export function Bar({ pct, colour }: { pct: number; colour?: string }) {
	return (
		<div className="mt-1.5 h-[5px] overflow-hidden rounded bg-ivory/10">
			<motion.div className="h-full rounded" initial={{ width: 0 }} animate={{ width: `${Math.max(1.5, pct)}%` }}
				transition={{ duration: 0.5, ease: "easeOut" }}
				style={{ background: colour ?? "linear-gradient(90deg,#E6C778,#D4AF37)" }} />
		</div>
	);
}

/** A tappable header that opens to show what is under it. */
export function Collapse({
	head, children, className, defaultOpen = false,
}: { head: ReactNode; children: ReactNode; className?: string; defaultOpen?: boolean }) {
	const [open, setOpen] = useState(defaultOpen);
	return (
		<div className={cn("overflow-hidden rounded-[13px] border border-ivory/12", className)}>
			<button className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left" onClick={() => setOpen((o) => !o)}>
				<div className="min-w-0 flex-1">{head}</div>
				<motion.span animate={{ rotate: open ? 180 : 0 }} className="text-dim"><ChevronDown size={16} /></motion.span>
			</button>
			<AnimatePresence initial={false}>
				{open && (
					<motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }}
						className="border-t border-ivory/10">
						<div className="px-3.5 pb-1">{children}</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

/** A big summary panel — the total at the head of a screen. */
export function Hero({ tone = "gold", children }: { tone?: "gold" | "blue" | "red"; children: ReactNode }) {
	const tint = { gold: "212,175,55", blue: "140,200,235", red: "240,154,154" }[tone];
	return (
		<div className="rounded-2xl border px-4 py-3.5"
			style={{ borderColor: `rgba(${tint},.33)`, background: `linear-gradient(180deg, rgba(${tint},.13), rgba(250,247,239,.04))` }}>
			{children}
		</div>
	);
}
