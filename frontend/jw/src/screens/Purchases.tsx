import { TopBar } from "@/components/TopBar";
import { Card } from "@/components/ui/card";
import { Chips, Hero, Note, Section } from "@/components/ui/bits";
import { call } from "@/lib/api";
import { g3 } from "@/lib/format";
import { useLoad } from "@/lib/useLoad";

type Stone = { code: string; label: string; carat: number };
type Line = { item: string; qty: number; unit: string; pcs?: number; stone: number; pure?: number; touch?: number };
type Voucher = { name: string; voucher: string; supplier: string; when: string; warehouse: string; by: string; pure: number; gross: number; stones: Stone[]; lines: Line[] };
type Buy = { rows: Voucher[]; totals: { count: number; pure: number; gross: number; stones: Stone[] } };

/** PURCHASES — the last twenty vouchers that brought material in. Gold as PURE. */
export function Purchases({ onBack }: { onBack: () => void }) {
	const { data: d, error, busy, reload } = useLoad(() => call<Buy>("jewelima.jewelima.api.get_jw_purchases", { limit: 20 }));
	return (
		<>
			<TopBar title="Purchases" onBack={onBack} onRefresh={reload} busy={busy} />
			{!d ? <Note tone={error ? "bad" : "soft"}>{error ? "The purchases could not be read just now." : "Reading the vouchers…"}</Note> : (
				<>
					<Hero>
						<div className="text-[11px] font-extrabold uppercase tracking-[.07em] text-dim">Last {d.totals.count} voucher{d.totals.count === 1 ? "" : "s"}</div>
						<div className="tabular mt-1 text-[30px] font-extrabold leading-none">{g3(d.totals.pure)} <span className="text-[13px] text-ivory/75">pure g</span></div>
						<div className="mt-1 text-[12px] text-dim">{g3(d.totals.gross)} g gross came in</div>
						{d.totals.stones.length ? <Chips stones={d.totals.stones} className="mt-2.5" /> : <div className="mt-1.5 text-[12px] text-dim">no stones on these</div>}
					</Hero>
					<Section>Newest first</Section>
					<div className="flex flex-col gap-2">
						{d.rows.map((r) => (
							<Card key={r.name} className="p-3">
								<div className="flex items-baseline gap-2">
									<span className="flex-1 text-[14.5px] font-extrabold">{r.supplier}</span>
									<span className="text-[11px] font-extrabold text-champagne">{r.name}</span>
								</div>
								<div className="mt-0.5 text-[11px] text-dim">{r.voucher} · {r.when}{r.warehouse ? ` · into ${r.warehouse}` : ""}</div>
								{r.by && <div className="text-[11px] text-dim">by <b className="text-ivory/90">{r.by}</b></div>}
								<div className="mt-2 flex flex-wrap gap-4">
									{r.pure > 0 && <span><b className="tabular text-[16px]">{g3(r.pure)}</b> <span className="text-[10.5px] text-dim">pure g</span></span>}
									{r.gross > 0 && <span><b className="tabular text-[16px]">{g3(r.gross)}</b> <span className="text-[10.5px] text-dim">g gross</span></span>}
								</div>
								<Chips stones={r.stones} className="mt-1.5" />
								<div className="mt-2 border-t border-ivory/[0.08] pt-1.5">
									{r.lines.map((l, i) => (
										<div key={i} className="flex items-baseline gap-2 py-0.5 text-[12px]">
											<span className="flex-1">{l.item}</span>
											{l.stone ? (
												<>
													{l.pcs ? <span className="text-[10px] text-dim">{l.pcs} pcs</span> : null}
													<span className="tabular font-extrabold">{g3(l.qty)} <span className="text-[10px] text-dim">ct</span></span>
												</>
											) : (
												<>
													<span className="text-[10px] text-dim">{l.touch}% purity · {g3(l.qty)} g</span>
													<span className="tabular font-extrabold">{g3(l.pure)} <span className="text-[10px] text-dim">pure</span></span>
												</>
											)}
										</div>
									))}
								</div>
							</Card>
						))}
					</div>
					<p className="mt-2 text-[11px] text-dim/75">Every voucher that brings material in writes one of these — the voucher type is the paperwork it arrived on.</p>
				</>
			)}
		</>
	);
}
