import { TopBar } from "@/components/TopBar";
import { Collapse, Note, Section } from "@/components/ui/bits";
import { call } from "@/lib/api";
import { bucketColour } from "@/lib/buckets";
import { g3 } from "@/lib/format";
import { useLoad } from "@/lib/useLoad";

type Item = { item: string; carat: number };
type Group = { label: string; carat: number; items: number; top: Item[] };
type Bucket = { code: string; label: string; name: string; carat: number; items: number; share: number; groups: Group[] };
type Place = { place: string; carat: number; share: number; by: { code: string; label: string; pct: number }[] };
type Stones = {
	buckets: Bucket[]; places: Place[]; loss: { carat: number };
	issue?: { warehouse: string; short_any: boolean; rows: { code: string; label: string; have: number; need: number; short: number }[] };
};

/** inside VVS-EF every item begins "VVS-EF" — the heading already said it */
const sizeOf = (name: string, label: string) =>
	label && name.toUpperCase().startsWith(label.toUpperCase()) && name.length > label.length ? name.slice(label.length).trim() : name;

function Items({ g }: { g: Group }) {
	return (
		<>
			{g.top.map((i) => (
				<div key={i.item} className="flex items-baseline gap-2.5 border-b border-ivory/[0.07] py-2 last:border-b-0">
					<span className="flex-1 text-[13px] font-semibold">{sizeOf(i.item, g.label)}</span>
					<span className="tabular text-[14px] font-extrabold">{g3(i.carat)}</span>
				</div>
			))}
			{g.items > g.top.length && <div className="py-2 text-[12px] text-dim">and {g.items - g.top.length} more size(s)</div>}
		</>
	);
}

/**
 * STONE STOCK — every carat, by bucket. DMD opens by quality, then by sieve
 * size; each place's bar is split by what sits there; the Stone Issue counter
 * says what the queue has committed and what the shelf cannot cover.
 */
export function StoneStock({ onBack }: { onBack: () => void }) {
	const { data: d, error, busy, reload } = useLoad(() => call<Stones>("jewelima.jewelima.api.get_jw_stones"));
	return (
		<>
			<TopBar title="Stone Stock" onBack={onBack} onRefresh={reload} busy={busy} />
			{!d ? <Note tone={error ? "bad" : "soft"}>{error ? "The stones could not be counted just now." : "Counting the stones…"}</Note> : (
				<>
					<Section className="mt-0">The buckets</Section>
					<div className="flex flex-col gap-2">
						{d.buckets.map((k) => {
							const flat = k.groups.length === 1 && k.groups[0].label.toUpperCase() === k.name.toUpperCase();
							return (
								<Collapse key={k.code} head={
									<div>
										<div className="flex items-baseline gap-2">
											<span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: bucketColour(k.code) }} />
											<span className="flex-1 text-[14px] font-extrabold tracking-wide">{k.label}</span>
											<span className="tabular text-[15px] font-extrabold">{g3(k.carat)} <span className="text-[11px] text-dim">ct</span></span>
										</div>
										<div className="mt-0.5 text-[11px] text-dim">
											{k.name} · {k.share}% · {k.items} item{k.items > 1 ? "s" : ""}{!flat && ` in ${k.groups.length} quality group${k.groups.length > 1 ? "s" : ""}`}
										</div>
									</div>
								}>
									{flat ? <Items g={k.groups[0]} /> : k.groups.map((g) => (
										<Collapse key={g.label} className="my-1.5 border-ivory/10" head={
											<div className="flex items-baseline gap-2">
												<span className="flex-1 text-[13.5px] font-extrabold">{g.label}</span>
												<span className="text-[10.5px] text-dim">{g.items} sizes</span>
												<span className="tabular text-[14px] font-extrabold">{g3(g.carat)}</span>
											</div>
										}><Items g={g} /></Collapse>
									))}
								</Collapse>
							);
						})}
					</div>

					<Section>Where they stand</Section>
					{d.places.map((p) => (
						<div key={p.place} className="mb-3">
							<div className="flex items-baseline gap-2">
								<span className="flex-1 text-[13.5px] font-bold">{p.place}</span>
								<span className="text-[11px] text-dim">{p.share}%</span>
								<span className="tabular text-[15px] font-extrabold">{g3(p.carat)} <span className="text-[11px] text-dim">ct</span></span>
							</div>
							<div className="mt-1.5 flex h-[5px] gap-0.5 overflow-hidden rounded bg-ivory/10">
								{p.by.map((b) => <span key={b.code} className="h-full rounded-sm" style={{ width: `${Math.max(1, b.pct)}%`, background: bucketColour(b.code) }} />)}
							</div>
							<div className="mt-1 flex flex-wrap gap-1">
								{p.by.map((b) => (
									<span key={b.code} className="rounded-full px-2 py-px text-[10px] font-extrabold text-[#12271D]" style={{ background: bucketColour(b.code) }}>
										{b.label} {b.pct}%
									</span>
								))}
							</div>
						</div>
					))}

					{d.issue?.rows?.length ? (
						<>
							<Section>At {d.issue.warehouse}</Section>
							<div className="rounded-[13px] border border-ivory/12 px-3">
								<div className="flex gap-2 border-b border-ivory/15 py-2 text-[9.5px] font-extrabold uppercase tracking-[.06em] text-dim">
									<span className="flex-1" /><span className="w-[80px] text-right">On shelf</span>
									<span className="w-[72px] text-right">Committed</span><span className="w-[64px] text-right">Short</span>
								</div>
								{d.issue.rows.map((r) => (
									<div key={r.code} className="flex items-baseline gap-2 border-b border-ivory/[0.08] py-2.5 last:border-b-0">
										<span className="flex flex-1 items-center gap-1.5 text-[13px] font-extrabold">
											<i className="inline-block h-2 w-2 rounded-[3px]" style={{ background: bucketColour(r.code) }} />{r.label}
										</span>
										<span className="tabular w-[80px] text-right text-[13px] font-extrabold">{g3(r.have)}</span>
										<span className="tabular w-[72px] text-right text-[13px] text-dim">{r.need ? g3(r.need) : "—"}</span>
										<span className={`tabular w-[64px] text-right text-[13px] font-extrabold ${r.short ? "text-down" : "text-ivory/35"}`}>{r.short ? g3(r.short) : "—"}</span>
									</div>
								))}
							</div>
							<p className="mt-2 text-[11px] text-dim/75">{d.issue.short_any ? "Short is what the shelf cannot cover for the cards already waiting." : "Every bucket covers what the queue is waiting for."}</p>
						</>
					) : null}
					{d.loss.carat > 0 && <p className="mt-2 text-[11px] text-dim/75">Loss buckets hold a further {g3(d.loss.carat)} ct, kept out of the figures above.</p>}
				</>
			)}
		</>
	);
}
