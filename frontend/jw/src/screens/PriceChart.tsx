import { useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { Collapse, Note, Rows, Section } from "@/components/ui/bits";
import { call } from "@/lib/api";
import { whole } from "@/lib/format";
import { useLoad } from "@/lib/useLoad";

type Entry = { name: string; chart_name: string; chart_date: string };
type Band = { from_ct: number; to_ct: number; rate: number; basis?: string };
type Chart = {
	name: string; chart_name: string; chart_date: string; moved: boolean;
	touch_rates: { karat: string; touch: number }[];
	making_rate: number; making_min_grams: number; party_stone_handling?: number;
	making_rules: { karat: string; design_type: string; basis: string; rate: number; min_per_piece: number }[];
	diamond_rates: (Band & { quality: string })[];
	precious_stone_rates: (Band & { stone: string })[];
	cs_rates: Band[]; cz_rates: Band[]; cvd_rates: Band[]; sw_rates: Band[];
	certification_charges: { certification: string; basis: string; rate: number; min_amount: number; from_ct: number; to_ct: number; solitaire: number }[];
};

/** three places: a bracket ending at 0.075 must not read as 0.08 */
const ct = (r: Band) => `${(r.from_ct || 0).toFixed(3)} – ${r.to_ct ? r.to_ct.toFixed(3) : "∞"} ct`;
/** the trade's own karat figures — 82 on 18K is "7% over" */
const NOMINAL: Record<string, number> = { "24K": 99.9, "22K": 91.6, "20K": 83.3, "18K": 75, "14K": 58.5, "9K": 37.5 };
const pct = (v: number) => `${Number(v.toFixed(1))}%`;

function Detail({ name }: { name: string }) {
	const { data: d, error } = useLoad(() => call<Chart>("jewelima.jewelima.api.get_jw_chart", { name }), [name]);
	if (!d) return <Note tone={error ? "bad" : "soft"}>{error ? "That chart could not be read." : "Reading it…"}</Note>;
	const byQ: Record<string, Band[]> = {};
	d.diamond_rates.forEach((r) => (byQ[r.quality || "—"] ??= []).push(r));
	const bands = (rows: Band[]) => rows.map((r, i) => ({ key: String(i), l: ct(r), s: r.basis, v: whole(r.rate) }));
	return (
		<>
			<div className="rounded-[14px] border border-gold/30 bg-gold/10 px-4 py-3">
				<div className="text-[19px] font-extrabold tracking-[.04em]">{d.chart_name}</div>
				<div className="text-[11.5px] text-dim">{d.name} · {d.chart_date}{d.moved && " · the version live today"}</div>
			</div>
			{d.touch_rates.length > 0 && (
				<>
					<Section>Gold touch</Section>
					<Rows rows={d.touch_rates.map((r) => ({
						key: r.karat, l: r.karat, v: pct(r.touch),
						s: NOMINAL[r.karat] ? `${r.touch >= NOMINAL[r.karat] ? "+" : ""}${pct(r.touch - NOMINAL[r.karat])} over` : "touch",
					}))} />
				</>
			)}
			{(d.making_rules.length > 0 || d.making_rate > 0) && (
				<>
					<Section>Making</Section>
					<Rows rows={d.making_rules.length
						? d.making_rules.map((r, i) => ({
							key: String(i), l: [r.karat, r.design_type].filter(Boolean).join(" · ") || "All", v: whole(r.rate),
							s: `${r.basis}${r.min_per_piece ? ` · min ₹${whole(r.min_per_piece)}` : ""}`,
						}))
						: [{ l: "Making", s: `per gram${d.making_min_grams ? ` · min ${d.making_min_grams} g` : ""}`, v: whole(d.making_rate) }]} />
				</>
			)}
			{Object.keys(byQ).length > 0 && (
				<>
					<Section>Diamond</Section>
					<div className="flex flex-col gap-2">
						{Object.entries(byQ).map(([q, rows]) => (
							<Collapse key={q} head={
								<div className="flex items-baseline gap-2">
									<span className="flex-1 text-[14px] font-extrabold tracking-wide">{q}</span>
									<span className="text-[11px] text-dim">{rows.length} bracket{rows.length > 1 ? "s" : ""}</span>
								</div>
							}>
								{rows.map((r, i) => (
									<div key={i} className="flex items-baseline border-b border-ivory/[0.07] py-2 last:border-b-0">
										<span className="flex-1 text-[13px] font-semibold">{ct(r)}</span>
										<span className="tabular text-[14.5px] font-extrabold">{whole(r.rate)}</span>
									</div>
								))}
							</Collapse>
						))}
					</div>
				</>
			)}
			{d.precious_stone_rates.length > 0 && (
				<><Section>Precious stone</Section>
					<Rows rows={d.precious_stone_rates.map((r, i) => ({ key: String(i), l: r.stone, s: r.from_ct || r.to_ct ? ct(r) : "per ct", v: whole(r.rate) }))} /></>
			)}
			{(["cs", "cz", "cvd", "sw"] as const).map((k) => d[`${k}_rates`].length > 0 && (
				<div key={k}><Section>{k.toUpperCase()}</Section><Rows rows={bands(d[`${k}_rates`])} /></div>
			))}
			{!!d.party_stone_handling && (
				<><Section>Party stone handling</Section>
					<Rows rows={[{ l: "Party diamonds & stones", s: "per ct", v: whole(d.party_stone_handling) }]} /></>
			)}
			{d.certification_charges.length > 0 && (
				<><Section>Certification</Section>
					<Rows rows={d.certification_charges.map((r, i) => ({
						key: String(i), l: r.certification, v: whole(r.rate),
						s: [r.basis, r.from_ct || r.to_ct ? ct(r) : "", r.solitaire ? "solitaire" : "", r.min_amount ? `min ₹${whole(r.min_amount)}` : ""].filter(Boolean).join(" · "),
					}))} /></>
			)}
		</>
	);
}

/**
 * PRICE CHART — pick a party, read what we charge them, strictly down to the
 * rates. Only live charts are listed, and one opens as the version live today.
 */
export function PriceChart({ onBack }: { onBack: () => void }) {
	const [open, setOpen] = useState<Entry | null>(null);
	const [q, setQ] = useState("");
	const list = useLoad(() => call<Entry[]>("jewelima.jewelima.api.get_jw_charts"));
	const shown = (list.data ?? []).filter((r) => !q || r.chart_name.toUpperCase().includes(q.toUpperCase()));
	return (
		<>
			<TopBar title={open ? open.chart_name : "Price Chart"} onBack={open ? () => setOpen(null) : onBack}
				onRefresh={list.reload} busy={list.busy} />
			{open ? <Detail name={open.name} /> : (
				<>
					<label className="mb-3 flex items-center gap-2 rounded-xl border border-ivory/18 bg-ivory/[0.07] px-3 focus-within:border-champagne">
						<Search size={15} className="text-dim" />
						<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a party…"
							className="h-11 flex-1 bg-transparent text-[16px] font-semibold text-ivory outline-none placeholder:text-ivory/40" />
					</label>
					{!list.data ? <Note tone={list.error ? "bad" : "soft"}>{list.error ? "The charts could not be read just now." : "Reading the charts…"}</Note>
						: shown.length ? shown.map((r) => (
							<button key={r.name} onClick={() => setOpen(r)}
								className="flex w-full items-baseline gap-2.5 border-b border-ivory/[0.09] px-1 py-3.5 text-left active:bg-ivory/5">
								<span className="flex-1 text-[15px] font-bold tracking-[.02em]">{r.chart_name}</span>
								<span className="text-[11px] text-dim">{r.chart_date}</span>
								<ChevronRight size={15} className="self-center text-ivory/35" />
							</button>
						)) : <Note>No party by that name.</Note>}
				</>
			)}
		</>
	);
}
