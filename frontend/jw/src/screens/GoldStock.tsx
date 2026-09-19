import { TopBar } from "@/components/TopBar";
import { Bar, Hero, Note, Rows, Section } from "@/components/ui/bits";
import { call } from "@/lib/api";
import { g3, money, rupee } from "@/lib/format";
import { useLoad } from "@/lib/useLoad";

type W = { weight: number; pure: number };
type Gold = {
	totals: { pure: number; weight: number; value: number | null };
	rate: { per_pure_g: number | null; line: string; as_of: string };
	rows: (W & { bucket: string; share: number })[];
	warehouse: { kinds: (W & { kind: string })[]; places: (W & { place: string })[] };
	loss: W & { value: number | null; places: (W & { place: string })[] };
};

/**
 * GOLD STOCK — every gram the house holds, and what it is worth today.
 * Warehouse stock is the truth, so the parts add up to the whole. Value is
 * PURE grams at the Thrissur line taken to fine gold, so nothing hangs on karat.
 */
export function GoldStock({ onBack }: { onBack: () => void }) {
	const { data: d, error, busy, reload } = useLoad(() => call<Gold>("jewelima.jewelima.api.get_jw_gold"));
	return (
		<>
			<TopBar title="Gold Stock" onBack={onBack} onRefresh={reload} busy={busy} />
			{!d ? <Note tone={error ? "bad" : "soft"}>{error ? "The gold could not be counted just now." : "Counting the gold…"}</Note> : (
				<>
					<Hero>
						<div className="text-[11px] font-extrabold uppercase tracking-[.07em] text-dim">Total gold</div>
						<div className="tabular mt-1 text-[30px] font-extrabold leading-none">{g3(d.totals.pure)} <span className="text-[13px] font-bold text-ivory/75">pure g</span></div>
						<div className="mt-1 text-[12px] text-dim">{g3(d.totals.weight)} g gross, across every warehouse</div>
						<div className="tabular mt-3 text-[22px] font-extrabold text-champagne">{money(d.totals.value)}</div>
						<div className="text-[11px] text-dim/90">
							{d.rate.per_pure_g ? `at ₹${rupee(d.rate.per_pure_g)} / pure g · ${d.rate.line}${d.rate.as_of ? " · " + d.rate.as_of : ""}`
								: "no rate on the board just now — value not shown"}
						</div>
					</Hero>

					<Section>Where it stands</Section>
					{d.rows.map((r) => (
						<div key={r.bucket} className="mb-3">
							<div className="flex items-baseline gap-2">
								<span className="flex-1 text-[13.5px] font-bold">{r.bucket}</span>
								<span className="text-[11px] text-dim">{r.share}%</span>
								<span className="tabular text-[15px] font-extrabold">{g3(r.pure)} <span className="text-[11px] text-dim">pure g</span></span>
							</div>
							<Bar pct={r.share} />
							<div className="mt-0.5 text-[11px] text-dim/80">{g3(r.weight)} g gross</div>
						</div>
					))}

					<Section>In warehouse, by what it is</Section>
					<Rows rows={d.warehouse.kinds.map((k) => ({ key: k.kind, l: k.kind, s: `${g3(k.weight)} g`, v: g3(k.pure) }))} />
					<Section>In warehouse, by where</Section>
					<Rows rows={d.warehouse.places.map((k) => ({ key: k.place, l: k.place, s: `${g3(k.weight)} g`, v: g3(k.pure) }))} />

					{d.loss.pure > 0 && (
						<>
							<Section>In loss buckets</Section>
							<Hero tone="red">
								<div className="text-[11px] font-extrabold uppercase tracking-[.07em] text-dim">Total loss</div>
								<div className="tabular mt-1 text-[26px] font-extrabold leading-none">{g3(d.loss.pure)} <span className="text-[13px] font-bold text-ivory/75">pure g</span></div>
								<div className="mt-1 text-[12px] text-dim">{g3(d.loss.weight)} g gross</div>
								<div className="tabular mt-2 text-[18px] font-extrabold text-[#F0AFAF]">{money(d.loss.value)}</div>
							</Hero>
							<div className="mt-2.5">
								<Rows rows={d.loss.places.map((k) => ({ key: k.place, l: k.place, s: `${g3(k.weight)} g`, v: g3(k.pure) }))} />
							</div>
							<p className="mt-2 text-[11px] text-dim/75">That gold is real, and it is not stock anybody can reach for — so it stays out of the total above.</p>
						</>
					)}
				</>
			)}
		</>
	);
}
